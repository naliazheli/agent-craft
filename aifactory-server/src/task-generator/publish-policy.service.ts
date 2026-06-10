import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface GithubPublishPolicy {
  allowedRepos: string[];
  blockedRepos: string[];
  preferredLanguages: string[];
  blockedLabels: string[];
  blockedKeywords: string[];
  blockedPlatforms: string[];
  blockedBuildHints: string[];
  preferredBuildHints: string[];
  minimumRepoStars: number;
  maximumIssueCommentCount: number;
  maximumDifficultyScore: number;
  maximumIssueCreatedAgeDays: number;
  maximumIssueUpdatedAgeDays: number;
  minimumExecutionSignal: number;
  requireGithubCiOrBuildManifest: boolean;
  fetchSearchWindowDays: number;
  fetchSearchCommentMultiplier: number;
  fetchFallbackPageCount: number;
  publishLimitPerCycle: number;
}

const DEFAULT_GITHUB_PUBLISH_POLICY: GithubPublishPolicy = {
  allowedRepos: ['facebook/react', 'vercel/next.js'],
  blockedRepos: [],
  preferredLanguages: ['JavaScript', 'TypeScript', 'Python', 'Go'],
  blockedLabels: ['Status: Unconfirmed', 'needs triage', 'question'],
  blockedKeywords: ['question', 'needs triage'],
  blockedPlatforms: ['apple silicon', 'darwin-arm64', 'macos only', 'windows only', 'ios', 'android'],
  blockedBuildHints: [],
  preferredBuildHints: ['node', 'npm', 'pnpm', 'yarn', 'python', 'go'],
  minimumRepoStars: 100,
  maximumIssueCommentCount: 10,
  maximumDifficultyScore: 6,
  maximumIssueCreatedAgeDays: 180,
  maximumIssueUpdatedAgeDays: 45,
  minimumExecutionSignal: 4,
  requireGithubCiOrBuildManifest: true,
  fetchSearchWindowDays: 30,
  fetchSearchCommentMultiplier: 2,
  fetchFallbackPageCount: 4,
  publishLimitPerCycle: 5,
};

@Injectable()
export class PublishPolicyService {
  private readonly githubPolicyKey = 'github_publish_policy';

  constructor(private readonly prisma: PrismaService) {}

  private normalizeStringArray(value: unknown, fallback: string[]) {
    return Array.isArray(value)
      ? value.map((item) => String(item).trim()).filter(Boolean)
      : fallback;
  }

  private normalizeNumber(value: unknown, fallback: number) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  async getGithubPolicy(): Promise<GithubPublishPolicy> {
    const config = await this.prisma.systemConfig.findUnique({
      where: { key: this.githubPolicyKey },
    });

    if (!config || typeof config.value !== 'object' || config.value === null || Array.isArray(config.value)) {
      return DEFAULT_GITHUB_PUBLISH_POLICY;
    }

    const raw = config.value as Record<string, unknown>;
    return {
      allowedRepos: this.normalizeStringArray(raw.allowedRepos, DEFAULT_GITHUB_PUBLISH_POLICY.allowedRepos),
      blockedRepos: this.normalizeStringArray(raw.blockedRepos, DEFAULT_GITHUB_PUBLISH_POLICY.blockedRepos),
      preferredLanguages: this.normalizeStringArray(
        raw.preferredLanguages,
        DEFAULT_GITHUB_PUBLISH_POLICY.preferredLanguages,
      ),
      blockedLabels: this.normalizeStringArray(raw.blockedLabels, DEFAULT_GITHUB_PUBLISH_POLICY.blockedLabels),
      blockedKeywords: this.normalizeStringArray(raw.blockedKeywords, DEFAULT_GITHUB_PUBLISH_POLICY.blockedKeywords),
      blockedPlatforms: this.normalizeStringArray(
        raw.blockedPlatforms,
        DEFAULT_GITHUB_PUBLISH_POLICY.blockedPlatforms,
      ),
      blockedBuildHints: this.normalizeStringArray(
        raw.blockedBuildHints,
        DEFAULT_GITHUB_PUBLISH_POLICY.blockedBuildHints,
      ),
      preferredBuildHints: this.normalizeStringArray(
        raw.preferredBuildHints,
        DEFAULT_GITHUB_PUBLISH_POLICY.preferredBuildHints,
      ),
      minimumRepoStars: this.normalizeNumber(
        raw.minimumRepoStars,
        DEFAULT_GITHUB_PUBLISH_POLICY.minimumRepoStars,
      ),
      maximumIssueCommentCount: this.normalizeNumber(
        raw.maximumIssueCommentCount,
        DEFAULT_GITHUB_PUBLISH_POLICY.maximumIssueCommentCount,
      ),
      maximumDifficultyScore: this.normalizeNumber(
        raw.maximumDifficultyScore,
        DEFAULT_GITHUB_PUBLISH_POLICY.maximumDifficultyScore,
      ),
      maximumIssueCreatedAgeDays: this.normalizeNumber(
        raw.maximumIssueCreatedAgeDays,
        DEFAULT_GITHUB_PUBLISH_POLICY.maximumIssueCreatedAgeDays,
      ),
      maximumIssueUpdatedAgeDays: this.normalizeNumber(
        raw.maximumIssueUpdatedAgeDays,
        DEFAULT_GITHUB_PUBLISH_POLICY.maximumIssueUpdatedAgeDays,
      ),
      minimumExecutionSignal: this.normalizeNumber(
        raw.minimumExecutionSignal,
        DEFAULT_GITHUB_PUBLISH_POLICY.minimumExecutionSignal,
      ),
      requireGithubCiOrBuildManifest:
        typeof raw.requireGithubCiOrBuildManifest === 'boolean'
          ? raw.requireGithubCiOrBuildManifest
          : DEFAULT_GITHUB_PUBLISH_POLICY.requireGithubCiOrBuildManifest,
      fetchSearchWindowDays: this.normalizeNumber(
        raw.fetchSearchWindowDays,
        DEFAULT_GITHUB_PUBLISH_POLICY.fetchSearchWindowDays,
      ),
      fetchSearchCommentMultiplier: this.normalizeNumber(
        raw.fetchSearchCommentMultiplier,
        DEFAULT_GITHUB_PUBLISH_POLICY.fetchSearchCommentMultiplier,
      ),
      fetchFallbackPageCount: this.normalizeNumber(
        raw.fetchFallbackPageCount,
        DEFAULT_GITHUB_PUBLISH_POLICY.fetchFallbackPageCount,
      ),
      publishLimitPerCycle: this.normalizeNumber(
        raw.publishLimitPerCycle,
        DEFAULT_GITHUB_PUBLISH_POLICY.publishLimitPerCycle,
      ),
    };
  }

  async updateGithubPolicy(input: Partial<GithubPublishPolicy>) {
    const current = await this.getGithubPolicy();
    const merged: GithubPublishPolicy = {
      ...current,
      ...input,
      allowedRepos: input.allowedRepos ?? current.allowedRepos,
      blockedRepos: input.blockedRepos ?? current.blockedRepos,
      preferredLanguages: input.preferredLanguages ?? current.preferredLanguages,
      blockedLabels: input.blockedLabels ?? current.blockedLabels,
      blockedKeywords: input.blockedKeywords ?? current.blockedKeywords,
      blockedPlatforms: input.blockedPlatforms ?? current.blockedPlatforms,
      blockedBuildHints: input.blockedBuildHints ?? current.blockedBuildHints,
      preferredBuildHints: input.preferredBuildHints ?? current.preferredBuildHints,
    };

    await this.prisma.systemConfig.upsert({
      where: { key: this.githubPolicyKey },
      update: { value: merged as unknown as Prisma.InputJsonValue },
      create: {
        key: this.githubPolicyKey,
        value: merged as unknown as Prisma.InputJsonValue,
      },
    });

    return merged;
  }
}
