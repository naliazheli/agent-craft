import { Module, Global, Logger } from '@nestjs/common';
import Redis from 'ioredis';

export const REDIS_CLIENT = 'REDIS_CLIENT';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: () => {
        const logger = new Logger('RedisModule');
        const url = process.env.REDIS_URL;

        if (!url) {
          logger.warn('REDIS_URL not set — Redis disabled (rate-limiting will be skipped)');
          return null;
        }

        const client = new Redis(url, {
          maxRetriesPerRequest: 3,
          lazyConnect: true,
        });

        client.on('error', (err) => logger.error('Redis error', err.message));
        client.on('connect', () => logger.log('Redis connected'));

        client.connect().catch((err) => {
          logger.error('Redis connection failed', err.message);
        });

        return client;
      },
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
