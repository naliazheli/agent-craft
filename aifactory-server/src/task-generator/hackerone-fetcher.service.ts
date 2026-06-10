import { createHash } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type HackerOneResource<TAttributes> = {
  id?: string;
  type?: string;
  attributes?: TAttributes;
};

type HackerOneListResponse<TAttributes> = {
  data?: Array<HackerOneResource<TAttributes>>;
  links?: {
    next?: string | null;
  };
};

type HackerOneSingleResponse<TAttributes> = {
  data?: HackerOneResource<TAttributes>;
};

type HackerOneSingleOrBareResponse<TAttributes> =
  | HackerOneSingleResponse<TAttributes>
  | HackerOneResource<TAttributes>;

type HackerOneProgramAttributes = {
  handle?: string;
  name?: string;
  url?: string;
  website?: string;
  state?: string;
  submission_state?: string;
  offers_bounties?: boolean;
  currency?: string;
  policy?: string;
  started_accepting_at?: string;
  updated_at?: string;
};

type HackerOneScopeAttributes = {
  asset_identifier?: string;
  asset_type?: string;
  eligible_for_bounty?: boolean;
  eligible_for_submission?: boolean;
  instruction?: string;
  max_severity?: string;
  created_at?: string;
  updated_at?: string;
};

type ExistingHackerOneRawTask = {
  id: string;
  title: string;
  body: string | null;
  labels: unknown;
  sourceMetadata: unknown;
  hasBounty: boolean;
  bountyAmount: number | null;
  bountyCurrency: string | null;
  issueCreatedAt: Date | null;
  issueUpdatedAt: Date | null;
  publishedTaskId: string | null;
};

type HackerOneRewardRange = {
  severity: string;
  label: string;
  minimum: number | null;
  maximum: number | null;
  currency: string | null;
  rawAmount: string;
  averageBounty?: number | null;
  reportCount?: number | null;
};

type HackerOnePublicBountyRow = {
  id?: string;
  name?: string | null;
  description?: string | null;
  use_range?: boolean | null;
  low?: number | null;
  medium?: number | null;
  high?: number | null;
  critical?: number | null;
  low_minimum?: number | null;
  medium_minimum?: number | null;
  high_minimum?: number | null;
  critical_minimum?: number | null;
  structured_scope?: {
    id?: string;
    asset_identifier?: string | null;
  } | null;
  updated_at?: string | null;
};

type HackerOnePublicScopeDocument = {
  id?: string;
  identifier?: string | null;
  display_name?: string | null;
  instruction?: string | null;
  cvss_score?: string | null;
  eligible_for_bounty?: boolean | null;
  eligible_for_submission?: boolean | null;
  asm_system_tags?: string[] | null;
  created_at?: string | null;
  updated_at?: string | null;
  total_resolved_reports?: number | null;
  attachments?: Array<{
    id?: string;
    file_name?: string | null;
    file_size?: number | null;
    content_type?: string | null;
    expiring_url?: string | null;
  }> | null;
};

type HackerOnePublicProfile = {
  currency: string | null;
  program: {
    website: string | null;
    state: string | null;
    type: string | null;
    launchedAt: string | null;
    triageActive: boolean;
    allowsBountySplitting: boolean;
    publiclyVisibleRetesting: boolean;
    responseEfficiencyPercentage: number | null;
    responseEfficiencyIndicator: string | null;
    resolvedReportCount: number | null;
    assetsInScope: number | null;
    scopeDescription: string | null;
    scopeLastUpdatedAt: string | null;
    policyLastChangedAt: string | null;
    highlights: {
      fastPayment: boolean;
      goldStandardSafeHarbor: boolean;
      aiSafeHarbor: boolean;
      topResponseEfficiency: boolean;
      managedByHackerOne: boolean;
      collaborationEnabled: boolean;
      includesRetesting: boolean;
    };
    responseTimes: {
      firstResponseHours: number | null;
      triageHours: number | null;
      bountyHours: number | null;
      resolutionHours: number | null;
    };
  };
  bountyTable: {
    id?: string;
    updatedAt: string | null;
    description: string | null;
    useRange: boolean | null;
    lowLabel: string | null;
    mediumLabel: string | null;
    highLabel: string | null;
    criticalLabel: string | null;
    rows: HackerOnePublicBountyRow[];
  } | null;
  metrics: {
    averageBountyPerSeverityLow?: number | null;
    averageBountyPerSeverityMedium?: number | null;
    averageBountyPerSeverityHigh?: number | null;
    averageBountyPerSeverityCritical?: number | null;
    reportCountPerSeverityLow?: number | null;
    reportCountPerSeverityMedium?: number | null;
    reportCountPerSeverityHigh?: number | null;
    reportCountPerSeverityCritical?: number | null;
  } | null;
  scopeExclusions: Array<{
    id?: string | null;
    category: string;
    details: string;
    createdAt?: string | null;
  }>;
  platformStandardsExclusions: Array<{
    id?: string | null;
    standard: string;
    justification: string;
  }>;
  safeHarbor: {
    goldStandard: boolean;
    ai: boolean;
  };
  scopes: HackerOnePublicScopeDocument[];
};

type HackerOneSourceMetadata = {
  source: 'hackerone';
  program: {
    handle: string;
    name: string;
    url: string;
    website: string | null;
    state: string | null;
    type: string | null;
    launchedAt: string | null;
    submissionState: string | null;
    offersBounties: boolean;
    currency: string | null;
    triageActive: boolean;
    allowsBountySplitting: boolean;
    publiclyVisibleRetesting: boolean;
    responseEfficiencyPercentage: number | null;
    responseEfficiencyIndicator: string | null;
    resolvedReportCount: number | null;
    assetsInScope: number | null;
    highlights: HackerOnePublicProfile['program']['highlights'];
    responseTimes: HackerOnePublicProfile['program']['responseTimes'];
  };
  scope: {
    id: string;
    publicId: string | null;
    assetIdentifier: string;
    displayName: string | null;
    assetType: string;
    eligibleForBounty: boolean;
    eligibleForSubmission: boolean;
    instruction: string | null;
    maxSeverity: string;
    cvssScore: string | null;
    asmSystemTags: string[];
    totalResolvedReports: number | null;
    attachments: NonNullable<HackerOnePublicScopeDocument['attachments']>;
    createdAt: string | null;
    updatedAt: string | null;
  };
  rewards: {
    currency: string | null;
    table: HackerOneRewardRange[];
    scopeRange: HackerOneRewardRange | null;
    bountyTable: HackerOnePublicProfile['bountyTable'];
    metrics: HackerOnePublicProfile['metrics'];
  };
  testing: {
    requiredHeaders: Array<{ name: string; value: string }>;
    accountGuidance: string[];
    programRules: string[];
    prohibitedActions: string[];
    safeTestingRules: string[];
    duplicatePolicy: string[];
  };
  reportTemplate: string[];
  policy: {
    excerpt: string | null;
    sections: Record<string, string>;
    scopeDescription: string | null;
    scopeLastUpdatedAt: string | null;
    lastChangedAt: string | null;
    safeHarbor: HackerOnePublicProfile['safeHarbor'];
    scopeExclusions: HackerOnePublicProfile['scopeExclusions'];
    platformStandardsExclusions: HackerOnePublicProfile['platformStandardsExclusions'];
  };
  scopeSummary?: {
    totalEligibleScopes: number;
    assetTypes: Array<{ assetType: string; count: number }>;
    maxSeverity: string;
    topRewardRange: HackerOneRewardRange | null;
  };
  scopeCatalog?: Array<{
    scope: HackerOneSourceMetadata['scope'];
    rewardRange: HackerOneRewardRange | null;
    rewardTable: HackerOneRewardRange[];
  }>;
};

type HackerOneScopeTask = {
  externalId: string;
  externalUrl: string;
  programHandle: string;
  programName: string;
  title: string;
  body: string;
  labels: string[];
  hasBounty: boolean;
  bountyAmount: number | null;
  currency: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  sourceMetadata: HackerOneSourceMetadata;
};

@Injectable()
export class HackerOneFetcherService {
  private readonly logger = new Logger(HackerOneFetcherService.name);
  private readonly baseUrl = 'https://api.hackerone.com';

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async fetchAndStore(options: {
    handles?: string[];
    limit: number;
    scopeLimit: number;
  }): Promise<{ fetched: number; skipped: number }> {
    const auth = this.getAuthHeader();
    const programs = options.handles?.length
      ? await this.fetchProgramsByHandle(options.handles, auth)
      : await this.fetchPrograms(options.limit, auth);

    let fetched = 0;
    let skipped = 0;

    for (const program of programs) {
      const handle = this.getProgramHandle(program);
      if (!handle) {
        skipped++;
        continue;
      }

      const attributes = program.attributes ?? {};
      if (
        attributes.offers_bounties !== true ||
        attributes.submission_state !== 'open' ||
        (attributes.state && attributes.state !== 'public_mode')
      ) {
        skipped++;
        continue;
      }

      try {
        const publicProfile = await this.fetchPublicProfile(handle);
        const scopes = await this.fetchStructuredScopes(handle, options.scopeLimit, auth);
        const scopeTasks = scopes
          .map((scope) => this.buildScopeTask(program, scope, publicProfile))
          .filter((task): task is HackerOneScopeTask => Boolean(task));
        skipped += scopes.length - scopeTasks.length;

        if (!scopeTasks.length) {
          skipped++;
          continue;
        }

        const task = this.buildProgramTask(program, scopeTasks, publicProfile);
        const result = await this.upsertRawTask(task);
        if (result === 'created' || result === 'updated') fetched++;
        else skipped++;
      } catch (error) {
        this.logger.error(`Failed to fetch HackerOne scopes for ${handle}: ${(error as Error).message}`);
      }
    }

    return { fetched, skipped };
  }

  private getAuthHeader() {
    const username =
      this.config.get<string>('HACKERONE_USERNAME') ||
      this.config.get<string>('H1_USERNAME');
    const token =
      this.config.get<string>('HACKERONE_API_TOKEN') ||
      this.config.get<string>('H1_API_TOKEN');

    if (!username || !token) {
      throw new Error('HackerOne credentials are not configured. Set HACKERONE_USERNAME and HACKERONE_API_TOKEN.');
    }

    return `Basic ${Buffer.from(`${username}:${token}`).toString('base64')}`;
  }

  private getProgramHandle(program: HackerOneResource<HackerOneProgramAttributes>) {
    return program.attributes?.handle || program.id || '';
  }

  private async fetchProgramsByHandle(handles: string[], auth: string) {
    const programs: Array<HackerOneResource<HackerOneProgramAttributes>> = [];

    for (const handle of handles) {
      const data = await this.fetchHackerOneJson<HackerOneSingleOrBareResponse<HackerOneProgramAttributes>>(
        `/v1/hackers/programs/${encodeURIComponent(handle)}`,
        auth,
      );
      const wrapped = data as HackerOneSingleResponse<HackerOneProgramAttributes>;
      const program = wrapped.data ?? (data as HackerOneResource<HackerOneProgramAttributes>);
      if (program?.id || program?.attributes) {
        programs.push(program);
      }
    }

    return programs;
  }

  private async fetchPrograms(limit: number, auth: string) {
    const programs: Array<HackerOneResource<HackerOneProgramAttributes>> = [];
    let path = `/v1/hackers/programs?page[size]=${Math.min(100, limit)}`;

    while (path && programs.length < limit) {
      const data = await this.fetchHackerOneJson<HackerOneListResponse<HackerOneProgramAttributes>>(path, auth);
      programs.push(...(data.data ?? []));
      path = data.links?.next ? this.toPath(data.links.next) : '';
    }

    return programs.slice(0, limit);
  }

  private async fetchStructuredScopes(handle: string, limit: number, auth: string) {
    const scopes: Array<HackerOneResource<HackerOneScopeAttributes>> = [];
    let path = `/v1/hackers/programs/${encodeURIComponent(handle)}/structured_scopes?page[size]=${Math.min(100, limit)}`;

    while (path && scopes.length < limit) {
      const data = await this.fetchHackerOneJson<HackerOneListResponse<HackerOneScopeAttributes>>(path, auth);
      scopes.push(...(data.data ?? []));
      path = data.links?.next ? this.toPath(data.links.next) : '';
    }

    return scopes.slice(0, limit);
  }

  private async fetchPublicProfile(handle: string): Promise<HackerOnePublicProfile | null> {
    const query = `
      query TeamBountyTableLite($handle: String!, $scopeSort: SortInput) {
        team(handle: $handle) {
          id
          handle
          name
          website
          state
          type
          launched_at
          triage_active
          allows_bounty_splitting
          publicly_visible_retesting
          resolved_report_count
          response_efficiency_percentage
          response_efficiency_indicator
          scope_description
          currency
          assets_in_scope: structured_scopes_search(eligible_for_submission: true) {
            total_count
          }
          structured_scope_versions {
            max_visible_updated_at
          }
          most_recent_sla_snapshot {
            first_response_time: average_time_to_first_program_response
            triage_time: average_time_to_report_triage
            bounty_time: average_time_to_bounty_awarded
            resolution_time: average_time_to_report_resolved
          }
          policy_setting {
            last_policy_change_at
          }
          bounty_table {
            id
            updated_at
            description
            use_range
            low_label
            medium_label
            high_label
            critical_label
            bounty_table_rows(first: 100) {
              nodes {
                id
                low
                medium
                high
                critical
                low_minimum
                medium_minimum
                high_minimum
                critical_minimum
                use_range
                name
                description
                updated_at
                structured_scope {
                  id
                  asset_identifier
                }
              }
            }
          }
          profile_metrics_snapshot {
            average_bounty_per_severity_low
            average_bounty_per_severity_medium
            average_bounty_per_severity_high
            average_bounty_per_severity_critical
            report_count_per_severity_low
            report_count_per_severity_medium
            report_count_per_severity_high
            report_count_per_severity_critical
          }
          declarative_policy {
            pays_within_one_month
            protected_by_gold_standard_safe_harbor
            protected_by_ai_safe_harbor
            platform_standards_exclusions {
              id
              justification
              platform_standard
            }
            scope_exclusions {
              id
              category
              details
              created_at
            }
          }
          structured_scopes_search(search_string: "", from: 0, size: 100, sort: $scopeSort) {
            nodes {
              ... on StructuredScopeDocument {
                id
                identifier
                display_name
                instruction
                cvss_score
                eligible_for_bounty
                eligible_for_submission
                asm_system_tags
                created_at
                updated_at
                total_resolved_reports
                attachments {
                  id
                  file_name
                  file_size
                  content_type
                  expiring_url
                }
              }
            }
          }
        }
      }
    `;

    try {
      const response = await fetch('https://hackerone.com/graphql', {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'user-agent': 'AgentCraft task generator',
        },
        body: JSON.stringify({
          operationName: 'TeamBountyTableLite',
          variables: { handle, scopeSort: { field: 'cvss_score', direction: 'DESC' } },
          query,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload = (await response.json()) as {
        data?: {
          team?: {
            website?: string | null;
            state?: string | null;
            type?: string | null;
            launched_at?: string | null;
            triage_active?: boolean | null;
            allows_bounty_splitting?: boolean | null;
            publicly_visible_retesting?: boolean | null;
            resolved_report_count?: number | null;
            response_efficiency_percentage?: number | null;
            response_efficiency_indicator?: string | null;
            scope_description?: string | null;
            currency?: string | null;
            assets_in_scope?: {
              total_count?: number | null;
            } | null;
            structured_scope_versions?: {
              max_visible_updated_at?: string | null;
            } | null;
            most_recent_sla_snapshot?: {
              first_response_time?: number | null;
              triage_time?: number | null;
              bounty_time?: number | null;
              resolution_time?: number | null;
            } | null;
            policy_setting?: {
              last_policy_change_at?: string | null;
            } | null;
            bounty_table?: {
              id?: string;
              updated_at?: string | null;
              description?: string | null;
              use_range?: boolean | null;
              low_label?: string | null;
              medium_label?: string | null;
              high_label?: string | null;
              critical_label?: string | null;
              bounty_table_rows?: {
                nodes?: HackerOnePublicBountyRow[];
              };
            } | null;
            profile_metrics_snapshot?: Record<string, number | null> | null;
            declarative_policy?: {
              pays_within_one_month?: boolean | null;
              protected_by_gold_standard_safe_harbor?: boolean | null;
              protected_by_ai_safe_harbor?: boolean | null;
              platform_standards_exclusions?: Array<{
                id?: string | null;
                justification?: string | null;
                platform_standard?: string | null;
              }> | null;
              scope_exclusions?: Array<{
                id?: string | null;
                category?: string | null;
                details?: string | null;
                created_at?: string | null;
              }> | null;
            } | null;
            structured_scopes_search?: {
              nodes?: HackerOnePublicScopeDocument[];
            } | null;
          } | null;
        };
        errors?: Array<{ message?: string }>;
      };

      if (payload.errors?.length) {
        this.logger.warn(
          `HackerOne public profile query returned errors for ${handle}: ${payload.errors
            .map((error) => error.message)
            .filter(Boolean)
            .join('; ')}`,
        );
      }

      const team = payload.data?.team;
      if (!team) {
        return null;
      }

      const metrics = team.profile_metrics_snapshot || null;
      const bountyTable = team.bounty_table
        ? {
            id: team.bounty_table.id,
            updatedAt: team.bounty_table.updated_at || null,
            description: team.bounty_table.description || null,
            useRange: team.bounty_table.use_range ?? null,
            lowLabel: team.bounty_table.low_label || null,
            mediumLabel: team.bounty_table.medium_label || null,
            highLabel: team.bounty_table.high_label || null,
            criticalLabel: team.bounty_table.critical_label || null,
            rows: team.bounty_table.bounty_table_rows?.nodes || [],
          }
        : null;

      return {
        currency: this.normalizeCurrency(team.currency),
        program: {
          website: team.website || null,
          state: team.state || null,
          type: team.type || null,
          launchedAt: team.launched_at || null,
          triageActive: team.triage_active === true,
          allowsBountySplitting: team.allows_bounty_splitting === true,
          publiclyVisibleRetesting: team.publicly_visible_retesting === true,
          responseEfficiencyPercentage: team.response_efficiency_percentage ?? null,
          responseEfficiencyIndicator: team.response_efficiency_indicator || null,
          resolvedReportCount: team.resolved_report_count ?? null,
          assetsInScope: team.assets_in_scope?.total_count ?? null,
          scopeDescription: team.scope_description || null,
          scopeLastUpdatedAt: team.structured_scope_versions?.max_visible_updated_at || null,
          policyLastChangedAt: team.policy_setting?.last_policy_change_at || null,
          highlights: {
            fastPayment: team.declarative_policy?.pays_within_one_month === true,
            goldStandardSafeHarbor: team.declarative_policy?.protected_by_gold_standard_safe_harbor === true,
            aiSafeHarbor: team.declarative_policy?.protected_by_ai_safe_harbor === true,
            topResponseEfficiency: (team.response_efficiency_percentage ?? 0) >= 90,
            managedByHackerOne: team.triage_active === true,
            collaborationEnabled: team.allows_bounty_splitting === true,
            includesRetesting: team.publicly_visible_retesting === true,
          },
          responseTimes: {
            firstResponseHours: team.most_recent_sla_snapshot?.first_response_time ?? null,
            triageHours: team.most_recent_sla_snapshot?.triage_time ?? null,
            bountyHours: team.most_recent_sla_snapshot?.bounty_time ?? null,
            resolutionHours: team.most_recent_sla_snapshot?.resolution_time ?? null,
          },
        },
        bountyTable,
        metrics: metrics
          ? {
              averageBountyPerSeverityLow: metrics.average_bounty_per_severity_low,
              averageBountyPerSeverityMedium: metrics.average_bounty_per_severity_medium,
              averageBountyPerSeverityHigh: metrics.average_bounty_per_severity_high,
              averageBountyPerSeverityCritical: metrics.average_bounty_per_severity_critical,
              reportCountPerSeverityLow: metrics.report_count_per_severity_low,
              reportCountPerSeverityMedium: metrics.report_count_per_severity_medium,
              reportCountPerSeverityHigh: metrics.report_count_per_severity_high,
              reportCountPerSeverityCritical: metrics.report_count_per_severity_critical,
            }
          : null,
        scopeExclusions: (team.declarative_policy?.scope_exclusions || [])
          .map((item) => ({
            id: item.id || null,
            category: item.category?.trim() || '',
            details: item.details?.trim() || '',
            createdAt: item.created_at || null,
          }))
          .filter((item) => item.category || item.details),
        platformStandardsExclusions: (team.declarative_policy?.platform_standards_exclusions || [])
          .map((item) => ({
            id: item.id || null,
            standard: item.platform_standard?.trim() || '',
            justification: item.justification?.trim() || '',
          }))
          .filter((item) => item.standard || item.justification),
        safeHarbor: {
          goldStandard: team.declarative_policy?.protected_by_gold_standard_safe_harbor === true,
          ai: team.declarative_policy?.protected_by_ai_safe_harbor === true,
        },
        scopes: team.structured_scopes_search?.nodes || [],
      };
    } catch (error) {
      this.logger.warn(`Failed to fetch HackerOne public profile for ${handle}: ${(error as Error).message}`);
      return null;
    }
  }

  private toPath(url: string) {
    if (url.startsWith('/')) {
      return url;
    }

    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}`;
  }

  private severityKey(value?: string | null) {
    const normalized = (value || '').trim().toLowerCase();
    if (normalized.includes('critical')) return 'critical';
    if (normalized.includes('high')) return 'high';
    if (normalized.includes('medium')) return 'medium';
    if (normalized.includes('low')) return 'low';
    if (normalized.includes('informational') || normalized.includes('accepted risk')) return 'informational';
    return normalized || 'unknown';
  }

  private stripMarkdown(value: string) {
    return value
      .replace(/\*\*/g, '')
      .replace(/`/g, '')
      .replace(/\[(.+?)\]\(.+?\)/g, '$1')
      .trim();
  }

  private extractPolicySections(policy?: string) {
    if (!policy?.trim()) {
      return {};
    }

    const sections: Record<string, string> = {};
    let heading = 'Overview';
    let buffer: string[] = [];
    const flush = () => {
      const text = buffer.join('\n').trim();
      if (text) {
        sections[this.stripMarkdown(heading)] = text;
      }
    };

    for (const line of policy.replace(/\r\n/g, '\n').split('\n')) {
      const match = line.match(/^#{1,4}\s+(.+?)\s*$/);
      if (match) {
        flush();
        heading = match[1];
        buffer = [];
      } else {
        buffer.push(line);
      }
    }
    flush();

    return sections;
  }

  private extractBullets(value?: string | null) {
    if (!value) {
      return [];
    }

    return value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => /^[-*]\s+/.test(line))
      .map((line) => this.stripMarkdown(line.replace(/^[-*]\s+/, '')))
      .filter(Boolean);
  }

  private pickLines(policy: string | undefined, needles: string[]) {
    if (!policy) {
      return [];
    }

    const normalizedNeedles = needles.map((needle) => needle.toLowerCase());
    return policy
      .split(/\r?\n/)
      .map((line) => this.stripMarkdown(line.replace(/^[-*]\s+/, '').trim()))
      .filter((line) => {
        const normalized = line.toLowerCase();
        return line && normalizedNeedles.some((needle) => normalized.includes(needle));
      });
  }

  private normalizeCurrency(value?: string | null) {
    return value?.trim() ? value.trim().toUpperCase() : null;
  }

  private formatMoney(value: number, currency?: string | null) {
    const formatted = value.toLocaleString('en-US');
    return this.normalizeCurrency(currency) === 'USD' ? `$${formatted}` : `${currency ? `${currency} ` : ''}${formatted}`;
  }

  private formatRawAmount(minimum: number | null, maximum: number | null, currency?: string | null) {
    if (minimum == null && maximum == null) {
      return '';
    }

    if (minimum == null || minimum === maximum) {
      return this.formatMoney(maximum ?? minimum ?? 0, currency);
    }

    return `${this.formatMoney(minimum, currency)} - ${this.formatMoney(maximum ?? minimum, currency)}`;
  }

  private findBountyTableRow(
    publicProfile: HackerOnePublicProfile | null,
    assetIdentifier: string,
  ): HackerOnePublicBountyRow | null {
    const rows = publicProfile?.bountyTable?.rows || [];
    if (!rows.length) {
      return null;
    }

    const normalizedAsset = assetIdentifier.trim().toLowerCase();
    return (
      rows.find((row) => row.structured_scope?.asset_identifier?.trim().toLowerCase() === normalizedAsset) ||
      rows.find((row) => !row.structured_scope?.asset_identifier) ||
      rows[0]
    );
  }

  private findPublicScope(
    publicProfile: HackerOnePublicProfile | null,
    assetIdentifier: string,
  ): HackerOnePublicScopeDocument | null {
    const normalizedAsset = assetIdentifier.trim().toLowerCase();
    return (
      publicProfile?.scopes.find((scope) => scope.identifier?.trim().toLowerCase() === normalizedAsset) ||
      null
    );
  }

  private getPublicMetric(
    metrics: HackerOnePublicProfile['metrics'],
    severity: 'low' | 'medium' | 'high' | 'critical',
    metric: 'averageBounty' | 'reportCount',
  ) {
    if (!metrics) {
      return null;
    }

    const values = {
      low: {
        averageBounty: metrics.averageBountyPerSeverityLow,
        reportCount: metrics.reportCountPerSeverityLow,
      },
      medium: {
        averageBounty: metrics.averageBountyPerSeverityMedium,
        reportCount: metrics.reportCountPerSeverityMedium,
      },
      high: {
        averageBounty: metrics.averageBountyPerSeverityHigh,
        reportCount: metrics.reportCountPerSeverityHigh,
      },
      critical: {
        averageBounty: metrics.averageBountyPerSeverityCritical,
        reportCount: metrics.reportCountPerSeverityCritical,
      },
    };

    return values[severity][metric] ?? null;
  }

  private buildRewardTableFromPublicProfile(
    publicProfile: HackerOnePublicProfile | null,
    assetIdentifier: string,
    fallbackCurrency?: string | null,
  ): HackerOneRewardRange[] {
    const row = this.findBountyTableRow(publicProfile, assetIdentifier);
    const currency = this.normalizeCurrency(publicProfile?.currency || fallbackCurrency);
    const labels = publicProfile?.bountyTable;
    const severities = [
      { key: 'low' as const, label: labels?.lowLabel || 'Low', amount: row?.low, minimum: row?.low_minimum },
      { key: 'medium' as const, label: labels?.mediumLabel || 'Medium', amount: row?.medium, minimum: row?.medium_minimum },
      { key: 'high' as const, label: labels?.highLabel || 'High', amount: row?.high, minimum: row?.high_minimum },
      {
        key: 'critical' as const,
        label: labels?.criticalLabel || 'Critical',
        amount: row?.critical,
        minimum: row?.critical_minimum,
      },
    ];
    const ranges: HackerOneRewardRange[] = row
      ? severities
          .map((severity): HackerOneRewardRange | null => {
            const useRange = row.use_range ?? publicProfile?.bountyTable?.useRange ?? false;
            const maximum = typeof severity.amount === 'number' ? severity.amount : null;
            const minimum = useRange && typeof severity.minimum === 'number' ? severity.minimum : maximum;
            if (minimum == null && maximum == null) {
              return null;
            }
            return {
              severity: severity.key,
              label: severity.label,
              minimum,
              maximum,
              currency,
              rawAmount: this.formatRawAmount(minimum, maximum, currency),
              averageBounty: this.getPublicMetric(publicProfile?.metrics || null, severity.key, 'averageBounty'),
              reportCount: this.getPublicMetric(publicProfile?.metrics || null, severity.key, 'reportCount'),
            };
          })
          .filter((item): item is HackerOneRewardRange => Boolean(item))
      : [];

    const descriptionRanges = this.parseRewardTable(publicProfile?.bountyTable?.description || undefined, currency);
    if (!ranges.length) {
      return descriptionRanges;
    }

    const seen = new Set<string>(ranges.map((range) => range.severity));
    return [...ranges, ...descriptionRanges.filter((range) => !seen.has(range.severity))];
  }

  private parseAmountRange(rawAmount: string, fallbackCurrency?: string | null) {
    const amount = rawAmount.trim();
    const currencyFromHeader = this.normalizeCurrency(fallbackCurrency);
    const currency =
      amount.includes('$') ? 'USD' :
      amount.match(/\b(USD|EUR|GBP|JPY|KRW|TWD|SGD)\b/i)?.[1]?.toUpperCase() ||
      currencyFromHeader;
    const values = Array.from(amount.matchAll(/(?:\$|USD\s*)?\s*([0-9][0-9,]*(?:\.\d+)?)/gi))
      .map((match) => Number(match[1].replace(/,/g, '')))
      .filter((value) => Number.isFinite(value));

    if (!values.length) {
      return { minimum: null, maximum: null, currency };
    }

    return {
      minimum: Math.min(...values),
      maximum: Math.max(...values),
      currency,
    };
  }

  private parseRewardTable(policy: string | undefined, fallbackCurrency?: string | null): HackerOneRewardRange[] {
    if (!policy) {
      return [];
    }

    const headerCurrency =
      policy.match(/Amount\s*\(([^)]+)\)/i)?.[1]?.trim().toUpperCase() ||
      this.normalizeCurrency(fallbackCurrency) ||
      null;

    return policy
      .split(/\r?\n/)
      .filter((line) => line.includes('|'))
      .map((line) =>
        line
          .split('|')
          .map((cell) => this.stripMarkdown(cell))
          .filter(Boolean),
      )
      .filter((cells) => cells.length >= 2)
      .filter((cells) => {
        const severity = cells[0].toLowerCase();
        return (
          !severity.includes('severity') &&
          !/^[-:\s]+$/.test(cells[0]) &&
          ['critical', 'high', 'medium', 'low', 'accepted risk', 'informational'].some((key) =>
            severity.includes(key),
          )
        );
      })
      .map((cells) => {
        const range = this.parseAmountRange(cells[1], headerCurrency);
        return {
          severity: this.severityKey(cells[0]),
          label: cells[0],
          rawAmount: cells[1],
          ...range,
        };
      });
  }

  private formatRewardRange(range?: HackerOneRewardRange | null) {
    if (!range) {
      return null;
    }

    if (range.rawAmount) {
      return range.rawAmount;
    }

    if (range.minimum === null && range.maximum === null) {
      return range.rawAmount;
    }

    const prefix = range.currency ? `${range.currency} ` : '';
    if (range.minimum === range.maximum || range.minimum === null) {
      return `${prefix}${range.maximum}`;
    }

    return `${prefix}${range.minimum} - ${range.maximum}`;
  }

  private formatList(items: string[]) {
    return items.length ? items.map((item) => `- ${item}`).join('\n') : '- Not specified by the imported program data.';
  }

  private formatHours(value?: number | null) {
    if (value == null) {
      return 'n/a';
    }

    if (value < 24) {
      return `${value} hours`;
    }

    const days = Math.floor(value / 24);
    const hours = Math.round(value % 24);
    return hours ? `${days} day${days === 1 ? '' : 's'}, ${hours} hours` : `${days} day${days === 1 ? '' : 's'}`;
  }

  private formatProgramHighlights(metadata: HackerOneSourceMetadata) {
    const highlights = metadata.program.highlights;
    return [
      highlights.fastPayment ? 'Fast Payment: payment within 1 month after receiving a vulnerability report.' : null,
      highlights.goldStandardSafeHarbor ? 'Gold Standard Safe Harbor is enabled.' : null,
      highlights.aiSafeHarbor ? 'AI Safe Harbor is enabled.' : null,
      highlights.topResponseEfficiency ? `Top Response Efficiency: ${metadata.program.responseEfficiencyPercentage}% response efficiency.` : null,
      highlights.managedByHackerOne ? 'Managed by HackerOne.' : null,
      highlights.collaborationEnabled ? 'Collaboration and bounty splitting are enabled.' : null,
      highlights.includesRetesting ? 'Retesting is included.' : null,
    ].filter((item): item is string => Boolean(item));
  }

  private buildReportTemplate() {
    return [
      'Summary of the vulnerability and affected asset.',
      'Exact scope asset, endpoint, account role, and test account used.',
      'Step-by-step reproduction with HTTP requests, responses, screenshots, or video evidence.',
      'Security impact, affected data/actions, and realistic attacker prerequisites.',
      'CVSS/severity reasoning mapped to the program reward table.',
      'Safe remediation guidance or mitigation notes.',
      'Confirmation that testing stayed within scope and used only owned or authorized accounts.',
    ];
  }

  private extractRequiredHeaders(policy?: string) {
    if (!policy) {
      return [];
    }

    const headers: Array<{ name: string; value: string }> = [];
    const headerMatch = policy.match(/X-HackerOne-Researcher\s*:\s*\[?([^\]\n"`]+)\]?/i);
    if (headerMatch) {
      headers.push({
        name: 'X-HackerOne-Researcher',
        value: headerMatch[1].trim() || '[H1 username]',
      });
    }

    return headers;
  }

  private buildSourceMetadata(
    program: HackerOneResource<HackerOneProgramAttributes>,
    scope: HackerOneResource<HackerOneScopeAttributes>,
    externalUrl: string,
    publicProfile: HackerOnePublicProfile | null,
  ): HackerOneSourceMetadata {
    const programAttributes = program.attributes ?? {};
    const scopeAttributes = scope.attributes ?? {};
    const programHandle = this.getProgramHandle(program);
    const programName = programAttributes.name || programHandle;
    const policy = programAttributes.policy || '';
    const sections = this.extractPolicySections(policy);
    const assetIdentifier = scopeAttributes.asset_identifier?.trim() || '';
    const publicScope = this.findPublicScope(publicProfile, assetIdentifier);
    const publicRewardTable = this.buildRewardTableFromPublicProfile(
      publicProfile,
      assetIdentifier,
      programAttributes.currency,
    );
    const rewardTable = publicRewardTable.length
      ? publicRewardTable
      : this.parseRewardTable(policy, programAttributes.currency);
    const maxSeverity = scopeAttributes.max_severity || 'unknown';
    const scopeRange =
      rewardTable.find((range) => range.severity === this.severityKey(maxSeverity)) ?? null;
    const scopeExclusions = publicProfile?.scopeExclusions.map((item) =>
      [item.category, item.details].filter(Boolean).join(': '),
    ) || [];
    const programRules = [
      ...this.extractBullets(sections['Program Rules']),
      ...this.extractBullets(sections['Disclosure Policy']),
    ];

    return {
      source: 'hackerone',
      program: {
        handle: programHandle,
        name: programName,
        url: externalUrl,
        website: publicProfile?.program.website || programAttributes.website || null,
        state: publicProfile?.program.state || programAttributes.state || null,
        type: publicProfile?.program.type || null,
        launchedAt: publicProfile?.program.launchedAt || programAttributes.started_accepting_at || null,
        submissionState: programAttributes.submission_state || null,
        offersBounties: programAttributes.offers_bounties === true,
        currency: scopeRange?.currency || publicProfile?.currency || programAttributes.currency || null,
        triageActive: publicProfile?.program.triageActive ?? false,
        allowsBountySplitting: publicProfile?.program.allowsBountySplitting ?? false,
        publiclyVisibleRetesting: publicProfile?.program.publiclyVisibleRetesting ?? false,
        responseEfficiencyPercentage: publicProfile?.program.responseEfficiencyPercentage ?? null,
        responseEfficiencyIndicator: publicProfile?.program.responseEfficiencyIndicator ?? null,
        resolvedReportCount: publicProfile?.program.resolvedReportCount ?? null,
        assetsInScope: publicProfile?.program.assetsInScope ?? null,
        highlights: publicProfile?.program.highlights || {
          fastPayment: false,
          goldStandardSafeHarbor: false,
          aiSafeHarbor: false,
          topResponseEfficiency: false,
          managedByHackerOne: false,
          collaborationEnabled: false,
          includesRetesting: false,
        },
        responseTimes: publicProfile?.program.responseTimes || {
          firstResponseHours: null,
          triageHours: null,
          bountyHours: null,
          resolutionHours: null,
        },
      },
      scope: {
        id: scope.id || this.hash(`${programHandle}:${scopeAttributes.asset_identifier ?? ''}`),
        publicId: publicScope?.id || null,
        assetIdentifier,
        displayName: publicScope?.display_name || null,
        assetType: scopeAttributes.asset_type || 'unknown',
        eligibleForBounty: publicScope?.eligible_for_bounty ?? (scopeAttributes.eligible_for_bounty === true),
        eligibleForSubmission: publicScope?.eligible_for_submission ?? (scopeAttributes.eligible_for_submission === true),
        instruction: publicScope?.instruction?.trim() || scopeAttributes.instruction?.trim() || null,
        maxSeverity,
        cvssScore: publicScope?.cvss_score || null,
        asmSystemTags: publicScope?.asm_system_tags || [],
        totalResolvedReports: publicScope?.total_resolved_reports ?? null,
        attachments: publicScope?.attachments || [],
        createdAt: scopeAttributes.created_at || null,
        updatedAt: publicScope?.updated_at || scopeAttributes.updated_at || null,
      },
      rewards: {
        currency: scopeRange?.currency || publicProfile?.currency || programAttributes.currency || null,
        table: rewardTable,
        scopeRange,
        bountyTable: publicProfile?.bountyTable || null,
        metrics: publicProfile?.metrics || null,
      },
      testing: {
        requiredHeaders: this.extractRequiredHeaders(policy),
        accountGuidance: this.pickLines(policy, ['hacker email alias', 'free account', 'accounts you own']),
        programRules,
        prohibitedActions: [
          ...this.pickLines(policy, ['social engineering', 'privacy', 'destruction', 'interruption', 'degradation']),
          ...scopeExclusions,
        ],
        safeTestingRules: this.pickLines(policy, ['only interact', 'ask the program', 'good faith', 'zero-day', 'official patch']),
        duplicatePolicy: this.pickLines(policy, ['duplicate', 'first report', 'single vulnerability', 'same fix', 'overlap']),
      },
      reportTemplate: this.buildReportTemplate(),
      policy: {
        excerpt: policy ? this.truncate(policy, 4000) : null,
        sections,
        scopeDescription: publicProfile?.program.scopeDescription || null,
        scopeLastUpdatedAt: publicProfile?.program.scopeLastUpdatedAt || null,
        lastChangedAt: publicProfile?.program.policyLastChangedAt || null,
        safeHarbor: publicProfile?.safeHarbor || { goldStandard: false, ai: false },
        scopeExclusions: publicProfile?.scopeExclusions || [],
        platformStandardsExclusions: publicProfile?.platformStandardsExclusions || [],
      },
    };
  }

  private buildScopeBody(metadata: HackerOneSourceMetadata) {
    const rewardRange = this.formatRewardRange(metadata.rewards.scopeRange);
    const programHighlights = this.formatProgramHighlights(metadata);
    const rewardRows = metadata.rewards.table.length
      ? metadata.rewards.table
          .map((row) => `| ${row.label} | ${this.formatRewardRange(row) || row.rawAmount} |`)
          .join('\n')
      : '| Not imported | Check original program page |';
    const requiredHeaders = metadata.testing.requiredHeaders.length
      ? metadata.testing.requiredHeaders.map((header) => `- \`${header.name}: ${header.value}\``).join('\n')
      : '- No required testing header was found in the imported policy.';

    return [
      `## HackerOne Program`,
      `Program: ${metadata.program.name} (${metadata.program.handle})`,
      `Program URL: ${metadata.program.url}`,
      metadata.program.website ? `Website: ${metadata.program.website}` : null,
      metadata.program.launchedAt ? `Launched: ${metadata.program.launchedAt}` : null,
      `Submission state: ${metadata.program.submissionState || 'unknown'}`,
      `Offers bounty: ${metadata.program.offersBounties ? 'yes' : 'no'}`,
      `Assets in scope: ${metadata.program.assetsInScope ?? 'unknown'}`,
      `Resolved reports: ${metadata.program.resolvedReportCount ?? 'unknown'}`,
      metadata.policy.lastChangedAt ? `Policy last changed: ${metadata.policy.lastChangedAt}` : null,
      metadata.policy.scopeLastUpdatedAt ? `Scope last updated: ${metadata.policy.scopeLastUpdatedAt}` : null,
      '',
      `## Program Signals`,
      `Highlights:\n${this.formatList(programHighlights)}`,
      '',
      `Response timing:\n${this.formatList([
        `Average first response: ${this.formatHours(metadata.program.responseTimes.firstResponseHours)}`,
        `Average triage: ${this.formatHours(metadata.program.responseTimes.triageHours)}`,
        `Average bounty: ${this.formatHours(metadata.program.responseTimes.bountyHours)}`,
        `Average resolution: ${this.formatHours(metadata.program.responseTimes.resolutionHours)}`,
      ])}`,
      '',
      `## Target Scope`,
      `| Field | Value |`,
      `| --- | --- |`,
      `| Asset identifier | ${metadata.scope.assetIdentifier} |`,
      metadata.scope.displayName ? `| Display name | ${metadata.scope.displayName} |` : null,
      `| Asset type | ${metadata.scope.assetType} |`,
      `| Eligible for submission | ${metadata.scope.eligibleForSubmission ? 'yes' : 'no'} |`,
      `| Eligible for bounty | ${metadata.scope.eligibleForBounty ? 'yes' : 'no'} |`,
      `| Max severity | ${metadata.scope.maxSeverity} |`,
      metadata.scope.cvssScore ? `| CVSS/severity score | ${metadata.scope.cvssScore} |` : null,
      `| Resolved reports for this asset | ${metadata.scope.totalResolvedReports ?? 'unknown'} |`,
      metadata.scope.updatedAt ? `| Last scope update | ${metadata.scope.updatedAt} |` : null,
      rewardRange ? `| Reward range for max severity | ${rewardRange} |` : null,
      metadata.scope.instruction ? `\nScope instructions:\n${metadata.scope.instruction}` : null,
      metadata.scope.asmSystemTags.length ? `\nAsset tags:\n${this.formatList(metadata.scope.asmSystemTags)}` : null,
      metadata.policy.scopeDescription ? `\nScope catalog note:\n${metadata.policy.scopeDescription}` : null,
      '',
      `## Reward Table`,
      `| Severity | External bounty guidance |`,
      `| --- | --- |`,
      rewardRows,
      '',
      `## Testing Requirements`,
      `Required request headers:\n${requiredHeaders}`,
      '',
      `Account guidance:\n${this.formatList(metadata.testing.accountGuidance)}`,
      '',
      `Program rules and safety constraints:\n${this.formatList([
        ...metadata.testing.prohibitedActions,
        ...metadata.testing.safeTestingRules,
      ])}`,
      '',
      `Duplicate and grouping policy:\n${this.formatList(metadata.testing.duplicatePolicy)}`,
      '',
      `Out-of-scope exclusions:\n${this.formatList(
        metadata.policy.scopeExclusions.map((item) => [item.category, item.details].filter(Boolean).join(': ')),
      )}`,
      '',
      `Platform standards deviations:\n${this.formatList(
        metadata.policy.platformStandardsExclusions.map((item) =>
          [item.standard, item.justification].filter(Boolean).join(': '),
        ),
      )}`,
      '',
      `## Expected Report Contents`,
      this.formatList(metadata.reportTemplate),
      metadata.policy.excerpt ? `\n## Program Policy Excerpt\n${metadata.policy.excerpt}` : null,
    ]
      .filter((item) => item !== null && item !== undefined)
      .join('\n');
  }

  private buildScopeTask(
    program: HackerOneResource<HackerOneProgramAttributes>,
    scope: HackerOneResource<HackerOneScopeAttributes>,
    publicProfile: HackerOnePublicProfile | null,
  ): HackerOneScopeTask | null {
    const programAttributes = program.attributes ?? {};
    const scopeAttributes = scope.attributes ?? {};
    const programHandle = this.getProgramHandle(program);
    const programName = programAttributes.name || programHandle;
    const assetIdentifier = scopeAttributes.asset_identifier?.trim();

    if (
      !programHandle ||
      !assetIdentifier ||
      scopeAttributes.eligible_for_submission !== true ||
      scopeAttributes.eligible_for_bounty !== true
    ) {
      return null;
    }

    const scopeKey = scope.id || this.hash(`${programHandle}:${assetIdentifier}:${scopeAttributes.asset_type ?? ''}`);
    const externalId = `program:${programHandle}:scope:${scopeKey}`;
    const externalUrl = programAttributes.url || `https://hackerone.com/${programHandle}`;
    const sourceMetadata = this.buildSourceMetadata(program, scope, externalUrl, publicProfile);
    const assetType = sourceMetadata.scope.assetType;
    const maxSeverity = sourceMetadata.scope.maxSeverity;
    const rewardRange = sourceMetadata.rewards.scopeRange;
    const labels = [
      'hackerone',
      'security-research',
      `program:${programHandle}`,
      `asset:${assetType}`,
      `max-severity:${maxSeverity}`,
      'bounty:eligible',
      'submission:eligible',
      rewardRange ? `external-reward:${rewardRange.minimum ?? 0}-${rewardRange.maximum ?? 0}` : null,
    ];

    const body = this.buildScopeBody(sourceMetadata);

    return {
      externalId,
      externalUrl,
      programHandle,
      programName,
      title: `${programName}: ${assetIdentifier}`,
      body,
      labels: labels.filter(Boolean) as string[],
      hasBounty: true,
      bountyAmount: rewardRange?.maximum ?? null,
      currency: rewardRange?.currency ?? programAttributes.currency ?? null,
      createdAt: this.parseDate(scopeAttributes.created_at || programAttributes.started_accepting_at),
      updatedAt: this.parseDate(scopeAttributes.updated_at || programAttributes.updated_at),
      sourceMetadata,
    };
  }

  private severityRank(value?: string | null) {
    const severity = this.severityKey(value);
    if (severity === 'critical') return 4;
    if (severity === 'high') return 3;
    if (severity === 'medium') return 2;
    if (severity === 'low') return 1;
    return 0;
  }

  private maxSeverity(scopes: HackerOneScopeTask[]) {
    return scopes
      .map((task) => task.sourceMetadata.scope.maxSeverity)
      .sort((left, right) => this.severityRank(right) - this.severityRank(left))[0] || 'unknown';
  }

  private assetTypeCounts(scopes: HackerOneScopeTask[]) {
    const counts = new Map<string, number>();
    for (const task of scopes) {
      const assetType = task.sourceMetadata.scope.assetType || 'unknown';
      counts.set(assetType, (counts.get(assetType) ?? 0) + 1);
    }

    return Array.from(counts.entries())
      .map(([assetType, count]) => ({ assetType, count }))
      .sort((left, right) => right.count - left.count || left.assetType.localeCompare(right.assetType));
  }

  private topRewardRange(scopes: HackerOneScopeTask[]) {
    const ranges = scopes
      .map((task) => task.sourceMetadata.rewards.scopeRange)
      .filter((range): range is HackerOneRewardRange => Boolean(range));

    return ranges.sort((left, right) => (right.maximum ?? 0) - (left.maximum ?? 0))[0] || null;
  }

  private buildProgramBody(metadata: HackerOneSourceMetadata) {
    const scopeCatalog = metadata.scopeCatalog || [];
    const assetTypes = metadata.scopeSummary?.assetTypes || [];
    const topRewardRange = this.formatRewardRange(metadata.scopeSummary?.topRewardRange || null);
    const scopeRows = scopeCatalog
      .slice(0, 80)
      .map((item) =>
        `| ${item.scope.assetIdentifier} | ${item.scope.assetType} | ${item.scope.maxSeverity} | ${this.formatRewardRange(item.rewardRange) || '-'} |`,
      );

    return [
      `## HackerOne Program`,
      `Program: ${metadata.program.name} (${metadata.program.handle})`,
      `Program URL: ${metadata.program.url}`,
      metadata.program.website ? `Website: ${metadata.program.website}` : null,
      `Eligible imported scopes: ${metadata.scopeSummary?.totalEligibleScopes ?? scopeCatalog.length}`,
      `Asset types: ${assetTypes.map((item) => `${item.assetType} (${item.count})`).join(', ') || 'unknown'}`,
      `Highest imported severity: ${metadata.scopeSummary?.maxSeverity || 'unknown'}`,
      topRewardRange ? `Top external reward guidance: ${topRewardRange}` : null,
      metadata.policy.lastChangedAt ? `Policy last changed: ${metadata.policy.lastChangedAt}` : null,
      metadata.policy.scopeLastUpdatedAt ? `Scope last updated: ${metadata.policy.scopeLastUpdatedAt}` : null,
      '',
      `## Imported Scope Catalog`,
      `| Asset | Type | Max severity | Reward guidance |`,
      `| --- | --- | --- | --- |`,
      scopeRows.length ? scopeRows.join('\n') : '| Not imported | - | - | - |',
      scopeCatalog.length > scopeRows.length ? `\nOnly the first ${scopeRows.length} scopes are shown here; full scopeCatalog is in source metadata.` : null,
      '',
      `## Program Signals`,
      `Highlights:\n${this.formatList(this.formatProgramHighlights(metadata))}`,
      '',
      `## Testing Requirements`,
      `Required request headers:\n${
        metadata.testing.requiredHeaders.length
          ? metadata.testing.requiredHeaders.map((header) => `- \`${header.name}: ${header.value}\``).join('\n')
          : '- No required testing header was found in the imported policy.'
      }`,
      '',
      `Program rules and safety constraints:\n${this.formatList([
        ...metadata.testing.prohibitedActions,
        ...metadata.testing.safeTestingRules,
      ])}`,
      '',
      `Duplicate and grouping policy:\n${this.formatList(metadata.testing.duplicatePolicy)}`,
      '',
      `Out-of-scope exclusions:\n${this.formatList(
        metadata.policy.scopeExclusions.map((item) => [item.category, item.details].filter(Boolean).join(': ')),
      )}`,
      '',
      `## Expected Report Contents`,
      this.formatList(metadata.reportTemplate),
      metadata.policy.excerpt ? `\n## Program Policy Excerpt\n${metadata.policy.excerpt}` : null,
    ]
      .filter((item) => item !== null && item !== undefined)
      .join('\n');
  }

  private buildProgramTask(
    program: HackerOneResource<HackerOneProgramAttributes>,
    scopeTasks: HackerOneScopeTask[],
    publicProfile: HackerOnePublicProfile | null,
  ): HackerOneScopeTask {
    const programAttributes = program.attributes ?? {};
    const programHandle = this.getProgramHandle(program);
    const programName = programAttributes.name || programHandle;
    const externalUrl = programAttributes.url || `https://hackerone.com/${programHandle}`;
    const firstMetadata = scopeTasks[0].sourceMetadata;
    const assetTypes = this.assetTypeCounts(scopeTasks);
    const maxSeverity = this.maxSeverity(scopeTasks);
    const topRewardRange = this.topRewardRange(scopeTasks);
    const sourceMetadata: HackerOneSourceMetadata = {
      ...firstMetadata,
      program: {
        ...firstMetadata.program,
        url: externalUrl,
        assetsInScope: publicProfile?.program.assetsInScope ?? firstMetadata.program.assetsInScope,
      },
      scope: {
        id: `program:${programHandle}`,
        publicId: null,
        assetIdentifier: `${scopeTasks.length} eligible scopes`,
        displayName: `${programName} scope catalog`,
        assetType: 'PROGRAM',
        eligibleForBounty: true,
        eligibleForSubmission: true,
        instruction: 'Use scopeCatalog to select the first safe, high-fit asset group before validation.',
        maxSeverity,
        cvssScore: null,
        asmSystemTags: assetTypes.map((item) => item.assetType),
        totalResolvedReports: null,
        attachments: [],
        createdAt: null,
        updatedAt: firstMetadata.policy.scopeLastUpdatedAt || null,
      },
      rewards: {
        ...firstMetadata.rewards,
        scopeRange: topRewardRange,
      },
      scopeSummary: {
        totalEligibleScopes: scopeTasks.length,
        assetTypes,
        maxSeverity,
        topRewardRange,
      },
      scopeCatalog: scopeTasks.map((task) => ({
        scope: task.sourceMetadata.scope,
        rewardRange: task.sourceMetadata.rewards.scopeRange,
        rewardTable: task.sourceMetadata.rewards.table,
      })),
    };
    const labels = [
      'hackerone',
      'security-research',
      `program:${programHandle}`,
      `max-severity:${maxSeverity}`,
      'bounty:eligible',
      'submission:eligible',
      ...assetTypes.slice(0, 5).map((item) => `asset:${item.assetType}`),
      topRewardRange ? `external-reward:${topRewardRange.minimum ?? 0}-${topRewardRange.maximum ?? 0}` : null,
    ];

    return {
      externalId: `program:${programHandle}`,
      externalUrl,
      programHandle,
      programName,
      title: programName,
      body: this.buildProgramBody(sourceMetadata),
      labels: labels.filter(Boolean) as string[],
      hasBounty: true,
      bountyAmount: topRewardRange?.maximum ?? null,
      currency: topRewardRange?.currency ?? programAttributes.currency ?? null,
      createdAt: this.parseDate(programAttributes.started_accepting_at),
      updatedAt: this.parseDate(programAttributes.updated_at || firstMetadata.policy.scopeLastUpdatedAt || undefined),
      sourceMetadata,
    };
  }

  private hash(value: string) {
    return createHash('sha256').update(value).digest('hex').slice(0, 16);
  }

  private truncate(value: string, maxLength: number) {
    return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
  }

  private parseDate(value?: string) {
    if (!value) {
      return null;
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
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

  private stableJson(value: unknown): string {
    if (Array.isArray(value)) {
      return `[${value.map((item) => this.stableJson(item)).join(',')}]`;
    }

    if (value && typeof value === 'object') {
      return `{${Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => `${JSON.stringify(key)}:${this.stableJson(item)}`)
        .join(',')}}`;
    }

    return JSON.stringify(value ?? null);
  }

  private shouldReuseExistingRawTask(existing: ExistingHackerOneRawTask, task: HackerOneScopeTask) {
    return (
      existing.title === task.title &&
      (existing.body ?? null) === task.body &&
      this.sameStringArray(this.normalizeStringArray(existing.labels), task.labels) &&
      this.stableJson(existing.sourceMetadata) === this.stableJson(task.sourceMetadata) &&
      existing.hasBounty === task.hasBounty &&
      (existing.bountyAmount ?? null) === (task.bountyAmount ?? null) &&
      (existing.bountyCurrency ?? null) === (task.currency ?? null) &&
      this.sameDate(existing.issueCreatedAt, task.createdAt) &&
      this.sameDate(existing.issueUpdatedAt, task.updatedAt)
    );
  }

  private async upsertRawTask(task: HackerOneScopeTask): Promise<'created' | 'updated' | 'skipped'> {
    const existing = await this.prisma.rawTask.findUnique({
      where: {
        source_externalId: {
          source: 'HACKERONE_PROGRAM',
          externalId: task.externalId,
        },
      },
      select: {
        id: true,
        title: true,
        body: true,
        labels: true,
        sourceMetadata: true,
        hasBounty: true,
        bountyAmount: true,
        bountyCurrency: true,
        issueCreatedAt: true,
        issueUpdatedAt: true,
        publishedTaskId: true,
      },
    });

    const commonData = {
      externalUrl: task.externalUrl,
      repoOwner: 'hackerone',
      repoName: task.programHandle,
      title: task.title,
      body: task.body,
      labels: task.labels,
      externalCreator: task.programName,
      hasBounty: task.hasBounty,
      bountyAmount: task.bountyAmount,
      bountyCurrency: task.currency,
      issueCreatedAt: task.createdAt,
      issueUpdatedAt: task.updatedAt,
      issueCommentCount: 0,
      repoStars: null,
      repoForks: null,
      repoOpenIssues: null,
      repoPrimaryLanguage: null,
      repoArchived: false,
      repoDefaultBranch: null,
      repoPushedAt: null,
      repoHasGithubCi: false,
      repoHasBuildManifest: false,
      buildSystemHints: ['security-research'],
      sourceMetadata: task.sourceMetadata as Prisma.InputJsonValue,
      fetchedAt: new Date(),
    };

    if (existing && this.shouldReuseExistingRawTask(existing, task)) {
      return 'skipped';
    }

    if (!existing) {
      await this.prisma.rawTask.create({
        data: {
          source: 'HACKERONE_PROGRAM',
          externalId: task.externalId,
          status: 'PENDING',
          shouldPublish: null,
          publishReasons: Prisma.JsonNull,
          ...commonData,
        },
      });
      return 'created';
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

  private async fetchHackerOneJson<T>(path: string, auth: string): Promise<T> {
    const url = path.startsWith('http') ? path : `${this.baseUrl}${path}`;
    this.logger.log(`Fetching ${url}`);
    const res = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'Authorization': auth,
      },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`HackerOne API ${res.status}: ${body}`);
    }

    return res.json();
  }
}
