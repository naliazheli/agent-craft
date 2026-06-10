import { callLlm } from './llm';
import { initSession, callTool, closeSession } from './mcp-client';
import { useReviewAgentStore } from '../store/review-agent';
import { useAuthStore } from '../store/auth';

let abortController: AbortController | null = null;

const DELAY_MS = 5000;

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    });
  });
}

export function startReviewAgent() {
  if (abortController) return;
  abortController = new AbortController();
  const { signal } = abortController;

  const store = useReviewAgentStore.getState;
  store().setStatus('reviewing');
  store().addGlobalLog('Review agent started', 'info');

  runLoop(signal).catch((err) => {
    if (err.name !== 'AbortError') {
      store().addGlobalLog(`Review agent error: ${err.message}`, 'error');
      store().setStatus('error');
    }
  }).finally(() => {
    if (abortController?.signal === signal) {
      abortController = null;
    }
  });
}

export function stopReviewAgent() {
  if (abortController) {
    abortController.abort();
    abortController = null;
  }
  const store = useReviewAgentStore.getState();
  store.setStatus('stopped');
  store.addGlobalLog('Review agent stopped', 'info');
  closeSession();
}

async function runLoop(signal: AbortSignal) {
  const store = () => useReviewAgentStore.getState();

  // 1. Initialize MCP session
  store().addGlobalLog('Initializing MCP session...', 'info');
  await initSession();
  store().addGlobalLog('MCP session established', 'success');

  // 2. Authenticate via JWT
  const token = useAuthStore.getState().token;
  if (!token) {
    store().addGlobalLog('Not logged in. Please login first.', 'error');
    store().setStatus('error');
    return;
  }

  store().addGlobalLog('Authenticating with MCP...', 'info');
  try {
    const user = await callTool('login_with_token', { token });
    store().addGlobalLog(`Authenticated as ${user.displayName || user.email}`, 'success');
  } catch (err: any) {
    store().addGlobalLog(`MCP auth failed: ${err.message}`, 'error');
    store().setStatus('error');
    return;
  }

  // 3. Main review loop
  while (!signal.aborted) {
    try {
      store().setStatus('reviewing');
      store().addGlobalLog('Fetching my tasks with pending submissions...', 'info');

      const myTasksRes = await callTool('list_my_tasks', {
        status: 'OPEN,REVIEWING',
        limit: 50,
      });

      const myTasks = myTasksRes?.data || myTasksRes;
      if (!Array.isArray(myTasks) || myTasks.length === 0) {
        store().addGlobalLog('No open tasks found. Waiting...', 'warn');
        await sleep(DELAY_MS * 3, signal);
        continue;
      }

      store().addGlobalLog(`Found ${myTasks.length} tasks. Checking submissions...`, 'info');

      let reviewedAny = false;

      for (const task of myTasks) {
        if (signal.aborted) break;

        const taskId = task.id;
        const taskTitle = task.title || 'Untitled';

        // Fetch submissions for this task
        let submissions: any[] = [];
        try {
          const subRes = await callTool('list_task_submissions', { taskId });
          submissions = Array.isArray(subRes) ? subRes : (subRes?.data || []);
        } catch {
          submissions = [];
        }

        // Filter to only SUBMITTED status
        const pending = submissions.filter((s: any) => s.status === 'SUBMITTED');
        if (pending.length === 0) continue;

        store().addGlobalLog(`Task "${taskTitle}": ${pending.length} pending submission(s)`, 'info');

        for (const submission of pending) {
          if (signal.aborted) break;

          const submissionId = submission.id;
          const workerName = submission.worker?.displayName || submission.worker?.email || 'Unknown';

          store().startExecution(submissionId, taskId, taskTitle, workerName);

          try {
            // Fetch task detail for acceptance criteria
            store().addExecLog(submissionId, 'Fetching task details...', 'info');
            const taskDetail = await callTool('get_task', { taskId });

            // Fetch submission comments
            let subComments: any[] = [];
            try {
              subComments = await callTool('list_submission_comments', { submissionId });
              if (!Array.isArray(subComments)) subComments = [];
            } catch {
              subComments = [];
            }

            const commentsText = subComments.length > 0
              ? subComments.map((c: any) => `[${c.user?.displayName || 'Unknown'}]: ${c.content}`).join('\n')
              : 'No comments.';

            // Ask LLM to evaluate the submission
            store().addExecLog(submissionId, 'Asking LLM to evaluate submission...', 'info');
            const evalResult = await callLlm([
              {
                role: 'system',
                content: `You are an AI reviewer evaluating a task submission. Analyze the submission against the task requirements and acceptance criteria.

Reply with exactly one of:
- "APPROVE" if the submission meets all requirements and acceptance criteria
- "REJECT: <reason>" if the submission is clearly inadequate or off-topic
- "REVISION: <feedback>" if the submission needs specific improvements

Be fair but thorough. Only approve if the work genuinely meets the criteria.`,
              },
              {
                role: 'user',
                content: [
                  `Task: ${taskDetail.title}`,
                  `Description: ${taskDetail.description}`,
                  taskDetail.acceptanceCriteria ? `Acceptance Criteria: ${taskDetail.acceptanceCriteria}` : '',
                  `Reward: ${taskDetail.reward} ${taskDetail.currency || 'AIC'}`,
                  '',
                  `Submission by: ${workerName}`,
                  `Submission content:`,
                  submission.content,
                  '',
                  `Comments on submission:\n${commentsText}`,
                  '',
                  'Evaluate this submission. Reply APPROVE, REJECT: <reason>, or REVISION: <feedback>',
                ].filter(Boolean).join('\n'),
              },
            ], 2048);
            store().addTokens(evalResult.tokensUsed);

            const evalText = evalResult.content.trim();

            if (evalText.startsWith('APPROVE')) {
              store().addExecLog(submissionId, 'LLM recommends APPROVE. Approving...', 'success');
              await callTool('review_submission', {
                submissionId,
                action: 'APPROVE',
                reviewNote: 'Auto-approved by AI reviewer',
              });
              store().addExecLog(submissionId, 'Submission approved! AIC transferred to worker.', 'success');
              store().addApproval();
              store().finishExecution(submissionId, 'approved');
              reviewedAny = true;
            } else if (evalText.startsWith('REJECT')) {
              const reason = evalText.replace(/^REJECT:?\s*/i, '').trim() || 'Does not meet requirements';
              store().addExecLog(submissionId, `LLM recommends REJECT: ${reason}`, 'warn');
              await callTool('review_submission', {
                submissionId,
                action: 'REJECT',
                reviewNote: reason,
              });
              store().addExecLog(submissionId, 'Submission rejected.', 'warn');
              store().addRejection();
              store().finishExecution(submissionId, 'rejected');
              reviewedAny = true;
            } else if (evalText.startsWith('REVISION')) {
              const feedback = evalText.replace(/^REVISION:?\s*/i, '').trim() || 'Please revise your submission';
              store().addExecLog(submissionId, `LLM requests revision: ${feedback}`, 'warn');
              await callTool('review_submission', {
                submissionId,
                action: 'REQUEST_REVISION',
                reviewNote: feedback,
              });
              store().addExecLog(submissionId, 'Revision requested.', 'info');
              store().finishExecution(submissionId, 'revision');
              reviewedAny = true;
            } else {
              store().addExecLog(submissionId, `Unexpected LLM response: ${evalText.slice(0, 100)}`, 'warn');
              store().finishExecution(submissionId, 'skipped');
            }

            await sleep(1000, signal);
          } catch (err: any) {
            if (err.name === 'AbortError') throw err;
            store().addExecLog(submissionId, `Error: ${err.message}`, 'error');
            store().finishExecution(submissionId, 'error');
            await sleep(2000, signal);
          }
        }
      }

      if (!reviewedAny) {
        store().addGlobalLog('No pending submissions to review. Waiting...', 'info');
      } else {
        store().addGlobalLog('Review round complete.', 'success');
      }

      await sleep(DELAY_MS * 2, signal);
    } catch (err: any) {
      if (err.name === 'AbortError') throw err;
      store().addGlobalLog(`Error: ${err.message}`, 'error');
      store().setStatus('error');
      await sleep(DELAY_MS * 2, signal);
      store().setStatus('reviewing');
    }
  }
}
