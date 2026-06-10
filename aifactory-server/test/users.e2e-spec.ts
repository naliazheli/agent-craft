import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp, cleanDatabase } from './setup';

describe('Users (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await cleanDatabase(app);
    await app.close();
  });

  async function setupUser() {
    await cleanDatabase(app);
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: 'user@example.com', password: 'password123', displayName: 'TestUser' });
    return { token: res.body.access_token, userId: res.body.user.id };
  }

  describe('PATCH /api/users/profile', () => {
    it('should update display name', async () => {
      const { token } = await setupUser();
      const res = await request(app.getHttpServer())
        .patch('/api/users/profile')
        .set('Authorization', `Bearer ${token}`)
        .send({ displayName: 'Updated Name' })
        .expect(200);

      expect(res.body.displayName).toBe('Updated Name');
    });

    it('should update bio', async () => {
      const { token } = await setupUser();
      const res = await request(app.getHttpServer())
        .patch('/api/users/profile')
        .set('Authorization', `Bearer ${token}`)
        .send({ bio: 'I am a developer' })
        .expect(200);

      expect(res.body.bio).toBe('I am a developer');
    });

    it('should update wallet address', async () => {
      const { token } = await setupUser();
      const res = await request(app.getHttpServer())
        .patch('/api/users/profile')
        .set('Authorization', `Bearer ${token}`)
        .send({ walletAddress: '0x1234567890abcdef' })
        .expect(200);

      expect(res.body.walletAddress).toBe('0x1234567890abcdef');
    });

    it('should reject unauthenticated request', async () => {
      await request(app.getHttpServer())
        .patch('/api/users/profile')
        .send({ displayName: 'Hacker' })
        .expect(401);
    });
  });

  describe('GET /api/users/:id', () => {
    it('should return public profile', async () => {
      const { userId } = await setupUser();
      const res = await request(app.getHttpServer())
        .get(`/api/users/${userId}`)
        .expect(200);

      expect(res.body.id).toBe(userId);
      expect(res.body.displayName).toBe('TestUser');
      expect(res.body).not.toHaveProperty('email');
      expect(res.body).not.toHaveProperty('passwordHash');
    });

    it('should return 404 for non-existent user', async () => {
      await request(app.getHttpServer())
        .get('/api/users/00000000-0000-0000-0000-000000000000')
        .expect(404);
    });
  });
});
