import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeSystemEmail } from '../common/system-email';

const SYSTEM_EMAIL = normalizeSystemEmail(process.env.SYSTEM_USER_EMAIL);
const REWARD_POOL_EMAIL =
  process.env.REWARD_POOL_USER_EMAIL || 'reward-pool@aifactory.local';
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

@Injectable()
export class WalletService {
  constructor(private readonly prisma: PrismaService) {}

  private isRetryableTransactionError(error: unknown): boolean {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
      return false;
    }

    if (error.code === 'P2034') {
      return true;
    }

    return error.code === 'P2003' && error.message.includes('taskId');
  }

  private async withRetry<T>(operation: () => Promise<T>, retries = 3): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt < retries; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        if (!this.isRetryableTransactionError(error) || attempt === retries - 1) {
          throw error;
        }

        await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
      }
    }

    throw lastError;
  }

  private async getSystemUserId(): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { email: SYSTEM_EMAIL },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('System user not found. Run prisma db seed.');
    return user.id;
  }

  private async getRewardPoolUserId(): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { email: REWARD_POOL_EMAIL },
      select: { id: true },
    });
    if (!user) {
      throw new NotFoundException('Reward pool user not found. Run prisma db seed.');
    }
    return user.id;
  }

  private getShanghaiDayRange(date = new Date()) {
    const shanghaiNow = new Date(date.getTime() + SHANGHAI_OFFSET_MS);
    const startUtc = new Date(
      Date.UTC(
        shanghaiNow.getUTCFullYear(),
        shanghaiNow.getUTCMonth(),
        shanghaiNow.getUTCDate(),
        0,
        0,
        0,
        0,
      ) - SHANGHAI_OFFSET_MS,
    );

    return {
      start: startUtc,
      end: new Date(startUtc.getTime() + 24 * 60 * 60 * 1000),
      dayKey: `${shanghaiNow.getUTCFullYear()}-${String(shanghaiNow.getUTCMonth() + 1).padStart(2, '0')}-${String(shanghaiNow.getUTCDate()).padStart(2, '0')}`,
    };
  }

  private async withMySqlLock<T>(lockName: string, callback: () => Promise<T>): Promise<T> {
    const rows = (await this.prisma.$queryRaw<
      Array<{ acquired: number | bigint | null }>
    >`SELECT GET_LOCK(${lockName}, 5) AS acquired`) ?? [];
    const acquired = Number(rows[0]?.acquired ?? 0);

    if (acquired !== 1) {
      throw new BadRequestException(`Failed to acquire lock: ${lockName}`);
    }

    try {
      return await callback();
    } finally {
      await this.prisma.$queryRaw`DO RELEASE_LOCK(${lockName})`;
    }
  }

  async getBalance(userId: string): Promise<number> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { balance: true },
    });
    if (!user) throw new NotFoundException('User not found');
    return user.balance;
  }

  async getTransactions(userId: string, page = 1, limit = 20) {
    const where = {
      status: 'COMPLETED' as const,
      OR: [{ fromUserId: userId }, { toUserId: userId }],
    };

    const [transactions, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        include: {
          fromUser: { select: { id: true, displayName: true } },
          toUser: { select: { id: true, displayName: true } },
          task: { select: { id: true, title: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.transaction.count({ where }),
    ]);

    return {
      data: transactions,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async transfer(
    fromUserId: string,
    toUserId: string,
    amount: number,
    type: string,
    taskId?: string,
    skipBalanceCheck = false,
  ) {
    if (amount <= 0) throw new BadRequestException('Amount must be positive');

    return this.withRetry(() =>
      this.prisma.$transaction(async (tx) => {
        const from = await tx.user.findUnique({
          where: { id: fromUserId },
          select: { balance: true },
        });
        if (!from) throw new NotFoundException('Sender not found');
        if (!skipBalanceCheck && from.balance < amount) {
          throw new BadRequestException('Insufficient balance');
        }

        await tx.user.update({
          where: { id: fromUserId },
          data: { balance: { decrement: amount } },
        });

        await tx.user.update({
          where: { id: toUserId },
          data: { balance: { increment: amount } },
        });

        return tx.transaction.create({
          data: {
            amount,
            type: type as any,
            fromUserId,
            toUserId,
            taskId,
          },
        });
      }),
    );
  }

  async escrow(creatorId: string, amount: number, taskId: string) {
    const rewardPoolId = await this.getRewardPoolUserId();
    return this.transfer(creatorId, rewardPoolId, amount, 'TASK_ESCROW', taskId);
  }

  async payout(taskId: string, workerId: string) {
    const lockName = `wallet:payout:${taskId.slice(0, 18)}:${workerId.slice(0, 18)}`;
    return this.withMySqlLock(lockName, async () => {
      const existingPayout = await this.prisma.transaction.findFirst({
        where: {
          taskId,
          toUserId: workerId,
          type: 'TASK_PAYOUT',
          status: 'COMPLETED',
        },
        orderBy: { createdAt: 'asc' },
      });

      if (existingPayout) {
        return existingPayout;
      }

      const task = await this.prisma.task.findUnique({
        where: { id: taskId },
        select: { reward: true },
      });
      if (!task) throw new NotFoundException('Task not found');

      const rewardPoolId = await this.getRewardPoolUserId();
      return this.transfer(rewardPoolId, workerId, task.reward, 'TASK_PAYOUT', taskId);
    });
  }

  async refund(taskId: string) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: { reward: true, creatorId: true },
    });
    if (!task) throw new NotFoundException('Task not found');

    const rewardPoolId = await this.getRewardPoolUserId();
    return this.transfer(rewardPoolId, task.creatorId, task.reward, 'TASK_REFUND', taskId);
  }

  async grantSignupBonus(userId: string, txHash?: string) {
    const bonus = parseInt(process.env.SIGNUP_BONUS || '5', 10);
    if (bonus <= 0) return;
    const rewardPoolId = await this.getRewardPoolUserId();

    return this.withRetry(() =>
      this.prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: rewardPoolId },
          data: { balance: { decrement: bonus } },
        });

        await tx.user.update({
          where: { id: userId },
          data: { balance: { increment: bonus } },
        });

        return tx.transaction.create({
          data: {
            amount: bonus,
            type: 'SIGNUP_BONUS' as any,
            txHash: txHash || null,
            fromUserId: rewardPoolId,
            toUserId: userId,
          },
        });
      }),
    );
  }

  async reserveWithdrawal(userId: string, amount: number) {
    if (amount <= 0) throw new BadRequestException('Amount must be positive');

    const rewardPoolId = await this.getRewardPoolUserId();

    return this.withRetry(() =>
      this.prisma.$transaction(async (tx) => {
        const user = await tx.user.findUnique({
          where: { id: userId },
          select: { balance: true },
        });
        if (!user) throw new NotFoundException('User not found');
        if (user.balance < amount) {
          throw new BadRequestException('Insufficient off-chain balance');
        }

        await tx.user.update({
          where: { id: userId },
          data: { balance: { decrement: amount } },
        });

        await tx.user.update({
          where: { id: rewardPoolId },
          data: { balance: { increment: amount } },
        });

        return tx.transaction.create({
          data: {
            amount,
            type: 'WITHDRAWAL' as any,
            status: 'PENDING',
            fromUserId: userId,
            toUserId: rewardPoolId,
          },
        });
      }),
    );
  }

  async completeWithdrawal(transactionId: string, txHash: string) {
    return this.prisma.transaction.update({
      where: { id: transactionId },
      data: {
        txHash,
        status: 'COMPLETED',
      },
    });
  }

  async failWithdrawal(transactionId: string) {
    return this.withRetry(() =>
      this.prisma.$transaction(async (tx) => {
        const transaction = await tx.transaction.findUnique({
          where: { id: transactionId },
          select: {
            amount: true,
            fromUserId: true,
            toUserId: true,
            status: true,
          },
        });

        if (!transaction || transaction.status !== 'PENDING') {
          return transaction;
        }

        await tx.user.update({
          where: { id: transaction.fromUserId },
          data: { balance: { increment: transaction.amount } },
        });

        await tx.user.update({
          where: { id: transaction.toUserId },
          data: { balance: { decrement: transaction.amount } },
        });

        return tx.transaction.update({
          where: { id: transactionId },
          data: { status: 'FAILED' },
        });
      }),
    );
  }

  async injectDaily() {
    const amount = parseInt(process.env.DAILY_INJECT_AMOUNT || '10000', 10);
    if (amount <= 0) {
      return 0;
    }

    const systemId = await this.getSystemUserId();
    const rewardPoolId = await this.getRewardPoolUserId();
    const { start, end, dayKey } = this.getShanghaiDayRange();

    return this.withMySqlLock(`wallet:daily-injection:${dayKey}`, async () => {
      const existing = await this.prisma.transaction.findFirst({
        where: {
          type: 'DAILY_INJECTION',
          fromUserId: rewardPoolId,
          toUserId: systemId,
          createdAt: {
            gte: start,
            lt: end,
          },
        },
        select: { id: true },
      });

      if (existing) {
        return 0;
      }

      await this.transfer(
        rewardPoolId,
        systemId,
        amount,
        'DAILY_INJECTION',
      );

      return amount;
    });
  }
}
