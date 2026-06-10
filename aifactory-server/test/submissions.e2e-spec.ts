import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp, cleanDatabase } from './setup';
import { PrismaService } from '../src/prisma/prisma.service';
import { GithubService } from '../src/github/github.service';

describe('Submissions (e2e)', () => {
  let app: INestApplication;
  let userSequence = 0;

  beforeEach(async () => {
    app = await createTestApp();
    await cleanDatabase(app);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    if (app) {
      await app.close();
    }
  });

  function uniqueEmail(prefix: string) {
    userSequence += 1;
    return `${prefix}-${Date.now()}-${userSequence}@example.com`;
  }

  /** Helper: clean DB and create creator + worker + open task */
  async function setupOpenTask() {
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

    const task = await request(app.getHttpServer())
      .post('/api/tasks')
      .set('Authorization', `Bearer ${creator.body.access_token}`)
      .send({ title: 'Test Task', description: 'A task for testing submissions', reward: 3 })
      .expect(201);

    return {
      creatorToken: creator.body.access_token,
      workerToken: worker.body.access_token,
      taskId: task.body.id,
    };
  }

  async function setupGithubIssueTask() {
    const creatorEmail = uniqueEmail('gh-creator');
    const workerEmail = uniqueEmail('gh-worker');

    const creator = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: creatorEmail, password: 'password123', displayName: 'GhCreator' })
      .expect(201);

    const worker = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: workerEmail, password: 'password123', displayName: 'GhWorker' })
      .expect(201);

    const prisma = app.get(PrismaService);
    await prisma.user.update({
      where: { id: worker.body.user.id },
      data: {
        authProvider: 'github',
        githubLogin: 'gh-worker',
      },
    });

    const task = await request(app.getHttpServer())
      .post('/api/tasks')
      .set('Authorization', `Bearer ${creator.body.access_token}`)
      .send({
        title: 'GitHub issue task',
        description: 'Fix issue #12 in world-test',
        reward: 5,
        taskSource: 'GITHUB_ISSUE',
        sourceUrl: 'https://github.com/naliazheli/world-test/issues/12',
        sourceRepo: 'naliazheli/world-test',
        sourceIssueNumber: 12,
      })
      .expect(201);

    return {
      creatorToken: creator.body.access_token,
      workerToken: worker.body.access_token,
      taskId: task.body.id,
    };
  }

  /** Helper: setupOpenTask + submit work */
  async function setupSubmittedTask() {
    const ctx = await setupOpenTask();
    const sub = await request(app.getHttpServer())
      .post(`/api/submissions/task/${ctx.taskId}`)
      .set('Authorization', `Bearer ${ctx.workerToken}`)
      .send({ content: 'Completed work' });
    return { ...ctx, submissionId: sub.body.id };
  }

  describe('POST /api/submissions/task/:taskId', () => {
    it('should submit work for an assigned task', async () => {
      const { workerToken, taskId } = await setupOpenTask();
      const res = await request(app.getHttpServer())
        .post(`/api/submissions/task/${taskId}`)
        .set('Authorization', `Bearer ${workerToken}`)
        .send({ content: 'Here is my completed work' })
        .expect(201);

      expect(res.body.content).toBe('Here is my completed work');
      expect(res.body.status).toBe('SUBMITTED');
      expect(res.body.taskId).toBe(taskId);
    });

    it('should submit work with file URLs', async () => {
      const { workerToken, taskId } = await setupOpenTask();
      const res = await request(app.getHttpServer())
        .post(`/api/submissions/task/${taskId}`)
        .set('Authorization', `Bearer ${workerToken}`)
        .send({
          content: 'Work with files',
          fileUrls: ['https://example.com/file1.zip', 'https://example.com/file2.pdf'],
        })
        .expect(201);

      expect(res.body.fileUrls).toHaveLength(2);
    });

    it('should keep task status as OPEN after submission', async () => {
      const { workerToken, taskId } = await setupOpenTask();
      await request(app.getHttpServer())
        .post(`/api/submissions/task/${taskId}`)
        .set('Authorization', `Bearer ${workerToken}`)
        .send({ content: 'My work' });

      const task = await request(app.getHttpServer())
        .get(`/api/tasks/${taskId}`)
        .expect(200);

      expect(task.body.status).toBe('OPEN');
    });

    it('should reject submission from task creator', async () => {
      const { creatorToken, taskId } = await setupOpenTask();
      await request(app.getHttpServer())
        .post(`/api/submissions/task/${taskId}`)
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({ content: 'Not my task' })
        .expect(403);
    });

    it('should reject submission without content', async () => {
      const { workerToken, taskId } = await setupOpenTask();
      await request(app.getHttpServer())
        .post(`/api/submissions/task/${taskId}`)
        .set('Authorization', `Bearer ${workerToken}`)
        .send({})
        .expect(400);
    });

    it('should reject unauthenticated submission', async () => {
      const { taskId } = await setupOpenTask();
      await request(app.getHttpServer())
        .post(`/api/submissions/task/${taskId}`)
        .send({ content: 'Anonymous work' })
        .expect(401);
    });
  });

  describe('POST /api/submissions/:id/review', () => {
    it('should approve a submission', async () => {
      const { creatorToken, taskId, submissionId } = await setupSubmittedTask();
      const res = await request(app.getHttpServer())
        .post(`/api/submissions/${submissionId}/review`)
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({ action: 'APPROVE', reviewNote: 'Great work!' })
        .expect(200);

      expect(res.body.status).toBe('APPROVED');
      expect(res.body.reviewNote).toBe('Great work!');
      expect(res.body.reviewedAt).toBeTruthy();

      const task = await request(app.getHttpServer())
        .get(`/api/tasks/${taskId}`);
      expect(task.body.status).toBe('COMPLETED');
    });

    it('should request revision', async () => {
      const { creatorToken, taskId, submissionId } = await setupSubmittedTask();
      const res = await request(app.getHttpServer())
        .post(`/api/submissions/${submissionId}/review`)
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({ action: 'REQUEST_REVISION', reviewNote: 'Please fix the layout' })
        .expect(200);

      expect(res.body.status).toBe('REVISION_REQUESTED');

      const task = await request(app.getHttpServer())
        .get(`/api/tasks/${taskId}`);
      expect(task.body.status).toBe('OPEN');
    });

    it('should reject a submission', async () => {
      const { creatorToken, taskId, submissionId } = await setupSubmittedTask();
      const res = await request(app.getHttpServer())
        .post(`/api/submissions/${submissionId}/review`)
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({ action: 'REJECT', reviewNote: 'Does not meet requirements' })
        .expect(200);

      expect(res.body.status).toBe('REJECTED');

      const task = await request(app.getHttpServer())
        .get(`/api/tasks/${taskId}`);
      expect(task.body.status).toBe('OPEN');
    });

    it('should reject review from non-creator', async () => {
      const { workerToken, submissionId } = await setupSubmittedTask();
      await request(app.getHttpServer())
        .post(`/api/submissions/${submissionId}/review`)
        .set('Authorization', `Bearer ${workerToken}`)
        .send({ action: 'APPROVE' })
        .expect(403);
    });

    it('should reject invalid action', async () => {
      const { creatorToken, submissionId } = await setupSubmittedTask();
      await request(app.getHttpServer())
        .post(`/api/submissions/${submissionId}/review`)
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({ action: 'INVALID_ACTION' })
        .expect(400);
    });

    it('should reject double review', async () => {
      const { creatorToken, submissionId } = await setupSubmittedTask();
      await request(app.getHttpServer())
        .post(`/api/submissions/${submissionId}/review`)
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({ action: 'APPROVE' });

      await request(app.getHttpServer())
        .post(`/api/submissions/${submissionId}/review`)
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({ action: 'APPROVE' })
        .expect(400);
    });
  });

  describe('GET /api/submissions/task/:taskId', () => {
    it('should list submissions for a task', async () => {
      const { workerToken, taskId } = await setupOpenTask();
      await request(app.getHttpServer())
        .post(`/api/submissions/task/${taskId}`)
        .set('Authorization', `Bearer ${workerToken}`)
        .send({ content: 'My submission' });

      const res = await request(app.getHttpServer())
        .get(`/api/submissions/task/${taskId}`)
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].content).toBe('My submission');
      expect(res.body[0]).toHaveProperty('worker');
    });
  });

  describe('POST /api/submissions/task/:taskId/pr', () => {
    it('should submit a PR for a github issue task', async () => {
      const { workerToken, taskId } = await setupGithubIssueTask();
      const githubService = app.get(GithubService);
      jest.spyOn(githubService, 'getPullRequest').mockResolvedValue({
        number: 99,
        state: 'open',
        draft: false,
        merged: false,
        user: { login: 'gh-worker' },
        head: { sha: 'abcdef1234567890', ref: 'feature/pr-99' },
        base: {
          ref: 'main',
          repo: {
            full_name: 'naliazheli/world-test',
            default_branch: 'main',
          },
        },
      } as any);

      const res = await request(app.getHttpServer())
        .post(`/api/submissions/task/${taskId}/pr`)
        .set('Authorization', `Bearer ${workerToken}`)
        .send({
          prUrl: 'https://github.com/naliazheli/world-test/pull/99',
          headSha: 'abcdef1234567890',
          note: 'Implements the requested fix',
        })
        .expect(201);

      expect(res.body.status).toBe('SUBMITTED');
      expect(res.body.prUrl).toBe('https://github.com/naliazheli/world-test/pull/99');
      expect(res.body.repoFullName).toBe('naliazheli/world-test');
      expect(res.body.prNumber).toBe(99);
      expect(res.body.issueNumber).toBe(12);
      expect(res.body.validationStatus).toBe('PASSED');
    });

    it('should mark validation failed for repo mismatch', async () => {
      const { workerToken, taskId } = await setupGithubIssueTask();
      const res = await request(app.getHttpServer())
        .post(`/api/submissions/task/${taskId}/pr`)
        .set('Authorization', `Bearer ${workerToken}`)
        .send({
          prUrl: 'https://github.com/other/repo/pull/1',
          headSha: 'abcdef1234567890',
        })
        .expect(201);

      expect(res.body.validationStatus).toBe('FAILED');
      expect(res.body.validationReason).toContain('PR repo must match naliazheli/world-test');
    });
  });

  describe('GET /api/submissions/my', () => {
    it('should list my submissions', async () => {
      const { workerToken, taskId } = await setupOpenTask();
      await request(app.getHttpServer())
        .post(`/api/submissions/task/${taskId}`)
        .set('Authorization', `Bearer ${workerToken}`)
        .send({ content: 'My work' });

      const res = await request(app.getHttpServer())
        .get('/api/submissions/my')
        .set('Authorization', `Bearer ${workerToken}`)
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0]).toHaveProperty('task');
      expect(res.body.meta.total).toBe(1);
    });

    it('should return empty for user with no submissions', async () => {
      const { creatorToken } = await setupOpenTask();
      const res = await request(app.getHttpServer())
        .get('/api/submissions/my')
        .set('Authorization', `Bearer ${creatorToken}`)
        .expect(200);

      expect(res.body.data).toHaveLength(0);
    });

    it('should reject unauthenticated request', async () => {
      await request(app.getHttpServer())
        .get('/api/submissions/my')
        .expect(401);
    });
  });

  describe('Full workflow: create → submit → approve', () => {
    it('should complete the full task lifecycle', async () => {
      const c = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ email: uniqueEmail('boss'), password: 'password123' });
      const w = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ email: uniqueEmail('dev'), password: 'password123' });

      // 1. Create task
      const task = await request(app.getHttpServer())
        .post('/api/tasks')
        .set('Authorization', `Bearer ${c.body.access_token}`)
        .send({ title: 'Full workflow test', description: 'End to end', reward: 3 });
      expect(task.body.status).toBe('OPEN');

      // 2. Submit work (directly, no accept step)
      const submission = await request(app.getHttpServer())
        .post(`/api/submissions/task/${task.body.id}`)
        .set('Authorization', `Bearer ${w.body.access_token}`)
        .send({ content: 'Here is the deliverable' });
      expect(submission.body.status).toBe('SUBMITTED');

      // 3. Approve
      const approved = await request(app.getHttpServer())
        .post(`/api/submissions/${submission.body.id}/review`)
        .set('Authorization', `Bearer ${c.body.access_token}`)
        .send({ action: 'APPROVE', reviewNote: 'Perfect!' });
      expect(approved.body.status).toBe('APPROVED');

      // Task should be COMPLETED
      const completed = await request(app.getHttpServer())
        .get(`/api/tasks/${task.body.id}`);
      expect(completed.body.status).toBe('COMPLETED');
    });
  });
});
