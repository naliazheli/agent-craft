import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const HOMEPAGE_VISITS_KEY = 'analytics.homepageVisits';
const RETAINED_VISIT_DAYS = 90;

interface HomepageVisitStats {
  total: number;
  byDay: Record<string, number>;
  firstTrackedAt?: string;
  updatedAt?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toPositiveInt(value: unknown, fallback: number) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0) return fallback;
  return Math.floor(numberValue);
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

@Injectable()
export class OperationsService {
  constructor(private readonly prisma: PrismaService) {}

  async recordHomepageVisit() {
    const now = new Date();
    const today = isoDate(now);
    const nowIso = now.toISOString();
    const existing = await this.prisma.systemConfig.findUnique({
      where: { key: HOMEPAGE_VISITS_KEY },
    });
    const current = this.normalizeHomepageVisits(existing?.value);
    const byDay = this.compactByDay({
      ...current.byDay,
      [today]: (current.byDay[today] || 0) + 1,
    });
    const next: HomepageVisitStats = {
      total: current.total + 1,
      byDay,
      firstTrackedAt: current.firstTrackedAt || nowIso,
      updatedAt: nowIso,
    };

    await this.prisma.systemConfig.upsert({
      where: { key: HOMEPAGE_VISITS_KEY },
      create: { key: HOMEPAGE_VISITS_KEY, value: next as unknown as Prisma.InputJsonValue },
      update: { value: next as unknown as Prisma.InputJsonValue },
    });
  }

  async getOverview() {
    const now = new Date();
    const todayStart = startOfUtcDay(now);
    const sevenDaysAgo = new Date(todayStart);
    sevenDaysAgo.setUTCDate(todayStart.getUTCDate() - 6);

    const [
      homepageConfig,
      totalUsers,
      humanUsers,
      agentUsers,
      adminUsers,
      newToday,
      newLast7Days,
      totalProjects,
      projectCreatorRows,
      leadAgentMemberRows,
      leadAgentLaunchEvents,
      totalLlmConfigs,
      activeLlmConfigs,
      llmConfiguredUserRows,
      recentUsers,
    ] = await Promise.all([
      this.prisma.systemConfig.findUnique({ where: { key: HOMEPAGE_VISITS_KEY } }),
      this.prisma.user.count(),
      this.prisma.user.count({ where: { role: 'HUMAN' } }),
      this.prisma.user.count({ where: { role: 'AI_AGENT' } }),
      this.prisma.user.count({ where: { role: 'ADMIN' } }),
      this.prisma.user.count({ where: { createdAt: { gte: todayStart } } }),
      this.prisma.user.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
      this.prisma.project.count({ where: { deletedAt: null } }),
      this.prisma.project.groupBy({
        by: ['ownerId'],
        where: { deletedAt: null },
      }),
      this.prisma.projectMember.findMany({
        where: {
          role: 'LEAD_AGENT',
          removedAt: null,
          project: { deletedAt: null },
        },
        select: {
          id: true,
          projectId: true,
          permissions: true,
        },
      }),
      this.prisma.projectEvent.findMany({
        where: {
          type: 'AGENT_RUNTIME_LAUNCHED',
          project: { deletedAt: null },
        },
        select: {
          projectId: true,
          payload: true,
        },
      }),
      this.prisma.apiConfig.count(),
      this.prisma.apiConfig.count({ where: { isActive: true } }),
      this.prisma.apiConfig.groupBy({
        by: ['userId'],
      }),
      this.prisma.user.findMany({
        orderBy: { createdAt: 'desc' },
        take: 6,
        select: {
          id: true,
          email: true,
          displayName: true,
          role: true,
          authProvider: true,
          githubLogin: true,
          createdAt: true,
        },
      }),
    ]);

    const homepageVisits = this.normalizeHomepageVisits(homepageConfig?.value);
    const today = isoDate(now);
    const leadAgentLaunchedMembers = leadAgentMemberRows.filter((member) =>
      this.hasRuntimeSession(member.permissions),
    );
    const leadAgentLaunchEventRows = leadAgentLaunchEvents.filter((event) => {
      const payload = isRecord(event.payload) ? event.payload : {};
      return payload.targetRole === 'LEAD_AGENT';
    });
    const leadAgentCreatedProjects = new Set(leadAgentMemberRows.map((member) => member.projectId)).size;
    const leadAgentLaunchedProjects = new Set([
      ...leadAgentLaunchedMembers.map((member) => member.projectId),
      ...leadAgentLaunchEventRows.map((event) => event.projectId),
    ]).size;
    const projectCreators = projectCreatorRows.length;
    const llmConfiguredUsers = llmConfiguredUserRows.length;

    return {
      homepageVisits: {
        total: homepageVisits.total,
        today: homepageVisits.byDay[today] || 0,
        last7Days: this.buildLastDays(homepageVisits.byDay, 7),
        firstTrackedAt: homepageVisits.firstTrackedAt || null,
        updatedAt: homepageVisits.updatedAt || null,
      },
      users: {
        total: totalUsers,
        newToday,
        newLast7Days,
        byRole: {
          HUMAN: humanUsers,
          AI_AGENT: agentUsers,
          ADMIN: adminUsers,
        },
        recent: recentUsers,
      },
      funnel: {
        entered: homepageVisits.total,
        projectsCreated: totalProjects,
        projectCreators,
        leadAgentsCreated: leadAgentMemberRows.length,
        leadAgentProjects: leadAgentCreatedProjects,
        leadAgentsLaunched: Math.max(leadAgentLaunchedMembers.length, leadAgentLaunchEventRows.length),
        leadAgentLaunchedProjects,
        llmConfiguredUsers,
        llmConfigs: totalLlmConfigs,
        activeLlmConfigs,
        conversion: {
          visitToProjectCreator:
            homepageVisits.total >= projectCreators && homepageVisits.total > 0
              ? projectCreators / homepageVisits.total
              : null,
          projectToLeadAgentLaunch:
            totalProjects > 0 ? leadAgentLaunchedProjects / totalProjects : null,
          projectCreatorToLlmConfigured:
            projectCreators > 0 ? llmConfiguredUsers / projectCreators : null,
        },
      },
      updatedAt: now.toISOString(),
    };
  }

  async listUsers(query: { page?: number; limit?: number; q?: string }) {
    const limit = Math.min(Math.max(toPositiveInt(query.limit, 20), 1), 100);
    const requestedPage = Math.max(toPositiveInt(query.page, 1), 1);
    const search = query.q?.trim();
    const where = search
      ? {
          OR: [
            { email: { contains: search } },
            { displayName: { contains: search } },
            { githubLogin: { contains: search } },
          ],
        }
      : undefined;

    const total = await this.prisma.user.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const page = Math.min(requestedPage, totalPages);
    const data = await this.prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        authProvider: true,
        githubLogin: true,
        balance: true,
        isEmailVerified: true,
        createdAt: true,
      },
    });

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages,
      },
    };
  }

  private hasRuntimeSession(permissions: Prisma.JsonValue | null | undefined) {
    if (!isRecord(permissions)) return false;
    return isRecord(permissions.runtimeSession);
  }

  private normalizeHomepageVisits(value: Prisma.JsonValue | null | undefined): HomepageVisitStats {
    if (typeof value === 'number') {
      return { total: toPositiveInt(value, 0), byDay: {} };
    }
    if (!isRecord(value)) {
      return { total: 0, byDay: {} };
    }

    const rawByDay = isRecord(value.byDay) ? value.byDay : {};
    const byDay = Object.entries(rawByDay).reduce<Record<string, number>>((acc, [day, count]) => {
      if (/^\d{4}-\d{2}-\d{2}$/.test(day)) {
        acc[day] = toPositiveInt(count, 0);
      }
      return acc;
    }, {});
    const byDayTotal = Object.values(byDay).reduce((sum, count) => sum + count, 0);

    return {
      total: Math.max(toPositiveInt(value.total, byDayTotal), byDayTotal),
      byDay,
      firstTrackedAt: typeof value.firstTrackedAt === 'string' ? value.firstTrackedAt : undefined,
      updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : undefined,
    };
  }

  private compactByDay(byDay: Record<string, number>) {
    return Object.entries(byDay)
      .sort(([left], [right]) => right.localeCompare(left))
      .slice(0, RETAINED_VISIT_DAYS)
      .reduce<Record<string, number>>((acc, [day, count]) => {
        acc[day] = count;
        return acc;
      }, {});
  }

  private buildLastDays(byDay: Record<string, number>, days: number) {
    const today = startOfUtcDay(new Date());
    return Array.from({ length: days }, (_, index) => {
      const date = new Date(today);
      date.setUTCDate(today.getUTCDate() - (days - 1 - index));
      const day = isoDate(date);
      return {
        date: day,
        count: byDay[day] || 0,
      };
    });
  }
}
