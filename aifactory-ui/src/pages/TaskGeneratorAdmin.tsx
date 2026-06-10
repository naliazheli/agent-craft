import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { api, type GithubPublishPolicy, type TaskGeneratorRun } from '@/lib/api';
import { canAccessSystemArea } from '@/lib/system-access';
import { useAuthStore } from '@/store/auth';

const statusVariants: Record<string, 'default' | 'secondary' | 'warning' | 'success' | 'destructive'> = {
  PENDING: 'secondary',
  SCORING: 'warning',
  SCORED: 'default',
  PUBLISHED: 'success',
  SKIPPED: 'secondary',
  FAILED: 'destructive',
};

const processingVariants: Record<string, 'default' | 'secondary' | 'warning' | 'success' | 'destructive'> = {
  PENDING: 'secondary',
  SCORING: 'warning',
  READY_TO_PUBLISH: 'default',
  SCORED_ONLY: 'secondary',
  FILTERED: 'secondary',
  FAILED: 'destructive',
  PUBLISHED: 'success',
  SUBMITTED: 'warning',
  REVIEWING: 'warning',
  COMPLETED: 'success',
  CANCELLED: 'secondary',
  DISPUTED: 'destructive',
};

type AdminTab = 'batch' | 'raw' | 'policy';

const processingFilters = [
  '',
  'FILTERED',
  'READY_TO_PUBLISH',
  'SCORED_ONLY',
  'PUBLISHED',
  'SUBMITTED',
  'REVIEWING',
  'COMPLETED',
  'CANCELLED',
  'FAILED',
] as const;

const emptyPolicy: GithubPublishPolicy = {
  allowedRepos: [],
  blockedRepos: [],
  preferredLanguages: [],
  blockedLabels: [],
  blockedKeywords: [],
  blockedPlatforms: [],
  blockedBuildHints: [],
  preferredBuildHints: [],
  minimumRepoStars: 0,
  maximumIssueCommentCount: 10,
  maximumDifficultyScore: 6,
  maximumIssueCreatedAgeDays: 180,
  maximumIssueUpdatedAgeDays: 45,
  minimumExecutionSignal: 0,
  requireGithubCiOrBuildManifest: true,
  fetchSearchWindowDays: 30,
  fetchSearchCommentMultiplier: 2,
  fetchFallbackPageCount: 4,
  publishLimitPerCycle: 5,
};

function stringifyList(values: string[]) {
  return values.join(', ');
}

function parseList(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function numberOrZero(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeStringList(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => String(item).trim()).filter(Boolean)
    : [];
}

function asRecord(value: unknown): Record<string, any> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, any>) : null;
}

function getHackerOneMetadata(task: any) {
  const metadata = asRecord(task.sourceMetadata);
  return metadata?.source === 'hackerone' ? metadata : null;
}

function formatHackerOneRewardRange(range: any) {
  if (!range) return '';
  if (range.rawAmount) return range.rawAmount;
  if (range.minimum == null && range.maximum == null) return range.rawAmount || '';
  const prefix = range.currency ? `${range.currency} ` : '';
  if (range.minimum === range.maximum || range.minimum == null) return `${prefix}${range.maximum}`;
  return `${prefix}${range.minimum} - ${range.maximum}`;
}

function formatHours(value: any) {
  if (value == null) return '';
  if (Number(value) < 24) return `${value}h`;
  const days = Math.floor(Number(value) / 24);
  const hours = Math.round(Number(value) % 24);
  return hours ? `${days}d ${hours}h` : `${days}d`;
}

function HackerOneRawContext({ task }: { task: any }) {
  const metadata = getHackerOneMetadata(task);
  if (!metadata) return null;

  const scope = metadata.scope || {};
  const program = metadata.program || {};
  const rewardRange = formatHackerOneRewardRange(metadata.rewards?.scopeRange);
  const rewardRows = Array.isArray(metadata.rewards?.table) ? metadata.rewards.table : [];
  const bountyUpdatedAt = metadata.rewards?.bountyTable?.updatedAt;
  const highlights = metadata.program?.highlights || {};
  const highlightLabels = [
    highlights.fastPayment ? 'Fast Payment' : '',
    highlights.goldStandardSafeHarbor ? 'Gold Safe Harbor' : '',
    highlights.aiSafeHarbor ? 'AI Safe Harbor' : '',
    highlights.topResponseEfficiency ? 'Top Response Efficiency' : '',
    highlights.managedByHackerOne ? 'Managed by HackerOne' : '',
    highlights.collaborationEnabled ? 'Collaboration Enabled' : '',
    highlights.includesRetesting ? 'Includes Retesting' : '',
  ].filter(Boolean);
  const scopeExclusions = Array.isArray(metadata.policy?.scopeExclusions) ? metadata.policy.scopeExclusions : [];
  const platformExclusions = Array.isArray(metadata.policy?.platformStandardsExclusions)
    ? metadata.policy.platformStandardsExclusions
    : [];
  const requiredHeaders = Array.isArray(metadata.testing?.requiredHeaders) ? metadata.testing.requiredHeaders : [];
  const reportTemplate = Array.isArray(metadata.reportTemplate) ? metadata.reportTemplate : [];
  const safetyRules = [
    ...(Array.isArray(metadata.testing?.prohibitedActions) ? metadata.testing.prohibitedActions : []),
    ...(Array.isArray(metadata.testing?.safeTestingRules) ? metadata.testing.safeTestingRules : []),
  ];

  return (
    <details className="rounded-lg border bg-muted/20 p-3 text-sm" open={task.source === 'HACKERONE_PROGRAM'}>
      <summary className="cursor-pointer font-medium">HackerOne task context</summary>
      <div className="mt-3 space-y-3">
        <div className="grid gap-2 md:grid-cols-2">
          <div>
            <div className="text-xs text-muted-foreground">Program</div>
            <div className="font-medium">{program.name || task.repoName || '-'}</div>
            <div className="text-xs text-muted-foreground">{program.handle || task.repoName || '-'}</div>
            <div className="text-xs text-muted-foreground">
              assets {program.assetsInScope ?? '-'} | resolved {program.resolvedReportCount ?? '-'}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Target asset</div>
            <div className="break-all font-medium">{scope.assetIdentifier || '-'}</div>
            <div className="text-xs text-muted-foreground">
              {scope.assetType || '-'} | max {scope.maxSeverity || '-'} | reports {scope.totalResolvedReports ?? '-'}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Scope status</div>
            <div>
              submission {scope.eligibleForSubmission ? 'yes' : 'no'} | bounty {scope.eligibleForBounty ? 'yes' : 'no'}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">External bounty guidance</div>
            <div>{rewardRange || task.bountyCurrency || '-'}</div>
          </div>
        </div>

        {(highlightLabels.length > 0 || metadata.program?.responseTimes) && (
          <div>
            <div className="text-xs font-medium text-muted-foreground">Program signals</div>
            {highlightLabels.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-2">
                {highlightLabels.map((label: string) => (
                  <Badge key={label} variant="outline">
                    {label}
                  </Badge>
                ))}
              </div>
            )}
            {metadata.program?.responseTimes && (
              <div className="mt-1 text-xs text-muted-foreground">
                response {formatHours(metadata.program.responseTimes.firstResponseHours) || '-'} | triage{' '}
                {formatHours(metadata.program.responseTimes.triageHours) || '-'} | bounty{' '}
                {formatHours(metadata.program.responseTimes.bountyHours) || '-'} | resolution{' '}
                {formatHours(metadata.program.responseTimes.resolutionHours) || '-'}
              </div>
            )}
          </div>
        )}

        {metadata.policy?.scopeDescription && (
          <div>
            <div className="text-xs font-medium text-muted-foreground">Scope catalog note</div>
            <p className="mt-1 text-muted-foreground">{metadata.policy.scopeDescription}</p>
          </div>
        )}

        {scope.instruction && (
          <div>
            <div className="text-xs font-medium text-muted-foreground">Scope instructions</div>
            <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{scope.instruction}</p>
          </div>
        )}

        {rewardRows.length > 0 && (
          <div>
            <div className="text-xs font-medium text-muted-foreground">
              External reward table{bountyUpdatedAt ? ` (updated ${new Date(bountyUpdatedAt).toLocaleDateString()})` : ''}
            </div>
            <div className="mt-1 overflow-x-auto rounded-md border bg-background/70">
              <table className="w-full min-w-[480px] text-left text-xs">
                <thead className="border-b text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1.5">Severity</th>
                    <th className="px-2 py-1.5">Guidance</th>
                    <th className="px-2 py-1.5">90d avg.</th>
                    <th className="px-2 py-1.5">Reports</th>
                  </tr>
                </thead>
                <tbody>
                  {rewardRows.map((row: any) => (
                    <tr key={row.severity || row.label} className="border-b last:border-0">
                      <td className="px-2 py-1.5 font-medium">{row.label || row.severity}</td>
                      <td className="px-2 py-1.5 text-muted-foreground">{row.rawAmount || '-'}</td>
                      <td className="px-2 py-1.5 text-muted-foreground">
                        {row.averageBounty != null ? `$${row.averageBounty}` : '-'}
                      </td>
                      <td className="px-2 py-1.5 text-muted-foreground">{row.reportCount ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {requiredHeaders.length > 0 && (
          <div>
            <div className="text-xs font-medium text-muted-foreground">Required request headers</div>
            <div className="mt-1 flex flex-wrap gap-2">
              {requiredHeaders.map((header: any) => (
                <Badge key={`${header.name}-${header.value}`} variant="outline">
                  {header.name}: {header.value}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {(reportTemplate.length > 0 || safetyRules.length > 0) && (
          <div className="grid gap-3 md:grid-cols-2">
            {reportTemplate.length > 0 && (
              <div>
                <div className="text-xs font-medium text-muted-foreground">Report fields users must submit</div>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
                  {reportTemplate.slice(0, 6).map((item: string) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
            {safetyRules.length > 0 && (
              <div>
                <div className="text-xs font-medium text-muted-foreground">Safety constraints</div>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
                  {safetyRules.slice(0, 5).map((item: string) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {(scopeExclusions.length > 0 || platformExclusions.length > 0) && (
          <div className="grid gap-3 md:grid-cols-2">
            {scopeExclusions.length > 0 && (
              <div>
                <div className="text-xs font-medium text-muted-foreground">Scope exclusions</div>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
                  {scopeExclusions.slice(0, 6).map((item: any) => (
                    <li key={`${item.category}-${item.details}`}>
                      {item.category}
                      {item.details ? `: ${item.details.replace(/^•\\s*/, '')}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {platformExclusions.length > 0 && (
              <div>
                <div className="text-xs font-medium text-muted-foreground">Platform standards deviations</div>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
                  {platformExclusions.map((item: any) => (
                    <li key={`${item.standard}-${item.justification}`}>
                      {item.standard}
                      {item.justification ? `: ${item.justification}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </details>
  );
}

function formatActionMessage(action: string, result: any) {
  if (action === 'Fetch') {
    return `Fetch completed. Added or refreshed ${result?.fetched ?? 0} raw tasks, skipped ${result?.skipped ?? 0}. Fetched items first enter Raw Tasks; only scored and published items appear in Task Marketplace.`;
  }

  if (action === 'Score') {
    return `Score completed. Scored ${result?.scored ?? 0}, failed ${result?.failed ?? 0}. Only items marked SCORED and shouldPublish=true can move on to publishing.`;
  }

  if (action === 'Publish') {
    return `Publish completed. Published ${result?.published ?? 0}, skipped ${result?.skipped ?? 0}. If Marketplace is still empty, check Raw Tasks for SKIPPED reasons or tighten/relax the publish policy.`;
  }

  return `${action} completed: ${JSON.stringify(result)}`;
}

export function TaskGeneratorAdmin() {
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const authLoading = useAuthStore((s) => s.isLoading);
  const normalizedEmail = user?.email?.toLowerCase() || '';
  const canAccessTaskGenerator = canAccessSystemArea(user);

  const [activeTab, setActiveTab] = useState<AdminTab>('batch');
  const [repos, setRepos] = useState('');
  const [limit, setLimit] = useState('10');
  const [hackerOneHandles, setHackerOneHandles] = useState('');
  const [hackerOneLimit, setHackerOneLimit] = useState('30');
  const [hackerOneScopeLimit, setHackerOneScopeLimit] = useState('100');
  const [batchSize, setBatchSize] = useState('20');
  const [statusFilter, setStatusFilter] = useState('');
  const [processingFilter, setProcessingFilter] = useState('');
  const [handledOnly, setHandledOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [recentRuns, setRecentRuns] = useState<TaskGeneratorRun[]>([]);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [rawTasks, setRawTasks] = useState<any[]>([]);
  const [meta, setMeta] = useState<{ total: number; page: number; limit: number; totalPages: number } | null>(null);
  const [rawTaskStats, setRawTaskStats] = useState<{
    totals: {
      total: number;
      published: number;
      filtered: number;
      withSubmissions: number;
      byStatus: Record<string, number>;
      byProcessingStage: Record<string, number>;
    };
    repos: Array<{
      repo: string;
      total: number;
      filtered: number;
      published: number;
      withSubmissions: number;
      completed: number;
    }>;
  } | null>(null);
  const [policy, setPolicy] = useState<GithubPublishPolicy>(emptyPolicy);
  const [policyForm, setPolicyForm] = useState({
    allowedRepos: '',
    blockedRepos: '',
    preferredLanguages: '',
    blockedLabels: '',
    blockedKeywords: '',
    blockedPlatforms: '',
    blockedBuildHints: '',
    preferredBuildHints: '',
    minimumRepoStars: '0',
    maximumIssueCommentCount: '10',
    maximumDifficultyScore: '6',
    maximumIssueCreatedAgeDays: '180',
    maximumIssueUpdatedAgeDays: '45',
    minimumExecutionSignal: '0',
    requireGithubCiOrBuildManifest: true,
    fetchSearchWindowDays: '30',
    fetchSearchCommentMultiplier: '2',
    fetchFallbackPageCount: '4',
    publishLimitPerCycle: '5',
  });

  const canRun = useMemo(() => loading === null, [loading]);

  const syncPolicyForm = (nextPolicy: GithubPublishPolicy) => {
    setPolicy(nextPolicy);
    setPolicyForm({
      allowedRepos: stringifyList(nextPolicy.allowedRepos),
      blockedRepos: stringifyList(nextPolicy.blockedRepos),
      preferredLanguages: stringifyList(nextPolicy.preferredLanguages),
      blockedLabels: stringifyList(nextPolicy.blockedLabels),
      blockedKeywords: stringifyList(nextPolicy.blockedKeywords),
      blockedPlatforms: stringifyList(nextPolicy.blockedPlatforms),
      blockedBuildHints: stringifyList(nextPolicy.blockedBuildHints),
      preferredBuildHints: stringifyList(nextPolicy.preferredBuildHints),
      minimumRepoStars: String(nextPolicy.minimumRepoStars),
      maximumIssueCommentCount: String(nextPolicy.maximumIssueCommentCount),
      maximumDifficultyScore: String(nextPolicy.maximumDifficultyScore),
      maximumIssueCreatedAgeDays: String(nextPolicy.maximumIssueCreatedAgeDays),
      maximumIssueUpdatedAgeDays: String(nextPolicy.maximumIssueUpdatedAgeDays),
      minimumExecutionSignal: String(nextPolicy.minimumExecutionSignal),
      requireGithubCiOrBuildManifest: nextPolicy.requireGithubCiOrBuildManifest,
      fetchSearchWindowDays: String(nextPolicy.fetchSearchWindowDays),
      fetchSearchCommentMultiplier: String(nextPolicy.fetchSearchCommentMultiplier),
      fetchFallbackPageCount: String(nextPolicy.fetchFallbackPageCount),
      publishLimitPerCycle: String(nextPolicy.publishLimitPerCycle),
    });
  };

  const loadRawTasks = async (
    nextPage = page,
    nextStatus = statusFilter,
    nextProcessing = processingFilter,
    nextHandledOnly = handledOnly,
  ) => {
    const res = await api.taskGenerator.listRawTasks({
      page: String(nextPage),
      limit: '20',
      ...(nextStatus ? { status: nextStatus } : {}),
      ...(nextProcessing ? { processingStage: nextProcessing } : {}),
      ...(nextHandledOnly ? { handledOnly: 'true' } : {}),
    });
    setRawTasks(res.data);
    setMeta(res.meta);
  };

  const loadRawTaskStats = async (
    nextStatus = statusFilter,
    nextProcessing = processingFilter,
    nextHandledOnly = handledOnly,
  ) => {
    const res = await api.taskGenerator.getRawTaskStats({
      ...(nextStatus ? { status: nextStatus } : {}),
      ...(nextProcessing ? { processingStage: nextProcessing } : {}),
      ...(nextHandledOnly ? { handledOnly: 'true' } : {}),
    });
    setRawTaskStats(res);
  };

  const loadPolicy = async () => {
    const res = await api.taskGenerator.getGithubPolicy();
    syncPolicyForm(res);
  };

  const loadRuns = async () => {
    const res = await api.taskGenerator.listRuns(12);
    setRecentRuns(res);
  };

  useEffect(() => {
    if (!canAccessTaskGenerator) return;
    loadRawTasks(1, statusFilter, processingFilter, handledOnly).catch((err) =>
      setMessage(err.message || 'Failed to load raw tasks.'),
    );
    loadRawTaskStats(statusFilter, processingFilter, handledOnly).catch((err) =>
      setMessage(err.message || 'Failed to load raw task stats.'),
    );
    loadRuns().catch((err) => setMessage(err.message || 'Failed to load task-generator runs.'));
  }, [canAccessTaskGenerator, statusFilter, processingFilter, handledOnly]);

  useEffect(() => {
    if (!canAccessTaskGenerator) return;
    loadPolicy().catch((err) => setMessage(err.message || 'Failed to load GitHub policy.'));
  }, [canAccessTaskGenerator]);

  useEffect(() => {
    if (!activeRunId || !canAccessTaskGenerator) return;

    let cancelled = false;
    const timer = window.setInterval(async () => {
      try {
        const run = await api.taskGenerator.getRun(activeRunId);
        if (cancelled) return;
        await loadRuns();
        if (run.status === 'COMPLETED') {
          setLoading(null);
          setActiveRunId(null);
          setMessage(`Run completed: ${JSON.stringify(run.result ?? {})}`);
          await Promise.all([
            loadRawTasks(1, statusFilter, processingFilter, handledOnly),
            loadRawTaskStats(statusFilter, processingFilter, handledOnly),
          ]);
          setPage(1);
        } else if (run.status === 'FAILED') {
          setLoading(null);
          setActiveRunId(null);
          setMessage(run.error || 'Run failed.');
        }
      } catch (err: any) {
        if (!cancelled) {
          setLoading(null);
          setActiveRunId(null);
          setMessage(err?.message || 'Failed to refresh run status.');
        }
      }
    }, 2500);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeRunId, canAccessTaskGenerator, handledOnly, processingFilter, statusFilter]);

  const queueRun = async (
    action: string,
    payload: Parameters<typeof api.taskGenerator.createRun>[0],
  ) => {
    setLoading(action);
    try {
      const run = await api.taskGenerator.createRun(payload);
      setActiveRunId(run.id);
      setMessage(`${action} queued. Run id: ${run.id}`);
      await loadRuns();
    } catch (err: any) {
      setMessage(err?.message || `${action} failed`);
    }
  };

  const savePolicy = async () => {
    setLoading('save-policy');
    try {
      const payload: GithubPublishPolicy = {
        allowedRepos: parseList(policyForm.allowedRepos),
        blockedRepos: parseList(policyForm.blockedRepos),
        preferredLanguages: parseList(policyForm.preferredLanguages),
        blockedLabels: parseList(policyForm.blockedLabels),
        blockedKeywords: parseList(policyForm.blockedKeywords),
        blockedPlatforms: parseList(policyForm.blockedPlatforms),
        blockedBuildHints: parseList(policyForm.blockedBuildHints),
        preferredBuildHints: parseList(policyForm.preferredBuildHints),
        minimumRepoStars: numberOrZero(policyForm.minimumRepoStars),
        maximumIssueCommentCount: numberOrZero(policyForm.maximumIssueCommentCount),
        maximumDifficultyScore: numberOrZero(policyForm.maximumDifficultyScore),
        maximumIssueCreatedAgeDays: numberOrZero(policyForm.maximumIssueCreatedAgeDays),
        maximumIssueUpdatedAgeDays: numberOrZero(policyForm.maximumIssueUpdatedAgeDays),
        minimumExecutionSignal: numberOrZero(policyForm.minimumExecutionSignal),
        requireGithubCiOrBuildManifest: policyForm.requireGithubCiOrBuildManifest,
        fetchSearchWindowDays: numberOrZero(policyForm.fetchSearchWindowDays),
        fetchSearchCommentMultiplier: numberOrZero(policyForm.fetchSearchCommentMultiplier),
        fetchFallbackPageCount: numberOrZero(policyForm.fetchFallbackPageCount),
        publishLimitPerCycle: numberOrZero(policyForm.publishLimitPerCycle),
      };
      const next = await api.taskGenerator.updateGithubPolicy(payload);
      syncPolicyForm(next);
      setMessage('GitHub publish policy updated.');
    } catch (err: any) {
      setMessage(err?.message || 'Failed to update GitHub policy.');
    } finally {
      setLoading(null);
    }
  };

  if (!user && (authLoading || token)) {
    return (
      <div className="container py-8">
        <Card>
          <CardHeader>
            <CardTitle>Task Generator</CardTitle>
            <CardDescription>Checking system account access...</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-2 w-40 rounded-full bg-muted">
              <div className="h-2 w-16 animate-pulse rounded-full bg-primary" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!canAccessTaskGenerator) {
    return (
      <div className="container py-8">
        <Card>
          <CardHeader>
            <CardTitle>Task Generator</CardTitle>
            <CardDescription>Only administrators or the configured system account can access this page.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Current account is neither an admin nor one of the configured system aliases.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container space-y-6 py-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Task Generator</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Fetch GitHub issues or HackerOne bounty scopes, score them, publish viable tasks, and tune the live publish policy.
          </p>
        </div>
        <Badge variant="warning">{user?.role === 'ADMIN' ? 'ADMIN' : normalizedEmail}</Badge>
      </div>

      <div className="flex gap-2 border-b pb-3">
        <Button variant={activeTab === 'batch' ? 'default' : 'outline'} onClick={() => setActiveTab('batch')}>
          Batch Runs
        </Button>
        <Button variant={activeTab === 'raw' ? 'default' : 'outline'} onClick={() => setActiveTab('raw')}>
          Raw Tasks
        </Button>
        <Button variant={activeTab === 'policy' ? 'default' : 'outline'} onClick={() => setActiveTab('policy')}>
          Publish Policy
        </Button>
      </div>

      {message && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm">{message}</p>
          </CardContent>
        </Card>
      )}

      {activeTab === 'batch' && (
        <div className="grid gap-6 xl:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Fetch GitHub Issues</CardTitle>
              <CardDescription>
                Enter one or more repositories separated by commas, for example `facebook/react,vercel/next.js`.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Repositories</label>
                <Input
                  value={repos}
                  onChange={(e) => setRepos(e.target.value)}
                  placeholder="facebook/react,vercel/next.js"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Fetch Limit</label>
                <Input value={limit} onChange={(e) => setLimit(e.target.value)} type="number" min="1" />
              </div>
              <Button
                disabled={!canRun}
                onClick={() =>
                    queueRun('Fetch', {
                      type: 'FETCH_GITHUB',
                      repos: repos.trim() || undefined,
                      limit: limit ? Number(limit) : undefined,
                    })
                }
              >
                {loading === 'Fetch' ? 'Fetching...' : 'Start Fetch'}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
	              <CardTitle>Fetch HackerOne Scopes</CardTitle>
	              <CardDescription>
	                Enter program handles separated by commas. Imported raw tasks now keep program policy, scope fields,
	                reward guidance, testing headers, and report requirements.
	              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Program Handles</label>
                <Input
	                  value={hackerOneHandles}
	                  onChange={(e) => setHackerOneHandles(e.target.value)}
	                  placeholder="coupang_tw,gitlab,shopify"
	                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Program Limit</label>
                  <Input
                    value={hackerOneLimit}
                    onChange={(e) => setHackerOneLimit(e.target.value)}
                    type="number"
                    min="1"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Scope Limit</label>
                  <Input
                    value={hackerOneScopeLimit}
                    onChange={(e) => setHackerOneScopeLimit(e.target.value)}
                    type="number"
                    min="1"
                  />
                </div>
              </div>
              <Button
                disabled={!canRun}
                onClick={() =>
                  queueRun('Fetch HackerOne', {
                    type: 'FETCH_HACKERONE',
                    handles: hackerOneHandles.trim() || undefined,
                    limit: hackerOneLimit ? Number(hackerOneLimit) : undefined,
                    scopeLimit: hackerOneScopeLimit ? Number(hackerOneScopeLimit) : undefined,
                  })
                }
              >
                {loading === 'Fetch HackerOne' ? 'Fetching...' : 'Start HackerOne Fetch'}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Score and Publish</CardTitle>
              <CardDescription>Run scoring and publishing separately or as a single pipeline.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Scoring Batch Size</label>
                <Input value={batchSize} onChange={(e) => setBatchSize(e.target.value)} type="number" min="1" />
              </div>
              <div className="flex flex-wrap gap-3">
                <Button
                  disabled={!canRun}
                  onClick={() =>
                    queueRun('Score', {
                      type: 'SCORE',
                      batchSize: batchSize ? Number(batchSize) : 20,
                    })
                  }
                >
                  {loading === 'Score' ? 'Scoring...' : 'Score Only'}
                </Button>
                <Button
                  variant="secondary"
                  disabled={!canRun}
                  onClick={() => queueRun('Publish', { type: 'PUBLISH' })}
                >
                  {loading === 'Publish' ? 'Publishing...' : 'Publish Only'}
                </Button>
                <Button
                  variant="outline"
                  disabled={!canRun}
                  onClick={() =>
                    queueRun('Pipeline', {
                      type: 'SCORE_AND_PUBLISH',
                      batchSize: batchSize ? Number(batchSize) : 20,
                    })
                  }
                >
                  {loading === 'Pipeline' ? 'Running...' : 'Score Then Publish'}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="xl:col-span-3">
            <CardHeader>
              <CardTitle>Pipeline Notes</CardTitle>
              <CardDescription>
                Running fetch alone will not create marketplace tasks. The publishing pipeline is <code>Fetch -&gt; Score -&gt; Publish</code>.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
	              <p>New GitHub issues first land in Raw Tasks.</p>
	              <p>
	                New HackerOne scopes also land in Raw Tasks with their original HackerOne source id, target asset,
	                program policy excerpt, reward table, testing requirements, and report checklist.
	              </p>
              <p>Only rows that become `SCORED` and `shouldPublish=true` are converted into marketplace tasks.</p>
              <p>
                If you see `SKIPPED`, open the Raw Tasks tab and check the publish reasons. Common causes are blocked
                labels like `Status: Unconfirmed`, stale issues, or policy thresholds that are too strict.
              </p>
              <p>Batch actions now run in the background. If the request returns quickly, the run may still be processing below.</p>
            </CardContent>
          </Card>

          <Card className="xl:col-span-3">
            <CardHeader>
              <CardTitle>Recent Runs</CardTitle>
              <CardDescription>Background fetch/score/publish runs persist here so the UI no longer depends on a long-lived gateway request.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {recentRuns.length === 0 ? (
                <p className="text-sm text-muted-foreground">No runs yet.</p>
              ) : (
                recentRuns.map((run) => (
                  <div key={run.id} className="rounded-lg border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-medium">{run.type}</div>
                      <Badge variant={run.status === 'FAILED' ? 'destructive' : run.status === 'COMPLETED' ? 'success' : run.status === 'RUNNING' ? 'warning' : 'secondary'}>
                        {run.status}
                      </Badge>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      created: {new Date(run.createdAt).toLocaleString()}
                      {run.startedAt ? ` | started: ${new Date(run.startedAt).toLocaleString()}` : ''}
                      {run.finishedAt ? ` | finished: ${new Date(run.finishedAt).toLocaleString()}` : ''}
                    </div>
                    {run.input && <div className="mt-2 text-xs text-muted-foreground">input: {JSON.stringify(run.input)}</div>}
                    {run.result && <div className="mt-2 text-xs text-muted-foreground">result: {JSON.stringify(run.result)}</div>}
                    {run.error && <div className="mt-2 text-sm text-destructive">{run.error}</div>}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'raw' && (
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle>Raw Task Queue</CardTitle>
                <CardDescription>Review fetch, scoring, and publish status for incoming task sources.</CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                {['', 'PENDING', 'SCORING', 'SCORED', 'PUBLISHED', 'SKIPPED', 'FAILED'].map((status) => (
                  <Button
                    key={status || 'ALL'}
                    variant={statusFilter === status ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      setStatusFilter(status);
                      setPage(1);
                    }}
                  >
                    {status || 'ALL'}
                  </Button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={handledOnly ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    setHandledOnly((value) => !value);
                    setPage(1);
                  }}
                >
                  {handledOnly ? 'Handled Only' : 'Show All'}
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {processingFilters.map((stage) => (
                <Button
                  key={stage || 'ALL_LIFECYCLE'}
                  variant={processingFilter === stage ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    setProcessingFilter(stage);
                    setPage(1);
                  }}
                >
                  {stage || 'ALL LIFECYCLE'}
                </Button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {rawTaskStats && (
              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">Visible Raw Tasks</div>
                  <div className="mt-1 text-2xl font-semibold">{rawTaskStats.totals.total}</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">Published</div>
                  <div className="mt-1 text-2xl font-semibold">{rawTaskStats.totals.published}</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">Filtered</div>
                  <div className="mt-1 text-2xl font-semibold">{rawTaskStats.totals.filtered}</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">With Submissions</div>
                  <div className="mt-1 text-2xl font-semibold">{rawTaskStats.totals.withSubmissions}</div>
                </div>
              </div>
            )}

            {rawTaskStats && rawTaskStats.repos.length > 0 && (
              <div className="space-y-2 rounded-lg border p-4">
                <div className="text-sm font-medium">Source Breakdown</div>
                <div className="space-y-2">
                  {rawTaskStats.repos.slice(0, 8).map((repo) => (
                    <div key={repo.repo} className="flex flex-col gap-1 text-sm md:flex-row md:items-center md:justify-between">
                      <div className="font-medium">{repo.repo}</div>
                      <div className="text-muted-foreground">
                        total {repo.total} | filtered {repo.filtered} | published {repo.published} | submissions {repo.withSubmissions} | completed {repo.completed}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-3">
              {rawTasks.length === 0 ? (
                <p className="text-sm text-muted-foreground">No raw tasks found.</p>
              ) : (
                rawTasks.map((task) => (
                  <div key={task.id} className="space-y-2 rounded-lg border p-4">
                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                      <div className="space-y-1">
                        <div className="font-medium">{task.title}</div>
                        <div className="text-xs text-muted-foreground">
                          {task.source ? `${task.source} | ` : ''}
                          {task.repoOwner && task.repoName ? `${task.repoOwner}/${task.repoName}` : 'Unknown source'} #
                          {task.externalId}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant={statusVariants[task.status] || 'secondary'}>{task.status}</Badge>
                        {task.processingStage && (
                          <Badge variant={processingVariants[task.processingStage] || 'secondary'}>
                            {task.processingLabel || task.processingStage}
                          </Badge>
                        )}
                      </div>
                    </div>
	                    <div className="text-sm text-muted-foreground">
	                      difficulty: {task.difficultyScore ?? '-'} | value: {task.valueScore ?? '-'} | reward:{' '}
	                      {task.estimatedReward ?? '-'}
	                    </div>
	                    {(() => {
	                      const metadata = getHackerOneMetadata(task);
	                      if (!metadata) return null;
	                      const scope = metadata.scope || {};
	                      const rewardRange = formatHackerOneRewardRange(metadata.rewards?.scopeRange);
	                      return (
	                        <div className="flex flex-wrap gap-2 text-xs">
	                          {scope.assetIdentifier && <Badge variant="outline">asset: {scope.assetIdentifier}</Badge>}
	                          {scope.assetType && <Badge variant="outline">type: {scope.assetType}</Badge>}
	                          {scope.maxSeverity && <Badge variant="outline">max severity: {scope.maxSeverity}</Badge>}
	                          {rewardRange && <Badge variant="outline">external bounty: {rewardRange}</Badge>}
	                        </div>
	                      );
	                    })()}
	                    {(task.publishedTask || task.submissionStats) && (
	                      <div className="text-sm text-muted-foreground">
	                        platform task: {task.publishedTask?.status || '-'} | submissions:{' '}
                        {Object.values(task.submissionStats || {}).reduce(
                          (total: number, count) => total + Number(count || 0),
                          0,
                        )}
                      </div>
                    )}
                    {normalizeStringList(task.publishReasons).length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {normalizeStringList(task.publishReasons).map((reason) => (
                          <Badge key={reason} variant="outline">
                            {reason}
                          </Badge>
                        ))}
                      </div>
	                    )}
	                    {task.aiSummary && <p className="text-sm">{task.aiSummary}</p>}
	                    <HackerOneRawContext task={task} />
	                    {task.externalUrl && (
	                      <a
                        href={task.externalUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm text-primary hover:underline"
                      >
                        View Source
                      </a>
                    )}
                  </div>
                ))
              )}
            </div>

            {meta && meta.totalPages > 1 && (
              <div className="flex items-center justify-between pt-2">
                <p className="text-sm text-muted-foreground">
                  Page {meta.page} / {meta.totalPages}, total {meta.total}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={meta.page <= 1}
                    onClick={async () => {
                      const nextPage = Math.max(1, page - 1);
                      setPage(nextPage);
                      await loadRawTasks(nextPage, statusFilter, processingFilter, handledOnly);
                    }}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={meta.page >= meta.totalPages}
                    onClick={async () => {
                      const nextPage = page + 1;
                      setPage(nextPage);
                      await loadRawTasks(nextPage, statusFilter, processingFilter, handledOnly);
                    }}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === 'policy' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Repository Policy</CardTitle>
              <CardDescription>Control which repositories are eligible and which signals are preferred.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Allowed Repositories</label>
                <Input
                  value={policyForm.allowedRepos}
                  onChange={(e) => setPolicyForm((prev) => ({ ...prev, allowedRepos: e.target.value }))}
                  placeholder="facebook/react,vercel/next.js"
                />
                <p className="text-xs text-muted-foreground">Leave empty only if you want fetch requests to decide the scope.</p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Blocked Repositories</label>
                <Input
                  value={policyForm.blockedRepos}
                  onChange={(e) => setPolicyForm((prev) => ({ ...prev, blockedRepos: e.target.value }))}
                  placeholder="owner/repo"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Preferred Languages</label>
                <Input
                  value={policyForm.preferredLanguages}
                  onChange={(e) => setPolicyForm((prev) => ({ ...prev, preferredLanguages: e.target.value }))}
                  placeholder="TypeScript,JavaScript,Python,Go"
                />
              </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Preferred Build Hints</label>
                <Input
                  value={policyForm.preferredBuildHints}
                  onChange={(e) => setPolicyForm((prev) => ({ ...prev, preferredBuildHints: e.target.value }))}
                  placeholder="node,pnpm,pytest,go"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Blocked Build Hints</label>
                <Input
                  value={policyForm.blockedBuildHints}
                  onChange={(e) => setPolicyForm((prev) => ({ ...prev, blockedBuildHints: e.target.value }))}
                  placeholder="bazel,android,ios"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Issue Filters</CardTitle>
              <CardDescription>Adjust freshness, difficulty signals, and environment requirements.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Blocked Labels</label>
                <Input
                  value={policyForm.blockedLabels}
                  onChange={(e) => setPolicyForm((prev) => ({ ...prev, blockedLabels: e.target.value }))}
                  placeholder="Status: Unconfirmed,needs triage,question"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Blocked Keywords</label>
                <Input
                  value={policyForm.blockedKeywords}
                  onChange={(e) => setPolicyForm((prev) => ({ ...prev, blockedKeywords: e.target.value }))}
                  placeholder="question,needs triage"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Blocked Platforms</label>
                <Input
                  value={policyForm.blockedPlatforms}
                  onChange={(e) => setPolicyForm((prev) => ({ ...prev, blockedPlatforms: e.target.value }))}
                  placeholder="apple silicon,ios,android,windows only"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Minimum Repo Stars</label>
                  <Input
                    value={policyForm.minimumRepoStars}
                    onChange={(e) => setPolicyForm((prev) => ({ ...prev, minimumRepoStars: e.target.value }))}
                    type="number"
                    min="0"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Minimum Execution Signal</label>
                  <Input
                    value={policyForm.minimumExecutionSignal}
                    onChange={(e) => setPolicyForm((prev) => ({ ...prev, minimumExecutionSignal: e.target.value }))}
                    type="number"
                    min="0"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Max Issue Comments</label>
                  <Input
                    value={policyForm.maximumIssueCommentCount}
                    onChange={(e) => setPolicyForm((prev) => ({ ...prev, maximumIssueCommentCount: e.target.value }))}
                    type="number"
                    min="0"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Max Difficulty Score</label>
                  <Input
                    value={policyForm.maximumDifficultyScore}
                    onChange={(e) => setPolicyForm((prev) => ({ ...prev, maximumDifficultyScore: e.target.value }))}
                    type="number"
                    min="1"
                    max="10"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Max Issue Age (Created)</label>
                  <Input
                    value={policyForm.maximumIssueCreatedAgeDays}
                    onChange={(e) => setPolicyForm((prev) => ({ ...prev, maximumIssueCreatedAgeDays: e.target.value }))}
                    type="number"
                    min="0"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Max Issue Age (Updated)</label>
                  <Input
                    value={policyForm.maximumIssueUpdatedAgeDays}
                    onChange={(e) => setPolicyForm((prev) => ({ ...prev, maximumIssueUpdatedAgeDays: e.target.value }))}
                    type="number"
                    min="0"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Fetch Search Window (Days)</label>
                  <Input
                    value={policyForm.fetchSearchWindowDays}
                    onChange={(e) => setPolicyForm((prev) => ({ ...prev, fetchSearchWindowDays: e.target.value }))}
                    type="number"
                    min="1"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Fetch Comment Multiplier</label>
                  <Input
                    value={policyForm.fetchSearchCommentMultiplier}
                    onChange={(e) => setPolicyForm((prev) => ({ ...prev, fetchSearchCommentMultiplier: e.target.value }))}
                    type="number"
                    min="1"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Fallback Page Count</label>
                  <Input
                    value={policyForm.fetchFallbackPageCount}
                    onChange={(e) => setPolicyForm((prev) => ({ ...prev, fetchFallbackPageCount: e.target.value }))}
                    type="number"
                    min="1"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Publish Limit Per Cycle</label>
                  <Input
                    value={policyForm.publishLimitPerCycle}
                    onChange={(e) => setPolicyForm((prev) => ({ ...prev, publishLimitPerCycle: e.target.value }))}
                    type="number"
                    min="1"
                  />
                </div>
              </div>
              <label className="flex items-center gap-3 rounded-md border p-3 text-sm">
                <input
                  type="checkbox"
                  checked={policyForm.requireGithubCiOrBuildManifest}
                  onChange={(e) =>
                    setPolicyForm((prev) => ({
                      ...prev,
                      requireGithubCiOrBuildManifest: e.target.checked,
                    }))
                  }
                />
                Require GitHub CI or a detectable build manifest before publishing.
              </label>
              <div className="flex gap-3">
                <Button disabled={!canRun} onClick={() => savePolicy()}>
                  {loading === 'save-policy' ? 'Saving...' : 'Save Policy'}
                </Button>
                <Button
                  variant="outline"
                  disabled={!canRun}
                  onClick={async () => {
                    setLoading('reload-policy');
                    try {
                      await loadPolicy();
                      setMessage('GitHub publish policy reloaded from database.');
                    } catch (err: any) {
                      setMessage(err?.message || 'Failed to reload GitHub policy.');
                    } finally {
                      setLoading(null);
                    }
                  }}
                >
                  {loading === 'reload-policy' ? 'Reloading...' : 'Reload from Database'}
                </Button>
              </div>
              <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
                Current policy snapshot: {JSON.stringify(policy)}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
