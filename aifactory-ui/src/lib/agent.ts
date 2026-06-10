import { callLlm } from './llm';
import { initSession, callTool, closeSession } from './mcp-client';
import { useAgentStore } from '../store/agent';
import { useAuthStore } from '../store/auth';

let abortController: AbortController | null = null;

const DELAY_MS = 5000;
export const AGENT_CODE_TYPE_OPTIONS = ['', 'typescript', 'python', 'go', 'rust'] as const;
export type AgentCodeTypePreference = (typeof AGENT_CODE_TYPE_OPTIONS)[number];

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    });
  });
}

export function startAgent(preferredCodeType: AgentCodeTypePreference = '') {
  if (abortController) return;
  abortController = new AbortController();
  const { signal } = abortController;

  const store = useAgentStore.getState;
  store().setStatus('searching');
  store().addGlobalLog('Agent started', 'info');
  if (preferredCodeType) {
    store().addGlobalLog(`Task filter enabled: ${preferredCodeType}`, 'info');
  } else {
    store().addGlobalLog('Task filter enabled: all code types', 'info');
  }

  runLoop(signal, preferredCodeType).catch((err) => {
    if (err.name !== 'AbortError') {
      store().addGlobalLog(`Agent error: ${err.message}`, 'error');
      store().setStatus('error');
    }
  }).finally(() => {
    // Ensure next "Start Working" can create a fresh controller
    // when this run exits due to init/auth error or normal stop.
    if (abortController?.signal === signal) {
      abortController = null;
    }
  });
}

export function stopAgent() {
  if (abortController) {
    abortController.abort();
    abortController = null;
  }
  const store = useAgentStore.getState();
  store.setStatus('stopped');
  store.addGlobalLog('Agent stopped', 'info');
  closeSession();
}

async function runLoop(signal: AbortSignal, preferredCodeType: AgentCodeTypePreference) {
  const store = () => useAgentStore.getState();

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

  // 3. Main loop
  while (!signal.aborted) {
    try {
      store().setStatus('searching');
      store().addGlobalLog(
        preferredCodeType
          ? `Searching for open ${preferredCodeType} tasks...`
          : 'Searching for open tasks...',
        'info',
      );

      const res = await callTool('list_tasks', {
        status: 'OPEN',
        codeType: preferredCodeType || undefined,
        availableOnly: true,
        excludeOwnCreated: true,
        sortBy: 'reward_desc',
        limit: 10,
      });

      const tasks = res?.data || res;
      if (!Array.isArray(tasks) || tasks.length === 0) {
        store().addGlobalLog(
          preferredCodeType
            ? `No open ${preferredCodeType} tasks found. Waiting...`
            : 'No open tasks found. Waiting...',
          'warn',
        );
        await sleep(DELAY_MS * 3, signal);
        continue;
      }

      store().addGlobalLog(`Found ${tasks.length} open tasks. Evaluating one by one...`, 'info');

      for (const task of tasks) {
        if (signal.aborted) break;

        const taskId = task.id;
        const taskTitle = task.title || 'Untitled';
        const reward = task.reward || 0;
        const currency = task.currency || 'AIC';

        // Start per-task execution tracking
        store().startTaskExecution(taskId, taskTitle, reward, currency);
        store().setStatus('working');

        try {
          // Fetch full task detail via MCP
          store().addTaskLog(taskId, 'Fetching task details...', 'info');
          const taskDetail = await callTool('get_task', { taskId });

          // Fetch comments via MCP
          store().addTaskLog(taskId, 'Fetching task comments...', 'info');
          let comments: any[] = [];
          try {
            comments = await callTool('list_task_comments', { taskId });
            if (!Array.isArray(comments)) comments = [];
          } catch {
            comments = [];
          }

          const commentsText = comments.length > 0
            ? comments.map((c: any) => `[${c.user?.displayName || 'Unknown'}]: ${c.content}`).join('\n')
            : 'No comments yet.';

          // Ask LLM to evaluate this task
          store().addTaskLog(taskId, 'Asking LLM to evaluate task suitability...', 'info');
          const evalResult = await callLlm([
            {
              role: 'system',
              content: 'You are an AI agent evaluating whether to work on a task. Analyze the task requirements and comments. Reply with exactly "WORK" if you can produce a high-quality solution, or "SKIP: <reason>" if the task is not suitable. Be selective — only accept tasks you can genuinely solve well.',
            },
            {
              role: 'user',
              content: [
                `Task: ${taskDetail.title}`,
                `Description: ${taskDetail.description}`,
                taskDetail.acceptanceCriteria ? `Acceptance Criteria: ${taskDetail.acceptanceCriteria}` : '',
                `Reward: ${reward} ${currency}`,
                `Submissions so far: ${taskDetail._count?.submissions || 0}`,
                `\nComments:\n${commentsText}`,
                '\nShould I work on this task? Reply WORK or SKIP: <reason>',
              ].filter(Boolean).join('\n'),
            },
          ]);
          store().addTokens(evalResult.tokensUsed);

          const evalText = evalResult.content.trim();

          if (evalText.startsWith('SKIP')) {
            const reason = evalText.replace(/^SKIP:?\s*/i, '').trim() || 'Not suitable';
            store().addTaskLog(taskId, `Skipped: ${reason}`, 'warn');
            store().finishTaskExecution(taskId, 'skipped');
            await sleep(1000, signal);
            continue;
          }

          // LLM decided to work on this task
          store().addTaskLog(taskId, 'Generating solution...', 'info');

          const solveResult = await callLlm([
            {
              role: 'system',
              content: 'You are an AI worker solving tasks for bounty rewards. Provide a complete, high-quality solution. If the task is unclear, say "UNCLEAR:" followed by your question.',
            },
            {
              role: 'user',
              content: [
                `Task: ${taskDetail.title}`,
                `Description: ${taskDetail.description}`,
                taskDetail.acceptanceCriteria ? `Acceptance Criteria: ${taskDetail.acceptanceCriteria}` : '',
                `\nComments:\n${commentsText}`,
                '',
                'Provide your complete solution:',
              ].filter(Boolean).join('\n'),
            },
          ], 4096);
          store().addTokens(solveResult.tokensUsed);

          const solution = solveResult.content.trim();

          // If unclear, post comment and skip
          if (solution.startsWith('UNCLEAR:')) {
            const question = solution.replace('UNCLEAR:', '').trim();
            store().addTaskLog(taskId, `Task unclear, posting question...`, 'warn');
            try {
              await callTool('create_comment', { taskId, content: question });
              store().addTaskLog(taskId, 'Question posted as comment', 'info');
            } catch (err: any) {
              store().addTaskLog(taskId, `Failed to post comment: ${err.message}`, 'error');
            }
            store().finishTaskExecution(taskId, 'skipped');
            await sleep(1000, signal);
            continue;
          }

          // Submit solution via MCP
          store().setStatus('submitting');
          store().addTaskLog(taskId, 'Submitting solution...', 'info');

          try {
            await callTool('submit_task', { taskId, content: solution });
            store().addTaskLog(taskId, 'Solution submitted successfully!', 'success');
            store().addCompletion(reward);
            store().finishTaskExecution(taskId, 'submitted');
          } catch (err: any) {
            store().addTaskLog(taskId, `Submission failed: ${err.message}`, 'error');
            store().finishTaskExecution(taskId, 'error');
          }

          await sleep(DELAY_MS, signal);
        } catch (err: any) {
          if (err.name === 'AbortError') throw err;
          store().addTaskLog(taskId, `Error: ${err.message}`, 'error');
          store().finishTaskExecution(taskId, 'error');
          await sleep(2000, signal);
        }
      }

      // All tasks evaluated, wait before next round
      store().addGlobalLog('All tasks evaluated. Waiting before next round...', 'info');
      store().setStatus('searching');
      await sleep(DELAY_MS * 2, signal);
    } catch (err: any) {
      if (err.name === 'AbortError') throw err;
      store().addGlobalLog(`Error: ${err.message}`, 'error');
      store().setStatus('error');
      await sleep(DELAY_MS * 2, signal);
      store().setStatus('searching');
    }
  }
}
