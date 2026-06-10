#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';

const args = parseArgs(process.argv.slice(2));
if (Object.prototype.hasOwnProperty.call(args, 'help')) {
  console.log([
    'Usage:',
    '  node scripts/agentcraft-local-codex-runner.mjs --api http://localhost:3100/api --token <account-runner-token>',
    '  node scripts/agentcraft-local-codex-runner.mjs --api http://localhost:3100/api --project <project-id> --token <runner-token>',
    '  node scripts/agentcraft-local-codex-runner.mjs --api http://localhost:3100/api --project <project-id> --token <runner-token> --member <member-id>',
    '  node scripts/agentcraft-local-codex-runner.mjs --api http://localhost:3100/api --project <project-id> --email <email> --password <password>',
    '',
    'Options:',
    '  --token <jwt-or-runner-token>          Use an AgentCraft JWT, acu_ account runner token, or acr_ project runner token.',
    '  --project <project-id>                 Optional project scope. Omit it to supervise all manageable projects for the account.',
    '  --member <member-id>                  Claim and poll only one member. Requires --project.',
    '  --data-root <path>                    Runtime bundle directory. Default: .agent-runtimes/local-codex',
    '  --codex-bin <path>                    Codex executable. Default: codex.',
    '  --model <model>                       Optional model passed to codex exec.',
    '  --codex-arg=<arg>                     Extra argument passed to codex exec. Repeatable; use = for values that start with --.',
    '  --codex-timeout-ms <ms>               Kill a stuck codex exec after this many ms. Default: 1200000.',
    '  --codex-reconnect-fail-fast-ms <ms>   Kill delay after exhausted reconnects. Default: 15000; set -1 to disable.',
    '  --max-concurrent-codex-execs <n>      Optional maximum simultaneous codex exec processes. Default: unlimited.',
    '  --debug                               Print accepted request and final response for local debugging.',
    '  --debug-events                        Print raw Codex JSONL events. Very noisy.',
    '  --no-json-stream                      Disable Codex JSONL event streaming.',
    '  --no-tmux-mouse                       Do not enable tmux mouse scrolling when running inside tmux.',
    '  --poll-interval-ms <ms>               Cloud polling interval. Default: 2000.',
    '  --idle-poll-interval-ms <ms>          Polling interval when no request is queued. Default: 10000.',
    '  --runner-heartbeat-interval-ms <ms>   Project runner heartbeat interval. Default: 10000.',
    '  --once                                Claim once and exit without polling messages.',
    '',
    'The runner uses outbound polling only: AgentCraft queues work, this process claims it,',
    'runs `codex exec` locally, and posts progress/completion back to AgentCraft.',
  ].join('\n'));
  process.exit(0);
}

const apiBaseUrl = trimSlash(optionValue(args.api, '--api') || process.env.AGENTCRAFT_API_BASE_URL || 'http://localhost:3100/api');
const projectId = optionValue(args.project, '--project') || process.env.AGENTCRAFT_PROJECT_ID || '';
const memberId = optionValue(args.member, '--member') || process.env.AGENTCRAFT_MEMBER_ID || '';
const dataRoot = resolve(optionValue(args.dataRoot, '--data-root') || process.env.AGENTCRAFT_CODEX_RUNNER_DATA_ROOT || defaultDataRoot());
const codexBin = optionValue(args.codexBin, '--codex-bin') || process.env.AGENTCRAFT_CODEX_BIN || defaultCodexBin();
const extraCodexArgs = [
  ...codexArgsFromEnv(process.env.AGENTCRAFT_CODEX_ARGS_JSON),
  ...optionValues(args.codexArg, '--codex-arg'),
];
const debugLogging = flagEnabled(args.debug) || process.env.AGENTCRAFT_RUNNER_DEBUG === '1' || isLocalhostUrl(apiBaseUrl);
const debugEvents = flagEnabled(args.debugEvents) || process.env.AGENTCRAFT_RUNNER_DEBUG_EVENTS === '1';
const codexJsonStream = !flagEnabled(args.noJsonStream) && process.env.AGENTCRAFT_CODEX_JSON_STREAM !== '0';
const tmuxMouseScrolling = !flagEnabled(args.noTmuxMouse) && process.env.AGENTCRAFT_TMUX_MOUSE !== '0';
const pollIntervalMs = Number(optionValue(args.pollIntervalMs, '--poll-interval-ms') || process.env.AGENTCRAFT_RUNNER_POLL_INTERVAL_MS || 2000);
const idlePollIntervalMs = Number(optionValue(args.idlePollIntervalMs, '--idle-poll-interval-ms') || process.env.AGENTCRAFT_RUNNER_IDLE_POLL_INTERVAL_MS || 10_000);
const runnerHeartbeatIntervalMs = Number(optionValue(args.runnerHeartbeatIntervalMs, '--runner-heartbeat-interval-ms') || process.env.AGENTCRAFT_RUNNER_HEARTBEAT_INTERVAL_MS || 10_000);
const codexExecTimeoutMs = Number(optionValue(args.codexTimeoutMs, '--codex-timeout-ms') || process.env.AGENTCRAFT_CODEX_EXEC_TIMEOUT_MS || 1_200_000);
const codexReconnectFailFastMs = Number(optionValue(args.codexReconnectFailFastMs, '--codex-reconnect-fail-fast-ms') || process.env.AGENTCRAFT_CODEX_RECONNECT_FAIL_FAST_MS || 15_000);
const maxConcurrentCodexExecs = positiveIntegerOption(
  optionValue(args.maxConcurrentCodexExecs, '--max-concurrent-codex-execs') ||
    process.env.AGENTCRAFT_CODEX_MAX_CONCURRENT_EXECS,
  0,
);
let token = optionValue(args.token, '--token') || process.env.AGENTCRAFT_TOKEN || '';

if (!token) {
  const email = optionValue(args.email, '--email') || process.env.AGENTCRAFT_EMAIL;
  const password = optionValue(args.password, '--password') || process.env.AGENTCRAFT_PASSWORD;
  if (!email || !password) {
    fail('Missing --token, or --email/--password for login.');
  }
  token = await login(email, password);
}

const useProjectRunnerToken = String(token).startsWith('acr_');
const useAccountRunnerToken = String(token).startsWith('acu_');
const useRunnerToken = useProjectRunnerToken || useAccountRunnerToken;
if (!projectId && useProjectRunnerToken) {
  fail('Project runner tokens require --project. Copy a new account runner command to supervise all projects.');
}
if (!projectId && memberId) {
  fail('--member requires --project because member ids are project-scoped.');
}
const activeWorkers = new Map();
const runCodexWithLimit = maxConcurrentCodexExecs > 0 ? createAsyncLimiter(maxConcurrentCodexExecs) : null;
let shuttingDown = false;
let projectRunnerHeartbeatTimer = null;
let stdinRawModeEnabled = false;
installSignalHandlers();
installReadonlyStdin();
await enableTmuxMouseScrolling();
await ensureCodexAvailable();
await heartbeatProjectRunner();
startProjectRunnerHeartbeat();
console.log(maxConcurrentCodexExecs > 0
  ? `Local Codex exec concurrency limit: ${maxConcurrentCodexExecs}.`
  : 'Local Codex exec concurrency limit: unlimited.');

if (memberId) {
  console.log(`Claiming local Codex job from ${apiBaseUrl} for project ${projectId}...`);
  const job = await claimLocalCodexJob(memberId);
  const worker = await startLocalCodexWorker(job, { exitOnFailure: true });
  if (Object.prototype.hasOwnProperty.call(args, 'once')) {
    process.exit(0);
  }
  activeWorkers.set(worker.job.memberId, worker);
  console.log(`Polling AgentCraft requests every ${pollIntervalMs}ms, or ${normalizedIdlePollIntervalMs()}ms when idle. Press Ctrl+C to stop.`);
  await pollLoop(worker);
} else {
  console.log(projectId
    ? `Starting local Codex project runner for ${projectId}. It will claim every pending local Codex agent in this project.`
    : 'Starting local Codex account runner. It will claim every pending local Codex agent across your manageable projects.');
  await supervisorLoop();
}

async function supervisorLoop() {
  while (!shuttingDown) {
    let claimedAny = false;
    while (!shuttingDown) {
      let job;
      try {
        job = await claimLocalCodexJob('');
      } catch (error) {
        if (isNoPendingJob(error)) break;
        console.error(`Claim failed: ${error?.message || error}`);
        break;
      }
      if (!job?.runtimeId) break;
      if (activeWorkers.has(job.memberId)) break;
      claimedAny = true;
      const worker = await startLocalCodexWorker(job, { exitOnFailure: false }).catch((error) => {
        console.error(error?.message || error);
        return null;
      });
      if (!worker) continue;
      if (Object.prototype.hasOwnProperty.call(args, 'once')) {
        return;
      }
      activeWorkers.set(worker.job.memberId, worker);
      worker.promise = pollLoop(worker)
        .catch((error) => {
          console.error(`Worker ${worker.job.memberId} stopped with error: ${error?.message || error}`);
        })
        .finally(() => {
          activeWorkers.delete(worker.job.memberId);
        });
    }
    await sleep(claimedAny ? 500 : Math.max(normalizedIdlePollIntervalMs(), 5000));
  }
}

async function claimLocalCodexJob(targetMemberId) {
  const query = targetMemberId ? `?memberId=${encodeURIComponent(targetMemberId)}` : '';
  if (!projectId) {
    const accountClaimPath = `/projects/account-local-runners/local-codex${useRunnerToken ? '/runner' : ''}/claim`;
    const claimed = await request(accountClaimPath, { method: 'POST' });
    const job = claimed.job;
    if (!job?.runtimeId) {
      throw new Error('Claim response did not include a local Codex job.');
    }
    return job;
  }
  const claimPath = `/projects/${encodeURIComponent(projectId)}/agent-runtimes/local-codex/claim${query}`;
  const runnerClaimPath = `/projects/${encodeURIComponent(projectId)}/agent-runtimes/local-codex/runner/claim${query}`;
  const claimed = await request(useRunnerToken ? runnerClaimPath : claimPath, { method: 'POST' });
  const job = claimed.job;
  if (!job?.runtimeId) {
    throw new Error('Claim response did not include a local Codex job.');
  }
  return job;
}

async function startLocalCodexWorker(job, options = {}) {
  job = localizeLocalCodexJob(job);
  const runtimeDir = resolve(dataRoot, job.projectId, `${slug(job.role)}-${job.runtimeId.slice(0, 8)}`);
  try {
    console.log(`Writing local Codex bundle to ${runtimeDir}...`);
    await rm(runtimeDir, { recursive: true, force: true });
    await mkdir(runtimeDir, { recursive: true });
    for (const file of job.files || []) {
      const target = safeJoin(runtimeDir, file.path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, file.content || '', 'utf8');
    }

    await request(localCodexPath(job.projectId, job.memberId, 'complete'), {
      method: 'POST',
      body: {
        apiBaseUrl: `local-codex://${job.runtimeId}`,
        dataDir: runtimeDir,
        image: job.image,
        containerName: job.containerName,
        status: 'STARTING',
      },
    });
    console.log('Local Codex worker connected to AgentCraft.');
  } catch (error) {
    const message = error?.message || String(error);
    console.error(message);
    await request(localCodexPath(job.projectId, job.memberId, 'complete'), {
      method: 'POST',
      body: { status: 'ERROR', error: message },
    }).catch(() => null);
    if (options.exitOnFailure) process.exit(1);
    throw error;
  }
  return { job, runtimeDir };
}

function localizeLocalCodexJob(job) {
  const localized = {
    ...job,
    workspaceBaseUrl: localizeHostUrl(job.workspaceBaseUrl),
    projectApiBaseUrl: localizeHostUrl(job.projectApiBaseUrl),
    files: (job.files || []).map((file) => ({
      ...file,
      content: localizeRuntimeFileContent(file.content || ''),
    })),
  };
  return localized;
}

function localizeRuntimeFileContent(content) {
  if (process.env.AGENTCRAFT_LOCAL_CODEX_PRESERVE_CONTAINER_HOSTS === '1') return content;
  return String(content || '').replace(/http:\/\/host\.docker\.internal:/g, 'http://localhost:');
}

function localizeHostUrl(value) {
  if (process.env.AGENTCRAFT_LOCAL_CODEX_PRESERVE_CONTAINER_HOSTS === '1') return value;
  return typeof value === 'string'
    ? value.replace(/^http:\/\/host\.docker\.internal:/, 'http://localhost:')
    : value;
}

async function pollLoop(worker) {
  const { job, runtimeDir } = worker;
  const nextPath = localCodexPath(job.projectId, job.memberId, 'requests/next');
  while (!shuttingDown) {
    try {
      const next = await request(nextPath, { method: 'POST' });
      if (next.shutdown) {
        console.log(next.message || `AgentCraft requested shutdown: ${next.reason || 'runtime closed'}.`);
        return;
      }
      if (Array.isArray(next.syncFiles) && next.syncFiles.length) {
        await writeRuntimeFiles(runtimeDir, next.syncFiles);
        console.log(`Synced ${next.syncFiles.length} local Codex runtime file(s) from AgentCraft.`);
      }
      if (!next.request?.id) {
        await sleep(normalizedIdlePollIntervalMs());
        continue;
      }

      const requestId = next.request.id;
      console.log(`Processing local Codex request ${requestId} for ${job.role}...`);
      debugLogBlock('Accepted AgentCraft local Codex request', {
        requestId,
        projectId: job.projectId,
        memberId: job.memberId,
        role: job.role,
        files: (next.request.files || []).map((file) => ({
          path: file.path,
          bytes: Buffer.byteLength(file.content || '', 'utf8'),
        })),
        payload: next.request.payload || {},
      });
      await writeRuntimeFiles(runtimeDir, next.request.files || []);
      await request(localCodexPath(job.projectId, job.memberId, `requests/${requestId}/progress`), {
        method: 'POST',
        body: { outputText: 'Local Codex picked up the AgentCraft request.' },
      }).catch(() => null);

      try {
        const progress = createCodexProgressReporter(job, requestId);
        let outputText = '';
        try {
          outputText = runCodexWithLimit ? await runCodexWithLimit(async () => {
            await progress.status('Waiting for local Codex execution slot');
            await progress.status('Running local Codex CLI');
            return runCodex(job, next.request, runtimeDir, progress);
          }) : await runCodex(job, next.request, runtimeDir, progress);
        } finally {
          await progress.stop();
        }
        debugLogBlock('Completed AgentCraft local Codex response', {
          requestId,
          outputText,
        });
        await request(localCodexPath(job.projectId, job.memberId, `requests/${requestId}/complete`), {
          method: 'POST',
          body: {
            status: 'COMPLETED',
            outputText,
            recentActions: [{ kind: 'message', name: 'codex', summary: 'Completed by local Codex CLI', status: 'ok' }],
          },
        });
      } catch (error) {
        const message = error?.message || String(error);
        debugLogBlock('Failed AgentCraft local Codex response', {
          requestId,
          error: message,
        });
        await request(localCodexPath(job.projectId, job.memberId, `requests/${requestId}/complete`), {
          method: 'POST',
          body: { status: 'ERROR', error: message, outputText: message },
        }).catch(() => null);
      }
    } catch (error) {
      if (shouldStopPolling(error)) {
        console.log(`AgentCraft runtime is no longer available (${error.status || 'closed'}). Stopping local Codex worker.`);
        return;
      }
      console.error(error?.message || String(error));
      await sleep(normalizedIdlePollIntervalMs());
    }
  }
}

function normalizedIdlePollIntervalMs() {
  return Number.isFinite(idlePollIntervalMs) && idlePollIntervalMs >= pollIntervalMs
    ? idlePollIntervalMs
    : Math.max(pollIntervalMs, 5000);
}

function installSignalHandlers() {
  const handler = (signal) => {
    void shutdown(signal);
  };
  process.once('SIGINT', handler);
  process.once('SIGTERM', handler);
}

function installReadonlyStdin() {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') return;
  process.stdin.setRawMode(true);
  stdinRawModeEnabled = true;
  process.stdin.resume();
  process.stdin.on('data', (chunk) => {
    if (Buffer.from(chunk).includes(0x03)) {
      void shutdown('SIGINT');
    }
  });
  process.once('exit', restoreStdinMode);
}

function restoreStdinMode() {
  if (!stdinRawModeEnabled || !process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') return;
  process.stdin.setRawMode(false);
  stdinRawModeEnabled = false;
}

async function shutdown(reason) {
  if (shuttingDown) return;
  shuttingDown = true;
  restoreStdinMode();
  console.log(`Stopping local Codex runner (${reason})...`);
  if (projectRunnerHeartbeatTimer) clearInterval(projectRunnerHeartbeatTimer);
  await Promise.allSettled(
    [...activeWorkers.values()].map((worker) => disconnectLocalCodexWorker(worker, reason)),
  );
  await disconnectProjectRunner(reason);
  process.exit(0);
}

async function disconnectLocalCodexWorker(worker, reason) {
  await request(localCodexPath(worker.job.projectId, worker.job.memberId, 'disconnect'), {
    method: 'POST',
    body: {
      reason,
      message: 'Local Codex runner stopped. Restart the project runner to reconnect this runtime.',
    },
  }).catch((error) => {
    if (!shouldStopPolling(error)) {
      console.error(`Disconnect failed for ${worker.job.memberId}: ${error?.message || error}`);
    }
  });
}

function startProjectRunnerHeartbeat() {
  const intervalMs = Number.isFinite(runnerHeartbeatIntervalMs) && runnerHeartbeatIntervalMs >= 5000
    ? runnerHeartbeatIntervalMs
    : 10_000;
  projectRunnerHeartbeatTimer = setInterval(() => {
    void heartbeatProjectRunner().catch((error) => {
      if (!shuttingDown) console.error(`Project runner heartbeat failed: ${error?.message || error}`);
    });
  }, intervalMs);
  projectRunnerHeartbeatTimer.unref?.();
}

async function heartbeatProjectRunner() {
  const heartbeatPath = projectId
    ? `/projects/${encodeURIComponent(projectId)}/agent-runtimes/local-codex${useRunnerToken ? '/runner' : ''}/heartbeat`
    : `/projects/account-local-runners/local-codex${useRunnerToken ? '/runner' : ''}/heartbeat`;
  return request(heartbeatPath, {
    method: 'POST',
    body: {
      name: 'Local Codex runner',
      platform: `${process.platform}/${process.arch}`,
      version: '1',
    },
  });
}

async function disconnectProjectRunner(reason) {
  const disconnectPath = projectId
    ? `/projects/${encodeURIComponent(projectId)}/agent-runtimes/local-codex${useRunnerToken ? '/runner' : ''}/disconnect`
    : `/projects/account-local-runners/local-codex${useRunnerToken ? '/runner' : ''}/disconnect`;
  await request(disconnectPath, {
    method: 'POST',
    body: {
      reason,
      name: 'Local Codex runner',
      platform: `${process.platform}/${process.arch}`,
      version: '1',
    },
  }).catch((error) => {
    if (!shouldStopPolling(error)) {
      console.error(`Project runner disconnect failed: ${error?.message || error}`);
    }
  });
}

function isNoPendingJob(error) {
  return Number(error?.status || 0) === 404 || /No pending .*launch job/i.test(String(error?.body || error?.message || ''));
}

function shouldStopPolling(error) {
  return [400, 401, 403, 404, 410].includes(Number(error?.status || 0));
}

async function enableTmuxMouseScrolling() {
  if (!tmuxMouseScrolling || !process.env.TMUX || !process.stdout.isTTY) return;
  try {
    await quietCommand('tmux', ['set-option', '-q', 'mouse', 'on']);
    console.log('Enabled tmux mouse scrolling for this runner session.');
  } catch {
    console.warn('Running inside tmux, but could not enable mouse scrolling. Run `tmux set-option mouse on` if wheel input appears.');
  }
}

async function ensureCodexAvailable() {
  try {
    await checkCommand(codexBin, ['--version']);
  } catch (error) {
    fail([
      `Codex CLI is required for local Codex runner, but "${codexBin}" could not be executed.`,
      'Install and sign in to Codex CLI, make sure it is on PATH, or pass --codex-bin <path> / set AGENTCRAFT_CODEX_BIN.',
      error?.message ? `Details: ${error.message}` : '',
    ].filter(Boolean).join('\n'));
  }
}

function createCodexProgressReporter(job, requestId) {
  const progressPath = localCodexPath(job.projectId, job.memberId, `requests/${requestId}/progress`);
  let lastStatusText = 'Thinking';
  let lastSentStatusText = '';
  let lastSentAt = 0;
  let lastOutputText = '';
  let lastSentOutputText = '';
  let lastOutputSentAt = 0;
  const send = async (body, force = false) => {
    if (!body || typeof body !== 'object') return;
    await request(progressPath, {
      method: 'POST',
      body,
    }).catch(() => null);
  };
  const sendStatus = async (statusText, force = false) => {
    const normalized = cleanStatusText(statusText);
    if (!normalized) return;
    const now = Date.now();
    if (!force && normalized === lastSentStatusText && now - lastSentAt < 9000) return;
    lastStatusText = normalized;
    lastSentStatusText = normalized;
    lastSentAt = now;
    await send({ statusText: normalized }, force);
  };
  const sendOutput = async (outputText, force = false) => {
    const normalized = String(outputText || '').replace(/\r/g, '\n');
    if (!normalized.trim()) return;
    const now = Date.now();
    lastOutputText = normalized;
    if (!force && normalized === lastSentOutputText) return;
    if (!force && now - lastOutputSentAt < 500) return;
    lastSentOutputText = normalized;
    lastOutputSentAt = now;
    await send({ outputText: normalized }, force);
  };
  const timer = setInterval(() => {
    void sendStatus(lastStatusText || 'Thinking', true);
    if (lastOutputText) void sendOutput(lastOutputText, true);
  }, 10_000);
  timer.unref?.();
  void sendStatus('Thinking', true);
  return {
    status(text) {
      return sendStatus(text);
    },
    output(text, force = false) {
      return sendOutput(text, force);
    },
    stop() {
      clearInterval(timer);
      return lastOutputText ? sendOutput(lastOutputText, true) : Promise.resolve();
    },
  };
}

async function runCodex(job, request, cwd, progress) {
  const outputPath = resolve(cwd, `.codex-output-${request.id}.txt`);
  const prompt = buildCodexPrompt(job, request);
  const codexArgs = [
    'exec',
    '--cd',
    cwd,
    '--skip-git-repo-check',
    '--sandbox',
    args.sandbox || process.env.AGENTCRAFT_CODEX_SANDBOX || 'danger-full-access',
    '--output-last-message',
    outputPath,
  ];
  if (codexJsonStream) {
    codexArgs.push('--json');
  }
  if (args.model || process.env.AGENTCRAFT_CODEX_MODEL) {
    codexArgs.push('--model', args.model || process.env.AGENTCRAFT_CODEX_MODEL);
  }
  codexArgs.push(...extraCodexArgs);
  codexArgs.push('-');

  debugLogBlock('Starting Codex CLI', {
    requestId: request.id,
    cwd,
    command: codexBin,
    args: codexArgs.filter((item) => item !== '-'),
    jsonStream: codexJsonStream,
  });
  const reportCodexStream = createCodexStreamReporter(progress, codexReconnectFailFastMs);
  const { stdout, stderr } = await execFile(codexBin, codexArgs, prompt, {
    cwd,
    timeoutMs: Number.isFinite(codexExecTimeoutMs) && codexExecTimeoutMs > 0 ? codexExecTimeoutMs : 0,
    env: {
      ...process.env,
      AGENTCRAFT_LOCAL_CODEX: 'true',
      AGENTCRAFT_PROJECT_ID: job.projectId,
      AGENTCRAFT_MEMBER_ID: job.memberId,
      AGENTCRAFT_RUNTIME_ID: job.runtimeId,
      AGENT_WORKSPACE_TOKEN: job.workspaceToken,
      AIFACTORY_RUNTIME_TOKEN: job.workspaceToken,
      AIFACTORY_API_BASE_URL: job.projectApiBaseUrl || apiBaseUrl,
      AGENT_WORKSPACE_BASE_URL: job.workspaceBaseUrl,
    },
    onStdout: reportCodexStream.stdout,
    onStderr: reportCodexStream.stderr,
    shouldAbort: reportCodexStream.shouldAbort,
    abortAfterMs: Number.isFinite(codexReconnectFailFastMs) ? codexReconnectFailFastMs : -1,
    abortMessage: reportCodexStream.abortMessage,
  });
  reportCodexStream.flush();
  const finalMessage = await readFile(outputPath, 'utf8').catch(() => '');
  return finalMessage.trim() || reportCodexStream.outputText().trim() || (!codexJsonStream ? stdout.trim() : '') || stderr.trim() || '(Codex completed without text output)';
}

function createCodexStreamReporter(progress, reconnectFailFastMs) {
  let lastStatusText = '';
  let outputText = '';
  let stdoutLineBuffer = '';
  let exhaustedReconnectStatus = '';

  const clearReconnectAbort = () => {
    exhaustedReconnectStatus = '';
  };

  const reportStatusText = (text) => {
    for (const statusText of extractCodexStatusTexts(text)) {
      void progress?.status(statusText);
      if (statusText === lastStatusText) continue;
      lastStatusText = statusText;
      console.error(/^Reconnecting\b/i.test(statusText) ? `ERROR: ${statusText}` : statusText);
      if (isExhaustedReconnectStatus(statusText)) {
        exhaustedReconnectStatus = statusText;
      } else if (!/^Reconnecting\b/i.test(statusText)) {
        clearReconnectAbort();
      }
    }
  };

  const appendOutputText = (text) => {
    if (!text) return;
    clearReconnectAbort();
    outputText += text;
    void progress?.output(outputText);
  };

  const replaceOutputText = (text) => {
    if (!text || text === outputText) return;
    clearReconnectAbort();
    outputText = text;
    void progress?.output(outputText, true);
  };

  const handleJsonLine = (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    if (!trimmed.startsWith('{')) {
      reportStatusText(trimmed);
      return;
    }
    let event;
    try {
      event = JSON.parse(trimmed);
    } catch {
      reportStatusText(trimmed);
      return;
    }
    if (debugEvents) debugLogBlock('Codex JSON event', event);
    reportStatusText(extractCodexStatusTextCandidatesFromJsonEvent(event).join('\n'));
    const statusText = extractCodexStatusFromJsonEvent(event);
    if (statusText) reportStatusText(statusText);
    const deltaText = extractCodexOutputDeltaFromJsonEvent(event);
    if (deltaText) appendOutputText(deltaText);
    const fullText = extractCodexOutputTextFromJsonEvent(event);
    if (fullText) replaceOutputText(fullText);
  };

  const stdout = (text) => {
    if (!codexJsonStream) {
      reportStatusText(text);
      return;
    }
    stdoutLineBuffer += text;
    const lines = stdoutLineBuffer.split(/\n/);
    stdoutLineBuffer = lines.pop() || '';
    for (const line of lines) handleJsonLine(line);
  };

  const stderr = (text) => {
    reportStatusText(text);
  };

  return {
    stdout,
    stderr,
    flush() {
      if (stdoutLineBuffer.trim()) handleJsonLine(stdoutLineBuffer);
      stdoutLineBuffer = '';
    },
    outputText() {
      return outputText;
    },
    shouldAbort() {
      if (!exhaustedReconnectStatus) return false;
      const graceMs = Number(reconnectFailFastMs);
      if (!Number.isFinite(graceMs) || graceMs < 0) return false;
      return true;
    },
    abortMessage() {
      return exhaustedReconnectStatus
        ? `Codex backend reconnect exhausted (${exhaustedReconnectStatus}). Restart the local Codex runner after the Codex app/API connection recovers.`
        : '';
    },
  };
}

function isExhaustedReconnectStatus(statusText) {
  const match = /^Reconnecting\.\.\.\s*(\d+)\s*\/\s*(\d+)$/i.exec(String(statusText || '').trim());
  if (!match) return false;
  const current = Number(match[1]);
  const max = Number(match[2]);
  return Number.isFinite(current) && Number.isFinite(max) && max > 0 && current >= max;
}

function cleanStatusText(value) {
  const cleaned = String(value || '')
    .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.replace(/^\s*(?:ERROR|WARN|INFO|DEBUG):\s*/i, '').trim())
    .filter(Boolean)
    .slice(-1)[0];
  return cleaned ? cleaned.slice(0, 180) : '';
}

function extractCodexStatusTexts(text) {
  const lines = String(text || '')
    .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const statuses = [];
  for (const line of lines) {
    const reconnecting = /(?:ERROR:\s*)?(Reconnecting\.\.\.\s*\d+\s*\/\s*\d+)/i.exec(line);
    if (reconnecting) {
      statuses.push(reconnecting[1].replace(/\s*\/\s*/g, '/'));
      continue;
    }
    if (/^Thinking\b/i.test(line)) statuses.push('Thinking');
  }
  return statuses;
}

function extractCodexStatusTextCandidatesFromJsonEvent(event) {
  return [
    event?.message,
    event?.text,
    event?.delta,
    event?.error,
    event?.error?.message,
    event?.item?.message,
    event?.item?.text,
  ].filter((value) => typeof value === 'string' && value);
}

function extractCodexStatusFromJsonEvent(event) {
  const type = String(event?.type || event?.event || '');
  const message = typeof event?.message === 'string' ? event.message : '';
  if (/error|stream_error/i.test(type) && message) return message;
  return '';
}

function extractCodexOutputDeltaFromJsonEvent(event) {
  const type = String(event?.type || event?.event || '').toLowerCase();
  if (!/(agent_message_content_delta|output_transcript_delta|message.*delta)/.test(type)) return '';
  return firstString(event?.delta, event?.text, event?.content, event?.message);
}

function extractCodexOutputTextFromJsonEvent(event) {
  const type = String(event?.type || event?.event || '').toLowerCase();
  if (type === 'agent_message' || type === 'task_complete' || type === 'turn.completed' || type === 'turn_complete') {
    return firstString(
      event?.message,
      extractTextFromContent(event?.message?.content),
      event?.last_agent_message,
      event?.lastAgentMessage,
      extractTextFromContent(event?.content),
      extractTextFromContent(event?.item?.content),
    );
  }
  if ((type === 'item.completed' || type === 'item_completed') && String(event?.item?.role || event?.role || '') === 'assistant') {
    return extractTextFromContent(event?.item?.content || event?.content);
  }
  return '';
}

function extractTextFromContent(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((item) => firstString(item?.text, item?.content, item?.output_text, item?.outputText))
    .filter(Boolean)
    .join('');
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value) return value;
  }
  return '';
}

function buildCodexPrompt(job, request) {
  return [
    'You are a local Codex worker connected to an AgentCraft project.',
    '',
    'Use the files in this runtime bundle for project context. Important files:',
    '- AGENT_WORKSPACE_CONTEXT.json',
    '- AGENT_WORKSPACE_RUNTIME.env',
    '- skills/',
    '',
    'This runner starts Codex with the runtime bundle as the current working directory.',
    'When skill examples mention /opt/data/AGENT_WORKSPACE_RUNTIME.env, use ./AGENT_WORKSPACE_RUNTIME.env in this local Codex bundle instead.',
    'Before any shell/API command, source ./AGENT_WORKSPACE_RUNTIME.env in the same command, or use the AGENT_WORKSPACE_* and AIFACTORY_* environment variables already exported by this runner.',
    'For project board, feature, work item, memory, and file writes, prefer $AGENT_WORKSPACE_BASE_URL/v1/... with Authorization: Bearer $AGENT_WORKSPACE_TOKEN.',
    'For host runtime launch/dispatch helpers, use $AIFACTORY_API_BASE_URL exactly as provided with Authorization: Bearer $AIFACTORY_RUNTIME_TOKEN. Do not prepend another /api segment if the base URL already ends with /api.',
    'Do not call host /projects/... endpoints without a bearer token; unauthenticated 401s mean the wrong API surface or missing env source.',
    '',
    'Complete the queued AgentCraft request and return a concise handoff response.',
    'If the request asks you to edit files, use the project APIs and workspace instructions exposed in the bundle.',
    '',
    `Project: ${job.projectId}`,
    `Member: ${job.memberId}`,
    `Role: ${job.role}`,
    `Runtime: ${job.runtimeId}`,
    '',
    'Queued request payload JSON:',
    JSON.stringify(request.payload || {}, null, 2),
  ].join('\n');
}

async function login(email, password) {
  const response = await fetch(`${apiBaseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) {
    throw new Error(`Login failed with ${response.status}: ${await response.text()}`);
  }
  const payload = await response.json();
  return payload.access_token;
}

async function request(path, options = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: options.method || 'GET',
    headers: {
      authorization: `Bearer ${token}`,
      ...(options.body ? { 'content-type': 'application/json' } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!response.ok) {
    const text = await response.text();
    const error = new Error(`AgentCraft API ${options.method || 'GET'} ${path} failed with ${response.status}: ${text}`);
    error.status = response.status;
    error.body = text;
    throw error;
  }
  return response.json();
}

function execFile(command, commandArgs, input, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, commandArgs, {
      cwd: options.cwd,
      env: options.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    let timedOut = false;
    let aborted = false;
    let abortReason = '';
    let killTimer = null;
    let abortTimer = null;
    const timeoutMs = Number(options.timeoutMs || 0);
    const cleanup = () => {
      if (killTimer) clearTimeout(killTimer);
      if (abortTimer) clearTimeout(abortTimer);
      killTimer = null;
      abortTimer = null;
    };
    if (timeoutMs > 0) {
      killTimer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
        setTimeout(() => {
          if (!settled) child.kill('SIGKILL');
        }, 5000).unref?.();
      }, timeoutMs);
      killTimer.unref?.();
    }
    const abortChild = (message) => {
      if (settled || aborted) return;
      aborted = true;
      abortReason = message || 'Command aborted';
      child.kill('SIGTERM');
      setTimeout(() => {
        if (!settled) child.kill('SIGKILL');
      }, 5000).unref?.();
    };
    const scheduleAbortIfNeeded = () => {
      if (settled || aborted) return;
      if (!options.shouldAbort?.()) {
        if (abortTimer) clearTimeout(abortTimer);
        abortTimer = null;
        return;
      }
      const abortAfterMs = Number(options.abortAfterMs || 0);
      const message = options.abortMessage?.() || 'Command aborted';
      if (abortAfterMs <= 0) {
        abortChild(message);
        return;
      }
      if (abortTimer) return;
      abortTimer = setTimeout(() => abortChild(message), abortAfterMs);
      abortTimer.unref?.();
    };
    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      options.onStdout?.(text);
      scheduleAbortIfNeeded();
    });
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      options.onStderr?.(text);
      scheduleAbortIfNeeded();
    });
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (timedOut) {
        reject(new Error(`${command} timed out after ${timeoutMs}ms`));
        return;
      }
      if (aborted) {
        reject(new Error(abortReason || `${command} aborted`));
        return;
      }
      if (code === 0) {
        resolvePromise({ stdout, stderr });
      } else {
        reject(new Error(`${command} exited with ${code}: ${stderr || stdout}`));
      }
    });
    child.stdin.end(input);
  });
}

function checkCommand(command, commandArgs = []) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, commandArgs, {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(stderr.trim() || `${command} ${commandArgs.join(' ')} exited with ${code}`));
    });
  });
}

function quietCommand(command, commandArgs = []) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, commandArgs, {
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${command} ${commandArgs.join(' ')} exited with ${code}`));
    });
  });
}

async function writeRuntimeFiles(baseDir, files) {
  for (const file of files || []) {
    const target = safeJoin(baseDir, file.path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, localizeRuntimeFileContent(file.content || ''), 'utf8');
  }
}

function localCodexPath(runtimeProjectId, memberId, suffix) {
  const runnerSegment = useRunnerToken ? '/runner' : '';
  return `/projects/${encodeURIComponent(runtimeProjectId)}/agent-runtimes/${encodeURIComponent(memberId)}/local-codex${runnerSegment}/${suffix}`;
}

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith('--')) continue;
    const equalIndex = item.indexOf('=');
    const rawKey = equalIndex >= 0 ? item.slice(2, equalIndex) : item.slice(2);
    const key = rawKey.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    const set = (value) => {
      if (Object.prototype.hasOwnProperty.call(parsed, key)) {
        parsed[key] = Array.isArray(parsed[key]) ? [...parsed[key], value] : [parsed[key], value];
      } else {
        parsed[key] = value;
      }
    };
    if (equalIndex >= 0) {
      set(item.slice(equalIndex + 1));
      continue;
    }
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      set(true);
    } else {
      set(next);
      i += 1;
    }
  }
  return parsed;
}

function optionValue(value, flag) {
  if (Array.isArray(value)) return optionValue(value[value.length - 1], flag);
  if (value === true) {
    fail(`Missing value for ${flag}. If you are on macOS/Linux, paste the macOS/Linux command, not the Windows PowerShell command.`);
  }
  return value;
}

function optionValues(value, flag) {
  if (value === undefined) return [];
  const values = Array.isArray(value) ? value : [value];
  for (const item of values) optionValue(item, flag);
  return values;
}

function flagEnabled(value) {
  if (Array.isArray(value)) return value.some(flagEnabled);
  if (value === true) return true;
  if (value === undefined || value === null || value === false) return false;
  return /^(1|true|yes|on)$/i.test(String(value));
}

function isLocalhostUrl(value) {
  try {
    const url = new URL(value);
    return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname);
  } catch {
    return false;
  }
}

function debugLogBlock(title, value) {
  if (!debugLogging) return;
  const rendered = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  console.error(`\n[AgentCraft local Codex debug] ${title}\n${rendered}\n`);
}

function codexArgsFromEnv(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) {
      return parsed;
    }
  } catch {
    // Fall through to the explicit error below.
  }
  fail('AGENTCRAFT_CODEX_ARGS_JSON must be a JSON array of strings, for example ["--ignore-user-config","--disable","plugins"].');
}

function positiveIntegerOption(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed >= 0) return parsed;
  fail(`Expected a non-negative integer, got: ${value}`);
}

function createAsyncLimiter(maxConcurrent) {
  const limit = Math.max(1, Number(maxConcurrent) || 1);
  let active = 0;
  const queue = [];
  const drain = () => {
    while (active < limit && queue.length) {
      const next = queue.shift();
      active += 1;
      next();
    }
  };
  return (task) => new Promise((resolveTask, rejectTask) => {
    queue.push(() => {
      Promise.resolve()
        .then(task)
        .then(resolveTask, rejectTask)
        .finally(() => {
          active -= 1;
          drain();
        });
    });
    drain();
  });
}

function safeJoin(base, relativePath) {
  const target = resolve(base, relativePath || '');
  const root = resolve(base);
  if (target !== root && !target.startsWith(`${root}/`)) {
    throw new Error(`Refusing to write outside runtime dir: ${relativePath}`);
  }
  return target;
}

function slug(value) {
  return String(value || 'agent').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'agent';
}

function trimSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

function defaultDataRoot() {
  return resolve(homedir(), '.agentcraft', 'local-codex');
}

function defaultCodexBin() {
  return 'codex';
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
