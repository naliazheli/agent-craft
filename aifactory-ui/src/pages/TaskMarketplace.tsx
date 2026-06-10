import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search, Coins, MessageSquare, FileText, Pickaxe, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import {
  getTaskDisplayTitle,
  getTaskDisplaySubtitle,
  getTaskHeadingTitle,
  getTaskSourceLabel,
  formatHackerOneRewardRange,
  type TaskSourceMetadata,
} from '@/lib/task-source';

const STATUS_BADGE_CLASS: Record<string, string> = {
  OPEN: 'border-border/70 bg-background/80 text-muted-foreground',
  REVIEWING: 'border-yellow-200 bg-yellow-50 text-yellow-700',
  COMPLETED: 'border-green-200 bg-green-50 text-green-700',
  DISPUTED: 'border-destructive/25 bg-destructive/10 text-destructive',
  CANCELLED: 'border-border/70 bg-muted/40 text-muted-foreground',
};

const PREVIEW_TAG_LIMIT = 4;

function formatSourceHost(sourceUrl?: string | null) {
  if (!sourceUrl) {
    return '';
  }

  try {
    return new URL(sourceUrl).hostname.replace(/^www\./, '');
  } catch {
    return sourceUrl;
  }
}

function isHackerOneTask(task: any) {
  return task?.taskSource === 'HACKERONE' || task?.rawTask?.source === 'HACKERONE_PROGRAM';
}

function getVisibleTags(
  tags: string[] | undefined,
  categories: string[],
  taskSource?: string | null,
) {
  if (!tags?.length) {
    return [];
  }

  const categorySet = new Set(categories.map((category) => category.toLowerCase()));
  const noisyErdosTags = new Set(['erdos', 'erdos-problem', 'open-problem']);

  return tags.filter((tag) => {
    const normalized = tag.toLowerCase();
    if (categorySet.has(normalized)) {
      return false;
    }

    if (taskSource === 'ERDOS_PROBLEM' && noisyErdosTags.has(normalized)) {
      return false;
    }

    return true;
  });
}

export function TaskMarketplace() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [tasks, setTasks] = useState<any[]>([]);
  const [meta, setMeta] = useState<{ total: number; page: number; limit: number; totalPages: number } | null>(null);
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [status, setStatus] = useState('');
  const [taskSource, setTaskSource] = useState('ERDOS_PROBLEM');
  const [codeType, setCodeType] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [taskLoadError, setTaskLoadError] = useState('');
  const [projectCreatingTaskId, setProjectCreatingTaskId] = useState<string | null>(null);
  const [projectCreateError, setProjectCreateError] = useState('');
  const PAGE_SIZE = 12;

  const loadTasks = async () => {
    setLoading(true);
    setTaskLoadError('');
    try {
      const params: Record<string, string> = {};
      if (appliedSearch) params.search = appliedSearch;
      if (status) params.status = status;
      if (taskSource) params.taskSource = taskSource;
      if (codeType) params.codeType = codeType;
      params.page = String(page);
      params.limit = String(PAGE_SIZE);
      const res = await api.tasks.list(params);
      setTasks(res.data);
      setMeta(res.meta);
    } catch (err: any) {
      setTasks([]);
      setMeta(null);
      setTaskLoadError(err.message || 'Failed to load tasks');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadTasks(); }, [appliedSearch, status, taskSource, codeType, page]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setAppliedSearch(search.trim());
    setPage(1);
  };

  const clearSearch = () => {
    setSearch('');
    setAppliedSearch('');
    setPage(1);
  };

  const handleCreateProject = async (task: any, event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!user) {
      navigate('/login');
      return;
    }

    const hackerOne = isHackerOneTask(task);
    if (
      hackerOne &&
      !window.confirm('Create a HackerOne bounty project from this task using the HackerOne project template?')
    ) {
      return;
    }

    setProjectCreatingTaskId(task.id);
    setProjectCreateError('');
    try {
      const result = await api.projects.createFromTask(task.id, {
        seedPlan: true,
        confirmed: hackerOne ? true : undefined,
      });
      navigate(`/projects/${result.project.id}`);
    } catch (err: any) {
      setProjectCreateError(err.message || 'Failed to create project from task');
    } finally {
      setProjectCreatingTaskId(null);
    }
  };

  const filters = ['', 'OPEN', 'REVIEWING', 'COMPLETED'];
  const filterLabels: Record<string, string> = { '': 'filterAll', OPEN: 'filterOpen', REVIEWING: 'filterReviewing', COMPLETED: 'filterCompleted' };
  const sourceFilters = [
    { value: '', label: 'All Sources' },
    { value: 'ERDOS_PROBLEM', label: 'Erdos Problems' },
    { value: 'GITHUB_ISSUE', label: 'GitHub Issues' },
    { value: 'HACKERONE', label: 'HackerOne' },
    { value: 'CUSTOM', label: 'Custom' },
  ];
  const codeTypes = ['', 'security', 'typescript', 'python', 'go', 'rust'];
  const rangeStart = meta ? (meta.page - 1) * meta.limit + 1 : 0;
  const rangeEnd = meta ? Math.min(meta.page * meta.limit, meta.total) : 0;
  const pageNumbers = (() => {
    if (!meta || meta.totalPages <= 1) return [];

    const pages = new Set<number>([1, meta.totalPages]);
    for (let current = Math.max(1, meta.page - 1); current <= Math.min(meta.totalPages, meta.page + 1); current += 1) {
      pages.add(current);
    }

    const sortedPages = Array.from(pages).sort((left, right) => left - right);
    const items: Array<number | 'ellipsis'> = [];

    sortedPages.forEach((currentPage, index) => {
      const previousPage = sortedPages[index - 1];
      if (previousPage && currentPage - previousPage > 1) {
        items.push('ellipsis');
      }
      items.push(currentPage);
    });

    return items;
  })();

  return (
    <div className="container py-8">
      <h1 className="text-3xl font-bold mb-6">{t('tasks.marketplace')}</h1>

      <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <form onSubmit={handleSearch} className="flex w-full max-w-3xl gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pr-10 pl-9"
              placeholder={t('tasks.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {(search || appliedSearch) && (
              <button
                type="button"
                aria-label="Clear search"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                onClick={clearSearch}
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <Button type="submit" variant="secondary">Search</Button>
        </form>
        <div className="flex flex-wrap gap-2">
          {filters.map((f) => (
            <Button
              key={f}
              variant={status === f ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setStatus(f);
                setPage(1);
              }}
            >
              {t(`tasks.${filterLabels[f]}`)}
            </Button>
          ))}
        </div>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {sourceFilters.map((source) => (
          <Button
            key={source.value || 'all-source'}
            variant={taskSource === source.value ? 'default' : 'outline'}
            size="sm"
            onClick={() => {
              setTaskSource(source.value);
              setPage(1);
            }}
          >
            {source.label}
          </Button>
        ))}
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {codeTypes.map((value) => (
          <Button
            key={value || 'all-code'}
            variant={codeType === value ? 'default' : 'outline'}
            size="sm"
            onClick={() => {
              setCodeType(value);
              setPage(1);
            }}
          >
            {value ? value : t('tasks.filterAllCodeTypes')}
          </Button>
        ))}
      </div>

      {meta && (
        <div className="mb-6 flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>
            Showing {rangeStart}-{rangeEnd} of {meta.total} tasks
            {taskSource === 'ERDOS_PROBLEM' ? ' (Erdos Problems)' : ''}
          </p>
          {appliedSearch && <p>Search: {appliedSearch}</p>}
        </div>
      )}

      {projectCreateError && (
        <div className="mb-6 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {projectCreateError}
        </div>
      )}

      {taskLoadError && (
        <div className="mb-6 flex flex-col gap-3 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between">
          <span>{taskLoadError}</span>
          <Button type="button" variant="outline" size="sm" onClick={loadTasks}>
            Retry
          </Button>
        </div>
      )}

      {loading ? (
        <p className="text-center text-muted-foreground py-12">{t('common.loading')}</p>
      ) : taskLoadError ? null : tasks.length === 0 ? (
        <p className="text-center text-muted-foreground py-12">{t('tasks.noTasks')}</p>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {tasks.map((task) => (
              <Card
                key={task.id}
                role="link"
                tabIndex={0}
                onClick={() => navigate(`/tasks/${task.id}`)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    navigate(`/tasks/${task.id}`);
                  }
                }}
                className="group flex h-full cursor-pointer flex-col overflow-hidden border-border/70 bg-gradient-to-b from-background to-muted/10 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                  {(() => {
                    const sourceMetadata = (task.sourceMetadata || null) as TaskSourceMetadata | null;
                    const erdosProblemId = sourceMetadata?.externalProblemId;
                    const originalPrize = sourceMetadata?.originalPrize;
                    const categories = sourceMetadata?.categories || [];
                    const headingTitle = getTaskHeadingTitle(task.title, task.taskSource, sourceMetadata);
                    const displayTitle = getTaskDisplayTitle(task.title, task.taskSource, sourceMetadata, {
                      short: true,
                    });
	                    const displaySubtitle = getTaskDisplaySubtitle(task.taskSource, sourceMetadata, {
	                      short: true,
	                    });
	                    const hostLabel = formatSourceHost(task.sourceUrl);
	                    const hackerOneRewardRange = task.taskSource === 'HACKERONE' ? formatHackerOneRewardRange(sourceMetadata) : '';
	                    const hackerOneSeverity = task.taskSource === 'HACKERONE' ? sourceMetadata?.scope?.maxSeverity : '';
	                    const hackerOneAssetType = task.taskSource === 'HACKERONE' ? sourceMetadata?.scope?.assetType : '';
	                    const visibleTags = getVisibleTags(task.tags, categories, task.taskSource);
                    const previewCategories = categories.slice(0, PREVIEW_TAG_LIMIT);
                    const previewTags = visibleTags.slice(0, PREVIEW_TAG_LIMIT);
                    const overflowCategoryCount = categories.length - previewCategories.length;
                    const overflowTagCount = visibleTags.length - previewTags.length;
                    const hasCompactTitle = headingTitle !== displayTitle;
                    const showSourceBadges =
                      task.taskSource && task.taskSource !== 'CUSTOM' && typeof erdosProblemId !== 'number';

                    return (
                      <>
                        <CardHeader className="space-y-4 pb-4">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0 space-y-3">
                              <div className="flex flex-wrap items-center gap-2">
                                {showSourceBadges && (
                                  <Badge variant="outline" className="bg-background/80">
                                    {getTaskSourceLabel(t, task.taskSource)}
                                  </Badge>
                                )}
                                {typeof erdosProblemId === 'number' && (
                                  <Badge variant="outline" className="bg-background/80">
                                    Problem #{erdosProblemId}
                                  </Badge>
                                )}
	                                {task.codeType && (
	                                  <Badge variant="outline" className="bg-background/80">
	                                    {task.codeType}
	                                  </Badge>
	                                )}
	                                {hackerOneSeverity && (
	                                  <Badge variant="outline" className="bg-background/80">
	                                    max {hackerOneSeverity}
	                                  </Badge>
	                                )}
	                              </div>
                              <div className="space-y-2">
                                <CardTitle className="text-xl leading-snug tracking-tight">
                                  {hasCompactTitle ? headingTitle : displayTitle}
                                </CardTitle>
                                <p className="line-clamp-2 text-sm leading-6 text-muted-foreground">
                                  {displaySubtitle || task.description}
                                </p>
                              </div>
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              className="h-8 shrink-0 px-3"
                              title="Create an AgentCraft project to solve this task"
                              aria-label="Solve this task by creating an AgentCraft project"
                              disabled={projectCreatingTaskId === task.id}
                              onClick={(event) => handleCreateProject(task, event)}
                              onKeyDown={(event) => event.stopPropagation()}
                            >
                              <Pickaxe className="mr-1.5 h-3.5 w-3.5" />
                              {projectCreatingTaskId === task.id ? 'Creating...' : 'Solve with Project'}
                            </Button>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            {hostLabel && <span>Source: {hostLabel}</span>}
	                            {originalPrize && (
	                              <span>
	                                Original prize: ${originalPrize.amount} {originalPrize.currency}
	                              </span>
	                            )}
	                            {hackerOneAssetType && <span>Asset type: {hackerOneAssetType}</span>}
	                            {hackerOneRewardRange && <span>External bounty: {hackerOneRewardRange}</span>}
	                            {task.deadline && (
                              <span>Due {new Date(task.deadline).toLocaleDateString()}</span>
                            )}
                          </div>
                        </CardHeader>
                        <CardContent className="flex-1 space-y-4">
                          {(previewCategories.length > 0 || previewTags.length > 0) && (
                            <div className="space-y-2">
                              {previewCategories.length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                  {previewCategories.map((category) => (
                                    <Badge
                                      key={category}
                                      variant="secondary"
                                      className="bg-secondary/70 text-xs"
                                    >
                                      {category}
                                    </Badge>
                                  ))}
                                  {overflowCategoryCount > 0 && (
                                    <Badge variant="outline" className="text-xs">
                                      +{overflowCategoryCount}
                                    </Badge>
                                  )}
                                </div>
                              )}
                              {previewTags.length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                  {previewTags.map((tag) => (
                                    <Badge key={tag} variant="outline" className="text-xs text-muted-foreground">
                                      {tag}
                                    </Badge>
                                  ))}
                                  {overflowTagCount > 0 && (
                                    <Badge variant="outline" className="text-xs">
                                      +{overflowTagCount}
                                    </Badge>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </CardContent>
                        <CardFooter className="mt-auto flex flex-col gap-3 border-t border-border/60 bg-muted/5 px-6 py-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex flex-wrap items-center gap-3">
                            <div className="flex items-center gap-1.5">
                              <Coins className="h-4 w-4" />
                              <span className="font-semibold text-foreground">{task.reward}</span>
                              <span>{task.currency}</span>
                            </div>
                            <Badge
                              variant="outline"
                              className={`shrink-0 text-xs font-medium shadow-none ${STATUS_BADGE_CLASS[task.status] || STATUS_BADGE_CLASS.CANCELLED}`}
                            >
                              {t(`tasks.status.${task.status}`)}
                            </Badge>
                          </div>
                          <div className="flex w-full flex-wrap items-center justify-between gap-3 sm:w-auto sm:justify-end">
                            {task._count && (
                              <div className="flex items-center gap-3">
                                <span className="flex items-center gap-1">
                                  <FileText className="h-3.5 w-3.5" />
                                  {task._count.submissions}
                                </span>
                                <span className="flex items-center gap-1">
                                  <MessageSquare className="h-3.5 w-3.5" />
                                  {task._count.comments}
                                </span>
                              </div>
                            )}
                          </div>
                        </CardFooter>
                      </>
                    );
                  })()}
                </Card>
            ))}
          </div>

          {meta && meta.totalPages > 1 && (
            <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
              <Button
                variant="outline"
                disabled={loading || meta.page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Previous
              </Button>
              {pageNumbers.map((item, index) => (
                item === 'ellipsis' ? (
                  <span key={`ellipsis-${index}`} className="px-2 text-sm text-muted-foreground">
                    ...
                  </span>
                ) : (
                  <Button
                    key={item}
                    variant={meta.page === item ? 'default' : 'outline'}
                    size="sm"
                    disabled={loading}
                    onClick={() => setPage(item)}
                  >
                    {item}
                  </Button>
                )
              ))}
              <Button
                variant="outline"
                disabled={loading || meta.page >= meta.totalPages}
                onClick={() => setPage((current) => Math.min(meta.totalPages, current + 1))}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
