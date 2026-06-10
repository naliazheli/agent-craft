import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TaskGeneratorService } from './task-generator.service';
import { TaskGeneratorController } from './task-generator.controller';
import { GithubFetcherService } from './github-fetcher.service';
import { HackerOneFetcherService } from './hackerone-fetcher.service';
import { TaskScorerService } from './task-scorer.service';
import { PublishPolicyService } from './publish-policy.service';

@Module({
  imports: [PrismaModule],
  providers: [TaskGeneratorService, GithubFetcherService, HackerOneFetcherService, TaskScorerService, PublishPolicyService],
  controllers: [TaskGeneratorController],
  exports: [TaskGeneratorService, PublishPolicyService],
})
export class TaskGeneratorModule {}
