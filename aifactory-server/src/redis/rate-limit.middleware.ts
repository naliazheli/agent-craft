import { Injectable, NestMiddleware, Inject, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import Redis from 'ioredis';
import { createHash } from 'node:crypto';
import { REDIS_CLIENT } from './redis.module';

@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  private readonly logger = new Logger(RateLimitMiddleware.name);
  private readonly maxRequests: number;
  private readonly projectMaxRequests: number;
  private readonly localRunnerMaxRequests: number;
  private readonly runtimePollMaxRequests: number;
  private readonly windowSec: number;

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis | null) {
    this.maxRequests = parseInt(process.env.RATE_LIMIT_MAX || '100', 10);
    this.projectMaxRequests = parseInt(process.env.PROJECT_RATE_LIMIT_MAX || '600', 10);
    this.localRunnerMaxRequests = parseInt(process.env.LOCAL_RUNNER_RATE_LIMIT_MAX || '3000', 10);
    this.runtimePollMaxRequests = parseInt(process.env.RUNTIME_POLL_RATE_LIMIT_MAX || '1200', 10);
    this.windowSec = parseInt(process.env.RATE_LIMIT_WINDOW_SEC || '60', 10);
  }

  async use(req: Request, res: Response, next: NextFunction) {
    if (!this.redis) {
      return next();
    }

    const identity = this.requestIdentity(req);
    const path = req.originalUrl || req.url || '';
    const localRunnerRequest = path.includes('/local-runner/') ||
      path.includes('/local-codex/') ||
      path.includes('/account-local-runners/');
    const runtimePollRequest =
      req.method === 'GET' &&
      /^\/api\/projects\/[^/]+\/agent-runtimes(?:\?|$)/.test(path);
    const projectRequest = path === '/api/projects' ||
      path.startsWith('/api/projects?') ||
      path.startsWith('/api/projects/');
    const bucket = localRunnerRequest
      ? 'local-runner'
      : runtimePollRequest
        ? 'runtime-poll'
        : projectRequest
          ? 'project'
          : 'default';
    const maxRequests = localRunnerRequest
      ? this.localRunnerMaxRequests
      : runtimePollRequest
        ? this.runtimePollMaxRequests
        : projectRequest
          ? this.projectMaxRequests
          : this.maxRequests;
    const key = `rl:api:${bucket}:${identity}`;

    try {
      const now = Date.now();
      const windowStart = now - this.windowSec * 1000;

      const pipeline = this.redis.pipeline();
      pipeline.zremrangebyscore(key, 0, windowStart);
      pipeline.zadd(key, now.toString(), `${now}:${Math.random()}`);
      pipeline.zcard(key);
      pipeline.expire(key, this.windowSec);
      const results = await pipeline.exec();

      const count = results?.[2]?.[1] as number;

      res.setHeader('X-RateLimit-Limit', maxRequests);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - count));

      if (count > maxRequests) {
        res.status(429).json({
          statusCode: 429,
          message: 'Too many requests',
        });
        return;
      }
    } catch (err) {
      this.logger.warn(`Rate limit check failed: ${(err as Error).message}`);
    }

    next();
  }

  private requestIdentity(req: Request) {
    const authorization = req.header('authorization') || '';
    const bearer = /^Bearer\s+(.+)$/i.exec(authorization)?.[1]?.trim();
    if (bearer) {
      return `auth:${this.hashIdentifier(bearer)}`;
    }

    const runnerToken = req.header('x-agentcraft-runner-token') || req.header('x-runner-token');
    if (runnerToken) {
      return `runner:${this.hashIdentifier(runnerToken)}`;
    }

    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    return `ip:${ip}`;
  }

  private hashIdentifier(value: string) {
    return createHash('sha256').update(value).digest('hex').slice(0, 24);
  }
}
