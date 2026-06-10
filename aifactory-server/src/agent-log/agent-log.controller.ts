import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { AgentLogService } from './agent-log.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

interface RequestWithUser {
  user: { id: string; email: string; role: string };
}

@ApiTags('agent-logs')
@Controller('agent-logs')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AgentLogController {
  constructor(private readonly agentLogService: AgentLogService) {}

  @Post('sessions')
  @ApiOperation({ summary: 'Create a new agent session (task execution)' })
  createSession(
    @Request() req: RequestWithUser,
    @Body()
    body: {
      type: 'WORKER' | 'REVIEWER';
      taskId?: string;
      taskTitle?: string;
      reward?: number;
      currency?: string;
      workerName?: string;
    },
  ) {
    return this.agentLogService.createSession(req.user.id, body);
  }

  @Post('sessions/:id/logs')
  @ApiOperation({ summary: 'Append a log entry to a session' })
  addLog(
    @Request() req: RequestWithUser,
    @Param('id') sessionId: string,
    @Body() body: { message: string; level?: string },
  ) {
    return this.agentLogService.addLog(sessionId, req.user.id, body);
  }

  @Post('sessions/:id/finish')
  @ApiOperation({ summary: 'Finish a session with a final status' })
  finishSession(
    @Request() req: RequestWithUser,
    @Param('id') sessionId: string,
    @Body() body: { status: string },
  ) {
    return this.agentLogService.finishSession(sessionId, req.user.id, body);
  }

  @Get('sessions')
  @ApiOperation({ summary: 'List agent sessions for current user' })
  @ApiQuery({ name: 'type', required: false, enum: ['WORKER', 'REVIEWER'] })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  listSessions(
    @Request() req: RequestWithUser,
    @Query('type') type?: string,
    @Query('limit') limit?: string,
  ) {
    return this.agentLogService.listSessions(
      req.user.id,
      (type as 'WORKER' | 'REVIEWER') || 'WORKER',
      limit ? parseInt(limit, 10) : 50,
    );
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get agent stats for current user' })
  @ApiQuery({ name: 'type', required: false, enum: ['WORKER', 'REVIEWER'] })
  getStats(
    @Request() req: RequestWithUser,
    @Query('type') type?: string,
  ) {
    return this.agentLogService.getStats(
      req.user.id,
      (type as 'WORKER' | 'REVIEWER') || 'WORKER',
    );
  }

  @Post('stats/increment')
  @ApiOperation({ summary: 'Increment agent stats' })
  incrementStats(
    @Request() req: RequestWithUser,
    @Body()
    body: {
      type: 'WORKER' | 'REVIEWER';
      tokensUsed?: number;
      tasksCompleted?: number;
      earnings?: number;
      reviewed?: number;
      approved?: number;
      rejected?: number;
    },
  ) {
    const { type, ...data } = body;
    return this.agentLogService.incrementStats(req.user.id, type || 'WORKER', data);
  }

  @Delete('clear')
  @ApiOperation({ summary: 'Clear all sessions and reset stats' })
  @ApiQuery({ name: 'type', required: false, enum: ['WORKER', 'REVIEWER'] })
  clearAll(
    @Request() req: RequestWithUser,
    @Query('type') type?: string,
  ) {
    return this.agentLogService.clearAll(
      req.user.id,
      (type as 'WORKER' | 'REVIEWER') || 'WORKER',
    );
  }
}
