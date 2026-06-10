import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
  Activity,
  Bot,
  ChevronLeft,
  ChevronRight,
  FolderKanban,
  KeyRound,
  Mail,
  MousePointerClick,
  RefreshCw,
  Search,
  ShieldCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { api, type OperationsOverview, type OperationsUserListItem } from '@/lib/api';
import { canAccessSystemArea } from '@/lib/system-access';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';

const pageSize = 20;

function numberFormat(value: number | undefined) {
  return new Intl.NumberFormat().format(value || 0);
}

function formatDateTime(value?: string | null) {
  if (!value) return 'Never';
  return new Date(value).toLocaleString();
}

function formatShortDate(value: string) {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function percentFormat(value?: number | null) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'n/a';
  return new Intl.NumberFormat(undefined, {
    style: 'percent',
    maximumFractionDigits: 1,
  }).format(value);
}

function MetricCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className="h-4 w-4 text-primary" />
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-bold tracking-tight">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

function FunnelStep({
  icon: Icon,
  label,
  value,
  hint,
  rate,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  hint: string;
  rate: string;
}) {
  return (
    <div className="rounded-md border bg-background p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="mt-2 text-2xl font-bold tracking-tight">{value}</p>
        </div>
        <Icon className="h-4 w-4 shrink-0 text-primary" />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{hint}</p>
      <p className="mt-3 text-xs font-medium text-foreground">{rate}</p>
    </div>
  );
}

function UserRow({ user }: { user: OperationsUserListItem }) {
  return (
    <tr className="border-t">
      <td className="px-4 py-3">
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium">{user.email}</span>
          <span className="truncate text-xs text-muted-foreground">
            {user.displayName || user.githubLogin || 'No public name'}
          </span>
        </div>
      </td>
      <td className="px-4 py-3">
        <Badge variant={user.role === 'ADMIN' ? 'default' : user.role === 'AI_AGENT' ? 'secondary' : 'outline'}>
          {user.role}
        </Badge>
      </td>
      <td className="px-4 py-3 text-sm text-muted-foreground">
        {user.authProvider || 'email'}
      </td>
      <td className="px-4 py-3 text-right text-sm text-muted-foreground">
        {formatDateTime(user.createdAt)}
      </td>
    </tr>
  );
}

export function OperationsMonitor() {
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const authLoading = useAuthStore((s) => s.isLoading);
  const canAccess = canAccessSystemArea(user);
  const [overview, setOverview] = useState<OperationsOverview | null>(null);
  const [users, setUsers] = useState<OperationsUserListItem[]>([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, limit: pageSize, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const maxVisitCount = useMemo(
    () => Math.max(1, ...(overview?.homepageVisits.last7Days.map((day) => day.count) || [0])),
    [overview],
  );

  const loadData = async (nextPage = page, nextQuery = query) => {
    setLoading(true);
    setMessage('');
    try {
      const [nextOverview, userList] = await Promise.all([
        api.operations.overview(),
        api.operations.users({
          page: String(nextPage),
          limit: String(pageSize),
          ...(nextQuery ? { q: nextQuery } : {}),
        }),
      ]);
      setOverview(nextOverview);
      setUsers(userList.data);
      setMeta(userList.meta);
      setPage(userList.meta.page);
    } catch (err: any) {
      setMessage(err?.message || 'Failed to load operations metrics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!canAccess) return;
    loadData(1, query);
  }, [canAccess, query]);

  const applySearch = () => {
    setPage(1);
    setQuery(searchInput.trim());
  };

  if (!user && (authLoading || token)) {
    return (
      <div className="container py-8">
        <Card>
          <CardHeader>
            <CardTitle>Operations Monitor</CardTitle>
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

  if (!canAccess) {
    return (
      <div className="container py-8">
        <Card>
          <CardHeader>
            <CardTitle>Operations Monitor</CardTitle>
            <CardDescription>Only administrators or the configured system account can access this page.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Current account is not authorized to view registration and traffic metrics.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container space-y-6 py-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" />
            <h1 className="text-3xl font-bold tracking-tight">Operations Monitor</h1>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Track launch traffic and registered accounts before promotion ramps up.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="gap-1">
            <ShieldCheck className="h-3.5 w-3.5" />
            {user.role === 'ADMIN' ? 'ADMIN' : user.email}
          </Badge>
          <Button variant="outline" size="sm" onClick={() => loadData(page, query)} disabled={loading}>
            <RefreshCw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </div>

      {message && (
        <Card className="border-destructive/40">
          <CardContent className="py-4 text-sm text-destructive">{message}</CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard
          icon={Activity}
          label="Homepage visits"
          value={numberFormat(overview?.homepageVisits.total)}
          hint={`Today: ${numberFormat(overview?.homepageVisits.today)}`}
        />
        <MetricCard
          icon={Users}
          label="Registered users"
          value={numberFormat(overview?.users.total)}
          hint={`New today: ${numberFormat(overview?.users.newToday)}`}
        />
        <MetricCard
          icon={UserPlus}
          label="New users in 7 days"
          value={numberFormat(overview?.users.newLast7Days)}
          hint="UTC day window"
        />
        <MetricCard
          icon={Mail}
          label="Registered emails"
          value={numberFormat(meta.total)}
          hint={query ? `Filtered by "${query}"` : 'All visible accounts'}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Promotion Funnel</CardTitle>
          <CardDescription>Homepage entry, project creation, lead-agent launch, and LLM setup.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <FunnelStep
              icon={MousePointerClick}
              label="Entered"
              value={numberFormat(overview?.funnel.entered)}
              hint="Homepage visits tracked"
              rate="Baseline"
            />
            <FunnelStep
              icon={FolderKanban}
              label="Built projects"
              value={numberFormat(overview?.funnel.projectCreators)}
              hint={`${numberFormat(overview?.funnel.projectsCreated)} total projects`}
              rate={`${percentFormat(overview?.funnel.conversion.visitToProjectCreator)} of entries`}
            />
            <FunnelStep
              icon={Bot}
              label="Lead agent launched"
              value={numberFormat(overview?.funnel.leadAgentLaunchedProjects)}
              hint={`${numberFormat(overview?.funnel.leadAgentsLaunched)} launch requests`}
              rate={`${percentFormat(overview?.funnel.conversion.projectToLeadAgentLaunch)} of projects`}
            />
            <FunnelStep
              icon={KeyRound}
              label="LLM configured"
              value={numberFormat(overview?.funnel.llmConfiguredUsers)}
              hint={`${numberFormat(overview?.funnel.activeLlmConfigs)} active configs`}
              rate={`${percentFormat(overview?.funnel.conversion.projectCreatorToLlmConfigured)} of project creators`}
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <CardHeader>
            <CardTitle>Registered Emails</CardTitle>
            <CardDescription>Paginated account list for launch operations.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') applySearch();
                  }}
                  placeholder="Search email, display name, or GitHub login"
                  className="pl-9"
                />
              </div>
              <Button onClick={applySearch} disabled={loading}>
                Search
              </Button>
            </div>

            <div className="overflow-x-auto rounded-md border">
              <table className="w-full min-w-[720px] text-left">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Email</th>
                    <th className="px-4 py-3 font-medium">Role</th>
                    <th className="px-4 py-3 font-medium">Provider</th>
                    <th className="px-4 py-3 text-right font-medium">Registered</th>
                  </tr>
                </thead>
                <tbody>
                  {users.length ? (
                    users.map((item) => <UserRow key={item.id} user={item} />)
                  ) : (
                    <tr>
                      <td colSpan={4} className="px-4 py-10 text-center text-sm text-muted-foreground">
                        {loading ? 'Loading accounts...' : 'No registered accounts found.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                Page {meta.page} / {meta.totalPages}, total {numberFormat(meta.total)}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => loadData(Math.max(1, meta.page - 1), query)}
                  disabled={loading || meta.page <= 1}
                >
                  <ChevronLeft className="mr-1 h-4 w-4" />
                  Prev
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => loadData(Math.min(meta.totalPages, meta.page + 1), query)}
                  disabled={loading || meta.page >= meta.totalPages}
                >
                  Next
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Homepage Trend</CardTitle>
              <CardDescription>Last 7 UTC days.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {(overview?.homepageVisits.last7Days || []).map((day) => (
                <div key={day.date} className="space-y-1">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{formatShortDate(day.date)}</span>
                    <span>{numberFormat(day.count)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted">
                    <div
                      className="h-2 rounded-full bg-primary"
                      style={{ width: `${Math.max(4, (day.count / maxVisitCount) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
              <p className="pt-2 text-xs text-muted-foreground">
                Last tracked: {formatDateTime(overview?.homepageVisits.updatedAt)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>User Mix</CardTitle>
              <CardDescription>Accounts grouped by role.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {Object.entries(overview?.users.byRole || {}).map(([role, count]) => (
                <div key={role} className="flex items-center justify-between">
                  <span className="text-muted-foreground">{role}</span>
                  <span className="font-medium">{numberFormat(count)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
