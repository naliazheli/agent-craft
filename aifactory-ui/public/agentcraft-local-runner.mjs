#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';

const args = parseArgs(process.argv.slice(2));
if (Object.prototype.hasOwnProperty.call(args, 'help')) {
  console.log([
    'Usage:',
    '  node scripts/agentcraft-local-runner.mjs --api https://api.agentcraft.work/api --token <account-runner-token>',
    '  node scripts/agentcraft-local-runner.mjs --api https://api.agentcraft.work/api --project <project-id> --email <email> --password <password>',
    '  node scripts/agentcraft-local-runner.mjs --api https://api.agentcraft.work/api --project <project-id> --token <runner-token> --member <member-id>',
    '',
    'Options:',
    '  --token <jwt-or-runner-token>          Use an AgentCraft JWT, acu_ account runner token, or acr_ project runner token.',
    '  --project <project-id>                 Optional project scope. Omit it to supervise all manageable projects for the account.',
    '  --member <member-id>                  Claim and poll only one member. Requires --project.',
    '  --data-root <path>                    Runtime bundle directory. Default: .agent-runtimes/local-runner',
    '  --runtime-host <host>                 Hostname used by this runner locally. Default: 127.0.0.1',
    '  --port <port>                         Fixed host port. Default: auto.',
    '  --no-tmux-mouse                       Do not enable tmux mouse scrolling when running inside tmux.',
    '  --poll-interval-ms <ms>               Cloud polling interval. Default: 2000.',
    '  --runner-heartbeat-interval-ms <ms>   Project runner heartbeat interval. Default: 10000.',
    '  --once                                Start the runtime and exit without polling messages.',
    '',
    'The runner keeps an outbound connection pattern: cloud API queues work, this process polls,',
    'calls the local Docker runtime, then posts the result back. No public tunnel is required.',
  ].join('\n'));
  process.exit(0);
}

const apiBaseUrl = trimSlash(optionValue(args.api, '--api') || process.env.AGENTCRAFT_API_BASE_URL || 'http://localhost:3100/api');
const projectId = optionValue(args.project, '--project') || process.env.AGENTCRAFT_PROJECT_ID || '';
const memberId = optionValue(args.member, '--member') || process.env.AGENTCRAFT_MEMBER_ID || '';
const dataRoot = resolve(optionValue(args.dataRoot, '--data-root') || process.env.AGENTCRAFT_RUNNER_DATA_ROOT || defaultDataRoot());
const runtimeHost = optionValue(args.runtimeHost, '--runtime-host') || process.env.AGENTCRAFT_RUNTIME_HOST || '127.0.0.1';
const tmuxMouseScrolling = !flagEnabled(args.noTmuxMouse) && process.env.AGENTCRAFT_TMUX_MOUSE !== '0';
const pollIntervalMs = Number(optionValue(args.pollIntervalMs, '--poll-interval-ms') || process.env.AGENTCRAFT_RUNNER_POLL_INTERVAL_MS || 2000);
const runnerHeartbeatIntervalMs = Number(optionValue(args.runnerHeartbeatIntervalMs, '--runner-heartbeat-interval-ms') || process.env.AGENTCRAFT_RUNNER_HEARTBEAT_INTERVAL_MS || 10_000);
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
let shuttingDown = false;
let projectRunnerHeartbeatTimer = null;
let stdinRawModeEnabled = false;
installSignalHandlers();
installReadonlyStdin();
await enableTmuxMouseScrolling();
await ensureDockerAvailable();
await heartbeatProjectRunner();
startProjectRunnerHeartbeat();

if (memberId) {
  console.log(`Claiming local runner job from ${apiBaseUrl} for project ${projectId}...`);
  const job = await claimLocalRunnerJob(memberId);
  const worker = await startLocalRunnerWorker(job, { exitOnFailure: true });
  if (Object.prototype.hasOwnProperty.call(args, 'once')) {
    process.exit(0);
  }
  activeWorkers.set(worker.job.memberId, worker);
  console.log(`Polling cloud requests every ${pollIntervalMs}ms. Press Ctrl+C to stop.`);
  await pollLoop(worker);
} else {
  console.log(projectId
    ? `Starting local Docker project runner for ${projectId}. It will claim every pending local Docker agent in this project.`
    : 'Starting local Docker account runner. It will claim every pending local Docker agent across your manageable projects.');
  await supervisorLoop();
}

async function supervisorLoop() {
  while (!shuttingDown) {
    let claimedAny = false;
    while (!shuttingDown) {
      let job;
      try {
        job = await claimLocalRunnerJob('');
      } catch (error) {
        if (isNoPendingJob(error)) break;
        console.error(`Claim failed: ${error?.message || error}`);
        break;
      }
      if (!job?.runtimeId) break;
      if (activeWorkers.has(job.memberId)) break;
      claimedAny = true;
      const worker = await startLocalRunnerWorker(job, { exitOnFailure: false }).catch((error) => {
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
    await sleep(claimedAny ? 500 : Math.max(pollIntervalMs, 5000));
  }
}

async function claimLocalRunnerJob(targetMemberId) {
  const query = targetMemberId ? `?memberId=${encodeURIComponent(targetMemberId)}` : '';
  if (!projectId) {
    const accountClaimPath = `/projects/account-local-runners/local-runner${useRunnerToken ? '/runner' : ''}/claim`;
    const claimed = await request(accountClaimPath, { method: 'POST' });
    const job = claimed.job;
    if (!job?.runtimeId) {
      throw new Error('Claim response did not include a local runner job.');
    }
    return job;
  }
  const claimPath = `/projects/${encodeURIComponent(projectId)}/agent-runtimes/local-runner/claim${query}`;
  const runnerClaimPath = `/projects/${encodeURIComponent(projectId)}/agent-runtimes/local-runner/runner/claim${query}`;
  const claimed = await request(useRunnerToken ? runnerClaimPath : claimPath, { method: 'POST' });
  const job = claimed.job;
  if (!job?.runtimeId) {
    throw new Error('Claim response did not include a local runner job.');
  }
  return job;
}

async function startLocalRunnerWorker(job, options = {}) {
  const runtimeDir = resolve(dataRoot, job.projectId, `${slug(job.role)}-${job.runtimeId.slice(0, 8)}`);
  const port = await selectPort();
  const localRuntimeBaseUrl = `http://${runtimeHost}:${port}`;

  try {
    console.log(`Writing runtime bundle to ${runtimeDir}...`);
    await rm(runtimeDir, { recursive: true, force: true });
    await mkdir(runtimeDir, { recursive: true });
    for (const file of job.files || []) {
      const target = safeJoin(runtimeDir, file.path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, file.content || '', 'utf8');
    }

    console.log(`Starting Docker container ${job.containerName} from ${job.image}...`);
    await docker(['rm', '-f', job.containerName]).catch(() => null);
    const envArgs = Object.entries(job.env || {}).flatMap(([key, value]) => ['-e', `${key}=${value}`]);
    const agentType = job.agentType || job.env?.AGENTCRAFT_AGENT_TYPE || 'hermes-agent';
    const shellEntrypoint = agentType === 'hermes-agent' ? '/bin/bash' : '/bin/sh';
    const shellName = agentType === 'hermes-agent' ? 'bash' : 'sh';
    const runArgs = [
      'run',
      '-d',
      '--name',
      job.containerName,
      '-p',
      `${port}:8642`,
      ...envArgs,
      '-v',
      `${runtimeDir}:/opt/data`,
      '--entrypoint',
      shellEntrypoint,
      job.image,
      '-lc',
      localRunnerEntrypointScript(),
      shellName,
      ...(Array.isArray(job.command) && job.command.length ? job.command : ['gateway', 'run']),
    ];
    const containerId = (await docker(runArgs)).trim();

    console.log(`Container started: ${containerId || job.containerName}`);
    console.log(`Local runtime API: ${localRuntimeBaseUrl}`);
    await waitForLocalRuntime(localRuntimeBaseUrl);
    await request(localRunnerPath(job.projectId, job.memberId, 'complete'), {
      method: 'POST',
      body: {
        apiBaseUrl: `local-runner://${job.runtimeId}`,
        containerId: containerId || null,
        containerName: job.containerName,
        dataDir: runtimeDir,
        image: job.image,
        status: 'STARTING',
      },
    });
    console.log('Local runner completion reported to AgentCraft.');
  } catch (error) {
    const message = error?.message || String(error);
    console.error(message);
    await request(localRunnerPath(job.projectId, job.memberId, 'complete'), {
      method: 'POST',
      body: { status: 'ERROR', error: message },
    }).catch(() => null);
    await stopLocalRuntime(job);
    if (options.exitOnFailure) process.exit(1);
    throw error;
  }

  return { job, runtimeDir, localRuntimeBaseUrl };
}

function localRunnerEntrypointScript() {
  return [
    'set -eu',
    'agent_type="${AGENTCRAFT_AGENT_TYPE:-hermes-agent}"',
    'if [ "$agent_type" = "hermes-agent" ]; then',
    '  chown -R hermes:hermes /opt/data 2>/dev/null || true',
    '  if [ "${ENABLE_AGENT_SUDO:-false}" = "true" ]; then',
    '    if ! command -v sudo >/dev/null 2>&1; then',
    '      DEBIAN_FRONTEND=noninteractive apt-get update >/dev/null && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends sudo >/dev/null && rm -rf /var/lib/apt/lists/*',
    '    fi',
    '    usermod -aG sudo hermes 2>/dev/null || true',
    '    printf "hermes ALL=(ALL) NOPASSWD:ALL\\n" >/etc/sudoers.d/90-hermes-agent',
    '    chmod 0440 /etc/sudoers.d/90-hermes-agent',
    '  fi',
    '  if [ -x /opt/hermes/docker/entrypoint.sh ]; then',
    '    exec /opt/hermes/docker/entrypoint.sh "$@"',
    '  fi',
    '  if command -v hermes-docker-entrypoint >/dev/null 2>&1; then',
    '    exec hermes-docker-entrypoint "$@"',
    '  fi',
    'fi',
    'exec "$@"',
  ].join('\n');
}

async function pollLoop(worker) {
  const { job, runtimeDir, localRuntimeBaseUrl } = worker;
  const nextPath = localRunnerPath(job.projectId, job.memberId, 'requests/next');
  while (!shuttingDown) {
    try {
      const next = await request(nextPath, { method: 'POST' });
      if (next.shutdown) {
        console.log(next.message || `AgentCraft requested shutdown: ${next.reason || 'runtime closed'}.`);
        await stopLocalRuntime(job);
        return;
      }
      if (!next.request?.id) {
        await sleep(pollIntervalMs);
        continue;
      }

      const requestId = next.request.id;
      console.log(`Processing cloud request ${requestId} for ${job.role}...`);
      try {
        await writeRuntimeFiles(runtimeDir, next.request.files || []);
        let lastProgressAt = 0;
        let lastProgressText = '';
        const reportProgress = (outputText, recentActions = [], force = false) => {
          if (!outputText || outputText === lastProgressText) return;
          const now = Date.now();
          if (!force && now - lastProgressAt < 250) return;
          lastProgressAt = now;
          lastProgressText = outputText;
          void request(localRunnerPath(job.projectId, job.memberId, `requests/${encodeURIComponent(requestId)}/progress`), {
            method: 'POST',
            body: {
              outputText,
              recentActions,
            },
          }).catch((error) => {
            console.error(`Progress update failed for ${requestId}: ${error?.message || error}`);
          });
        };
        const result = await callLocalRuntime(localRuntimeBaseUrl, job.apiKey, next.request.payload || {}, reportProgress);
        if (result.outputText && result.outputText !== lastProgressText) {
          reportProgress(result.outputText, result.recentActions, true);
        }
        const runtimeFailed = isRuntimeFailure(result.payload);
        await request(localRunnerPath(job.projectId, job.memberId, `requests/${encodeURIComponent(requestId)}/complete`), {
          method: 'POST',
          body: {
            status: runtimeFailed ? 'ERROR' : 'COMPLETED',
            outputText: result.outputText,
            recentActions: result.recentActions,
            error: runtimeFailed ? runtimeFailureMessage(result) : null,
          },
        });
        console.log(`${runtimeFailed ? 'Failed' : 'Completed'} cloud request ${requestId}.`);
      } catch (error) {
        const message = error?.message || String(error);
        await request(localRunnerPath(job.projectId, job.memberId, `requests/${encodeURIComponent(requestId)}/complete`), {
          method: 'POST',
          body: { status: 'ERROR', error: message },
        }).catch(() => null);
        console.error(`Request ${requestId} failed: ${message}`);
      }
    } catch (error) {
      if (shouldStopPolling(error)) {
        console.log(`AgentCraft runtime is no longer available (${error.status || 'closed'}). Stopping local Docker runtime.`);
        await stopLocalRuntime(job);
        return;
      }
      console.error(`Polling failed: ${error?.message || error}`);
      await sleep(Math.max(pollIntervalMs, 5000));
    }
  }
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
  console.log(`Stopping local Docker runner (${reason})...`);
  if (projectRunnerHeartbeatTimer) clearInterval(projectRunnerHeartbeatTimer);
  await Promise.allSettled(
    [...activeWorkers.values()].map(async (worker) => {
      await stopLocalRuntime(worker.job);
      await disconnectLocalRunnerWorker(worker, reason);
    }),
  );
  await disconnectProjectRunner(reason);
  process.exit(0);
}

async function disconnectLocalRunnerWorker(worker, reason) {
  await request(localRunnerPath(worker.job.projectId, worker.job.memberId, 'disconnect'), {
    method: 'POST',
    body: {
      reason,
      message: 'Local Docker runner stopped. Restart the project runner to reconnect this runtime.',
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
    ? `/projects/${encodeURIComponent(projectId)}/agent-runtimes/local-runner${useRunnerToken ? '/runner' : ''}/heartbeat`
    : `/projects/account-local-runners/local-runner${useRunnerToken ? '/runner' : ''}/heartbeat`;
  return request(heartbeatPath, {
    method: 'POST',
    body: {
      name: 'Local Docker runner',
      platform: `${process.platform}/${process.arch}`,
      version: '1',
    },
  });
}

async function disconnectProjectRunner(reason) {
  const disconnectPath = projectId
    ? `/projects/${encodeURIComponent(projectId)}/agent-runtimes/local-runner${useRunnerToken ? '/runner' : ''}/disconnect`
    : `/projects/account-local-runners/local-runner${useRunnerToken ? '/runner' : ''}/disconnect`;
  await request(disconnectPath, {
    method: 'POST',
    body: {
      reason,
      name: 'Local Docker runner',
      platform: `${process.platform}/${process.arch}`,
      version: '1',
    },
  }).catch((error) => {
    if (!shouldStopPolling(error)) {
      console.error(`Project runner disconnect failed: ${error?.message || error}`);
    }
  });
}

async function stopLocalRuntime(job) {
  console.log(`Stopping Docker container ${job.containerName}...`);
  await docker(['rm', '-f', job.containerName]).catch((error) => {
    console.error(`Docker stop failed: ${error?.message || error}`);
  });
  console.log('Local runner stopped.');
}

async function ensureDockerAvailable() {
  try {
    await docker(['version', '--format', '{{.Server.Version}}']);
  } catch (error) {
    fail([
      'Docker is required for local Docker runner, but Docker could not be reached.',
      'Install/start Docker Desktop and retry this project runner command.',
      error?.message ? `Details: ${error.message}` : '',
    ].filter(Boolean).join('\n'));
  }
}

async function selectPort() {
  const fixedPort = Number(args.port || process.env.AGENTCRAFT_RUNTIME_PORT || 0) || 0;
  if (memberId && fixedPort) return fixedPort;
  return freePort();
}

function isNoPendingJob(error) {
  return Number(error?.status || 0) === 404 || /No pending .*launch job/i.test(String(error?.body || error?.message || ''));
}

function shouldStopPolling(error) {
  return [400, 401, 403, 404, 410].includes(Number(error?.status || 0));
}

async function writeRuntimeFiles(rootDir, files) {
  if (!Array.isArray(files) || !files.length) return;
  for (const file of files) {
    const target = safeJoin(rootDir, file.path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, file.content || '', 'utf8');
  }
}

async function callLocalRuntime(localRuntimeBaseUrl, apiKey, payload, onProgress) {
  const response = await fetchWithDetails(`${localRuntimeBaseUrl}/v1/responses`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`Agent runtime request failed with ${response.status}: ${await response.text()}`);
  }
  return normalizeRuntimeResponse(response, onProgress);
}

async function waitForLocalRuntime(localRuntimeBaseUrl) {
  const deadline = Date.now() + 90_000;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetchWithDetails(`${localRuntimeBaseUrl}/health`);
      if (response.ok) return;
      lastError = new Error(`health returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(1000);
  }
  throw new Error(`Local runtime did not become ready at ${localRuntimeBaseUrl}: ${lastError?.message || 'timeout'}`);
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
  const response = await fetchWithDetails(`${apiBaseUrl}${path}`, {
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

async function fetchWithDetails(url, options = {}) {
  try {
    return await fetch(url, options);
  } catch (error) {
    const cause = error?.cause;
    const details = [
      error?.message || String(error),
      cause?.code,
      cause?.address,
      cause?.port,
    ].filter(Boolean).join(' ');
    throw new Error(`${details || 'fetch failed'} (${url})`);
  }
}

async function normalizeRuntimeResponse(response, onProgress) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const payload = await response.json();
    return {
      payload,
      outputText: extractOutputText(payload),
      recentActions: extractRecentActions(payload),
    };
  }

  const payload = onProgress && response.body
    ? await readResponsesStream(response, onProgress)
    : parseResponsesStream(await response.text());
  return {
    payload,
    outputText: extractOutputText(payload),
    recentActions: extractRecentActions(payload),
  };
}

async function readResponsesStream(response, onProgress) {
  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let buffer = '';
  let eventName = '';
  let dataLines = [];
  let outputText = '';
  let completedPayload = null;

  const dispatch = async () => {
    if (!dataLines.length) return;
    const rawData = dataLines.join('\n');
    const currentEvent = eventName;
    eventName = '';
    dataLines = [];
    if (!rawData || rawData === '[DONE]') return;
    let payload;
    try {
      payload = JSON.parse(rawData);
    } catch {
      return;
    }
    const type = payload?.type || currentEvent;
    if (type === 'response.output_text.delta' && typeof payload.delta === 'string') {
      outputText += payload.delta;
      await onProgress(outputText);
      return;
    }
    if (type === 'response.completed' || type === 'response.failed' || type === 'response.incomplete') {
      completedPayload = payload.response || payload;
      const completedText = extractOutputText(completedPayload) || outputText;
      if (completedText) await onProgress(completedText, extractRecentActions(completedPayload));
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    while (true) {
      const newlineIndex = buffer.indexOf('\n');
      if (newlineIndex < 0) break;
      const line = buffer.slice(0, newlineIndex).replace(/\r$/, '');
      buffer = buffer.slice(newlineIndex + 1);
      if (!line) {
        await dispatch();
        continue;
      }
      if (line.startsWith(':')) continue;
      if (line.startsWith('event:')) {
        eventName = line.slice('event:'.length).trim();
        continue;
      }
      if (line.startsWith('data:')) {
        dataLines.push(line.slice('data:'.length).trimStart());
      }
    }
  }
  buffer += decoder.decode();
  if (buffer.trim()) {
    for (const line of buffer.split(/\r?\n/)) {
      if (!line) await dispatch();
      else if (line.startsWith('event:')) eventName = line.slice('event:'.length).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice('data:'.length).trimStart());
    }
  }
  await dispatch();

  if (completedPayload && extractOutputText(completedPayload)) {
    return completedPayload;
  }
  return {
    ...(completedPayload || {}),
    id: completedPayload?.id || `stream_${Date.now()}`,
    object: 'response',
    status: completedPayload?.status || 'completed',
    output: [
      ...(Array.isArray(completedPayload?.output) ? completedPayload.output : []),
      {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: outputText }],
      },
    ],
  };
}

function parseResponsesStream(text) {
  let eventName = '';
  let dataLines = [];
  let outputText = '';
  let completedPayload = null;

  const dispatch = () => {
    if (!dataLines.length) return;
    const rawData = dataLines.join('\n');
    const currentEvent = eventName;
    eventName = '';
    dataLines = [];
    if (!rawData || rawData === '[DONE]') return;
    let payload;
    try {
      payload = JSON.parse(rawData);
    } catch {
      return;
    }
    const type = payload?.type || currentEvent;
    if (type === 'response.output_text.delta' && typeof payload.delta === 'string') {
      outputText += payload.delta;
      return;
    }
    if (type === 'response.completed' || type === 'response.failed' || type === 'response.incomplete') {
      completedPayload = payload.response || payload;
    }
  };

  for (const line of text.split(/\r?\n/)) {
    if (!line) {
      dispatch();
      continue;
    }
    if (line.startsWith(':')) continue;
    if (line.startsWith('event:')) {
      eventName = line.slice('event:'.length).trim();
      continue;
    }
    if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).trimStart());
    }
  }
  dispatch();

  if (completedPayload && extractOutputText(completedPayload)) {
    return completedPayload;
  }
  return {
    ...(completedPayload || {}),
    id: completedPayload?.id || `stream_${Date.now()}`,
    object: 'response',
    status: completedPayload?.status || 'completed',
    output: [
      ...(Array.isArray(completedPayload?.output) ? completedPayload.output : []),
      {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: outputText }],
      },
    ],
  };
}

function extractOutputText(payload) {
  const output = Array.isArray(payload?.output) ? payload.output : [];
  const chunks = [];
  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const part of content) {
      if (typeof part?.text === 'string') chunks.push(part.text);
    }
  }
  return chunks.join('\n').trim();
}

function extractRecentActions(payload) {
  const output = Array.isArray(payload?.output) ? payload.output : [];
  const actions = [];
  const callNames = new Map();
  for (const item of output.slice(-12)) {
    if (item?.type === 'function_call') {
      const name = String(item.name || item?.function?.name || 'tool');
      const callId = String(item.call_id || item.id || item.callId || '');
      if (callId) callNames.set(callId, name);
      actions.push({
        kind: 'tool',
        name,
        summary: item.arguments ? String(item.arguments).slice(0, 180) : 'Tool call',
        status: 'pending',
      });
    } else if (item?.type === 'function_call_output') {
      const callId = String(item.call_id || item.id || item.callId || '');
      actions.push({
        kind: 'tool_result',
        name: callNames.get(callId) || String(item.name || callId || 'tool-result'),
        summary: typeof item.output === 'string' ? item.output.slice(0, 180) : 'Tool result',
        status: 'ok',
      });
    } else if (item?.type === 'message') {
      const text = extractOutputText({ output: [item] });
      if (text) {
        actions.push({
          kind: 'message',
          name: String(item.role || 'assistant'),
          summary: text.slice(0, 180),
          status: 'ok',
        });
      }
    }
  }
  return completePairedActions(actions).slice(-6);
}

function completePairedActions(actions) {
  const completed = actions.map((action) => ({ ...action }));
  const pendingToolIndexes = [];
  const pendingToolByName = new Map();
  completed.forEach((action, index) => {
    if (action.kind === 'tool') {
      if (action.status === 'pending') {
        pendingToolIndexes.push(index);
        pendingToolByName.set(action.name, index);
      }
      return;
    }
    if (action.kind !== 'tool_result') return;
    const toolIndex = pendingToolByName.get(action.name) ?? pendingToolIndexes[pendingToolIndexes.length - 1];
    if (toolIndex === undefined) return;
    completed[toolIndex].status = action.status === 'error' ? 'error' : 'ok';
    pendingToolByName.delete(completed[toolIndex].name);
    const stackIndex = pendingToolIndexes.lastIndexOf(toolIndex);
    if (stackIndex >= 0) pendingToolIndexes.splice(stackIndex, 1);
  });
  return completed;
}

function isRuntimeFailure(payload) {
  const status = String(payload?.status || '').toLowerCase();
  return ['failed', 'incomplete', 'error', 'cancelled', 'canceled'].includes(status);
}

function runtimeFailureMessage(result) {
  const status = String(result?.payload?.status || 'failed');
  const text = String(result?.outputText || '').trim();
  if (!text) return `Agent runtime returned ${status}.`;
  return text.length > 1000 ? `${text.slice(0, 1000).trimEnd()}\n\n[truncated]` : text;
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

function docker(args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn('docker', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolvePromise(stdout);
      else reject(new Error(stderr.trim() || `docker ${args.join(' ')} exited with ${code}`));
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

function localRunnerPath(runtimeProjectId, memberId, suffix) {
  const runnerSegment = useRunnerToken ? '/runner' : '';
  return `/projects/${encodeURIComponent(runtimeProjectId)}/agent-runtimes/${encodeURIComponent(memberId)}/local-runner${runnerSegment}/${suffix}`;
}

function freePort() {
  return new Promise((resolvePromise, reject) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => {
        if (typeof address === 'object' && address?.port) resolvePromise(address.port);
        else reject(new Error('Unable to allocate a runtime port'));
      });
    });
    server.on('error', reject);
  });
}

function safeJoin(root, relativePath) {
  const normalized = String(relativePath || '').replace(/\\/g, '/');
  if (!normalized || normalized.startsWith('/') || normalized.includes('\0') || normalized.split('/').includes('..')) {
    throw new Error(`Unsafe bundle file path: ${relativePath}`);
  }
  const target = resolve(root, normalized);
  if (!target.startsWith(resolve(root))) {
    throw new Error(`Bundle file escaped runtime dir: ${relativePath}`);
  }
  return target;
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;
    const [rawKey, inlineValue] = arg.slice(2).split('=', 2);
    const key = rawKey.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    if (inlineValue === undefined && (index + 1 >= argv.length || argv[index + 1].startsWith('--'))) {
      parsed[key] = true;
      continue;
    }
    parsed[key] = inlineValue ?? argv[index + 1];
    if (inlineValue === undefined) index += 1;
  }
  return parsed;
}

function optionValue(value, flag) {
  if (value === true) {
    fail(`Missing value for ${flag}. If you are on macOS/Linux, paste the macOS/Linux command, not the Windows PowerShell command.`);
  }
  return value;
}

function flagEnabled(value) {
  if (value === true) return true;
  if (value === undefined || value === null || value === false) return false;
  return /^(1|true|yes|on)$/i.test(String(value));
}

function trimSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

function slug(value) {
  return String(value || 'agent').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function defaultDataRoot() {
  if (process.platform === 'win32') {
    return resolve(process.env.LOCALAPPDATA || homedir(), 'AgentCraft', 'runtimes');
  }
  return resolve(homedir(), '.agentcraft', 'runtimes');
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
