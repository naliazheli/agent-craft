import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp, cleanDatabase } from './setup';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Tasks (e2e)', () => {
  let app: INestApplication;
  let userSequence = 0;

  beforeEach(async () => {
    app = await createTestApp();
    await cleanDatabase(app);
  });

  afterEach(async () => {
    await app.close();
  });

  function uniqueEmail(prefix: string) {
    userSequence += 1;
    return `${prefix}-${Date.now()}-${userSequence}@example.com`;
  }

  const taskData = {
    title: 'Build a landing page',
    description: 'Create a responsive landing page with React and TailwindCSS',
    acceptanceCriteria: 'Must pass Lighthouse > 90',
    codeType: 'typescript',
    reward: 2,
    tags: ['frontend', 'react'],
  };

  /** Helper: clean DB and register creator + worker, return tokens and IDs */
  async function setupUsers() {
    const creatorEmail = uniqueEmail('creator');
    const workerEmail = uniqueEmail('worker');

    const creator = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: creatorEmail, password: 'password123', displayName: 'Creator' })
      .expect(201);

    const worker = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: workerEmail, password: 'password123', displayName: 'Worker' })
      .expect(201);

    return {
      creatorToken: creator.body.access_token,
      creatorId: creator.body.user.id,
      workerToken: worker.body.access_token,
      workerId: worker.body.user.id,
    };
  }

  async function loginSystemUser() {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: process.env.SYSTEM_USER_EMAIL || 'system@aifactory.local',
        password: process.env.SYSTEM_USER_PASSWORD || 'change-me-local',
      })
      .expect(200);

    return res.body.access_token as string;
  }

  describe('POST /api/tasks', () => {
    it('should create a task', async () => {
      const { creatorToken, creatorId } = await setupUsers();
      const res = await request(app.getHttpServer())
        .post('/api/tasks')
        .set('Authorization', `Bearer ${creatorToken}`)
        .send(taskData)
        .expect(201);

      expect(res.body.title).toBe(taskData.title);
      expect(res.body.description).toBe(taskData.description);
      expect(res.body.reward).toBe(2);
      expect(res.body.status).toBe('OPEN');
      expect(res.body.codeType).toBe('typescript');
      expect(res.body.tags).toEqual(['frontend', 'react']);
      expect(res.body.creatorId).toBe(creatorId);
    });

    it('should reject unauthenticated request', async () => {
      await request(app.getHttpServer())
        .post('/api/tasks')
        .send(taskData)
        .expect(401);
    });

    it('should reject missing title', async () => {
      const { creatorToken } = await setupUsers();
      await request(app.getHttpServer())
        .post('/api/tasks')
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({ description: 'No title', reward: 2 })
        .expect(400);
    });

    it('should reject negative reward', async () => {
      const { creatorToken } = await setupUsers();
      await request(app.getHttpServer())
        .post('/api/tasks')
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({ ...taskData, reward: -1 })
        .expect(400);
    });
  });

  describe('GET /api/tasks', () => {
    it('should list all tasks', async () => {
      const { creatorToken } = await setupUsers();
      await request(app.getHttpServer())
        .post('/api/tasks')
        .set('Authorization', `Bearer ${creatorToken}`)
        .send(taskData);
      await request(app.getHttpServer())
        .post('/api/tasks')
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({ ...taskData, title: 'Second task', reward: 1, tags: ['backend'] });

      const res = await request(app.getHttpServer())
        .get('/api/tasks')
        .expect(200);

      expect(res.body.data).toHaveLength(2);
      expect(res.body.meta.total).toBe(2);
    });

    it('should filter by status', async () => {
      const { creatorToken } = await setupUsers();
      await request(app.getHttpServer())
        .post('/api/tasks')
        .set('Authorization', `Bearer ${creatorToken}`)
        .send(taskData);

      const res = await request(app.getHttpServer())
        .get('/api/tasks?status=OPEN')
        .expect(200);

      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      res.body.data.forEach((task: any) => {
        expect(task.status).toBe('OPEN');
      });
    });

    it('should search by keyword', async () => {
      const { creatorToken } = await setupUsers();
      await request(app.getHttpServer())
        .post('/api/tasks')
        .set('Authorization', `Bearer ${creatorToken}`)
        .send(taskData);
      await request(app.getHttpServer())
        .post('/api/tasks')
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({ ...taskData, title: 'Second task', reward: 1, tags: ['backend'] });

      const res = await request(app.getHttpServer())
        .get('/api/tasks?search=Second')
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].title).toBe('Second task');
    });

    it('should paginate results', async () => {
      const { creatorToken } = await setupUsers();
      await request(app.getHttpServer())
        .post('/api/tasks')
        .set('Authorization', `Bearer ${creatorToken}`)
        .send(taskData);
      await request(app.getHttpServer())
        .post('/api/tasks')
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({ ...taskData, title: 'Second task', reward: 1 });

      const res = await request(app.getHttpServer())
        .get('/api/tasks?page=1&limit=1')
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.meta.total).toBe(2);
      expect(res.body.meta.totalPages).toBe(2);
    });

    it('should filter by code type', async () => {
      const { creatorToken } = await setupUsers();
      await request(app.getHttpServer())
        .post('/api/tasks')
        .set('Authorization', `Bearer ${creatorToken}`)
        .send(taskData);
      await request(app.getHttpServer())
        .post('/api/tasks')
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({ ...taskData, title: 'Python task', codeType: 'python', tags: ['backend'] });

      const res = await request(app.getHttpServer())
        .get('/api/tasks?codeType=python')
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].codeType).toBe('python');
    });
  });

  describe('GET /api/tasks/:id', () => {
    it('should return task detail with submissions', async () => {
      const { creatorToken } = await setupUsers();
      const created = await request(app.getHttpServer())
        .post('/api/tasks')
        .set('Authorization', `Bearer ${creatorToken}`)
        .send(taskData);

      const res = await request(app.getHttpServer())
        .get(`/api/tasks/${created.body.id}`)
        .expect(200);

      expect(res.body.id).toBe(created.body.id);
      expect(res.body.title).toBe(taskData.title);
      expect(res.body).toHaveProperty('submissions');
      expect(res.body).toHaveProperty('creator');
    });

    it('should return 404 for non-existent task', async () => {
      await request(app.getHttpServer())
        .get('/api/tasks/00000000-0000-0000-0000-000000000000')
        .expect(404);
    });

    it('should publish scored raw github issue with source metadata', async () => {
      const prisma = app.get(PrismaService);
      const systemUser = await prisma.user.findUnique({
        where: { email: process.env.SYSTEM_USER_EMAIL || 'system@aifactory.local' },
      });
      expect(systemUser).toBeTruthy();

      await prisma.rawTask.create({
        data: {
          source: 'GITHUB_ISSUE',
          externalId: '42',
          externalUrl: 'https://github.com/naliazheli/world-test/issues/42',
          repoOwner: 'naliazheli',
          repoName: 'world-test',
          title: 'Fix navbar overflow',
          body: 'The navbar overflows on small screens.',
          status: 'SCORED',
          repoPrimaryLanguage: 'TypeScript',
          difficultyScore: 3,
          valueScore: 4,
          estimatedReward: 8,
          aiSummary: 'Fix the mobile navigation overflow in the header.',
          aiTags: ['frontend', 'css'],
          shouldPublish: true,
        },
      });

      const systemToken = await loginSystemUser();
      const publishRes = await request(app.getHttpServer())
        .post('/api/task-generator/publish')
        .set('Authorization', `Bearer ${systemToken}`)
        .expect(200);

      expect(publishRes.body.published).toBe(1);

      const taskRes = await request(app.getHttpServer())
        .get('/api/tasks')
        .expect(200);

      expect(taskRes.body.data).toHaveLength(1);
      expect(taskRes.body.data[0]).toMatchObject({
        taskSource: 'GITHUB_ISSUE',
        sourceUrl: 'https://github.com/naliazheli/world-test/issues/42',
        sourceRepo: 'naliazheli/world-test',
        sourceIssueNumber: 42,
        codeType: 'typescript',
      });
    });

    it('should queue a background score-and-publish run', async () => {
      const prisma = app.get(PrismaService);

      await prisma.rawTask.create({
        data: {
          source: 'GITHUB_ISSUE',
          externalId: '77',
          externalUrl: 'https://github.com/naliazheli/world-test/issues/77',
          repoOwner: 'naliazheli',
          repoName: 'world-test',
          title: 'Fix flaky TypeScript build',
          body: 'Build fails after a dependency update.',
          status: 'PENDING',
          repoPrimaryLanguage: 'TypeScript',
          repoHasBuildManifest: true,
          buildSystemHints: ['pnpm'],
          repoHasGithubCi: true,
          repoStars: 1000,
          issueCreatedAt: new Date(),
          issueUpdatedAt: new Date(),
        },
      });

      const systemToken = await loginSystemUser();
      const queued = await request(app.getHttpServer())
        .post('/api/task-generator/runs')
        .set('Authorization', `Bearer ${systemToken}`)
        .send({ type: 'SCORE_AND_PUBLISH', batchSize: 10 })
        .expect(202);

      expect(queued.body.status).toBe('QUEUED');

      const fetchedRun = await request(app.getHttpServer())
        .get(`/api/task-generator/runs/${queued.body.id}`)
        .set('Authorization', `Bearer ${systemToken}`)
        .expect(200);

      expect(['QUEUED', 'RUNNING', 'COMPLETED']).toContain(fetchedRun.body.status);
      expect(fetchedRun.body.type).toBe('SCORE_AND_PUBLISH');
    });

    it('should expose lifecycle state for raw tasks', async () => {
      const prisma = app.get(PrismaService);
      const systemUser = await prisma.user.findUnique({
        where: { email: process.env.SYSTEM_USER_EMAIL || 'system@aifactory.local' },
      });
      expect(systemUser).toBeTruthy();

      const rawTask = await prisma.rawTask.create({
        data: {
          source: 'GITHUB_ISSUE',
          externalId: '99',
          externalUrl: 'https://github.com/naliazheli/world-test/issues/99',
          repoOwner: 'naliazheli',
          repoName: 'world-test',
          title: 'Investigate flaky publish state',
          body: 'Need better lifecycle tracking for generated tasks.',
          status: 'PUBLISHED',
          shouldPublish: true,
          publishedTask: {
            create: {
              title: '[GitHub] Investigate flaky publish state',
              description: 'Lifecycle tracking demo task',
              reward: 10,
              currency: 'AIC',
              creatorId: systemUser!.id,
              taskSource: 'GITHUB_ISSUE',
              sourceUrl: 'https://github.com/naliazheli/world-test/issues/99',
              sourceRepo: 'naliazheli/world-test',
              sourceIssueNumber: 99,
            },
          },
        },
        include: {
          publishedTask: true,
        },
      });

      const systemToken = await loginSystemUser();
      const res = await request(app.getHttpServer())
        .get('/api/task-generator/raw-tasks')
        .set('Authorization', `Bearer ${systemToken}`)
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0]).toMatchObject({
        id: rawTask.id,
        status: 'PUBLISHED',
        processingStage: 'PUBLISHED',
        processingLabel: 'Published',
        publishedTask: {
          id: rawTask.publishedTaskId,
          status: 'OPEN',
          submissionCount: 0,
        },
      });
    });

    it('should filter raw tasks by handled lifecycle state', async () => {
      const prisma = app.get(PrismaService);
      const systemUser = await prisma.user.findUnique({
        where: { email: process.env.SYSTEM_USER_EMAIL || 'system@aifactory.local' },
      });
      expect(systemUser).toBeTruthy();

      await prisma.rawTask.create({
        data: {
          source: 'GITHUB_ISSUE',
          externalId: '100',
          externalUrl: 'https://github.com/naliazheli/world-test/issues/100',
          repoOwner: 'naliazheli',
          repoName: 'world-test',
          title: 'Pending raw task',
          body: 'Still waiting for scoring.',
          status: 'PENDING',
        },
      });

      await prisma.rawTask.create({
        data: {
          source: 'GITHUB_ISSUE',
          externalId: '101',
          externalUrl: 'https://github.com/naliazheli/world-test/issues/101',
          repoOwner: 'naliazheli',
          repoName: 'world-test',
          title: 'Filtered raw task',
          body: 'Blocked by policy.',
          status: 'SKIPPED',
          shouldPublish: false,
          publishReasons: ['low_signal_labels'],
          publishedTask: {
            create: {
              title: '[GitHub] Filtered raw task',
              description: 'Should still be considered handled.',
              reward: 5,
              currency: 'AIC',
              creatorId: systemUser!.id,
              taskSource: 'GITHUB_ISSUE',
              sourceUrl: 'https://github.com/naliazheli/world-test/issues/101',
              sourceRepo: 'naliazheli/world-test',
              sourceIssueNumber: 101,
              status: 'CANCELLED',
            },
          },
        },
      });

      const systemToken = await loginSystemUser();
      const res = await request(app.getHttpServer())
        .get('/api/task-generator/raw-tasks?handledOnly=true')
        .set('Authorization', `Bearer ${systemToken}`)
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0]).toMatchObject({
        processingStage: 'CANCELLED',
        processingLabel: 'Cancelled',
      });
    });

    it('should return raw task repository stats', async () => {
      const prisma = app.get(PrismaService);
      const systemUser = await prisma.user.findUnique({
        where: { email: process.env.SYSTEM_USER_EMAIL || 'system@aifactory.local' },
      });
      expect(systemUser).toBeTruthy();

      await prisma.rawTask.createMany({
        data: [
          {
            source: 'GITHUB_ISSUE',
            externalId: '201',
            externalUrl: 'https://github.com/facebook/react/issues/201',
            repoOwner: 'facebook',
            repoName: 'react',
            title: 'Filtered issue',
            body: 'Blocked by policy',
            status: 'SKIPPED',
            shouldPublish: false,
            publishReasons: ['low_signal_labels'],
          },
          {
            source: 'GITHUB_ISSUE',
            externalId: '202',
            externalUrl: 'https://github.com/vercel/next.js/issues/202',
            repoOwner: 'vercel',
            repoName: 'next.js',
            title: 'Pending issue',
            body: 'Awaiting scoring',
            status: 'PENDING',
          },
        ],
      });

      await prisma.rawTask.create({
        data: {
          source: 'GITHUB_ISSUE',
          externalId: '203',
          externalUrl: 'https://github.com/facebook/react/issues/203',
          repoOwner: 'facebook',
          repoName: 'react',
          title: 'Published issue',
          body: 'Already published',
          status: 'PUBLISHED',
          shouldPublish: true,
          publishedTask: {
            create: {
              title: '[GitHub] Published issue',
              description: 'Published raw task',
              reward: 10,
              currency: 'AIC',
              creatorId: systemUser!.id,
              taskSource: 'GITHUB_ISSUE',
              sourceUrl: 'https://github.com/facebook/react/issues/203',
              sourceRepo: 'facebook/react',
              sourceIssueNumber: 203,
            },
          },
        },
      });

      const systemToken = await loginSystemUser();
      const res = await request(app.getHttpServer())
        .get('/api/task-generator/raw-tasks/stats')
        .set('Authorization', `Bearer ${systemToken}`)
        .expect(200);

      expect(res.body.totals).toMatchObject({
        total: 3,
        published: 1,
        filtered: 1,
      });
      expect(res.body.repos[0]).toMatchObject({
        repo: 'facebook/react',
        total: 2,
        filtered: 1,
        published: 1,
      });
    });
  });

  describe('PATCH /api/tasks/:id', () => {
    it('should update task as creator', async () => {
      const { creatorToken } = await setupUsers();
      const created = await request(app.getHttpServer())
        .post('/api/tasks')
        .set('Authorization', `Bearer ${creatorToken}`)
        .send(taskData);

      const res = await request(app.getHttpServer())
        .patch(`/api/tasks/${created.body.id}`)
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({ title: 'Updated title', reward: 3 })
        .expect(200);

      expect(res.body.title).toBe('Updated title');
      expect(res.body.reward).toBe(3);
    });

    it('should reject update from non-creator', async () => {
      const { creatorToken, workerToken } = await setupUsers();
      const created = await request(app.getHttpServer())
        .post('/api/tasks')
        .set('Authorization', `Bearer ${creatorToken}`)
        .send(taskData);

      await request(app.getHttpServer())
        .patch(`/api/tasks/${created.body.id}`)
        .set('Authorization', `Bearer ${workerToken}`)
        .send({ title: 'Hacked' })
        .expect(403);
    });
  });

  describe('POST /api/tasks/:id/review', () => {
    it('should move task to REVIEWING as creator', async () => {
      const { creatorToken } = await setupUsers();
      const created = await request(app.getHttpServer())
        .post('/api/tasks')
        .set('Authorization', `Bearer ${creatorToken}`)
        .send(taskData);

      const res = await request(app.getHttpServer())
        .post(`/api/tasks/${created.body.id}/review`)
        .set('Authorization', `Bearer ${creatorToken}`)
        .expect(200);

      expect(res.body.status).toBe('REVIEWING');
    });

    it('should reject review from non-creator', async () => {
      const { creatorToken, workerToken } = await setupUsers();
      const created = await request(app.getHttpServer())
        .post('/api/tasks')
        .set('Authorization', `Bearer ${creatorToken}`)
        .send(taskData);

      await request(app.getHttpServer())
        .post(`/api/tasks/${created.body.id}/review`)
        .set('Authorization', `Bearer ${workerToken}`)
        .expect(403);
    });

    it('should reject review of non-OPEN task', async () => {
      const { creatorToken } = await setupUsers();
      const created = await request(app.getHttpServer())
        .post('/api/tasks')
        .set('Authorization', `Bearer ${creatorToken}`)
        .send(taskData);

      await request(app.getHttpServer())
        .post(`/api/tasks/${created.body.id}/review`)
        .set('Authorization', `Bearer ${creatorToken}`);

      await request(app.getHttpServer())
        .post(`/api/tasks/${created.body.id}/review`)
        .set('Authorization', `Bearer ${creatorToken}`)
        .expect(400);
    });
  });

  describe('DELETE /api/tasks/:id', () => {
    it('should cancel an OPEN task', async () => {
      const { creatorToken } = await setupUsers();
      const created = await request(app.getHttpServer())
        .post('/api/tasks')
        .set('Authorization', `Bearer ${creatorToken}`)
        .send(taskData);

      const res = await request(app.getHttpServer())
        .delete(`/api/tasks/${created.body.id}`)
        .set('Authorization', `Bearer ${creatorToken}`)
        .expect(200);

      expect(res.body.status).toBe('CANCELLED');
    });

    it('should reject cancel from non-creator', async () => {
      const { creatorToken, workerToken } = await setupUsers();
      const created = await request(app.getHttpServer())
        .post('/api/tasks')
        .set('Authorization', `Bearer ${creatorToken}`)
        .send(taskData);

      await request(app.getHttpServer())
        .delete(`/api/tasks/${created.body.id}`)
        .set('Authorization', `Bearer ${workerToken}`)
        .expect(403);
    });
  });
});
