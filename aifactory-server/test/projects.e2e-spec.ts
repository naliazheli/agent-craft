import { INestApplication } from '@nestjs/common';
import { AddressInfo } from 'node:net';
import { Server } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Express } from 'express';
import * as request from 'supertest';
import { cleanDatabase, createTestApp } from './setup';
import { PrismaService } from '../src/prisma/prisma.service';

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

describe('Projects (e2e)', () => {
  let apiApp: INestApplication;
  let mcpServer: Server;
  let mcpBaseUrl: string;
  let shutdownMcpSessions: () => Promise<void> = async () => {};
  let rpcId = 1;
  let userSequence = 0;

  beforeEach(async () => {
    process.env.HERMES_AGENT_LAUNCH_MODE = 'mock';
    apiApp = await createTestApp({ mockAgentWorkspace: true });
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
    await shutdownMcpSessions();
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

  async function getVerificationCode(email: string) {
    const res = await request(apiApp.getHttpServer())
      .post('/api/auth/email/verification-code')
      .send({ email })
      .expect(200);

    return res.body.debugCode as string;
  }

  async function registerUser(email: string, displayName: string) {
    const password = 'password123';
    const verificationCode = await getVerificationCode(email);
    const res = await request(apiApp.getHttpServer())
      .post('/api/auth/register')
      .send({ email, password, displayName, verificationCode })
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

  function postMcp(body: Record<string, unknown>, sessionId?: string) {
    const req = request(mcpBaseUrl)
      .post('/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .set('Content-Type', 'application/json')
      .send(body);

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
          name: 'projects-e2e',
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
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  it('soft deletes projects only for the creator after delete confirmation', async () => {
    const owner = await registerUser(uniqueEmail('project-delete-owner'), 'Project Delete Owner');
    const member = await registerUser(uniqueEmail('project-delete-member'), 'Project Delete Member');
    const prisma = apiApp.get(PrismaService);

    const projectRes = await request(apiApp.getHttpServer())
      .post('/api/projects')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        name: 'Soft Delete Project',
        summary: 'This project should disappear after deletion.',
        brief: 'Retain the backend row with deletedAt.',
      })
      .expect(201);

    await request(apiApp.getHttpServer())
      .post(`/api/projects/${projectRes.body.id}/members`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        userId: member.id,
        role: 'CONTRIBUTOR',
      })
      .expect(201);

    await request(apiApp.getHttpServer())
      .delete(`/api/projects/${projectRes.body.id}`)
      .set('Authorization', `Bearer ${member.token}`)
      .send({ confirmation: 'delete' })
      .expect(403);

    await request(apiApp.getHttpServer())
      .delete(`/api/projects/${projectRes.body.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ confirmation: 'DELETE' })
      .expect(400);

    const deleteRes = await request(apiApp.getHttpServer())
      .delete(`/api/projects/${projectRes.body.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ confirmation: 'delete' })
      .expect(200);

    expect(deleteRes.body.deletedById).toBe(owner.id);
    expect(deleteRes.body.deletedAt).toBeTruthy();

    await request(apiApp.getHttpServer())
      .get(`/api/projects/${projectRes.body.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(404);

    const listRes = await request(apiApp.getHttpServer())
      .get('/api/projects')
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);

    expect(listRes.body.data.some((project: any) => project.id === projectRes.body.id)).toBe(false);

    const retainedProject = await prisma.project.findUnique({
      where: { id: projectRes.body.id },
      select: { deletedAt: true, deletedById: true },
    });
    expect(retainedProject?.deletedAt).toBeTruthy();
    expect(retainedProject?.deletedById).toBe(owner.id);
  });

  it('should normalize DeepSeek API model names when saving configs', async () => {
    const owner = await registerUser(uniqueEmail('deepseek-config-owner'), 'DeepSeek Config Owner');

    const created = await request(apiApp.getHttpServer())
      .post('/api/api-configs')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        name: 'DeepSeek Config',
        apiType: 'openai',
        apiUrl: 'https://api.deepseek.com',
        apiKey: 'test-key-deepseek',
        modelName: 'DeepSeek-V4-Pro',
      })
      .expect(201);

    expect(created.body.modelName).toBe('deepseek-v4-pro');

    const updated = await request(apiApp.getHttpServer())
      .put(`/api/api-configs/${created.body.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        modelName: 'DeepSeek-V4-Flash',
      })
      .expect(200);

    expect(updated.body.modelName).toBe('deepseek-v4-flash');
  });

  it('should complete project workflow over REST', async () => {
    const owner = await registerUser(uniqueEmail('project-owner'), 'ProjectOwner');

    const projectRes = await request(apiApp.getHttpServer())
      .post('/api/projects')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        name: 'Project Platform',
        summary: 'Project-level multi-agent workspace',
        brief: 'Build isolated project flow',
      })
      .expect(201);

    const projectId = projectRes.body.id as string;
    expect(projectRes.body.slug).toContain('project-platform');

    const goalRes = await request(apiApp.getHttpServer())
      .post(`/api/projects/${projectId}/goals`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        title: 'Ship project workspace',
        description: 'Deliver the first isolated project collaboration flow',
      })
      .expect(201);

    const featureRes = await request(apiApp.getHttpServer())
      .post(`/api/projects/${projectId}/features`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        goalId: goalRes.body.id,
        title: 'Work item execution flow',
      })
      .expect(201);

    const workItemRes = await request(apiApp.getHttpServer())
      .post(`/api/projects/${projectId}/work-items`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        title: 'Implement MCP read/write tools',
        workType: 'IMPLEMENTATION',
        featureId: featureRes.body.id,
        acceptanceCriteria: 'Expose core project APIs through MCP',
        priority: 10,
      })
      .expect(201);

    const workItemId = workItemRes.body.id as string;
    expect(workItemRes.body.goalId).toBe(goalRes.body.id);

    const commentRes = await request(apiApp.getHttpServer())
      .post(`/api/projects/${projectId}/work-items/${workItemId}/comments`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        content: 'Added the API notes and a reference file.',
        attachments: [{ path: 'work-items/reference.md', name: 'reference.md', size: 128 }],
      })
      .expect(201);

    expect(commentRes.body.content).toContain('API notes');
    expect(commentRes.body.attachments[0].path).toBe('work-items/reference.md');

    const artifactRes = await request(apiApp.getHttpServer())
      .post(`/api/projects/${projectId}/artifacts`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        workItemId,
        artifactType: 'HANDOFF',
        title: 'Initial handoff',
        content: 'Implemented the first MCP endpoints for projects.',
      })
      .expect(201);

    await request(apiApp.getHttpServer())
      .post(`/api/projects/${projectId}/memories`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        memoryType: 'DECISION',
        title: 'Isolation',
        content: 'Projects will stay isolated from the legacy marketplace tables.',
        sourceArtifactId: artifactRes.body.id,
      })
      .expect(201);

    await request(apiApp.getHttpServer())
      .post(`/api/projects/${projectId}/reviews`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        workItemId,
        artifactId: artifactRes.body.id,
        reviewerType: 'OWNER',
        status: 'APPROVED',
        reviewNote: 'Looks good.',
      })
      .expect(201);

    const detailRes = await request(apiApp.getHttpServer())
      .get(`/api/projects/${projectId}/work-items/${workItemId}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);

    expect(detailRes.body.status).toBe('ACCEPTED');
    expect(detailRes.body.goalId).toBe(goalRes.body.id);
    expect(detailRes.body.comments).toHaveLength(1);
    expect(detailRes.body._count.comments).toBe(1);

    const commentsRes = await request(apiApp.getHttpServer())
      .get(`/api/projects/${projectId}/work-items/${workItemId}/comments`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);

    expect(commentsRes.body).toHaveLength(1);
    expect(commentsRes.body[0].attachments[0].name).toBe('reference.md');

    const memoriesRes = await request(apiApp.getHttpServer())
      .get(`/api/projects/${projectId}/memories`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);

    expect(memoriesRes.body).toHaveLength(1);
    expect(memoriesRes.body[0].memoryType).toBe('DECISION');
  });

  it('should expose project workflow through MCP tools', async () => {
    const owner = await registerUser(uniqueEmail('mcp-project-owner'), 'McpProjectOwner');
    const sessionId = await initializeSession();

    const loginResult = await callTool(sessionId, 'login_with_token', { token: owner.token });
    expect(loginResult.isError).not.toBe(true);

    const createProjectResult = await callTool(sessionId, 'create_project', {
      name: 'MCP Project Workspace',
      summary: 'Created from MCP',
      brief: 'Use MCP tools to drive project execution',
    });
    const project = parseToolTextPayload(createProjectResult);
    expect(project.id).toBeTruthy();

    const createWorkItemResult = await callTool(sessionId, 'create_project_work_item', {
      projectId: project.id,
      title: 'Create first MCP-managed work item',
      workType: 'PLANNING',
      acceptanceCriteria: 'Work item can be listed and fetched through MCP',
    });
    const workItem = parseToolTextPayload(createWorkItemResult);
    expect(workItem.id).toBeTruthy();

    const createArtifactResult = await callTool(sessionId, 'create_project_artifact', {
      projectId: project.id,
      workItemId: workItem.id,
      artifactType: 'HANDOFF',
      content: 'Created by MCP.',
    });
    const artifact = parseToolTextPayload(createArtifactResult);
    expect(artifact.id).toBeTruthy();

    const createMemoryResult = await callTool(sessionId, 'create_project_memory', {
      projectId: project.id,
      memoryType: 'DECISION',
      content: 'MCP can persist project memory entries.',
      sourceArtifactId: artifact.id,
    });
    const memory = parseToolTextPayload(createMemoryResult);
    expect(memory.id).toBeTruthy();

    const createReviewResult = await callTool(sessionId, 'create_project_review', {
      projectId: project.id,
      workItemId: workItem.id,
      artifactId: artifact.id,
      reviewerType: 'OWNER',
      status: 'APPROVED',
      reviewNote: 'Approved from MCP.',
    });
    const review = parseToolTextPayload(createReviewResult);
    expect(review.status).toBe('APPROVED');

    const listProjectsResult = await callTool(sessionId, 'list_projects', { limit: 10 });
    const projectsPayload = parseToolTextPayload(listProjectsResult);
    expect(projectsPayload.data.some((item: any) => item.id === project.id)).toBe(true);

    const listWorkItemsResult = await callTool(sessionId, 'list_project_work_items', {
      projectId: project.id,
      limit: 10,
    });
    const workItemsPayload = parseToolTextPayload(listWorkItemsResult);
    expect(workItemsPayload.data.some((item: any) => item.id === workItem.id)).toBe(true);

    const getWorkItemResult = await callTool(sessionId, 'get_project_work_item', {
      projectId: project.id,
      workItemId: workItem.id,
    });
    const workItemDetail = parseToolTextPayload(getWorkItemResult);
    expect(workItemDetail.status).toBe('ACCEPTED');
  });

  it('should launch a budgeted worker runtime and start an assigned item', async () => {
    const owner = await registerUser(uniqueEmail('runtime-project-owner'), 'RuntimeProjectOwner');

    const apiConfigRes = await request(apiApp.getHttpServer())
      .post('/api/api-configs')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        name: 'Mock OpenAI',
        apiType: 'openai',
        apiUrl: 'https://api.openai.com/v1',
        apiKey: 'test-key-runtime-launch',
        modelName: 'gpt-test',
      })
      .expect(201);

    const projectRes = await request(apiApp.getHttpServer())
      .post('/api/projects')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        name: 'Budgeted Worker Launch',
        summary: 'Launch worker agents from project AICoin',
        brief: 'Create an item, launch a worker, and start execution.',
        budgetAmount: 20,
        budgetCurrency: 'AIC',
      })
      .expect(201);

    const projectId = projectRes.body.id as string;

    const goalRes = await request(apiApp.getHttpServer())
      .post(`/api/projects/${projectId}/goals`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        title: 'Ship one scoped worker item',
        description: 'The lead should have enough AICoin to launch one worker.',
      })
      .expect(201);

    const workItemRes = await request(apiApp.getHttpServer())
      .post(`/api/projects/${projectId}/work-items`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        title: 'Implement the first scoped change',
        workType: 'IMPLEMENTATION',
        goalId: goalRes.body.id,
        scopeBrief: 'Make a small implementation change and report evidence.',
        acceptanceCriteria: 'Worker starts from a scoped packet and records an execution run.',
        inputPacket: { source: 'lead-agent-test', task: 'Start work on this item.' },
        outputContract: { expectedArtifact: 'HANDOFF' },
        priority: 20,
      })
      .expect(201);

    const workItemId = workItemRes.body.id as string;

    const launchRes = await request(apiApp.getHttpServer())
      .post(`/api/projects/${projectId}/agent-runtimes/launch`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        role: 'WORKER_AGENT',
        llmConfigId: apiConfigRes.body.id,
        deploymentDays: 1,
      })
      .expect(201);

    expect(launchRes.body.role).toBe('WORKER_AGENT');
    expect(launchRes.body.budget.requestedAmount).toBe(0);
    expect(launchRes.body.budget.availableAmount).toBe(20);
    expect(launchRes.body.session.skillBundleRefs).toContain('role-skill://agent-workspace-worker');
    expect(launchRes.body.session.deploymentDays).toBe(1);
    expect(launchRes.body.session.dailyCostAmount).toBe(0);

    const runtimesRes = await request(apiApp.getHttpServer())
      .get(`/api/projects/${projectId}/agent-runtimes`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);

    expect(runtimesRes.body.budget.availableAmount).toBe(20);
    expect(runtimesRes.body.budget.launchableRoles.some((role: any) => role.role === 'WORKER_AGENT')).toBe(true);

    const assignmentRes = await request(apiApp.getHttpServer())
      .post(`/api/projects/${projectId}/work-items/${workItemId}/assignments`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        assigneeUserId: launchRes.body.userId,
        role: 'WORKER_AGENT',
        objective: 'Complete the scoped implementation item.',
        contextPacket: {
          workItemId,
          goalId: goalRes.body.id,
          scopeBrief: 'Complete the scoped implementation item and produce a handoff.',
        },
      })
      .expect(201);

    const activeAssignmentRes = await request(apiApp.getHttpServer())
      .patch(`/api/projects/${projectId}/work-items/${workItemId}/assignments/${assignmentRes.body.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ status: 'ACTIVE' })
      .expect(200);

    expect(activeAssignmentRes.body.status).toBe('ACTIVE');

    const runRes = await request(apiApp.getHttpServer())
      .post(`/api/projects/${projectId}/runs`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        runType: 'EXECUTION',
        workItemId,
        assignmentId: assignmentRes.body.id,
        instruction: 'Worker agent started executing the item.',
        costInfo: {
          launchCostAmount: 10,
          currency: 'AIC',
        },
      })
      .expect(201);

    await request(apiApp.getHttpServer())
      .patch(`/api/projects/${projectId}/runs/${runRes.body.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ status: 'RUNNING' })
      .expect(200);

    const itemRes = await request(apiApp.getHttpServer())
      .get(`/api/projects/${projectId}/work-items/${workItemId}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);

    expect(itemRes.body.status).toBe('IN_PROGRESS');
    expect(itemRes.body.ownerId).toBe(launchRes.body.userId);
    expect(itemRes.body.assignments[0].status).toBe('ACTIVE');
    expect(itemRes.body.assignments[0].contextPacket.objective).toBe('Complete the scoped implementation item.');
    expect(itemRes.body.assignments[0].contextPacket.workItem.id).toBe(workItemId);
    expect(itemRes.body.assignments[0].contextPacket.workItem.acceptanceCriteria).toContain('Worker starts');
    expect(itemRes.body.assignments[0].contextPacket.workItem.outputContract.expectedArtifact).toBe('HANDOFF');
    expect(itemRes.body.assignments[0].contextPacket.workerStartChecklist).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Resume workspace context'),
        expect.stringContaining('Submit artifacts'),
      ]),
    );
  });

  it('should keep long-running typing agent messages alive without a default stale cutoff', async () => {
    const owner = await registerUser(uniqueEmail('typing-runtime-owner'), 'TypingRuntimeOwner');

    const apiConfigRes = await request(apiApp.getHttpServer())
      .post('/api/api-configs')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        name: 'Mock OpenAI',
        apiType: 'openai',
        apiUrl: 'https://api.openai.com/v1',
        apiKey: 'test-key-runtime-typing',
        modelName: 'gpt-test',
      })
      .expect(201);

    const projectRes = await request(apiApp.getHttpServer())
      .post('/api/projects')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        name: 'Typing Runtime Wait',
        summary: 'Long model waits should not be marked failed by polling.',
        brief: 'Keep the runtime in TYPING while the agent is still producing a response.',
        budgetAmount: 20,
        budgetCurrency: 'AIC',
      })
      .expect(201);

    const launchRes = await request(apiApp.getHttpServer())
      .post(`/api/projects/${projectRes.body.id}/agent-runtimes/launch`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        role: 'WORKER_AGENT',
        llmConfigId: apiConfigRes.body.id,
        deploymentDays: 1,
      })
      .expect(201);

    const prisma = apiApp.get(PrismaService);
    const member = await prisma.projectMember.findUniqueOrThrow({
      where: { id: launchRes.body.memberId },
      select: { permissions: true },
    });
    const permissions = member.permissions as any;
    permissions.runtimeSession = {
      ...permissions.runtimeSession,
      status: 'TYPING',
      lastMessageAt: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
      currentActivity: 'Waiting on model response',
      lastError: null,
      messageHistory: [
        ...(permissions.runtimeSession.messageHistory || []),
        {
          id: 'test-long-running-user-message',
          role: 'user',
          content: 'Please think through the project structure.',
          createdAt: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
          status: 'SENT',
        },
      ],
    };
    await prisma.projectMember.update({
      where: { id: launchRes.body.memberId },
      data: { permissions },
    });

    const runtimesRes = await request(apiApp.getHttpServer())
      .get(`/api/projects/${projectRes.body.id}/agent-runtimes`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);

    const runtime = runtimesRes.body.sessions.find((item: any) => item.memberId === launchRes.body.memberId);
    expect(runtime.session.status).toBe('TYPING');
    expect(runtime.session.lastError).toBeNull();
    expect(runtime.session.messageHistory.some((message: any) => message.status === 'ERROR')).toBe(false);
  });

  it('should recover typing runtime messages orphaned by an API restart', async () => {
    const owner = await registerUser(uniqueEmail('orphan-runtime-owner'), 'OrphanRuntimeOwner');

    const apiConfigRes = await request(apiApp.getHttpServer())
      .post('/api/api-configs')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        name: 'Mock OpenAI Orphan',
        apiType: 'openai',
        apiUrl: 'https://api.openai.com/v1',
        apiKey: 'test-key-runtime-orphan',
        modelName: 'gpt-test',
      })
      .expect(201);

    const projectRes = await request(apiApp.getHttpServer())
      .post('/api/projects')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        name: 'Orphan Runtime Recovery',
        summary: 'In-flight streams lost across API restarts should recover.',
        brief: 'A persisted active request without an in-memory controller is no longer live.',
        budgetAmount: 20,
        budgetCurrency: 'AIC',
      })
      .expect(201);

    const launchRes = await request(apiApp.getHttpServer())
      .post(`/api/projects/${projectRes.body.id}/agent-runtimes/launch`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        role: 'WORKER_AGENT',
        llmConfigId: apiConfigRes.body.id,
        deploymentDays: 1,
      })
      .expect(201);

    const prisma = apiApp.get(PrismaService);
    const member = await prisma.projectMember.findUniqueOrThrow({
      where: { id: launchRes.body.memberId },
      select: { permissions: true },
    });
    const permissions = member.permissions as any;
    permissions.runtimeSession = {
      ...permissions.runtimeSession,
      status: 'TYPING',
      activeRequestId: 'lost-request-after-restart',
      lastMessageAt: new Date().toISOString(),
      currentActivity: 'Streaming response',
      lastError: null,
    };
    await prisma.projectMember.update({
      where: { id: launchRes.body.memberId },
      data: { permissions },
    });

    const runtimesRes = await request(apiApp.getHttpServer())
      .get(`/api/projects/${projectRes.body.id}/agent-runtimes`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);

    const runtime = runtimesRes.body.sessions.find((item: any) => item.memberId === launchRes.body.memberId);
    expect(runtime.session.status).toBe('IDLE');
    expect(runtime.session.activeRequestId).toBeNull();
    expect(runtime.session.lastError).toContain('lost its server-side stream');
    expect(runtime.session.messageHistory.some((message: any) => message.status === 'WARNING')).toBe(true);
  });

  it('should list and download files generated in an agent runtime workspace', async () => {
    const owner = await registerUser(uniqueEmail('runtime-workspace-owner'), 'Runtime Workspace Owner');

    const apiConfigRes = await request(apiApp.getHttpServer())
      .post('/api/api-configs')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        name: 'Runtime Workspace LLM',
        apiType: 'openai',
        apiUrl: 'https://api.openai.com/v1',
        apiKey: 'test-key-runtime-workspace',
        modelName: 'gpt-test',
      })
      .expect(201);

    const projectRes = await request(apiApp.getHttpServer())
      .post('/api/projects')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        name: 'Runtime Workspace Downloads',
        summary: 'Agent generated files should be downloadable.',
        brief: 'Generated markdown files should surface through the runtime workspace panel.',
        budgetAmount: 20,
        budgetCurrency: 'AIC',
      })
      .expect(201);

    const launchRes = await request(apiApp.getHttpServer())
      .post(`/api/projects/${projectRes.body.id}/agent-runtimes/launch`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        role: 'WORKER_AGENT',
        llmConfigId: apiConfigRes.body.id,
        deploymentDays: 1,
      })
      .expect(201);

    const workspaceDir = join(launchRes.body.session.dataDir, 'workspace', 'outputs');
    await mkdir(workspaceDir, { recursive: true });
    await writeFile(
      join(workspaceDir, 'architecture-overview.md'),
      '# Architecture Overview\n\nGenerated by the lead agent.\n',
      'utf8',
    );

    const listRes = await request(apiApp.getHttpServer())
      .get(`/api/projects/${projectRes.body.id}/agent-runtimes/${launchRes.body.memberId}/workspace`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);

    expect(listRes.body.workspace).toBe('/opt/data/workspace');
    expect(listRes.body.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'outputs/architecture-overview.md',
          name: 'architecture-overview.md',
          downloadUrl: expect.stringContaining('/workspace/download'),
        }),
      ]),
    );

    const downloadRes = await request(apiApp.getHttpServer())
      .get(
        `/api/projects/${projectRes.body.id}/agent-runtimes/${launchRes.body.memberId}/workspace/download?path=${encodeURIComponent('outputs/architecture-overview.md')}`,
      )
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);

    expect(downloadRes.headers['content-disposition']).toContain('architecture-overview.md');
    expect(downloadRes.text).toContain('Generated by the lead agent');

    await request(apiApp.getHttpServer())
      .get(
        `/api/projects/${projectRes.body.id}/agent-runtimes/${launchRes.body.memberId}/workspace/download?path=${encodeURIComponent('../AGENT_WORKSPACE_RUNTIME.env')}`,
      )
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(400);
  });

  it('should preserve uploaded project file context for a worker assignment packet', async () => {
    const owner = await registerUser(uniqueEmail('project-file-owner'), 'Project File Owner');

    const apiConfigRes = await request(apiApp.getHttpServer())
      .post('/api/api-configs')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        name: 'Runtime LLM Config',
        apiType: 'openai',
        apiUrl: 'https://api.openai.com/v1',
        apiKey: 'test-key-file-flow',
        modelName: 'gpt-test',
      })
      .expect(201);

    const projectRes = await request(apiApp.getHttpServer())
      .post('/api/projects')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        name: 'Worker File Analysis Flow',
        summary: 'Lead uploads a file and dispatches a worker to analyze it.',
        brief: 'The worker must receive a readable project file reference in the assignment packet.',
        budgetAmount: 20,
        budgetCurrency: 'AIC',
      })
      .expect(201);

    const projectId = projectRes.body.id as string;
    const fileContent = [
      '# Lead discovery notes',
      '',
      '- The checkout flow fails when a coupon is expired.',
      '- The worker should identify the failure mode and return a concise remediation plan.',
    ].join('\n');

    const uploadRes = await request(apiApp.getHttpServer())
      .post(`/api/projects/${projectId}/files/upload`)
      .set('Authorization', `Bearer ${owner.token}`)
      .field('path', 'attachments/lead-discovery.md')
      .attach('file', Buffer.from(fileContent), {
        filename: 'lead-discovery.md',
        contentType: 'text/markdown',
      })
      .expect(201);

    expect(uploadRes.body.path).toBe('attachments/lead-discovery.md');

    const listedFiles = await request(apiApp.getHttpServer())
      .get(`/api/projects/${projectId}/files`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);

    expect(listedFiles.body.files).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'attachments/lead-discovery.md' })]),
    );

    const workItemRes = await request(apiApp.getHttpServer())
      .post(`/api/projects/${projectId}/work-items`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        title: 'Analyze lead-uploaded checkout notes',
        workType: 'RESEARCH',
        description: 'Read @attachments/lead-discovery.md and explain the customer-impacting bug.',
        scopeBrief: 'Analyze the uploaded discovery notes before proposing changes.',
        acceptanceCriteria: 'Handoff cites @attachments/lead-discovery.md and includes a remediation plan.',
        outputContract: { expectedArtifact: 'HANDOFF', requiresFileAnalysis: true },
        priority: 30,
      })
      .expect(201);

    const workItemId = workItemRes.body.id as string;
    expect(workItemRes.body.inputPacket.projectFiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'attachments/lead-discovery.md',
          source: 'description',
        }),
      ]),
    );

    const launchRes = await request(apiApp.getHttpServer())
      .post(`/api/projects/${projectId}/agent-runtimes/launch`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        role: 'WORKER_AGENT',
        llmConfigId: apiConfigRes.body.id,
        deploymentDays: 1,
      })
      .expect(201);

    const assignmentRes = await request(apiApp.getHttpServer())
      .post(`/api/projects/${projectId}/work-items/${workItemId}/assignments`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        assigneeUserId: launchRes.body.userId,
        role: 'WORKER_AGENT',
        objective: 'Analyze the uploaded project file and produce a handoff.',
        contextPacket: {
          notes: 'Start from @attachments/lead-discovery.md, then summarize the bug and remediation.',
        },
      })
      .expect(201);

    const itemRes = await request(apiApp.getHttpServer())
      .get(`/api/projects/${projectId}/work-items/${workItemId}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);

    const packet = itemRes.body.assignments[0].contextPacket;
    expect(packet.projectFiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'attachments/lead-discovery.md',
          readHint: expect.stringContaining('/files/read'),
        }),
      ]),
    );
    expect(packet.workItem.inputPacket.projectFiles).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'attachments/lead-discovery.md' })]),
    );
    expect(packet.workerStartChecklist).toEqual(
      expect.arrayContaining([expect.stringContaining('Read every referenced project file')]),
    );

    const readRes = await request(apiApp.getHttpServer())
      .get(`/api/projects/${projectId}/files/read?path=attachments%2Flead-discovery.md&encoding=text`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);

    expect(readRes.body.content).toContain('checkout flow fails');

    const runRes = await request(apiApp.getHttpServer())
      .post(`/api/projects/${projectId}/runs`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        runType: 'EXECUTION',
        workItemId,
        assignmentId: assignmentRes.body.id,
        instruction: 'Worker reads referenced projectFiles before analysis.',
        contextSnapshot: packet,
        resultSummary: 'Analyzed attachments/lead-discovery.md and identified the expired-coupon failure mode.',
      })
      .expect(201);

    const artifactRes = await request(apiApp.getHttpServer())
      .post(`/api/projects/${projectId}/artifacts`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        artifactType: 'HANDOFF',
        workItemId,
        assignmentId: assignmentRes.body.id,
        runId: runRes.body.id,
        title: 'File analysis handoff',
        content: `HANDOFF\nWork item: ${workItemId}\nChanges/artifacts: analyzed attachments/lead-discovery.md\nVerification: read project file through /files/read\nAcceptance criteria: met; expired-coupon failure identified\nResidual risks: none known\nReviewer notes: verify remediation plan against the uploaded notes\n\nObserved file content:\n${readRes.body.content}`,
        metadata: {
          analyzedProjectFiles: ['attachments/lead-discovery.md'],
        },
      })
      .expect(201);

    expect(artifactRes.body.content).toContain('expired-coupon');
    expect(artifactRes.body.metadata.analyzedProjectFiles).toContain('attachments/lead-discovery.md');
  });

  it('should turn an owner resource item into an injected project global env var', async () => {
    const owner = await registerUser(uniqueEmail('resource-owner'), 'Resource Owner');

    const apiConfigRes = await request(apiApp.getHttpServer())
      .post('/api/api-configs')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        name: 'Runtime LLM Config',
        apiType: 'openai',
        apiUrl: 'https://api.openai.com/v1',
        apiKey: 'test-key-resource-flow',
        modelName: 'gpt-test',
      })
      .expect(201);

    const projectRes = await request(apiApp.getHttpServer())
      .post('/api/projects')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        name: 'Owner Resource Item Flow',
        summary: 'Owner fills missing project env vars from an item.',
        brief: 'Lead should create an owner item for missing credentials before worker launch.',
        budgetAmount: 20,
        budgetCurrency: 'AIC',
      })
      .expect(201);

    const projectId = projectRes.body.id as string;

    const itemRes = await request(apiApp.getHttpServer())
      .post(`/api/projects/${projectId}/work-items`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        title: 'Provide GitHub token for worker runtimes',
        workType: 'INTEGRATION',
        status: 'READY',
        ownerId: owner.id,
        scopeBrief: 'Owner should fill the GitHub token required by worker agents.',
        acceptanceCriteria: 'The github_token project global is saved and available to runtimes.',
        inputPacket: {
          source: 'lead-agent-owner-resource-request',
          resourceRequest: {
            key: 'github_token',
            label: 'GitHub Token',
            description: 'Token used by worker agents to push branches and open PRs.',
            isSecret: true,
            category: 'github',
            value: '',
          },
        },
        outputContract: {
          expectedArtifact: 'CONFIG_UPDATE',
          handoffRequired: false,
        },
        priority: 95,
      })
      .expect(201);

    const missingValueRes = await request(apiApp.getHttpServer())
      .patch(`/api/projects/${projectId}/work-items/${itemRes.body.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ status: 'ACCEPTED' })
      .expect(400);

    expect(missingValueRes.body.message).toContain('Project resource value is required');

    await request(apiApp.getHttpServer())
      .patch(`/api/projects/${projectId}/work-items/${itemRes.body.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        status: 'ACCEPTED',
        inputPacket: {
          source: 'lead-agent-owner-resource-request',
          resourceRequest: {
            key: 'github_token',
            label: 'GitHub Token',
            description: 'Token used by worker agents to push branches and open PRs.',
            isSecret: true,
            category: 'github',
            value: 'github-owner-supplied-token',
          },
        },
      })
      .expect(200);

    const projectDetailRes = await request(apiApp.getHttpServer())
      .get(`/api/projects/${projectId}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);

    expect(projectDetailRes.body.projectGlobals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'github_token',
          label: 'GitHub Token',
          configured: true,
          value: 'github-owner-supplied-token',
        }),
      ]),
    );

    const launchedWorkerRes = await request(apiApp.getHttpServer())
      .post(`/api/projects/${projectId}/agent-runtimes/launch`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        role: 'WORKER_AGENT',
        llmConfigId: apiConfigRes.body.id,
        deploymentDays: 1,
      })
      .expect(201);

    expect(launchedWorkerRes.body.session.projectGlobalKeys).toContain('github_token');

    const envContents = await readFile(
      join(launchedWorkerRes.body.session.dataDir, 'AGENT_WORKSPACE_RUNTIME.env'),
      'utf8',
    );
    expect(envContents).toContain('export PROJECT_GLOBAL_GITHUB_TOKEN="github-owner-supplied-token"');
    expect(envContents).toContain('export GITHUB_TOKEN="github-owner-supplied-token"');
    expect(envContents).toContain('export GH_TOKEN="github-owner-supplied-token"');
  });

  it('should let a lead runtime dispatch work by launching a separate worker runtime', async () => {
    const owner = await registerUser(uniqueEmail('lead-dispatch-owner'), 'Lead Dispatch Owner');

    const apiConfigRes = await request(apiApp.getHttpServer())
      .post('/api/api-configs')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        name: 'Lead Dispatch LLM Config',
        apiType: 'openai',
        apiUrl: 'https://api.openai.com/v1',
        apiKey: 'test-key-lead-dispatch',
        modelName: 'gpt-test',
      })
      .expect(201);

    const projectRes = await request(apiApp.getHttpServer())
      .post('/api/projects')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        name: 'Valuable Task Discovery',
        summary: 'Lead should find valuable tasks and delegate scoped worker execution.',
        brief: 'Find valuable internet tasks, request missing resources from the owner, then dispatch worker work.',
        budgetAmount: 20,
        budgetCurrency: 'AIC',
      })
      .expect(201);

    const projectId = projectRes.body.id as string;

    const leadLaunchRes = await request(apiApp.getHttpServer())
      .post(`/api/projects/${projectId}/agent-runtimes/launch`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        role: 'LEAD_AGENT',
        llmConfigId: apiConfigRes.body.id,
        launchMode: 'local-runner',
        deploymentDays: 1,
      })
      .expect(201);

    const workItemRes = await request(apiApp.getHttpServer())
      .post(`/api/projects/${projectId}/work-items`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        title: 'Research generic valuable task sources',
        workType: 'RESEARCH',
        status: 'READY',
        scopeBrief: 'Find candidate task sources without assuming a social platform.',
        acceptanceCriteria: 'Worker reports candidate sources, API/resource needs, and verification evidence.',
        inputPacket: {
          source: 'lead-agent-test',
          resourceRequest: {
            key: 'task_source_api_key',
            label: 'Task Source API Key',
            description: 'Credential for an owner-approved task source API.',
            isSecret: true,
            category: 'task_source',
            required: true,
            createTaskOnMissing: true,
            value: 'owner-configured-in-test',
          },
        },
        outputContract: { expectedArtifact: 'RESEARCH_HANDOFF' },
        priority: 80,
      })
      .expect(201);

    const prisma = apiApp.get(PrismaService);
    const leadMember = await prisma.projectMember.findUniqueOrThrow({
      where: { id: leadLaunchRes.body.memberId },
      select: { permissions: true, userId: true },
    });
    const leadSession = (leadMember.permissions as any).runtimeSession;
    expect(leadSession.workspaceToken).toBeTruthy();
    expect(leadSession.scopes).toContain('ASSIGNMENT_DISPATCH');
    const runtimeToken = [
      'test',
      Buffer.from(
        JSON.stringify({
          projectId,
          runtimeId: leadSession.runtimeId,
          memberId: leadLaunchRes.body.memberId,
          grantId: leadSession.grantId,
          scopes: leadSession.scopes,
        }),
      ).toString('base64url'),
      'signature',
    ].join('.');

    const dispatchRes = await request(apiApp.getHttpServer())
      .post(`/api/projects/${projectId}/work-items/${workItemRes.body.id}/assignments/runtime-dispatch`)
      .set('Authorization', `Bearer ${runtimeToken}`)
      .send({
        role: 'WORKER_AGENT',
        launchIfMissing: true,
        launchMode: 'local-runner',
        deploymentDays: 1,
        objective: 'Research generic task-source opportunities and produce a handoff.',
        contextPacket: {
          source: 'lead-runtime-dispatch-test',
          notes: 'Use the project global task_source_api_key when available; keep source assumptions neutral.',
        },
      })
      .expect(201);

    expect(dispatchRes.body.launchedRuntime.role).toBe('WORKER_AGENT');
    expect(dispatchRes.body.launchedRuntime.memberId).not.toBe(leadLaunchRes.body.memberId);
    expect(dispatchRes.body.launchedRuntime.userId).not.toBe(leadMember.userId);
    expect(dispatchRes.body.launchedRuntime.session.provider).toBe('local-runner');
    expect(dispatchRes.body.assignment.assigneeUserId).toBe(dispatchRes.body.launchedRuntime.userId);
    expect(dispatchRes.body.assignment.contextPacket.objective).toBe(
      'Research generic task-source opportunities and produce a handoff.',
    );
    expect(dispatchRes.body.assignment.contextPacket.workItem.inputPacket.resourceRequest.key).toBe(
      'task_source_api_key',
    );

    const itemRes = await request(apiApp.getHttpServer())
      .get(`/api/projects/${projectId}/work-items/${workItemRes.body.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);

    expect(itemRes.body.status).toBe('ASSIGNED');
    expect(itemRes.body.ownerId).toBe(dispatchRes.body.launchedRuntime.userId);
    expect(itemRes.body.assignments[0].assigneeUserId).toBe(dispatchRes.body.launchedRuntime.userId);
    expect(itemRes.body.assignments[0].assigneeUserId).not.toBe(leadMember.userId);
  });

  it('should recreate a lead runtime after dismissing the template lead member', async () => {
    const owner = await registerUser(uniqueEmail('lead-recreate-owner'), 'Lead Recreate Owner');

    const apiConfigRes = await request(apiApp.getHttpServer())
      .post('/api/api-configs')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        name: 'Lead Recreate LLM Config',
        apiType: 'openai',
        apiUrl: 'https://api.openai.com/v1',
        apiKey: 'test-key-lead-recreate',
        modelName: 'gpt-test',
      })
      .expect(201);

    const projectRes = await request(apiApp.getHttpServer())
      .post('/api/projects')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        name: 'Lead Recreate Project',
        summary: 'Lead can be dismissed and recreated.',
        brief: 'Dismiss the template lead and start a replacement lead runtime.',
        budgetAmount: 20,
        budgetCurrency: 'AIC',
      })
      .expect(201);

    const projectId = projectRes.body.id as string;
    const prisma = apiApp.get(PrismaService);
    const initialLead = await prisma.projectMember.findFirstOrThrow({
      where: { projectId, role: 'LEAD_AGENT', removedAt: null },
      select: { id: true, userId: true },
    });

    await request(apiApp.getHttpServer())
      .delete(`/api/projects/${projectId}/members/${initialLead.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);

    await expect(
      prisma.projectMember.count({ where: { projectId, role: 'LEAD_AGENT', removedAt: null } }),
    ).resolves.toBe(0);

    const leadLaunchRes = await request(apiApp.getHttpServer())
      .post(`/api/projects/${projectId}/agent-runtimes/launch`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        role: 'LEAD_AGENT',
        llmConfigId: apiConfigRes.body.id,
        launchMode: 'local-runner',
        deploymentDays: 1,
      })
      .expect(201);

    expect(leadLaunchRes.body.role).toBe('LEAD_AGENT');
    expect(leadLaunchRes.body.memberId).not.toBe(initialLead.id);
    await expect(
      prisma.projectMember.count({ where: { projectId, role: 'LEAD_AGENT', removedAt: null } }),
    ).resolves.toBe(1);
    await expect(prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { leadAgentUserId: true } }))
      .resolves.toEqual({ leadAgentUserId: leadLaunchRes.body.userId });
  });
});
