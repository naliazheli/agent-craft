import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const port = Number(process.env.API_SERVER_PORT || 8642);
const host = process.env.API_SERVER_HOST || '0.0.0.0';
const apiKey = process.env.API_SERVER_KEY || '';
const dataRoot = process.env.HERMES_HOME || '/opt/data';

function json(res, status, body) {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function unauthorized(req) {
  if (!apiKey) return false;
  const header = req.headers.authorization || '';
  return header !== `Bearer ${apiKey}`;
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return fallback;
  }
}

async function readText(path, fallback = '') {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return fallback;
  }
}

function getYamlValue(yaml, key) {
  const pattern = new RegExp(`^\\s*${key}:\\s*(.+?)\\s*$`, 'm');
  const match = yaml.match(pattern);
  if (!match) return '';
  return match[1].replace(/^["']|["']$/g, '');
}

async function listSkills() {
  const root = join(dataRoot, 'skills');
  try {
    const entries = await readdir(root, { withFileTypes: true });
    const names = [];
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const skill = await readText(join(root, entry.name, 'SKILL.md'));
        if (skill.trim()) names.push(entry.name);
      }
    }
    return names.sort();
  } catch {
    return [];
  }
}

async function workspaceRequest(path, token, body) {
  const base = (process.env.AGENT_WORKSPACE_BASE_URL || '').replace(/\/+$/, '');
  if (!base || !token) {
    return { ok: false, skipped: true, message: 'workspace base URL or token missing' };
  }
  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  const payload = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, payload };
}

async function createPlannerArtifacts(context, input) {
  const token = context.workspaceToken || process.env.AGENT_WORKSPACE_TOKEN || '';
  const projectId = context.projectId || process.env.AGENT_WORKSPACE_PROJECT_ID || '';
  if (!projectId) return { created: [], errors: ['projectId missing'] };

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const created = [];
  const errors = [];
  const feature = await workspaceRequest(`/v1/projects/${projectId}/features`, token, {
    title: `Planner decomposition ${stamp}`,
    description: `Created by ${context.role || 'PLANNER_AGENT'} from message: ${input.slice(0, 240)}`,
    spec: {
      source: 'hermes-agent-smoke',
      skillRefs: context.skillBundleRefs || [],
    },
  });
  if (feature.ok) created.push(`feature:${feature.payload.featureId}`);
  else errors.push(`feature.create failed (${feature.status || 'skipped'}): ${JSON.stringify(feature.payload || feature.message)}`);

  const featureId = feature.payload?.featureId;
  const workItem = await workspaceRequest(`/v1/projects/${projectId}/work-items`, token, {
    featureId,
    title: `Draft planner task packets ${stamp}`,
    workType: 'PLANNING',
    description: 'Break the requested project goal into reviewable features, work items, and first task packets.',
    scopeBrief: input.slice(0, 1000),
    acceptanceCriteria: [
      'Features are reviewable independently.',
      'Work items include acceptance criteria and output contracts.',
      'Open owner/lead confirmation questions are listed separately.',
    ].join('\n'),
    inputPacket: {
      source: 'hermes-agent-smoke',
      message: input,
    },
    outputContract: {
      expected: ['features', 'workItems', 'taskPackets', 'confirmationQuestions'],
    },
  });
  if (workItem.ok) created.push(`workItem:${workItem.payload.workItemId}`);
  else errors.push(`workItem.create failed (${workItem.status || 'skipped'}): ${JSON.stringify(workItem.payload || workItem.message)}`);

  return { created, errors };
}

async function bodyText(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  if (url.pathname === '/health') {
    json(res, 200, { ok: true, service: 'hermes-agent-smoke' });
    return;
  }

  if (url.pathname === '/v1/models') {
    json(res, 200, {
      object: 'list',
      data: [{ id: process.env.API_SERVER_MODEL_NAME || 'hermes-agent-smoke', object: 'model' }],
    });
    return;
  }

  if (url.pathname === '/v1/responses' && req.method === 'POST') {
    if (unauthorized(req)) {
      json(res, 401, { error: { message: 'Unauthorized' } });
      return;
    }

    let payload = {};
    try {
      payload = JSON.parse(await bodyText(req));
    } catch {
      json(res, 400, { error: { message: 'Invalid JSON body' } });
      return;
    }

    const context = await readJson(join(dataRoot, 'AGENT_WORKSPACE_CONTEXT.json'), {});
    const configYaml = await readText(join(dataRoot, 'config.yaml'));
    const skills = await listSkills();
    const modelName = getYamlValue(configYaml, 'default') || process.env.API_SERVER_MODEL_NAME || 'unknown-model';
    const provider = getYamlValue(configYaml, 'provider') || process.env.HERMES_INFERENCE_PROVIDER || 'unknown-provider';
    const input = typeof payload.input === 'string' ? payload.input : JSON.stringify(payload.input || '');
    console.log(JSON.stringify({ event: 'message.received', projectId: context.projectId, role: context.role, input }));
    const actionResult = await createPlannerArtifacts(context, input).catch((error) => ({
      created: [],
      errors: [error?.message || 'workspace action failed'],
    }));

    const text = [
      `已启动本地 Docker agent smoke runtime。`,
      `项目: ${context.projectId || process.env.AGENT_WORKSPACE_PROJECT_ID || 'unknown'}`,
      `角色: ${context.role || process.env.AGENT_WORKSPACE_ROLE || 'unknown'}`,
      `授权 scopes: ${(context.scopes || []).join(', ') || 'none'}`,
      `已加载 skills: ${skills.join(', ') || 'none'}`,
      `大模型配置: ${provider} / ${modelName}`,
      '',
      `收到消息: ${input}`,
      '',
      `按当前角色和 skill 开始拆分任务:`,
      `1. 读取项目 brief、memory、events，确认目标和边界。`,
      `2. 将目标拆成 feature、work item、task packet，并标注验收标准。`,
      `3. 对需要 OWNER 或 LEAD_AGENT 决策的范围、预算、依赖提出确认项。`,
      `4. 生成可交给 WORKER_AGENT 执行的第一批任务包，并等待回执。`,
      '',
      actionResult.created.length ? `已写入 agent-workspace: ${actionResult.created.join(', ')}` : '未写入 agent-workspace。',
      actionResult.errors.length ? `写入错误: ${actionResult.errors.join('; ')}` : '',
    ].join('\n');

    json(res, 200, {
      id: `resp_${Date.now()}`,
      object: 'response',
      model: payload.model || 'hermes-agent',
      status: 'completed',
      output: [
        {
          id: `msg_${Date.now()}`,
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text }],
        },
      ],
    });
    return;
  }

  json(res, 404, { error: { message: 'Not found' } });
});

server.listen(port, host, () => {
  console.log(`hermes-agent-smoke listening on ${host}:${port}`);
});
