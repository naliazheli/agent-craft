import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { GithubService } from '../github/github.service';
import { CreateSubmissionDto } from './dto/create-submission.dto';
import { ReviewSubmissionDto, ReviewAction } from './dto/review-submission.dto';
import { SubmitPrDto } from './dto/submit-pr.dto';

@Injectable()
export class SubmissionsService {
  private readonly logger = new Logger(SubmissionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly walletService: WalletService,
    private readonly githubService: GithubService,
  ) {}

  private isGithubTask(task: {
    taskSource?: string | null;
    rawTask?: { source?: string | null } | null;
  }) {
    return task.taskSource === 'GITHUB_ISSUE' || task.rawTask?.source === 'GITHUB_ISSUE';
  }

  private normalizeDeliverableType(task: {
    deliverableType?: string | null;
    taskSource?: string | null;
    rawTask?: { source?: string | null } | null;
  }) {
    if (task.deliverableType) return task.deliverableType;
    if (this.isGithubTask(task)) return 'CODE_FIX_CANDIDATE';
    return null;
  }

  async create(taskId: string, workerId: string, dto: CreateSubmissionDto) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: { rawTask: { select: { source: true } } },
    });
    if (!task) throw new NotFoundException('Task not found');

    if (!['OPEN', 'REVIEWING'].includes(task.status)) {
      throw new BadRequestException('Task is not accepting submissions');
    }
    if (task.creatorId === workerId) {
      throw new ForbiddenException('Cannot submit to your own task');
    }

    const deliverableType = this.normalizeDeliverableType(task);
    if (this.isGithubTask(task) && deliverableType === 'CODE_FIX_CANDIDATE') {
      throw new BadRequestException(
        'GitHub CODE_FIX_CANDIDATE tasks require PR submission. Use the PR submission endpoint once a real code fix is ready.',
      );
    }

    const latestSubmission = await this.prisma.submission.findFirst({
      where: { taskId, workerId },
      orderBy: [{ version: 'desc' }, { submittedAt: 'desc' }],
      select: { id: true, status: true, version: true },
    });

    if (latestSubmission?.status === 'SUBMITTED') {
      throw new BadRequestException(
        'You already have a pending submission for this task. Wait for review before resubmitting.',
      );
    }

    const nextVersion = latestSubmission ? latestSubmission.version + 1 : 1;

    const submission = await this.prisma.submission.create({
      data: {
        content: dto.content,
        fileUrls: dto.fileUrls || [],
        taskId,
        workerId,
        version: nextVersion,
      },
      include: { worker: { select: { id: true, displayName: true, role: true } } },
    });

    return submission;
  }

  async submitPr(taskId: string, workerId: string, dto: SubmitPrDto) {
    const worker = await this.prisma.user.findUnique({
      where: { id: workerId },
      select: { id: true, authProvider: true, githubLogin: true },
    });
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: { rawTask: true },
    });
    if (!task) throw new NotFoundException('Task not found');
    if (!worker) throw new NotFoundException('User not found');

    if (!['OPEN', 'REVIEWING'].includes(task.status)) {
      throw new BadRequestException('Task is not accepting submissions');
    }
    if (task.creatorId === workerId) {
      throw new ForbiddenException('Cannot submit to your own task');
    }
    const taskIsGithubIssue = this.isGithubTask(task);
    const deliverableType = this.normalizeDeliverableType(task);
    if (!taskIsGithubIssue) {
      throw new BadRequestException('This task does not support PR submission');
    }
    if (deliverableType && deliverableType !== 'CODE_FIX_CANDIDATE') {
      throw new BadRequestException(
        `${deliverableType} tasks do not require PR submission. Use the standard submission endpoint instead.`,
      );
    }
    if (!worker.githubLogin && worker.authProvider !== 'github') {
      throw new ForbiddenException(
        'GitHub Issue tasks require a GitHub identity. Sign in with GitHub or bind a GitHub account first.',
      );
    }

    const latestSubmission = await this.prisma.submission.findFirst({
      where: { taskId, workerId },
      orderBy: [{ version: 'desc' }, { submittedAt: 'desc' }],
      select: { id: true, status: true, version: true },
    });

    if (latestSubmission?.status === 'SUBMITTED') {
      throw new BadRequestException(
        'You already have a pending submission for this task. Wait for review before resubmitting.',
      );
    }

    const prMatch = dto.prUrl.match(
      /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)(?:\/.*)?$/i,
    );
    if (!prMatch) {
      throw new BadRequestException('prUrl must be a valid GitHub pull request URL');
    }

    const [, owner, repo, prNumberRaw] = prMatch;
    const repoFullName = `${owner}/${repo}`;
    const expectedRepo =
      task.sourceRepo ||
      [task.rawTask?.repoOwner, task.rawTask?.repoName].filter(Boolean).join('/');
    const validationErrors: string[] = [];
    const prNumber = parseInt(prNumberRaw, 10);

    if (!expectedRepo) {
      validationErrors.push('Task is missing source repository metadata');
    } else if (repoFullName.toLowerCase() !== expectedRepo.toLowerCase()) {
      validationErrors.push(`PR repo must match ${expectedRepo}`);
    }

    if (!/^[a-f0-9]{7,40}$/i.test(dto.headSha)) {
      validationErrors.push('headSha must be a valid Git commit SHA');
    }

    if (validationErrors.length === 0 && this.githubService.isConfigured()) {
      try {
        const pullRequest = await this.githubService.getPullRequest(repoFullName, prNumber);
        const authorLogin = pullRequest.user?.login?.toLowerCase();
        const expectedLogin = worker.githubLogin?.toLowerCase();

        if (expectedLogin && authorLogin && expectedLogin !== authorLogin) {
          validationErrors.push(`PR author must match bound GitHub account ${worker.githubLogin}`);
        }

        if (pullRequest.head.sha.toLowerCase() !== dto.headSha.toLowerCase()) {
          validationErrors.push('headSha must match the current GitHub PR head SHA');
        }
      } catch (error) {
        validationErrors.push(`GitHub PR validation failed: ${(error as Error).message}`);
      }
    }

    const issueNumber =
      task.sourceIssueNumber ??
      (/^\d+$/.test(task.rawTask?.externalId || '') ? parseInt(task.rawTask!.externalId, 10) : null);
    const nextVersion = latestSubmission ? latestSubmission.version + 1 : 1;
    const note = dto.note?.trim();

    const submission = await this.prisma.submission.create({
      data: {
        content: note || `PR submission: ${dto.prUrl}`,
        taskId,
        workerId,
        version: nextVersion,
        prUrl: dto.prUrl,
        headSha: dto.headSha,
        repoFullName,
        prNumber,
        issueNumber,
        validationStatus: validationErrors.length > 0 ? 'FAILED' : 'PASSED',
        validationReason: validationErrors.length > 0 ? validationErrors.join('; ') : null,
      },
      include: { worker: { select: { id: true, displayName: true, role: true } } },
    });

    return submission;
  }

  async review(submissionId: string, reviewerId: string, dto: ReviewSubmissionDto) {
    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
      include: { task: true },
    });

    if (!submission) throw new NotFoundException('Submission not found');
    if (submission.task.creatorId !== reviewerId) {
      throw new ForbiddenException('Only the task creator can review');
    }
    if (submission.status !== 'SUBMITTED') {
      throw new BadRequestException('Submission already reviewed');
    }

    let submissionStatus: string;
    let taskStatus: string;

    switch (dto.action) {
      case ReviewAction.APPROVE:
        submissionStatus = 'APPROVED';
        taskStatus = 'COMPLETED';
        // Payout reward to worker
        await this.walletService.payout(submission.taskId, submission.workerId);
        break;
      case ReviewAction.REQUEST_REVISION:
        submissionStatus = 'REVISION_REQUESTED';
        taskStatus = 'OPEN';
        break;
      case ReviewAction.REJECT:
        submissionStatus = 'REJECTED';
        taskStatus = 'OPEN';
        break;
    }

    const [updatedSubmission] = await this.prisma.$transaction([
      this.prisma.submission.update({
        where: { id: submissionId },
        data: {
          status: submissionStatus as any,
          reviewNote: dto.reviewNote,
          reviewedAt: new Date(),
        },
      }),
      this.prisma.task.update({
        where: { id: submission.taskId },
        data: { status: taskStatus as any },
      }),
    ]);

    return updatedSubmission;
  }

  async findByTask(taskId: string) {
    return this.prisma.submission.findMany({
      where: { taskId },
      include: { worker: { select: { id: true, displayName: true, role: true } } },
      orderBy: [{ version: 'desc' }, { submittedAt: 'desc' }],
    });
  }

  async findByWorker(workerId: string, page = 1, limit = 20) {
    const [submissions, total] = await Promise.all([
      this.prisma.submission.findMany({
        where: { workerId },
        include: {
          task: { select: { id: true, title: true, reward: true, currency: true, status: true } },
        },
        orderBy: [{ submittedAt: 'desc' }, { version: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.submission.count({ where: { workerId } }),
    ]);

    return {
      data: submissions,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  @Cron(CronExpression.EVERY_HOUR)
  async autoCompleteStaleSubmissions() {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const staleSubmissions = await this.prisma.submission.findMany({
      where: {
        status: 'SUBMITTED',
        submittedAt: { lte: sevenDaysAgo },
      },
      include: { task: true },
    });

    for (const submission of staleSubmissions) {
      try {
        await this.walletService.payout(submission.taskId, submission.workerId);

        await this.prisma.$transaction([
          this.prisma.submission.update({
            where: { id: submission.id },
            data: {
              status: 'APPROVED',
              reviewNote: 'Auto-approved after 7 days without review',
              reviewedAt: new Date(),
            },
          }),
          this.prisma.task.update({
            where: { id: submission.taskId },
            data: { status: 'COMPLETED' },
          }),
        ]);
      } catch (error) {
        this.logger.error(
          `Failed to auto-approve stale submission ${submission.id}: ${(error as Error).message}`,
        );
      }
    }

    if (staleSubmissions.length > 0) {
      console.log(`Auto-approved ${staleSubmissions.length} stale submissions`);
    }
  }

  @Cron('*/1 * * * *')
  async pollGithubPrSubmissions() {
    if (!this.githubService.isConfigured()) {
      return;
    }

    const submissions = await this.prisma.submission.findMany({
      where: {
        status: 'SUBMITTED',
        prUrl: { not: null },
        validationStatus: 'PASSED',
        task: {
          taskSource: 'GITHUB_ISSUE',
        },
      },
      include: {
        task: true,
        worker: {
          select: { id: true, githubLogin: true },
        },
      },
      take: 20,
      orderBy: { submittedAt: 'asc' },
    });

    for (const submission of submissions) {
      try {
        await this.processGithubPrSubmission(submission.id);
      } catch (error) {
        this.logger.warn(
          `GitHub PR sync failed for submission ${submission.id}: ${(error as Error).message}`,
        );
      }
    }
  }

  private async processGithubPrSubmission(submissionId: string) {
    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
      include: {
        task: true,
        worker: {
          select: { id: true, githubLogin: true },
        },
      },
    });

    if (
      !submission ||
      submission.status !== 'SUBMITTED' ||
      !submission.prUrl ||
      !submission.prNumber ||
      !submission.repoFullName
    ) {
      return;
    }

    const pullRequest = await this.githubService.getPullRequest(
      submission.repoFullName,
      submission.prNumber,
    );
    const authorLogin = pullRequest.user?.login?.toLowerCase();
    const expectedLogin = submission.worker.githubLogin?.toLowerCase();

    if (expectedLogin && authorLogin && expectedLogin !== authorLogin) {
      await this.prisma.submission.update({
        where: { id: submission.id },
        data: {
          validationStatus: 'FAILED',
          validationReason: `PR author must match bound GitHub account ${submission.worker.githubLogin}`,
        },
      });
      return;
    }

    if (pullRequest.merged || pullRequest.merged_at) {
      await this.autoApproveMergedSubmission(submission.id);
      return;
    }

    if (pullRequest.state !== 'open' || pullRequest.draft) {
      return;
    }

    try {
      const mergeResult = await this.githubService.mergePullRequest(
        submission.repoFullName,
        submission.prNumber,
        {
          sha: submission.headSha ?? undefined,
          commit_title: `Merge PR #${submission.prNumber} for task ${submission.task.title}`,
        },
      );

      if (mergeResult.merged) {
        await this.autoApproveMergedSubmission(submission.id);
      }
    } catch (error) {
      this.logger.debug(
        `PR ${submission.prNumber} not merged yet for submission ${submission.id}: ${(error as Error).message}`,
      );
    }
  }

  private async autoApproveMergedSubmission(submissionId: string) {
    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
      include: { task: true },
    });

    if (!submission || submission.status !== 'SUBMITTED') {
      return;
    }

    await this.walletService.payout(submission.taskId, submission.workerId);

    await this.prisma.$transaction([
      this.prisma.submission.update({
        where: { id: submissionId },
        data: {
          status: 'APPROVED',
          reviewNote: 'Auto-approved after GitHub PR merged',
          reviewedAt: new Date(),
        },
      }),
      this.prisma.task.update({
        where: { id: submission.taskId },
        data: { status: 'COMPLETED' },
      }),
    ]);
  }
}
