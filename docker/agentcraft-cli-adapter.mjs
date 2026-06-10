#!/usr/bin/env node
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const host = process.env.API_SERVER_HOST || '0.0.0.0';
const port = Number(process.env.API_SERVER_PORT || 8642);
const apiKey = process.env.API_SERVER_KEY || '';
const workspaceDir = process.env.AGENT_RUNTIME_WORKSPACE_DIR || '/opt/data/workspace';
const configuredTimeoutSeconds = Number(process.env.AGENTCRAFT_CLI_TIMEOUT_SECONDS || 0);
const timeoutMs = Number.isFinite(configuredTimeoutSeconds) && configuredTimeoutSeconds > 0
  ? configuredTimeoutSeconds * 1000
  : 0;
const maxOutputChars = Number(process.env.AGENTCRAFT_CLI_MAX_OUTPUT_CHARS || 18000);
const piSessionRoot = process.env.AGENTCRAFT_PI_SESSION_ROOT || '/opt/data/.pi/sessions';
const modelApiKey = process.env.AGENTCRAFT_MODEL_API_KEY || process.env.OPENAI_API_KEY || '';
const upstreamOpenAiBaseUrl = (
  process.env.AGENTCRAFT_UPSTREAM_OPENAI_BASE_URL ||
  process.env.OPENAI_BASE_URL ||
  process.env.OPENAI_API_BASE ||
  ''
).replace(/\/+$/, '');
const piBackend = String(process.env.AGENTCRAFT_PI_BACKEND || 'cli').trim().toLowerCase();
const piRpcCommand = process.env.AGENTCRAFT_PI_RPC_COMMAND || 'pi';
const piRpcSessions = new Map();

function responsePayload(text, status = 'completed') {
  return {
    id: `resp_${Date.now()}`,
    object: 'response',
    status,
    output: [
      {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: String(text || '').trim() }],
      },
    ],
  };
}

function limitText(text) {
  const value = String(text || '').trim();
  if (value.length <= maxOutputChars) return value;
  return `${value.slice(0, 3000).trimEnd()}\n\n[... output truncated by AgentCraft CLI adapter ...]\n\n${value.slice(-3000).trimStart()}`;
}

function extractMiniOutput(output) {
  const sections = String(output || '').split(/\n(?:\u2500|-){20,}\n/g);
  for (const section of sections.reverse()) {
    if (!section.includes('mini-swe-agent (step')) continue;
    if (section.includes('Tool call error:')) continue;
    let content = section.replace(/^[\s\S]*?mini-swe-agent \(step[^:]*\):\s*/, '').trim();
    if (content.includes('```')) content = content.split('```')[0].trim();
    if (section.includes('COMPLETE_TASK_AND_SUBMIT_FINAL_OUTPUT')) {
      const lowerContent = content.toLowerCase();
      if (content.length > 160 && !lowerContent.includes('submitting final output')) return content;
      continue;
    }
    const toolOutputs = [...section.matchAll(/<returncode>\s*0\s*<output>\s*([\s\S]*?)(?=\n\s*(?:Tool:|<exception_info>|Exit:|$))/g)]
      .map((match) => match[1].trim())
      .filter((value) => value && value !== 'COMPLETE_TASK_AND_SUBMIT_FINAL_OUTPUT');
    if (toolOutputs.length) return toolOutputs.at(-1);
    if (content) return content;
  }
  return '';
}

function extractText(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value.map(extractText).filter(Boolean).join('\n');
  }
  if (value && typeof value === 'object') {
    return extractText(value.content || value.text || '');
  }
  return '';
}

function extractAssistantText(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') return item;
        if (!item || typeof item !== 'object') return '';
        if (item.type && item.type !== 'text') return '';
        if (typeof item.text === 'string') return item.text;
        if (typeof item.content === 'string') return item.content;
        return '';
      })
      .filter(Boolean)
      .join('');
  }
  if (value && typeof value === 'object') {
    return extractAssistantText(value.content || value.text || '');
  }
  return '';
}

function piJsonMessageId(event, state) {
  return String(
    event?.message?.id ||
    event?.message?.responseId ||
    event?.responseId ||
    event?.id ||
    state.currentAssistantId ||
    `assistant-${state.nextAssistantIndex}`,
  );
}

function shellQuote(value) {
  return `'${String(value || '').replace(/'/g, "'\"'\"'")}'`;
}

function redactSensitiveText(value) {
  return String(value || '')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[redacted-runtime-token]')
    .replace(/(Authorization:\s*Bearer\s+)(?!\$)[^\s"'\\]+/gi, '$1[redacted]')
    .replace(/(export\s+(?:AGENT_WORKSPACE_TOKEN|AIFACTORY_RUNTIME_TOKEN)=)["'][^"']*["']/g, '$1"[redacted]"');
}

function redactSensitivePayload(value) {
  if (typeof value === 'string') return redactSensitiveText(value);
  if (Array.isArray(value)) return value.map(redactSensitivePayload);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactSensitivePayload(item)]));
  }
  return value;
}

function commandTemplateUsesPiJsonMode() {
  return process.env.AGENTCRAFT_AGENT_TYPE === 'pi' &&
    /(?:^|\s)--mode\s+json(?:\s|$)/.test(process.env.AGENTCRAFT_CLI_COMMAND_TEMPLATE || '');
}

function usePiRpcBackend() {
  return process.env.AGENTCRAFT_AGENT_TYPE === 'pi' && piBackend === 'rpc';
}

function stableHash(value) {
  return createHash('sha256').update(String(value || '')).digest('hex');
}

function splitShellWords(value) {
  const input = String(value || '').trim();
  if (!input) return [];
  const words = [];
  let current = '';
  let quote = '';
  let escaping = false;
  for (const char of input) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }
    if (char === '\\') {
      escaping = true;
      continue;
    }
    if (quote) {
      if (char === quote) {
        quote = '';
      } else {
        current += char;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        words.push(current);
        current = '';
      }
      continue;
    }
    current += char;
  }
  if (escaping) current += '\\';
  if (current) words.push(current);
  return words;
}

function piRpcArgs(context, instructions) {
  const args = [
    '--mode',
    'rpc',
    '--session-dir',
    context.sessionDir,
    '--session',
    context.sessionFile,
    '--provider',
    process.env.AGENTCRAFT_PI_PROVIDER || 'agentcraft',
    '--model',
    process.env.API_SERVER_MODEL_NAME || 'agentcraft-model',
    ...splitShellWords(process.env.AGENTCRAFT_PI_EXTRA_ARGS || ''),
  ];
  if (instructions) args.push('--append-system-prompt', instructions);
  return args;
}

function applyPiJsonEventToState(event, state) {
  const message = event?.message;
  if (!message || message.role !== 'assistant') return;
  const type = String(event?.type || '');
  if (!['message', 'message_start', 'message_update', 'message_end', 'turn_end'].includes(type)) return;
  const errorMessage = (
    message?.errorMessage ||
    event?.errorMessage ||
    message?.error?.message ||
    event?.error?.message ||
    ''
  ).toString().trim();
  const stopReason = String(message?.stopReason || event?.stopReason || '').toLowerCase();
  if ((errorMessage || stopReason === 'error') && Array.isArray(state.errorMessages)) {
    const value = errorMessage || 'Pi model response failed.';
    if (!state.errorMessages.includes(value)) state.errorMessages.push(value);
  }
  const id = piJsonMessageId(event, state);
  if (!state.messageOrder.includes(id)) {
    state.messageOrder.push(id);
    state.nextAssistantIndex += 1;
  }
  state.currentAssistantId = id;
  const text = extractAssistantText(message.content).trim();
  if (text) state.assistantMessages.set(id, text);
}

function piJsonVisibleText(state) {
  return state.messageOrder
    .map((id) => state.assistantMessages.get(id))
    .filter(Boolean)
    .join('\n\n')
    .trim();
}

function createPiJsonProgressParser(onProgress) {
  const state = {
    buffer: '',
    currentAssistantId: '',
    nextAssistantIndex: 0,
    messageOrder: [],
    assistantMessages: new Map(),
    errorMessages: [],
    lastVisibleText: '',
  };

  const consumeLine = (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let event;
    try {
      event = JSON.parse(trimmed);
    } catch {
      return;
    }
    applyPiJsonEventToState(event, state);
    const visibleText = piJsonVisibleText(state);
    if (visibleText && visibleText !== state.lastVisibleText) {
      state.lastVisibleText = visibleText;
      onProgress(visibleText);
    }
  };

  return {
    push(chunk) {
      state.buffer += chunk;
      const lines = state.buffer.split(/\r?\n/);
      state.buffer = lines.pop() || '';
      lines.forEach(consumeLine);
    },
    finish() {
      if (state.buffer.trim()) {
        consumeLine(state.buffer);
      }
      state.buffer = '';
      return state.lastVisibleText;
    },
  };
}

class PiRpcSession {
  constructor(context, instructions) {
    this.context = context;
    this.instructionsHash = stableHash(instructions);
    this.buffer = '';
    this.pendingResponses = new Map();
    this.waiters = [];
    this.currentState = this.createEventState();
    this.lastVisibleText = '';
    this.isStreaming = false;
    this.stderr = '';
    this.child = spawn(piRpcCommand, piRpcArgs(context, instructions), {
      cwd: workspaceDir,
      env: {
        ...process.env,
        AGENTCRAFT_RUNTIME_ID: context.runtimeId,
        AGENTCRAFT_CONVERSATION_ID: context.conversationId,
        AGENTCRAFT_PI_SESSION_DIR: context.sessionDir,
        AGENTCRAFT_PI_SESSION_FILE: context.sessionFile,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data', (chunk) => this.consumeStdout(chunk));
    this.child.stderr.setEncoding('utf8');
    this.child.stderr.on('data', (chunk) => {
      this.stderr = `${this.stderr}${chunk}`.slice(-12000);
    });
    this.child.on('error', (error) => this.failAll(error));
    this.child.on('close', (code, signal) => {
      this.failAll(new Error(`Pi RPC process exited with ${code ?? signal ?? 'unknown'}${this.stderr ? `: ${this.stderr.trim()}` : ''}`));
    });
  }

  createEventState() {
    return {
      currentAssistantId: '',
      nextAssistantIndex: 0,
      messageOrder: [],
      assistantMessages: new Map(),
      errorMessages: [],
    };
  }

  close() {
    this.failAll(new Error('Pi RPC session was replaced'));
    this.child.kill('SIGTERM');
  }

  failAll(error) {
    for (const pending of this.pendingResponses.values()) pending.reject(error);
    this.pendingResponses.clear();
    for (const waiter of this.waiters) waiter.reject(error);
    this.waiters = [];
  }

  consumeStdout(chunk) {
    this.buffer += chunk;
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';
    for (const line of lines) this.consumeLine(line.endsWith('\r') ? line.slice(0, -1) : line);
  }

  consumeLine(line) {
    if (!line.trim()) return;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      return;
    }
    if (event?.type === 'response' && event?.id && this.pendingResponses.has(event.id)) {
      const pending = this.pendingResponses.get(event.id);
      this.pendingResponses.delete(event.id);
      if (event.success === false) {
        pending.reject(new Error(event.error || event.message || `Pi RPC ${event.command || 'command'} failed`));
      } else {
        pending.resolve(event);
      }
      return;
    }
    this.consumeEvent(event);
  }

  consumeEvent(event) {
    if (event?.type === 'agent_start') {
      this.isStreaming = true;
      this.currentState = this.createEventState();
      this.lastVisibleText = '';
      return;
    }
    if (event?.type === 'message_update' || event?.type === 'message_start' || event?.type === 'message_end' || event?.type === 'turn_end') {
      applyPiJsonEventToState(event, this.currentState);
      const visibleText = piJsonVisibleText(this.currentState);
      if (visibleText && visibleText !== this.lastVisibleText) {
        this.lastVisibleText = visibleText;
        for (const waiter of this.waiters) waiter.onProgress?.(visibleText);
      }
      return;
    }
    if (event?.type === 'agent_end') {
      if (Array.isArray(event.messages)) {
        for (const message of event.messages) {
          if (message?.role === 'assistant') {
            applyPiJsonEventToState({ type: 'message_end', message }, this.currentState);
          }
        }
      }
      this.isStreaming = false;
      const text = piJsonVisibleText(this.currentState) || this.lastVisibleText;
      const error = this.currentState.errorMessages.join('\n').trim();
      const waiters = this.waiters;
      this.waiters = [];
      for (const waiter of waiters) {
        if (error) {
          waiter.reject(new Error(error));
        } else {
          waiter.resolve(responsePayload(limitText(text || 'Agent command completed without output.')));
        }
      }
    }
  }

  send(command) {
    const id = command.id || `agentcraft-${randomUUID()}`;
    const payload = { ...command, id };
    return new Promise((resolve, reject) => {
      this.pendingResponses.set(id, { resolve, reject });
      this.child.stdin.write(`${JSON.stringify(payload)}\n`, (error) => {
        if (!error) return;
        this.pendingResponses.delete(id);
        reject(error);
      });
    });
  }

  async prompt(prompt, options = {}) {
    const command = this.isStreaming || options.streamingBehavior === 'steer'
      ? { type: 'prompt', message: prompt, streamingBehavior: 'steer' }
      : { type: 'prompt', message: prompt };
    let waiterRecord;
    let timer = null;
    const waiter = new Promise((resolve, reject) => {
      const cleanup = () => {
        if (timer) clearTimeout(timer);
        timer = null;
      };
      waiterRecord = {
        resolve: (value) => {
          cleanup();
          resolve(value);
        },
        reject: (error) => {
          cleanup();
          reject(error);
        },
        onProgress: options.onProgress,
      };
      this.waiters.push(waiterRecord);
      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          this.waiters = this.waiters.filter((item) => item !== waiterRecord);
          this.send({ type: 'abort' }).catch(() => undefined);
          reject(new Error(`Agent command timed out after ${timeoutMs / 1000} seconds.`));
        }, timeoutMs);
      }
    });
    try {
      await this.send(command);
    } catch (error) {
      if (timer) clearTimeout(timer);
      timer = null;
      this.waiters = this.waiters.filter((item) => item !== waiterRecord);
      throw error;
    }
    return waiter;
  }
}

function piRpcSessionKey(context) {
  return context.sessionFile;
}

function getPiRpcSession(context, instructions) {
  const key = piRpcSessionKey(context);
  const instructionsHash = stableHash(instructions);
  const existing = piRpcSessions.get(key);
  if (existing && existing.instructionsHash === instructionsHash) return existing;
  if (existing) existing.close();
  const session = new PiRpcSession(context, instructions);
  piRpcSessions.set(key, session);
  return session;
}

async function runPiRpcAgent(prompt, context, options = {}) {
  await mkdir(workspaceDir, { recursive: true });
  await mkdir(context.sessionDir, { recursive: true });
  const session = getPiRpcSession(context, options.instructions || '');
  return session.prompt(prompt, {
    streamingBehavior: options.streamingBehavior,
    onProgress: options.onProgress
      ? (text) => options.onProgress(redactSensitiveText(limitText(text)))
      : undefined,
  });
}

function createPiSessionFileTailer(sessionFile, progressParser) {
  if (!sessionFile || !progressParser) return null;
  let offset = 0;
  let stopped = false;
  let polling = false;

  const poll = async () => {
    if (stopped || polling) return;
    polling = true;
    try {
      const content = await readFile(sessionFile, 'utf8');
      if (content.length < offset) offset = 0;
      if (content.length > offset) {
        const chunk = content.slice(offset);
        offset = content.length;
        progressParser.push(chunk);
      }
    } catch {
      // pi creates the session file lazily; absence during startup is expected.
    } finally {
      polling = false;
    }
  };

  const interval = setInterval(() => {
    poll().catch(() => undefined);
  }, Number(process.env.AGENTCRAFT_PI_SESSION_POLL_MS || 1000));
  poll().catch(() => undefined);

  return {
    async stop() {
      stopped = true;
      clearInterval(interval);
      await poll().catch(() => undefined);
    },
  };
}

function extractPiJsonSummary(output) {
  const state = {
    currentAssistantId: '',
    nextAssistantIndex: 0,
    messageOrder: [],
    assistantMessages: new Map(),
    errorMessages: [],
  };
  for (const line of String(output || '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      applyPiJsonEventToState(JSON.parse(line), state);
    } catch {
      // Ignore non-event output mixed into the stream.
    }
  }
  return {
    text: piJsonVisibleText(state),
    error: state.errorMessages.join('\n').trim(),
  };
}

function extractPiJsonOutput(output) {
  return extractPiJsonSummary(output).text;
}

function cleanAgentOutput(output, code = 0) {
  if (['1', 'true', 'yes'].includes(String(process.env.AGENTCRAFT_RAW_CLI_OUTPUT || '').toLowerCase())) {
    return limitText(output);
  }
  if (commandTemplateUsesPiJsonMode()) {
    const extracted = extractPiJsonOutput(output);
    return extracted ? limitText(extracted) : '';
  }
  if (process.env.AGENTCRAFT_AGENT_TYPE === 'mini-swe-agent') {
    const extracted = extractMiniOutput(output);
    if (extracted) return limitText(extracted);
  }
  if (code) return limitText(output);
  return limitText(output);
}

function templatePassesPromptViaArgument(template) {
  return /\$(?:\{AGENTCRAFT_TASK(?:_QUOTED)?\}|AGENTCRAFT_TASK(?:_QUOTED)?\b)/.test(String(template || ''));
}

function safePathSegment(value, fallback) {
  const safe = String(value || '')
    .trim()
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 160);
  return safe || fallback;
}

function agentcraftRuntimeContext(payload) {
  const agentcraft = payload?.agentcraft && typeof payload.agentcraft === 'object' ? payload.agentcraft : {};
  const runtimeId = safePathSegment(agentcraft.runtimeId || process.env.AGENT_WORKSPACE_RUNTIME_ID || 'runtime', 'runtime');
  const rawConversationId =
    agentcraft.conversationId ||
    payload?.conversation ||
    agentcraft.activeConversationId ||
    `default-${runtimeId}`;
  const conversationId = safePathSegment(rawConversationId, `default-${runtimeId}`);
  const sessionDir = join(piSessionRoot, runtimeId);
  const sessionFile = join(sessionDir, `${conversationId}.jsonl`);
  return {
    runtimeId,
    conversationId,
    sessionDir,
    sessionFile,
  };
}

function commandFromTemplate(prompt, context, options = {}) {
  const template = (process.env.AGENTCRAFT_CLI_COMMAND_TEMPLATE || '').trim();
  if (!template) {
    return {
      command: '/bin/sh',
      args: ['-lc', `printf '%s\\n' ${shellQuote(prompt)}`],
      stdin: '',
    };
  }
  const instructions = options.instructions || '';
  const env = {
    ...process.env,
    AGENTCRAFT_RUNTIME_ID: context.runtimeId,
    AGENTCRAFT_CONVERSATION_ID: context.conversationId,
    AGENTCRAFT_PI_SESSION_DIR: context.sessionDir,
    AGENTCRAFT_PI_SESSION_FILE: context.sessionFile,
    AGENTCRAFT_TASK: prompt,
    AGENTCRAFT_TASK_QUOTED: shellQuote(prompt),
    AGENTCRAFT_INSTRUCTIONS: instructions,
    AGENTCRAFT_INSTRUCTIONS_QUOTED: shellQuote(instructions),
    AGENTCRAFT_INSTRUCTIONS_ARG: instructions ? `--append-system-prompt ${shellQuote(instructions)}` : '',
  };
  let expanded = template.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-[^}]*)?\}|\$([A-Za-z_][A-Za-z0-9_]*)/g, (match, bracedKey, bareKey) => {
    const key = bracedKey || bareKey;
    return Object.prototype.hasOwnProperty.call(env, key) ? String(env[key]) : match;
  });
  expanded = `if [ -f /opt/data/AGENT_WORKSPACE_RUNTIME.env ]; then . /opt/data/AGENT_WORKSPACE_RUNTIME.env; fi; ${expanded}`;
  return {
    command: '/bin/sh',
    args: ['-lc', expanded],
    stdin: templatePassesPromptViaArgument(template) ? '' : prompt,
  };
}

async function runAgent(prompt, context, options = {}) {
  await mkdir(workspaceDir, { recursive: true });
  await mkdir(context.sessionDir, { recursive: true });
  const { command, args, stdin } = commandFromTemplate(prompt, context, options);
  return await new Promise((resolve) => {
    let settled = false;
    const finish = (payload) => {
      if (settled) return;
      settled = true;
      resolve(payload);
    };
    const progressParser = commandTemplateUsesPiJsonMode() && options.onProgress
      ? createPiJsonProgressParser((text) => options.onProgress(redactSensitiveText(limitText(text))))
      : null;
    const progressTailer = commandTemplateUsesPiJsonMode()
      ? createPiSessionFileTailer(context.sessionFile, progressParser)
      : null;
    const child = spawn(command, args, {
      cwd: workspaceDir,
      env: {
        ...process.env,
        AGENTCRAFT_RUNTIME_ID: context.runtimeId,
        AGENTCRAFT_CONVERSATION_ID: context.conversationId,
        AGENTCRAFT_PI_SESSION_DIR: context.sessionDir,
        AGENTCRAFT_PI_SESSION_FILE: context.sessionFile,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let output = '';
    const timer = timeoutMs > 0
      ? setTimeout(() => {
          child.kill('SIGTERM');
          finish(responsePayload(`Agent command timed out after ${timeoutMs / 1000} seconds.`, 'failed'));
        }, timeoutMs)
      : null;
    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      output += text;
      if (!settled) progressParser?.push(text);
    });
    child.stderr.on('data', (chunk) => {
      output += chunk.toString();
    });
    child.on('close', async (code) => {
      if (timer) clearTimeout(timer);
      if (settled) return;
      await progressTailer?.stop();
      progressParser?.finish();
      let finalOutput = output;
      if (commandTemplateUsesPiJsonMode()) {
        const sessionOutput = await readFile(context.sessionFile, 'utf8').catch(() => '');
        if (sessionOutput.trim()) finalOutput = `${output}\n${sessionOutput}`;
      }
      const piSummary = commandTemplateUsesPiJsonMode() ? extractPiJsonSummary(finalOutput) : null;
      const cleanedOutput = piSummary?.text ? limitText(piSummary.text) : cleanAgentOutput(finalOutput, code);
      if (code) {
        finish(responsePayload(`Agent command exited with ${code}.\n\n${cleanedOutput}`, 'failed'));
      } else if (piSummary?.error) {
        finish(responsePayload(
          [cleanedOutput, `Pi model error: ${piSummary.error}`].filter(Boolean).join('\n\n'),
          'failed',
        ));
      } else if (!cleanedOutput && process.env.AGENTCRAFT_AGENT_TYPE === 'pi') {
        finish(responsePayload(
          'Model API service returned an empty streaming response. Check the local model API configured in AGENTCRAFT_UPSTREAM_OPENAI_BASE_URL; the agent did not receive any model output.',
          'failed',
        ));
      } else {
        finish(responsePayload(cleanedOutput || 'Agent command completed without output.'));
      }
    });
    child.stdin.end(stdin);
  });
}

function writeJson(res, status, payload) {
  const body = Buffer.from(JSON.stringify(payload));
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': body.length,
  });
  res.end(body);
}

function writeSse(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function writeResponsesStreamStart(res) {
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
  });
  res.write(': stream-start\n\n');
}

function startResponsesKeepalive(res) {
  const intervalMs = Number(process.env.AGENTCRAFT_SSE_KEEPALIVE_MS || 15000);
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) return null;
  return setInterval(() => {
    if (!res.writableEnded) res.write(': keepalive\n\n');
  }, intervalMs);
}

function writeResponsesDelta(res, delta) {
  if (!delta) return;
  writeSse(res, {
    type: 'response.output_text.delta',
    delta,
  });
}

function writeResponsesComplete(res, payload) {
  writeSse(res, {
    type: payload.status === 'failed' ? 'response.failed' : 'response.completed',
    response: payload,
  });
  res.write('data: [DONE]\n\n');
  res.end();
}

function upstreamChatCompletionsUrl() {
  if (!upstreamOpenAiBaseUrl) return '';
  return `${upstreamOpenAiBaseUrl}/chat/completions`;
}

function hasAuthorizedModelProxyRequest(req) {
  if (!modelApiKey) return false;
  return req.headers.authorization === `Bearer ${modelApiKey}`;
}

async function readRequestJson(req) {
  return await new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('error', reject);
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
  });
}

function chatCompletionId(payload) {
  return typeof payload?.id === 'string' && payload.id ? payload.id : `chatcmpl-agentcraft-${Date.now()}`;
}

function chatCompletionModel(requestPayload, chunkPayload) {
  return (
    (typeof chunkPayload?.model === 'string' && chunkPayload.model) ||
    (typeof requestPayload?.model === 'string' && requestPayload.model) ||
    'agentcraft-model'
  );
}

async function proxyOpenAiChatCompletions(req, res) {
  if (!hasAuthorizedModelProxyRequest(req)) {
    writeJson(res, 401, { error: { message: 'unauthorized' } });
    return;
  }
  const target = upstreamChatCompletionsUrl();
  if (!target) {
    writeJson(res, 500, { error: { message: 'OPENAI_BASE_URL is not configured for the model proxy' } });
    return;
  }

  const requestPayload = redactSensitivePayload(await readRequestJson(req));
  const upstreamResponse = await fetch(target, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${modelApiKey}`,
    },
    body: JSON.stringify(requestPayload),
  });

  const contentType = upstreamResponse.headers.get('content-type') || '';
  if (!upstreamResponse.ok) {
    const text = await upstreamResponse.text().catch(() => upstreamResponse.statusText);
    writeJson(res, upstreamResponse.status, { error: { message: text || upstreamResponse.statusText } });
    return;
  }

  if (!requestPayload.stream || !contentType.includes('text/event-stream')) {
    const text = await upstreamResponse.text();
    res.writeHead(upstreamResponse.status, {
      'content-type': contentType || 'application/json',
      'content-length': Buffer.byteLength(text),
    });
    res.end(text);
    return;
  }

  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
  });

  const reader = upstreamResponse.body?.getReader();
  if (!reader) {
    const fallback = {
      id: `chatcmpl-agentcraft-${Date.now()}`,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: chatCompletionModel(requestPayload),
      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
    };
    writeSse(res, fallback);
    res.write('data: [DONE]\n\n');
    res.end();
    return;
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let eventName = '';
  let dataLines = [];
  let sawDone = false;
  let sawFinishReason = false;
  let lastChunk = null;

  const injectFinishIfNeeded = () => {
    if (sawFinishReason) return;
    const finishChunk = {
      id: chatCompletionId(lastChunk),
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: chatCompletionModel(requestPayload, lastChunk),
      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
    };
    writeSse(res, finishChunk);
    sawFinishReason = true;
  };

  const dispatchEvent = () => {
    if (!dataLines.length) return;
    const rawData = dataLines.join('\n');
    const currentEvent = eventName;
    eventName = '';
    dataLines = [];
    if (!rawData) return;
    if (rawData === '[DONE]') {
      injectFinishIfNeeded();
      res.write('data: [DONE]\n\n');
      sawDone = true;
      return;
    }
    let payload = null;
    try {
      payload = JSON.parse(rawData);
    } catch {
      res.write(`${currentEvent ? `event: ${currentEvent}\n` : ''}data: ${rawData}\n\n`);
      return;
    }
    lastChunk = payload;
    if (Array.isArray(payload?.choices) && payload.choices.some((choice) => choice?.finish_reason)) {
      sawFinishReason = true;
    }
    if (currentEvent) res.write(`event: ${currentEvent}\n`);
    writeSse(res, payload);
  };

  const consumeLine = (line) => {
    if (!line) {
      dispatchEvent();
      return;
    }
    if (line.startsWith(':')) {
      res.write(`${line}\n`);
      return;
    }
    if (line.startsWith('event:')) {
      eventName = line.slice('event:'.length).trim();
      return;
    }
    if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).trimStart());
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';
    for (const line of lines) consumeLine(line);
  }
  buffer += decoder.decode();
  if (buffer) consumeLine(buffer);
  dispatchEvent();
  if (!sawDone) {
    injectFinishIfNeeded();
    res.write('data: [DONE]\n\n');
  }
  res.end();
}

function closePiRpcSessions() {
  for (const session of piRpcSessions.values()) {
    session.close();
  }
  piRpcSessions.clear();
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    closePiRpcSessions();
    process.exit(0);
  });
}

createServer(async (req, res) => {
  if (req.method === 'GET' && req.url.replace(/\/+$/, '') === '/health') {
    writeJson(res, 200, { ok: true, service: 'agentcraft-cli-adapter' });
    return;
  }
  if (req.method === 'POST' && req.url.replace(/\/+$/, '') === '/v1/chat/completions') {
    try {
      await proxyOpenAiChatCompletions(req, res);
    } catch (error) {
      const message = `AgentCraft model proxy error: ${error?.message || error}`;
      if (res.headersSent) {
        if (!res.writableEnded) {
          res.write(`data: ${JSON.stringify({ error: { message } })}\n\n`);
          res.write('data: [DONE]\n\n');
          res.end();
        }
      } else {
        writeJson(res, 500, { error: { message } });
      }
    }
    return;
  }
  if (req.method !== 'POST' || req.url.replace(/\/+$/, '') !== '/v1/responses') {
    writeJson(res, 404, { error: 'not found' });
    return;
  }
  if (apiKey && req.headers.authorization !== `Bearer ${apiKey}`) {
    writeJson(res, 401, { error: 'unauthorized' });
    return;
  }
  let body = '';
  req.setEncoding('utf8');
  req.on('data', (chunk) => {
    body += chunk;
  });
  req.on('end', async () => {
    try {
      const payload = body ? JSON.parse(body) : {};
      const userInput = (extractText(payload.agentcraft?.currentUserMessage).trim() || extractText(payload.input).trim());
      const instructions = extractText(payload.instructions).trim();
      const includeInstructions = ['1', 'true', 'yes'].includes(String(process.env.AGENTCRAFT_INCLUDE_RESPONSE_INSTRUCTIONS || '').toLowerCase());
      const passInstructionsSeparately =
        includeInstructions && instructions && process.env.AGENTCRAFT_AGENT_TYPE === 'pi';
      const prompt = (
        passInstructionsSeparately
          ? userInput || instructions
          : includeInstructions
            ? [instructions, userInput].filter(Boolean).join('\n\n')
            : userInput || instructions
      ).trim();
      if (!prompt) {
        writeJson(res, 400, responsePayload('No input prompt was provided.', 'failed'));
        return;
      }
      const runOptions = {
        instructions: passInstructionsSeparately ? instructions : '',
        streamingBehavior: payload.agentcraft?.streamingBehavior || payload.agentcraft?.delivery || '',
      };
      const runBackend = usePiRpcBackend() ? runPiRpcAgent : runAgent;
      if (payload.stream) {
        writeResponsesStreamStart(res);
        const keepalive = startResponsesKeepalive(res);
        let lastProgressText = '';
        try {
          const result = await runBackend(prompt, agentcraftRuntimeContext(payload), {
            ...runOptions,
            onProgress: (text) => {
              if (res.writableEnded) return;
              const delta = text.startsWith(lastProgressText)
                ? text.slice(lastProgressText.length)
                : `\n\n${text}`;
              lastProgressText = text;
              writeResponsesDelta(res, delta);
            },
          });
          const finalText = extractText(result.output).trim();
          if (finalText && finalText !== lastProgressText) {
            const delta = finalText.startsWith(lastProgressText)
              ? finalText.slice(lastProgressText.length)
              : `\n\n${finalText}`;
            writeResponsesDelta(res, delta);
          }
          writeResponsesComplete(res, result);
        } finally {
          if (keepalive) clearInterval(keepalive);
        }
        return;
      }
      writeJson(
        res,
        200,
        await runBackend(prompt, agentcraftRuntimeContext(payload), runOptions),
      );
    } catch (error) {
      const payload = responsePayload(`Agent adapter error: ${error?.message || error}`, 'failed');
      if (res.headersSent) {
        if (!res.writableEnded) writeResponsesComplete(res, payload);
      } else {
        writeJson(res, 500, payload);
      }
    }
  });
}).listen(port, host, () => {
  console.log(`agentcraft-cli-adapter listening on ${host}:${port}`);
});
