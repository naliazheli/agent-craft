import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT } from '../redis/redis.module';
import { BlockchainService } from '../wallet/blockchain.service';
import { normalizeSystemEmail } from '../common/system-email';

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;
const CACHE_TTL_SECONDS = 10 * 60;
const OVERVIEW_KEY = 'aicoin:overview:v2';
const LEADERBOARD_KEY_PREFIX = 'aicoin:leaderboard:v2';
const AICOIN_REWARD_POOL_ALLOCATION = 20_000_000;
const AICOIN_TOKEN_TOTAL_SUPPLY = 50_000_000;
const SYSTEM_EMAIL = normalizeSystemEmail(process.env.SYSTEM_USER_EMAIL);
const REWARD_POOL_EMAIL =
  process.env.REWARD_POOL_USER_EMAIL || 'reward-pool@aifactory.local';

type LeaderboardEntry = {
  rank: number;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  earned: number;
  payoutCount: number;
};

@Injectable()
export class AicoinService implements OnModuleInit {
  private readonly logger = new Logger(AicoinService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis | null,
    private readonly blockchainService: BlockchainService,
  ) {}

  async onModuleInit() {
    void this.refreshCachedStats().catch((error) => {
      this.logger.warn(`Initial AICoin stats refresh failed: ${(error as Error).message}`);
    });
  }

  @Cron('*/5 * * * *')
  async refreshCachedStats() {
    await Promise.all([this.buildOverview(true), this.buildLeaderboard(100, true)]);
  }

  async getOverview() {
    const cached = await this.getJson(OVERVIEW_KEY);
    if (cached) return cached;
    return this.buildOverview(true);
  }

  async getLeaderboard(limit = 100) {
    const normalizedLimit = this.normalizeLimit(limit);
    const cacheKey = this.getLeaderboardKey(normalizedLimit);
    const cached = await this.getJson(cacheKey);
    if (cached) return cached;
    return this.buildLeaderboard(normalizedLimit, true);
  }

  async getHealth() {
    const [systemUser, rewardPoolUser, activeTaskStats, pendingPayoutStats, rewardPoolOnchain] =
      await Promise.all([
        this.prisma.user.findUnique({
          where: { email: SYSTEM_EMAIL },
          select: { id: true, email: true, balance: true },
        }),
        this.prisma.user.findUnique({
          where: { email: REWARD_POOL_EMAIL },
          select: { id: true, email: true, balance: true },
        }),
        this.prisma.task.aggregate({
          where: { status: { in: ['OPEN', 'REVIEWING'] as any } },
          _count: { _all: true },
          _sum: { reward: true },
        }),
        this.prisma.task.aggregate({
          where: {
            status: { in: ['OPEN', 'REVIEWING'] as any },
            submissions: { some: { status: 'SUBMITTED' } },
          },
          _count: { _all: true },
          _sum: { reward: true },
        }),
        this.blockchainService.getRewardPoolStatus(),
      ]);

    const duplicatePayoutGroups = await this.prisma.transaction.groupBy({
      by: ['taskId', 'toUserId'],
      where: {
        type: 'TASK_PAYOUT',
        status: 'COMPLETED',
        taskId: { not: null },
      },
      _count: { _all: true },
    });

    const duplicatePayouts = duplicatePayoutGroups
      .filter((group) => group._count._all > 1)
      .map((group) => ({
        taskId: group.taskId,
        toUserId: group.toUserId,
        count: group._count._all,
      }));

    return {
      users: {
        system: systemUser,
        rewardPool: rewardPoolUser,
      },
      offchain: {
        rewardPoolBalance: rewardPoolUser?.balance ?? null,
        systemBudget: systemUser?.balance ?? null,
        activeEscrowedAmount: activeTaskStats._sum.reward || 0,
        activeTaskCount: activeTaskStats._count._all,
        pendingPayoutLiability: pendingPayoutStats._sum.reward || 0,
        pendingPayoutTaskCount: pendingPayoutStats._count._all,
      },
      onchain: {
        rewardPool: rewardPoolOnchain,
      },
      reconciliation: {
        duplicatePayouts,
        missingSystemUser: !systemUser,
        missingRewardPoolUser: !rewardPoolUser,
      },
      updatedAt: new Date().toISOString(),
    };
  }

  private async buildOverview(writeCache: boolean) {
    const leaderboard = await this.buildLeaderboard(20, writeCache);
    const activeTaskWhere = { status: { in: ['OPEN', 'REVIEWING'] as any } };
    const [problemCount, activeTaskStats, completedTaskCount] = await Promise.all([
      this.prisma.mathProblem.count(),
      this.prisma.task.aggregate({
        where: activeTaskWhere,
        _count: { _all: true },
        _sum: { reward: true },
      }),
      this.prisma.task.count({ where: { status: 'COMPLETED' } }),
    ]);
    const activeTaskValue = activeTaskStats._sum.reward || 0;

    const overview = {
      contract: {
        name: 'AI Coin',
        symbol: 'AIC',
        chain: 'Polygon PoS',
        rewardPoolAllocation: AICOIN_REWARD_POOL_ALLOCATION,
        rewardPoolAllocationLabel: this.formatAic(AICOIN_REWARD_POOL_ALLOCATION),
        tokenTotalSupply: AICOIN_TOKEN_TOTAL_SUPPLY,
        tokenTotalSupplyLabel: this.formatAic(AICOIN_TOKEN_TOTAL_SUPPLY),
        monthlyRelease: 100_000,
        monthlyReleaseLabel: this.formatAic(100_000),
        contractAddress: process.env.AIC_CONTRACT_ADDRESS || null,
        vestingContractAddress: process.env.AIC_VESTING_CONTRACT_ADDRESS || null,
      },
      taskMarket: {
        activeTaskCount: activeTaskStats._count._all,
        activeTaskValue,
        activeTaskValueLabel: this.formatAic(activeTaskValue),
        problemCount,
        completedTaskCount,
      },
      questionBank: {
        problemCount,
        openTaskCount: activeTaskStats._count._all,
        completedTaskCount,
      },
      leaderboard,
      updatedAt: new Date().toISOString(),
    };

    if (writeCache) {
      await this.setJson(OVERVIEW_KEY, overview);
    }

    return overview;
  }

  private async buildLeaderboard(limit: number, writeCache: boolean) {
    const normalizedLimit = this.normalizeLimit(limit);
    const { start, end, monthKey } = this.getShanghaiMonthRange();
    const [rows, totalEarners] = await Promise.all([
      this.prisma.transaction.groupBy({
        by: ['toUserId'],
        where: {
          type: 'TASK_PAYOUT',
          status: 'COMPLETED',
          createdAt: {
            gte: start,
            lt: end,
          },
        },
        _sum: { amount: true },
        _count: { _all: true },
        orderBy: [{ _sum: { amount: 'desc' } }, { _count: { toUserId: 'desc' } }],
        take: normalizedLimit,
      }),
      this.prisma.transaction.groupBy({
        by: ['toUserId'],
        where: {
          type: 'TASK_PAYOUT',
          status: 'COMPLETED',
          createdAt: {
            gte: start,
            lt: end,
          },
        },
      }),
    ]);

    const userIds = rows.map((row) => row.toUserId);
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarUrl: true,
      },
    });
    const userById = new Map(users.map((user) => [user.id, user]));

    const entries: LeaderboardEntry[] = rows.map((row, index) => {
      const user = userById.get(row.toUserId);
      return {
        rank: index + 1,
        userId: row.toUserId,
        displayName: user?.displayName || user?.email?.split('@')[0] || 'Unknown user',
        avatarUrl: user?.avatarUrl || null,
        earned: row._sum.amount || 0,
        payoutCount: row._count._all,
      };
    });

    const result = {
      monthKey,
      limit: normalizedLimit,
      totalEarners: totalEarners.length,
      hasMore: totalEarners.length > normalizedLimit,
      entries,
      updatedAt: new Date().toISOString(),
    };

    if (writeCache) {
      await this.setJson(this.getLeaderboardKey(normalizedLimit), result);
    }

    return result;
  }

  private getShanghaiMonthRange(date = new Date()) {
    const shanghaiNow = new Date(date.getTime() + SHANGHAI_OFFSET_MS);
    const year = shanghaiNow.getUTCFullYear();
    const month = shanghaiNow.getUTCMonth();
    const startUtc = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0) - SHANGHAI_OFFSET_MS);
    const endUtc = new Date(Date.UTC(year, month + 1, 1, 0, 0, 0, 0) - SHANGHAI_OFFSET_MS);

    return {
      start: startUtc,
      end: endUtc,
      monthKey: `${year}-${String(month + 1).padStart(2, '0')}`,
    };
  }

  private normalizeLimit(limit: number) {
    if (!Number.isFinite(limit)) return 100;
    return Math.min(Math.max(Math.floor(limit), 1), 100);
  }

  private getLeaderboardKey(limit: number) {
    return `${LEADERBOARD_KEY_PREFIX}:${limit}`;
  }

  private formatAic(amount: number) {
    return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(amount)} AIC`;
  }

  private async getJson<T = unknown>(key: string): Promise<T | null> {
    if (!this.redis) return null;
    try {
      const value = await this.redis.get(key);
      return value ? (JSON.parse(value) as T) : null;
    } catch (error) {
      this.logger.warn(`Redis read failed for ${key}: ${(error as Error).message}`);
      return null;
    }
  }

  private async setJson(key: string, value: unknown) {
    if (!this.redis) return;
    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', CACHE_TTL_SECONDS);
    } catch (error) {
      this.logger.warn(`Redis write failed for ${key}: ${(error as Error).message}`);
    }
  }
}
