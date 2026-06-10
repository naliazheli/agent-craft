import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { PublishPolicyService } from './publish-policy.service';

interface ScoreResult {
  difficultyScore: number;
  valueScore: number;
  estimatedReward: number;
  summary: string;
  tags: string[];
  shouldPublish: boolean;
}

@Injectable()
export class TaskScorerService {
  private readonly logger = new Logger(TaskScorerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly publishPolicy: PublishPolicyService,
  ) {}

  async scorePending(batchSize = 20): Promise<{ scored: number; failed: number }> {
    const pending = await this.prisma.rawTask.findMany({
      where: { status: 'PENDING' },
      take: batchSize,
    });

    let scored = 0;
    let failed = 0;

    for (const raw of pending) {
      const lock = await this.prisma.rawTask.updateMany({
        where: { id: raw.id },
        data: { status: 'SCORING' },
      });
      if (lock.count === 0) {
        continue;
      }

      try {
        const policy = await this.publishPolicy.getGithubPolicy();
        const result = await this.callLlm(raw.title, raw.body ?? '', raw.labels as string[], raw.hasBounty, raw.source);
        const publishDecision =
          raw.source === 'HACKERONE_PROGRAM'
            ? this.computeHackerOnePublishDecision(raw, result)
            : this.computeGithubPublishDecision(raw, result, policy);
        await this.prisma.rawTask.updateMany({
          where: { id: raw.id },
          data: {
            status: 'SCORED',
            difficultyScore: result.difficultyScore,
            valueScore: result.valueScore,
            estimatedReward: result.estimatedReward,
            aiSummary: result.summary,
            aiTags: result.tags,
            shouldPublish: publishDecision.shouldPublish,
            publishPriority: publishDecision.publishPriority,
            publishReasons: publishDecision.publishReasons,
            scoredAt: new Date(),
          },
        });
        scored++;
      } catch (err) {
        this.logger.error(`Failed to score raw task ${raw.id}: ${err.message}`);
        await this.prisma.rawTask.updateMany({ where: { id: raw.id }, data: { status: 'FAILED' } });
        failed++;
      }
    }

    return { scored, failed };
  }

  private hasOnlyBlockedBuildHints(buildHints: string[], blockedBuildHints: string[]) {
    if (!buildHints.length || !blockedBuildHints.length) {
      return false;
    }

    return buildHints.every((hint) => blockedBuildHints.includes(hint));
  }

  private computeGithubPublishDecision(
    raw: {
      title: string;
      body?: string | null;
      labels?: unknown;
      repoPrimaryLanguage?: string | null;
      repoArchived?: boolean | null;
      repoStars?: number | null;
      issueCommentCount?: number | null;
      repoHasGithubCi?: boolean | null;
      repoHasBuildManifest?: boolean | null;
      buildSystemHints?: unknown;
      issueCreatedAt?: Date | null;
      issueUpdatedAt?: Date | null;
      hasBounty?: boolean | null;
    },
    score: ScoreResult,
    policy: Awaited<ReturnType<PublishPolicyService['getGithubPolicy']>>,
  ) {
    const stars = raw.repoStars ?? 0;
    const labels = Array.isArray(raw.labels)
      ? raw.labels.map((label) => String(label).trim()).filter(Boolean)
      : [];
    const normalizedText = [raw.title, raw.body ?? '', ...labels].join(' ').toLowerCase();
    const primaryLanguage = raw.repoPrimaryLanguage?.toLowerCase() ?? '';
    const buildHints = Array.isArray(raw.buildSystemHints)
      ? raw.buildSystemHints.map((hint) => String(hint).toLowerCase()).filter(Boolean)
      : [];
    const blockedBuildHints = policy.blockedBuildHints.map((hint) => hint.toLowerCase());
    const preferredBuildHints = policy.preferredBuildHints.map((hint) => hint.toLowerCase());
    const preferredLanguages = policy.preferredLanguages.map((language) => language.toLowerCase());
    const issueDate = raw.issueUpdatedAt ?? raw.issueCreatedAt;
    const updatedAgeDays = raw.issueUpdatedAt
      ? Math.max(0, Math.floor((Date.now() - new Date(raw.issueUpdatedAt).getTime()) / 86_400_000))
      : null;
    const createdAgeDays = raw.issueCreatedAt
      ? Math.max(0, Math.floor((Date.now() - new Date(raw.issueCreatedAt).getTime()) / 86_400_000))
      : null;
    const ageDays = issueDate
      ? Math.max(0, Math.floor((Date.now() - new Date(issueDate).getTime()) / 86_400_000))
      : null;
    const commentCount = raw.issueCommentCount ?? 0;

    const repoSignal =
      stars >= 50_000 ? 5 :
      stars >= 10_000 ? 4 :
      stars >= 2_000 ? 3 :
      stars >= 500 ? 2 :
      stars >= 100 ? 1 : 0;

    const freshnessSignal =
      ageDays === null ? 1 :
      ageDays <= 30 ? 5 :
      ageDays <= 90 ? 4 :
      ageDays <= 180 ? 3 :
      ageDays <= 365 ? 2 : 0;

    const createdFreshnessSignal =
      createdAgeDays === null ? 1 :
      createdAgeDays <= 30 ? 5 :
      createdAgeDays <= 90 ? 4 :
      createdAgeDays <= 180 ? 3 :
      createdAgeDays <= 365 ? 2 : 0;

    const lowSignalReasons = [
      labels.some((label) => label.toLowerCase().includes('status: unconfirmed')) ? 'unconfirmed_issue' : null,
      labels.some((label) => label.toLowerCase().includes('needs triage')) ? 'needs_triage' : null,
      labels.some((label) => label.toLowerCase().includes('question')) ? 'question_label' : null,
      labels.some((label) =>
        ['feature request', 'suggestion', 'proposal', 'language feature'].some((needle) =>
          label.toLowerCase().includes(needle),
        ),
      ) ||
      normalizedText.includes('feature request') ||
      normalizedText.includes('suggestion') ||
      normalizedText.includes('proposal')
        ? 'feature_request'
        : null,
      raw.title.trim().length < 12 || /^bug:\s*$/i.test(raw.title.trim()) ? 'weak_title' : null,
    ].filter(Boolean) as string[];

    const platformPenalty = policy.blockedPlatforms.some((platform) =>
      normalizedText.includes(platform.toLowerCase()),
    )
      ? 4
      : 0;

    const nativePenalty =
      this.hasOnlyBlockedBuildHints(buildHints, blockedBuildHints) ? 4 :
      buildHints.includes('rust') || primaryLanguage === 'rust' ? 2 :
      primaryLanguage === 'c++' || primaryLanguage === 'c' ? 2 : 0;

    const localValidationBonus =
      /to reproduce|steps to reproduce|npm run build|npm run dev|pnpm build|pnpm dev|next build|next dev/.test(
        normalizedText,
      )
        ? 2
        : 0;

    const remoteOnlyPenalty =
      /vercel \(deployed\)|other \(deployed\)|deployed\)/.test(normalizedText) &&
      !/next build|next dev|npm run build|npm run dev|pnpm build|pnpm dev/.test(normalizedText)
        ? 3
        : 0;

    const heavyInfraPenalty =
      /turbopack|compiler|instrumentation|standalone|docker|cachecomponents|monorepo/.test(normalizedText)
        ? 2
        : 0;

    const preferredLanguageBonus = preferredLanguages.includes(primaryLanguage) ? 1 : 0;
    const preferredBuildHintBonus = buildHints.some((hint) => preferredBuildHints.includes(hint)) ? 1 : 0;

    const executionSignal = Math.max(
      0,
      (raw.repoHasGithubCi ? 3 : 0) +
        (raw.repoHasBuildManifest ? 2 : 0) +
        Math.min(2, buildHints.length) +
        preferredLanguageBonus +
        preferredBuildHintBonus +
        localValidationBonus -
        platformPenalty -
        nativePenalty -
        remoteOnlyPenalty -
        heavyInfraPenalty -
        (score.difficultyScore >= 9 ? 1 : 0),
    );

    const difficultySignal =
      score.difficultyScore <= 3 ? 2 :
      score.difficultyScore <= 6 ? 3 :
      score.difficultyScore <= 8 ? 2 : 1;

    const commentPenalty =
      commentCount >= 20 ? 4 :
      commentCount >= 10 ? 2 : 0;

    const publishPriority =
      score.valueScore * 1.8 +
      repoSignal * 1.5 +
      freshnessSignal * 1.3 +
      createdFreshnessSignal * 1.1 +
      executionSignal * 1.6 +
      difficultySignal * 0.6 +
      (raw.hasBounty ? 1.5 : 0) -
      commentPenalty -
      lowSignalReasons.length * 6;

    const publishReasons = [
      `repo_stars:${stars}`,
      ageDays === null ? 'issue_recency:unknown' : `issue_age_days:${ageDays}`,
      createdAgeDays === null ? 'issue_created_age:unknown' : `issue_created_age_days:${createdAgeDays}`,
      `repo_signal:${repoSignal}`,
      `execution_signal:${executionSignal}`,
      `difficulty:${score.difficultyScore}`,
      `comments:${commentCount}`,
      `preferred_language:${preferredLanguageBonus ? 'yes' : 'no'}`,
      `preferred_build_hint:${preferredBuildHintBonus ? 'yes' : 'no'}`,
      raw.repoHasGithubCi ? 'github_ci:yes' : 'github_ci:no',
      raw.repoHasBuildManifest ? 'build_manifest:yes' : 'build_manifest:no',
      ...(commentPenalty ? [`comment_penalty:${commentPenalty}`] : []),
      ...(platformPenalty ? [`platform_penalty:${platformPenalty}`] : []),
      ...(nativePenalty ? [`native_penalty:${nativePenalty}`] : []),
      ...(remoteOnlyPenalty ? [`remote_only_penalty:${remoteOnlyPenalty}`] : []),
      ...(heavyInfraPenalty ? [`heavy_infra_penalty:${heavyInfraPenalty}`] : []),
      ...(localValidationBonus ? [`local_validation_bonus:${localValidationBonus}`] : []),
      ...lowSignalReasons,
      ...(buildHints.length ? [`build_hints:${buildHints.join('|')}`] : []),
    ];

    const shouldPublish =
      score.shouldPublish &&
      !raw.repoArchived &&
      lowSignalReasons.length === 0 &&
      executionSignal >= policy.minimumExecutionSignal &&
      commentCount <= policy.maximumIssueCommentCount &&
      score.difficultyScore <= policy.maximumDifficultyScore &&
      repoSignal >= 1 &&
      freshnessSignal >= 2 &&
      createdFreshnessSignal >= 3 &&
      stars >= policy.minimumRepoStars &&
      (createdAgeDays === null || createdAgeDays <= policy.maximumIssueCreatedAgeDays) &&
      (updatedAgeDays === null || updatedAgeDays <= policy.maximumIssueUpdatedAgeDays);

    return {
      shouldPublish,
      publishPriority: Number(publishPriority.toFixed(2)),
      publishReasons,
    };
  }

  private computeHackerOnePublishDecision(
    raw: {
      title: string;
      labels?: unknown;
      hasBounty?: boolean | null;
      bountyCurrency?: string | null;
      sourceMetadata?: unknown;
    },
    score: ScoreResult,
  ) {
    const labels = Array.isArray(raw.labels)
      ? raw.labels.map((label) => String(label).trim()).filter(Boolean)
      : [];
    const normalizedLabels = labels.map((label) => label.toLowerCase());
    const hasEligibleBounty =
      Boolean(raw.hasBounty) &&
      normalizedLabels.includes('bounty:eligible') &&
      normalizedLabels.includes('submission:eligible');
    const severity = normalizedLabels.find((label) => label.startsWith('max-severity:'))?.split(':')[1] || 'unknown';
    const metadata = raw.sourceMetadata as any;
    const rewardRange = metadata?.source === 'hackerone' ? metadata.rewards?.scopeRange : null;
    const hasReportContext =
      metadata?.source === 'hackerone' &&
      Array.isArray(metadata.reportTemplate) &&
      metadata.reportTemplate.length >= 4;
    const hasTestingContext =
      metadata?.source === 'hackerone' &&
      (Array.isArray(metadata.testing?.requiredHeaders) ||
        Array.isArray(metadata.testing?.accountGuidance) ||
        Array.isArray(metadata.testing?.safeTestingRules));
    const severitySignal =
      severity === 'critical' ? 5 :
      severity === 'high' ? 4 :
      severity === 'medium' ? 3 :
      severity === 'low' ? 2 : 1;
    const assetType = normalizedLabels.find((label) => label.startsWith('asset:'))?.split(':')[1] || 'unknown';
    const publishPriority =
      score.valueScore * 2 +
      severitySignal * 1.5 +
      (hasEligibleBounty ? 4 : 0) -
      (assetType === 'other' || assetType === 'unknown' ? 1 : 0) +
      (hasReportContext ? 1 : 0) +
      (hasTestingContext ? 1 : 0);

    return {
      shouldPublish: score.shouldPublish && hasEligibleBounty,
      publishPriority: Number(publishPriority.toFixed(2)),
      publishReasons: [
        'source:hackerone',
        `eligible_bounty:${hasEligibleBounty ? 'yes' : 'no'}`,
        `max_severity:${severity}`,
        `asset_type:${assetType}`,
        `currency:${raw.bountyCurrency || 'unknown'}`,
        rewardRange ? `external_reward_range:${rewardRange.minimum ?? 0}-${rewardRange.maximum ?? 0}` : 'external_reward_range:unknown',
        `report_context:${hasReportContext ? 'yes' : 'no'}`,
        `testing_context:${hasTestingContext ? 'yes' : 'no'}`,
        `difficulty:${score.difficultyScore}`,
        `value:${score.valueScore}`,
      ],
    };
  }

  private heuristicScore(title: string, body: string, labels: string[], hasBounty: boolean): ScoreResult {
    const labelStr = labels.join(' ').toLowerCase();
    const titleLower = title.toLowerCase();
    const normalizedText = `${titleLower}\n${body.toLowerCase()}\n${labelStr}`;
    const bodyLen = body?.length ?? 0;

    const isHackerOne = labelStr.includes('hackerone') || labelStr.includes('security-research');
    const isBug = labelStr.includes('bug') || titleLower.includes('bug') || titleLower.includes('fix');
    const isFeature = labelStr.includes('feature') || labelStr.includes('enhancement') || titleLower.includes('feat');
    const isDoc = labelStr.includes('doc') || titleLower.includes('doc');
    const isGood1st = labelStr.includes('good first issue') || labelStr.includes('beginner');
    const isHeavyInfra =
      /turbopack|compiler|rust|docker|standalone|middleware|instrumentation|cachecomponents|monorepo/.test(
        normalizedText,
      );
    const hasLocalValidationPath =
      /to reproduce|steps to reproduce|npm run build|npm run dev|pnpm build|pnpm dev|next build|next dev/.test(
        normalizedText,
      );
    const isRemoteOnly =
      /vercel \(deployed\)|other \(deployed\)|deployed\)/.test(normalizedText) && !hasLocalValidationPath;

    let difficulty = 5;
    if (isHackerOne) difficulty = labelStr.includes('max-severity:critical') || labelStr.includes('max-severity:high') ? 7 : 5;
    else if (isGood1st) difficulty = 2;
    else if (isDoc) difficulty = 2;
    else if (isBug && bodyLen > 500) difficulty = 6;
    else if (isFeature) difficulty = 7;
    if (isHeavyInfra) difficulty += 2;
    if (isRemoteOnly) difficulty += 1;

    let value = 5;
    if (isHackerOne && hasBounty) value = 8;
    else if (hasBounty) value = 9;
    else if (isFeature) value = 7;
    else if (isBug) value = 6;
    else if (isDoc) value = 3;
    if (isRemoteOnly) value -= 1;

    difficulty = Math.min(10, Math.max(1, difficulty));
    value = Math.min(10, Math.max(1, value));

    const reward = Math.round(5 + (difficulty + value) * 3);

    return {
      difficultyScore: difficulty,
      valueScore: value,
      estimatedReward: Math.min(100, Math.max(5, reward)),
      summary: `${isHackerOne ? 'HackerOne Scope' : 'GitHub Issue'}: ${title.slice(0, 100)}`,
      tags: labels.slice(0, 5),
      shouldPublish: isHackerOne ? hasBounty : value >= 4 && difficulty >= 2,
    };
  }

  private async callLlm(
    title: string,
    body: string,
    labels: string[],
    hasBounty: boolean,
    source = 'GITHUB_ISSUE',
  ): Promise<ScoreResult> {
    const apiUrl = this.config.get<string>('LLM_API_URL');
    const apiKey = this.config.get<string>('LLM_API_KEY');
    const model = this.config.get<string>('LLM_MODEL') || 'gpt-4o-mini';

    if (!apiUrl || !apiKey) {
      this.logger.warn('LLM not configured, using heuristic scoring');
      return this.heuristicScore(title, body, labels, hasBounty);
    }

    const isHackerOne = source === 'HACKERONE_PROGRAM';
    const prompt = isHackerOne
      ? `You are evaluating whether a HackerOne bounty scope is a good fit for an autonomous security research agent.

Prioritize scopes that are:
- explicitly eligible for bounty and submission
- narrow enough for authorized security research
- likely to produce a concrete vulnerability report with reproduction steps, impact, and remediation guidance

Penalize scopes that are vague, informational only, or hard to test safely.

Return JSON only with this exact shape:
{
  "difficultyScore": <integer 1-10>,
  "valueScore": <integer 1-10>,
  "estimatedReward": <integer 5-100>,
  "summary": "<short Chinese summary, 2-3 sentences>",
  "tags": ["tag1", "tag2"],
  "shouldPublish": <true or false>
}

Title: ${title}
Body: ${body ? body.slice(0, 4000) : '(no description)'}
Labels: ${labels.join(', ') || '(none)'}
Has bounty: ${hasBounty ? 'yes' : 'no'}`
      : `You are evaluating whether a GitHub issue is a good fit for an autonomous coding agent.

Prioritize issues that are:
- reproducible locally
- likely solvable with a concrete code change
- verifiable with local build, test, or dev commands

Penalize issues that are mainly:
- design discussions or feature proposals
- remote-only or deployed-only failures
- compiler, bundler, Docker, middleware, or Rust-heavy investigations unless there is a very clear local reproduction path

Return JSON only with this exact shape:
{
  "difficultyScore": <integer 1-10>,
  "valueScore": <integer 1-10>,
  "estimatedReward": <integer 5-100>,
  "summary": "<short Chinese summary, 2-3 sentences>",
  "tags": ["tag1", "tag2"],
  "shouldPublish": <true or false>
}

Title: ${title}
Body: ${body ? body.slice(0, 4000) : '(no description)'}
Labels: ${labels.join(', ') || '(none)'}
Has bounty: ${hasBounty ? 'yes' : 'no'}`;

    const url = `${apiUrl.replace(/\/+$/, '')}/chat/completions`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 512,
          temperature: 0.3,
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`LLM API error (${res.status}): ${err}`);
      }

      const data = await res.json();
      const content: string = data.choices?.[0]?.message?.content || '';

      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error(`LLM returned non-JSON: ${content}`);

      const parsed: ScoreResult = JSON.parse(jsonMatch[0]);
      parsed.difficultyScore = Math.min(10, Math.max(1, Number(parsed.difficultyScore) || 5));
      parsed.valueScore = Math.min(10, Math.max(1, Number(parsed.valueScore) || 5));
      parsed.estimatedReward = Math.min(100, Math.max(5, Number(parsed.estimatedReward) || 10));
      parsed.tags = Array.isArray(parsed.tags) ? parsed.tags : [];
      parsed.shouldPublish = Boolean(parsed.shouldPublish);
      return parsed;
    } catch (error) {
      this.logger.warn(`LLM scoring failed, falling back to heuristics: ${(error as Error).message}`);
      return this.heuristicScore(title, body, labels, hasBounty);
    }
  }
}
