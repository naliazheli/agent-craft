import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeSystemEmail } from '../common/system-email';
import { GithubFetcherService } from './github-fetcher.service';
import { HackerOneFetcherService } from './hackerone-fetcher.service';
import { TaskScorerService } from './task-scorer.service';
import { GithubPublishPolicy, PublishPolicyService } from './publish-policy.service';
import { UpdateGithubPolicyDto } from './dto/update-github-policy.dto';

@Injectable()
export class TaskGeneratorService implements OnModuleInit {
  private readonly logger = new Logger(TaskGeneratorService.name);
  private readonly hackerOneFetchSeedKey = 'hackerone_fetch_seed';
  private activeDrainPromise: Promise<void> | null = null;
  private drainScheduled = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly githubFetcher: GithubFetcherService,
    private readonly hackerOneFetcher: HackerOneFetcherService,
    private readonly taskScorer: TaskScorerService,
    private readonly publishPolicy: PublishPolicyService,
  ) {}

  async onModuleInit() {
    await this.prisma.taskGeneratorRun.updateMany({
      where: { status: 'RUNNING' },
      data: {
        status: 'QUEUED',
        startedAt: null,
        finishedAt: null,
        error: 'Resumed after server restart.',
      },
    });

    this.scheduleDrain();
  }

  @Interval(1000)
  handleQueuedRuns() {
    this.scheduleDrain();
  }

  private scheduleDrain() {
    if (this.drainScheduled) {
      return;
    }

    this.drainScheduled = true;

    const trigger = () => {
      void this.drainQueuedRuns()
        .catch((error) => {
          this.logger.error(`Task generator drain failed: ${(error as Error).message}`);
        })
        .finally(() => {
          this.drainScheduled = false;
        });
    };

    if (this.activeDrainPromise) {
      void this.activeDrainPromise.finally(trigger);
      return;
    }

    trigger();
  }

  private getSourceRepo(raw: { repoOwner?: string | null; repoName?: string | null }) {
    return raw.repoOwner && raw.repoName ? `${raw.repoOwner}/${raw.repoName}` : undefined;
  }

  private normalizeTags(rawTags: unknown): string[] {
    return Array.isArray(rawTags)
      ? rawTags.map((tag) => String(tag).trim()).filter(Boolean)
      : [];
  }

  private normalizeJsonStrings(value: unknown): string[] {
    return Array.isArray(value)
      ? value.map((item) => String(item).trim()).filter(Boolean)
      : [];
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  }

  private normalizeCodeType(value?: string | null) {
    return value?.trim().toLowerCase() || null;
  }

  private inferCodeType(raw: {
    repoPrimaryLanguage?: string | null;
    buildSystemHints?: unknown;
    aiTags?: unknown;
  }) {
    const primaryLanguage = this.normalizeCodeType(raw.repoPrimaryLanguage);
    if (primaryLanguage) {
      return primaryLanguage;
    }

    const buildHints = this.normalizeJsonStrings(raw.buildSystemHints).map((hint) => hint.toLowerCase());
    if (buildHints.some((hint) => ['node', 'npm', 'pnpm', 'yarn'].includes(hint))) return 'typescript';
    if (buildHints.some((hint) => ['python', 'poetry'].includes(hint))) return 'python';
    if (buildHints.includes('go')) return 'go';
    if (buildHints.includes('rust')) return 'rust';

    const aiTags = this.normalizeJsonStrings(raw.aiTags).map((tag) => tag.toLowerCase());
    if (aiTags.some((tag) => ['typescript', 'javascript', 'react', 'next.js'].includes(tag))) return 'typescript';
    if (aiTags.some((tag) => ['python', 'django', 'fastapi'].includes(tag))) return 'python';

    return null;
  }

  private buildDifficultyTag(score?: number | null) {
    if (!score) return null;
    if (score <= 3) return 'difficulty:easy';
    if (score <= 6) return 'difficulty:medium';
    if (score <= 8) return 'difficulty:hard';
    return 'difficulty:expert';
  }

  private getPositiveInt(value: string | undefined, fallback: number) {
    const parsed = Number.parseInt(value || '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  private getPositiveIntFromUnknown(value: unknown, fallback: number) {
    const parsed =
      typeof value === 'number'
        ? value
        : Number.parseInt(typeof value === 'string' ? value : '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
  }

  private async getHackerOneFetchSeed() {
    const config = await this.prisma.systemConfig.findUnique({
      where: { key: this.hackerOneFetchSeedKey },
    });
    const value = this.asRecord(config?.value);
    if (!value) {
      return { handles: [], programLimit: 25, scopeLimit: 100 };
    }

    const handles = this.normalizeJsonStrings(value.handles);
    return {
      handles,
      programLimit: this.getPositiveIntFromUnknown(
        value.defaultProgramLimit,
        handles.length || 25,
      ),
      scopeLimit: this.getPositiveIntFromUnknown(value.defaultScopeLimit, 100),
    };
  }

  private async executeRun(type: string, input: Record<string, unknown>) {
    switch (type) {
      case 'FETCH_GITHUB':
        return this.fetchGithub(input.repos as string | undefined, input.limit as number | undefined);
      case 'FETCH_HACKERONE':
        return this.fetchHackerOne(
          input.handles as string | undefined,
          input.limit as number | undefined,
          input.scopeLimit as number | undefined,
        );
      case 'SCORE':
        return this.score(typeof input.batchSize === 'number' ? input.batchSize : 20);
      case 'PUBLISH':
        return this.publish();
      case 'SCORE_AND_PUBLISH': {
        const score = await this.score(typeof input.batchSize === 'number' ? input.batchSize : 20);
        const publish = await this.publish();
        return { score, publish };
      }
      default:
        throw new Error(`Unsupported task generator run type: ${type}`);
    }
  }

  private async drainQueuedRuns() {
    if (this.activeDrainPromise) {
      return this.activeDrainPromise;
    }

    this.activeDrainPromise = (async () => {
      try {
        while (true) {
          const nextRun = await this.prisma.taskGeneratorRun.findFirst({
            where: { status: 'QUEUED' },
            orderBy: { createdAt: 'asc' },
          });

          if (!nextRun) {
            break;
          }

          await this.prisma.taskGeneratorRun.updateMany({
            where: { id: nextRun.id },
            data: {
              status: 'RUNNING',
              startedAt: new Date(),
              finishedAt: null,
              error: null,
            },
          });

          try {
            const result = await this.executeRun(nextRun.type, (nextRun.input as Record<string, unknown>) ?? {});
            await this.prisma.taskGeneratorRun.updateMany({
              where: { id: nextRun.id },
              data: {
                status: 'COMPLETED',
                result: result as any,
                error: null,
                finishedAt: new Date(),
              },
            });
          } catch (error) {
            this.logger.error(`Task generator run ${nextRun.id} failed: ${(error as Error).message}`);
            await this.prisma.taskGeneratorRun.updateMany({
              where: { id: nextRun.id },
              data: {
                status: 'FAILED',
                error: (error as Error).message,
                finishedAt: new Date(),
              },
            });
          }
        }
      } catch (error) {
        this.logger.error(`Task generator drain stopped: ${(error as Error).message}`);
      }
    })().finally(() => {
      this.activeDrainPromise = null;
    });

    return this.activeDrainPromise;
  }

  private buildSubmissionStats(submissions: Array<{ status: string }>) {
    return submissions.reduce<Record<string, number>>((stats, submission) => {
      stats[submission.status] = (stats[submission.status] ?? 0) + 1;
      return stats;
    }, {});
  }

  private deriveProcessingState(raw: {
    status: string;
    shouldPublish?: boolean | null;
    publishedTask?: {
      id: string;
      status: string;
      submissions: Array<{ id: string; status: string }>;
    } | null;
  }) {
    const submissions = raw.publishedTask?.submissions ?? [];
    const submissionStats = this.buildSubmissionStats(submissions);

    if (raw.publishedTask) {
      if (raw.publishedTask.status === 'COMPLETED') {
        return { processingStage: 'COMPLETED', processingLabel: 'Completed', submissionStats };
      }

      if (raw.publishedTask.status === 'CANCELLED') {
        return { processingStage: 'CANCELLED', processingLabel: 'Cancelled', submissionStats };
      }

      if (raw.publishedTask.status === 'DISPUTED') {
        return { processingStage: 'DISPUTED', processingLabel: 'Disputed', submissionStats };
      }

      if (raw.publishedTask.status === 'REVIEWING') {
        return { processingStage: 'REVIEWING', processingLabel: 'In Review', submissionStats };
      }

      if (submissions.length > 0) {
        return { processingStage: 'SUBMITTED', processingLabel: 'Submission Received', submissionStats };
      }

      return { processingStage: 'PUBLISHED', processingLabel: 'Published', submissionStats };
    }

    switch (raw.status) {
      case 'SKIPPED':
        return { processingStage: 'FILTERED', processingLabel: 'Filtered', submissionStats };
      case 'FAILED':
        return { processingStage: 'FAILED', processingLabel: 'Scoring Failed', submissionStats };
      case 'SCORED':
        return {
          processingStage: raw.shouldPublish ? 'READY_TO_PUBLISH' : 'SCORED_ONLY',
          processingLabel: raw.shouldPublish ? 'Ready to Publish' : 'Scored but Held',
          submissionStats,
        };
      case 'SCORING':
        return { processingStage: 'SCORING', processingLabel: 'Scoring', submissionStats };
      default:
        return { processingStage: 'PENDING', processingLabel: 'Pending', submissionStats };
    }
  }

  private isHandledProcessingStage(stage: string) {
    return !['PENDING', 'SCORING'].includes(stage);
  }

  private serializeRawTask(raw: any) {
    const lifecycle = this.deriveProcessingState(raw);
    return {
      ...raw,
      processingStage: lifecycle.processingStage,
      processingLabel: lifecycle.processingLabel,
      submissionStats: lifecycle.submissionStats,
      publishedTask: raw.publishedTask
        ? {
            id: raw.publishedTask.id,
            status: raw.publishedTask.status,
            submissionCount: raw.publishedTask.submissions.length,
          }
        : null,
    };
  }

  private matchesDerivedFilters(
    raw: { processingStage: string },
    query: { processingStage?: string; handledOnly?: boolean },
  ) {
    if (query.processingStage && raw.processingStage !== query.processingStage) {
      return false;
    }

    if (query.handledOnly && !this.isHandledProcessingStage(raw.processingStage)) {
      return false;
    }

    return true;
  }

  private async loadSerializedRawTasks(where: any) {
    const rawTasks = await this.prisma.rawTask.findMany({
      where,
      orderBy: { fetchedAt: 'desc' },
      include: {
        publishedTask: {
          select: {
            id: true,
            status: true,
            submissions: {
              select: {
                id: true,
                status: true,
              },
            },
          },
        },
      },
    });

    return rawTasks.map((raw) => this.serializeRawTask(raw));
  }

  private shouldSkipGithubIssue(tags: string[], title: string) {
    const normalized = [title, ...tags].map((item) => item.toLowerCase());
    return normalized.some(
      (item) =>
        item.includes('question') ||
        item.includes('status: unconfirmed') ||
        item.includes('needs triage') ||
        item.includes('platform_specific_environment') ||
        item.includes('feature request') ||
        item.includes('suggestion') ||
        item.includes('proposal') ||
        item.includes('design change') ||
        item.includes('language feature') ||
        item.includes('weak_title'),
    );
  }

  private getAgeDays(date?: Date | null) {
    if (!date) return null;
    return Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000));
  }

  private hasOnlyBlockedBuildHints(buildHints: string[], blockedBuildHints: string[]) {
    if (!buildHints.length || !blockedBuildHints.length) {
      return false;
    }

    return buildHints.every((hint) => blockedBuildHints.includes(hint));
  }

  private shouldCancelGithubTaskForPolicy(
    raw: {
      title: string;
      body?: string | null;
      repoOwner?: string | null;
      repoName?: string | null;
      aiTags?: unknown;
      labels?: unknown;
      publishReasons?: unknown;
      buildSystemHints?: unknown;
      repoStars?: number | null;
      difficultyScore?: number | null;
      issueCommentCount?: number | null;
      issueCreatedAt?: Date | null;
      issueUpdatedAt?: Date | null;
      repoHasGithubCi?: boolean | null;
      repoHasBuildManifest?: boolean | null;
      shouldPublish?: boolean | null;
      status: string;
    },
    policy: GithubPublishPolicy,
  ) {
    const sourceRepo = this.getSourceRepo(raw);
    const normalizedSignals = [
      ...this.normalizeTags(raw.aiTags),
      ...this.normalizeJsonStrings(raw.labels),
      ...this.normalizeJsonStrings(raw.publishReasons),
      raw.body ?? '',
    ];
    const buildHints = this.normalizeJsonStrings(raw.buildSystemHints).map((hint) => hint.toLowerCase());
    const blockedBuildHints = policy.blockedBuildHints.map((hint) => hint.toLowerCase());
    const createdAgeDays = this.getAgeDays(raw.issueCreatedAt);
    const updatedAgeDays = this.getAgeDays(raw.issueUpdatedAt);

    return (
      raw.status === 'SKIPPED' ||
      raw.shouldPublish === false ||
      !sourceRepo ||
      !policy.allowedRepos.includes(sourceRepo) ||
      policy.blockedRepos.includes(sourceRepo) ||
      this.shouldSkipGithubIssue(normalizedSignals, raw.title) ||
      (raw.repoStars ?? 0) < policy.minimumRepoStars ||
      (raw.issueCommentCount ?? 0) > policy.maximumIssueCommentCount ||
      (raw.difficultyScore ?? 0) > policy.maximumDifficultyScore ||
      (createdAgeDays !== null && createdAgeDays > policy.maximumIssueCreatedAgeDays) ||
      (updatedAgeDays !== null && updatedAgeDays > policy.maximumIssueUpdatedAgeDays) ||
      (policy.requireGithubCiOrBuildManifest &&
        !raw.repoHasGithubCi &&
        !raw.repoHasBuildManifest) ||
      this.hasOnlyBlockedBuildHints(buildHints, blockedBuildHints)
    );
  }

  private async reconcileOpenGithubTasks() {
    const policy = await this.publishPolicy.getGithubPolicy();
    const publishedRawTasks = await this.prisma.rawTask.findMany({
      where: {
        source: 'GITHUB_ISSUE',
        publishedTaskId: { not: null },
      },
      include: {
        publishedTask: {
          include: {
            submissions: {
              select: { id: true },
              take: 1,
            },
          },
        },
      },
    });

    for (const raw of publishedRawTasks) {
      if (!raw.publishedTask || !['OPEN', 'REVIEWING'].includes(raw.publishedTask.status)) {
        continue;
      }

      if (raw.publishedTask.status === 'OPEN' && raw.publishedTask.submissions.length > 0) {
        await this.prisma.task.update({
          where: { id: raw.publishedTask.id },
          data: { status: 'REVIEWING' },
        });
        continue;
      }

      const shouldCancel = this.shouldCancelGithubTaskForPolicy(raw, policy);

      if (!shouldCancel) {
        continue;
      }

      await this.prisma.task.update({
        where: { id: raw.publishedTask.id },
        data: { status: 'CANCELLED' },
      });

      await this.prisma.rawTask.update({
        where: { id: raw.id },
        data: {
          status: 'SKIPPED',
          shouldPublish: false,
        },
      });
    }
  }

  private buildGithubAcceptanceCriteria(raw: {
    externalUrl: string;
    repoOwner?: string | null;
    repoName?: string | null;
    repoHasGithubCi?: boolean | null;
    repoHasBuildManifest?: boolean | null;
    buildSystemHints?: unknown;
  }) {
    const sourceRepo = this.getSourceRepo(raw);
    const buildHints = this.normalizeJsonStrings(raw.buildSystemHints);
    return [
      'Clarify whether the required deliverable is investigation, reproduction, or a fix before submitting.',
      'For CODE_FIX_CANDIDATE work, do not submit an investigation-only report as the final deliverable. Submit a concrete patch, a PR, or a clearly labeled blocker/reproduction package instead.',
      sourceRepo ? `Use ${sourceRepo} as the target repository.` : null,
      `Reference the original issue at ${raw.externalUrl}.`,
      raw.repoHasBuildManifest && buildHints.length
        ? `Prefer validating with the repository's local toolchain (${buildHints.join(', ')}).`
        : null,
      raw.repoHasGithubCi
        ? 'If you prepare a code fix, note which GitHub Actions or CI checks are expected to validate it.'
        : null,
      'If you submit completed work, include concrete verification steps. If blocked, explain the blocker precisely instead of fabricating progress.',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private buildGithubSignals(raw: {
    issueUpdatedAt?: Date | null;
    repoStars?: number | null;
    repoPrimaryLanguage?: string | null;
    repoHasGithubCi?: boolean | null;
    repoHasBuildManifest?: boolean | null;
    buildSystemHints?: unknown;
    difficultyScore?: number | null;
    publishReasons?: unknown;
  }) {
    const buildHints = this.normalizeJsonStrings(raw.buildSystemHints);
    const publishReasons = this.normalizeJsonStrings(raw.publishReasons);

    return [
      raw.repoStars != null ? `**Repo Stars**: ${raw.repoStars}` : null,
      raw.repoPrimaryLanguage ? `**Primary Language**: ${raw.repoPrimaryLanguage}` : null,
      raw.issueUpdatedAt ? `**Issue Last Updated**: ${raw.issueUpdatedAt.toISOString()}` : null,
      raw.repoHasGithubCi != null ? `**GitHub CI**: ${raw.repoHasGithubCi ? 'yes' : 'no'}` : null,
      raw.repoHasBuildManifest != null
        ? `**Local Build Hints Present**: ${raw.repoHasBuildManifest ? 'yes' : 'no'}`
        : null,
      buildHints.length ? `**Build Hints**: ${buildHints.join(', ')}` : null,
      raw.difficultyScore != null ? `**Difficulty Rating**: ${raw.difficultyScore}/10` : null,
      publishReasons.length ? `**Publish Signals**: ${publishReasons.join(' | ')}` : null,
    ]
      .filter(Boolean)
      .join('\n');
  }

  private buildGithubIssueExcerpt(body?: string | null) {
    if (!body?.trim()) {
      return null;
    }

    const normalized = body.replace(/\r\n/g, '\n').trim();
    const excerpt = normalized.length > 1200 ? `${normalized.slice(0, 1200)}...` : normalized;
    return `**Issue Excerpt**:\n${excerpt}`;
  }

  private getHackerOneMetadata(raw: { sourceMetadata?: unknown }) {
    const metadata = raw.sourceMetadata as any;
    return metadata && typeof metadata === 'object' && metadata.source === 'hackerone' ? metadata : null;
  }

  private formatHackerOneRewardRange(range?: any) {
    if (!range) return null;
    if (range.rawAmount) return range.rawAmount;
    if (range.minimum == null && range.maximum == null) return range.rawAmount || null;
    const prefix = range.currency ? `${range.currency} ` : '';
    if (range.minimum === range.maximum || range.minimum == null) return `${prefix}${range.maximum}`;
    return `${prefix}${range.minimum} - ${range.maximum}`;
  }

  private markdownList(items?: unknown[]) {
    if (!Array.isArray(items) || items.length === 0) return '- Not specified.';
    return items.map((item) => `- ${String(item)}`).join('\n');
  }

  private buildHackerOneRewardTable(metadata: any) {
    const rows = Array.isArray(metadata?.rewards?.table) ? metadata.rewards.table : [];
    if (!rows.length) {
      return null;
    }

    return [
      '| Severity | External bounty guidance |',
      '| --- | --- |',
      ...rows.map((row: any) => `| ${row.label || row.severity || '-'} | ${this.formatHackerOneRewardRange(row) || row.rawAmount || '-'} |`),
    ].join('\n');
  }

  private buildHackerOneTestingNotes(metadata: any) {
    if (!metadata) {
      return null;
    }

    const requiredHeaders = Array.isArray(metadata.testing?.requiredHeaders)
      ? metadata.testing.requiredHeaders.map((header: any) => `\`${header.name}: ${header.value}\``)
      : [];
    const accountGuidance = Array.isArray(metadata.testing?.accountGuidance) ? metadata.testing.accountGuidance : [];
    const safetyRules = [
      ...(Array.isArray(metadata.testing?.prohibitedActions) ? metadata.testing.prohibitedActions : []),
      ...(Array.isArray(metadata.testing?.safeTestingRules) ? metadata.testing.safeTestingRules : []),
    ];
    const duplicatePolicy = Array.isArray(metadata.testing?.duplicatePolicy) ? metadata.testing.duplicatePolicy : [];
    const scopeExclusions = Array.isArray(metadata.policy?.scopeExclusions)
      ? metadata.policy.scopeExclusions.map((item: any) => [item.category, item.details].filter(Boolean).join(': '))
      : [];
    const platformStandards = Array.isArray(metadata.policy?.platformStandardsExclusions)
      ? metadata.policy.platformStandardsExclusions.map((item: any) =>
          [item.standard, item.justification].filter(Boolean).join(': '),
        )
      : [];

    return [
      requiredHeaders.length ? `Required testing headers:\n${this.markdownList(requiredHeaders)}` : null,
      accountGuidance.length ? `Account guidance:\n${this.markdownList(accountGuidance)}` : null,
      safetyRules.length ? `Safety constraints:\n${this.markdownList(safetyRules)}` : null,
      duplicatePolicy.length ? `Duplicate/grouping policy:\n${this.markdownList(duplicatePolicy)}` : null,
      scopeExclusions.length ? `Out-of-scope exclusions:\n${this.markdownList(scopeExclusions)}` : null,
      platformStandards.length ? `Platform standards deviations:\n${this.markdownList(platformStandards)}` : null,
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  private hackerOneScopeCatalog(metadata: any) {
    return Array.isArray(metadata?.scopeCatalog)
      ? metadata.scopeCatalog.filter((item: any) => item?.scope && typeof item.scope === 'object')
      : [];
  }

  private hackerOneAssetTypeSummary(metadata: any) {
    const assetTypes = Array.isArray(metadata?.scopeSummary?.assetTypes) ? metadata.scopeSummary.assetTypes : [];
    return assetTypes
      .map((item: any) => `${item.assetType || 'unknown'} (${item.count || 0})`)
      .filter(Boolean)
      .join(', ');
  }

  private buildHackerOneScopeCatalogPreview(metadata: any) {
    const catalog = this.hackerOneScopeCatalog(metadata);
    if (!catalog.length) {
      return null;
    }

    const rows = catalog.slice(0, 12).map((item: any) => {
      const scope = item.scope || {};
      return `- ${scope.assetIdentifier || 'unknown'} (${scope.assetType || 'unknown'}, max ${scope.maxSeverity || 'unknown'})`;
    });

    return [
      `Eligible imported scopes: ${metadata?.scopeSummary?.totalEligibleScopes || catalog.length}`,
      this.hackerOneAssetTypeSummary(metadata) ? `Asset types: ${this.hackerOneAssetTypeSummary(metadata)}` : null,
      'Scope preview:',
      ...rows,
      catalog.length > rows.length ? `- ... ${catalog.length - rows.length} more in sourceMetadata.scopeCatalog` : null,
    ]
      .filter(Boolean)
      .join('\n');
  }

  private buildHackerOneAcceptanceCriteria(raw: {
    externalUrl: string;
    repoName?: string | null;
    externalId: string;
    sourceMetadata?: unknown;
  }) {
    const metadata = this.getHackerOneMetadata(raw);
    const scope = metadata?.scope;
    const scopeCatalog = this.hackerOneScopeCatalog(metadata);
    const isProgramTask = scopeCatalog.length > 0 || String(scope?.assetType || '').toUpperCase() === 'PROGRAM';
    const requiredHeaders = Array.isArray(metadata?.testing?.requiredHeaders)
      ? metadata.testing.requiredHeaders.map((header: any) => `${header.name}: ${header.value}`)
      : [];
    const reportTemplate = Array.isArray(metadata?.reportTemplate) ? metadata.reportTemplate : [];

    return [
      raw.repoName ? `Use HackerOne program ${raw.repoName} as the authorization boundary.` : null,
      isProgramTask
        ? 'Treat this Marketplace task as a program-level opportunity; the project planner must select concrete assets from sourceMetadata.scopeCatalog before validation.'
        : scope?.assetIdentifier ? `Target only the imported in-scope asset ${scope.assetIdentifier}.` : null,
      isProgramTask && this.hackerOneAssetTypeSummary(metadata)
        ? `Use the imported asset type breakdown when planning: ${this.hackerOneAssetTypeSummary(metadata)}.`
        : scope?.assetType ? `Treat the asset type as ${scope.assetType}.` : null,
      isProgramTask
        ? 'Prefer URL, API, WILDCARD, SDK/source-code, OAuth, and multi-tenant web surfaces when present; require extra justification before choosing mobile-only, executable-only, hardware, payment/KYC-heavy, or broad OTHER scopes.'
        : null,
      `Reference the original HackerOne program at ${raw.externalUrl}.`,
      `Reference the imported source id ${raw.externalId}.`,
      requiredHeaders.length ? `Include the program testing header(s): ${requiredHeaders.join('; ')}.` : null,
      'Only test assets and vulnerability classes that are explicitly in scope.',
      'Use only accounts you own or accounts where you have explicit permission.',
      'Do not perform destructive, privacy-invasive, or out-of-scope testing.',
      reportTemplate.length
        ? `Your AgentCraft submission must include: ${reportTemplate.join(' ')}`
        : 'Your AgentCraft submission must include reproduction steps, impact, evidence, and remediation guidance.',
      'Submit a concise security research report with reproduction steps, impact, evidence, and remediation guidance.',
      'If blocked, explain the authorization or reproducibility blocker precisely instead of fabricating findings.',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private buildHackerOneSignals(raw: {
    externalId: string;
    bountyAmount?: number | null;
    bountyCurrency?: string | null;
    issueUpdatedAt?: Date | null;
    difficultyScore?: number | null;
    publishReasons?: unknown;
    labels?: unknown;
    sourceMetadata?: unknown;
  }) {
    const labels = this.normalizeJsonStrings(raw.labels);
    const publishReasons = this.normalizeJsonStrings(raw.publishReasons);
    const metadata = this.getHackerOneMetadata(raw);
    const scopeCatalog = this.hackerOneScopeCatalog(metadata);
    const isProgramTask = scopeCatalog.length > 0 || String(metadata?.scope?.assetType || '').toUpperCase() === 'PROGRAM';
    const rewardRange = this.formatHackerOneRewardRange(metadata?.scopeSummary?.topRewardRange || metadata?.rewards?.scopeRange);
    const headers = Array.isArray(metadata?.testing?.requiredHeaders)
      ? metadata.testing.requiredHeaders.map((header: any) => `${header.name}: ${header.value}`)
      : [];

    return [
      `**Original ID**: ${raw.externalId}`,
      isProgramTask
        ? `**Imported Eligible Scopes**: ${metadata?.scopeSummary?.totalEligibleScopes || scopeCatalog.length}`
        : metadata?.scope?.assetIdentifier ? `**Asset**: ${metadata.scope.assetIdentifier}` : null,
      isProgramTask && this.hackerOneAssetTypeSummary(metadata)
        ? `**Asset Types**: ${this.hackerOneAssetTypeSummary(metadata)}`
        : metadata?.scope?.assetType ? `**Asset Type**: ${metadata.scope.assetType}` : null,
      metadata?.scopeSummary?.maxSeverity
        ? `**Max Imported Severity**: ${metadata.scopeSummary.maxSeverity}`
        : metadata?.scope?.maxSeverity ? `**Max Severity**: ${metadata.scope.maxSeverity}` : null,
      rewardRange ? `**Top External Reward Range**: ${rewardRange}` : null,
      raw.bountyAmount != null ? `**Imported Bounty Ceiling**: ${raw.bountyAmount}` : null,
      raw.bountyCurrency ? `**Bounty Currency**: ${raw.bountyCurrency}` : null,
      raw.issueUpdatedAt ? `**Scope Last Updated**: ${raw.issueUpdatedAt.toISOString()}` : null,
      headers.length ? `**Required Testing Headers**: ${headers.join('; ')}` : null,
      raw.difficultyScore != null ? `**Difficulty Rating**: ${raw.difficultyScore}/10` : null,
      labels.length ? `**Scope Labels**: ${labels.join(', ')}` : null,
      publishReasons.length ? `**Publish Signals**: ${publishReasons.join(' | ')}` : null,
    ]
      .filter(Boolean)
      .join('\n');
  }

  private async isPublishableGithubRawTask(raw: {
    id: string;
    title: string;
    externalId: string;
    externalUrl: string | null;
    repoOwner?: string | null;
    repoName?: string | null;
  }) {
    if (process.env.NODE_ENV === 'test') {
      return true;
    }

    const sourceRepo = this.getSourceRepo(raw);
    const issueNumber = /^\d+$/.test(raw.externalId) ? parseInt(raw.externalId, 10) : null;

    if (!raw.externalUrl || !sourceRepo || !issueNumber) {
      return false;
    }

    try {
      return await this.githubFetcher.isIssueOpen(raw.repoOwner!, raw.repoName!, issueNumber);
    } catch (error) {
      this.logger.warn(
        `Failed to validate GitHub issue for raw task ${raw.id} (${raw.title}): ${(error as Error).message}`,
      );
      return false;
    }
  }

  private async getSystemUser() {
    const systemEmail = normalizeSystemEmail(this.config.get<string>('SYSTEM_USER_EMAIL'));
    const systemUser = await this.prisma.user.findUnique({ where: { email: systemEmail } });
    if (!systemUser) {
      throw new Error(`System user not found (${systemEmail}). Run seed first.`);
    }

    return systemUser;
  }

  private async publishHackerOneRawTask(raw: any, systemUserId: string): Promise<'published' | 'skipped'> {
    if (raw.publishedTaskId) {
      return 'skipped';
    }

    if (!raw.externalUrl || !raw.hasBounty) {
      await this.prisma.rawTask.update({
        where: { id: raw.id },
        data: { status: 'SKIPPED', shouldPublish: false },
      });
      return 'skipped';
    }

    const tags = Array.from(
      new Set([
        ...this.normalizeTags(raw.aiTags),
        ...this.normalizeJsonStrings(raw.labels),
        'hackerone',
        'security-research',
        'authorized-security-research',
      ].filter(Boolean)),
    );
    const hackerOneMetadata = this.getHackerOneMetadata(raw);
    const hackerOneSignals = this.buildHackerOneSignals(raw);
    const scopeExcerpt = this.buildGithubIssueExcerpt(raw.body);
    const rewardTable = this.buildHackerOneRewardTable(hackerOneMetadata);
    const testingNotes = this.buildHackerOneTestingNotes(hackerOneMetadata);
    const reportTemplate = Array.isArray(hackerOneMetadata?.reportTemplate)
      ? this.markdownList(hackerOneMetadata.reportTemplate)
      : null;
    const scope = hackerOneMetadata?.scope;
    const scopeCatalogPreview = this.buildHackerOneScopeCatalogPreview(hackerOneMetadata);
    const isProgramTask = Boolean(scopeCatalogPreview) || String(scope?.assetType || '').toUpperCase() === 'PROGRAM';
    const description = [
      raw.aiSummary || raw.body?.slice(0, 500) || '(No description provided)',
      '',
      `**Original Program**: ${raw.externalUrl}`,
      raw.repoName ? `**Program Handle**: ${raw.repoName}` : null,
      isProgramTask && scopeCatalogPreview
        ? `**Imported Scope Catalog**:\n${scopeCatalogPreview}`
        : scope?.assetIdentifier
        ? [
            '**Target Scope**:',
            `- Asset: ${scope.assetIdentifier}`,
            `- Type: ${scope.assetType || 'unknown'}`,
            `- Max severity: ${scope.maxSeverity || 'unknown'}`,
            `- Bounty eligible: ${scope.eligibleForBounty ? 'yes' : 'no'}`,
            `- Submission eligible: ${scope.eligibleForSubmission ? 'yes' : 'no'}`,
            scope.instruction ? `- Scope instruction: ${scope.instruction}` : null,
          ].filter(Boolean).join('\n')
        : null,
      raw.hasBounty ? '**Offers Bounty**: yes' : null,
      hackerOneSignals,
      rewardTable ? `**External Reward Table**:\n${rewardTable}` : null,
      testingNotes ? `**Testing and Safety Notes**:\n${testingNotes}` : null,
      reportTemplate ? `**Required Report Structure**:\n${reportTemplate}` : null,
      scopeExcerpt,
    ]
      .filter(Boolean)
      .join('\n');

    const task = await this.prisma.task.create({
      data: {
        title: `[HackerOne] ${raw.title}`,
        description,
        acceptanceCriteria: this.buildHackerOneAcceptanceCriteria(raw),
        deliverableType: 'SECURITY_RESEARCH_REPORT',
        codeType: 'security',
        reward: raw.estimatedReward ?? 25,
        currency: 'AIC',
        tags,
        taskSource: 'HACKERONE',
        sourceUrl: raw.externalUrl,
        sourceRepo: raw.repoName ? `hackerone/${raw.repoName}` : 'hackerone',
        sourceMetadata: {
          ...(hackerOneMetadata ?? {}),
          source: 'hackerone',
          originalId: raw.externalId,
          programHandle: raw.repoName,
          fundingMode: 'REWARD_POOL_PREFUNDED',
          fundingNote:
            'System-published HackerOne tasks are paid by AgentCraft for accepted research work; external bounty eligibility remains governed by the HackerOne program policy.',
        },
        creatorId: systemUserId,
      },
    });

    await this.prisma.rawTask.update({
      where: { id: raw.id },
      data: { status: 'PUBLISHED', publishedTaskId: task.id },
    });

    return 'published';
  }

  async publishHackerOneRawTasksDirect(handles?: string[]): Promise<{ published: number; skipped: number }> {
    const systemUser = await this.getSystemUser();
    const normalizedHandles = handles?.map((handle) => handle.trim()).filter(Boolean) ?? [];
    const rawTasks = await this.prisma.rawTask.findMany({
      where: {
        source: 'HACKERONE_PROGRAM',
        publishedTaskId: null,
        status: { in: ['PENDING', 'SCORED'] },
        ...(normalizedHandles.length ? { repoName: { in: normalizedHandles } } : {}),
      },
      orderBy: [
        { issueUpdatedAt: 'desc' },
        { fetchedAt: 'desc' },
      ],
    });

    let published = 0;
    let skipped = 0;

    for (const raw of rawTasks) {
      try {
        const result = await this.publishHackerOneRawTask(raw, systemUser.id);
        if (result === 'published') published++;
        else skipped++;
      } catch (error) {
        this.logger.error(`Failed to publish HackerOne raw task ${raw.id}: ${(error as Error).message}`);
        skipped++;
      }
    }

    return { published, skipped };
  }

  async fetchGithub(repos?: string, limit?: number): Promise<{ fetched: number; skipped: number }> {
    const policy = await this.publishPolicy.getGithubPolicy();
    const defaultRepos = policy.allowedRepos.join(',');
    const defaultLimit = parseInt(this.config.get<string>('GITHUB_FETCH_LIMIT') || '10', 10);

    const requestedRepos = (repos || defaultRepos)
      .split(',')
      .map((r) => r.trim())
      .filter(Boolean);
    const repoList = requestedRepos.filter(
      (repo) => policy.allowedRepos.includes(repo) && !policy.blockedRepos.includes(repo),
    );

    if (!repoList.length) {
      throw new Error('No allowed repos configured in github publish policy.');
    }

    return this.githubFetcher.fetchAndStore(repoList, limit ?? defaultLimit);
  }

  async fetchHackerOne(
    handles?: string,
    limit?: number,
    scopeLimit?: number,
  ): Promise<{ fetched: number; skipped: number; published: number; publishSkipped: number }> {
    const seed = await this.getHackerOneFetchSeed();
    const requestedHandles = handles
      ?.split(',')
      .map((handle) => handle.trim())
      .filter(Boolean);
    const usesSeedHandles = !requestedHandles || requestedHandles.length === 0;
    const defaultLimit = usesSeedHandles
      ? seed.programLimit
      : this.getPositiveInt(this.config.get<string>('HACKERONE_FETCH_LIMIT'), seed.programLimit);
    const defaultScopeLimit = this.getPositiveInt(
      this.config.get<string>('HACKERONE_SCOPE_FETCH_LIMIT'),
      seed.scopeLimit,
    );
    const effectiveLimit = limit ?? defaultLimit;
    const handleList =
      requestedHandles && requestedHandles.length > 0
        ? requestedHandles.slice(0, effectiveLimit)
        : seed.handles.slice(0, effectiveLimit);

    const fetchResult = await this.hackerOneFetcher.fetchAndStore({
      handles: handleList.length > 0 ? handleList : undefined,
      limit: effectiveLimit,
      scopeLimit: scopeLimit ?? defaultScopeLimit,
    });
    const publishResult = await this.publishHackerOneRawTasksDirect(handleList);

    return {
      ...fetchResult,
      published: publishResult.published,
      publishSkipped: publishResult.skipped,
    };
  }

  async startRun(
    type: 'FETCH_GITHUB' | 'FETCH_HACKERONE' | 'SCORE' | 'PUBLISH' | 'SCORE_AND_PUBLISH',
    triggeredBy: string,
    input: Record<string, unknown> = {},
  ) {
    const run = await this.prisma.taskGeneratorRun.create({
      data: {
        type,
        triggeredBy,
        input: input as any,
      },
    });

    this.scheduleDrain();

    return run;
  }

  async score(batchSize = 20): Promise<{ scored: number; failed: number }> {
    return this.taskScorer.scorePending(batchSize);
  }

  async publish(): Promise<{ published: number; skipped: number }> {
    const policy = await this.publishPolicy.getGithubPolicy();
    const publishLimit =
      policy.publishLimitPerCycle ||
      this.getPositiveInt(this.config.get<string>('GITHUB_PUBLISH_LIMIT_PER_CYCLE'), 5);
    const systemUser = await this.getSystemUser();

    await this.reconcileOpenGithubTasks();

    const candidatePool = await this.prisma.rawTask.findMany({
      where: {
        status: 'SCORED',
        shouldPublish: true,
        difficultyScore: { gte: 2 },
        valueScore: { gte: 3 },
      },
      orderBy: [
        { publishPriority: 'desc' },
        { issueUpdatedAt: 'desc' },
        { repoStars: 'desc' },
      ],
    });
    const candidates = candidatePool.slice(0, publishLimit);
    this.logger.log(
      `Publish cycle: candidatePool=${candidatePool.length}, publishLimit=${publishLimit}, selected=${candidates.length}`,
    );

    let published = 0;
    let skipped = 0;

    for (const raw of candidates) {
      try {
        if (raw.source === 'HACKERONE_PROGRAM') {
          const result = await this.publishHackerOneRawTask(raw, systemUser.id);
          if (result === 'published') published++;
          else skipped++;
          continue;
        }

        const issueNumber = /^\d+$/.test(raw.externalId) ? parseInt(raw.externalId, 10) : null;
        const sourceRepo = this.getSourceRepo(raw);
        const tags = [...this.normalizeTags(raw.aiTags), ...this.normalizeJsonStrings(raw.labels)];
        const hasLiveGithubIssue = await this.isPublishableGithubRawTask(raw);

        if (
          !raw.externalUrl ||
          !sourceRepo ||
          this.shouldSkipGithubIssue(tags, raw.title) ||
          !hasLiveGithubIssue
        ) {
          await this.prisma.rawTask.update({
            where: { id: raw.id },
            data: { status: 'SKIPPED', shouldPublish: false },
          });
          skipped++;
          continue;
        }

        const difficultyTag = this.buildDifficultyTag(raw.difficultyScore);
        const tagsWithSignals = Array.from(
          new Set([
            ...tags,
            'github',
            raw.repoPrimaryLanguage?.toLowerCase() || '',
            raw.repoHasGithubCi ? 'has-ci' : '',
            raw.repoHasBuildManifest ? 'locally-buildable' : 'ci-preferred',
            difficultyTag || '',
          ].filter(Boolean)),
        );
        const githubSignals = this.buildGithubSignals(raw);
        const issueExcerpt = this.buildGithubIssueExcerpt(raw.body);

        const description = [
          raw.aiSummary || raw.body?.slice(0, 500) || '(No description provided)',
          '',
          `**Original Issue**: ${raw.externalUrl}`,
          sourceRepo ? `**Repository**: ${sourceRepo}` : null,
          raw.hasBounty ? '**Has Bounty**: yes' : null,
          githubSignals,
          issueExcerpt,
        ]
          .filter(Boolean)
          .join('\n');

        const task = await this.prisma.task.create({
          data: {
            title: `[GitHub] ${raw.title}`,
            description,
            acceptanceCriteria: this.buildGithubAcceptanceCriteria(raw),
            deliverableType: this.shouldSkipGithubIssue(tags, raw.title)
              ? 'TRIAGE'
              : 'CODE_FIX_CANDIDATE',
            codeType: this.inferCodeType(raw),
            reward: raw.estimatedReward ?? 10,
            currency: 'AIC',
            tags: tagsWithSignals,
            taskSource: 'GITHUB_ISSUE',
            sourceUrl: raw.externalUrl,
            sourceRepo,
            sourceIssueNumber: issueNumber ?? undefined,
            sourceMetadata: {
              fundingMode: 'REWARD_POOL_PREFUNDED',
              fundingNote:
                'System-published GitHub tasks are paid directly from the reward pool on accepted work.',
            },
            creatorId: systemUser.id,
          },
        });

        await this.prisma.rawTask.update({
          where: { id: raw.id },
          data: { status: 'PUBLISHED', publishedTaskId: task.id },
        });

        published++;
      } catch (err) {
        this.logger.error(`Failed to publish raw task ${raw.id}: ${(err as Error).message}`);
        skipped++;
      }
    }

    return { published, skipped };
  }

  async listRawTasks(query: {
    status?: string;
    processingStage?: string;
    handledOnly?: boolean;
    page?: number;
    limit?: number;
  }) {
    const { status, processingStage, handledOnly = false, page = 1, limit = 20 } = query;
    const where: any = {};
    if (status) where.status = status;

    const needsDerivedFiltering = Boolean(processingStage) || handledOnly;

    if (needsDerivedFiltering) {
      const serialized = await this.loadSerializedRawTasks(where);
      const filtered = serialized.filter((raw) => this.matchesDerivedFilters(raw, { processingStage, handledOnly }));
      const paged = filtered.slice((page - 1) * limit, page * limit);

      return {
        data: paged,
        meta: { total: filtered.length, page, limit, totalPages: Math.ceil(filtered.length / limit) },
      };
    }

    const [data, total] = await Promise.all([
      this.prisma.rawTask.findMany({
        where,
        orderBy: { fetchedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          publishedTask: {
            select: {
              id: true,
              status: true,
              submissions: {
                select: {
                  id: true,
                  status: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.rawTask.count({ where }),
    ]);

    return {
      data: data.map((raw) => this.serializeRawTask(raw)),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getRawTask(id: string) {
    const raw = await this.prisma.rawTask.findUniqueOrThrow({
      where: { id },
      include: {
        publishedTask: {
          select: {
            id: true,
            status: true,
            submissions: {
              select: {
                id: true,
                status: true,
              },
            },
          },
        },
      },
    });
    return this.serializeRawTask(raw);
  }

  async getRawTaskStats(query: {
    status?: string;
    processingStage?: string;
    handledOnly?: boolean;
  }) {
    const where: any = {};
    if (query.status) where.status = query.status;

    const serialized = await this.loadSerializedRawTasks(where);
    const filtered = serialized.filter((raw) => this.matchesDerivedFilters(raw, query));

    const totals = filtered.reduce(
      (acc, raw) => {
        acc.total += 1;
        acc.byStatus[raw.status] = (acc.byStatus[raw.status] ?? 0) + 1;
        acc.byProcessingStage[raw.processingStage] = (acc.byProcessingStage[raw.processingStage] ?? 0) + 1;
        if (raw.publishedTask) acc.published += 1;
        if (raw.processingStage === 'FILTERED') acc.filtered += 1;
        if (['SUBMITTED', 'REVIEWING', 'COMPLETED'].includes(raw.processingStage)) acc.withSubmissions += 1;
        return acc;
      },
      {
        total: 0,
        published: 0,
        filtered: 0,
        withSubmissions: 0,
        byStatus: {} as Record<string, number>,
        byProcessingStage: {} as Record<string, number>,
      },
    );

    const repoMap = new Map<
      string,
      {
        repo: string;
        total: number;
        filtered: number;
        published: number;
        withSubmissions: number;
        completed: number;
      }
    >();

    for (const raw of filtered) {
      const repo = raw.repoOwner && raw.repoName ? `${raw.repoOwner}/${raw.repoName}` : 'unknown';
      const current = repoMap.get(repo) ?? {
        repo,
        total: 0,
        filtered: 0,
        published: 0,
        withSubmissions: 0,
        completed: 0,
      };
      current.total += 1;
      if (raw.processingStage === 'FILTERED') current.filtered += 1;
      if (raw.publishedTask) current.published += 1;
      if (['SUBMITTED', 'REVIEWING', 'COMPLETED'].includes(raw.processingStage)) current.withSubmissions += 1;
      if (raw.processingStage === 'COMPLETED') current.completed += 1;
      repoMap.set(repo, current);
    }

    return {
      totals,
      repos: Array.from(repoMap.values()).sort((a, b) => b.total - a.total || a.repo.localeCompare(b.repo)),
    };
  }

  async getGithubPolicy() {
    return this.publishPolicy.getGithubPolicy();
  }

  async updateGithubPolicy(dto: UpdateGithubPolicyDto) {
    return this.publishPolicy.updateGithubPolicy(dto);
  }

  async listRuns(limit = 20) {
    return this.prisma.taskGeneratorRun.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async getRun(id: string) {
    return this.prisma.taskGeneratorRun.findUniqueOrThrow({
      where: { id },
    });
  }
}
