import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, ChevronDown, ChevronRight, Plus, Search, Layers, Users, FileStack, RefreshCw, Settings2 } from 'lucide-react';
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

type AgentLaunchMode = 'local-docker' | 'local-runner' | 'local-codex' | 'aws-ecs' | 'aws-agentcore';

type ProjectAdvancedOptionsForm = {
  coordinatorEnabled: boolean;
  coordinatorLaunchMode: AgentLaunchMode;
  preferredAgentType: string;
  maxActiveAgents: string;
  maxActiveGoals: string;
  coordinatorMaxAgents: string;
  maxDispatchesPerTick: string;
};

const DEFAULT_PROJECT_MAX_ACTIVE_AGENTS = 10;
const PROJECT_MAX_ACTIVE_AGENTS_CAP = 50;
const DEFAULT_PROJECT_MAX_ACTIVE_GOALS = 5;
const PROJECT_MAX_ACTIVE_GOALS_CAP = 50;
const DEFAULT_COORDINATOR_MAX_DISPATCHES_PER_TICK = 3;
const DEFAULT_COORDINATOR_AGENT_TYPE = 'pi';
const BACKEND_AGENT_LAUNCH_MODES: AgentLaunchMode[] = [
  'local-docker',
  'local-runner',
  'local-codex',
  'aws-ecs',
  'aws-agentcore',
];

function isAgentcraftProductionHost(hostname: string) {
  const normalizedHostname = hostname.toLowerCase();
  return normalizedHostname === 'agentcraft.work' || normalizedHostname.endsWith('.agentcraft.work');
}

const IS_PRODUCTION_AGENTCRAFT_HOST =
  typeof window !== 'undefined' && isAgentcraftProductionHost(window.location.hostname);
const DEFAULT_COORDINATOR_LAUNCH_MODE: AgentLaunchMode = IS_PRODUCTION_AGENTCRAFT_HOST ? 'local-runner' : 'local-docker';

const AGENT_LAUNCH_MODE_OPTIONS: Array<{ value: AgentLaunchMode; label: string }> = [
  ...(!IS_PRODUCTION_AGENTCRAFT_HOST
    ? [{ value: 'local-docker' as AgentLaunchMode, label: 'Local Docker Agent' }]
    : []),
  ...(IS_PRODUCTION_AGENTCRAFT_HOST
    ? [{ value: 'local-runner' as AgentLaunchMode, label: 'Local Runner Agent' }]
    : []),
  { value: 'local-codex', label: 'Local Agent' },
];

const AGENT_TYPE_OPTIONS: Array<{ value: string; label: string; launchModes: AgentLaunchMode[] }> = [
  { value: 'pi', label: 'Pi', launchModes: ['local-docker', 'local-runner', 'local-codex'] },
  { value: 'hermes-agent', label: 'Hermes Agent', launchModes: ['local-docker', 'local-runner'] },
  { value: 'codex', label: 'Codex', launchModes: ['local-docker', 'local-runner', 'local-codex'] },
];

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function normalizeLaunchMode(value: unknown): AgentLaunchMode | null {
  return BACKEND_AGENT_LAUNCH_MODES.includes(value as AgentLaunchMode)
    ? value as AgentLaunchMode
    : null;
}

function isCloudAgentLaunchMode(mode?: AgentLaunchMode | null) {
  return mode === 'aws-ecs' || mode === 'aws-agentcore';
}

function normalizeAvailableLaunchMode(value: unknown): AgentLaunchMode {
  const mode = normalizeLaunchMode(value);
  if (!mode || isCloudAgentLaunchMode(mode)) return DEFAULT_COORDINATOR_LAUNCH_MODE;
  if (IS_PRODUCTION_AGENTCRAFT_HOST && mode === 'local-docker') return 'local-runner';
  if (!IS_PRODUCTION_AGENTCRAFT_HOST && mode === 'local-runner') return 'local-docker';
  return AGENT_LAUNCH_MODE_OPTIONS.some((option) => option.value === mode)
    ? mode
    : DEFAULT_COORDINATOR_LAUNCH_MODE;
}

function agentTypeOptionsForLaunchMode(launchMode: AgentLaunchMode) {
  return AGENT_TYPE_OPTIONS.filter((option) => option.launchModes.includes(launchMode));
}

function normalizeAgentTypeForLaunchMode(agentType: unknown, launchMode: AgentLaunchMode) {
  const requested = typeof agentType === 'string' ? agentType.trim() : '';
  const supportedOptions = agentTypeOptionsForLaunchMode(launchMode);
  const supported = supportedOptions.find((option) => option.value === requested);
  return supported?.value || supportedOptions[0]?.value || DEFAULT_COORDINATOR_AGENT_TYPE;
}

function launchModeLabel(launchMode: AgentLaunchMode) {
  return AGENT_LAUNCH_MODE_OPTIONS.find((option) => option.value === launchMode)?.label || launchMode;
}

function agentTypeLabel(agentType: string) {
  return AGENT_TYPE_OPTIONS.find((option) => option.value === agentType)?.label || agentType;
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(Math.max(Math.floor(numeric), min), max);
}

function positiveIntegerString(value: unknown, fallback: number, min: number, max: number) {
  return String(boundedInteger(value, fallback, min, max));
}

function templateCoordinator(template?: ProjectTemplateSummary): Record<string, unknown> {
  const flow = objectRecord(template?.workItemStatusFlow);
  return objectRecord(flow.coordinator);
}

function templateSettings(template?: ProjectTemplateSummary): Record<string, unknown> {
  return objectRecord(template?.settings);
}

function advancedOptionsFromTemplate(template?: ProjectTemplateSummary): ProjectAdvancedOptionsForm {
  const settings = templateSettings(template);
  const coordinator = templateCoordinator(template);
  const firstLaunchProfile = Array.isArray(template?.roleLaunchProfiles)
    ? template.roleLaunchProfiles.find((profile) => objectRecord(profile).role)
    : null;
  const launchProfileRecord = objectRecord(firstLaunchProfile);
  const launchMode =
    normalizeAvailableLaunchMode(coordinator.launchMode || launchProfileRecord.launchMode) ||
    DEFAULT_COORDINATOR_LAUNCH_MODE;
  const preferredAgentType = normalizeAgentTypeForLaunchMode(
    coordinator.agentType || launchProfileRecord.agentType,
    launchMode,
  );
  const maxActiveAgents = boundedInteger(
    settings.maxActiveAgents ?? coordinator.maxAgents,
    DEFAULT_PROJECT_MAX_ACTIVE_AGENTS,
    1,
    PROJECT_MAX_ACTIVE_AGENTS_CAP,
  );
  return {
    coordinatorEnabled: coordinator.enabled !== false,
    coordinatorLaunchMode: launchMode,
    preferredAgentType,
    maxActiveAgents: String(maxActiveAgents),
    maxActiveGoals: positiveIntegerString(
      settings.maxActiveGoals,
      DEFAULT_PROJECT_MAX_ACTIVE_GOALS,
      1,
      PROJECT_MAX_ACTIVE_GOALS_CAP,
    ),
    coordinatorMaxAgents: positiveIntegerString(
      coordinator.maxAgents,
      maxActiveAgents,
      1,
      PROJECT_MAX_ACTIVE_AGENTS_CAP,
    ),
    maxDispatchesPerTick: positiveIntegerString(
      coordinator.maxDispatchesPerTick,
      DEFAULT_COORDINATOR_MAX_DISPATCHES_PER_TICK,
      1,
      20,
    ),
  };
}

function templateLaunchableRoles(template?: ProjectTemplateSummary) {
  if (!template?.roles?.length) return [];
  return template.roles
    .filter((role) => role.role && role.role !== 'OWNER' && role.role !== 'COORDINATOR')
    .map((role) => role.role);
}

function projectRoleAgentDefaultsFromTemplate(
  template: ProjectTemplateSummary | undefined,
  launchMode: AgentLaunchMode,
  agentType: string,
) {
  const profiles = Array.isArray(template?.roleLaunchProfiles)
    ? template.roleLaunchProfiles
        .map((profile) => objectRecord(profile))
        .filter((profile) => typeof profile.role === 'string' && profile.role.trim())
    : [];
  const fallbackProfiles = profiles.length
    ? profiles
    : templateLaunchableRoles(template).map((role) => ({ role }));

  return Object.fromEntries(
    fallbackProfiles.map((profile) => {
      const role = String(profile.role).trim();
      return [
        role,
        {
          ...profile,
          role,
          launchMode,
          agentType,
        },
      ];
    }),
  );
}

function buildCreateProjectSettings(
  template: ProjectTemplateSummary | undefined,
  advancedOptions: ProjectAdvancedOptionsForm,
) {
  const maxActiveAgents = boundedInteger(
    advancedOptions.maxActiveAgents,
    DEFAULT_PROJECT_MAX_ACTIVE_AGENTS,
    1,
    PROJECT_MAX_ACTIVE_AGENTS_CAP,
  );
  const maxActiveGoals = boundedInteger(
    advancedOptions.maxActiveGoals,
    DEFAULT_PROJECT_MAX_ACTIVE_GOALS,
    1,
    PROJECT_MAX_ACTIVE_GOALS_CAP,
  );
  const coordinatorMaxAgents = boundedInteger(
    advancedOptions.coordinatorMaxAgents,
    maxActiveAgents,
    1,
    PROJECT_MAX_ACTIVE_AGENTS_CAP,
  );
  const maxDispatchesPerTick = boundedInteger(
    advancedOptions.maxDispatchesPerTick,
    DEFAULT_COORDINATOR_MAX_DISPATCHES_PER_TICK,
    1,
    20,
  );
  const launchMode = normalizeAvailableLaunchMode(advancedOptions.coordinatorLaunchMode);
  const agentType = normalizeAgentTypeForLaunchMode(advancedOptions.preferredAgentType, launchMode);
  const flow = objectRecord(template?.workItemStatusFlow);
  const coordinator = objectRecord(flow.coordinator);
  const dispatchRules = Array.isArray(flow.dispatchRules)
    ? flow.dispatchRules.map((rule) =>
        rule && typeof rule === 'object' && !Array.isArray(rule)
          ? { ...rule, launchMode, agentType }
          : rule,
      )
    : undefined;
  const projectRoleAgentDefaults = projectRoleAgentDefaultsFromTemplate(template, launchMode, agentType);
  const settings: Record<string, unknown> = {
    maxActiveAgents,
    maxActiveGoals,
  };

  if (Object.keys(projectRoleAgentDefaults).length) {
    settings.projectRoleAgentDefaults = projectRoleAgentDefaults;
  }

  if (Object.keys(flow).length) {
    settings.workItemStatusFlow = {
      ...flow,
      ...(dispatchRules ? { dispatchRules } : {}),
      coordinator: {
        ...coordinator,
        enabled: advancedOptions.coordinatorEnabled,
        launchMode,
        agentType,
        maxAgents: coordinatorMaxAgents,
        maxDispatchesPerTick,
      },
    };
  }

  return settings;
}

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
  const templatePickerRef = useRef<HTMLDivElement>(null);
  const advancedOptionsTouchedRef = useRef(false);
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
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [hoveredTemplateId, setHoveredTemplateId] = useState('');
  const [advancedOptionsOpen, setAdvancedOptionsOpen] = useState(false);
  const [advancedOptions, setAdvancedOptions] = useState<ProjectAdvancedOptionsForm>(() =>
    advancedOptionsFromTemplate(),
  );

  const markAdvancedOptionsTouched = (updates: Partial<ProjectAdvancedOptionsForm>) => {
    advancedOptionsTouchedRef.current = true;
    setAdvancedOptions((prev) => ({ ...prev, ...updates }));
  };

  const handleCoordinatorLaunchModeChange = (value: string) => {
    const launchMode = normalizeAvailableLaunchMode(value);
    markAdvancedOptionsTouched({
      coordinatorLaunchMode: launchMode,
      preferredAgentType: normalizeAgentTypeForLaunchMode(advancedOptions.preferredAgentType, launchMode),
    });
  };

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
        if (!advancedOptionsTouchedRef.current) {
          const fallbackTemplate =
            list.find((template) => template.id === form.projectTemplateId) ||
            list.find((template) => template.id === 'default') ||
            list[0];
          setAdvancedOptions(advancedOptionsFromTemplate(fallbackTemplate));
        }
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

  useEffect(() => {
    if (!templatePickerOpen) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!templatePickerRef.current?.contains(event.target as Node)) {
        setTemplatePickerOpen(false);
        setHoveredTemplateId('');
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setTemplatePickerOpen(false);
        setHoveredTemplateId('');
      }
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [templatePickerOpen]);

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
  const hoveredTemplate = useMemo(
    () => templates.find((template) => template.id === hoveredTemplateId),
    [hoveredTemplateId, templates],
  );
  const selectedTemplateLabel = selectedTemplate
    ? `${selectedTemplate.label}${selectedTemplate.id === 'default' ? ' (default)' : ''}`
    : templatesLoading
      ? 'Loading project templates...'
      : 'General Project Template (default)';
  const selectedCoordinatorLaunchMode = normalizeAvailableLaunchMode(advancedOptions.coordinatorLaunchMode);
  const selectedPreferredAgentType = normalizeAgentTypeForLaunchMode(
    advancedOptions.preferredAgentType,
    selectedCoordinatorLaunchMode,
  );
  const preferredAgentTypeOptions = agentTypeOptionsForLaunchMode(selectedCoordinatorLaunchMode);
  const advancedOptionsSummary = [
    launchModeLabel(selectedCoordinatorLaunchMode),
    agentTypeLabel(selectedPreferredAgentType),
    `${advancedOptions.maxActiveAgents || DEFAULT_PROJECT_MAX_ACTIVE_AGENTS} active`,
  ].join(' / ');

  const handleSelectTemplate = (template: ProjectTemplateSummary) => {
    setForm((prev) => ({ ...prev, projectTemplateId: template.id }));
    setAdvancedOptions(advancedOptionsFromTemplate(template));
    advancedOptionsTouchedRef.current = false;
    setTemplatePickerOpen(false);
    setHoveredTemplateId('');
  };

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
      const projectSettings = buildCreateProjectSettings(selectedTemplate, advancedOptions);
      await api.projects.create({
        initialGoal: form.initialGoal,
        visibility: form.visibility,
        githubUrl: form.githubUrl || undefined,
        projectTemplateId: form.projectTemplateId || undefined,
        settings: projectSettings,
      }).then((project) => {
        setForm((prev) => ({
          initialGoal: '',
          visibility: 'private',
          githubUrl: '',
          projectTemplateId: prev.projectTemplateId || 'default',
        }));
        setAdvancedOptions(advancedOptionsFromTemplate(selectedTemplate));
        advancedOptionsTouchedRef.current = false;
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
                <div ref={templatePickerRef} className="relative" data-tour="projects-template">
                  <button
                    type="button"
                    aria-haspopup="listbox"
                    aria-expanded={templatePickerOpen}
                    className="flex min-h-10 w-full items-center justify-between gap-3 rounded-md border border-input bg-background px-3 py-2 text-left text-sm ring-offset-background transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={templatesLoading || !templates.length}
                    onClick={() => {
                      setTemplatePickerOpen((open) => !open);
                      setHoveredTemplateId('');
                    }}
                  >
                    <span className="min-w-0 truncate">{selectedTemplateLabel}</span>
                    <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${templatePickerOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {templatePickerOpen && (
                    <div className="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-md border border-border bg-card text-card-foreground shadow-xl">
                      <div
                        role="listbox"
                        aria-label="Project templates"
                        className="max-h-56 overflow-y-auto py-1"
                        onMouseLeave={() => setHoveredTemplateId('')}
                      >
                        {templates.map((template) => {
                          const selected = template.id === form.projectTemplateId;
                          return (
                            <button
                              key={template.id}
                              type="button"
                              role="option"
                              aria-selected={selected}
                              className={`flex w-full items-start justify-between gap-3 px-3 py-2 text-left text-sm transition-colors ${
                                selected ? 'bg-primary/10 text-foreground' : 'hover:bg-muted/50'
                              }`}
                              onMouseEnter={() => setHoveredTemplateId(template.id)}
                              onFocus={() => setHoveredTemplateId(template.id)}
                              onClick={() => handleSelectTemplate(template)}
                            >
                              <span className="min-w-0">
                                <span className="block truncate font-medium">
                                  {template.label}
                                  {template.id === 'default' ? ' (default)' : ''}
                                </span>
                                <span className="block truncate text-[11px] text-muted-foreground">{template.id}</span>
                              </span>
                              {selected ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> : null}
                            </button>
                          );
                        })}
                      </div>
                      <div className="border-t border-border/70 bg-muted/20 px-3 py-2">
                        <p className="text-xs leading-5 text-muted-foreground">
                          {hoveredTemplate?.description || 'Hover a template to preview its description.'}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
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
                            if (!advancedOptionsTouchedRef.current) {
                              const fallbackTemplate =
                                list.find((template) => template.id === form.projectTemplateId) ||
                                list.find((template) => template.id === 'default') ||
                                list[0];
                              setAdvancedOptions(advancedOptionsFromTemplate(fallbackTemplate));
                            }
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
                <div className="rounded-md border border-border/70 bg-muted/20">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
                    aria-expanded={advancedOptionsOpen}
                    onClick={() => setAdvancedOptionsOpen((open) => !open)}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <Settings2 className="h-4 w-4 shrink-0 text-primary" />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">Advanced Options</span>
                        <span className="block truncate text-xs text-muted-foreground">{advancedOptionsSummary}</span>
                      </span>
                    </span>
                    {advancedOptionsOpen ? (
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                  </button>
                  {advancedOptionsOpen ? (
                    <div className="space-y-3 border-t border-border/70 px-3 py-3">
                      <label className="flex items-center justify-between gap-3 rounded-md border border-border/70 bg-background px-3 py-2 text-sm">
                        <span className="font-medium">Coordinator</span>
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={advancedOptions.coordinatorEnabled}
                          onChange={(e) => markAdvancedOptionsTouched({ coordinatorEnabled: e.target.checked })}
                        />
                      </label>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="space-y-1.5">
                          <span className="text-xs font-medium text-muted-foreground">Coordinator launch</span>
                          <select
                            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                            value={selectedCoordinatorLaunchMode}
                            onChange={(e) => handleCoordinatorLaunchModeChange(e.target.value)}
                          >
                            {AGENT_LAUNCH_MODE_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="space-y-1.5">
                          <span className="text-xs font-medium text-muted-foreground">Preferred agent type</span>
                          <select
                            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                            value={selectedPreferredAgentType}
                            onChange={(e) => markAdvancedOptionsTouched({ preferredAgentType: e.target.value })}
                          >
                            {preferredAgentTypeOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="space-y-1.5">
                          <span className="text-xs font-medium text-muted-foreground">Project active agents</span>
                          <Input
                            type="number"
                            min={1}
                            max={PROJECT_MAX_ACTIVE_AGENTS_CAP}
                            value={advancedOptions.maxActiveAgents}
                            onChange={(e) => markAdvancedOptionsTouched({ maxActiveAgents: e.target.value })}
                            className="h-9"
                          />
                        </label>

                        <label className="space-y-1.5">
                          <span className="text-xs font-medium text-muted-foreground">Active goals</span>
                          <Input
                            type="number"
                            min={1}
                            max={PROJECT_MAX_ACTIVE_GOALS_CAP}
                            value={advancedOptions.maxActiveGoals}
                            onChange={(e) => markAdvancedOptionsTouched({ maxActiveGoals: e.target.value })}
                            className="h-9"
                          />
                        </label>

                        <label className="space-y-1.5">
                          <span className="text-xs font-medium text-muted-foreground">Coordinator agent cap</span>
                          <Input
                            type="number"
                            min={1}
                            max={PROJECT_MAX_ACTIVE_AGENTS_CAP}
                            value={advancedOptions.coordinatorMaxAgents}
                            onChange={(e) => markAdvancedOptionsTouched({ coordinatorMaxAgents: e.target.value })}
                            className="h-9"
                          />
                        </label>

                        <label className="space-y-1.5">
                          <span className="text-xs font-medium text-muted-foreground">Dispatches per tick</span>
                          <Input
                            type="number"
                            min={1}
                            max={20}
                            value={advancedOptions.maxDispatchesPerTick}
                            onChange={(e) => markAdvancedOptionsTouched({ maxDispatchesPerTick: e.target.value })}
                            className="h-9"
                          />
                        </label>
                      </div>
                    </div>
                  ) : null}
                </div>
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
