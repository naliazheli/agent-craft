import { INestApplication } from '@nestjs/common';
import { execFileSync } from 'node:child_process';
import { AddressInfo } from 'node:net';
import { Server } from 'node:http';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Express } from 'express';
import * as request from 'supertest';
import { createTestApp, cleanDatabase } from './setup';
import { PrismaService } from '../src/prisma/prisma.service';
import { GithubService } from '../src/github/github.service';
import { SubmissionsService } from '../src/submissions/submissions.service';

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

describe('GitHub Real Flow (e2e)', () => {
  let apiApp: INestApplication;
  let prisma: PrismaService;
  let github: GithubService;
  let submissionsService: SubmissionsService;
  let mcpServer: Server;
  let mcpBaseUrl: string;
  let shutdownMcpSessions: () => Promise<void>;
  let rpcId = 1;
  let userSequence = 0;

  beforeEach(async () => {
    apiApp = await createTestApp();
    prisma = apiApp.get(PrismaService);
    github = apiApp.get(GithubService);
    submissionsService = apiApp.get(SubmissionsService);
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
    if (shutdownMcpSessions) {
      await shutdownMcpSessions();
    }
    if (mcpServer) {
      await new Promise<void>((resolve) => mcpServer.close(() => resolve()));
    }
    if (apiApp) {
      await apiApp.close();
    }
  });

  function uniqueEmail(prefix: string) {
    userSequence += 1;
    return `${prefix}-${Date.now()}-${userSequence}@example.com`;
  }

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
    const initRes = await postMcp({
      jsonrpc: '2.0',
      id: rpcId++,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: {
          name: 'github-real-flow-e2e',
          version: '1.0.0',
        },
      },
    }).expect(200);

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
    return JSON.parse(text);
  }

  async function createIssueAndPullRequest(repoFullName: string, tokenLogin: string) {
    const uniqueId = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    const issueTitle = `[codex-e2e] real github flow ${uniqueId}`;
    const issueBody = `Automated e2e issue for GitHub task flow.\n\nUnique: ${uniqueId}`;
    const issue = await github.createIssue(repoFullName, {
      title: issueTitle,
      body: issueBody,
      labels: ['bug'],
    });

    const repo = await github.getRepository(repoFullName);
    const baseRef = await github.getRef(repoFullName, `heads/${repo.default_branch}`);
    const branchName = `codex/e2e-${uniqueId}`;
    await github.createRef(repoFullName, `refs/heads/${branchName}`, baseRef.object.sha);

    const content = Buffer.from(
      `# Codex E2E\n\nIssue: ${issue.number}\n\nAuthor: ${tokenLogin}\n`,
      'utf8',
    ).toString('base64');
    const filePath = `codex-e2e/${uniqueId}.md`;
    const commit = await github.upsertContent(repoFullName, filePath, {
      message: `test: add e2e proof for issue #${issue.number}`,
      content,
      branch: branchName,
    });

    const pullRequest = await github.createPullRequest(repoFullName, {
      title: `fix: close issue #${issue.number}`,
      head: branchName,
      base: repo.default_branch,
      body: `Closes #${issue.number}`,
    });

    return {
      issue,
      pullRequest,
      headSha: commit.commit.sha,
    };
  }

  function ensureRepositoryInitialized(repoFullName: string) {
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      throw new Error('GITHUB_TOKEN is required for real GitHub flow tests');
    }

    const repo = github.getRepository(repoFullName);
    return repo.then(async (repoInfo) => {
      try {
        await github.getRef(repoFullName, `heads/${repoInfo.default_branch}`);
      } catch (error) {
        const message = (error as Error).message;
        if (!message.includes('Git Repository is empty')) {
          throw error;
        }

        const tempDir = mkdtempSync(join(tmpdir(), 'agentcraft-gh-init-'));
        const readmePath = join(tempDir, 'README.md');
        writeFileSync(readmePath, '# world-test\n\nInitialized by automated e2e.\n', 'utf8');

        execFileSync('git', ['init', '-b', repoInfo.default_branch], { cwd: tempDir });
        execFileSync('git', ['config', 'user.name', 'Codex E2E'], { cwd: tempDir });
        execFileSync('git', ['config', 'user.email', 'codex-e2e@example.com'], { cwd: tempDir });
        execFileSync('git', ['add', 'README.md'], { cwd: tempDir });
        execFileSync('git', ['commit', '-m', 'chore: initialize repository'], { cwd: tempDir });
        execFileSync(
          'git',
          ['remote', 'add', 'origin', `https://x-access-token:${token}@github.com/${repoFullName}.git`],
          { cwd: tempDir },
        );
        execFileSync('git', ['push', '-u', 'origin', repoInfo.default_branch], { cwd: tempDir });
      }
    });
  }

  it('should create a real github issue, submit PR through MCP, auto-merge, and payout reward', async () => {
    expect(github.isConfigured()).toBe(true);
    const repoFullName = process.env.GITHUB_REPOS || 'naliazheli/world-test';
    const githubUser = await github.getAuthenticatedUser();
    await ensureRepositoryInitialized(repoFullName);

    const creator = await registerUser(uniqueEmail('gh-creator'), 'GitHub Creator');
    const worker = await registerUser(uniqueEmail('gh-worker'), 'GitHub Worker');

    await prisma.user.updateMany({
      where: { id: { in: [creator.id, worker.id] } },
      data: {
        authProvider: 'github',
        githubLogin: githubUser.login,
      },
    });

    const { issue, pullRequest, headSha } = await createIssueAndPullRequest(
      repoFullName,
      githubUser.login,
    );

    const taskRes = await request(apiApp.getHttpServer())
      .post('/api/tasks')
      .set('Authorization', `Bearer ${creator.token}`)
      .send({
        title: `[GitHub] ${issue.title}`,
        description: issue.body || 'Automated GitHub issue task',
        reward: 1,
        taskSource: 'GITHUB_ISSUE',
        sourceUrl: issue.html_url,
        sourceRepo: repoFullName,
        sourceIssueNumber: issue.number,
      })
      .expect(201);

    const sessionId = await initializeSession();

    const workerLogin = await callTool(sessionId, 'login_with_token', {
      token: worker.token,
    });
    expect(workerLogin.isError).toBeUndefined();

    const listTasksResult = await callTool(sessionId, 'list_tasks', {
      status: 'OPEN',
      page: 1,
      limit: 20,
    });
    const taskListPayload = parseToolTextPayload(listTasksResult) as {
      data: Array<{ id: string }>;
    };
    expect(taskListPayload.data.some((task) => task.id === taskRes.body.id)).toBe(true);

    const taskDetailResult = await callTool(sessionId, 'get_task', { taskId: taskRes.body.id });
    const taskDetail = parseToolTextPayload(taskDetailResult) as {
      id: string;
      taskSource: string;
      sourceRepo: string;
      sourceIssueNumber: number;
    };
    expect(taskDetail.id).toBe(taskRes.body.id);
    expect(taskDetail.taskSource).toBe('GITHUB_ISSUE');
    expect(taskDetail.sourceRepo).toBe(repoFullName);
    expect(taskDetail.sourceIssueNumber).toBe(issue.number);

    const submitPrResult = await callTool(sessionId, 'submit_pr', {
      taskId: taskRes.body.id,
      prUrl: pullRequest.html_url,
      headSha,
      note: `Submitting PR for issue #${issue.number}`,
    });
    const submissionPayload = parseToolTextPayload(submitPrResult) as {
      id: string;
      status: string;
      validationStatus: string;
    };
    expect(submissionPayload.status).toBe('SUBMITTED');
    expect(submissionPayload.validationStatus).toBe('PASSED');

    let approved = false;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await submissionsService.pollGithubPrSubmissions();
      const submissionRes = await request(apiApp.getHttpServer())
        .get(`/api/submissions/task/${taskRes.body.id}`)
        .expect(200);
      const latest = submissionRes.body.find((item: any) => item.id === submissionPayload.id);
      if (latest?.status === 'APPROVED') {
        approved = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    expect(approved).toBe(true);

    const taskAfter = await request(apiApp.getHttpServer())
      .get(`/api/tasks/${taskRes.body.id}`)
      .expect(200);
    expect(taskAfter.body.status).toBe('COMPLETED');

    const workerBalance = await request(apiApp.getHttpServer())
      .get('/api/wallet/balance')
      .set('Authorization', `Bearer ${worker.token}`)
      .expect(200);
    expect(workerBalance.body.offchain).toBe(6);

    const workerTransactions = await request(apiApp.getHttpServer())
      .get('/api/wallet/transactions')
      .set('Authorization', `Bearer ${worker.token}`)
      .expect(200);
    const payoutTx = workerTransactions.body.data.find(
      (tx: any) => tx.type === 'TASK_PAYOUT' && tx.taskId === taskRes.body.id,
    );
    expect(payoutTx).toBeDefined();

    const mergedPr = await github.getPullRequest(repoFullName, pullRequest.number);
    expect(mergedPr.merged || Boolean(mergedPr.merged_at)).toBe(true);

    const issueAfter = await github.getIssue(repoFullName, issue.number);
    expect(issueAfter.state).toBe('closed');
  }, 180000);
});
