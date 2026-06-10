import { Prisma, PrismaClient } from '@prisma/client';
import bcryptjsModule from 'bcryptjs';
import { createHash } from 'node:crypto';
import {
  loadErdosProblems,
  type SeedErdosProblem,
  type SeedErdosSourceComment,
} from './seed-data/erdos-problems';
import {
  HACKERONE_SEED_FETCH_LIMIT,
  HACKERONE_SEED_PROGRAM_HANDLES,
  HACKERONE_SEED_PROGRAMS,
  HACKERONE_SEED_SCOPE_LIMIT,
} from './seed-data/hackerone-programs';

const prisma = new PrismaClient();
const bcryptjs = (bcryptjsModule as typeof import('bcryptjs') & {
  default?: typeof import('bcryptjs');
}).default ?? bcryptjsModule;

const DEFAULT_SYSTEM_EMAIL = 'system@aifactory.local';
const SYSTEM_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeSeedSystemEmail(value?: string | null) {
  const candidate = (value || '').trim().toLowerCase();
  if (candidate && SYSTEM_EMAIL_RE.test(candidate)) return candidate;
  return DEFAULT_SYSTEM_EMAIL;
}

function normalizeOptionalSeedEmail(value?: string | null) {
  const candidate = (value || '').trim().toLowerCase();
  if (candidate && SYSTEM_EMAIL_RE.test(candidate)) return candidate;
  return '';
}

const LEGACY_SYSTEM_EMAIL = normalizeOptionalSeedEmail(process.env.LEGACY_SYSTEM_EMAIL);
const SYSTEM_EMAIL = normalizeSeedSystemEmail(process.env.SYSTEM_USER_EMAIL);
const SYSTEM_PASSWORD = process.env.SYSTEM_USER_PASSWORD || 'change-me-local';
const DEFAULT_REWARD_POOL_EMAIL = 'reward-pool@aifactory.local';
const REWARD_POOL_EMAIL =
  process.env.REWARD_POOL_USER_EMAIL || DEFAULT_REWARD_POOL_EMAIL;
const REWARD_POOL_INITIAL_BALANCE = parseInt(
  process.env.REWARD_POOL_INITIAL_BALANCE || '20000000',
  10,
);
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;
const HACKERONE_FETCH_SEED_CONFIG_KEY = 'hackerone_fetch_seed';

function stableJsonStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJsonStringify(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJsonStringify(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function valuesEqual(left: unknown, right: unknown) {
  return stableJsonStringify(left) === stableJsonStringify(right);
}

function getShanghaiDayKey(date: Date) {
  const shanghaiNow = new Date(date.getTime() + SHANGHAI_OFFSET_MS);
  return `${shanghaiNow.getUTCFullYear()}-${String(shanghaiNow.getUTCMonth() + 1).padStart(2, '0')}-${String(shanghaiNow.getUTCDate()).padStart(2, '0')}`;
}

async function seedSystemUser() {
  const passwordHash = await bcryptjs.hash(SYSTEM_PASSWORD, 10);
  const legacyUser =
    LEGACY_SYSTEM_EMAIL && SYSTEM_EMAIL !== LEGACY_SYSTEM_EMAIL
      ? await prisma.user.findUnique({
          where: { email: LEGACY_SYSTEM_EMAIL },
          select: { id: true, role: true },
        })
      : null;
  const user = await prisma.user.upsert({
    where: { email: SYSTEM_EMAIL },
    update: {
      passwordHash,
      displayName: 'AI Factory System',
      role: 'ADMIN',
      isEmailVerified: true,
    },
    create: {
      email: SYSTEM_EMAIL,
      passwordHash,
      displayName: 'AI Factory System',
      role: 'ADMIN',
      balance: 0,
      isEmailVerified: true,
    },
  });
  console.log('Seeded system user:', user.id, SYSTEM_EMAIL);
  if (legacyUser) {
    console.warn(
      `Legacy account ${LEGACY_SYSTEM_EMAIL} still exists as ${legacyUser.role}. Sign in with ${SYSTEM_EMAIL} for the seeded system admin.`,
    );
  }
  return user;
}

async function seedRewardPoolUser() {
  const passwordHash = await bcryptjs.hash(
    process.env.REWARD_POOL_USER_PASSWORD || SYSTEM_PASSWORD,
    10,
  );

  const user = await prisma.user.upsert({
    where: { email: REWARD_POOL_EMAIL },
    update: {
      passwordHash,
      displayName: 'AI Factory Reward Pool',
      role: 'ADMIN',
      isEmailVerified: true,
    },
    create: {
      email: REWARD_POOL_EMAIL,
      passwordHash,
      displayName: 'AI Factory Reward Pool',
      role: 'ADMIN',
      balance: REWARD_POOL_INITIAL_BALANCE,
      isEmailVerified: true,
    },
  });

  console.log('Seeded reward pool user:', user.id, REWARD_POOL_EMAIL);
  return user;
}

async function repairEconomyLedger(systemUserId: string, rewardPoolUserId: string) {
  const [escrowResult, payoutResult, refundResult, signupResult, injectionResult] =
    await Promise.all([
      prisma.transaction.updateMany({
        where: {
          type: 'TASK_ESCROW',
          toUserId: systemUserId,
        },
        data: {
          toUserId: rewardPoolUserId,
        },
      }),
      prisma.transaction.updateMany({
        where: {
          type: 'TASK_PAYOUT',
          fromUserId: systemUserId,
          taskId: { not: null },
        },
        data: {
          fromUserId: rewardPoolUserId,
        },
      }),
      prisma.transaction.updateMany({
        where: {
          type: 'TASK_REFUND',
          fromUserId: systemUserId,
          taskId: { not: null },
        },
        data: {
          fromUserId: rewardPoolUserId,
        },
      }),
      prisma.transaction.updateMany({
        where: {
          type: 'SIGNUP_BONUS',
          fromUserId: systemUserId,
        },
        data: {
          fromUserId: rewardPoolUserId,
        },
      }),
      prisma.transaction.updateMany({
        where: {
          type: 'DAILY_INJECTION',
          fromUserId: systemUserId,
          toUserId: systemUserId,
        },
        data: {
          fromUserId: rewardPoolUserId,
        },
      }),
    ]);

  const dailyInjections = await prisma.transaction.findMany({
    where: {
      type: 'DAILY_INJECTION',
      toUserId: systemUserId,
      status: 'COMPLETED',
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      createdAt: true,
    },
  });

  const seenInjectionDays = new Set<string>();
  const duplicateInjectionIds: string[] = [];

  for (const injection of dailyInjections) {
    const dayKey = getShanghaiDayKey(injection.createdAt);
    if (seenInjectionDays.has(dayKey)) {
      duplicateInjectionIds.push(injection.id);
      continue;
    }
    seenInjectionDays.add(dayKey);
  }

  if (duplicateInjectionIds.length > 0) {
    await prisma.transaction.deleteMany({
      where: {
        id: { in: duplicateInjectionIds },
      },
    });
  }

  const completed = { status: 'COMPLETED' as const };
  const [
    injectionIn,
    systemEscrowOut,
    systemRefundIn,
    rewardPoolEscrowIn,
    rewardPoolPayoutOut,
    rewardPoolRefundOut,
    rewardPoolSignupOut,
    rewardPoolInjectionOut,
  ] = await Promise.all([
    prisma.transaction.aggregate({
      where: {
        ...completed,
        type: 'DAILY_INJECTION',
        toUserId: systemUserId,
      },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: {
        ...completed,
        type: 'TASK_ESCROW',
        fromUserId: systemUserId,
      },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: {
        ...completed,
        type: 'TASK_REFUND',
        toUserId: systemUserId,
      },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: {
        ...completed,
        type: 'TASK_ESCROW',
        toUserId: rewardPoolUserId,
      },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: {
        ...completed,
        type: 'TASK_PAYOUT',
        fromUserId: rewardPoolUserId,
        taskId: { not: null },
      },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: {
        ...completed,
        type: 'TASK_REFUND',
        fromUserId: rewardPoolUserId,
      },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: {
        ...completed,
        type: 'SIGNUP_BONUS',
        fromUserId: rewardPoolUserId,
      },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: {
        ...completed,
        type: 'DAILY_INJECTION',
        fromUserId: rewardPoolUserId,
      },
      _sum: { amount: true },
    }),
  ]);

  const systemBalance =
    (injectionIn._sum.amount || 0) -
    (systemEscrowOut._sum.amount || 0) +
    (systemRefundIn._sum.amount || 0);
  const rewardPoolBalance =
    REWARD_POOL_INITIAL_BALANCE +
    (rewardPoolEscrowIn._sum.amount || 0) -
    (rewardPoolPayoutOut._sum.amount || 0) -
    (rewardPoolRefundOut._sum.amount || 0) -
    (rewardPoolSignupOut._sum.amount || 0) -
    (rewardPoolInjectionOut._sum.amount || 0);

  await prisma.user.update({
    where: { id: systemUserId },
    data: { balance: systemBalance },
  });

  await prisma.user.update({
    where: { id: rewardPoolUserId },
    data: { balance: rewardPoolBalance },
  });

  console.log(
    `Repaired wallet ledger (escrow=${escrowResult.count}, payout=${payoutResult.count}, refund=${refundResult.count}, signup=${signupResult.count}, injection=${injectionResult.count})`,
  );
  if (duplicateInjectionIds.length > 0) {
    console.log(`Removed duplicate daily injections: ${duplicateInjectionIds.length}`);
  }
  console.log(
    `Reconciled balances: system=${systemBalance} AIC, reward_pool=${rewardPoolBalance} AIC`,
  );
}

async function seedGithubPublishPolicy() {
  const defaultPolicy = {
    allowedRepos: ['facebook/react', 'vercel/next.js'],
    blockedRepos: [],
    preferredLanguages: ['JavaScript', 'TypeScript', 'Python', 'Go'],
    blockedLabels: ['Status: Unconfirmed', 'needs triage', 'question'],
    blockedKeywords: ['question', 'needs triage'],
    blockedPlatforms: ['apple silicon', 'darwin-arm64', 'macos only', 'windows only', 'ios', 'android'],
    blockedBuildHints: [],
    preferredBuildHints: ['node', 'npm', 'pnpm', 'yarn', 'python', 'go'],
    minimumRepoStars: 100,
    maximumIssueCreatedAgeDays: 180,
    maximumIssueUpdatedAgeDays: 45,
    minimumExecutionSignal: 4,
    requireGithubCiOrBuildManifest: true,
  };

  await prisma.systemConfig.upsert({
    where: { key: 'github_publish_policy' },
    update: { value: defaultPolicy },
    create: {
      key: 'github_publish_policy',
      value: defaultPolicy,
    },
  });

  console.log('Seeded GitHub publish policy');
}

async function seedHackerOneFetchSeedConfig() {
  const programs = HACKERONE_SEED_PROGRAMS.map((program) => ({
    handle: program.handle,
    name: program.name,
  }));
  const value = {
    version: 1,
    source: 'hackerone_api_public_open_bounty_programs',
    fetchedAt: '2026-06-09',
    handles: HACKERONE_SEED_PROGRAM_HANDLES,
    programs,
    defaultProgramLimit: HACKERONE_SEED_FETCH_LIMIT,
    defaultScopeLimit: HACKERONE_SEED_SCOPE_LIMIT,
    filters: {
      offersBounties: true,
      submissionState: 'open',
      state: 'public_mode',
    },
    note:
      'Task generator uses these public HackerOne handles when no handles are supplied. Credentials stay in runtime env and are never seeded.',
  } satisfies Prisma.InputJsonObject;

  await prisma.systemConfig.upsert({
    where: { key: HACKERONE_FETCH_SEED_CONFIG_KEY },
    update: { value },
    create: {
      key: HACKERONE_FETCH_SEED_CONFIG_KEY,
      value,
    },
  });

  console.log(
    `Seeded HackerOne fetch seed config (${HACKERONE_SEED_PROGRAM_HANDLES.length} programs)`,
  );
}

async function seedGithubIssueTestData(systemUserId: string) {
  const publishedSourceUrl = 'https://github.com/demo-org/agentcraft-web/issues/91003';
  let publishedTask = await prisma.task.findFirst({
    where: {
      creatorId: systemUserId,
      sourceUrl: publishedSourceUrl,
    },
  });

  if (!publishedTask) {
    publishedTask = await prisma.task.create({
      data: {
        title: '[GitHub] Fix task generator tab loading state',
        description: [
          'The task generator admin page should preserve button disabled state while batch actions are running.',
          '',
          `**Original Issue**: ${publishedSourceUrl}`,
          '**Repository**: demo-org/agentcraft-web',
        ].join('\n'),
        acceptanceCriteria: [
          'Confirm whether the expected output is a UI fix or just reproduction notes.',
          'Use demo-org/agentcraft-web as the target repository.',
          `Reference the original issue at ${publishedSourceUrl}.`,
          'If you submit completed work, include concrete verification steps.',
        ].join('\n'),
        reward: 18,
        currency: 'AIC',
        tags: ['frontend', 'github', 'react'],
        taskSource: 'GITHUB_ISSUE',
        sourceUrl: publishedSourceUrl,
        sourceRepo: 'demo-org/agentcraft-web',
        sourceIssueNumber: 91003,
        creatorId: systemUserId,
      },
    });
  }

  const rawTasks = [
    {
      externalId: '91001',
      externalUrl: 'https://github.com/demo-org/agentcraft-web/issues/91001',
      repoOwner: 'demo-org',
      repoName: 'agentcraft-web',
      title: 'Improve GitHub task tab empty state copy',
      body: 'The task generator screen has a blank empty state. Add clearer guidance for system operators.',
      labels: ['ui', 'good first issue'],
      externalCreator: 'agentcraft',
      hasBounty: false,
      status: 'PENDING',
      difficultyScore: null,
      valueScore: null,
      estimatedReward: null,
      aiSummary: null,
      aiTags: [],
      shouldPublish: null,
      publishedTaskId: null,
    },
    {
      externalId: '91002',
      externalUrl: 'https://github.com/demo-org/agentcraft-web/issues/91002',
      repoOwner: 'demo-org',
      repoName: 'agentcraft-web',
      title: 'Add retry guard for GitHub batch publish',
      body: 'Publishing scored raw tasks can create duplicate operator clicks. Add idempotent UX feedback and guardrails.',
      labels: ['backend', 'task-generator'],
      externalCreator: 'agentcraft',
      hasBounty: true,
      bountyAmount: 25,
      bountyCurrency: 'USD',
      status: 'SCORED',
      difficultyScore: 3,
      valueScore: 4,
      estimatedReward: 22,
      aiSummary: 'Prevent accidental repeated publish actions and ensure the operator can safely retry.',
      aiTags: ['nestjs', 'github', 'workflow'],
      shouldPublish: true,
      publishedTaskId: null,
    },
    {
      externalId: '91003',
      externalUrl: publishedSourceUrl,
      repoOwner: 'demo-org',
      repoName: 'agentcraft-web',
      title: 'Fix task generator tab loading state',
      body: 'When an operator runs batch actions, the page should keep controls disabled until the server responds.',
      labels: ['frontend', 'task-generator'],
      externalCreator: 'agentcraft',
      hasBounty: false,
      status: 'PUBLISHED',
      difficultyScore: 2,
      valueScore: 4,
      estimatedReward: 18,
      aiSummary: 'Tighten the admin page loading flow so batch actions cannot be double-submitted.',
      aiTags: ['react', 'ux', 'github'],
      shouldPublish: false,
      publishedTaskId: publishedTask.id,
    },
  ];

  for (const rawTask of rawTasks) {
    await prisma.rawTask.upsert({
      where: {
        source_externalId: {
          source: 'GITHUB_ISSUE',
          externalId: rawTask.externalId,
        },
      },
      update: {
        externalUrl: rawTask.externalUrl,
        repoOwner: rawTask.repoOwner,
        repoName: rawTask.repoName,
        title: rawTask.title,
        body: rawTask.body,
        labels: rawTask.labels,
        externalCreator: rawTask.externalCreator,
        hasBounty: rawTask.hasBounty,
        bountyAmount: (rawTask as any).bountyAmount ?? null,
        bountyCurrency: (rawTask as any).bountyCurrency ?? null,
        status: rawTask.status as any,
        difficultyScore: rawTask.difficultyScore,
        valueScore: rawTask.valueScore,
        estimatedReward: rawTask.estimatedReward,
        aiSummary: rawTask.aiSummary,
        aiTags: rawTask.aiTags,
        shouldPublish: rawTask.shouldPublish,
        publishedTaskId: rawTask.publishedTaskId,
      },
      create: {
        source: 'GITHUB_ISSUE',
        externalId: rawTask.externalId,
        externalUrl: rawTask.externalUrl,
        repoOwner: rawTask.repoOwner,
        repoName: rawTask.repoName,
        title: rawTask.title,
        body: rawTask.body,
        labels: rawTask.labels,
        externalCreator: rawTask.externalCreator,
        hasBounty: rawTask.hasBounty,
        bountyAmount: (rawTask as any).bountyAmount ?? null,
        bountyCurrency: (rawTask as any).bountyCurrency ?? null,
        status: rawTask.status as any,
        difficultyScore: rawTask.difficultyScore,
        valueScore: rawTask.valueScore,
        estimatedReward: rawTask.estimatedReward,
        aiSummary: rawTask.aiSummary,
        aiTags: rawTask.aiTags,
        shouldPublish: rawTask.shouldPublish,
        publishedTaskId: rawTask.publishedTaskId,
      },
    });
  }

  console.log('Seeded GitHub issue test data');
}

async function cleanupDemoGithubIssueTestData(systemUserId: string) {
  await prisma.task.updateMany({
    where: {
      creatorId: systemUserId,
      taskSource: 'GITHUB_ISSUE',
      sourceRepo: 'demo-org/agentcraft-web',
      status: { in: ['OPEN', 'REVIEWING'] },
    },
    data: {
      status: 'CANCELLED',
    },
  });

  await prisma.rawTask.updateMany({
    where: {
      source: 'GITHUB_ISSUE',
      repoOwner: 'demo-org',
      repoName: 'agentcraft-web',
      status: { in: ['PENDING', 'SCORING', 'SCORED', 'PUBLISHED'] },
    },
    data: {
      status: 'SKIPPED',
      shouldPublish: false,
      publishedTaskId: null,
    },
  });

  console.log('Cleaned up demo GitHub issue seed data');
}

async function seedMathProblems() {
  const count = await prisma.mathProblem.count();
  if (count > 0) {
    console.log(`Math problems already seeded (${count} exist)`);
    return;
  }

  const problems = [
    // === EASY (5-10 AIC) ===
    {
      title: 'Sum of First N Natural Numbers',
      description: 'Prove that the sum of the first n natural numbers is n(n+1)/2. Provide a rigorous proof using mathematical induction.',
      difficulty: 'easy',
      category: 'algebra',
      source: 'Classic',
    },
    {
      title: 'Pigeonhole Principle - Socks',
      description: 'A drawer contains 10 black socks and 10 white socks. What is the minimum number of socks you must draw (without looking) to guarantee a matching pair? Prove your answer.',
      difficulty: 'easy',
      category: 'combinatorics',
      source: 'Classic',
    },
    {
      title: 'Divisibility by 3',
      description: 'Prove that a positive integer is divisible by 3 if and only if the sum of its digits is divisible by 3.',
      difficulty: 'easy',
      category: 'number_theory',
      source: 'Classic',
    },
    {
      title: 'Triangle Inequality',
      description: 'Prove that for any triangle with sides a, b, c: a + b > c, b + c > a, and a + c > b.',
      difficulty: 'easy',
      category: 'geometry',
      source: 'Classic',
    },
    {
      title: 'Arithmetic Mean ≥ Geometric Mean (2 variables)',
      description: 'Prove that for non-negative real numbers a and b: (a+b)/2 ≥ √(ab). When does equality hold?',
      difficulty: 'easy',
      category: 'algebra',
      source: 'Classic AM-GM',
    },
    {
      title: 'Infinite Primes',
      description: "Provide Euclid's proof that there are infinitely many prime numbers.",
      difficulty: 'easy',
      category: 'number_theory',
      source: 'Euclid',
    },
    {
      title: 'Power of 2 Divisibility',
      description: 'Prove that 2^n - 1 is divisible by 7 if and only if n is divisible by 3.',
      difficulty: 'easy',
      category: 'number_theory',
      source: 'Classic',
    },
    {
      title: 'Sum of Interior Angles',
      description: 'Prove that the sum of interior angles of a convex polygon with n sides is (n-2)×180°.',
      difficulty: 'easy',
      category: 'geometry',
      source: 'Classic',
    },
    {
      title: 'Fibonacci Parity Pattern',
      description: 'Prove that every third Fibonacci number is even. That is, F(3k) is even for all positive integers k.',
      difficulty: 'easy',
      category: 'number_theory',
      source: 'Classic',
    },
    {
      title: 'Handshake Lemma',
      description: 'Prove that in any graph, the sum of all vertex degrees equals twice the number of edges.',
      difficulty: 'easy',
      category: 'combinatorics',
      source: 'Graph Theory Classic',
    },

    // === MEDIUM (15-30 AIC) ===
    {
      title: 'Cauchy-Schwarz Inequality',
      description: 'Prove the Cauchy-Schwarz inequality: For real numbers a₁,...,aₙ and b₁,...,bₙ, (Σaᵢbᵢ)² ≤ (Σaᵢ²)(Σbᵢ²). Determine when equality holds.',
      difficulty: 'medium',
      category: 'algebra',
      source: 'Classic',
    },
    {
      title: "Fermat's Little Theorem",
      description: "Prove Fermat's Little Theorem: If p is prime and gcd(a,p)=1, then a^(p-1) ≡ 1 (mod p).",
      difficulty: 'medium',
      category: 'number_theory',
      source: 'Fermat',
    },
    {
      title: "Euler's Formula for Polyhedra",
      description: "Prove Euler's formula V - E + F = 2 for any connected planar graph, where V = vertices, E = edges, F = faces.",
      difficulty: 'medium',
      category: 'geometry',
      source: 'Euler',
    },
    {
      title: 'Derangements Count',
      description: 'Find a closed-form formula for D(n), the number of derangements (permutations with no fixed points) of n elements. Prove your formula.',
      difficulty: 'medium',
      category: 'combinatorics',
      source: 'Classic',
    },
    {
      title: 'Irrationality of √2',
      description: 'Prove that √2 is irrational using proof by contradiction.',
      difficulty: 'medium',
      category: 'number_theory',
      source: 'Classic',
    },
    {
      title: 'IMO 1959 Problem 1',
      description: 'Prove that (21n+4)/(14n+3) is irreducible for every natural number n.',
      difficulty: 'medium',
      category: 'number_theory',
      source: 'IMO 1959 P1',
    },
    {
      title: 'Catalan Numbers',
      description: 'Prove that the number of valid arrangements of n pairs of parentheses is C(n) = (2n)! / ((n+1)! × n!). Show this equals the n-th Catalan number.',
      difficulty: 'medium',
      category: 'combinatorics',
      source: 'Classic',
    },
    {
      title: "Pick's Theorem",
      description: "Prove Pick's theorem: For a simple polygon with vertices at lattice points, A = I + B/2 - 1, where A is area, I is interior lattice points, B is boundary lattice points.",
      difficulty: 'medium',
      category: 'geometry',
      source: 'Pick 1899',
    },
    {
      title: 'Chinese Remainder Theorem',
      description: 'State and prove the Chinese Remainder Theorem for two moduli. Given x ≡ a (mod m) and x ≡ b (mod n) with gcd(m,n)=1, prove a unique solution exists modulo mn.',
      difficulty: 'medium',
      category: 'number_theory',
      source: 'Classic',
    },
    {
      title: 'AM-GM Inequality (n variables)',
      description: 'Prove the AM-GM inequality for n non-negative real numbers: (x₁+x₂+...+xₙ)/n ≥ (x₁·x₂·...·xₙ)^(1/n).',
      difficulty: 'medium',
      category: 'algebra',
      source: 'Classic',
    },
    {
      title: 'Burnside Counting - Necklaces',
      description: 'How many distinct necklaces can be made from 6 beads, each of which can be one of 3 colors? Use Burnside\'s lemma to solve and prove your answer.',
      difficulty: 'medium',
      category: 'combinatorics',
      source: 'Classic',
    },
    {
      title: 'Ptolemy\'s Theorem',
      description: 'Prove Ptolemy\'s theorem: For a cyclic quadrilateral with consecutive sides a, b, c, d and diagonals p, q: ac + bd = pq.',
      difficulty: 'medium',
      category: 'geometry',
      source: 'Ptolemy',
    },
    {
      title: 'Wilson\'s Theorem',
      description: 'Prove Wilson\'s theorem: A natural number n > 1 is prime if and only if (n-1)! ≡ -1 (mod n).',
      difficulty: 'medium',
      category: 'number_theory',
      source: 'Classic',
    },
    {
      title: 'Schur\'s Inequality',
      description: 'Prove Schur\'s inequality: For non-negative reals a, b, c and t ≥ 0: aᵗ(a-b)(a-c) + bᵗ(b-a)(b-c) + cᵗ(c-a)(c-b) ≥ 0.',
      difficulty: 'medium',
      category: 'algebra',
      source: 'Schur',
    },
    {
      title: 'Ramsey Number R(3,3)',
      description: 'Prove that R(3,3) = 6. That is, any 2-coloring of the edges of K₆ contains a monochromatic triangle, and show K₅ can be 2-colored without one.',
      difficulty: 'medium',
      category: 'combinatorics',
      source: 'Ramsey Theory',
    },

    // === HARD (30-50 AIC) ===
    {
      title: 'IMO 2006 Problem 4',
      description: 'Determine all pairs (x, y) of integers such that 1 + 2^x + 2^(2x+1) = y².',
      difficulty: 'hard',
      category: 'number_theory',
      source: 'IMO 2006 P4',
    },
    {
      title: 'Putnam 2019 A5',
      description: 'Let p be an odd prime. Determine the number of non-empty subsets S of {1, 2, ..., p-1} such that the sum of elements in S is divisible by p.',
      difficulty: 'hard',
      category: 'combinatorics',
      source: 'Putnam 2019 A5',
    },
    {
      title: 'IMO 2005 Problem 4',
      description: 'Determine all functions f: ℕ* → ℕ* satisfying f(m² + n²) = f(m)² + f(n)² for all positive integers m, n.',
      difficulty: 'hard',
      category: 'algebra',
      source: 'IMO 2005 P4',
    },
    {
      title: 'Erdős–Gallai Theorem',
      description: 'Prove the Erdős–Gallai theorem: A sequence of non-negative integers d₁ ≥ d₂ ≥ ... ≥ dₙ is the degree sequence of a simple graph if and only if the sum is even and for each k: Σᵢ₌₁ᵏ dᵢ ≤ k(k-1) + Σᵢ₌ₖ₊₁ⁿ min(dᵢ, k).',
      difficulty: 'hard',
      category: 'combinatorics',
      source: 'Erdős–Gallai 1960',
    },
    {
      title: 'IMO 2017 Problem 2',
      description: 'Let ℝ be the set of real numbers. Determine all functions f: ℝ → ℝ such that, for any real numbers x and y, f(f(x)f(y)) + f(x+y) = f(xy).',
      difficulty: 'hard',
      category: 'algebra',
      source: 'IMO 2017 P2',
    },
    {
      title: 'Putnam 2018 B6',
      description: 'Let S be the set of all functions f: {0,1}ⁿ → {0,1}. For f in S, let D(f) be the number of pairs (x,y) with Hamming distance 1 such that f(x) ≠ f(y). Find the expected value of D(f) when f is chosen uniformly at random from S.',
      difficulty: 'hard',
      category: 'combinatorics',
      source: 'Putnam 2018 B6',
    },
    {
      title: 'Quadratic Reciprocity',
      description: 'State and prove the law of quadratic reciprocity: For distinct odd primes p and q, (p/q)(q/p) = (-1)^((p-1)/2 · (q-1)/2).',
      difficulty: 'hard',
      category: 'number_theory',
      source: 'Gauss',
    },
    {
      title: 'IMO 2019 Problem 2',
      description: 'In triangle ABC, point A₁ lies on side BC and point B₁ lies on side AC. Let P and Q be points on segments AA₁ and BB₁ respectively, such that PQ is parallel to AB. Let P₁ be a point on line PB₁ such that B₁ lies strictly between P and P₁, and ∠PP₁C = ∠BAC. Similarly, let Q₁ be a point on line QA₁ such that A₁ lies strictly between Q and Q₁, and ∠CQ₁Q = ∠CBA. Prove that P₁, Q₁, P, Q are concyclic.',
      difficulty: 'hard',
      category: 'geometry',
      source: 'IMO 2019 P2',
    },
    {
      title: 'Isoperimetric Inequality',
      description: 'Prove the isoperimetric inequality in the plane: Among all simple closed curves of a given perimeter L, the circle encloses the maximum area. That is, 4πA ≤ L².',
      difficulty: 'hard',
      category: 'geometry',
      source: 'Classic',
    },
    {
      title: 'Primitive Root Existence',
      description: 'Prove that for every prime p, there exists a primitive root modulo p. That is, there exists g such that the multiplicative order of g modulo p is p-1.',
      difficulty: 'hard',
      category: 'number_theory',
      source: 'Classic',
    },
    {
      title: 'Putnam 2020 A4',
      description: 'Consider a 2020×2020 board with integers in each unit square. Two unit squares are called neighbors if they share a common edge. A unit square is called unbalanced if its value is strictly greater than the average of its neighbors. Prove that the number of unbalanced squares is at most (2020²)/2.',
      difficulty: 'hard',
      category: 'combinatorics',
      source: 'Putnam 2020 A4',
    },
    {
      title: 'Minkowski\'s Theorem',
      description: 'Prove Minkowski\'s theorem: If S is a convex set in ℝ² that is symmetric about the origin and has area greater than 4, then S contains a non-zero lattice point.',
      difficulty: 'hard',
      category: 'geometry',
      source: 'Minkowski 1896',
    },

    // === UNSOLVED / OPEN-ENDED (50-100 AIC) ===
    {
      title: 'Collatz Conjecture: Verify for range [1, 10^12]',
      description: 'The Collatz conjecture states that for any positive integer n, the sequence n → n/2 (if even) or n → 3n+1 (if odd) eventually reaches 1. Write a program to verify this for all integers in [1, 10^12]. Report any counterexample found, or provide proof of verification with performance metrics.',
      difficulty: 'unsolved',
      category: 'number_theory',
      source: 'Collatz Conjecture (partial verification)',
      hint: 'Use optimized sieve methods and bit manipulation. Consider GPU acceleration.',
    },
    {
      title: 'Goldbach Conjecture: Verify for even numbers in [4, 10^10]',
      description: 'Goldbach\'s conjecture states every even integer greater than 2 is the sum of two primes. Write a program to verify this for all even numbers in [4, 10^10]. For each even number, find at least one pair of primes that sum to it.',
      difficulty: 'unsolved',
      category: 'number_theory',
      source: 'Goldbach Conjecture (partial verification)',
      hint: 'Use a prime sieve (Sieve of Eratosthenes) and iterate.',
    },
    {
      title: 'Twin Prime Gaps Analysis',
      description: 'Investigate the distribution of twin primes (primes p where p+2 is also prime) up to 10^9. Compute the count of twin primes, analyze the gaps between consecutive twin prime pairs, and compare with the Hardy-Littlewood conjecture prediction.',
      difficulty: 'unsolved',
      category: 'number_theory',
      source: 'Twin Prime Conjecture (analysis)',
    },
    {
      title: 'Perfect Number Search',
      description: 'It is unknown whether any odd perfect numbers exist. Search for odd perfect numbers up to 10^18, or prove constraints that any such number must satisfy. A perfect number equals the sum of its proper divisors.',
      difficulty: 'unsolved',
      category: 'number_theory',
      source: 'Odd Perfect Number Problem',
    },
    {
      title: 'Graceful Tree Conjecture - Verify for trees up to 30 vertices',
      description: 'The Graceful Tree Conjecture states that every tree can be gracefully labeled. A graceful labeling of a tree with n edges assigns distinct labels from {0,1,...,n} to vertices such that the induced edge labels (absolute differences) are {1,2,...,n}. Verify this conjecture for all non-isomorphic trees with up to 30 vertices.',
      difficulty: 'unsolved',
      category: 'combinatorics',
      source: 'Graceful Tree Conjecture',
    },
    {
      title: 'Hadamard Matrix Construction',
      description: 'The Hadamard conjecture states that a Hadamard matrix of order 4k exists for every positive integer k. Construct Hadamard matrices for all orders 4k where k ≤ 100, or identify the smallest k for which you cannot find one.',
      difficulty: 'unsolved',
      category: 'algebra',
      source: 'Hadamard Conjecture',
    },
    {
      title: 'Busy Beaver Bounds',
      description: 'The Busy Beaver function BB(n) gives the maximum number of 1s that an n-state Turing machine can write before halting. BB(5) is known to be 47176870. Investigate lower bounds for BB(6) by constructing 6-state Turing machines that produce many 1s before halting.',
      difficulty: 'unsolved',
      category: 'combinatorics',
      source: 'Busy Beaver Problem',
      hint: 'Current best known lower bound for BB(6) is over 10^36534.',
    },
    {
      title: 'Erdős–Straus Conjecture Verification',
      description: 'The Erdős–Straus conjecture states that for every integer n ≥ 2, the fraction 4/n can be written as a sum of three unit fractions: 4/n = 1/x + 1/y + 1/z. Verify this for all n up to 10^9.',
      difficulty: 'unsolved',
      category: 'number_theory',
      source: 'Erdős–Straus Conjecture',
    },
  ];

  await prisma.mathProblem.createMany({ data: problems });
  console.log(`Seeded ${problems.length} math problems`);
}

const IMPORTED_ERDOS_COMMENT_PREFIX = 'Imported from [erdosproblems.com]';
type ImportedCommentSeedStatus = 'created' | 'deleted' | 'refreshed' | 'skipped';

function buildImportedCommentContent(
  problem: SeedErdosProblem,
  comment: SeedErdosSourceComment,
) {
  return [
    `${IMPORTED_ERDOS_COMMENT_PREFIX}(${problem.sourceMetadata.discussionThreadUrl}).`,
    '',
    `Original author: **${comment.author}**`,
    `Posted on source site: ${comment.postedAtLabel}`,
    '',
    comment.contentMd,
  ].join('\n');
}

function flattenImportedCommentTree(
  problem: SeedErdosProblem,
  comments: SeedErdosSourceComment[],
  parentId: string | null,
  rows: Array<{
    id: string;
    parentId: string | null;
    parentIndex: number | null;
    content: string;
  }>,
  parentIndex: number | null = null,
) {
  for (const comment of comments) {
    const index = rows.length;
    const id = buildImportedCommentId(problem, index, comment);
    rows.push({
      id,
      parentId,
      parentIndex,
      content: buildImportedCommentContent(problem, comment),
    });
    if (comment.replies?.length) {
      flattenImportedCommentTree(problem, comment.replies, id, rows, index);
    }
  }
}

function buildImportedCommentId(
  problem: SeedErdosProblem,
  index: number,
  comment: SeedErdosSourceComment,
) {
  const hash = createHash('sha256')
    .update(
      stableJsonStringify({
        sourceUrl: problem.sourceUrl,
        index,
        author: comment.author,
        postedAtLabel: comment.postedAtLabel,
        contentMd: comment.contentMd,
      }),
    )
    .digest('hex');
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `5${hash.slice(13, 16)}`,
    `8${hash.slice(17, 20)}`,
    hash.slice(20, 32),
  ].join('-');
}

function importedCommentSignature(
  rows: Array<{ parentIndex: number | null; content: string }>,
) {
  return stableJsonStringify(
    rows.map((row) => ({
      parentIndex: row.parentIndex,
      content: row.content,
    })),
  );
}

function incrementImportedCommentStats(
  stats: {
    commentsCreated: number;
    commentsDeleted: number;
    commentsRefreshed: number;
    commentsSkipped: number;
  },
  status: ImportedCommentSeedStatus,
) {
  if (status === 'created') stats.commentsCreated += 1;
  else if (status === 'deleted') stats.commentsDeleted += 1;
  else if (status === 'refreshed') stats.commentsRefreshed += 1;
  else stats.commentsSkipped += 1;
}

async function deleteImportedTaskComments(taskId: string) {
  const importedComments = await prisma.comment.findMany({
    where: {
      taskId,
      content: { startsWith: IMPORTED_ERDOS_COMMENT_PREFIX },
    },
    select: {
      id: true,
      parentId: true,
    },
  });

  if (!importedComments.length) {
    return;
  }

  const byId = new Map(importedComments.map((comment) => [comment.id, comment]));
  const getDepth = (id: string): number => {
    const current = byId.get(id);
    if (!current?.parentId) return 0;
    return 1 + getDepth(current.parentId);
  };

  const ordered = importedComments
    .map((comment) => ({ ...comment, depth: getDepth(comment.id) }))
    .sort((a, b) => b.depth - a.depth);

  for (const comment of ordered) {
    await prisma.comment.delete({ where: { id: comment.id } });
  }
}

async function seedImportedTaskComments(
  taskId: string,
  systemUserId: string,
  problem: SeedErdosProblem,
): Promise<ImportedCommentSeedStatus> {
  const flattened: Array<{
    id: string;
    parentId: string | null;
    parentIndex: number | null;
    content: string;
  }> = [];
  flattenImportedCommentTree(problem, problem.sourceMetadata.sourceComments, null, flattened);

  const existingImportedComments = await prisma.comment.findMany({
    where: {
      taskId,
      content: { startsWith: IMPORTED_ERDOS_COMMENT_PREFIX },
    },
    select: {
      id: true,
      parentId: true,
      content: true,
      createdAt: true,
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });

  const comments = problem.sourceMetadata.sourceComments;
  if (!comments.length) {
    if (existingImportedComments.length) {
      await deleteImportedTaskComments(taskId);
      return 'deleted';
    }
    return 'skipped';
  }

  const existingIndexById = new Map(
    existingImportedComments.map((comment, index) => [comment.id, index]),
  );
  const existingSignature = importedCommentSignature(
    existingImportedComments.map((comment) => ({
      parentIndex: comment.parentId
        ? (existingIndexById.get(comment.parentId) ?? null)
        : null,
      content: comment.content,
    })),
  );
  const expectedSignature = importedCommentSignature(flattened);

  if (existingSignature === expectedSignature) {
    return 'skipped';
  }

  await deleteImportedTaskComments(taskId);

  const baseTime = new Date();
  baseTime.setMilliseconds(0);

  for (let index = 0; index < flattened.length; index += 1) {
    const row = flattened[index];
    const createdAt = new Date(baseTime.getTime() + index * 1000);
    await prisma.comment.create({
      data: {
        id: row.id,
        content: row.content,
        fileUrls: [],
        taskId,
        userId: systemUserId,
        parentId: row.parentId,
        createdAt,
        updatedAt: createdAt,
      },
    });
  }
  return existingImportedComments.length ? 'refreshed' : 'created';
}

async function seedErdosProblemTasks(systemUserId: string) {
  const erdosProblems = loadErdosProblems();
  const stats = {
    created: 0,
    updated: 0,
    unchanged: 0,
    commentsCreated: 0,
    commentsDeleted: 0,
    commentsRefreshed: 0,
    commentsSkipped: 0,
  };

  for (const problem of erdosProblems) {
    const clonedSourceMetadata = JSON.parse(
      JSON.stringify(problem.sourceMetadata),
    ) as SeedErdosProblem['sourceMetadata'];
    const clonedProblem: SeedErdosProblem = {
      ...problem,
      sourceMetadata: clonedSourceMetadata,
    };

    const existingTask = await prisma.task.findFirst({
      where: {
        creatorId: systemUserId,
        sourceUrl: problem.sourceUrl,
      },
      select: {
        id: true,
        title: true,
        description: true,
        acceptanceCriteria: true,
        deliverableType: true,
        reward: true,
        currency: true,
        tags: true,
        taskSource: true,
        sourceUrl: true,
        sourceMetadata: true,
      },
    });

    const sharedData = {
      title: problem.title,
      description: problem.description,
      acceptanceCriteria:
        problem.acceptanceCriteria ??
        [
          `State clearly whether your submission claims a full solution, a conditional result, or partial progress on Erdos Problem #${clonedProblem.sourceMetadata.externalProblemId}.`,
          'Reference the source bibliography and imported discussion comments where relevant.',
          'Include a rigorous proof, counterexample, or a precise explanation of the remaining gap.',
        ].join('\n'),
      deliverableType: 'RESEARCH',
      reward: clonedProblem.reward,
      currency: 'AIC',
      tags: clonedProblem.tags,
      taskSource: 'ERDOS_PROBLEM' as const,
      sourceUrl: clonedProblem.sourceUrl,
      sourceMetadata: clonedProblem.sourceMetadata as any,
    };

    if (existingTask) {
      const taskChanged =
        existingTask.title !== sharedData.title ||
        existingTask.description !== sharedData.description ||
        existingTask.acceptanceCriteria !== sharedData.acceptanceCriteria ||
        existingTask.deliverableType !== sharedData.deliverableType ||
        existingTask.reward !== sharedData.reward ||
        existingTask.currency !== sharedData.currency ||
        !valuesEqual(existingTask.tags, sharedData.tags) ||
        existingTask.taskSource !== sharedData.taskSource ||
        existingTask.sourceUrl !== sharedData.sourceUrl ||
        !valuesEqual(existingTask.sourceMetadata, sharedData.sourceMetadata);

      if (taskChanged) {
        await prisma.task.update({
          where: { id: existingTask.id },
          data: sharedData,
        });
        stats.updated += 1;
      } else {
        stats.unchanged += 1;
      }
      const commentStatus = await seedImportedTaskComments(existingTask.id, systemUserId, clonedProblem);
      incrementImportedCommentStats(stats, commentStatus);
      continue;
    }

    const createdTask = await prisma.task.create({
      data: {
        ...sharedData,
        status: 'OPEN',
        creatorId: systemUserId,
      },
    });
    stats.created += 1;
    const commentStatus = await seedImportedTaskComments(createdTask.id, systemUserId, clonedProblem);
    incrementImportedCommentStats(stats, commentStatus);
  }

  console.log(
    `Processed ${erdosProblems.length} Erdos problem tasks (created=${stats.created}, updated=${stats.updated}, unchanged=${stats.unchanged}; comments created=${stats.commentsCreated}, refreshed=${stats.commentsRefreshed}, deleted=${stats.commentsDeleted}, skipped=${stats.commentsSkipped})`,
  );
}

async function main() {
  console.log('Seeding database...');
  const systemUser = await seedSystemUser();
  const rewardPoolUser = await seedRewardPoolUser();
  await repairEconomyLedger(systemUser.id, rewardPoolUser.id);
  await seedGithubPublishPolicy();
  await seedHackerOneFetchSeedConfig();
  if (process.env.SEED_DEMO_GITHUB_TASKS === 'true') {
    await seedGithubIssueTestData(systemUser.id);
  } else {
    await cleanupDemoGithubIssueTestData(systemUser.id);
  }
  await seedErdosProblemTasks(systemUser.id);
  await seedMathProblems();
  console.log('Seeding complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
