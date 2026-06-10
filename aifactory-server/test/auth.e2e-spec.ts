import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp, cleanDatabase } from './setup';

describe('Auth (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await cleanDatabase(app);
  });

  afterAll(async () => {
    await cleanDatabase(app);
    await app.close();
  });

  const testUser = {
    email: 'test@example.com',
    password: 'password123',
    displayName: 'Test User',
  };
  const systemEmail = process.env.SYSTEM_USER_EMAIL || 'system@aifactory.local';
  const systemPassword = process.env.SYSTEM_USER_PASSWORD || 'change-me-local';
  const legacySystemEmail = process.env.LEGACY_SYSTEM_EMAIL || 'legacy-system@example.com';

  async function getVerificationCode(email: string) {
    const res = await request(app.getHttpServer())
      .post('/api/auth/email/verification-code')
      .send({ email })
      .expect(200);

    expect(res.body.email).toBe(email.toLowerCase());
    expect(res.body).toHaveProperty('expiresInSeconds');
    expect(res.body).toHaveProperty('debugCode');
    return res.body.debugCode as string;
  }

  async function registerPayload(user: typeof testUser, extra: Record<string, unknown> = {}) {
    const verificationCode = await getVerificationCode(user.email);
    return { ...user, verificationCode, ...extra };
  }

  describe('POST /api/auth/register', () => {
    it('should register a new user', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(await registerPayload(testUser))
        .expect(201);

      expect(res.body).toHaveProperty('access_token');
      expect(res.body).toHaveProperty('user');
      expect(res.body.user.email).toBe(testUser.email);
      expect(res.body.user.displayName).toBe(testUser.displayName);
      expect(res.body.user).not.toHaveProperty('passwordHash');
    });

    it('should reject duplicate email', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(await registerPayload(testUser))
        .expect(201);

      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ ...testUser, verificationCode: '123456' })
        .expect(409);
    });

    it('should reject invalid email', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ email: 'not-an-email', password: 'password123', verificationCode: '123456' })
        .expect(400);
    });

    it('should reject short password', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ email: 'test@example.com', password: '123', verificationCode: '123456' })
        .expect(400);
    });

    it('should register with AI_AGENT role', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(await registerPayload(testUser, { role: 'AI_AGENT' }))
        .expect(201);

      expect(res.body.user.role).toBe('AI_AGENT');
    });

    it('should reject missing or invalid verification code', async () => {
      await getVerificationCode(testUser.email);

      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ ...testUser, verificationCode: '000000' })
        .expect(401);
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(await registerPayload(testUser));
    });

    it('should login with correct credentials', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: testUser.email, password: testUser.password })
        .expect(200);

      expect(res.body).toHaveProperty('access_token');
      expect(res.body).toHaveProperty('user');
      expect(res.body.user.email).toBe(testUser.email);
    });

    it('should reject wrong password', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: testUser.email, password: 'wrongpassword' })
        .expect(401);
    });

    it('should reject non-existent user', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'nobody@example.com', password: 'password123' })
        .expect(401);
    });

    it('should allow legacy system email to login with the seeded system password', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: legacySystemEmail, password: systemPassword })
        .expect(200);

      expect(res.body.user.email).toBe(systemEmail);
      expect(res.body.user.role).toBe('ADMIN');
    });
  });

  describe('GET /api/auth/me', () => {
    it('should return current user with valid token', async () => {
      const registerRes = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(await registerPayload(testUser));

      const token = registerRes.body.access_token;

      const res = await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.email).toBe(testUser.email);
      expect(res.body).not.toHaveProperty('passwordHash');
    });

    it('should reject request without token', async () => {
      await request(app.getHttpServer())
        .get('/api/auth/me')
        .expect(401);
    });

    it('should reject invalid token', async () => {
      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });
  });
});
