import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PublishPolicyService } from './publish-policy.service';

const BOUNTY_LABEL_KEYWORDS = ['bounty', 'reward', 'paid', 'sponsor', 'prize', 'funded'];

interface GithubIssue {
  number: number;
  html_url: string;
  title: string;
  body: string | null;
  state?: string;
  created_at?: string;
  updated_at?: string;
  comments?: number;
  labels: Array<{ name: string }>;
  user: { login: string } | null;
  pull_request?: unknown;
}

interface GithubRepo {
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  language: string | null;
  archived: boolean;
  default_branch: string;
  pushed_at: string | null;
}

interface RepoBuildSignals {
  hasGithubCi: boolean;
  hasBuildManifest: boolean;
  buildSystemHints: string[];
}

interface FetchLevelAssessment {
  shouldSkip: boolean;
  reasons: string[];
}

interface FetchCandidateIssue extends GithubIssue {
  _fetchPriority: number;
}

interface ExistingRawTaskSnapshot {
  id: string;
  status: string;
  title: string;
  body: string | null;
  labels: unknown;
  shouldPublish: boolean | null;
  publishReasons: unknown;
  externalUrl: string;
  repoOwner: string | null;
  repoName: string | null;
  issueUpdatedAt: Date | null;
  issueCommentCount: number | null;
  repoStars: number | null;
  repoForks: number | null;
  repoOpenIssues: number | null;
  repoPrimaryLanguage: string | null;
  repoArchived: boolean | null;
  repoDefaultBranch: string | null;
  repoPushedAt: Date | null;
  repoHasGithubCi: boolean | null;
  repoHasBuildManifest: boolean | null;
  buildSystemHints: unknown;
  publishedTaskId: string | null;
}

const BUILD_MANIFEST_HINTS: Record<string, string> = {
  'package.json': 'node',
  'pnpm-lock.yaml': 'pnpm',
  'yarn.lock': 'yarn',
  'package-lock.json': 'npm',
  'bun.lockb': 'bun',
  'pyproject.toml': 'python',
  'requirements.txt': 'python',
  'poetry.lock': 'poetry',
  'Cargo.toml': 'rust',
  'go.mod': 'go',
  'pom.xml': 'maven',
  'build.gradle': 'gradle',
  'build.gradle.kts': 'gradle',
  'Makefile': 'make',
  'justfile': 'just',
};

@Injectable()
export class GithubFetcherService {
  private readonly logger = new Logger(GithubFetcherService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly publishPolicy: PublishPolicyService,
  ) {}

  async fetchAndStore(repos: string[], limit: number): Promise<{ fetched: number; skipped: number }> {
    const token = this.config.get<string>('GITHUB_TOKEN');
    const policy = await this.publishPolicy.getGithubPolicy();
    let fetched = 0;
    let skipped = 0;

    for (const repo of repos) {
      if (policy.blockedRepos.includes(repo)) {
        this.logger.log(`Skipping blocked repo ${repo}`);
        continue;
      }

      const [owner, name] = repo.trim().split('/');
      if (!owner || !name) {
        this.logger.warn(`Invalid repo format: ${repo}`);
        continue;
      }

      try {
        const [repoMeta, buildSignals] = await Promise.all([
          this.fetchRepoMetadata(owner, name, token),
          this.fetchRepoBuildSignals(owner, name, token),
        ]);
        const issues = await this.fetchIssues(owner, name, limit, token, policy);
        await this.reconcileClosedIssues(owner, name, issues.map((issue) => String(issue.number)));
        for (const issue of issues) {
          const result = await this.upsertRawTask(owner, name, issue, repoMeta, buildSignals, policy);
          if (result === 'created' || result === 'updated') fetched++;
          else skipped++;
        }
      } catch (err) {
        this.logger.error(`Failed to fetch issues for ${repo}: ${err.message}`);
      }
    }

    return { fetched, skipped };
  }

  private normalizeIssueText(title: string, body: string | null, labels: string[]) {
    return [title, body ?? '', ...labels].join(' ').toLowerCase();
  }

  private normalizeStringArray(value: unknown) {
    return Array.isArray(value)
      ? value.map((item) => String(item).trim()).filter(Boolean)
      : [];
  }

  private sameStringArray(left: string[], right: string[]) {
    if (left.length !== right.length) {
      return false;
    }

    return left.every((value, index) => value === right[index]);
  }

  private sameDate(left?: Date | null, right?: Date | null) {
    if (!left && !right) {
      return true;
    }

    if (!left || !right) {
      return false;
    }

    return left.getTime() === right.getTime();
  }

  private shouldReuseExistingRawTask(
    existing: ExistingRawTaskSnapshot,
    issue: GithubIssue,
    labelNames: string[],
    repoMeta: GithubRepo,
    buildSignals: RepoBuildSignals,
    fetchAssessment: FetchLevelAssessment,
  ) {
    const nextIssueUpdatedAt = issue.updated_at ? new Date(issue.updated_at) : null;
    const nextRepoPushedAt = repoMeta.pushed_at ? new Date(repoMeta.pushed_at) : null;
    const currentReasons = this.normalizeStringArray(existing.publishReasons);

    const unchanged =
      existing.externalUrl === issue.html_url &&
      existing.title === issue.title &&
      (existing.body ?? null) === (issue.body ?? null) &&
      this.sameStringArray(this.normalizeStringArray(existing.labels), labelNames) &&
      this.sameDate(existing.issueUpdatedAt, nextIssueUpdatedAt) &&
      existing.issueCommentCount === (issue.comments ?? 0) &&
      existing.repoStars === repoMeta.stargazers_count &&
      existing.repoForks === repoMeta.forks_count &&
      existing.repoOpenIssues === repoMeta.open_issues_count &&
      (existing.repoPrimaryLanguage ?? null) === (repoMeta.language ?? null) &&
      Boolean(existing.repoArchived) === repoMeta.archived &&
      (existing.repoDefaultBranch ?? null) === repoMeta.default_branch &&
      this.sameDate(existing.repoPushedAt, nextRepoPushedAt) &&
      Boolean(existing.repoHasGithubCi) === buildSignals.hasGithubCi &&
      Boolean(existing.repoHasBuildManifest) === buildSignals.hasBuildManifest &&
      this.sameStringArray(this.normalizeStringArray(existing.buildSystemHints), buildSignals.buildSystemHints);

    if (!unchanged) {
      return false;
    }

    if (fetchAssessment.shouldSkip) {
      return (
        existing.status === 'SKIPPED' &&
        existing.shouldPublish === false &&
        this.sameStringArray(currentReasons, fetchAssessment.reasons)
      );
    }

    return ['PENDING', 'SCORING', 'SCORED', 'PUBLISHED', 'FAILED'].includes(existing.status);
  }

  private hasOnlyBlockedBuildHints(buildHints: string[], blockedBuildHints: string[]) {
    if (!buildHints.length || !blockedBuildHints.length) {
      return false;
    }

    return buildHints.every((hint) => blockedBuildHints.includes(hint));
  }

  private hasLocalValidationPath(normalized: string) {
    return /to reproduce|steps to reproduce|npm run build|npm run dev|pnpm build|pnpm dev|next build|next dev/.test(
      normalized,
    );
  }

  private isHeavyInfraIssue(normalized: string) {
    return /turbopack|compiler|instrumentation|standalone|docker|cachecomponents|monorepo/.test(normalized);
  }

  private assessFetchLevelIssue(
    issue: GithubIssue,
    buildSignals: RepoBuildSignals,
    policy: Awaited<ReturnType<PublishPolicyService['getGithubPolicy']>>,
  ): FetchLevelAssessment {
    const labels = issue.labels.map((label) => label.name);
    const normalized = this.normalizeIssueText(issue.title, issue.body, labels);
    const normalizedBuildHints = buildSignals.buildSystemHints.map((hint) => hint.toLowerCase());
    const blockedBuildHints = policy.blockedBuildHints.map((hint) => hint.toLowerCase());
    const reasons: string[] = [];

    if (
      policy.blockedLabels.some((label) => labels.some((issueLabel) => issueLabel.toLowerCase() === label.toLowerCase())) ||
      policy.blockedKeywords.some((keyword) => normalized.includes(keyword.toLowerCase()))
    ) {
      reasons.push('low_signal_labels');
    }

    if (
      labels.some((label) =>
        ['feature request', 'suggestion', 'proposal', 'language feature'].includes(label.toLowerCase()),
      ) ||
      normalized.includes('feature request') ||
      normalized.includes('suggestion') ||
      normalized.includes('proposal')
    ) {
      reasons.push('feature_request');
    }

    if (issue.title.trim().length < 12 || /^bug:\s*$/i.test(issue.title.trim())) {
      reasons.push('low_signal_title');
    }

    if (policy.blockedPlatforms.some((platform) => normalized.includes(platform.toLowerCase()))) {
      reasons.push('platform_specific_environment');
    }

    if (
      /vercel \(deployed\)|other \(deployed\)|deployed\)/.test(normalized) &&
      !this.hasLocalValidationPath(normalized)
    ) {
      reasons.push('remote_only_validation');
    }

    if (this.hasOnlyBlockedBuildHints(normalizedBuildHints, blockedBuildHints)) {
      reasons.push('blocked_build_hint');
    }

    if (
      policy.requireGithubCiOrBuildManifest &&
      !buildSignals.hasGithubCi &&
      !buildSignals.hasBuildManifest
    ) {
      reasons.push('missing_validation_path');
    }

    return {
      shouldSkip: reasons.length > 0,
      reasons,
    };
  }

  private async cancelPublishedTaskIfUnclaimed(rawTask: {
    publishedTask?: { id: string; status: string; submissions: Array<{ id: string }> } | null;
  }) {
    if (
      rawTask.publishedTask &&
      ['OPEN', 'REVIEWING'].includes(rawTask.publishedTask.status) &&
      rawTask.publishedTask.submissions.length === 0
    ) {
      await this.prisma.task.update({
        where: { id: rawTask.publishedTask.id },
        data: { status: 'CANCELLED' },
      });
    }
  }

  private async reconcileClosedIssues(owner: string, repo: string, openIssueIds: string[]) {
    const staleRawTasks = await this.prisma.rawTask.findMany({
      where: {
        source: 'GITHUB_ISSUE',
        repoOwner: owner,
        repoName: repo,
        externalId: { notIn: openIssueIds.length ? openIssueIds : ['__no_open_issues__'] },
        status: { in: ['PENDING', 'SCORING', 'SCORED', 'PUBLISHED'] },
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

    for (const rawTask of staleRawTasks) {
      await this.prisma.rawTask.update({
        where: { id: rawTask.id },
        data: {
          status: 'SKIPPED',
          shouldPublish: false,
        },
      });

      await this.cancelPublishedTaskIfUnclaimed(rawTask);
    }
  }

  private scoreIssueForFetch(issue: GithubIssue) {
    const labels = issue.labels.map((label) => label.name.toLowerCase());
    const body = (issue.body ?? '').toLowerCase();
    const title = issue.title.toLowerCase();
    const normalized = `${title}\n${body}\n${labels.join(' ')}`;
    const commentCount = issue.comments ?? 0;
    const updatedAt = issue.updated_at ? new Date(issue.updated_at).getTime() : 0;
    const recencyDays = updatedAt ? Math.max(0, Math.floor((Date.now() - updatedAt) / 86_400_000)) : 365;
    const hasReproSignal =
      body.includes('to reproduce') ||
      body.includes('reproduction') ||
      body.includes('steps') ||
      body.includes('current vs. expected behavior') ||
      body.includes('expected behavior');
    const bugSignal =
      labels.some((label) => label.includes('bug') || label.includes('regression')) ||
      title.includes('bug') ||
      title.includes('regression') ||
      title.includes('error');
    const lowSignalPenalty =
      labels.some((label) => label.includes('question') || label.includes('feature')) ||
      title.includes('question') ||
      title.includes('feature request')
        ? 4
        : 0;
    const localValidationBonus = this.hasLocalValidationPath(normalized) ? 4 : 0;
    const reproRepoBonus = /github\.com\/[^/\s]+\/[^/\s]+/.test(body) ? 3 : 0;
    const heavyInfraPenalty = this.isHeavyInfraIssue(normalized) ? 5 : 0;
    const remoteOnlyPenalty =
      /vercel \(deployed\)|other \(deployed\)|deployed\)/.test(normalized) && !this.hasLocalValidationPath(normalized)
        ? 6
        : 0;

    return (
      (hasReproSignal ? 8 : 0) +
      (bugSignal ? 4 : 0) +
      localValidationBonus +
      reproRepoBonus +
      Math.max(0, 6 - Math.min(commentCount, 6)) +
      Math.max(0, 4 - Math.min(recencyDays, 4)) -
      heavyInfraPenalty -
      remoteOnlyPenalty -
      lowSignalPenalty
    );
  }

  private async fetchIssues(
    owner: string,
    repo: string,
    limit: number,
    token: string | undefined,
    policy: Awaited<ReturnType<PublishPolicyService['getGithubPolicy']>>,
  ): Promise<GithubIssue[]> {
    const searchCutoff = new Date(
      Date.now() - Math.max(1, policy.fetchSearchWindowDays) * 86_400_000,
    )
      .toISOString()
      .slice(0, 10);
    const searchCommentCeiling = Math.max(
      3,
      policy.maximumIssueCommentCount * Math.max(1, policy.fetchSearchCommentMultiplier),
    );
    const searchQuery = encodeURIComponent(
      `repo:${owner}/${repo} is:issue is:open comments:<=${searchCommentCeiling} updated:>=${searchCutoff}`,
    );
    const searchUrl = `https://api.github.com/search/issues?q=${searchQuery}&sort=updated&order=desc&per_page=${Math.min(30, Math.max(limit * 2, 10))}`;

    this.logger.log(`Fetching ${searchUrl}`);
    const searchData = await this.fetchGithubJson<{ items: GithubIssue[] }>(searchUrl, token);
    const searchIssues = searchData.items.filter((issue) => !issue.pull_request);
    if (searchIssues.length > 0) {
      return searchIssues
        .map((issue) => ({ ...issue, _fetchPriority: this.scoreIssueForFetch(issue) }))
        .sort((left, right) => right._fetchPriority - left._fetchPriority)
        .slice(0, limit)
        .map(({ _fetchPriority, ...issue }) => issue);
    }

    const perPage = Math.min(30, Math.max(limit, 10));
    const maxPages = Math.min(
      Math.max(1, policy.fetchFallbackPageCount),
      Math.max(1, Math.ceil((limit * 3) / perPage)),
    );
    const collected = new Map<number, FetchCandidateIssue>();

    for (let page = 1; page <= maxPages; page++) {
      const url = `https://api.github.com/repos/${owner}/${repo}/issues?state=open&sort=updated&direction=desc&per_page=${perPage}&page=${page}`;
      this.logger.log(`Fetching ${url}`);
      const data = await this.fetchGithubJson<GithubIssue[]>(url, token);
      const issues = data.filter((issue) => !issue.pull_request);

      for (const issue of issues) {
        collected.set(issue.number, {
          ...issue,
          _fetchPriority: this.scoreIssueForFetch(issue),
        });
      }

      if (issues.length < perPage) {
        break;
      }
    }

    return Array.from(collected.values())
      .sort((left, right) => {
        if (right._fetchPriority !== left._fetchPriority) {
          return right._fetchPriority - left._fetchPriority;
        }

        const leftComments = left.comments ?? 0;
        const rightComments = right.comments ?? 0;
        if (leftComments !== rightComments) {
          return leftComments - rightComments;
        }

        return new Date(right.updated_at ?? 0).getTime() - new Date(left.updated_at ?? 0).getTime();
      })
      .slice(0, limit)
      .map(({ _fetchPriority, ...issue }) => issue);
  }

  async isIssueOpen(owner: string, repo: string, issueNumber: number): Promise<boolean> {
    const issue = await this.fetchIssue(owner, repo, issueNumber);
    return !issue.pull_request && issue.state === 'open';
  }

  private async fetchIssue(owner: string, repo: string, issueNumber: number): Promise<GithubIssue> {
    const token = this.config.get<string>('GITHUB_TOKEN');
    const url = `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`;
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(url, { headers });
    if (res.status === 404) {
      throw new Error('GitHub issue not found');
    }
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`GitHub API ${res.status}: ${body}`);
    }

    return res.json();
  }

  private async upsertRawTask(
    owner: string,
    repo: string,
    issue: GithubIssue,
    repoMeta: GithubRepo,
    buildSignals: RepoBuildSignals,
    policy: Awaited<ReturnType<PublishPolicyService['getGithubPolicy']>>,
  ): Promise<'created' | 'updated' | 'skipped'> {
    const externalId = String(issue.number);
    const existing = await this.prisma.rawTask.findUnique({
      where: { source_externalId: { source: 'GITHUB_ISSUE', externalId } },
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

    const labelNames: string[] = issue.labels.map((l) => l.name);
    const hasBounty = labelNames.some((l) =>
      BOUNTY_LABEL_KEYWORDS.some((kw) => l.toLowerCase().includes(kw)),
    );
    const fetchAssessment = this.assessFetchLevelIssue(issue, buildSignals, policy);

    if ((repoMeta.stargazers_count ?? 0) < policy.minimumRepoStars) {
      fetchAssessment.shouldSkip = true;
      fetchAssessment.reasons.push('below_minimum_repo_stars');
    }

    const commonData = {
      externalUrl: issue.html_url,
      repoOwner: owner,
      repoName: repo,
      title: issue.title,
      body: issue.body ?? null,
      labels: labelNames,
      externalCreator: issue.user?.login ?? null,
      hasBounty,
      issueCreatedAt: issue.created_at ? new Date(issue.created_at) : null,
      issueUpdatedAt: issue.updated_at ? new Date(issue.updated_at) : null,
      issueCommentCount: issue.comments ?? 0,
      repoStars: repoMeta.stargazers_count,
      repoForks: repoMeta.forks_count,
      repoOpenIssues: repoMeta.open_issues_count,
      repoPrimaryLanguage: repoMeta.language,
      repoArchived: repoMeta.archived,
      repoDefaultBranch: repoMeta.default_branch,
      repoPushedAt: repoMeta.pushed_at ? new Date(repoMeta.pushed_at) : null,
      repoHasGithubCi: buildSignals.hasGithubCi,
      repoHasBuildManifest: buildSignals.hasBuildManifest,
      buildSystemHints: buildSignals.buildSystemHints,
      fetchedAt: new Date(),
    };

    if (
      existing &&
      this.shouldReuseExistingRawTask(existing, issue, labelNames, repoMeta, buildSignals, fetchAssessment)
    ) {
      return 'skipped';
    }

    if (!existing) {
      await this.prisma.rawTask.create({
        data: {
          source: 'GITHUB_ISSUE',
          externalId,
          status: fetchAssessment.shouldSkip ? 'SKIPPED' : 'PENDING',
          shouldPublish: fetchAssessment.shouldSkip ? false : null,
          publishPriority: fetchAssessment.shouldSkip ? 0 : null,
          publishReasons: fetchAssessment.shouldSkip ? fetchAssessment.reasons : Prisma.JsonNull,
          ...commonData,
        },
      });
      return fetchAssessment.shouldSkip ? 'skipped' : 'created';
    }

    if (fetchAssessment.shouldSkip) {
      await this.prisma.rawTask.update({
        where: { id: existing.id },
        data: {
          ...commonData,
          status: 'SKIPPED',
          shouldPublish: false,
          publishPriority: 0,
          publishReasons: fetchAssessment.reasons,
        },
      });
      await this.cancelPublishedTaskIfUnclaimed(existing);
      return 'skipped';
    }

    await this.prisma.rawTask.update({
      where: { id: existing.id },
      data: {
        ...commonData,
        ...(existing.publishedTaskId
          ? {}
          : {
              status: 'PENDING',
              difficultyScore: null,
              valueScore: null,
              estimatedReward: null,
              aiSummary: null,
              aiTags: [],
              shouldPublish: null,
              publishPriority: null,
              publishReasons: Prisma.JsonNull,
              scoredAt: null,
            }),
      },
    });

    return 'updated';
  }

  private async fetchRepoMetadata(owner: string, repo: string, token?: string): Promise<GithubRepo> {
    const url = `https://api.github.com/repos/${owner}/${repo}`;
    return this.fetchGithubJson<GithubRepo>(url, token);
  }

  private async fetchRepoBuildSignals(
    owner: string,
    repo: string,
    token?: string,
  ): Promise<RepoBuildSignals> {
    const rootContents = await this.fetchContents(owner, repo, '', token);
    const rootNames = new Set(rootContents.map((entry) => entry.name));
    const buildSystemHints = Array.from(
      new Set(
        Object.entries(BUILD_MANIFEST_HINTS)
          .filter(([fileName]) => rootNames.has(fileName))
          .map(([, hint]) => hint),
      ),
    );

    const workflowFiles = await this.fetchContents(owner, repo, '.github/workflows', token, true);

    return {
      hasGithubCi: workflowFiles.length > 0,
      hasBuildManifest: buildSystemHints.length > 0,
      buildSystemHints,
    };
  }

  private async fetchContents(
    owner: string,
    repo: string,
    path: string,
    token?: string,
    tolerateMissing = false,
  ): Promise<Array<{ name: string; type: string }>> {
    const normalizedPath = path ? `/${path}` : '';
    const url = `https://api.github.com/repos/${owner}/${repo}/contents${normalizedPath}`;
    try {
      const data = await this.fetchGithubJson<Array<{ name: string; type: string }> | { name: string; type: string }>(
        url,
        token,
      );
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      if (tolerateMissing && String((error as Error).message).includes('404')) {
        return [];
      }
      throw error;
    }
  }

  private async fetchGithubJson<T>(url: string, token?: string): Promise<T> {
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(url, { headers });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`GitHub API ${res.status}: ${body}`);
    }

    return res.json();
  }
}
