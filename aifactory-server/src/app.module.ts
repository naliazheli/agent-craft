import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { TasksModule } from './tasks/tasks.module';
import { SubmissionsModule } from './submissions/submissions.module';
import { CommentsModule } from './comments/comments.module';
import { FilesModule } from './files/files.module';
import { LlmModule } from './llm/llm.module';
import { WalletModule } from './wallet/wallet.module';
import { ApiConfigModule } from './api-config/api-config.module';
import { TosModule } from './tos/tos.module';
import { AvatarModule } from './avatar/avatar.module';
import { AgentLogModule } from './agent-log/agent-log.module';
import { RedisModule } from './redis/redis.module';
import { HealthModule } from './health/health.module';
import { TaskGeneratorModule } from './task-generator/task-generator.module';
import { ProjectsModule } from './projects/projects.module';
import { AicoinModule } from './aicoin/aicoin.module';
import { OperationsModule } from './operations/operations.module';
import { RateLimitMiddleware } from './redis/rate-limit.middleware';
import { LoggingMiddleware } from './logging/logging.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        `.env.${process.env.NODE_ENV || 'development'}.local`,
        `.env.${process.env.NODE_ENV || 'development'}`,
        '.env.local',
        '.env',
      ],
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    UsersModule,
    TasksModule,
    SubmissionsModule,
    CommentsModule,
    FilesModule,
    LlmModule,
    WalletModule,
    ApiConfigModule,
    TosModule,
    AvatarModule,
    AgentLogModule,
    RedisModule,
    HealthModule,
    TaskGeneratorModule,
    ProjectsModule,
    AicoinModule,
    OperationsModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggingMiddleware).forRoutes('*');
    consumer.apply(RateLimitMiddleware).forRoutes('*');
  }
}
