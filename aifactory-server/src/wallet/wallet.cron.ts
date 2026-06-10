import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from './wallet.service';
import { TasksService } from '../tasks/tasks.service';
import { LlmService } from '../llm/llm.service';
import { LlmApiType } from '../llm/dto/chat.dto';
import { normalizeSystemEmail } from '../common/system-email';

const SYSTEM_EMAIL = normalizeSystemEmail(process.env.SYSTEM_USER_EMAIL);
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

const PROGRAMMING_TOPICS = [
  'array manipulation', 'string processing', 'binary search', 'dynamic programming',
  'graph traversal', 'tree algorithms', 'sorting algorithms', 'hash tables',
  'linked lists', 'stack and queue', 'greedy algorithms', 'backtracking',
  'bit manipulation', 'two pointers', 'sliding window', 'recursion',
  'matrix operations', 'interval problems', 'topological sort', 'union find',
  'trie data structure', 'heap / priority queue', 'binary indexed tree',
  'segment tree', 'shortest path', 'minimum spanning tree', 'network flow',
  'regular expressions', 'REST API design', 'database query optimization',
];

const DIFFICULTY_REWARD: Record<string, { min: number; max: number }> = {
  easy: { min: 5, max: 10 },
  medium: { min: 15, max: 30 },
  hard: { min: 30, max: 50 },
  unsolved: { min: 50, max: 100 },
};

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

@Injectable()
export class WalletCron {
  private readonly logger = new Logger(WalletCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly walletService: WalletService,
    private readonly tasksService: TasksService,
    private readonly llmService: LlmService,
  ) {}

  private getShanghaiDayKey(date = new Date()) {
    const shanghaiNow = new Date(date.getTime() + SHANGHAI_OFFSET_MS);
    return `${shanghaiNow.getUTCFullYear()}-${String(shanghaiNow.getUTCMonth() + 1).padStart(2, '0')}-${String(shanghaiNow.getUTCDate()).padStart(2, '0')}`;
  }

  private async withCronLock<T>(lockName: string, callback: () => Promise<T>): Promise<T | null> {
    const rows = (await this.prisma.$queryRaw<
      Array<{ acquired: number | bigint | null }>
    >`SELECT GET_LOCK(${lockName}, 5) AS acquired`) ?? [];
    const acquired = Number(rows[0]?.acquired ?? 0);

    if (acquired !== 1) {
      this.logger.warn(`Skipping cron run because lock is busy: ${lockName}`);
      return null;
    }

    try {
      return await callback();
    } finally {
      await this.prisma.$queryRaw`DO RELEASE_LOCK(${lockName})`;
    }
  }

  @Cron('0 0 * * *', { timeZone: 'Asia/Shanghai' })
  async dailyInjection() {
    this.logger.log('Running daily AIC injection...');
    await this.withCronLock(`cron:daily-injection:${this.getShanghaiDayKey()}`, async () => {
      try {
        const amount = await this.walletService.injectDaily();
        if (amount > 0) {
          this.logger.log(`Injected ${amount} AIC into system budget`);
        } else {
          this.logger.log('Daily injection already exists for today, skipping duplicate run');
        }
      } catch (err) {
        this.logger.error('Daily injection failed', err);
      }
    });
  }

  @Cron('5 0 * * *', { timeZone: 'Asia/Shanghai' })
  async dailyAiTasks() {
    this.logger.log('Running daily AI task generation...');
    await this.withCronLock(`cron:daily-ai-tasks:${this.getShanghaiDayKey()}`, async () => {
      try {
        const { totalBudget, mathBudget, programmingBudget } = this.getDailyAiTaskBudgets();
        const systemUser = await this.findSystemUser();
        if (!systemUser) return;

        let mathSpent = 0;
        let progSpent = 0;
        let mathCount = 0;
        let progCount = 0;

        // --- Math problems from bank ---
        mathSpent = await this.publishMathTasks(systemUser.id, mathBudget);
        mathCount = mathSpent > 0 ? Math.ceil(mathSpent / 20) : 0; // approximate

        // --- LLM programming tasks ---
        const progResult = await this.publishProgrammingTasks(
          systemUser.id,
          programmingBudget,
        );
        progSpent = progResult.spent;
        progCount = progResult.count;

        this.logger.log(
          `Daily AI tasks: math=${mathCount} (${mathSpent} AIC), programming=${progCount} (${progSpent} AIC), total=${mathSpent + progSpent}/${totalBudget} AIC`,
        );
      } catch (err) {
        this.logger.error('Daily AI task generation failed', err);
      }
    });
  }

  async publishMathTasksNow() {
    const { mathBudget } = this.getDailyAiTaskBudgets();
    const systemUser = await this.findSystemUser();
    if (!systemUser) return { spent: 0, budget: mathBudget };

    const spent = await this.publishMathTasks(systemUser.id, mathBudget);
    this.logger.log(`Manual math task publish complete: spent=${spent}/${mathBudget} AIC`);
    return { spent, budget: mathBudget };
  }

  private getDailyAiTaskBudgets() {
    const dailyAmount = parseInt(process.env.DAILY_INJECT_AMOUNT || '10000', 10);
    const ratio = parseFloat(process.env.AI_TASK_RATIO || '0.7');
    const totalBudget = Math.floor(dailyAmount * ratio);

    return {
      totalBudget,
      mathBudget: Math.floor(totalBudget * 0.4),
      programmingBudget: totalBudget - Math.floor(totalBudget * 0.4),
    };
  }

  private async findSystemUser() {
    const systemUser = await this.prisma.user.findUnique({
      where: { email: SYSTEM_EMAIL },
      select: { id: true, balance: true },
    });
    if (!systemUser) {
      this.logger.error('System user not found');
      return null;
    }
    return systemUser;
  }

  private async publishMathTasks(systemUserId: string, budget: number): Promise<number> {
    const problems = await this.prisma.mathProblem.findMany({
      orderBy: [{ usedCount: 'asc' }, { createdAt: 'asc' }],
      take: 100,
    });

    let spent = 0;

    for (const problem of problems) {
      if (spent >= budget) break;

      const rewardRange = DIFFICULTY_REWARD[problem.difficulty] || DIFFICULTY_REWARD.medium;
      const reward = randInt(rewardRange.min, rewardRange.max);

      if (spent + reward > budget) continue;

      try {
        const description = [
          problem.description,
          problem.hint ? `\nHint: ${problem.hint}` : '',
          problem.source ? `\nSource: ${problem.source}` : '',
        ].join('');

        await this.tasksService.create(systemUserId, {
          title: `[Math] ${problem.title}`,
          description,
          acceptanceCriteria: 'Provide a complete, rigorous solution with clear reasoning. Show all steps.',
          reward,
          tags: ['math', problem.category, problem.difficulty],
        });

        await this.prisma.mathProblem.update({
          where: { id: problem.id },
          data: { usedCount: { increment: 1 } },
        });

        spent += reward;
      } catch (err) {
        this.logger.warn(`Failed to publish math task "${problem.title}": ${err.message}`);
      }
    }

    return spent;
  }

  private async publishProgrammingTasks(
    systemUserId: string,
    budget: number,
  ): Promise<{ spent: number; count: number }> {
    let spent = 0;
    let count = 0;
    const minReward = parseInt(process.env.AI_TASK_MIN_REWARD || '5', 10);
    const maxReward = Math.min(
      parseInt(process.env.AI_TASK_MAX_REWARD || '100', 10),
      40,
    );

    // Check if LLM is configured (system-level config for task generation)
    const llmApiUrl = process.env.LLM_API_URL;
    const llmApiKey = process.env.LLM_API_KEY;
    const llmModel = process.env.LLM_MODEL || 'gpt-4o-mini';
    const llmApiType = (process.env.LLM_API_TYPE || 'openai') === 'claude' ? LlmApiType.CLAUDE : LlmApiType.OPENAI;

    if (!llmApiUrl || !llmApiKey) {
      this.logger.warn('LLM not configured for task generation (LLM_API_URL / LLM_API_KEY). Skipping programming tasks.');
      return { spent: 0, count: 0 };
    }

    const shuffledTopics = [...PROGRAMMING_TOPICS].sort(() => Math.random() - 0.5);
    let topicIndex = 0;

    while (spent < budget && topicIndex < shuffledTopics.length) {
      const topic = shuffledTopics[topicIndex % shuffledTopics.length];
      topicIndex++;

      const reward = randInt(minReward, maxReward);
      if (spent + reward > budget) continue;

      try {
        const result = await this.llmService.chat({
          messages: [
            {
              role: 'system',
              content: `You are a programming challenge creator. Generate a clear, self-contained programming challenge. Output JSON with fields: "title" (short), "description" (detailed problem statement with examples), "acceptanceCriteria" (what a correct solution must do). Do NOT include the solution.`,
            },
            {
              role: 'user',
              content: `Create a programming challenge about: ${topic}. Difficulty should match a reward of ${reward} AIC (5=trivial, 40=hard).`,
            },
          ],
          apiUrl: llmApiUrl,
          apiKey: llmApiKey,
          modelName: llmModel,
          apiType: llmApiType,
          maxTokens: 1024,
        });

        let parsed: any;
        try {
          const jsonMatch = result.content.match(/\{[\s\S]*\}/);
          parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
        } catch {
          this.logger.warn(`Failed to parse LLM response for topic "${topic}"`);
          continue;
        }

        if (!parsed?.title || !parsed?.description) continue;

        await this.tasksService.create(systemUserId, {
          title: `[Programming] ${parsed.title}`,
          description: parsed.description,
          acceptanceCriteria: parsed.acceptanceCriteria || 'Provide a working solution with explanation.',
          reward,
          tags: ['programming', topic.replace(/\s+/g, '_')],
        });

        spent += reward;
        count++;
      } catch (err) {
        this.logger.warn(`Failed to generate programming task for "${topic}": ${err.message}`);
      }
    }

    return { spent, count };
  }
}
