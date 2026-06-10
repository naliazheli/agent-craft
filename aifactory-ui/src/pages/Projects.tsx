import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Search, Layers, Users, FileStack, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { GuidedTour, type GuidedTourStep } from '@/components/onboarding/GuidedTour';
import { api, type ProjectListMeta, type ProjectSummary, type ProjectTemplateSummary } from '@/lib/api';
import { useAuthStore } from '@/store/auth';

const PROJECT_STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'success' | 'warning' | 'destructive'> = {
  DRAFT: 'secondary',
  ACTIVE: 'default',
  PAUSED: 'warning',
  COMPLETED: 'success',
  ARCHIVED: 'secondary',
};

const PROJECTS_TOUR_STEPS: GuidedTourStep[] = [
  {
    selector: '[data-tour="projects-create-card"]',
    title: 'Start by creating a project',
    body: 'Projects are the workspace where goals, shared files, members, agent roles, and review history live together.',
    actionLabel: 'First click here and describe the outcome you want.',
  },
  {
    selector: '[data-tour="projects-goal"]',
    title: 'Describe the goal',
    body: 'Write the real outcome, constraints, and any repo or product context. The project detail page will use this as the starting brief for agents.',
    actionLabel: 'Example: “Build a benchmark leaderboard MVP with ingestion, scoring, and UI.”',
  },
  {
    selector: '[data-tour="projects-template"]',
    title: 'Pick a template',
    body: 'Templates choose the initial agent roles and skill bundles. The default template is fine for most first projects.',
  },
  {
    selector: '[data-tour="projects-submit"]',
    title: 'Create the workspace',
    body: 'After clicking this button, AgentCraft opens the project page. That is where you add a lead agent, launch a local agent, and start the first conversation.',
    actionLabel: 'Then open Project Members on the next page.',
  },
  {
    selector: '[data-tour="projects-list"]',
    title: 'Open an existing project',
    body: 'If you already have a project, open it from this list and continue the tour in the project detail page.',
  },
];

export function Projects() {
  const navigate = useNavigate();
  const token = useAuthStore((state) => state.token);
  const loadProjectsRequestId = useRef(0);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectListMeta, setProjectListMeta] = useState<ProjectListMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [requiresLogin, setRequiresLogin] = useState(false);
  const [form, setForm] = useState({
    initialGoal: '',
    visibility: 'private',
    githubUrl: '',
    projectTemplateId: 'default',
  });
  const [templates, setTemplates] = useState<ProjectTemplateSummary[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesError, setTemplatesError] = useState('');

  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setTemplates([]);
      setTemplatesLoading(false);
      setTemplatesError('');
      return () => {
        cancelled = true;
      };
    }
    setTemplatesLoading(true);
    setTemplatesError('');
    api.projectTemplates
      .list()
      .then((res) => {
        if (cancelled) return;
        const list = res.templates || [];
        setTemplates(list);
        setForm((prev) => {
          if (prev.projectTemplateId && list.some((t) => t.id === prev.projectTemplateId)) {
            return prev;
          }
          const fallback = list.find((t) => t.id === 'default') || list[0];
          return fallback ? { ...prev, projectTemplateId: fallback.id } : prev;
        });
      })
      .catch(() => {
        if (cancelled) return;
        setTemplates([]);
        setTemplatesError('Project templates failed to load. Try refreshing the template list.');
      })
      .finally(() => {
        if (!cancelled) setTemplatesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const loadProjects = async () => {
    const requestId = ++loadProjectsRequestId.current;
    setLoading(true);
    setError('');
    try {
      const res = await api.projects.list(search ? { search } : undefined);
      if (requestId !== loadProjectsRequestId.current) return;
      setProjects(res.data);
      setProjectListMeta(res.meta || null);
      setRequiresLogin(false);
    } catch (err: any) {
      if (requestId !== loadProjectsRequestId.current) return;
      const message = err.message || 'Failed to load projects';
      if (message.toLowerCase().includes('unauthorized')) {
        setRequiresLogin(true);
        setProjects([]);
        setProjectListMeta(null);
        setError('');
      } else {
        setProjects([]);
        setProjectListMeta(null);
        setError(message);
      }
    } finally {
      if (requestId === loadProjectsRequestId.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    loadProjects();
  }, [search, token]);

  const stats = useMemo(() => {
    if (projectListMeta?.stats) {
      return projectListMeta.stats;
    }
    if (projectListMeta) {
      return {
        total: projectListMeta.total,
        active: null,
        workItems: null,
        artifacts: null,
      };
    }
    return projects.reduce(
      (acc, project) => {
        acc.total += 1;
        acc.workItems += project.workItemCount || 0;
        acc.artifacts += project.artifactCount || 0;
        if (project.status === 'ACTIVE') acc.active += 1;
        return acc;
      },
      { total: 0, active: 0, workItems: 0, artifacts: 0 },
    );
  }, [projectListMeta, projects]);
  const formatStat = (value: number | null) => (value === null ? '—' : value);
  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === form.projectTemplateId),
    [form.projectTemplateId, templates],
  );

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      setRequiresLogin(true);
      setError('');
      return;
    }
    setCreating(true);
    setError('');
    try {
      await api.projects.create({
        initialGoal: form.initialGoal,
        visibility: form.visibility,
        githubUrl: form.githubUrl || undefined,
        projectTemplateId: form.projectTemplateId || undefined,
      }).then((project) => {
        setForm((prev) => ({
          initialGoal: '',
          visibility: 'private',
          githubUrl: '',
          projectTemplateId: prev.projectTemplateId || 'default',
        }));
        navigate(`/projects/${project.id}`);
      });
    } catch (err: any) {
      setError(err.message || 'Failed to create project');
    } finally {
      setCreating(false);
    }
  };

  const openProject = (projectId: string, section?: 'members' | 'work' | 'delivery') => {
    navigate(`/projects/${projectId}${section ? `?section=${section}` : ''}`);
  };

  const handleProjectCardKeyDown = (e: React.KeyboardEvent, projectId: string) => {
    if (e.target !== e.currentTarget) return;
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    openProject(projectId);
  };

  return (
    <div className="project-docs-surface min-h-screen bg-[#f8fafc] text-slate-950">
      <div className="container py-8">
        <GuidedTour
          steps={PROJECTS_TOUR_STEPS}
          storageKey="agentcraft.projects.tour.v1"
          startLabel="Projects guide"
          autoStart={false}
        />
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          <Badge variant="outline" className="px-3 py-1 text-xs uppercase tracking-[0.18em]">
            Project Platform
          </Badge>
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight">Projects</h1>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
              A parallel workspace for project-level multi-agent collaboration. Projects hold goals,
              features, work items, shared memory, artifacts, and review history without touching the
              legacy task marketplace flow.
            </p>
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(searchInput.trim());
          }}
          className="flex w-full max-w-xl gap-2"
        >
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search projects..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
          <Button type="submit" variant="secondary">Search</Button>
        </form>
      </div>

      <div className="mb-8 grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="py-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Projects</p>
            <p className="mt-2 text-3xl font-semibold">{requiresLogin ? '—' : formatStat(stats.total)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Active</p>
            <p className="mt-2 text-3xl font-semibold">{requiresLogin ? '—' : formatStat(stats.active)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Work Items</p>
            <p className="mt-2 text-3xl font-semibold">{requiresLogin ? '—' : formatStat(stats.workItems)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Artifacts</p>
            <p className="mt-2 text-3xl font-semibold">{requiresLogin ? '—' : formatStat(stats.artifacts)}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-8 xl:grid-cols-[380px_minmax(0,1fr)]">
        <Card className="h-fit" data-tour="projects-create-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Plus className="h-5 w-5" />
              Create Project
            </CardTitle>
          </CardHeader>
          <form onSubmit={handleCreateProject}>
            <CardContent className="space-y-4">
              {error && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}

              {requiresLogin && (
                <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-3 text-sm text-muted-foreground">
                  <p className="font-medium text-foreground">Login required</p>
                  <p className="mt-1">
                    Sign in first to view your projects, create a project, and open project detail pages.
                  </p>
                  <div className="mt-3">
                    <Button asChild size="sm">
                      <Link to="/login">Go to Login</Link>
                    </Button>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <label className="text-sm font-medium">Project Goal</label>
                  <select
                    aria-label="Project visibility"
                    className="h-8 w-[128px] rounded-md border border-input bg-background px-2 text-xs"
                    value={form.visibility}
                    onChange={(e) => setForm((prev) => ({ ...prev, visibility: e.target.value }))}
                  >
                    <option value="private">Private</option>
                    <option value="public">Public</option>
                  </select>
                </div>
                <textarea
                  data-tour="projects-goal"
                  className="min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.initialGoal}
                  onChange={(e) => setForm((prev) => ({ ...prev, initialGoal: e.target.value }))}
                  placeholder="Describe the outcome you want. AgentCraft will create the project and first goal from this."
                  required
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <label className="text-sm font-medium">Project Template</label>
                </div>
                <select
                  data-tour="projects-template"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.projectTemplateId}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, projectTemplateId: e.target.value }))
                  }
                  disabled={templatesLoading || !templates.length}
                >
                  {templates.length ? (
                    templates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.label}
                        {template.id === 'default' ? ' (default)' : ''}
                      </option>
                    ))
                  ) : templatesLoading ? (
                    <option value="default">Loading project templates...</option>
                  ) : (
                    <option value="default">Default Project Template (default)</option>
                  )}
                </select>
                {templatesError ? (
                  <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs leading-5 text-destructive">
                    <span>{templatesError}</span>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-md border border-destructive/30 px-2 py-1 text-[11px] font-medium"
                      onClick={() => {
                        setTemplatesLoading(true);
                        setTemplatesError('');
                        api.projectTemplates
                          .list()
                          .then((res) => {
                            const list = res.templates || [];
                            setTemplates(list);
                            setForm((prev) => {
                              if (prev.projectTemplateId && list.some((template) => template.id === prev.projectTemplateId)) return prev;
                              const fallback = list.find((template) => template.id === 'default') || list[0];
                              return fallback ? { ...prev, projectTemplateId: fallback.id } : prev;
                            });
                          })
                          .catch(() => setTemplatesError('Project templates failed to load. Try refreshing the template list.'))
                          .finally(() => setTemplatesLoading(false));
                      }}
                    >
                      <RefreshCw className="h-3 w-3" />
                      Retry
                    </button>
                  </div>
                ) : null}
                {selectedTemplate?.description ? (
                  <div className="rounded-md border border-border/70 bg-muted/30 px-3 py-2 text-xs leading-5 text-muted-foreground">
                    {selectedTemplate.description}
                  </div>
                ) : null}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">GitHub URL</label>
                <Input
                  type="url"
                  value={form.githubUrl}
                  onChange={(e) => setForm((prev) => ({ ...prev, githubUrl: e.target.value }))}
                  placeholder="https://github.com/owner/repo"
                />
              </div>

              <Button type="submit" className="w-full" disabled={creating || templatesLoading || Boolean(templatesError)} data-tour="projects-submit">
                {creating ? 'Creating...' : 'Create Project from Goal'}
              </Button>
            </CardContent>
          </form>
        </Card>

        <div className="space-y-4" data-tour="projects-list">
          {loading ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">Loading projects...</CardContent>
            </Card>
          ) : requiresLogin ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                Login to see how many projects you have and open project detail pages.
                <div className="mt-4">
                  <Button asChild>
                    <Link to="/login">Login</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : projects.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No projects yet. Create the first project workspace to start organizing multi-agent work.
              </CardContent>
            </Card>
          ) : (
            projects.map((project) => (
              <Card
                key={project.id}
                role="button"
                tabIndex={0}
                className="group cursor-pointer border-border/70 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                onClick={() => openProject(project.id)}
                onKeyDown={(e) => handleProjectCardKeyDown(e, project.id)}
              >
                <CardHeader className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-2">
                      <CardTitle className="text-2xl tracking-tight">{project.name}</CardTitle>
                      <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                        {project.summary || project.brief || 'No summary yet.'}
                      </p>
                    </div>
                    <Badge variant={PROJECT_STATUS_VARIANT[project.status] || 'secondary'}>
                      {project.status}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>Slug: {project.slug}</span>
                    <span>Visibility: {project.visibility}</span>
                    {project.githubUrl && (
                      <a
                        href={project.githubUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        GitHub
                      </a>
                    )}
                    {project.owner?.displayName && <span>Owner: {project.owner.displayName}</span>}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <button
                      type="button"
                      className="rounded-lg border bg-muted/20 px-4 py-3 text-left transition-colors hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={(e) => {
                        e.stopPropagation();
                        openProject(project.id, 'members');
                      }}
                    >
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Users className="h-4 w-4" />
                        <span className="text-xs uppercase tracking-wide">Members</span>
                      </div>
                      <p className="mt-2 text-2xl font-semibold">{project.memberCount || 0}</p>
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border bg-muted/20 px-4 py-3 text-left transition-colors hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={(e) => {
                        e.stopPropagation();
                        openProject(project.id, 'work');
                      }}
                    >
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Layers className="h-4 w-4" />
                        <span className="text-xs uppercase tracking-wide">Work Items</span>
                      </div>
                      <p className="mt-2 text-2xl font-semibold">{project.workItemCount || 0}</p>
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border bg-muted/20 px-4 py-3 text-left transition-colors hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={(e) => {
                        e.stopPropagation();
                        openProject(project.id, 'delivery');
                      }}
                    >
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <FileStack className="h-4 w-4" />
                        <span className="text-xs uppercase tracking-wide">Artifacts</span>
                      </div>
                      <p className="mt-2 text-2xl font-semibold">{project.artifactCount || 0}</p>
                    </button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
