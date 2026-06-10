import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: `.env.${process.env.NODE_ENV || 'development'}.local` });
dotenvConfig({ path: `.env.${process.env.NODE_ENV || 'development'}` });
dotenvConfig({ path: '.env.local' });
dotenvConfig({ path: '.env' });

import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { z } from 'zod';
import type { Request, Response, NextFunction } from 'express';
import Redis from 'ioredis';
import { ApiClient } from './api-client';
import { asToolErrorResult, asToolResult } from './tool-result';
import { checkRateLimit } from '../redis/rate-limit.util';

interface SessionState {
  server: McpServer;
  transport: StreamableHTTPServerTransport;
}

type TaskSortBy =
  | 'createdAt_desc'
  | 'reward_desc'
  | 'submission_count_desc'
  | 'comment_count_desc';

interface ListTasksArgs {
  status?: string;
  tag?: string;
  search?: string;
  taskSource?: 'CUSTOM' | 'GITHUB_ISSUE' | 'HACKERONE' | 'ERDOS_PROBLEM';
  codeType?: string;
  availableOnly?: boolean;
  excludeOwnCreated?: boolean;
  sortBy?: TaskSortBy;
  page?: number;
  limit?: number;
}

interface TaskIdArgs {
  taskId: string;
}

interface SubmissionIdArgs {
  submissionId: string;
}

interface CreateCommentArgs {
  taskId: string;
  content: string;
  fileUrls?: string[];
  parentId?: string;
  submissionId?: string;
}

interface SubmitTaskArgs {
  taskId: string;
  content: string;
  fileUrls?: string[];
}

interface SubmitPrArgs {
  taskId: string;
  prUrl: string;
  headSha: string;
  note?: string;
}

interface ListMyTasksArgs {
  status?: string;
  page?: number;
  limit?: number;
}

interface ListProjectsArgs {
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}

interface ProjectIdArgs {
  projectId: string;
}

interface ListProjectActivityArgs {
  projectId: string;
  limit?: number;
}

interface CreateProjectArgs {
  name: string;
  slug?: string;
  summary?: string;
  brief?: string;
  visibility?: string;
  leadAgentUserId?: string;
  budgetAmount?: number;
  budgetCurrency?: string;
  settings?: Record<string, unknown>;
}

interface SearchUsersArgs {
  q?: string;
  role?: string;
  limit?: number;
}

interface ListProjectWorkItemsArgs {
  projectId: string;
  status?: string;
  goalId?: string;
  featureId?: string;
  ownerId?: string;
  page?: number;
  limit?: number;
}

interface ProjectWorkItemArgs {
  projectId: string;
  workItemId: string;
}

interface ProjectMemberArgs {
  projectId: string;
  memberId: string;
}

interface CreateProjectMemberArgs {
  projectId: string;
  userId: string;
  role: string;
  permissions?: Record<string, unknown>;
}

interface CreateProjectWorkItemArgs {
  projectId: string;
  title: string;
  workType: string;
  status?: string;
  goalId?: string;
  featureId?: string;
  parentWorkItemId?: string;
  description?: string;
  scopeBrief?: string;
  acceptanceCriteria?: string;
  inputPacket?: Record<string, unknown>;
  outputContract?: Record<string, unknown>;
  dependsOn?: string[];
  priority?: number;
  ownerId?: string;
  dueAt?: string;
}

interface UpdateProjectWorkItemArgs {
  projectId: string;
  workItemId: string;
  title?: string;
  workType?: string;
  status?: string;
  description?: string;
  scopeBrief?: string;
  acceptanceCriteria?: string;
  inputPacket?: Record<string, unknown>;
  outputContract?: Record<string, unknown>;
  dependsOn?: string[];
  concurrencyMode?: 'SINGLE' | 'RACE' | 'MULTI_ROLE' | 'PRIMARY_BACKUP';
  priority?: number;
  ownerId?: string;
  dueAt?: string;
}

interface CreateProjectAssignmentArgs {
  projectId: string;
  workItemId: string;
  assigneeUserId: string;
  role: string;
  objective?: string;
  contextPacket?: Record<string, unknown>;
}

interface UpdateProjectAssignmentArgs {
  projectId: string;
  workItemId: string;
  assignmentId: string;
  status?: string;
  objective?: string;
  contextPacket?: Record<string, unknown>;
}

interface CreateProjectRunArgs {
  projectId: string;
  runType: string;
  workItemId: string;
  assignmentId?: string;
  instruction?: string;
  contextSnapshot?: Record<string, unknown>;
  resultSummary?: string;
  costInfo?: Record<string, unknown>;
}

interface ProjectRunArgs {
  projectId: string;
  runId: string;
}

interface UpdateProjectRunArgs {
  projectId: string;
  runId: string;
  status?: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
  instruction?: string;
  contextSnapshot?: Record<string, unknown>;
  resultSummary?: string;
  costInfo?: Record<string, unknown>;
}

interface CreateProjectRunLogArgs {
  projectId: string;
  runId: string;
  level?: string;
  message: string;
  metadata?: Record<string, unknown>;
}

interface CreateProjectArtifactArgs {
  projectId: string;
  artifactType: string;
  workItemId?: string;
  assignmentId?: string;
  runId?: string;
  title?: string;
  content?: string;
  url?: string;
  metadata?: Record<string, unknown>;
}

interface CreateProjectReviewArgs {
  projectId: string;
  workItemId: string;
  reviewerType: string;
  assignmentId?: string;
  artifactId?: string;
  status?: 'PENDING' | 'APPROVED' | 'CHANGES_REQUESTED' | 'REJECTED';
  reviewNote?: string;
  checklistResult?: Record<string, unknown>;
}

interface CreateProjectMemoryArgs {
  projectId: string;
  memoryType: string;
  title?: string;
  content: string;
  summary?: string;
  sourceArtifactId?: string;
  metadata?: Record<string, unknown>;
}

interface ReviewSubmissionArgs {
  submissionId: string;
  action: 'APPROVE' | 'REQUEST_REVISION' | 'REJECT';
  reviewNote?: string;
}

interface LoginArgs {
  email: string;
  password: string;
}

const sessions: Record<string, SessionState> = {};

/* ── Redis (optional) ── */
let redis: Redis | null = null;
if (process.env.REDIS_URL) {
  redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 3, lazyConnect: true });
  redis.connect().catch((err) => {
    console.error('MCP Redis connection failed:', err.message);
    redis = null;
  });
}

/* ── API Key auth middleware ── */
function apiKeyAuth(req: Request, res: Response, next: NextFunction) {
  const keysEnv = process.env.MCP_API_KEYS;
  if (!keysEnv) return next(); // no keys configured → open access (local dev)

  const validKeys = new Set(keysEnv.split(',').map((k) => k.trim()).filter(Boolean));
  if (validKeys.size === 0) return next();

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }

  const token = authHeader.slice(7);
  if (!validKeys.has(token)) {
    res.status(401).json({ error: 'Invalid API key' });
    return;
  }

  (req as any)._mcpApiKey = token;
  next();
}

/* ── MCP rate-limit middleware ── */
async function mcpRateLimit(req: Request, res: Response, next: NextFunction) {
  const maxReqs = parseInt(process.env.MCP_RATE_LIMIT_MAX || '30', 10);
  const windowSec = parseInt(process.env.MCP_RATE_LIMIT_WINDOW_SEC || '60', 10);
  const identifier = (req as any)._mcpApiKey || req.ip || 'unknown';

  try {
    const result = await checkRateLimit(redis, 'mcp', identifier, maxReqs, windowSec);
    if (result) {
      res.setHeader('X-RateLimit-Limit', result.limit);
      res.setHeader('X-RateLimit-Remaining', result.remaining);
      if (!result.allowed) {
        res.status(429).json({ error: 'Too many requests' });
        return;
      }
    }
  } catch (err) {
    console.warn('MCP rate limit check failed:', (err as Error).message);
  }
  next();
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return 'Unknown error';
}

function isInitializeRequest(body: unknown): boolean {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return false;
  }

  const candidate = body as { method?: unknown };
  return candidate.method === 'initialize';
}

function getApiBaseUrl(): string {
  if (process.env.AIFACTORY_API_BASE_URL) {
    return process.env.AIFACTORY_API_BASE_URL;
  }

  const apiPort = process.env.AIFACTORY_API_PORT || '3000';
  return `http://localhost:${apiPort}/api`;
}

function compactTaskForMcp(task: any) {
  if (!task || typeof task !== 'object') {
    return task;
  }

  const {
    comments,
    submissions,
    rawTask,
    ...rest
  } = task as Record<string, unknown> & {
    rawTask?: Record<string, unknown>;
  };

  const compactRawTask = rawTask
    ? {
        id: rawTask.id,
        source: rawTask.source,
        externalId: rawTask.externalId,
        externalUrl: rawTask.externalUrl,
        repoOwner: rawTask.repoOwner,
        repoName: rawTask.repoName,
        title: rawTask.title,
        labels: rawTask.labels,
        issueCreatedAt: rawTask.issueCreatedAt,
        issueUpdatedAt: rawTask.issueUpdatedAt,
        issueCommentCount: rawTask.issueCommentCount,
        repoStars: rawTask.repoStars,
        repoPrimaryLanguage: rawTask.repoPrimaryLanguage,
        repoHasGithubCi: rawTask.repoHasGithubCi,
        repoHasBuildManifest: rawTask.repoHasBuildManifest,
        buildSystemHints: rawTask.buildSystemHints,
        difficultyScore: rawTask.difficultyScore,
        estimatedReward: rawTask.estimatedReward,
        aiSummary: rawTask.aiSummary,
        bodyExcerpt:
          typeof rawTask.body === 'string' && rawTask.body.trim().length
            ? rawTask.body.slice(0, 2000)
            : undefined,
        aiTags: rawTask.aiTags,
        publishPriority: rawTask.publishPriority,
        publishReasons: rawTask.publishReasons,
        publishedTaskId: rawTask.publishedTaskId,
        fetchedAt: rawTask.fetchedAt,
        updatedAt: rawTask.updatedAt,
      }
    : undefined;

  return {
    ...rest,
    rawTask: compactRawTask,
  };
}

function compactProjectForMcp(project: any) {
  if (!project || typeof project !== 'object') {
    return project;
  }

  const { members, goals, features, ...rest } = project as Record<string, unknown>;
  return {
    ...rest,
    members: Array.isArray(members)
      ? members.map((member: any) => ({
          id: member.id,
          role: member.role,
          joinedAt: member.joinedAt,
          user: member.user,
        }))
      : members,
    goals,
    features,
  };
}

function buildServer(apiClient: ApiClient): McpServer {
  const server = new McpServer({
    name: 'agentcraft-mcp-server',
    version: '0.1.0',
  });

  const registerTool: (name: string, config: any, cb: any) => void = (name, config, cb) => {
    (server.registerTool as any)(name, config, cb);
  };

  registerTool(
    'search_users',
    {
      description: 'Search users for project staffing, hiring, and assignment.',
      inputSchema: {
        q: z.string().optional(),
        role: z.enum(['HUMAN', 'AI_AGENT', 'ADMIN']).optional(),
        limit: z.number().int().positive().max(50).optional(),
      },
    },
    async (args: SearchUsersArgs) => {
      try {
        const data = await apiClient.request('GET', '/users/search', {
          query: args as Record<string, unknown>,
          requiresAuth: true,
        });
        return asToolResult(data);
      } catch (error) {
        return asToolErrorResult(getErrorMessage(error));
      }
    },
  );

  registerTool(
    'list_projects',
    {
      description: 'List projects visible to the authenticated user.',
      inputSchema: {
        status: z.string().optional(),
        search: z.string().optional(),
        page: z.number().int().positive().optional(),
        limit: z.number().int().positive().max(100).optional(),
      },
    },
    async (args: ListProjectsArgs) => {
      try {
        const data = await apiClient.request('GET', '/projects', {
          query: args as Record<string, unknown>,
          requiresAuth: true,
        });
        return asToolResult(data);
      } catch (error) {
        return asToolErrorResult(getErrorMessage(error));
      }
    },
  );

  registerTool(
    'get_project',
    {
      description: 'Get a project detail by project ID.',
      inputSchema: {
        projectId: z.string().uuid(),
      },
    },
    async ({ projectId }: ProjectIdArgs) => {
      try {
        const data = await apiClient.request('GET', `/projects/${projectId}`, {
          requiresAuth: true,
        });
        return asToolResult(compactProjectForMcp(data));
      } catch (error) {
        return asToolErrorResult(getErrorMessage(error));
      }
    },
  );

  registerTool(
    'get_project_board',
    {
      description: 'Get the project board summary, lane health, recent delivery, and agent cockpit.',
      inputSchema: {
        projectId: z.string().uuid(),
      },
    },
    async ({ projectId }: ProjectIdArgs) => {
      try {
        const data = await apiClient.request('GET', `/projects/${projectId}/board`, {
          requiresAuth: true,
        });
        return asToolResult(data);
      } catch (error) {
        return asToolErrorResult(getErrorMessage(error));
      }
    },
  );

  registerTool(
    'list_project_activity',
    {
      description: 'List recent project activity across work items, runs, artifacts, reviews, memories, and logs.',
      inputSchema: {
        projectId: z.string().uuid(),
        limit: z.number().int().positive().max(100).optional(),
      },
    },
    async ({ projectId, ...query }: ListProjectActivityArgs) => {
      try {
        const data = await apiClient.request('GET', `/projects/${projectId}/activity`, {
          query: query as Record<string, unknown>,
          requiresAuth: true,
        });
        return asToolResult(data);
      } catch (error) {
        return asToolErrorResult(getErrorMessage(error));
      }
    },
  );

  registerTool(
    'get_project_cockpit',
    {
      description: 'Get project staffing load, member utilization, and active agent focus areas.',
      inputSchema: {
        projectId: z.string().uuid(),
      },
    },
    async ({ projectId }: ProjectIdArgs) => {
      try {
        const data = await apiClient.request('GET', `/projects/${projectId}/cockpit`, {
          requiresAuth: true,
        });
        return asToolResult(data);
      } catch (error) {
        return asToolErrorResult(getErrorMessage(error));
      }
    },
  );

  registerTool(
    'create_project',
    {
      description: 'Create a new project workspace.',
      inputSchema: {
        name: z.string().min(1),
        slug: z.string().optional(),
        summary: z.string().optional(),
        brief: z.string().optional(),
        visibility: z.string().optional(),
        leadAgentUserId: z.string().uuid().optional(),
        budgetAmount: z.number().nonnegative().optional(),
        budgetCurrency: z.string().optional(),
        settings: z.record(z.string(), z.unknown()).optional(),
      },
    },
    async (args: CreateProjectArgs) => {
      try {
        const data = await apiClient.request('POST', '/projects', {
          body: args,
          requiresAuth: true,
        });
        return asToolResult(compactProjectForMcp(data));
      } catch (error) {
        return asToolErrorResult(getErrorMessage(error));
      }
    },
  );

  registerTool(
    'list_project_members',
    {
      description: 'List active members participating in a project.',
      inputSchema: {
        projectId: z.string().uuid(),
      },
    },
    async ({ projectId }: ProjectIdArgs) => {
      try {
        const data = await apiClient.request('GET', `/projects/${projectId}/members`, {
          requiresAuth: true,
        });
        return asToolResult(data);
      } catch (error) {
        return asToolErrorResult(getErrorMessage(error));
      }
    },
  );

  registerTool(
    'add_project_member',
    {
      description: 'Hire or add a member to a project team.',
      inputSchema: {
        projectId: z.string().uuid(),
        userId: z.string().uuid(),
        role: z.string().min(1),
        permissions: z.record(z.string(), z.unknown()).optional(),
      },
    },
    async ({ projectId, ...body }: CreateProjectMemberArgs) => {
      try {
        const data = await apiClient.request('POST', `/projects/${projectId}/members`, {
          body,
          requiresAuth: true,
        });
        return asToolResult(data);
      } catch (error) {
        return asToolErrorResult(getErrorMessage(error));
      }
    },
  );

  registerTool(
    'remove_project_member',
    {
      description: 'Dismiss or remove a member from a project team.',
      inputSchema: {
        projectId: z.string().uuid(),
        memberId: z.string().uuid(),
      },
    },
    async ({ projectId, memberId }: ProjectMemberArgs) => {
      try {
        const data = await apiClient.request('DELETE', `/projects/${projectId}/members/${memberId}`, {
          requiresAuth: true,
        });
        return asToolResult(data);
      } catch (error) {
        return asToolErrorResult(getErrorMessage(error));
      }
    },
  );

  registerTool(
    'list_project_work_items',
    {
      description: 'List work items for a project.',
      inputSchema: {
        projectId: z.string().uuid(),
        status: z.string().optional(),
        goalId: z.string().uuid().optional(),
        featureId: z.string().uuid().optional(),
        ownerId: z.string().uuid().optional(),
        page: z.number().int().positive().optional(),
        limit: z.number().int().positive().max(100).optional(),
      },
    },
    async ({ projectId, ...query }: ListProjectWorkItemsArgs) => {
      try {
        const data = await apiClient.request('GET', `/projects/${projectId}/work-items`, {
          query: query as Record<string, unknown>,
          requiresAuth: true,
        });
        return asToolResult(data);
      } catch (error) {
        return asToolErrorResult(getErrorMessage(error));
      }
    },
  );

  registerTool(
    'get_project_work_item',
    {
      description: 'Get a project work item detail.',
      inputSchema: {
        projectId: z.string().uuid(),
        workItemId: z.string().uuid(),
      },
    },
    async ({ projectId, workItemId }: ProjectWorkItemArgs) => {
      try {
        const data = await apiClient.request('GET', `/projects/${projectId}/work-items/${workItemId}`, {
          requiresAuth: true,
        });
        return asToolResult(data);
      } catch (error) {
        return asToolErrorResult(getErrorMessage(error));
      }
    },
  );

  registerTool(
    'create_project_work_item',
    {
      description: 'Create a project work item inside a project. Include goalId when the item belongs to a known goal; if featureId is provided and that feature has a goal, the API will preserve that goal context.',
      inputSchema: {
        projectId: z.string().uuid(),
        title: z.string().min(1),
        workType: z.string().min(1),
        status: z.enum(['DRAFT', 'READY']).optional(),
        goalId: z.string().uuid().optional(),
        featureId: z.string().uuid().optional(),
        parentWorkItemId: z.string().uuid().optional(),
        description: z.string().optional(),
        scopeBrief: z.string().optional(),
        acceptanceCriteria: z.string().optional(),
        inputPacket: z.record(z.string(), z.unknown()).optional(),
        outputContract: z.record(z.string(), z.unknown()).optional(),
        dependsOn: z.array(z.string().uuid()).optional(),
        priority: z.number().optional(),
        ownerId: z.string().uuid().optional(),
        dueAt: z.string().optional(),
      },
    },
    async ({ projectId, ...body }: CreateProjectWorkItemArgs) => {
      try {
        const data = await apiClient.request('POST', `/projects/${projectId}/work-items`, {
          body,
          requiresAuth: true,
        });
        return asToolResult(data);
      } catch (error) {
        return asToolErrorResult(getErrorMessage(error));
      }
    },
  );

  registerTool(
    'update_project_work_item',
    {
      description:
        'Update a project work item. Use status ACCEPTED as the completed/finished state; READY marks a drafted item dispatchable.',
      inputSchema: {
        projectId: z.string().uuid(),
        workItemId: z.string().uuid(),
        title: z.string().min(1).optional(),
        workType: z.string().min(1).optional(),
        status: z
          .enum(['DRAFT', 'READY', 'ASSIGNED', 'IN_PROGRESS', 'IN_REVIEW', 'NEEDS_REVISION', 'ACCEPTED', 'REJECTED', 'CANCELLED'])
          .optional(),
        description: z.string().optional(),
        scopeBrief: z.string().optional(),
        acceptanceCriteria: z.string().optional(),
        inputPacket: z.record(z.string(), z.unknown()).optional(),
        outputContract: z.record(z.string(), z.unknown()).optional(),
        dependsOn: z.array(z.string().uuid()).optional(),
        concurrencyMode: z.enum(['SINGLE', 'RACE', 'MULTI_ROLE', 'PRIMARY_BACKUP']).optional(),
        priority: z.number().optional(),
        ownerId: z.string().uuid().optional(),
        dueAt: z.string().optional(),
      },
    },
    async ({ projectId, workItemId, ...body }: UpdateProjectWorkItemArgs) => {
      try {
        const data = await apiClient.request('PATCH', `/projects/${projectId}/work-items/${workItemId}`, {
          body,
          requiresAuth: true,
        });
        return asToolResult(data);
      } catch (error) {
        return asToolErrorResult(getErrorMessage(error));
      }
    },
  );

  registerTool(
    'create_project_assignment',
    {
      description: 'Assign a project member or agent to a work item.',
      inputSchema: {
        projectId: z.string().uuid(),
        workItemId: z.string().uuid(),
        assigneeUserId: z.string().uuid(),
        role: z.string().min(1),
        objective: z.string().optional(),
        contextPacket: z.record(z.string(), z.unknown()).optional(),
      },
    },
    async ({ projectId, workItemId, ...body }: CreateProjectAssignmentArgs) => {
      try {
        const data = await apiClient.request('POST', `/projects/${projectId}/work-items/${workItemId}/assignments`, {
          body,
          requiresAuth: true,
        });
        return asToolResult(data);
      } catch (error) {
        return asToolErrorResult(getErrorMessage(error));
      }
    },
  );

  registerTool(
    'update_project_assignment',
    {
      description: 'Update assignment status or objective for a project work item.',
      inputSchema: {
        projectId: z.string().uuid(),
        workItemId: z.string().uuid(),
        assignmentId: z.string().uuid(),
        status: z.enum(['PROPOSED', 'ACTIVE', 'PAUSED', 'COMPLETED', 'RELEASED', 'FAILED']).optional(),
        objective: z.string().optional(),
        contextPacket: z.record(z.string(), z.unknown()).optional(),
      },
    },
    async ({ projectId, workItemId, assignmentId, ...body }: UpdateProjectAssignmentArgs) => {
      try {
        const data = await apiClient.request(
          'PATCH',
          `/projects/${projectId}/work-items/${workItemId}/assignments/${assignmentId}`,
          {
            body,
            requiresAuth: true,
          },
        );
        return asToolResult(data);
      } catch (error) {
        return asToolErrorResult(getErrorMessage(error));
      }
    },
  );

  registerTool(
    'create_project_run',
    {
      description: 'Create an execution run for a project work item.',
      inputSchema: {
        projectId: z.string().uuid(),
        runType: z.string().min(1),
        workItemId: z.string().uuid(),
        assignmentId: z.string().uuid().optional(),
        instruction: z.string().optional(),
        contextSnapshot: z.record(z.string(), z.unknown()).optional(),
        resultSummary: z.string().optional(),
        costInfo: z.record(z.string(), z.unknown()).optional(),
      },
    },
    async ({ projectId, ...body }: CreateProjectRunArgs) => {
      try {
        const data = await apiClient.request('POST', `/projects/${projectId}/runs`, {
          body,
          requiresAuth: true,
        });
        return asToolResult(data);
      } catch (error) {
        return asToolErrorResult(getErrorMessage(error));
      }
    },
  );

  registerTool(
    'get_project_run',
    {
      description: 'Get a project run detail including logs and linked artifacts.',
      inputSchema: {
        projectId: z.string().uuid(),
        runId: z.string().uuid(),
      },
    },
    async ({ projectId, runId }: ProjectRunArgs) => {
      try {
        const data = await apiClient.request('GET', `/projects/${projectId}/runs/${runId}`, {
          requiresAuth: true,
        });
        return asToolResult(data);
      } catch (error) {
        return asToolErrorResult(getErrorMessage(error));
      }
    },
  );

  registerTool(
    'update_project_run',
    {
      description: 'Update project run status, summary, or execution context.',
      inputSchema: {
        projectId: z.string().uuid(),
        runId: z.string().uuid(),
        status: z.enum(['QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED']).optional(),
        instruction: z.string().optional(),
        contextSnapshot: z.record(z.string(), z.unknown()).optional(),
        resultSummary: z.string().optional(),
        costInfo: z.record(z.string(), z.unknown()).optional(),
      },
    },
    async ({ projectId, runId, ...body }: UpdateProjectRunArgs) => {
      try {
        const data = await apiClient.request('PATCH', `/projects/${projectId}/runs/${runId}`, {
          body,
          requiresAuth: true,
        });
        return asToolResult(data);
      } catch (error) {
        return asToolErrorResult(getErrorMessage(error));
      }
    },
  );

  registerTool(
    'list_project_run_logs',
    {
      description: 'List logs for a specific project run.',
      inputSchema: {
        projectId: z.string().uuid(),
        runId: z.string().uuid(),
      },
    },
    async ({ projectId, runId }: ProjectRunArgs) => {
      try {
        const data = await apiClient.request('GET', `/projects/${projectId}/runs/${runId}/logs`, {
          requiresAuth: true,
        });
        return asToolResult(data);
      } catch (error) {
        return asToolErrorResult(getErrorMessage(error));
      }
    },
  );

  registerTool(
    'create_project_run_log',
    {
      description: 'Append a log entry to a project run.',
      inputSchema: {
        projectId: z.string().uuid(),
        runId: z.string().uuid(),
        level: z.string().optional(),
        message: z.string().min(1),
        metadata: z.record(z.string(), z.unknown()).optional(),
      },
    },
    async ({ projectId, runId, ...body }: CreateProjectRunLogArgs) => {
      try {
        const data = await apiClient.request('POST', `/projects/${projectId}/runs/${runId}/logs`, {
          body,
          requiresAuth: true,
        });
        return asToolResult(data);
      } catch (error) {
        return asToolErrorResult(getErrorMessage(error));
      }
    },
  );

  registerTool(
    'create_project_artifact',
    {
      description: 'Create a project artifact for a work item or run.',
      inputSchema: {
        projectId: z.string().uuid(),
        artifactType: z.string().min(1),
        workItemId: z.string().uuid().optional(),
        assignmentId: z.string().uuid().optional(),
        runId: z.string().uuid().optional(),
        title: z.string().optional(),
        content: z.string().optional(),
        url: z.string().url().optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      },
    },
    async ({ projectId, ...body }: CreateProjectArtifactArgs) => {
      try {
        const data = await apiClient.request('POST', `/projects/${projectId}/artifacts`, {
          body,
          requiresAuth: true,
        });
        return asToolResult(data);
      } catch (error) {
        return asToolErrorResult(getErrorMessage(error));
      }
    },
  );

  registerTool(
    'create_project_review',
    {
      description: 'Create a project review and optionally update work item acceptance state.',
      inputSchema: {
        projectId: z.string().uuid(),
        workItemId: z.string().uuid(),
        reviewerType: z.string().min(1),
        assignmentId: z.string().uuid().optional(),
        artifactId: z.string().uuid().optional(),
        status: z.enum(['PENDING', 'APPROVED', 'CHANGES_REQUESTED', 'REJECTED']).optional(),
        reviewNote: z.string().optional(),
        checklistResult: z.record(z.string(), z.unknown()).optional(),
      },
    },
    async ({ projectId, ...body }: CreateProjectReviewArgs) => {
      try {
        const data = await apiClient.request('POST', `/projects/${projectId}/reviews`, {
          body,
          requiresAuth: true,
        });
        return asToolResult(data);
      } catch (error) {
        return asToolErrorResult(getErrorMessage(error));
      }
    },
  );

  registerTool(
    'create_project_memory',
    {
      description: 'Create a project memory entry that stores durable project facts or decisions.',
      inputSchema: {
        projectId: z.string().uuid(),
        memoryType: z.string().min(1),
        title: z.string().optional(),
        content: z.string().min(1),
        summary: z.string().optional(),
        sourceArtifactId: z.string().uuid().optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      },
    },
    async ({ projectId, ...body }: CreateProjectMemoryArgs) => {
      try {
        const data = await apiClient.request('POST', `/projects/${projectId}/memories`, {
          body,
          requiresAuth: true,
        });
        return asToolResult(data);
      } catch (error) {
        return asToolErrorResult(getErrorMessage(error));
      }
    },
  );

  registerTool(
    'list_tasks',
    {
      description: 'List marketplace tasks with filtering, sorting, and pagination.',
      inputSchema: {
        status: z.string().optional(),
        tag: z.string().optional(),
        search: z.string().optional(),
        taskSource: z.enum(['CUSTOM', 'GITHUB_ISSUE', 'HACKERONE', 'ERDOS_PROBLEM']).optional(),
        codeType: z.string().optional(),
        availableOnly: z.boolean().optional(),
        excludeOwnCreated: z.boolean().optional(),
        sortBy: z
          .enum([
            'createdAt_desc',
            'reward_desc',
            'submission_count_desc',
            'comment_count_desc',
          ])
          .optional(),
        page: z.number().int().positive().optional(),
        limit: z.number().int().positive().max(100).optional(),
      },
    },
    async (args: ListTasksArgs) => {
      try {
        const { excludeOwnCreated, ...queryArgs } = args;
        const data = await apiClient.request<any>('GET', '/tasks', {
          query: queryArgs as Record<string, unknown>,
        });

        if (!excludeOwnCreated) {
          return asToolResult(data);
        }

        let me: { id: string } | null = null;
        try {
          me = await apiClient.request<{ id: string }>('GET', '/auth/me', {
            requiresAuth: true,
          });
        } catch {
          return asToolResult(data);
        }
        const filteredItems = Array.isArray(data?.data)
          ? data.data.filter((task: { creatorId?: string | null }) => task?.creatorId !== me?.id)
          : data?.data;
        const filteredTotal = Array.isArray(filteredItems) ? filteredItems.length : data?.meta?.total;

        return asToolResult({
          ...data,
          data: filteredItems,
          meta: data?.meta
            ? {
                ...data.meta,
                total: filteredTotal,
                totalPages:
                  typeof data.meta.limit === 'number' && data.meta.limit > 0
                    ? Math.max(1, Math.ceil(filteredTotal / data.meta.limit))
                    : data.meta.totalPages,
              }
            : data?.meta,
        });
      } catch (error) {
        return asToolErrorResult(getErrorMessage(error));
      }
    },
  );

  registerTool(
    'get_task',
    {
      description: 'Get a task detail by task ID.',
      inputSchema: {
        taskId: z.string().uuid(),
      },
    },
    async ({ taskId }: TaskIdArgs) => {
      try {
        const data = await apiClient.request('GET', `/tasks/${taskId}`);
        return asToolResult(compactTaskForMcp(data));
      } catch (error) {
        return asToolErrorResult(getErrorMessage(error));
      }
    },
  );

  registerTool(
    'list_task_comments',
    {
      description: 'List threaded comments for a task.',
      inputSchema: {
        taskId: z.string().uuid(),
      },
    },
    async ({ taskId }: TaskIdArgs) => {
      try {
        const data = await apiClient.request('GET', `/comments/task/${taskId}`);
        return asToolResult(data);
      } catch (error) {
        return asToolErrorResult(getErrorMessage(error));
      }
    },
  );

  registerTool(
    'list_submission_comments',
    {
      description: 'List threaded comments for a submission.',
      inputSchema: {
        submissionId: z.string().uuid(),
      },
    },
    async ({ submissionId }: SubmissionIdArgs) => {
      try {
        const data = await apiClient.request('GET', `/comments/submission/${submissionId}`);
        return asToolResult(data);
      } catch (error) {
        return asToolErrorResult(getErrorMessage(error));
      }
    },
  );

  registerTool(
    'create_comment',
    {
      description: 'Create a comment on a task or on a specific submission thread.',
      inputSchema: {
        taskId: z.string().uuid(),
        content: z.string().min(1),
        fileUrls: z.array(z.string().url()).optional(),
        parentId: z.string().uuid().optional(),
        submissionId: z.string().uuid().optional(),
      },
    },
    async (args: CreateCommentArgs) => {
      const { taskId, ...body } = args;
      try {
        const data = await apiClient.request('POST', `/comments/task/${taskId}`, {
          body,
          requiresAuth: true,
        });
        return asToolResult(data);
      } catch (error) {
        return asToolErrorResult(getErrorMessage(error));
      }
    },
  );

  registerTool(
    'submit_task',
    {
      description: 'Submit work for a task.',
      inputSchema: {
        taskId: z.string().uuid(),
        content: z.string().min(1),
        fileUrls: z.array(z.string().url()).optional(),
      },
    },
    async (args: SubmitTaskArgs) => {
      const { taskId, ...body } = args;
      try {
        const data = await apiClient.request('POST', `/submissions/task/${taskId}`, {
          body,
          requiresAuth: true,
        });
        return asToolResult(data);
      } catch (error) {
        return asToolErrorResult(getErrorMessage(error));
      }
    },
  );

  registerTool(
    'submit_pr',
    {
      description: 'Submit a GitHub pull request for a GitHub Issue task.',
      inputSchema: {
        taskId: z.string().uuid(),
        prUrl: z.string().url(),
        headSha: z.string().min(7),
        note: z.string().optional(),
      },
    },
    async (args: SubmitPrArgs) => {
      const { taskId, ...body } = args;
      try {
        const data = await apiClient.request('POST', `/submissions/task/${taskId}/pr`, {
          body,
          requiresAuth: true,
        });
        return asToolResult(data);
      } catch (error) {
        return asToolErrorResult(getErrorMessage(error));
      }
    },
  );

  registerTool(
    'list_my_tasks',
    {
      description: 'List tasks created by the currently authenticated user.',
      inputSchema: {
        status: z.string().optional(),
        page: z.number().int().positive().optional(),
        limit: z.number().int().positive().max(100).optional(),
      },
    },
    async (args: ListMyTasksArgs) => {
      try {
        const data = await apiClient.request('GET', '/tasks/my', {
          query: args as Record<string, unknown>,
          requiresAuth: true,
        });
        return asToolResult(data);
      } catch (error) {
        return asToolErrorResult(getErrorMessage(error));
      }
    },
  );

  registerTool(
    'list_task_submissions',
    {
      description: 'List all submissions for a task.',
      inputSchema: {
        taskId: z.string().uuid(),
      },
    },
    async ({ taskId }: TaskIdArgs) => {
      try {
        const data = await apiClient.request('GET', `/submissions/task/${taskId}`);
        return asToolResult(data);
      } catch (error) {
        return asToolErrorResult(getErrorMessage(error));
      }
    },
  );

  registerTool(
    'review_submission',
    {
      description: 'Review a submission with APPROVE, REQUEST_REVISION, or REJECT.',
      inputSchema: {
        submissionId: z.string().uuid(),
        action: z.enum(['APPROVE', 'REQUEST_REVISION', 'REJECT']),
        reviewNote: z.string().optional(),
      },
    },
    async ({ submissionId, action, reviewNote }: ReviewSubmissionArgs) => {
      try {
        const data = await apiClient.request('POST', `/submissions/${submissionId}/review`, {
          body: { action, reviewNote },
          requiresAuth: true,
        });
        return asToolResult(data);
      } catch (error) {
        return asToolErrorResult(getErrorMessage(error));
      }
    },
  );

  registerTool(
    'login',
    {
      description: 'Login and cache JWT token for subsequent authenticated MCP tool calls.',
      inputSchema: {
        email: z.string().email(),
        password: z.string().min(1),
      },
    },
    async ({ email, password }: LoginArgs) => {
      try {
        const data = await apiClient.login(email, password);
        return asToolResult(data);
      } catch (error) {
        return asToolErrorResult(getErrorMessage(error));
      }
    },
  );

  registerTool(
    'login_with_token',
    {
      description: 'Authenticate using an existing JWT token. Validates the token and caches it for subsequent authenticated MCP tool calls.',
      inputSchema: {
        token: z.string().min(1),
      },
    },
    async ({ token }: { token: string }) => {
      try {
        apiClient.setAuthToken(token);
        const data = await apiClient.request('GET', '/auth/me', {
          requiresAuth: true,
        });
        return asToolResult(data);
      } catch (error) {
        apiClient.setAuthToken(undefined);
        return asToolErrorResult(getErrorMessage(error));
      }
    },
  );

  return server;
}

function createSessionTransport() {
  const apiClient = new ApiClient({
    baseUrl: getApiBaseUrl(),
    authToken: process.env.MCP_AUTH_TOKEN,
  });
  const server = buildServer(apiClient);

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (sessionId) => {
      sessions[sessionId] = { server, transport };
    },
  });

  transport.onclose = () => {
    const sessionId = transport.sessionId;
    if (sessionId && sessions[sessionId]) {
      delete sessions[sessionId];
    }
  };

  return { server, transport };
}

const app = createMcpExpressApp({ host: process.env.MCP_HOST || '0.0.0.0' });

app.use('/mcp', apiKeyAuth, mcpRateLimit);

app.post('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  try {
    if (sessionId && sessions[sessionId]) {
      await sessions[sessionId].transport.handleRequest(req, res, req.body);
      return;
    }

    if (!sessionId && isInitializeRequest(req.body)) {
      const { server, transport } = createSessionTransport();
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      return;
    }

    res.status(400).json({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Bad Request: Missing or invalid mcp-session-id',
      },
      id: null,
    });
  } catch (error) {
    console.error('Error handling MCP POST request:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error',
        },
        id: null,
      });
    }
  }
});

app.get('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  if (!sessionId || !sessions[sessionId]) {
    res.status(400).send('Invalid or missing mcp-session-id');
    return;
  }

  try {
    await sessions[sessionId].transport.handleRequest(req, res);
  } catch (error) {
    console.error('Error handling MCP GET request:', error);
    if (!res.headersSent) {
      res.status(500).send('Internal server error');
    }
  }
});

app.delete('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  if (!sessionId || !sessions[sessionId]) {
    res.status(400).send('Invalid or missing mcp-session-id');
    return;
  }

  try {
    await sessions[sessionId].transport.handleRequest(req, res);
  } catch (error) {
    console.error('Error handling MCP DELETE request:', error);
    if (!res.headersSent) {
      res.status(500).send('Internal server error');
    }
  }
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export function createMcpTestApp() {
  return app;
}

export async function shutdownMcpSessions() {
  const activeSessions = Object.values(sessions);
  for (const session of activeSessions) {
    try {
      await session.transport.close();
    } catch {
      // best effort shutdown
    }

    try {
      await session.server.close();
    } catch {
      // best effort shutdown
    }
  }
}

if (require.main === module) {
  const mcpPort = parseInt(process.env.MCP_PORT || '3001', 10);
  const server = app.listen(mcpPort, () => {
    console.log(`MCP Streamable HTTP server listening on http://localhost:${mcpPort}/mcp`);
    console.log(`AI Factory API base URL: ${getApiBaseUrl()}`);
  });

  process.on('SIGINT', async () => {
    await shutdownMcpSessions();
    server.close(() => process.exit(0));
  });

  process.on('SIGTERM', async () => {
    await shutdownMcpSessions();
    server.close(() => process.exit(0));
  });
}
