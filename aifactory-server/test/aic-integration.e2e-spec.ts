import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp, cleanDatabase } from './setup';
import { PrismaService } from '../src/prisma/prisma.service';
import { WalletService } from '../src/wallet/wallet.service';
import { SubmissionsService } from '../src/submissions/submissions.service';

describe('AIC Integration (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let userSequence = 0;

  beforeEach(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await cleanDatabase(app);
  });

  afterEach(async () => {
    await app.close();
  });

  function uniqueEmail(prefix: string) {
    userSequence += 1;
    return `${prefix}-${Date.now()}-${userSequence}@aic-test.com`;
  }

  const creatorData = () => ({
    email: uniqueEmail('creator'),
    password: 'password123',
    displayName: 'AIC Creator',
  });

  const workerData = () => ({
    email: uniqueEmail('worker'),
    password: 'password123',
    displayName: 'AIC Worker',
  });

  // ─── Registration & Wallet ───────────────────────────────────────

  describe('Registration: wallet generation & signup bonus', () => {
    it('should generate a custodial wallet on registration', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(creatorData())
        .expect(201);

      expect(res.body.user.walletAddress).toBeDefined();
      expect(res.body.user.walletAddress).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });

    it('should accept a user-provided wallet address', async () => {
      const externalWallet = '0x1234567890abcdef1234567890abcdef12345678';
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ ...creatorData(), walletAddress: externalWallet })
        .expect(201);

      expect(res.body.user.walletAddress).toBe(externalWallet);
    });

    it('should reject invalid wallet address format', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ ...creatorData(), walletAddress: 'not-a-wallet' })
        .expect(409);
    });

    it('should grant 5 AIC signup bonus (off-chain)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(creatorData())
        .expect(201);

      const user = await prisma.user.findUnique({
        where: { id: res.body.user.id },
        select: { balance: true },
      });

      expect(user!.balance).toBe(5);
    });

    it('should record signup bonus transaction', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(creatorData())
        .expect(201);

      const tx = await prisma.transaction.findFirst({
        where: {
          toUserId: res.body.user.id,
          type: 'SIGNUP_BONUS',
        },
      });

      expect(tx).toBeDefined();
      expect(tx!.amount).toBe(5);
    });

    it('should store encrypted private key for custodial wallet', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(creatorData())
        .expect(201);

      const user = await prisma.user.findUnique({
        where: { id: res.body.user.id },
        select: { walletEncrypted: true },
      });

      expect(user!.walletEncrypted).toBeDefined();
      expect(user!.walletEncrypted!.length).toBeGreaterThan(0);
    });

    it('should NOT store encrypted key for external wallet', async () => {
      const externalWallet = '0x1234567890abcdef1234567890abcdef12345678';
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ ...creatorData(), walletAddress: externalWallet })
        .expect(201);

      const user = await prisma.user.findUnique({
        where: { id: res.body.user.id },
        select: { walletEncrypted: true },
      });

      expect(user!.walletEncrypted).toBeNull();
    });
  });

  // ─── Wallet Balance & Transactions ───────────────────────────────

  describe('Wallet balance endpoint', () => {
    let token: string;

    beforeEach(async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(creatorData());
      token = res.body.access_token;
    });

    it('should return off-chain balance with wallet address', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/wallet/balance')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.offchain).toBe(5);
      expect(res.body.walletAddress).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(res.body).toHaveProperty('onchain');
      expect(res.body).toHaveProperty('blockchainConfigured');
    });

    it('should return transaction history with signup bonus', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/wallet/transactions')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      const signupTx = res.body.data.find((t: any) => t.type === 'SIGNUP_BONUS');
      expect(signupTx).toBeDefined();
      expect(signupTx.amount).toBe(5);
    });
  });

  // ─── Task Creation: Balance Check (Escrow) ──────────────────────

  describe('Task creation: off-chain balance escrow', () => {
    let creatorToken: string;

    beforeEach(async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(creatorData());
      creatorToken = res.body.access_token;
    });

    it('should create a task and escrow reward from off-chain balance', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/tasks')
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({ title: 'Test Task', description: 'Test', reward: 3 })
        .expect(201);

      expect(res.body.reward).toBe(3);
      expect(res.body.status).toBe('OPEN');

      // Creator balance should be reduced by escrow amount (5 - 3 = 2)
      const balanceRes = await request(app.getHttpServer())
        .get('/api/wallet/balance')
        .set('Authorization', `Bearer ${creatorToken}`)
        .expect(200);

      expect(balanceRes.body.offchain).toBe(2);
    });

    it('should reject task creation when insufficient balance', async () => {
      // Signup bonus is 5 AIC, try to create task with reward > 5
      await request(app.getHttpServer())
        .post('/api/tasks')
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({ title: 'Expensive Task', description: 'Too expensive', reward: 100 })
        .expect(400);
    });

    it('should record escrow transaction', async () => {
      const taskRes = await request(app.getHttpServer())
        .post('/api/tasks')
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({ title: 'Escrow Test', description: 'Test', reward: 2 });

      const txRes = await request(app.getHttpServer())
        .get('/api/wallet/transactions')
        .set('Authorization', `Bearer ${creatorToken}`)
        .expect(200);

      const escrowTx = txRes.body.data.find(
        (t: any) => t.type === 'TASK_ESCROW' && t.taskId === taskRes.body.id,
      );
      expect(escrowTx).toBeDefined();
      expect(escrowTx.amount).toBe(2);
    });
  });

  // ─── Submission Approval: Payout ─────────────────────────────────

  describe('Submission approval: off-chain payout to worker', () => {
    let creatorToken: string;
    let workerToken: string;
    let taskId: string;

    beforeEach(async () => {
      const c = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(creatorData());
      creatorToken = c.body.access_token;

      const w = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(workerData());
      workerToken = w.body.access_token;

      // Creator creates a task with reward 3 (from 5 AIC signup bonus)
      const task = await request(app.getHttpServer())
        .post('/api/tasks')
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({ title: 'Payout Test', description: 'Test payout', reward: 3 });
      taskId = task.body.id;
    });

    it('should pay worker on submission approval', async () => {
      // Worker submits
      const sub = await request(app.getHttpServer())
        .post(`/api/submissions/task/${taskId}`)
        .set('Authorization', `Bearer ${workerToken}`)
        .send({ content: 'Done!' })
        .expect(201);

      // Creator approves
      await request(app.getHttpServer())
        .post(`/api/submissions/${sub.body.id}/review`)
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({ action: 'APPROVE', reviewNote: 'Good job' })
        .expect(200);

      // Worker balance should be 5 (signup) + 3 (payout) = 8
      const workerBalance = await request(app.getHttpServer())
        .get('/api/wallet/balance')
        .set('Authorization', `Bearer ${workerToken}`)
        .expect(200);

      expect(workerBalance.body.offchain).toBe(8);
    });

    it('should record payout transaction with task reference', async () => {
      const sub = await request(app.getHttpServer())
        .post(`/api/submissions/task/${taskId}`)
        .set('Authorization', `Bearer ${workerToken}`)
        .send({ content: 'Done!' });

      await request(app.getHttpServer())
        .post(`/api/submissions/${sub.body.id}/review`)
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({ action: 'APPROVE' });

      const txRes = await request(app.getHttpServer())
        .get('/api/wallet/transactions')
        .set('Authorization', `Bearer ${workerToken}`)
        .expect(200);

      const payoutTx = txRes.body.data.find(
        (t: any) => t.type === 'TASK_PAYOUT' && t.taskId === taskId,
      );
      expect(payoutTx).toBeDefined();
      expect(payoutTx.amount).toBe(3);
    });

    it('should mark task as COMPLETED after approval', async () => {
      const sub = await request(app.getHttpServer())
        .post(`/api/submissions/task/${taskId}`)
        .set('Authorization', `Bearer ${workerToken}`)
        .send({ content: 'Done!' });

      await request(app.getHttpServer())
        .post(`/api/submissions/${sub.body.id}/review`)
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({ action: 'APPROVE' });

      const task = await request(app.getHttpServer())
        .get(`/api/tasks/${taskId}`)
        .expect(200);

      expect(task.body.status).toBe('COMPLETED');
    });

    it('should not pay the same task submission twice', async () => {
      const sub = await request(app.getHttpServer())
        .post(`/api/submissions/task/${taskId}`)
        .set('Authorization', `Bearer ${workerToken}`)
        .send({ content: 'Done once' });

      await request(app.getHttpServer())
        .post(`/api/submissions/${sub.body.id}/review`)
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({ action: 'APPROVE' })
        .expect(200);

      await app.get(WalletService).payout(taskId, sub.body.workerId);

      const payouts = await prisma.transaction.findMany({
        where: {
          taskId,
          toUserId: sub.body.workerId,
          type: 'TASK_PAYOUT',
          status: 'COMPLETED',
        },
      });
      expect(payouts).toHaveLength(1);

      const worker = await prisma.user.findUnique({
        where: { id: sub.body.workerId },
        select: { balance: true },
      });
      expect(worker!.balance).toBe(8);
    });

    it('should auto-approve stale submissions and pay the worker', async () => {
      const sub = await request(app.getHttpServer())
        .post(`/api/submissions/task/${taskId}`)
        .set('Authorization', `Bearer ${workerToken}`)
        .send({ content: 'Done after waiting' })
        .expect(201);

      const eightDaysAgo = new Date();
      eightDaysAgo.setDate(eightDaysAgo.getDate() - 8);
      await prisma.submission.update({
        where: { id: sub.body.id },
        data: { submittedAt: eightDaysAgo },
      });

      await app.get(SubmissionsService).autoCompleteStaleSubmissions();

      const [submission, worker, payouts] = await Promise.all([
        prisma.submission.findUnique({
          where: { id: sub.body.id },
          select: { status: true },
        }),
        prisma.user.findUnique({
          where: { id: sub.body.workerId },
          select: { balance: true },
        }),
        prisma.transaction.findMany({
          where: {
            taskId,
            toUserId: sub.body.workerId,
            type: 'TASK_PAYOUT',
            status: 'COMPLETED',
          },
        }),
      ]);

      expect(submission!.status).toBe('APPROVED');
      expect(worker!.balance).toBe(8);
      expect(payouts).toHaveLength(1);
    });
  });

  // ─── Task Cancellation: Refund ───────────────────────────────────

  describe('Task cancellation: refund escrowed AIC', () => {
    let creatorToken: string;

    beforeEach(async () => {
      const c = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(creatorData());
      creatorToken = c.body.access_token;
    });

    it('should refund escrowed AIC when task is cancelled', async () => {
      const task = await request(app.getHttpServer())
        .post('/api/tasks')
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({ title: 'Cancel Test', description: 'Will cancel', reward: 4 });

      // Balance after escrow: 5 - 4 = 1
      let balance = await request(app.getHttpServer())
        .get('/api/wallet/balance')
        .set('Authorization', `Bearer ${creatorToken}`);
      expect(balance.body.offchain).toBe(1);

      // Cancel task
      await request(app.getHttpServer())
        .delete(`/api/tasks/${task.body.id}`)
        .set('Authorization', `Bearer ${creatorToken}`)
        .expect(200);

      // Balance after refund: 1 + 4 = 5
      balance = await request(app.getHttpServer())
        .get('/api/wallet/balance')
        .set('Authorization', `Bearer ${creatorToken}`);
      expect(balance.body.offchain).toBe(5);
    });
  });

  // ─── Full Lifecycle ──────────────────────────────────────────────

  describe('Full AIC lifecycle: register → create task → submit → approve → verify balances', () => {
    it('should complete the entire AIC flow end-to-end', async () => {
      // 1. Register creator (gets 5 AIC)
      const creator = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ email: uniqueEmail('boss'), password: 'password123', displayName: 'Boss' });
      expect(creator.body.user.walletAddress).toMatch(/^0x[a-fA-F0-9]{40}$/);

      // 2. Register worker (gets 5 AIC)
      const worker = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ email: uniqueEmail('dev'), password: 'password123', displayName: 'Dev' });
      expect(worker.body.user.walletAddress).toMatch(/^0x[a-fA-F0-9]{40}$/);

      // 3. Verify both have 5 AIC
      let creatorBal = await request(app.getHttpServer())
        .get('/api/wallet/balance')
        .set('Authorization', `Bearer ${creator.body.access_token}`);
      expect(creatorBal.body.offchain).toBe(5);

      let workerBal = await request(app.getHttpServer())
        .get('/api/wallet/balance')
        .set('Authorization', `Bearer ${worker.body.access_token}`);
      expect(workerBal.body.offchain).toBe(5);

      // 4. Creator creates task with 4 AIC reward (escrow deducts from balance)
      const task = await request(app.getHttpServer())
        .post('/api/tasks')
        .set('Authorization', `Bearer ${creator.body.access_token}`)
        .send({ title: 'Build API', description: 'Build a REST API', reward: 4 });
      expect(task.body.status).toBe('OPEN');

      // Creator balance: 5 - 4 = 1
      creatorBal = await request(app.getHttpServer())
        .get('/api/wallet/balance')
        .set('Authorization', `Bearer ${creator.body.access_token}`);
      expect(creatorBal.body.offchain).toBe(1);

      // 5. Worker submits work
      const submission = await request(app.getHttpServer())
        .post(`/api/submissions/task/${task.body.id}`)
        .set('Authorization', `Bearer ${worker.body.access_token}`)
        .send({ content: 'Here is the API implementation' });
      expect(submission.body.status).toBe('SUBMITTED');

      // 6. Creator approves → payout to worker
      const approved = await request(app.getHttpServer())
        .post(`/api/submissions/${submission.body.id}/review`)
        .set('Authorization', `Bearer ${creator.body.access_token}`)
        .send({ action: 'APPROVE', reviewNote: 'Excellent work!' });
      expect(approved.body.status).toBe('APPROVED');

      // 7. Task should be COMPLETED
      const completedTask = await request(app.getHttpServer())
        .get(`/api/tasks/${task.body.id}`);
      expect(completedTask.body.status).toBe('COMPLETED');

      // 8. Worker balance: 5 (signup) + 4 (payout) = 9
      workerBal = await request(app.getHttpServer())
        .get('/api/wallet/balance')
        .set('Authorization', `Bearer ${worker.body.access_token}`);
      expect(workerBal.body.offchain).toBe(9);

      // 9. Creator balance stays at 1 (escrowed 4 was paid out)
      creatorBal = await request(app.getHttpServer())
        .get('/api/wallet/balance')
        .set('Authorization', `Bearer ${creator.body.access_token}`);
      expect(creatorBal.body.offchain).toBe(1);

      // 10. Verify transaction history for worker
      const workerTxs = await request(app.getHttpServer())
        .get('/api/wallet/transactions')
        .set('Authorization', `Bearer ${worker.body.access_token}`);
      const types = workerTxs.body.data.map((t: any) => t.type);
      expect(types).toContain('SIGNUP_BONUS');
      expect(types).toContain('TASK_PAYOUT');
    });
  });

  // ─── Edge Cases ──────────────────────────────────────────────────

  describe('Edge cases', () => {
    it('should not allow creating task with 0 balance after spending all AIC', async () => {
      const c = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(creatorData());

      // Spend all 5 AIC on a task
      await request(app.getHttpServer())
        .post('/api/tasks')
        .set('Authorization', `Bearer ${c.body.access_token}`)
        .send({ title: 'All in', description: 'Spend all', reward: 5 });

      // Try to create another task
      await request(app.getHttpServer())
        .post('/api/tasks')
        .set('Authorization', `Bearer ${c.body.access_token}`)
        .send({ title: 'No funds', description: 'Should fail', reward: 1 })
        .expect(400);
    });

    it('should handle rejection without affecting worker balance', async () => {
      const c = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(creatorData());
      const w = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(workerData());

      const task = await request(app.getHttpServer())
        .post('/api/tasks')
        .set('Authorization', `Bearer ${c.body.access_token}`)
        .send({ title: 'Reject Test', description: 'Test', reward: 3 });

      const sub = await request(app.getHttpServer())
        .post(`/api/submissions/task/${task.body.id}`)
        .set('Authorization', `Bearer ${w.body.access_token}`)
        .send({ content: 'Bad work' });

      await request(app.getHttpServer())
        .post(`/api/submissions/${sub.body.id}/review`)
        .set('Authorization', `Bearer ${c.body.access_token}`)
        .send({ action: 'REJECT', reviewNote: 'Not acceptable' })
        .expect(200);

      // Worker balance should still be 5 (signup only, no payout)
      const workerBal = await request(app.getHttpServer())
        .get('/api/wallet/balance')
        .set('Authorization', `Bearer ${w.body.access_token}`);
      expect(workerBal.body.offchain).toBe(5);
    });

    it('should handle revision request without affecting balances', async () => {
      const c = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(creatorData());
      const w = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(workerData());

      const task = await request(app.getHttpServer())
        .post('/api/tasks')
        .set('Authorization', `Bearer ${c.body.access_token}`)
        .send({ title: 'Revision Test', description: 'Test', reward: 2 });

      const sub = await request(app.getHttpServer())
        .post(`/api/submissions/task/${task.body.id}`)
        .set('Authorization', `Bearer ${w.body.access_token}`)
        .send({ content: 'First attempt' });

      await request(app.getHttpServer())
        .post(`/api/submissions/${sub.body.id}/review`)
        .set('Authorization', `Bearer ${c.body.access_token}`)
        .send({ action: 'REQUEST_REVISION', reviewNote: 'Fix layout' })
        .expect(200);

      // Creator balance: 5 - 2 = 3 (still escrowed)
      const creatorBal = await request(app.getHttpServer())
        .get('/api/wallet/balance')
        .set('Authorization', `Bearer ${c.body.access_token}`);
      expect(creatorBal.body.offchain).toBe(3);

      // Worker balance: 5 (no payout yet)
      const workerBal = await request(app.getHttpServer())
        .get('/api/wallet/balance')
        .set('Authorization', `Bearer ${w.body.access_token}`);
      expect(workerBal.body.offchain).toBe(5);
    });
  });
});
