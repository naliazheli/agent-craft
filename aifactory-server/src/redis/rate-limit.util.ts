import Redis from 'ioredis';

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  limit: number;
  remaining: number;
}

/**
 * Sliding-window rate limiter using Redis sorted sets.
 * Returns null if redis is unavailable (no-op / allow all).
 */
export async function checkRateLimit(
  redis: Redis | null,
  keyPrefix: string,
  identifier: string,
  maxRequests: number,
  windowSec: number,
): Promise<RateLimitResult | null> {
  if (!redis) return null;

  const key = `rl:${keyPrefix}:${identifier}`;
  const now = Date.now();
  const windowStart = now - windowSec * 1000;

  const pipeline = redis.pipeline();
  pipeline.zremrangebyscore(key, 0, windowStart);
  pipeline.zadd(key, now.toString(), `${now}:${Math.random()}`);
  pipeline.zcard(key);
  pipeline.expire(key, windowSec);
  const results = await pipeline.exec();

  const count = (results?.[2]?.[1] as number) || 0;

  return {
    allowed: count <= maxRequests,
    count,
    limit: maxRequests,
    remaining: Math.max(0, maxRequests - count),
  };
}
