import { appEnv } from './env';

const MCP_BASE = appEnv.mcpBaseUrl;

let sessionId: string | null = null;
let jsonRpcId = 0;
const MCP_ACCEPT_HEADER = 'application/json, text/event-stream';

function nextId(): number {
  return ++jsonRpcId;
}

function hasRpcPayload(msg: any): boolean {
  return !!msg && (
    Object.prototype.hasOwnProperty.call(msg, 'result')
    || Object.prototype.hasOwnProperty.call(msg, 'error')
  );
}

function parseSseJsonEnvelopes(raw: string): any[] {
  const lines = raw.split(/\r?\n/);
  let currentDataLines: string[] = [];
  const parsedMessages: any[] = [];

  const flush = () => {
    if (currentDataLines.length === 0) return;
    const payload = currentDataLines.join('\n').trim();
    currentDataLines = [];
    if (!payload) return;

    try {
      parsedMessages.push(JSON.parse(payload));
    } catch {
      // Ignore non-JSON event payloads.
    }
  };

  for (const line of lines) {
    if (line.startsWith('data:')) {
      currentDataLines.push(line.slice(5).trimStart());
      continue;
    }

    if (line.trim() === '') {
      flush();
    }
  }

  flush();
  return parsedMessages;
}

async function parseRpcEnvelope(res: Response, expectedId: number): Promise<any> {
  const contentType = (res.headers.get('content-type') || '').toLowerCase();

  if (contentType.includes('application/json')) {
    return res.json();
  }

  const raw = await res.text();
  if (!raw) return {};

  if (contentType.includes('text/event-stream')) {
    const messages = parseSseJsonEnvelopes(raw);
    if (messages.length > 0) {
      const exact = messages.find(
        (msg) => msg && msg.id === expectedId && hasRpcPayload(msg),
      );
      if (exact) return exact;

      const best = messages.find(
        (msg) => hasRpcPayload(msg),
      );
      if (best) return best;

      return messages[messages.length - 1];
    }
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`Unable to parse MCP response (${contentType || 'unknown'}): ${raw.slice(0, 200)}`);
  }
}

async function rpcRequest(method: string, params?: Record<string, unknown>): Promise<any> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: MCP_ACCEPT_HEADER,
  };

  if (sessionId) {
    headers['mcp-session-id'] = sessionId;
  }

  const requestId = nextId();

  const body: Record<string, unknown> = {
    jsonrpc: '2.0',
    id: requestId,
    method,
  };

  if (params !== undefined) {
    body.params = params;
  }

  const res = await fetch(MCP_BASE, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  const newSessionId = res.headers.get('mcp-session-id');
  if (newSessionId) {
    sessionId = newSessionId;
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MCP request failed (${res.status}): ${text}`);
  }

  const json = await parseRpcEnvelope(res, requestId);

  if (json.error) {
    throw new Error(json.error.message || 'MCP RPC error');
  }

  return json.result;
}

export async function initSession(): Promise<void> {
  sessionId = null;
  jsonRpcId = 0;

  await rpcRequest('initialize', {
    protocolVersion: '2025-03-26',
    capabilities: {},
    clientInfo: { name: 'agent-craft-ui-agent', version: '0.1.0' },
  });

  // Some MCP server implementations do not expose this method as RPC.
  // Treat "method not found" as non-fatal to keep session usable.
  try {
    await rpcRequest('notifications/initialized');
  } catch (err: any) {
    const message = err?.message || '';
    if (!/method not found/i.test(message)) {
      throw err;
    }
  }
}

export async function callTool(
  name: string,
  args: Record<string, unknown> = {},
): Promise<any> {
  const result = await rpcRequest('tools/call', { name, arguments: args });

  if (result?.isError) {
    const errorText =
      result.content?.[0]?.text || 'Unknown MCP tool error';
    throw new Error(errorText);
  }

  if (result?.content?.[0]?.text) {
    try {
      return JSON.parse(result.content[0].text);
    } catch {
      return result.content[0].text;
    }
  }

  return result;
}

export async function closeSession(): Promise<void> {
  if (!sessionId) return;

  try {
    const headers: Record<string, string> = {
      'mcp-session-id': sessionId,
      Accept: MCP_ACCEPT_HEADER,
    };
    await fetch(MCP_BASE, { method: 'DELETE', headers });
  } catch {
    // best effort
  }

  sessionId = null;
  jsonRpcId = 0;
}

export function isSessionActive(): boolean {
  return sessionId !== null;
}
