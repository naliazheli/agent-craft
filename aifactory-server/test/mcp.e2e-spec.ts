import { INestApplication } from '@nestjs/common';
import { AddressInfo } from 'node:net';
import { Server } from 'node:http';
import { Express } from 'express';
import * as request from 'supertest';
import { cleanDatabase, createTestApp } from './setup';
import { PrismaService } from '../src/prisma/prisma.service';
import { GithubService } from '../src/github/github.service';

interface JsonRpcEnvelope {
  jsonrpc: string;
  id?: number | string | null;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

type JsonRpcRequestBody = {
  jsonrpc: string;
  id?: number | string;
  method: string;
  params?: Record<string, unknown>;
};

describe('MCP (e2e)', () => {
  let apiApp: INestApplication;
  let mcpServer: Server;
  let mcpBaseUrl: string;
  let shutdownMcpSessions: () => Promise<void>;
  let rpcId = 1;
  let userSequence = 0;

  beforeEach(async () => {
    apiApp = await createTestApp();
    await cleanDatabase(apiApp);
    await apiApp.listen(0);

    const apiAddress = apiApp.getHttpServer().address() as AddressInfo;
    process.env.AIFACTORY_API_BASE_URL = `http://127.0.0.1:${apiAddress.port}/api`;
    process.env.MCP_AUTH_TOKEN = '';

    const mcpModule = await import('../src/mcp/mcp-server');
    const mcpApp: Express = mcpModule.createMcpTestApp();
    shutdownMcpSessions = mcpModule.shutdownMcpSessions;

    mcpServer = mcpApp.listen(0);
    await new Promise<void>((resolve) => mcpServer.once('listening', () => resolve()));

    const mcpAddress = mcpServer.address() as AddressInfo;
    mcpBaseUrl = `http://127.0.0.1:${mcpAddress.port}`;
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await shutdownMcpSessions();
    await new Promise<void>((resolve) => mcpServer.close(() => resolve()));
    await apiApp.close();
  });

  async function registerUser(email: string, displayName: string) {
    const password = 'password123';
    const res = await request(apiApp.getHttpServer())
      .post('/api/auth/register')
      .send({ email, password, displayName })
      .expect(201);

    return {
      email,
      password,
      token: res.body.access_token as string,
      id: res.body.user.id as string,
    };
  }

  function uniqueEmail(prefix: string) {
    userSequence += 1;
    return `${prefix}-${Date.now()}-${userSequence}@example.com`;
  }

  async function createTask(creatorToken: string) {
    const res = await request(apiApp.getHttpServer())
      .post('/api/tasks')
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({
        title: 'MCP E2E Task',
        description: 'Task created for MCP end-to-end test',
        reward: 1,
        tags: ['mcp', 'e2e'],
      })
      .expect(201);

    return res.body.id as string;
  }

  async function createGithubTask(creatorToken: string) {
    const res = await request(apiApp.getHttpServer())
      .post('/api/tasks')
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({
        title: 'MCP GitHub Task',
        description: 'Fix GitHub issue through PR',
        reward: 2,
        taskSource: 'GITHUB_ISSUE',
        sourceUrl: 'https://github.com/naliazheli/world-test/issues/21',
        sourceRepo: 'naliazheli/world-test',
        sourceIssueNumber: 21,
        tags: ['github', 'mcp'],
      })
      .expect(201);

    return res.body.id as string;
  }

  function parseJsonRpcEnvelope(res: request.Response): JsonRpcEnvelope {
    if (res.body && typeof res.body === 'object' && Object.keys(res.body).length > 0) {
      return res.body as JsonRpcEnvelope;
    }

    const rawText = res.text || '';
    const dataLines = rawText
      .split(/\r?\n/)
      .map((line) => line.match(/^data:\s*(.+)$/)?.[1])
      .filter((line): line is string => Boolean(line));

    if (dataLines.length === 0) {
      throw new Error(`Cannot parse MCP response body: ${rawText}`);
    }

    return JSON.parse(dataLines[dataLines.length - 1]) as JsonRpcEnvelope;
  }

  function postMcp(body: JsonRpcRequestBody, sessionId?: string) {
    const req = request(mcpBaseUrl)
      .post('/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .set('Content-Type', 'application/json')
      .send(body as Record<string, unknown>);

    if (sessionId) {
      req.set('mcp-session-id', sessionId);
    }

    return req;
  }

  async function initializeSession() {
    const initEnvelope = {
      jsonrpc: '2.0',
      id: rpcId++,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: {
          name: 'mcp-e2e',
          version: '1.0.0',
        },
      },
    };

    const initRes = await postMcp(initEnvelope).expect(200);
    const sessionId = initRes.headers['mcp-session-id'] as string | undefined;
    expect(sessionId).toBeTruthy();

    const initializedRes = await postMcp(
      {
        jsonrpc: '2.0',
        method: 'notifications/initialized',
        params: {},
      },
      sessionId,
    );
    expect([200, 202]).toContain(initializedRes.status);

    return sessionId as string;
  }

  async function listTools(sessionId: string) {
    const res = await postMcp(
      {
        jsonrpc: '2.0',
        id: rpcId++,
        method: 'tools/list',
        params: {},
      },
      sessionId,
    ).expect(200);

    const envelope = parseJsonRpcEnvelope(res);
    expect(envelope.error).toBeUndefined();
    return envelope.result?.tools as Array<{ name: string }>;
  }

  async function callTool(sessionId: string, name: string, args: Record<string, unknown>) {
    const res = await postMcp(
      {
        jsonrpc: '2.0',
        id: rpcId++,
        method: 'tools/call',
        params: {
          name,
          arguments: args,
        },
      },
      sessionId,
    ).expect(200);

    const envelope = parseJsonRpcEnvelope(res);
    expect(envelope.error).toBeUndefined();
    return envelope.result as {
      content: Array<{ type: string; text?: string }>;
      isError?: boolean;
    };
  }

  function parseToolTextPayload(result: { content: Array<{ type: string; text?: string }> }) {
    const text = result.content.find((entry) => entry.type === 'text')?.text || '';
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  it('should return auth error for protected tool before login', async () => {
    const sessionId = await initializeSession();

    const result = await callTool(sessionId, 'list_my_tasks', {
      page: 1,
      limit: 10,
    });

    expect(result.isError).toBe(true);
    const payload = parseToolTextPayload(result);
    expect(String(payload)).toContain('Authentication required');
  });

  it('should complete full MCP workflow from login to submission review', async () => {
    const creator = await registerUser(uniqueEmail('mcp-creator'), 'McpCreator');
    const worker = await registerUser(uniqueEmail('mcp-worker'), 'McpWorker');
    const taskId = await createTask(creator.token);

    const sessionId = await initializeSession();

    const tools = await listTools(sessionId);
    const toolNames = tools.map((tool) => tool.name);
    expect(toolNames).toEqual(
      expect.arrayContaining([
        'list_tasks',
        'get_task',
        'list_task_comments',
        'list_submission_comments',
        'create_comment',
        'submit_task',
        'submit_pr',
        'list_my_tasks',
        'list_task_submissions',
        'review_submission',
        'login',
        'login_with_token',
      ]),
    );

    const workerLogin = await callTool(sessionId, 'login_with_token', {
      token: worker.token,
    });
    expect(workerLogin.isError).toBeUndefined();

    const listTasksResult = await callTool(sessionId, 'list_tasks', {
      status: 'OPEN',
      page: 1,
      limit: 10,
    });
    const taskListPayload = parseToolTextPayload(listTasksResult) as {
      data: Array<{ id: string }>;
    };
    expect(taskListPayload.data.some((task) => task.id === taskId)).toBe(true);

    const getTaskResult = await callTool(sessionId, 'get_task', { taskId });
    const taskPayload = parseToolTextPayload(getTaskResult) as { id: string; status: string };
    expect(taskPayload.id).toBe(taskId);
    expect(taskPayload.status).toBe('OPEN');

    const submitResult = await callTool(sessionId, 'submit_task', {
      taskId,
      content: 'Submission from MCP integration test',
    });
    const submissionPayload = parseToolTextPayload(submitResult) as { id: string; status: string };
    expect(submissionPayload.status).toBe('SUBMITTED');
    const submissionId = submissionPayload.id;

    const createCommentResult = await callTool(sessionId, 'create_comment', {
      taskId,
      submissionId,
      content: 'Please review this submission',
    });
    const commentPayload = parseToolTextPayload(createCommentResult) as {
      id: string;
      submission?: { id: string };
    };
    expect(commentPayload.id).toBeTruthy();
    expect(commentPayload.submission?.id).toBe(submissionId);

    const submissionCommentsResult = await callTool(sessionId, 'list_submission_comments', {
      submissionId,
    });
    const submissionComments = parseToolTextPayload(submissionCommentsResult) as Array<{ id: string }>;
    expect(submissionComments.length).toBeGreaterThanOrEqual(1);

    const creatorLogin = await callTool(sessionId, 'login_with_token', {
      token: creator.token,
    });
    expect(creatorLogin.isError).toBeUndefined();

    const listMyTasksResult = await callTool(sessionId, 'list_my_tasks', {
      status: 'OPEN',
      page: 1,
      limit: 10,
    });
    const myTasksPayload = parseToolTextPayload(listMyTasksResult) as {
      data: Array<{ id: string }>;
    };
    expect(myTasksPayload.data.some((task) => task.id === taskId)).toBe(true);

    const listSubmissionsResult = await callTool(sessionId, 'list_task_submissions', { taskId });
    const submissionsPayload = parseToolTextPayload(listSubmissionsResult) as Array<{ id: string }>;
    expect(submissionsPayload.some((submission) => submission.id === submissionId)).toBe(true);

    const reviewResult = await callTool(sessionId, 'review_submission', {
      submissionId,
      action: 'APPROVE',
      reviewNote: 'Approved via MCP e2e test',
    });
    const reviewedPayload = parseToolTextPayload(reviewResult) as { status: string };
    expect(reviewedPayload.status).toBe('APPROVED');

    const taskCommentsResult = await callTool(sessionId, 'list_task_comments', { taskId });
    const taskCommentsPayload = parseToolTextPayload(taskCommentsResult) as Array<{ id: string }>;
    expect(taskCommentsPayload.length).toBeGreaterThanOrEqual(1);

    const completedTaskResult = await callTool(sessionId, 'get_task', { taskId });
    const completedTaskPayload = parseToolTextPayload(completedTaskResult) as { status: string };
    expect(completedTaskPayload.status).toBe('COMPLETED');
  });

  it('should submit and review a github PR through MCP', async () => {
    const creator = await registerUser(uniqueEmail('mcp-gh-creator'), 'McpGhCreator');
    const worker = await registerUser(uniqueEmail('mcp-gh-worker'), 'McpGhWorker');
    const prisma = apiApp.get(PrismaService);
    const githubService = apiApp.get(GithubService);

    jest.spyOn(githubService, 'getPullRequest').mockResolvedValue({
      number: 77,
      state: 'open',
      draft: false,
      merged: false,
      user: { login: 'mcp-gh-worker' },
      head: { sha: 'abcdef1234567890', ref: 'feature/pr-77' },
      base: {
        ref: 'main',
        repo: {
          full_name: 'naliazheli/world-test',
          default_branch: 'main',
        },
      },
    } as any);

    await prisma.user.update({
      where: { id: worker.id },
      data: {
        authProvider: 'github',
        githubLogin: 'mcp-gh-worker',
      },
    });

    const taskId = await createGithubTask(creator.token);
    const sessionId = await initializeSession();

    const workerLogin = await callTool(sessionId, 'login_with_token', {
      token: worker.token,
    });
    expect(workerLogin.isError).toBeUndefined();

    const taskResult = await callTool(sessionId, 'get_task', { taskId });
    const taskPayload = parseToolTextPayload(taskResult) as {
      taskSource: string;
      sourceRepo: string;
    };
    expect(taskPayload.taskSource).toBe('GITHUB_ISSUE');
    expect(taskPayload.sourceRepo).toBe('naliazheli/world-test');

    const submitResult = await callTool(sessionId, 'submit_pr', {
      taskId,
      prUrl: 'https://github.com/naliazheli/world-test/pull/77',
      headSha: 'abcdef1234567890',
      note: 'Fix delivered via MCP PR flow',
    });
    const submissionPayload = parseToolTextPayload(submitResult) as {
      id: string;
      status: string;
      validationStatus: string;
    };
    expect(submissionPayload.status).toBe('SUBMITTED');
    expect(submissionPayload.validationStatus).toBe('PASSED');

    const creatorLogin = await callTool(sessionId, 'login_with_token', {
      token: creator.token,
    });
    expect(creatorLogin.isError).toBeUndefined();

    const reviewResult = await callTool(sessionId, 'review_submission', {
      submissionId: submissionPayload.id,
      action: 'APPROVE',
      reviewNote: 'Approved via MCP PR test',
    });
    const reviewedPayload = parseToolTextPayload(reviewResult) as { status: string };
    expect(reviewedPayload.status).toBe('APPROVED');
  });
});
