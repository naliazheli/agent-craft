import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => WalletService))
    private readonly walletService: WalletService,
  ) {}

  private getRawTaskSourceRepo(rawTask?: {
    repoOwner?: string | null;
    repoName?: string | null;
  } | null) {
    if (!rawTask?.repoOwner || !rawTask?.repoName) return null;
    return `${rawTask.repoOwner}/${rawTask.repoName}`;
  }

  private getRawTaskIssueNumber(rawTask?: { externalId?: string | null } | null) {
    return /^\d+$/.test(rawTask?.externalId || '') ? parseInt(rawTask!.externalId!, 10) : null;
  }

  private buildFallbackAcceptanceCriteria(task: {
    taskSource?: string | null;
    sourceUrl?: string | null;
    sourceRepo?: string | null;
    rawTask?: {
      source?: string | null;
      externalUrl?: string | null;
      repoOwner?: string | null;
      repoName?: string | null;
      externalId?: string | null;
      sourceMetadata?: unknown;
    } | null;
  }) {
    if (task.taskSource === 'ERDOS_PROBLEM') {
      return [
        'State exactly which claim, bound, or obstruction you are addressing.',
        'Cite the referenced literature and explain how your work differs from the known partial results.',
        'If you only make partial progress, isolate the strongest rigorous lemma or reduction you can justify.',
        'Do not present finite computation alone as a complete resolution when the source explicitly says the problem cannot be resolved that way.',
      ].join('\n');
    }

    const isHackerOneTask = task.taskSource === 'HACKERONE' || task.rawTask?.source === 'HACKERONE_PROGRAM';
    if (isHackerOneTask) {
      const metadata = task.rawTask?.sourceMetadata as any;
      const asset = metadata?.scope?.assetIdentifier;
      const headers = Array.isArray(metadata?.testing?.requiredHeaders)
        ? metadata.testing.requiredHeaders.map((header: any) => `${header.name}: ${header.value}`)
        : [];
      return [
        'Submit a complete security research report, not exploit-only notes.',
        asset ? `Target only the imported in-scope asset (${asset}).` : null,
        task.sourceUrl || task.rawTask?.externalUrl
          ? `Use the linked HackerOne program (${task.sourceUrl || task.rawTask?.externalUrl}) as the source of truth for scope and policy.`
          : null,
        headers.length ? `Include the required testing header(s): ${headers.join('; ')}.` : null,
        'Use only owned or explicitly authorized accounts and avoid destructive or privacy-invasive testing.',
        'Include reproduction steps, impact, evidence, severity reasoning, and remediation guidance.',
      ]
        .filter(Boolean)
        .join('\n');
    }

    const isGithubIssue =
      task.rawTask?.source === 'GITHUB_ISSUE' || !!task.sourceRepo || !!task.rawTask?.repoOwner;
    if (!isGithubIssue) return null;

    const sourceUrl = task.sourceUrl || task.rawTask?.externalUrl;
    const sourceRepo = task.sourceRepo || this.getRawTaskSourceRepo(task.rawTask);

    return [
      'Triage the linked GitHub issue and state whether the expected deliverable is investigation, reproduction, or a code fix.',
      sourceRepo ? `Work against the referenced repository (${sourceRepo}) or explain why it is unavailable.` : null,
      sourceUrl ? `Use the linked issue (${sourceUrl}) as the source of truth for scope and expected behavior.` : null,
      'Do not submit placeholder work. Include concrete verification steps or a precise blocker report.',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private inferDeliverableType(task: {
    tags?: unknown;
    title?: string | null;
    taskSource?: string | null;
    rawTask?: { source?: string | null } | null;
    sourceRepo?: string | null;
  }) {
    if (task.taskSource === 'ERDOS_PROBLEM') {
      return 'RESEARCH';
    }

    if (task.taskSource === 'HACKERONE' || task.rawTask?.source === 'HACKERONE_PROGRAM') {
      return 'SECURITY_RESEARCH_REPORT';
    }

    const tags = Array.isArray(task.tags) ? task.tags.map((tag) => String(tag).toLowerCase()) : [];
    const title = (task.title || '').toLowerCase();
    const signals = [...tags, title];

    if (signals.some((item) => item.includes('question') || item.includes('unconfirmed'))) {
      return 'TRIAGE';
    }

    if (signals.some((item) => item.includes('feature request') || item.includes('investigat'))) {
      return 'INVESTIGATION';
    }

    if (task.rawTask?.source === 'GITHUB_ISSUE' || task.sourceRepo) {
      return 'CODE_FIX_CANDIDATE';
    }

    return undefined;
  }

  private normalizeCodeType(value?: string | null) {
    return value?.trim().toLowerCase() || undefined;
  }

  private inferCodeType(task: {
    codeType?: string | null;
    taskSource?: string | null;
    sourceRepo?: string | null;
    tags?: unknown;
    rawTask?: {
      source?: string | null;
      repoPrimaryLanguage?: string | null;
      buildSystemHints?: unknown;
    } | null;
  }) {
    const explicit = this.normalizeCodeType(task.codeType);
    if (explicit) {
      return explicit;
    }

    if (task.taskSource === 'HACKERONE' || task.rawTask?.source === 'HACKERONE_PROGRAM') {
      return 'security';
    }

    const primaryLanguage = this.normalizeCodeType(task.rawTask?.repoPrimaryLanguage);
    if (primaryLanguage) {
      return primaryLanguage;
    }

    const buildHints = Array.isArray(task.rawTask?.buildSystemHints)
      ? task.rawTask!.buildSystemHints.map((hint) => String(hint).trim().toLowerCase()).filter(Boolean)
      : [];
    if (buildHints.includes('pnpm') || buildHints.includes('npm') || buildHints.includes('yarn') || buildHints.includes('node')) {
      return 'typescript';
    }
    if (buildHints.includes('python') || buildHints.includes('poetry')) {
      return 'python';
    }
    if (buildHints.includes('go')) {
      return 'go';
    }
    if (buildHints.includes('rust')) {
      return 'rust';
    }

    const tags = Array.isArray(task.tags) ? task.tags.map((tag) => String(tag).toLowerCase()) : [];
    if (tags.some((tag) => ['typescript', 'javascript', 'react', 'next.js', 'node'].includes(tag))) {
      return 'typescript';
    }
    if (tags.some((tag) => ['python', 'django', 'fastapi'].includes(tag))) {
      return 'python';
    }

    return undefined;
  }

  private hydrateTaskMetadata<
    T extends {
      codeType?: string | null;
      deliverableType?: string | null;
      taskSource?: string | null;
      sourceUrl?: string | null;
      sourceRepo?: string | null;
      sourceIssueNumber?: number | null;
      acceptanceCriteria?: string | null;
      _count?: {
        submissions?: number;
      };
      rawTask?: {
        source?: string | null;
        externalUrl?: string | null;
        repoOwner?: string | null;
        repoName?: string | null;
        externalId?: string | null;
        sourceMetadata?: unknown;
        repoPrimaryLanguage?: string | null;
        buildSystemHints?: unknown;
      } | null;
    },
  >(task: T): T & { deliverableType?: string; isAvailable?: boolean } {
    const rawTask = task.rawTask;
    const inferredSourceRepo = task.sourceRepo || this.getRawTaskSourceRepo(rawTask);
    const inferredIssueNumber = task.sourceIssueNumber ?? this.getRawTaskIssueNumber(rawTask);
    const inferredSourceUrl = task.sourceUrl || rawTask?.externalUrl || null;
    const inferredTaskSource =
      task.taskSource === 'CUSTOM' && rawTask?.source === 'GITHUB_ISSUE'
        ? 'GITHUB_ISSUE'
        : task.taskSource === 'CUSTOM' && rawTask?.source === 'HACKERONE_PROGRAM'
          ? 'HACKERONE'
          : task.taskSource;
    const acceptanceCriteria =
      task.acceptanceCriteria || this.buildFallbackAcceptanceCriteria({ ...task, rawTask });

    return {
      ...task,
      taskSource: inferredTaskSource,
      sourceUrl: inferredSourceUrl,
      sourceRepo: inferredSourceRepo,
      sourceIssueNumber: inferredIssueNumber,
      acceptanceCriteria,
      deliverableType:
        task.deliverableType ||
        this.inferDeliverableType({
          ...task,
          taskSource: inferredTaskSource,
          sourceRepo: inferredSourceRepo,
        }),
      codeType: this.inferCodeType({
        ...task,
        taskSource: inferredTaskSource,
        sourceRepo: inferredSourceRepo,
        rawTask,
      }),
      isAvailable: (task._count?.submissions ?? 0) === 0,
    };
  }

  async create(creatorId: string, dto: CreateTaskDto) {
    const taskSource = dto.taskSource || 'CUSTOM';
    const task = await this.prisma.task.create({
      data: {
        title: dto.title,
        description: dto.description,
        acceptanceCriteria: dto.acceptanceCriteria,
        deliverableType: dto.deliverableType,
        codeType: this.normalizeCodeType(dto.codeType),
        reward: dto.reward,
        currency: dto.currency || 'AIC',
        deadline: dto.deadline ? new Date(dto.deadline) : undefined,
        tags: dto.tags || [],
        attachments: dto.attachments || [],
        autoReview: dto.autoReview ?? false,
        taskSource: taskSource as any,
        sourceUrl: dto.sourceUrl,
        sourceRepo: dto.sourceRepo,
        sourceIssueNumber: dto.sourceIssueNumber,
        sourceMetadata: dto.sourceMetadata as any,
        creatorId,
      },
      include: { creator: { select: { id: true, displayName: true, role: true } } },
    });

    // Escrow: freeze reward from creator's balance
    await this.walletService.escrow(creatorId, dto.reward, task.id);

    return task;
  }

  async findAll(query: {
    status?: string;
    tag?: string;
    search?: string;
    taskSource?: string;
    codeType?: string;
    availableOnly?: boolean;
    sortBy?: string;
    page?: number;
    limit?: number;
  }) {
    const { status, tag, search, taskSource, codeType, availableOnly, sortBy, page = 1, limit = 20 } = query;
    const where: any = {};

    if (status) {
      const statuses = status
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      where.status = statuses.length > 1 ? { in: statuses } : statuses[0];
    }
    if (tag) where.tags = { string_contains: tag };
    if (search) {
      where.OR = [
        { title: { contains: search } },
        { description: { contains: search } },
      ];
    }
    if (taskSource) {
      const normalizedTaskSource = taskSource.trim().toUpperCase();
      if (normalizedTaskSource === 'GITHUB_ISSUE') {
        where.OR = [
          ...(where.OR ?? []),
          { taskSource: 'GITHUB_ISSUE' },
          { rawTask: { is: { source: 'GITHUB_ISSUE' } } },
        ];
      } else {
        where.taskSource = normalizedTaskSource;
      }
    }
    if (codeType) {
      where.codeType = { equals: codeType.trim().toLowerCase() };
    }
    const wantsOpenGithubTasks =
      (status
        ?.split(',')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean)
        .includes('OPEN') ??
        false) &&
      taskSource?.trim().toUpperCase() === 'GITHUB_ISSUE';

    if (wantsOpenGithubTasks) {
      // Legacy imported GitHub tasks may still be stored as OPEN even after they already
      // have a submission. Treat OPEN GitHub queries as "available to claim" by default.
      where.submissions = { none: {} };
    }
    if (availableOnly) {
      where.submissions = { none: {} };
    }

    let orderBy: any = { createdAt: 'desc' };
    if (sortBy === 'reward_desc') orderBy = { reward: 'desc' };
    else if (sortBy === 'createdAt_desc') orderBy = { createdAt: 'desc' };
    else if (sortBy === 'submission_count_desc') {
      orderBy = { submissions: { _count: 'desc' } };
    } else if (sortBy === 'comment_count_desc') {
      orderBy = { comments: { _count: 'desc' } };
    }

    const [tasks, total] = await Promise.all([
      this.prisma.task.findMany({
        where,
        include: {
          creator: { select: { id: true, displayName: true, role: true } },
          rawTask: {
            select: {
              source: true,
              externalUrl: true,
              repoOwner: true,
              repoName: true,
              externalId: true,
              sourceMetadata: true,
              repoPrimaryLanguage: true,
              buildSystemHints: true,
            },
          },
          _count: { select: { submissions: true, comments: true } },
        },
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.task.count({ where }),
    ]);

    return {
      data: tasks.map((task) => this.hydrateTaskMetadata(task)),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findByCreator(
    creatorId: string,
    query: {
      status?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const { status, page = 1, limit = 20 } = query;
    const where: any = { creatorId };

    if (status) {
      const statuses = status
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      where.status = statuses.length > 1 ? { in: statuses } : statuses[0];
    }

    const [tasks, total] = await Promise.all([
      this.prisma.task.findMany({
        where,
        include: {
          creator: { select: { id: true, displayName: true, role: true } },
          rawTask: {
            select: {
              source: true,
              externalUrl: true,
              repoOwner: true,
              repoName: true,
              externalId: true,
              sourceMetadata: true,
              repoPrimaryLanguage: true,
              buildSystemHints: true,
            },
          },
          _count: { select: { submissions: true, comments: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.task.count({ where }),
    ]);

    return {
      data: tasks.map((task) => this.hydrateTaskMetadata(task)),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findById(id: string) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: {
        creator: { select: { id: true, displayName: true, role: true } },
        rawTask: true,
        submissions: {
          include: { worker: { select: { id: true, displayName: true, role: true } } },
          orderBy: { submittedAt: 'desc' },
        },
        comments: {
          where: { parentId: null },
          include: {
            user: { select: { id: true, displayName: true, role: true } },
            replies: {
              include: { user: { select: { id: true, displayName: true, role: true } } },
              orderBy: { createdAt: 'asc' },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        _count: { select: { submissions: true, comments: true } },
      },
    });
    if (!task) throw new NotFoundException('Task not found');
    return this.hydrateTaskMetadata(task);
  }

  async update(id: string, userId: string, dto: UpdateTaskDto) {
    const task = await this.prisma.task.findUnique({ where: { id } });
    if (!task) throw new NotFoundException('Task not found');
    if (task.creatorId !== userId) throw new ForbiddenException('Not the task creator');
    if (task.status !== 'OPEN') {
      throw new BadRequestException('Can only update OPEN tasks');
    }

    return this.prisma.task.update({
      where: { id },
        data: {
          ...dto,
          codeType: dto.codeType ? this.normalizeCodeType(dto.codeType) : undefined,
          taskSource: dto.taskSource ? (dto.taskSource as any) : undefined,
          deadline: dto.deadline ? new Date(dto.deadline) : undefined,
          sourceMetadata: dto.sourceMetadata as any,
        },
    });
  }

  async startReview(id: string, userId: string) {
    const task = await this.prisma.task.findUnique({ where: { id } });
    if (!task) throw new NotFoundException('Task not found');
    if (task.creatorId !== userId) throw new ForbiddenException('Not the task creator');
    if (task.status !== 'OPEN') {
      throw new BadRequestException('Can only review OPEN tasks');
    }

    return this.prisma.task.update({
      where: { id },
      data: { status: 'REVIEWING' },
    });
  }

  async cancel(id: string, userId: string) {
    const task = await this.prisma.task.findUnique({ where: { id } });
    if (!task) throw new NotFoundException('Task not found');
    if (task.creatorId !== userId) throw new ForbiddenException('Not the task creator');
    if (!['OPEN', 'REVIEWING'].includes(task.status)) {
      throw new BadRequestException('Cannot cancel task in current status');
    }

    const updated = await this.prisma.task.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });

    // Refund escrowed reward back to creator
    await this.walletService.refund(id);

    return updated;
  }
}
