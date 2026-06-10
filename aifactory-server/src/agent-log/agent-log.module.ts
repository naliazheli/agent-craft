import { Module } from '@nestjs/common';
import { AgentLogController } from './agent-log.controller';
import { AgentLogService } from './agent-log.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AgentLogController],
  providers: [AgentLogService],
  exports: [AgentLogService],
})
export class AgentLogModule {}
