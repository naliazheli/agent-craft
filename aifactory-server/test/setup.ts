import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import * as bcrypt from 'bcryptjs';
import { config as loadEnv } from 'dotenv';
import { PrismaService } from '../src/prisma/prisma.service';
import { AgentWorkspaceClient } from '../src/projects/agent-workspace.client';

const DEFAULT_SYSTEM_EMAIL = 'system@aifactory.local';
const DEFAULT_REWARD_POOL_EMAIL = 'reward-pool@aifactory.local';
const DEFAULT_LEGACY_SYSTEM_EMAIL = 'legacy-system@example.com';
let schemaSynced = false;

function loadE2eEnv() {
  const projectRoot = join(__dirname, '..');
  const nodeEnv = process.env.NODE_ENV || 'test';
  loadEnv({ path: join(projectRoot, '.env'), quiet: true });
  loadEnv({ path: join(projectRoot, '.env.local'), override: true, quiet: true });
  loadEnv({ path: join(projectRoot, `.env.${nodeEnv}`), override: true, quiet: true });
  loadEnv({ path: join(projectRoot, `.env.${nodeEnv}.local`), override: true, quiet: true });
  process.env.LEGACY_SYSTEM_EMAIL ||= DEFAULT_LEGACY_SYSTEM_EMAIL;
}

function getDatabaseName(databaseUrl?: string) {
  if (!databaseUrl) {
    return '';
  }
  try {
    return new URL(databaseUrl).pathname.replace(/^\/+/, '').toLowerCase();
  } catch {
    return '';
  }
}

function assertSafeE2eDatabase() {
  loadE2eEnv();
  const databaseUrl = process.env.DATABASE_URL || '';
  const databaseName = getDatabaseName(databaseUrl);
  const explicitlyAllowed = process.env.ALLOW_DEV_DB_RESET === 'true';
  const isTestProcess = process.env.NODE_ENV === 'test' || Boolean(process.env.JEST_WORKER_ID);
  const isTestDatabase = databaseName.includes('test');

  if (!explicitlyAllowed && (!isTestProcess || !isTestDatabase)) {
    throw new Error(
      `Refusing to run e2e database reset against non-test database "${databaseName || 'unknown'}". ` +
      'Set DATABASE_URL to a dedicated test database, or set ALLOW_DEV_DB_RESET=true for a one-off local reset.',
    );
  }
}

function getSystemEmail() {
  return process.env.SYSTEM_USER_EMAIL || DEFAULT_SYSTEM_EMAIL;
}

function getRewardPoolEmail() {
  return process.env.REWARD_POOL_USER_EMAIL || DEFAULT_REWARD_POOL_EMAIL;
}

function getLegacySystemEmail() {
  return process.env.LEGACY_SYSTEM_EMAIL || DEFAULT_LEGACY_SYSTEM_EMAIL;
}

function getRewardPoolInitialBalance() {
  return parseInt(process.env.REWARD_POOL_INITIAL_BALANCE || '20000000', 10);
}

function ensureSchemaSynced() {
  if (schemaSynced) {
    return;
  }

  assertSafeE2eDatabase();
  const projectRoot = join(__dirname, '..');
  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      execSync('npx prisma migrate deploy', {
        cwd: projectRoot,
        stdio: 'pipe',
        env: process.env,
      });
      schemaSynced = true;
      return;
    } catch (error) {
      lastError = error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500 * (attempt + 1));
    }
  }

  throw lastError;
}

type CreateTestAppOptions = {
  mockAgentWorkspace?: boolean;
};

function slugify(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || `project-${Date.now()}`;
}

function normalizeMockProjectFilePath(input: string) {
  const value = input.trim().replace(/\\/g, '/').replace(/^\/+/, '');
  if (!value || value.includes('..') || value.includes('//')) {
    throw new Error('Invalid project file path');
  }
  return value;
}

function createMockAgentWorkspaceClient(prisma: PrismaService) {
  const runtimes = new Map<string, any>();
  const grants = new Map<string, any>();
  const projectFiles = new Map<string, any>();
  const projectFileKey = (projectId: string, filePath: string) => `${projectId}:${normalizeMockProjectFilePath(filePath)}`;

  return {
    getConfiguredBaseUrl() {
      return 'http://agent-workspace.test';
    },
    async createProject(body: Record<string, any>) {
      const projectId = randomUUID();
      const slug = body.slug || slugify(body.name);
      await prisma.project.create({
        data: {
          id: projectId,
          name: body.name,
          slug,
          summary: body.description,
          brief: body.initialContext?.brief,
          status: 'DRAFT' as any,
          visibility: body.visibility || 'private',
          ownerId: body.ownerUserId,
          leadAgentUserId: body.leadUserId,
          budgetAmount: body.budgetAmount ?? 0,
          budgetCurrency: body.budgetCurrency || 'AIC',
          settings: {
            ...(body.settings || {}),
            ...(body.githubUrl ? { githubUrl: body.githubUrl } : {}),
          },
        },
      });
      await prisma.projectMember.create({
        data: {
          projectId,
          userId: body.ownerUserId,
          role: 'OWNER',
          permissions: { source: 'test-workspace' },
        },
      });
      return { projectId };
    },
    async updateProject(projectId: string, body: Record<string, any>) {
      const current = await prisma.project.findUnique({ where: { id: projectId } });
      const settings = {
        ...((current?.settings && typeof current.settings === 'object' && !Array.isArray(current.settings)) ? current.settings : {}),
        ...(body.settings || {}),
        ...(body.githubUrl ? { githubUrl: body.githubUrl } : {}),
      };
      const updated = await prisma.project.update({
        where: { id: projectId },
        data: {
          name: body.name,
          summary: body.description,
          brief: body.brief,
          visibility: body.visibility,
          leadAgentUserId: body.leadUserId,
          budgetAmount: body.budgetAmount,
          budgetCurrency: body.budgetCurrency,
          settings,
        },
      });
      return {
        projectId: updated.id,
        name: updated.name,
        slug: updated.slug,
        status: updated.status,
        visibility: updated.visibility,
        githubUrl: (settings as any)?.githubUrl ?? null,
        ownerUserId: updated.ownerId,
        leadUserId: updated.leadAgentUserId,
        description: updated.summary,
        brief: updated.brief,
        budgetAmount: updated.budgetAmount,
        budgetCurrency: updated.budgetCurrency,
        summary: {},
        source: null,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      };
    },
    async getProject(projectId: string) {
      const project = await prisma.project.findUnique({ where: { id: projectId } });
      if (!project) throw new Error('Project not found');
      const settings = project.settings && typeof project.settings === 'object' && !Array.isArray(project.settings) ? project.settings as any : {};
      const [goalCount, openAssignmentCount] = await Promise.all([
        prisma.projectGoal.count({ where: { projectId } }),
        prisma.projectAssignment.count({ where: { projectId, status: { in: ['PROPOSED', 'ACTIVE', 'PAUSED'] as any } } }),
      ]);
      return {
        projectId: project.id,
        name: project.name,
        slug: project.slug,
        status: project.status,
        visibility: project.visibility,
        githubUrl: settings.githubUrl ?? null,
        ownerUserId: project.ownerId,
        leadUserId: project.leadAgentUserId,
        description: project.summary,
        brief: project.brief,
        budgetAmount: project.budgetAmount,
        budgetCurrency: project.budgetCurrency,
        summary: { goalCount, openAssignmentCount, openBlockerCount: 0 },
        source: settings.source ?? null,
        createdAt: project.createdAt.toISOString(),
        updatedAt: project.updatedAt.toISOString(),
      };
    },
    async listProjectGlobals(projectId: string, options: { includeValues?: boolean } = {}) {
      const project = await prisma.project.findUnique({ where: { id: projectId } });
      if (!project) throw new Error('Project not found');
      const settings = project.settings && typeof project.settings === 'object' && !Array.isArray(project.settings) ? project.settings as any : {};
      const settingsGlobals = Array.isArray(settings.projectGlobals) ? settings.projectGlobals : [];
      const records = await prisma.projectGlobalSecret.findMany({ where: { projectId } });
      const recordByKey = new Map(records.map((record) => [record.key, record]));
      const keys = new Set([...settingsGlobals.map((entry: any) => entry.key).filter(Boolean), ...records.map((record) => record.key)]);
      return {
        projectId,
        globals: [...keys].map((key) => {
          const configured = settingsGlobals.find((entry: any) => entry.key === key) || {};
          const record = recordByKey.get(key);
          const metadata = record?.metadata && typeof record.metadata === 'object' && !Array.isArray(record.metadata) ? record.metadata as any : {};
          return {
            key,
            label: configured.label || metadata.label || key,
            description: configured.description ?? metadata.description ?? null,
            isSecret: configured.isSecret ?? metadata.isSecret ?? true,
            required: configured.required ?? metadata.required ?? true,
            createTaskOnMissing: configured.createTaskOnMissing ?? metadata.createTaskOnMissing ?? true,
            category: configured.category ?? metadata.category ?? null,
            configured: Boolean(record?.encryptedValue),
            ...(options.includeValues ? { value: record?.encryptedValue || '' } : {}),
          };
        }),
      };
    },
	    async updateProjectGlobals(projectId: string, globals: any[]) {
	      const project = await prisma.project.findUnique({ where: { id: projectId } });
      if (!project) throw new Error('Project not found');
      const desiredKeys = globals.map((entry) => entry.key).filter(Boolean);
      await prisma.projectGlobalSecret.deleteMany({
        where: desiredKeys.length ? { projectId, key: { notIn: desiredKeys } } : { projectId },
      });
      for (const entry of globals) {
        if (!entry.key || entry.value == null || String(entry.value) === '') {
          await prisma.projectGlobalSecret.deleteMany({ where: { projectId, key: entry.key } });
          continue;
        }
        await prisma.projectGlobalSecret.upsert({
          where: { projectId_key: { projectId, key: entry.key } },
          create: {
            projectId,
            key: entry.key,
            encryptedValue: String(entry.value),
            metadata: {
              label: entry.label || entry.key,
              description: entry.description || null,
              isSecret: Boolean(entry.isSecret),
              required: entry.required !== false,
              createTaskOnMissing: entry.createTaskOnMissing !== false,
              category: entry.category || null,
            },
          },
          update: {
            encryptedValue: String(entry.value),
            metadata: {
              label: entry.label || entry.key,
              description: entry.description || null,
              isSecret: Boolean(entry.isSecret),
              required: entry.required !== false,
              createTaskOnMissing: entry.createTaskOnMissing !== false,
              category: entry.category || null,
            },
          },
        });
      }
      const existingSettings = project.settings && typeof project.settings === 'object' && !Array.isArray(project.settings) ? project.settings as any : {};
      await prisma.project.update({
        where: { id: projectId },
        data: {
          settings: {
            ...existingSettings,
            projectGlobals: globals.map((entry) => ({
              key: entry.key,
              label: entry.label || entry.key,
              description: entry.description || null,
              isSecret: Boolean(entry.isSecret),
              required: entry.required !== false,
              createTaskOnMissing: entry.createTaskOnMissing !== false,
              category: entry.category || null,
            })),
          },
        },
      });
      return this.listProjectGlobals(projectId, { includeValues: true });
    },
    async installCapabilityBundle(projectId: string, body: Record<string, any>) {
      return {
        projectId,
        ...body,
        status: body.status || 'ACTIVE',
      };
    },
    async listProjectMemories(projectId: string, query: Record<string, any> = {}) {
      const memories = await prisma.projectMemory.findMany({
        where: {
          projectId,
          ...(query.memoryType ? { memoryType: query.memoryType } : {}),
        },
        include: {
          createdByUser: { select: { id: true, email: true, displayName: true, role: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: query.limit ?? 50,
      });
      return { projectId, memories };
    },
    async createProjectMemory(projectId: string, body: Record<string, any>) {
      const project = await prisma.project.findUnique({ where: { id: projectId } });
      if (!project) throw new Error('Project not found');
      return prisma.projectMemory.create({
        data: {
          projectId,
          memoryType: body.memoryType,
          title: body.title,
          content: body.content,
          summary: body.summary,
          metadata: body.metadata,
          sourceArtifactId: body.sourceArtifactId,
          createdByUserId: body.createdByUserId || project.ownerId,
        },
        include: {
          createdByUser: { select: { id: true, email: true, displayName: true, role: true } },
        },
      });
    },
    async getBoard(projectId: string) {
      const [memberCount, goals, workItems, assignments, pendingReviews] = await Promise.all([
        prisma.projectMember.count({ where: { projectId, removedAt: null } }),
        prisma.projectGoal.findMany({
          where: { projectId },
          select: { id: true, title: true, status: true, sortOrder: true },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        }),
        prisma.projectWorkItem.findMany({
          where: { projectId },
          select: { id: true, title: true, status: true, priority: true, featureId: true, ownerId: true },
          orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
          take: 50,
        }),
        prisma.projectAssignment.findMany({
          where: { projectId },
          select: { id: true, workItemId: true, assigneeUserId: true, status: true, role: true, updatedAt: true },
          orderBy: { updatedAt: 'desc' },
          take: 50,
        }),
        prisma.projectReview.count({ where: { projectId, status: 'PENDING' as any } }),
      ]);
      return {
        projectId,
        summary: {
          memberCount,
          openAssignments: assignments.filter((item) => ['PROPOSED', 'ACTIVE', 'PAUSED'].includes(item.status)).length,
          pendingReviews,
          openCiIncidents: 0,
        },
        memberPresence: [],
        goalSummaries: goals,
        assignmentSummaries: assignments,
        workItemSummaries: workItems,
        inboxSummary: [],
      };
    },
    async listMembers(projectId: string) {
      const members = await prisma.projectMember.findMany({
        where: { projectId, removedAt: null },
        include: { user: { select: { id: true, email: true, displayName: true, role: true } } },
        orderBy: { joinedAt: 'asc' },
      });
      return members.map((member) => ({
        memberId: member.id,
        userId: member.userId,
        displayName: member.user.displayName || member.user.email,
        role: member.role,
        permissions: member.permissions,
        runtime: null,
        activeGrants: [],
        presence: null,
        joinedAt: member.joinedAt.toISOString(),
      }));
    },
    async createAssignment(projectId: string, body: Record<string, any>) {
      const assignee = await prisma.projectMember.findFirst({
        where: { id: body.assigneeMemberId, projectId, removedAt: null },
      });
      if (!assignee) throw new Error('Project member not found');
      const workItem = await prisma.projectWorkItem.findFirst({ where: { id: body.workItemId, projectId } });
      if (!workItem) throw new Error('Work item not found');
      const assignment = await prisma.projectAssignment.create({
        data: {
          projectId,
          workItemId: body.workItemId,
          assigneeUserId: assignee.userId,
          assignedByUserId: body.assignedByUserId,
          role: body.role,
          objective: body.objective || workItem.title,
          contextPacket: body.contextPacket,
        },
      });
      await prisma.projectWorkItem.update({
        where: { id: body.workItemId },
        data: { status: 'ASSIGNED' as any, ownerId: assignee.userId },
      });
      return { assignmentId: assignment.id, status: assignment.status, inboxItemId: randomUUID() };
    },
    async registerRuntime(body: Record<string, any>) {
      const runtimeId = body.runtimeId || randomUUID();
      runtimes.set(runtimeId, { ...body, runtimeId, status: 'REGISTERED' });
      return { runtimeId, status: 'REGISTERED', registeredAt: new Date().toISOString() };
    },
    async issueAccessGrant(_projectId: string, body: Record<string, any>) {
      const grantId = randomUUID();
      grants.set(grantId, { ...body, grantId, status: 'ACTIVE' });
      return { grantId, status: 'ACTIVE', scopes: body.scopes, expiresAt: null };
    },
    async mintAccessToken(grantId: string) {
      if (!grants.has(grantId)) throw new Error('Access grant not found');
      return { token: `test-token-${grantId}`, tokenType: 'Bearer', expiresIn: 3600, grantId };
    },
    async resumeRuntime() {
      return {};
    },
    async heartbeatRuntime() {
      return { accepted: true, recordedAt: new Date().toISOString() };
    },
    async listProjectFiles(projectId: string, query: Record<string, any> = {}) {
      const prefix = query.prefix ? normalizeMockProjectFilePath(String(query.prefix)) : '';
      const search = query.q ? String(query.q).toLowerCase() : '';
      const limit = query.limit ? Number(query.limit) : 100;
      const files = [...projectFiles.values()]
        .filter((file) => file.projectId === projectId)
        .filter((file) => (prefix ? file.path.startsWith(prefix) : true))
        .filter((file) => (search ? file.path.toLowerCase().includes(search) : true))
        .sort((a, b) => a.path.localeCompare(b.path))
        .slice(0, limit)
        .map(({ content, ...file }) => file);
      return { projectId, files, isTruncated: false };
    },
    async getProjectFileDownloadUrl(projectId: string, filePath: string) {
      const path = normalizeMockProjectFilePath(filePath);
      const file = projectFiles.get(projectFileKey(projectId, path));
      if (!file) throw new Error('Project file not found');
      return { projectId, path, key: file.key, url: `mock://project-files/${projectId}/${path}` };
    },
    async readProjectFile(projectId: string, filePath: string, encoding: 'text' | 'base64' = 'text') {
      const path = normalizeMockProjectFilePath(filePath);
      const file = projectFiles.get(projectFileKey(projectId, path));
      if (!file) throw new Error('Project file not found');
      return {
        projectId,
        path,
        key: file.key,
        size: file.size,
        contentType: file.contentType,
        encoding,
        content: encoding === 'base64' ? Buffer.from(file.content).toString('base64') : file.content,
      };
    },
    async uploadProjectFile(projectId: string, file: any, filePath?: string) {
      const path = normalizeMockProjectFilePath(filePath || file?.originalname || 'upload.bin');
      const content = Buffer.isBuffer(file?.buffer) ? file.buffer.toString('utf8') : String(file?.buffer || '');
      const entry = {
        projectId,
        path,
        key: `projects/${projectId}/files/${path}`,
        size: Buffer.byteLength(content),
        contentType: file?.mimetype || 'application/octet-stream',
        lastModified: new Date().toISOString(),
        etag: `"${Buffer.from(`${projectId}:${path}:${content.length}`).toString('base64')}"`,
        downloadUrl: `mock://project-files/${projectId}/${path}`,
        content,
      };
      projectFiles.set(projectFileKey(projectId, path), entry);
      const { content: _content, ...publicEntry } = entry;
      return publicEntry;
    },
  };
}

export async function createTestApp(options: CreateTestAppOptions = {}): Promise<INestApplication> {
  ensureSchemaSynced();
  // Load the app only after test env safety checks so ConfigModule sees .env.test first.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { AppModule } = require('../src/app.module');

  const builder = Test.createTestingModule({
    imports: [AppModule],
  });

  if (options.mockAgentWorkspace) {
    builder.overrideProvider(AgentWorkspaceClient).useFactory({
      inject: [PrismaService],
      factory: (prisma: PrismaService) => createMockAgentWorkspaceClient(prisma),
    });
  }

  const moduleFixture: TestingModule = await builder.compile();

  const app = moduleFixture.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.init();
  return app;
}

export async function cleanDatabase(app: INestApplication): Promise<void> {
  assertSafeE2eDatabase();
  const prisma = app.get(PrismaService);
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await prisma.projectRunLog.deleteMany();
      await prisma.projectReview.deleteMany();
      await prisma.projectArtifact.deleteMany();
      await prisma.projectRun.deleteMany();
      await prisma.projectAssignment.deleteMany();
      await prisma.projectWorkItem.deleteMany();
      await prisma.projectFeature.deleteMany();
      await prisma.projectGoal.deleteMany();
      await prisma.projectMemory.deleteMany();
      await prisma.projectMember.deleteMany();
      await prisma.project.deleteMany();
      await prisma.agentSessionLog.deleteMany();
      await prisma.agentSession.deleteMany();
      await prisma.agentStats.deleteMany();
      await prisma.apiConfig.deleteMany();
      await prisma.taskGeneratorRun.deleteMany();
      await prisma.comment.deleteMany();
      await prisma.submission.deleteMany();
      await prisma.transaction.deleteMany();
      await prisma.report.deleteMany();
      await prisma.rawTask.deleteMany();
      await prisma.task.deleteMany();
      await prisma.mathProblem.deleteMany();
      await prisma.emailVerificationCode.deleteMany();
      await prisma.user.deleteMany();

      await ensureEconomyUsers(prisma);
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
    }
  }

  throw lastError;
}

async function ensureEconomyUsers(prisma: PrismaService): Promise<void> {
  const passwordHash = await bcrypt.hash(process.env.SYSTEM_USER_PASSWORD || 'change-me-local', 10);
  const legacyPasswordHash = await bcrypt.hash('legacy-user-password', 10);
  const systemEmail = getSystemEmail();
  const rewardPoolEmail = getRewardPoolEmail();
  process.env.LEGACY_SYSTEM_EMAIL = getLegacySystemEmail();
  await prisma.user.createMany({
    data: [
      {
        email: systemEmail,
        passwordHash,
        displayName: 'AI Factory System',
        role: 'ADMIN',
        balance: 0,
        isEmailVerified: true,
      },
      {
        email: rewardPoolEmail,
        passwordHash,
        displayName: 'AI Factory Reward Pool',
        role: 'ADMIN',
        balance: getRewardPoolInitialBalance(),
        isEmailVerified: true,
      },
      {
        email: getLegacySystemEmail(),
        passwordHash: legacyPasswordHash,
        displayName: 'Legacy User',
        role: 'HUMAN',
        balance: 5,
        isEmailVerified: true,
      },
    ],
    skipDuplicates: true,
  });
}
