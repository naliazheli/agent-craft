import type { TFunction } from 'i18next';

export interface TaskSourceLink {
  label: string;
  url: string;
}

export interface TaskSourceMetadata {
  source?: string;
  program?: {
    handle?: string;
    name?: string;
    url?: string;
    website?: string | null;
    state?: string | null;
    type?: string | null;
    launchedAt?: string | null;
    submissionState?: string | null;
    offersBounties?: boolean;
    currency?: string | null;
    triageActive?: boolean;
    allowsBountySplitting?: boolean;
    publiclyVisibleRetesting?: boolean;
    responseEfficiencyPercentage?: number | null;
    responseEfficiencyIndicator?: string | null;
    resolvedReportCount?: number | null;
    assetsInScope?: number | null;
    highlights?: {
      fastPayment?: boolean;
      goldStandardSafeHarbor?: boolean;
      aiSafeHarbor?: boolean;
      topResponseEfficiency?: boolean;
      managedByHackerOne?: boolean;
      collaborationEnabled?: boolean;
      includesRetesting?: boolean;
    };
    responseTimes?: {
      firstResponseHours?: number | null;
      triageHours?: number | null;
      bountyHours?: number | null;
      resolutionHours?: number | null;
    };
  };
  scope?: {
    id?: string;
    publicId?: string | null;
    assetIdentifier?: string;
    displayName?: string | null;
    assetType?: string;
    eligibleForBounty?: boolean;
    eligibleForSubmission?: boolean;
    instruction?: string | null;
    maxSeverity?: string;
    cvssScore?: string | null;
    asmSystemTags?: string[];
    totalResolvedReports?: number | null;
    attachments?: Array<{
      id?: string;
      file_name?: string | null;
      file_size?: number | null;
      content_type?: string | null;
      expiring_url?: string | null;
    }>;
    createdAt?: string | null;
    updatedAt?: string | null;
  };
  rewards?: {
    currency?: string | null;
    table?: Array<{
      severity?: string;
      label?: string;
      minimum?: number | null;
      maximum?: number | null;
      currency?: string | null;
      rawAmount?: string;
      averageBounty?: number | null;
      reportCount?: number | null;
    }>;
    scopeRange?: {
      severity?: string;
      label?: string;
      minimum?: number | null;
      maximum?: number | null;
      currency?: string | null;
      rawAmount?: string;
      averageBounty?: number | null;
      reportCount?: number | null;
    } | null;
    bountyTable?: {
      updatedAt?: string | null;
      description?: string | null;
      useRange?: boolean | null;
      rows?: Array<{
        low?: number | null;
        medium?: number | null;
        high?: number | null;
        critical?: number | null;
        low_minimum?: number | null;
        medium_minimum?: number | null;
        high_minimum?: number | null;
        critical_minimum?: number | null;
        use_range?: boolean | null;
        name?: string | null;
        description?: string | null;
        structured_scope?: {
          asset_identifier?: string | null;
        } | null;
      }>;
    } | null;
    metrics?: {
      averageBountyPerSeverityLow?: number | null;
      averageBountyPerSeverityMedium?: number | null;
      averageBountyPerSeverityHigh?: number | null;
      averageBountyPerSeverityCritical?: number | null;
      reportCountPerSeverityLow?: number | null;
      reportCountPerSeverityMedium?: number | null;
      reportCountPerSeverityHigh?: number | null;
      reportCountPerSeverityCritical?: number | null;
    } | null;
  };
  testing?: {
    requiredHeaders?: Array<{ name?: string; value?: string }>;
    accountGuidance?: string[];
    programRules?: string[];
    prohibitedActions?: string[];
    safeTestingRules?: string[];
    duplicatePolicy?: string[];
  };
  reportTemplate?: string[];
  policy?: {
    excerpt?: string | null;
    sections?: Record<string, string>;
    scopeDescription?: string | null;
    scopeLastUpdatedAt?: string | null;
    lastChangedAt?: string | null;
    safeHarbor?: {
      goldStandard?: boolean;
      ai?: boolean;
    };
    scopeExclusions?: Array<{
      id?: string | null;
      category?: string;
      details?: string;
      createdAt?: string | null;
    }>;
    platformStandardsExclusions?: Array<{
      id?: string | null;
      standard?: string;
      justification?: string;
    }>;
  };
  originalId?: string;
  programHandle?: string;
  fundingMode?: string;
  fundingNote?: string;

  catalog?: string;
  externalProblemId?: number;
  bibliographySourceCode?: string;
  bibliographySourceUrl?: string;
  discussionThreadUrl?: string;
  disclaimer?: string;
  statement?: string;
  statementMd?: string;
  statementLatex?: string;
  statusNote?: string;
  categories?: string[];
  bibliographyRefs?: string[];
  researchNotes?: string[];
  researchNotesMd?: string[];
  sourceComments?: Array<{
    author: string;
    postedAt: string;
    contentMd: string;
    replies?: Array<{
      author: string;
      postedAt: string;
      contentMd: string;
      replies?: Array<{
        author: string;
        postedAt: string;
        contentMd: string;
      }>;
    }>;
  }>;
  relatedLinks?: TaskSourceLink[];
  recommendedCitation?: string;
  lastEditedAt?: string;
  originalPrize?: {
    amount: number;
    currency: string;
  };
  formalized?: {
    available: boolean;
    label?: string;
    url?: string;
  };
}

function normalizeErdosInlineText(value: string) {
  return value
    .replace(/\\\[/g, ' ')
    .replace(/\\\]/g, ' ')
    .replace(/\\\(/g, ' ')
    .replace(/\\\)/g, ' ')
    .replace(/\$\$/g, ' ')
    .replace(/\$/g, '')
    .replace(/\\mathbb\{N\}/g, 'N')
    .replace(/\\mathbb\{Z\}/g, 'Z')
    .replace(/\\mathbb\{R\}/g, 'R')
    .replace(/\\ldots/g, '...')
    .replace(/\\cdots/g, '...')
    .replace(/\\to/g, '->')
    .replace(/\\infty/g, 'infinity')
    .replace(/\\subseteq/g, 'subseteq')
    .replace(/\\supseteq/g, 'supseteq')
    .replace(/\\geq/g, '>=')
    .replace(/\\leq/g, '<=')
    .replace(/\\neq/g, '!=')
    .replace(/\\ast/g, '*')
    .replace(/\\log/g, 'log')
    .replace(/\\omega/g, 'omega')
    .replace(/\\epsilon/g, 'epsilon')
    .replace(/\\lvert/g, '|')
    .replace(/\\rvert/g, '|')
    .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '$1/$2')
    .replace(/\\[{}]/g, (match) => match.slice(1))
    .replace(/\\([a-zA-Z]+)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function shorten(value: string, limit: number) {
  if (value.length <= limit) {
    return value;
  }

  const clipped = value.slice(0, limit - 3).trimEnd();
  const lastSpace = clipped.lastIndexOf(' ');
  return `${(lastSpace > 32 ? clipped.slice(0, lastSpace) : clipped).trimEnd()}...`;
}

export function formatHackerOneRewardRange(sourceMetadata?: TaskSourceMetadata | null) {
  const range = sourceMetadata?.rewards?.scopeRange;
  if (!range) {
    return '';
  }

  if (range.rawAmount) {
    return range.rawAmount;
  }

  if (range.minimum == null && range.maximum == null) {
    return range.rawAmount || '';
  }

  const prefix = range.currency ? `${range.currency} ` : '';
  if (range.minimum === range.maximum || range.minimum == null) {
    return `${prefix}${range.maximum}`;
  }

  return `${prefix}${range.minimum} - ${range.maximum}`;
}

export function formatHackerOneHours(value?: number | null) {
  if (value == null) {
    return '';
  }

  if (value < 24) {
    return `${value}h`;
  }

  const days = Math.floor(value / 24);
  const hours = Math.round(value % 24);
  return hours ? `${days}d ${hours}h` : `${days}d`;
}

export function getTaskDisplayTitle(
  taskTitle: string,
  taskSource?: string | null,
  sourceMetadata?: TaskSourceMetadata | null,
  options?: { short?: boolean },
) {
  if (taskSource !== 'ERDOS_PROBLEM' || typeof sourceMetadata?.externalProblemId !== 'number') {
    if (taskSource === 'HACKERONE' && sourceMetadata?.program?.name && sourceMetadata?.scope?.assetIdentifier) {
      return `${sourceMetadata.program.name}: ${sourceMetadata.scope.assetIdentifier}`;
    }

    return taskTitle;
  }

  const prefix = `Erdos Problem #${sourceMetadata.externalProblemId}`;
  const statement = sourceMetadata.statement ? normalizeErdosInlineText(sourceMetadata.statement) : '';
  if (!statement) {
    return taskTitle || prefix;
  }

  const suffix = options?.short ? shorten(statement, 88) : statement;
  return `${prefix}: ${suffix}`;
}

export function getTaskDisplaySubtitle(
  taskSource?: string | null,
  sourceMetadata?: TaskSourceMetadata | null,
  options?: { short?: boolean },
) {
  if (taskSource !== 'ERDOS_PROBLEM') {
    if (taskSource === 'HACKERONE') {
      const parts = [
        sourceMetadata?.scope?.assetType,
        sourceMetadata?.scope?.maxSeverity ? `max ${sourceMetadata.scope.maxSeverity}` : '',
        formatHackerOneRewardRange(sourceMetadata),
      ].filter(Boolean);
      return parts.join(' | ');
    }

    return '';
  }

  const statement = sourceMetadata?.statement ? normalizeErdosInlineText(sourceMetadata.statement) : '';
  if (!statement) {
    return '';
  }

  return options?.short ? shorten(statement, 140) : statement;
}

export function getTaskHeadingTitle(
  taskTitle: string,
  taskSource?: string | null,
  sourceMetadata?: TaskSourceMetadata | null,
) {
  if (taskSource === 'ERDOS_PROBLEM' && typeof sourceMetadata?.externalProblemId === 'number') {
    return `Erdos Problem #${sourceMetadata.externalProblemId}`;
  }

  return taskTitle;
}

export function getTaskSourceLabel(t: TFunction, source?: string | null) {
  if (!source) {
    return '';
  }

  if (source === 'ERDOS_PROBLEM') {
    return 'Erdos Problem';
  }

  return t(`tasks.sourceOptions.${source}`);
}
