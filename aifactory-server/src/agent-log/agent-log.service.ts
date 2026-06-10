import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AgentLogService {
  constructor(private readonly prisma: PrismaService) {}

  /** Create a new agent session (task execution or review execution) */
  async createSession(
    userId: string,
    data: {
      type: 'WORKER' | 'REVIEWER';
      taskId?: string;
      taskTitle?: string;
      reward?: number;
      currency?: string;
      workerName?: string;
    },
  ) {
    return this.prisma.agentSession.create({
      data: {
        userId,
        type: data.type,
        taskId: data.taskId,
        taskTitle: data.taskTitle,
        reward: data.reward ?? 0,
        currency: data.currency ?? 'AIC',
        workerName: data.workerName,
        status: 'evaluating',
      },
      include: { logs: true },
    });
  }

  /** Append a log entry to a session */
  async addLog(
    sessionId: string,
    userId: string,
    data: { message: string; level?: string },
  ) {
    // Verify ownership
    const session = await this.prisma.agentSession.findFirst({
      where: { id: sessionId, userId },
    });
    if (!session) return null;

    return this.prisma.agentSessionLog.create({
      data: {
        sessionId,
        message: data.message,
        level: data.level ?? 'info',
      },
    });
  }

  /** Finish a session (set status + finishedAt) */
  async finishSession(
    sessionId: string,
    userId: string,
    data: { status: string },
  ) {
    return this.prisma.agentSession.updateMany({
      where: { id: sessionId, userId },
      data: { status: data.status, finishedAt: new Date() },
    });
  }

  /** List sessions for a user, newest first */
  async listSessions(
    userId: string,
    type: 'WORKER' | 'REVIEWER',
    limit = 50,
  ) {
    return this.prisma.agentSession.findMany({
      where: { userId, type },
      include: { logs: { orderBy: { createdAt: 'asc' } } },
      orderBy: { startedAt: 'desc' },
      take: limit,
    });
  }

  /** Get or create stats for a user+type */
  async getStats(userId: string, type: 'WORKER' | 'REVIEWER') {
    return this.prisma.agentStats.upsert({
      where: { userId_type: { userId, type } },
      create: { userId, type },
      update: {},
    });
  }

  /** Increment stats atomically */
  async incrementStats(
    userId: string,
    type: 'WORKER' | 'REVIEWER',
    data: {
      tokensUsed?: number;
      tasksCompleted?: number;
      earnings?: number;
      reviewed?: number;
      approved?: number;
      rejected?: number;
    },
  ) {
    // Ensure row exists
    await this.prisma.agentStats.upsert({
      where: { userId_type: { userId, type } },
      create: { userId, type },
      update: {},
    });

    return this.prisma.agentStats.update({
      where: { userId_type: { userId, type } },
      data: {
        tokensUsed: data.tokensUsed ? { increment: data.tokensUsed } : undefined,
        tasksCompleted: data.tasksCompleted ? { increment: data.tasksCompleted } : undefined,
        earnings: data.earnings ? { increment: data.earnings } : undefined,
        reviewed: data.reviewed ? { increment: data.reviewed } : undefined,
        approved: data.approved ? { increment: data.approved } : undefined,
        rejected: data.rejected ? { increment: data.rejected } : undefined,
      },
    });
  }

  /** Clear all sessions + reset stats for a user+type */
  async clearAll(userId: string, type: 'WORKER' | 'REVIEWER') {
    await this.prisma.agentSession.deleteMany({ where: { userId, type } });
    await this.prisma.agentStats.updateMany({
      where: { userId, type },
      data: {
        tokensUsed: 0,
        tasksCompleted: 0,
        earnings: 0,
        reviewed: 0,
        approved: 0,
        rejected: 0,
      },
    });
    return { cleared: true };
  }
}
