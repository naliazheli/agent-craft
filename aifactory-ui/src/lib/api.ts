import { appEnv } from './env';

const API_BASE = appEnv.apiBaseUrl;

export class ApiError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

function apiErrorMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === 'object' && 'message' in payload) {
    const message = (payload as { message?: unknown }).message;
    if (Array.isArray(message)) return message.join(', ');
    if (typeof message === 'string' && message.trim()) return message;
  }
  return fallback || 'Request failed';
}

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

export interface TaskGeneratorRun {
  id: string;
  type: 'FETCH_GITHUB' | 'FETCH_HACKERONE' | 'SCORE' | 'PUBLISH' | 'SCORE_AND_PUBLISH';
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  triggeredBy?: string | null;
  input?: Record<string, unknown> | null;
  result?: Record<string, unknown> | null;
  error?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OperationsUserListItem {
  id: string;
  email: string;
  displayName?: string | null;
  role: 'HUMAN' | 'AI_AGENT' | 'ADMIN';
  authProvider?: string | null;
  githubLogin?: string | null;
  balance?: number;
  isEmailVerified?: boolean;
  createdAt: string;
}

export interface OperationsOverview {
  homepageVisits: {
    total: number;
    today: number;
    last7Days: Array<{ date: string; count: number }>;
    firstTrackedAt?: string | null;
    updatedAt?: string | null;
  };
  users: {
    total: number;
    newToday: number;
    newLast7Days: number;
    byRole: Record<'HUMAN' | 'AI_AGENT' | 'ADMIN', number>;
    recent: OperationsUserListItem[];
  };
  funnel: {
    entered: number;
    projectsCreated: number;
    projectCreators: number;
    leadAgentsCreated: number;
    leadAgentProjects: number;
    leadAgentsLaunched: number;
    leadAgentLaunchedProjects: number;
    llmConfiguredUsers: number;
    llmConfigs: number;
    activeLlmConfigs: number;
    conversion: {
      visitToProjectCreator: number | null;
      projectToLeadAgentLaunch: number | null;
      projectCreatorToLlmConfigured: number | null;
    };
  };
  updatedAt: string;
}

export interface OperationsUsersResponse {
  data: OperationsUserListItem[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface ProjectSummary {
  id: string;
  name: string;
  slug: string;
  summary?: string | null;
  brief?: string | null;
  status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ARCHIVED';
  visibility: string;
  githubUrl?: string | null;
  ownerId: string;
  leadAgentUserId?: string | null;
  budgetAmount: number;
  budgetCurrency: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  deletedById?: string | null;
  memberCount?: number;
  workItemCount?: number;
  artifactCount?: number;
  owner?: any;
  leadAgent?: any;
  projectGlobals?: ProjectGlobalVariable[];
  settings?: Record<string, unknown> | null;
}

export interface ProjectListMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  stats?: {
    total: number;
    active: number;
    workItems: number;
    artifacts: number;
  };
}

export interface ProjectTemplateRoleEntry {
  role: string;
  ref?: string;
  auto?: 'OWNER' | 'ON_CREATE' | null;
  launchable?: boolean;
  label?: string | null;
  description?: string | null;
  skills?: Array<{
    ref: string;
    name?: string | null;
    source?: 'external' | 'role' | 'project' | null;
    path?: string | null;
    description?: string | null;
  }>;
  skillBundleRefs?: string[];
  capabilityBundleRefs?: string[];
  capabilityBundles?: Array<{
    ref: string;
    required?: boolean;
    purpose?: string | null;
    requiredScopes?: string[];
    requiredProjectGlobals?: string[];
    surfaces?: string[];
    runtimeCompatibility?: ProjectTemplateRoleEntry['runtimeCompatibility'] | null;
  }>;
  runtimeCompatibility?: {
    requiredFeatures?: string[];
    optionalFeatures?: string[];
    agentTypes?: Record<string, {
      status?: 'native' | 'degraded' | 'unsupported';
      notes?: string[];
      unsupportedFeatures?: string[];
    }>;
  } | null;
  initialPrompt?: string | null;
  scopes?: string[];
  polling?: Record<string, unknown> | null;
}

export interface ProjectTemplateSummary {
  id: string;
  label: string;
  description?: string;
  version?: string;
  settings?: Record<string, unknown>;
  workItemStatusFlow?: Record<string, unknown>;
  roleLaunchProfiles?: Array<Record<string, unknown>>;
  projectFileFolders: string[];
  roles: ProjectTemplateRoleEntry[];
  projectGlobals: Array<{
    key: string;
    label?: string | null;
    description?: string | null;
    value?: string | null;
    isSecret?: boolean;
    required?: boolean;
    createTaskOnMissing?: boolean;
    category?: string | null;
  }>;
}

export interface ProjectGlobalVariable {
  key: string;
  label: string;
  description?: string | null;
  value?: string;
  isSecret?: boolean;
  required?: boolean;
  createTaskOnMissing?: boolean;
  category?: string | null;
  scope?: 'project' | 'goal' | string | null;
  goalId?: string | null;
  configured?: boolean;
}

export interface ProjectWorkItem {
  id: string;
  projectId: string;
  createdById?: string;
  ownerId?: string | null;
  goalId?: string | null;
  featureId?: string | null;
  parentWorkItemId?: string | null;
  title: string;
  description?: string | null;
  workType: string;
  status: string;
  concurrencyMode?: 'SINGLE' | 'RACE' | 'MULTI_ROLE' | 'PRIMARY_BACKUP';
  priority: number;
  acceptanceCriteria?: string | null;
  scopeBrief?: string | null;
  inputPacket?: Record<string, unknown> | null;
  outputContract?: Record<string, unknown> | null;
  dependsOn?: string[] | null;
  relatedItems?: ProjectWorkItemSummary[];
  dependencyItems?: ProjectWorkItemSummary[];
  acceptedUpstreamItems?: ProjectAcceptedUpstreamItemSummary[];
  createdAt: string;
  updatedAt: string;
  owner?: any;
  assignments?: any[];
  runs?: any[];
  artifacts?: any[];
  reviews?: any[];
  comments?: ProjectWorkItemComment[];
  _count?: {
    assignments?: number;
    artifacts?: number;
    reviews?: number;
    runs?: number;
    comments?: number;
  };
}

export interface ProjectWorkItemSummary {
  id: string;
  title: string;
  description?: string | null;
  workType?: string | null;
  status?: string | null;
  scopeBrief?: string | null;
  acceptanceCriteria?: string | null;
  goalId?: string | null;
  featureId?: string | null;
  dependsOn?: string[] | null;
  priority?: number;
  dueAt?: string | null;
  updatedAt?: string | null;
  outputContract?: Record<string, unknown> | null;
  outputProjectFiles?: string[];
}

export interface ProjectAcceptedUpstreamItemSummary extends ProjectWorkItemSummary {
  workItemId: string;
  outputPaths?: string[];
  source?: string | null;
}

export interface ProjectWorkItemListMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  statusCounts?: Record<string, number>;
}

export interface ProjectCoordinatorTickResult {
  projectId: string;
  dispatched: Array<{
    workItemId: string;
    workItemTitle?: string | null;
    role: string;
    memberId: string;
    userId: string;
    runtimeId?: string | null;
    assignmentId: string;
    launchMode: string;
    agentType: string;
    dispatchMode?: string | null;
    conversationId?: string | null;
    requestId?: string | null;
    messageSent?: boolean;
    message: string;
  }>;
  blocked: Array<Record<string, unknown> & { message?: string; reason?: string; workItemId?: string | null }>;
  skipped: Array<Record<string, unknown> & { workItemId?: string | null; reason?: string }>;
  logs: string[];
}

export interface ProjectCoordinatorDispatchRule {
  statuses?: string[];
  workTypes?: string[];
  role: string;
  launchMode?: 'local-docker' | 'local-runner' | 'local-codex' | 'aws-ecs' | 'aws-agentcore' | null;
  agentType?: string | null;
  maxAgents?: number | null;
  minAgents?: number | null;
  forceLaunchNew?: boolean;
  allowOwnerOwned?: boolean;
  allowRepeatCompleted?: boolean;
  objective?: string | null;
  message?: string | null;
}

export interface ProjectCoordinatorConfig {
  enabled: boolean;
  maxDispatchesPerTick: number;
  launchMode?: 'local-docker' | 'local-runner' | 'local-codex' | 'aws-ecs' | 'aws-agentcore' | null;
  agentType?: string | null;
  messageTemplate?: string | null;
  lastTickAt?: string | null;
  dispatchRules?: ProjectCoordinatorDispatchRule[];
}

export interface ProjectWorkItemCommentAttachment {
  path?: string;
  key?: string;
  url?: string;
  name?: string;
  size?: number;
  downloadUrl?: string | null;
}

export interface ProjectWorkItemComment {
  id: string;
  projectId: string;
  workItemId: string;
  userId: string;
  content: string;
  attachments?: ProjectWorkItemCommentAttachment[];
  createdAt: string;
  updatedAt: string;
  user?: UserSearchResult;
}

export interface UserSearchResult {
  id: string;
  email: string;
  displayName?: string | null;
  role: 'HUMAN' | 'AI_AGENT' | 'ADMIN';
  githubLogin?: string | null;
  avatarUrl?: string | null;
  bio?: string | null;
  createdAt: string;
}

export interface ProjectMember {
  id: string;
  projectId: string;
  userId: string;
  role: string;
  permissions?: Record<string, unknown> | null;
  joinedAt: string;
  removedAt?: string | null;
  user: UserSearchResult;
}

export interface ProjectFileEntry {
  path: string;
  key: string;
  size: number;
  lastModified?: string;
  etag?: string;
  contentType?: string;
  downloadUrl?: string | null;
  fileCount?: number;
  source?: string;
  type?: 'file' | 'folder';
}

export interface ProjectFolderEntry {
  path: string;
  name: string;
  key: string;
  size?: number;
  fileCount?: number;
  lastModified?: string | null;
}

export interface ProjectAssignment {
  id: string;
  projectId: string;
  workItemId: string;
  assigneeUserId: string;
  assignedByUserId: string;
  role: string;
  status: string;
  objective?: string | null;
  contextPacket?: Record<string, unknown> | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  assigneeUser?: UserSearchResult;
  assignedByUser?: UserSearchResult;
}

export interface ProjectRunLog {
  id: string;
  runId: string;
  level: string;
  message: string;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

export interface ProjectRun {
  id: string;
  projectId: string;
  workItemId: string;
  assignmentId?: string | null;
  triggeredByUserId?: string | null;
  runType: string;
  status: string;
  instruction?: string | null;
  contextSnapshot?: Record<string, unknown> | null;
  resultSummary?: string | null;
  costInfo?: Record<string, unknown> | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  assignment?: ProjectAssignment | null;
  logs?: ProjectRunLog[];
  artifacts?: any[];
}

export interface ProjectActivityItem {
  id: string;
  type: 'WORK_ITEM' | 'ASSIGNMENT' | 'RUN' | 'RUN_LOG' | 'ARTIFACT' | 'REVIEW' | 'MEMORY';
  occurredAt: string;
  title: string;
  summary?: string | null;
  actor?: UserSearchResult | null;
  workItem?: {
    id: string;
    title: string;
    status: string;
    workType?: string;
  } | null;
  run?: {
    id: string;
    status: string;
    runType: string;
  } | null;
  assignment?: {
    id: string;
    role: string;
    status: string;
  } | null;
  review?: {
    id: string;
    status: string;
    reviewerType: string;
  } | null;
  artifact?: {
    id: string;
    title?: string | null;
    artifactType: string;
  } | null;
  memory?: {
    id: string;
    memoryType: string;
  } | null;
}

export interface ProjectEventItem {
  id: string;
  seq: number;
  type: string;
  refType?: string | null;
  refId?: string | null;
  payload?: Record<string, unknown> | null;
  actor?: UserSearchResult | null;
  createdAt: string;
}

export interface ProjectEventGraphNode {
  id: string;
  type: 'PROJECT' | 'HUMAN' | 'AGENT' | 'GOAL' | 'FEATURE' | 'WORK_ITEM' | 'RUN' | 'ARTIFACT' | 'REVIEW' | 'RESOURCE' | 'FILE' | 'FOLDER' | 'MESSAGE' | 'EVENT' | string;
  label: string;
  subtitle?: string | null;
  status?: string | null;
  meta?: Record<string, unknown> | null;
}

export interface ProjectEventGraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  label?: string | null;
  eventId?: string | null;
  occurredAt?: string | null;
  seq?: number | null;
  meta?: Record<string, unknown> | null;
}

export interface ProjectEventGraph {
  projectId: string;
  lastSeq: number;
  nodes: ProjectEventGraphNode[];
  edges: ProjectEventGraphEdge[];
  events: ProjectEventItem[];
}

export interface ProjectCockpitMember {
  memberId: string;
  role: string;
  joinedAt: string;
  permissions?: Record<string, unknown> | null;
  user: UserSearchResult;
  metrics: {
    assignments: number;
    activeAssignments: number;
    completedAssignments: number;
    failedAssignments: number;
    runs: number;
    activeRuns: number;
    successfulRuns: number;
    failedRuns: number;
  };
  focusWorkItems: Array<{
    id: string;
    title: string;
    workType: string;
    status: string;
  }>;
  lastRun?: {
    id: string;
    status: string;
    runType: string;
    updatedAt: string;
    workItem?: {
      id: string;
      title: string;
      status: string;
      workType?: string;
    } | null;
  } | null;
}

export interface ProjectAgentRuntimeSession {
  provider: string;
  agentType?: string | null;
  piBackend?: 'rpc' | 'cli' | null;
  image: string;
  containerName: string;
  containerId?: string | null;
  cloudTaskArn?: string | null;
  cloudClusterArn?: string | null;
  cloudPrivateIp?: string | null;
  apiBaseUrl: string;
  dataDir: string;
  runtimeId: string;
  grantId: string;
  repoWorkspaceDir?: string;
  scopes: string[];
  skillBundleRefs: string[];
  projectSkillOverrides?: Array<{
    ref: string;
    name: string;
    storagePath?: string | null;
    files?: Array<{ path: string; size?: number }>;
    updatedAt?: string | null;
    updatedById?: string | null;
  }>;
  capabilityBundleRefs?: string[];
  capabilityBundles?: Array<{
    ref: string;
    name?: string | null;
    description?: string | null;
    requiredScopes?: string[];
    requiredProjectGlobals?: string[];
  }>;
  runtimeFeatureSupport?: {
    agentType: string;
    supportedFeatures: string[];
    unsupportedFeatures: string[];
    notes: string[];
  };
  runtimeCapabilityWarnings?: string[];
  agentDisplayName?: string | null;
  rolePrompt?: string | null;
  enableSudo?: boolean;
  llm?: {
    configId: string;
    name: string;
    apiType: string;
    apiUrl: string;
    modelName: string;
  };
  role: string;
  status: string;
  launchedAt: string;
  updatedAt: string;
  lastMessageAt?: string | null;
  lastResponseAt?: string | null;
  activeRequestId?: string | null;
  activeRequestConversationId?: string | null;
  lastStreamAt?: string | null;
  lastError?: string | null;
  currentActivity?: string | null;
  activeConversationId?: string | null;
  conversations?: ProjectAgentRuntimeConversation[];
  pollingConfig?: ProjectAgentPollingConfig | null;
  pollingState?: ProjectAgentPollingState | null;
  recentActions?: Array<{
    kind: 'tool' | 'tool_result' | 'message';
    name: string;
    summary: string;
    status?: 'ok' | 'error' | 'pending';
  }>;
  messageHistory?: Array<{
    id: string;
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string;
    createdAt: string;
    status?: string | null;
    actions?: Array<{
      kind: 'tool' | 'tool_result' | 'message';
      name: string;
      summary: string;
      status?: 'ok' | 'error' | 'pending';
    }>;
  }>;
  dockerStatus?: Record<string, unknown>;
  apiHealth?: Record<string, unknown>;
}

export interface ProjectAgentPollingConfig {
  enabled: boolean;
  strategy: 'IDLE_ONLY' | 'FIXED_INTERVAL';
  intervalMinutes: number;
  message: string;
}

export interface ProjectAgentPollingState {
  lastRunAt?: string | null;
  lastCompletedAt?: string | null;
  nextRunAt?: string | null;
  lastConversationId?: string | null;
  lastError?: string | null;
}

export interface ProjectAgentRuntimeConversation {
  id: string;
  title: string;
  titleLocked?: boolean;
  createdAt: string;
  updatedAt: string;
  messageHistory: NonNullable<ProjectAgentRuntimeSession['messageHistory']>;
}

export interface ProjectAgentRuntimeWorkspaceFile {
  path: string;
  name: string;
  size: number;
  modifiedAt?: string | null;
  downloadUrl?: string | null;
}

export interface ProjectAgentRuntimeBudget {
  budgetAmount: number;
  budgetCurrency: string;
  dailyAgentCostAmount: number;
  committedAmount: number;
  availableAmount: number;
  canLaunchOneDayAgent: boolean;
  runtimeCommitments: Array<Record<string, unknown>>;
  launchableRoles: Array<{
    role: string;
    label: string;
    description: string;
    skillBundleRefs: string[];
    capabilityBundleRefs?: string[];
    requiredProjectGlobals?: string[];
  }>;
}

export interface ProjectLocalRunnerPresence {
  id: string;
  provider: 'local-runner' | 'local-codex';
  scope?: 'project' | 'account';
  name: string;
  tokenId?: string | null;
  startedAt: string;
  lastSeenAt: string;
  disconnectedAt?: string | null;
  disconnectReason?: string | null;
  platform?: string | null;
  version?: string | null;
  online: boolean;
  staleAfterMs: number;
}

export interface ProjectAgentRuntime {
  memberId: string;
  userId: string;
  role: string;
  user: UserSearchResult;
  runtime?: Record<string, unknown> | null;
  presence?: Record<string, unknown> | null;
  session: ProjectAgentRuntimeSession;
}

export interface ProjectAssignmentRuntimeState {
  id: string;
  projectId: string;
  workItemId: string;
  role: string;
  status: string;
  objective?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  workItem?: {
    id: string;
    title: string;
    status: string;
    workType: string;
    goalId?: string | null;
    featureId?: string | null;
    ownerId?: string | null;
    updatedAt?: string | null;
  } | null;
  assigneeUser?: UserSearchResult | null;
  assignedByUser?: UserSearchResult | null;
  assigneeRuntime?: {
    available: boolean;
    memberId?: string | null;
    session?: ProjectAgentRuntimeSession | null;
    workspaceListEndpoint?: string | null;
  };
  failureContext?: Record<string, unknown> | null;
  staleDispatch?: Record<string, unknown> | null;
  dispatchFailure?: Record<string, unknown> | null;
  health?: {
    stale: boolean;
    staleReasons: string[];
  };
}

export interface ProjectAgentRuntimeStreamEvent {
  type: 'snapshot' | 'session' | 'progress' | 'complete' | 'error' | 'cancelled' | 'heartbeat';
  projectId: string;
  memberId: string;
  role?: string;
  requestId?: string;
  message?: string;
  session?: ProjectAgentRuntimeSession;
  at: string;
}

export interface ProjectAgentRuntimeImage {
  id: string;
  label: string;
  provider: string;
  agentType?: string | null;
}

export interface ProjectRoleSkillDetail {
  ref: string;
  name: string;
  storagePath?: string | null;
  overridden?: boolean;
  updatedAt?: string | null;
  updatedById?: string | null;
  content: string;
}

export interface ProjectAgentProfile {
  id: string;
  projectId: string;
  name: string;
  description?: string | null;
  role: string;
  launchMode: 'local-docker' | 'local-runner' | 'local-codex' | 'aws-ecs' | 'aws-agentcore';
  agentType: string;
  image?: string | null;
  model?: string | null;
  llmConfigId?: string | null;
  deploymentDays: number;
  enableSudo?: boolean;
  settings?: Record<string, unknown> | null;
  createdById: string;
  createdBy?: { id: string; email: string; displayName?: string | null } | null;
  lastLaunchedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiConfigRecord {
  id: string;
  name: string;
  apiType: 'openai' | 'claude';
  apiUrl: string;
  apiKey: string;
  modelName: string;
  isActive?: boolean;
  createdAt?: string;
  lastUsedAt?: string | null;
}

export interface ProjectBoard {
  project: ProjectSummary & {
    owner?: UserSearchResult;
    leadAgent?: UserSearchResult | null;
  };
  metrics: {
    goals: number;
    features: number;
    members: number;
    workItems: number;
    assignments: number;
    runs: number;
    artifacts: number;
    reviews: number;
    memories: number;
    workItemStatusCounts: Record<string, number>;
    assignmentStatusCounts: Record<string, number>;
    runStatusCounts: Record<string, number>;
    reviewStatusCounts: Record<string, number>;
  };
  lanes: Array<{
    status: string;
    count: number;
    items: Array<{
      id: string;
      title: string;
      workType: string;
      status: string;
      priority: number;
      owner?: UserSearchResult | null;
      _count?: {
        assignments?: number;
        runs?: number;
        artifacts?: number;
        reviews?: number;
      };
    }>;
  }>;
  cockpit: ProjectCockpitMember[];
  recent: {
    artifacts: any[];
    reviews: any[];
    memories: any[];
    runs: Array<{
      id: string;
      status: string;
      runType: string;
      updatedAt: string;
      workItem?: {
        id: string;
        title: string;
        status: string;
        workType?: string;
      } | null;
    }>;
  };
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new ApiError(apiErrorMessage(error, res.statusText), res.status, error);
  }
  return res.json();
}

export interface AicoinLeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string;
  avatarUrl?: string | null;
  earned: number;
  payoutCount: number;
}

export interface AicoinLeaderboard {
  monthKey: string;
  limit: number;
  totalEarners: number;
  hasMore: boolean;
  entries: AicoinLeaderboardEntry[];
  updatedAt: string;
}

export interface AicoinOverview {
  contract: {
    name: string;
    symbol: string;
    chain: string;
    rewardPoolAllocation: number;
    rewardPoolAllocationLabel: string;
    tokenTotalSupply: number;
    tokenTotalSupplyLabel: string;
    monthlyRelease: number;
    monthlyReleaseLabel: string;
    contractAddress?: string | null;
    vestingContractAddress?: string | null;
  };
  taskMarket: {
    activeTaskCount: number;
    activeTaskValue: number;
    activeTaskValueLabel: string;
    problemCount: number;
    completedTaskCount: number;
  };
  questionBank: {
    problemCount: number;
    openTaskCount: number;
    completedTaskCount: number;
  };
  leaderboard: AicoinLeaderboard;
  updatedAt: string;
}

async function requestBlob(path: string, options: RequestInit = {}): Promise<{ blob: Blob; filename: string }> {
  const token = localStorage.getItem('token');
  const headers: Record<string, string> = {
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new ApiError(apiErrorMessage(error, res.statusText), res.status, error);
  }
  const disposition = res.headers.get('content-disposition') || '';
  const encodedMatch = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  const plainMatch = disposition.match(/filename="?([^";]+)"?/i);
  const filename = encodedMatch
    ? decodeURIComponent(encodedMatch[1])
    : plainMatch?.[1] || 'download';
  return { blob: await res.blob(), filename };
}

async function streamRequest<T>(
  path: string,
  onEvent: (event: T) => void,
  signal?: AbortSignal,
): Promise<void> {
  const token = localStorage.getItem('token');
  const headers: Record<string, string> = {
    Accept: 'text/event-stream',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, { headers, signal });
  if (!res.ok || !res.body) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new ApiError(apiErrorMessage(error, res.statusText || 'Stream request failed'), res.status, error);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let dataLines: string[] = [];

  const dispatch = () => {
    if (!dataLines.length) return;
    const raw = dataLines.join('\n');
    dataLines = [];
    if (!raw || raw === '[DONE]') return;
    try {
      onEvent(JSON.parse(raw) as T);
    } catch {
      // Ignore malformed keepalive/proxy fragments.
    }
  };

  const consumeLine = (line: string) => {
    if (!line) {
      dispatch();
      return;
    }
    if (line.startsWith(':') || line.startsWith('event:')) return;
    if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).trimStart());
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';
    lines.forEach(consumeLine);
  }
  buffer += decoder.decode();
  if (buffer) consumeLine(buffer);
  dispatch();
}

function hasAuthToken() {
  return Boolean(localStorage.getItem('token'));
}

export const api = {
  auth: {
    sendEmailVerificationCode: (data: { email: string }) =>
      request<{ email: string; expiresInSeconds: number; debugCode?: string }>('/auth/email/verification-code', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    register: (data: { email: string; password: string; verificationCode: string; displayName?: string; role?: string }) =>
      request<{ access_token: string; user: any }>('/auth/register', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    login: (data: { email: string; password: string }) =>
      request<{ access_token: string; user: any }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    me: () => request<any>('/auth/me'),
    getGithubBindUrl: (redirect?: string) => {
      const query = redirect ? `?redirect=${encodeURIComponent(redirect)}` : '';
      return request<{ url: string }>(`/auth/github/bind-url${query}`);
    },
  },
  users: {
    me: () => request<any>('/users/me'),
    updateProfile: (data: any) =>
      request<any>('/users/profile', { method: 'PATCH', body: JSON.stringify(data) }),
    getPublicProfile: (id: string) => request<any>(`/users/${id}`),
    search: (params?: Record<string, string>) => {
      const query = params ? '?' + new URLSearchParams(params).toString() : '';
      return request<UserSearchResult[]>(`/users/search${query}`);
    },
    uploadAvatar: async (file: File): Promise<{ avatarUrl: string; message: string }> => {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('avatar', file);
      const res = await fetch(`${API_BASE}/users/avatar/upload`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: res.statusText }));
        throw new ApiError(apiErrorMessage(error, res.statusText || 'Avatar upload failed'), res.status, error);
      }
      return res.json();
    },
  },
  tasks: {
    list: (params?: Record<string, string>) => {
      const query = params ? '?' + new URLSearchParams(params).toString() : '';
      return request<{ data: any[]; meta: any }>(`/tasks${query}`);
    },
    get: (id: string) => request<any>(`/tasks/${id}`),
    create: (data: any) =>
      request<any>('/tasks', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) =>
      request<any>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    review: (id: string) =>
      request<any>(`/tasks/${id}/review`, { method: 'POST' }),
    submitPr: (id: string, data: { prUrl: string; headSha: string; note?: string }) =>
      request<any>(`/tasks/${id}/submit-pr`, { method: 'POST', body: JSON.stringify(data) }),
    cancel: (id: string) =>
      request<any>(`/tasks/${id}`, { method: 'DELETE' }),
  },
  submissions: {
    submit: (taskId: string, data: { content: string; fileUrls?: string[] }) =>
      request<any>(`/submissions/task/${taskId}`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    submitPr: (taskId: string, data: { prUrl: string; headSha: string; note?: string }) =>
      request<any>(`/submissions/task/${taskId}/pr`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    review: (id: string, data: { action: string; reviewNote?: string }) =>
      request<any>(`/submissions/${id}/review`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    byTask: (taskId: string) => request<any[]>(`/submissions/task/${taskId}`),
    my: (params?: Record<string, string>) => {
      const query = params ? '?' + new URLSearchParams(params).toString() : '';
      return request<{ data: any[]; meta: any }>(`/submissions/my${query}`);
    },
  },
  comments: {
    list: (taskId: string) => request<any[]>(`/comments/task/${taskId}`),
    create: (taskId: string, data: { content: string; fileUrls?: string[]; parentId?: string }) =>
      request<any>(`/comments/task/${taskId}`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },
  files: {
    upload: async (file: File): Promise<{ url: string; key: string }> => {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${API_BASE}/files/upload`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: res.statusText }));
        throw new ApiError(apiErrorMessage(error, res.statusText || 'Upload failed'), res.status, error);
      }
      return res.json();
    },
  },
  wallet: {
    balance: () => request<{ offchain: number; onchain: string; walletAddress: string; blockchainConfigured: boolean }>('/wallet/balance'),
    transactions: (params?: Record<string, string>) => {
      const query = params ? '?' + new URLSearchParams(params).toString() : '';
      return request<{ data: any[]; meta: any }>(`/wallet/transactions${query}`);
    },
    withdraw: (data: { amount: number; toAddress?: string }) =>
      request<{ txHash: string; amount: number; toAddress: string }>('/wallet/withdraw', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },
  aicoin: {
    overview: () => request<AicoinOverview>('/aicoin/overview'),
    leaderboard: (params?: Record<string, string>) => {
      const query = params ? '?' + new URLSearchParams(params).toString() : '';
      return request<AicoinLeaderboard>(`/aicoin/leaderboard${query}`);
    },
  },
  llm: {
    chat: (data: {
      messages: { role: string; content: string }[];
      apiUrl: string;
      apiKey: string;
      modelName: string;
      apiType: 'openai' | 'claude';
      maxTokens?: number;
    }) =>
      request<{ content: string; tokensUsed: number }>('/llm/chat', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },
  agentLogs: {
    createSession: (data: {
      type: 'WORKER' | 'REVIEWER';
      taskId?: string;
      taskTitle?: string;
      reward?: number;
      currency?: string;
      workerName?: string;
    }) =>
      request<any>('/agent-logs/sessions', { method: 'POST', body: JSON.stringify(data) }),
    addLog: (sessionId: string, data: { message: string; level?: string }) =>
      request<any>(`/agent-logs/sessions/${sessionId}/logs`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    finishSession: (sessionId: string, data: { status: string }) =>
      request<any>(`/agent-logs/sessions/${sessionId}/finish`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    listSessions: (type: 'WORKER' | 'REVIEWER', limit = 50) =>
      request<any[]>(`/agent-logs/sessions?type=${type}&limit=${limit}`),
    getStats: (type: 'WORKER' | 'REVIEWER') =>
      request<any>(`/agent-logs/stats?type=${type}`),
    incrementStats: (data: {
      type: 'WORKER' | 'REVIEWER';
      tokensUsed?: number;
      tasksCompleted?: number;
      earnings?: number;
      reviewed?: number;
      approved?: number;
      rejected?: number;
    }) =>
      request<any>('/agent-logs/stats/increment', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    clear: (type: 'WORKER' | 'REVIEWER') =>
      request<any>(`/agent-logs/clear?type=${type}`, { method: 'DELETE' }),
  },
  apiConfigs: {
    list: () => request<ApiConfigRecord[]>('/api-configs'),
    get: (id: string) => request<ApiConfigRecord>(`/api-configs/${id}`),
    create: (data: { name: string; apiType: string; apiUrl: string; apiKey: string; modelName: string }) =>
      request<ApiConfigRecord>('/api-configs', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: string, data: Partial<{ name: string; apiType: string; apiUrl: string; apiKey: string; modelName: string }>) =>
      request<ApiConfigRecord>(`/api-configs/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      request<any>(`/api-configs/${id}`, {
        method: 'DELETE',
      }),
    activate: (id: string) =>
      request<any>(`/api-configs/${id}/activate`, {
        method: 'PUT',
      }),
    getActive: () => request<ApiConfigRecord>('/api-configs/active/current'),
  },
  taskGenerator: {
    fetchGithub: (data: { repos?: string; limit?: number }) =>
      request<{ fetched: number; skipped: number }>('/task-generator/fetch/github', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    fetchHackerOne: (data: { handles?: string; limit?: number; scopeLimit?: number }) =>
      request<{ fetched: number; skipped: number }>('/task-generator/fetch/hackerone', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    score: (batchSize?: number) => {
      const query = typeof batchSize === 'number' ? `?batchSize=${batchSize}` : '';
      return request<{ scored: number; failed: number }>(`/task-generator/score${query}`, {
        method: 'POST',
      });
    },
    publish: () =>
      request<{ published: number; skipped: number }>('/task-generator/publish', {
        method: 'POST',
      }),
    listRawTasks: (params?: Record<string, string>) => {
      const query = params ? '?' + new URLSearchParams(params).toString() : '';
      return request<{ data: any[]; meta: any }>(`/task-generator/raw-tasks${query}`);
    },
    getRawTaskStats: (params?: Record<string, string>) => {
      const query = params ? '?' + new URLSearchParams(params).toString() : '';
      return request<{
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
      }>(`/task-generator/raw-tasks/stats${query}`);
    },
    getRawTask: (id: string) => request<any>(`/task-generator/raw-tasks/${id}`),
    getGithubPolicy: () => request<GithubPublishPolicy>('/task-generator/policy/github'),
    updateGithubPolicy: (data: Partial<GithubPublishPolicy>) =>
      request<GithubPublishPolicy>('/task-generator/policy/github', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    createRun: (data: {
      type: 'FETCH_GITHUB' | 'FETCH_HACKERONE' | 'SCORE' | 'PUBLISH' | 'SCORE_AND_PUBLISH';
      repos?: string;
      handles?: string;
      limit?: number;
      scopeLimit?: number;
      batchSize?: number;
    }) =>
      request<TaskGeneratorRun>('/task-generator/runs', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    listRuns: (limit = 20) => request<TaskGeneratorRun[]>(`/task-generator/runs?limit=${limit}`),
    getRun: (id: string) => request<TaskGeneratorRun>(`/task-generator/runs/${id}`),
  },
  operations: {
    trackHomepageVisit: () =>
      request<{ ok: boolean }>('/operations/homepage-visit', {
        method: 'POST',
        body: JSON.stringify({ path: '/' }),
      }),
    overview: () => request<OperationsOverview>('/operations/overview'),
    users: (params?: Record<string, string>) => {
      const query = params ? '?' + new URLSearchParams(params).toString() : '';
      return request<OperationsUsersResponse>(`/operations/users${query}`);
    },
  },
  projects: {
    list: (params?: Record<string, string>) => {
      const query = params ? '?' + new URLSearchParams(params).toString() : '';
      return request<{ data: ProjectSummary[]; meta: ProjectListMeta }>(
        `${hasAuthToken() ? '/projects' : '/public/projects'}${query}`,
      );
    },
    get: (id: string) => request<any>(`${hasAuthToken() ? '/projects' : '/public/projects'}/${id}`),
    getBoard: (id: string) =>
      request<ProjectBoard>(`${hasAuthToken() ? '/projects' : '/public/projects'}/${id}/board`),
    getCockpit: (id: string) =>
      request<{ project: ProjectSummary; metrics: ProjectBoard['metrics']; cockpit: ProjectCockpitMember[] }>(
        `/projects/${id}/cockpit`,
      ),
    refreshTemplate: (id: string, data?: { applyToRunning?: boolean }) =>
      request<{
        projectId: string;
        template: { id: string; label?: string | null; version?: string | null };
        refreshedRoles: string[];
        settings: Record<string, unknown>;
        updatedRuntimeMemberIds: string[];
      }>(`/projects/${id}/template/refresh`, {
        method: 'POST',
        body: JSON.stringify(data || { applyToRunning: true }),
      }),
    roles: {
      getSkills: (projectId: string, role: string) =>
        request<{
          projectId: string;
          role: string;
          override: Record<string, unknown> | null;
          roleConfig: ProjectTemplateRoleEntry;
          skills: ProjectRoleSkillDetail[];
        }>(`/projects/${projectId}/roles/${encodeURIComponent(role)}/skills`),
      updatePrompt: (
        projectId: string,
        role: string,
        data: { initialPrompt?: string | null; reset?: boolean; applyToRunning?: boolean },
      ) =>
        request<{
          projectId: string;
          role: string;
          override: Record<string, unknown> | null;
          roleConfig: ProjectTemplateRoleEntry;
          settings: Record<string, unknown>;
          updatedRuntimeMemberIds: string[];
        }>(`/projects/${projectId}/roles/${encodeURIComponent(role)}/prompt`, {
          method: 'PATCH',
          body: JSON.stringify(data),
        }),
      updateSkills: (
        projectId: string,
        role: string,
        data: {
          skillBundleRefs?: string[];
          skillMarkdownByRef?: Record<string, string | null>;
          reset?: boolean;
          applyToRunning?: boolean;
        },
      ) =>
        request<{
          projectId: string;
          role: string;
          override: Record<string, unknown> | null;
          roleConfig: ProjectTemplateRoleEntry;
          skills: ProjectRoleSkillDetail[];
          settings: Record<string, unknown>;
          updatedRuntimeMemberIds: string[];
        }>(`/projects/${projectId}/roles/${encodeURIComponent(role)}/skills`, {
          method: 'PATCH',
          body: JSON.stringify(data),
        }),
    },
    agentRuntimes: {
      list: (projectId: string) =>
        request<{ projectId: string; budget?: ProjectAgentRuntimeBudget; sessions: ProjectAgentRuntime[]; localRunners?: ProjectLocalRunnerPresence[] }>(
          `/projects/${projectId}/agent-runtimes`,
        ),
      images: (projectId: string) =>
        request<{ images: ProjectAgentRuntimeImage[] }>(
          `/projects/${projectId}/agent-runtimes/images`,
        ),
      launch: (
        projectId: string,
        data: {
          role: string;
          memberId?: string;
          llmConfigId?: string;
          image?: string;
          model?: string;
          agentType?: string;
          launchMode?: 'local-docker' | 'local-runner' | 'local-codex' | 'aws-ecs' | 'aws-agentcore';
          deploymentDays?: number;
          enableSudo?: boolean;
        },
      ) =>
        request<{ projectId: string; memberId: string; userId: string; role: string; budget?: Record<string, unknown>; session: ProjectAgentRuntimeSession }>(
          `/projects/${projectId}/agent-runtimes/launch`,
          {
            method: 'POST',
            body: JSON.stringify(data),
          },
        ),
      reconnect: (projectId: string, memberId: string) =>
        request<{ projectId: string; memberId: string; role: string; session: ProjectAgentRuntimeSession }>(
          `/projects/${projectId}/agent-runtimes/${memberId}/reconnect`,
          {
            method: 'POST',
          },
        ),
      createRunnerToken: (projectId: string, data?: { name?: string }) =>
        request<{ projectId: string; token: string; tokenId: string; name: string; createdAt: string }>(
          `/projects/${projectId}/agent-runtimes/local-runner/token`,
          {
            method: 'POST',
            body: JSON.stringify(data || {}),
          },
        ),
      createCodexToken: (projectId: string, data?: { name?: string }) =>
        request<{ projectId: string; token: string; tokenId: string; name: string; createdAt: string }>(
          `/projects/${projectId}/agent-runtimes/local-codex/token`,
          {
            method: 'POST',
            body: JSON.stringify(data || {}),
          },
        ),
      createAccountRunnerToken: (data?: { name?: string }) =>
        request<{ token: string; tokenId: string; name: string; createdAt: string }>(
          '/projects/account-local-runners/local-runner/token',
          {
            method: 'POST',
            body: JSON.stringify(data || {}),
          },
        ),
      createAccountCodexToken: (data?: { name?: string }) =>
        request<{ token: string; tokenId: string; name: string; createdAt: string }>(
          '/projects/account-local-runners/local-codex/token',
          {
            method: 'POST',
            body: JSON.stringify(data || {}),
          },
        ),
      sendMessage: (projectId: string, memberId: string, data: { message: string; conversationId?: string; delivery?: 'steer' | 'followUp' }) =>
        request<{ memberId: string; role: string; accepted?: boolean; session: ProjectAgentRuntimeSession; response: string; raw?: unknown }>(
          `/projects/${projectId}/agent-runtimes/${memberId}/messages`,
          {
            method: 'POST',
            body: JSON.stringify(data),
          },
        ),
      streamEvents: (
        projectId: string,
        memberId: string,
        onEvent: (event: ProjectAgentRuntimeStreamEvent) => void,
        signal?: AbortSignal,
      ) =>
        streamRequest<ProjectAgentRuntimeStreamEvent>(
          `/projects/${projectId}/agent-runtimes/${memberId}/messages/stream`,
          onEvent,
          signal,
        ),
      createConversation: (projectId: string, memberId: string) =>
        request<{
          memberId: string;
          role: string;
          conversation: ProjectAgentRuntimeConversation;
          session: ProjectAgentRuntimeSession;
          response: string;
        }>(`/projects/${projectId}/agent-runtimes/${memberId}/conversations`, {
          method: 'POST',
        }),
      updateConversation: (projectId: string, memberId: string, conversationId: string, data: { title: string }) =>
        request<{
          memberId: string;
          role: string;
          conversation: ProjectAgentRuntimeConversation;
          session: ProjectAgentRuntimeSession;
          response: string;
        }>(`/projects/${projectId}/agent-runtimes/${memberId}/conversations/${conversationId}`, {
          method: 'PATCH',
          body: JSON.stringify(data),
        }),
      deleteConversation: (projectId: string, memberId: string, conversationId: string) =>
        request<{
          memberId: string;
          role: string;
          deletedConversationId: string;
          session: ProjectAgentRuntimeSession;
          response: string;
        }>(`/projects/${projectId}/agent-runtimes/${memberId}/conversations/${conversationId}`, {
          method: 'DELETE',
        }),
      tickPolling: (projectId: string, memberId: string, options?: { force?: boolean; summary?: boolean }) => {
        const params = new URLSearchParams();
        if (options?.force) params.set('force', 'true');
        if (options?.summary) params.set('summary', 'true');
        const query = params.toString() ? `?${params.toString()}` : '';
        return request<{
          memberId: string;
          role: string;
          triggered: boolean;
          reason?: string;
          config?: ProjectAgentPollingConfig;
          pollingState?: ProjectAgentPollingState;
          conversation?: ProjectAgentRuntimeConversation;
          session?: ProjectAgentRuntimeSession;
          response?: string;
        }>(`/projects/${projectId}/agent-runtimes/${memberId}/polling/tick${query}`, {
          method: 'POST',
        });
      },
      runtimeState: (projectId: string, params?: { workItemId?: string; status?: string; limit?: string }) => {
        const query = params ? '?' + new URLSearchParams(params).toString() : '';
        return request<{
          projectId: string;
          limit: number;
          count: number;
          statusCounts: Record<string, number>;
          assignments: ProjectAssignmentRuntimeState[];
          data: ProjectAssignmentRuntimeState[];
        }>(`/projects/${projectId}/assignments/runtime-health${query}`);
      },
      cancelMessage: (projectId: string, memberId: string, options?: { summary?: boolean }) => {
        const params = new URLSearchParams();
        if (options?.summary) params.set('summary', 'true');
        const query = params.toString() ? `?${params.toString()}` : '';
        return (
        request<{ memberId: string; role: string; cancelled?: boolean; session: ProjectAgentRuntimeSession; response: string }>(
          `/projects/${projectId}/agent-runtimes/${memberId}/messages/cancel${query}`,
          {
            method: 'POST',
          },
        )
        );
      },
      workspaceFiles: (projectId: string, memberId: string, params?: { maxDepth?: string }) => {
        const query = params ? '?' + new URLSearchParams(params).toString() : '';
        return request<{
          projectId: string;
          memberId: string;
          workspace: string;
          files: ProjectAgentRuntimeWorkspaceFile[];
        }>(`/projects/${projectId}/agent-runtimes/${memberId}/workspace${query}`);
      },
      downloadWorkspaceFile: (projectId: string, memberId: string, filePath: string) =>
        requestBlob(
          `/projects/${projectId}/agent-runtimes/${memberId}/workspace/download?${new URLSearchParams({ path: filePath }).toString()}`,
        ),
    },
    agentProfiles: {
      list: (projectId: string) =>
        request<{ projectId: string; profiles: ProjectAgentProfile[] }>(`/projects/${projectId}/agent-profiles`),
      create: (
        projectId: string,
        data: {
          name: string;
          description?: string;
          role: string;
          launchMode?: 'local-docker' | 'local-runner' | 'local-codex' | 'aws-ecs' | 'aws-agentcore';
          agentType?: string;
          image?: string;
          model?: string;
          llmConfigId?: string;
          deploymentDays?: number;
          enableSudo?: boolean;
          settings?: Record<string, unknown>;
        },
      ) =>
        request<{ projectId: string; profile: ProjectAgentProfile }>(`/projects/${projectId}/agent-profiles`, {
          method: 'POST',
          body: JSON.stringify(data),
        }),
      update: (
        projectId: string,
        profileId: string,
        data: Partial<{
          name: string;
          description: string;
          role: string;
          launchMode: 'local-docker' | 'local-runner' | 'local-codex' | 'aws-ecs' | 'aws-agentcore';
          agentType: string;
          image: string;
          model: string;
          llmConfigId: string;
          deploymentDays: number;
          enableSudo: boolean;
          settings: Record<string, unknown>;
        }>,
      ) =>
        request<{ projectId: string; profile: ProjectAgentProfile }>(`/projects/${projectId}/agent-profiles/${profileId}`, {
          method: 'PATCH',
          body: JSON.stringify(data),
        }),
      delete: (projectId: string, profileId: string) =>
        request<{ projectId: string; profileId: string; deleted: boolean }>(`/projects/${projectId}/agent-profiles/${profileId}`, {
          method: 'DELETE',
        }),
      launch: (
        projectId: string,
        profileId: string,
        data?: { memberId?: string; llmConfigId?: string; deploymentDays?: number; enableSudo?: boolean },
      ) =>
        request<{ projectId: string; memberId: string; userId: string; role: string; profileId: string; budget?: Record<string, unknown>; session: ProjectAgentRuntimeSession }>(
          `/projects/${projectId}/agent-profiles/${profileId}/launch`,
          {
            method: 'POST',
            body: JSON.stringify(data || {}),
          },
        ),
    },
    files: {
      list: (projectId: string, params?: Record<string, string | number | boolean>) => {
        const query = params
          ? '?' + new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)])).toString()
          : '';
        return request<{ projectId: string; prefix?: string; folders?: ProjectFolderEntry[]; files: ProjectFileEntry[]; nextCursor?: string; isTruncated?: boolean }>(
          `/projects/${projectId}/files${query}`,
        );
      },
      createFolder: (projectId: string, folderPath: string) =>
        request<{ projectId: string; path: string; key: string; markerPath: string; created: boolean }>(
          `/projects/${projectId}/files/folders`,
          {
            method: 'POST',
            body: JSON.stringify({ path: folderPath }),
          },
        ),
      downloadUrl: (projectId: string, filePath: string) =>
        request<{ projectId: string; path: string; key: string; url: string }>(
          `/projects/${projectId}/files/download-url?${new URLSearchParams({ path: filePath }).toString()}`,
        ),
      download: (projectId: string, filePath: string) =>
        requestBlob(`/projects/${projectId}/files/download?${new URLSearchParams({ path: filePath }).toString()}`),
      read: (projectId: string, filePath: string, encoding: 'text' | 'base64' = 'text') =>
        request<{
          projectId: string;
          path: string;
          key: string;
          size: number;
          contentType: string;
          encoding: 'text' | 'base64';
          content: string;
        }>(
          `/projects/${projectId}/files/read?${new URLSearchParams({ path: filePath, encoding }).toString()}`,
        ),
      upload: async (projectId: string, file: File, filePath?: string): Promise<ProjectFileEntry> => {
        const token = localStorage.getItem('token');
        const formData = new FormData();
        formData.append('file', file);
        if (filePath) formData.append('path', filePath);
        const res = await fetch(`${API_BASE}/projects/${projectId}/files/upload`, {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: formData,
        });
        if (!res.ok) {
          const error = await res.json().catch(() => ({ message: res.statusText }));
          throw new ApiError(apiErrorMessage(error, res.statusText || 'Project file upload failed'), res.status, error);
        }
        return res.json();
      },
      delete: (projectId: string, filePath: string, recursive = false) =>
        request<{ projectId: string; path: string; deleted: boolean; deletedKeys: string[] }>(
          `/projects/${projectId}/files?${new URLSearchParams({ path: filePath, ...(recursive ? { recursive: 'true' } : {}) }).toString()}`,
          {
            method: 'DELETE',
          },
        ),
    },
    listActivity: (id: string, params?: Record<string, string>) => {
      const query = params ? '?' + new URLSearchParams(params).toString() : '';
      return request<{ projectId: string; items: ProjectActivityItem[] }>(
        `${hasAuthToken() ? '/projects' : '/public/projects'}/${id}/activity${query}`,
      );
    },
    listEvents: (id: string, params?: Record<string, string>) => {
      const query = params ? '?' + new URLSearchParams(params).toString() : '';
      return request<{ projectId: string; events: ProjectEventItem[]; lastSeq: number }>(
        `${hasAuthToken() ? '/projects' : '/public/projects'}/${id}/events${query}`,
      );
    },
    getEventGraph: (id: string, params?: Record<string, string>) => {
      const query = params ? '?' + new URLSearchParams(params).toString() : '';
      return request<ProjectEventGraph>(
        `${hasAuthToken() ? '/projects' : '/public/projects'}/${id}/event-graph${query}`,
      );
    },
    tickCoordinator: (id: string, data?: { maxDispatches?: number }) =>
      request<ProjectCoordinatorTickResult>(`/projects/${id}/coordinator/tick`, {
        method: 'POST',
        body: JSON.stringify(data || {}),
      }),
    updateCoordinatorConfig: (id: string, data: Partial<ProjectCoordinatorConfig>) =>
      request<{ projectId: string; settings: Record<string, unknown>; coordinator: ProjectCoordinatorConfig }>(
        `/projects/${id}/coordinator/config`,
        {
          method: 'PATCH',
          body: JSON.stringify(data),
        },
      ),
    create: (data: {
      name?: string;
      initialGoal?: string;
      slug?: string;
      summary?: string;
      brief?: string;
      visibility?: string;
      githubUrl?: string;
      leadAgentUserId?: string;
      budgetAmount?: number;
      budgetCurrency?: string;
      projectTemplateId?: string;
      settings?: Record<string, unknown>;
    }) =>
      request<ProjectSummary>('/projects', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    createFromTask: (taskId: string, data?: { name?: string; confirmed?: boolean; seedPlan?: boolean }) =>
      request<{
        reused: boolean;
        project: ProjectSummary;
        blueprint: Record<string, unknown>;
        seeded?: Record<string, unknown> | null;
      }>(`/projects/from-task/${taskId}`, {
        method: 'POST',
        body: JSON.stringify(data || {}),
      }),
    update: (id: string, data: Record<string, unknown>) =>
      request<ProjectSummary>(`/projects/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    saveTemplate: (id: string, data: { name?: string; description?: string }) =>
      request<{ projectId: string; template: ProjectTemplateSummary & { templateKey?: string } }>(`/projects/${id}/templates`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    activate: (id: string) =>
      request<ProjectSummary>(`/projects/${id}/activate`, { method: 'POST' }),
    pause: (id: string) =>
      request<ProjectSummary>(`/projects/${id}/pause`, { method: 'POST' }),
    archive: (id: string) =>
      request<ProjectSummary>(`/projects/${id}/archive`, { method: 'POST' }),
    delete: (id: string, confirmation: string) =>
      request<{ id: string; deletedAt: string; deletedById: string }>(`/projects/${id}`, {
        method: 'DELETE',
        body: JSON.stringify({ confirmation }),
      }),
    members: {
      list: (projectId: string) => request<ProjectMember[]>(`/projects/${projectId}/members`),
      add: (
        projectId: string,
        data: { userId: string; role: string; permissions?: Record<string, unknown> },
      ) =>
        request<ProjectMember>(`/projects/${projectId}/members`, {
          method: 'POST',
          body: JSON.stringify(data),
        }),
      remove: (projectId: string, memberId: string) =>
        request<ProjectMember>(`/projects/${projectId}/members/${memberId}`, {
          method: 'DELETE',
        }),
      updatePolling: (
        projectId: string,
        memberId: string,
        data: Partial<ProjectAgentPollingConfig>,
      ) =>
        request<{
          memberId: string;
          role: string;
          config: ProjectAgentPollingConfig;
          pollingState?: ProjectAgentPollingState;
          session?: ProjectAgentRuntimeSession | null;
          response?: string;
        }>(`/projects/${projectId}/members/${memberId}/polling`, {
          method: 'PATCH',
          body: JSON.stringify(data),
        }),
    },
    goals: {
      list: (projectId: string) => request<any[]>(`/projects/${projectId}/goals`),
      create: (projectId: string, data: { title: string; description?: string; priority?: number; sortOrder?: number }) =>
        request<any>(`/projects/${projectId}/goals`, {
          method: 'POST',
          body: JSON.stringify(data),
        }),
      globals: {
        list: (projectId: string, goalId: string) =>
          request<{ projectId: string; goalId: string; globals: ProjectGlobalVariable[] }>(
            `/projects/${projectId}/goals/${goalId}/globals`,
          ),
        update: (
          projectId: string,
          goalId: string,
          data: { globals: ProjectGlobalVariable[]; syncRuntimes?: boolean },
        ) =>
          request<{
            projectId: string;
            goalId: string;
            globals: ProjectGlobalVariable[];
            projectGlobals: ProjectGlobalVariable[];
            sync?: { updated: number; skipped: string[] };
          }>(`/projects/${projectId}/goals/${goalId}/globals`, {
            method: 'PUT',
            body: JSON.stringify(data),
          }),
      },
    },
    features: {
      list: (projectId: string) => request<any[]>(`/projects/${projectId}/features`),
      create: (
        projectId: string,
        data: { title: string; goalId?: string; description?: string; priority?: number; sortOrder?: number; spec?: Record<string, unknown> },
      ) =>
        request<any>(`/projects/${projectId}/features`, {
          method: 'POST',
          body: JSON.stringify(data),
        }),
    },
    workItems: {
      list: (projectId: string, params?: Record<string, string>) => {
        const query = params ? '?' + new URLSearchParams(params).toString() : '';
        return request<{ data: ProjectWorkItem[]; meta: ProjectWorkItemListMeta }>(
          `${hasAuthToken() ? '/projects' : '/public/projects'}/${projectId}/work-items${query}`,
        );
      },
      get: (projectId: string, workItemId: string) =>
        request<ProjectWorkItem>(`/projects/${projectId}/work-items/${workItemId}`),
      create: (
        projectId: string,
        data: {
          title: string;
          workType: string;
          status?: string;
          goalId?: string;
          featureId?: string;
          parentWorkItemId?: string;
          description?: string;
          scopeBrief?: string;
          acceptanceCriteria?: string;
          inputPacket?: Record<string, unknown>;
          outputContract?: Record<string, unknown>;
          dependsOn?: string[];
          concurrencyMode?: 'SINGLE' | 'RACE' | 'MULTI_ROLE' | 'PRIMARY_BACKUP';
          priority?: number;
          ownerId?: string;
          dueAt?: string;
        },
      ) =>
        request<ProjectWorkItem>(`/projects/${projectId}/work-items`, {
          method: 'POST',
          body: JSON.stringify(data),
        }),
      update: (projectId: string, workItemId: string, data: Record<string, unknown>) =>
        request<ProjectWorkItem>(`/projects/${projectId}/work-items/${workItemId}`, {
          method: 'PATCH',
          body: JSON.stringify(data),
        }),
      comments: {
        list: (projectId: string, workItemId: string) =>
          request<ProjectWorkItemComment[]>(`/projects/${projectId}/work-items/${workItemId}/comments`),
        create: (
          projectId: string,
          workItemId: string,
          data: { content: string; attachments?: ProjectWorkItemCommentAttachment[] },
        ) =>
          request<ProjectWorkItemComment>(`/projects/${projectId}/work-items/${workItemId}/comments`, {
            method: 'POST',
            body: JSON.stringify(data),
          }),
      },
      assign: (projectId: string, workItemId: string, data: { assigneeUserId: string; role: string; targetRuntimeId?: string; objective?: string; contextPacket?: Record<string, unknown> }) =>
        request<any>(`/projects/${projectId}/work-items/${workItemId}/assignments`, {
          method: 'POST',
          body: JSON.stringify(data),
        }),
      updateAssignment: (
        projectId: string,
        workItemId: string,
        assignmentId: string,
        data: { status?: string; objective?: string; contextPacket?: Record<string, unknown> },
      ) =>
        request<ProjectAssignment>(
          `/projects/${projectId}/work-items/${workItemId}/assignments/${assignmentId}`,
          {
            method: 'PATCH',
            body: JSON.stringify(data),
          },
        ),
    },
    runs: {
      create: (
        projectId: string,
        data: {
          runType: string;
          workItemId: string;
          assignmentId?: string;
          instruction?: string;
          contextSnapshot?: Record<string, unknown>;
          resultSummary?: string;
          costInfo?: Record<string, unknown>;
        },
      ) =>
        request<any>(`/projects/${projectId}/runs`, {
          method: 'POST',
          body: JSON.stringify(data),
        }),
      get: (projectId: string, runId: string) =>
        request<ProjectRun>(`/projects/${projectId}/runs/${runId}`),
      update: (
        projectId: string,
        runId: string,
        data: {
          status?: string;
          instruction?: string;
          contextSnapshot?: Record<string, unknown>;
          resultSummary?: string;
          costInfo?: Record<string, unknown>;
        },
      ) =>
        request<ProjectRun>(`/projects/${projectId}/runs/${runId}`, {
          method: 'PATCH',
          body: JSON.stringify(data),
        }),
      listLogs: (projectId: string, runId: string) =>
        request<ProjectRunLog[]>(`/projects/${projectId}/runs/${runId}/logs`),
      createLog: (
        projectId: string,
        runId: string,
        data: { level?: string; message: string; metadata?: Record<string, unknown> },
      ) =>
        request<ProjectRunLog>(`/projects/${projectId}/runs/${runId}/logs`, {
          method: 'POST',
          body: JSON.stringify(data),
        }),
    },
    artifacts: {
      list: (projectId: string, params?: Record<string, string>) => {
        const query = params ? '?' + new URLSearchParams(params).toString() : '';
        return request<any[]>(`${hasAuthToken() ? '/projects' : '/public/projects'}/${projectId}/artifacts${query}`);
      },
      create: (
        projectId: string,
        data: {
          artifactType: string;
          workItemId?: string;
          assignmentId?: string;
          runId?: string;
          title?: string;
          content?: string;
          url?: string;
          metadata?: Record<string, unknown>;
          attachments?: File[];
        },
      ) => {
        if (data.attachments?.length) {
          const token = localStorage.getItem('token');
          const formData = new FormData();
          const { attachments, ...fields } = data;
          Object.entries(fields).forEach(([key, value]) => {
            if (value === undefined || value === null || value === '') return;
            formData.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
          });
          attachments.forEach((file) => formData.append('attachments', file));
          return fetch(`${API_BASE}/projects/${projectId}/artifacts`, {
            method: 'POST',
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            body: formData,
          }).then(async (res) => {
            if (!res.ok) {
              const error = await res.json().catch(() => ({ message: res.statusText }));
              throw new ApiError(apiErrorMessage(error, res.statusText || 'Artifact submission failed'), res.status, error);
            }
            return res.json();
          });
        }
        return request<any>(`/projects/${projectId}/artifacts`, {
          method: 'POST',
          body: JSON.stringify(data),
        });
      },
    },
    reviews: {
      list: (projectId: string, params?: Record<string, string>) => {
        const query = params ? '?' + new URLSearchParams(params).toString() : '';
        return request<any[]>(`${hasAuthToken() ? '/projects' : '/public/projects'}/${projectId}/reviews${query}`);
      },
      create: (
        projectId: string,
        data: {
          workItemId: string;
          reviewerType: string;
          assignmentId?: string;
          artifactId?: string;
          status?: string;
          reviewNote?: string;
          checklistResult?: Record<string, unknown>;
        },
      ) =>
        request<any>(`/projects/${projectId}/reviews`, {
          method: 'POST',
          body: JSON.stringify(data),
        }),
    },
    memories: {
      list: (projectId: string, params?: Record<string, string>) => {
        const query = params ? '?' + new URLSearchParams(params).toString() : '';
        return request<any[]>(`${hasAuthToken() ? '/projects' : '/public/projects'}/${projectId}/memories${query}`);
      },
      create: (
        projectId: string,
        data: {
          memoryType: string;
          title?: string;
          content: string;
          summary?: string;
          sourceArtifactId?: string;
          metadata?: Record<string, unknown>;
        },
      ) =>
        request<any>(`/projects/${projectId}/memories`, {
          method: 'POST',
          body: JSON.stringify(data),
        }),
    },
  },
  projectTemplates: {
    list: () =>
      request<{ templates: ProjectTemplateSummary[] }>('/project-templates'),
    get: (id: string) => request<ProjectTemplateSummary>(`/project-templates/${id}`),
  },
};
