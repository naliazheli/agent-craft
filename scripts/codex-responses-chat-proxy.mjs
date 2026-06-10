#!/usr/bin/env node
import http from 'node:http';
import { randomUUID } from 'node:crypto';

const args = parseArgs(process.argv.slice(2));
const listen = optionValue(args.listen, '--listen') || process.env.CODEX_RESPONSES_CHAT_PROXY_LISTEN || '127.0.0.1:17896';
const upstreamBaseUrl = trimSlash(
  optionValue(args.upstream, '--upstream') ||
    process.env.CODEX_RESPONSES_CHAT_UPSTREAM ||
    'https://api.openai.com/v1',
);
const apiKeyEnv = optionValue(args.apiKeyEnv, '--api-key-env') || process.env.CODEX_RESPONSES_CHAT_API_KEY_ENV || 'MIMO_API_KEY';
const apiKey = optionValue(args.apiKey, '--api-key') || process.env[apiKeyEnv] || '';
const upstreamModel = optionValue(args.model, '--model') || process.env.CODEX_RESPONSES_CHAT_MODEL || '';
const debug = args.debug === true || process.env.CODEX_RESPONSES_CHAT_DEBUG === '1';

if (!apiKey) {
  fail(`Missing upstream API key. Set ${apiKeyEnv} or pass --api-key.`);
}

const { host, port } = parseListen(listen);
const server = http.createServer(async (request, response) => {
  try {
    if (request.method !== 'POST' || !request.url?.replace(/\?.*$/, '').endsWith('/responses')) {
      response.writeHead(404, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: { message: 'Not found' } }));
      return;
    }
    const body = await readBody(request);
    const payload = JSON.parse(body || '{}');
    const chatRequest = responsesRequestToChat(payload);
    if (debug) {
      console.error(
        JSON.stringify({
          model: chatRequest.model,
          messages: chatRequest.messages.length,
          tools: chatRequest.tools?.length || 0,
        }),
      );
    }
    const upstream = await fetch(`${upstreamBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(chatRequest),
    });
    const text = await upstream.text();
    if (!upstream.ok) {
      response.writeHead(502, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: { message: `Upstream ${upstream.status}: ${text.slice(0, 1000)}` } }));
      return;
    }
    const chat = JSON.parse(text || '{}');
    writeResponsesStream(response, payload, chat);
  } catch (error) {
    response.writeHead(500, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: { message: error?.message || String(error) } }));
  }
});

server.listen(port, host, () => {
  console.log(`Codex Responses-to-Chat proxy listening on http://${host}:${port}/v1`);
  console.log(`Forwarding to ${upstreamBaseUrl}/chat/completions with key env ${apiKeyEnv}`);
});

function responsesRequestToChat(payload) {
  const messages = [];
  if (payload.instructions) {
    messages.push({ role: 'system', content: String(payload.instructions) });
  }
  messages.push(...responsesInputToChatMessages(payload.input));
  const tools = (payload.tools || [])
    .filter((tool) => tool?.type === 'function' && tool.name)
    .map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description || '',
        parameters: tool.parameters || { type: 'object', properties: {} },
      },
    }));
  return {
    model: upstreamModel || payload.model,
    messages,
    ...(tools.length ? { tools, tool_choice: chatToolChoice(payload.tool_choice) } : {}),
    stream: false,
  };
}

function responsesInputToChatMessages(input) {
  if (typeof input === 'string') {
    return [{ role: 'user', content: input }];
  }
  if (!Array.isArray(input)) {
    return [];
  }
  const messages = [];
  for (const item of input) {
    if (!item || typeof item !== 'object') continue;
    if (item.type === 'message') {
      const role = item.role === 'developer' ? 'system' : item.role || 'user';
      messages.push({ role, content: contentToText(item.content) });
      continue;
    }
    if (item.type === 'function_call') {
      messages.push({
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: item.call_id || item.id || randomCallId(),
            type: 'function',
            function: {
              name: item.name || 'unknown',
              arguments: item.arguments || '{}',
            },
          },
        ],
      });
      continue;
    }
    if (item.type === 'function_call_output') {
      messages.push({
        role: 'tool',
        tool_call_id: item.call_id || item.id || randomCallId(),
        content: typeof item.output === 'string' ? item.output : JSON.stringify(item.output ?? ''),
      });
    }
  }
  return messages;
}

function contentToText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return content == null ? '' : String(content);
  return content
    .map((part) => {
      if (typeof part === 'string') return part;
      if (!part || typeof part !== 'object') return '';
      if (typeof part.text === 'string') return part.text;
      if (typeof part.input_text === 'string') return part.input_text;
      if (typeof part.output_text === 'string') return part.output_text;
      return '';
    })
    .filter(Boolean)
    .join('\n');
}

function chatToolChoice(toolChoice) {
  if (!toolChoice || toolChoice === 'auto' || toolChoice === 'none' || toolChoice === 'required') {
    return toolChoice || 'auto';
  }
  if (typeof toolChoice === 'object' && toolChoice.name) {
    return { type: 'function', function: { name: toolChoice.name } };
  }
  return 'auto';
}

function writeResponsesStream(response, requestPayload, chat) {
  const responseId = `resp_${randomUUID().replace(/-/g, '')}`;
  const createdAt = Math.floor(Date.now() / 1000);
  const base = {
    id: responseId,
    object: 'response',
    created_at: createdAt,
    model: requestPayload.model,
    parallel_tool_calls: false,
    tool_choice: requestPayload.tool_choice || 'auto',
    tools: requestPayload.tools || [],
    output: [],
  };
  const choice = chat.choices?.[0] || {};
  const message = choice.message || {};
  const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
  const outputItems = toolCalls.length
    ? toolCalls.map((call) => ({
        id: `fc_${randomUUID().replace(/-/g, '')}`,
        type: 'function_call',
        status: 'completed',
        call_id: call.id || randomCallId(),
        name: call.function?.name || call.name || 'unknown',
        arguments: call.function?.arguments || call.arguments || '{}',
      }))
    : [
        {
          id: `msg_${randomUUID().replace(/-/g, '')}`,
          type: 'message',
          status: 'completed',
          role: 'assistant',
          content: [{ type: 'output_text', text: message.content || '', annotations: [] }],
        },
      ];

  response.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  });
  sse(response, 'response.created', { response: { ...base, status: 'in_progress' } });
  sse(response, 'response.in_progress', { response: { ...base, status: 'in_progress' } });
  for (let index = 0; index < outputItems.length; index += 1) {
    const item = outputItems[index];
    if (item.type === 'function_call') {
      const started = { ...item, status: 'in_progress', arguments: '' };
      sse(response, 'response.output_item.added', { output_index: index, item: started });
      if (item.arguments) {
        sse(response, 'response.function_call_arguments.delta', {
          item_id: item.id,
          output_index: index,
          delta: item.arguments,
        });
      }
      sse(response, 'response.function_call_arguments.done', {
        item_id: item.id,
        output_index: index,
        arguments: item.arguments,
      });
      sse(response, 'response.output_item.done', { output_index: index, item });
      continue;
    }
    const text = item.content?.[0]?.text || '';
    sse(response, 'response.output_item.added', {
      output_index: index,
      item: { ...item, status: 'in_progress', content: [] },
    });
    sse(response, 'response.content_part.added', {
      item_id: item.id,
      output_index: index,
      content_index: 0,
      part: { type: 'output_text', text: '', annotations: [] },
    });
    if (text) {
      sse(response, 'response.output_text.delta', {
        item_id: item.id,
        output_index: index,
        content_index: 0,
        delta: text,
      });
    }
    sse(response, 'response.output_text.done', {
      item_id: item.id,
      output_index: index,
      content_index: 0,
      text,
    });
    sse(response, 'response.content_part.done', {
      item_id: item.id,
      output_index: index,
      content_index: 0,
      part: { type: 'output_text', text, annotations: [] },
    });
    sse(response, 'response.output_item.done', { output_index: index, item });
  }
  sse(response, 'response.completed', {
    response: {
      ...base,
      status: 'completed',
      output: outputItems,
      usage: chatUsageToResponsesUsage(chat.usage),
    },
  });
  response.write('data: [DONE]\n\n');
  response.end();
}

function chatUsageToResponsesUsage(usage) {
  return {
    input_tokens: usage?.prompt_tokens || 0,
    output_tokens: usage?.completion_tokens || 0,
    total_tokens: usage?.total_tokens || 0,
  };
}

function sse(response, event, data) {
  response.write(`event: ${event}\n`);
  response.write(`data: ${JSON.stringify({ type: event, ...data })}\n\n`);
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
    });
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;
    const [key, inline] = arg.slice(2).split('=', 2);
    parsed[toCamel(key)] = inline ?? (argv[index + 1]?.startsWith('--') ? true : argv[++index] ?? true);
  }
  return parsed;
}

function optionValue(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function parseListen(value) {
  const [hostPart, portPart] = String(value || '').split(':');
  const parsedPort = Number(portPart || hostPart);
  return {
    host: portPart ? hostPart : '127.0.0.1',
    port: Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 17896,
  };
}

function trimSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

function toCamel(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function randomCallId() {
  return `call_${randomUUID().replace(/-/g, '')}`;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
