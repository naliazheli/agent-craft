import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import * as bcrypt from 'bcryptjs';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { ApiConfigService } from '../api-config/api-config.service';
import { LlmService } from '../llm/llm.service';
import { PrismaService } from '../prisma/prisma.service';
import { AgentWorkspaceClient, type WorkspaceMemberResponse } from './agent-workspace.client';
import {
  ProjectTemplatesService,
  type ProjectTemplateConfig,
  type ProjectTemplateCapabilityBundleRef,
  type ProjectTemplateRoleEntry,
  type ProjectTemplateRuntimeCompatibility,
} from './project-templates.service';
import {
  AgentRuntimeLauncherService,
  type AgentRuntimeAction,
  type AgentRuntimeCapabilityBundle,
  type AgentRuntimeConversation,
  type AgentRuntimeLocalRunnerBridgeRequest,
  type AgentRuntimeLocalRunnerFile,
  type AgentRuntimeLocalRunnerJob,
  type AgentRuntimeLaunchMode,
  type AgentRuntimeMessage,
  type AgentRuntimePollingConfig,
  type AgentRuntimePollingState,
  type AgentRuntimeProjectSkillOverride,
  type AgentRuntimeSession,
  type AgentRuntimeWorkspaceFile,
} from './agent-runtime-launcher.service';
import { GENERAL_AGENT_NAMES, ROLE_NAME_CANDIDATES } from './role/rolename';
import {
  CloseProjectGoalDto,
  CreateProjectAgentProfileDto,
  CreateProjectArtifactDto,
  CreateProjectAssignmentDto,
  CreateProjectDto,
  CreateProjectFromTaskDto,
  DeleteProjectDto,
  CreateProjectFeatureDto,
  CreateProjectGoalDto,
  LaunchProjectAgentRuntimeDto,
  LaunchProjectAgentProfileDto,
  SaveProjectTemplateDto,
  CreateProjectMemberCapabilityDto,
  CreateProjectMemberDto,
  CreateProjectMemoryDto,
  CreateProjectReviewDto,
  CreateProjectRunDto,
  CreateProjectRunLogDto,
  CreateProjectWorkItemCommentDto,
  CreateProjectWorkItemDto,
  RefreshProjectTemplateDto,
  SendProjectAgentMessageDto,
  UpdateProjectAgentPollingConfigDto,
  UpdateProjectCoordinatorConfigDto,
  UpdateProjectAgentRuntimeConversationDto,
  UpdateProjectDto,
  UpdateProjectAgentProfileDto,
  UpdateProjectAssignmentDto,
  UpdateProjectGoalDto,
  UpdateProjectRolePromptDto,
  UpdateProjectRoleSkillsDto,
  UpdateProjectRunDto,
  UpdateProjectWorkItemDto,
} from './dto/projects.dto';

type ProjectGlobalVariable = {
  key: string;
  label?: string | null;
  description?: string | null;
  value?: string | null;
  providedValue?: boolean;
  configured?: boolean;
  isSecret?: boolean;
  required?: boolean;
  createTaskOnMissing?: boolean;
  category?: string | null;
  scope?: 'project' | 'goal' | string | null;
  goalId?: string | null;
};

type ProjectRoleConfig = {
  role: string;
  label?: string;
  description?: string;
  skills?: Array<{
    ref: string;
    name?: string;
    source?: 'external' | 'role' | 'project';
    path?: string;
    description?: string;
  }>;
  skillBundleRefs: string[];
  capabilityBundleRefs?: string[];
  capabilityBundles?: ProjectTemplateCapabilityBundleRef[];
  runtimeCompatibility?: ProjectTemplateRuntimeCompatibility | null;
  initialPrompt?: string;
  scopes?: string[];
  polling?: Partial<AgentRuntimePollingConfig>;
};

type ProjectWorkItemStatusCategory =
  | 'claimable'
  | 'active'
  | 'feedback'
  | 'completed'
  | 'closed'
  | 'other';

type ProjectWorkItemStatusDefinition = {
  id: string;
  label?: string;
  description?: string;
  category?: ProjectWorkItemStatusCategory;
  initial?: boolean;
  terminal?: boolean;
  completed?: boolean;
  closed?: boolean;
  dispatch?: any;
};

type ProjectCoordinatorDispatchRule = {
  statuses: string[];
  workTypes: string[];
  role: string;
  launchMode?: AgentRuntimeLaunchMode | null;
  agentType?: string | null;
  maxAgents?: number | null;
  minAgents?: number | null;
  forceLaunchNew?: boolean;
  allowOwnerOwned?: boolean;
  allowRepeatCompleted?: boolean;
  objective?: string | null;
  message?: string | null;
};

type ProjectCoordinatorConfig = {
  enabled: boolean;
  minAgents: number;
  maxAgents: number;
  maxDispatchesPerTick: number;
  launchMode?: AgentRuntimeLaunchMode | null;
  agentType?: string | null;
  messageTemplate?: string | null;
  lastTickAt?: string | null;
  minAgentsByRole: Record<string, number>;
  maxAgentsByRole: Record<string, number>;
};

type ResolvedProjectWorkItemStatusFlow = {
  statuses: ProjectWorkItemStatusDefinition[];
  statusById: Map<string, ProjectWorkItemStatusDefinition>;
  initialStatus: string;
  claimableStatuses: string[];
  feedbackStatuses: string[];
  completedStatuses: string[];
  closedStatuses: string[];
  terminalStatuses: string[];
  activeStatus: string;
  assignmentCompletedStatus: string;
  assignmentFailedStatus: string;
  reviewApprovedStatus: string;
  reviewChangesRequestedStatus: string;
  reviewRejectedStatus: string;
  closedStatus: string;
  dispatchRules: ProjectCoordinatorDispatchRule[];
  coordinator: ProjectCoordinatorConfig;
};

type ResolvedRoleCapabilityBundles = {
  refs: string[];
  manifests: AgentRuntimeCapabilityBundle[];
  skillBundleRefs: string[];
  requiredScopes: string[];
  requiredProjectGlobals: string[];
};

type ProjectRolePromptOverride = {
  initialPrompt?: string;
  updatedAt?: string;
  updatedById?: string;
};

type ProjectRoleSkillOverride = {
  skillBundleRefs?: string[];
  skills?: Record<string, {
    name?: string;
    storagePath?: string;
    updatedAt?: string;
    updatedById?: string;
  }>;
  updatedAt?: string;
  updatedById?: string;
};

type LocalRunnerTokenRecord = {
  id: string;
  name: string;
  tokenHash: string;
  createdAt: string;
  createdByUserId: string;
  lastUsedAt?: string | null;
  revokedAt?: string | null;
};

type LocalRunnerProvider = 'local-runner' | 'local-codex';

type ProjectLocalRunnerPresenceRecord = {
  id: string;
  provider: LocalRunnerProvider;
  name: string;
  userId: string;
  tokenId?: string | null;
  startedAt: string;
  lastSeenAt: string;
  disconnectedAt?: string | null;
  disconnectReason?: string | null;
  platform?: string | null;
  version?: string | null;
};

type AgentRuntimeSessionStreamEvent = {
  type: 'snapshot' | 'session' | 'progress' | 'complete' | 'error' | 'cancelled';
  projectId: string;
  memberId: string;
  role?: string;
  requestId?: string;
  message?: string;
  session?: Record<string, any>;
  at: string;
};

type AgentRuntimeSessionStreamListener = (event: AgentRuntimeSessionStreamEvent) => void;

type ProjectAgentRoleName = {
  displayName: string;
  source: 'general' | 'role-famous' | 'fallback';
  role: string;
  assignedAt: string;
  candidatesKey?: string;
};

const AGENT_DEPLOYMENT_PRICE_PER_DAY = 10;
const DEFAULT_PROJECT_MAX_ACTIVE_AGENTS = 10;
const PROJECT_MAX_ACTIVE_AGENTS_CAP = 50;
const DEFAULT_PROJECT_MAX_ACTIVE_GOALS = 5;
const PROJECT_MAX_ACTIVE_GOALS_CAP = 50;
const PROJECT_ACTIVE_GOAL_STATUSES = ['IN_PROGRESS', 'BLOCKED'];
const DEFAULT_AGENT_RUNTIME_CHAT_TIMEOUT_MS = 0;
const DEFAULT_LOCAL_RUNNER_BRIDGE_TIMEOUT_MS = 0;
const DEFAULT_WORK_ITEM_STATUS_DEFINITIONS: ProjectWorkItemStatusDefinition[] = [
  { id: 'DRAFT', label: 'Draft', category: 'claimable' },
  { id: 'READY', label: '待领取', category: 'claimable', initial: true },
  { id: 'ASSIGNED', label: '已分配', category: 'active' },
  { id: 'IN_PROGRESS', label: '处理中', category: 'active' },
  { id: 'IN_REVIEW', label: '待反馈', category: 'feedback' },
  { id: 'NEEDS_REVISION', label: '需修改', category: 'claimable' },
  { id: 'ACCEPTED', label: '完成', category: 'completed', terminal: true, completed: true },
  { id: 'DONE', label: '完成', category: 'completed', terminal: true, completed: true },
  { id: 'REJECTED', label: '关闭', category: 'closed', terminal: true, closed: true },
  { id: 'CANCELLED', label: '关闭', category: 'closed', terminal: true, closed: true },
  { id: 'CLOSED', label: '关闭', category: 'closed', terminal: true, closed: true },
];
const DEFAULT_AGENT_POLLING_CONFIG: AgentRuntimePollingConfig = {
  enabled: false,
  strategy: 'IDLE_ONLY',
  intervalMinutes: 60,
  message: 'keep working',
};
function defaultAgentPollingConfigForRole(role: string): AgentRuntimePollingConfig {
  return {
    ...DEFAULT_AGENT_POLLING_CONFIG,
    enabled: role === 'LEAD_AGENT',
  };
}
const LAUNCHABLE_PROJECT_AGENT_ROLES = [
  'PLANNER_AGENT',
  'WORKER_AGENT',
  'REVIEW_AGENT',
  'SECURITY_AUDITOR',
  'PM_AGENT',
  'INTEGRATOR_AGENT',
];

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);
  private readonly agentRuntimeStreamListeners = new Map<string, Set<AgentRuntimeSessionStreamListener>>();
  private readonly agentModelSendQueues = new Map<string, Promise<void>>();
  private readonly coordinatorTickTimers = new Map<string, NodeJS.Timeout>();
  private readonly coordinatorTicksInFlight = new Set<string>();
  private readonly leadPollingWakeTimers = new Map<string, NodeJS.Timeout>();
  private plannerGoalAnalysisGraceMs = 30_000;
  private agentRuntimePollingSweepActive = false;
  private readonly agentRuntimePollingTickLocks = new Set<string>();
  private readonly agentRuntimeMessageSendLocks = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly agentWorkspaceClient: AgentWorkspaceClient,
    private readonly agentRuntimeLauncher: AgentRuntimeLauncherService,
    private readonly apiConfigService: ApiConfigService,
    private readonly llmService: LlmService,
    private readonly configService: ConfigService,
    private readonly projectTemplatesService: ProjectTemplatesService,
  ) {}

  @Interval(60_000)
  private async sweepDueAgentRuntimePolling() {
    if (this.agentRuntimePollingSweepActive) return;
    this.agentRuntimePollingSweepActive = true;
    try {
      const members = await this.prisma.projectMember.findMany({
        where: {
          removedAt: null,
        },
        select: {
          id: true,
          projectId: true,
          role: true,
          permissions: true,
        },
        take: 200,
      });
      const projects = members.length
        ? await this.prisma.project.findMany({
            where: {
              id: { in: [...new Set(members.map((member) => member.projectId))] },
              deletedAt: null,
            },
            select: { id: true, ownerId: true, status: true, settings: true },
          })
        : [];
      const projectsById = new Map(projects.map((project) => [project.id, project]));
      const reconciledProjectIds = new Set<string>();

      for (const member of members) {
        const project = projectsById.get(member.projectId);
        if (!project) continue;
        if (project.status !== 'ACTIVE') continue;
        if (!reconciledProjectIds.has(project.id)) {
          reconciledProjectIds.add(project.id);
          const statusFlow = this.resolveProjectWorkItemStatusFlow(project.settings);
          const reconciled = await this.reconcileStaleOpenAssignments(
            project.id,
            project.ownerId,
            statusFlow,
            { source: 'polling-sweep', limit: 100 },
          ).catch((error: any) => {
            this.logger.warn(`Agent polling sweep failed to reconcile ${project.id}: ${error?.message || error}`);
            return [];
          });
          if (reconciled.length && statusFlow.coordinator.enabled) {
            this.scheduleCoordinatorTick(
              project.id,
              project.ownerId,
              `polling sweep reconciled ${reconciled.length} stale assignment(s)`,
              250,
            );
          }
        }
        const session = this.readRuntimeSession(member.permissions);
        if (!session) continue;
        const config = this.normalizeAgentPollingConfig(
          this.readAgentPollingConfig(member.permissions) || session.pollingConfig,
          session.pollingConfig || undefined,
        );
        if (!config.enabled) continue;
        const state = this.completedPollingState(session, config, session.pollingState || {});
        const nextRunAt = state.nextRunAt ? new Date(state.nextRunAt).getTime() : 0;
        if (nextRunAt && nextRunAt > Date.now()) {
          if (state !== session.pollingState) {
            await this.writeRuntimeSession(member.id, {
              ...session,
              pollingConfig: config,
              pollingState: state,
              updatedAt: new Date().toISOString(),
            });
          }
          continue;
        }
        if (session.status === 'TYPING') continue;
        await this.tickAgentRuntimePolling(member.projectId, member.id, project.ownerId).catch((error: any) => {
          this.logger.warn(`Agent polling sweep failed for ${member.projectId}/${member.id}: ${error?.message || error}`);
        });
      }
    } catch (error: any) {
      this.logger.warn(`Agent polling sweep failed: ${error?.message || error}`);
    } finally {
      this.agentRuntimePollingSweepActive = false;
    }
  }

  private countByStatus<T extends { status?: string | null }>(items: T[]) {
    return items.reduce<Record<string, number>>((acc, item) => {
      const key = item.status || 'UNKNOWN';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
  }

  private buildUnavailableLocalDockerSession(session: AgentRuntimeSession, error?: any): AgentRuntimeSession {
    return {
      ...session,
      status: 'STOPPED',
      dockerStatus: {
        ...(session.dockerStatus || {}),
        running: false,
        status: 'missing',
        error: error?.message || 'runtime container is unavailable',
      },
      apiHealth: {
        ...(session.apiHealth || {}),
        ok: false,
        error: error?.message || 'runtime container is unavailable',
      },
      currentActivity: 'Runtime container is unavailable',
      updatedAt: new Date().toISOString(),
    };
  }

  private activityActor(user?: { id: string; email: string; displayName?: string | null; role?: string } | null) {
    if (!user) return null;
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
    };
  }

  private normalizeProject<T extends Record<string, any>>(project: T): T {
    if (!project) return project;
    return {
      ...project,
      memberCount: project.memberCount ?? project._count?.members,
      workItemCount: project.workItemCount ?? project._count?.workItems,
      artifactCount: project.artifactCount ?? project._count?.artifacts,
    };
  }

  private getProjectGithubUrl(settings?: any) {
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
      return null;
    }

    const githubUrl = settings.githubUrl;
    return typeof githubUrl === 'string' && githubUrl.trim() ? githubUrl.trim() : null;
  }

  private getProjectGlobalVariables(settings?: any): ProjectGlobalVariable[] {
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
      return [];
    }

    const globals = Array.isArray(settings.projectGlobals) ? settings.projectGlobals : [];
    return globals
      .map((entry: any) => {
        const providedValue = Boolean(entry && typeof entry === 'object' && Object.prototype.hasOwnProperty.call(entry, 'value'));
        return {
          key: typeof entry?.key === 'string' ? entry.key.trim() : '',
          label: typeof entry?.label === 'string' ? entry.label.trim() : null,
          description: typeof entry?.description === 'string' ? entry.description.trim() : null,
          value: typeof entry?.value === 'string' ? entry.value : entry?.value == null ? null : String(entry.value),
          providedValue,
          isSecret: Boolean(entry?.isSecret),
          required: entry?.required !== false,
          createTaskOnMissing: entry?.createTaskOnMissing !== false,
          category: typeof entry?.category === 'string' ? entry.category.trim() : null,
          scope: entry?.scope === 'goal' ? 'goal' : 'project',
          goalId: entry?.scope === 'goal' && typeof entry?.goalId === 'string' && entry.goalId.trim()
            ? entry.goalId.trim()
            : null,
        };
      })
      .filter((entry: ProjectGlobalVariable) => entry.key);
  }

  private projectGlobalIdentity(global: ProjectGlobalVariable) {
    return global.scope === 'goal' && global.goalId
      ? `goal:${global.goalId}:${global.key}`
      : `project:${global.key}`;
  }

  private isGoalScopedGlobal(global: ProjectGlobalVariable) {
    return global.scope === 'goal' && Boolean(global.goalId);
  }

  private isProjectScopedGlobal(global: ProjectGlobalVariable) {
    return !this.isGoalScopedGlobal(global);
  }

  private getProjectFileFolders(settings?: any): string[] {
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
      return [];
    }

    const folders = Array.isArray(settings.projectFileFolders) ? settings.projectFileFolders : [];
    return Array.from(
      new Set(
        folders
          .filter((folder: any) => typeof folder === 'string' && folder.trim())
          .map((folder: string) => folder.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').trim())
          .filter(Boolean),
      ),
    );
  }

  private projectSecretEncryptionKey() {
    const keyHex =
      this.configService.get<string>('PROJECT_GLOBAL_SECRET_KEY') ||
      this.configService.get<string>('PROJECT_SECRET_ENCRYPTION_KEY') ||
      this.configService.get<string>('WALLET_ENCRYPTION_KEY') ||
      '';
    const normalized = keyHex.trim();
    if (!normalized) {
      return null;
    }
    if (!/^[0-9a-fA-F]{64}$/.test(normalized)) {
      throw new BadRequestException('Project secret encryption key must be a 64-character hex string');
    }
    return Buffer.from(normalized, 'hex');
  }

  private encryptProjectSecret(value: string) {
    const encryptionKey = this.projectSecretEncryptionKey();
    if (!encryptionKey) {
      return `plain:${value}`;
    }

    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-256-gcm', encryptionKey, iv);
    let encrypted = cipher.update(value, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  }

  private decryptProjectSecret(encryptedValue: string) {
    if (!encryptedValue) {
      return '';
    }
    if (encryptedValue.startsWith('plain:')) {
      return encryptedValue.slice(6);
    }

    const encryptionKey = this.projectSecretEncryptionKey();
    if (!encryptionKey) {
      throw new BadRequestException('Project secret encryption key is not configured');
    }

    const [ivHex, authTagHex, ciphertext] = encryptedValue.split(':');
    if (!ivHex || !authTagHex || !ciphertext) {
      throw new BadRequestException('Stored project secret is malformed');
    }
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  private globalsForStoredSettings(globals: ProjectGlobalVariable[]) {
    return globals.map((entry) => {
      const stored: Record<string, any> = {
        key: entry.key,
        label: entry.label || entry.key,
        description: entry.description || null,
        isSecret: Boolean(entry.isSecret),
        required: entry.required !== false,
        createTaskOnMissing: entry.createTaskOnMissing !== false,
        category: entry.category || null,
        scope: this.isGoalScopedGlobal(entry) ? 'goal' : 'project',
        goalId: this.isGoalScopedGlobal(entry) ? entry.goalId : null,
      };
      if (!entry.isSecret) {
        stored.value = entry.value || '';
      }
      return stored;
    });
  }

  private mergeResolvedProjectGlobals(
    globals: ProjectGlobalVariable[],
    secretMap: Map<string, string>,
  ): ProjectGlobalVariable[] {
    return globals.map((entry) => {
      if (!entry.isSecret) {
        return {
          ...entry,
          value: entry.value || '',
        };
      }

      const explicitValue = entry.providedValue ? entry.value || '' : null;
      const persistedValue = secretMap.get(this.projectGlobalIdentity(entry));
      const fallbackValue = typeof entry.value === 'string' ? entry.value : '';

      return {
        ...entry,
        value: explicitValue ?? persistedValue ?? fallbackValue,
      };
    });
  }

  private async readProjectGlobalSecretMap(projectId: string): Promise<Map<string, string>> {
    const response = await this.agentWorkspaceClient.listProjectGlobals(projectId, { includeValues: true });
    const map = new Map<string, string>();
    for (const global of response.globals || []) {
      const entry: ProjectGlobalVariable = {
        key: typeof global.key === 'string' ? global.key : '',
        value: typeof global.value === 'string' ? global.value : global.value == null ? '' : String(global.value),
        scope: global.scope === 'goal' ? 'goal' : 'project',
        goalId: global.scope === 'goal' && typeof global.goalId === 'string' ? global.goalId : null,
      };
      if (!entry.key) continue;
      map.set(this.projectGlobalIdentity(entry), entry.value || '');
    }
    return map;
  }

  private async resolveProjectGlobalVariables(projectId: string, settings?: any) {
    const globals = this.getProjectGlobalVariables(settings);
    const response = await this.agentWorkspaceClient.listProjectGlobals(projectId, { includeValues: true });
    const workspaceGlobals = (response.globals || []).map((global: any) => ({
      key: typeof global.key === 'string' ? global.key : '',
      label: typeof global.label === 'string' ? global.label : global.key,
      description: typeof global.description === 'string' ? global.description : null,
      value: typeof global.value === 'string' ? global.value : global.value == null ? '' : String(global.value),
      configured: Boolean(global.configured || global.value),
      isSecret: Boolean(global.isSecret),
      required: global.required !== false,
      createTaskOnMissing: global.createTaskOnMissing !== false,
      category: typeof global.category === 'string' ? global.category : null,
      scope: global.scope === 'goal' ? 'goal' : 'project',
      goalId: global.scope === 'goal' && typeof global.goalId === 'string' ? global.goalId : null,
    })).filter((entry: ProjectGlobalVariable) => entry.key);
    const workspaceByKey = new Map(workspaceGlobals.map((entry: ProjectGlobalVariable) => [this.projectGlobalIdentity(entry), entry]));
    const merged = globals.map((entry) => {
      const workspaceEntry = workspaceByKey.get(this.projectGlobalIdentity(entry));
      return {
        ...(workspaceEntry || {}),
        ...entry,
        value: entry.providedValue
          ? entry.value || ''
          : workspaceEntry?.value ?? entry.value ?? '',
        configured: Boolean(
          (entry.providedValue && entry.value) ||
          entry.configured ||
          workspaceEntry?.configured ||
          workspaceEntry?.value ||
          entry.value,
        ),
      };
    });
    const localKeys = new Set(globals.map((entry) => this.projectGlobalIdentity(entry)));
    return [
      ...merged,
      ...workspaceGlobals.filter((entry: ProjectGlobalVariable) => !localKeys.has(this.projectGlobalIdentity(entry))),
    ];
  }

  private missingRequiredProjectGlobals(projectGlobals: ProjectGlobalVariable[], requiredKeys: string[]) {
    const byKey = new Map(projectGlobals.map((entry) => [entry.key, entry]));
    return this.uniqueStringList(requiredKeys).filter((key) => {
      const entry = byKey.get(key);
      return !entry || !entry.value;
    });
  }

  private async persistProjectGlobalSecrets(
    projectId: string,
    globals: ProjectGlobalVariable[],
    options: { updatedByUserId?: string; workItemId?: string; source?: string } = {},
  ) {
    await this.agentWorkspaceClient.updateProjectGlobals(projectId, globals, options);
  }

  private sanitizeProjectGlobalVariables(
    globals: ProjectGlobalVariable[],
    options?: { includeValues?: boolean },
  ) {
    const includeValues = Boolean(options?.includeValues);
    return globals.map((entry) => {
      const isSecret = Boolean(entry.isSecret);
      const configured = Boolean(entry.configured || entry.value);
      return {
        key: entry.key,
        label: entry.label || entry.key,
        description: entry.description || null,
        isSecret,
        required: entry.required !== false,
        createTaskOnMissing: entry.createTaskOnMissing !== false,
        category: entry.category || null,
        scope: this.isGoalScopedGlobal(entry) ? 'goal' : 'project',
        goalId: this.isGoalScopedGlobal(entry) ? entry.goalId : null,
        configured,
        ...(isSecret ? { hasValue: configured } : {}),
        ...(includeValues && !isSecret ? { value: entry.value || '' } : {}),
      };
    });
  }

  private withSanitizedProjectSettings(
    settings: any,
    globals: ProjectGlobalVariable[],
    options?: { includeValues?: boolean },
  ) {
    const base =
      settings && typeof settings === 'object' && !Array.isArray(settings)
        ? { ...(settings as Record<string, any>) }
        : {};
    return {
      ...base,
      projectGlobals: this.sanitizeProjectGlobalVariables(globals, options),
    };
  }

  private async projectGlobalGoalIdsForRuntime(
    projectId: string,
    member: { userId: string; role?: string | null },
  ) {
    const assignments = await this.prisma.projectAssignment.findMany({
      where: {
        projectId,
        assigneeUserId: member.userId,
        status: { in: ['PROPOSED', 'ACTIVE', 'PAUSED'] as any },
      },
      select: {
        workItem: {
          select: {
            goalId: true,
            feature: { select: { goalId: true } },
          },
        },
      },
    });
    return new Set(
      assignments
        .map((assignment) => assignment.workItem?.goalId || assignment.workItem?.feature?.goalId || null)
        .filter((goalId): goalId is string => Boolean(goalId)),
    );
  }

  private async visibleProjectGlobalsForRuntime(
    projectId: string,
    member: { userId: string; role?: string | null },
    globals: ProjectGlobalVariable[],
  ) {
    const projectScoped = globals.filter((global) => this.isProjectScopedGlobal(global));
    const goalScoped = globals.filter((global) => this.isGoalScopedGlobal(global));
    if (!goalScoped.length) {
      return projectScoped;
    }
    const visibleGoalIds = await this.projectGlobalGoalIdsForRuntime(projectId, member);
    return [
      ...projectScoped,
      ...goalScoped.filter((global) => global.goalId && visibleGoalIds.has(global.goalId)),
    ];
  }

  private mergeProjectGlobalsByIdentity(globals: ProjectGlobalVariable[]) {
    const byIdentity = new Map<string, ProjectGlobalVariable>();
    for (const global of globals) {
      byIdentity.set(this.projectGlobalIdentity(global), global);
    }
    return [...byIdentity.values()];
  }

  private projectGlobalTaskTitle(global: ProjectGlobalVariable) {
    return this.isGoalScopedGlobal(global)
      ? `Provide goal resource: ${global.label || global.key}`
      : `Provide project resource: ${global.label || global.key}`;
  }

  private projectGlobalTaskDescription(global: ProjectGlobalVariable) {
    const pieces = [
      this.isGoalScopedGlobal(global)
        ? `Configure the goal variable "${global.label || global.key}" so agents assigned under this goal can continue work.`
        : `Configure the project global variable "${global.label || global.key}" so agents can continue work.`,
      global.description ? `Context: ${global.description}` : null,
      global.isSecret
        ? 'This value is sensitive and should be entered by the project owner in project settings.'
        : 'This value can be entered by the project owner in project settings.',
    ].filter(Boolean);
    return pieces.join('\n\n');
  }

  private async syncProjectGlobalResourceTasks(
    projectId: string,
    ownerId: string,
    globals: ProjectGlobalVariable[],
  ) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { settings: true },
    });
    const statusFlow = this.resolveProjectWorkItemStatusFlow(project?.settings);
    const openStatuses = [...new Set([
      ...statusFlow.claimableStatuses,
      ...statusFlow.feedbackStatuses,
      statusFlow.activeStatus,
      'ASSIGNED',
    ].filter((status) => status && !statusFlow.terminalStatuses.includes(status)))];
    const existingItems = await this.prisma.projectWorkItem.findMany({
      where: {
        projectId,
        status: { in: openStatuses as any },
      },
      select: { id: true, goalId: true, inputPacket: true, status: true },
    });

    for (const global of globals.filter((entry) => entry.required !== false)) {
      const globalIdentity = this.projectGlobalIdentity(global);
      const globalConfigured = Boolean(global.value || global.configured);
      if (globalConfigured) {
        const idsToClose = existingItems
          .filter((item) =>
            item.inputPacket &&
            typeof item.inputPacket === 'object' &&
            !Array.isArray(item.inputPacket) &&
            this.projectGlobalIdentity(this.projectGlobalResourceRequestFromPacket(item.inputPacket, item.goalId) || { key: '' }) === globalIdentity &&
            openStatuses.includes(item.status),
          )
          .map((item) => item.id);
        if (idsToClose.length) {
          await this.prisma.projectWorkItem.updateMany({
            where: { id: { in: idsToClose } },
            data: { status: statusFlow.reviewApprovedStatus },
          });
        }
        continue;
      }

      if (global.createTaskOnMissing === false) {
        continue;
      }

      const alreadyOpen = existingItems.some(
        (item) =>
          item.inputPacket &&
          typeof item.inputPacket === 'object' &&
          !Array.isArray(item.inputPacket) &&
          this.projectGlobalIdentity(this.projectGlobalResourceRequestFromPacket(item.inputPacket, item.goalId) || { key: '' }) === globalIdentity,
      );

      if (!alreadyOpen) {
        await this.prisma.projectWorkItem.create({
          data: {
            projectId,
            goalId: this.isGoalScopedGlobal(global) ? global.goalId : undefined,
            title: this.projectGlobalTaskTitle(global),
            description: this.projectGlobalTaskDescription(global),
            workType: 'INTEGRATION',
            status: statusFlow.initialStatus,
            priority: 90,
            scopeBrief: this.isGoalScopedGlobal(global)
              ? `Owner should provide ${global.label || global.key} in this goal's variables.`
              : `Owner should provide ${global.label || global.key} in project settings.`,
            acceptanceCriteria: `The project global variable "${global.key}" is saved and available to runtimes.`,
            inputPacket: {
              source: 'project-global-resource-request',
              resourceRequest: {
                key: global.key,
                label: global.label || global.key,
                isSecret: Boolean(global.isSecret),
                category: global.category || null,
                scope: this.isGoalScopedGlobal(global) ? 'goal' : 'project',
                goalId: this.isGoalScopedGlobal(global) ? global.goalId : null,
              },
            } as any,
            outputContract: {
              expectedArtifact: 'CONFIG_UPDATE',
              handoffRequired: false,
            } as any,
            createdById: ownerId,
            ownerId,
          },
        });
      }
    }
  }

  private projectGlobalResourceRequestFromPacket(inputPacket: any, fallbackGoalId?: string | null) {
    if (!inputPacket || typeof inputPacket !== 'object' || Array.isArray(inputPacket)) {
      return null;
    }
    const request = inputPacket.resourceRequest;
    if (!request || typeof request !== 'object' || Array.isArray(request)) {
      return null;
    }
    const key = typeof request.key === 'string' ? request.key.trim() : '';
    if (!key) {
      return null;
    }
    const inferredGoalScope =
      request.scope === 'goal' ||
      request.goalScope === true ||
      request.category === 'hackerone-goal' ||
      (typeof request.goalId === 'string' && request.goalId.trim());
    return {
      key,
      label: typeof request.label === 'string' && request.label.trim() ? request.label.trim() : key,
      description: typeof request.description === 'string' && request.description.trim() ? request.description.trim() : null,
      value: Object.prototype.hasOwnProperty.call(request, 'value')
        ? request.value == null ? '' : String(request.value)
        : '',
      isSecret: Boolean(request.isSecret),
      required: request.required !== false,
      createTaskOnMissing: request.createTaskOnMissing !== false,
      category: typeof request.category === 'string' && request.category.trim() ? request.category.trim() : null,
      scope: inferredGoalScope ? 'goal' : 'project',
      goalId: inferredGoalScope && typeof request.goalId === 'string' && request.goalId.trim()
        ? request.goalId.trim()
        : inferredGoalScope && fallbackGoalId
          ? fallbackGoalId
          : null,
    };
  }

  private ownerTodoPacketKind(inputPacket: any, fallbackGoalId?: string | null) {
    if (this.projectGlobalResourceRequestFromPacket(inputPacket, fallbackGoalId)) return 'resourceRequest';
    if (
      inputPacket &&
      typeof inputPacket === 'object' &&
      !Array.isArray(inputPacket) &&
      inputPacket.ownerAction &&
      typeof inputPacket.ownerAction === 'object' &&
      !Array.isArray(inputPacket.ownerAction)
    ) {
      return 'ownerAction';
    }
    return null;
  }

  private runtimeSessionConversationId(session?: AgentRuntimeSession | null) {
    if (!session) return null;
    return (
      session.activeRequestConversationId ||
      session.activeConversationId ||
      session.conversations?.[0]?.id ||
      null
    );
  }

  private ownerTodoRequesterFromRuntime(runtime: {
    memberId?: string | null;
    userId?: string | null;
    role?: string | null;
    runtimeId?: string | null;
    session?: AgentRuntimeSession | null;
  }) {
    if (!runtime?.memberId && !runtime?.runtimeId) return null;
    return {
      source: 'agent-runtime',
      memberId: runtime.memberId || null,
      userId: runtime.userId || null,
      role: runtime.role || null,
      runtimeId: runtime.runtimeId || null,
      conversationId: this.runtimeSessionConversationId(runtime.session),
      requestId: runtime.session?.activeRequestId || null,
      requestedAt: new Date().toISOString(),
    };
  }

  private mergeOwnerTodoRequester(inputPacket: any, requester: any, fallbackGoalId?: string | null) {
    if (!requester || !inputPacket || typeof inputPacket !== 'object' || Array.isArray(inputPacket)) return inputPacket;
    const kind = this.ownerTodoPacketKind(inputPacket, fallbackGoalId);
    if (!kind) return inputPacket;
    const existingTop = inputPacket.ownerTodoRequester && typeof inputPacket.ownerTodoRequester === 'object'
      ? inputPacket.ownerTodoRequester
      : {};
    const nested = inputPacket[kind] && typeof inputPacket[kind] === 'object' && !Array.isArray(inputPacket[kind])
      ? inputPacket[kind]
      : {};
    const existingNested = nested.requester && typeof nested.requester === 'object' && !Array.isArray(nested.requester)
      ? nested.requester
      : {};
    const mergedRequester = {
      ...requester,
      ...existingTop,
      ...existingNested,
      source: existingNested.source || existingTop.source || requester.source || 'agent-runtime',
      requestedAt: existingNested.requestedAt || existingTop.requestedAt || requester.requestedAt || new Date().toISOString(),
    };
    return {
      ...inputPacket,
      ownerTodoRequester: mergedRequester,
      [kind]: {
        ...nested,
        requester: mergedRequester,
      },
    };
  }

  private async inferOwnerTodoRequester(
    projectId: string,
    inputPacket: any,
    createdByUserId?: string | null,
  ) {
    if (!inputPacket || typeof inputPacket !== 'object' || Array.isArray(inputPacket)) return null;
    if (!this.ownerTodoPacketKind(inputPacket)) return null;
    const explicit =
      (inputPacket.ownerTodoRequester && typeof inputPacket.ownerTodoRequester === 'object' && !Array.isArray(inputPacket.ownerTodoRequester)
        ? inputPacket.ownerTodoRequester
        : null) ||
      (inputPacket.resourceRequest?.requester && typeof inputPacket.resourceRequest.requester === 'object' && !Array.isArray(inputPacket.resourceRequest.requester)
        ? inputPacket.resourceRequest.requester
        : null) ||
      (inputPacket.ownerAction?.requester && typeof inputPacket.ownerAction.requester === 'object' && !Array.isArray(inputPacket.ownerAction.requester)
        ? inputPacket.ownerAction.requester
        : null);
    const agentRuntime =
      inputPacket.agentRuntime && typeof inputPacket.agentRuntime === 'object' && !Array.isArray(inputPacket.agentRuntime)
        ? inputPacket.agentRuntime
        : {};
    const explicitMemberId = typeof explicit?.memberId === 'string' && explicit.memberId.trim() ? explicit.memberId.trim() : '';
    const runtimeMemberId = typeof agentRuntime.memberId === 'string' && agentRuntime.memberId.trim() ? agentRuntime.memberId.trim() : '';
    let member = explicitMemberId || runtimeMemberId
      ? await this.prisma.projectMember.findFirst({
          where: { id: explicitMemberId || runtimeMemberId, projectId, removedAt: null },
          select: { id: true, userId: true, role: true, permissions: true },
        })
      : null;
    if (!member && createdByUserId) {
      member = await this.prisma.projectMember.findFirst({
        where: { projectId, userId: createdByUserId, removedAt: null },
        select: { id: true, userId: true, role: true, permissions: true },
      });
    }
    const session = this.readRuntimeSession(member?.permissions);
    const requester = {
      source: 'agent-runtime',
      memberId: member?.id || explicit?.memberId || agentRuntime.memberId || null,
      userId: member?.userId || explicit?.userId || null,
      role: member?.role || explicit?.role || null,
      runtimeId: explicit?.runtimeId || agentRuntime.runtimeId || session?.runtimeId || null,
      conversationId: explicit?.conversationId || this.runtimeSessionConversationId(session),
      requestId: explicit?.requestId || session?.activeRequestId || null,
      requestedAt: explicit?.requestedAt || agentRuntime.stampedAt || new Date().toISOString(),
    };
    return requester.memberId || requester.runtimeId ? requester : null;
  }

  private async applyCompletedProjectGlobalResourceRequest(projectId: string, userId: string, workItem: {
    id: string;
    status: any;
    inputPacket: any;
    goalId?: string | null;
    featureId?: string | null;
  }) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { ownerId: true, settings: true },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    const statusFlow = this.resolveProjectWorkItemStatusFlow(project.settings);
    if (!statusFlow.completedStatuses.includes(this.normalizeWorkItemStatusId(workItem.status))) {
      return false;
    }

    const request = this.projectGlobalResourceRequestFromPacket(workItem.inputPacket, workItem.goalId);
    if (!request) {
      return false;
    }
    if (!request.value) {
      throw new BadRequestException('Project resource value is required before completing this owner item');
    }

    if (project.ownerId !== userId) {
      throw new ForbiddenException('Only the project owner can complete project global resource request items');
    }

    const existingSettings =
      project.settings && typeof project.settings === 'object' && !Array.isArray(project.settings)
        ? project.settings as Record<string, any>
        : {};
    const requestScope = request.scope === 'goal' ? 'goal' : 'project';
    let requestGoalId = requestScope === 'goal' ? request.goalId || workItem.goalId || null : null;
    if (requestScope === 'goal' && !requestGoalId && workItem.featureId) {
      const feature = await this.prisma.projectFeature.findFirst({
        where: { id: workItem.featureId, projectId },
        select: { goalId: true },
      });
      requestGoalId = feature?.goalId || null;
    }
    if (requestScope === 'goal' && !requestGoalId) {
      throw new BadRequestException('Goal-scoped resource request requires a goal');
    }
    const existingGlobals = await this.resolveProjectGlobalVariables(projectId, existingSettings);
    const scopedRequest: ProjectGlobalVariable = { ...request, scope: requestScope, goalId: requestGoalId };
    const existingIndex = existingGlobals.findIndex((entry) => this.projectGlobalIdentity(entry) === this.projectGlobalIdentity(scopedRequest));
    const existing = existingIndex >= 0 ? existingGlobals[existingIndex] : null;
    const nextGlobal: ProjectGlobalVariable = {
      key: request.key,
      label: request.label || existing?.label || request.key,
      description: request.description ?? existing?.description ?? null,
      value: request.value,
      isSecret: request.isSecret || Boolean(existing?.isSecret),
      required: request.required,
      createTaskOnMissing: request.createTaskOnMissing,
      category: request.category ?? existing?.category ?? null,
      scope: requestScope,
      goalId: requestScope === 'goal' ? requestGoalId : null,
    };
    const nextGlobals =
      existingIndex >= 0
        ? existingGlobals.map((entry, index) => (index === existingIndex ? { ...entry, ...nextGlobal } : entry))
        : [...existingGlobals, nextGlobal];
    const nextSettings: Record<string, any> = {
      ...existingSettings,
      projectGlobals: this.globalsForStoredSettings(nextGlobals),
    };

    await this.persistProjectGlobalSecrets(projectId, nextGlobals, {
      updatedByUserId: userId,
      workItemId: workItem.id,
      source: 'work-item-resource-request',
    });
    await this.prisma.project.update({
      where: { id: projectId },
      data: { settings: nextSettings },
    });
    await this.prisma.projectWorkItem.update({
      where: { id: workItem.id },
      data: { inputPacket: this.sanitizeWorkItemInputPacket(workItem.inputPacket) as any },
    }).catch((error: any) => {
      this.logger.warn(
        `Failed to sanitize resource request work item ${workItem.id}: ${error?.message || error}`,
      );
    });
    await this.agentWorkspaceClient.updateProject(projectId, { settings: nextSettings }).catch(() => null);
    await this.syncProjectGlobalResourceTasks(projectId, project.ownerId, nextGlobals);
    await this.syncProjectGlobalsToRuntimeSessions(projectId, nextGlobals).catch((error: any) => {
      this.logger.warn(
        `Failed to sync project globals after resource request ${workItem.id}: ${error?.message || error}`,
      );
    });
    return true;
  }

  private ownerTodoRequesterFromInputPacket(inputPacket: any) {
    if (!inputPacket || typeof inputPacket !== 'object' || Array.isArray(inputPacket)) return null;
    const kind = this.ownerTodoPacketKind(inputPacket);
    const nested = kind && inputPacket[kind] && typeof inputPacket[kind] === 'object' && !Array.isArray(inputPacket[kind])
      ? inputPacket[kind]
      : null;
    const requester =
      (inputPacket.ownerTodoRequester && typeof inputPacket.ownerTodoRequester === 'object' && !Array.isArray(inputPacket.ownerTodoRequester)
        ? inputPacket.ownerTodoRequester
        : null) ||
      (nested?.requester && typeof nested.requester === 'object' && !Array.isArray(nested.requester)
        ? nested.requester
        : null) ||
      (inputPacket.agentRuntime && typeof inputPacket.agentRuntime === 'object' && !Array.isArray(inputPacket.agentRuntime)
        ? inputPacket.agentRuntime
        : null);
    return requester || null;
  }

  private async notifyOwnerTodoRequester(
    projectId: string,
    actorUserId: string,
    workItem: {
      id: string;
      title?: string | null;
      status?: string | null;
      goalId?: string | null;
      inputPacket?: any;
    },
    kind: 'resourceRequest' | 'ownerAction',
  ) {
    const inputPacket = workItem.inputPacket;
    const requester = this.ownerTodoRequesterFromInputPacket(inputPacket);
    const memberId = typeof requester?.memberId === 'string' && requester.memberId.trim()
      ? requester.memberId.trim()
      : '';
    if (!memberId) return false;

    const member = await this.prisma.projectMember.findFirst({
      where: { id: memberId, projectId, removedAt: null },
      select: { id: true, role: true, userId: true, permissions: true },
    });
    if (!member) return false;
    const rawSession = this.readRuntimeSession(member.permissions);
    let session = rawSession ? this.recoverPersistedRuntimeSession(rawSession) : null;
    if (!session) return false;
    if (rawSession !== session) {
      await this.writeRuntimeSession(member.id, session);
    }
    const runtimeSession = session;
    let inspected = this.recoverPersistedRuntimeSession(
      await this.agentRuntimeLauncher.inspect(runtimeSession).catch(() => runtimeSession),
    );
    if (this.agentPollingRuntimeNeedsReconnect(inspected)) {
      const reconnectResult = await this.reconnectAgentRuntime(projectId, member.id, actorUserId).catch((error: any) => {
        this.logger.warn(`Owner todo requester reconnect failed for ${projectId}/${member.id}: ${error?.message || error}`);
        return null;
      });
      const reconnectedSession = (reconnectResult as any)?.session || null;
      if (reconnectedSession) {
        inspected = this.recoverPersistedRuntimeSession(reconnectedSession as AgentRuntimeSession);
      } else {
        const latestSession = await this.latestRuntimeSessionForMember(member.id);
        if (latestSession) {
          inspected = this.recoverPersistedRuntimeSession(latestSession);
        }
      }
      inspected = this.recoverPersistedRuntimeSession(
        await this.agentRuntimeLauncher.inspect(inspected).catch(() => inspected),
      );
    }
    const apiOk = (inspected as any).apiHealth?.ok !== false;
    const dockerRunning = (inspected as any).dockerStatus?.running !== false;
    if (!apiOk || !dockerRunning) return false;
    session = inspected;

    const packet =
      inputPacket && typeof inputPacket === 'object' && !Array.isArray(inputPacket)
        ? inputPacket
        : {};
    const todo =
      packet[kind] && typeof packet[kind] === 'object' && !Array.isArray(packet[kind])
        ? packet[kind]
        : {};
    const key = typeof todo.key === 'string' && todo.key.trim() ? todo.key.trim() : kind;
    const label = typeof todo.label === 'string' && todo.label.trim() ? todo.label.trim() : key;
    const conversationId =
      (typeof requester?.conversationId === 'string' && requester.conversationId.trim()
        ? requester.conversationId.trim()
        : '') || this.runtimeSessionConversationId(session);
    const canSteer = this.runtimeHasOngoingConversation(session) && this.runtimeCanAcceptSteer(session, conversationId);
    if (this.runtimeHasOngoingConversation(session) && !canSteer) {
      return false;
    }

    const message = [
      'Coordinator notice: an owner todo you requested has been completed.',
      `Owner todo id: ${workItem.id}`,
      workItem.title ? `Owner todo title: ${workItem.title}` : null,
      `Todo type: ${kind}`,
      `Todo key: ${key}`,
      `Todo label: ${label}`,
      `Todo status: ${workItem.status || 'ACCEPTED'}`,
      kind === 'resourceRequest'
        ? `The requested value is now saved as a project/goal global under key ${key}. Do not ask the owner to paste the secret; read the saved global/runtime env.`
        : 'The requested manual owner action is marked complete.',
      '',
      'Continue from this same session/context if the original work item still needs progress. Re-read current project/work-item state, verify the resource/action state, and either continue the blocked validation or create the next smallest follow-up item.',
    ].filter(Boolean).join('\n');

    await this.sendAgentRuntimeMessage(projectId, member.id, actorUserId, {
      message,
      ...(conversationId ? { conversationId } : {}),
      ...(canSteer ? { delivery: 'steer' as const } : {}),
    });
    return true;
  }

  private mergeProjectSettings(
    existingSettings: any,
    updates: {
      githubUrl?: string | null;
      settings?: any;
    },
  ) {
    const base =
      existingSettings && typeof existingSettings === 'object' && !Array.isArray(existingSettings)
        ? { ...existingSettings }
        : {};

    const incoming =
      updates.settings && typeof updates.settings === 'object' && !Array.isArray(updates.settings)
        ? updates.settings
        : {};

    const merged = {
      ...base,
      ...incoming,
    } as Record<string, any>;

    if (updates.githubUrl !== undefined) {
      if (updates.githubUrl) {
        merged.githubUrl = updates.githubUrl;
      } else {
        delete merged.githubUrl;
      }
    }

    return merged;
  }

  private async writeProjectSettings(projectId: string, settings: Record<string, any>) {
    await this.prisma.project.update({
      where: { id: projectId },
      data: { settings },
    });
    await this.agentWorkspaceClient.updateProject(projectId, { settings }).catch(() => null);
  }

  private normalizeProjectMaxActiveAgents(value: any, options: { strict?: boolean } = {}) {
    if (value === undefined || value === null || value === '') {
      return DEFAULT_PROJECT_MAX_ACTIVE_AGENTS;
    }
    const numeric = Number(value);
    const normalized = Math.floor(numeric);
    if (!Number.isFinite(numeric) || normalized < 1 || normalized > PROJECT_MAX_ACTIVE_AGENTS_CAP) {
      if (options.strict) {
        throw new BadRequestException(
          `Max active agents must be between 1 and ${PROJECT_MAX_ACTIVE_AGENTS_CAP}`,
        );
      }
      return Math.min(
        Math.max(Number.isFinite(numeric) ? normalized : DEFAULT_PROJECT_MAX_ACTIVE_AGENTS, 1),
        PROJECT_MAX_ACTIVE_AGENTS_CAP,
      );
    }
    return normalized;
  }

  private normalizeProjectMaxActiveGoals(value: any, options: { strict?: boolean } = {}) {
    if (value === undefined || value === null || value === '') {
      return DEFAULT_PROJECT_MAX_ACTIVE_GOALS;
    }
    const numeric = Number(value);
    const normalized = Math.floor(numeric);
    if (!Number.isFinite(numeric) || normalized < 1 || normalized > PROJECT_MAX_ACTIVE_GOALS_CAP) {
      if (options.strict) {
        throw new BadRequestException(
          `Max active goals must be between 1 and ${PROJECT_MAX_ACTIVE_GOALS_CAP}`,
        );
      }
      return Math.min(
        Math.max(Number.isFinite(numeric) ? normalized : DEFAULT_PROJECT_MAX_ACTIVE_GOALS, 1),
        PROJECT_MAX_ACTIVE_GOALS_CAP,
      );
    }
    return normalized;
  }

  private projectMaxActiveAgentsFromSettings(settings?: any) {
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
      return DEFAULT_PROJECT_MAX_ACTIVE_AGENTS;
    }
    return this.normalizeProjectMaxActiveAgents(settings.maxActiveAgents);
  }

  private projectMaxActiveGoalsFromSettings(settings?: any) {
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
      return DEFAULT_PROJECT_MAX_ACTIVE_GOALS;
    }
    return this.normalizeProjectMaxActiveGoals(settings.maxActiveGoals);
  }

  private applyProjectAgentLimitSetting(settings: any, options: { strict?: boolean } = {}) {
    const base =
      settings && typeof settings === 'object' && !Array.isArray(settings)
        ? settings as Record<string, any>
        : {};
    base.maxActiveAgents = this.normalizeProjectMaxActiveAgents(base.maxActiveAgents, options);
    base.maxActiveGoals = this.normalizeProjectMaxActiveGoals(base.maxActiveGoals, options);
    return base;
  }

  private isActiveProjectGoalStatus(status: unknown) {
    return PROJECT_ACTIVE_GOAL_STATUSES.includes(String(status || '').trim().toUpperCase());
  }

  private async ensureProjectActiveGoalCapacity(projectId: string, settings?: any, excludeGoalId?: string | null) {
    const maxActiveGoals = this.projectMaxActiveGoalsFromSettings(settings);
    if (!(this.prisma.projectGoal as any)?.count) {
      return { activeGoalCount: 0, maxActiveGoals };
    }
    const activeGoalCount = await this.prisma.projectGoal.count({
      where: {
        projectId,
        status: { in: PROJECT_ACTIVE_GOAL_STATUSES as any },
        ...(excludeGoalId ? { id: { not: excludeGoalId } } : {}),
      },
    });
    if (activeGoalCount >= maxActiveGoals) {
      throw new BadRequestException(
        `Project active goal limit reached (${activeGoalCount}/${maxActiveGoals}). Complete an active goal or move one back to OPEN before starting another active goal.`,
      );
    }
    return { activeGoalCount, maxActiveGoals };
  }

  private async activeProjectAgentCount(projectId: string) {
    const members = await this.prisma.projectMember.findMany({
      where: {
        projectId,
        removedAt: null,
        OR: [
          { user: { role: 'AI_AGENT' as any } },
          { role: { endsWith: '_AGENT' } },
        ],
      },
      select: { id: true, permissions: true },
    });
    const activeFlags = await Promise.all(members.map(async (member) => {
      const session = this.readRuntimeSession(member.permissions);
      if (!session) return false;
      if (session.provider === 'local-docker') {
        const inspected = await this.agentRuntimeLauncher.inspect(session).catch((error: any) =>
          this.buildUnavailableLocalDockerSession(session, error),
        );
        const inspectedStatus = String((inspected as any).status || '').toUpperCase();
        if ((inspected as any).dockerStatus?.running === false || ['STOPPED', 'ERROR'].includes(inspectedStatus)) {
          await this.writeRuntimeSession(member.id, inspected as AgentRuntimeSession).catch(() => null);
          return false;
        }
        if (inspected !== session) {
          await this.writeRuntimeSession(member.id, inspected as AgentRuntimeSession).catch(() => null);
        }
        const activeStatus = String((inspected as any).status || '').toUpperCase();
        return Boolean(activeStatus) && activeStatus !== 'STOPPED' && activeStatus !== 'ERROR';
      }
      const status = String(session.status || '').toUpperCase();
      return Boolean(status) && status !== 'STOPPED' && status !== 'ERROR';
    }));
    return activeFlags.filter(Boolean).length;
  }

  private async ensureProjectActiveAgentCapacity(projectId: string, settings?: any) {
    const maxActiveAgents = this.projectMaxActiveAgentsFromSettings(settings);
    const activeAgentCount = await this.activeProjectAgentCount(projectId);
    if (activeAgentCount >= maxActiveAgents) {
      throw new BadRequestException(
        `Project active agent limit reached (${activeAgentCount}/${maxActiveAgents}). Dismiss inactive agents to free capacity, or increase Max active agents in Project Settings (maximum ${PROJECT_MAX_ACTIVE_AGENTS_CAP}).`,
      );
    }
    return { activeAgentCount, maxActiveAgents };
  }

  private positiveIntegerFromProjectGlobal(projectGlobals: ProjectGlobalVariable[], key: string) {
    const entry = projectGlobals.find((global) => global.key === key);
    const numeric = Number(entry?.value);
    return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : null;
  }

  private maxParallelGlobalKeysForRole(role: string) {
    const normalizedRole = String(role || '').trim().toUpperCase();
    const roleSlug = normalizedRole.toLowerCase();
    const keysByRole: Record<string, string[]> = {
      PLANNER_AGENT: ['h1_max_parallel_planners', 'h1_max_parallel_planner_agents'],
      WORKER_AGENT: ['h1_max_parallel_workers', 'h1_max_parallel_worker_agents', 'max_parallel_workers'],
      SECURITY_AUDITOR: [
        'h1_max_parallel_auditors',
        'h1_max_parallel_security_auditors',
        'h1_max_parallel_security_auditor_agents',
      ],
      REVIEW_AGENT: ['h1_max_parallel_reviewers', 'h1_max_parallel_review_agents'],
      INTEGRATOR_AGENT: ['h1_max_parallel_integrators', 'h1_max_parallel_integrator_agents'],
    };
    return [
      ...(keysByRole[normalizedRole] || []),
      `h1_max_parallel_${roleSlug.toLowerCase()}`,
    ];
  }

  private maxParallelFromProjectGlobals(projectGlobals: ProjectGlobalVariable[], role: string) {
    for (const key of this.maxParallelGlobalKeysForRole(role)) {
      const value = this.positiveIntegerFromProjectGlobal(projectGlobals, key);
      if (value) return value;
    }
    return null;
  }

  private maxActiveItemsFromProjectGlobals(projectGlobals: ProjectGlobalVariable[]) {
    for (const key of ['max_active_items', 'project_max_active_items', 'h1_max_active_items']) {
      const value = this.positiveIntegerFromProjectGlobal(projectGlobals, key);
      if (value) return Math.min(value, 300);
    }
    return 300;
  }

  private async ensureProjectActiveWorkItemCapacity(
    projectId: string,
    settings: any,
    statusFlow: ResolvedProjectWorkItemStatusFlow,
  ) {
    const projectGlobals = await this.resolveProjectGlobalVariables(projectId, settings).catch(() => []);
    const maxActiveItems = this.maxActiveItemsFromProjectGlobals(projectGlobals);
    const activeItemCount = await this.prisma.projectWorkItem.count({
      where: {
        projectId,
        status: { notIn: statusFlow.terminalStatuses as any },
      },
    });
    if (activeItemCount >= maxActiveItems) {
      throw new BadRequestException(
        `Project active work item limit reached (${activeItemCount}/${maxActiveItems}). Complete, accept, or cancel existing items before creating more.`,
      );
    }
    return { activeItemCount, maxActiveItems };
  }

  private configuredProjectGlobalKeysForWorkItem(
    projectGlobals: ProjectGlobalVariable[],
    goalId?: string | null,
  ) {
    return new Set(projectGlobals
      .filter((global) => {
        if (!global?.key) return false;
        if (!Boolean(global.configured || global.value)) return false;
        return this.isProjectScopedGlobal(global) || !global.goalId || !goalId || global.goalId === goalId;
      })
      .map((global) => global.key));
  }

  private requiredProjectGlobalKeysForWorkItem(item: any) {
    const inputPacket = item?.inputPacket && typeof item.inputPacket === 'object' && !Array.isArray(item.inputPacket)
      ? item.inputPacket
      : {};
    return this.uniqueStringList(
      this.cleanStringList(inputPacket.requiredGlobals),
      this.cleanStringList(inputPacket.requiredProjectGlobals),
      this.cleanStringList(inputPacket.requiredResourceKeys),
      this.cleanStringList(inputPacket.resourceKeys),
    );
  }

  private missingRequiredProjectGlobalsForWorkItem(item: any, projectGlobals: ProjectGlobalVariable[]) {
    const requiredKeys = this.requiredProjectGlobalKeysForWorkItem(item);
    if (!requiredKeys.length) return [];
    const configuredKeys = this.configuredProjectGlobalKeysForWorkItem(projectGlobals, item?.goalId || null);
    return requiredKeys.filter((key) => !configuredKeys.has(key));
  }

  private isSecretLikeContextKey(key: string) {
    return /(?:token|secret|password|api[_-]?key|apikey|private[_-]?key|cookie|authorization|bearer|jwt|credential|credentials)/i.test(
      key,
    );
  }

  private sanitizeAssignmentContextPacket(value: unknown, parentKeySensitive = false): unknown {
    if (value === null || value === undefined) return value;
    if (typeof value !== 'object') {
      return parentKeySensitive ? '[REDACTED:secret]' : value;
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.sanitizeAssignmentContextPacket(item, parentKeySensitive));
    }
    const sanitized: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      sanitized[key] = this.sanitizeAssignmentContextPacket(
        nested,
        parentKeySensitive || this.isSecretLikeContextKey(key),
      );
    }
    return sanitized;
  }

  private sanitizeWorkItemInputPacket(value: unknown): unknown {
    if (value === null || value === undefined) return value;
    if (typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map((item) => this.sanitizeWorkItemInputPacket(item));

    const packet: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (key === 'resourceRequest' && nested && typeof nested === 'object' && !Array.isArray(nested)) {
        const request = { ...(nested as Record<string, unknown>) };
        const rawValue = request.value;
        if ('value' in request) {
          delete request.value;
          request.hasValue = typeof rawValue === 'string' ? rawValue.length > 0 : rawValue !== null && rawValue !== undefined;
        }
        packet[key] = request;
        continue;
      }
      packet[key] = this.sanitizeWorkItemInputPacket(nested);
    }
    return packet;
  }

  private legacyOwnerActionFromWorkItem(item: any) {
    const title = typeof item?.title === 'string' ? item.title.trim() : '';
    if (!/^Owner Decision:/i.test(title)) return null;
    const label = title.replace(/^Owner Decision:\s*/i, '').trim() || title;
    const slug = label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 80) || 'owner_decision';
    return {
      key: `legacy_owner_decision_${slug}`,
      label,
      type: 'approval',
      category: 'legacy-owner-decision',
      required: true,
      prompt: label,
      legacy: true,
    };
  }

  private sanitizeWorkItemForResponse<T extends Record<string, any>>(item: T): T {
    const inputPacket = this.sanitizeWorkItemInputPacket(item.inputPacket);
    const sanitized: Record<string, any> = {
      ...item,
      inputPacket,
    };
    if (
      inputPacket &&
      typeof inputPacket === 'object' &&
      !Array.isArray(inputPacket) &&
      !(inputPacket as any).ownerAction &&
      !(inputPacket as any).resourceRequest
    ) {
      const ownerAction = this.legacyOwnerActionFromWorkItem(item);
      if (ownerAction) {
        sanitized.inputPacket = {
          ...(inputPacket as Record<string, any>),
          ownerAction,
        };
      }
    }
    if (Array.isArray(item.assignments)) {
      sanitized.assignments = item.assignments.map((assignment: any) => ({
        ...assignment,
        contextPacket: this.sanitizeAssignmentContextPacket(assignment.contextPacket),
      }));
    }
    return sanitized as T;
  }

  private async ensureRuntimeDispatchRoleCapacity(projectId: string, settings: any, role: string) {
    const projectGlobals = await this.resolveProjectGlobalVariables(projectId, settings).catch(() => []);
    const maxParallelForRole = this.maxParallelFromProjectGlobals(projectGlobals, role);
    if (!maxParallelForRole) return;
    const normalizedRole = String(role || '').trim().toUpperCase();

    if (!(this.prisma.projectAssignment as any).findMany) {
      const activeAssignments = await this.prisma.projectAssignment.count({
        where: {
          projectId,
          role: normalizedRole,
          status: { in: ['PROPOSED', 'ACTIVE', 'PAUSED'] as any },
        },
      });
      if (activeAssignments >= maxParallelForRole) {
        throw new BadRequestException(
          `Project ${normalizedRole} parallel limit reached (${activeAssignments}/${maxParallelForRole}). Wait for an active assignment to finish or revise the project global before dispatching another agent.`,
        );
      }
      return;
    }

    const openAssignments = await this.prisma.projectAssignment.findMany({
      where: {
        projectId,
        role: normalizedRole,
        status: { in: ['PROPOSED', 'ACTIVE', 'PAUSED'] as any },
      },
      select: {
        assigneeUserId: true,
        workItem: { select: { status: true } },
      },
    });
    const activeAssignments = (
      await Promise.all(openAssignments.map(async (assignment) => {
        if (this.isTerminalWorkItemStatus(assignment.workItem?.status, settings)) return false;
        return this.assignmentAssigneeRuntimeAvailable(projectId, assignment);
      }))
    ).filter(Boolean).length;
    const activeForRole = (this.prisma.projectMember as any)?.findMany
      ? await this.activeCoordinatorRoleCount(projectId, normalizedRole, settings).catch(() => activeAssignments)
      : activeAssignments;
    if (activeForRole >= maxParallelForRole) {
      throw new BadRequestException(
        `Project ${normalizedRole} parallel limit reached (${activeForRole}/${maxParallelForRole}). Wait for an active assignment to finish or revise the project global before dispatching another agent.`,
      );
    }
  }

  private normalizeWorkItemStatusId(status: unknown) {
    return String(status || '').trim().toUpperCase();
  }

  private positiveInteger(value: unknown, fallback = 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : fallback;
  }

  private normalizeWorkItemStatusDefinition(raw: any): ProjectWorkItemStatusDefinition | null {
    const id = this.normalizeWorkItemStatusId(typeof raw === 'string' ? raw : raw?.id || raw?.status || raw?.key);
    if (!id) return null;
    const category = ['claimable', 'active', 'feedback', 'completed', 'closed', 'other'].includes(raw?.category)
      ? raw.category as ProjectWorkItemStatusCategory
      : undefined;
    return {
      id,
      label: typeof raw?.label === 'string' && raw.label.trim() ? raw.label.trim() : undefined,
      description: typeof raw?.description === 'string' && raw.description.trim() ? raw.description.trim() : undefined,
      category,
      initial: Boolean(raw?.initial),
      terminal: Boolean(raw?.terminal),
      completed: Boolean(raw?.completed),
      closed: Boolean(raw?.closed),
      dispatch: raw && typeof raw === 'object' && !Array.isArray(raw) ? raw.dispatch : undefined,
    };
  }

  private normalizeCoordinatorDispatchRule(raw: any): ProjectCoordinatorDispatchRule | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const role = typeof raw.role === 'string' && raw.role.trim() ? raw.role.trim().toUpperCase() : '';
    if (!role) return null;
    const statuses = [
      ...this.cleanStringList(raw.statuses),
      ...this.cleanStringList(raw.fromStatuses),
      ...(typeof raw.status === 'string' ? [raw.status] : []),
      ...(typeof raw.fromStatus === 'string' ? [raw.fromStatus] : []),
    ].map((status) => this.normalizeWorkItemStatusId(status));
    const workTypes = [
      ...this.cleanStringList(raw.workTypes),
      ...(typeof raw.workType === 'string' ? [raw.workType] : []),
    ].map((workType) => workType.trim().toUpperCase());
    return {
      statuses: [...new Set(statuses.filter(Boolean))],
      workTypes: [...new Set(workTypes.filter(Boolean))],
      role,
      launchMode: this.effectiveAgentRuntimeLaunchMode(raw.launchMode),
      agentType: typeof raw.agentType === 'string' && raw.agentType.trim() ? raw.agentType.trim() : null,
      maxAgents: this.positiveInteger(raw.maxAgents, 0) || null,
      minAgents: this.positiveInteger(raw.minAgents, 0) || null,
      forceLaunchNew: raw.forceLaunchNew !== false,
      allowOwnerOwned: Boolean(raw.allowOwnerOwned),
      allowRepeatCompleted: Boolean(raw.allowRepeatCompleted || raw.allowRepeat),
      objective: typeof raw.objective === 'string' && raw.objective.trim() ? raw.objective.trim() : null,
      message: typeof raw.message === 'string' && raw.message.trim() ? raw.message.trim() : null,
    };
  }

  private coordinatorRuleAllowsIdleRuntimeReuse(
    rule: ProjectCoordinatorDispatchRule,
    item: any,
    statusFlow: ResolvedProjectWorkItemStatusFlow,
  ) {
    if (!rule.forceLaunchNew) return true;

    const inputPacket =
      item?.inputPacket && typeof item.inputPacket === 'object' && !Array.isArray(item.inputPacket)
        ? item.inputPacket
        : {};
    if (inputPacket.sameGoalContinuation === true || inputPacket.allowWorkerReuse === true || inputPacket.allowRuntimeReuse === true) {
      return true;
    }

    const role = String(rule.role || '').trim().toUpperCase();
    const itemStatus = this.normalizeWorkItemStatusId(item?.status);
    const statusDefinition = statusFlow.statusById.get(itemStatus);
    const hasCompletedSameRoleAssignment = (item?.assignments || []).some((assignment: any) =>
      String(assignment?.role || '').trim().toUpperCase() === role &&
      String(assignment?.status || '').trim().toUpperCase() === 'COMPLETED',
    );
    if (
      role === 'WORKER_AGENT' &&
      hasCompletedSameRoleAssignment &&
      itemStatus === this.normalizeWorkItemStatusId(statusFlow.reviewChangesRequestedStatus)
    ) {
      return true;
    }

    if (!['SECURITY_AUDITOR', 'REVIEW_AGENT'].includes(role)) {
      return false;
    }

    const workType = String(item?.workType || '').trim().toUpperCase();
    if (['SECURITY_AUDIT', 'AUDIT'].includes(workType)) {
      return true;
    }

    return statusDefinition?.category === 'feedback';
  }

  private resolveProjectWorkItemStatusFlow(settings?: any): ResolvedProjectWorkItemStatusFlow {
    const rawFlow =
      settings && typeof settings === 'object' && !Array.isArray(settings)
        ? ((settings.workItemStatusFlow && typeof settings.workItemStatusFlow === 'object')
          ? settings.workItemStatusFlow
          : (settings.workItemStatuses && typeof settings.workItemStatuses === 'object')
            ? settings.workItemStatuses
            : {})
        : {};
    const definitions = new Map<string, ProjectWorkItemStatusDefinition>();
    for (const definition of DEFAULT_WORK_ITEM_STATUS_DEFINITIONS) {
      definitions.set(definition.id, { ...definition });
    }
    for (const raw of Array.isArray(rawFlow.statuses) ? rawFlow.statuses : []) {
      const normalized = this.normalizeWorkItemStatusDefinition(raw);
      if (!normalized) continue;
      definitions.set(normalized.id, {
        ...(definitions.get(normalized.id) || {}),
        ...normalized,
      });
    }

    const statuses = [...definitions.values()];
    const statusById = new Map(statuses.map((status) => [status.id, status]));
    const statusIdsByCategory = (category: ProjectWorkItemStatusCategory) =>
      statuses.filter((status) => status.category === category).map((status) => status.id);
    const configuredList = (key: string) =>
      this.cleanStringList(rawFlow[key]).map((status) => this.normalizeWorkItemStatusId(status)).filter(Boolean);
    const configuredStatus = (key: string) => {
      const normalized = this.normalizeWorkItemStatusId(rawFlow[key]);
      return normalized || '';
    };
    const initialStatus =
      configuredStatus('initialStatus') ||
      statuses.find((status) => status.initial)?.id ||
      'READY';
    const dispatchRules = [
      ...(Array.isArray(rawFlow.dispatchRules) ? rawFlow.dispatchRules : []),
      ...(Array.isArray(rawFlow.autoDispatchRules) ? rawFlow.autoDispatchRules : []),
      ...statuses
        .map((status) => (status as any).dispatch || null)
        .filter(Boolean),
    ]
      .map((rule) => this.normalizeCoordinatorDispatchRule(rule))
      .filter((rule): rule is ProjectCoordinatorDispatchRule => Boolean(rule));
    const rawCoordinator =
      rawFlow.coordinator && typeof rawFlow.coordinator === 'object' && !Array.isArray(rawFlow.coordinator)
        ? rawFlow.coordinator
        : settings?.coordinator && typeof settings.coordinator === 'object' && !Array.isArray(settings.coordinator)
          ? settings.coordinator
          : {};
    const numberRecord = (value: unknown) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
      return Object.entries(value as Record<string, unknown>).reduce((acc, [role, count]) => {
        const normalizedRole = role.trim().toUpperCase();
        const normalizedCount = this.positiveInteger(count, 0);
        if (normalizedRole && normalizedCount > 0) acc[normalizedRole] = normalizedCount;
        return acc;
      }, {} as Record<string, number>);
    };
    const claimableStatuses = [...new Set([...configuredList('claimableStatuses'), ...statusIdsByCategory('claimable')])];
    const feedbackStatuses = [...new Set([...configuredList('feedbackStatuses'), ...statusIdsByCategory('feedback')])];
    const completedStatuses = [...new Set([...configuredList('completedStatuses'), ...statusIdsByCategory('completed'), ...statuses.filter((status) => status.completed).map((status) => status.id)])];
    const closedStatuses = [...new Set([...configuredList('closedStatuses'), ...statusIdsByCategory('closed'), ...statuses.filter((status) => status.closed).map((status) => status.id)])];
    const terminalStatuses = [...new Set([
      ...configuredList('terminalStatuses'),
      ...statuses.filter((status) => status.terminal || status.completed || status.closed).map((status) => status.id),
    ])];
    const firstStatus = (...candidates: Array<string | undefined | null>) =>
      candidates.map((candidate) => this.normalizeWorkItemStatusId(candidate)).find(Boolean) || '';
    const activeStatus = firstStatus(
      configuredStatus('activeStatus'),
      configuredStatus('assignmentActiveStatus'),
      statusIdsByCategory('active')[0],
      'IN_PROGRESS',
    );
    const assignmentCompletedStatus = firstStatus(
      configuredStatus('assignmentCompletedStatus'),
      configuredStatus('handoffStatus'),
      feedbackStatuses[0],
      'IN_REVIEW',
    );
    const assignmentFailedStatus = firstStatus(
      configuredStatus('assignmentFailedStatus'),
      configuredStatus('revisionStatus'),
      claimableStatuses.find((status) => status === 'NEEDS_REVISION'),
      claimableStatuses.find((status) => status !== initialStatus),
      'NEEDS_REVISION',
    );
    const reviewApprovedStatus = firstStatus(
      configuredStatus('reviewApprovedStatus'),
      configuredStatus('completedStatus'),
      completedStatuses[0],
      'ACCEPTED',
    );
    const reviewChangesRequestedStatus = firstStatus(
      configuredStatus('reviewChangesRequestedStatus'),
      configuredStatus('revisionStatus'),
      assignmentFailedStatus,
      'NEEDS_REVISION',
    );
    const reviewRejectedStatus = firstStatus(
      configuredStatus('reviewRejectedStatus'),
      configuredStatus('closedStatus'),
      closedStatuses[0],
      'REJECTED',
    );
    const closedStatus = firstStatus(configuredStatus('closedStatus'), closedStatuses[0], 'CANCELLED');
    return {
      statuses,
      statusById,
      initialStatus,
      claimableStatuses,
      feedbackStatuses,
      completedStatuses,
      closedStatuses,
      terminalStatuses,
      activeStatus,
      assignmentCompletedStatus,
      assignmentFailedStatus,
      reviewApprovedStatus,
      reviewChangesRequestedStatus,
      reviewRejectedStatus,
      closedStatus,
      dispatchRules,
      coordinator: {
        enabled: rawCoordinator.enabled !== false,
        minAgents: this.positiveInteger(rawCoordinator.minAgents, 0),
        maxAgents: this.positiveInteger(rawCoordinator.maxAgents, 0),
        maxDispatchesPerTick: this.positiveInteger(rawCoordinator.maxDispatchesPerTick, 3),
        launchMode:
          this.effectiveAgentRuntimeLaunchMode(rawCoordinator.launchMode) ||
          this.defaultAgentRuntimeLaunchMode(),
        agentType: typeof rawCoordinator.agentType === 'string' && rawCoordinator.agentType.trim() ? rawCoordinator.agentType.trim() : 'pi',
        messageTemplate: typeof rawCoordinator.messageTemplate === 'string' && rawCoordinator.messageTemplate.trim() ? rawCoordinator.messageTemplate.trim() : null,
        lastTickAt: typeof rawCoordinator.lastTickAt === 'string' && rawCoordinator.lastTickAt.trim() ? rawCoordinator.lastTickAt.trim() : null,
        minAgentsByRole: numberRecord(rawCoordinator.minAgentsByRole),
        maxAgentsByRole: numberRecord(rawCoordinator.maxAgentsByRole),
      },
    };
  }

  private isTerminalWorkItemStatus(status: unknown, settings?: any) {
    const normalized = this.normalizeWorkItemStatusId(status);
    if (!normalized) return false;
    return this.resolveProjectWorkItemStatusFlow(settings).terminalStatuses.includes(normalized);
  }

  private async markOpenAssignmentsFailedForTerminalWorkItem(
    projectId: string,
    workItemId: string,
    role?: string,
  ) {
    const assignments = await this.prisma.projectAssignment.findMany({
      where: {
        projectId,
        workItemId,
        ...(role ? { role } : {}),
        status: { in: ['PROPOSED', 'ACTIVE', 'PAUSED'] as any },
      },
      select: { id: true, contextPacket: true },
    });
    await Promise.all(assignments.map((assignment) => this.prisma.projectAssignment.update({
      where: { id: assignment.id },
      data: {
        status: 'FAILED',
        finishedAt: new Date(),
        contextPacket: {
          ...(assignment.contextPacket && typeof assignment.contextPacket === 'object' && !Array.isArray(assignment.contextPacket)
            ? assignment.contextPacket as Record<string, any>
            : {}),
          staleDispatch: {
            reason: 'WORK_ITEM_TERMINAL',
            failedAt: new Date().toISOString(),
          },
        },
      },
    }).catch(() => null)));
  }

  private shouldAutoLaunchFreshHackerOneWorker(settings: any, role: string, dto: any = {}) {
    if (role !== 'WORKER_AGENT') return false;
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return false;
    if (settings.projectTemplateId !== 'hackerone-opportunity-research') return false;
    const packet =
      dto.contextPacket && typeof dto.contextPacket === 'object' && !Array.isArray(dto.contextPacket)
        ? dto.contextPacket as Record<string, any>
        : {};
    if (packet.allowWorkerReuse === true || packet.sameGoalContinuation === true) return false;
    return true;
  }

  private isHackerOneOpportunityResearchSettings(settings: any) {
    return Boolean(
      settings &&
      typeof settings === 'object' &&
      !Array.isArray(settings) &&
      settings.projectTemplateId === 'hackerone-opportunity-research'
    );
  }

  private isGenericHackerOneOpportunityDiscoveryGoal(input: {
    title?: string | null;
    description?: string | null;
  }) {
    const title = typeof input.title === 'string' ? input.title.toLowerCase() : '';
    const description = typeof input.description === 'string' ? input.description.toLowerCase() : '';
    const text = [title, description].filter(Boolean).join(' ');
    const hasGenericDiscoveryTitle =
      title.includes('hackerone opportunity discovery') &&
      (
        title.includes('ongoing') ||
        title.includes('meta') ||
        title.includes('target scouting') ||
        title.includes('batch') ||
        title.includes('generic')
      );
    if (hasGenericDiscoveryTitle) return true;

    const hasSpecificProgramUrl = /https:\/\/hackerone\.com\/(?!opportunities(?:\/|$)|graphql\b)[a-z0-9_-]+(?:\?type=team)?/i.test(text);
    if (hasSpecificProgramUrl) return false;

    return (
      (text.includes('hackerone opportunity discovery') || text.includes('opportunity-research')) &&
      (
        text.includes('opportunities/all') ||
        text.includes('target scouting') ||
        text.includes('meta-goal') ||
        text.includes('ongoing hackerone opportunity discovery')
      )
    );
  }

  private allowsParallelHackerOneOpportunityDiscovery(inputPacket: any) {
    if (!inputPacket || typeof inputPacket !== 'object' || Array.isArray(inputPacket)) return false;
    const coordinator =
      inputPacket.coordinator && typeof inputPacket.coordinator === 'object' && !Array.isArray(inputPacket.coordinator)
        ? inputPacket.coordinator
        : {};
    return inputPacket.allowParallelOpportunityDiscovery === true || coordinator.allowParallelOpportunityDiscovery === true;
  }

  private async hasUnfinishedHackerOneTargetGoal(projectId: string) {
    const goals = await this.prisma.projectGoal.findMany({
      where: {
        projectId,
        status: { in: ['OPEN', 'IN_PROGRESS', 'BLOCKED'] as any },
      },
      select: { title: true, description: true },
      take: 200,
    });
    return goals.some((goal: any) => !this.isGenericHackerOneOpportunityDiscoveryGoal(goal));
  }

  private async shouldBlockGenericHackerOneOpportunityDiscovery(
    projectId: string,
    settings: any,
    inputPacket: any,
  ) {
    if (!this.isHackerOneOpportunityResearchSettings(settings)) return false;
    if (this.allowsParallelHackerOneOpportunityDiscovery(inputPacket)) return false;
    return this.hasUnfinishedHackerOneTargetGoal(projectId);
  }

  private localRunnerTokenHash(token: string) {
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }

  private localRunnerPresenceStaleMs() {
    const configured = Number(process.env.AGENTCRAFT_LOCAL_RUNNER_PRESENCE_STALE_MS || 45_000);
    return Number.isFinite(configured) && configured >= 15_000 ? configured : 45_000;
  }

  private localRunnerTokensFromSettings(settings: any): LocalRunnerTokenRecord[] {
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
      return [];
    }
    const tokens = Array.isArray(settings.localRunnerTokens) ? settings.localRunnerTokens : [];
    return tokens
      .filter((token: any) => token && typeof token === 'object')
      .map((token: any): LocalRunnerTokenRecord | null => {
        if (typeof token.id !== 'string' || typeof token.tokenHash !== 'string' || typeof token.createdByUserId !== 'string') {
          return null;
        }
        return {
          id: token.id,
          name: typeof token.name === 'string' && token.name.trim() ? token.name.trim() : 'Local runner',
          tokenHash: token.tokenHash,
          createdAt: typeof token.createdAt === 'string' ? token.createdAt : new Date(0).toISOString(),
          createdByUserId: token.createdByUserId,
          lastUsedAt: typeof token.lastUsedAt === 'string' ? token.lastUsedAt : null,
          revokedAt: typeof token.revokedAt === 'string' ? token.revokedAt : null,
        };
      })
      .filter((token: LocalRunnerTokenRecord | null): token is LocalRunnerTokenRecord => Boolean(token));
  }

  private localRunnerPresencesFromSettings(settings: any): ProjectLocalRunnerPresenceRecord[] {
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
      return [];
    }
    const presences = Array.isArray(settings.localRunnerPresences) ? settings.localRunnerPresences : [];
    return presences
      .filter((presence: any) => presence && typeof presence === 'object')
      .map((presence: any): ProjectLocalRunnerPresenceRecord | null => {
        if (
          typeof presence.id !== 'string' ||
          (presence.provider !== 'local-runner' && presence.provider !== 'local-codex') ||
          typeof presence.userId !== 'string' ||
          typeof presence.lastSeenAt !== 'string'
        ) {
          return null;
        }
        return {
          id: presence.id,
          provider: presence.provider,
          name:
            typeof presence.name === 'string' && presence.name.trim()
              ? presence.name.trim()
              : presence.provider === 'local-codex'
                ? 'Local Codex runner'
                : 'Local Docker runner',
          userId: presence.userId,
          tokenId: typeof presence.tokenId === 'string' ? presence.tokenId : null,
          startedAt: typeof presence.startedAt === 'string' ? presence.startedAt : presence.lastSeenAt,
          lastSeenAt: presence.lastSeenAt,
          disconnectedAt: typeof presence.disconnectedAt === 'string' ? presence.disconnectedAt : null,
          disconnectReason: typeof presence.disconnectReason === 'string' ? presence.disconnectReason : null,
          platform: typeof presence.platform === 'string' ? presence.platform : null,
          version: typeof presence.version === 'string' ? presence.version : null,
        };
      })
      .filter((presence: ProjectLocalRunnerPresenceRecord | null): presence is ProjectLocalRunnerPresenceRecord => Boolean(presence));
  }

  private sanitizeProjectLocalRunnerPresence(presence: ProjectLocalRunnerPresenceRecord, scope: 'project' | 'account' = 'project') {
    const staleAfterMs = this.localRunnerPresenceStaleMs();
    const lastSeenMs = Date.parse(presence.lastSeenAt);
    const disconnectedMs = presence.disconnectedAt ? Date.parse(presence.disconnectedAt) : 0;
    const online =
      Number.isFinite(lastSeenMs) &&
      Date.now() - lastSeenMs <= staleAfterMs &&
      (!Number.isFinite(disconnectedMs) || disconnectedMs < lastSeenMs);
    return {
      id: presence.id,
      provider: presence.provider,
      scope,
      name: presence.name,
      tokenId: presence.tokenId || null,
      startedAt: presence.startedAt,
      lastSeenAt: presence.lastSeenAt,
      disconnectedAt: presence.disconnectedAt || null,
      disconnectReason: presence.disconnectReason || null,
      platform: presence.platform || null,
      version: presence.version || null,
      online,
      staleAfterMs,
    };
  }

  private sanitizeProjectLocalRunnerPresences(settings: any) {
    const recentCutoff = Date.now() - 24 * 60 * 60 * 1000;
    return this.localRunnerPresencesFromSettings(settings)
      .filter((presence) => {
        const lastSeenMs = Date.parse(presence.lastSeenAt);
        return Number.isFinite(lastSeenMs) && lastSeenMs >= recentCutoff;
      })
      .sort((a, b) => Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt))
      .map((presence) => this.sanitizeProjectLocalRunnerPresence(presence));
  }

  private accountLocalRunnerSettingsKey(userId: string) {
    return `local-runner-account:${userId}`;
  }

  private accountLocalRunnerTokenKey(tokenId: string) {
    return `local-runner-account-token:${tokenId}`;
  }

  private accountLocalRunnerSettingsFromValue(value: any) {
    const record = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return {
      presences: this.localRunnerPresencesFromSettings({ localRunnerPresences: record.localRunnerPresences }),
    };
  }

  private async readAccountLocalRunnerSettings(userId: string) {
    const config = await this.prisma.systemConfig.findUnique({
      where: { key: this.accountLocalRunnerSettingsKey(userId) },
      select: { value: true },
    });
    return this.accountLocalRunnerSettingsFromValue(config?.value);
  }

  private async writeAccountLocalRunnerSettings(userId: string, settings: { presences: ProjectLocalRunnerPresenceRecord[] }) {
    await this.prisma.systemConfig.upsert({
      where: { key: this.accountLocalRunnerSettingsKey(userId) },
      update: {
        value: { localRunnerPresences: settings.presences },
      },
      create: {
        key: this.accountLocalRunnerSettingsKey(userId),
        value: { localRunnerPresences: settings.presences },
      },
    });
  }

  private async sanitizeAccountLocalRunnerPresences(userId: string) {
    const settings = await this.readAccountLocalRunnerSettings(userId);
    const recentCutoff = Date.now() - 24 * 60 * 60 * 1000;
    return settings.presences
      .filter((presence) => {
        const lastSeenMs = Date.parse(presence.lastSeenAt);
        return Number.isFinite(lastSeenMs) && lastSeenMs >= recentCutoff;
      })
      .sort((a, b) => Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt))
      .map((presence) => this.sanitizeProjectLocalRunnerPresence(presence, 'account'));
  }

  private fallbackProjectNameFromGoal(goal: string) {
    const cleaned = goal
      .replace(/https?:\/\/\S+/g, '')
      .replace(/[。！？!?.,，；;：:、"'“”‘’`]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleaned) {
      return this.preserveGoalDomainsInProjectName('New Agent Project', goal);
    }

    if (/[\u4e00-\u9fff]/.test(cleaned)) {
      const compact = cleaned.replace(/\s+/g, '');
      const fallbackName = compact.length > 16 ? `${compact.slice(0, 16)}项目` : compact;
      return this.preserveGoalDomainsInProjectName(fallbackName, goal);
    }

    const stopWords = new Set(['a', 'an', 'the', 'to', 'for', 'and', 'or', 'of', 'in', 'on', 'with']);
    const words = cleaned
      .split(' ')
      .filter((word) => word && !stopWords.has(word.toLowerCase()))
      .slice(0, 6)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1));

    return this.preserveGoalDomainsInProjectName(words.length ? words.join(' ') : cleaned.slice(0, 48), goal);
  }

  private extractGoalDomains(goal: string) {
    const domains = new Set<string>();
    const domainPattern = /(?:https?:\/\/)?(?:www\.)?([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+)/gi;

    for (const match of goal.matchAll(domainPattern)) {
      const domain = match[1]?.replace(/[.,;:!?]+$/g, '').toLowerCase();
      if (domain) domains.add(domain);
    }

    return [...domains];
  }

  private escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private preserveGoalDomainsInProjectName(name: string, goal: string) {
    const domains = this.extractGoalDomains(goal);
    let nextName = name.trim();

    for (const domain of domains) {
      if (nextName.toLowerCase().includes(domain)) continue;

      const [base, tld] = domain.split('.');
      if (!base || !tld) continue;

      const compactDomainPattern = `${this.escapeRegExp(base)}(?:\\s*\\.?\\s*${this.escapeRegExp(tld)})?`;
      const basePattern = new RegExp(`(^|[^a-z0-9-])${compactDomainPattern}(?=$|[^a-z0-9-])`, 'i');

      if (basePattern.test(nextName)) {
        nextName = nextName.replace(basePattern, (_match, prefix) => `${prefix}${domain}`);
      } else if (nextName) {
        nextName = `${nextName} ${domain}`;
      } else {
        nextName = domain;
      }
    }

    return nextName || 'New Agent Project';
  }

  private preserveProjectNameDomains(name: string, ...domainSources: Array<string | null | undefined>) {
    return this.preserveGoalDomainsInProjectName(name, domainSources.filter(Boolean).join(' '));
  }

  private async generateProjectDraftFromGoal(userId: string, goal: string) {
    const fallbackName = this.fallbackProjectNameFromGoal(goal);
    const fallbackSummary = goal.length > 140 ? `${goal.slice(0, 137)}...` : goal;

    try {
      const config = await this.apiConfigService.getActive(userId);
      const result = await this.llmService.chat({
        apiType: config.apiType as any,
        apiUrl: config.apiUrl,
        apiKey: config.apiKey,
        modelName: config.modelName,
        maxTokens: 180,
        messages: [
          {
            role: 'system',
            content:
              'You generate concise project metadata. Return strict JSON only: {"name":"...","summary":"..."}. The name should be short, clear, and no more than 8 words. The summary should be one sentence.',
          },
          {
            role: 'user',
            content: `Project goal:\n${goal}`,
          },
        ],
      });
      const parsed = JSON.parse(result.content);
      return {
        name:
          typeof parsed.name === 'string' && parsed.name.trim()
            ? this.preserveGoalDomainsInProjectName(parsed.name.trim(), goal).slice(0, 191)
            : fallbackName,
        summary:
          typeof parsed.summary === 'string' && parsed.summary.trim()
            ? parsed.summary.trim()
            : fallbackSummary,
      };
    } catch {
      return {
        name: fallbackName,
        summary: fallbackSummary,
      };
    }
  }

  private async getWorkspaceMembers(projectId: string) {
    const workspaceMembers = await this.agentWorkspaceClient.listMembers(projectId);
    const userIds = [...new Set(workspaceMembers.map((member) => member.userId))];
    const memberIds = workspaceMembers.map((member) => member.memberId);
    const [users, hostMembers] = await Promise.all([
      userIds.length
        ? this.prisma.user.findMany({
            where: { id: { in: userIds } },
            select: {
              id: true,
              email: true,
              displayName: true,
              role: true,
              githubLogin: true,
              avatarUrl: true,
              bio: true,
              createdAt: true,
            },
          })
        : Promise.resolve([]),
      memberIds.length
        ? this.prisma.projectMember.findMany({
            where: { id: { in: memberIds }, projectId, removedAt: null },
            select: { id: true, permissions: true },
          }).catch((error) => {
            this.logger.warn(`Falling back to workspace member permissions for ${projectId}: ${error?.message || error}`);
            return [];
          })
        : Promise.resolve([]),
    ]);

    const usersById = new Map(users.map((user) => [user.id, user]));
    const hostPermissionsByMemberId = new Map(hostMembers.map((member) => [member.id, member.permissions]));

    return workspaceMembers.map((member: WorkspaceMemberResponse) => {
      const user = usersById.get(member.userId);

      return {
        id: member.memberId,
        projectId,
        userId: member.userId,
        role: member.role,
        permissions: this.sanitizeMemberPermissions(hostPermissionsByMemberId.get(member.memberId) ?? member.permissions),
        joinedAt: member.joinedAt,
        removedAt: null,
        runtime: member.runtime ?? null,
        activeGrants: member.activeGrants ?? [],
        presence: member.presence ?? null,
        user:
          user ?? {
            id: member.userId,
            email: '',
            displayName: member.displayName ?? member.userId,
            role: 'AI_AGENT',
            githubLogin: null,
            avatarUrl: null,
            bio: null,
            createdAt: new Date(0).toISOString(),
          },
      };
    });
  }

  private readRuntimeSession(permissions: any): AgentRuntimeSession | null {
    if (!permissions || typeof permissions !== 'object' || Array.isArray(permissions)) {
      return null;
    }
    const session = permissions.runtimeSession;
    return session && typeof session === 'object'
      ? this.normalizeRuntimeSessionConversations(session as AgentRuntimeSession)
      : null;
  }

  private runtimeIdFromPermissions(permissions: any) {
    const session = this.readRuntimeSession(permissions);
    return session?.runtimeId || null;
  }

  private normalizeAgentPollingConfig(
    value?: Partial<AgentRuntimePollingConfig> | null,
    defaults: Partial<AgentRuntimePollingConfig> = {},
  ): AgentRuntimePollingConfig {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const fallback = {
      ...DEFAULT_AGENT_POLLING_CONFIG,
      ...(defaults && typeof defaults === 'object' && !Array.isArray(defaults) ? defaults : {}),
    };
    const strategy = source.strategy === 'FIXED_INTERVAL' || (!source.strategy && fallback.strategy === 'FIXED_INTERVAL')
      ? 'FIXED_INTERVAL'
      : 'IDLE_ONLY';
    const interval = Number(source.intervalMinutes ?? fallback.intervalMinutes);
    const message = typeof source.message === 'string' && source.message.trim()
      ? source.message.trim()
      : fallback.message || DEFAULT_AGENT_POLLING_CONFIG.message;

    return {
      enabled: source.enabled !== undefined ? Boolean(source.enabled) : Boolean(fallback.enabled),
      strategy,
      intervalMinutes: Math.min(24 * 60, Math.max(1, Math.floor(Number.isFinite(interval) ? interval : fallback.intervalMinutes || 60))),
      message: message.slice(0, 2000),
    };
  }

  private async agentPollingConfigForRole(role: string, value?: Partial<AgentRuntimePollingConfig> | null) {
    const roleConfig = await this.projectRoleConfigForRole(role);
    return this.normalizeAgentPollingConfig(value, roleConfig.polling);
  }

  private nextAgentPollingRunAt(config: AgentRuntimePollingConfig, from: Date = new Date()) {
    return new Date(from.getTime() + config.intervalMinutes * 60 * 1000).toISOString();
  }

  private agentPollingMessage(config: AgentRuntimePollingConfig, options: { reason?: string | null } = {}) {
    const baseMessage = String(config.message || DEFAULT_AGENT_POLLING_CONFIG.message).trim() || DEFAULT_AGENT_POLLING_CONFIG.message;
    const reason = String(options.reason || '').replace(/\s+/g, ' ').trim().slice(0, 500);
    if (!reason) return baseMessage;
    return [
      baseMessage,
      '',
      `Wake reason: ${reason}`,
      '',
      'Run a fresh lead polling frontier review. Read coordination/lead.md if present, then coordination/lead-goal-ledger.jsonl, project globals, active goals, linked work item summaries, assignment/runtime state, recent events, targeted shared files, and targeted memory before deciding whether to skip unchanged goals, create missing work/resource/review items, create aggregation/synthesis/delivery work, or mark a goal done. Process only the highest-priority changed goals that fit this tick; append ledger records after inspected goals; update coordination/lead.md before stopping.',
    ].join('\n');
  }

  private completedPollingState(
    session: AgentRuntimeSession,
    config: AgentRuntimePollingConfig,
    state: AgentRuntimePollingState,
  ): AgentRuntimePollingState {
    if (!state.lastConversationId || !state.lastRunAt) return state;
    if (session.status === 'TYPING' && session.activeConversationId === state.lastConversationId) return state;

    const lastRunAt = new Date(state.lastRunAt).getTime();
    const lastKnownCompletedAt = state.lastCompletedAt ? new Date(state.lastCompletedAt).getTime() : 0;
    const conversation = session.conversations?.find((item) => item.id === state.lastConversationId);
    const lastConversationMessageAt = [...(conversation?.messageHistory || [])]
      .reverse()
      .find((message) => message.role !== 'user' && message.createdAt)?.createdAt;
    const candidates = [lastConversationMessageAt]
      .map((value) => (value ? new Date(value).getTime() : 0))
      .filter((value) => Number.isFinite(value) && value > lastRunAt);
    const completedAt = candidates.length ? Math.max(...candidates) : 0;
    if (!completedAt || completedAt <= lastKnownCompletedAt) return state;

    const completedDate = new Date(completedAt);
    return {
      ...state,
      lastCompletedAt: completedDate.toISOString(),
      nextRunAt: this.nextAgentPollingRunAt(config, completedDate),
      lastError: null,
    };
  }

  private runtimeHasOngoingConversation(session: AgentRuntimeSession): boolean {
    if (session.status === 'TYPING') return true;
    const status = String(session.status || '').toUpperCase();
    if (
      (session.activeRequestId || session.activeRequestConversationId) &&
      !['IDLE', 'READY', 'STOPPED', 'ERROR', 'WAITING_CONFIRMATION'].includes(status)
    ) {
      return true;
    }

    if (['IDLE', 'READY', 'STOPPED', 'ERROR', 'WAITING_CONFIRMATION'].includes(status)) {
      return false;
    }
    return (session.conversations || []).some((conversation) =>
      (conversation.messageHistory || []).some((message) => message.role === 'assistant' && message.status === 'TYPING'),
    );
  }

  private runtimeHasStreamingResponse(session: AgentRuntimeSession): boolean {
    return session.status === 'TYPING';
  }

  private readAgentPollingConfig(permissions: any): Partial<AgentRuntimePollingConfig> | null {
    if (!permissions || typeof permissions !== 'object' || Array.isArray(permissions)) return null;
    const config = permissions.agentPollingConfig;
    return config && typeof config === 'object' && !Array.isArray(config) ? config : null;
  }

  private sanitizeMemberPermissions(permissions: any) {
    if (!permissions || typeof permissions !== 'object' || Array.isArray(permissions)) {
      return permissions ?? null;
    }
    const session = this.readRuntimeSession(permissions);
    return {
      ...permissions,
      ...(session ? { runtimeSession: this.sanitizeRuntimeSession(session) } : {}),
    };
  }

  private sanitizeRuntimeSession(session: AgentRuntimeSession): any {
    const { apiKey, workspaceToken, localRunnerJob, localRunnerBridge, ...safe } =
      this.normalizeRuntimeSessionConversations(session);
    return {
      ...safe,
      projectSkillOverrides: (safe.projectSkillOverrides || []).map((override) => ({
        ref: override.ref,
        name: override.name,
        storagePath: override.storagePath ?? null,
        updatedAt: override.updatedAt ?? null,
        updatedById: override.updatedById ?? null,
        files: (override.files || []).map((file) => ({ path: file.path, size: file.content?.length || 0 })),
      })),
    };
  }

  private agentRuntimeStreamKey(projectId: string, memberId: string) {
    return `${projectId}:${memberId}`;
  }

  private publishAgentRuntimeSessionEvent(
    projectId: string,
    memberId: string,
    event: Omit<AgentRuntimeSessionStreamEvent, 'projectId' | 'memberId' | 'at'> & { at?: string },
  ) {
    const listeners = this.agentRuntimeStreamListeners.get(this.agentRuntimeStreamKey(projectId, memberId));
    if (!listeners?.size) return;
    const payload: AgentRuntimeSessionStreamEvent = {
      ...event,
      projectId,
      memberId,
      at: event.at || new Date().toISOString(),
    };
    for (const listener of [...listeners]) {
      try {
        listener(payload);
      } catch (error: any) {
        this.logger.warn(`Agent runtime stream listener failed: ${error?.message || error}`);
      }
    }
  }

  async subscribeAgentRuntimeSessionEvents(
    projectId: string,
    memberId: string,
    userId: string,
    listener: AgentRuntimeSessionStreamListener,
  ) {
    await this.ensureProjectAccess(projectId, userId);
    const member = await this.prisma.projectMember.findFirst({
      where: { id: memberId, projectId, removedAt: null },
      select: { id: true, role: true, permissions: true },
    });
    if (!member) throw new NotFoundException('Project member not found');
    const rawSession = this.readRuntimeSession(member.permissions);
    const session = rawSession ? this.recoverPersistedRuntimeSession(rawSession) : null;
    if (!session) {
      throw new BadRequestException('This member does not have a launched runtime');
    }
    if (rawSession !== session) {
      await this.writeRuntimeSession(member.id, session);
    }

    const key = this.agentRuntimeStreamKey(projectId, memberId);
    let listeners = this.agentRuntimeStreamListeners.get(key);
    if (!listeners) {
      listeners = new Set<AgentRuntimeSessionStreamListener>();
      this.agentRuntimeStreamListeners.set(key, listeners);
    }
    listeners.add(listener);

    return {
      snapshot: {
        type: 'snapshot' as const,
        projectId,
        memberId: member.id,
        role: member.role,
        session: this.sanitizeRuntimeSession(session),
        at: new Date().toISOString(),
      },
      close: () => {
        const current = this.agentRuntimeStreamListeners.get(key);
        if (!current) return;
        current.delete(listener);
        if (!current.size) {
          this.agentRuntimeStreamListeners.delete(key);
        }
      },
    };
  }

  private runtimeConversationTitle(messages: AgentRuntimeMessage[], fallback = 'New conversation') {
    const message = messages.find((entry) => entry.role === 'user' && entry.content?.trim());
    const firstLine = message?.content?.trim().split('\n')[0].replace(/\s+/g, ' ');
    return firstLine ? Array.from(firstLine).slice(0, 10).join('') : fallback;
  }

  private runtimeConversationUpdatedAt(
    messages: AgentRuntimeMessage[],
    fallback?: string | null,
  ) {
    return [...messages].reverse().find((entry) => entry.createdAt)?.createdAt || fallback || new Date().toISOString();
  }

  private normalizeRuntimeSessionConversations(session: AgentRuntimeSession): AgentRuntimeSession {
    const messageHistory = Array.isArray(session.messageHistory) ? session.messageHistory : [];
    const rawConversations = Array.isArray(session.conversations) ? session.conversations : [];
    const defaultId = session.activeConversationId || rawConversations[0]?.id || `default-${session.runtimeId}`;
    let conversations: AgentRuntimeConversation[] = rawConversations
      .filter((conversation) => conversation && typeof conversation.id === 'string')
      .map((conversation) => ({
        id: conversation.id,
        title: conversation.title || this.runtimeConversationTitle(conversation.messageHistory || [], 'Conversation'),
        titleLocked: Boolean(conversation.titleLocked),
        createdAt: conversation.createdAt || session.launchedAt || new Date().toISOString(),
        updatedAt: conversation.updatedAt || session.updatedAt || session.launchedAt || new Date().toISOString(),
        messageHistory: Array.isArray(conversation.messageHistory) ? conversation.messageHistory : [],
      }));

    if (!conversations.length) {
      conversations = [
        {
          id: defaultId,
          title: this.runtimeConversationTitle(messageHistory, 'Current session'),
          titleLocked: false,
          createdAt: session.launchedAt || new Date().toISOString(),
          updatedAt: this.runtimeConversationUpdatedAt(messageHistory, session.updatedAt),
          messageHistory,
        },
      ];
    }

    const activeConversationId =
      session.activeConversationId && conversations.some((conversation) => conversation.id === session.activeConversationId)
        ? session.activeConversationId
        : conversations[0].id;
    const activeIndex = conversations.findIndex((conversation) => conversation.id === activeConversationId);
    conversations[activeIndex] = {
      ...conversations[activeIndex],
      title: conversations[activeIndex].titleLocked
        ? conversations[activeIndex].title
        : this.runtimeConversationTitle(messageHistory, conversations[activeIndex].title),
      updatedAt: this.runtimeConversationUpdatedAt(messageHistory, session.updatedAt),
      messageHistory,
    };

    return {
      ...session,
      activeConversationId,
      conversations,
      messageHistory: conversations[activeIndex].messageHistory,
    };
  }

  private selectRuntimeConversation(session: AgentRuntimeSession, conversationId?: string | null) {
    const normalized = this.normalizeRuntimeSessionConversations(session);
    if (!conversationId) return normalized;
    const conversation = normalized.conversations?.find((item) => item.id === conversationId);
    if (!conversation) {
      throw new BadRequestException('Conversation session not found for this agent');
    }
    return {
      ...normalized,
      activeConversationId: conversation.id,
      messageHistory: conversation.messageHistory || [],
    };
  }

  private async writeRuntimeSession(memberId: string, session: AgentRuntimeSession) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM project_members WHERE id = ${memberId} FOR UPDATE`;
      const member = await tx.projectMember.findUnique({
        where: { id: memberId },
        select: { permissions: true },
      });
      const existing =
        member?.permissions && typeof member.permissions === 'object' && !Array.isArray(member.permissions)
          ? member.permissions
          : {};
      const existingSession = this.readRuntimeSession(existing);
      const normalizedSession = this.preserveQueuedLocalRuntimeBridge(
        this.normalizeRuntimeSessionConversations(session),
        existingSession,
      );

      return tx.projectMember.update({
        where: { id: memberId },
        data: {
          permissions: {
            ...(existing as Record<string, any>),
            runtimeSession: normalizedSession,
          },
        },
      });
    });
  }

  private preserveQueuedLocalRuntimeBridge(
    nextSession: AgentRuntimeSession,
    existingSession: AgentRuntimeSession | null,
  ): AgentRuntimeSession {
    if (
      !existingSession ||
      !this.isQueuedLocalRuntimeProvider(nextSession.provider) ||
      existingSession.provider !== nextSession.provider ||
      existingSession.runtimeId !== nextSession.runtimeId
    ) {
      return nextSession;
    }

    const activeRequestId = nextSession.activeRequestId || existingSession.activeRequestId;
    if (!activeRequestId) return nextSession;
    if (nextSession.localRunnerBridge?.requests?.some((request) => request.id === activeRequestId)) {
      return nextSession;
    }

    const activeBridgeRequest = existingSession.localRunnerBridge?.requests?.find((request) => request.id === activeRequestId);
    const hasActiveBridgeRequest =
      activeBridgeRequest && ['PENDING', 'RUNNING', 'COMPLETED', 'ERROR'].includes(activeBridgeRequest.status);
    const hasUnqueuedActiveRequest =
      !hasActiveBridgeRequest &&
      existingSession.status === 'TYPING' &&
      existingSession.activeRequestId === activeRequestId &&
      !nextSession.activeRequestId;
    if (!hasActiveBridgeRequest && !hasUnqueuedActiveRequest) {
      return nextSession;
    }

    const intentionallyCleared =
      !nextSession.activeRequestId &&
      ['IDLE', 'ERROR', 'WAITING_CONFIRMATION'].includes(nextSession.status || '') &&
      Boolean(nextSession.lastResponseAt || nextSession.lastError);
    if (intentionallyCleared) {
      return nextSession;
    }

    return {
      ...nextSession,
      status: existingSession.status,
      activeRequestId: existingSession.activeRequestId,
      activeRequestStartedAt: existingSession.activeRequestStartedAt,
      activeRequestConversationId: existingSession.activeRequestConversationId,
      lastMessageAt: existingSession.lastMessageAt,
      lastStreamAt: existingSession.lastStreamAt,
      currentActivity: existingSession.currentActivity,
      localRunnerBridge: existingSession.localRunnerBridge,
    };
  }

  private async latestRuntimeSessionForMember(memberId: string) {
    const member = await this.prisma.projectMember.findUnique({
      where: { id: memberId },
      select: { permissions: true },
    });
    return this.readRuntimeSession(member?.permissions);
  }

  private async ensureLaunchableMember(projectId: string, memberId: string, role: string) {
    const member = await this.prisma.projectMember.findFirst({
      where: { id: memberId, projectId, removedAt: null },
      select: {
        id: true,
        userId: true,
        role: true,
        permissions: true,
        user: { select: { displayName: true, email: true } },
      },
    });
    if (!member) throw new NotFoundException('Project member not found');
    if (member.role !== role) {
      throw new BadRequestException('Selected member role does not match launch role');
    }
    return member;
  }

  private async findPendingLaunchAgentMember(projectId: string, role: string) {
    const members = await this.prisma.projectMember.findMany({
      where: { projectId, role, removedAt: null },
      select: {
        id: true,
        userId: true,
        role: true,
        permissions: true,
        user: { select: { displayName: true, email: true } },
      },
      orderBy: { joinedAt: 'asc' },
    });
    return members.find((member) => !this.readRuntimeSession(member.permissions)) || null;
  }

  private async assignProjectAgentRoleName(
    projectId: string,
    role: string,
    fallbackName: string,
    prisma: PrismaService | Prisma.TransactionClient = this.prisma,
  ): Promise<ProjectAgentRoleName> {
    const existingMembers = await prisma.projectMember.findMany({
      where: { projectId },
      select: {
        permissions: true,
        user: { select: { displayName: true, email: true } },
      },
    });
    const existingNames = new Set(
      existingMembers
        .flatMap((member) => [
          member.user?.displayName,
          member.user?.email?.split('@')[0],
          this.readProjectAgentRoleName(member.permissions)?.displayName,
        ])
        .filter((name): name is string => typeof name === 'string' && Boolean(name.trim()))
        .map((name) => name.trim().toLowerCase()),
    );
    const chooseUnused = (candidates: string[]) =>
      candidates.find((name) => !existingNames.has(name.trim().toLowerCase()));
    const roleCandidates = ROLE_NAME_CANDIDATES[role] || [];
    const preferGeneral = Math.random() < 0.5 || roleCandidates.length === 0;
    const firstPool = preferGeneral ? GENERAL_AGENT_NAMES : roleCandidates;
    const secondPool = preferGeneral ? roleCandidates : GENERAL_AGENT_NAMES;
    const firstChoice = chooseUnused(firstPool);
    const secondChoice = firstChoice ? undefined : chooseUnused(secondPool);
    const displayName = firstChoice || secondChoice || `${fallbackName} ${existingNames.size + 1}`;
    const source = roleCandidates.includes(displayName)
      ? 'role-famous'
      : GENERAL_AGENT_NAMES.includes(displayName)
        ? 'general'
        : 'fallback';

    return {
      displayName,
      source,
      role,
      assignedAt: new Date().toISOString(),
      ...(source === 'role-famous' ? { candidatesKey: role } : {}),
    };
  }

  private readProjectAgentRoleName(permissions: any): ProjectAgentRoleName | null {
    const value = permissions?.agentRoleName;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const displayName = typeof value.displayName === 'string' ? value.displayName.trim() : '';
    const source = value.source === 'general' || value.source === 'role-famous' || value.source === 'fallback'
      ? value.source
      : 'fallback';
    const role = typeof value.role === 'string' ? value.role : '';
    if (!displayName) return null;
    return {
      displayName,
      source,
      role,
      assignedAt: typeof value.assignedAt === 'string' ? value.assignedAt : '',
      ...(typeof value.candidatesKey === 'string' ? { candidatesKey: value.candidatesKey } : {}),
    };
  }

  private async findOrCreateAgentMember(projectId: string, role: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { settings: true },
    });
    await this.ensureProjectActiveAgentCapacity(projectId, project?.settings);
    const roleConfig = await this.projectRoleConfigForRole(role, project?.settings);
    const resolvedCapabilities = await this.resolveRoleCapabilityBundles(role, roleConfig);
    const instanceId = randomBytes(4).toString('hex');
    const email = `agent+${projectId.slice(0, 12)}+${role.toLowerCase()}+${instanceId}@aifactory.local`;
    const passwordHash = await bcrypt.hash(randomBytes(24).toString('hex'), 10);

    const member = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM projects WHERE id = ${projectId} FOR UPDATE`;
      const agentRoleName = await this.assignProjectAgentRoleName(projectId, role, roleConfig.label || role, tx);
      const user = await tx.user.create({
        data: {
          email,
          displayName: agentRoleName.displayName,
          role: 'AI_AGENT',
          passwordHash,
        },
        select: { id: true },
      });

      const createdMember = await tx.projectMember.create({
        data: {
          projectId,
          userId: user.id,
          role,
          permissions: {
            source: 'auto-launched-runtime',
            instanceId,
            agentRoleName,
            skillBundleRefs: resolvedCapabilities.skillBundleRefs,
            capabilityBundleRefs: resolvedCapabilities.refs,
            ...(roleConfig.polling
              ? { agentPollingConfig: this.normalizeAgentPollingConfig(roleConfig.polling, roleConfig.polling) }
              : {}),
          },
        },
        select: { id: true, userId: true, role: true, permissions: true },
      });

      if (role === 'LEAD_AGENT') {
        await tx.project.update({
          where: { id: projectId },
          data: { leadAgentUserId: user.id },
        });
      }

      return createdMember;
    });

    return member;
  }

  private async ensureTemplateAutoMembers(projectId: string, ownerUserId: string, roles: ProjectTemplateRoleEntry[]) {
    const autoRoles = roles.filter((entry) => entry.auto === 'ON_CREATE' && entry.role && entry.role !== 'OWNER');
    for (const entry of autoRoles) {
      const existing = await this.prisma.projectMember.findFirst({
        where: { projectId, role: entry.role, removedAt: null },
        select: { id: true },
      });
      if (existing) continue;

      const roleConfig = this.roleConfigFromTemplateEntry(entry) || (await this.projectRoleConfigForRole(entry.role, {
        projectTemplateRoles: roles,
      }));
      const resolvedCapabilities = await this.resolveRoleCapabilityBundles(entry.role, roleConfig);
      const agentRoleName = await this.assignProjectAgentRoleName(projectId, entry.role, roleConfig.label || entry.label || entry.role);
      const instanceId = randomBytes(4).toString('hex');
      const email = `agent+${projectId.slice(0, 12)}+${entry.role.toLowerCase()}+${instanceId}@aifactory.local`;
      const user = await this.prisma.user.create({
        data: {
          email,
          displayName: agentRoleName.displayName,
          role: 'AI_AGENT',
          passwordHash: await bcrypt.hash(randomBytes(24).toString('hex'), 10),
        },
        select: { id: true },
      });

      await this.prisma.projectMember.create({
        data: {
          projectId,
          userId: user.id,
          role: entry.role,
          permissions: {
            source: 'project-template',
            templateAuto: entry.auto,
            instanceId,
            agentRoleName,
            createdByUserId: ownerUserId,
            skillBundleRefs: resolvedCapabilities.skillBundleRefs,
            capabilityBundleRefs: resolvedCapabilities.refs,
            ...(roleConfig.polling
              ? { agentPollingConfig: this.normalizeAgentPollingConfig(roleConfig.polling, roleConfig.polling) }
              : {}),
          },
        },
      });

      if (entry.role === 'LEAD_AGENT') {
        await this.prisma.project.update({
          where: { id: projectId },
          data: { leadAgentUserId: user.id },
        });
      }
    }
  }

  private async launchTemplateAutoRuntimes(
    projectId: string,
    ownerUserId: string,
    roles: ProjectTemplateRoleEntry[],
    settings?: any,
  ) {
    const roleDefaults = this.projectRoleAgentDefaultsFromSettings(settings);
    const autoRoles = roles.filter((entry) => entry.auto === 'ON_CREATE' && entry.role && entry.role !== 'OWNER');
    for (const entry of autoRoles) {
      const role = entry.role.trim();
      const defaults = roleDefaults[role];
      if (!defaults) continue;
      const member = await this.prisma.projectMember.findFirst({
        where: { projectId, role, removedAt: null },
        select: { id: true, permissions: true },
      });
      if (!member || this.readRuntimeSession(member.permissions)) continue;
      const launchMode = this.effectiveAgentRuntimeLaunchMode(defaults.launchMode) || this.defaultAgentRuntimeLaunchMode();
      const agentType = typeof defaults.agentType === 'string' && defaults.agentType.trim()
        ? defaults.agentType.trim()
        : this.defaultAgentRuntimeType();
      const llmConfigCandidates = this.canLaunchWithoutModelConfig(launchMode, agentType)
        ? []
        : await this.ownerVisibleLlmConfigCandidates(ownerUserId, []);
      const llmConfigId = llmConfigCandidates[0]?.id || undefined;
      await this.launchAgentRuntime(projectId, ownerUserId, {
        role,
        launchMode,
        agentType,
        ...(llmConfigId ? { llmConfigId } : {}),
        deploymentDays: defaults.deploymentDays,
        image: typeof defaults.image === 'string' ? defaults.image : undefined,
        model: typeof defaults.model === 'string' ? defaults.model : undefined,
        enableSudo: Boolean(defaults.enableSudo),
        launcherUserId: ownerUserId,
        launchSource: 'template-auto',
      }).catch((error: any) => {
        this.logger.warn(`Template auto runtime launch skipped for ${projectId}/${role}: ${error?.message || error}`);
      });
    }
  }

  private templateRolesFromSettings(settings?: any): ProjectTemplateRoleEntry[] {
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return [];
    const roles = Array.isArray(settings.projectTemplateRoles) ? settings.projectTemplateRoles : [];
    return roles.filter((entry: any) => entry && typeof entry.role === 'string' && entry.role.trim());
  }

  private async projectTemplateRolesForSettings(settings?: any): Promise<ProjectTemplateRoleEntry[]> {
    const storedRoles = this.templateRolesFromSettings(settings);
    if (storedRoles.length) return storedRoles;
    const templateId =
      settings && typeof settings === 'object' && !Array.isArray(settings) && typeof settings.projectTemplateId === 'string'
        ? settings.projectTemplateId
        : undefined;
    try {
      const template = await this.projectTemplatesService.getTemplate(templateId);
      return template.roles || [];
    } catch {
      return [];
    }
  }

  private projectRolePromptOverridesFromSettings(settings?: any): Record<string, ProjectRolePromptOverride> {
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return {};
    const raw = settings.projectRoleOverrides;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    return Object.entries(raw).reduce((acc, [role, value]) => {
      if (!role || !value || typeof value !== 'object' || Array.isArray(value)) return acc;
      const initialPrompt = (value as ProjectRolePromptOverride).initialPrompt;
      acc[role] = {
        ...(typeof initialPrompt === 'string' ? { initialPrompt } : {}),
        ...(typeof (value as ProjectRolePromptOverride).updatedAt === 'string'
          ? { updatedAt: (value as ProjectRolePromptOverride).updatedAt }
          : {}),
        ...(typeof (value as ProjectRolePromptOverride).updatedById === 'string'
          ? { updatedById: (value as ProjectRolePromptOverride).updatedById }
          : {}),
      };
      return acc;
    }, {} as Record<string, ProjectRolePromptOverride>);
  }

  private projectRoleSkillOverridesFromSettings(settings?: any): Record<string, ProjectRoleSkillOverride> {
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return {};
    const raw = settings.projectRoleSkillOverrides;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    return Object.entries(raw).reduce((acc, [role, value]) => {
      if (!role || !value || typeof value !== 'object' || Array.isArray(value)) return acc;
      const override = value as ProjectRoleSkillOverride;
      const skills =
        override.skills && typeof override.skills === 'object' && !Array.isArray(override.skills)
          ? Object.entries(override.skills).reduce((skillAcc, [ref, skillValue]) => {
              if (!ref || !skillValue || typeof skillValue !== 'object' || Array.isArray(skillValue)) return skillAcc;
              skillAcc[ref] = {
                ...(typeof skillValue.name === 'string' ? { name: skillValue.name } : {}),
                ...(typeof skillValue.storagePath === 'string' ? { storagePath: skillValue.storagePath } : {}),
                ...(typeof skillValue.updatedAt === 'string' ? { updatedAt: skillValue.updatedAt } : {}),
                ...(typeof skillValue.updatedById === 'string' ? { updatedById: skillValue.updatedById } : {}),
              };
              return skillAcc;
            }, {} as NonNullable<ProjectRoleSkillOverride['skills']>)
          : undefined;
      acc[role] = {
        ...(Array.isArray(override.skillBundleRefs) ? { skillBundleRefs: this.cleanStringList(override.skillBundleRefs) } : {}),
        ...(skills && Object.keys(skills).length ? { skills } : {}),
        ...(typeof override.updatedAt === 'string' ? { updatedAt: override.updatedAt } : {}),
        ...(typeof override.updatedById === 'string' ? { updatedById: override.updatedById } : {}),
      };
      return acc;
    }, {} as Record<string, ProjectRoleSkillOverride>);
  }

  private applyProjectRolePromptOverride(role: string, config: ProjectRoleConfig, settings?: any): ProjectRoleConfig {
    const override = this.projectRolePromptOverridesFromSettings(settings)[role];
    if (!override || typeof override.initialPrompt !== 'string') return config;
    return {
      ...config,
      initialPrompt: override.initialPrompt,
    };
  }

  private applyProjectRoleSkillOverride(role: string, config: ProjectRoleConfig, settings?: any): ProjectRoleConfig {
    const override = this.projectRoleSkillOverridesFromSettings(settings)[role];
    if (!override) return config;
    const skillBundleRefs = this.normalizeProjectRoleSkillRefs(override.skillBundleRefs, config.skillBundleRefs);
    const existingSkills = new Map((config.skills || []).map((skill) => [skill.ref, skill]));
    const overrideSkills = override.skills || {};
    const skills = skillBundleRefs.map((ref) => {
      const existing = existingSkills.get(ref);
      const overrideSkill = overrideSkills[ref];
      return {
        ref,
        name: overrideSkill?.name || existing?.name || this.skillNameFromRef(ref),
        source: overrideSkill ? 'project' as const : existing?.source || (ref.startsWith('role-skill://') ? 'role' as const : 'external' as const),
        path: overrideSkill?.storagePath || existing?.path,
        description: overrideSkill?.storagePath
          ? `Project override stored at ${overrideSkill.storagePath}.`
          : existing?.description || 'Injected into this runtime at launch.',
      };
    });
    return {
      ...config,
      skillBundleRefs,
      skills,
    };
  }

  private applyProjectRoleOverrides(role: string, config: ProjectRoleConfig, settings?: any): ProjectRoleConfig {
    return this.applyProjectRoleSkillOverride(role, this.applyProjectRolePromptOverride(role, config, settings), settings);
  }

  private roleSlugForTemplateEntry(role: string, entry?: ProjectTemplateRoleEntry | null) {
    if (entry?.ref?.startsWith('role://')) {
      return entry.ref.replace(/^role:\/\//, '').trim();
    }
    return role.toLowerCase().replace(/_/g, '-');
  }

  private cleanStringList(value: any) {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map((item) => item.trim())
      : [];
  }

  private uniqueStringList(...lists: Array<string[] | undefined | null>) {
    return [...new Set(lists.flatMap((list) => list || []).filter((item) => typeof item === 'string' && Boolean(item.trim())).map((item) => item.trim()))];
  }

  private capabilityBundlesPath() {
    const configured = this.configService.get<string>('AGENT_WORKSPACE_CAPABILITY_BUNDLES_PATH');
    if (configured) return resolve(configured);
    const candidates = [
      '/agent-workspace/capability-bundles',
      resolve(process.cwd(), 'agent-workspace-bundle', 'capability-bundles'),
      resolve(process.cwd(), '..', 'agent-workspace', 'capability-bundles'),
    ];
    return candidates.find((path) => existsSync(path)) || candidates[candidates.length - 1];
  }

  private capabilityBundleFilenameFromRef(ref: string) {
    return `${ref.replace(/^capability:\/\//, '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')}.json`;
  }

  private capabilityBundleSurfacesFromList(value: any) {
    const surfaces = { skills: [] as string[], tools: [] as string[], mcpServers: [] as string[], hooks: [] as string[] };
    for (const item of this.cleanStringList(value)) {
      if (item.startsWith('skill://') || item.startsWith('role-skill://') || item.startsWith('template-role-skill://')) {
        surfaces.skills.push(item);
      } else if (item.startsWith('mcp://')) {
        surfaces.mcpServers.push(item);
      } else if (item.startsWith('hook://')) {
        surfaces.hooks.push(item);
      } else {
        surfaces.tools.push(item);
      }
    }
    return surfaces;
  }

  private normalizeCapabilityBundleSurfaces(value: any) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { skills: [] as string[], tools: [] as string[], mcpServers: [] as string[], hooks: [] as string[] };
    }
    return {
      skills: this.cleanStringList(value.skills),
      tools: this.cleanStringList(value.tools),
      mcpServers: this.cleanStringList(value.mcpServers),
      hooks: this.cleanStringList(value.hooks),
    };
  }

  private normalizeCapabilityBundleManifest(
    value: any,
    fallbackRef: string,
    source: string,
  ): AgentRuntimeCapabilityBundle | null {
    const ref = typeof value?.ref === 'string' && value.ref.trim() ? value.ref.trim() : fallbackRef.trim();
    if (!ref) return null;
    const name = typeof value?.name === 'string' && value.name.trim() ? value.name.trim() : undefined;
    const version = typeof value?.version === 'string' && value.version.trim() ? value.version.trim() : '0.1';
    const description =
      typeof value?.description === 'string' && value.description.trim() ? value.description.trim() : undefined;
    const runtimeCompatibility =
      value?.runtimeCompatibility && typeof value.runtimeCompatibility === 'object' && !Array.isArray(value.runtimeCompatibility)
        ? value.runtimeCompatibility
        : undefined;
    const shareContext =
      value?.shareContext && typeof value.shareContext === 'object' && !Array.isArray(value.shareContext)
        ? value.shareContext
        : undefined;
    const manifest: AgentRuntimeCapabilityBundle = {
      ref,
      surfaces: this.normalizeCapabilityBundleSurfaces(value?.surfaces),
      requiredScopes: this.cleanStringList(value?.requiredScopes),
      requiredProjectGlobals: this.cleanStringList(value?.requiredProjectGlobals),
      source,
    };
    if (name) manifest.name = name;
    if (version) manifest.version = version;
    if (description) manifest.description = description;
    if (runtimeCompatibility) manifest.runtimeCompatibility = runtimeCompatibility;
    if (shareContext) manifest.shareContext = shareContext;
    return manifest;
  }

  private async readCapabilityBundleManifest(ref: string) {
    const file = resolve(this.capabilityBundlesPath(), this.capabilityBundleFilenameFromRef(ref));
    try {
      const parsed = JSON.parse(await readFile(file, 'utf8'));
      return this.normalizeCapabilityBundleManifest(parsed, ref, 'file');
    } catch {
      return null;
    }
  }

  private templateCapabilityBundleManifest(bundle: ProjectTemplateCapabilityBundleRef) {
    return this.normalizeCapabilityBundleManifest(
      {
        ref: bundle.ref,
        name: bundle.ref.replace(/^capability:\/\//, ''),
        description: bundle.purpose || null,
        surfaces: this.capabilityBundleSurfacesFromList(bundle.surfaces),
        requiredScopes: bundle.requiredScopes || [],
        requiredProjectGlobals: bundle.requiredProjectGlobals || [],
        runtimeCompatibility: bundle.runtimeCompatibility || null,
      },
      bundle.ref,
      'template',
    );
  }

  private synthesizedCapabilityBundleManifest(ref: string, role: string, roleConfig: ProjectRoleConfig) {
    const roleSlug = role.toLowerCase().replace(/_/g, '-');
    if (ref === 'capability://agent-workspace/core') {
      return this.normalizeCapabilityBundleManifest(
        {
          ref,
          name: 'agent-workspace core',
          description: 'Common project runtime entry and grant-scoped workspace API access.',
          surfaces: { skills: ['skill://agent-workspace'] },
          requiredScopes: this.commonRuntimeScopes(),
          runtimeCompatibility: roleConfig.runtimeCompatibility || this.projectRoleConfigForRoleSync(role).runtimeCompatibility,
        },
        ref,
        'synthesized',
      );
    }
    if (ref === `capability://agent-workspace/role/${roleSlug}`) {
      return this.normalizeCapabilityBundleManifest(
        {
          ref,
          name: `${roleSlug} role capability`,
          description: roleConfig.description || `${role} role-specific project collaboration capability.`,
          surfaces: { skills: roleConfig.skillBundleRefs || [] },
          requiredScopes: roleConfig.scopes || [],
          runtimeCompatibility: roleConfig.runtimeCompatibility || this.projectRoleConfigForRoleSync(role).runtimeCompatibility,
        },
        ref,
        'synthesized',
      );
    }
    return this.normalizeCapabilityBundleManifest({ ref }, ref, 'ref');
  }

  private async resolveRoleCapabilityBundles(
    role: string,
    roleConfig: ProjectRoleConfig,
  ): Promise<ResolvedRoleCapabilityBundles> {
    const refs = this.capabilityBundleRefsForConfig(roleConfig);
    const templateManifests = new Map(
      (roleConfig.capabilityBundles || [])
        .map((bundle) => this.templateCapabilityBundleManifest(bundle))
        .filter((bundle): bundle is AgentRuntimeCapabilityBundle => Boolean(bundle))
        .map((bundle) => [bundle.ref, bundle]),
    );
    const manifests: AgentRuntimeCapabilityBundle[] = [];
    for (const ref of refs) {
      const manifest =
        templateManifests.get(ref) ||
        (await this.readCapabilityBundleManifest(ref)) ||
        this.synthesizedCapabilityBundleManifest(ref, role, roleConfig);
      if (manifest && !manifests.some((item) => item.ref === manifest.ref)) {
        manifests.push(manifest);
      }
    }

    return {
      refs: this.uniqueStringList(refs, manifests.map((manifest) => manifest.ref)),
      manifests,
      skillBundleRefs: this.uniqueStringList(
        roleConfig.skillBundleRefs,
        manifests.flatMap((manifest) => manifest.surfaces?.skills || []),
      ),
      requiredScopes: this.uniqueStringList(manifests.flatMap((manifest) => manifest.requiredScopes || [])),
      requiredProjectGlobals: this.uniqueStringList(
        manifests.flatMap((manifest) => manifest.requiredProjectGlobals || []),
      ),
    };
  }

  private async installResolvedCapabilityBundles(
    projectId: string,
    manifests: AgentRuntimeCapabilityBundle[],
    installedByMemberId?: string | null,
  ) {
    const unique = new Map(manifests.filter((manifest) => manifest.ref).map((manifest) => [manifest.ref, manifest]));
    for (const manifest of unique.values()) {
      await this.agentWorkspaceClient.installCapabilityBundle(projectId, {
        manifest,
        discoverability: 'PROJECT_VISIBLE',
        shareTargets: [],
        status: 'ACTIVE',
        ...(installedByMemberId ? { installedByMemberId } : {}),
      });
    }
  }

  private async syncProjectCapabilityBundles(projectId: string, settings?: any) {
    const templateRoles = await this.projectTemplateRolesForSettings(settings);
    const roles = templateRoles.length
      ? templateRoles.map((entry) => entry.role).filter(Boolean)
      : ['OWNER', 'LEAD_AGENT', ...LAUNCHABLE_PROJECT_AGENT_ROLES];
    const manifests: AgentRuntimeCapabilityBundle[] = [];
    for (const role of [...new Set(roles)]) {
      const roleConfig = await this.projectRoleConfigForRole(role, settings);
      const resolved = await this.resolveRoleCapabilityBundles(role, roleConfig);
      manifests.push(...resolved.manifests);
    }
    await this.installResolvedCapabilityBundles(projectId, manifests);
  }

  private skillNameFromRef(ref: string) {
    const trimmed = String(ref || '').trim();
    if (trimmed.startsWith('template-role-skill://')) {
      return trimmed.replace(/^template-role-skill:\/\//, '').split('/').filter(Boolean).pop() || '';
    }
    if (trimmed.startsWith('template-skill://')) {
      return trimmed.replace(/^template-skill:\/\//, '').split('/').filter(Boolean).pop() || '';
    }
    return trimmed.replace(/^(skill|role-skill):\/\//, '').split('/').filter(Boolean).pop() || trimmed;
  }

  private safeStorageSegment(value: string) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      || 'skill';
  }

  private normalizeProjectRoleSkillRefs(value: any, fallback: string[] = []) {
    const refs = this.cleanStringList(value).length ? this.cleanStringList(value) : this.cleanStringList(fallback);
    const unique = refs.filter((ref, index) => refs.indexOf(ref) === index).slice(0, 50);
    if (!unique.includes('skill://agent-workspace')) {
      unique.unshift('skill://agent-workspace');
    }
    return unique;
  }

  private projectRoleSkillStoragePath(role: string, ref: string, filePath = 'SKILL.md') {
    return [
      '.agentcraft',
      'role-skills',
      this.safeStorageSegment(role),
      this.safeStorageSegment(this.skillNameFromRef(ref)),
      filePath.replace(/\\/g, '/').replace(/^\/+/, ''),
    ].join('/');
  }

  private capabilityBundleRefsForConfig(config: ProjectRoleConfig) {
    const direct = this.cleanStringList(config.capabilityBundleRefs);
    const fromBundles = Array.isArray(config.capabilityBundles)
      ? config.capabilityBundles.map((bundle) => bundle?.ref).filter((ref): ref is string => typeof ref === 'string' && Boolean(ref.trim()))
      : [];
    const refs = this.uniqueStringList(direct, fromBundles);
    return refs.length ? refs : this.cleanStringList(config.skillBundleRefs);
  }

  private runtimeCapabilityWarnings(
    roleConfig: ProjectRoleConfig,
    featureSupport: ReturnType<AgentRuntimeLauncherService['runtimeFeatureSupport']>,
    resolvedCapabilities?: ResolvedRoleCapabilityBundles,
  ) {
    const warnings: string[] = [];
    const supported = new Set(featureSupport.supportedFeatures);
    const policies = [
      roleConfig.runtimeCompatibility,
      ...(resolvedCapabilities?.manifests || []).map((manifest) => manifest.runtimeCompatibility),
    ].filter((policy): policy is ProjectTemplateRuntimeCompatibility => Boolean(policy));

    for (const policy of policies) {
      for (const feature of policy.requiredFeatures || []) {
        if (!supported.has(feature)) {
          warnings.push(`Required capability surface "${feature}" is not supported by ${featureSupport.agentType}.`);
        }
      }
      const agentPolicy = policy.agentTypes?.[featureSupport.agentType];
      if (agentPolicy?.status === 'unsupported') {
        warnings.push(`${featureSupport.agentType} is marked unsupported for this role capability bundle.`);
      }
      for (const feature of agentPolicy?.unsupportedFeatures || []) {
        warnings.push(`${featureSupport.agentType} cannot load "${feature}" for this role.`);
      }
    }
    return [...new Set(warnings)];
  }

  private roleConfigFromTemplateEntry(entry: ProjectTemplateRoleEntry): ProjectRoleConfig | null {
    if (!entry || !entry.role) return null;
    const refsFromSkills = Array.isArray(entry.skills)
      ? entry.skills.map((skill) => skill?.ref).filter((ref): ref is string => typeof ref === 'string' && Boolean(ref.trim()))
      : [];
    const skillBundleRefs = Array.isArray(entry.skillBundleRefs)
      ? entry.skillBundleRefs.filter((ref): ref is string => typeof ref === 'string' && Boolean(ref.trim()))
      : [];
    const hasInlineConfig =
      Boolean(entry.label) ||
      Boolean(entry.initialPrompt) ||
      Boolean(skillBundleRefs.length) ||
      Boolean(entry.capabilityBundleRefs?.length) ||
      Boolean(entry.capabilityBundles?.length) ||
      Boolean(entry.runtimeCompatibility) ||
      Boolean(refsFromSkills.length) ||
      Boolean(entry.scopes?.length) ||
      Boolean(entry.polling);
    if (!hasInlineConfig) return null;
    const hasCapabilityConfig = Boolean(entry.capabilityBundleRefs?.length) || Boolean(entry.capabilityBundles?.length);
    return {
      role: entry.role,
      label: entry.label || entry.role,
      description: entry.description || undefined,
      skills: entry.skills as ProjectRoleConfig['skills'],
      skillBundleRefs: skillBundleRefs.length
        ? skillBundleRefs
        : refsFromSkills.length
          ? refsFromSkills
          : hasCapabilityConfig
            ? []
            : this.projectRoleConfigForRoleSync(entry.role).skillBundleRefs,
      capabilityBundleRefs: this.cleanStringList(entry.capabilityBundleRefs),
      capabilityBundles: entry.capabilityBundles,
      runtimeCompatibility: entry.runtimeCompatibility || null,
      initialPrompt: typeof entry.initialPrompt === 'string' ? entry.initialPrompt.trim() : '',
      scopes: Array.isArray(entry.scopes) ? entry.scopes.filter((scope) => typeof scope === 'string' && scope.trim()) : undefined,
      polling: entry.polling || undefined,
    };
  }

  private projectRoleConfigForRoleSync(role: string): ProjectRoleConfig {
    const roleSkill: Record<string, string> = {
      OWNER: 'agent-workspace-owner',
      LEAD_AGENT: 'agent-workspace-lead',
      PLANNER_AGENT: 'agent-workspace-planner',
      WORKER_AGENT: 'agent-workspace-worker',
      REVIEW_AGENT: 'agent-workspace-reviewer',
      SECURITY_AUDITOR: 'agent-workspace-security-auditor',
      PM_AGENT: 'agent-workspace-pm',
      INTEGRATOR_AGENT: 'agent-workspace-integrator',
    };
    return {
      role,
      skillBundleRefs: ['skill://agent-workspace', `role-skill://${roleSkill[role] || 'agent-workspace-worker'}`],
      capabilityBundleRefs: ['capability://agent-workspace/core', `capability://agent-workspace/role/${role.toLowerCase().replace(/_/g, '-')}`],
      runtimeCompatibility: {
        requiredFeatures: ['filesystemSkills', 'skillPrompts'],
        optionalFeatures: ['nativePlugins', 'pluginHooks', 'mcpServers'],
      },
      initialPrompt: '',
      polling: defaultAgentPollingConfigForRole(role),
    };
  }

  private async projectRoleConfigForRole(role: string, settings?: any): Promise<ProjectRoleConfig> {
    const templateRoles = await this.projectTemplateRolesForSettings(settings);
    const templateEntry = templateRoles.find((entry) => entry.role === role);
    const inlineConfig = templateEntry ? this.roleConfigFromTemplateEntry(templateEntry) : null;
    if (inlineConfig && !templateEntry?.ref) {
      return this.applyProjectRoleOverrides(role, inlineConfig, settings);
    }

    const slug = this.roleSlugForTemplateEntry(role, templateEntry);
    const configuredPath = this.configService.get<string>('AGENT_WORKSPACE_PROJECT_ROLES_PATH');
    const root = configuredPath
      ? resolve(configuredPath)
      : resolve(process.cwd(), '..', 'agent-workspace', 'project-roles');
    try {
      let raw = '';
      try {
        raw = await readFile(resolve(root, slug, 'role.json'), 'utf8');
      } catch {
        raw = await readFile(resolve(root, `${slug}.json`), 'utf8');
      }
      const parsed = JSON.parse(raw) as ProjectRoleConfig;
      const refsFromSkills = Array.isArray(parsed.skills)
        ? parsed.skills.map((skill) => skill?.ref).filter((ref): ref is string => typeof ref === 'string' && Boolean(ref.trim()))
        : [];
      const skillBundleRefs = Array.isArray(parsed.skillBundleRefs)
        ? parsed.skillBundleRefs.filter((ref) => typeof ref === 'string' && ref.trim())
        : [];
      const capabilityBundleRefs = this.cleanStringList((parsed as any).capabilityBundleRefs);
      const capabilityBundles = Array.isArray((parsed as any).capabilityBundles)
        ? (parsed as any).capabilityBundles
        : undefined;
      const hasCapabilityConfig = Boolean(
        inlineConfig?.capabilityBundleRefs?.length ||
          inlineConfig?.capabilityBundles?.length ||
          capabilityBundleRefs.length ||
          capabilityBundles?.length,
      );
      const runtimeCompatibility =
        (parsed as any).runtimeCompatibility && typeof (parsed as any).runtimeCompatibility === 'object'
          ? (parsed as any).runtimeCompatibility
          : null;
      return this.applyProjectRoleOverrides(role, {
        ...parsed,
        role,
        label: inlineConfig?.label || parsed.label,
        description: inlineConfig?.description || parsed.description,
        skillBundleRefs: inlineConfig?.skillBundleRefs?.length
          ? inlineConfig.skillBundleRefs
          : skillBundleRefs.length
          ? skillBundleRefs
          : refsFromSkills.length
            ? refsFromSkills
            : hasCapabilityConfig
              ? []
              : this.projectRoleConfigForRoleSync(role).skillBundleRefs,
        capabilityBundleRefs: inlineConfig?.capabilityBundleRefs?.length
          ? inlineConfig.capabilityBundleRefs
          : capabilityBundleRefs.length
            ? capabilityBundleRefs
            : this.projectRoleConfigForRoleSync(role).capabilityBundleRefs,
        capabilityBundles: inlineConfig?.capabilityBundles || capabilityBundles,
        runtimeCompatibility: inlineConfig?.runtimeCompatibility || runtimeCompatibility || this.projectRoleConfigForRoleSync(role).runtimeCompatibility,
        initialPrompt: inlineConfig?.initialPrompt || (typeof parsed.initialPrompt === 'string' ? parsed.initialPrompt.trim() : ''),
        scopes: inlineConfig?.scopes || (Array.isArray((parsed as any).scopes) ? (parsed as any).scopes : undefined),
        polling: this.normalizeAgentPollingConfig(inlineConfig?.polling || parsed.polling, defaultAgentPollingConfigForRole(role)),
      }, settings);
    } catch {
      return this.applyProjectRoleOverrides(role, inlineConfig || this.projectRoleConfigForRoleSync(role), settings);
    }
  }

  private async listLaunchableRoleSummaries(settings?: any) {
    const templateRoles = await this.projectTemplateRolesForSettings(settings);
    const configuredRoles = templateRoles
      .filter((entry) => entry.role !== 'OWNER' && entry.launchable !== false && (entry.launchable || entry.role.endsWith('_AGENT')))
      .map((entry) => entry.role);
    const roles = configuredRoles.length ? configuredRoles : LAUNCHABLE_PROJECT_AGENT_ROLES;
    const uniqueRoles = [...new Set(roles)];
    const configs = await Promise.all(
      uniqueRoles.map(async (role) => {
        const config = await this.projectRoleConfigForRole(role, settings);
        const resolvedCapabilities = await this.resolveRoleCapabilityBundles(role, config);
        return {
          role,
          label: config.label || role,
          description: config.description || this.defaultRoleDescription(role),
          skillBundleRefs: resolvedCapabilities.skillBundleRefs,
          capabilityBundleRefs: resolvedCapabilities.refs,
          requiredProjectGlobals: resolvedCapabilities.requiredProjectGlobals,
          runtimeCompatibility: config.runtimeCompatibility || null,
          initialPrompt: config.initialPrompt || '',
        };
      }),
    );
    return configs;
  }

  private async projectSkillOverridesForRole(
    projectId: string,
    role: string,
    roleConfig: ProjectRoleConfig,
    settings?: any,
    skillBundleRefs: string[] = roleConfig.skillBundleRefs,
  ): Promise<AgentRuntimeProjectSkillOverride[]> {
    const override = this.projectRoleSkillOverridesFromSettings(settings)[role];
    const skills = override?.skills || {};
    const entries: Array<AgentRuntimeProjectSkillOverride | null> = await Promise.all(
      skillBundleRefs.map(async (ref) => {
        const skill = skills[ref];
        if (!skill?.storagePath) return null;
        try {
          const response = await this.agentWorkspaceClient.readProjectFile(projectId, skill.storagePath, 'text');
          const content = typeof response.content === 'string' ? response.content : '';
          return {
            ref,
            name: skill.name || this.skillNameFromRef(ref),
            storagePath: skill.storagePath,
            updatedAt: skill.updatedAt || override?.updatedAt || null,
            updatedById: skill.updatedById || override?.updatedById || null,
            files: [{ path: 'SKILL.md', content }],
          } satisfies AgentRuntimeProjectSkillOverride;
        } catch {
          return null;
        }
      }),
    );
    return entries.filter((entry): entry is AgentRuntimeProjectSkillOverride => Boolean(entry));
  }

  private async projectRoleSkillDetail(projectId: string, role: string, ref: string, settings?: any) {
    const override = this.projectRoleSkillOverridesFromSettings(settings)[role];
    const skill = override?.skills?.[ref];
    const name = skill?.name || this.skillNameFromRef(ref);
    let content = '';
    let storagePath = skill?.storagePath || null;
    let overridden = false;
    if (storagePath) {
      try {
        const response = await this.agentWorkspaceClient.readProjectFile(projectId, storagePath, 'text');
        content = typeof response.content === 'string' ? response.content : '';
        overridden = true;
      } catch {
        content = '';
      }
    }
    if (!content) {
      try {
        content = await this.agentRuntimeLauncher.loadSkillMarkdown(ref, role);
      } catch {
        content = '';
      }
    }
    return {
      ref,
      name,
      storagePath,
      overridden,
      updatedAt: skill?.updatedAt || override?.updatedAt || null,
      updatedById: skill?.updatedById || override?.updatedById || null,
      content,
    };
  }

  private defaultRoleDescription(role: string) {
    const descriptions: Record<string, string> = {
      PLANNER_AGENT: 'Breaks goals into features and ready work items.',
      WORKER_AGENT: 'Executes assigned work, or self-selects unowned unassigned work while idle, and returns handoff evidence.',
      REVIEW_AGENT: 'Reviews handoffs against acceptance criteria.',
      SECURITY_AUDITOR: 'Audits implementation work for security risks.',
      PM_AGENT: 'Watches stalls, risks, load, and coordination health.',
      INTEGRATOR_AGENT: 'Connects accepted work to external systems such as GitHub, CI, or release workflows.',
    };
    return descriptions[role] || 'Project agent role.';
  }

  private async materializePersonalTemplateSkillFiles(
    projectId: string,
    settings: Record<string, any>,
    template: ProjectTemplateConfig,
    userId: string,
  ) {
    const files = template.settings?.projectRoleSkillFiles;
    if (!files || typeof files !== 'object' || Array.isArray(files)) return;
    const skillOverrides = this.projectRoleSkillOverridesFromSettings(settings);
    let changed = false;
    for (const [role, roleFiles] of Object.entries(files)) {
      if (!roleFiles || typeof roleFiles !== 'object' || Array.isArray(roleFiles)) continue;
      const roleOverride = skillOverrides[role] || {};
      const nextSkillOverrides = { ...(roleOverride.skills || {}) };
      for (const [ref, content] of Object.entries(roleFiles as Record<string, any>)) {
        if (typeof content !== 'string') continue;
        const storagePath = this.projectRoleSkillStoragePath(role, ref);
        await this.agentWorkspaceClient.writeProjectFile(projectId, {
          path: storagePath,
          content,
          contentType: 'text/markdown; charset=utf-8',
        });
        nextSkillOverrides[ref] = {
          name: this.skillNameFromRef(ref),
          storagePath,
          updatedAt: new Date().toISOString(),
          updatedById: userId,
        };
        changed = true;
      }
      skillOverrides[role] = {
        ...roleOverride,
        skills: nextSkillOverrides,
      };
    }
    if (changed) {
      settings.projectRoleSkillOverrides = skillOverrides;
      delete settings.projectRoleSkillFiles;
    }
  }

  private projectRoleAgentDefaultsFromSettings(settings?: any): Record<string, Record<string, any>> {
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return {};
    const raw = settings.projectRoleAgentDefaults;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    return Object.entries(raw).reduce((acc, [role, value]) => {
      if (!role || !value || typeof value !== 'object' || Array.isArray(value)) return acc;
      const record = value as Record<string, any>;
      acc[role] = {
        role,
        ...(this.normalizeAgentRuntimeLaunchMode(record.launchMode) ? { launchMode: record.launchMode } : {}),
        ...(typeof record.agentType === 'string' && record.agentType.trim() ? { agentType: record.agentType.trim() } : {}),
        ...(typeof record.image === 'string' && record.image.trim() ? { image: record.image.trim() } : {}),
        ...(typeof record.model === 'string' && record.model.trim() ? { model: record.model.trim() } : {}),
        ...(Number.isFinite(Number(record.deploymentDays))
          ? { deploymentDays: Math.max(1, Math.floor(Number(record.deploymentDays))) }
          : {}),
        ...(typeof record.enableSudo === 'boolean' ? { enableSudo: record.enableSudo } : {}),
      };
      return acc;
    }, {} as Record<string, Record<string, any>>);
  }

  private normalizeAgentRuntimeLaunchMode(value?: any): AgentRuntimeLaunchMode | null {
    return ['local-docker', 'local-runner', 'local-codex', 'aws-ecs', 'aws-agentcore'].includes(value)
      ? value as AgentRuntimeLaunchMode
      : null;
  }

  private effectiveAgentRuntimeLaunchMode(
    value?: AgentRuntimeLaunchMode | string | null,
    session?: AgentRuntimeSession | null,
  ): AgentRuntimeLaunchMode | null {
    const launchMode = this.normalizeAgentRuntimeLaunchMode(value);
    if (!launchMode) return null;
    if (launchMode === 'local-docker' && this.defaultAgentRuntimeLaunchMode(session) === 'local-runner') {
      return 'local-runner';
    }
    return launchMode;
  }

  private agentRuntimeLaunchEnvironment(): 'local' | 'production' {
    const configured = String(
      this.configService.get<string>('AIFACTORY_RUNTIME_LAUNCH_ENVIRONMENT') ||
      this.configService.get<string>('AGENTCRAFT_RUNTIME_LAUNCH_ENVIRONMENT') ||
      '',
    ).trim().toLowerCase();
    if (['prod', 'production', 'deployed'].includes(configured)) return 'production';
    if (['local', 'dev', 'development', 'test', 'ci'].includes(configured)) return 'local';

    const advertisedUrl = [
      this.configService.get<string>('HERMES_AGENT_PROJECT_API_BASE_URL'),
      this.configService.get<string>('AIFACTORY_PUBLIC_API_BASE_URL'),
      this.configService.get<string>('AIFACTORY_API_BASE_URL'),
    ].filter(Boolean).join(' ');
    return advertisedUrl.includes('agentcraft.work') ? 'production' : 'local';
  }

  private defaultAgentRuntimeLaunchMode(session?: AgentRuntimeSession | null): AgentRuntimeLaunchMode {
    if (session?.provider === 'local-runner') return 'local-runner';
    if (session?.provider === 'local-codex') return 'local-codex';
    if (session?.provider === 'aws-agentcore') return 'aws-agentcore';
    if (session?.provider === 'aws-ecs') return 'aws-ecs';

    const configured = this.normalizeAgentRuntimeLaunchMode(
      this.configService.get<string>('HERMES_AGENT_DEFAULT_LAUNCH_MODE') ||
      this.configService.get<string>('AIFACTORY_DEFAULT_AGENT_LAUNCH_MODE'),
    );
    if (configured) return configured;

    return this.agentRuntimeLaunchEnvironment() === 'production' ? 'local-runner' : 'local-docker';
  }

  private isQueuedLocalRuntimeProvider(provider?: string | null): provider is 'local-runner' | 'local-codex' {
    return provider === 'local-runner' || provider === 'local-codex';
  }

  private isLocalCliAgent(agentType?: string | null) {
    return ['codex', 'claude-code'].includes(String(agentType || '').trim());
  }

  private canLaunchWithoutModelConfig(launchMode: AgentRuntimeLaunchMode, agentType?: string | null) {
    return launchMode === 'local-codex' || (['local-docker', 'local-runner'].includes(launchMode) && this.isLocalCliAgent(agentType));
  }

  private defaultAgentRuntimeType(session?: AgentRuntimeSession | null) {
    return (
      session?.agentType ||
      this.configService.get<string>('HERMES_AGENT_DEFAULT_AGENT_TYPE') ||
      this.configService.get<string>('AIFACTORY_DEFAULT_AGENT_TYPE') ||
      'pi'
    ).trim() || 'pi';
  }

  private preferredSubAgentRuntimeType(role: string, settings: any, session?: AgentRuntimeSession | null, dto: any = {}) {
    const roleLaunchDefault = this.projectRoleAgentDefaultsFromSettings(settings)[role] || {};
    return (
      (typeof dto.agentType === 'string' ? dto.agentType : '') ||
      roleLaunchDefault.agentType ||
      this.configService.get<string>('AIFACTORY_DEFAULT_SUB_AGENT_TYPE') ||
      'pi'
    ).trim() || 'pi';
  }

  private runtimeCostForSession(session: AgentRuntimeSession | null) {
    if (!session || session.status === 'STOPPED') return 0;
    if (session.provider !== 'aws-ecs') return 0;
    const deploymentDays = Math.max(1, Math.floor(Number(session.deploymentDays) || 1));
    const dailyCost = Math.max(0, Number(session.dailyCostAmount) || AGENT_DEPLOYMENT_PRICE_PER_DAY);
    return deploymentDays * dailyCost;
  }

  private async getProjectRuntimeBudgetContext(projectId: string) {
    const [workspaceProject, members, project] = await Promise.all([
      this.agentWorkspaceClient.getProject(projectId),
      this.prisma.projectMember.findMany({
        where: { projectId, removedAt: null },
        select: { id: true, userId: true, role: true, permissions: true },
      }),
      this.prisma.project.findUnique({
        where: { id: projectId },
        select: { settings: true },
      }),
    ]);
    const launchableRoles = await this.listLaunchableRoleSummaries(project?.settings);
    const budgetAmount = Number(workspaceProject.budgetAmount || 0);
    const budgetCurrency = workspaceProject.budgetCurrency || 'AIC';
    const runtimeCommitments = members
      .map((member) => {
        const session = this.readRuntimeSession(member.permissions);
        if (!session) return null;
        return {
          memberId: member.id,
          userId: member.userId,
          role: member.role,
          runtimeId: session.runtimeId,
          status: session.status,
          deploymentDays: Math.max(1, Math.floor(Number(session.deploymentDays) || 1)),
          dailyCostAmount: session.provider === 'aws-ecs'
            ? Math.max(0, Number(session.dailyCostAmount) || AGENT_DEPLOYMENT_PRICE_PER_DAY)
            : 0,
          committedAmount: this.runtimeCostForSession(session),
        };
      })
      .filter(Boolean) as Array<{
        memberId: string;
        userId: string;
        role: string;
        runtimeId: string;
        status: string;
        deploymentDays: number;
        dailyCostAmount: number;
        committedAmount: number;
      }>;
    const committedAmount = runtimeCommitments.reduce((sum, runtime) => sum + runtime.committedAmount, 0);
    const availableAmount = Math.max(0, budgetAmount - committedAmount);

    return {
      budgetAmount,
      budgetCurrency,
      dailyAgentCostAmount: AGENT_DEPLOYMENT_PRICE_PER_DAY,
      committedAmount,
      availableAmount,
      canLaunchOneDayAgent: availableAmount >= AGENT_DEPLOYMENT_PRICE_PER_DAY,
      runtimeCommitments,
      launchableRoles,
    };
  }

  private async ensureRuntimeBudgetForLaunch(
    projectId: string,
    memberId: string | null,
    deploymentDays: number,
    launchMode: AgentRuntimeLaunchMode = 'local-docker',
  ) {
    const budgetContext = await this.getProjectRuntimeBudgetContext(projectId);
    const requestedAmount = launchMode === 'aws-ecs' ? deploymentDays * AGENT_DEPLOYMENT_PRICE_PER_DAY : 0;
    const committedByOtherMembers = budgetContext.runtimeCommitments
      .filter((runtime) => !memberId || runtime.memberId !== memberId)
      .reduce((sum, runtime) => sum + runtime.committedAmount, 0);
    const availableForLaunch = Math.max(0, budgetContext.budgetAmount - committedByOtherMembers);

    if (availableForLaunch < requestedAmount) {
      throw new BadRequestException(
        `Insufficient project runtime budget for agent launch: ${requestedAmount} ${budgetContext.budgetCurrency} required, ${availableForLaunch} ${budgetContext.budgetCurrency} available`,
      );
    }

    return {
      ...budgetContext,
      requestedAmount,
      availableForLaunch,
      committedByOtherMembers,
      remainingAfterLaunch: availableForLaunch - requestedAmount,
    };
  }

  private commonRuntimeScopes() {
    return ['PROJECT_READ_BASIC', 'PROJECT_INBOX_READ', 'THREAD_PARTICIPATE', 'PROJECT_FILE_READ', 'MEMORY_READ', 'PROJECT_GLOBAL_READ'];
  }

  private rolePolicyScopes(role: string) {
    const byRole: Record<string, string[]> = {
      OWNER: [
        'PROJECT_BOARD_READ',
        'PROJECT_MEMBER_READ',
        'MEMORY_WRITE',
        'PROJECT_GLOBAL_WRITE',
        'GOAL_CREATE',
        'GOAL_UPDATE',
        'FEATURE_CREATE',
        'WORK_ITEM_CREATE',
        'WORK_ITEM_UPDATE',
        'WORK_ITEM_STATUS_UPDATE',
        'ASSIGNMENT_DISPATCH',
        'PROPOSAL_CREATE',
        'REVIEW_SUBMIT',
        'PROJECT_FILE_WRITE',
      ],
      LEAD_AGENT: [
        'PROJECT_BOARD_READ',
        'PROJECT_MEMBER_READ',
        'MEMORY_WRITE',
        'GOAL_CREATE',
        'GOAL_UPDATE',
        'FEATURE_CREATE',
        'WORK_ITEM_CREATE',
        'WORK_ITEM_UPDATE',
        'WORK_ITEM_STATUS_UPDATE',
        'ASSIGNMENT_DISPATCH',
        'PROPOSAL_CREATE',
        'PROJECT_FILE_WRITE',
      ],
      PLANNER_AGENT: [
        'PROJECT_BOARD_READ',
        'GOAL_CREATE',
        'GOAL_UPDATE',
        'FEATURE_CREATE',
        'WORK_ITEM_CREATE',
        'WORK_ITEM_UPDATE',
        'WORK_ITEM_STATUS_UPDATE',
        'MEMORY_WRITE',
        'PROJECT_FILE_WRITE',
      ],
      WORKER_AGENT: ['PROJECT_BOARD_READ', 'WORK_ITEM_CREATE', 'PROJECT_FILE_WRITE'],
      REVIEW_AGENT: ['PROJECT_BOARD_READ', 'REVIEW_SUBMIT', 'MEMORY_WRITE', 'PROJECT_FILE_WRITE'],
      SECURITY_AUDITOR: ['PROJECT_BOARD_READ', 'WORK_ITEM_CREATE', 'MEMORY_WRITE', 'PROPOSAL_CREATE', 'PROJECT_FILE_WRITE'],
      PM_AGENT: [
        'PROJECT_BOARD_READ',
        'PROJECT_MEMBER_READ',
        'WORK_ITEM_UPDATE',
        'WORK_ITEM_STATUS_UPDATE',
        'MEMORY_WRITE',
        'PROPOSAL_CREATE',
        'PROJECT_FILE_WRITE',
      ],
      INTEGRATOR_AGENT: ['PROJECT_BOARD_READ', 'EXTERNAL_EVENT_INGEST', 'PROJECT_FILE_WRITE'],
      LEGAL_CLAUSE_AGENT: [
        'PROJECT_BOARD_READ',
        'WORK_ITEM_UPDATE',
        'WORK_ITEM_STATUS_UPDATE',
        'PROJECT_FILE_READ',
        'PROJECT_FILE_WRITE',
        'MEMORY_WRITE',
      ],
      LEGAL_RISK_AGENT: ['PROJECT_BOARD_READ', 'PROJECT_FILE_READ', 'PROJECT_FILE_WRITE', 'MEMORY_WRITE'],
      LEGAL_COMPLIANCE_AGENT: [
        'PROJECT_BOARD_READ',
        'PROJECT_FILE_READ',
        'PROJECT_FILE_WRITE',
        'MEMORY_WRITE',
        'PROPOSAL_CREATE',
      ],
      LEGAL_TERMS_AGENT: ['PROJECT_BOARD_READ', 'PROJECT_FILE_READ', 'PROJECT_FILE_WRITE', 'MEMORY_WRITE'],
      LEGAL_RECOMMENDATIONS_AGENT: [
        'PROJECT_BOARD_READ',
        'WORK_ITEM_UPDATE',
        'WORK_ITEM_STATUS_UPDATE',
        'PROJECT_FILE_READ',
        'PROJECT_FILE_WRITE',
        'MEMORY_WRITE',
        'REVIEW_SUBMIT',
        'PROPOSAL_CREATE',
      ],
    };
    return byRole[role] || [];
  }

  private scopesForRole(
    role: string,
    roleConfig?: ProjectRoleConfig | null,
    resolvedCapabilities?: ResolvedRoleCapabilityBundles | null,
  ) {
    const configured = Array.isArray(roleConfig?.scopes) ? roleConfig.scopes : [];
    return this.uniqueStringList(
      this.commonRuntimeScopes(),
      configured.length ? configured : this.rolePolicyScopes(role),
      resolvedCapabilities?.requiredScopes,
    );
  }

  private async canCreateProjectLeadAgent(projectId: string, settings?: any) {
    const templateRoles = await this.projectTemplateRolesForSettings(settings);
    const templateHasLeadAgent = !templateRoles.length || templateRoles.some((entry) => entry.role === 'LEAD_AGENT');
    if (!templateHasLeadAgent) return false;

    const activeLeadAgent = await this.findActiveProjectLeadAgent(projectId);
    return !activeLeadAgent;
  }

  private async findActiveProjectLeadAgent(projectId: string) {
    const activeLeadAgent = await this.prisma.projectMember.findFirst({
      where: { projectId, role: 'LEAD_AGENT', removedAt: null },
      select: {
        id: true,
        userId: true,
        role: true,
        permissions: true,
        user: { select: { displayName: true, email: true } },
      },
      orderBy: { joinedAt: 'asc' },
    });
    return activeLeadAgent;
  }

  private agentDisplayNameForMember(member?: {
    permissions?: any;
    user?: { displayName?: string | null; email?: string | null } | null;
  } | null) {
    return (
      this.readProjectAgentRoleName(member?.permissions)?.displayName ||
      member?.user?.displayName?.trim() ||
      member?.user?.email?.split('@')[0]?.trim() ||
      null
    );
  }

  private async runtimeSystemPrompt(projectId: string, role: string, session: AgentRuntimeSession) {
    const budgetContext = await this.getProjectRuntimeBudgetContext(projectId).catch(() => null);
    const leadProjectContextLines =
      role === 'LEAD_AGENT' ? await this.leadRuntimeProjectContextPrompt(projectId) : [];
    const budgetUnit = budgetContext?.budgetCurrency === 'AIC' ? 'credits' : budgetContext?.budgetCurrency;
    const budgetLines = budgetContext
      ? [
          `Project runtime budget: ${budgetContext.budgetAmount} ${budgetUnit}.`,
          `Paid cloud runtime commitments already launched: ${budgetContext.committedAmount} ${budgetUnit}.`,
          `Currently available for paid AWS cloud agent launches: ${budgetContext.availableAmount} ${budgetUnit}.`,
          `AWS cloud agents cost ${budgetContext.dailyAgentCostAmount} ${budgetUnit} per day; local runner agents use the operator's own Docker machine and do not consume project runtime budget.`,
          budgetContext.runtimeCommitments.length
            ? `Launched runtimes: ${budgetContext.runtimeCommitments
                .map(
                  (runtime) =>
                    `${runtime.role}/${runtime.status}/${runtime.deploymentDays}d/${runtime.committedAmount} ${budgetUnit}`,
                )
                .join('; ')}.`
            : 'No non-stopped agent runtimes are currently committed against the project budget.',
        ]
      : ['Project runtime budget context could not be loaded; avoid launching paid runtimes until budget is visible.'];
    const roleLines = budgetContext
      ? budgetContext.launchableRoles.map(
        (launchRole) =>
            `- ${launchRole.role}: ${launchRole.description} Capabilities: ${(launchRole.capabilityBundleRefs || launchRole.skillBundleRefs).join(', ')}. Skills: ${launchRole.skillBundleRefs.join(', ')}`,
      )
      : [];
    const defaultLaunchMode = this.defaultAgentRuntimeLaunchMode(session);
    const defaultAgentType = this.defaultAgentRuntimeType(session);
    const agentDisplayName = typeof session.agentDisplayName === 'string' && session.agentDisplayName.trim()
      ? session.agentDisplayName.trim()
      : '';
    return [
      agentDisplayName
        ? `Your agent name is ${agentDisplayName}. You are acting as ${role} inside agent-workspace project ${projectId}. Refer to yourself as ${agentDisplayName} when identity matters.`
        : `You are acting as ${role} inside agent-workspace project ${projectId}.`,
      `Use the role capability bundle refs: ${(session.capabilityBundleRefs || session.skillBundleRefs).join(', ')}.`,
      session.capabilityBundles?.length
        ? `Resolved capability bundles: ${session.capabilityBundles
            .map((bundle) => {
              const scopes = bundle.requiredScopes?.length ? ` scopes=${bundle.requiredScopes.join('|')}` : '';
              const globals = bundle.requiredProjectGlobals?.length ? ` globals=${bundle.requiredProjectGlobals.join('|')}` : '';
              return `${bundle.ref}${scopes}${globals}`;
            })
            .join('; ')}.`
        : '',
      `Use the role skill refs: ${session.skillBundleRefs.join(', ')}.`,
      session.runtimeFeatureSupport
        ? `This runtime supports these portable capability surfaces: ${session.runtimeFeatureSupport.supportedFeatures.join(', ') || 'none'}.`
        : '',
      'Runtime context is mounted at /opt/data/AGENT_WORKSPACE_CONTEXT.json and shell/API credentials are provided through environment variables plus /opt/data/AGENT_WORKSPACE_RUNTIME.env.',
      'Do not read, print, or copy /opt/data/AGENT_WORKSPACE_RUNTIME.env. Source it inside bash commands when shell/API credentials are needed, then use the exported variables.',
      'API routing rule: runtime resume, inbox/board/work-items, project globals, project files, and project memory are agent-workspace reads/writes. Use $AGENT_WORKSPACE_BASE_URL/v1/... with Authorization: Bearer $AGENT_WORKSPACE_TOKEN for those. Do not call host $AIFACTORY_API_BASE_URL for runtime resume, board, work-items listing, globals, files, or memory.',
      'For project shared files, prefer the mounted project-files.sh helpers. If calling HTTP directly, list files with GET $AGENT_WORKSPACE_BASE_URL/v1/projects/$AGENT_WORKSPACE_PROJECT_ID/files?prefix=<path>&recursive=true&limit=100; read with /files/read?path=<path>; write with /files/write. There is no /files/list route.',
      'When working on a specific work item, bind item-scoped project-file writes/uploads/deletes with the helper option --work-item <workItemId>. Direct agent-workspace writes may instead include X-AgentCraft-Work-Item-Id or a workItemId field. Do not write an active work item id into /opt/data/AGENT_WORKSPACE_RUNTIME.env, because the same runtime may process different items in different sessions.',
      session.enableSudo
        ? 'This runtime was launched with passwordless sudo enabled. Prefer existing tools, mounted helper scripts, and user-space package managers first; use system package installation only when truly required for the task.'
        : 'Prefer mounted helper scripts, Node.js fetch, or python3 urllib.request for API calls; avoid installing system packages just to make routine HTTP requests.',
      'Lead runtimes may also receive AIFACTORY_API_BASE_URL and AIFACTORY_RUNTIME_TOKEN in the runtime env file. Use host API endpoints only for host-owned runtime helpers such as goal runtime-create/runtime-update, work-item runtime-create/update/runtime-comments, assignment runtime-update/claim/dispatch, runtime launch/dispatch, assignment runtime-state, and failed-runtime workspace recovery. AIFACTORY_API_BASE_URL is a complete API base and may already end with /api; append /projects/... directly and do not add another /api segment. Never call host /projects/... endpoints without Authorization: Bearer $AIFACTORY_RUNTIME_TOKEN, and do not use owner UI routes such as GET /projects/{projectId}/work-items/{workItemId}/comments; runtimes must use GET /projects/{projectId}/work-items/{workItemId}/runtime-comments for work-item comments. Do not call owner-only goal routes such as PATCH /projects/{projectId}/goals/{goalId}, PATCH /goals/{goalId}/status, or guessed goal helper paths; use PATCH /projects/{projectId}/goals/{goalId}/runtime-update for OPEN/IN_PROGRESS/BLOCKED/DONE status updates.',
      'Project-level resources and saved credentials are owned by agent-workspace, can be listed with GET $AGENT_WORKSPACE_BASE_URL/v1/projects/$AGENT_WORKSPACE_PROJECT_ID/globals?includeValues=true using AGENT_WORKSPACE_TOKEN, and may also be exported in /opt/data/AGENT_WORKSPACE_RUNTIME.env as PROJECT_GLOBAL_* variables plus common aliases such as GITHUB_TOKEN when configured.',
      'Durable project memory is owned by agent-workspace. Search it with GET $AGENT_WORKSPACE_BASE_URL/v1/projects/$AGENT_WORKSPACE_PROJECT_ID/memories?q=... and write reusable DECISION/CONSTRAINT/FACT/RISK/OPEN_QUESTION/INTERFACE_CONTRACT entries with POST $AGENT_WORKSPACE_BASE_URL/v1/projects/$AGENT_WORKSPACE_PROJECT_ID/memories when your runtime has MEMORY_WRITE.',
      'When requesting owner-controlled resources, do not infer a vendor, website, social network, API provider, platform-specific key set, or platform-specific skill from a generic resource key or generic task. Keep labels and descriptions neutral unless the owner explicitly named that platform.',
      'Use /opt/data/workspace as the default persistent repo workspace inside the container unless the task explicitly says otherwise.',
      'Use /opt/data/workspace for container-local deliverables only when the task does not name a project shared-file path. If the task, work item, outputContract, or role prompt names a project shared folder such as 待审核/, 待复审核/, 审核报告/, reports/, deliverables/, or asks for project-file-write/project files API output, write the file through project-file-write, POST /v1/projects/{projectId}/files/write, or POST /v1/projects/{projectId}/files/upload so it lands in durable project shared storage.',
      'Verify deliverables in the same place they were requested: use ls/find/read only for /opt/data/workspace outputs, and use project-file-list/project-file-read or the project files API for project shared-file outputs. Do not mark an assignment complete or tell the owner a project shared-file deliverable exists until that shared path can be listed or read.',
      'For external HTTP/API calls, set command-level timeouts around 20 seconds plus narrow retries, so one slow third-party request cannot stall an otherwise long-lived runtime.',
      'For long-running work, keep each turn bounded. Produce a small reviewable handoff before the turn becomes too large or silent: write concise project shared artifacts, verify them, mark the assignment COMPLETED, and create a follow-up item for deeper exploration when needed.',
      session.projectGithubUrl
        ? `The project GitHub repository is ${session.projectGithubUrl}. If code work is requested, prefer cloning or opening it inside ${session.repoWorkspaceDir || '/opt/data/workspace'}.`
        : 'If code work is requested and the project GitHub URL is visible in the context or project read API, clone or open it inside /opt/data/workspace.',
      'Do not use read_file output to recover workspaceToken, because secret values may be redacted in tool output.',
      'Do not rely on a previously exported AGENT_WORKSPACE_TOKEN env var if it differs from /opt/data/AGENT_WORKSPACE_RUNTIME.env, because long-lived runtimes may refresh tokens between turns.',
      'Respect the role authorization boundary. On a fresh conversation or before state-changing workspace actions, read inbox/resume context; for ordinary follow-up messages in the same conversation, reuse the already loaded context unless it is missing or stale.',
      role === 'WORKER_AGENT'
        ? 'On a fresh worker turn, source /opt/data/AGENT_WORKSPACE_RUNTIME.env and call POST $AGENT_WORKSPACE_BASE_URL/v1/runtimes/$AGENT_WORKSPACE_RUNTIME_ID/resume with JSON {"projectId":"$AGENT_WORKSPACE_PROJECT_ID"}. If no assignment is returned, list self-selectable work through GET $AGENT_WORKSPACE_BASE_URL/v1/projects/$AGENT_WORKSPACE_PROJECT_ID/work-items using AGENT_WORKSPACE_TOKEN. Use AIFACTORY_API_BASE_URL only for runtime helpers such as runtime-claim, runtime-comments, and assignment runtime-update; read work-item comments with runtime-comments, not the owner UI /comments route.'
        : '',
      ...(role === 'LEAD_AGENT'
        ? [
            ...leadProjectContextLines,
            '[Lead budget and staffing authority]',
            ...budgetLines,
            'Available launchable project agent roles:',
            ...roleLines,
            '[Lead operating loop]',
            '1. On a fresh lead pass, or when current board context is missing or stale, source /opt/data/AGENT_WORKSPACE_RUNTIME.env; call POST $AGENT_WORKSPACE_BASE_URL/v1/runtimes/$AGENT_WORKSPACE_RUNTIME_ID/resume with Authorization: Bearer $AGENT_WORKSPACE_TOKEN and JSON {"projectId":"$AGENT_WORKSPACE_PROJECT_ID"}; then read board/work items/members from the resume boardSnapshot or GET $AGENT_WORKSPACE_BASE_URL/v1/projects/$AGENT_WORKSPACE_PROJECT_ID/board. Do not use AIFACTORY_API_BASE_URL for resume or board reads.',
            'When the project has many goals or work items, avoid one huge all-items pass. Page through goals with GET $AGENT_WORKSPACE_BASE_URL/v1/projects/$AGENT_WORKSPACE_PROJECT_ID/goals?includeClosed=false&limit=100, then for each active goal read only its linked work items with GET $AGENT_WORKSPACE_BASE_URL/v1/projects/$AGENT_WORKSPACE_PROJECT_ID/work-items?goalId=<goalId>&includeClosed=true&limit=100&page=1. Read full item details lazily with GET /v1/projects/$AGENT_WORKSPACE_PROJECT_ID/work-items/{workItemId} only for the small set you may accept, revise, duplicate-check, or use to create the next item.',
            'Maintain a durable lead workspace and lead goal ledger in project shared storage. Use coordination/lead.md for the human-readable frontier policy, polling cursor, next-goal queue, unresolved blockers, and project-level decisions. Use coordination/lead-goal-ledger.jsonl for per-goal machine checkpoints. At the start of a polling run, read lead.md if present, then read the ledger if present. For each goal you inspect, compute a small status digest from goal id/status/updatedAt plus linked work-item ids/statuses/workTypes and open assignment statuses; after deciding, append or rewrite one JSON record with pollingRunId, timestamp, goalId, topology, statusDigest, decision, nextAction, and any createdWorkItemIds. On later polling runs, skip a goal only when its latest ledger digest matches the current digest and there is no READY/NEEDS_REVISION/IN_REVIEW/ownerAction/resourceRequest work that needs lead attention. Write the ledger after each goal, and before stopping update coordination/lead.md with lastRunId, nextGoalCursor, unfinishedScanReason, skipped reasons, next-goal queue, unresolved blockers, and project-level decisions so a stopped runtime can resume without restarting the whole pass.',
            'For every active goal, classify the completion topology before expanding work: DIRECT, SERIAL, FAN_OUT_FAN_IN, TOTAL_TO_PARTS, TOTAL_PARTS_TOTAL, or ITERATIVE_REVIEW. Use linked item summaries first, then read exact item details, shared files, and targeted memory only when they can change the decision. If accepted upstream work is sufficient and no aggregation deliverable is required, mark the goal DONE when no linked non-terminal work remains. If accepted upstream work is sufficient but the goal requires aggregation, create one aggregation/synthesis/delivery item that depends on accepted upstream items; require review when the acceptance bar or status flow requires it; mark DONE only after the accepted items or accepted aggregation artifact satisfy the goal acceptance bar and no linked non-terminal work remains.',
            '2. When the owner explicitly asks you to create a goal, use the host runtime helper POST $AIFACTORY_API_BASE_URL/projects/$AGENT_WORKSPACE_PROJECT_ID/goals/runtime-create with Authorization: Bearer $AIFACTORY_RUNTIME_TOKEN and JSON {"title":"...","description":"..."}. To update a goal after accepted evidence/audit/report work, use PATCH $AIFACTORY_API_BASE_URL/projects/$AGENT_WORKSPACE_PROJECT_ID/goals/{goalId}/runtime-update with Authorization: Bearer $AIFACTORY_RUNTIME_TOKEN and fields such as {"status":"IN_PROGRESS"} or {"status":"DONE"}. Runtime goal updates cannot cancel goals; create an owner action if cancellation is needed. Never mark DONE or create an owner goal-closure action while the same goal still has READY, ASSIGNED, IN_PROGRESS, IN_REVIEW, NEEDS_REVISION, or REPORT_READY security/planning/audit/report work; finish, accept, or cancel the linked work first. Do not call the user-JWT /goals endpoint with a runtime token, and do not guess /goals/{goalId}/status.',
            '3. If no item is ready, create or refine a dispatchable work item with scopeBrief, acceptanceCriteria, inputPacket, outputContract, dependencies, and any uploaded project file references in inputPacket.projectFiles. For new dispatchable work items, use the host runtime helper POST $AIFACTORY_API_BASE_URL/projects/$AGENT_WORKSPACE_PROJECT_ID/work-items/runtime-create with Authorization: Bearer $AIFACTORY_RUNTIME_TOKEN so coordinator scheduling is triggered. acceptanceCriteria must be a single string; use newline-delimited numbered criteria instead of an array. outputContract must be a JSON object, never a plain string.',
            '4. If project settings show workItemStatusFlow.coordinator.enabled is not false, treat the COORDINATOR as the primary dispatcher: create or refine the smallest READY/NEEDS_REVISION work item with the correct workType, dependencies, and outputContract, then give the coordinator a chance to launch/assign the matching role. Use runtime-dispatch from the lead role as a fallback when coordinator dispatch is disabled, unavailable, stale, blocked by a failed assignment that you have reconciled, or has not produced an assignment and the project needs a new agent to keep moving.',
            '5. If a ready item needs execution with no suitable active worker runtime and lead fallback dispatch is warranted, prefer local-docker/local-runner WORKER_AGENT in local AgentCraft; use paid AWS cloud WORKER_AGENT for 1 day only when available runtime budget covers the daily commitment.',
            `6. Lead dispatch fallback: if AIFACTORY_API_BASE_URL and AIFACTORY_RUNTIME_TOKEN are present, launch and dispatch through POST $AIFACTORY_API_BASE_URL/projects/{projectId}/work-items/{workItemId}/assignments/runtime-dispatch with Authorization: Bearer $AIFACTORY_RUNTIME_TOKEN. Use AIFACTORY_API_BASE_URL exactly as provided; do not prepend /api if it already ends with /api. Use JSON fields role, launchIfMissing, launchMode, objective, contextPacket, and forceLaunchNew when you need one fresh worker per parallel task; omit agentType unless the owner explicitly requested a different runtime; the host will use the role/template launch default first and only fall back to the platform sub-agent default when no role default exists. The host will use owner-visible model API configs, first trying the current/owner-preferred config and then fallbacks; if all model APIs fail, it creates an owner work item. Default launchMode for this lead runtime is ${defaultLaunchMode}; fallback default agentType is ${defaultAgentType}. local-runner is for production/operator Docker hosts such as agentcraft.work, local-codex is for a registered local Codex CLI worker, local-docker is for backend-local Docker, aws-agentcore/aws-ecs are paid cloud modes. Non-Hermes agent types must use local-docker, local-runner, or local-codex.`,
            'For HackerOne target work, use one fresh worker runtime per independent program/goal so prior target context cannot contaminate the next target. Use forceLaunchNew: true for independent target items. Only set contextPacket.sameGoalContinuation: true or contextPacket.allowWorkerReuse: true for a bounded revision or continuation on the same target/goal.',
            'Capacity rule: if runtime-dispatch returns a project active-agent capacity error, do not call a non-existent /agent-runtimes/{memberId}/stop endpoint. Reuse a suitable IDLE worker without forceLaunchNew only for non-HackerOne work or an explicit same-goal continuation; for HackerOne independent target worker items, wait for fresh-agent capacity or create/use an owner capacity/settings item. SECURITY_AUDITOR/REVIEW_AGENT feedback work may reuse same-role IDLE runtimes because the auditor must re-read the current handoff and evidence. STOPPED and ERROR runtime sessions do not count as active capacity.',
            'Dispatch timeout rule: if runtime-dispatch times out, disconnects, or returns an unreadable response, do not immediately retry with forceLaunchNew. First inspect assignments/runtime-state and the exact work item; if any open or recently completed assignment already exists for the same workItemId and role, treat dispatch as pending or idempotently successful, poll/wake that assignment, and create a separate work item only when you truly need another parallel agent.',
            'Before runtime-dispatch, re-read the exact work item by id and verify it belongs to this project, is still READY, and is not CANCELLED, REJECTED, ACCEPTED, or superseded by a newer duplicate. For every host or workspace URL, copy projectId, goalId, workItemId, and assignmentId exactly from the latest API object fields; never type ids from memory, truncate ids, invent UUID segments, or infer ids from titles. Do not reuse ids from failed response parsing or items you just cancelled. Parse dispatch responses from assignment.id, assignment.status, assignment.assigneeUser, launchedRuntime, and idempotent; do not assume top-level assignmentId/runtimeId/status.',
            '7. In manual dispatch fallback, dispatch the item to the chosen worker with launchIfMissing: true and a scoped task packet. The packet must include objective, workItem id/title, scopeBrief, acceptanceCriteria, inputPacket, outputContract, dependencies, projectFiles/read hints when files are referenced, and expected handoff. Never include actual credential, token, cookie, authorization header, API key, or account identifier values in contextPacket; include only resource keys/env var names and tell the assignee to read saved globals or runtime env. Automated agent work items should be unowned until dispatched; set ownerId only for human owner resource, approval, or decision items. Do not create a WORKER_AGENT assignment to the lead member or owner account itself for automated work.',
            'For HackerOne target goals, do not pre-create broad target-account/API-token resource requests just because a goal may eventually need authenticated testing. First create a narrow unauthenticated/passive Phase 1 SECURITY_TEST worker item for resource inventory and hypothesis confirmation, then leave it for the COORDINATOR unless the coordinator is disabled. Create owner resource-request work items only after a worker handoff names stable minimum keys, or when the program policy makes even Phase 1 impossible without that resource.',
            'For owner-visible confirmations, approvals, or external manual steps that are not secret values, create an owner action item instead of a fake resource: workType INTEGRATION, status READY, current goalId, high priority, and inputPacket.ownerAction with stable key, label, type, category, required, and prompt. Use resourceRequest only for values that must become project globals.',
            'Do not create ordinary INTEGRATION items for status reports, progress summaries, or FYI updates. Put status/progress summaries in runtime comments, project files, or the assignment handoff; create an ownerAction item only when the owner must approve, confirm, or perform a concrete external step.',
            '8. After manual dispatch, tell the worker to start from the assignment inbox/task packet, read referenced projectFiles before analysis, and create a run before substantive work.',
            '9. To audit assignment health, use GET $AIFACTORY_API_BASE_URL/projects/{projectId}/assignments/runtime-state?limit=100 with Authorization: Bearer $AIFACTORY_RUNTIME_TOKEN. It returns a JSON object with assignments (and data as a compatibility alias); read the assignments array. Each row includes assignment status, linked work item status, assignee runtime availability, health.stale/staleReasons, and public workspace recovery endpoints without secrets. Assignment statuses are PROPOSED/ACTIVE/PAUSED/COMPLETED/FAILED; work-item statuses are READY/ASSIGNED/IN_PROGRESS/IN_REVIEW/ACCEPTED/CANCELLED/etc. Treat open assignments (PROPOSED/ACTIVE/PAUSED) whose assigneeRuntime.available is false, whose health.stale is true, or whose linked work item is CANCELLED/ACCEPTED/REJECTED as stale. Before any new dispatch, make the open-stale set zero: mark each stale assignment failed through PATCH $AIFACTORY_API_BASE_URL/projects/{projectId}/work-items/{workItemId}/assignments/{assignmentId}/runtime-update with {"status":"FAILED","contextPacket":{"staleDispatch":{"reason":"..."}}}. If a stale PATCH fails, create an owner-visible coordination blocker and do not dispatch more work until the stale assignment is resolved. Retry with runtime-dispatch or create a focused revision item only when the linked work item still needs work.',
            '10. If an assignment fails or times out, inspect runtime-state failureContext.localRunnerFailure or the assignment contextPacket.localRunnerFailure. When it includes runtime.memberId or workspaceListEndpoint, use GET $AIFACTORY_API_BASE_URL/public/projects/{projectId}/agent-runtimes/{memberId}/workspace?maxDepth=4 and /workspace/download?path=... with Authorization: Bearer $AIFACTORY_RUNTIME_TOKEN to recover useful local files, copy sanitized deliverables into project shared storage, then create a focused revision item instead of discarding the work.',
            'If available runtime budget is below the required AWS cloud launch cost, do not launch a paid cloud runtime; use local runner if available, create a proposal, or ask the owner to increase the project runtime budget.',
          ]
        : []),
      role === 'WORKER_AGENT'
        ? [
            '[Worker execution contract]',
            'Start from the newest ASSIGNMENT_DISPATCH inbox item, active assignment, or latest user-provided scoped packet.',
            'Treat every assignment as independent unless the packet explicitly says sameGoalContinuation or allowWorkerReuse. On a new goal/program, ignore prior target conclusions in the conversation, re-read the current assignment packet and referenced project files, and write artifacts only under the current program paths.',
            'If no actionable assignment, task packet, or scoped instruction exists, inspect the project board/work items and assignment summaries for one self-selectable item. Prefer READY, and use DRAFT only when the scope is already clear enough.',
            'A self-selectable item must be unowned, unassigned, have no open PROPOSED/ACTIVE/PAUSED assignment, have no owner/assignee-like field pointing to another member or agent, and must not be blocked by dependencies unless the work is specifically to unblock it.',
            'Do not steal, reassign, or work on items that belong to another agent. If every item is owned, assigned, blocked, or too vague, report idle state and the first concrete blocker instead of doing unrelated work.',
            'Before changing anything, identify the workItem id/title, objective, scopeBrief, acceptanceCriteria, inputPacket, outputContract, and dependencies. If any of these are missing, infer only the minimum from the latest scoped instruction and name that assumption.',
            'If the missing information is a real blocker, add a visible owner question through POST $AIFACTORY_API_BASE_URL/projects/{projectId}/work-items/{workItemId}/runtime-comments with JSON {"content":"@owner ..."} using AIFACTORY_RUNTIME_TOKEN, or send an agent-workspace QUESTION message mentioning the owner member, then stop that unclear path.',
            'If the blocker is an owner-controlled resource and your runtime has WORK_ITEM_CREATE, create an owner resource-request work item through agent-workspace POST $AGENT_WORKSPACE_BASE_URL/v1/projects/$AGENT_WORKSPACE_PROJECT_ID/work-items with Authorization: Bearer $AGENT_WORKSPACE_TOKEN. Use title "Resource Request: <resource label>", workType INTEGRATION, status READY, the current goalId when known, high priority, and inputPacket.resourceRequest with stable key, label, description, isSecret, category, required, createTaskOnMissing, and value: ""; the workspace service owner-assigns resource-request packets. Do not leave the visible title as only "Resource Request:"; include the label or key. Each resourceRequest maps to one project global, so create separate items for email/phone/username, password, bearer/cookie, tenant/org id, and account B fields when they are required. If creation fails, add a runtime comment naming the exact missing resource keys.',
            'If the blocker is an owner confirmation, approval, CAPTCHA/OTP/manual external step, account activation email, email verification link, invite acceptance, or decision that does not itself store a secret value, create an owner action work item instead: workType INTEGRATION, status READY, current goalId when known, high priority, and inputPacket.ownerAction with stable key, label, type, category, required, and prompt. Use resourceRequest only for saved project-global values, and do not leave this kind of blocker only in a runtime comment.',
            'Do not create ordinary INTEGRATION items for status reports, progress summaries, or FYI updates. Put status/progress summaries in runtime comments, project files, or the assignment handoff; create an ownerAction item only when the owner must approve, confirm, or perform a concrete external step.',
            'When the packet contains projectFiles or inputPacket.projectFiles, read each referenced project file through project-file-read or /files/read before analysis. If a file cannot be read, record it as a blocker instead of pretending it was analyzed.',
            'For long security/research tasks, complete a bounded first pass instead of trying to exhaust the target in one turn. Save verified notes/evidence to project shared files, mark the assignment COMPLETED with a handoff, and create or recommend follow-up work for remaining hypotheses.',
            'For HackerOne/security work, keep information-disclosure and misconfiguration observations as candidates until impact is proven. Do not submit synthetic telemetry, fake error reports, support tickets, webhooks, email/SMS traffic, or other third-party side-effect probes unless the owner explicitly approves a safe, program-allowed validation path.',
            'For self-selected idle work, claim the item before implementation through POST $AIFACTORY_API_BASE_URL/projects/{projectId}/work-items/{workItemId}/assignments/runtime-claim using AIFACTORY_RUNTIME_TOKEN, then use the returned assignment.id and updateEndpoint for all progress updates. If claim fails, stop that item and report the concrete reason.',
            'Update your own assignment through PATCH $AIFACTORY_API_BASE_URL/projects/{projectId}/work-items/{workItemId}/assignments/{assignmentId}/runtime-update using AIFACTORY_RUNTIME_TOKEN: set ACTIVE before substantive work and COMPLETED after artifacts and handoff. COMPLETED moves the work item to IN_REVIEW.',
            'Create or update an execution run before substantive implementation when the project API/tool is available. Tie runs, artifacts, runtime-comments JSON {"content":"..."}, and handoff to both workItemId and the claimed/assigned assignmentId whenever an assignment exists.',
            'For code work, prefer concrete shell and git execution in the repo workspace over describing a plan. If the message asks for a local commit, make the edit, commit it, and reply with the branch and commit SHA.',
            'Finish with a reviewable handoff containing: changed files or artifacts, verification commands/results, acceptance criteria status, residual risks, and reviewer instructions.',
          ].join('\n')
        : 'Prefer acting through the available tools when the task asks for concrete work.',
      'For optional choices, ambiguous preferences, or low-risk tradeoffs, make the best reasonable default choice yourself, continue, and briefly state the assumption. Do not stop only to ask the user to pick between acceptable options.',
      'Only stop and ask for confirmation when a truly dangerous command, irreversible action, credential exposure, external spend, or explicit human approval gate is required.',
    ].join('\n');
  }

  private async leadRuntimeProjectContextPrompt(projectId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { name: true, summary: true, settings: true },
    }).catch(() => null);
    const settings =
      project?.settings && typeof project.settings === 'object' && !Array.isArray(project.settings)
        ? project.settings as Record<string, any>
        : {};
    const taskProject = settings.hackerOneTaskProject || settings.taskProject;
    const source = taskProject?.source || settings.sourceTask || {};

    if (source.taskSource !== 'HACKERONE' && source.rawTaskSource !== 'HACKERONE_PROGRAM') {
      return [];
    }

    const program = taskProject?.program || {};
    const scope = taskProject?.scope || {};
    const rewards = taskProject?.rewards || {};
    const policy = taskProject?.policy || {};
    const testing = taskProject?.testing || {};
    const reportTemplate = Array.isArray(taskProject?.reportTemplate) ? taskProject.reportTemplate : [];
    const scopeCatalog = Array.isArray(taskProject?.scopeCatalog) ? taskProject.scopeCatalog : [];
    const scopeSummary =
      taskProject?.scopeSummary && typeof taskProject.scopeSummary === 'object' && !Array.isArray(taskProject.scopeSummary)
        ? taskProject.scopeSummary
        : {};
    const hasScopeCatalog = scopeCatalog.length > 0 || String(scope.assetType || '').toUpperCase() === 'PROGRAM';
    const assetTypeSummary = Array.isArray(scopeSummary.assetTypes)
      ? scopeSummary.assetTypes
          .map((item: any) => `${item?.assetType || 'unknown'} (${item?.count || 0})`)
          .filter(Boolean)
          .join(', ')
      : scopeSummary.assetTypeSummary || '';
    const requiredHeaders = Array.isArray(testing.requiredHeaders)
      ? testing.requiredHeaders
          .map((header: any) => [header?.name, header?.value].filter(Boolean).join(': '))
          .filter(Boolean)
      : [];
    const exclusions = Array.isArray(policy.scopeExclusions)
      ? policy.scopeExclusions
          .map((item: any) => [item?.category, item?.details].filter(Boolean).join(': '))
          .filter(Boolean)
          .slice(0, 8)
      : [];
    const rewardText =
      scopeSummary?.topRewardRange?.rawAmount ||
      rewards?.scopeRange?.rawAmount ||
      this.hackerOneRewardRangeText(rewards) ||
      source.currency ||
      '';

    return [
      '[HackerOne bounty lead context]',
      `This project was created from HackerOne task "${source.taskTitle || project?.name || projectId}".`,
      source.sourceUrl ? `Source link: ${source.sourceUrl}.` : '',
      `Program: ${program.name || program.handle || 'unknown'}${program.handle ? ` (${program.handle})` : ''}.`,
      hasScopeCatalog
        ? `Imported scope catalog: ${scopeSummary.totalEligibleScopes || scopeCatalog.length || 'unknown'} eligible scopes${assetTypeSummary ? `; asset types: ${assetTypeSummary}` : ''}; max imported severity: ${scopeSummary.maxSeverity || scope.maxSeverity || 'unknown'}.`
        : `Scope asset: ${scope.assetIdentifier || 'unknown'}${scope.assetType ? ` (${scope.assetType})` : ''}; max severity: ${scope.maxSeverity || 'unknown'}; bounty eligible: ${scope.eligibleForBounty === false ? 'no' : 'yes/unknown'}.`,
      rewardText ? `Reward guidance: ${rewardText}.` : '',
      requiredHeaders.length ? `Required testing headers: ${requiredHeaders.join('; ')}.` : 'No required testing headers were imported; verify before testing.',
      exclusions.length ? `Out-of-scope exclusions to enforce: ${exclusions.join(' | ')}.` : '',
      reportTemplate.length ? `Imported HackerOne report template fields: ${reportTemplate.join(' | ')}.` : '',
      hasScopeCatalog
        ? 'Planner gate: choose concrete scope(s) from scopeCatalog before any SECURITY_TEST work; prioritize URL/API/WILDCARD and similarly safe web/API surfaces, and justify mobile/executable/OTHER selections explicitly.'
        : '',
      'The full task packet is stored in project.settings.hackerOneTaskProject and repeated on each HackerOne workItem.inputPacket as source, program, scope, scopeSummary, scopeCatalog, policy, testing, rewards, and reportTemplate. Read those fields before dispatching.',
      'HackerOne dispatch gate: first process READY INTAKE and PLANNING items. Do not dispatch DRAFT SECURITY_TEST, SECURITY_REVIEW, or REPORT items until dependencies are accepted and the owner or lead has explicitly approved a scoped, non-destructive validation plan.',
      'Preferred role routing: INTAKE/PLANNING -> PLANNER_AGENT; SECURITY_TEST -> WORKER_AGENT only after the plan gate; SECURITY_REVIEW -> SECURITY_AUDITOR; REPORT -> INTEGRATOR_AGENT; optional final report QA -> REVIEW_AGENT.',
      'When dispatching any HackerOne item, include a contextPacket that preserves source task id/link, program handle, selected scope asset or scopeCatalog reference, required headers, exclusions, reward/severity guidance, report template, dependencies, and the expected handoff contract.',
    ].filter(Boolean);
  }

  private legacyResponseNeedsConfirmation(output: string) {
    return /requires approval|dangerous command requires approval|\/approve|需要.*确认|等待.*确认|批准|确认/.test(
      output || '',
    );
  }

  private appendRuntimeMessage(
    session: AgentRuntimeSession,
    role: 'user' | 'assistant' | 'system' | 'tool',
    content: string,
    status?: string,
  ) {
    return [
      ...(session.messageHistory || []),
      {
        id: randomUUID(),
        role,
        content,
        createdAt: new Date().toISOString(),
        status: status || null,
      },
    ].slice(-80);
  }

  private upsertRuntimeMessage(
    session: AgentRuntimeSession,
    message: AgentRuntimeMessage,
  ) {
    const history = [...(session.messageHistory || [])];
    const existingIndex = history.findIndex((entry) => entry.id === message.id);
    if (existingIndex >= 0) {
      history[existingIndex] = {
        ...history[existingIndex],
        ...message,
      };
      return history.slice(-80);
    }
    if (message.role === 'assistant' && message.content?.trim()) {
      const latestUserIndex = history.map((entry) => entry.role).lastIndexOf('user');
      const duplicateAssistantIndex = history.findIndex((entry, index) => {
        if (index <= latestUserIndex) return false;
        if (entry.role !== 'assistant') return false;
        if (entry.content?.trim() !== message.content.trim()) return false;
        return entry.status === 'TYPING' || message.status !== 'TYPING';
      });
      if (duplicateAssistantIndex >= 0) {
        history[duplicateAssistantIndex] = {
          ...history[duplicateAssistantIndex],
          ...message,
          id: history[duplicateAssistantIndex].id,
          createdAt: history[duplicateAssistantIndex].createdAt || message.createdAt,
        };
        return history.slice(-80);
      }
    }
    return [...history, message].slice(-80);
  }

  private updateRuntimeConversationHistory(
    session: AgentRuntimeSession,
    conversationId: string | null | undefined,
    messageHistory: AgentRuntimeMessage[],
    updates: Partial<AgentRuntimeSession> = {},
  ) {
    const normalized = this.normalizeRuntimeSessionConversations(session);
    const targetId = conversationId || normalized.activeConversationId || normalized.conversations?.[0]?.id;
    if (!targetId) {
      return {
        ...normalized,
        ...updates,
        messageHistory,
      };
    }

    const now = updates.updatedAt || new Date().toISOString();
    let foundTarget = false;
    const conversations = (normalized.conversations || []).map((conversation) => {
      if (conversation.id !== targetId) return conversation;
      foundTarget = true;
      return {
        ...conversation,
        title: conversation.titleLocked
          ? conversation.title
          : this.runtimeConversationTitle(messageHistory, conversation.title),
        updatedAt: this.runtimeConversationUpdatedAt(messageHistory, now),
        messageHistory,
      };
    });
    if (!foundTarget) {
      conversations.unshift({
        id: targetId,
        title: this.runtimeConversationTitle(messageHistory, 'Conversation'),
        titleLocked: false,
        createdAt: normalized.launchedAt || now,
        updatedAt: this.runtimeConversationUpdatedAt(messageHistory, now),
        messageHistory,
      });
    }

    const shouldFocusRequestConversation =
      Boolean(updates.activeRequestId) &&
      updates.activeRequestConversationId === targetId &&
      updates.status === 'TYPING';
    const activeConversationId = shouldFocusRequestConversation
      ? targetId
      : normalized.activeConversationId && conversations.some((conversation) => conversation.id === normalized.activeConversationId)
        ? normalized.activeConversationId
        : targetId;
    const activeConversation = conversations.find((conversation) => conversation.id === activeConversationId);

    return {
      ...normalized,
      ...updates,
      activeConversationId,
      conversations,
      messageHistory: activeConversation?.messageHistory || [],
    };
  }

  private activeRequestScopedUpdates(
    session: AgentRuntimeSession,
    requestId: string,
    updates: Partial<AgentRuntimeSession>,
  ): Partial<AgentRuntimeSession> {
    if (!session.activeRequestId || session.activeRequestId === requestId) {
      return updates;
    }
    return {
      ...(updates.updatedAt ? { updatedAt: updates.updatedAt } : {}),
      ...(updates.localRunnerBridge ? { localRunnerBridge: updates.localRunnerBridge } : {}),
    };
  }

  private shouldPublishPartialRuntimeResponse(previousText: string, nextText: string) {
    const previous = previousText || '';
    const next = nextText || '';
    const added = next.startsWith(previous) ? next.slice(previous.length).trim() : next.trim();
    if (!added) return false;
    if (added.length >= 16) return true;
    return /[.!?。！？\n]$/.test(added);
  }

  private runtimeSupportsSteering(session: AgentRuntimeSession) {
    const agentType = String(session.agentType || '').trim().toLowerCase().replace(/_/g, '-');
    return (
      agentType === 'pi' &&
      session.provider === 'local-docker' &&
      session.piBackend === 'rpc'
    );
  }

  private runtimeCanAcceptSteer(session: AgentRuntimeSession, conversationId?: string | null) {
    if (!this.runtimeSupportsSteering(session)) return false;
    if (!this.runtimeHasStreamingResponse(session)) return false;
    const activeConversationId = session.activeRequestConversationId || session.activeConversationId || null;
    const targetConversationId = conversationId || session.activeConversationId || activeConversationId;
    return Boolean(activeConversationId && targetConversationId === activeConversationId);
  }

  private agentRuntimeChatTimeoutMs() {
    const configured = this.configService.get<string>('HERMES_AGENT_CHAT_TIMEOUT_MS');
    const numeric = configured ? Number(configured) : DEFAULT_AGENT_RUNTIME_CHAT_TIMEOUT_MS;
    return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
  }

  private localRunnerBridgeTimeoutMs() {
    const configured = this.configService.get<string>('HERMES_AGENT_LOCAL_RUNNER_BRIDGE_TIMEOUT_MS');
    const numeric = configured ? Number(configured) : DEFAULT_LOCAL_RUNNER_BRIDGE_TIMEOUT_MS;
    return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
  }

  private agentRuntimeProgressHeartbeatMs() {
    const configured =
      this.configService.get<string>('HERMES_AGENT_RUNTIME_PROGRESS_HEARTBEAT_MS') ||
      this.configService.get<string>('AGENTCRAFT_RUNTIME_PROGRESS_HEARTBEAT_MS');
    const numeric = configured ? Number(configured) : 8000;
    return Number.isFinite(numeric) && numeric > 0 ? Math.max(1000, numeric) : 8000;
  }

  private formatElapsedRuntimeTime(ms: number) {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
  }

  private runtimeProgressLabel(session: AgentRuntimeSession) {
    const provider = String(session.provider || '').trim().toLowerCase();
    const agentType = String(session.agentType || 'agent').trim().toLowerCase().replace(/_/g, '-') || 'agent';
    if (provider === 'local-codex') return 'Local Codex';
    if (provider === 'local-runner') return agentType === 'pi' ? 'Local runner Pi agent' : 'Local runner';
    if (provider === 'local-docker') return agentType === 'pi' ? 'Local Docker Pi agent' : `Local Docker ${agentType} agent`;
    if (provider === 'aws-agentcore') return agentType === 'agent' ? 'AgentCore runtime' : `AgentCore ${agentType} agent`;
    if (provider === 'aws-ecs') return agentType === 'agent' ? 'ECS runtime' : `ECS ${agentType} agent`;
    return agentType === 'agent' ? 'Runtime' : `${agentType} agent`;
  }

  private describeRuntimeProgressActivity(
    session: AgentRuntimeSession,
    requestId: string,
    startedAtMs: number,
  ) {
    const elapsed = this.formatElapsedRuntimeTime(Date.now() - startedAtMs);
    const bridgeRequest = session.localRunnerBridge?.requests?.find((request) => request.id === requestId);
    const bridgeStatusText = this.sanitizeLocalRunnerStatusText(bridgeRequest?.statusText);
    if (bridgeStatusText && !/^thinking$/i.test(bridgeStatusText)) {
      return `${bridgeStatusText} (${elapsed} elapsed)`;
    }

    const activity = String(session.currentActivity || '').trim();
    const canExtendActivity =
      activity &&
      !/^thinking$/i.test(activity) &&
      !/^streaming response/i.test(activity) &&
      !/^reading context and responding to:/i.test(activity) &&
      !/\belapsed\)$/i.test(activity);
    if (canExtendActivity) {
      return `${activity} (${elapsed} elapsed)`;
    }

    const verb = this.isQueuedLocalRuntimeProvider(session.provider)
      ? 'is processing the message'
      : 'is still working';
    return `${this.runtimeProgressLabel(session)} ${verb} (${elapsed} elapsed)`;
  }

  private sleep(ms: number) {
    return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
  }

  private agentModelSendQueueKey(session: AgentRuntimeSession) {
    const serializeLocal = this.configService.get<string>('HERMES_AGENT_SERIALIZE_LOCAL_MODEL_REQUESTS');
    if (serializeLocal && ['0', 'false', 'no'].includes(serializeLocal.toLowerCase())) return null;
    if (session.provider !== 'local-docker') return null;
    const llm = session.llm || {};
    const apiUrl = String((llm as any).apiUrl || '');
    const configId = String((llm as any).configId || '');
    if (!apiUrl || !/host\.docker\.internal|localhost|127\.0\.0\.1/i.test(apiUrl)) return null;
    return configId || apiUrl;
  }

  private async withAgentModelSendSlot<T>(session: AgentRuntimeSession, operation: () => Promise<T>): Promise<T> {
    const key = this.agentModelSendQueueKey(session);
    if (!key) return operation();

    const previous = this.agentModelSendQueues.get(key) || Promise.resolve();
    let releaseCurrent: () => void = () => undefined;
    const current = previous
      .catch(() => undefined)
      .then(() => new Promise<void>((resolve) => {
        releaseCurrent = resolve;
      }));
    this.agentModelSendQueues.set(key, current);
    await previous.catch(() => undefined);

    try {
      return await operation();
    } finally {
      releaseCurrent();
      if (this.agentModelSendQueues.get(key) === current) {
        this.agentModelSendQueues.delete(key);
      }
    }
  }

  private isRetryableWorkspaceMutationError(error: any) {
    const message = String(error?.message || error?.response?.message || error || '');
    return (
      /Deadlock found|Lock wait timeout|Duplicate entry|project_events_projectId_seq_key/i.test(message) ||
      /\b1213\b|\b1205\b/i.test(message)
    );
  }

  private async withWorkspaceMutationRetry<T>(operation: () => Promise<T>, label: string, maxAttempts = 5) {
    let lastError: any;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;
        if (!this.isRetryableWorkspaceMutationError(error) || attempt === maxAttempts) {
          throw error;
        }
        this.logger.warn(
          `Retrying workspace mutation ${label} after transient concurrency failure (${attempt}/${maxAttempts}): ${error?.message || error}`,
        );
        await this.sleep(50 * attempt + Math.floor(Math.random() * 75));
      }
    }
    throw lastError;
  }

  private agentRuntimeTypingStaleMs() {
    const configured = this.configService.get<string>('HERMES_AGENT_TYPING_STALE_MS');
    if (configured) {
      return Number(configured);
    }
    const chatTimeoutMs = this.agentRuntimeChatTimeoutMs();
    return chatTimeoutMs > 0 ? chatTimeoutMs + 60 * 1000 : 0;
  }

  private agentRuntimeOrphanGraceMs() {
    const configured = this.configService.get<string>('HERMES_AGENT_ORPHAN_GRACE_MS');
    if (configured) {
      return Number(configured);
    }
    const chatTimeoutMs = this.agentRuntimeChatTimeoutMs();
    return chatTimeoutMs > 0 ? chatTimeoutMs + 60 * 1000 : 0;
  }

  private localRunnerMissingRequestGraceMs() {
    const configured = this.configService.get<string>('HERMES_AGENT_LOCAL_RUNNER_MISSING_REQUEST_GRACE_MS');
    return configured ? Number(configured) : 10_000;
  }

  private localRunnerActiveRequestStaleMs() {
    const configured =
      this.configService.get<string>('HERMES_AGENT_LOCAL_RUNNER_ACTIVE_REQUEST_STALE_MS') ||
      this.configService.get<string>('AGENTCRAFT_LOCAL_RUNNER_ACTIVE_REQUEST_STALE_MS');
    if (configured) return Number(configured);

    const bridgeTimeoutMs = this.localRunnerBridgeTimeoutMs();
    if (bridgeTimeoutMs > 0) return bridgeTimeoutMs + 60_000;

    const typingStaleMs = this.agentRuntimeTypingStaleMs();
    if (typingStaleMs > 0) return typingStaleMs;

    return 15 * 60_000;
  }

  private sanitizeLocalRunnerStatusText(value?: string | null) {
    const text = String(value || '')
      .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '')
      .replace(/\r/g, '\n')
      .split('\n')
      .map((line) => line.replace(/^\s*(?:ERROR|WARN|INFO|DEBUG):\s*/i, '').trim())
      .filter(Boolean)
      .slice(-1)[0];
    return text ? text.slice(0, 180) : null;
  }

  private localRunnerHeartbeatStaleMs() {
    const configured = this.configService.get<string>('AGENTCRAFT_LOCAL_RUNNER_STALE_MS');
    return configured ? Number(configured) : 30_000;
  }

  private localRunnerHeartbeatRefreshMs() {
    const configured = this.configService.get<string>('AGENTCRAFT_LOCAL_RUNNER_HEARTBEAT_REFRESH_MS');
    return configured ? Number(configured) : 5_000;
  }

  private localRunnerHeartbeatAgeMs(session: AgentRuntimeSession) {
    const lastSeenAt = session.localRunnerBridge?.lastSeenAt;
    const lastSeenAtMs = lastSeenAt ? Date.parse(lastSeenAt) : Number.NaN;
    return Number.isFinite(lastSeenAtMs) ? Date.now() - lastSeenAtMs : Number.POSITIVE_INFINITY;
  }

  private isLocalRuntimeClaimable(session: AgentRuntimeSession, provider: 'local-runner' | 'local-codex') {
    if (session.provider !== provider) return false;
    const waitingStatus = provider === 'local-codex' ? 'WAITING_LOCAL_CODEX' : 'WAITING_LOCAL_RUNNER';
    const queuedScheme = provider === 'local-codex' ? 'local-codex://' : 'local-runner://';
    if (session.localRunnerJob) {
      if (!session.apiBaseUrl) {
        const hasPendingBridgeRequest = Boolean(
          session.localRunnerBridge?.requests?.some((request) =>
            ['PENDING', 'RUNNING'].includes(request.status),
          ),
        );
        if (hasPendingBridgeRequest) return true;
        if (['IDLE', 'ERROR'].includes(session.status || '')) return true;
      }
      if (
        session.apiBaseUrl?.startsWith(queuedScheme) &&
        this.localRunnerHeartbeatAgeMs(session) > this.localRunnerHeartbeatStaleMs()
      ) {
        return true;
      }
      if (session.status === waitingStatus) return true;
      if (session.status === 'STARTING') {
        return this.localRunnerHeartbeatAgeMs(session) > this.localRunnerHeartbeatStaleMs();
      }
      return false;
    }
    if (session.apiBaseUrl?.startsWith(queuedScheme)) {
      if (this.localRunnerHeartbeatAgeMs(session) > this.localRunnerHeartbeatStaleMs()) {
        return true;
      }
      return false;
    }
    if (session.apiBaseUrl) return false;
    return [waitingStatus, 'STARTING', 'ERROR', 'IDLE'].includes(session.status || '');
  }

  private withLocalRunnerHeartbeat(
    session: AgentRuntimeSession,
    now: string,
    updates: Partial<NonNullable<AgentRuntimeSession['localRunnerBridge']>> = {},
  ): AgentRuntimeSession {
    return {
      ...session,
      localRunnerBridge: {
        requests: session.localRunnerBridge?.requests || [],
        connectedAt: session.localRunnerBridge?.connectedAt || now,
        lastSeenAt: now,
        disconnectedAt: null,
        disconnectReason: null,
        ...updates,
      },
    };
  }

  private connectedQueuedLocalRuntimeSession(
    session: AgentRuntimeSession,
    provider: 'local-runner' | 'local-codex',
    now = new Date().toISOString(),
  ): AgentRuntimeSession {
    const queuedScheme = provider === 'local-codex' ? 'local-codex://' : 'local-runner://';
    const providerLabel = provider === 'local-codex' ? 'Local Codex' : 'Local runner';
    if (session.apiBaseUrl && !session.apiBaseUrl.startsWith(queuedScheme)) {
      return session;
    }
    const hasActiveRequest = Boolean(
      session.activeRequestId &&
      session.localRunnerBridge?.requests?.some((request) =>
        request.id === session.activeRequestId && ['PENDING', 'RUNNING'].includes(request.status),
      ),
    );
    const needsReconnect =
      !session.apiBaseUrl ||
      ['ERROR', 'STARTING', 'WAITING_LOCAL_CODEX', 'WAITING_LOCAL_RUNNER'].includes(session.status || '');
    if (!needsReconnect && session.apiBaseUrl?.startsWith(queuedScheme)) {
      return session;
    }
    const apiBaseUrl = session.apiBaseUrl || `${queuedScheme}${session.runtimeId}`;
    const status = hasActiveRequest || session.status === 'TYPING' ? 'TYPING' : 'IDLE';
    return {
      ...session,
      apiBaseUrl,
      status,
      dockerStatus: {
        running: true,
        status: 'runner-connected',
        localRunner: provider === 'local-runner',
        localCodex: provider === 'local-codex',
      },
      apiHealth: {
        ok: true,
        statusCode: 200,
        localRunner: provider === 'local-runner',
        localCodex: provider === 'local-codex',
      },
      currentActivity:
        status === 'TYPING'
          ? session.currentActivity || `${providerLabel} is processing the message`
          : `${providerLabel} connected`,
      lastError: status === 'TYPING' ? session.lastError || null : null,
      updatedAt: now,
    };
  }

  private shouldRefreshLocalRunnerHeartbeat(session: AgentRuntimeSession) {
    const lastSeenAt = session.localRunnerBridge?.lastSeenAt;
    if (!lastSeenAt) return true;
    return this.localRunnerHeartbeatAgeMs(session) >= this.localRunnerHeartbeatRefreshMs();
  }

  private runtimeActiveRequestAgeMs(session: AgentRuntimeSession) {
    const anchor = session.lastStreamAt || session.activeRequestStartedAt || session.lastMessageAt;
    const anchorMs = anchor ? Date.parse(anchor) : Number.NaN;
    return Number.isFinite(anchorMs) ? Date.now() - anchorMs : Number.POSITIVE_INFINITY;
  }

  private isRuntimeTypingStale(session: AgentRuntimeSession) {
    const staleMs = this.agentRuntimeTypingStaleMs();
    if (staleMs <= 0) return false;
    return session.status === 'TYPING' && this.runtimeActiveRequestAgeMs(session) > staleMs;
  }

  private assignmentIdleRuntimeStaleMs() {
    const configured = this.configService.get<string>('AGENTCRAFT_ASSIGNMENT_IDLE_STALE_MS');
    return configured ? Number(configured) : 120_000;
  }

  private dateLikeMs(value: unknown) {
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'string' || typeof value === 'number') {
      const parsed = Date.parse(String(value));
      return Number.isFinite(parsed) ? parsed : Number.NaN;
    }
    return Number.NaN;
  }

  private openAssignmentIdleRuntimeStaleReasons(
    assignment: { status?: unknown; startedAt?: unknown; updatedAt?: unknown; createdAt?: unknown },
    runtimeState: { available?: boolean; session?: AgentRuntimeSession | null },
    nowMs = Date.now(),
  ) {
    if (String(assignment.status || '').toUpperCase() !== 'ACTIVE') return [];

    const anchorMs = Math.max(
      this.dateLikeMs(assignment.startedAt),
      this.dateLikeMs(assignment.updatedAt),
      this.dateLikeMs(assignment.createdAt),
    );
    const staleMs = this.assignmentIdleRuntimeStaleMs();
    if (!Number.isFinite(anchorMs) || staleMs <= 0 || nowMs - anchorMs < staleMs) return [];

    if (!runtimeState.available) return [];
    if (!runtimeState.session) return ['runtime_session_missing'];

    const session = runtimeState.session;
    const hasActiveRequest = Boolean(
      session.activeRequestId ||
      session.activeRequestStartedAt ||
      session.activeRequestConversationId ||
      (session as any).activeRequest?.id,
    );
    if (hasActiveRequest) return [];

    const runtimeStatus = String(session.status || '').toUpperCase();
    if (['IDLE', 'READY'].includes(runtimeStatus)) return ['runtime_idle_without_active_request'];
    if (runtimeStatus === 'TYPING') {
      const lastStreamMs = this.dateLikeMs((session as any).lastStreamAt);
      if (Number.isFinite(lastStreamMs) && nowMs - lastStreamMs < staleMs) return [];
      return ['runtime_typing_without_active_request'];
    }
    if (!runtimeStatus) return ['runtime_status_missing'];
    return [];
  }

  private recoverStaleTypingSession(session: AgentRuntimeSession) {
    const recoveryMessage = 'Previous background message stalled and was reset.';
    return {
      ...session,
      status: 'ERROR',
      activeRequestId: null,
      activeRequestStartedAt: null,
      activeRequestConversationId: null,
      updatedAt: new Date().toISOString(),
      currentActivity: 'Recovered from a stalled background message',
      lastError: recoveryMessage,
      messageHistory: this.appendRuntimeMessage(session, 'system', recoveryMessage, 'ERROR'),
    };
  }

  private finalizeLocalRunnerBridgeRequestSession(
    session: AgentRuntimeSession,
    request: AgentRuntimeLocalRunnerBridgeRequest,
  ): AgentRuntimeSession {
    const failed = request.status === 'ERROR' || Boolean(request.error);
    const now = new Date().toISOString();
    const assistantMessageId = request.assistantMessageId || `local-runner-${request.id}-assistant`;
    const outputText = request.outputText || '';
    const errorMessage = request.error || 'Local runner failed to process the message';
    const requestSession: AgentRuntimeSession = {
      ...session,
      localRunnerBridge: {
        ...(session.localRunnerBridge || {}),
        requests: [
          ...(session.localRunnerBridge?.requests || []).filter((item) => item.id !== request.id),
          request,
        ].slice(-20),
      },
    };

    if (failed) {
      const timedOut = this.isAgentRuntimeTimeoutError(errorMessage);
      const nextStatus = timedOut ? 'IDLE' : 'ERROR';
      const messageStatus = timedOut ? 'WARNING' : 'ERROR';
      const outputSession = outputText.trim()
        ? {
            ...requestSession,
            messageHistory: this.upsertRuntimeMessage(requestSession, {
              id: assistantMessageId,
              role: 'assistant',
              content: outputText,
              createdAt: request.completedAt || now,
              status: messageStatus,
            }),
          }
        : requestSession;
      const shouldAppendError = !outputText.includes(errorMessage);
      return {
        ...outputSession,
        status: nextStatus,
        activeRequestId: null,
        activeRequestStartedAt: null,
        activeRequestConversationId: null,
        lastStreamAt: outputText.trim() ? outputSession.lastStreamAt || now : outputSession.lastStreamAt,
        updatedAt: now,
        currentActivity: timedOut ? 'Response timed out; ready for another message' : 'Local runner returned an error',
        lastError: errorMessage,
        recentActions: Array.isArray(request.recentActions) ? request.recentActions : outputSession.recentActions,
        messageHistory: shouldAppendError
          ? this.appendRuntimeMessage(outputSession, 'system', errorMessage, messageStatus)
          : outputSession.messageHistory,
      };
    }

    const nextStatus = this.responseNeedsConfirmation(outputText) ? 'WAITING_CONFIRMATION' : 'IDLE';
    return {
      ...requestSession,
      status: nextStatus,
      activeRequestId: null,
      activeRequestStartedAt: null,
      activeRequestConversationId: null,
      lastStreamAt: requestSession.lastStreamAt || now,
      lastResponseAt: now,
      updatedAt: now,
      currentActivity: this.describeRuntimeActivity(nextStatus, outputText, request.recentActions),
      lastError: null,
      recentActions: Array.isArray(request.recentActions) ? request.recentActions : requestSession.recentActions,
      messageHistory: this.upsertRuntimeMessage(requestSession, {
        id: assistantMessageId,
        role: 'assistant',
        content: outputText || '(No text response)',
        createdAt: request.completedAt || now,
        status: nextStatus,
      }),
    };
  }

  private shouldFinalizeLateLocalRunnerBridgeRequest(
    session: AgentRuntimeSession,
    request: AgentRuntimeLocalRunnerBridgeRequest,
  ) {
    if (!['COMPLETED', 'ERROR'].includes(request.status)) return false;
    if (session.activeRequestId) return false;
    if (!['ERROR', 'IDLE', 'STARTING', 'WAITING_LOCAL_CODEX', 'WAITING_LOCAL_RUNNER'].includes(session.status || '')) {
      return false;
    }
    const requestCreatedMs = Date.parse(request.createdAt || '');
    const lastMessageAtMs = session.lastMessageAt ? Date.parse(session.lastMessageAt) : Number.NaN;
    if (Number.isFinite(requestCreatedMs) && Number.isFinite(lastMessageAtMs) && lastMessageAtMs > requestCreatedMs + 1000) {
      return false;
    }
    const terminalAtMs = Date.parse(request.completedAt || request.updatedAt || '');
    const lastResponseAtMs = session.lastResponseAt ? Date.parse(session.lastResponseAt) : Number.NaN;
    if (Number.isFinite(lastResponseAtMs) && Number.isFinite(terminalAtMs) && lastResponseAtMs >= terminalAtMs) {
      return false;
    }
    const assistantMessageId = request.assistantMessageId || `local-runner-${request.id}-assistant`;
    const targetSession = (() => {
      try {
        return this.selectRuntimeConversation(session, request.conversationId || session.activeConversationId);
      } catch {
        return session;
      }
    })();
    const existingAssistant = (targetSession.messageHistory || []).find((message) => message.id === assistantMessageId);
    if (
      existingAssistant &&
      !['ERROR', 'TYPING', 'WARNING'].includes(String(existingAssistant.status || '').toUpperCase()) &&
      (existingAssistant.content || '').trim() === (request.outputText || '').trim()
    ) {
      return false;
    }
    return true;
  }

  private localRunnerBridgeRequestToFinalize(session: AgentRuntimeSession) {
    if (!this.isQueuedLocalRuntimeProvider(session.provider)) {
      return null;
    }
    const requests = session.localRunnerBridge?.requests || [];
    if (session.activeRequestId) {
      const activeRequest = requests.find((request) => request.id === session.activeRequestId);
      return activeRequest && ['COMPLETED', 'ERROR'].includes(activeRequest.status) ? activeRequest : null;
    }
    if (session.status === 'TYPING') {
      return requests.find((request) => ['COMPLETED', 'ERROR'].includes(request.status)) || null;
    }
    return [...requests]
      .reverse()
      .find((request) => this.shouldFinalizeLateLocalRunnerBridgeRequest(session, request)) || null;
  }

  private recoverTerminalLocalRunnerTypingSession(session: AgentRuntimeSession) {
    const bridgeRequest = this.localRunnerBridgeRequestToFinalize(session);
    if (!bridgeRequest) {
      return session;
    }
    return this.finalizeLocalRunnerBridgeRequestSession(session, bridgeRequest);
  }

  private localRunnerActiveRequestProgressAgeMs(
    session: AgentRuntimeSession,
    request: AgentRuntimeLocalRunnerBridgeRequest,
  ) {
    const anchors = [
      session.lastStreamAt,
      request.updatedAt,
      session.localRunnerBridge?.lastSeenAt,
      session.activeRequestStartedAt,
      session.lastMessageAt,
      request.createdAt,
    ]
      .map((value) => (value ? Date.parse(value) : Number.NaN))
      .filter((value) => Number.isFinite(value));
    if (!anchors.length) return Number.POSITIVE_INFINITY;
    return Date.now() - Math.max(...anchors);
  }

  private recoverStaleQueuedLocalActiveRequest(session: AgentRuntimeSession) {
    if (!this.isQueuedLocalRuntimeProvider(session.provider) || session.status !== 'TYPING' || !session.activeRequestId) {
      return session;
    }
    const bridgeRequest = session.localRunnerBridge?.requests?.find((request) => request.id === session.activeRequestId);
    if (!bridgeRequest || !['PENDING', 'RUNNING'].includes(bridgeRequest.status)) {
      return session;
    }
    if (this.agentRuntimeLauncher.hasActiveMessage(session.runtimeId, session.activeRequestId)) {
      return session;
    }

    const staleMs = this.localRunnerActiveRequestStaleMs();
    if (staleMs <= 0 || this.localRunnerActiveRequestProgressAgeMs(session, bridgeRequest) < staleMs) {
      return session;
    }

    const now = new Date().toISOString();
    const providerLabel = session.provider === 'local-codex' ? 'Local Codex' : 'Local runner';
    const recoveryMessage = `${providerLabel} request stopped making progress after the server lost its active wait state. Restart the project runner and retry the message.`;
    const failedRequest: AgentRuntimeLocalRunnerBridgeRequest = {
      ...bridgeRequest,
      status: 'ERROR',
      error: recoveryMessage,
      completedAt: now,
      updatedAt: now,
    };
    const requestSession: AgentRuntimeSession = {
      ...session,
      localRunnerBridge: {
        ...(session.localRunnerBridge || { requests: [] }),
        requests: [
          ...(session.localRunnerBridge?.requests || []).filter((request) => request.id !== failedRequest.id),
          failedRequest,
        ].slice(-20),
      },
    };
    const failedSession = this.finalizeLocalRunnerBridgeRequestSession(requestSession, failedRequest);
    const runnerOffline = this.localRunnerHeartbeatAgeMs(session) >= this.localRunnerHeartbeatStaleMs();
    if (!runnerOffline) {
      return failedSession;
    }

    const waitingStatus = session.provider === 'local-codex' ? 'WAITING_LOCAL_CODEX' : 'WAITING_LOCAL_RUNNER';
    return {
      ...failedSession,
      status: waitingStatus,
      apiBaseUrl: '',
      dockerStatus: {
        running: false,
        status: 'runner-heartbeat-stale',
        localRunner: session.provider === 'local-runner',
        localCodex: session.provider === 'local-codex',
      },
      apiHealth: {
        ok: false,
        statusCode: 0,
        localRunner: session.provider === 'local-runner',
        localCodex: session.provider === 'local-codex',
      },
      currentActivity: `${providerLabel} is offline. Restart the project runner to reconnect this runtime.`,
      lastError: recoveryMessage,
      localRunnerBridge: {
        ...(failedSession.localRunnerBridge || { requests: [] }),
        disconnectedAt: now,
        disconnectReason: 'active-request-stale',
      },
    };
  }

  private recoverOfflineLocalRunnerActiveRequest(session: AgentRuntimeSession) {
    if (!this.isQueuedLocalRuntimeProvider(session.provider) || !session.activeRequestId || session.apiBaseUrl) {
      return session;
    }
    const waitingStatus = session.provider === 'local-codex' ? 'WAITING_LOCAL_CODEX' : 'WAITING_LOCAL_RUNNER';
    if (session.status !== waitingStatus) return session;
    const bridgeRequest = session.localRunnerBridge?.requests?.find((request) => request.id === session.activeRequestId);
    if (!bridgeRequest || !['PENDING', 'RUNNING'].includes(bridgeRequest.status)) {
      return {
        ...session,
        activeRequestId: null,
        activeRequestStartedAt: null,
        activeRequestConversationId: null,
      };
    }
    const providerLabel = session.provider === 'local-codex' ? 'Local Codex' : 'Local runner';
    const now = new Date().toISOString();
    const failedRequest: AgentRuntimeLocalRunnerBridgeRequest = {
      ...bridgeRequest,
      status: 'ERROR',
      error: session.lastError || `${providerLabel} went offline before completing this message.`,
      completedAt: now,
      updatedAt: now,
    };
    const failedSession = this.finalizeLocalRunnerBridgeRequestSession(
      {
        ...session,
        localRunnerBridge: {
          ...(session.localRunnerBridge || { requests: [] }),
          requests: [
            ...(session.localRunnerBridge?.requests || []).filter((request) => request.id !== failedRequest.id),
            failedRequest,
          ].slice(-20),
        },
      },
      failedRequest,
    );
    return {
      ...failedSession,
      status: waitingStatus,
      apiBaseUrl: '',
      currentActivity: `${providerLabel} is offline. Restart the project runner to reconnect this runtime.`,
      lastError: failedRequest.error,
    };
  }

  private recoverTerminalRuntimeActiveRequest(session: AgentRuntimeSession) {
    const status = String(session.status || '').toUpperCase();
    const hasActiveRequestMetadata = Boolean(
      session.activeRequestId ||
      session.activeRequestStartedAt ||
      session.activeRequestConversationId,
    );
    if (
      !hasActiveRequestMetadata ||
      !['IDLE', 'READY', 'STOPPED', 'ERROR', 'WAITING_CONFIRMATION'].includes(status)
    ) {
      return session;
    }
    return {
      ...session,
      activeRequestId: null,
      activeRequestStartedAt: null,
      activeRequestConversationId: null,
      updatedAt: new Date().toISOString(),
    };
  }

  private recoverPersistedRuntimeSession(session: AgentRuntimeSession) {
    const localRunnerRecovered = this.recoverTerminalLocalRunnerTypingSession(session);
    if (localRunnerRecovered !== session) {
      return localRunnerRecovered;
    }
    const staleLocalRunnerRequestRecovered = this.recoverStaleQueuedLocalActiveRequest(session);
    if (staleLocalRunnerRequestRecovered !== session) {
      return staleLocalRunnerRequestRecovered;
    }
    const missingLocalRunnerRequestRecovered = this.recoverMissingLocalRunnerBridgeRequest(session);
    if (missingLocalRunnerRequestRecovered !== session) {
      return missingLocalRunnerRequestRecovered;
    }
    const offlineLocalRunnerRecovered = this.recoverOfflineLocalRunnerActiveRequest(session);
    if (offlineLocalRunnerRecovered !== session) {
      return offlineLocalRunnerRecovered;
    }
    const terminalActiveRequestRecovered = this.recoverTerminalRuntimeActiveRequest(session);
    if (terminalActiveRequestRecovered !== session) {
      return terminalActiveRequestRecovered;
    }
    if (this.isRuntimeTypingOrphaned(session)) {
      return this.recoverOrphanedTypingSession(session);
    }
    if (this.isRuntimeTypingStale(session)) {
      return this.recoverStaleTypingSession(session);
    }
    return session;
  }

  private recoverMissingLocalRunnerBridgeRequest(session: AgentRuntimeSession) {
    if (!this.isQueuedLocalRuntimeProvider(session.provider) || session.status !== 'TYPING' || !session.activeRequestId) {
      return session;
    }
    const bridgeRequest = session.localRunnerBridge?.requests?.find((request) => request.id === session.activeRequestId);
    if (bridgeRequest) return session;
    if (this.agentRuntimeLauncher.hasActiveMessage(session.runtimeId, session.activeRequestId)) {
      return session;
    }
    if (this.runtimeActiveRequestAgeMs(session) < this.localRunnerMissingRequestGraceMs()) {
      return session;
    }
    const providerLabel = session.provider === 'local-codex' ? 'Local Codex' : 'Local runner';
    const recoveryMessage = `${providerLabel} message request was lost before the runner could complete it. Please retry the message.`;
    return {
      ...session,
      status: 'ERROR',
      activeRequestId: null,
      activeRequestStartedAt: null,
      activeRequestConversationId: null,
      updatedAt: new Date().toISOString(),
      currentActivity: 'Recovered from a missing local runner request',
      lastError: recoveryMessage,
      messageHistory: this.appendRuntimeMessage(session, 'system', recoveryMessage, 'ERROR'),
    };
  }

  private isRuntimeTypingOrphaned(session: AgentRuntimeSession) {
    if (this.isQueuedLocalRuntimeProvider(session.provider) && session.activeRequestId) {
      const bridgeRequest = session.localRunnerBridge?.requests?.find((request) => request.id === session.activeRequestId);
      if (bridgeRequest && ['PENDING', 'RUNNING', 'COMPLETED', 'ERROR'].includes(bridgeRequest.status)) {
        return false;
      }
    }
    if (session.status !== 'TYPING' || !session.activeRequestId) return false;
    if (this.agentRuntimeLauncher.hasActiveMessage(session.runtimeId, session.activeRequestId)) {
      return false;
    }
    const orphanGraceMs = this.agentRuntimeOrphanGraceMs();
    if (orphanGraceMs <= 0) return false;
    return this.runtimeActiveRequestAgeMs(session) >= orphanGraceMs;
  }

  private recoverOrphanedTypingSession(session: AgentRuntimeSession) {
    const recoveryMessage =
      'Previous background response lost its server-side stream after an API restart or worker handoff. The runtime was parked and is ready for a new message.';
    return {
      ...session,
      status: 'IDLE',
      activeRequestId: null,
      activeRequestStartedAt: null,
      activeRequestConversationId: null,
      updatedAt: new Date().toISOString(),
      currentActivity: 'Recovered from an orphaned background response',
      lastError: recoveryMessage,
      messageHistory: this.appendRuntimeMessage(session, 'system', recoveryMessage, 'WARNING'),
    };
  }

  private failQueuedLocalRuntimeBridgeRequest(
    session: AgentRuntimeSession,
    requestId: string | null | undefined,
    errorMessage: string,
  ): AgentRuntimeSession {
    if (!requestId || !this.isQueuedLocalRuntimeProvider(session.provider)) {
      return session;
    }
    const requests = session.localRunnerBridge?.requests || [];
    const requestIndex = requests.findIndex((request) => request.id === requestId);
    if (requestIndex < 0) return session;

    const now = new Date().toISOString();
    const updatedRequests = [...requests];
    updatedRequests[requestIndex] = {
      ...requests[requestIndex],
      status: 'ERROR',
      error: errorMessage,
      completedAt: requests[requestIndex].completedAt || now,
      updatedAt: now,
    };

    return {
      ...session,
      localRunnerBridge: {
        ...(session.localRunnerBridge || {}),
        requests: updatedRequests.slice(-20),
      },
    };
  }

  private isAgentRuntimeTimeoutError(error: any) {
    const name = String(error?.name || '').toLowerCase();
    const message = String(error?.message || error || '').toLowerCase();
    return (
      name.includes('timeout') ||
      name.includes('abort') ||
      message.includes('timeout') ||
      message.includes('timed out') ||
      message.includes('aborted')
    );
  }

  private parseGitAutomationResult(output: string) {
    const match = (output || '').match(
      /DONE branch=([A-Za-z0-9._/-]+)\s+commit=([0-9a-f]{7,40})\s+pr=(https?:\/\/\S+|none)/i,
    );
    if (!match) return null;
    return {
      branch: match[1],
      commitSha: match[2],
      prUrl: match[3].toLowerCase() === 'none' ? null : match[3].replace(/[)\].,;!?]+$/, ''),
    };
  }

  private latestAssistantRuntimeMessage(session: AgentRuntimeSession) {
    return [...(session.messageHistory || [])]
      .reverse()
      .find((entry) => entry.role === 'assistant' && typeof entry.content === 'string' && entry.content.trim());
  }

  private async ensureGitAutomationArtifacts(
    projectId: string,
    memberUserId: string,
    session: AgentRuntimeSession,
    outputText: string,
  ) {
    const result = this.parseGitAutomationResult(outputText);
    if (!result?.prUrl) {
      return null;
    }

    const existingPrArtifact = await this.prisma.projectArtifact.findFirst({
      where: {
        projectId,
        artifactType: 'PR_LINK',
        url: result.prUrl,
      },
      select: { id: true },
    });

    const prArtifact =
      existingPrArtifact ||
      (await this.prisma.projectArtifact.create({
        data: {
          projectId,
          artifactType: 'PR_LINK',
          title: `GitHub PR: ${result.branch}`,
          content: `Branch ${result.branch}\nCommit ${result.commitSha}\nPR ${result.prUrl}`,
          url: result.prUrl,
          metadata: {
            source: 'agent-runtime',
            runtimeId: session.runtimeId,
            role: session.role,
            branch: result.branch,
            commitSha: result.commitSha,
            repository: session.projectGithubUrl || null,
          } as any,
          createdByUserId: memberUserId,
        },
        select: { id: true },
      }));

    const existingHandoff = await this.prisma.projectArtifact.findFirst({
      where: {
        projectId,
        artifactType: 'HANDOFF',
        content: { contains: result.commitSha },
      },
      select: { id: true },
    });

    if (!existingHandoff) {
      await this.prisma.projectArtifact.create({
        data: {
          projectId,
          artifactType: 'HANDOFF',
          title: `Worker handoff: ${result.branch}`,
          content: [
            `Branch: ${result.branch}`,
            `Commit: ${result.commitSha}`,
            `Pull Request: ${result.prUrl}`,
            'Status: code committed and PR opened by runtime automation.',
          ].join('\n'),
          metadata: {
            source: 'agent-runtime',
            runtimeId: session.runtimeId,
            role: session.role,
            branch: result.branch,
            commitSha: result.commitSha,
            prUrl: result.prUrl,
          } as any,
          createdByUserId: memberUserId,
        },
      });
    }

    await this.agentWorkspaceClient.createProjectMemory(projectId, {
      memoryType: 'FACT',
      title: `GitHub PR opened for ${result.branch}`,
      content: `Runtime ${session.runtimeId} opened ${result.prUrl} from commit ${result.commitSha}.`,
      summary: `PR opened from ${result.branch}`,
      metadata: {
        source: 'agent-runtime',
        runtimeId: session.runtimeId,
        branch: result.branch,
        commitSha: result.commitSha,
        prUrl: result.prUrl,
      },
      sourceArtifactId: prArtifact.id,
      createdByUserId: memberUserId,
    }).catch(() => null);

    return result;
  }

  private responseNeedsConfirmation(output: string) {
    const text = output || '';
    if (
      /approval_required|do you approve executing|type\s+\*?\*?["']?yes["']?\*?\*?\s+to approve|waiting for user confirmation/i.test(
        text,
      )
    ) {
      return true;
    }
    return /WAITING_FOR_USER_CONFIRMATION|requires human approval|dangerous command requires approval|\/approve|please confirm before i continue|等待用户确认|请确认后继续/i.test(
      text,
    );
  }

  private describeRuntimeActivity(
    nextStatus: string,
    outputText: string,
    recentActions?: AgentRuntimeAction[],
  ) {
    if (nextStatus === 'WAITING_CONFIRMATION') {
      return 'Waiting for user confirmation';
    }

    if (/CREATED feature=/i.test(outputText || '')) {
      return 'Created project planning records';
    }

    const latestAction = [...(recentActions || [])]
      .reverse()
      .find((action) => action.kind !== 'message');

    if (latestAction) {
      if (latestAction.kind === 'tool' && latestAction.name) {
        return `Used ${latestAction.name}`;
      }
      if (latestAction.kind === 'tool_result') {
        return latestAction.status === 'error' ? 'Tool call needs adjustment' : 'Tool call completed';
      }
    }

    return 'Idle after responding';
  }

  private async ensureProjectAccess(projectId: string, userId: string) {
    const project = await this.prisma.project.findFirst({
      where: {
        id: projectId,
        deletedAt: null,
      },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (project.ownerId === userId) {
      return project;
    }

    const membership = await this.prisma.projectMember.findFirst({
      where: { projectId, userId, removedAt: null },
      select: { id: true },
    });
    if (!membership) {
      throw new NotFoundException('Project not found');
    }

    return project;
  }

  private async ensureProjectReadable(projectId: string, userId?: string | null) {
    const project = await this.prisma.project.findFirst({
      where: {
        id: projectId,
        deletedAt: null,
        OR: [
          { visibility: 'public' },
          ...(userId
            ? [
                { ownerId: userId },
                { members: { some: { userId, removedAt: null } } },
              ]
            : []),
        ],
      },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    return project;
  }

  private async ensureProjectManager(projectId: string, userId: string) {
    const project = await this.ensureProjectAccess(projectId, userId);
    const canManage = project.ownerId === userId || project.leadAgentUserId === userId;
    if (!canManage) {
      throw new ForbiddenException('Only the project owner or lead agent can manage this project');
    }
    return project;
  }

  async ensureProjectFileAccess(projectId: string, userId: string) {
    return this.ensureProjectAccess(projectId, userId);
  }

  private async ensureProjectScopedReference(
    projectId: string,
    field: 'goal' | 'feature' | 'workItem',
    id?: string | null,
  ) {
    if (!id) return;

    const exists =
      field === 'goal'
        ? await this.prisma.projectGoal.findFirst({ where: { id, projectId }, select: { id: true } })
        : field === 'feature'
          ? await this.prisma.projectFeature.findFirst({ where: { id, projectId }, select: { id: true } })
          : await this.prisma.projectWorkItem.findFirst({ where: { id, projectId }, select: { id: true } });

    if (!exists) {
      throw new BadRequestException(`${field}Id does not belong to the project`);
    }
  }

  private async ensureProjectAssignment(projectId: string, workItemId: string, assignmentId: string) {
    const assignment = await this.prisma.projectAssignment.findFirst({
      where: { id: assignmentId, projectId, workItemId },
      include: {
        assigneeUser: { select: { id: true, email: true, displayName: true, role: true } },
        assignedByUser: { select: { id: true, email: true, displayName: true, role: true } },
      },
    });

    if (!assignment) {
      throw new NotFoundException('Project assignment not found');
    }

    return assignment;
  }

  private async ensureProjectRun(projectId: string, runId: string) {
    const run = await this.prisma.projectRun.findFirst({
      where: { id: runId, projectId },
      include: {
        assignment: {
          include: {
            assigneeUser: { select: { id: true, email: true, displayName: true, role: true } },
          },
        },
        triggeredByUser: { select: { id: true, email: true, displayName: true, role: true } },
      },
    });

    if (!run) {
      throw new NotFoundException('Project run not found');
    }

    return run;
  }

  async createProject(userId: string, dto: CreateProjectDto) {
    const initialGoal = dto.initialGoal?.trim();
    if (!dto.name?.trim() && !initialGoal) {
      throw new BadRequestException('Project name or initial goal is required');
    }

    const generatedDraft = initialGoal
      ? await this.generateProjectDraftFromGoal(userId, initialGoal)
      : null;
    const projectName = dto.name?.trim() || generatedDraft?.name || 'New Agent Project';
    const projectSummary = dto.summary?.trim() || generatedDraft?.summary || undefined;
    const projectBrief = dto.brief?.trim() || initialGoal || undefined;
    const initialGoalTitle = initialGoal && initialGoal.length > 191
      ? `${initialGoal.slice(0, 188)}...`
      : initialGoal;

    const template = await this.projectTemplatesService.getTemplate(dto.projectTemplateId, userId);
    const requestedGlobals = this.getProjectGlobalVariables(dto.settings);
    const requestedKeys = new Set(requestedGlobals.map((entry) => entry.key));
    const requestedProjectFileFolders = this.getProjectFileFolders(dto.settings);
    const templateProjectFileFolders = this.getProjectFileFolders({
      projectFileFolders: template.projectFileFolders || [],
    });
    const effectiveProjectFileFolders = Array.from(
      new Set([...templateProjectFileFolders, ...requestedProjectFileFolders].filter(Boolean)),
    );
    const templateGlobals: ProjectGlobalVariable[] = (template.projectGlobals || [])
      .filter((entry) => entry.key && !requestedKeys.has(entry.key))
      .map((entry) => ({
        key: entry.key,
        label: entry.label || entry.key,
        description: entry.description ?? null,
        value: entry.isSecret ? '' : entry.value || '',
        providedValue: !entry.isSecret && Boolean(entry.value),
        isSecret: Boolean(entry.isSecret),
        required: entry.required !== false,
        createTaskOnMissing: entry.createTaskOnMissing !== false,
        category: entry.category || null,
      }));
    const effectiveGlobals = [...templateGlobals, ...requestedGlobals];
    const storedSettings = this.mergeProjectSettings(template.settings || {}, {
      githubUrl: dto.githubUrl,
      settings: dto.settings,
    });
    Object.assign(storedSettings, this.mergeProjectSettings(storedSettings, {
      githubUrl: dto.githubUrl,
      settings: effectiveGlobals.length
        ? { projectGlobals: this.globalsForStoredSettings(effectiveGlobals) }
        : undefined,
    }));
    if (effectiveGlobals.length) {
      storedSettings.projectGlobals = this.globalsForStoredSettings(effectiveGlobals);
    } else if (dto.settings && typeof dto.settings === 'object' && 'projectGlobals' in dto.settings) {
      delete storedSettings.projectGlobals;
    }
    if (effectiveProjectFileFolders.length) {
      storedSettings.projectFileFolders = effectiveProjectFileFolders;
    } else if (dto.settings && typeof dto.settings === 'object' && 'projectFileFolders' in dto.settings) {
      delete storedSettings.projectFileFolders;
    }
    if (!storedSettings.workItemStatusFlow && template.workItemStatusFlow) {
      storedSettings.workItemStatusFlow = template.workItemStatusFlow;
    }
    this.applyProjectAgentLimitSetting(storedSettings, { strict: true });
    if (!storedSettings.projectRoleAgentDefaults && Array.isArray(template.roleLaunchProfiles) && template.roleLaunchProfiles.length) {
      storedSettings.projectRoleAgentDefaults = Object.fromEntries(
        template.roleLaunchProfiles
          .filter((profile: any) => profile && typeof profile.role === 'string' && profile.role.trim())
          .map((profile: any) => [profile.role.trim(), profile]),
      );
    }
    storedSettings.projectTemplateId = template.id;
    storedSettings.projectTemplateRoles = template.roles || [];

    const created = await this.agentWorkspaceClient.createProject({
      name: projectName,
      slug: dto.slug,
      description: projectSummary,
      ownerUserId: userId,
      leadUserId: dto.leadAgentUserId,
      visibility: dto.visibility || 'private',
      budgetAmount: dto.budgetAmount ?? 0,
      budgetCurrency: dto.budgetCurrency || 'AIC',
      githubUrl: dto.githubUrl,
      settings: storedSettings,
      initialContext: {
        brief: projectBrief,
        goal: initialGoalTitle
          ? {
              title: initialGoalTitle,
              description: projectBrief,
            }
          : undefined,
      },
    });
    await this.materializePersonalTemplateSkillFiles(created.projectId, storedSettings, template, userId);
    await this.agentWorkspaceClient.updateProject(created.projectId, { settings: storedSettings }).catch(() => null);

    await this.syncProjectCapabilityBundles(created.projectId, storedSettings);
    await this.ensureTemplateProjectFileFolders(created.projectId, template.projectFileFolders || []);
    await this.ensureProjectLeadWorkspaceFile(created.projectId);
    await this.ensureTemplateAutoMembers(created.projectId, userId, template.roles || []);

    if (effectiveGlobals.length) {
      await this.persistProjectGlobalSecrets(created.projectId, effectiveGlobals, {
        updatedByUserId: userId,
        source: 'project-create',
      });
      await this.prisma.project.update({
        where: { id: created.projectId },
        data: {
          settings: storedSettings,
        },
      });
      await this.syncProjectGlobalResourceTasks(created.projectId, userId, effectiveGlobals);
    } else {
      await this.prisma.project.update({
        where: { id: created.projectId },
        data: {
          settings: storedSettings,
        },
      });
    }

    if (initialGoalTitle) {
      const existingInitialGoal = await this.prisma.projectGoal.findFirst({
        where: {
          projectId: created.projectId,
          title: initialGoalTitle,
        },
        select: { id: true },
      });

      if (!existingInitialGoal) {
        await this.prisma.projectGoal.create({
          data: {
            projectId: created.projectId,
            title: initialGoalTitle,
            description: projectBrief,
            priority: 0,
            sortOrder: 0,
            createdById: userId,
          },
        });
      }
    }

    await this.launchTemplateAutoRuntimes(created.projectId, userId, template.roles || [], storedSettings);

    return this.getProject(created.projectId, userId);
  }

  async createProjectFromTask(userId: string, taskId: string, dto: CreateProjectFromTaskDto = {}) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: {
        rawTask: {
          select: {
            source: true,
            externalId: true,
            externalUrl: true,
            sourceMetadata: true,
          },
        },
      },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    const isHackerOneTask = task.taskSource === 'HACKERONE' || task.rawTask?.source === 'HACKERONE_PROGRAM';
    if (isHackerOneTask && dto.confirmed !== true) {
      throw new BadRequestException('Confirm HackerOne project creation before continuing.');
    }

    const sourceMetadata = isHackerOneTask ? this.hackerOneMetadataForTask(task) : {};
    const blueprint = isHackerOneTask
      ? this.buildHackerOneProjectBlueprint(task, sourceMetadata)
      : this.buildTaskProjectBlueprint(task);
    const existing = await this.prisma.project.findFirst({
      where: {
        ownerId: userId,
        deletedAt: null,
        OR: [
          {
            settings: {
              path: '$.sourceTask.taskId',
              equals: taskId,
            },
          },
          {
            settings: {
              path: '$.hackerOneTaskProject.source.taskId',
              equals: taskId,
            },
          },
        ],
      },
      select: { id: true, settings: true },
      orderBy: { createdAt: 'desc' },
    });

    if (existing) {
      const seeded = dto.seedPlan === false
        ? null
        : await this.ensureTaskProjectPlan(existing.id, userId, blueprint, isHackerOneTask);
      const existingSettings =
        existing.settings && typeof existing.settings === 'object' && !Array.isArray(existing.settings)
          ? existing.settings as Record<string, any>
          : {};
      const template = await this.projectTemplatesService.getTemplate(
        isHackerOneTask ? 'hackerone-opportunity-research' : existingSettings.projectTemplateId,
      );
      const nextSettings = this.taskProjectSettings({
        ...existingSettings,
        projectTemplateId: template.id,
        projectTemplateRoles: template.roles || [],
        ...(template.workItemStatusFlow && !existingSettings.workItemStatusFlow
          ? { workItemStatusFlow: template.workItemStatusFlow }
          : {}),
      }, blueprint, isHackerOneTask);
      this.applyProjectAgentLimitSetting(nextSettings);
      await this.prisma.project.update({
        where: { id: existing.id },
        data: { settings: nextSettings },
      });
      await this.agentWorkspaceClient.updateProject(existing.id, { settings: nextSettings }).catch(() => null);
      await this.syncProjectCapabilityBundles(existing.id, nextSettings);
      await this.ensureTemplateProjectFileFolders(existing.id, template.projectFileFolders || []);
      await this.ensureProjectLeadWorkspaceFile(existing.id);
      await this.ensureTemplateAutoMembers(existing.id, userId, template.roles || []);
      return {
        reused: true,
        project: await this.getProject(existing.id, userId),
        blueprint,
        seeded,
      };
    }

    const createdProject = await this.createProject(userId, {
      name: dto.name?.trim() || blueprint.project.name,
      summary: blueprint.project.summary,
      brief: blueprint.project.brief,
      visibility: 'private',
      budgetAmount: task.reward || 0,
      budgetCurrency: task.currency || 'AIC',
      projectTemplateId: isHackerOneTask ? 'hackerone-opportunity-research' : 'default',
      settings: {
        sourceTask: blueprint.source,
        taskProject: blueprint,
        ...(isHackerOneTask ? { hackerOneTaskProject: blueprint } : {}),
      },
    });
    const projectId = String((createdProject as any).id || (createdProject as any).projectId);
    const seeded = dto.seedPlan === false
      ? null
      : await this.ensureTaskProjectPlan(projectId, userId, blueprint, isHackerOneTask);

    return {
      reused: false,
      project: await this.getProject(projectId, userId),
      blueprint,
      seeded,
    };
  }

  private taskProjectSettings(existingSettings: any, blueprint: any, isHackerOneTask: boolean) {
    const base =
      existingSettings && typeof existingSettings === 'object' && !Array.isArray(existingSettings)
        ? existingSettings
        : {};

    return {
      ...base,
      sourceTask: {
        ...(base as any).sourceTask,
        ...blueprint.source,
      },
      taskProject: blueprint,
      ...(isHackerOneTask ? { hackerOneTaskProject: blueprint } : {}),
    };
  }

  private buildTaskProjectBlueprint(task: any) {
    const sourceUrl = task.sourceUrl || task.rawTask?.externalUrl || null;
    const title = this.compactText(task.title || 'Task project');
    const goalDescription = this.buildTaskGoalDescription(task, sourceUrl);
    const summary = this.truncateText(this.compactText(task.description || title), 180);
    const name = this.truncateText(`${title} project`, 120);

    return {
      source: {
        taskId: task.id,
        taskTitle: task.title,
        taskDescription: task.description || null,
        taskSource: task.taskSource,
        rawTaskSource: task.rawTask?.source || null,
        rawTaskExternalId: task.rawTask?.externalId || null,
        sourceUrl,
        acceptanceCriteria: task.acceptanceCriteria || null,
        reward: task.reward ?? null,
        currency: task.currency || null,
      },
      project: {
        name,
        summary,
        brief: [
          `# ${title}`,
          '',
          '## Source Task',
          task.description ? this.truncateText(task.description, 1200) : 'No task description was provided.',
          '',
          '## Goal',
          'Resolve the source task as a project goal and keep evidence, decisions, and acceptance criteria attached to project work.',
        ].join('\n'),
        goalTitle: title,
        goalDescription,
      },
      verificationPlan: [
        {
          phase: 'intake',
          outcome: 'Task description, source link, acceptance criteria, and expected deliverables are recorded.',
        },
        {
          phase: 'execution',
          outcome: 'Work proceeds through project work items or agent assignments with evidence attached.',
        },
        {
          phase: 'verification',
          outcome: 'The owner can compare final output against the task source and acceptance criteria.',
        },
      ],
      roles: [
        {
          role: 'OWNER',
          label: 'Task Owner',
          reason: 'Confirms project goal, acceptance criteria, and final acceptance.',
          skill: 'Provide missing context and approve the result.',
        },
        {
          role: 'LEAD_AGENT',
          label: 'Project Lead',
          reason: 'Breaks the task goal into trackable project work.',
          skill: 'Coordinate planning, execution, review, and handoff.',
        },
      ],
    };
  }

  private buildTaskGoalDescription(task: any, sourceUrl?: string | null) {
    const sections = [
      task.description ? task.description.trim() : null,
      task.acceptanceCriteria ? `## Acceptance Criteria\n${task.acceptanceCriteria}` : null,
      sourceUrl ? `## Source Link\n${sourceUrl}` : null,
    ].filter(Boolean);

    return sections.length ? sections.join('\n\n') : 'Resolve this source task as a project goal.';
  }

  private async ensureTaskProjectPlan(projectId: string, userId: string, blueprint: any, isHackerOneTask: boolean) {
    if (isHackerOneTask) {
      await this.ensureTaskGoalContent(projectId, userId, blueprint);
      const workItemCount = await this.prisma.projectWorkItem.count({ where: { projectId } });
      const skillMemoryCount = await this.prisma.projectMemory.count({
        where: {
          projectId,
          memoryType: 'INTERFACE_CONTRACT',
          title: 'HackerOne bounty workflow skill draft',
        },
      });
      const seeded = workItemCount > 0 ? null : await this.seedHackerOneProjectPlan(projectId, userId, blueprint);
      const memory = (seeded?.memory || skillMemoryCount > 0)
        ? null
        : await this.createHackerOneSkillMemory(projectId, userId, blueprint);

      return seeded ? { ...seeded, memory: seeded.memory || memory } : memory ? { memory } : null;
    }

    const goalTitle = blueprint.project.goalTitle || blueprint.source.taskTitle || 'Task goal';
    const existingGoal = await this.prisma.projectGoal.findFirst({
      where: { projectId, title: goalTitle },
      select: { id: true },
    });

    if (existingGoal) {
      return null;
    }

    const goal = await this.prisma.projectGoal.create({
      data: {
        projectId,
        title: goalTitle,
        description: blueprint.project.goalDescription || blueprint.source.taskDescription || blueprint.project.summary,
        priority: 10,
        sortOrder: 0,
        createdById: userId,
      },
    });

    return {
      goal,
      features: [],
      workItems: [],
      memory: null,
    };
  }

  private async ensureTaskGoalContent(projectId: string, userId: string, blueprint: any) {
    const goalTitle = blueprint.project.goalTitle || blueprint.source.taskTitle || 'Task goal';
    const goalDescription = blueprint.project.goalDescription || blueprint.source.taskDescription || blueprint.project.summary;
    const existingExact = await this.prisma.projectGoal.findFirst({
      where: { projectId, title: goalTitle },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    if (existingExact) {
      if (goalDescription && existingExact.description !== goalDescription) {
        await this.prisma.projectGoal.update({
          where: { id: existingExact.id },
          data: { description: goalDescription },
        });
      }
      return existingExact;
    }

    const generatedGoalFilters: any[] = [{ title: { startsWith: 'Validate ' } }];
    if (blueprint.project.summary) {
      generatedGoalFilters.push({ description: blueprint.project.summary });
    }

    const generatedGoal = await this.prisma.projectGoal.findFirst({
      where: {
        projectId,
        OR: generatedGoalFilters,
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    if (!generatedGoal) {
      return this.prisma.projectGoal.create({
        data: {
          projectId,
          title: goalTitle,
          description: goalDescription,
          priority: 10,
          sortOrder: 0,
          createdById: userId,
        },
      });
    }

    return this.prisma.projectGoal.update({
      where: { id: generatedGoal.id },
      data: {
        title: goalTitle,
        description: goalDescription,
      },
    });
  }

  private hackerOneMetadataForTask(task: any) {
    const direct = task?.sourceMetadata && typeof task.sourceMetadata === 'object' ? task.sourceMetadata : null;
    const raw = task?.rawTask?.sourceMetadata && typeof task.rawTask.sourceMetadata === 'object' ? task.rawTask.sourceMetadata : null;
    return (direct || raw || {}) as any;
  }

  private buildHackerOneProjectBlueprint(task: any, metadata: any) {
    const program = metadata?.program || {};
    const scope = metadata?.scope || {};
    const rewards = metadata?.rewards || {};
    const policy = metadata?.policy || {};
    const testing = metadata?.testing || {};
    const programName = this.compactText(program.name || program.handle || 'HackerOne program');
    const programHandle = this.compactText(program.handle || metadata?.programHandle || '');
    const scopeCatalog = Array.isArray(metadata?.scopeCatalog)
      ? metadata.scopeCatalog.filter((item: any) => item?.scope && typeof item.scope === 'object')
      : [];
    const scopeSummary =
      metadata?.scopeSummary && typeof metadata.scopeSummary === 'object' && !Array.isArray(metadata.scopeSummary)
        ? metadata.scopeSummary
        : {};
    const parsedScopeCount = Number(scopeSummary.totalEligibleScopes);
    const totalEligibleScopes = Number.isFinite(parsedScopeCount) && parsedScopeCount > 0
      ? parsedScopeCount
      : scopeCatalog.length || null;
    const isProgramCatalog = scopeCatalog.length > 0 || String(scope.assetType || '').toUpperCase() === 'PROGRAM';
    const catalogAssetTypes = Array.isArray(scopeSummary.assetTypes) ? scopeSummary.assetTypes : [];
    const assetTypeSummary = catalogAssetTypes
      .map((item: any) => `${item.assetType || 'unknown'} (${item.count || 0})`)
      .filter(Boolean)
      .join(', ');
    const asset = isProgramCatalog
      ? this.compactText(totalEligibleScopes ? `${totalEligibleScopes} eligible scopes` : 'program scope catalog')
      : this.compactText(scope.assetIdentifier || task.sourceRepo || task.title || 'target scope');
    const assetType = isProgramCatalog
      ? 'PROGRAM'
      : this.compactText(scope.assetType || scope.displayName || 'asset');
    const rewardRange = this.compactText(
      scopeSummary.topRewardRange?.rawAmount ||
      rewards.scopeRange?.rawAmount ||
      this.hackerOneRewardRangeText(rewards) ||
      '',
    );
    const scopeCatalogPreview = scopeCatalog.slice(0, 12).map((item: any) => {
      const itemScope = item.scope || {};
      const reward = item.rewardRange?.rawAmount ? `, reward ${item.rewardRange.rawAmount}` : '';
      return `${itemScope.assetIdentifier || 'unknown'} (${itemScope.assetType || 'unknown'}, max ${itemScope.maxSeverity || 'unknown'}${reward})`;
    });
    const name = this.truncateText(
      isProgramCatalog ? `${programName} HackerOne bounty` : `${programName}: ${asset} bounty`,
      120,
    );
    const sourceUrl = task.sourceUrl || task.rawTask?.externalUrl || program.url || null;
    const requiredHeaders = Array.isArray(testing.requiredHeaders) ? testing.requiredHeaders : [];
    const scopeExclusions = Array.isArray(policy.scopeExclusions) ? policy.scopeExclusions : [];
    const platformStandardsExclusions = Array.isArray(policy.platformStandardsExclusions)
      ? policy.platformStandardsExclusions
      : [];
    const reportTemplate = Array.isArray(metadata?.reportTemplate) ? metadata.reportTemplate : [];
    const safetyRules = this.uniqueStringList(
      this.cleanStringList(testing.prohibitedActions),
      this.cleanStringList(testing.safeTestingRules),
    );
    const roles = [
      {
        role: 'OWNER',
        label: 'Bounty Owner',
        reason: 'Confirms authorization, accounts, risk tolerance, and final external submission.',
        skill: 'Approve scope, provide test credentials when needed, and decide whether a report is submitted.',
      },
      {
        role: 'LEAD_AGENT',
        label: 'Bounty Lead',
        reason: 'Keeps testing inside policy and turns results into reviewable project progress.',
        skill: 'Coordinate intake, dispatch validation work, track blockers, and enforce evidence gates.',
      },
      {
        role: 'PLANNER_AGENT',
        label: 'Scope Planner',
        reason: 'The task starts as text and scope metadata that must become safe, bounded tests.',
        skill: 'Extract target flows, exclusions, required headers, and test hypotheses from the HackerOne task.',
      },
      {
        role: 'WORKER_AGENT',
        label: 'Security Tester',
        reason: 'Runs the smallest non-destructive validation steps against the authorized asset.',
        skill: 'Execute scoped tests, collect evidence, and stop when authorization or safety is unclear.',
      },
      {
        role: 'SECURITY_AUDITOR',
        label: 'Finding Validator',
        reason: 'Prevents false positives, out-of-scope findings, and overstated severity.',
        skill: 'Validate reproducibility, impact, severity, safe harbor, and platform-standard deviations.',
      },
      {
        role: 'INTEGRATOR_AGENT',
        label: 'Report Writer',
        reason: 'HackerOne rewards depend on a clear report with exact reproduction and impact.',
        skill: 'Assemble a HackerOne-ready report draft using the imported report template and evidence.',
      },
    ];
    const skillDraft = this.buildHackerOneSkillDraft({
      programName,
      programHandle,
      asset,
      assetType,
      rewardRange,
      reportTemplate,
      scopeExclusions,
      platformStandardsExclusions,
      safetyRules,
      scopeCatalogSummary: isProgramCatalog
        ? {
            totalEligibleScopes,
            assetTypeSummary,
            preview: scopeCatalogPreview,
          }
        : null,
    });
    const brief = [
      `# ${name}`,
      '',
      `Source task: ${task.title}`,
      '',
      '## Scope',
      `Program: ${programName}${programHandle ? ` (${programHandle})` : ''}`,
      isProgramCatalog ? `Imported eligible scopes: ${asset}` : `Asset: ${asset}`,
      isProgramCatalog && assetTypeSummary ? `Asset type breakdown: ${assetTypeSummary}` : `Asset type: ${assetType}`,
      isProgramCatalog && scopeCatalogPreview.length ? `Scope catalog preview:\n${scopeCatalogPreview.map((item: string) => `- ${item}`).join('\n')}` : null,
      scope.maxSeverity ? `Max severity: ${scope.maxSeverity}` : null,
      scopeSummary.maxSeverity ? `Max imported severity: ${scopeSummary.maxSeverity}` : null,
      rewardRange ? `External reward range: ${rewardRange}` : null,
      scope.eligibleForSubmission !== undefined ? `Submission eligibility: ${scope.eligibleForSubmission ? 'eligible' : 'not eligible'}` : null,
      scope.eligibleForBounty !== undefined ? `Bounty eligibility: ${scope.eligibleForBounty ? 'eligible' : 'not eligible'}` : null,
      scope.instruction ? `Scope instruction: ${scope.instruction}` : null,
      policy.scopeDescription ? `Scope catalog note: ${policy.scopeDescription}` : null,
      '',
      '## Verification Goal',
      isProgramCatalog
        ? 'Use the imported scope catalog to select a concrete in-scope asset group, then confirm whether there is a valid, reproducible vulnerability and produce a report-ready evidence package or a precise blocker/no-finding handoff.'
        : 'Confirm whether there is a valid, reproducible, in-scope vulnerability on the named asset, then produce a report-ready evidence package or a precise blocker/no-finding handoff.',
      '',
      '## Safety Gate',
      isProgramCatalog
        ? 'Before testing, the planner must choose exact asset(s) from scopeCatalog, prioritize safe web/API/WILDCARD surfaces when present, confirm out-of-scope exclusions, required headers, account role, and a non-destructive validation path.'
        : 'Before testing, confirm the exact asset, out-of-scope exclusions, required headers, account role, and non-destructive validation path.',
    ].filter(Boolean).join('\n');

    return {
      source: {
        taskId: task.id,
        taskTitle: task.title,
        taskDescription: task.description || null,
        taskSource: task.taskSource,
        rawTaskSource: task.rawTask?.source || null,
        rawTaskExternalId: task.rawTask?.externalId || null,
        sourceUrl,
        acceptanceCriteria: task.acceptanceCriteria || null,
        reward: task.reward ?? null,
        currency: task.currency || null,
      },
      project: {
        name,
        summary: isProgramCatalog
          ? `Plan and validate selected HackerOne scope(s) for ${programName}.`
          : `Validate and prepare a HackerOne report for ${asset} in ${programName}.`,
        brief,
        goalTitle: isProgramCatalog ? `${programName} HackerOne scope planning` : task.title,
        goalDescription: this.buildTaskGoalDescription(task, sourceUrl),
      },
      program: {
        handle: programHandle || null,
        name: programName,
        url: program.url || sourceUrl || null,
        website: program.website || null,
        assetsInScope: program.assetsInScope ?? null,
        responseTimes: program.responseTimes || null,
        highlights: program.highlights || null,
      },
      scope: {
        assetIdentifier: asset,
        displayName: scope.displayName || null,
        assetType,
        eligibleForSubmission: scope.eligibleForSubmission ?? null,
        eligibleForBounty: scope.eligibleForBounty ?? null,
        maxSeverity: scope.maxSeverity || null,
        cvssScore: scope.cvssScore || null,
        instruction: scope.instruction || null,
        totalResolvedReports: scope.totalResolvedReports ?? null,
        updatedAt: scope.updatedAt || null,
      },
      scopeSummary: {
        totalEligibleScopes,
        assetTypes: catalogAssetTypes,
        assetTypeSummary,
        maxSeverity: scopeSummary.maxSeverity || scope.maxSeverity || null,
        topRewardRange: scopeSummary.topRewardRange || rewards.scopeRange || null,
      },
      scopeCatalog,
      rewards: {
        currency: rewards.currency || task.currency || null,
        scopeRange: rewards.scopeRange || null,
        table: Array.isArray(rewards.table) ? rewards.table : [],
        bountyTable: rewards.bountyTable || null,
      },
      policy: {
        safeHarbor: policy.safeHarbor || null,
        scopeDescription: policy.scopeDescription || null,
        scopeLastUpdatedAt: policy.scopeLastUpdatedAt || null,
        lastChangedAt: policy.lastChangedAt || null,
        scopeExclusions,
        platformStandardsExclusions,
      },
      testing: {
        requiredHeaders,
        accountGuidance: this.cleanStringList(testing.accountGuidance),
        safeTestingRules: this.cleanStringList(testing.safeTestingRules),
        prohibitedActions: this.cleanStringList(testing.prohibitedActions),
        duplicatePolicy: this.cleanStringList(testing.duplicatePolicy),
      },
      verificationPlan: [
        {
          phase: 'scope_intake',
          outcome: 'A human-readable authorization and scope checklist is complete before testing.',
        },
        {
          phase: 'test_plan',
          outcome: 'A non-destructive validation plan names hypotheses, accounts, evidence, and stop conditions.',
        },
        {
          phase: 'validation',
          outcome: 'The finding is confirmed, rejected, or blocked with concrete evidence.',
        },
        {
          phase: 'report',
          outcome: 'A HackerOne-ready report draft maps evidence to reproduction, impact, and severity.',
        },
      ],
      roles,
      skillDraft,
      reportTemplate,
    };
  }

  private async seedHackerOneProjectPlan(projectId: string, userId: string, blueprint: any) {
    const goal = await this.prisma.projectGoal.create({
      data: {
        projectId,
        title: blueprint.project.goalTitle || blueprint.source.taskTitle || `Validate ${blueprint.scope.assetIdentifier} HackerOne scope`,
        description: blueprint.project.goalDescription || blueprint.project.summary,
        priority: 10,
        sortOrder: 0,
        createdById: userId,
      },
    });
    const intakeFeature = await this.createFeature(projectId, userId, {
      goalId: goal.id,
      title: 'Scope intake and safe test planning',
      description: 'Confirm the HackerOne task text, scope, exclusions, account requirements, and verification plan.',
      priority: 10,
      sortOrder: 0,
    });
    const validationFeature = await this.createFeature(projectId, userId, {
      goalId: goal.id,
      title: 'Vulnerability validation and evidence',
      description: 'Run bounded validation, collect report-ready proof, and verify severity before submission.',
      priority: 9,
      sortOrder: 1,
    });
    const reportFeature = await this.createFeature(projectId, userId, {
      goalId: goal.id,
      title: 'HackerOne report preparation',
      description: 'Convert confirmed findings or blockers into a clean HackerOne-style report handoff.',
      priority: 8,
      sortOrder: 2,
    });
    const sharedInput = {
      source: blueprint.source,
      program: blueprint.program,
      scope: blueprint.scope,
      policy: blueprint.policy,
      testing: blueprint.testing,
      rewards: blueprint.rewards,
      scopeSummary: blueprint.scopeSummary || null,
      scopeCatalog: Array.isArray(blueprint.scopeCatalog) ? blueprint.scopeCatalog : [],
      reportTemplate: blueprint.reportTemplate,
    };
    const hasScopeCatalog = Array.isArray(blueprint.scopeCatalog) && blueprint.scopeCatalog.length > 0;
    const assetTypeSummary = blueprint.scopeSummary?.assetTypeSummary || '';
    const scopeCatalogBrief = hasScopeCatalog
      ? `${blueprint.scopeCatalog.length} imported eligible scopes${assetTypeSummary ? ` across ${assetTypeSummary}` : ''}`
      : blueprint.scope.assetIdentifier;
    const outputContract = {
      required: [
        'scopeStatus',
        'selectedScope',
        'testsPerformed',
        'evidence',
        'verificationResult',
        'reportReadiness',
        'residualRisks',
      ],
    };
    const intake = await this.createWorkItem(projectId, userId, {
      goalId: goal.id,
      featureId: intakeFeature.id,
      title: 'Confirm HackerOne scope, exclusions, and authorization',
      workType: 'INTAKE',
      status: 'READY',
      priority: 10,
      scopeBrief: hasScopeCatalog
        ? `Confirm the exact HackerOne program and imported scope catalog before any testing: ${scopeCatalogBrief}.`
        : `Confirm the exact HackerOne program and asset before any testing: ${blueprint.scope.assetIdentifier}.`,
      description: hasScopeCatalog
        ? 'Turn imported HackerOne program metadata and scopeCatalog into an authorization checklist, then identify blockers such as missing accounts, forbidden test classes, or required headers.'
        : 'Turn imported HackerOne metadata into an authorization checklist and identify blockers such as missing accounts, forbidden test classes, or required headers.',
      acceptanceCriteria: [
        hasScopeCatalog
          ? '1. Exact program, imported eligible scope count, asset type breakdown, submission eligibility, and bounty eligibility are recorded.'
          : '1. Exact program, asset, asset type, submission eligibility, and bounty eligibility are recorded.',
        '2. Scope exclusions and platform-standard deviations are reviewed and summarized.',
        '3. Required headers, account guidance, and safe-testing rules are either confirmed or marked as blockers.',
      ].join('\n'),
      inputPacket: sharedInput,
      outputContract,
    });
    const plan = await this.createWorkItem(projectId, userId, {
      goalId: goal.id,
      featureId: intakeFeature.id,
      title: 'Build a safe validation plan from task text',
      workType: 'PLANNING',
      status: 'READY',
      priority: 9,
      scopeBrief: hasScopeCatalog
        ? 'Select the first concrete asset group from scopeCatalog, using asset_type fit and safety constraints, then design the smallest non-destructive validation plan.'
        : 'Design the smallest non-destructive tests that can confirm or disprove a vulnerability hypothesis.',
      description: hasScopeCatalog
        ? 'Use the task description, scopeCatalog, scope instruction, policy notes, reward table, and report template to choose URL/API/WILDCARD or other justified targets and create a bounded test plan.'
        : 'Use the task description, scope instruction, policy notes, reward table, and report template to create a bounded test plan.',
      acceptanceCriteria: [
        hasScopeCatalog
          ? '1. A selected scope or asset group is named with asset type, selection rationale, hypotheses, target endpoints or flows, account roles, and expected evidence.'
          : '1. Hypotheses, target endpoints or flows, account roles, and expected evidence are listed.',
        '2. Stop conditions and out-of-scope checks are explicit.',
        '3. The plan states what evidence is sufficient for a report and what would make the result inconclusive.',
      ].join('\n'),
      inputPacket: sharedInput,
      outputContract,
      dependsOn: [intake.id],
    });
    const validation = await this.createWorkItem(projectId, userId, {
      goalId: goal.id,
      featureId: validationFeature.id,
      title: 'Validate finding safely and collect evidence',
      workType: 'SECURITY_TEST',
      status: 'DRAFT',
      priority: 8,
      scopeBrief: hasScopeCatalog
        ? 'Run only approved tests against the concrete scope selected by the accepted validation plan.'
        : `Run only approved tests against ${blueprint.scope.assetIdentifier}.`,
      description: 'Execute the approved validation plan, collect evidence, and stop immediately if authorization, scope, or safety becomes unclear.',
      acceptanceCriteria: [
        '1. Every executed test maps back to the approved validation plan.',
        '2. Evidence includes exact asset, endpoint, account role, request or response detail, timestamp, and impact reasoning.',
        '3. Result is classified as confirmed finding, no finding, inconclusive, or blocked.',
      ].join('\n'),
      inputPacket: sharedInput,
      outputContract,
      dependsOn: [intake.id, plan.id],
    });
    const review = await this.createWorkItem(projectId, userId, {
      goalId: goal.id,
      featureId: validationFeature.id,
      title: 'Review scope fit, severity, and false-positive risk',
      workType: 'SECURITY_REVIEW',
      status: 'DRAFT',
      priority: 7,
      scopeBrief: 'Check whether the evidence is in scope, reproducible, and severe enough for the claimed HackerOne rating.',
      description: 'Independently review validation evidence against HackerOne policy, platform-standard deviations, bounty table, and report quality.',
      acceptanceCriteria: [
        '1. Scope fit and out-of-scope exclusions are explicitly checked.',
        '2. Severity is justified against imported reward and max-severity guidance.',
        '3. Reviewer recommends report ready, needs more testing, or should not submit.',
      ].join('\n'),
      inputPacket: sharedInput,
      outputContract,
      dependsOn: [validation.id],
    });
    const report = await this.createWorkItem(projectId, userId, {
      goalId: goal.id,
      featureId: reportFeature.id,
      title: 'Draft HackerOne report from evidence',
      workType: 'REPORT',
      status: 'DRAFT',
      priority: 6,
      scopeBrief: 'Prepare a report draft for the owner to review; do not submit externally without owner approval.',
      description: 'Use the imported HackerOne report fields and validation evidence to prepare a concise, reproducible report draft.',
      acceptanceCriteria: [
        '1. Draft includes summary, affected asset, reproduction steps, impact, evidence, severity, and remediation signal when useful.',
        '2. Draft identifies any uncertainty or missing evidence.',
        '3. Draft is ready for owner review and external submission decision.',
      ].join('\n'),
      inputPacket: sharedInput,
      outputContract,
      dependsOn: [review.id],
    });
    const memory = await this.createHackerOneSkillMemory(projectId, userId, blueprint);

    return {
      goal,
      features: [intakeFeature, validationFeature, reportFeature],
      workItems: [intake, plan, validation, review, report],
      memory,
    };
  }

  private async createHackerOneSkillMemory(projectId: string, userId: string, blueprint: any) {
    return this.createMemory(projectId, userId, {
      memoryType: 'INTERFACE_CONTRACT',
      title: 'HackerOne bounty workflow skill draft',
      summary: 'Task-specific workflow guidance for this HackerOne bounty project.',
      content: blueprint.skillDraft,
      metadata: {
        subtype: 'skill_draft',
        sourceTaskId: blueprint.source.taskId,
        skillRef: 'skill://hackerone-bounty-workflow',
        roles: blueprint.roles,
      },
    }).catch((err) => {
      this.logger.warn(`Failed to create HackerOne skill memory for ${projectId}: ${(err as Error).message}`);
      return null;
    });
  }

  private buildHackerOneSkillDraft(input: {
    programName: string;
    programHandle: string;
    asset: string;
    assetType: string;
    rewardRange: string;
    reportTemplate: string[];
    scopeExclusions: any[];
    platformStandardsExclusions: any[];
    safetyRules: string[];
    scopeCatalogSummary?: {
      totalEligibleScopes?: number | null;
      assetTypeSummary?: string;
      preview?: string[];
    } | null;
  }) {
    const exclusions = input.scopeExclusions
      .map((item) => [item?.category, item?.details].filter(Boolean).join(': '))
      .filter(Boolean);
    const platformRules = input.platformStandardsExclusions
      .map((item) => [item?.standard, item?.justification].filter(Boolean).join(': '))
      .filter(Boolean);
    return [
      '# Task-Specific HackerOne Workflow',
      '',
      `Program: ${input.programName}${input.programHandle ? ` (${input.programHandle})` : ''}`,
      `Asset: ${input.asset}`,
      `Asset type: ${input.assetType}`,
      input.rewardRange ? `Reward range: ${input.rewardRange}` : null,
      '',
      '## Scope Gate',
      input.scopeCatalogSummary
        ? `- This is a program-level import with ${input.scopeCatalogSummary.totalEligibleScopes || 'unknown'} eligible scopes; select concrete scope asset(s) from scopeCatalog before testing.`
        : '- Confirm the exact asset before testing.',
      input.scopeCatalogSummary?.assetTypeSummary
        ? `- Imported asset types: ${input.scopeCatalogSummary.assetTypeSummary}.`
        : null,
      input.scopeCatalogSummary
        ? '- Prefer URL, API, WILDCARD, SDK/source-code, OAuth, and multi-tenant web targets when present; justify mobile-only, executable-only, hardware, payment/KYC-heavy, or OTHER scopes before dispatch.'
        : null,
      ...(input.scopeCatalogSummary?.preview?.length
        ? input.scopeCatalogSummary.preview.slice(0, 8).map((item) => `- Scope preview: ${item}`)
        : []),
      '- Check submission eligibility and bounty eligibility.',
      '- Stop if the target, account role, or authorization boundary is unclear.',
      ...exclusions.map((item) => `- Out-of-scope: ${item}`),
      ...platformRules.map((item) => `- Platform deviation: ${item}`),
      '',
      '## Safe Validation',
      '- Prefer read-only or reversible tests.',
      '- Use the minimum traffic and minimum data needed to prove the issue.',
      '- Capture requests, responses, timestamps, account role, and impact.',
      ...input.safetyRules.map((item) => `- ${item}`),
      '',
      '## Report Contract',
      ...(input.reportTemplate.length
        ? input.reportTemplate.map((item) => `- ${item}`)
        : [
            '- Summary',
            '- Affected asset',
            '- Reproduction steps',
            '- Impact',
            '- Evidence',
            '- Severity',
          ]),
    ].filter(Boolean).join('\n');
  }

  private hackerOneRewardRangeText(rewards: any) {
    const table = Array.isArray(rewards?.table) ? rewards.table : [];
    const critical = table.find((row: any) => String(row?.severity || row?.label || '').toLowerCase() === 'critical');
    const firstPaid = table.find((row: any) => row?.rawAmount && !String(row.rawAmount).includes('$0'));
    return critical?.rawAmount || firstPaid?.rawAmount || '';
  }

  private compactText(value: any, fallback = '') {
    return String(value || fallback).replace(/\s+/g, ' ').trim();
  }

  private truncateText(value: string, maxLength: number) {
    const text = this.compactText(value);
    return text.length > maxLength ? `${text.slice(0, Math.max(0, maxLength - 3)).trim()}...` : text;
  }

  private async ensureTemplateProjectFileFolders(projectId: string, folders: string[]) {
    const uniqueFolders = [...new Set((folders || []).filter((folder) => typeof folder === 'string' && folder.trim()))];
    for (const folder of uniqueFolders) {
      await this.agentWorkspaceClient.createProjectFolder(projectId, folder).catch((err) => {
        this.logger.warn(`Failed to create project file folder "${folder}" for ${projectId}: ${(err as Error).message}`);
      });
    }
  }

  private leadWorkspaceInitialContent() {
    return [
      '# Lead Workspace',
      '',
      'This file is the Lead Agent human-readable workspace. It is a dashboard and checkpoint, not the source of truth.',
      'Goal, work item, assignment, review, resource, file, and memory truth still comes from the workspace and host APIs.',
      '',
      '## Current Frontier Policy',
      '- Max goals per polling tick: 5',
      '- Priority order: lead-attention items, changed digest, blocked goals, oldest unchecked',
      '',
      '## Polling Cursor',
      '- lastRunId:',
      '- nextGoalCursor:',
      '- unfinishedScanReason:',
      '',
      '## Active Goal Queue',
      '| goalId | topology | lastDigest | leadAttention | nextAction |',
      '|---|---|---|---|---|',
      '',
      '## Project-Level Decisions',
      '-',
      '',
      '## Open Risks / Owner Gates',
      '-',
      '',
    ].join('\n');
  }

  private async ensureProjectLeadWorkspaceFile(projectId: string) {
    const client = this.agentWorkspaceClient as any;
    if (!client?.writeProjectFile) return;

    if (client.createProjectFolder) {
      await client.createProjectFolder(projectId, 'coordination').catch((err: any) => {
        this.logger.warn(`Failed to create lead coordination folder for ${projectId}: ${err?.message || err}`);
      });
    }

    if (client.readProjectFile) {
      const existing = await client.readProjectFile(projectId, 'coordination/lead.md', 'text').catch(() => null);
      const content = typeof existing?.content === 'string'
        ? existing.content
        : typeof existing?.text === 'string'
          ? existing.text
          : '';
      if (content.trim()) return;
    }

    await client.writeProjectFile(projectId, {
      path: 'coordination/lead.md',
      content: this.leadWorkspaceInitialContent(),
      contentType: 'text/markdown; charset=utf-8',
    }).catch((err: any) => {
      this.logger.warn(`Failed to initialize lead workspace file for ${projectId}: ${err?.message || err}`);
    });
  }

  async listProjects(
    userId: string | null | undefined,
    query: { status?: string; search?: string; page?: number; limit?: number },
  ) {
    const { status, page = 1, limit = 20 } = query;
    const search = query.search?.trim();
    const where: any = {
      AND: [
        { deletedAt: null },
        {
          OR: [
            { visibility: 'public' },
            ...(userId
              ? [
                  { ownerId: userId },
                  { members: { some: { userId, removedAt: null } } },
                ]
              : []),
          ],
        },
      ],
    };

    if (status) {
      where.AND.push({ status: status as any });
    }
    if (search) {
      where.AND.push({
        OR: [
          { name: { contains: search } },
          { slug: { contains: search } },
          { summary: { contains: search } },
          { brief: { contains: search } },
          { settings: { path: '$.githubUrl', string_contains: search } },
        ],
      });
    }

    const activeWhere = {
      AND: [...where.AND, { status: 'ACTIVE' as any }],
    };
    const childProjectWhere = { is: where };

    const [projects, total, active, workItems, artifacts] = await Promise.all([
      this.prisma.project.findMany({
        where,
        include: {
          owner: { select: { id: true, email: true, displayName: true, role: true } },
          leadAgent: { select: { id: true, email: true, displayName: true, role: true } },
          _count: { select: { members: true, workItems: true, artifacts: true } },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.project.count({ where }),
      this.prisma.project.count({ where: activeWhere }),
      this.prisma.projectWorkItem.count({ where: { project: childProjectWhere } }),
      this.prisma.projectArtifact.count({ where: { project: childProjectWhere } }),
    ]);

    return {
      data: projects.map((project) => {
        const projectGlobals = this.getProjectGlobalVariables(project.settings);
        return this.normalizeProject({
          ...project,
          name: this.preserveProjectNameDomains(project.name, project.summary, project.brief),
          githubUrl: this.getProjectGithubUrl(project.settings),
          projectGlobals: this.sanitizeProjectGlobalVariables(projectGlobals),
          settings: this.withSanitizedProjectSettings(project.settings, projectGlobals),
        });
      }),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        stats: { total, active, workItems, artifacts },
      },
    };
  }

  async getProject(projectId: string, userId?: string | null) {
    await this.ensureProjectReadable(projectId, userId);

    const [workspaceProject, members, project] = await Promise.all([
      this.agentWorkspaceClient.getProject(projectId),
      this.getWorkspaceMembers(projectId),
      this.prisma.project.findFirst({
        where: { id: projectId, deletedAt: null },
        include: {
          owner: { select: { id: true, email: true, displayName: true, role: true } },
          leadAgent: { select: { id: true, email: true, displayName: true, role: true } },
          goals: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
          features: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
          _count: { select: { members: true, workItems: true, artifacts: true, reviews: true, memories: true } },
        },
      }),
    ]);

    if (!project) {
      throw new NotFoundException('Project not found');
    }
    const projectGlobals = await this.resolveProjectGlobalVariables(project.id, project.settings);
    const canViewProjectGlobalValues = Boolean(userId && userId === project.ownerId);
    const projectSummary = workspaceProject.description ?? project.summary;
    const projectBrief = workspaceProject.brief ?? project.brief;

    return this.normalizeProject({
      ...project,
      name: this.preserveProjectNameDomains(
        workspaceProject.name || project.name,
        projectSummary,
        projectBrief,
        ...project.goals.map((goal) => goal.title),
      ),
      slug: workspaceProject.slug || project.slug,
      summary: projectSummary,
      brief: projectBrief,
      status: workspaceProject.status,
      visibility: workspaceProject.visibility || project.visibility,
      ownerId: workspaceProject.ownerUserId,
      leadAgentUserId: workspaceProject.leadUserId ?? project.leadAgentUserId,
      budgetAmount: workspaceProject.budgetAmount ?? project.budgetAmount,
      budgetCurrency: workspaceProject.budgetCurrency ?? project.budgetCurrency,
      createdAt: workspaceProject.createdAt ?? project.createdAt,
      updatedAt: workspaceProject.updatedAt ?? project.updatedAt,
      githubUrl: this.getProjectGithubUrl(project.settings),
      projectGlobals: this.sanitizeProjectGlobalVariables(projectGlobals, {
        includeValues: canViewProjectGlobalValues,
      }),
      settings: this.withSanitizedProjectSettings(project.settings, projectGlobals, {
        includeValues: canViewProjectGlobalValues,
      }),
      members,
      memberCount: members.length,
      workspaceSummary: workspaceProject.summary ?? null,
      source: workspaceProject.source ?? null,
    });
  }

  async getProjectBoard(projectId: string, userId?: string | null) {
    await this.ensureProjectReadable(projectId, userId);

    const [workspaceProject, workspaceBoard, members, project, workItems, assignments, runs, artifacts, reviews, reviewStatuses, memoriesResponse] = await Promise.all([
      this.agentWorkspaceClient.getProject(projectId),
      this.agentWorkspaceClient.getBoard(projectId),
      this.getWorkspaceMembers(projectId),
      this.prisma.project.findFirst({
        where: { id: projectId, deletedAt: null },
        include: {
          owner: { select: { id: true, email: true, displayName: true, role: true } },
          leadAgent: { select: { id: true, email: true, displayName: true, role: true } },
          goals: { select: { id: true, title: true, status: true } },
          features: { select: { id: true, title: true, status: true, goalId: true } },
          _count: {
            select: {
              members: true,
              workItems: true,
              assignments: true,
              runs: true,
              artifacts: true,
              reviews: true,
              memories: true,
            },
          },
        },
      }),
      this.prisma.projectWorkItem.findMany({
        where: { projectId },
        select: {
          id: true,
          title: true,
          workType: true,
          status: true,
          priority: true,
          goalId: true,
          featureId: true,
          ownerId: true,
          updatedAt: true,
          dueAt: true,
          owner: { select: { id: true, email: true, displayName: true, role: true } },
          _count: { select: { assignments: true, runs: true, artifacts: true, reviews: true } },
        },
        orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
      }),
      this.prisma.projectAssignment.findMany({
        where: { projectId },
        select: {
          id: true,
          workItemId: true,
          assigneeUserId: true,
          role: true,
          status: true,
          updatedAt: true,
          finishedAt: true,
        },
      }),
      this.prisma.projectRun.findMany({
        where: { projectId },
        select: {
          id: true,
          workItemId: true,
          assignmentId: true,
          triggeredByUserId: true,
          runType: true,
          status: true,
          updatedAt: true,
          finishedAt: true,
        },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.projectArtifact.findMany({
        where: { projectId },
        take: 8,
        include: {
          createdByUser: { select: { id: true, email: true, displayName: true, role: true } },
          workItem: { select: { id: true, title: true, status: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.projectReview.findMany({
        where: { projectId },
        take: 8,
        include: {
          reviewerUser: { select: { id: true, email: true, displayName: true, role: true } },
          workItem: { select: { id: true, title: true, status: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.projectReview.findMany({
        where: { projectId },
        select: { status: true },
      }),
      this.agentWorkspaceClient.listProjectMemories(projectId, { limit: 8 }),
    ]);

    if (!project) {
      throw new NotFoundException('Project not found');
    }
    const memories = memoriesResponse.memories || [];
    const projectGlobals = await this.resolveProjectGlobalVariables(project.id, project.settings);
    const canViewProjectGlobalValues = Boolean(userId && userId === project.ownerId);

    const assignmentByUser = assignments.reduce<Record<string, typeof assignments>>((acc, assignment) => {
      acc[assignment.assigneeUserId] = [...(acc[assignment.assigneeUserId] || []), assignment];
      return acc;
    }, {});
    const runsByAssignment = runs.reduce<Record<string, typeof runs>>((acc, run) => {
      if (!run.assignmentId) return acc;
      acc[run.assignmentId] = [...(acc[run.assignmentId] || []), run];
      return acc;
    }, {});
    const workItemById = new Map(workItems.map((item) => [item.id, item]));

    const cockpit = members.map((member) => {
      const memberAssignments = assignmentByUser[member.userId] || [];
      const memberRuns = memberAssignments.flatMap((assignment) => runsByAssignment[assignment.id] || []);
      const activeAssignments = memberAssignments.filter((assignment) =>
        ['PROPOSED', 'ACTIVE', 'PAUSED'].includes(assignment.status),
      );
      const activeRuns = memberRuns.filter((run) => ['QUEUED', 'RUNNING'].includes(run.status));
      const lastRun = [...memberRuns].sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))[0];

      return {
        memberId: member.id,
        role: member.role,
        joinedAt: member.joinedAt,
        permissions: member.permissions,
        runtime: member.runtime,
        activeGrants: member.activeGrants,
        presence: member.presence,
        user: member.user,
        metrics: {
          assignments: memberAssignments.length,
          activeAssignments: activeAssignments.length,
          completedAssignments: memberAssignments.filter((assignment) => assignment.status === 'COMPLETED').length,
          failedAssignments: memberAssignments.filter((assignment) => assignment.status === 'FAILED').length,
          runs: memberRuns.length,
          activeRuns: activeRuns.length,
          successfulRuns: memberRuns.filter((run) => run.status === 'SUCCEEDED').length,
          failedRuns: memberRuns.filter((run) => run.status === 'FAILED').length,
        },
        focusWorkItems: activeAssignments
          .map((assignment) => workItemById.get(assignment.workItemId))
          .filter(Boolean)
          .slice(0, 4),
        lastRun: lastRun
          ? {
              id: lastRun.id,
              status: lastRun.status,
              runType: lastRun.runType,
              updatedAt: lastRun.updatedAt,
              workItem: workItemById.get(lastRun.workItemId) || null,
            }
          : null,
      };
    });

    const laneOrder = [
      'DRAFT',
      'READY',
      'ASSIGNED',
      'IN_PROGRESS',
      'IN_REVIEW',
      'NEEDS_REVISION',
      'ACCEPTED',
      'REJECTED',
      'CANCELLED',
    ];
    const lanes = laneOrder.map((status) => ({
      status,
      count: workItems.filter((item) => item.status === status).length,
      items: workItems.filter((item) => item.status === status).slice(0, 6),
    }));
    const projectSummary = workspaceProject.description ?? project.summary;
    const projectBrief = workspaceProject.brief ?? project.brief;

    return {
      project: {
        id: project.id,
        name: this.preserveProjectNameDomains(
          workspaceProject.name || project.name,
          projectSummary,
          projectBrief,
          ...project.goals.map((goal) => goal.title),
        ),
        slug: workspaceProject.slug || project.slug,
        summary: projectSummary,
        brief: projectBrief,
        status: workspaceProject.status,
        visibility: workspaceProject.visibility || project.visibility,
        ownerId: workspaceProject.ownerUserId,
        leadAgentUserId: workspaceProject.leadUserId ?? project.leadAgentUserId,
        budgetAmount: workspaceProject.budgetAmount ?? project.budgetAmount,
        budgetCurrency: workspaceProject.budgetCurrency ?? project.budgetCurrency,
        createdAt: workspaceProject.createdAt ?? project.createdAt,
        updatedAt: workspaceProject.updatedAt ?? project.updatedAt,
        githubUrl: this.getProjectGithubUrl(project.settings),
        projectGlobals: this.sanitizeProjectGlobalVariables(projectGlobals, {
          includeValues: canViewProjectGlobalValues,
        }),
        owner: project.owner,
        leadAgent: project.leadAgent,
      },
      metrics: {
        goals: project.goals.length,
        features: project.features.length,
        members: workspaceBoard.summary.memberCount,
        workItems: workItems.length,
        assignments: assignments.length,
        runs: runs.length,
        artifacts: project._count.artifacts,
        reviews: project._count.reviews,
        memories: project._count.memories,
        workItemStatusCounts: this.countByStatus(workItems),
        assignmentStatusCounts: this.countByStatus(assignments),
        runStatusCounts: this.countByStatus(runs),
        reviewStatusCounts: this.countByStatus(reviewStatuses),
      },
      lanes,
      cockpit,
      workspace: {
        memberPresence: workspaceBoard.memberPresence,
        inboxSummary: workspaceBoard.inboxSummary,
        openCiIncidents: workspaceBoard.summary.openCiIncidents,
      },
      recent: {
        artifacts,
        reviews,
        memories,
        runs: runs.slice(0, 8).map((run) => ({
          ...run,
          workItem: workItemById.get(run.workItemId) || null,
        })),
      },
    };
  }

  async listProjectActivity(projectId: string, userId: string | null | undefined, limit = 40) {
    await this.ensureProjectReadable(projectId, userId);

    const cappedLimit = Math.min(Math.max(limit || 40, 1), 100);
    const perSource = Math.min(Math.max(cappedLimit, 8), 30);

    const [workItems, assignments, runs, runLogs, artifacts, reviews, memoriesResponse] = await Promise.all([
      this.prisma.projectWorkItem.findMany({
        where: { projectId },
        take: perSource,
        include: {
          owner: { select: { id: true, email: true, displayName: true, role: true } },
          createdBy: { select: { id: true, email: true, displayName: true, role: true } },
        },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.projectAssignment.findMany({
        where: { projectId },
        take: perSource,
        include: {
          assigneeUser: { select: { id: true, email: true, displayName: true, role: true } },
          assignedByUser: { select: { id: true, email: true, displayName: true, role: true } },
          workItem: { select: { id: true, title: true, status: true, workType: true } },
        },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.projectRun.findMany({
        where: { projectId },
        take: perSource,
        include: {
          triggeredByUser: { select: { id: true, email: true, displayName: true, role: true } },
          assignment: {
            select: {
              id: true,
              assigneeUser: { select: { id: true, email: true, displayName: true, role: true } },
            },
          },
          workItem: { select: { id: true, title: true, status: true, workType: true } },
        },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.projectRunLog.findMany({
        where: { run: { projectId } },
        take: perSource,
        include: {
          run: {
            select: {
              id: true,
              runType: true,
              status: true,
              workItem: { select: { id: true, title: true, status: true, workType: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.projectArtifact.findMany({
        where: { projectId },
        take: perSource,
        include: {
          createdByUser: { select: { id: true, email: true, displayName: true, role: true } },
          workItem: { select: { id: true, title: true, status: true, workType: true } },
          run: { select: { id: true, runType: true, status: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.projectReview.findMany({
        where: { projectId },
        take: perSource,
        include: {
          reviewerUser: { select: { id: true, email: true, displayName: true, role: true } },
          workItem: { select: { id: true, title: true, status: true, workType: true } },
          artifact: { select: { id: true, title: true, artifactType: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.agentWorkspaceClient.listProjectMemories(projectId, { limit: perSource }),
    ]);
    const memories = memoriesResponse.memories || [];

    const activity = [
      ...workItems.map((item) => ({
        id: `work-item:${item.id}`,
        type: 'WORK_ITEM',
        occurredAt: item.updatedAt,
        title: item.title,
        summary: `${item.workType} moved to ${item.status}`,
        actor: this.activityActor(item.owner || item.createdBy),
        workItem: { id: item.id, title: item.title, status: item.status, workType: item.workType },
      })),
      ...assignments.map((assignment) => ({
        id: `assignment:${assignment.id}`,
        type: 'ASSIGNMENT',
        occurredAt: assignment.updatedAt,
        title: `${assignment.role} assignment`,
        summary: `${assignment.assigneeUser.displayName || assignment.assigneeUser.email} is ${assignment.status.toLowerCase()}`,
        actor: this.activityActor(assignment.assignedByUser),
        workItem: assignment.workItem,
        assignment: {
          id: assignment.id,
          role: assignment.role,
          status: assignment.status,
        },
      })),
      ...runs.map((run) => ({
        id: `run:${run.id}`,
        type: 'RUN',
        occurredAt: run.updatedAt,
        title: `${run.runType} run`,
        summary: `Run is ${run.status.toLowerCase()}`,
        actor: this.activityActor(run.triggeredByUser || run.assignment?.assigneeUser),
        workItem: run.workItem,
        run: {
          id: run.id,
          status: run.status,
          runType: run.runType,
        },
      })),
      ...runLogs.map((log) => ({
        id: `run-log:${log.id}`,
        type: 'RUN_LOG',
        occurredAt: log.createdAt,
        title: `${log.level.toUpperCase()} log`,
        summary: log.message,
        actor: null,
        workItem: log.run.workItem,
        run: {
          id: log.run.id,
          status: log.run.status,
          runType: log.run.runType,
        },
      })),
      ...artifacts.map((artifact) => ({
        id: `artifact:${artifact.id}`,
        type: 'ARTIFACT',
        occurredAt: artifact.createdAt,
        title: artifact.title || artifact.artifactType,
        summary: artifact.url ? `Artifact linked at ${artifact.url}` : artifact.content || artifact.artifactType,
        actor: this.activityActor(artifact.createdByUser),
        workItem: artifact.workItem,
        run: artifact.run
          ? {
              id: artifact.run.id,
              status: artifact.run.status,
              runType: artifact.run.runType,
            }
          : null,
      })),
      ...reviews.map((review) => ({
        id: `review:${review.id}`,
        type: 'REVIEW',
        occurredAt: review.createdAt,
        title: `${review.reviewerType} review`,
        summary: review.reviewNote || `Review marked ${review.status.toLowerCase()}`,
        actor: this.activityActor(review.reviewerUser),
        workItem: review.workItem,
        review: {
          id: review.id,
          status: review.status,
          reviewerType: review.reviewerType,
        },
        artifact: review.artifact
          ? {
              id: review.artifact.id,
              title: review.artifact.title,
              artifactType: review.artifact.artifactType,
            }
          : null,
      })),
      ...memories.map((memory) => ({
        id: `memory:${memory.id}`,
        type: 'MEMORY',
        occurredAt: memory.createdAt,
        title: memory.title || memory.memoryType,
        summary: memory.summary || memory.content,
        actor: this.activityActor(memory.createdByUser),
        memory: {
          id: memory.id,
          memoryType: memory.memoryType,
        },
      })),
    ]
      .sort((a, b) => +new Date(b.occurredAt) - +new Date(a.occurredAt))
      .slice(0, cappedLimit);

    return {
      projectId,
      items: activity,
    };
  }

  async listProjectEvents(
    projectId: string,
    userId: string | null | undefined,
    query?: { sinceSeq?: number; types?: string[]; refType?: string; refId?: string; workItemId?: string; limit?: number },
  ) {
    await this.ensureProjectReadable(projectId, userId);
    const cappedLimit = Math.min(Math.max(query?.limit || 80, 1), 200);
    return this.agentWorkspaceClient.listProjectEvents(projectId, {
      sinceSeq: query?.sinceSeq,
      types: query?.types,
      refType: query?.refType,
      refId: query?.refId,
      workItemId: query?.workItemId,
      limit: cappedLimit,
    });
  }

  async getProjectEventGraph(projectId: string, userId: string | null | undefined, limit = 160) {
    const project = await this.ensureProjectReadable(projectId, userId);
    const cappedLimit = Math.min(Math.max(limit || 160, 20), 200);

    const [members, goals, features, workItems, runs, artifacts, reviews, eventsResponse, filesResponse] = await Promise.all([
      this.prisma.projectMember.findMany({
        where: { projectId, removedAt: null },
        include: {
          user: { select: { id: true, email: true, displayName: true, role: true } },
        },
      }),
      this.prisma.projectGoal.findMany({
        where: { projectId },
        select: { id: true, title: true, status: true, priority: true, sortOrder: true, createdById: true, createdAt: true },
        orderBy: [{ priority: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
        take: 80,
      }),
      this.prisma.projectFeature.findMany({
        where: { projectId },
        select: { id: true, title: true, status: true, goalId: true, createdById: true, createdAt: true },
        orderBy: [{ priority: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
        take: 100,
      }),
      this.prisma.projectWorkItem.findMany({
        where: { projectId },
        select: {
          id: true,
          title: true,
          status: true,
          workType: true,
          goalId: true,
          featureId: true,
          parentWorkItemId: true,
          ownerId: true,
          createdById: true,
          createdAt: true,
          assignments: {
            select: {
              id: true,
              role: true,
              status: true,
              assigneeUserId: true,
              assignedByUserId: true,
            },
            take: 20,
          },
        },
        orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
        take: 140,
      }),
      this.prisma.projectRun.findMany({
        where: { projectId },
        select: {
          id: true,
          workItemId: true,
          assignmentId: true,
          triggeredByUserId: true,
          runType: true,
          status: true,
          resultSummary: true,
          startedAt: true,
          finishedAt: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: [{ updatedAt: 'desc' }],
        take: 100,
      }),
      this.prisma.projectArtifact.findMany({
        where: { projectId },
        select: {
          id: true,
          workItemId: true,
          assignmentId: true,
          runId: true,
          artifactType: true,
          title: true,
          url: true,
          createdByUserId: true,
          createdAt: true,
        },
        orderBy: [{ createdAt: 'desc' }],
        take: 100,
      }),
      this.prisma.projectReview.findMany({
        where: { projectId },
        select: {
          id: true,
          workItemId: true,
          assignmentId: true,
          artifactId: true,
          reviewerUserId: true,
          reviewerType: true,
          status: true,
          reviewNote: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: [{ updatedAt: 'desc' }],
        take: 100,
      }),
      this.agentWorkspaceClient.listProjectEvents(projectId, { limit: cappedLimit }).catch(() => ({
        projectId,
        events: [],
        lastSeq: 0,
      })),
      this.agentWorkspaceClient.listProjectFiles(projectId, { limit: 80, recursive: true }).catch(() => ({ files: [] })),
    ]);

    const projectGlobals = await this.resolveProjectGlobalVariables(projectId, project.settings).catch(() => []);
    const userIdToMember = new Map(members.map((member) => [member.userId, member]));
    const memberById = new Map(members.map((member) => [member.id, member]));
    const workItemById = new Map(workItems.map((item) => [item.id, item]));
    const assignmentById = new Map(
      workItems.flatMap((item) =>
        (item.assignments || []).map((assignment) => [assignment.id, { ...assignment, workItemId: item.id }] as const),
      ),
    );
    const runById = new Map(runs.map((run) => [run.id, run]));
    const artifactById = new Map(artifacts.map((artifact) => [artifact.id, artifact]));
    const featureById = new Map(features.map((feature) => [feature.id, feature]));
    const goalById = new Map(goals.map((goal) => [goal.id, goal]));
    const nodes = new Map<string, any>();
    const edges = new Map<string, any>();

    const humanize = (value?: string | null) =>
      String(value || '')
        .split('_')
        .filter(Boolean)
        .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
        .join(' ');
    const stringValue = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : '');
    const arrayValue = (value: unknown) => (Array.isArray(value) ? value.filter((item) => typeof item === 'string') : []);
    const addNode = (node: any) => {
      if (!node?.id) return;
      const existing = nodes.get(node.id) || {};
      nodes.set(node.id, {
        ...existing,
        ...node,
        meta: {
          ...(existing.meta || {}),
          ...(node.meta || {}),
        },
      });
    };
    const addEdge = (edge: any) => {
      if (!edge?.source || !edge?.target || edge.source === edge.target) return;
      const id = edge.id || `${edge.source}->${edge.target}:${edge.type || edge.label || 'rel'}`;
      if (!nodes.has(edge.source) || !nodes.has(edge.target)) return;
      edges.set(id, { id, ...edge });
    };
    const memberNodeId = (memberId?: string | null) => (memberId ? `agent:${memberId}` : '');
    const memberNodeIdForUser = (targetUserId?: string | null) => {
      const member = targetUserId ? userIdToMember.get(targetUserId) : null;
      return member ? memberNodeId(member.id) : '';
    };
    const memberLabelForId = (memberId?: string | null) => {
      const member = memberId ? memberById.get(memberId) : null;
      return member ? this.agentDisplayNameForMember(member as any) : '';
    };
    const memberLabelForUser = (targetUserId?: string | null) => {
      const member = targetUserId ? userIdToMember.get(targetUserId) : null;
      return member ? this.agentDisplayNameForMember(member as any) : '';
    };
    const goalNodeId = (goalId?: string | null) => (goalId ? `goal:${goalId}` : '');
    const featureNodeId = (featureId?: string | null) => (featureId ? `feature:${featureId}` : '');
    const workItemNodeId = (workItemId?: string | null) => (workItemId ? `work-item:${workItemId}` : '');
    const runNodeId = (runId?: string | null) => (runId ? `run:${runId}` : '');
    const artifactNodeId = (artifactId?: string | null) => (artifactId ? `artifact:${artifactId}` : '');
    const reviewNodeId = (reviewId?: string | null) => (reviewId ? `review:${reviewId}` : '');
    const messageNodeId = (eventId?: string | null) => (eventId ? `message:${eventId}` : '');
    const projectGlobalIdentityValue = (key?: string | null, scope?: string | null, goalId?: string | null) => {
      const normalizedKey = stringValue(key);
      if (!normalizedKey) return '';
      return scope === 'goal' && goalId ? `goal:${goalId}:${normalizedKey}` : `project:${normalizedKey}`;
    };
    const normalizeProjectGlobalIdentity = (value?: string | null, key?: string | null, scope?: string | null, goalId?: string | null) => {
      const identity = stringValue(value);
      if (identity.startsWith('project:') || identity.startsWith('goal:')) return identity;
      return projectGlobalIdentityValue(key || identity, scope, goalId);
    };
    const resourceNodeId = (keyOrIdentity?: string | null, scope?: string | null, goalId?: string | null) => {
      const identity = normalizeProjectGlobalIdentity(keyOrIdentity, keyOrIdentity, scope, goalId);
      return identity ? `resource:${identity}` : '';
    };
    const resourceNodeIdForPayload = (payload: Record<string, unknown>, refId?: string | null) => {
      const refIdentity = stringValue(refId);
      if (refIdentity.startsWith('project:') || refIdentity.startsWith('goal:')) return resourceNodeId(refIdentity);
      return resourceNodeId(
        stringValue(payload.identity) || stringValue(payload.key),
        stringValue(payload.scope),
        stringValue(payload.goalId),
      );
    };
    const fileNodeId = (path?: string | null) => (path ? `file:${path}` : '');
    const coordinatorNodeId = 'agent:project-coordinator';
    const coordinatorConfigNodeId = 'resource:project:coordinator';
    const isCoordinatorEvent = (event: any, payload: Record<string, unknown>) =>
      stringValue(payload.source) === 'project-coordinator' ||
      stringValue(payload.launchSource) === 'coordinator' ||
      payload.coordinatorGenerated === true ||
      String(event.type || '').startsWith('COORDINATOR_');
    const eventActorInfo = (event: any) => {
      const payload = (event.payload || {}) as Record<string, unknown>;
      if (isCoordinatorEvent(event, payload)) {
        return { nodeId: coordinatorNodeId, label: 'Coordinator', userId: '', memberId: 'project-coordinator' };
      }
      const actorUserId = stringValue(event.actor?.id);
      const actorMemberId =
        stringValue(payload.senderMemberId) ||
        stringValue(payload.launcherMemberId) ||
        stringValue(payload.sourceMemberId) ||
        stringValue(payload.actorMemberId);
      const nodeId = memberNodeIdForUser(actorUserId) || memberNodeId(actorMemberId);
      const label =
        memberLabelForUser(actorUserId) ||
        memberLabelForId(actorMemberId) ||
        stringValue(event.actor?.displayName) ||
        stringValue(event.actor?.email);
      return nodeId ? { nodeId, label, userId: actorUserId, memberId: actorMemberId } : null;
    };
    const eventRelationshipLabel = (type?: string | null) => {
      if (type === 'AGENT_RUNTIME_LAUNCHED') return 'launched';
      if (type === 'AGENT_RUNTIME_MESSAGE_SENT' || type === 'MESSAGE_CREATED') return 'message';
      if (type === 'PROJECT_GLOBAL_CREATED') return 'created';
      if (type === 'PROJECT_GLOBAL_WRITTEN') return 'wrote';
      if (type === 'PROJECT_GLOBALS_UPDATED') return 'updated';
      if (type === 'COORDINATOR_CONFIG_UPDATED') return 'configured';
      if (type === 'COORDINATOR_DISPATCHED_ITEM') return 'dispatched';
      if (type === 'COORDINATOR_BLOCKED') return 'blocked';
      if (type === 'COORDINATOR_IDLE') return 'checked';
      if (type === 'RUN_CREATED') return 'created run';
      if (type === 'RUN_UPDATED') return 'updated run';
      if (type === 'REVIEW_CREATED') return 'reviewed';
      if (type === 'WORK_ITEM_STATUS_CHANGED') return 'changed status';
      return humanize(type);
    };
    const eventMemberTargetNodes = (event: any) => {
      const payload = (event.payload || {}) as Record<string, unknown>;
      return [
        stringValue(payload.assigneeMemberId),
        stringValue(payload.targetMemberId),
        ...arrayValue(payload.targetMemberIds),
        ...arrayValue(payload.mentionMemberIds),
      ]
        .map((memberId) => memberNodeId(memberId))
        .filter((nodeId) => nodeId && nodes.has(nodeId));
    };
    const featureCreatorById = new Map<string, { nodeId: string; label: string; eventId?: string; seq?: number; occurredAt?: string }>();
    const resourceActorByNodeId = new Map<string, { nodeId: string; label: string; type: string; eventId?: string; seq?: number; occurredAt?: string }>();
    const fileActorByPath = new Map<string, { nodeId: string; label: string; type: string; eventId?: string; seq?: number; occurredAt?: string }>();
    addNode({
      id: coordinatorNodeId,
      type: 'AGENT',
      label: 'Coordinator',
      subtitle: 'System coordinator',
      status: this.resolveProjectWorkItemStatusFlow(project.settings).coordinator.enabled ? 'ENABLED' : 'DISABLED',
      meta: {
        memberId: 'project-coordinator',
        source: 'project-coordinator',
      },
    });
    addNode({
      id: coordinatorConfigNodeId,
      type: 'RESOURCE',
      label: 'Coordinator settings',
      subtitle: 'Status trigger rules, launch mode, agent type, message template',
      status: this.resolveProjectWorkItemStatusFlow(project.settings).coordinator.enabled ? 'ENABLED' : 'DISABLED',
      meta: {
        identity: 'project:coordinator',
        key: 'coordinator',
        category: 'coordination',
      },
    });
    addEdge({
      source: coordinatorNodeId,
      target: coordinatorConfigNodeId,
      type: 'USES_RESOURCE',
      label: 'config',
    });
    for (const event of eventsResponse.events || []) {
      const actor = eventActorInfo(event);
      if (!actor) continue;
      const payload = (event.payload || {}) as Record<string, unknown>;
      if (event.type === 'FEATURE_CREATED' && event.refType === 'FEATURE' && event.refId && !featureCreatorById.has(event.refId)) {
        featureCreatorById.set(event.refId, {
          nodeId: actor.nodeId,
          label: actor.label,
          eventId: event.id,
          seq: event.seq,
          occurredAt: event.createdAt,
        });
      }
      if (event.type === 'PROJECT_GLOBAL_WRITTEN') {
        const targetNode = resourceNodeIdForPayload(payload, event.refId);
        if (targetNode) {
          resourceActorByNodeId.set(targetNode, {
            nodeId: actor.nodeId,
            label: actor.label,
            type: stringValue(payload.action) === 'created' ? 'PROJECT_GLOBAL_CREATED' : 'PROJECT_GLOBAL_WRITTEN',
            eventId: event.id,
            seq: event.seq,
            occurredAt: event.createdAt,
          });
        }
      }
      if (event.type === 'PROJECT_GLOBALS_UPDATED') {
        const createdKeySet = new Set(arrayValue(payload.createdKeys));
        const variablePayloads = Array.isArray(payload.variables)
          ? payload.variables.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry))
          : [];
        for (const variablePayload of variablePayloads) {
          const targetNode = resourceNodeIdForPayload(variablePayload);
          if (!targetNode) continue;
          resourceActorByNodeId.set(targetNode, {
            nodeId: actor.nodeId,
            label: actor.label,
            type: variablePayload.action === 'created' ? 'PROJECT_GLOBAL_CREATED' : 'PROJECT_GLOBALS_UPDATED',
            eventId: event.id,
            seq: event.seq,
            occurredAt: event.createdAt,
          });
        }
        if (!variablePayloads.length) {
          const identities = arrayValue(payload.identities);
          identities.forEach((identity) => {
            const targetNode = resourceNodeId(identity);
            if (!targetNode) return;
            resourceActorByNodeId.set(targetNode, {
              nodeId: actor.nodeId,
              label: actor.label,
              type: arrayValue(payload.createdIdentities).includes(identity) ? 'PROJECT_GLOBAL_CREATED' : event.type,
              eventId: event.id,
              seq: event.seq,
              occurredAt: event.createdAt,
            });
          });
          for (const key of arrayValue(payload.keys)) {
            const targetNode = resourceNodeId(key);
            if (!targetNode) continue;
            resourceActorByNodeId.set(targetNode, {
              nodeId: actor.nodeId,
              label: actor.label,
              type: createdKeySet.has(key) ? 'PROJECT_GLOBAL_CREATED' : event.type,
              eventId: event.id,
              seq: event.seq,
              occurredAt: event.createdAt,
            });
          }
        }
      }
      if (['PROJECT_FILE_WRITTEN', 'PROJECT_FILE_UPLOADED', 'PROJECT_FOLDER_CREATED'].includes(event.type)) {
        const path = stringValue(event.refId) || stringValue(payload.path);
        if (path) {
          fileActorByPath.set(path, {
            nodeId: actor.nodeId,
            label: actor.label,
            type: event.type,
            eventId: event.id,
            seq: event.seq,
            occurredAt: event.createdAt,
          });
        }
      }
    }

    const runtimeLaunchEdges: any[] = [];
    for (const member of members) {
      const runtime = this.readRuntimeSession(member.permissions);
      const label = this.agentDisplayNameForMember(member as any);
      addNode({
        id: memberNodeId(member.id),
        type: member.user.role === 'AI_AGENT' || member.role.includes('AGENT') ? 'AGENT' : 'HUMAN',
        label,
        subtitle: member.role,
        status: runtime?.status || 'MEMBER',
        meta: {
          memberId: member.id,
          userId: member.userId,
          email: member.user.email,
          runtimeId: runtime?.runtimeId ?? null,
          provider: runtime?.provider ?? null,
          agentType: runtime?.agentType ?? null,
          launchedBy: runtime?.launchedBy ?? null,
        },
      });
      const launchedBy = runtime?.launchedBy || null;
      const launcherNode =
        stringValue(launchedBy?.source) === 'coordinator'
          ? coordinatorNodeId
          : memberNodeId(launchedBy?.memberId) ||
            memberNodeIdForUser(launchedBy?.userId);
      if (runtime?.runtimeId && launcherNode) {
        runtimeLaunchEdges.push({
          source: launcherNode,
          target: memberNodeId(member.id),
          type: 'AGENT_RUNTIME_LAUNCHED',
          label: 'launched',
          occurredAt: launchedBy?.launchedAt || runtime.launchedAt,
          meta: {
            runtimeId: runtime.runtimeId,
            launchMode: runtime.provider,
            agentType: runtime.agentType ?? null,
            launcherRole: launchedBy?.role || null,
            launchSource: launchedBy?.source || null,
          },
        });
      }
    }
    for (const edge of runtimeLaunchEdges) {
      addEdge(edge);
    }

    for (const goal of goals) {
      addNode({
        id: goalNodeId(goal.id),
        type: 'GOAL',
        label: goal.title,
        subtitle: 'Goal',
        status: goal.status,
        meta: {
          goalId: goal.id,
          createdByUserId: goal.createdById,
          createdByLabel: memberLabelForUser(goal.createdById),
          createdAt: goal.createdAt,
        },
      });
      const creator = memberNodeIdForUser(goal.createdById);
      if (creator) addEdge({ source: creator, target: goalNodeId(goal.id), type: 'CREATED', label: 'created' });
    }

    for (const feature of features) {
      const creatorInfo = featureCreatorById.get(feature.id);
      const creatorNode = memberNodeIdForUser(feature.createdById) || creatorInfo?.nodeId || '';
      const creatorLabel = memberLabelForUser(feature.createdById) || creatorInfo?.label || '';
      addNode({
        id: featureNodeId(feature.id),
        type: 'FEATURE',
        label: feature.title,
        subtitle: 'Feature group',
        status: feature.status,
        meta: {
          featureId: feature.id,
          goalId: feature.goalId,
          createdByUserId: feature.createdById,
          createdByLabel: creatorLabel,
          createdAt: feature.createdAt,
        },
      });
      if (feature.goalId && goalById.has(feature.goalId)) {
        addEdge({
          source: goalNodeId(feature.goalId),
          target: featureNodeId(feature.id),
          type: 'HAS_FEATURE',
          label: 'feature',
        });
      }
      if (creatorNode) {
        addEdge({
          source: creatorNode,
          target: featureNodeId(feature.id),
          type: 'CREATED',
          label: 'created',
          eventId: creatorInfo?.eventId,
          occurredAt: creatorInfo?.occurredAt,
          seq: creatorInfo?.seq,
        });
      }
    }

    for (const item of workItems) {
      addNode({
        id: workItemNodeId(item.id),
        type: 'WORK_ITEM',
        label: item.title,
        subtitle: item.workType,
        status: item.status,
        meta: {
          workItemId: item.id,
          goalId: item.goalId,
          featureId: item.featureId,
          parentWorkItemId: item.parentWorkItemId,
          createdByUserId: item.createdById,
          createdByLabel: memberLabelForUser(item.createdById),
          createdAt: item.createdAt,
        },
      });
      const workItemParentNode = item.featureId && featureById.has(item.featureId)
        ? featureNodeId(item.featureId)
        : item.goalId && goalById.has(item.goalId)
          ? goalNodeId(item.goalId)
          : '';
      if (workItemParentNode) {
        addEdge({
          source: workItemParentNode,
          target: workItemNodeId(item.id),
          type: 'HAS_WORK_ITEM',
          label: 'item',
        });
      }
      if (item.parentWorkItemId) {
        addEdge({
          source: workItemNodeId(item.parentWorkItemId),
          target: workItemNodeId(item.id),
          type: 'CHILD_WORK_ITEM',
          label: 'child',
        });
      }
      const creator = memberNodeIdForUser(item.createdById);
      if (creator) addEdge({ source: creator, target: workItemNodeId(item.id), type: 'CREATED', label: 'created' });
      const owner = memberNodeIdForUser(item.ownerId);
      if (owner) addEdge({ source: owner, target: workItemNodeId(item.id), type: 'OWNS', label: 'owns' });
      for (const assignment of item.assignments || []) {
        const assignee = memberNodeIdForUser(assignment.assigneeUserId);
        const assignedBy = memberNodeIdForUser(assignment.assignedByUserId);
        if (assignedBy && assignee) {
          addEdge({
            source: assignedBy,
            target: assignee,
            type: 'DISPATCHED',
            label: assignment.role,
            meta: { assignmentId: assignment.id, status: assignment.status },
          });
        }
        if (assignee) {
          addEdge({
            source: assignee,
            target: workItemNodeId(item.id),
            type: 'ASSIGNED_TO',
            label: assignment.status,
            meta: { assignmentId: assignment.id, role: assignment.role },
          });
        }
      }
    }

    for (const run of runs) {
      const assignment = run.assignmentId ? assignmentById.get(run.assignmentId) : null;
      const runnerNode = memberNodeIdForUser(run.triggeredByUserId) || memberNodeIdForUser(assignment?.assigneeUserId);
      addNode({
        id: runNodeId(run.id),
        type: 'RUN',
        label: `${humanize(run.runType)} run`,
        subtitle: run.resultSummary || workItemById.get(run.workItemId)?.title || 'Execution run',
        status: run.status,
        meta: {
          runId: run.id,
          workItemId: run.workItemId,
          assignmentId: run.assignmentId,
          triggeredByUserId: run.triggeredByUserId,
          startedAt: run.startedAt,
          finishedAt: run.finishedAt,
          createdAt: run.createdAt,
          updatedAt: run.updatedAt,
        },
      });
      if (workItemById.has(run.workItemId)) {
        addEdge({
          source: workItemNodeId(run.workItemId),
          target: runNodeId(run.id),
          type: 'HAS_RUN',
          label: 'run',
        });
      }
      if (runnerNode) {
        addEdge({
          source: runnerNode,
          target: runNodeId(run.id),
          type: 'RAN',
          label: 'ran',
          meta: {
            assignmentId: run.assignmentId,
            runType: run.runType,
          },
        });
      }
    }

    for (const artifact of artifacts) {
      addNode({
        id: artifactNodeId(artifact.id),
        type: 'ARTIFACT',
        label: artifact.title || humanize(artifact.artifactType) || 'Artifact',
        subtitle: artifact.url || artifact.artifactType,
        status: artifact.artifactType,
        meta: {
          artifactId: artifact.id,
          workItemId: artifact.workItemId,
          assignmentId: artifact.assignmentId,
          runId: artifact.runId,
          createdByUserId: artifact.createdByUserId,
          url: artifact.url,
          createdAt: artifact.createdAt,
        },
      });
      const creator = memberNodeIdForUser(artifact.createdByUserId);
      if (creator) {
        addEdge({
          source: creator,
          target: artifactNodeId(artifact.id),
          type: 'CREATED',
          label: 'created',
        });
      }
      if (artifact.runId && runById.has(artifact.runId)) {
        addEdge({
          source: runNodeId(artifact.runId),
          target: artifactNodeId(artifact.id),
          type: 'PRODUCED',
          label: 'produced',
        });
      }
      if (artifact.workItemId && workItemById.has(artifact.workItemId)) {
        addEdge({
          source: workItemNodeId(artifact.workItemId),
          target: artifactNodeId(artifact.id),
          type: 'HAS_ARTIFACT',
          label: 'artifact',
        });
      }
    }

    for (const review of reviews) {
      addNode({
        id: reviewNodeId(review.id),
        type: 'REVIEW',
        label: `${humanize(review.reviewerType)} review`,
        subtitle: review.reviewNote || (review.artifactId ? artifactById.get(review.artifactId)?.title : '') || 'Review decision',
        status: review.status,
        meta: {
          reviewId: review.id,
          workItemId: review.workItemId,
          assignmentId: review.assignmentId,
          artifactId: review.artifactId,
          reviewerUserId: review.reviewerUserId,
          reviewerType: review.reviewerType,
          createdAt: review.createdAt,
          updatedAt: review.updatedAt,
        },
      });
      const reviewer = memberNodeIdForUser(review.reviewerUserId);
      if (reviewer) {
        addEdge({
          source: reviewer,
          target: reviewNodeId(review.id),
          type: 'REVIEWED',
          label: 'reviewed',
        });
      }
      if (review.artifactId && artifactById.has(review.artifactId)) {
        addEdge({
          source: artifactNodeId(review.artifactId),
          target: reviewNodeId(review.id),
          type: 'REVIEWED',
          label: 'review',
        });
      }
      if (workItemById.has(review.workItemId)) {
        addEdge({
          source: workItemNodeId(review.workItemId),
          target: reviewNodeId(review.id),
          type: 'HAS_REVIEW',
          label: 'review',
        });
        addEdge({
          source: reviewNodeId(review.id),
          target: workItemNodeId(review.workItemId),
          type: 'DECIDED',
          label: review.status,
        });
      }
    }

    for (const global of projectGlobals) {
      const resourceId = resourceNodeId(global.key, global.scope, global.goalId);
      const resourceActor = resourceActorByNodeId.get(resourceId);
      addNode({
        id: resourceId,
        type: 'RESOURCE',
        label: global.label || global.key,
        subtitle: global.scope === 'goal' && global.goalId
          ? `Goal variable · ${goalById.get(global.goalId)?.title || global.goalId}`
          : global.isSecret ? 'Secret project variable' : 'Project variable',
        status: ((global as any).providedValue || (global as any).value) ? 'CONFIGURED' : global.required ? 'REQUIRED' : 'OPTIONAL',
        meta: {
          identity: projectGlobalIdentityValue(global.key, global.scope, global.goalId),
          key: global.key,
          category: global.category,
          scope: global.scope || 'project',
          goalId: global.goalId || null,
          isSecret: Boolean(global.isSecret),
          updatedByLabel: resourceActor?.label || '',
          updatedByAction: resourceActor?.type || '',
          updatedAt: resourceActor?.occurredAt || null,
        },
      });
      if (resourceActor?.nodeId) {
        addEdge({
          source: resourceActor.nodeId,
          target: resourceId,
          type: resourceActor.type,
          label: resourceActor.type === 'PROJECT_GLOBAL_CREATED'
            ? 'created'
            : resourceActor.type === 'PROJECT_GLOBAL_WRITTEN' ? 'wrote' : 'updated',
          eventId: resourceActor.eventId,
          occurredAt: resourceActor.occurredAt,
          seq: resourceActor.seq,
        });
      }
      if (global.goalId && goalById.has(global.goalId)) {
        addEdge({
          source: goalNodeId(global.goalId),
          target: resourceId,
          type: 'USES_RESOURCE',
          label: global.required ? 'requires' : 'uses',
        });
      }
    }

    for (const file of (filesResponse as any).files || []) {
      if (!file?.path) continue;
      const fileActor = fileActorByPath.get(file.path);
      addNode({
        id: fileNodeId(file.path),
        type: 'FILE',
        label: file.name || file.path,
        subtitle: file.path,
        status: file.source || 'shared',
        meta: {
          path: file.path,
          key: file.key,
          size: file.size ?? null,
          contentType: file.contentType,
          updatedByLabel: fileActor?.label || '',
          updatedByAction: fileActor?.type || '',
          updatedAt: fileActor?.occurredAt || null,
        },
      });
      if (fileActor?.nodeId) {
        addEdge({
          source: fileActor.nodeId,
          target: fileNodeId(file.path),
          type: fileActor.type,
          label: humanize(fileActor.type),
          eventId: fileActor.eventId,
          occurredAt: fileActor.occurredAt,
          seq: fileActor.seq,
        });
      }
    }

    for (const event of eventsResponse.events || []) {
      if (!['AGENT_RUNTIME_LAUNCHED', 'AGENT_RUNTIME_MESSAGE_SENT', 'MESSAGE_CREATED'].includes(event.type)) continue;
      const payload = (event.payload || {}) as Record<string, unknown>;
      const senderMemberId = stringValue(payload.senderMemberId);
      const senderNode = memberNodeId(senderMemberId);
      const actor =
        (event.type === 'AGENT_RUNTIME_MESSAGE_SENT' || event.type === 'MESSAGE_CREATED') && senderNode && nodes.has(senderNode)
          ? { nodeId: senderNode, label: memberLabelForId(senderMemberId), userId: '', memberId: senderMemberId }
          : eventActorInfo(event);
      if (!actor) continue;
      const targetNodes = [...new Set(eventMemberTargetNodes(event))].filter((targetNode) => targetNode !== actor.nodeId);

      if (event.type === 'AGENT_RUNTIME_MESSAGE_SENT' || event.type === 'MESSAGE_CREATED') {
        const firstTargetMemberId = stringValue(payload.targetMemberId) || arrayValue(payload.targetMemberIds)[0] || '';
        const firstTargetLabel = memberLabelForId(firstTargetMemberId);
        const messageId = messageNodeId(event.id);
        addNode({
          id: messageId,
          type: 'MESSAGE',
          label: firstTargetLabel ? `Message to ${firstTargetLabel}` : 'Agent message',
          subtitle: event.createdAt,
          status: `#${event.seq}`,
          meta: {
            eventId: event.id,
            seq: event.seq,
            type: event.type,
            refType: event.refType,
            refId: event.refId,
            requestId: stringValue(payload.requestId),
            conversationId:
              stringValue(payload.conversationId) ||
              (event.refType === 'AGENT_RUNTIME_CONVERSATION' ? stringValue(event.refId) : ''),
            senderMemberId: actor.memberId || stringValue(payload.senderMemberId),
            senderLabel: actor.label,
            targetMemberId: firstTargetMemberId,
            targetMemberIds: arrayValue(payload.targetMemberIds),
            targetLabel: firstTargetLabel,
            messageLength: typeof payload.messageLength === 'number' ? payload.messageLength : null,
            createdAt: event.createdAt,
          },
        });
        addEdge({
          source: actor.nodeId,
          target: messageId,
          type: event.type,
          label: 'sent',
          eventId: event.id,
          occurredAt: event.createdAt,
          seq: event.seq,
        });
        for (const targetNode of targetNodes) {
          addEdge({
            source: messageId,
            target: targetNode,
            type: 'MESSAGE_TARGET',
            label: 'to',
            eventId: event.id,
            occurredAt: event.createdAt,
            seq: event.seq,
          });
        }
        continue;
      }

      for (const targetNode of targetNodes) {
        addEdge({
          source: actor.nodeId,
          target: targetNode,
          type: event.type,
          label: eventRelationshipLabel(event.type),
          eventId: event.id,
          occurredAt: event.createdAt,
          seq: event.seq,
        });
      }
    }

    const eventTargetNodes = (event: any) => {
      const payload = (event.payload || {}) as Record<string, unknown>;
      const targets: string[] = [];
      const refId = stringValue(event.refId);
      if (event.refType === 'GOAL') targets.push(goalNodeId(refId));
      if (event.refType === 'FEATURE') targets.push(featureNodeId(refId));
      if (event.refType === 'WORK_ITEM') targets.push(workItemNodeId(refId));
      if (event.refType === 'PROJECT_RUN' || event.refType === 'RUN') targets.push(runNodeId(refId));
      if (event.refType === 'PROJECT_ARTIFACT' || event.refType === 'ARTIFACT') targets.push(artifactNodeId(refId));
      if (event.refType === 'PROJECT_REVIEW' || event.refType === 'REVIEW') targets.push(reviewNodeId(refId));
      if (event.refType === 'PROJECT_FILE' || event.refType === 'PROJECT_FOLDER') {
        const path = refId || stringValue(payload.path);
        if (path) {
          addNode({
            id: fileNodeId(path),
            type: event.refType === 'PROJECT_FOLDER' ? 'FOLDER' : 'FILE',
            label: path.split('/').filter(Boolean).pop() || path,
            subtitle: path,
            status: event.type.replace(/^PROJECT_/, ''),
            meta: { path },
          });
          targets.push(fileNodeId(path));
        }
      }
      const workItemId = stringValue(payload.workItemId);
      if (workItemId) targets.push(workItemNodeId(workItemId));
      const runId = stringValue(payload.runId);
      if (runId) targets.push(runNodeId(runId));
      const artifactId = stringValue(payload.artifactId);
      if (artifactId) targets.push(artifactNodeId(artifactId));
      const reviewId = stringValue(payload.reviewId);
      if (reviewId) targets.push(reviewNodeId(reviewId));
      const featureId = stringValue(payload.featureId);
      if (featureId) targets.push(featureNodeId(featureId));
      const goalId = stringValue(payload.goalId);
      if (goalId) targets.push(goalNodeId(goalId));
      for (const memberId of [
        stringValue(payload.assigneeMemberId),
        stringValue(payload.targetMemberId),
        ...arrayValue(payload.targetMemberIds),
        ...arrayValue(payload.mentionMemberIds),
      ]) {
        targets.push(memberNodeId(memberId));
      }
      if (String(event.type || '').startsWith('COORDINATOR_')) {
        if (event.type === 'COORDINATOR_CONFIG_UPDATED' || !targets.length) {
          targets.push(coordinatorConfigNodeId);
        }
      }
      const variablePayloads = Array.isArray(payload.variables)
        ? payload.variables.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry))
        : [];
      const resourceTargets = [
        resourceNodeIdForPayload(payload, event.refType === 'PROJECT_GLOBAL' ? refId : ''),
        ...variablePayloads.map((entry) => resourceNodeIdForPayload(entry)),
        ...arrayValue(payload.identities).map((identity) => resourceNodeId(identity)),
        ...arrayValue(payload.keys).map((key) => resourceNodeId(key)),
      ].filter(Boolean);
      for (const targetNodeId of resourceTargets) {
        if (!nodes.has(targetNodeId)) {
          const label = targetNodeId.replace(/^resource:(?:project:|goal:[^:]+:)/, '');
          addNode({
            id: targetNodeId,
            type: 'RESOURCE',
            label,
            subtitle: targetNodeId.startsWith('resource:goal:') ? 'Goal variable' : 'Project variable',
            status: 'UPDATED',
            meta: { identity: targetNodeId.replace(/^resource:/, ''), key: label },
          });
        }
        targets.push(targetNodeId);
      }
      return [...new Set(targets)].filter((target) => target && nodes.has(target));
    };

    const recentEvents = (eventsResponse.events || []).slice(-48);
    for (const event of recentEvents) {
      const payload = (event.payload || {}) as Record<string, unknown>;
      if (event.type === 'AGENT_RUNTIME_MESSAGE_SENT' || event.type === 'MESSAGE_CREATED') continue;
      const actorNode =
        isCoordinatorEvent(event, payload)
          ? coordinatorNodeId
          :
        memberNodeIdForUser(event.actor?.id) ||
        memberNodeId(stringValue(payload.actorMemberId)) ||
        memberNodeId(stringValue(payload.senderMemberId));
      for (const targetNode of eventTargetNodes(event)) {
        if (actorNode) {
          addEdge({
            source: actorNode,
            target: targetNode,
            type: event.type,
            label: eventRelationshipLabel(event.type),
            eventId: event.id,
            occurredAt: event.createdAt,
            seq: event.seq,
          });
        }
      }
    }

    return {
      projectId,
      lastSeq: eventsResponse.lastSeq,
      nodes: [...nodes.values()],
      edges: [...edges.values()],
      events: eventsResponse.events || [],
    };
  }

  async getProjectCockpit(projectId: string, userId?: string | null) {
    const board = await this.getProjectBoard(projectId, userId);
    return {
      project: board.project,
      metrics: board.metrics,
      cockpit: board.cockpit,
    };
  }

  async listAgentRuntimeImages(projectId: string, userId: string) {
    await this.ensureProjectAccess(projectId, userId);
    return { images: this.agentRuntimeLauncher.listImages() };
  }

  private normalizeAgentProfileLaunchMode(value?: string | null) {
    return ['local-docker', 'local-runner', 'local-codex', 'aws-ecs', 'aws-agentcore'].includes(String(value || ''))
      ? String(value)
      : 'aws-agentcore';
  }

  private normalizeAgentProfilePayload(
    dto: CreateProjectAgentProfileDto | UpdateProjectAgentProfileDto,
    existing?: any,
  ) {
    const role = dto.role !== undefined ? dto.role.trim() : existing?.role;
    if (role !== undefined && (!role || role === 'OWNER')) {
      throw new BadRequestException('A launchable agent role is required');
    }

    const name = dto.name !== undefined ? dto.name.trim() : existing?.name;
    if (name !== undefined && !name) {
      throw new BadRequestException('Agent profile name is required');
    }

    const launchMode = dto.launchMode !== undefined
      ? this.normalizeAgentProfileLaunchMode(dto.launchMode)
      : existing?.launchMode;
    const deploymentDays = dto.deploymentDays !== undefined
      ? Math.max(1, Math.floor(Number(dto.deploymentDays) || 1))
      : existing?.deploymentDays;
    const settings =
      dto.settings !== undefined || dto.enableSudo !== undefined
        ? {
            ...(
              existing?.settings && typeof existing.settings === 'object' && !Array.isArray(existing.settings)
                ? existing.settings
                : {}
            ),
            ...(dto.settings && typeof dto.settings === 'object' && !Array.isArray(dto.settings) ? dto.settings : {}),
            ...(dto.enableSudo !== undefined ? { enableSudo: Boolean(dto.enableSudo) } : {}),
          }
        : undefined;

    return {
      ...(name !== undefined ? { name } : {}),
      ...(dto.description !== undefined ? { description: dto.description?.trim() || null } : {}),
      ...(role !== undefined ? { role } : {}),
      ...(launchMode !== undefined ? { launchMode } : {}),
      ...(dto.agentType !== undefined ? { agentType: dto.agentType?.trim() || 'pi' } : {}),
      ...(dto.image !== undefined ? { image: dto.image?.trim() || null } : {}),
      ...(dto.model !== undefined ? { model: dto.model?.trim() || null } : {}),
      ...(dto.llmConfigId !== undefined ? { llmConfigId: dto.llmConfigId?.trim() || null } : {}),
      ...(deploymentDays !== undefined ? { deploymentDays } : {}),
      ...(settings !== undefined ? { settings } : {}),
    };
  }

  private sanitizeAgentProfile(profile: any) {
    const settings =
      profile.settings && typeof profile.settings === 'object' && !Array.isArray(profile.settings)
        ? profile.settings
        : {};
    return {
      id: profile.id,
      projectId: profile.projectId,
      name: profile.name,
      description: profile.description,
      role: profile.role,
      launchMode: profile.launchMode,
      agentType: profile.agentType,
      image: profile.image,
      model: profile.model,
      llmConfigId: profile.llmConfigId,
      deploymentDays: profile.deploymentDays,
      enableSudo: Boolean(settings.enableSudo),
      settings: profile.settings || null,
      createdById: profile.createdById,
      createdBy: profile.createdBy
        ? {
            id: profile.createdBy.id,
            email: profile.createdBy.email,
            displayName: profile.createdBy.displayName,
          }
        : null,
      lastLaunchedAt: profile.lastLaunchedAt,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    };
  }

  async listProjectAgentProfiles(projectId: string, userId: string) {
    await this.ensureProjectAccess(projectId, userId);
    const profiles = await this.prisma.projectAgentProfile.findMany({
      where: { projectId },
      include: {
        createdBy: { select: { id: true, email: true, displayName: true } },
      },
      orderBy: [{ updatedAt: 'desc' }],
    });
    return { projectId, profiles: profiles.map((profile) => this.sanitizeAgentProfile(profile)) };
  }

  async createProjectAgentProfile(projectId: string, userId: string, dto: CreateProjectAgentProfileDto) {
    await this.ensureProjectManager(projectId, userId);
    const defaultLaunchMode = this.defaultAgentRuntimeLaunchMode();
    const data = this.normalizeAgentProfilePayload({
      ...dto,
      launchMode: dto.launchMode || defaultLaunchMode,
      agentType: dto.agentType || 'pi',
      deploymentDays: dto.deploymentDays || 1,
    });
    if (data.llmConfigId) {
      await this.apiConfigService.findOne(userId, data.llmConfigId);
    }
    const profile = await this.prisma.projectAgentProfile.create({
      data: {
        projectId,
        createdById: userId,
        name: String(data.name || '').trim(),
        role: String(data.role || '').trim(),
        launchMode: data.launchMode || defaultLaunchMode,
        agentType: data.agentType || 'pi',
        description: data.description ?? null,
        image: data.image ?? null,
        model: data.model ?? null,
        llmConfigId: data.llmConfigId ?? null,
        deploymentDays: data.deploymentDays || 1,
        settings: data.settings || { enableSudo: Boolean(dto.enableSudo) },
      },
      include: {
        createdBy: { select: { id: true, email: true, displayName: true } },
      },
    });
    return { projectId, profile: this.sanitizeAgentProfile(profile) };
  }

  async updateProjectAgentProfile(
    projectId: string,
    profileId: string,
    userId: string,
    dto: UpdateProjectAgentProfileDto,
  ) {
    await this.ensureProjectManager(projectId, userId);
    const existing = await this.prisma.projectAgentProfile.findFirst({
      where: { id: profileId, projectId },
    });
    if (!existing) throw new NotFoundException('Agent profile not found');
    const data = this.normalizeAgentProfilePayload(dto, existing);
    if (data.llmConfigId) {
      await this.apiConfigService.findOne(userId, data.llmConfigId);
    }
    const profile = await this.prisma.projectAgentProfile.update({
      where: { id: profileId },
      data,
      include: {
        createdBy: { select: { id: true, email: true, displayName: true } },
      },
    });
    return { projectId, profile: this.sanitizeAgentProfile(profile) };
  }

  async deleteProjectAgentProfile(projectId: string, profileId: string, userId: string) {
    await this.ensureProjectManager(projectId, userId);
    const result = await this.prisma.projectAgentProfile.deleteMany({
      where: { id: profileId, projectId },
    });
    if (!result.count) throw new NotFoundException('Agent profile not found');
    return { projectId, profileId, deleted: true };
  }

  async launchProjectAgentProfile(
    projectId: string,
    profileId: string,
    userId: string,
    dto: LaunchProjectAgentProfileDto = {},
  ) {
    await this.ensureProjectManager(projectId, userId);
    const profile = await this.prisma.projectAgentProfile.findFirst({
      where: { id: profileId, projectId },
    });
    if (!profile) throw new NotFoundException('Agent profile not found');
    const launchMode = this.normalizeAgentProfileLaunchMode(profile.launchMode) as AgentRuntimeLaunchMode;
    const agentType = profile.agentType || 'pi';
    const llmConfigId = dto.llmConfigId || profile.llmConfigId || undefined;
    if (!llmConfigId && !this.canLaunchWithoutModelConfig(launchMode, agentType)) {
      throw new BadRequestException('This agent profile needs a model API config before launch');
    }
    const launched = await this.launchAgentRuntime(projectId, userId, {
      role: profile.role,
      memberId: dto.memberId,
      llmConfigId,
      image: profile.image || undefined,
      model: profile.model || undefined,
      agentType,
      launchMode,
      deploymentDays: dto.deploymentDays || profile.deploymentDays || 1,
      enableSudo:
        dto.enableSudo !== undefined
          ? Boolean(dto.enableSudo)
          : Boolean(
              profile.settings &&
                typeof profile.settings === 'object' &&
                !Array.isArray(profile.settings) &&
                (profile.settings as Record<string, any>).enableSudo,
            ),
    });
    await this.prisma.projectAgentProfile.update({
      where: { id: profileId },
      data: { lastLaunchedAt: new Date() },
    }).catch(() => null);
    return { ...launched, profileId };
  }

  async listAgentRuntimes(projectId: string, userId: string) {
    await this.ensureProjectAccess(projectId, userId);
    const [members, workspaceMembers, budgetContext, project, accountLocalRunners] = await Promise.all([
      this.findProjectRuntimeMembers(projectId),
      this.getWorkspaceMembers(projectId),
      this.getProjectRuntimeBudgetContext(projectId),
      this.prisma.project.findUnique({
        where: { id: projectId },
        select: { ownerId: true, settings: true },
      }),
      this.sanitizeAccountLocalRunnerPresences(userId),
    ]);
    const statusFlow = this.resolveProjectWorkItemStatusFlow(project?.settings);
    const reconciled = await this.reconcileStaleOpenAssignments(projectId, userId, statusFlow, { source: 'owner-runtime-list' }).catch((error: any) => {
      this.logger.warn(`Failed to reconcile stale assignments while listing runtimes for ${projectId}: ${error?.message || error}`);
      return [];
    });
    if (reconciled.length && statusFlow.coordinator.enabled) {
      this.scheduleCoordinatorTick(
        projectId,
        project?.ownerId || userId,
        `runtime list reconciled ${reconciled.length} stale assignment(s)`,
        250,
      );
    }
    const workspaceByMemberId = new Map(workspaceMembers.map((member: any) => [member.id, member]));
    const runtimeMembers = members.filter((member: any) => this.readRuntimeSession(member.permissions));
    const sessions: any[] = [];
    const runtimeListBatchSize = 4;
    for (let start = 0; start < runtimeMembers.length; start += runtimeListBatchSize) {
      const batch = runtimeMembers.slice(start, start + runtimeListBatchSize);
      const batchSessions = await Promise.all(
        batch.map(async (member: any) => {
          const session = this.readRuntimeSession(member.permissions)!;
          const inspectedSession = await this.agentRuntimeLauncher.inspect(session).catch((error: any) =>
            session.provider === 'local-docker'
              ? this.buildUnavailableLocalDockerSession(session, error)
              : session,
          );
          const recoveredSession = this.recoverPersistedRuntimeSession(inspectedSession);
          const latestAssistant = this.latestAssistantRuntimeMessage(recoveredSession);
          if (latestAssistant?.content) {
            await Promise.resolve(this.ensureGitAutomationArtifacts(projectId, member.userId, recoveredSession, latestAssistant.content)).catch((error: any) => {
              this.logger.warn(`Failed to ensure runtime git artifacts for ${projectId}/${member.id}: ${error?.message || error}`);
            });
          }
          await Promise.resolve(this.writeRuntimeSession(member.id, recoveredSession)).catch((error: any) => {
            this.logger.warn(`Failed to persist runtime session while listing runtimes for ${projectId}/${member.id}: ${error?.message || error}`);
          });
          const workspaceMember: any = workspaceByMemberId.get(member.id);
          return {
            memberId: member.id,
            userId: member.userId,
            role: member.role,
            user: member.user,
            runtime: workspaceMember?.runtime ?? null,
            presence: workspaceMember?.presence ?? null,
            session: this.sanitizeRuntimeSession(recoveredSession),
          };
        }),
      );
      sessions.push(...batchSessions);
    }
    const sessionByMemberId = new Map(sessions.map((entry: any) => [entry.memberId, entry.session]));
    const reconciledBudgetContext = budgetContext && typeof budgetContext === 'object'
      ? (() => {
          const runtimeCommitments = Array.isArray((budgetContext as any).runtimeCommitments)
            ? (budgetContext as any).runtimeCommitments.map((runtime: any) => {
                const session = sessionByMemberId.get(runtime.memberId) as any;
                if (!session) return runtime;
                const status = String(session.status || runtime.status || '');
                const provider = session.provider || runtime.provider;
                const deploymentDays = Math.max(1, Math.floor(Number(session.deploymentDays ?? runtime.deploymentDays) || 1));
                const dailyCostAmount = provider === 'aws-ecs'
                  ? Math.max(0, Number(session.dailyCostAmount ?? runtime.dailyCostAmount) || AGENT_DEPLOYMENT_PRICE_PER_DAY)
                  : 0;
                const committedAmount = this.runtimeCostForSession({
                  ...(runtime || {}),
                  ...(session || {}),
                  provider,
                  status,
                  deploymentDays,
                  dailyCostAmount,
                } as AgentRuntimeSession);
                return {
                  ...runtime,
                  runtimeId: session.runtimeId || runtime.runtimeId,
                  status,
                  deploymentDays,
                  dailyCostAmount,
                  committedAmount,
                };
              })
            : [];
          const committedAmount = runtimeCommitments.reduce(
            (sum: number, runtime: any) => sum + Math.max(0, Number(runtime.committedAmount) || 0),
            0,
          );
          const budgetAmount = Number((budgetContext as any).budgetAmount || 0);
          const availableAmount = Math.max(0, budgetAmount - committedAmount);
          return {
            ...(budgetContext as any),
            committedAmount,
            availableAmount,
            canLaunchOneDayAgent: availableAmount >= AGENT_DEPLOYMENT_PRICE_PER_DAY,
            runtimeCommitments,
          };
        })()
      : budgetContext;

    return {
      projectId,
      budget: reconciledBudgetContext,
      sessions,
      localRunners: [...accountLocalRunners, ...this.sanitizeProjectLocalRunnerPresences(project?.settings)],
    };
  }

  private workItemMatchesCoordinatorRule(item: any, rule: ProjectCoordinatorDispatchRule) {
    const status = this.normalizeWorkItemStatusId(item?.status);
    const workType = String(item?.workType || '').trim().toUpperCase();
    if (rule.statuses.length && !rule.statuses.includes(status)) return false;
    if (rule.workTypes.length && !rule.workTypes.includes(workType)) return false;
    const ownerRole = String(item?.owner?.role || '').trim().toUpperCase();
    if (item?.ownerId && ownerRole !== 'AI_AGENT' && !rule.allowOwnerOwned) return false;
    return true;
  }

  private coordinatorOwnerOnlySkipReason(item: any) {
    const inputPacket = item?.inputPacket;
    if (!inputPacket || typeof inputPacket !== 'object' || Array.isArray(inputPacket)) return null;
    if (this.projectGlobalResourceRequestFromPacket(inputPacket, item?.goalId || null)) {
      return 'OWNER_RESOURCE_REQUEST';
    }
    if (
      inputPacket.ownerAction &&
      typeof inputPacket.ownerAction === 'object' &&
      !Array.isArray(inputPacket.ownerAction)
    ) {
      return 'OWNER_ACTION_PENDING';
    }
    return null;
  }

  private coordinatorAssignmentObjective(item: any, rule: ProjectCoordinatorDispatchRule) {
    if (rule.objective) return rule.objective;
    const goalContext = item?.goal?.title ? ` Goal: ${item.goal.title}.` : '';
    return `Handle project work item "${item?.title || item?.id}".${goalContext}`;
  }

  private assignmentCompletedAtMs(assignment: any) {
    return Math.max(
      this.dateLikeMs(assignment?.finishedAt),
      this.dateLikeMs(assignment?.updatedAt),
      this.dateLikeMs(assignment?.createdAt),
    );
  }

  private feedbackRoleAlreadyReviewedLatestOutput(item: any, role: string) {
    const completedAssignments = (item?.assignments || []).filter(
      (assignment: any) => String(assignment?.status || '').toUpperCase() === 'COMPLETED',
    );
    const normalizedRole = role.toUpperCase();
    const roleAssignments = completedAssignments.filter(
      (assignment: any) => String(assignment?.role || '').toUpperCase() === normalizedRole,
    );
    if (!roleAssignments.length) return false;
    const nonRoleAssignments = completedAssignments.filter(
      (assignment: any) => String(assignment?.role || '').toUpperCase() !== normalizedRole,
    );
    const latestRoleCompletedAt = Math.max(
      ...roleAssignments.map((assignment: any) => this.assignmentCompletedAtMs(assignment)),
    );
    if (!Number.isFinite(latestRoleCompletedAt)) return !nonRoleAssignments.length;

    const latestNonRoleCompletedAt = Math.max(
      ...nonRoleAssignments.map((assignment: any) => this.assignmentCompletedAtMs(assignment)),
    );
    if (!Number.isFinite(latestNonRoleCompletedAt)) return true;

    return latestRoleCompletedAt >= latestNonRoleCompletedAt;
  }

  private interpolateCoordinatorMessageTemplate(
    template: string,
    item: any,
    role: string,
    launchMode: AgentRuntimeLaunchMode,
    agentType: string,
  ) {
    const values: Record<string, string> = {
      id: String(item?.id || ''),
      title: String(item?.title || item?.id || ''),
      workType: String(item?.workType || ''),
      status: String(item?.status || ''),
      role,
      launchMode,
      agentType,
      goalTitle: String(item?.goal?.title || ''),
    };
    return template.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (_match, key) => values[key] ?? '');
  }

  private coordinatorDispatchMessage(
    item: any,
    role: string,
    launchMode: AgentRuntimeLaunchMode,
    agentType: string,
    template?: string | null,
  ) {
    if (template?.trim()) {
      const rendered = this.interpolateCoordinatorMessageTemplate(template.trim(), item, role, launchMode, agentType).trim();
      if (rendered) return rendered;
    }
    return `当前有未被分配的 item ${item.title || item.id}，通过 ${launchMode}/${agentType} 拉起角色 ${role}。`;
  }

  private async activeCoordinatorRoleCount(projectId: string, role: string, settings?: any) {
    const [members, assignments] = await Promise.all([
      this.prisma.projectMember.findMany({
        where: { projectId, role, removedAt: null },
        select: { id: true, userId: true, permissions: true },
      }),
      this.prisma.projectAssignment.findMany({
        where: {
          projectId,
          role,
          status: { in: ['PROPOSED', 'ACTIVE', 'PAUSED'] as any },
        },
        select: { assigneeUserId: true, workItem: { select: { status: true } } },
      }),
    ]);
    const activeRuntimeUserIds = new Set<string>();
    let anonymousActiveRuntimeCount = 0;
    members.forEach((member) => {
      const session =
        member.permissions &&
        typeof member.permissions === 'object' &&
        !Array.isArray(member.permissions)
          ? (member.permissions as any).runtimeSession
          : null;
      const status = typeof session?.status === 'string' ? String(session.status).toUpperCase() : '';
      if (!session || (!status && !session.activeRequestId)) return;
      if (!session.activeRequestId && ['STOPPED', 'ERROR', 'IDLE', 'READY'].includes(status)) return;
      const userId = typeof member.userId === 'string' && member.userId.trim()
        ? member.userId.trim()
        : '';
      if (userId) {
        activeRuntimeUserIds.add(userId);
      } else {
        anonymousActiveRuntimeCount += 1;
      }
    });

    const activeAssignmentUserIds = new Set<string>();
    let anonymousActiveAssignmentCount = 0;
    assignments.forEach((assignment) => {
      if (this.isTerminalWorkItemStatus(assignment.workItem?.status, settings)) return;
      const userId = typeof assignment.assigneeUserId === 'string' && assignment.assigneeUserId.trim()
        ? assignment.assigneeUserId.trim()
        : '';
      if (userId) {
        activeAssignmentUserIds.add(userId);
      } else {
        anonymousActiveAssignmentCount += 1;
      }
    });

    return new Set([...activeRuntimeUserIds, ...activeAssignmentUserIds]).size +
      anonymousActiveRuntimeCount +
      anonymousActiveAssignmentCount;
  }

  private isIdleCoordinatorRuntimeSession(session?: AgentRuntimeSession | null) {
    const status = String(session?.status || '').toUpperCase();
    return ['IDLE', 'READY'].includes(status) && !session?.activeRequestId;
  }

  private async findIdleCoordinatorRuntime(projectId: string, role: string, preferredAgentType?: string | null, settings?: any) {
    const preferred = String(preferredAgentType || '').trim();
    const members = await this.prisma.projectMember.findMany({
      where: { projectId, role, removedAt: null },
      select: { id: true, userId: true, role: true, permissions: true },
    });
    const candidates = (
      await Promise.all(members.map(async (member) => {
        const rawSession = this.readRuntimeSession(member.permissions);
        let session = rawSession ? this.recoverPersistedRuntimeSession(rawSession) : null;
        if (!session) return null;
        if (rawSession !== session) {
          await this.writeRuntimeSession(member.id, session).catch(() => null);
        }
        if (!this.isIdleCoordinatorRuntimeSession(session)) return null;
        const sessionAgentType = String(session.agentType || '').trim();
        if (preferred && sessionAgentType && sessionAgentType !== preferred) return null;
        if (session.provider === 'local-docker') {
          const inspectedSession = await this.agentRuntimeLauncher.inspect(session).catch((error: any) =>
            this.buildUnavailableLocalDockerSession(session as AgentRuntimeSession, error),
          );
          const recoveredSession = this.recoverPersistedRuntimeSession(inspectedSession as AgentRuntimeSession);
          await this.writeRuntimeSession(member.id, recoveredSession).catch(() => null);
          const inspectedStatus = String(recoveredSession.status || '').toUpperCase();
          if ((recoveredSession as any).dockerStatus?.running === false || ['STOPPED', 'ERROR'].includes(inspectedStatus)) {
            return null;
          }
          session = recoveredSession;
        }
        if (!this.isIdleCoordinatorRuntimeSession(session)) return null;
        return { ...member, session };
      }))
    ).filter((member): member is typeof members[number] & { session: AgentRuntimeSession } => Boolean(member));
    if (!candidates.length) return null;

    const openAssignments = await this.prisma.projectAssignment.findMany({
      where: {
        projectId,
        assigneeUserId: { in: candidates.map((member) => member.userId) },
        status: { in: ['PROPOSED', 'ACTIVE', 'PAUSED'] as any },
      },
      select: {
        assigneeUserId: true,
        workItem: { select: { status: true } },
      },
    });
    const busyUserIds = new Set(
      openAssignments
        .filter((assignment) => !this.isTerminalWorkItemStatus(assignment.workItem?.status, settings))
        .map((assignment) => assignment.assigneeUserId),
    );
    return candidates.find((member) => !busyUserIds.has(member.userId)) || null;
  }

  private async recordCoordinatorEvent(
    projectId: string,
    actorUserId: string,
    type:
      | 'COORDINATOR_DISPATCHED_ITEM'
      | 'COORDINATOR_BLOCKED'
      | 'COORDINATOR_IDLE'
      | 'COORDINATOR_CONFIG_UPDATED'
      | 'COORDINATOR_CREATED_PLANNER_ITEM'
      | 'COORDINATOR_RECONCILED_STALE_ASSIGNMENT',
    payload: Record<string, any>,
    ref?: { refType?: string; refId?: string },
  ) {
    await this.agentWorkspaceClient.recordProjectEvent(projectId, {
      type,
      refType: ref?.refType || 'PROJECT',
      refId: ref?.refId || projectId,
      actorUserId,
      payload: {
        source: 'project-coordinator',
        ...payload,
      },
    }).catch((error: any) => {
      this.logger.warn(`Failed to record coordinator event for ${projectId}: ${error?.message || error}`);
    });
  }

  private async recordWorkItemEvent(
    projectId: string,
    actorUserId: string | null | undefined,
    type: string,
    workItemId: string,
    payload: Record<string, any>,
  ) {
    if (typeof this.agentWorkspaceClient.recordProjectEvent !== 'function') {
      return;
    }
    await this.agentWorkspaceClient.recordProjectEvent(projectId, {
      type,
      refType: 'WORK_ITEM',
      refId: workItemId,
      actorUserId: actorUserId || undefined,
      payload: {
        workItemId,
        ...payload,
      },
    }).catch((error: any) => {
      this.logger.warn(`Failed to record work item event for ${projectId}/${workItemId}: ${error?.message || error}`);
    });
  }

  private async updateCoordinatorLastTickAt(projectId: string, settings: any, lastTickAt = new Date().toISOString()) {
    if (!(this.prisma as any).project?.update) return;
    const existingSettings =
      settings && typeof settings === 'object' && !Array.isArray(settings)
        ? { ...settings }
        : {};
    const existingFlow =
      existingSettings.workItemStatusFlow &&
      typeof existingSettings.workItemStatusFlow === 'object' &&
      !Array.isArray(existingSettings.workItemStatusFlow)
        ? { ...existingSettings.workItemStatusFlow }
        : {};
    const existingCoordinator =
      existingFlow.coordinator &&
      typeof existingFlow.coordinator === 'object' &&
      !Array.isArray(existingFlow.coordinator)
        ? { ...existingFlow.coordinator }
        : existingSettings.coordinator &&
            typeof existingSettings.coordinator === 'object' &&
            !Array.isArray(existingSettings.coordinator)
          ? { ...existingSettings.coordinator }
          : {};
    const nextSettings = {
      ...existingSettings,
      workItemStatusFlow: {
        ...existingFlow,
        coordinator: {
          ...existingCoordinator,
          lastTickAt,
        },
      },
    };
    await this.writeProjectSettings(projectId, nextSettings).catch((error: any) => {
      this.logger.warn(`Failed to persist coordinator last tick for ${projectId}: ${error?.message || error}`);
    });
  }

  async updateProjectCoordinatorConfig(projectId: string, userId: string, dto: UpdateProjectCoordinatorConfigDto) {
    const project = await this.ensureProjectManager(projectId, userId);
    const existingSettings =
      project.settings && typeof project.settings === 'object' && !Array.isArray(project.settings)
        ? { ...(project.settings as Record<string, any>) }
        : {};
    const existingFlow =
      existingSettings.workItemStatusFlow &&
      typeof existingSettings.workItemStatusFlow === 'object' &&
      !Array.isArray(existingSettings.workItemStatusFlow)
        ? { ...existingSettings.workItemStatusFlow }
        : {};
    const existingCoordinator =
      existingFlow.coordinator &&
      typeof existingFlow.coordinator === 'object' &&
      !Array.isArray(existingFlow.coordinator)
        ? { ...existingFlow.coordinator }
        : existingSettings.coordinator &&
            typeof existingSettings.coordinator === 'object' &&
            !Array.isArray(existingSettings.coordinator)
          ? { ...existingSettings.coordinator }
          : {};
    const launchMode = dto.launchMode !== undefined
      ? this.normalizeAgentRuntimeLaunchMode(dto.launchMode)
      : undefined;
    if (dto.launchMode !== undefined && !launchMode) {
      throw new BadRequestException('Unsupported coordinator launch mode');
    }
    const nextCoordinator = {
      ...existingCoordinator,
      ...(dto.enabled !== undefined ? { enabled: Boolean(dto.enabled) } : {}),
      ...(dto.maxDispatchesPerTick !== undefined ? { maxDispatchesPerTick: this.positiveInteger(dto.maxDispatchesPerTick, 3) } : {}),
      ...(launchMode ? { launchMode } : {}),
      ...(dto.agentType !== undefined ? { agentType: dto.agentType.trim() || 'pi' } : {}),
      ...(dto.messageTemplate !== undefined ? { messageTemplate: dto.messageTemplate.trim() || null } : {}),
      updatedAt: new Date().toISOString(),
      updatedById: userId,
    };
    const nextSettings = {
      ...existingSettings,
      workItemStatusFlow: {
        ...existingFlow,
        ...(dto.dispatchRules !== undefined ? { dispatchRules: dto.dispatchRules } : {}),
        coordinator: nextCoordinator,
      },
    };
    await this.writeProjectSettings(projectId, nextSettings);
    const flow = this.resolveProjectWorkItemStatusFlow(nextSettings);
    await this.recordCoordinatorEvent(projectId, userId, 'COORDINATOR_CONFIG_UPDATED', {
      message: 'Coordinator config updated',
      enabled: flow.coordinator.enabled,
      maxDispatchesPerTick: flow.coordinator.maxDispatchesPerTick,
      launchMode: flow.coordinator.launchMode,
      agentType: flow.coordinator.agentType,
      dispatchRuleCount: flow.dispatchRules.length,
      hasMessageTemplate: Boolean(flow.coordinator.messageTemplate),
    });
    return {
      projectId,
      settings: nextSettings,
      coordinator: flow.coordinator,
    };
  }

  async tickProjectCoordinator(projectId: string, userId: string, dto: { maxDispatches?: number } = {}) {
    const project = await this.ensureProjectManager(projectId, userId);
    if (this.coordinatorTicksInFlight.has(projectId)) {
      const message = 'Coordinator tick skipped because another tick is already running for this project.';
      return {
        projectId,
        dispatched: [],
        blocked: [],
        skipped: [{ reason: 'TICK_IN_PROGRESS' }],
        logs: [message],
      };
    }
    this.coordinatorTicksInFlight.add(projectId);
    try {
    const statusFlow = this.resolveProjectWorkItemStatusFlow(project.settings);
    await this.updateCoordinatorLastTickAt(projectId, project.settings);
    const logs: string[] = [];
    const dispatched: any[] = [];
    const blocked: any[] = [];
    const skipped: any[] = [];

    const logBlocked = async (message: string, payload: Record<string, any>, item?: any) => {
      logs.push(message);
      blocked.push({ workItemId: item?.id || null, message, ...payload });
      await this.recordCoordinatorEvent(
        projectId,
        userId,
        'COORDINATOR_BLOCKED',
        { message, ...payload, workItemId: item?.id || null, workItemTitle: item?.title || null },
        item?.id ? { refType: 'WORK_ITEM', refId: item.id } : undefined,
      );
    };

    if (!statusFlow.coordinator.enabled) {
      const message = 'Coordinator is disabled in the project template, so automatic dispatch will not run this time.';
      logs.push(message);
      await this.recordCoordinatorEvent(projectId, userId, 'COORDINATOR_IDLE', { message, reason: 'DISABLED' });
      return { projectId, dispatched, blocked, skipped, logs };
    }

    const configuredRules = statusFlow.dispatchRules.length
      ? statusFlow.dispatchRules
      : [{
          statuses: statusFlow.claimableStatuses,
          workTypes: [],
          role: 'WORKER_AGENT',
          launchMode: statusFlow.coordinator.launchMode || null,
          agentType: statusFlow.coordinator.agentType || null,
          maxAgents: null,
          minAgents: null,
          forceLaunchNew: false,
          allowOwnerOwned: false,
          allowRepeatCompleted: false,
          objective: null,
          message: null,
        } satisfies ProjectCoordinatorDispatchRule];
    const candidateStatuses = [...new Set(
      configuredRules.flatMap((rule) => rule.statuses.length ? rule.statuses : statusFlow.claimableStatuses),
    )].filter((status) => status && !statusFlow.terminalStatuses.includes(status));
    if (!candidateStatuses.length) {
      const message = 'Coordinator found no claimable status configuration, so there are no dispatchable items this time.';
      logs.push(message);
      await this.recordCoordinatorEvent(projectId, userId, 'COORDINATOR_IDLE', { message, reason: 'NO_CLAIMABLE_STATUS' });
      return { projectId, dispatched, blocked, skipped, logs };
    }

    const projectGlobals = await this.resolveProjectGlobalVariables(projectId, project.settings).catch(() => []);
    const maxDispatchesPerTick =
      this.positiveIntegerFromProjectGlobal(projectGlobals, 'h1_max_dispatches_per_tick') ||
      statusFlow.coordinator.maxDispatchesPerTick ||
      3;
    const maxDispatches = Math.max(1, Math.min(
      this.positiveInteger(dto.maxDispatches, maxDispatchesPerTick),
      maxDispatchesPerTick,
      20,
    ));
    const reconciledStaleAssignments = await this.reconcileStaleOpenAssignments(
      projectId,
      userId,
      statusFlow,
      { source: 'coordinator-tick' },
    );
    if (reconciledStaleAssignments.length) {
      logs.push(`Coordinator reconciled ${reconciledStaleAssignments.length} stale assignment(s) before dispatch.`);
      skipped.push(...reconciledStaleAssignments.map((assignment) => ({
        ...assignment,
        reason: 'RECONCILED_STALE_ASSIGNMENT',
      })));
    }
    const generatedPlannerItems = await this.ensurePlannerItemsForUnanalysedGoals(
      projectId,
      userId,
      statusFlow,
      configuredRules,
      maxDispatches,
    );
    if (generatedPlannerItems.length) {
      logs.push(`Coordinator created planner item(s) for ${generatedPlannerItems.length} unanalyzed goal(s).`);
    }
    const launchableRoles = await this.listLaunchableRoleSummaries(project.settings);
    const launchableRoleSet = new Set(launchableRoles.map((entry) => entry.role));
    const candidateScanLimit = Math.min(500, Math.max(maxDispatches * 40, 200));
    const candidates = await this.prisma.projectWorkItem.findMany({
      where: {
        projectId,
        status: { in: candidateStatuses as any },
      },
      include: {
        goal: { select: { id: true, title: true, description: true, status: true } },
        owner: { select: { id: true, role: true } },
        assignments: {
          select: { id: true, role: true, status: true, assigneeUserId: true, createdAt: true, updatedAt: true, finishedAt: true },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      take: candidateScanLimit,
    });

    const capacityBlockedRoles = new Set<string>();
    for (const item of candidates) {
      if (dispatched.length >= maxDispatches) break;
      const ownerOnlyReason = this.coordinatorOwnerOnlySkipReason(item);
      if (ownerOnlyReason) {
        skipped.push({ workItemId: item.id, reason: ownerOnlyReason });
        continue;
      }
      const openAssignments = (item.assignments || []).filter((assignment: any) =>
        ['PROPOSED', 'ACTIVE', 'PAUSED'].includes(String(assignment.status || '').toUpperCase()),
      );
      if (openAssignments.length) {
        skipped.push({ workItemId: item.id, reason: 'HAS_OPEN_ASSIGNMENT' });
        continue;
      }
      const isBlockedGenericHackerOneDiscovery =
        String(item.workType || '').toUpperCase() === 'OPPORTUNITY_DISCOVERY' &&
        this.isHackerOneOpportunityDiscoveryWorkItem({
          title: item.title,
          description: item.description,
          scopeBrief: item.scopeBrief,
          acceptanceCriteria: item.acceptanceCriteria,
          inputPacket: item.inputPacket,
          outputContract: item.outputContract,
        }) &&
        await this.shouldBlockGenericHackerOneOpportunityDiscovery(projectId, project.settings, item.inputPacket);
      if (isBlockedGenericHackerOneDiscovery) {
        await logBlocked(
          `item ${item.title || item.id} is generic HackerOne opportunity discovery, but unfinished target goals exist; advance existing target goals first.`,
          { reason: 'GENERIC_DISCOVERY_BLOCKED_BY_TARGET_GOAL' },
          item,
        );
        continue;
      }
      if (await this.planningItemHasActiveSiblingWork(projectId, item, statusFlow)) {
        skipped.push({ workItemId: item.id, reason: 'GOAL_ALREADY_HAS_ACTIVE_WORK' });
        continue;
      }
      const rule = configuredRules.find((candidateRule) => this.workItemMatchesCoordinatorRule(item, candidateRule));
      if (!rule) {
        skipped.push({ workItemId: item.id, reason: 'NO_MATCHING_RULE' });
        continue;
      }
      const missingRequiredGlobals = this.missingRequiredProjectGlobalsForWorkItem(item, projectGlobals);
      if (missingRequiredGlobals.length) {
        await logBlocked(
          `item ${item.title || item.id} requires owner-provided resource(s) before dispatch: ${missingRequiredGlobals.join(', ')}.`,
          {
            reason: 'RESOURCE_GLOBALS_MISSING',
            role: rule.role,
            missingRequiredGlobals,
          },
          item,
        );
        continue;
      }
      const itemStatus = this.normalizeWorkItemStatusId(item.status);
      const statusDefinition = statusFlow.statusById.get(itemStatus);
      const completedForCurrentFeedback = this.feedbackRoleAlreadyReviewedLatestOutput(item, rule.role);
      if (!rule.allowRepeatCompleted && completedForCurrentFeedback && statusDefinition?.category === 'feedback') {
        skipped.push({ workItemId: item.id, reason: 'ROLE_ALREADY_COMPLETED_FEEDBACK', role: rule.role });
        continue;
      }
      if (!launchableRoleSet.has(rule.role)) {
        await logBlocked(`item ${item.title || item.id} matched role ${rule.role}, but that role is not launchable in the template.`, {
          reason: 'ROLE_NOT_LAUNCHABLE',
          role: rule.role,
        }, item);
        continue;
      }

      const roleDefaults = this.projectRoleAgentDefaultsFromSettings(project.settings)[rule.role] || {};
      const launchMode =
        rule.launchMode ||
        statusFlow.coordinator.launchMode ||
        this.effectiveAgentRuntimeLaunchMode(roleDefaults.launchMode) ||
        this.defaultAgentRuntimeLaunchMode();
      const agentType = (rule.agentType || statusFlow.coordinator.agentType || roleDefaults.agentType || 'pi').trim() || 'pi';
      const idleRuntime = this.coordinatorRuleAllowsIdleRuntimeReuse(rule, item, statusFlow)
        ? await this.findIdleCoordinatorRuntime(projectId, rule.role, agentType, project.settings)
        : null;
      const maxAgentsForRole =
        this.maxParallelFromProjectGlobals(projectGlobals, rule.role) ||
        rule.maxAgents ||
        statusFlow.coordinator.maxAgentsByRole[rule.role] ||
        statusFlow.coordinator.maxAgents ||
        0;
      if (!idleRuntime && maxAgentsForRole > 0) {
        const activeForRole = await this.activeCoordinatorRoleCount(projectId, rule.role, project.settings);
        if (activeForRole >= maxAgentsForRole) {
          const capacityKey = `${rule.role}:${maxAgentsForRole}`;
          if (capacityBlockedRoles.has(capacityKey)) {
            skipped.push({
              workItemId: item.id,
              reason: 'ROLE_CAPACITY_ALREADY_REACHED',
              role: rule.role,
              activeForRole,
              maxAgentsForRole,
            });
            continue;
          }
          capacityBlockedRoles.add(capacityKey);
          await logBlocked(
            `Active ${rule.role} agent count has reached the template limit ${activeForRole}/${maxAgentsForRole}, so item ${item.title || item.id} cannot be dispatched.`,
            { reason: 'ROLE_CAPACITY_REACHED', role: rule.role, activeForRole, maxAgentsForRole },
            item,
          );
          continue;
        }
      }

      const llmConfigCandidates = idleRuntime || this.canLaunchWithoutModelConfig(launchMode, agentType)
        ? []
        : await this.ownerVisibleLlmConfigCandidates(project.ownerId, []);
      const llmConfigId = llmConfigCandidates[0]?.id || '';
      if (!idleRuntime && !llmConfigId && !this.canLaunchWithoutModelConfig(launchMode, agentType)) {
        await logBlocked(
          `${rule.role} requires an LLM API config, but the owner has no available config, so the agent cannot be launched with ${launchMode}/${agentType}.`,
          { reason: 'MODEL_API_MISSING', role: rule.role, launchMode, agentType },
          item,
        );
        break;
      }

      const message = rule.message || this.coordinatorDispatchMessage(
        item,
        rule.role,
        launchMode,
        agentType,
        statusFlow.coordinator.messageTemplate,
      );
      try {
        let launched: {
          memberId: string;
          userId: string;
          session?: AgentRuntimeSession | null;
          reusedIdle?: boolean;
        };
        if (idleRuntime) {
          launched = {
            memberId: idleRuntime.id,
            userId: idleRuntime.userId,
            session: idleRuntime.session || null,
            reusedIdle: true,
          };
        } else {
          try {
            await this.ensureProjectActiveAgentCapacity(projectId, project.settings);
          } catch (error: any) {
            await logBlocked(
              'The project has reached its maximum active agent limit. Update the project config or clear unnecessary agents before launching another one.',
              { reason: 'PROJECT_CAPACITY_REACHED', detail: error?.message || String(error) },
              item,
            );
            break;
          }
          launched = await this.launchAgentRuntime(projectId, project.ownerId, {
            role: rule.role,
            ...(llmConfigId ? { llmConfigId } : {}),
            agentType,
            launchMode,
            deploymentDays: 1,
            launcherUserId: userId,
            launchSource: 'coordinator',
          });
        }
        const assignment = await this.createAssignment(projectId, item.id, project.ownerId, {
          assigneeUserId: launched.userId,
          role: rule.role,
          targetRuntimeId: launched.session?.runtimeId || undefined,
          objective: this.coordinatorAssignmentObjective(item, rule),
          contextPacket: {
            source: 'project-coordinator',
            coordinator: {
              message,
              launchMode,
              agentType,
              role: rule.role,
              status: item.status,
              statusLabel: statusFlow.statusById.get(this.normalizeWorkItemStatusId(item.status))?.label || null,
              dispatchMode: launched.reusedIdle ? 'reuse-idle' : 'launch-new',
              forceLaunchNew: rule.forceLaunchNew,
              assignedAt: new Date().toISOString(),
            },
          },
        });
        const wakeResult = await this.wakeRuntimeForAssignment(projectId, project.ownerId, launched.memberId, assignment, {
          waitForFirstResponse: false,
        }).catch((error: any) => {
          this.logger.warn(`Coordinator failed to wake ${rule.role} for ${projectId}/${item.id}: ${error?.message || error}`);
          return { accepted: false, error: error?.message || String(error), conversationId: null, requestId: null };
        });
        const conversationId = wakeResult?.conversationId || null;
        const requestId = wakeResult?.requestId || null;
        if (conversationId || requestId) {
          const contextPacket =
            assignment.contextPacket && typeof assignment.contextPacket === 'object' && !Array.isArray(assignment.contextPacket)
              ? assignment.contextPacket as Record<string, any>
              : {};
          await this.prisma.projectAssignment.update({
            where: { id: assignment.id },
            data: {
              contextPacket: {
                ...contextPacket,
                coordinator: {
                  ...(contextPacket.coordinator && typeof contextPacket.coordinator === 'object' && !Array.isArray(contextPacket.coordinator)
                    ? contextPacket.coordinator
                    : {}),
                  conversationId,
                  requestId,
                },
              },
            },
          }).catch((error: any) => {
            this.logger.warn(`Failed to persist coordinator wake context for assignment ${assignment.id}: ${error?.message || error}`);
          });
        }
        const dispatchMode = launched.reusedIdle ? 'reuse-idle' : 'launch-new';
        logs.push(`${message}${conversationId ? ` conversation ${conversationId}` : ''}`);
        const dispatchRecord = {
          workItemId: item.id,
          workItemTitle: item.title,
          role: rule.role,
          memberId: launched.memberId,
          targetMemberId: launched.memberId,
          targetMemberIds: [launched.memberId],
          targetRole: rule.role,
          userId: launched.userId,
          targetUserId: launched.userId,
          runtimeId: launched.session?.runtimeId || null,
          targetRuntimeId: launched.session?.runtimeId || null,
          assignmentId: assignment.id,
          launchMode,
          agentType,
          dispatchMode,
          conversationId,
          requestId,
          messageSent: Boolean(wakeResult?.accepted),
          message,
        };
        dispatched.push(dispatchRecord);
        await this.recordCoordinatorEvent(
          projectId,
          userId,
          'COORDINATOR_DISPATCHED_ITEM',
          dispatchRecord,
          { refType: 'WORK_ITEM', refId: item.id },
        );
      } catch (error: any) {
        await logBlocked(
          `Coordinator failed to dispatch item ${item.title || item.id} to ${rule.role}: ${error?.message || error}`,
          { reason: 'DISPATCH_FAILED', role: rule.role, launchMode, agentType, detail: error?.message || String(error) },
          item,
        );
      }
    }

    if (!dispatched.length && !blocked.length) {
      const message = candidates.length
        ? 'Coordinator check completed: no unassigned items currently match the rules.'
        : 'Coordinator check completed: there are no claimable items.';
      logs.push(message);
      await this.recordCoordinatorEvent(projectId, userId, 'COORDINATOR_IDLE', {
        message,
        reason: candidates.length ? 'NO_UNASSIGNED_MATCH' : 'NO_CANDIDATES',
        candidateStatuses,
      });
    }

    return { projectId, dispatched, blocked, skipped, logs };
    } finally {
      this.coordinatorTicksInFlight.delete(projectId);
    }
  }

  private async findProjectRuntimeMembers(projectId: string) {
    const userSelect = {
      id: true,
      email: true,
      displayName: true,
      role: true,
      githubLogin: true,
      avatarUrl: true,
      bio: true,
      createdAt: true,
    } as const;

    try {
      return await this.prisma.projectMember.findMany({
        where: { projectId, removedAt: null },
        include: { user: { select: userSelect } },
      });
    } catch (error: any) {
      this.logger.warn(
        `Falling back to split runtime member lookup for ${projectId}: ${error?.message || error}`,
      );
      const members = await this.prisma.projectMember.findMany({
        where: { projectId, removedAt: null },
        select: {
          id: true,
          userId: true,
          projectId: true,
          role: true,
          permissions: true,
          joinedAt: true,
        },
      });
      const users = members.length
        ? await this.prisma.user.findMany({
            where: { id: { in: [...new Set(members.map((member) => member.userId))] } },
            select: userSelect,
          })
        : [];
      const usersById = new Map(users.map((user) => [user.id, user]));
      return members.map((member) => ({
        ...member,
        user: usersById.get(member.userId) || null,
      }));
    }
  }

  private localRunnerJobWithRolePrompt(
    job: AgentRuntimeLocalRunnerJob | undefined,
    rolePrompt: string | null,
  ): AgentRuntimeLocalRunnerJob | undefined {
    if (!job) return job;
    return {
      ...job,
      rolePrompt,
      files: (job.files || []).map((file) => {
        if (file.path !== 'AGENT_WORKSPACE_CONTEXT.json') return file;
        try {
          const parsed = JSON.parse(file.content || '{}');
          return {
            ...file,
            content: JSON.stringify({ ...parsed, rolePrompt }, null, 2),
          };
        } catch {
          return file;
        }
      }),
    };
  }

  async launchAgentRuntime(
    projectId: string,
    userId: string,
    dto: LaunchProjectAgentRuntimeDto & {
      launcherUserId?: string;
      launcherMemberId?: string;
      launcherRole?: string;
      launcherRuntimeId?: string;
      launchSource?: string;
    },
  ) {
    await this.ensureProjectManager(projectId, userId);
    const projectRecord = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { settings: true, budgetCurrency: true },
    });
    const role = dto.role.trim();
    if (!role || role === 'OWNER') {
      throw new BadRequestException('A launchable agent role is required');
    }

    const runtimeId = randomUUID();
    const roleLaunchDefault = this.projectRoleAgentDefaultsFromSettings(projectRecord?.settings)[role] || {};
    const deploymentDays = Math.max(1, Math.floor(Number(dto.deploymentDays || roleLaunchDefault.deploymentDays) || 1));
    const launchMode =
      this.effectiveAgentRuntimeLaunchMode(dto.launchMode) ||
      this.effectiveAgentRuntimeLaunchMode(roleLaunchDefault.launchMode) ||
      this.defaultAgentRuntimeLaunchMode();
    const agentType = (dto.agentType || roleLaunchDefault.agentType || this.defaultAgentRuntimeType()).trim() || 'pi';
    if (agentType !== 'hermes-agent' && launchMode !== 'local-docker' && launchMode !== 'local-runner' && launchMode !== 'local-codex') {
      throw new BadRequestException(`${agentType} is available for local Docker, local runner, or local Codex launches only`);
    }
    const launchableRoles = await this.listLaunchableRoleSummaries(projectRecord?.settings);
    const roleIsLaunchable = launchableRoles.some((entry) => entry.role === role);
    const existingLeadAgentMember = !dto.memberId && role === 'LEAD_AGENT'
      ? await this.findActiveProjectLeadAgent(projectId)
      : null;
    const pendingLaunchMember = !dto.memberId && role !== 'LEAD_AGENT'
      ? await this.findPendingLaunchAgentMember(projectId, role)
      : null;
    const canLaunchLeadAgent =
      !dto.memberId &&
      !roleIsLaunchable &&
      role === 'LEAD_AGENT' &&
      (Boolean(existingLeadAgentMember) || (await this.canCreateProjectLeadAgent(projectId, projectRecord?.settings)));
    if (!dto.memberId && !roleIsLaunchable && !canLaunchLeadAgent) {
      throw new BadRequestException(`Agent runtime role must be one of: ${launchableRoles.map((entry) => entry.role).join(', ')}`);
    }
    let budgetContext = dto.memberId
      ? null
      : await this.ensureRuntimeBudgetForLaunch(
          projectId,
          existingLeadAgentMember?.id || pendingLaunchMember?.id || null,
          deploymentDays,
          launchMode,
        );
    const member = dto.memberId
      ? await this.ensureLaunchableMember(projectId, dto.memberId, role)
      : existingLeadAgentMember || pendingLaunchMember || (await this.findOrCreateAgentMember(projectId, role));
    const explicitLauncherMember = dto.launcherMemberId
      ? await this.prisma.projectMember.findFirst({
          where: { id: dto.launcherMemberId, projectId, removedAt: null },
          select: { id: true, userId: true, role: true },
        })
      : null;
    const launchActorUserId = explicitLauncherMember?.userId || dto.launcherUserId || userId;
    const launcherMember = explicitLauncherMember || await this.prisma.projectMember.findFirst({
      where: { projectId, userId: launchActorUserId, removedAt: null },
      select: { id: true, userId: true, role: true },
    });
    const agentDisplayName = this.agentDisplayNameForMember(member);
    budgetContext = budgetContext || await this.ensureRuntimeBudgetForLaunch(projectId, member.id, deploymentDays, launchMode);
    const roleConfig = await this.projectRoleConfigForRole(role, projectRecord?.settings);
    const resolvedCapabilities = await this.resolveRoleCapabilityBundles(role, roleConfig);
    const skillBundleRefs = resolvedCapabilities.skillBundleRefs.length
      ? resolvedCapabilities.skillBundleRefs
      : this.projectRoleConfigForRoleSync(role).skillBundleRefs;
    const projectSkillOverrides = await this.projectSkillOverridesForRole(
      projectId,
      role,
      roleConfig,
      projectRecord?.settings,
      skillBundleRefs,
    );
    const capabilityBundleRefs = resolvedCapabilities.refs;
    const runtimeFeatureSupport = this.agentRuntimeLauncher.runtimeFeatureSupport(agentType);
    const runtimeCapabilityWarnings = this.runtimeCapabilityWarnings(roleConfig, runtimeFeatureSupport, resolvedCapabilities);
    if (runtimeCapabilityWarnings.some((warning) => warning.includes('marked unsupported'))) {
      throw new BadRequestException(runtimeCapabilityWarnings.join(' '));
    }
    const scopes = this.scopesForRole(role, roleConfig, resolvedCapabilities);
    const projectGlobals = await this.resolveProjectGlobalVariables(projectId, projectRecord?.settings);
    const missingProjectGlobals = this.missingRequiredProjectGlobals(
      projectGlobals.filter((global) => this.isProjectScopedGlobal(global)),
      resolvedCapabilities.requiredProjectGlobals,
    );
    if (missingProjectGlobals.length) {
      throw new BadRequestException(
        `Cannot launch ${role}: missing required project global resource(s): ${missingProjectGlobals.join(', ')}`,
      );
    }
    const runtimeProjectGlobals = await this.visibleProjectGlobalsForRuntime(projectId, member, projectGlobals);
    await this.installResolvedCapabilityBundles(projectId, resolvedCapabilities.manifests, member.id);
    const llmConfigId = typeof dto.llmConfigId === 'string' ? dto.llmConfigId.trim() : '';
    if (!llmConfigId && !this.canLaunchWithoutModelConfig(launchMode, agentType)) {
      throw new BadRequestException('A model API config is required for this agent runtime');
    }
    const llmConfig = llmConfigId ? await this.apiConfigService.findOne(userId, llmConfigId) : null;
    if (llmConfigId) {
      await this.apiConfigService.activate(userId, llmConfigId).catch(() => null);
    }

    await this.agentWorkspaceClient.registerRuntime({
      runtimeId,
      memberId: member.id,
      provider: launchMode,
      framework: agentType,
      model: llmConfig?.modelName || dto.model || agentType,
      metadata: {
        role,
        image: dto.image || roleLaunchDefault.image || (launchMode === 'aws-ecs'
          ? this.agentRuntimeLauncher.cloudImage()
          : launchMode === 'aws-agentcore'
            ? this.agentRuntimeLauncher.agentCoreRuntimeArn() || this.agentRuntimeLauncher.agentCoreContainerImage()
            : this.agentRuntimeLauncher.defaultImage(agentType)),
        agentType,
        launchMode,
        deploymentDays,
        enableSudo: Boolean(dto.enableSudo ?? roleLaunchDefault.enableSudo),
        skillBundleRefs,
        projectSkillOverrides,
        capabilityBundleRefs,
        capabilityBundles: resolvedCapabilities.manifests,
        runtimeFeatureSupport,
        runtimeCapabilityWarnings,
        agentDisplayName,
        rolePrompt: roleConfig.initialPrompt || null,
        ...(llmConfig ? { llm: {
          configId: llmConfig.id,
          name: llmConfig.name,
          apiType: llmConfig.apiType,
          apiUrl: llmConfig.apiUrl,
          modelName: llmConfig.modelName,
        } } : {}),
      },
    });

    const grant = await this.agentWorkspaceClient.issueAccessGrant(projectId, {
      memberId: member.id,
      runtimeId,
      scopes,
      reason: `Launch ${role} ${agentType} runtime`,
      skillBundleRefs,
      capabilityBundleRefs,
    });
    const token = await this.agentWorkspaceClient.mintAccessToken(grant.grantId);
    const projectGithubUrl = this.getProjectGithubUrl(projectRecord?.settings);

    let session: AgentRuntimeSession;
    const launchConfig = {
      projectId,
      projectGithubUrl,
      projectGlobals: runtimeProjectGlobals,
      memberId: member.id,
      userId: member.userId,
      role,
      agentDisplayName,
      agentType,
      runtimeId,
      workspaceToken: token.token,
      workspaceBaseUrl: this.agentWorkspaceClient.getConfiguredBaseUrl(),
      grantId: grant.grantId,
      scopes,
      skillBundleRefs,
      projectSkillOverrides,
      capabilityBundleRefs,
      capabilityBundles: resolvedCapabilities.manifests,
      runtimeFeatureSupport,
      runtimeCapabilityWarnings,
      rolePrompt: roleConfig.initialPrompt || null,
      repoWorkspaceDir: launchMode === 'aws-agentcore' ? '/mnt/workspace' : '/opt/data/workspace',
      deploymentDays,
      dailyCostAmount: launchMode === 'aws-ecs' ? AGENT_DEPLOYMENT_PRICE_PER_DAY : 0,
      budgetCurrency: projectRecord?.budgetCurrency || 'AIC',
      enableSudo: Boolean(dto.enableSudo),
      llm: llmConfig ? {
        configId: llmConfig.id,
        name: llmConfig.name,
        apiType: llmConfig.apiType || 'openai',
        apiUrl: llmConfig.apiUrl,
        apiKey: llmConfig.apiKey,
        modelName: llmConfig.modelName,
      } : null,
      image: dto.image || roleLaunchDefault.image,
      model: llmConfig?.modelName || dto.model || agentType,
      projectApiBaseUrl:
        this.configService.get<string>('HERMES_AGENT_PROJECT_API_BASE_URL') ||
        this.configService.get<string>('AIFACTORY_PUBLIC_API_BASE_URL') ||
        this.configService.get<string>('AIFACTORY_API_BASE_URL') ||
        undefined,
    };
    try {
      session = launchMode === 'aws-ecs'
        ? await this.agentRuntimeLauncher.launchCloud(launchConfig)
        : launchMode === 'aws-agentcore'
        ? await this.agentRuntimeLauncher.launchAgentCore(launchConfig)
        : launchMode === 'local-runner'
        ? await this.agentRuntimeLauncher.createLocalRunnerPendingSession(launchConfig)
        : launchMode === 'local-codex'
        ? await this.agentRuntimeLauncher.createLocalCodexPendingSession(launchConfig)
        : await this.agentRuntimeLauncher.launch(launchConfig);
    } catch (err) {
      throw new BadRequestException(this.sanitizeAgentLaunchError(err));
    }

    const launchPollingConfig = this.normalizeAgentPollingConfig(
      this.readAgentPollingConfig(member.permissions) || roleConfig.polling,
      roleConfig.polling || undefined,
    );
    session = {
      ...session,
      launchedBy: {
        userId: launchActorUserId,
        memberId: launcherMember?.id || dto.launcherMemberId || null,
        role: launcherMember?.role || dto.launcherRole || null,
        runtimeId: dto.launcherRuntimeId || null,
        source: dto.launchSource || 'host',
        launchedAt: session.launchedAt || new Date().toISOString(),
      },
      pollingConfig: launchPollingConfig,
      pollingState: {
        ...(session.pollingState || {}),
        nextRunAt: launchPollingConfig.enabled ? this.nextAgentPollingRunAt(launchPollingConfig) : null,
        lastError: null,
      },
      updatedAt: new Date().toISOString(),
    };

    await this.writeRuntimeSession(member.id, session);
    await this.agentWorkspaceClient.heartbeatRuntime(runtimeId, token.token, {
      projectId,
      status: 'READY',
      message: `${role} ${agentType} runtime ${this.isQueuedLocalRuntimeProvider(launchMode) ? `queued for ${launchMode}` : `launched via ${launchMode}`}`,
    }).catch(() => null);
    await this.agentWorkspaceClient.recordProjectEvent(projectId, {
      type: 'AGENT_RUNTIME_LAUNCHED',
      refType: 'AGENT_RUNTIME',
      refId: runtimeId,
      actorUserId: launchActorUserId,
      payload: {
        launcherMemberId: launcherMember?.id || dto.launcherMemberId || null,
        launcherRole: launcherMember?.role || dto.launcherRole || null,
        launcherRuntimeId: dto.launcherRuntimeId || null,
        launchSource: dto.launchSource || 'host',
        targetMemberId: member.id,
        targetMemberIds: [member.id],
        targetRole: role,
        targetUserId: member.userId,
        targetRuntimeId: runtimeId,
        targetRuntimeProvider: launchMode,
        targetRuntimeAgentType: agentType,
        launchMode,
        agentType,
        deploymentDays,
      },
    }).catch((error: any) => {
      this.logger.warn(`Failed to record agent runtime launch event for ${projectId}/${member.id}: ${error?.message || error}`);
    });

    return {
      projectId,
      memberId: member.id,
      userId: member.userId,
      role,
      budget: {
        budgetAmount: budgetContext.budgetAmount,
        budgetCurrency: budgetContext.budgetCurrency,
        committedAmount: budgetContext.committedByOtherMembers + budgetContext.requestedAmount,
        availableAmount: budgetContext.remainingAfterLaunch,
        requestedAmount: budgetContext.requestedAmount,
        dailyAgentCostAmount: budgetContext.dailyAgentCostAmount,
        deploymentDays,
      },
      session: this.sanitizeRuntimeSession(session),
    };
  }

  async refreshProjectTemplate(
    projectId: string,
    userId: string,
    dto: RefreshProjectTemplateDto = {},
  ) {
    const project = await this.ensureProjectManager(projectId, userId);
    const baseSettings = this.mergeProjectSettings(project.settings, { settings: {} });
    const templateId =
      typeof baseSettings.projectTemplateId === 'string' && baseSettings.projectTemplateId.trim()
        ? baseSettings.projectTemplateId.trim()
        : '';
    if (!templateId) {
      throw new BadRequestException('This project is not linked to a reusable template.');
    }

    const template = await this.projectTemplatesService.getTemplate(templateId, userId);
    const refreshedRoles = this.uniqueStringList(
      (template.roles || []).map((entry) => entry.role).filter((role): role is string => Boolean(role?.trim())),
    );
    if (!refreshedRoles.length) {
      throw new BadRequestException(`Project template "${templateId}" does not define launchable roles.`);
    }

    const now = new Date().toISOString();
    const existingProjectGlobals = this.getProjectGlobalVariables(baseSettings);
    const existingProjectGlobalIdentities = new Set(
      existingProjectGlobals.map((entry) => this.projectGlobalIdentity(entry)),
    );
    const templateProjectGlobals = this.getProjectGlobalVariables({
      projectGlobals: template.projectGlobals || [],
    })
      .filter((entry) => !existingProjectGlobalIdentities.has(this.projectGlobalIdentity(entry)))
      .map((entry) => ({
        ...entry,
        value: entry.isSecret ? '' : entry.value || '',
        providedValue: !entry.isSecret && Boolean(entry.value),
      }));
    const refreshedProjectGlobals = [...templateProjectGlobals, ...existingProjectGlobals];
    const nextSettings: Record<string, any> = {
      ...baseSettings,
      projectTemplateId: template.id || templateId,
      projectTemplateRoles: template.roles || [],
      projectTemplateRefreshedAt: now,
      projectTemplateRefreshedById: userId,
    };
    if (refreshedProjectGlobals.length) {
      nextSettings.projectGlobals = this.globalsForStoredSettings(refreshedProjectGlobals);
    }

    await this.prisma.project.update({
      where: { id: projectId },
      data: { settings: nextSettings },
    });
    await this.agentWorkspaceClient.updateProject(projectId, { settings: nextSettings }).catch(() => null);

    const updatedRuntimeMemberIds: string[] = [];
    if (dto.applyToRunning !== false) {
      const members = await this.prisma.projectMember.findMany({
        where: { projectId, removedAt: null },
        select: { id: true, role: true, permissions: true },
      });
      const rolePromptByRole = new Map<string, string | null>();
      for (const member of members) {
        const role = String(member.role || '').trim();
        if (!refreshedRoles.includes(role)) continue;
        const session = this.readRuntimeSession(member.permissions);
        if (!session) continue;
        if (!rolePromptByRole.has(role)) {
          const roleConfig = await this.projectRoleConfigForRole(role, nextSettings);
          rolePromptByRole.set(role, roleConfig.initialPrompt || null);
        }
        const rolePrompt = rolePromptByRole.get(role) || null;
        const updatedSession: AgentRuntimeSession = {
          ...session,
          rolePrompt,
          localRunnerJob: this.localRunnerJobWithRolePrompt(session.localRunnerJob, rolePrompt),
          updatedAt: now,
        };
        await this.writeRuntimeSession(member.id, updatedSession);
        updatedRuntimeMemberIds.push(member.id);
        this.publishAgentRuntimeSessionEvent(projectId, member.id, {
          type: 'session',
          role,
          session: this.sanitizeRuntimeSession(updatedSession),
          message: 'Project template refreshed',
        });
      }
    }

    const projectGlobals = await this.resolveProjectGlobalVariables(projectId, nextSettings).catch(() => []);
    return {
      projectId,
      template: {
        id: template.id,
        label: template.label,
        version: template.version || null,
      },
      refreshedRoles,
      settings: this.withSanitizedProjectSettings(nextSettings, projectGlobals),
      updatedRuntimeMemberIds,
    };
  }

  async updateProjectRolePrompt(
    projectId: string,
    rawRole: string,
    userId: string,
    dto: UpdateProjectRolePromptDto,
  ) {
    const project = await this.ensureProjectManager(projectId, userId);
    const role = String(rawRole || '').trim();
    if (!role || role === 'OWNER') {
      throw new BadRequestException('A project agent role is required');
    }

    const launchableRoles = await this.listLaunchableRoleSummaries(project.settings);
    const existingMember = await this.prisma.projectMember.findFirst({
      where: { projectId, role, removedAt: null },
      select: { id: true },
    });
    if (!existingMember && !launchableRoles.some((entry) => entry.role === role)) {
      throw new BadRequestException(`Project role must be one of: ${launchableRoles.map((entry) => entry.role).join(', ')}`);
    }

    const baseSettings = this.mergeProjectSettings(project.settings, { settings: {} });
    const nextOverrides = {
      ...this.projectRolePromptOverridesFromSettings(baseSettings),
    };
    const now = new Date().toISOString();
    if (dto.reset || dto.initialPrompt === null) {
      delete nextOverrides[role];
    } else {
      const initialPrompt = String(dto.initialPrompt ?? '').replace(/\r\n/g, '\n').trim();
      if (initialPrompt.length > 50000) {
        throw new BadRequestException('Role prompt is too long');
      }
      nextOverrides[role] = {
        ...(nextOverrides[role] || {}),
        initialPrompt,
        updatedAt: now,
        updatedById: userId,
      };
    }

    const nextSettings = {
      ...baseSettings,
    };
    if (Object.keys(nextOverrides).length) {
      nextSettings.projectRoleOverrides = nextOverrides;
    } else {
      delete nextSettings.projectRoleOverrides;
    }

    await this.prisma.project.update({
      where: { id: projectId },
      data: { settings: nextSettings },
    });
    await this.agentWorkspaceClient.updateProject(projectId, { settings: nextSettings }).catch(() => null);

    const roleConfig = await this.projectRoleConfigForRole(role, nextSettings);
    const rolePrompt = roleConfig.initialPrompt || null;
    const updatedRuntimeMemberIds: string[] = [];
    if (dto.applyToRunning !== false) {
      const members = await this.prisma.projectMember.findMany({
        where: { projectId, role, removedAt: null },
        select: { id: true, permissions: true },
      });
      for (const member of members) {
        const session = this.readRuntimeSession(member.permissions);
        if (!session) continue;
        const updatedSession: AgentRuntimeSession = {
          ...session,
          rolePrompt,
          localRunnerJob: this.localRunnerJobWithRolePrompt(session.localRunnerJob, rolePrompt),
          updatedAt: now,
        };
        await this.writeRuntimeSession(member.id, updatedSession);
        updatedRuntimeMemberIds.push(member.id);
        this.publishAgentRuntimeSessionEvent(projectId, member.id, {
          type: 'session',
          role,
          session: this.sanitizeRuntimeSession(updatedSession),
          message: 'Role prompt updated',
        });
      }
    }

    const projectGlobals = await this.resolveProjectGlobalVariables(projectId, nextSettings).catch(() => []);
    const resolvedCapabilities = await this.resolveRoleCapabilityBundles(role, roleConfig);
    const skillBundleRefs = resolvedCapabilities.skillBundleRefs.length
      ? resolvedCapabilities.skillBundleRefs
      : roleConfig.skillBundleRefs;
    return {
      projectId,
      role,
      override: this.projectRolePromptOverridesFromSettings(nextSettings)[role] || null,
      roleConfig: {
        role,
        label: roleConfig.label || role,
        description: roleConfig.description || this.defaultRoleDescription(role),
        skillBundleRefs,
        capabilityBundleRefs: resolvedCapabilities.refs,
        runtimeCompatibility: roleConfig.runtimeCompatibility || null,
        initialPrompt: roleConfig.initialPrompt || '',
      },
      settings: this.withSanitizedProjectSettings(nextSettings, projectGlobals),
      updatedRuntimeMemberIds,
    };
  }

  async getProjectRoleSkills(projectId: string, rawRole: string, userId: string) {
    const project = await this.ensureProjectManager(projectId, userId);
    const role = String(rawRole || '').trim();
    if (!role || role === 'OWNER') {
      throw new BadRequestException('A project agent role is required');
    }
    const roleConfig = await this.projectRoleConfigForRole(role, project.settings);
    const resolvedCapabilities = await this.resolveRoleCapabilityBundles(role, roleConfig);
    const skillBundleRefs = resolvedCapabilities.skillBundleRefs.length
      ? resolvedCapabilities.skillBundleRefs
      : roleConfig.skillBundleRefs;
    const skillDetails = await Promise.all(
      skillBundleRefs.map((ref) => this.projectRoleSkillDetail(projectId, role, ref, project.settings)),
    );
    return {
      projectId,
      role,
      override: this.projectRoleSkillOverridesFromSettings(project.settings)[role] || null,
      roleConfig: {
        role,
        label: roleConfig.label || role,
        description: roleConfig.description || this.defaultRoleDescription(role),
        skillBundleRefs,
        skills: roleConfig.skills || [],
        capabilityBundleRefs: resolvedCapabilities.refs,
        runtimeCompatibility: roleConfig.runtimeCompatibility || null,
        initialPrompt: roleConfig.initialPrompt || '',
      },
      skills: skillDetails,
    };
  }

  async updateProjectRoleSkills(
    projectId: string,
    rawRole: string,
    userId: string,
    dto: UpdateProjectRoleSkillsDto,
  ) {
    const project = await this.ensureProjectManager(projectId, userId);
    const role = String(rawRole || '').trim();
    if (!role || role === 'OWNER') {
      throw new BadRequestException('A project agent role is required');
    }

    const launchableRoles = await this.listLaunchableRoleSummaries(project.settings);
    const existingMember = await this.prisma.projectMember.findFirst({
      where: { projectId, role, removedAt: null },
      select: { id: true },
    });
    if (!existingMember && !launchableRoles.some((entry) => entry.role === role)) {
      throw new BadRequestException(`Project role must be one of: ${launchableRoles.map((entry) => entry.role).join(', ')}`);
    }

    const baseSettings = this.mergeProjectSettings(project.settings, { settings: {} });
    const baseRoleConfig = await this.projectRoleConfigForRole(role, baseSettings);
    const baseResolvedCapabilities = await this.resolveRoleCapabilityBundles(role, baseRoleConfig);
    const baseSkillBundleRefs = baseResolvedCapabilities.skillBundleRefs.length
      ? baseResolvedCapabilities.skillBundleRefs
      : baseRoleConfig.skillBundleRefs;
    const nextOverrides = {
      ...this.projectRoleSkillOverridesFromSettings(baseSettings),
    };
    const now = new Date().toISOString();

    if (dto.reset) {
      delete nextOverrides[role];
    } else {
      const skillBundleRefs = this.normalizeProjectRoleSkillRefs(dto.skillBundleRefs, baseSkillBundleRefs);
      const existingSkillOverrides = nextOverrides[role]?.skills || {};
      const nextSkillOverrides: NonNullable<ProjectRoleSkillOverride['skills']> = {};
      for (const ref of skillBundleRefs) {
        if (existingSkillOverrides[ref]) {
          nextSkillOverrides[ref] = existingSkillOverrides[ref];
        }
      }

      const markdownByRef = dto.skillMarkdownByRef && typeof dto.skillMarkdownByRef === 'object' && !Array.isArray(dto.skillMarkdownByRef)
        ? dto.skillMarkdownByRef
        : {};
      for (const [ref, rawMarkdown] of Object.entries(markdownByRef)) {
        if (!skillBundleRefs.includes(ref) || rawMarkdown === null || rawMarkdown === undefined) continue;
        const markdown = String(rawMarkdown).replace(/\r\n/g, '\n');
        if (markdown.length > 200000) {
          throw new BadRequestException('Skill markdown is too long');
        }
        const name = this.skillNameFromRef(ref);
        const storagePath = this.projectRoleSkillStoragePath(role, ref);
        await this.agentWorkspaceClient.writeProjectFile(projectId, {
          path: storagePath,
          content: markdown,
          contentType: 'text/markdown; charset=utf-8',
        });
        nextSkillOverrides[ref] = {
          name,
          storagePath,
          updatedAt: now,
          updatedById: userId,
        };
      }

      nextOverrides[role] = {
        skillBundleRefs,
        ...(Object.keys(nextSkillOverrides).length ? { skills: nextSkillOverrides } : {}),
        updatedAt: now,
        updatedById: userId,
      };
    }

    const nextSettings = { ...baseSettings };
    if (Object.keys(nextOverrides).length) {
      nextSettings.projectRoleSkillOverrides = nextOverrides;
    } else {
      delete nextSettings.projectRoleSkillOverrides;
    }

    await this.prisma.project.update({
      where: { id: projectId },
      data: { settings: nextSettings },
    });
    await this.agentWorkspaceClient.updateProject(projectId, { settings: nextSettings }).catch(() => null);

    const roleConfig = await this.projectRoleConfigForRole(role, nextSettings);
    const resolvedCapabilities = await this.resolveRoleCapabilityBundles(role, roleConfig);
    const skillBundleRefs = resolvedCapabilities.skillBundleRefs.length
      ? resolvedCapabilities.skillBundleRefs
      : roleConfig.skillBundleRefs;
    const projectSkillOverrides = await this.projectSkillOverridesForRole(
      projectId,
      role,
      roleConfig,
      nextSettings,
      skillBundleRefs,
    );
    const updatedRuntimeMemberIds: string[] = [];
    if (dto.applyToRunning !== false) {
      const members = await this.prisma.projectMember.findMany({
        where: { projectId, role, removedAt: null },
        select: { id: true, permissions: true },
      });
      for (const member of members) {
        const session = this.readRuntimeSession(member.permissions);
        if (!session) continue;
        const runtimeFeatureSupport = this.agentRuntimeLauncher.runtimeFeatureSupport(session.agentType);
        const runtimeCapabilityWarnings = this.runtimeCapabilityWarnings(roleConfig, runtimeFeatureSupport, resolvedCapabilities);
        const updatedSession: AgentRuntimeSession = {
          ...session,
          skillBundleRefs,
          projectSkillOverrides,
          capabilityBundleRefs: resolvedCapabilities.refs,
          capabilityBundles: resolvedCapabilities.manifests,
          runtimeFeatureSupport,
          runtimeCapabilityWarnings,
          localRunnerJob: await this.agentRuntimeLauncher.localRunnerJobWithSkillBundle(
            session.localRunnerJob,
            role,
            skillBundleRefs,
            projectSkillOverrides,
          ),
          updatedAt: now,
        };
        await this.agentRuntimeLauncher.applySkillBundleToRuntime(updatedSession).catch((error: any) => {
          this.logger.warn(`Failed to refresh runtime skills for ${projectId}/${member.id}: ${error?.message || error}`);
        });
        await this.writeRuntimeSession(member.id, updatedSession);
        updatedRuntimeMemberIds.push(member.id);
        this.publishAgentRuntimeSessionEvent(projectId, member.id, {
          type: 'session',
          role,
          session: this.sanitizeRuntimeSession(updatedSession),
          message: 'Role skills updated',
        });
      }
    }

    const projectGlobals = await this.resolveProjectGlobalVariables(projectId, nextSettings).catch(() => []);
    const skillDetails = await Promise.all(
      skillBundleRefs.map((ref) => this.projectRoleSkillDetail(projectId, role, ref, nextSettings)),
    );
    return {
      projectId,
      role,
      override: this.projectRoleSkillOverridesFromSettings(nextSettings)[role] || null,
      roleConfig: {
        role,
        label: roleConfig.label || role,
        description: roleConfig.description || this.defaultRoleDescription(role),
        skillBundleRefs,
        skills: roleConfig.skills || [],
        capabilityBundleRefs: resolvedCapabilities.refs,
        runtimeCompatibility: roleConfig.runtimeCompatibility || null,
        initialPrompt: roleConfig.initialPrompt || '',
      },
      skills: skillDetails,
      settings: this.withSanitizedProjectSettings(nextSettings, projectGlobals),
      updatedRuntimeMemberIds,
    };
  }

  async claimLocalRunnerAgentRuntime(projectId: string, userId: string, memberId?: string) {
    return this.claimQueuedLocalRuntime(projectId, userId, 'local-runner', memberId);
  }

  async claimLocalCodexAgentRuntime(projectId: string, userId: string, memberId?: string) {
    return this.claimQueuedLocalRuntime(projectId, userId, 'local-codex', memberId);
  }

  private async ensureQueuedLocalRunnerJob(
    projectId: string,
    userId: string,
    member: { id: string; role: string; userId: string; permissions?: any },
    provider: 'local-runner' | 'local-codex',
    session: AgentRuntimeSession,
  ) {
    if (session.localRunnerJob) return session.localRunnerJob;
    if (!session.llm?.configId && provider !== 'local-codex') {
      throw new BadRequestException('Local runner session is missing model configuration');
    }
    const llmConfig = session.llm?.configId
      ? await this.apiConfigService.findOne(userId, session.llm.configId)
      : null;
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { settings: true },
    });
    const projectGlobals = await this.resolveProjectGlobalVariables(projectId, project?.settings);
    const runtimeProjectGlobals = await this.visibleProjectGlobalsForRuntime(projectId, member, projectGlobals);
    return this.agentRuntimeLauncher.createLocalRunnerJobForSession(session, {
      projectId,
      memberId: member.id,
      userId: member.userId,
      role: member.role,
      agentDisplayName: session.agentDisplayName || null,
      workspaceBaseUrl: this.agentWorkspaceClient.getConfiguredBaseUrl(),
      projectGlobals: runtimeProjectGlobals,
    }, llmConfig
      ? {
          configId: llmConfig.id,
          name: llmConfig.name,
          apiType: llmConfig.apiType || 'openai',
          apiUrl: llmConfig.apiUrl,
          apiKey: llmConfig.apiKey,
          modelName: llmConfig.modelName,
        }
      : null);
  }

  private async claimQueuedLocalRuntime(
    projectId: string,
    userId: string,
    provider: 'local-runner' | 'local-codex',
    memberId?: string,
  ) {
    await this.ensureProjectManager(projectId, userId);
    const members = await this.prisma.projectMember.findMany({
      where: {
        projectId,
        removedAt: null,
        ...(memberId ? { id: memberId } : {}),
      },
      select: { id: true, role: true, userId: true, permissions: true, joinedAt: true },
    });
    members.sort((left, right) => left.joinedAt.getTime() - right.joinedAt.getTime());
    let member = members.find((candidate) => {
      const session = this.readRuntimeSession(candidate.permissions);
      return Boolean(session && this.isLocalRuntimeClaimable(session, provider));
    });
    if (!member && memberId) {
      member = members.find((candidate) => {
        const session = this.readRuntimeSession(candidate.permissions);
        return session?.provider === provider;
      });
    }
    if (!member) {
      throw new NotFoundException(`No pending ${provider} launch job found for this project`);
    }

    const session = this.readRuntimeSession(member.permissions)!;
    const hadLocalRunnerJob = Boolean(session.localRunnerJob);
    const localRunnerJob = await this.ensureQueuedLocalRunnerJob(projectId, userId, member, provider, session);
    const claimedSession: AgentRuntimeSession = {
      ...session,
      status: 'STARTING',
      apiBaseUrl: '',
      containerId: null,
      dataDir: '',
      localRunnerJob,
      currentActivity: hadLocalRunnerJob
        ? provider === 'local-codex'
          ? 'Local Codex claimed the launch job'
          : 'Local runner claimed the launch job and is starting Docker'
        : provider === 'local-codex'
          ? 'Local Codex is reconnecting to this runtime'
          : 'Local runner is restarting Docker for this runtime',
      updatedAt: new Date().toISOString(),
    };
    await this.writeRuntimeSession(member.id, this.withLocalRunnerHeartbeat(claimedSession, claimedSession.updatedAt));

    return {
      projectId,
      memberId: member.id,
      role: member.role,
      job: localRunnerJob,
      session: this.sanitizeRuntimeSession(claimedSession),
    };
  }

  async reconnectAgentRuntime(projectId: string, memberId: string, userId: string) {
    await this.ensureProjectManager(projectId, userId);
    const member = await this.prisma.projectMember.findFirst({
      where: { id: memberId, projectId, removedAt: null },
      select: { id: true, role: true, userId: true, permissions: true },
    });
    if (!member) throw new NotFoundException('Project member not found');
    const session = this.readRuntimeSession(member.permissions);
    if (!session) throw new BadRequestException('This member does not have a launched runtime');

    if (this.isQueuedLocalRuntimeProvider(session.provider)) {
      return this.reconnectQueuedLocalRuntime(projectId, userId, member, session.provider, session);
    }
    if (session.provider === 'local-docker') {
      return this.reconnectLocalDockerRuntime(projectId, userId, member, session);
    }
    throw new BadRequestException('Only local agent runtimes can be reconnected');
  }

  private async reconnectQueuedLocalRuntime(
    projectId: string,
    userId: string,
    member: { id: string; role: string; userId: string; permissions?: any },
    provider: 'local-runner' | 'local-codex',
    session: AgentRuntimeSession,
  ) {
    const now = new Date().toISOString();
    const refreshedToken = await this.agentWorkspaceClient.mintAccessToken(session.grantId);
    const refreshedSession: AgentRuntimeSession = {
      ...session,
      workspaceToken: refreshedToken.token,
      localRunnerJob: undefined,
    };
    const localRunnerJob = await this.ensureQueuedLocalRunnerJob(projectId, userId, member, provider, refreshedSession);
    const providerLabel = provider === 'local-codex' ? 'Local Codex' : 'Local runner';
    const waitingStatus = provider === 'local-codex' ? 'WAITING_LOCAL_CODEX' : 'WAITING_LOCAL_RUNNER';
    const requests = (session.localRunnerBridge?.requests || []).map((request) => {
      if (!['PENDING', 'RUNNING'].includes(request.status)) return request;
      return {
        ...request,
        status: 'ERROR' as const,
        error: `${providerLabel} was reconnected before this request completed.`,
        completedAt: now,
        updatedAt: now,
      };
    });
    const updatedSession: AgentRuntimeSession = this.recoverOfflineLocalRunnerActiveRequest({
      ...refreshedSession,
      apiBaseUrl: '',
      containerId: provider === 'local-runner' ? null : session.containerId ?? null,
      status: waitingStatus,
      activeRequestId: null,
      activeRequestStartedAt: null,
      activeRequestConversationId: null,
      localRunnerJob,
      dockerStatus: { running: false, status: `waiting-${provider}`, localRunner: provider === 'local-runner', localCodex: provider === 'local-codex' },
      apiHealth: { ok: false, statusCode: 0, localRunner: provider === 'local-runner', localCodex: provider === 'local-codex' },
      currentActivity: `${providerLabel} is waiting for the local runner to reconnect.`,
      lastError: null,
      updatedAt: now,
      localRunnerBridge: {
        ...(session.localRunnerBridge || {}),
        requests: requests.slice(-20),
        disconnectedAt: now,
        disconnectReason: 'manual-reconnect',
        lastSeenAt: session.localRunnerBridge?.lastSeenAt || null,
      },
    });
    await this.writeRuntimeSession(member.id, updatedSession);
    this.publishAgentRuntimeSessionEvent(projectId, member.id, {
      type: 'session',
      role: member.role,
      message: `${providerLabel} runtime queued for reconnect`,
      session: this.sanitizeRuntimeSession(updatedSession),
    });
    return {
      projectId,
      memberId: member.id,
      role: member.role,
      session: this.sanitizeRuntimeSession(updatedSession),
    };
  }

  private async reconnectLocalDockerRuntime(
    projectId: string,
    userId: string,
    member: { id: string; role: string; userId: string; permissions?: any },
    session: AgentRuntimeSession,
  ) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { settings: true, budgetCurrency: true },
    });
    const projectGlobals = await this.resolveProjectGlobalVariables(projectId, project?.settings);
    const runtimeProjectGlobals = await this.visibleProjectGlobalsForRuntime(projectId, member, projectGlobals);
    const llmConfig = session.llm?.configId
      ? await this.apiConfigService.findOne(userId, session.llm.configId)
      : null;
    if (session.llm?.configId && !llmConfig) {
      throw new BadRequestException('Runtime model configuration is no longer available');
    }
    const refreshedToken = await this.agentWorkspaceClient.mintAccessToken(session.grantId);

    const relaunched = await this.agentRuntimeLauncher.launch({
      projectId,
      projectGithubUrl: this.getProjectGithubUrl(project?.settings),
      projectGlobals: runtimeProjectGlobals,
      memberId: member.id,
      userId: member.userId,
      role: member.role,
      agentType: session.agentType || this.defaultAgentRuntimeType(session),
      runtimeId: session.runtimeId,
      workspaceToken: refreshedToken.token,
      workspaceBaseUrl: this.agentWorkspaceClient.getConfiguredBaseUrl(),
      projectApiBaseUrl:
        this.configService.get<string>('HERMES_AGENT_PROJECT_API_BASE_URL') ||
        this.configService.get<string>('AIFACTORY_PUBLIC_API_BASE_URL') ||
        this.configService.get<string>('AIFACTORY_API_BASE_URL') ||
        undefined,
      grantId: session.grantId,
      scopes: session.scopes || [],
      skillBundleRefs: session.skillBundleRefs || [],
      projectSkillOverrides: session.projectSkillOverrides || [],
      capabilityBundleRefs: session.capabilityBundleRefs || [],
      capabilityBundles: session.capabilityBundles || [],
      runtimeFeatureSupport: session.runtimeFeatureSupport,
      runtimeCapabilityWarnings: session.runtimeCapabilityWarnings || [],
      rolePrompt: session.rolePrompt || null,
      repoWorkspaceDir: session.repoWorkspaceDir || '/opt/data/workspace',
      deploymentDays: session.deploymentDays ?? 1,
      dailyCostAmount: 0,
      budgetCurrency: session.budgetCurrency || project?.budgetCurrency || 'AIC',
      enableSudo: Boolean(session.enableSudo),
      llm: llmConfig
        ? {
            configId: llmConfig.id,
            name: llmConfig.name,
            apiType: llmConfig.apiType || 'openai',
            apiUrl: llmConfig.apiUrl,
            apiKey: llmConfig.apiKey,
            modelName: llmConfig.modelName,
          }
        : null,
      image: session.image,
      model: session.llm?.modelName || session.agentType || 'pi',
    });
    const updatedSession = this.normalizeRuntimeSessionConversations({
      ...relaunched,
      launchedAt: session.launchedAt || relaunched.launchedAt,
      activeConversationId: session.activeConversationId,
      conversations: session.conversations,
      messageHistory: session.messageHistory,
      pollingConfig: session.pollingConfig,
      pollingState: session.pollingState,
      lastMessageAt: session.lastMessageAt || null,
      lastResponseAt: session.lastResponseAt || null,
      lastError: null,
      recentActions: [],
      currentActivity: relaunched.currentActivity || 'Local Docker runtime is reconnecting',
      updatedAt: new Date().toISOString(),
    });
    await this.writeRuntimeSession(member.id, updatedSession);
    await this.agentWorkspaceClient.heartbeatRuntime(session.runtimeId, refreshedToken.token, {
      projectId,
      status: 'READY',
      message: `${member.role} local Docker runtime reconnected`,
    }).catch(() => null);
    this.publishAgentRuntimeSessionEvent(projectId, member.id, {
      type: 'session',
      role: member.role,
      message: 'Local Docker runtime reconnected',
      session: this.sanitizeRuntimeSession(updatedSession),
    });
    return {
      projectId,
      memberId: member.id,
      role: member.role,
      session: this.sanitizeRuntimeSession(updatedSession),
    };
  }

  async completeLocalRunnerAgentRuntime(
    projectId: string,
    memberId: string,
    userId: string,
    dto: {
      apiBaseUrl?: string;
      containerId?: string | null;
      dataDir?: string;
      image?: string;
      containerName?: string;
      status?: string;
      error?: string;
    },
  ) {
    return this.completeQueuedLocalRuntime(projectId, memberId, userId, 'local-runner', dto);
  }

  async completeLocalCodexAgentRuntime(
    projectId: string,
    memberId: string,
    userId: string,
    dto: {
      apiBaseUrl?: string;
      containerId?: string | null;
      dataDir?: string;
      image?: string;
      containerName?: string;
      status?: string;
      error?: string;
    },
  ) {
    return this.completeQueuedLocalRuntime(projectId, memberId, userId, 'local-codex', dto);
  }

  async disconnectLocalRunnerAgentRuntime(
    projectId: string,
    memberId: string,
    userId: string,
    dto: { reason?: string; message?: string } = {},
  ) {
    return this.disconnectQueuedLocalRuntime(projectId, memberId, userId, 'local-runner', dto);
  }

  async disconnectLocalCodexAgentRuntime(
    projectId: string,
    memberId: string,
    userId: string,
    dto: { reason?: string; message?: string } = {},
  ) {
    return this.disconnectQueuedLocalRuntime(projectId, memberId, userId, 'local-codex', dto);
  }

  private async disconnectQueuedLocalRuntime(
    projectId: string,
    memberId: string,
    userId: string,
    provider: 'local-runner' | 'local-codex',
    dto: { reason?: string; message?: string } = {},
  ) {
    await this.ensureProjectManager(projectId, userId);
    const member = await this.prisma.projectMember.findFirst({
      where: { id: memberId, projectId },
      select: { id: true, role: true, permissions: true, removedAt: true },
    });
    if (!member) {
      return {
        projectId,
        memberId,
        role: null,
        session: null,
      };
    }
    if (member.removedAt) {
      return {
        projectId,
        memberId: member.id,
        role: member.role,
        session: null,
      };
    }
    const session = this.readRuntimeSession(member.permissions);
    if (!session || session.provider !== provider) {
      return {
        projectId,
        memberId: member.id,
        role: member.role,
        session: session ? this.sanitizeRuntimeSession(session) : null,
      };
    }

    const now = new Date().toISOString();
    const providerLabel = provider === 'local-codex' ? 'Local Codex' : 'Local runner';
    const waitingStatus = provider === 'local-codex' ? 'WAITING_LOCAL_CODEX' : 'WAITING_LOCAL_RUNNER';
    const reason = String(dto.reason || 'runner-disconnected').slice(0, 120);
    const message = String(dto.message || `${providerLabel} disconnected. Restart the project runner to reconnect this runtime.`).slice(0, 1000);
    const requests = (session.localRunnerBridge?.requests || []).map((request) => {
      if (!['PENDING', 'RUNNING'].includes(request.status)) return request;
      return {
        ...request,
        status: 'ERROR' as const,
        error: message,
        completedAt: now,
        updatedAt: now,
      };
    });
    const updatedSession: AgentRuntimeSession = {
      ...session,
      apiBaseUrl: '',
      containerId: provider === 'local-runner' ? null : session.containerId ?? null,
      status: waitingStatus,
      activeRequestId: session.activeRequestId,
      currentActivity: message,
      lastError: message,
      updatedAt: now,
      localRunnerBridge: {
        ...(session.localRunnerBridge || {}),
        requests: requests.slice(-20),
        disconnectedAt: now,
        disconnectReason: reason,
        lastSeenAt: session.localRunnerBridge?.lastSeenAt || now,
      },
    };
    const recoveredSession = this.recoverOfflineLocalRunnerActiveRequest(updatedSession);
    await this.writeRuntimeSession(member.id, recoveredSession);
    this.publishAgentRuntimeSessionEvent(projectId, member.id, {
      type: 'session',
      role: member.role,
      message,
      session: this.sanitizeRuntimeSession(recoveredSession),
    });

    return {
      projectId,
      memberId: member.id,
      role: member.role,
      session: this.sanitizeRuntimeSession(recoveredSession),
    };
  }

  private async completeQueuedLocalRuntime(
    projectId: string,
    memberId: string,
    userId: string,
    provider: 'local-runner' | 'local-codex',
    dto: {
      apiBaseUrl?: string;
      containerId?: string | null;
      dataDir?: string;
      image?: string;
      containerName?: string;
      status?: string;
      error?: string;
    },
  ) {
    await this.ensureProjectManager(projectId, userId);
    const member = await this.prisma.projectMember.findFirst({
      where: { id: memberId, projectId, removedAt: null },
      select: { id: true, role: true, userId: true, permissions: true },
    });
    if (!member) throw new NotFoundException('Project member not found');
    const session = this.readRuntimeSession(member.permissions);
    if (!session || session.provider !== provider) {
      throw new BadRequestException(`This member does not have a ${provider} runtime job`);
    }

    const now = new Date().toISOString();
    const failed = dto.status === 'ERROR' || Boolean(dto.error);
    const connectedLocalCodex = !failed && provider === 'local-codex';
    const completedSession: AgentRuntimeSession = {
      ...session,
      image: dto.image || session.image,
      containerName: dto.containerName || session.containerName,
      containerId: dto.containerId ?? session.containerId ?? null,
      apiBaseUrl: dto.apiBaseUrl || session.apiBaseUrl,
      dataDir: dto.dataDir || session.dataDir,
      status: failed ? 'ERROR' : connectedLocalCodex ? 'IDLE' : 'STARTING',
      currentActivity: failed
        ? provider === 'local-codex'
          ? 'Local Codex failed to connect'
          : 'Local runner failed to start Docker'
        : provider === 'local-codex'
          ? 'Local Codex connected'
          : 'Local runner started Docker; waiting for runtime health',
      lastError: dto.error || null,
      dockerStatus: connectedLocalCodex
        ? { running: true, status: 'runner-connected', localRunner: false, localCodex: true }
        : session.dockerStatus,
      apiHealth: connectedLocalCodex
        ? { ok: true, statusCode: 200, localRunner: false, localCodex: true }
        : session.apiHealth,
      updatedAt: now,
      localRunnerJob: undefined,
    };
    await this.writeRuntimeSession(member.id, this.withLocalRunnerHeartbeat(completedSession, now));
    if (!failed) {
      await this.agentWorkspaceClient.heartbeatRuntime(session.runtimeId, session.workspaceToken, {
        projectId,
        status: 'READY',
        message: provider === 'local-codex'
          ? `${member.role} Codex runtime connected by local Codex`
          : `${member.role} Hermes runtime started by local runner`,
      }).catch(() => null);
    }

    return {
      projectId,
      memberId: member.id,
      role: member.role,
      session: this.sanitizeRuntimeSession(completedSession),
    };
  }

  async createLocalRunnerToken(projectId: string, userId: string, dto: { name?: string } = {}) {
    await this.ensureProjectManager(projectId, userId);
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { settings: true },
    });
    if (!project) throw new NotFoundException('Project not found');

    const now = new Date().toISOString();
    const token = `acr_${randomBytes(32).toString('base64url')}`;
    const tokenRecord: LocalRunnerTokenRecord = {
      id: randomUUID(),
      name: dto.name?.trim() || 'Local runner',
      tokenHash: this.localRunnerTokenHash(token),
      createdAt: now,
      createdByUserId: userId,
      lastUsedAt: null,
      revokedAt: null,
    };
    const settings = this.mergeProjectSettings(project.settings, { settings: {} });
    settings.localRunnerTokens = [
      ...this.localRunnerTokensFromSettings(project.settings).filter((record) => !record.revokedAt).slice(-9),
      tokenRecord,
    ];
    await this.prisma.project.update({
      where: { id: projectId },
      data: { settings },
    });

    return {
      projectId,
      token,
      tokenId: tokenRecord.id,
      name: tokenRecord.name,
      createdAt: tokenRecord.createdAt,
    };
  }

  async createAccountLocalRunnerToken(userId: string, dto: { name?: string } = {}) {
    const now = new Date().toISOString();
    const tokenId = randomUUID();
    const token = `acu_${tokenId}.${randomBytes(32).toString('base64url')}`;
    const tokenRecord: LocalRunnerTokenRecord = {
      id: tokenId,
      name: dto.name?.trim() || 'Local runner device',
      tokenHash: this.localRunnerTokenHash(token),
      createdAt: now,
      createdByUserId: userId,
      lastUsedAt: null,
      revokedAt: null,
    };
    await this.prisma.systemConfig.upsert({
      where: { key: this.accountLocalRunnerTokenKey(tokenId) },
      update: { value: tokenRecord },
      create: {
        key: this.accountLocalRunnerTokenKey(tokenId),
        value: tokenRecord,
      },
    });
    return {
      token,
      tokenId,
      name: tokenRecord.name,
      createdAt: tokenRecord.createdAt,
    };
  }

  async authenticateAccountLocalRunnerToken(rawToken: string | null | undefined) {
    const token = String(rawToken || '').trim();
    const match = /^acu_([0-9a-f-]{36})\./i.exec(token);
    if (!match) {
      throw new UnauthorizedException('Invalid local runner token');
    }
    const tokenId = match[1];
    const config = await this.prisma.systemConfig.findUnique({
      where: { key: this.accountLocalRunnerTokenKey(tokenId) },
      select: { value: true },
    });
    const tokenRecord = config?.value && typeof config.value === 'object' && !Array.isArray(config.value)
      ? config.value as any
      : null;
    if (
      !tokenRecord ||
      tokenRecord.revokedAt ||
      typeof tokenRecord.tokenHash !== 'string' ||
      tokenRecord.tokenHash !== this.localRunnerTokenHash(token) ||
      typeof tokenRecord.createdByUserId !== 'string'
    ) {
      throw new UnauthorizedException('Invalid local runner token');
    }
    return {
      userId: tokenRecord.createdByUserId,
      tokenId,
      name: typeof tokenRecord.name === 'string' && tokenRecord.name.trim() ? tokenRecord.name.trim() : 'Local runner device',
      accountScoped: true,
    };
  }

  async authenticateLocalRunnerToken(projectId: string, rawToken: string | null | undefined) {
    const token = String(rawToken || '').trim();
    if (token.startsWith('acu_')) {
      const runner = await this.authenticateAccountLocalRunnerToken(token);
      await this.ensureProjectManager(projectId, runner.userId);
      return {
        projectId,
        userId: runner.userId,
        tokenId: runner.tokenId,
        name: runner.name,
        accountScoped: true,
      };
    }
    if (!token.startsWith('acr_')) {
      throw new UnauthorizedException('Invalid local runner token');
    }
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, deletedAt: null },
      select: { id: true, settings: true },
    });
    if (!project) throw new UnauthorizedException('Invalid local runner token');
    const tokenHash = this.localRunnerTokenHash(token);
    const tokenRecord = this.localRunnerTokensFromSettings(project.settings)
      .find((record) => !record.revokedAt && record.tokenHash === tokenHash);
    if (!tokenRecord) {
      throw new UnauthorizedException('Invalid local runner token');
    }
    return {
      projectId,
      userId: tokenRecord.createdByUserId,
      tokenId: tokenRecord.id,
      name: tokenRecord.name,
      accountScoped: false,
    };
  }

  async claimLocalRunnerAgentRuntimeForAccount(userId: string) {
    return this.claimQueuedLocalRuntimeForAccount(userId, 'local-runner');
  }

  async claimLocalCodexAgentRuntimeForAccount(userId: string) {
    return this.claimQueuedLocalRuntimeForAccount(userId, 'local-codex');
  }

  private async claimQueuedLocalRuntimeForAccount(userId: string, provider: LocalRunnerProvider) {
    const projects = await this.prisma.project.findMany({
      where: {
        deletedAt: null,
        OR: [
          { ownerId: userId },
          { leadAgentUserId: userId },
        ],
      },
      select: { id: true },
    });

    for (const project of projects) {
      const members = await this.prisma.projectMember.findMany({
        where: {
          projectId: project.id,
          removedAt: null,
        },
        select: {
          id: true,
          projectId: true,
          permissions: true,
          joinedAt: true,
        },
      });
      members.sort((left, right) => left.joinedAt.getTime() - right.joinedAt.getTime());
      const candidate = members.find((member) => {
        const session = this.readRuntimeSession(member.permissions);
        return Boolean(session && this.isLocalRuntimeClaimable(session, provider));
      });
      if (candidate) {
        return this.claimQueuedLocalRuntime(candidate.projectId, userId, provider, candidate.id);
      }
    }
    throw new NotFoundException(`No pending ${provider} launch job found for this account`);
  }

  async heartbeatProjectLocalRunner(
    projectId: string,
    userId: string,
    provider: LocalRunnerProvider,
    dto: { name?: string; platform?: string; version?: string } = {},
    tokenId?: string | null,
    tokenName?: string | null,
  ) {
    await this.ensureProjectManager(projectId, userId);
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { settings: true },
    });
    if (!project) throw new NotFoundException('Project not found');

    const now = new Date().toISOString();
    const presenceId = tokenId ? `${provider}:${tokenId}` : `${provider}:user:${userId}`;
    const existing = this.localRunnerPresencesFromSettings(project.settings).find((presence) => presence.id === presenceId);
    const name = String(dto.name || tokenName || (provider === 'local-codex' ? 'Local Codex runner' : 'Local Docker runner')).trim();
    const presence: ProjectLocalRunnerPresenceRecord = {
      id: presenceId,
      provider,
      name: name || (provider === 'local-codex' ? 'Local Codex runner' : 'Local Docker runner'),
      userId,
      tokenId: tokenId || null,
      startedAt: existing?.startedAt || now,
      lastSeenAt: now,
      disconnectedAt: null,
      disconnectReason: null,
      platform: typeof dto.platform === 'string' && dto.platform.trim() ? dto.platform.trim().slice(0, 120) : existing?.platform || null,
      version: typeof dto.version === 'string' && dto.version.trim() ? dto.version.trim().slice(0, 80) : existing?.version || null,
    };
    const staleCutoff = Date.now() - 24 * 60 * 60 * 1000;
    const presences = this.localRunnerPresencesFromSettings(project.settings)
      .filter((record) => record.id !== presenceId)
      .filter((record) => {
        const lastSeenMs = Date.parse(record.lastSeenAt);
        return Number.isFinite(lastSeenMs) && lastSeenMs >= staleCutoff;
      });
    const settings = this.mergeProjectSettings(project.settings, { settings: {} });
    settings.localRunnerPresences = [...presences, presence].slice(-20);
    if (tokenId) {
      settings.localRunnerTokens = this.localRunnerTokensFromSettings(project.settings).map((record) =>
        record.id === tokenId ? { ...record, lastUsedAt: now } : record,
      );
    }
    await this.prisma.project.update({
      where: { id: projectId },
      data: { settings },
    });

    return {
      projectId,
      runner: this.sanitizeProjectLocalRunnerPresence(presence),
    };
  }

  async disconnectProjectLocalRunner(
    projectId: string,
    userId: string,
    provider: LocalRunnerProvider,
    dto: { reason?: string; name?: string; platform?: string; version?: string } = {},
    tokenId?: string | null,
    tokenName?: string | null,
  ) {
    await this.ensureProjectManager(projectId, userId);
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { settings: true },
    });
    if (!project) throw new NotFoundException('Project not found');

    const now = new Date().toISOString();
    const presenceId = tokenId ? `${provider}:${tokenId}` : `${provider}:user:${userId}`;
    const existing = this.localRunnerPresencesFromSettings(project.settings).find((presence) => presence.id === presenceId);
    const name = String(dto.name || tokenName || existing?.name || (provider === 'local-codex' ? 'Local Codex runner' : 'Local Docker runner')).trim();
    const presence: ProjectLocalRunnerPresenceRecord = {
      id: presenceId,
      provider,
      name: name || (provider === 'local-codex' ? 'Local Codex runner' : 'Local Docker runner'),
      userId,
      tokenId: tokenId || null,
      startedAt: existing?.startedAt || now,
      lastSeenAt: existing?.lastSeenAt || now,
      disconnectedAt: now,
      disconnectReason: String(dto.reason || 'runner-disconnected').slice(0, 120),
      platform: typeof dto.platform === 'string' && dto.platform.trim() ? dto.platform.trim().slice(0, 120) : existing?.platform || null,
      version: typeof dto.version === 'string' && dto.version.trim() ? dto.version.trim().slice(0, 80) : existing?.version || null,
    };
    const settings = this.mergeProjectSettings(project.settings, { settings: {} });
    settings.localRunnerPresences = [
      ...this.localRunnerPresencesFromSettings(project.settings).filter((record) => record.id !== presenceId),
      presence,
    ].slice(-20);
    if (tokenId) {
      settings.localRunnerTokens = this.localRunnerTokensFromSettings(project.settings).map((record) =>
        record.id === tokenId ? { ...record, lastUsedAt: now } : record,
      );
    }
    await this.prisma.project.update({
      where: { id: projectId },
      data: { settings },
    });

    return {
      projectId,
      runner: this.sanitizeProjectLocalRunnerPresence(presence),
    };
  }

  async heartbeatAccountLocalRunner(
    userId: string,
    provider: LocalRunnerProvider,
    dto: { name?: string; platform?: string; version?: string } = {},
    tokenId?: string | null,
    tokenName?: string | null,
  ) {
    const now = new Date().toISOString();
    const settings = await this.readAccountLocalRunnerSettings(userId);
    const presenceId = tokenId ? `${provider}:${tokenId}` : `${provider}:user:${userId}`;
    const existing = settings.presences.find((presence) => presence.id === presenceId);
    const name = String(dto.name || tokenName || (provider === 'local-codex' ? 'Local Codex runner' : 'Local Docker runner')).trim();
    const presence: ProjectLocalRunnerPresenceRecord = {
      id: presenceId,
      provider,
      name: name || (provider === 'local-codex' ? 'Local Codex runner' : 'Local Docker runner'),
      userId,
      tokenId: tokenId || null,
      startedAt: existing?.startedAt || now,
      lastSeenAt: now,
      disconnectedAt: null,
      disconnectReason: null,
      platform: typeof dto.platform === 'string' && dto.platform.trim() ? dto.platform.trim().slice(0, 120) : existing?.platform || null,
      version: typeof dto.version === 'string' && dto.version.trim() ? dto.version.trim().slice(0, 80) : existing?.version || null,
    };
    const staleCutoff = Date.now() - 24 * 60 * 60 * 1000;
    const presences = settings.presences
      .filter((record) => record.id !== presenceId)
      .filter((record) => {
        const lastSeenMs = Date.parse(record.lastSeenAt);
        return Number.isFinite(lastSeenMs) && lastSeenMs >= staleCutoff;
      });
    await this.writeAccountLocalRunnerSettings(userId, { presences: [...presences, presence].slice(-20) });
    if (tokenId) {
      await this.updateAccountLocalRunnerTokenLastUsed(tokenId, now);
    }
    return {
      runner: this.sanitizeProjectLocalRunnerPresence(presence, 'account'),
    };
  }

  async disconnectAccountLocalRunner(
    userId: string,
    provider: LocalRunnerProvider,
    dto: { reason?: string; name?: string; platform?: string; version?: string } = {},
    tokenId?: string | null,
    tokenName?: string | null,
  ) {
    const now = new Date().toISOString();
    const settings = await this.readAccountLocalRunnerSettings(userId);
    const presenceId = tokenId ? `${provider}:${tokenId}` : `${provider}:user:${userId}`;
    const existing = settings.presences.find((presence) => presence.id === presenceId);
    const name = String(dto.name || tokenName || existing?.name || (provider === 'local-codex' ? 'Local Codex runner' : 'Local Docker runner')).trim();
    const presence: ProjectLocalRunnerPresenceRecord = {
      id: presenceId,
      provider,
      name: name || (provider === 'local-codex' ? 'Local Codex runner' : 'Local Docker runner'),
      userId,
      tokenId: tokenId || null,
      startedAt: existing?.startedAt || now,
      lastSeenAt: existing?.lastSeenAt || now,
      disconnectedAt: now,
      disconnectReason: String(dto.reason || 'runner-disconnected').slice(0, 120),
      platform: typeof dto.platform === 'string' && dto.platform.trim() ? dto.platform.trim().slice(0, 120) : existing?.platform || null,
      version: typeof dto.version === 'string' && dto.version.trim() ? dto.version.trim().slice(0, 80) : existing?.version || null,
    };
    await this.writeAccountLocalRunnerSettings(userId, {
      presences: [
        ...settings.presences.filter((record) => record.id !== presenceId),
        presence,
      ].slice(-20),
    });
    if (tokenId) {
      await this.updateAccountLocalRunnerTokenLastUsed(tokenId, now);
    }
    return {
      runner: this.sanitizeProjectLocalRunnerPresence(presence, 'account'),
    };
  }

  private async updateAccountLocalRunnerTokenLastUsed(tokenId: string, now: string) {
    const key = this.accountLocalRunnerTokenKey(tokenId);
    const config = await this.prisma.systemConfig.findUnique({
      where: { key },
      select: { value: true },
    });
    const value = config?.value && typeof config.value === 'object' && !Array.isArray(config.value)
      ? { ...(config.value as any), lastUsedAt: now }
      : null;
    if (!value) return;
    await this.prisma.systemConfig.update({
      where: { key },
      data: { value },
    }).catch(() => null);
  }

  private decodeRuntimeAccessToken(rawToken: string) {
    const parts = String(rawToken || '').split('.');
    if (parts.length < 2) {
      throw new UnauthorizedException('Invalid runtime token');
    }
    try {
      return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as {
        projectId?: string;
        runtimeId?: string;
        memberId?: string;
        grantId?: string;
        scopes?: string[];
      };
    } catch {
      throw new UnauthorizedException('Invalid runtime token');
    }
  }

  private async authenticateProjectRuntimeToken(
    projectId: string,
    rawToken: string,
    requiredScopes: string[] = [],
  ) {
    const token = String(rawToken || '').trim();
    const payload = this.decodeRuntimeAccessToken(token);
    if (payload.projectId !== projectId || !payload.runtimeId || !payload.memberId) {
      throw new UnauthorizedException('Runtime token is not valid for this project');
    }
    const scopes = Array.isArray(payload.scopes) ? payload.scopes : [];
    const missingScope = requiredScopes.find((scope) => !scopes.includes(scope));
    if (missingScope) {
      throw new ForbiddenException(`Runtime token is missing required scope: ${missingScope}`);
    }

    await this.agentWorkspaceClient.resumeRuntime(payload.runtimeId, token, projectId).catch(() => {
      throw new UnauthorizedException('Runtime token could not be verified');
    });

    const member = await this.prisma.projectMember.findFirst({
      where: {
        id: payload.memberId,
        projectId,
        removedAt: null,
      },
      select: { id: true, userId: true, role: true, permissions: true },
    });
    if (!member) {
      throw new UnauthorizedException('Runtime member is not active in this project');
    }
    const session = this.readRuntimeSession(member.permissions);
    if (session?.runtimeId && session.runtimeId !== payload.runtimeId) {
      throw new UnauthorizedException('Runtime token does not match the active member runtime');
    }

    return {
      projectId,
      memberId: member.id,
      userId: member.userId,
      role: member.role,
      runtimeId: payload.runtimeId,
      token,
      scopes,
      session,
    };
  }

  async listAssignmentRuntimeStateFromRuntime(
    projectId: string,
    rawToken: string,
    options: { workItemId?: string; status?: string; limit?: number; summary?: boolean } = {},
  ) {
    const runtime = await this.authenticateProjectRuntimeToken(projectId, rawToken, ['PROJECT_MEMBER_READ']);
    if (runtime.role !== 'LEAD_AGENT') {
      throw new ForbiddenException('Only a LEAD_AGENT runtime can inspect project assignment runtime state');
    }

    return this.listAssignmentRuntimeStateRows(projectId, options);
  }

  async listAssignmentRuntimeStateForOwner(
    projectId: string,
    userId: string,
    options: { workItemId?: string; status?: string; limit?: number; summary?: boolean } = {},
  ) {
    await this.ensureProjectAccess(projectId, userId);
    return this.listAssignmentRuntimeStateRows(projectId, options);
  }

  private async listAssignmentRuntimeStateRows(
    projectId: string,
    options: { workItemId?: string; status?: string; limit?: number; summary?: boolean } = {},
  ) {
    await this.recoverProjectRuntimeSessions(projectId).catch((error: any) => {
      this.logger.warn(`Failed to reconcile runtime sessions for ${projectId}: ${error?.message || error}`);
    });
    const limit = Math.min(Math.max(Math.floor(Number(options.limit || 80)) || 80, 1), 100);
    const statuses = String(options.status || '')
      .split(',')
      .map((status) => status.trim().toUpperCase())
      .filter(Boolean);
    const where: Prisma.ProjectAssignmentWhereInput = {
      projectId,
      ...(options.workItemId ? { workItemId: options.workItemId } : {}),
      ...(statuses.length ? { status: { in: statuses as any } } : {}),
    };

    const assignments = await this.prisma.projectAssignment.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: limit,
      include: {
        assigneeUser: { select: { id: true, email: true, displayName: true, role: true } },
        assignedByUser: { select: { id: true, email: true, displayName: true, role: true } },
        workItem: {
          select: {
            id: true,
            title: true,
            status: true,
            workType: true,
            goalId: true,
            featureId: true,
            ownerId: true,
            updatedAt: true,
          },
        },
      },
    });

    const rows = await Promise.all(assignments.map(async (assignment) => {
      const runtimeState = await this.assignmentAssigneeRuntimeState(projectId, assignment);
      const session = runtimeState.session
        ? (options.summary ? this.compactRuntimeSession(runtimeState.session) : this.sanitizeRuntimeSession(runtimeState.session))
        : null;
      const contextPacket =
        assignment.contextPacket && typeof assignment.contextPacket === 'object' && !Array.isArray(assignment.contextPacket)
          ? assignment.contextPacket as Record<string, any>
          : {};
      const openAssignment = ['PROPOSED', 'ACTIVE', 'PAUSED'].includes(String(assignment.status));
      const terminalWorkItem = this.isTerminalWorkItemStatus(assignment.workItem?.status);
      const staleReasons = [
        ...(openAssignment && !runtimeState.available ? ['runtime_unavailable'] : []),
        ...(openAssignment && terminalWorkItem ? ['work_item_terminal'] : []),
        ...this.openAssignmentIdleRuntimeStaleReasons(assignment, runtimeState),
      ];
      return {
        id: assignment.id,
        projectId: assignment.projectId,
        workItemId: assignment.workItemId,
        role: assignment.role,
        status: assignment.status,
        objective: assignment.objective || null,
        startedAt: assignment.startedAt,
        finishedAt: assignment.finishedAt,
        createdAt: assignment.createdAt,
        updatedAt: assignment.updatedAt,
        workItem: assignment.workItem ? {
          id: assignment.workItem.id,
          title: assignment.workItem.title,
          status: assignment.workItem.status,
          workType: assignment.workItem.workType,
          goalId: assignment.workItem.goalId,
          featureId: assignment.workItem.featureId,
          ownerId: assignment.workItem.ownerId,
          updatedAt: assignment.workItem.updatedAt,
        } : null,
        assigneeUser: assignment.assigneeUser ? {
          id: assignment.assigneeUser.id,
          email: assignment.assigneeUser.email,
          displayName: assignment.assigneeUser.displayName,
          role: assignment.assigneeUser.role,
        } : null,
        assignedByUser: assignment.assignedByUser ? {
          id: assignment.assignedByUser.id,
          email: assignment.assignedByUser.email,
          displayName: assignment.assignedByUser.displayName,
          role: assignment.assignedByUser.role,
        } : null,
        assigneeRuntime: {
          available: runtimeState.available,
          memberId: runtimeState.memberId,
          session,
          workspaceListEndpoint: runtimeState.memberId
            ? `/api/public/projects/${projectId}/agent-runtimes/${runtimeState.memberId}/workspace?maxDepth=4`
            : null,
        },
        failureContext: contextPacket.localRunnerFailure || null,
        staleDispatch: contextPacket.staleDispatch || null,
        dispatchFailure: contextPacket.dispatchFailure || null,
        health: {
          stale: staleReasons.length > 0,
          staleReasons,
        },
      };
    }));

    return {
      projectId,
      limit,
      count: rows.length,
      statusCounts: this.countByStatus(rows),
      assignments: rows,
      data: rows,
    };
  }

  private compactRuntimeSession(session: AgentRuntimeSession) {
    const dockerStatus = session.dockerStatus && typeof session.dockerStatus === 'object' && !Array.isArray(session.dockerStatus)
      ? session.dockerStatus as Record<string, any>
      : null;
    return {
      runtimeId: session.runtimeId || null,
      role: session.role || null,
      status: session.status || null,
      provider: session.provider || null,
      agentType: session.agentType || null,
      image: session.image || null,
      apiHealth: session.apiHealth || null,
      lastError: session.lastError || null,
      activeRequestId: session.activeRequestId || null,
      activeRequestConversationId: session.activeRequestConversationId || null,
      updatedAt: session.updatedAt || null,
      launchedAt: session.launchedAt || null,
      lastMessageAt: session.lastMessageAt || null,
      lastResponseAt: session.lastResponseAt || null,
      containerName: session.containerName || null,
      pollingConfig: session.pollingConfig || null,
      pollingState: session.pollingState || null,
      dockerStatus: dockerStatus
        ? {
            running: dockerStatus.running ?? null,
            status: dockerStatus.status ?? null,
            exitCode: dockerStatus.exitCode ?? null,
            error: dockerStatus.error ?? null,
            startedAt: dockerStatus.startedAt ?? null,
            finishedAt: dockerStatus.finishedAt ?? null,
          }
        : null,
      polling: session.pollingConfig || session.pollingState
        ? {
            config: session.pollingConfig || null,
            state: session.pollingState || null,
          }
        : null,
    };
  }

  private async recoverProjectRuntimeSessions(projectId: string) {
    const prismaAny = this.prisma as any;
    if (!prismaAny.projectMember?.findMany) return { recovered: 0 };

    const members = await this.prisma.projectMember.findMany({
      where: { projectId, removedAt: null },
      select: { id: true, permissions: true },
    });
    let recovered = 0;
    await Promise.all(members.map(async (member) => {
      const session = this.readRuntimeSession(member.permissions);
      if (!session) return;
      const nextSession = this.recoverPersistedRuntimeSession(session);
      if (nextSession === session) return;
      recovered += 1;
      await this.writeRuntimeSession(member.id, nextSession);
    }));
    return { recovered };
  }

  private async reconcileStaleOpenAssignments(
    projectId: string,
    actorUserId: string,
    statusFlow: ResolvedProjectWorkItemStatusFlow,
    options: { source?: string; limit?: number } = {},
  ) {
    const prismaAny = this.prisma as any;
    if (!prismaAny.projectAssignment?.findMany) return [];
    const assignments = await this.prisma.projectAssignment.findMany({
      where: {
        projectId,
        status: { in: ['PROPOSED', 'ACTIVE', 'PAUSED'] as any },
      },
      orderBy: { updatedAt: 'asc' },
      take: Math.min(Math.max(Math.floor(Number(options.limit || 100)) || 100, 1), 250),
      include: {
        workItem: {
          select: {
            id: true,
            title: true,
            status: true,
            workType: true,
          },
        },
      },
    });
    const reconciled: any[] = [];
    const now = new Date();
    for (const assignment of assignments) {
      const runtimeState = await this.assignmentAssigneeRuntimeState(projectId, assignment).catch((error: any) => {
        this.logger.warn(`Failed to inspect assignment runtime ${assignment.id}: ${error?.message || error}`);
        return { available: false, memberId: null as string | null, session: null as AgentRuntimeSession | null };
      });
      const terminalWorkItem = this.isTerminalWorkItemStatus(assignment.workItem?.status);
      const staleReasons = [
        ...(!runtimeState.available ? ['runtime_unavailable'] : []),
        ...(terminalWorkItem ? ['work_item_terminal'] : []),
        ...this.openAssignmentIdleRuntimeStaleReasons(assignment, runtimeState, now.getTime()),
      ];
      if (!staleReasons.length) continue;

      const contextPacket =
        assignment.contextPacket && typeof assignment.contextPacket === 'object' && !Array.isArray(assignment.contextPacket)
          ? assignment.contextPacket as Record<string, any>
          : {};
      await this.prisma.projectAssignment.update({
        where: { id: assignment.id },
        data: {
          status: 'FAILED',
          finishedAt: now,
          contextPacket: {
            ...contextPacket,
            staleDispatch: {
              reason: staleReasons.join(','),
              source: options.source || 'coordinator-reconcile',
              failedAt: now.toISOString(),
              runtimeMemberId: runtimeState.memberId || null,
              runtimeStatus: runtimeState.session?.status || null,
            },
          } as any,
        },
      });

      if (assignment.workItem && !terminalWorkItem) {
        const remainingOpenAssignments = await this.prisma.projectAssignment.count({
          where: {
            projectId,
            workItemId: assignment.workItem.id,
            status: { in: ['PROPOSED', 'ACTIVE', 'PAUSED'] as any },
          },
        });
        if (remainingOpenAssignments === 0) {
          await this.prisma.projectWorkItem.update({
            where: { id: assignment.workItem.id },
            data: { status: statusFlow.assignmentFailedStatus as any },
          }).catch(() => null);
        }
      }

      const row = {
        assignmentId: assignment.id,
        workItemId: assignment.workItemId,
        workItemTitle: assignment.workItem?.title || null,
        role: assignment.role,
        assigneeUserId: assignment.assigneeUserId,
        staleReasons,
      };
      reconciled.push(row);
      await this.recordCoordinatorEvent(
        projectId,
        actorUserId,
        'COORDINATOR_RECONCILED_STALE_ASSIGNMENT',
        {
          message: `Marked stale ${assignment.role} assignment failed: ${staleReasons.join(', ')}`,
          ...row,
          source: options.source || 'coordinator-reconcile',
        },
        assignment.workItemId ? { refType: 'WORK_ITEM', refId: assignment.workItemId } : undefined,
      );
    }
    return reconciled;
  }

  async launchAgentRuntimeFromRuntime(projectId: string, rawToken: string, dto: any = {}) {
    const runtime = await this.authenticateProjectRuntimeToken(projectId, rawToken, ['ASSIGNMENT_DISPATCH']);
    const managerProject = await this.ensureProjectManager(projectId, runtime.userId);
    if (runtime.role !== 'LEAD_AGENT') {
      throw new ForbiddenException('Only a LEAD_AGENT runtime can launch project agent runtimes');
    }

    const role = String(dto.role || '').trim();
    const launchableRoles = await this.listLaunchableRoleSummaries(managerProject.settings);
    if (!launchableRoles.some((entry) => entry.role === role)) {
      throw new BadRequestException(`Runtime launch role must be one of: ${launchableRoles.map((entry) => entry.role).join(', ')}`);
    }
    if (role === 'LEAD_AGENT') {
      throw new BadRequestException('Lead runtimes must not launch another lead through the runtime launch endpoint');
    }

    const agentType = this.preferredSubAgentRuntimeType(role, managerProject.settings, runtime.session, dto);
    const launchMode =
      this.effectiveAgentRuntimeLaunchMode(dto.launchMode, runtime.session) ||
      this.defaultAgentRuntimeLaunchMode(runtime.session);
    const llmConfigId = await this.resolveRuntimeLaunchLlmConfigId(managerProject.ownerId, launchMode, agentType, [
      dto.llmConfigId,
      runtime.session?.llm?.configId,
    ]);
    if (!llmConfigId && !this.canLaunchWithoutModelConfig(launchMode, agentType)) {
      throw new BadRequestException('No model configuration is available for runtime-launched agents');
    }

    return this.launchAgentRuntime(projectId, managerProject.ownerId, {
      role,
      memberId: typeof dto.memberId === 'string' ? dto.memberId : undefined,
      ...(llmConfigId ? { llmConfigId } : {}),
      image: typeof dto.image === 'string' && dto.image.trim() ? dto.image.trim() : runtime.session?.image,
      model: typeof dto.model === 'string' ? dto.model : undefined,
      agentType,
      launchMode,
      deploymentDays: Math.max(1, Math.floor(Number(dto.deploymentDays) || 1)),
      enableSudo: Boolean(dto.enableSudo ?? runtime.session?.enableSudo),
      launcherUserId: runtime.userId,
      launcherMemberId: runtime.memberId,
      launcherRole: runtime.role,
      launcherRuntimeId: runtime.runtimeId,
      launchSource: 'runtime',
    });
  }

  async createGoalFromRuntime(projectId: string, rawToken: string, dto: CreateProjectGoalDto) {
    const runtime = await this.authenticateProjectRuntimeToken(projectId, rawToken, ['GOAL_CREATE']);
    if (!['LEAD_AGENT', 'PLANNER_AGENT', 'OWNER'].includes(runtime.role)) {
      throw new ForbiddenException('Only a lead, planner, or owner runtime can create project goals');
    }
    const project = await this.ensureProjectAccess(projectId, runtime.userId);
    const title = typeof dto?.title === 'string' ? dto.title.trim() : '';
    if (!title) {
      throw new BadRequestException('Goal title is required');
    }
    const description = typeof dto?.description === 'string' ? dto.description.trim() : dto?.description;
    if (
      this.isHackerOneOpportunityResearchSettings((project as any)?.settings) &&
      this.isGenericHackerOneOpportunityDiscoveryGoal({ title, description })
    ) {
      const unfinishedGoalCount = await this.prisma.projectGoal.count({
        where: {
          projectId,
          status: { in: ['OPEN', 'IN_PROGRESS', 'BLOCKED'] as any },
        },
      });
      if (unfinishedGoalCount > 0) {
        throw new BadRequestException(
          'HackerOne generic opportunity discovery goals are not created while unfinished goals exist; advance existing goals first.',
        );
      }
    }
    const programUrl =
      typeof description === 'string'
        ? description.match(/https:\/\/hackerone\.com\/[A-Za-z0-9_-]+(?:\?type=team)?/i)?.[0]
        : undefined;
    const normalizedTitle = title.toLowerCase().replace(/\s+/g, ' ');
    const duplicateCandidates = await this.prisma.projectGoal.findMany({
      where: {
        projectId,
        status: { not: 'CANCELLED' as any },
        OR: [
          { title },
          ...(programUrl ? [{ description: { contains: programUrl } }] : []),
        ],
      },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });
    const existing = duplicateCandidates.find((goal) => {
      const existingTitle = (goal.title || '').toLowerCase().replace(/\s+/g, ' ');
      const existingDescription = typeof goal.description === 'string' ? goal.description : '';
      return existingTitle === normalizedTitle || (programUrl && existingDescription.includes(programUrl));
    });
    if (existing) {
      return existing;
    }
    const priority = Number.isFinite(Number(dto.priority)) ? Number(dto.priority) : 0;
    const sortOrder = Number.isFinite(Number(dto.sortOrder)) ? Number(dto.sortOrder) : 0;
    const created = await this.prisma.projectGoal.create({
      data: {
        projectId,
        title,
        description,
        priority,
        sortOrder,
        createdById: runtime.userId,
      },
    });
    this.scheduleLeadPollingWake(
      projectId,
      (project as any)?.ownerId || runtime.userId,
      `runtime-created goal ${created.id}`,
    );
    const ownerId = (project as any)?.ownerId || runtime.userId;
    if (runtime.role === 'PLANNER_AGENT') {
      this.scheduleCoordinatorTick(
        projectId,
        ownerId,
        `runtime-created planner goal ${created.id} awaiting paired work item`,
        this.plannerGoalAnalysisGraceMs + 1_000,
      );
    } else {
      this.scheduleCoordinatorTick(projectId, ownerId, `runtime-created goal ${created.id}`);
    }
    return created;
  }

  async updateGoalFromRuntime(projectId: string, goalId: string, rawToken: string, dto: UpdateProjectGoalDto) {
    const runtime = await this.authenticateProjectRuntimeToken(projectId, rawToken, ['GOAL_UPDATE']);
    if (!['LEAD_AGENT', 'PLANNER_AGENT', 'OWNER'].includes(runtime.role)) {
      throw new ForbiddenException('Only a lead, planner, or owner runtime can update project goals');
    }
    const project = await this.ensureProjectAccess(projectId, runtime.userId);
    await this.ensureProjectScopedReference(projectId, 'goal', goalId);
    if (dto.status === 'CANCELLED') {
      throw new BadRequestException('Runtime goal updates cannot cancel goals; use the owner close-goal flow.');
    }
    if (dto.status === 'DONE') {
      const statusFlow = this.resolveProjectWorkItemStatusFlow(project?.settings);
      const openLinkedWorkCount = await this.prisma.projectWorkItem.count({
        where: {
          projectId,
          goalId,
          status: { notIn: statusFlow.terminalStatuses as any },
        },
      });
      if (openLinkedWorkCount > 0) {
        throw new BadRequestException(
          'Runtime goal updates cannot mark a goal DONE while linked non-terminal work items remain; finish or cancel the linked work first.',
        );
      }
    }
    if (dto.status !== undefined && this.isActiveProjectGoalStatus(dto.status)) {
      const existingGoal = (this.prisma.projectGoal as any)?.findFirst
        ? await this.prisma.projectGoal.findFirst({
            where: { id: goalId, projectId },
            select: { status: true },
          })
        : null;
      if (!this.isActiveProjectGoalStatus(existingGoal?.status)) {
        await this.ensureProjectActiveGoalCapacity(projectId, project?.settings, goalId);
      }
    }

    const data: Record<string, any> = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.priority !== undefined) data.priority = dto.priority;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    if (dto.status !== undefined) data.status = dto.status;

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No fields to update');
    }

    const updated = await this.prisma.projectGoal.update({
      where: { id: goalId },
      data,
    });
    const ownerId = (project as any)?.ownerId || runtime.userId;
    this.scheduleCoordinatorTick(projectId, ownerId, `runtime-updated goal ${goalId}`);
    if (runtime.role !== 'LEAD_AGENT') {
      this.scheduleLeadPollingWake(projectId, ownerId, `runtime-updated goal ${goalId}`);
    }
    return updated;
  }

  private async cascadeTerminalGoalWork(
    tx: any,
    projectId: string,
    goalId: string,
    statusFlow: ResolvedProjectWorkItemStatusFlow,
  ) {
    const affected = {
      features: [] as string[],
      workItems: [] as string[],
      assignments: [] as string[],
      runs: [] as string[],
    };

    const features = await tx.projectFeature.findMany({
      where: { projectId, goalId, status: { notIn: statusFlow.terminalStatuses as any } },
      select: { id: true },
    });
    affected.features = features.map((feature: any) => feature.id);
    if (affected.features.length) {
      await tx.projectFeature.updateMany({
        where: { id: { in: affected.features } },
        data: { status: statusFlow.closedStatus },
      });
    }

    const workItems = await tx.projectWorkItem.findMany({
      where: {
        projectId,
        status: { notIn: statusFlow.terminalStatuses as any },
        OR: [
          { goalId },
          affected.features.length ? { featureId: { in: affected.features } } : { id: '__never__' },
        ],
      },
      select: { id: true },
    });
    affected.workItems = workItems.map((workItem: any) => workItem.id);
    if (affected.workItems.length) {
      await tx.projectWorkItem.updateMany({
        where: { id: { in: affected.workItems } },
        data: { status: statusFlow.closedStatus },
      });

      const assignments = await tx.projectAssignment.findMany({
        where: {
          projectId,
          workItemId: { in: affected.workItems },
          status: { in: ['PROPOSED', 'ACTIVE', 'PAUSED'] },
        },
        select: { id: true },
      });
      affected.assignments = assignments.map((assignment: any) => assignment.id);
      if (affected.assignments.length) {
        await tx.projectAssignment.updateMany({
          where: { id: { in: affected.assignments } },
          data: { status: 'RELEASED', finishedAt: new Date() },
        });
      }

      const runs = await tx.projectRun.findMany({
        where: {
          projectId,
          workItemId: { in: affected.workItems },
          status: { in: ['QUEUED', 'RUNNING'] },
        },
        select: { id: true },
      });
      affected.runs = runs.map((run: any) => run.id);
      if (affected.runs.length) {
        await tx.projectRun.updateMany({
          where: { id: { in: affected.runs } },
          data: { status: 'CANCELLED', finishedAt: new Date() },
        });
      }
    }

    return affected;
  }

  async createWorkItemFromRuntime(projectId: string, rawToken: string, dto: CreateProjectWorkItemDto) {
    const runtime = await this.authenticateProjectRuntimeToken(projectId, rawToken, ['WORK_ITEM_CREATE']);
    if (!['LEAD_AGENT', 'PLANNER_AGENT', 'WORKER_AGENT', 'OWNER'].includes(runtime.role)) {
      throw new ForbiddenException('Only an authorized project runtime can create work items');
    }
    const project = await this.ensureProjectAccess(projectId, runtime.userId);
    const normalized = this.normalizeRuntimeCreatedWorkItemDto(dto);
    const inputPacket =
      normalized.inputPacket && typeof normalized.inputPacket === 'object' && !Array.isArray(normalized.inputPacket)
        ? this.mergeOwnerTodoRequester(
            normalized.inputPacket,
            this.ownerTodoRequesterFromRuntime(runtime),
            normalized.goalId,
          )
        : normalized.inputPacket;
    return this.createWorkItemInternal(projectId, runtime.userId, { ...normalized, inputPacket }, project);
  }

  private normalizeRuntimeCreatedWorkItemDto(dto: CreateProjectWorkItemDto): CreateProjectWorkItemDto {
    const outputProjectFiles = this.cleanStringList((dto as any).outputProjectFiles);
    const inputPacket =
      dto.inputPacket && typeof dto.inputPacket === 'object' && !Array.isArray(dto.inputPacket)
        ? { ...dto.inputPacket }
        : {};
    const runtimeInputPacket = {
      ...inputPacket,
      source: typeof (inputPacket as any).source === 'string' && (inputPacket as any).source.trim()
        ? (inputPacket as any).source
        : 'agent-runtime',
    };
    if (!outputProjectFiles.length) {
      return {
        ...dto,
        inputPacket: runtimeInputPacket,
      };
    }
    const existingOutputProjectFiles = this.cleanStringList((inputPacket as any).outputProjectFiles);
    const existingSharedFiles = Array.isArray((inputPacket as any).sharedFiles)
      ? (inputPacket as any).sharedFiles
      : [];
    return {
      ...dto,
      inputPacket: {
        ...runtimeInputPacket,
        outputProjectFiles: [...new Set([...existingOutputProjectFiles, ...outputProjectFiles])],
        sharedFiles: [
          ...existingSharedFiles,
          ...outputProjectFiles
            .filter((path) => !existingSharedFiles.some((item: any) => (typeof item === 'string' ? item : item?.path) === path))
            .map((path) => ({ path, required: true, source: 'outputProjectFiles' })),
        ],
      },
    };
  }

  private async ownerVisibleLlmConfigCandidates(ownerId: string, preferredIds: any[] = []) {
    const configs = typeof (this.apiConfigService as any).findAllForUse === 'function'
      ? await (this.apiConfigService as any).findAllForUse(ownerId)
      : await this.prisma.apiConfig.findMany({
          where: { userId: ownerId },
          orderBy: [{ isActive: 'desc' }, { lastUsedAt: 'desc' }, { createdAt: 'asc' }],
        });
    const byId = new Map(configs.map((config: any) => [config.id, config]));
    const ordered: any[] = [];
    const seen = new Set<string>();
    const add = (config: any) => {
      if (!config?.id || seen.has(config.id)) return;
      seen.add(config.id);
      ordered.push(config);
    };
    for (const rawId of preferredIds) {
      const id = typeof rawId === 'string' ? rawId.trim() : '';
      if (id) add(byId.get(id));
    }
    configs.filter((config: any) => config.isActive).forEach(add);
    configs.forEach(add);
    return ordered;
  }

  private async resolveRuntimeLaunchLlmConfigId(
    ownerId: string,
    launchMode: AgentRuntimeLaunchMode,
    agentType: string,
    preferredIds: any[] = [],
  ) {
    if (this.canLaunchWithoutModelConfig(launchMode, agentType)) {
      const explicit = preferredIds.find((id) => typeof id === 'string' && id.trim());
      return typeof explicit === 'string' ? explicit.trim() : '';
    }
    const candidates = await this.ownerVisibleLlmConfigCandidates(ownerId, preferredIds);
    return candidates[0]?.id || '';
  }

  private isModelApiFailureError(error: any) {
    const message = String(error?.message || error || '').toLowerCase();
    return (
      /model api|api configuration|api config|api key|invalid key|unauthorized|forbidden|rate limit|quota/.test(message) ||
      /chat\/completions|responses api|stream ended|finish_reason|empty streaming response/.test(message) ||
      /agentcraft model proxy|upstream|fetch failed|econnrefused|enotfound|etimedout|socket|connection/.test(message) ||
      /\b(?:401|403|429|500|502|503|504)\b/.test(message)
    );
  }

  private isProjectActiveAgentCapacityError(error: any) {
    return /project active agent limit reached/i.test(String(error?.message || error || ''));
  }

  private async waitForRuntimeAssignmentWakeResult(memberId: string, requestId?: string | null) {
    if (!requestId) return { completed: false, error: null as string | null };
    const timeoutMs = Number(this.configService.get<string>('HERMES_AGENT_DISPATCH_WAKE_RESPONSE_WAIT_MS') || 90000);
    const deadline = Date.now() + Math.max(1000, timeoutMs);
    let latest: AgentRuntimeSession | null = null;
    while (Date.now() <= deadline) {
      latest = await this.latestRuntimeSessionForMember(memberId).catch(() => null);
      if (!latest) return { completed: false, error: 'Runtime session disappeared while waiting for assignment response.' };
      if (latest.activeRequestId !== requestId || latest.status !== 'TYPING') {
        return {
          completed: true,
          error: latest.status === 'ERROR' || latest.lastError ? latest.lastError || 'Agent runtime returned an error.' : null,
          session: latest,
        };
      }
      await this.sleep(1000);
    }
    return { completed: false, error: null as string | null, session: latest };
  }

  private async dispatchWorkItemWithLaunchedRuntimeFallback(
    projectId: string,
    workItemId: string,
    rawToken: string,
    runtime: any,
    managerProject: any,
    role: string,
    dto: any = {},
  ) {
    const launchMode =
      this.effectiveAgentRuntimeLaunchMode(dto.launchMode, runtime.session) ||
      this.defaultAgentRuntimeLaunchMode(runtime.session);
    const agentType = this.preferredSubAgentRuntimeType(role, managerProject.settings, runtime.session, dto);
    const configCandidates = this.canLaunchWithoutModelConfig(launchMode, agentType)
      ? []
      : await this.ownerVisibleLlmConfigCandidates(managerProject.ownerId, [
          dto.llmConfigId,
          runtime.session?.llm?.configId,
        ]);
    const candidateIds = this.canLaunchWithoutModelConfig(launchMode, agentType)
      ? [typeof dto.llmConfigId === 'string' ? dto.llmConfigId.trim() : '']
      : configCandidates.map((config: any) => config.id);
    const attempts: Array<{ llmConfigId: string | null; agentType: string; error: string }> = [];

    if (!candidateIds.length) {
      const ownerWorkItem = await this.createOwnerModelApiFailureWorkItem(
        projectId,
        managerProject.ownerId,
        workItemId,
        role,
        agentType,
        attempts,
        'No owner-visible model API configuration is available for the sub-agent.',
      );
      return {
        projectId,
        workItemId,
        launchedRuntime: null,
        assignment: null,
        ownerWorkItem,
        llmConfigAttempts: attempts,
        response: 'No usable model API configuration was available; created an owner work item.',
      };
    }

    for (const llmConfigId of candidateIds) {
      let launchedRuntime: any = null;
      let assignment: any = null;
      try {
        launchedRuntime = await this.launchAgentRuntimeFromRuntime(projectId, rawToken, {
          role,
          llmConfigId,
          image: dto.image,
          model: dto.model,
          agentType,
          launchMode,
          deploymentDays: dto.deploymentDays,
          enableSudo: dto.enableSudo,
        });
        const assignee = {
          memberId: launchedRuntime.memberId,
          userId: launchedRuntime.userId,
          targetRuntimeId: launchedRuntime.session?.runtimeId || null,
        };
        assignment = await this.createAssignment(projectId, workItemId, runtime.userId, {
          assigneeUserId: assignee.userId,
          role,
          targetRuntimeId: dto.targetRuntimeId || assignee.targetRuntimeId || undefined,
          objective: typeof dto.objective === 'string' ? dto.objective : undefined,
          contextPacket: {
            ...(dto.contextPacket && typeof dto.contextPacket === 'object' && !Array.isArray(dto.contextPacket)
              ? dto.contextPacket
              : {}),
            dispatchLaunch: {
              agentType,
              launchMode,
              llmConfigId: llmConfigId || null,
              fallbackAttempt: attempts.length + 1,
            },
          },
        });
        const waitForFirstResponse = this.shouldWaitForDispatchFirstResponse(launchMode, dto);
        const wakeResult = await this.wakeRuntimeForAssignment(projectId, managerProject.ownerId, assignee.memberId, assignment, {
          waitForFirstResponse,
        });
        if (wakeResult?.error && this.isModelApiFailureError(wakeResult.error)) {
          throw new Error(wakeResult.error);
        }
        return {
          projectId,
          workItemId,
          launchedRuntime,
          assignment,
          llmConfigAttempts: attempts,
        };
      } catch (error: any) {
        const errorMessage = this.sanitizeAgentLaunchError(error);
        attempts.push({ llmConfigId: llmConfigId || null, agentType, error: errorMessage });
        if (assignment?.id) {
          await this.updateAssignment(projectId, workItemId, assignment.id, runtime.userId, {
            status: 'FAILED',
            contextPacket: {
              ...(assignment.contextPacket && typeof assignment.contextPacket === 'object' && !Array.isArray(assignment.contextPacket)
                ? assignment.contextPacket
                : {}),
              dispatchFailure: {
                reason: 'MODEL_API_FAILURE',
                llmConfigId: llmConfigId || null,
                error: errorMessage,
              },
            },
          }).catch(() => null);
        }
        if (this.isProjectActiveAgentCapacityError(error)) {
          const ownerWorkItem = await this.createOwnerAgentCapacityWorkItem(
            projectId,
            managerProject.ownerId,
            workItemId,
            role,
            agentType,
            errorMessage,
          );
          return {
            projectId,
            workItemId,
            launchedRuntime: null,
            assignment: null,
            ownerWorkItem,
            llmConfigAttempts: attempts,
            response: 'Project active agent capacity was reached; created an owner capacity/settings work item instead of reusing an unrelated runtime.',
          };
        }
        if (!this.isModelApiFailureError(error)) {
          throw error;
        }
      }
    }

    const ownerWorkItem = await this.createOwnerModelApiFailureWorkItem(
      projectId,
      managerProject.ownerId,
      workItemId,
      role,
      agentType,
      attempts,
      attempts[attempts.length - 1]?.error || 'All owner-visible model API configurations failed.',
    );
    return {
      projectId,
      workItemId,
      launchedRuntime: null,
      assignment: null,
      ownerWorkItem,
      llmConfigAttempts: attempts,
      response: 'All model API configurations failed; created an owner work item.',
    };
  }

  private async createOwnerAgentCapacityWorkItem(
    projectId: string,
    ownerId: string,
    blockedWorkItemId: string,
    role: string,
    agentType: string,
    lastError: string,
  ) {
    const project = (this.prisma.project as any)?.findUnique
      ? await this.prisma.project.findUnique({
          where: { id: projectId },
          select: { settings: true },
        }).catch(() => null)
      : null;
    const statusFlow = this.resolveProjectWorkItemStatusFlow(project?.settings);
    const blocked = await this.prisma.projectWorkItem.findFirst({
      where: { id: blockedWorkItemId, projectId },
      select: { id: true, title: true, goalId: true },
    }).catch(() => null);
    const title = `Increase agent capacity for ${role} dispatch${blocked?.title ? `: ${blocked.title}` : ''}`.slice(0, 190);
    const existing = await this.prisma.projectWorkItem.findFirst({
      where: {
        projectId,
        ownerId,
        title,
        status: { notIn: statusFlow.terminalStatuses as any },
      },
      orderBy: { createdAt: 'desc' },
    }).catch(() => null);
    if (existing) return existing;
    return this.createWorkItem(projectId, ownerId, {
      title,
      workType: 'INTEGRATION',
      status: statusFlow.initialStatus,
      goalId: blocked?.goalId || undefined,
      ownerId,
      priority: 95,
      scopeBrief:
        `A fresh ${agentType} ${role} sub-agent could not be launched because the project active-agent limit was reached.`,
      acceptanceCriteria:
        '1. Dismiss no-longer-needed idle agent runtimes or increase Max active agents in Project Settings.\n' +
        '2. Retry the blocked runtime-dispatch after fresh-agent capacity is available.\n' +
        '3. For HackerOne independent target work, do not reuse an old worker unless it is an explicit same-goal continuation.',
      inputPacket: {
        source: 'runtime-dispatch-agent-capacity',
        blockedWorkItemId,
        role,
        agentType,
        lastError,
      },
      outputContract: {
        expected: 'Fresh-agent capacity is available, then retry the blocked dispatch.',
      },
    });
  }

  private async createOwnerModelApiFailureWorkItem(
    projectId: string,
    ownerId: string,
    blockedWorkItemId: string,
    role: string,
    agentType: string,
    attempts: Array<{ llmConfigId: string | null; agentType: string; error: string }>,
    lastError: string,
  ) {
    const project = (this.prisma.project as any)?.findUnique
      ? await this.prisma.project.findUnique({
          where: { id: projectId },
          select: { settings: true },
        }).catch(() => null)
      : null;
    const statusFlow = this.resolveProjectWorkItemStatusFlow(project?.settings);
    const blocked = await this.prisma.projectWorkItem.findFirst({
      where: { id: blockedWorkItemId, projectId },
      select: { id: true, title: true, goalId: true },
    }).catch(() => null);
    const title = `Fix model API for ${role} dispatch${blocked?.title ? `: ${blocked.title}` : ''}`.slice(0, 190);
    const existing = await this.prisma.projectWorkItem.findFirst({
      where: {
        projectId,
        ownerId,
        title,
        status: { notIn: statusFlow.terminalStatuses as any },
      },
      orderBy: { createdAt: 'desc' },
    }).catch(() => null);
    if (existing) return existing;
    return this.createWorkItem(projectId, ownerId, {
      title,
      workType: 'INTEGRATION',
      status: statusFlow.initialStatus,
      goalId: blocked?.goalId || undefined,
      ownerId,
      priority: 100,
      scopeBrief:
        `A ${agentType} ${role} sub-agent could not start the assigned work because all owner-visible model API configurations failed.`,
      acceptanceCriteria:
        '1. Add, repair, or activate a working model API configuration visible to the project owner.\n' +
        '2. Confirm the model endpoint can complete a short streaming response.\n' +
        '3. Retry dispatching the blocked work item.',
      inputPacket: {
        source: 'runtime-dispatch-model-api-fallback',
        blockedWorkItemId,
        role,
        agentType,
        attemptedLlmConfigIds: attempts.map((attempt) => attempt.llmConfigId).filter(Boolean),
        attempts,
        lastError,
      },
      outputContract: {
        expected: 'A working owner-visible model API configuration, then retry the blocked dispatch.',
      },
    });
  }

  private shouldWaitForDispatchFirstResponse(
    launchMode: AgentRuntimeLaunchMode,
    dto: { waitForFirstResponse?: unknown } = {},
  ) {
    if (typeof dto.waitForFirstResponse === 'boolean') {
      return dto.waitForFirstResponse;
    }
    return !this.isQueuedLocalRuntimeProvider(launchMode);
  }

  private async assignmentAssigneeRuntimeState(projectId: string, assignment: { assigneeUserId?: string | null }) {
    if (!assignment.assigneeUserId) return { available: false, memberId: null as string | null, session: null as AgentRuntimeSession | null };
    const member = await this.prisma.projectMember.findFirst({
      where: { projectId, userId: assignment.assigneeUserId, removedAt: null },
      select: { id: true, permissions: true },
    }).catch(() => null);
    const session = member ? this.readRuntimeSession(member.permissions) : null;
    if (!session) return { available: false, memberId: member?.id || null, session: null as AgentRuntimeSession | null };
    const recovered = this.recoverPersistedRuntimeSession(session);
    if (['STOPPED', 'ERROR'].includes(String(recovered.status || ''))) {
      return { available: false, memberId: member?.id || null, session: recovered };
    }
    if (recovered.provider === 'local-docker') {
      const inspected = await this.agentRuntimeLauncher.inspect(recovered).catch((error: any) =>
        this.buildUnavailableLocalDockerSession(recovered, error),
      );
      const status = String((inspected as any).status || recovered.status || '');
      if ((inspected as any).dockerStatus?.running === false || ['STOPPED', 'ERROR'].includes(status)) {
        if (member?.id) {
          await this.writeRuntimeSession(member.id, inspected as AgentRuntimeSession).catch(() => null);
        }
        return { available: false, memberId: member?.id || null, session: inspected as AgentRuntimeSession };
      }
      if (member?.id && inspected !== recovered) {
        await this.writeRuntimeSession(member.id, inspected as AgentRuntimeSession).catch(() => null);
      }
      return { available: true, memberId: member?.id || null, session: inspected as AgentRuntimeSession };
    }
    return { available: true, memberId: member?.id || null, session: recovered };
  }

  private async assignmentAssigneeRuntimeAvailable(projectId: string, assignment: { assigneeUserId?: string | null }) {
    return (await this.assignmentAssigneeRuntimeState(projectId, assignment)).available;
  }

  async dispatchWorkItemFromRuntime(projectId: string, workItemId: string, rawToken: string, dto: any = {}) {
    const runtime = await this.authenticateProjectRuntimeToken(projectId, rawToken, ['ASSIGNMENT_DISPATCH']);
    const managerProject = await this.ensureProjectManager(projectId, runtime.userId);
    if (runtime.role !== 'LEAD_AGENT') {
      throw new ForbiddenException('Only a LEAD_AGENT runtime can dispatch project work');
    }

    const role = String(dto.role || 'WORKER_AGENT').trim();
    const requestedForceLaunchNew = dto.forceLaunchNew === true;
    const autoLaunchFreshWorker = !requestedForceLaunchNew && this.shouldAutoLaunchFreshHackerOneWorker(managerProject.settings, role, dto);
    const forceLaunchNew = requestedForceLaunchNew || autoLaunchFreshWorker;
    if ((this.prisma as any).projectWorkItem?.findFirst) {
      const workItem = await this.prisma.projectWorkItem.findFirst({
        where: { id: workItemId, projectId },
        select: { id: true, status: true },
      });
      if (!workItem) {
        throw new NotFoundException('Project work item not found');
      }
        if (this.isTerminalWorkItemStatus(workItem.status, managerProject.settings)) {
          await this.markOpenAssignmentsFailedForTerminalWorkItem(projectId, workItemId, role);
          throw new BadRequestException(`Cannot dispatch ${role} to terminal work item ${workItem.status}`);
        }
    }
    const existingAssignment = await this.prisma.projectAssignment.findFirst({
      where: {
        projectId,
        workItemId,
        role,
        status: { in: ['PROPOSED', 'ACTIVE', 'PAUSED', 'COMPLETED'] as any },
      },
      include: {
        assigneeUser: { select: { id: true, email: true, displayName: true, role: true } },
        assignedByUser: { select: { id: true, email: true, displayName: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (existingAssignment) {
      const runtimeState = await this.assignmentAssigneeRuntimeState(projectId, existingAssignment).catch((error) => {
        this.logger.warn(
          `Failed to inspect existing ${role} assignment ${existingAssignment.id}: ${error?.message || error}`,
        );
        return { available: false, memberId: null as string | null, session: null as AgentRuntimeSession | null };
      });
      if (runtimeState.available) {
        if (existingAssignment.status === 'PROPOSED' && runtimeState.memberId) {
          await this.wakeRuntimeForAssignment(
            projectId,
            managerProject.ownerId,
            runtimeState.memberId,
            existingAssignment,
            { waitForFirstResponse: this.shouldWaitForDispatchFirstResponse(this.defaultAgentRuntimeLaunchMode(runtime.session), dto) },
          ).catch((error) => {
            this.logger.warn(
              `Failed to wake existing ${role} assignment ${existingAssignment.id}: ${error?.message || error}`,
            );
          });
        }
        return {
          projectId,
          workItemId,
          launchedRuntime: null,
          assignment: existingAssignment,
          idempotent: true,
        };
      }
      if (requestedForceLaunchNew) {
        return {
          projectId,
          workItemId,
          launchedRuntime: null,
          assignment: existingAssignment,
          idempotent: true,
          duplicateDispatchSuppressed: true,
        };
      }
      await this.updateAssignment(projectId, workItemId, existingAssignment.id, runtime.userId, {
        status: 'FAILED',
        contextPacket: {
          ...(existingAssignment.contextPacket && typeof existingAssignment.contextPacket === 'object' && !Array.isArray(existingAssignment.contextPacket)
            ? existingAssignment.contextPacket as Record<string, any>
            : {}),
          staleDispatch: {
            reason: requestedForceLaunchNew ? 'FORCE_LAUNCH_NEW' : 'ASSIGNEE_RUNTIME_UNAVAILABLE',
            failedAt: new Date().toISOString(),
          },
        },
      }).catch(() => null);
    }

    await this.ensureRuntimeDispatchRoleCapacity(projectId, managerProject.settings, role);

    let assignee = forceLaunchNew
      ? null
      : await this.resolveDispatchAssignee(projectId, runtime.memberId, dto, role);
    let launchedRuntime: any = null;
    if (!assignee && dto.launchIfMissing !== false) {
      return this.dispatchWorkItemWithLaunchedRuntimeFallback(
        projectId,
        workItemId,
        rawToken,
        runtime,
        managerProject,
        role,
        dto,
      );
    }

    if (!assignee) {
      throw new BadRequestException(`No active ${role} member/runtime is available for dispatch`);
    }

    const assignment = await this.createAssignment(projectId, workItemId, runtime.userId, {
      assigneeUserId: assignee.userId,
      role,
      targetRuntimeId: dto.targetRuntimeId || assignee.targetRuntimeId || undefined,
      objective: typeof dto.objective === 'string' ? dto.objective : undefined,
      contextPacket: dto.contextPacket,
    });

    if (assignee.targetRuntimeId) {
      await this.wakeRuntimeForAssignment(projectId, managerProject.ownerId, assignee.memberId, assignment).catch((error) => {
        this.logger.warn(
          `Failed to wake ${role} runtime ${assignee.targetRuntimeId} for assignment ${assignment.id}: ${error?.message || error}`,
        );
      });
    }

    return {
      projectId,
      workItemId,
      launchedRuntime,
      assignment,
    };
  }

  async claimWorkItemFromRuntime(projectId: string, workItemId: string, rawToken: string, dto: any = {}) {
    const runtime = await this.authenticateProjectRuntimeToken(projectId, rawToken, ['PROJECT_BOARD_READ']);
    if (runtime.role !== 'WORKER_AGENT') {
      throw new ForbiddenException('Only a WORKER_AGENT runtime can self-claim project work');
    }
    const project = await this.ensureProjectAccess(projectId, runtime.userId);
    const statusFlow = this.resolveProjectWorkItemStatusFlow(project.settings);

    const workItem = await this.prisma.projectWorkItem.findFirst({
      where: { id: workItemId, projectId },
      include: {
        assignments: {
          where: { status: { in: ['PROPOSED', 'ACTIVE', 'PAUSED'] as any } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!workItem) {
      throw new NotFoundException('Project work item not found');
    }

    const existingOwnAssignment = workItem.assignments.find((assignment) => assignment.assigneeUserId === runtime.userId);
    if (existingOwnAssignment) {
      return {
        projectId,
        workItemId,
        assignment: existingOwnAssignment,
        alreadyClaimed: true,
        updateEndpoint:
          `/projects/${projectId}/work-items/${workItemId}/assignments/${existingOwnAssignment.id}/runtime-update`,
      };
    }

    const workItemStatus = this.normalizeWorkItemStatusId(workItem.status);
    if (!statusFlow.claimableStatuses.includes(workItemStatus)) {
      throw new BadRequestException(`Only claimable work items can be self-claimed; current status is ${workItemStatus}`);
    }
    if (workItemStatus === 'DRAFT' && dto.allowDraft !== true) {
      throw new BadRequestException('DRAFT self-claim requires allowDraft: true');
    }
    if (workItem.ownerId && workItem.ownerId !== runtime.userId) {
      throw new BadRequestException('Work item is already owned by another project member');
    }
    if (workItem.assignments.length) {
      throw new BadRequestException('Work item already has an open assignment');
    }
    const dependencyIds = Array.isArray(workItem.dependsOn)
      ? workItem.dependsOn.filter((dependencyId): dependencyId is string => typeof dependencyId === 'string')
      : [];
    if (dependencyIds.length) {
      const blockedDependencyCount = await this.prisma.projectWorkItem.count({
        where: {
          projectId,
          id: { in: dependencyIds },
          status: { notIn: statusFlow.completedStatuses as any },
        },
      });
      if (blockedDependencyCount) {
        throw new BadRequestException('Work item has unmet dependencies');
      }
    }

    const contextPacket = await this.buildAssignmentContextPacket(projectId, workItemId, {
      assigneeUserId: runtime.userId,
      role: runtime.role,
      targetRuntimeId: runtime.runtimeId,
      objective: typeof dto.objective === 'string' && dto.objective.trim() ? dto.objective.trim() : workItem.title,
      contextPacket: {
        ...(dto.contextPacket && typeof dto.contextPacket === 'object' && !Array.isArray(dto.contextPacket)
          ? dto.contextPacket
          : {}),
        source: 'runtime-self-claim',
        selfClaimed: true,
      },
    });

    const created = await this.agentWorkspaceClient.createAssignment(projectId, {
      workItemId,
      assigneeMemberId: runtime.memberId,
      assignedByUserId: runtime.userId,
      targetRuntimeId: runtime.runtimeId,
      role: runtime.role,
      objective: typeof dto.objective === 'string' && dto.objective.trim() ? dto.objective.trim() : workItem.title,
      contextPacket,
    });

    const assignment = await this.prisma.projectAssignment.findUnique({
      where: { id: created.assignmentId },
      include: {
        assigneeUser: { select: { id: true, email: true, displayName: true, role: true } },
        assignedByUser: { select: { id: true, email: true, displayName: true, role: true } },
      },
    });
    if (!assignment) {
      throw new NotFoundException('Project assignment not found after self-claim');
    }
    await this.syncCurrentProjectGlobalsToRuntimeSessions(projectId).catch((error: any) => {
      this.logger.warn(
        `Failed to sync project globals after runtime self-claim ${assignment.id}: ${error?.message || error}`,
      );
    });

    return {
      projectId,
      workItemId,
      assignment,
      inboxItemId: created.inboxItemId,
      alreadyClaimed: false,
      updateEndpoint: `/projects/${projectId}/work-items/${workItemId}/assignments/${assignment.id}/runtime-update`,
    };
  }

  private async wakeRuntimeForAssignment(
    projectId: string,
    ownerId: string,
    memberId: string,
    assignment: any,
    options: { waitForFirstResponse?: boolean } = {},
  ) {
    await this.waitForRuntimeMessageEndpoint(projectId, memberId);
    const packet =
      assignment.contextPacket && typeof assignment.contextPacket === 'object'
        ? this.sanitizeAssignmentContextPacket(assignment.contextPacket) as Record<string, any>
        : {};
    const workItem =
      packet.workItem && typeof packet.workItem === 'object'
        ? packet.workItem
        : {};
    const coordinatorPacket =
      packet.coordinator && typeof packet.coordinator === 'object' && !Array.isArray(packet.coordinator)
        ? packet.coordinator as Record<string, any>
        : {};
    const coordinatorMessage =
      typeof coordinatorPacket.message === 'string' && coordinatorPacket.message.trim()
        ? coordinatorPacket.message.trim()
        : '';
    const message = [
      coordinatorMessage ? `Coordinator message: ${coordinatorMessage}` : null,
      coordinatorMessage ? '' : null,
      'You have a new ASSIGNMENT_DISPATCH for this project. Start now from this assignment packet.',
      `Assignment id: ${assignment.id}`,
      `Work item id: ${assignment.workItemId}`,
      workItem.title ? `Work item title: ${workItem.title}` : null,
      assignment.objective ? `Objective: ${assignment.objective}` : null,
      '',
      `For item-scoped project shared-file writes/uploads/deletes, pass --work-item ${assignment.workItemId} on the project-files.sh helper command.`,
      'For memory or workspace-message HTTP writes, include X-AgentCraft-Work-Item-Id or a workItemId field. Do not store this id in the long-lived runtime env file.',
      '',
      'Before substantive work, update your assignment status to ACTIVE using:',
      `PATCH $AIFACTORY_API_BASE_URL/projects/${projectId}/work-items/${assignment.workItemId}/assignments/${assignment.id}/runtime-update`,
      'with Authorization: Bearer $AIFACTORY_RUNTIME_TOKEN and body {"status":"ACTIVE"}.',
      '',
      'After submitting artifacts and handoff, update the same runtime endpoint with {"status":"COMPLETED"} so the work item moves to IN_REVIEW.',
      'Keep this turn bounded: for research or validation work, use command-level network timeouts for external calls, deliver the smallest reviewable phase before the turn becomes too large or silent, write required evidence or notes to project shared files with project-file-write/project-file-upload, verify the shared path, then mark COMPLETED and leave follow-up hypotheses in the handoff or a new work item.',
      Array.isArray((packet as any).outputProjectFiles) && (packet as any).outputProjectFiles.length
        ? [
            '',
            'Required project shared output path(s):',
            ...(packet as any).outputProjectFiles.map((path: string) => `- ${path}`),
            'Write these through project-file-write or POST /v1/projects/{projectId}/files/write, then verify each path with project-file-read or GET /v1/projects/{projectId}/files/read before marking the assignment COMPLETED.',
          ].join('\n')
        : null,
      '',
      'Assignment context packet JSON:',
      JSON.stringify(packet, null, 2),
    ].filter(Boolean).join('\n');

    const result = await this.sendAgentRuntimeMessage(projectId, memberId, ownerId, { message });
    const requestId = result.session?.activeRequestId || null;
    const conversationId =
      result.session?.activeRequestConversationId ||
      result.session?.activeConversationId ||
      null;
    if (!options.waitForFirstResponse) {
      return { accepted: true, error: null as string | null, conversationId, requestId };
    }
    const wakeResult = await this.waitForRuntimeAssignmentWakeResult(memberId, requestId);
    return { ...wakeResult, conversationId, requestId };
  }

  private async waitForRuntimeMessageEndpoint(projectId: string, memberId: string) {
    const deadline = Date.now() + Number(this.configService.get<string>('HERMES_AGENT_WAKE_WAIT_MS') || 45000);
    let lastError = '';

    while (Date.now() <= deadline) {
      const member = await this.prisma.projectMember.findFirst({
        where: { id: memberId, projectId, removedAt: null },
        select: { permissions: true },
      });
      const session = this.readRuntimeSession(member?.permissions);
      const apiBaseUrl = session?.apiBaseUrl;
      if (!apiBaseUrl || apiBaseUrl.startsWith('local-runner://') || apiBaseUrl.startsWith('local-codex://')) {
        return;
      }

      try {
        const response = await fetch(`${apiBaseUrl}/health`, {
          signal: AbortSignal.timeout(2000),
        });
        if (response.ok) return;
        lastError = `health returned ${response.status}`;
      } catch (error: any) {
        lastError = error?.message || String(error);
      }

      await this.sleep(2500);
    }

    this.logger.warn(
      `Runtime ${memberId} message endpoint did not become healthy before assignment wake; sending anyway (${lastError || 'unknown health error'})`,
    );
  }

  async updateWorkItemFromRuntime(projectId: string, workItemId: string, rawToken: string, dto: any = {}) {
    const changedFields = Object.keys(dto || {}).filter((key) => key !== 'updatedByUserId' && dto[key] !== undefined);
    if (!changedFields.length) {
      throw new BadRequestException('At least one work item field must be provided');
    }
    const statusOnly = changedFields.length === 1 && changedFields[0] === 'status';
    const project = await this.prisma.project.findUnique({ where: { id: projectId }, select: { settings: true } });
    const statusFlow = this.resolveProjectWorkItemStatusFlow(project?.settings);
    const nextStatus = dto.status ? this.normalizeWorkItemStatusId(dto.status) : '';
    if (nextStatus) {
      dto.status = nextStatus;
    }
    const allowedScopes = !statusOnly
      ? nextStatus && !statusFlow.claimableStatuses.includes(nextStatus)
        ? ['WORK_ITEM_UPDATE']
        : ['WORK_ITEM_UPDATE', 'WORK_ITEM_CREATE']
      : statusFlow.claimableStatuses.includes(nextStatus)
        ? ['WORK_ITEM_STATUS_UPDATE', 'WORK_ITEM_UPDATE', 'WORK_ITEM_CREATE']
        : statusFlow.terminalStatuses.includes(nextStatus)
          ? ['WORK_ITEM_STATUS_UPDATE', 'WORK_ITEM_UPDATE', 'ASSIGNMENT_DISPATCH', 'REVIEW_SUBMIT']
          : ['WORK_ITEM_STATUS_UPDATE', 'WORK_ITEM_UPDATE', 'ASSIGNMENT_DISPATCH'];
    const runtime = await this.authenticateProjectRuntimeToken(projectId, rawToken);
    if (!allowedScopes.some((scope) => runtime.scopes.includes(scope))) {
      throw new ForbiddenException(`Runtime token is missing one of required scopes: ${allowedScopes.join(', ')}`);
    }
    const updated = await this.agentWorkspaceClient.updateWorkItem(projectId, workItemId, dto, rawToken);
    return updated.workItem;
  }

  async createWorkItemCommentFromRuntime(
    projectId: string,
    workItemId: string,
    rawToken: string,
    dto: CreateProjectWorkItemCommentDto,
  ) {
    const runtime = await this.authenticateProjectRuntimeToken(projectId, rawToken, ['THREAD_PARTICIPATE']);
    await this.ensureProjectScopedReference(projectId, 'workItem', workItemId);
    const content =
      typeof dto?.content === 'string' && dto.content.trim()
        ? dto.content.trim()
        : typeof (dto as any)?.message === 'string' && (dto as any).message.trim()
          ? (dto as any).message.trim()
          : typeof (dto as any)?.comment === 'string' && (dto as any).comment.trim()
            ? (dto as any).comment.trim()
            : typeof (dto as any)?.body === 'string' && (dto as any).body.trim()
              ? (dto as any).body.trim()
              : typeof (dto as any)?.text === 'string' && (dto as any).text.trim()
                ? (dto as any).text.trim()
                : '';
    if (!content) {
      throw new BadRequestException('runtime-comments requires a non-empty content field');
    }

    const comment = await this.prisma.projectWorkItemComment.create({
      data: {
        projectId,
        workItemId,
        userId: runtime.userId,
        content,
        attachments: Array.isArray(dto.attachments) ? dto.attachments : [],
      },
      include: {
        user: { select: { id: true, email: true, displayName: true, role: true, avatarUrl: true } },
      },
    });

    return {
      projectId,
      workItemId,
      comment,
    };
  }

  async listWorkItemCommentsFromRuntime(projectId: string, workItemId: string, rawToken: string) {
    await this.authenticateProjectRuntimeToken(projectId, rawToken, ['THREAD_PARTICIPATE']);
    await this.ensureProjectScopedReference(projectId, 'workItem', workItemId);

    const comments = await this.prisma.projectWorkItemComment.findMany({
      where: { projectId, workItemId },
      include: {
        user: { select: { id: true, email: true, displayName: true, role: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return {
      projectId,
      workItemId,
      comments,
    };
  }

  async updateAssignmentFromRuntime(
    projectId: string,
    workItemId: string,
    assignmentId: string,
    rawToken: string,
    dto: any = {},
  ) {
    const runtime = await this.authenticateProjectRuntimeToken(projectId, rawToken);
    const assignment = await this.ensureProjectAssignment(projectId, workItemId, assignmentId);
    const status = typeof dto.status === 'string' ? dto.status.trim().toUpperCase() : undefined;
    if (!status) {
      throw new BadRequestException('Assignment status is required');
    }
    const allowedStatuses = new Set(['ACTIVE', 'PAUSED', 'COMPLETED', 'FAILED']);
    if (!allowedStatuses.has(status)) {
      throw new BadRequestException(`Runtime assignment status must be one of: ${[...allowedStatuses].join(', ')}`);
    }
    const leadMarkingStaleFailed = runtime.role === 'LEAD_AGENT' && status === 'FAILED';
    if (assignment.assigneeUserId !== runtime.userId && !leadMarkingStaleFailed) {
      throw new ForbiddenException('Runtime can only update its own assignment');
    }

    const updated = await this.updateAssignment(projectId, workItemId, assignmentId, runtime.userId, {
      ...dto,
      status,
    });
    if (status === 'COMPLETED') {
      this.scheduleLeadPollingWake(projectId, runtime.userId, `runtime-completed assignment ${assignmentId}`);
    }
    return updated;
  }

  private async resolveDispatchAssignee(projectId: string, callerMemberId: string, dto: any, role: string) {
    if (typeof dto.assigneeUserId === 'string' && dto.assigneeUserId.trim()) {
      const member = await this.prisma.projectMember.findFirst({
        where: { projectId, userId: dto.assigneeUserId.trim(), removedAt: null },
        select: { id: true, userId: true, permissions: true },
      });
      if (!member) {
        throw new BadRequestException('Assignee must be an active project member before dispatch');
      }
      return {
        memberId: member.id,
        userId: member.userId,
        targetRuntimeId: typeof dto.targetRuntimeId === 'string' && dto.targetRuntimeId.trim()
          ? dto.targetRuntimeId.trim()
          : this.runtimeIdFromPermissions(member.permissions),
      };
    }

    if (typeof dto.assigneeMemberId === 'string' && dto.assigneeMemberId.trim()) {
      const member = await this.prisma.projectMember.findFirst({
        where: { projectId, id: dto.assigneeMemberId.trim(), removedAt: null },
        select: { id: true, userId: true, permissions: true },
      });
      if (!member) {
        throw new BadRequestException('Assignee member must be active in the project before dispatch');
      }
      return {
        memberId: member.id,
        userId: member.userId,
        targetRuntimeId: typeof dto.targetRuntimeId === 'string' && dto.targetRuntimeId.trim()
          ? dto.targetRuntimeId.trim()
          : this.runtimeIdFromPermissions(member.permissions),
      };
    }

    const members = await this.prisma.projectMember.findMany({
      where: {
        projectId,
        role,
        removedAt: null,
        id: { not: callerMemberId },
      },
      select: { id: true, userId: true, permissions: true, joinedAt: true },
      orderBy: { joinedAt: 'desc' },
    });
    const openAssignments = members.length
      ? await this.prisma.projectAssignment.findMany({
          where: {
            projectId,
            assigneeUserId: { in: members.map((member) => member.userId) },
            status: { in: ['PROPOSED', 'ACTIVE', 'PAUSED'] as any },
          },
          select: { assigneeUserId: true },
        })
      : [];
    const busyUserIds = new Set(openAssignments.map((assignment) => assignment.assigneeUserId));
    const candidate = members.find((member) => {
      const session = this.readRuntimeSession(member.permissions);
      return (
        session &&
        !['STOPPED', 'ERROR', 'TYPING'].includes(session.status || '') &&
        !session.activeRequestId &&
        !busyUserIds.has(member.userId)
      );
    });

    if (!candidate) return null;
    return {
      memberId: candidate.id,
      userId: candidate.userId,
      targetRuntimeId: this.runtimeIdFromPermissions(candidate.permissions),
    };
  }

  async nextLocalCodexAgentRuntimeRequest(projectId: string, memberId: string, userId: string) {
    return this.nextQueuedLocalRuntimeRequest(projectId, memberId, userId, 'local-codex');
  }

  async nextLocalRunnerAgentRuntimeRequest(projectId: string, memberId: string, userId: string) {
    return this.nextQueuedLocalRuntimeRequest(projectId, memberId, userId, 'local-runner');
  }

  private async nextQueuedLocalRuntimeRequest(
    projectId: string,
    memberId: string,
    userId: string,
    provider: 'local-runner' | 'local-codex',
  ) {
    await this.ensureProjectManager(projectId, userId);
    const member = await this.prisma.projectMember.findFirst({
      where: { id: memberId, projectId },
      select: { id: true, role: true, permissions: true, removedAt: true },
    });
    if (!member) throw new NotFoundException('Project member not found');
    if (member.removedAt) {
      return {
        projectId,
        memberId: member.id,
        role: member.role,
        request: null,
        shutdown: true,
        reason: 'member-dismissed',
        message: `${member.role} was dismissed on AgentCraft. Stopping the local worker.`,
      };
    }
    let session = this.readRuntimeSession(member.permissions);
    if (!session || session.provider !== provider) {
      return {
        projectId,
        memberId: member.id,
        role: member.role,
        request: null,
        shutdown: true,
        reason: 'runtime-removed',
        message: `${member.role} no longer has a ${provider} runtime. Stopping the local worker.`,
      };
    }
    const heartbeatNow = new Date().toISOString();
    const connectedSession = this.connectedQueuedLocalRuntimeSession(session, provider, heartbeatNow);
    const reconnectedRuntimeSession = connectedSession !== session;
    if (reconnectedRuntimeSession) {
      session = connectedSession;
    }
    if (reconnectedRuntimeSession || this.shouldRefreshLocalRunnerHeartbeat(session)) {
      session = this.withLocalRunnerHeartbeat(session, heartbeatNow);
      await this.writeRuntimeSession(member.id, session);
    }

    const requests = session.localRunnerBridge?.requests || [];
    const requestIndex = requests.findIndex((request) => request.status === 'PENDING');
    if (requestIndex < 0) {
      const syncFiles = session.localRunnerBridge?.syncFiles || [];
      if (syncFiles.length) {
        const now = new Date().toISOString();
        const syncedSession: AgentRuntimeSession = {
          ...session,
          updatedAt: now,
          localRunnerBridge: {
            ...(session.localRunnerBridge || { requests: [] }),
            requests,
            syncFiles: [],
            lastSeenAt: now,
            disconnectedAt: null,
            disconnectReason: null,
          },
        };
        await this.writeRuntimeSession(member.id, syncedSession);
        return {
          projectId,
          memberId: member.id,
          role: member.role,
          request: null,
          syncFiles,
          session: this.sanitizeRuntimeSession(syncedSession),
        };
      }
      return {
        projectId,
        memberId: member.id,
        role: member.role,
        request: null,
        session: this.sanitizeRuntimeSession(session),
      };
    }

    const now = new Date().toISOString();
    const nextRequest: AgentRuntimeLocalRunnerBridgeRequest = {
      ...requests[requestIndex],
      status: 'RUNNING',
      updatedAt: now,
    };
    const updatedRequests = [...requests];
    updatedRequests[requestIndex] = nextRequest;
    const updatedSession: AgentRuntimeSession = {
      ...session,
      status: 'TYPING',
      currentActivity: provider === 'local-codex'
        ? 'Local Codex is processing the message'
        : 'Local runner is processing the message',
      updatedAt: now,
      localRunnerBridge: {
        ...(session.localRunnerBridge || {}),
        requests: updatedRequests.slice(-20),
        lastSeenAt: now,
        disconnectedAt: null,
        disconnectReason: null,
      },
    };
    await this.writeRuntimeSession(member.id, updatedSession);
    this.publishAgentRuntimeSessionEvent(projectId, member.id, {
      type: 'session',
      role: member.role,
      requestId: nextRequest.id,
      message: updatedSession.currentActivity || undefined,
      session: this.sanitizeRuntimeSession(updatedSession),
    });

    return {
      projectId,
      memberId: member.id,
      role: member.role,
      request: {
        id: nextRequest.id,
        payload: nextRequest.payload,
        files: Array.isArray(nextRequest.files) ? nextRequest.files : [],
      },
      session: this.sanitizeRuntimeSession(updatedSession),
    };
  }

  async completeLocalRunnerAgentRuntimeRequest(
    projectId: string,
    memberId: string,
    userId: string,
    requestId: string,
    dto: {
      status?: 'COMPLETED' | 'ERROR';
      outputText?: string | null;
      statusText?: string | null;
      recentActions?: AgentRuntimeAction[];
      error?: string | null;
    },
  ) {
    return this.completeQueuedLocalRuntimeRequest(projectId, memberId, userId, requestId, 'local-runner', dto);
  }

  async completeLocalCodexAgentRuntimeRequest(
    projectId: string,
    memberId: string,
    userId: string,
    requestId: string,
    dto: {
      status?: 'COMPLETED' | 'ERROR';
      outputText?: string | null;
      statusText?: string | null;
      recentActions?: AgentRuntimeAction[];
      error?: string | null;
    },
  ) {
    return this.completeQueuedLocalRuntimeRequest(projectId, memberId, userId, requestId, 'local-codex', dto);
  }

  private async completeQueuedLocalRuntimeRequest(
    projectId: string,
    memberId: string,
    userId: string,
    requestId: string,
    provider: 'local-runner' | 'local-codex',
    dto: {
      status?: 'COMPLETED' | 'ERROR';
      outputText?: string | null;
      statusText?: string | null;
      recentActions?: AgentRuntimeAction[];
      error?: string | null;
    },
  ) {
    await this.ensureProjectManager(projectId, userId);
    const member = await this.prisma.projectMember.findFirst({
      where: { id: memberId, projectId, removedAt: null },
      select: { id: true, role: true, userId: true, permissions: true },
    });
    if (!member) throw new NotFoundException('Project member not found');
    const session = this.readRuntimeSession(member.permissions);
    if (!session || session.provider !== provider) {
      throw new BadRequestException(`This member does not have a ${provider} runtime`);
    }

    const requests = session.localRunnerBridge?.requests || [];
    const requestIndex = requests.findIndex((request) => request.id === requestId);
    if (requestIndex < 0) {
      throw new NotFoundException('Local runner request not found');
    }

    const failed = dto.status === 'ERROR' || Boolean(dto.error);
    const now = new Date().toISOString();
    const completedRequest: AgentRuntimeLocalRunnerBridgeRequest = {
      ...requests[requestIndex],
      status: failed ? 'ERROR' : 'COMPLETED',
      outputText: dto.outputText || requests[requestIndex].outputText || null,
      statusText: this.sanitizeLocalRunnerStatusText(dto.statusText) || requests[requestIndex].statusText || null,
      recentActions: Array.isArray(dto.recentActions) ? dto.recentActions.slice(-6) : [],
      error: dto.error || null,
      completedAt: now,
      updatedAt: now,
    };
    const updatedRequests = [...requests];
    updatedRequests[requestIndex] = completedRequest;
    const bridgeSession: AgentRuntimeSession = {
      ...session,
      localRunnerBridge: {
        ...(session.localRunnerBridge || {}),
        requests: updatedRequests.slice(-20),
        lastSeenAt: now,
        disconnectedAt: null,
        disconnectReason: null,
      },
    };
    const shouldFinalizeActiveRequest =
      session.activeRequestId === requestId ||
      (!session.activeRequestId && session.status === 'TYPING') ||
      this.shouldFinalizeLateLocalRunnerBridgeRequest(session, completedRequest);
    const updatedSession = shouldFinalizeActiveRequest
      ? this.finalizeLocalRunnerBridgeRequestSession(bridgeSession, completedRequest)
      : {
          ...bridgeSession,
          currentActivity: failed ? 'Local runner returned an error' : 'Local runner returned a response',
          lastError: dto.error || session.lastError || null,
          updatedAt: now,
        };
    await this.writeRuntimeSession(member.id, updatedSession);
    if (failed) {
      await this.failAssignmentForLocalRunnerRequest(
        projectId,
        member.userId,
        completedRequest,
        dto.error || updatedSession.lastError || 'Local runner returned an error',
      );
    }
    if (shouldFinalizeActiveRequest && !failed && completedRequest.outputText) {
      await this.ensureGitAutomationArtifacts(projectId, member.userId, updatedSession, completedRequest.outputText);
    }
    if (shouldFinalizeActiveRequest) {
      await this.agentWorkspaceClient
        .heartbeatRuntime(session.runtimeId, session.workspaceToken, {
          projectId,
          status: updatedSession.status === 'WAITING_CONFIRMATION' ? 'PAUSED' : updatedSession.status,
          message: updatedSession.currentActivity || updatedSession.status,
        })
        .catch(() => null);
    }
    this.publishAgentRuntimeSessionEvent(projectId, member.id, {
      type: failed ? 'error' : 'complete',
      role: member.role,
      requestId,
      message: updatedSession.currentActivity || undefined,
      session: this.sanitizeRuntimeSession(updatedSession),
    });

    return {
      projectId,
      memberId: member.id,
      role: member.role,
      request: {
        id: completedRequest.id,
        status: completedRequest.status,
      },
      session: this.sanitizeRuntimeSession(updatedSession),
    };
  }

  private assignmentRefsFromRuntimeMessage(input: string) {
    const assignmentId = /\bAssignment id:\s*([0-9a-f-]{32,36})\b/i.exec(input)?.[1];
    const workItemId = /\bWork item id:\s*([0-9a-f-]{32,36})\b/i.exec(input)?.[1];
    if (!assignmentId || !workItemId) return null;
    return { assignmentId, workItemId };
  }

  private localRunnerAssignmentRefs(request: AgentRuntimeLocalRunnerBridgeRequest) {
    const input = typeof request.payload?.input === 'string' ? request.payload.input : '';
    return this.assignmentRefsFromRuntimeMessage(input);
  }

  private async failAssignmentForLocalRunnerRequest(
    projectId: string,
    assigneeUserId: string,
    request: AgentRuntimeLocalRunnerBridgeRequest,
    error: string,
  ) {
    await this.failAssignmentForRuntimeMessageRefs(
      projectId,
      assigneeUserId,
      this.localRunnerAssignmentRefs(request),
      error,
    );
  }

  private async failAssignmentForRuntimeMessage(
    projectId: string,
    assigneeUserId: string,
    message: string,
    error: string,
  ) {
    await this.failAssignmentForRuntimeMessageRefs(
      projectId,
      assigneeUserId,
      this.assignmentRefsFromRuntimeMessage(message),
      error,
    );
  }

  private agentCommandErrorOutput(errorMessage: string) {
    const match = /^Agent command exited with \d+\.\n\n([\s\S]*)$/i.exec(errorMessage || '');
    return match?.[1]?.trim() || '';
  }

  private async completedAssignmentFromRuntimeMessage(
    projectId: string,
    assigneeUserId: string,
    message: string,
  ) {
    const refs = this.assignmentRefsFromRuntimeMessage(message);
    if (!refs) return null;
    return this.prisma.projectAssignment.findFirst({
      where: {
        id: refs.assignmentId,
        projectId,
        workItemId: refs.workItemId,
        assigneeUserId,
        status: 'COMPLETED' as any,
      },
      select: { id: true, workItemId: true },
    });
  }

  private async failAssignmentForRuntimeMessageRefs(
    projectId: string,
    assigneeUserId: string,
    refs: { assignmentId: string; workItemId: string } | null,
    error: string,
  ) {
    if (!refs) return;

    const assignment = await this.prisma.projectAssignment.findFirst({
      where: {
        id: refs.assignmentId,
        projectId,
        workItemId: refs.workItemId,
        assigneeUserId,
      },
      select: { id: true, status: true, contextPacket: true },
    });
    if (!assignment || !['PROPOSED', 'ACTIVE', 'PAUSED'].includes(assignment.status)) return;

    const runtimeFailureContext = await this.buildLocalRunnerFailureContext(projectId, assigneeUserId);
    const now = new Date();
    await this.prisma.projectAssignment.update({
      where: { id: assignment.id },
      data: {
        status: 'FAILED',
        finishedAt: now,
        contextPacket: this.withLocalRunnerFailureNote(assignment.contextPacket, error, runtimeFailureContext) as any,
      },
    });

    const openAssignments = await this.prisma.projectAssignment.count({
      where: {
        projectId,
        workItemId: refs.workItemId,
        status: { in: ['PROPOSED', 'ACTIVE', 'PAUSED'] as any },
      },
    });
    if (openAssignments === 0) {
      const project = (this.prisma.project as any)?.findUnique
        ? await this.prisma.project.findUnique({
            where: { id: projectId },
            select: { settings: true },
          }).catch(() => null)
        : null;
      const statusFlow = this.resolveProjectWorkItemStatusFlow(project?.settings);
      await this.prisma.projectWorkItem.update({
        where: { id: refs.workItemId },
        data: { status: statusFlow.assignmentFailedStatus },
      }).catch(() => null);
    }
  }

  private async buildLocalRunnerFailureContext(projectId: string, assigneeUserId: string) {
    const member = await this.prisma.projectMember.findFirst({
      where: { projectId, userId: assigneeUserId, removedAt: null },
      select: { id: true, permissions: true },
    });
    if (!member) return null;

    const session = this.readRuntimeSession(member.permissions);
    if (!session) {
      return { memberId: member.id };
    }

    const files = await this.agentRuntimeLauncher.listWorkspaceFiles(session, { maxDepth: 4 }).catch(() => []);
    const workspaceFiles = files
      .filter((file: AgentRuntimeWorkspaceFile) => file.path && !file.path.startsWith('.git/'))
      .slice(0, 80)
      .map((file: AgentRuntimeWorkspaceFile) => ({
        path: file.path,
        name: file.name,
        size: file.size,
        modifiedAt: file.modifiedAt || null,
        downloadUrl: `/api/public/projects/${projectId}/agent-runtimes/${member.id}/workspace/download?path=${encodeURIComponent(file.path)}`,
        ownerDownloadUrl: `/api/projects/${projectId}/agent-runtimes/${member.id}/workspace/download?path=${encodeURIComponent(file.path)}`,
      }));

    return {
      memberId: member.id,
      runtimeId: session.runtimeId,
      provider: session.provider,
      agentType: session.agentType || null,
      containerName: session.containerName || null,
      workspace: session.repoWorkspaceDir || '/opt/data/workspace',
      workspaceListEndpoint: `/api/public/projects/${projectId}/agent-runtimes/${member.id}/workspace?maxDepth=4`,
      ownerWorkspaceListEndpoint: `/api/projects/${projectId}/agent-runtimes/${member.id}/workspace?maxDepth=4`,
      workspaceFiles,
    };
  }

  private withLocalRunnerFailureNote(contextPacket: any, error: string, runtimeContext?: any) {
    const packet = contextPacket && typeof contextPacket === 'object' && !Array.isArray(contextPacket)
      ? { ...contextPacket }
      : {};
    return {
      ...packet,
      localRunnerFailure: {
        error: String(error || 'Local runner returned an error').slice(0, 1000),
        failedAt: new Date().toISOString(),
        ...(runtimeContext ? { runtime: runtimeContext } : {}),
      },
    };
  }

  async sendAgentRuntimeMessage(
    projectId: string,
    memberId: string,
    userId: string,
    dto: SendProjectAgentMessageDto,
  ) {
    await this.ensureProjectAccess(projectId, userId);
    const lockKey = `${projectId}:${memberId}`;
    if (this.agentRuntimeMessageSendLocks.has(lockKey)) {
      throw new BadRequestException('This agent is still accepting the previous message');
    }
    this.agentRuntimeMessageSendLocks.add(lockKey);
    try {
    const member = await this.prisma.projectMember.findFirst({
      where: { id: memberId, projectId, removedAt: null },
      include: {
        user: { select: { id: true, email: true, displayName: true, role: true } },
      },
    });
    if (!member) throw new NotFoundException('Project member not found');
    const senderMember = await this.prisma.projectMember.findFirst({
      where: { projectId, userId, removedAt: null },
      include: {
        user: { select: { id: true, email: true, displayName: true, role: true } },
      },
    });

    const rawSession = this.readRuntimeSession(member.permissions);
    const session = rawSession ? this.recoverPersistedRuntimeSession(rawSession) : null;
    if (!session) {
      throw new BadRequestException('This member does not have a launched runtime');
    }
    const requestedSteer = dto.delivery === 'steer';
    if (this.runtimeHasOngoingConversation(session) && !(requestedSteer && this.runtimeCanAcceptSteer(session, dto.conversationId))) {
      throw new BadRequestException('This agent is still working on the previous message');
    }
    const conversationSession = this.selectRuntimeConversation(session, dto.conversationId);
    if (rawSession !== session) {
      await this.writeRuntimeSession(member.id, conversationSession);
    }

    const projectRecord = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { settings: true },
    });
    const projectGithubUrl = this.getProjectGithubUrl(projectRecord?.settings);
    const projectGlobals = await this.resolveProjectGlobalVariables(projectId, projectRecord?.settings);
    const runtimeProjectGlobals = await this.visibleProjectGlobalsForRuntime(projectId, member, projectGlobals);
    const refreshedToken = await this.agentWorkspaceClient.mintAccessToken(conversationSession.grantId);
    const agentDisplayName = this.agentDisplayNameForMember(member);
    const preparedSession: AgentRuntimeSession = {
      ...conversationSession,
      agentDisplayName: conversationSession.agentDisplayName || agentDisplayName,
      projectGithubUrl: projectGithubUrl ?? conversationSession.projectGithubUrl ?? null,
      projectGlobalKeys: runtimeProjectGlobals.map((global) => global.key),
      workspaceToken: refreshedToken.token,
      updatedAt: new Date().toISOString(),
    };
    if (!this.isQueuedLocalRuntimeProvider(preparedSession.provider)) {
      await this.agentRuntimeLauncher.syncWorkspaceContext(preparedSession, {
        projectId,
        memberId: member.id,
        userId: member.userId,
        role: member.role,
        agentDisplayName: conversationSession.agentDisplayName || agentDisplayName,
        workspaceBaseUrl: this.agentWorkspaceClient.getConfiguredBaseUrl(),
        projectGlobals: runtimeProjectGlobals,
      });
    }

    if (requestedSteer && this.runtimeCanAcceptSteer(preparedSession, dto.conversationId)) {
      return this.sendAgentRuntimeSteerMessage(
        projectId,
        member,
        senderMember,
        preparedSession,
        dto.message,
        runtimeProjectGlobals,
        userId,
      );
    }

    const activeRequestId = randomUUID();
    const activeRequestStartedAt = new Date().toISOString();
    const typingSession: AgentRuntimeSession = {
      ...preparedSession,
      status: 'TYPING',
      activeRequestId,
      activeRequestConversationId: preparedSession.activeConversationId || null,
      activeRequestStartedAt,
      lastMessageAt: activeRequestStartedAt,
      lastStreamAt: null,
      updatedAt: activeRequestStartedAt,
      lastError: null,
      currentActivity: `Reading context and responding to: ${dto.message.slice(0, 120)}`,
      recentActions: [],
      messageHistory: this.appendRuntimeMessage(preparedSession, 'user', dto.message, 'SENT'),
    };
    await this.writeRuntimeSession(member.id, typingSession);
    await this.agentWorkspaceClient.recordProjectEvent(projectId, {
      type: 'AGENT_RUNTIME_MESSAGE_SENT',
      refType: 'AGENT_RUNTIME_CONVERSATION',
      refId: typingSession.activeRequestConversationId || typingSession.activeConversationId || activeRequestId,
      actorUserId: userId,
      payload: {
        requestId: activeRequestId,
        conversationId: typingSession.activeRequestConversationId || typingSession.activeConversationId || null,
        senderMemberId: senderMember?.id ?? null,
        senderRole: senderMember?.role ?? null,
        targetMemberId: member.id,
        targetMemberIds: [member.id],
        targetRole: member.role,
        targetUserId: member.userId,
        targetRuntimeId: typingSession.runtimeId,
        targetRuntimeProvider: typingSession.provider,
        targetRuntimeAgentType: typingSession.agentType ?? null,
        messageLength: dto.message.length,
        summary: 'Message delivered to agent runtime',
      },
    }).catch((error: any) => {
      this.logger.warn(`Failed to record project agent message event for ${projectId}/${member.id}: ${error?.message || error}`);
    });
    this.publishAgentRuntimeSessionEvent(projectId, member.id, {
      type: 'session',
      role: member.role,
      requestId: activeRequestId,
      message: typingSession.currentActivity || undefined,
      session: this.sanitizeRuntimeSession(typingSession),
    });
    this.processAgentRuntimeMessage(projectId, member, typingSession, dto.message, activeRequestId, runtimeProjectGlobals).catch((error) => {
      this.logger.error(
        `Unhandled agent runtime message failure for member ${member.id}: ${error?.message || error}`,
        error?.stack,
      );
    });

    return {
      memberId: member.id,
      role: member.role,
      accepted: true,
      session: this.sanitizeRuntimeSession(typingSession),
      response: 'Message delivered. Agent is working in the background.',
    };
    } finally {
      this.agentRuntimeMessageSendLocks.delete(lockKey);
    }
  }

  private async sendAgentRuntimeSteerMessage(
    projectId: string,
    member: {
      id: string;
      role: string;
      userId: string;
      user: { id: string; email: string; displayName: string | null; role: string };
    },
    senderMember: {
      id: string;
      role: string;
      user: { id: string; email: string; displayName: string | null; role: string };
    } | null,
    session: AgentRuntimeSession,
    message: string,
    projectGlobals: Array<{
      key: string;
      label?: string | null;
      description?: string | null;
      value?: string | null;
      isSecret?: boolean;
    }>,
    actorUserId: string,
  ) {
    const now = new Date().toISOString();
    const steerRequestId = randomUUID();
    const requestConversationId = session.activeRequestConversationId || session.activeConversationId || null;
    const targetSession = this.selectRuntimeConversation(session, requestConversationId);
    const steerMessage: AgentRuntimeMessage = {
      id: `steer-${steerRequestId}`,
      role: 'user',
      content: message,
      createdAt: now,
      status: 'STEERING',
    };
    const steerSession: AgentRuntimeSession = this.updateRuntimeConversationHistory(
      session,
      requestConversationId,
      this.upsertRuntimeMessage(targetSession, steerMessage),
      {
        status: 'TYPING',
        activeRequestId: session.activeRequestId || null,
        activeRequestConversationId: requestConversationId,
        lastMessageAt: now,
        updatedAt: now,
        currentActivity: `Steering queued: ${message.slice(0, 120)}`,
        lastError: null,
      },
    );
    await this.writeRuntimeSession(member.id, steerSession);
    await this.agentWorkspaceClient.recordProjectEvent(projectId, {
      type: 'AGENT_RUNTIME_MESSAGE_SENT',
      refType: 'AGENT_RUNTIME_CONVERSATION',
      refId: requestConversationId || steerRequestId,
      actorUserId,
      payload: {
        requestId: steerRequestId,
        conversationId: requestConversationId,
        delivery: 'steer',
        senderMemberId: senderMember?.id ?? null,
        senderRole: senderMember?.role ?? null,
        targetMemberId: member.id,
        targetMemberIds: [member.id],
        targetRole: member.role,
        targetUserId: member.userId,
        targetRuntimeId: steerSession.runtimeId,
        targetRuntimeProvider: steerSession.provider,
        targetRuntimeAgentType: steerSession.agentType ?? null,
        messageLength: message.length,
        summary: 'Steering message delivered to agent runtime',
      },
    }).catch((error: any) => {
      this.logger.warn(`Failed to record project agent steer event for ${projectId}/${member.id}: ${error?.message || error}`);
    });
    this.publishAgentRuntimeSessionEvent(projectId, member.id, {
      type: 'session',
      role: member.role,
      requestId: steerRequestId,
      message: steerSession.currentActivity || undefined,
      session: this.sanitizeRuntimeSession(steerSession),
    });

    this.runtimeSystemPrompt(projectId, member.role, steerSession)
      .then((systemPrompt) =>
        this.agentRuntimeLauncher.sendMessage(steerSession, message, systemPrompt, {
          timeoutMs: this.agentRuntimeChatTimeoutMs(),
          requestId: steerRequestId,
          retries: 1,
          streamingBehavior: 'steer',
        }),
      )
      .catch((error: any) => {
        this.logger.warn(`Failed to steer Pi runtime for member ${member.id}: ${error?.message || error}`);
      });

    return {
      memberId: member.id,
      role: member.role,
      accepted: true,
      session: this.sanitizeRuntimeSession(steerSession),
      response: 'Steering message queued. The agent will receive it before the next model turn.',
    };
  }

  private runtimePollingConversationTitle(date: Date) {
    return `polling ${date.toISOString().slice(11, 16)}`;
  }

  async createAgentRuntimeConversation(
    projectId: string,
    memberId: string,
    userId: string,
    options?: { title?: string; titleLocked?: boolean },
  ) {
    await this.ensureProjectAccess(projectId, userId);
    const member = await this.prisma.projectMember.findFirst({
      where: { id: memberId, projectId, removedAt: null },
      select: { id: true, role: true, permissions: true },
    });
    if (!member) throw new NotFoundException('Project member not found');

    const rawSession = this.readRuntimeSession(member.permissions);
    const session = rawSession ? this.recoverPersistedRuntimeSession(rawSession) : null;
    if (!session) {
      throw new BadRequestException('This member does not have a launched runtime');
    }
    if (session.status === 'TYPING') {
      throw new BadRequestException('Wait for the current agent response before starting a new conversation');
    }
    if (rawSession !== session) {
      await this.writeRuntimeSession(member.id, session);
    }

    const normalized = this.normalizeRuntimeSessionConversations(session);
    const now = new Date().toISOString();
    const conversation: AgentRuntimeConversation = {
      id: randomUUID(),
      title: (options?.title || 'New conversation').trim(),
      titleLocked: Boolean(options?.titleLocked),
      createdAt: now,
      updatedAt: now,
      messageHistory: [],
    };
    const updatedSession: AgentRuntimeSession = {
      ...normalized,
      activeConversationId: conversation.id,
      conversations: [conversation, ...(normalized.conversations || [])],
      messageHistory: [],
      updatedAt: now,
      currentActivity:
        normalized.status === 'TYPING'
          ? 'New conversation ready; agent is still responding in another chat'
          : 'New conversation ready',
      lastError: null,
    };
    await this.writeRuntimeSession(member.id, updatedSession);
    this.publishAgentRuntimeSessionEvent(projectId, member.id, {
      type: 'session',
      role: member.role,
      message: updatedSession.currentActivity || undefined,
      session: this.sanitizeRuntimeSession(updatedSession),
    });

    return {
      memberId: member.id,
      role: member.role,
      conversation,
      session: this.sanitizeRuntimeSession(updatedSession),
      response: 'New conversation started.',
    };
  }

  async updateAgentRuntimeConversation(
    projectId: string,
    memberId: string,
    conversationId: string,
    userId: string,
    dto: UpdateProjectAgentRuntimeConversationDto,
  ) {
    await this.ensureProjectAccess(projectId, userId);
    const member = await this.prisma.projectMember.findFirst({
      where: { id: memberId, projectId, removedAt: null },
      select: { id: true, role: true, permissions: true },
    });
    if (!member) throw new NotFoundException('Project member not found');

    const session = this.readRuntimeSession(member.permissions);
    if (!session) throw new BadRequestException('This member does not have a launched runtime');

    const normalized = this.normalizeRuntimeSessionConversations(session);
    const title = (dto.title || '').replace(/\s+/g, ' ').trim();
    if (!title) throw new BadRequestException('Conversation title is required');

    const updatedAt = new Date().toISOString();
    let foundConversation = false;
    const conversations = (normalized.conversations || []).map((conversation) => {
      if (conversation.id !== conversationId) return conversation;
      foundConversation = true;
      return {
        ...conversation,
        title: Array.from(title).slice(0, 80).join(''),
        titleLocked: true,
        updatedAt,
      };
    });
    const updatedConversation = conversations.find((conversation) => conversation.id === conversationId);
    if (!foundConversation || !updatedConversation) {
      throw new NotFoundException('Conversation session not found for this agent');
    }

    const updatedSession: AgentRuntimeSession = {
      ...normalized,
      conversations,
      messageHistory:
        normalized.activeConversationId === conversationId
          ? updatedConversation.messageHistory
          : normalized.messageHistory,
      updatedAt,
    };
    await this.writeRuntimeSession(member.id, updatedSession);
    this.publishAgentRuntimeSessionEvent(projectId, member.id, {
      type: 'session',
      role: member.role,
      message: 'Conversation renamed',
      session: this.sanitizeRuntimeSession(updatedSession),
    });

    return {
      memberId: member.id,
      role: member.role,
      conversation: updatedConversation,
      session: this.sanitizeRuntimeSession(updatedSession),
      response: 'Conversation renamed.',
    };
  }

  async deleteAgentRuntimeConversation(
    projectId: string,
    memberId: string,
    conversationId: string,
    userId: string,
  ) {
    await this.ensureProjectAccess(projectId, userId);
    const member = await this.prisma.projectMember.findFirst({
      where: { id: memberId, projectId, removedAt: null },
      select: { id: true, role: true, permissions: true },
    });
    if (!member) throw new NotFoundException('Project member not found');

    const session = this.readRuntimeSession(member.permissions);
    if (!session) throw new BadRequestException('This member does not have a launched runtime');
    if (session.status === 'TYPING' && session.activeRequestConversationId === conversationId) {
      throw new BadRequestException('Wait for the current response before deleting this conversation');
    }

    const normalized = this.normalizeRuntimeSessionConversations(session);
    const conversations = (normalized.conversations || []).filter((conversation) => conversation.id !== conversationId);
    if (conversations.length === (normalized.conversations || []).length) {
      throw new NotFoundException('Conversation session not found for this agent');
    }

    const now = new Date().toISOString();
    const finalConversations = conversations.length
      ? conversations
      : [
          {
            id: randomUUID(),
            title: 'New conversation',
            titleLocked: false,
            createdAt: now,
            updatedAt: now,
            messageHistory: [],
          },
        ];
    const activeConversationId =
      normalized.activeConversationId === conversationId
        ? finalConversations[0].id
        : normalized.activeConversationId || finalConversations[0].id;
    const activeConversation =
      finalConversations.find((conversation) => conversation.id === activeConversationId) ||
      finalConversations[0];
    const updatedSession: AgentRuntimeSession = {
      ...normalized,
      activeConversationId: activeConversation.id,
      conversations: finalConversations,
      messageHistory: activeConversation.messageHistory || [],
      updatedAt: now,
    };
    await this.writeRuntimeSession(member.id, updatedSession);
    this.publishAgentRuntimeSessionEvent(projectId, member.id, {
      type: 'session',
      role: member.role,
      message: 'Conversation deleted',
      session: this.sanitizeRuntimeSession(updatedSession),
    });

    return {
      memberId: member.id,
      role: member.role,
      deletedConversationId: conversationId,
      session: this.sanitizeRuntimeSession(updatedSession),
      response: 'Conversation deleted.',
    };
  }

  async updateAgentRuntimePollingConfig(
    projectId: string,
    memberId: string,
    userId: string,
    dto: UpdateProjectAgentPollingConfigDto,
  ) {
    await this.ensureProjectManager(projectId, userId);
    const member = await this.prisma.projectMember.findFirst({
      where: { id: memberId, projectId, removedAt: null },
      select: { id: true, role: true, permissions: true },
    });
    if (!member) throw new NotFoundException('Project member not found');

    const previousConfig = await this.agentPollingConfigForRole(member.role, this.readAgentPollingConfig(member.permissions));
    const config = await this.agentPollingConfigForRole(member.role, {
      ...previousConfig,
      ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
      ...(dto.strategy !== undefined ? { strategy: dto.strategy } : {}),
      ...(dto.intervalMinutes !== undefined ? { intervalMinutes: dto.intervalMinutes } : {}),
      ...(dto.message !== undefined ? { message: dto.message } : {}),
    });
    const basePermissions =
      member.permissions && typeof member.permissions === 'object' && !Array.isArray(member.permissions)
        ? member.permissions as Record<string, any>
        : {};
    const session = this.readRuntimeSession(basePermissions);
    const now = new Date();
    const pollingState: AgentRuntimePollingState = {
      ...(session?.pollingState || {}),
      nextRunAt: config.enabled ? this.nextAgentPollingRunAt(config, now) : null,
      lastError: null,
    };
    const nextPermissions = {
      ...basePermissions,
      agentPollingConfig: config,
      ...(session
        ? {
            runtimeSession: this.normalizeRuntimeSessionConversations({
              ...session,
              pollingConfig: config,
              pollingState,
              updatedAt: now.toISOString(),
            }),
          }
        : {}),
    };

    await this.prisma.projectMember.update({
      where: { id: member.id },
      data: { permissions: nextPermissions },
    });

    const updatedSession = nextPermissions.runtimeSession
      ? this.sanitizeRuntimeSession(nextPermissions.runtimeSession as AgentRuntimeSession)
      : null;
    if (updatedSession) {
      this.publishAgentRuntimeSessionEvent(projectId, member.id, {
        type: 'session',
        role: member.role,
        message: config.enabled ? 'Agent polling enabled' : 'Agent polling disabled',
        session: updatedSession,
      });
    }

    return {
      memberId: member.id,
      role: member.role,
      config,
      pollingState,
      session: updatedSession,
      response: config.enabled ? 'Agent polling enabled.' : 'Agent polling disabled.',
    };
  }

  async tickAgentRuntimePolling(
    projectId: string,
    memberId: string,
    userId: string,
    options: { force?: boolean; summary?: boolean } = {},
  ) {
    const lockKey = `${projectId}:${memberId}`;
    if (this.agentRuntimePollingTickLocks.has(lockKey)) {
      return {
        memberId,
        triggered: false,
        reason: 'Polling tick already in progress.',
      };
    }
    this.agentRuntimePollingTickLocks.add(lockKey);
    try {
      return await this.tickAgentRuntimePollingUnlocked(projectId, memberId, userId, options);
    } finally {
      this.agentRuntimePollingTickLocks.delete(lockKey);
    }
  }

  private agentPollingRuntimeNeedsReconnect(session: AgentRuntimeSession) {
    const provider = String(session.provider || '');
    if (!['local-docker', 'local-runner', 'local-codex'].includes(provider)) return false;
    if (this.runtimeHasOngoingConversation(session)) return false;
    const status = String(session.status || '').toUpperCase();
    if (status === 'STOPPED' || status === 'ERROR') return true;
    if ((session as any).apiHealth?.ok === false) return true;
    if ((session as any).dockerStatus?.running === false) return true;
    return false;
  }

  private async tickAgentRuntimePollingUnlocked(
    projectId: string,
    memberId: string,
    userId: string,
    options: { force?: boolean; summary?: boolean } = {},
  ) {
    await this.ensureProjectAccess(projectId, userId);
    const member = await this.prisma.projectMember.findFirst({
      where: { id: memberId, projectId, removedAt: null },
      select: { id: true, role: true, permissions: true },
    });
    if (!member) throw new NotFoundException('Project member not found');
    const rawSession = this.readRuntimeSession(member.permissions);
    const session = rawSession ? this.recoverPersistedRuntimeSession(rawSession) : null;
    if (!session) throw new BadRequestException('This member does not have a launched runtime');
    if (rawSession !== session) {
      await this.writeRuntimeSession(member.id, session);
    }

    const explicitPollingConfig = this.readAgentPollingConfig(member.permissions);
    const config = await this.agentPollingConfigForRole(
      member.role,
      explicitPollingConfig || (member.role === 'LEAD_AGENT' ? null : session.pollingConfig),
    );
    if (!config.enabled && !options.force) {
      return { memberId: member.id, role: member.role, triggered: false, reason: 'Polling is disabled.', config };
    }

    const inspectedSession = await this.agentRuntimeLauncher.inspect(session).catch(() => session);
    let inspected = this.recoverPersistedRuntimeSession(inspectedSession);
    if (options.force && this.agentPollingRuntimeNeedsReconnect(inspected)) {
      const reconnectResult = await this.reconnectAgentRuntime(projectId, member.id, userId).catch((error: any) => {
        this.logger.warn(`Forced polling reconnect failed for ${projectId}/${member.id}: ${error?.message || error}`);
        return null;
      });
      const reconnectedSession = (reconnectResult as any)?.session || null;
      if (reconnectedSession) {
        inspected = this.recoverPersistedRuntimeSession(reconnectedSession as AgentRuntimeSession);
      } else {
        const latestSession = await this.latestRuntimeSessionForMember(member.id);
        if (latestSession) {
          inspected = this.recoverPersistedRuntimeSession(latestSession);
        }
      }
      inspected = this.recoverPersistedRuntimeSession(
        await this.agentRuntimeLauncher.inspect(inspected).catch(() => inspected),
      );
    }
    const currentState = this.completedPollingState(inspected, config, inspected.pollingState || {});
    const now = new Date();
    const nextRunAt = currentState.nextRunAt ? new Date(currentState.nextRunAt).getTime() : 0;
    if (!options.force && nextRunAt && nextRunAt > now.getTime()) {
      if (currentState !== inspected.pollingState) {
        await this.writeRuntimeSession(member.id, {
          ...inspected,
          pollingConfig: config,
          pollingState: currentState,
          updatedAt: now.toISOString(),
        });
      }
      return {
        memberId: member.id,
        role: member.role,
        triggered: false,
        reason: 'Polling is not due yet.',
        config,
        pollingState: currentState,
        session: options.summary ? this.compactRuntimeSession(inspected) : this.sanitizeRuntimeSession(inspected),
      };
    }
    const lastRunAt = currentState.lastRunAt ? new Date(currentState.lastRunAt).getTime() : 0;
    if (!options.force && lastRunAt && Number.isFinite(lastRunAt) && now.getTime() - lastRunAt < 20_000) {
      const deferredSession: AgentRuntimeSession = {
        ...inspected,
        pollingConfig: config,
        pollingState: currentState,
        updatedAt: now.toISOString(),
      };
      await this.writeRuntimeSession(member.id, deferredSession);
      return {
        memberId: member.id,
        role: member.role,
        triggered: false,
        reason: 'Polling was recently triggered.',
        config,
        pollingState: currentState,
        session: options.summary ? this.compactRuntimeSession(deferredSession) : this.sanitizeRuntimeSession(deferredSession),
      };
    }
    const apiOk = (inspected as any).apiHealth?.ok !== false;
    const dockerRunning = (inspected as any).dockerStatus?.running !== false;
    if (config.strategy === 'IDLE_ONLY' && (!apiOk || !dockerRunning)) {
      const pollingState: AgentRuntimePollingState = {
        ...currentState,
        nextRunAt: this.nextAgentPollingRunAt({ ...config, intervalMinutes: 1 }, now),
        lastError: 'Runtime is not reachable.',
      };
      const deferredSession: AgentRuntimeSession = {
        ...inspected,
        pollingConfig: config,
        pollingState,
        updatedAt: now.toISOString(),
      };
      await this.writeRuntimeSession(member.id, deferredSession);
      return {
        memberId: member.id,
        role: member.role,
        triggered: false,
        reason: 'Runtime is not reachable.',
        config,
        pollingState,
        session: options.summary ? this.compactRuntimeSession(deferredSession) : this.sanitizeRuntimeSession(deferredSession),
      };
    }

    if (this.runtimeHasOngoingConversation(inspected)) {
      const pollingState: AgentRuntimePollingState = {
        ...currentState,
        nextRunAt: this.nextAgentPollingRunAt(config, now),
        lastError: null,
      };
      const deferredSession: AgentRuntimeSession = {
        ...inspected,
        pollingConfig: config,
        pollingState,
        updatedAt: now.toISOString(),
      };
      await this.writeRuntimeSession(member.id, deferredSession);
      return {
        memberId: member.id,
        role: member.role,
        triggered: false,
        reason: 'Agent is still working; polling deferred to the next cycle.',
        config,
        pollingState,
        session: options.summary ? this.compactRuntimeSession(deferredSession) : this.sanitizeRuntimeSession(deferredSession),
      };
    }

    const pollingState: AgentRuntimePollingState = {
      ...currentState,
      lastRunAt: now.toISOString(),
      lastCompletedAt: null,
      nextRunAt: null,
      lastError: null,
    };
    await this.writeRuntimeSession(member.id, {
      ...inspected,
      pollingConfig: config,
      pollingState,
      updatedAt: now.toISOString(),
    });

    const conversationResult = await this.createAgentRuntimeConversation(projectId, member.id, userId, {
      title: this.runtimePollingConversationTitle(now),
      titleLocked: true,
    });
    const messageResult = await this.sendAgentRuntimeMessage(projectId, member.id, userId, {
      message: this.agentPollingMessage(config),
      conversationId: conversationResult.conversation.id,
    });
    const latestSession = await this.latestRuntimeSessionForMember(member.id);
    const baseFinalSession = (latestSession || messageResult.session) as AgentRuntimeSession;
    const finalSession: AgentRuntimeSession = {
      ...baseFinalSession,
      pollingConfig: config,
      pollingState: {
        ...pollingState,
        lastConversationId: conversationResult.conversation.id,
      },
    };
    await this.writeRuntimeSession(member.id, finalSession);

    return {
      memberId: member.id,
      role: member.role,
      triggered: true,
      config,
      pollingState: finalSession.pollingState,
      conversation: conversationResult.conversation,
      session: options.summary ? this.compactRuntimeSession(finalSession) : this.sanitizeRuntimeSession(finalSession),
      response: 'Polling message delivered in a new conversation.',
    };
  }

  async cancelAgentRuntimeMessage(
    projectId: string,
    memberId: string,
    userId: string,
    options: { summary?: boolean } = {},
  ) {
    await this.ensureProjectAccess(projectId, userId);
    const member = await this.prisma.projectMember.findFirst({
      where: { id: memberId, projectId, removedAt: null },
      select: { id: true, role: true, permissions: true },
    });
    if (!member) throw new NotFoundException('Project member not found');

    const session = this.readRuntimeSession(member.permissions);
    if (!session) {
      throw new BadRequestException('This member does not have a launched runtime');
    }

    const cancelled = this.agentRuntimeLauncher.cancelMessage(session);
    const cancelledMessage = cancelled
      ? 'Current agent response was cancelled.'
      : 'No live server-side stream was found; the runtime state was reset.';
    const requestConversationId = session.activeRequestConversationId || session.activeConversationId;
    const targetSession = this.selectRuntimeConversation(session, requestConversationId);
    const bridgeSession = this.failQueuedLocalRuntimeBridgeRequest(
      session,
      session.activeRequestId,
      cancelledMessage,
    );
    const updatedSession: AgentRuntimeSession = this.updateRuntimeConversationHistory(
      bridgeSession,
      requestConversationId,
      this.appendRuntimeMessage(targetSession, 'system', cancelledMessage, 'WARNING'),
      {
        status: 'IDLE',
        activeRequestId: null,
        activeRequestStartedAt: null,
        activeRequestConversationId: null,
        updatedAt: new Date().toISOString(),
        currentActivity: cancelled ? 'Response cancelled by owner' : 'Recovered from a missing background stream',
        lastError: cancelledMessage,
      },
    );
    await this.writeRuntimeSession(member.id, updatedSession);
    this.publishAgentRuntimeSessionEvent(projectId, member.id, {
      type: 'cancelled',
      role: member.role,
      message: cancelledMessage,
      session: this.sanitizeRuntimeSession(updatedSession),
    });
    return {
      memberId: member.id,
      role: member.role,
      cancelled,
      session: options.summary ? this.compactRuntimeSession(updatedSession) : this.sanitizeRuntimeSession(updatedSession),
      response: cancelledMessage,
    };
  }

  async listAgentRuntimeWorkspaceFiles(projectId: string, memberId: string, userId: string, maxDepth?: number) {
    await this.ensureProjectAccess(projectId, userId);
    return this.listAgentRuntimeWorkspaceFilesInternal(projectId, memberId, maxDepth, '/api/projects');
  }

  private async listAgentRuntimeWorkspaceFilesInternal(
    projectId: string,
    memberId: string,
    maxDepth?: number,
    routePrefix = '/api/projects',
  ) {
    const member = await this.prisma.projectMember.findFirst({
      where: { id: memberId, projectId, removedAt: null },
      select: { id: true, permissions: true },
    });
    if (!member) {
      throw new NotFoundException('Project member not found');
    }
    const session = this.readRuntimeSession(member.permissions);
    if (!session) {
      throw new BadRequestException('Agent runtime is not launched');
    }
    const files = await this.agentRuntimeLauncher.listWorkspaceFiles(session, { maxDepth });
    return {
      projectId,
      memberId,
      workspace: session.repoWorkspaceDir || '/opt/data/workspace',
      files: files.map((file) => ({
        ...file,
        downloadUrl: `${routePrefix}/${projectId}/agent-runtimes/${memberId}/workspace/download?path=${encodeURIComponent(file.path)}`,
      })),
    };
  }

  async downloadAgentRuntimeWorkspaceFile(projectId: string, memberId: string, userId: string, filePath: string) {
    await this.ensureProjectAccess(projectId, userId);
    return this.downloadAgentRuntimeWorkspaceFileInternal(projectId, memberId, filePath);
  }

  private async downloadAgentRuntimeWorkspaceFileInternal(projectId: string, memberId: string, filePath: string) {
    const member = await this.prisma.projectMember.findFirst({
      where: { id: memberId, projectId, removedAt: null },
      select: { id: true, permissions: true },
    });
    if (!member) {
      throw new NotFoundException('Project member not found');
    }
    const session = this.readRuntimeSession(member.permissions);
    if (!session) {
      throw new BadRequestException('Agent runtime is not launched');
    }
    try {
      return await this.agentRuntimeLauncher.downloadWorkspaceFile(session, filePath);
    } catch (error: any) {
      const message = String(error?.message || error || '');
      if (/invalid workspace file path/i.test(message)) {
        throw new BadRequestException('Invalid workspace file path');
      }
      throw new NotFoundException('Workspace file not found');
    }
  }

  private runtimeBearerToken(rawAuthorization?: string | null) {
    const value = String(rawAuthorization || '').trim();
    const match = /^Bearer\s+(.+)$/i.exec(value);
    return match?.[1]?.trim() || '';
  }

  private async authorizeRuntimeWorkspaceAccess(
    projectId: string,
    targetMemberId: string,
    rawAuthorization?: string | null,
  ) {
    const runtime = await this.authenticateProjectRuntimeToken(
      projectId,
      this.runtimeBearerToken(rawAuthorization),
      ['PROJECT_MEMBER_READ'],
    );
    if (runtime.memberId !== targetMemberId && runtime.role !== 'LEAD_AGENT') {
      throw new ForbiddenException('Only a lead runtime can inspect another agent runtime workspace');
    }
    return runtime;
  }

  async listAgentRuntimeWorkspaceFilesForRuntime(
    projectId: string,
    memberId: string,
    rawAuthorization?: string | null,
    maxDepth?: number,
  ) {
    await this.authorizeRuntimeWorkspaceAccess(projectId, memberId, rawAuthorization);
    return this.listAgentRuntimeWorkspaceFilesInternal(projectId, memberId, maxDepth, '/api/public/projects');
  }

  async downloadAgentRuntimeWorkspaceFileForRuntime(
    projectId: string,
    memberId: string,
    rawAuthorization: string | null | undefined,
    filePath: string,
  ) {
    await this.authorizeRuntimeWorkspaceAccess(projectId, memberId, rawAuthorization);
    return this.downloadAgentRuntimeWorkspaceFileInternal(projectId, memberId, filePath);
  }

  private async processAgentRuntimeMessage(
    projectId: string,
    member: {
      id: string;
      role: string;
      userId: string;
    },
    typingSession: AgentRuntimeSession,
    message: string,
    activeRequestId: string,
    projectGlobals: Array<{
      key: string;
      label?: string | null;
      description?: string | null;
      value?: string | null;
      isSecret?: boolean;
    }> = [],
  ) {
    const requestConversationId = typingSession.activeRequestConversationId || typingSession.activeConversationId;
    const queuedLocalRuntime = this.isQueuedLocalRuntimeProvider(typingSession.provider);
    const queuedLocalPrefix = typingSession.provider === 'local-codex' ? 'local-codex' : 'local-runner';
    const assistantMessageId = queuedLocalRuntime
      ? `${queuedLocalPrefix}-${activeRequestId}-assistant`
      : `agent-runtime-${activeRequestId}-assistant`;
    const streamingAssistantMessage: AgentRuntimeMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      createdAt: new Date().toISOString(),
      status: 'TYPING',
    };
    let partialSession: AgentRuntimeSession = typingSession;
    let lastPartialWriteAt = 0;
    let lastPublishedPartialText = '';
    const startedAtMs = (() => {
      const rawStartedAt =
        typingSession.activeRequestStartedAt ||
        typingSession.lastMessageAt ||
        streamingAssistantMessage.createdAt;
      const parsed = Date.parse(rawStartedAt || '');
      return Number.isFinite(parsed) ? parsed : Date.now();
    })();
    const progressHeartbeatMs = this.agentRuntimeProgressHeartbeatMs();
    let runtimeProgressTimer: ReturnType<typeof setInterval> | null = null;
    let lastRuntimeProgressWriteAt = 0;
    let runtimeProgressStopped = false;
    const persistPartialResponse = async (text: string, force = false) => {
      if (!text.trim()) return;
      const now = Date.now();
      if (!force && now - lastPartialWriteAt < 700) return;
      if (!force && !this.shouldPublishPartialRuntimeResponse(lastPublishedPartialText, text)) return;
      lastPartialWriteAt = now;
      lastPublishedPartialText = text;
      streamingAssistantMessage.content = text;
      streamingAssistantMessage.status = 'TYPING';
      const latestSession = (await this.latestRuntimeSessionForMember(member.id).catch(() => null)) || partialSession;
      const targetSession = this.selectRuntimeConversation(latestSession, requestConversationId);
      partialSession = this.updateRuntimeConversationHistory(
        latestSession,
        requestConversationId,
        this.upsertRuntimeMessage(targetSession, streamingAssistantMessage),
        this.activeRequestScopedUpdates(latestSession, activeRequestId, {
          status: 'TYPING',
          activeRequestId,
          activeRequestStartedAt:
            latestSession.activeRequestStartedAt ||
            partialSession.activeRequestStartedAt ||
            typingSession.activeRequestStartedAt ||
            typingSession.lastMessageAt ||
            null,
          activeRequestConversationId: requestConversationId || null,
          lastStreamAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          currentActivity: 'Streaming response',
        }),
      );
      await this.writeRuntimeSession(member.id, partialSession);
      this.publishAgentRuntimeSessionEvent(projectId, member.id, {
        type: 'progress',
        role: member.role,
        requestId: activeRequestId,
        message: partialSession.currentActivity || undefined,
        session: this.sanitizeRuntimeSession(partialSession),
      });
    };
    const publishRuntimeProgressHeartbeat = async () => {
      if (runtimeProgressStopped) return;
      const nowMs = Date.now();
      if (nowMs - lastRuntimeProgressWriteAt < progressHeartbeatMs - 250) return;
      const latestSession = (await this.latestRuntimeSessionForMember(member.id).catch(() => null)) || partialSession;
      if (runtimeProgressStopped) return;
      if (!latestSession || latestSession.activeRequestId !== activeRequestId || latestSession.status !== 'TYPING') {
        return;
      }
      const lastStreamAtMs = latestSession.lastStreamAt ? Date.parse(latestSession.lastStreamAt) : NaN;
      if (Number.isFinite(lastStreamAtMs) && nowMs - lastStreamAtMs < progressHeartbeatMs) {
        return;
      }
      const now = new Date(nowMs).toISOString();
      const scopedUpdates = this.activeRequestScopedUpdates(latestSession, activeRequestId, {
        status: 'TYPING',
        activeRequestId,
        activeRequestStartedAt:
          latestSession.activeRequestStartedAt ||
          partialSession.activeRequestStartedAt ||
          typingSession.activeRequestStartedAt ||
          typingSession.lastMessageAt ||
          now,
        activeRequestConversationId: requestConversationId || latestSession.activeRequestConversationId || null,
        currentActivity: this.describeRuntimeProgressActivity(latestSession, activeRequestId, startedAtMs),
        updatedAt: now,
      });
      if (!scopedUpdates.currentActivity) return;
      if (runtimeProgressStopped) return;
      partialSession = {
        ...latestSession,
        ...scopedUpdates,
      };
      lastRuntimeProgressWriteAt = nowMs;
      await this.writeRuntimeSession(member.id, partialSession);
      this.publishAgentRuntimeSessionEvent(projectId, member.id, {
        type: 'progress',
        role: member.role,
        requestId: activeRequestId,
        message: partialSession.currentActivity || undefined,
        session: this.sanitizeRuntimeSession(partialSession),
      });
    };

    try {
      runtimeProgressTimer = setInterval(() => {
        void publishRuntimeProgressHeartbeat().catch((error: any) => {
          this.logger.warn(`Failed to publish runtime progress heartbeat for member ${member.id}: ${error?.message || error}`);
        });
      }, progressHeartbeatMs);
      if (typeof (runtimeProgressTimer as any).unref === 'function') {
        (runtimeProgressTimer as any).unref();
      }
      const systemPrompt = await this.runtimeSystemPrompt(projectId, member.role, typingSession);
      const response = queuedLocalRuntime
        ? await this.sendMessageViaLocalRunnerBridge(
            member.id,
            typingSession,
            message,
            systemPrompt,
            activeRequestId,
            {
              projectId,
              memberId: member.id,
              userId: member.userId,
              role: member.role,
              workspaceBaseUrl: this.agentWorkspaceClient.getConfiguredBaseUrl(),
              projectGlobals,
            },
          )
        : await this.withAgentModelSendSlot(typingSession, () =>
            this.agentRuntimeLauncher.sendMessage(typingSession, message, systemPrompt, {
              timeoutMs: this.agentRuntimeChatTimeoutMs(),
              requestId: activeRequestId,
              retries: ['mini-swe-agent', 'pi', 'claude-code', 'codex'].includes(
                String(typingSession.agentType || '').trim().toLowerCase().replace(/_/g, '-'),
              )
                ? 1
                : Number(this.configService.get<string>('HERMES_AGENT_CHAT_RETRIES') || 8),
              retryDelayMs: Number(this.configService.get<string>('HERMES_AGENT_CHAT_RETRY_DELAY_MS') || 2500),
              onTextDelta: (text) => persistPartialResponse(text),
            }),
          );
      runtimeProgressStopped = true;
      await this.ensureGitAutomationArtifacts(projectId, member.userId, typingSession, response.outputText || '');
      const nextStatus = this.responseNeedsConfirmation(response.outputText)
        ? 'WAITING_CONFIRMATION'
        : 'IDLE';
      const finalBaseSession = (await this.latestRuntimeSessionForMember(member.id).catch(() => null)) || partialSession;
      const finalTargetSession = this.selectRuntimeConversation(finalBaseSession, requestConversationId);
      const updatedSession: AgentRuntimeSession = this.updateRuntimeConversationHistory(
        finalBaseSession,
        requestConversationId,
        this.upsertRuntimeMessage(finalTargetSession, {
          ...streamingAssistantMessage,
          content: response.outputText || streamingAssistantMessage.content || '(No text response)',
          status: nextStatus,
        }),
        this.activeRequestScopedUpdates(finalBaseSession, activeRequestId, {
          status: nextStatus,
          activeRequestId: null,
          activeRequestStartedAt: null,
          activeRequestConversationId: null,
          lastMessageAt: typingSession.lastMessageAt,
          lastStreamAt: finalBaseSession.lastStreamAt || partialSession.lastStreamAt || new Date().toISOString(),
          lastResponseAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          lastError: null,
          currentActivity: this.describeRuntimeActivity(
            nextStatus,
            response.outputText,
            response.recentActions,
          ),
          recentActions: response.recentActions,
        }),
      );
      await this.writeRuntimeSession(member.id, updatedSession);
      this.publishAgentRuntimeSessionEvent(projectId, member.id, {
        type: 'complete',
        role: member.role,
        requestId: activeRequestId,
        message: updatedSession.currentActivity || undefined,
        session: this.sanitizeRuntimeSession(updatedSession),
      });
      await this.agentWorkspaceClient
        .heartbeatRuntime(typingSession.runtimeId, typingSession.workspaceToken, {
          projectId,
          status: nextStatus === 'WAITING_CONFIRMATION' ? 'PAUSED' : 'IDLE',
        message: nextStatus,
      })
      .catch(() => null);
    } catch (error: any) {
      runtimeProgressStopped = true;
      this.logger.error(
        `Agent runtime message failed for member ${member.id}: ${error?.message || error}`,
        error?.stack,
      );
      const latestAfterError = await this.latestRuntimeSessionForMember(member.id).catch(() => null);
      if (
        latestAfterError &&
        latestAfterError.activeRequestId !== activeRequestId &&
        latestAfterError.status !== 'TYPING'
      ) {
        return;
      }
      const timedOut = this.isAgentRuntimeTimeoutError(error);
      const timeoutMessage =
        'Agent response timed out before completion. The message was delivered, but no reply arrived before the configured timeout.';
      const errorMessage = timedOut ? timeoutMessage : error?.message || 'Failed to send message';
      const completedAssignment =
        !timedOut && queuedLocalRuntime
          ? await this.completedAssignmentFromRuntimeMessage(projectId, member.userId, message).catch(() => null)
          : null;
      if (completedAssignment) {
        const recoveredOutput = this.agentCommandErrorOutput(errorMessage) || errorMessage;
        const recoveryBaseSession = this.failQueuedLocalRuntimeBridgeRequest(
          latestAfterError || partialSession,
          activeRequestId,
          errorMessage,
        );
        const recoveryTargetSession = this.selectRuntimeConversation(recoveryBaseSession, requestConversationId);
        const recoveredSession: AgentRuntimeSession = this.updateRuntimeConversationHistory(
          recoveryBaseSession,
          requestConversationId,
          this.upsertRuntimeMessage(recoveryTargetSession, {
            ...streamingAssistantMessage,
            content: recoveredOutput || streamingAssistantMessage.content || '(Assignment completed; runtime exited with a non-zero status.)',
            status: 'IDLE',
          }),
          this.activeRequestScopedUpdates(recoveryBaseSession, activeRequestId, {
            status: 'IDLE',
            activeRequestId: null,
            activeRequestStartedAt: null,
            activeRequestConversationId: null,
            lastMessageAt: typingSession.lastMessageAt,
            lastResponseAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            currentActivity: 'Assignment completed; runtime ready',
            lastError: null,
          }),
        );
        await this.writeRuntimeSession(member.id, recoveredSession);
        await this.agentWorkspaceClient
          .heartbeatRuntime(typingSession.runtimeId, typingSession.workspaceToken, {
            projectId,
            status: 'IDLE',
            message: 'Assignment completed despite non-zero runner exit',
          })
          .catch(() => null);
        this.publishAgentRuntimeSessionEvent(projectId, member.id, {
          type: 'complete',
          role: member.role,
          requestId: activeRequestId,
          message: recoveredSession.currentActivity || undefined,
          session: this.sanitizeRuntimeSession(recoveredSession),
        });
        return;
      }
      const errorBaseSession = this.failQueuedLocalRuntimeBridgeRequest(
        latestAfterError || partialSession,
        activeRequestId,
        errorMessage,
      );
      const errorTargetSession = this.selectRuntimeConversation(errorBaseSession, requestConversationId);
      const failedSession: AgentRuntimeSession = this.updateRuntimeConversationHistory(
        errorBaseSession,
        requestConversationId,
        this.appendRuntimeMessage(
          errorTargetSession,
          'system',
          errorMessage,
          timedOut ? 'WARNING' : 'ERROR',
        ),
        this.activeRequestScopedUpdates(errorBaseSession, activeRequestId, {
          status: timedOut ? 'IDLE' : 'ERROR',
          activeRequestId: null,
          activeRequestStartedAt: null,
          activeRequestConversationId: null,
          lastMessageAt: typingSession.lastMessageAt,
          updatedAt: new Date().toISOString(),
          currentActivity: timedOut ? 'Response timed out; ready for another message' : 'Message delivery failed',
          lastError: errorMessage,
        }),
      );
      await this.writeRuntimeSession(member.id, failedSession);
      await this.failAssignmentForRuntimeMessage(projectId, member.userId, message, errorMessage).catch((assignmentError: any) => {
        this.logger.warn(
          `Failed to mark assignment failed after runtime message error for member ${member.id}: ${assignmentError?.message || assignmentError}`,
        );
      });
      this.publishAgentRuntimeSessionEvent(projectId, member.id, {
        type: 'error',
        role: member.role,
        requestId: activeRequestId,
        message: failedSession.lastError || undefined,
        session: this.sanitizeRuntimeSession(failedSession),
      });
    } finally {
      if (runtimeProgressTimer) {
        clearInterval(runtimeProgressTimer);
      }
    }
  }

  private async sendMessageViaLocalRunnerBridge(
    memberId: string,
    typingSession: AgentRuntimeSession,
    message: string,
    systemPrompt: string,
    requestId: string,
    context: {
      projectId: string;
      memberId: string;
      userId: string;
      role: string;
      workspaceBaseUrl: string;
      projectGlobals?: Array<{
        key: string;
        label?: string | null;
        description?: string | null;
        value?: string | null;
        isSecret?: boolean;
        scope?: string | null;
        goalId?: string | null;
      }>;
    },
  ) {
    const releaseActiveMessage = this.agentRuntimeLauncher.trackActiveMessage(typingSession, requestId);
    try {
      const payload = await this.agentRuntimeLauncher.buildResponsesRequest(typingSession, message, systemPrompt, true);
      const now = new Date().toISOString();
      const requestPrefix = typingSession.provider === 'local-codex' ? 'local-codex' : 'local-runner';
      const files = await this.localRunnerBridgeRequestFiles(typingSession, context);
      const request: AgentRuntimeLocalRunnerBridgeRequest = {
        id: requestId,
        status: 'PENDING',
        payload,
        conversationId: typingSession.activeRequestConversationId || typingSession.activeConversationId || null,
        assistantMessageId: `${requestPrefix}-${requestId}-assistant`,
        files,
        createdAt: now,
        updatedAt: now,
        outputText: null,
        recentActions: [],
        error: null,
      };
      const queuedSession: AgentRuntimeSession = {
        ...typingSession,
        activeRequestStartedAt: typingSession.activeRequestStartedAt || typingSession.lastMessageAt || now,
        currentActivity: typingSession.provider === 'local-codex'
          ? 'Waiting for local Codex to pick up the message'
          : 'Waiting for local runner to pick up the message',
        updatedAt: now,
        localRunnerBridge: {
          ...(typingSession.localRunnerBridge || {}),
          requests: [
            ...(typingSession.localRunnerBridge?.requests || []).filter((item) => item.id !== requestId),
            request,
          ].slice(-20),
        },
      };
      await this.writeRuntimeSession(memberId, queuedSession);
      this.publishAgentRuntimeSessionEvent(context.projectId, memberId, {
        type: 'session',
        role: context.role,
        requestId,
        message: queuedSession.currentActivity || undefined,
        session: this.sanitizeRuntimeSession(queuedSession),
      });

      const timeoutMs = this.localRunnerBridgeTimeoutMs();
      const deadline = timeoutMs > 0 ? Date.now() + timeoutMs : null;
      while (!deadline || Date.now() <= deadline) {
        await this.sleep(1000);
        const freshMember = await this.prisma.projectMember.findUnique({
          where: { id: memberId },
          select: { permissions: true },
        });
        const freshSession = this.readRuntimeSession(freshMember?.permissions);
        if (!freshSession) {
          throw new Error('Local runner runtime session disappeared while waiting for response');
        }
        const freshRequest = freshSession.localRunnerBridge?.requests?.find((item) => item.id === requestId);
        if (!freshRequest) {
          throw new Error('Local runner bridge request disappeared while waiting for response');
        }
        if (freshRequest.status === 'ERROR') {
          throw new Error(freshRequest.error || 'Local runner failed to process the message');
        }
        if (freshRequest.status === 'COMPLETED') {
          const outputText = freshRequest.outputText || '';
          return {
            payload: {
              id: `${requestPrefix.replace('-', '_')}_${requestId}`,
              object: 'response',
              status: 'completed',
              output: [
                {
                  type: 'message',
                  role: 'assistant',
                  content: [{ type: 'output_text', text: outputText }],
                },
              ],
            },
            outputText,
            recentActions: Array.isArray(freshRequest.recentActions)
              ? freshRequest.recentActions
              : [],
          };
        }
        if (freshSession.activeRequestId !== requestId && freshSession.status !== 'TYPING') {
          throw new Error('Agent message cancelled');
        }
      }

      throw new Error('Timed out waiting for local runner response');
    } finally {
      releaseActiveMessage();
    }
  }

  private async localRunnerBridgeRequestFiles(
    typingSession: AgentRuntimeSession,
    context: {
      projectId: string;
      memberId: string;
      userId: string;
      role: string;
      workspaceBaseUrl: string;
      projectGlobals?: Array<{
        key: string;
        label?: string | null;
        description?: string | null;
        value?: string | null;
        isSecret?: boolean;
      }>;
    },
  ) {
    const refreshedJob = await this.agentRuntimeLauncher.localRunnerJobWithSkillBundle(
      typingSession.localRunnerJob,
      typingSession.role,
      typingSession.skillBundleRefs || [],
      typingSession.projectSkillOverrides || [],
    );
    const bundleFiles = (refreshedJob?.files || []).filter((file) =>
      file.path === 'AGENT_WORKSPACE_CONTEXT.json' || file.path.startsWith('skills/'),
    );
    return [
      ...bundleFiles,
      this.agentRuntimeLauncher.localRunnerRuntimeEnvFile(typingSession, context),
    ];
  }

  private mergeLocalRunnerFiles(
    existingFiles: AgentRuntimeLocalRunnerFile[] = [],
    updatedFiles: AgentRuntimeLocalRunnerFile[] = [],
  ) {
    const byPath = new Map(existingFiles.map((file) => [file.path, file]));
    for (const file of updatedFiles) {
      byPath.set(file.path, file);
    }
    return [...byPath.values()];
  }

  private localRunnerRuntimeSyncFiles(
    session: AgentRuntimeSession,
    context: {
      projectId: string;
      memberId: string;
      userId: string;
      role: string;
      workspaceBaseUrl: string;
      projectGlobals?: ProjectGlobalVariable[];
    },
  ) {
    let existingContext: Record<string, any> = {};
    const contextFile = session.localRunnerJob?.files?.find((file) => file.path === 'AGENT_WORKSPACE_CONTEXT.json');
    if (contextFile?.content) {
      try {
        existingContext = JSON.parse(contextFile.content);
      } catch {
        existingContext = {};
      }
    }
    return [
      this.agentRuntimeLauncher.localRunnerRuntimeContextFile(session, context, existingContext),
      this.agentRuntimeLauncher.localRunnerRuntimeEnvFile(session, context),
    ];
  }

  async progressLocalRunnerAgentRuntimeRequest(
    projectId: string,
    memberId: string,
    userId: string,
    requestId: string,
    dto: {
      outputText?: string | null;
      statusText?: string | null;
      recentActions?: AgentRuntimeAction[];
    },
  ) {
    return this.progressQueuedLocalRuntimeRequest(projectId, memberId, userId, requestId, 'local-runner', dto);
  }

  async progressLocalCodexAgentRuntimeRequest(
    projectId: string,
    memberId: string,
    userId: string,
    requestId: string,
    dto: {
      outputText?: string | null;
      statusText?: string | null;
      recentActions?: AgentRuntimeAction[];
    },
  ) {
    return this.progressQueuedLocalRuntimeRequest(projectId, memberId, userId, requestId, 'local-codex', dto);
  }

  private async progressQueuedLocalRuntimeRequest(
    projectId: string,
    memberId: string,
    userId: string,
    requestId: string,
    provider: 'local-runner' | 'local-codex',
    dto: {
      outputText?: string | null;
      statusText?: string | null;
      recentActions?: AgentRuntimeAction[];
    },
  ) {
    await this.ensureProjectManager(projectId, userId);
    const member = await this.prisma.projectMember.findFirst({
      where: { id: memberId, projectId, removedAt: null },
      select: { id: true, role: true, permissions: true },
    });
    if (!member) throw new NotFoundException('Project member not found');
    const session = this.readRuntimeSession(member.permissions);
    if (!session || session.provider !== provider) {
      throw new BadRequestException(`This member does not have a ${provider} runtime`);
    }

    const requests = session.localRunnerBridge?.requests || [];
    const requestIndex = requests.findIndex((request) => request.id === requestId);
    if (requestIndex < 0) {
      throw new NotFoundException('Local runner request not found');
    }
    const existingRequest = requests[requestIndex];
    if (!['PENDING', 'RUNNING'].includes(existingRequest.status)) {
      return {
        projectId,
        memberId: member.id,
        role: member.role,
        request: {
          id: existingRequest.id,
          status: existingRequest.status,
        },
        session: this.sanitizeRuntimeSession(session),
      };
    }

    const incomingOutputText = dto.outputText || '';
    const existingOutputText = existingRequest.outputText || '';
    const outputText = incomingOutputText.length >= existingOutputText.length
      ? incomingOutputText
      : existingOutputText;
    const statusText = this.sanitizeLocalRunnerStatusText(dto.statusText) || existingRequest.statusText || null;
    const now = new Date().toISOString();
    const updatedRequest: AgentRuntimeLocalRunnerBridgeRequest = {
      ...existingRequest,
      status: 'RUNNING',
      outputText,
      statusText,
      recentActions: Array.isArray(dto.recentActions) ? dto.recentActions.slice(-6) : existingRequest.recentActions,
      updatedAt: now,
    };
    const updatedRequests = [...requests];
    updatedRequests[requestIndex] = updatedRequest;
    const assistantMessageId = updatedRequest.assistantMessageId || `${provider === 'local-codex' ? 'local-codex' : 'local-runner'}-${requestId}-assistant`;
    const requestConversationId = updatedRequest.conversationId || session.activeRequestConversationId || session.activeConversationId;
    const targetSession = this.selectRuntimeConversation(session, requestConversationId);
    const displayStatusText = statusText && !/^thinking$/i.test(statusText) ? statusText : null;
    const updatedSession: AgentRuntimeSession = this.updateRuntimeConversationHistory(
      session,
      requestConversationId,
      outputText
        ? this.upsertRuntimeMessage(targetSession, {
            id: assistantMessageId,
            role: 'assistant',
            content: outputText,
            createdAt: now,
            status: 'TYPING',
          })
        : targetSession.messageHistory || [],
      this.activeRequestScopedUpdates(session, requestId, {
        status: 'TYPING',
        activeRequestId: requestId,
        activeRequestStartedAt: session.activeRequestStartedAt || session.lastMessageAt || updatedRequest.createdAt || now,
        activeRequestConversationId: requestConversationId || null,
        currentActivity: displayStatusText
          ? displayStatusText
          : outputText
            ? `Streaming response from ${provider === 'local-codex' ? 'local Codex' : 'local runner'}`
            : statusText
              ? statusText
              : `${provider === 'local-codex' ? 'Local Codex' : 'Local runner'} is processing the message`,
        lastStreamAt: outputText || statusText ? now : session.lastStreamAt,
        updatedAt: now,
        recentActions: Array.isArray(dto.recentActions) ? dto.recentActions.slice(-6) : session.recentActions,
        localRunnerBridge: {
          ...(session.localRunnerBridge || {}),
          requests: updatedRequests.slice(-20),
          lastSeenAt: now,
          disconnectedAt: null,
          disconnectReason: null,
        },
      }),
    );
    await this.writeRuntimeSession(member.id, updatedSession);
    this.publishAgentRuntimeSessionEvent(projectId, member.id, {
      type: 'progress',
      role: member.role,
      requestId: updatedRequest.id,
      message: updatedSession.currentActivity || undefined,
      session: this.sanitizeRuntimeSession(updatedSession),
    });

    return {
      projectId,
      memberId: member.id,
      role: member.role,
      request: {
        id: updatedRequest.id,
        status: updatedRequest.status,
      },
      session: this.sanitizeRuntimeSession(updatedSession),
    };
  }

  private async syncProjectGlobalsToRuntimeSessions(projectId: string, globals: ProjectGlobalVariable[]) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { settings: true },
    });
    const projectGithubUrl = this.getProjectGithubUrl(project?.settings);
    const members = await this.prisma.projectMember.findMany({
      where: { projectId, removedAt: null },
      select: { id: true, role: true, userId: true, permissions: true },
    });
    let updated = 0;
    const skipped: string[] = [];

    for (const member of members) {
      const session = this.readRuntimeSession(member.permissions);
      if (!session?.grantId) {
        continue;
      }
      const runtimeGlobals = await this.visibleProjectGlobalsForRuntime(projectId, member, globals);
      const refreshedToken = await this.agentWorkspaceClient.mintAccessToken(session.grantId);
      const nextSession: AgentRuntimeSession = {
        ...session,
        agentDisplayName: session.agentDisplayName || this.readProjectAgentRoleName(member.permissions)?.displayName || null,
        projectGithubUrl: projectGithubUrl ?? session.projectGithubUrl ?? null,
        projectGlobalKeys: runtimeGlobals.map((global) => global.key),
        workspaceToken: refreshedToken.token,
        updatedAt: new Date().toISOString(),
      };
      const context = {
        projectId,
        memberId: member.id,
        userId: member.userId,
        role: member.role,
        agentDisplayName: nextSession.agentDisplayName || null,
        workspaceBaseUrl: this.agentWorkspaceClient.getConfiguredBaseUrl(),
        projectGlobals: runtimeGlobals,
      };
      if (nextSession.dataDir) {
        try {
          await this.agentRuntimeLauncher.syncWorkspaceContext(nextSession, context);
          if (this.isQueuedLocalRuntimeProvider(nextSession.provider)) {
            const syncFiles = this.localRunnerRuntimeSyncFiles(nextSession, context);
            nextSession.localRunnerJob = nextSession.localRunnerJob
              ? {
                  ...nextSession.localRunnerJob,
                  workspaceToken: refreshedToken.token,
                  projectGlobals: runtimeGlobals,
                  files: this.mergeLocalRunnerFiles(nextSession.localRunnerJob.files || [], syncFiles),
                }
              : nextSession.localRunnerJob;
            nextSession.localRunnerBridge = {
              ...(nextSession.localRunnerBridge || { requests: [] }),
              requests: nextSession.localRunnerBridge?.requests || [],
              syncFiles: this.mergeLocalRunnerFiles(nextSession.localRunnerBridge?.syncFiles || [], syncFiles),
            };
          }
        } catch {
          if (this.isQueuedLocalRuntimeProvider(nextSession.provider)) {
            const syncFiles = this.localRunnerRuntimeSyncFiles(nextSession, context);
            nextSession.localRunnerJob = nextSession.localRunnerJob
              ? {
                  ...nextSession.localRunnerJob,
                  workspaceToken: refreshedToken.token,
                  projectGlobals: runtimeGlobals,
                  files: this.mergeLocalRunnerFiles(nextSession.localRunnerJob.files || [], syncFiles),
                }
              : nextSession.localRunnerJob;
            nextSession.localRunnerBridge = {
              ...(nextSession.localRunnerBridge || { requests: [] }),
              requests: nextSession.localRunnerBridge?.requests || [],
              syncFiles: this.mergeLocalRunnerFiles(nextSession.localRunnerBridge?.syncFiles || [], syncFiles),
            };
          } else {
            skipped.push(member.id);
          }
        }
      } else if (nextSession.localRunnerJob) {
        const syncFiles = this.localRunnerRuntimeSyncFiles(nextSession, context);
        nextSession.localRunnerJob = {
          ...nextSession.localRunnerJob,
          workspaceToken: refreshedToken.token,
          projectGlobals: runtimeGlobals,
          files: this.mergeLocalRunnerFiles(nextSession.localRunnerJob.files || [], syncFiles),
        };
        nextSession.localRunnerBridge = {
          ...(nextSession.localRunnerBridge || { requests: [] }),
          requests: nextSession.localRunnerBridge?.requests || [],
          syncFiles: this.mergeLocalRunnerFiles(nextSession.localRunnerBridge?.syncFiles || [], syncFiles),
        };
      }
      await this.writeRuntimeSession(member.id, nextSession);
      updated += 1;
    }

    return { updated, skipped };
  }

  private async syncCurrentProjectGlobalsToRuntimeSessions(projectId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { settings: true },
    });
    const projectGlobals = await this.resolveProjectGlobalVariables(projectId, project?.settings);
    return this.syncProjectGlobalsToRuntimeSessions(projectId, projectGlobals);
  }

  async updateProject(projectId: string, userId: string, dto: UpdateProjectDto) {
    const managerProject = await this.ensureProjectManager(projectId, userId);
    if (dto.settings && 'projectGlobals' in dto.settings && managerProject.ownerId !== userId) {
      throw new ForbiddenException('Only the project owner can update project global resources');
    }

    const existing = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { settings: true },
    });
    const mergedSettings = this.mergeProjectSettings(existing?.settings, {
      githubUrl: dto.githubUrl,
      settings: dto.settings,
    });
    const strictProjectScaleLimits = Boolean(
      dto.settings &&
      typeof dto.settings === 'object' &&
      !Array.isArray(dto.settings) &&
      (
        Object.prototype.hasOwnProperty.call(dto.settings, 'maxActiveAgents') ||
        Object.prototype.hasOwnProperty.call(dto.settings, 'maxActiveGoals')
      ),
    );
    this.applyProjectAgentLimitSetting(mergedSettings, { strict: strictProjectScaleLimits });
    let requestedProjectGlobalsForPersistence: ProjectGlobalVariable[] | null = null;
    if (dto.settings && Object.prototype.hasOwnProperty.call(dto.settings, 'projectGlobals')) {
      const existingProjectGlobals = await this.resolveProjectGlobalVariables(projectId, existing?.settings);
      const requestedProjectGlobals = this.getProjectGlobalVariables(dto.settings).map((global) => ({
        ...global,
        scope: this.isGoalScopedGlobal(global) ? 'goal' : 'project',
        goalId: this.isGoalScopedGlobal(global) ? global.goalId : null,
      }));
      const requestedIdentities = new Set(requestedProjectGlobals.map((global) => this.projectGlobalIdentity(global)));
      const preservedGoalGlobals = existingProjectGlobals.filter(
        (global) => this.isGoalScopedGlobal(global) && !requestedIdentities.has(this.projectGlobalIdentity(global)),
      );
      requestedProjectGlobalsForPersistence = [
        ...requestedProjectGlobals,
        ...preservedGoalGlobals,
      ];
      mergedSettings.projectGlobals = this.globalsForStoredSettings(requestedProjectGlobalsForPersistence);
    }
    const resolvedFromSettings = await this.resolveProjectGlobalVariables(projectId, mergedSettings);
    const resolvedProjectGlobals = requestedProjectGlobalsForPersistence
      ? this.mergeProjectGlobalsByIdentity([
          ...resolvedFromSettings,
          ...requestedProjectGlobalsForPersistence.map((requested) => {
            const resolved = resolvedFromSettings.find(
              (entry) => this.projectGlobalIdentity(entry) === this.projectGlobalIdentity(requested),
            );
            const hasNewValue = requested.providedValue && (!requested.isSecret || Boolean(requested.value));
            return {
              ...(resolved || {}),
              ...requested,
              value: hasNewValue ? requested.value || '' : resolved?.value || requested.value || '',
            };
          }),
        ])
      : resolvedFromSettings;
    const storedSettings = this.mergeProjectSettings(existing?.settings, {
      githubUrl: dto.githubUrl,
      settings: dto.settings,
    });
    this.applyProjectAgentLimitSetting(storedSettings, { strict: strictProjectScaleLimits });
    if (resolvedProjectGlobals.length) {
      storedSettings.projectGlobals = this.globalsForStoredSettings(resolvedProjectGlobals);
    } else if (Array.isArray(storedSettings.projectGlobals) && !resolvedProjectGlobals.length) {
      delete storedSettings.projectGlobals;
    }

    await this.agentWorkspaceClient.updateProject(projectId, {
      name: dto.name,
      description: dto.summary,
      brief: dto.brief,
      visibility: dto.visibility,
      githubUrl: dto.githubUrl,
      leadUserId: dto.leadAgentUserId,
      budgetAmount: dto.budgetAmount,
      budgetCurrency: dto.budgetCurrency,
      settings: storedSettings,
    });

    await this.syncProjectCapabilityBundles(projectId, storedSettings);
    await this.persistProjectGlobalSecrets(projectId, resolvedProjectGlobals, {
      updatedByUserId: userId,
      source: 'project-settings',
    });
    const project = await this.prisma.project.update({
      where: { id: projectId },
      data: {
        name: dto.name,
        summary: dto.summary,
        brief: dto.brief,
        visibility: dto.visibility,
        leadAgentUserId: dto.leadAgentUserId,
        budgetAmount: dto.budgetAmount,
        budgetCurrency: dto.budgetCurrency,
        settings: storedSettings,
      },
      include: {
        owner: { select: { id: true, email: true, displayName: true, role: true } },
        leadAgent: { select: { id: true, email: true, displayName: true, role: true } },
        _count: { select: { members: true, workItems: true, artifacts: true } },
      },
    });

    const projectGlobals = await this.resolveProjectGlobalVariables(projectId, project.settings);
    const projectGlobalsForRuntime = resolvedProjectGlobals.length ? resolvedProjectGlobals : projectGlobals;
    if (managerProject.ownerId === userId) {
      await this.syncProjectGlobalResourceTasks(projectId, managerProject.ownerId, projectGlobalsForRuntime);
      await this.syncProjectGlobalsToRuntimeSessions(projectId, projectGlobalsForRuntime).catch((error: any) => {
        this.logger.warn(
          `Failed to sync project globals after project settings update ${projectId}: ${error?.message || error}`,
        );
      });
    }

    return this.normalizeProject({
      ...project,
      githubUrl: this.getProjectGithubUrl(project.settings),
      projectGlobals: this.sanitizeProjectGlobalVariables(projectGlobals, { includeValues: managerProject.ownerId === userId }),
      settings: this.withSanitizedProjectSettings(project.settings, projectGlobals, {
        includeValues: managerProject.ownerId === userId,
      }),
    });
  }

  async saveProjectAsPersonalTemplate(projectId: string, userId: string, dto: SaveProjectTemplateDto = {}) {
    const project = await this.ensureProjectManager(projectId, userId);
    const settings =
      project.settings && typeof project.settings === 'object' && !Array.isArray(project.settings)
        ? project.settings as Record<string, any>
        : {};
    const templateId = randomUUID();
    const name = (dto.name || `${project.name} template`).trim().slice(0, 120) || 'Personal project template';
    const description = (dto.description || project.summary || project.brief || '').trim() || null;
    const templateKey = `.agentcraft/personal-templates/${templateId}/template.json`;
    const roles = await this.snapshotProjectTemplateRoles(settings);
    const roleLaunchProfiles = await this.snapshotProjectRoleLaunchProfiles(projectId);
    const projectGlobals = this.getProjectGlobalVariables(settings).map((entry) => ({
      key: entry.key,
      label: entry.label || entry.key,
      description: entry.description || null,
      value: entry.isSecret ? '' : entry.value || '',
      isSecret: Boolean(entry.isSecret),
      required: entry.required !== false,
      createTaskOnMissing: entry.createTaskOnMissing !== false,
      category: entry.category || null,
      scope: this.isGoalScopedGlobal(entry) ? 'goal' : 'project',
      goalId: this.isGoalScopedGlobal(entry) ? entry.goalId : null,
    }));
    const projectFileFolders = this.getProjectFileFolders(settings);
    const templateSettings = await this.snapshotProjectTemplateSettings(projectId, settings, roleLaunchProfiles);
    const template: ProjectTemplateConfig = {
      id: `personal:${templateId}`,
      label: name,
      description: description || undefined,
      version: 'personal',
      projectFileFolders,
      projectGlobals,
      roles,
      roleLaunchProfiles,
      settings: templateSettings,
    };

    await this.agentWorkspaceClient.writeProjectFile(projectId, {
      path: templateKey,
      content: JSON.stringify(template, null, 2),
      contentType: 'application/json; charset=utf-8',
    });

    const snapshotSummary = {
      settings: templateSettings,
      projectFileFolders,
      projectGlobals,
      roles,
      roleLaunchProfiles,
    };
    const record = await this.prisma.projectPersonalTemplate.create({
      data: {
        id: templateId,
        ownerId: userId,
        sourceProjectId: projectId,
        name,
        description,
        templateKey,
        snapshotSummary,
      },
    });

    return {
      projectId,
      template: {
        id: `personal:${record.id}`,
        label: record.name,
        description: record.description,
        version: 'personal',
        projectFileFolders,
        projectGlobals,
        roles,
        roleLaunchProfiles,
        templateKey,
      },
    };
  }

  private async snapshotProjectTemplateRoles(settings: Record<string, any>): Promise<ProjectTemplateRoleEntry[]> {
    const templateRoles = await this.projectTemplateRolesForSettings(settings);
    const roleEntries = templateRoles.length
      ? templateRoles
      : await this.listLaunchableRoleSummaries(settings) as ProjectTemplateRoleEntry[];
    return Promise.all(
      roleEntries.map(async (entry: ProjectTemplateRoleEntry) => {
        const config = await this.projectRoleConfigForRole(entry.role, settings);
        return {
          ...entry,
          role: entry.role,
          label: config.label || entry.label || entry.role,
          description: config.description || entry.description || this.defaultRoleDescription(entry.role),
          skills: config.skills || entry.skills,
          skillBundleRefs: config.skillBundleRefs,
          capabilityBundleRefs: this.capabilityBundleRefsForConfig(config),
          capabilityBundles: config.capabilityBundles,
          runtimeCompatibility: config.runtimeCompatibility || entry.runtimeCompatibility || null,
          initialPrompt: config.initialPrompt || '',
          scopes: config.scopes || entry.scopes,
          polling: config.polling || entry.polling,
        };
      }),
    );
  }

  private async snapshotProjectRoleLaunchProfiles(projectId: string) {
    const [members, profiles] = await Promise.all([
      this.prisma.projectMember.findMany({
        where: { projectId, removedAt: null },
        select: { role: true, permissions: true },
      }),
      this.prisma.projectAgentProfile.findMany({
        where: { projectId },
        orderBy: { updatedAt: 'desc' },
      }),
    ]);
    const byRole = new Map<string, Record<string, any>>();
    for (const member of members) {
      const session = this.readRuntimeSession(member.permissions);
      if (!session || !member.role || byRole.has(member.role)) continue;
      byRole.set(member.role, {
        role: member.role,
        launchMode: session.provider,
        agentType: session.agentType || 'pi',
        image: session.image || null,
        model: session.llm?.modelName || session.llm?.name || null,
        deploymentDays: Math.max(1, Math.floor(Number(session.deploymentDays) || 1)),
        enableSudo: Boolean(session.enableSudo),
        source: 'runtime',
      });
    }
    for (const profile of profiles) {
      if (!profile.role || byRole.has(profile.role)) continue;
      const profileSettings =
        profile.settings && typeof profile.settings === 'object' && !Array.isArray(profile.settings)
          ? profile.settings as Record<string, any>
          : {};
      byRole.set(profile.role, {
        role: profile.role,
        launchMode: this.normalizeAgentRuntimeLaunchMode(profile.launchMode) || 'aws-agentcore',
        agentType: profile.agentType || 'pi',
        image: profile.image || null,
        model: profile.model || null,
        deploymentDays: Math.max(1, Math.floor(Number(profile.deploymentDays) || 1)),
        enableSudo: Boolean(profileSettings.enableSudo),
        source: 'profile',
      });
    }
    return [...byRole.values()];
  }

  private async snapshotProjectTemplateSettings(
    projectId: string,
    settings: Record<string, any>,
    roleLaunchProfiles: Array<Record<string, any>>,
  ) {
    const snapshot: Record<string, any> = {};
    for (const key of [
      'maxActiveAgents',
      'maxActiveGoals',
      'projectGlobals',
      'projectFileFolders',
      'projectTemplateRoles',
      'projectRoleOverrides',
      'projectRoleSkillOverrides',
    ]) {
      if (Object.prototype.hasOwnProperty.call(settings, key)) {
        snapshot[key] = settings[key];
      }
    }
    if (roleLaunchProfiles.length) {
      snapshot.projectRoleAgentDefaults = Object.fromEntries(
        roleLaunchProfiles.map((profile) => [profile.role, profile]),
      );
    }

    const skillFiles: Record<string, Record<string, string>> = {};
    const skillOverrides = this.projectRoleSkillOverridesFromSettings(settings);
    for (const [role, override] of Object.entries(skillOverrides)) {
      for (const [ref, skill] of Object.entries(override.skills || {})) {
        if (!skill.storagePath) continue;
        try {
          const response = await this.agentWorkspaceClient.readProjectFile(projectId, skill.storagePath, 'text');
          const content = typeof response.content === 'string' ? response.content : '';
          if (!content) continue;
          skillFiles[role] = skillFiles[role] || {};
          skillFiles[role][ref] = content;
        } catch {
          // Missing skill files should not block saving a reusable template.
        }
      }
    }
    if (Object.keys(skillFiles).length) {
      snapshot.projectRoleSkillFiles = skillFiles;
    }
    return snapshot;
  }

  async deleteProject(projectId: string, userId: string, dto: DeleteProjectDto) {
    const confirmation = String(dto.confirmation || '').trim();
    if (confirmation !== 'delete') {
      throw new BadRequestException('Type delete to confirm project deletion');
    }

    const project = await this.prisma.project.findFirst({
      where: { id: projectId, deletedAt: null },
      select: { id: true, ownerId: true, settings: true },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    if (project.ownerId !== userId) {
      throw new ForbiddenException('Only the project creator can delete this project');
    }

    const deletedAt = new Date();
    const settings = this.projectSettingsWithAutomationState(project.settings, false, userId);
    const deleted = await this.prisma.project.update({
      where: { id: projectId },
      data: {
        status: 'ARCHIVED' as any,
        settings,
        deletedAt,
        deletedById: userId,
      },
      select: {
        id: true,
        deletedAt: true,
        deletedById: true,
      },
    });

    this.clearProjectAutomationTimers(projectId);
    await this.setLeadAgentPollingEnabled(projectId, false, userId);
    await this.agentWorkspaceClient.updateProject(projectId, { status: 'ARCHIVED' as any, settings }).catch(() => null);

    return deleted;
  }

  async listMembers(projectId: string, userId?: string | null) {
    await this.ensureProjectReadable(projectId, userId);
    return this.getWorkspaceMembers(projectId);
  }

  async addMember(projectId: string, userId: string, dto: CreateProjectMemberDto) {
    const project = await this.ensureProjectManager(projectId, userId);

    const memberUser = await this.prisma.user.findUnique({
      where: { id: dto.userId },
      select: { id: true, role: true },
    });
    if (!memberUser) {
      throw new NotFoundException('Member user not found');
    }
    if (memberUser.role === 'AI_AGENT' || String(dto.role || '').endsWith('_AGENT')) {
      await this.ensureProjectActiveAgentCapacity(projectId, project.settings);
    }

    const membership = await this.prisma.projectMember.create({
      data: {
        projectId,
        userId: dto.userId,
        role: dto.role,
        permissions: dto.permissions,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            displayName: true,
            role: true,
            githubLogin: true,
            avatarUrl: true,
          },
        },
      },
    });

    if (dto.role === 'LEAD_AGENT') {
      await this.prisma.project.update({
        where: { id: projectId },
        data: { leadAgentUserId: dto.userId },
      });
    }

    return membership;
  }

  async removeMember(projectId: string, memberId: string, userId: string) {
    const project = await this.ensureProjectManager(projectId, userId);
    const membership = await this.prisma.projectMember.findFirst({
      where: { id: memberId, projectId, removedAt: null },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            displayName: true,
            role: true,
            githubLogin: true,
            avatarUrl: true,
          },
        },
      },
    });

    if (!membership) {
      throw new NotFoundException('Project member not found');
    }

    if (membership.userId === project.ownerId || membership.role === 'OWNER') {
      throw new BadRequestException('Project owner cannot be removed from membership');
    }

    const removed = await this.prisma.projectMember.update({
      where: { id: membership.id },
      data: { removedAt: new Date() },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            displayName: true,
            role: true,
            githubLogin: true,
            avatarUrl: true,
          },
        },
      },
    });

    if (project.leadAgentUserId === membership.userId) {
      const replacementLead = await this.prisma.projectMember.findFirst({
        where: {
          projectId,
          role: 'LEAD_AGENT',
          removedAt: null,
          id: { not: membership.id },
        },
        select: { userId: true },
        orderBy: { joinedAt: 'asc' },
      });
      await this.prisma.project.update({
        where: { id: projectId },
        data: { leadAgentUserId: replacementLead?.userId || null },
      });
    }

    return removed;
  }

  private projectSettingsWithAutomationState(settings: any, enabled: boolean, userId: string) {
    const existingSettings =
      settings && typeof settings === 'object' && !Array.isArray(settings)
        ? { ...(settings as Record<string, any>) }
        : {};
    const existingFlow =
      existingSettings.workItemStatusFlow &&
      typeof existingSettings.workItemStatusFlow === 'object' &&
      !Array.isArray(existingSettings.workItemStatusFlow)
        ? { ...existingSettings.workItemStatusFlow }
        : {};
    const existingCoordinator =
      existingFlow.coordinator &&
      typeof existingFlow.coordinator === 'object' &&
      !Array.isArray(existingFlow.coordinator)
        ? { ...existingFlow.coordinator }
        : existingSettings.coordinator &&
            typeof existingSettings.coordinator === 'object' &&
            !Array.isArray(existingSettings.coordinator)
          ? { ...existingSettings.coordinator }
          : {};

    return {
      ...existingSettings,
      workItemStatusFlow: {
        ...existingFlow,
        coordinator: {
          ...existingCoordinator,
          enabled,
          updatedAt: new Date().toISOString(),
          updatedById: userId,
        },
      },
    };
  }

  private clearProjectAutomationTimers(projectId: string) {
    const coordinatorTimer = this.coordinatorTickTimers.get(projectId);
    if (coordinatorTimer) {
      clearTimeout(coordinatorTimer);
      this.coordinatorTickTimers.delete(projectId);
    }
    const leadPollingTimer = this.leadPollingWakeTimers.get(projectId);
    if (leadPollingTimer) {
      clearTimeout(leadPollingTimer);
      this.leadPollingWakeTimers.delete(projectId);
    }
  }

  private async setLeadAgentPollingEnabled(projectId: string, enabled: boolean, userId: string) {
    const leadMembers = await this.prisma.projectMember.findMany({
      where: { projectId, role: 'LEAD_AGENT' as any, removedAt: null },
      select: { id: true, role: true, permissions: true },
    });
    const now = new Date();
    for (const member of leadMembers) {
      const basePermissions =
        member.permissions && typeof member.permissions === 'object' && !Array.isArray(member.permissions)
          ? (member.permissions as Record<string, any>)
          : {};
      const previousConfig = await this.agentPollingConfigForRole(
        member.role,
        this.readAgentPollingConfig(basePermissions),
      );
      const config = await this.agentPollingConfigForRole(member.role, {
        ...previousConfig,
        enabled,
      });
      const session = this.readRuntimeSession(basePermissions);
      const pollingState: AgentRuntimePollingState = {
        ...(session?.pollingState || {}),
        nextRunAt: enabled ? this.nextAgentPollingRunAt(config, now) : null,
        lastError: null,
      };
      const nextPermissions = {
        ...basePermissions,
        agentPollingConfig: config,
        ...(session
          ? {
              runtimeSession: this.normalizeRuntimeSessionConversations({
                ...session,
                pollingConfig: config,
                pollingState,
                updatedAt: now.toISOString(),
              }),
            }
          : {}),
      };

      await this.prisma.projectMember.update({
        where: { id: member.id },
        data: { permissions: nextPermissions },
      });

      if (nextPermissions.runtimeSession) {
        this.publishAgentRuntimeSessionEvent(projectId, member.id, {
          type: 'session',
          role: member.role,
          message: enabled ? 'Lead polling enabled' : 'Lead polling disabled',
          session: this.sanitizeRuntimeSession(nextPermissions.runtimeSession as AgentRuntimeSession),
        });
      }
    }
    return leadMembers.length;
  }

  async setProjectStatus(projectId: string, userId: string, status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED') {
    const project = await this.ensureProjectManager(projectId, userId);
    const automationEnabled = status === 'ACTIVE';
    const settings = this.projectSettingsWithAutomationState(project.settings, automationEnabled, userId);
    const updated = await this.prisma.project.update({
      where: { id: projectId },
      data: { status: status as any, settings },
    });
    await this.agentWorkspaceClient.updateProject(projectId, { status, settings }).catch(() => null);
    await this.setLeadAgentPollingEnabled(projectId, automationEnabled, userId);
    if (automationEnabled) {
      this.scheduleCoordinatorTick(projectId, project.ownerId || userId, 'project activated', 250);
      this.scheduleLeadPollingWake(projectId, project.ownerId || userId, 'project activated');
    } else {
      this.clearProjectAutomationTimers(projectId);
    }
    return updated;
  }

  async createGoal(projectId: string, userId: string, dto: CreateProjectGoalDto) {
    const project = await this.ensureProjectManager(projectId, userId);
    const created = await this.prisma.projectGoal.create({
      data: {
        projectId,
        title: dto.title,
        description: dto.description,
        priority: dto.priority ?? 0,
        sortOrder: dto.sortOrder ?? 0,
        createdById: userId,
      },
    });
    this.scheduleCoordinatorTick(projectId, project.ownerId || userId, `goal ${created.id} created`);
    return created;
  }

  async listGoals(projectId: string, userId?: string | null) {
    await this.ensureProjectReadable(projectId, userId);
    return this.prisma.projectGoal.findMany({
      where: { projectId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async listGoalGlobals(projectId: string, goalId: string, userId: string) {
    const project = await this.ensureProjectReadable(projectId, userId);
    await this.ensureProjectScopedReference(projectId, 'goal', goalId);
    const globals = await this.resolveProjectGlobalVariables(projectId, project.settings);
    const goalGlobals = globals.filter((global) => this.isGoalScopedGlobal(global) && global.goalId === goalId);
    return {
      projectId,
      goalId,
      globals: this.sanitizeProjectGlobalVariables(goalGlobals, { includeValues: project.ownerId === userId }),
    };
  }

  async updateGoalGlobals(
    projectId: string,
    goalId: string,
    userId: string,
    dto: { globals?: ProjectGlobalVariable[]; syncRuntimes?: boolean },
  ) {
    const project = await this.ensureProjectManager(projectId, userId);
    if (project.ownerId !== userId) {
      throw new ForbiddenException('Only the project owner can update goal variables');
    }
    await this.ensureProjectScopedReference(projectId, 'goal', goalId);
    const existingSettings =
      project.settings && typeof project.settings === 'object' && !Array.isArray(project.settings)
        ? project.settings as Record<string, any>
        : {};
    const existingGlobals = await this.resolveProjectGlobalVariables(projectId, existingSettings);
    const nextGoalGlobals = this.getProjectGlobalVariables({ projectGlobals: dto.globals || [] })
      .filter((global) => global.key)
      .map((global) => ({
        ...global,
        scope: 'goal',
        goalId,
      }));
    const nextGlobals = this.mergeProjectGlobalsByIdentity([
      ...existingGlobals.filter((global) => !(this.isGoalScopedGlobal(global) && global.goalId === goalId)),
      ...nextGoalGlobals,
    ]);
    const nextSettings: Record<string, any> = {
      ...existingSettings,
      projectGlobals: this.globalsForStoredSettings(nextGlobals),
    };
    if (!nextGlobals.length) {
      delete nextSettings.projectGlobals;
    }

    await this.persistProjectGlobalSecrets(projectId, nextGlobals, {
      updatedByUserId: userId,
      source: 'goal-globals',
    });
    await this.prisma.project.update({
      where: { id: projectId },
      data: { settings: nextSettings },
    });
    await this.agentWorkspaceClient.updateProject(projectId, { settings: nextSettings }).catch(() => null);
    await this.syncProjectGlobalResourceTasks(projectId, project.ownerId, nextGlobals);
    const sync = dto.syncRuntimes
      ? await this.syncProjectGlobalsToRuntimeSessions(projectId, nextGlobals)
      : { updated: 0, skipped: [] };

    return {
      projectId,
      goalId,
      sync,
      globals: this.sanitizeProjectGlobalVariables(
        nextGlobals.filter((global) => this.isGoalScopedGlobal(global) && global.goalId === goalId),
        { includeValues: true },
      ),
      projectGlobals: this.sanitizeProjectGlobalVariables(nextGlobals, { includeValues: true }),
    };
  }

  async updateGoal(
    projectId: string,
    goalId: string,
    userId: string,
    dto: UpdateProjectGoalDto,
  ) {
    const project = await this.ensureProjectManager(projectId, userId);
    await this.ensureProjectScopedReference(projectId, 'goal', goalId);

    // Status transitions that close a goal should go through closeGoal for cascade.
    if (dto.status === 'CANCELLED') {
      throw new BadRequestException(
        'Use POST /:id/goals/:goalId/close to cancel a goal so dependent work is cleaned up.',
      );
    }
    if (dto.status !== undefined && this.isActiveProjectGoalStatus(dto.status)) {
      const existingGoal = (this.prisma.projectGoal as any)?.findFirst
        ? await this.prisma.projectGoal.findFirst({
            where: { id: goalId, projectId },
            select: { status: true },
          })
        : null;
      if (!this.isActiveProjectGoalStatus(existingGoal?.status)) {
        await this.ensureProjectActiveGoalCapacity(projectId, project.settings, goalId);
      }
    }

    const data: Record<string, any> = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.priority !== undefined) data.priority = dto.priority;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    if (dto.status !== undefined) data.status = dto.status;

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No fields to update');
    }

    if (dto.status === 'DONE') {
      const statusFlow = this.resolveProjectWorkItemStatusFlow(project.settings);
      const result = await this.prisma.$transaction(async (tx) => {
        const goal = await tx.projectGoal.update({
          where: { id: goalId },
          data,
        });
        const affected = await this.cascadeTerminalGoalWork(tx, projectId, goalId, statusFlow);
        return { goal, affected };
      });
      await Promise.all(
        result.affected.workItems.map((workItemId) =>
          this.recordWorkItemEvent(projectId, userId, 'WORK_ITEM_STATUS_CHANGED', workItemId, {
            previousStatus: null,
            status: statusFlow.closedStatus,
            source: 'goal-done-cascade',
            goalId,
            goalTitle: result.goal.title,
            affectedAssignments: result.affected.assignments,
            affectedRuns: result.affected.runs,
          }),
        ),
      );
      return result.goal;
    }

    return this.prisma.projectGoal.update({
      where: { id: goalId },
      data,
    });
  }

  async closeGoal(
    projectId: string,
    goalId: string,
    userId: string,
    dto: CloseProjectGoalDto,
  ) {
    const project = await this.ensureProjectManager(projectId, userId);
    const statusFlow = this.resolveProjectWorkItemStatusFlow(project.settings);
    await this.ensureProjectScopedReference(projectId, 'goal', goalId);

    const cascade = dto.cascade !== false;
    const reason = dto.reason?.trim();
    if (!reason) {
      throw new BadRequestException('reason is required when closing a goal');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const goal = await tx.projectGoal.findFirst({
        where: { id: goalId, projectId },
      });
      if (!goal) throw new NotFoundException('Project goal not found');

      if (goal.status === 'DONE' || goal.status === 'CANCELLED') {
        return {
          goal,
          affected: { features: [], workItems: [], assignments: [], runs: [] },
          alreadyClosed: true,
        };
      }

      const affected = {
        features: [] as string[],
        workItems: [] as string[],
        assignments: [] as string[],
        runs: [] as string[],
      };

      if (cascade) {
        // 1. Cancel non-DONE features under this goal.
        const features = await tx.projectFeature.findMany({
          where: { projectId, goalId, NOT: { status: 'DONE' } },
          select: { id: true },
        });
        affected.features = features.map((f) => f.id);
        if (features.length) {
          await tx.projectFeature.updateMany({
            where: { id: { in: affected.features } },
            data: { status: 'CANCELLED' },
          });
        }

        // 2. Cancel non-completed work items under this goal
        //    (either directly linked to goal, or via a cancelled feature).
        const workItems = await tx.projectWorkItem.findMany({
          where: {
            projectId,
            status: { notIn: statusFlow.completedStatuses as any },
            OR: [
              { goalId },
              affected.features.length
                ? { featureId: { in: affected.features } }
                : { id: '__never__' },
            ],
          },
          select: { id: true },
        });
        affected.workItems = workItems.map((w) => w.id);
        if (workItems.length) {
          await tx.projectWorkItem.updateMany({
            where: { id: { in: affected.workItems } },
            data: { status: statusFlow.closedStatus },
          });
        }

        // 3. Release active assignments under those work items.
        if (affected.workItems.length) {
          const assignments = await tx.projectAssignment.findMany({
            where: {
              projectId,
              workItemId: { in: affected.workItems },
              status: { in: ['PROPOSED', 'ACTIVE', 'PAUSED'] },
            },
            select: { id: true },
          });
          affected.assignments = assignments.map((a) => a.id);
          if (assignments.length) {
            await tx.projectAssignment.updateMany({
              where: { id: { in: affected.assignments } },
              data: { status: 'RELEASED', finishedAt: new Date() },
            });
          }

          // 4. Cancel queued/running runs under those work items.
          const runs = await tx.projectRun.findMany({
            where: {
              projectId,
              workItemId: { in: affected.workItems },
              status: { in: ['QUEUED', 'RUNNING'] },
            },
            select: { id: true },
          });
          affected.runs = runs.map((r) => r.id);
          if (runs.length) {
            await tx.projectRun.updateMany({
              where: { id: { in: affected.runs } },
              data: { status: 'CANCELLED', finishedAt: new Date() },
            });
          }
        }

      }

      // Finally flip the goal itself to CANCELLED.
      const updatedGoal = await tx.projectGoal.update({
        where: { id: goalId },
        data: { status: 'CANCELLED' },
      });

      return { goal: updatedGoal, affected, alreadyClosed: false };
    });
    if (!result.alreadyClosed) {
      await this.agentWorkspaceClient.createProjectMemory(projectId, {
        memoryType: 'DECISION',
        title: `Goal closed: ${result.goal.title}`,
        content: reason,
        summary: `Goal "${result.goal.title}" was closed by ${userId}. Reason: ${reason}`,
        metadata: {
          goalId,
          affected: result.affected,
          closedBy: userId,
          cascade,
        },
        createdByUserId: userId,
      }).catch(() => null);
      await this.agentWorkspaceClient.recordProjectEvent(projectId, {
        type: 'GOAL_CLOSED',
        refType: 'GOAL',
        refId: goalId,
        actorUserId: userId,
        payload: {
          goalId,
          goalTitle: result.goal.title,
          reason,
          cascade,
          affected: result.affected,
        },
      }).catch((error: any) => {
        this.logger.warn(`Failed to record goal close event for ${projectId}/${goalId}: ${error?.message || error}`);
      });
      await Promise.all(
        result.affected.workItems.map((workItemId) =>
          this.recordWorkItemEvent(projectId, userId, 'WORK_ITEM_STATUS_CHANGED', workItemId, {
            previousStatus: null,
            status: statusFlow.closedStatus,
            reason,
            source: 'goal-close-cascade',
            goalId,
            goalTitle: result.goal.title,
            cascade,
            affectedAssignments: result.affected.assignments,
            affectedRuns: result.affected.runs,
          }),
        ),
      );
    }
    return result;
  }

  async reopenGoal(projectId: string, goalId: string, userId: string) {
    // NOTE: per SPEC this always routes through a ProjectProposal owned by the
    // project Owner. The Proposal engine lands in M2; for now we explicitly
    // block the action so callers cannot silently bypass the gate.
    await this.ensureProjectManager(projectId, userId);
    await this.ensureProjectScopedReference(projectId, 'goal', goalId);
    throw new BadRequestException(
      'reopenGoal requires the ProjectProposal approval flow (scheduled for M2). ' +
        'Until then, create a new goal instead.',
    );
  }

  async listMemberCapabilities(projectId: string, memberId: string, userId: string) {
    await this.ensureProjectAccess(projectId, userId);
    const member = await this.prisma.projectMember.findFirst({
      where: { id: memberId, projectId },
      select: { id: true },
    });
    if (!member) throw new NotFoundException('Project member not found');
    return this.prisma.projectMemberCapability.findMany({
      where: { memberId },
      orderBy: [{ capability: 'asc' }],
    });
  }

  async addMemberCapability(
    projectId: string,
    memberId: string,
    userId: string,
    dto: CreateProjectMemberCapabilityDto,
  ) {
    await this.ensureProjectManager(projectId, userId);
    const member = await this.prisma.projectMember.findFirst({
      where: { id: memberId, projectId },
      select: { id: true },
    });
    if (!member) throw new NotFoundException('Project member not found');

    const capability = dto.capability.trim();
    if (!capability) {
      throw new BadRequestException('capability tag must not be empty');
    }

    return this.prisma.projectMemberCapability.upsert({
      where: { memberId_capability: { memberId, capability } },
      update: {
        level: (dto.level as any) ?? 'COMPETENT',
        source: (dto.source as any) ?? 'SELF_DECLARED',
      },
      create: {
        memberId,
        capability,
        level: (dto.level as any) ?? 'COMPETENT',
        source: (dto.source as any) ?? 'SELF_DECLARED',
      },
    });
  }

  async removeMemberCapability(
    projectId: string,
    memberId: string,
    capabilityId: string,
    userId: string,
  ) {
    await this.ensureProjectManager(projectId, userId);
    const cap = await this.prisma.projectMemberCapability.findFirst({
      where: { id: capabilityId, member: { id: memberId, projectId } },
      select: { id: true },
    });
    if (!cap) throw new NotFoundException('Capability not found');
    await this.prisma.projectMemberCapability.delete({ where: { id: capabilityId } });
    return { ok: true };
  }

  async createFeature(projectId: string, userId: string, dto: CreateProjectFeatureDto) {
    await this.ensureProjectManager(projectId, userId);
    await this.ensureProjectScopedReference(projectId, 'goal', dto.goalId);

    const feature = await this.prisma.projectFeature.create({
      data: {
        projectId,
        goalId: dto.goalId,
        title: dto.title,
        description: dto.description,
        priority: dto.priority ?? 0,
        sortOrder: dto.sortOrder ?? 0,
        spec: dto.spec,
        createdById: userId,
      },
    });
    try {
      await this.agentWorkspaceClient.recordProjectEvent(projectId, {
        type: 'FEATURE_CREATED',
        refType: 'FEATURE',
        refId: feature.id,
        actorUserId: userId,
        payload: {
          title: feature.title,
          goalId: feature.goalId,
          createdBy: 'host',
        },
      });
    } catch (error: any) {
      this.logger.warn(`Failed to record feature creation event for ${projectId}/${feature.id}: ${error?.message || error}`);
    }
    return feature;
  }

  async listFeatures(projectId: string, userId?: string | null) {
    await this.ensureProjectReadable(projectId, userId);
    return this.prisma.projectFeature.findMany({
      where: { projectId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async createWorkItem(projectId: string, userId: string, dto: CreateProjectWorkItemDto) {
    const project = await this.ensureProjectManager(projectId, userId);
    return this.createWorkItemInternal(projectId, userId, dto, project);
  }

  private async createWorkItemInternal(
    projectId: string,
    userId: string,
    dto: CreateProjectWorkItemDto,
    project: { settings?: any },
  ) {
    const statusFlow = this.resolveProjectWorkItemStatusFlow(project.settings);
    const status = this.normalizeWorkItemStatusId(dto.status || statusFlow.initialStatus);
    await this.ensureProjectScopedReference(projectId, 'feature', dto.featureId);
    await this.ensureProjectScopedReference(projectId, 'workItem', dto.parentWorkItemId);
    const linkedFeature = dto.featureId
      ? await this.prisma.projectFeature.findFirst({
          where: { id: dto.featureId, projectId },
          select: { goalId: true },
        })
      : null;
    const goalId = dto.goalId || linkedFeature?.goalId || undefined;

    const mentionedProjectFiles = this.collectProjectFileReferences({
      textSources: [
        { source: 'title', value: dto.title },
        { source: 'description', value: dto.description },
        { source: 'scopeBrief', value: dto.scopeBrief },
        { source: 'acceptanceCriteria', value: dto.acceptanceCriteria },
      ],
      packetSources: [{ source: 'inputPacket.projectFiles', value: dto.inputPacket }],
    });
    let inputPacket =
      mentionedProjectFiles.length > 0
        ? {
            ...(dto.inputPacket && typeof dto.inputPacket === 'object' && !Array.isArray(dto.inputPacket)
              ? dto.inputPacket
          : {}),
            projectFiles: mentionedProjectFiles,
          }
        : dto.inputPacket;
    inputPacket = this.mergeOwnerTodoRequester(
      inputPacket,
      await this.inferOwnerTodoRequester(projectId, inputPacket, userId),
      goalId,
    );
    const isHackerOneOpportunityProject = project.settings?.projectTemplateId === 'hackerone-opportunity-research';
    const isRuntimeCreated = this.isRuntimeCreatedWorkItem(inputPacket);
    const isOpportunityDiscovery =
      isHackerOneOpportunityProject &&
      isRuntimeCreated &&
      this.isHackerOneOpportunityDiscoveryWorkItem({
        title: dto.title,
        description: dto.description,
        scopeBrief: dto.scopeBrief,
        acceptanceCriteria: dto.acceptanceCriteria,
        inputPacket,
        outputContract: dto.outputContract,
      });
    const workType = isOpportunityDiscovery ? 'OPPORTUNITY_DISCOVERY' : dto.workType;
    const ownerId =
      isHackerOneOpportunityProject &&
      isRuntimeCreated &&
      !this.isOwnerDirectedWorkItemPacket(inputPacket, goalId)
        ? undefined
        : dto.ownerId;
    if (
      isOpportunityDiscovery &&
      await this.shouldBlockGenericHackerOneOpportunityDiscovery(projectId, project.settings, inputPacket)
    ) {
      throw new BadRequestException(
        'HackerOne generic opportunity discovery work items are not created while unfinished target goals exist; advance existing target goals first.',
      );
    }
    if (
      !goalId &&
      isRuntimeCreated &&
      isHackerOneOpportunityProject &&
      ['SECURITY_TEST', 'INTEGRATION'].includes(String(workType || '').toUpperCase()) &&
      !this.projectGlobalResourceRequestFromPacket(inputPacket)
    ) {
      throw new BadRequestException('HackerOne runtime-created target work items must include a goalId');
    }
    await this.ensureProjectScopedReference(projectId, 'goal', goalId);

    const workItemInclude = {
      owner: { select: { id: true, email: true, displayName: true, role: true } },
      assignments: true,
      _count: { select: { assignments: true, artifacts: true, reviews: true, comments: true } },
    } as const;
    const idempotencyPaths = this.runtimeWorkItemIdempotencyPaths(inputPacket, dto.outputContract);
    if (this.isRuntimeCreatedWorkItem(inputPacket) && idempotencyPaths.length) {
      const idempotencySet = new Set(idempotencyPaths);
      const candidates = await this.prisma.projectWorkItem.findMany({
        where: {
          projectId,
          status: { notIn: statusFlow.terminalStatuses as any },
        },
        include: workItemInclude,
        orderBy: { createdAt: 'asc' },
        take: 500,
      });
      const existing = candidates.find((item) =>
        this.runtimeWorkItemIdempotencyPaths(item.inputPacket, item.outputContract).some((path) => idempotencySet.has(path)),
      );
      if (existing) {
        return this.sanitizeWorkItemForResponse(existing);
      }
    }
    const semanticIdentities = this.runtimeWorkItemSemanticIdentities({
      goalId,
      workType,
      title: dto.title,
      inputPacket,
      ownerId,
    });
    if (semanticIdentities.length) {
      const semanticSet = new Set(semanticIdentities);
      const candidates = await this.prisma.projectWorkItem.findMany({
        where: {
          projectId,
          ...(goalId ? { goalId } : {}),
          ...(workType ? { workType: workType as any } : {}),
          status: { notIn: statusFlow.terminalStatuses as any },
        },
        include: workItemInclude,
        orderBy: { createdAt: 'asc' },
        take: 500,
      });
      const existing = candidates.find((item) =>
        this.runtimeWorkItemSemanticIdentities(item).some((identity) => semanticSet.has(identity)),
      );
      if (existing) {
        return this.sanitizeWorkItemForResponse(existing);
      }
    }

    if (!statusFlow.terminalStatuses.includes(status)) {
      await this.ensureProjectActiveWorkItemCapacity(projectId, project.settings, statusFlow);
    }

    const created = await this.prisma.projectWorkItem.create({
      data: {
        projectId,
        goalId,
        featureId: dto.featureId,
        parentWorkItemId: dto.parentWorkItemId,
        title: dto.title,
        description: dto.description,
        workType,
        status,
        scopeBrief: dto.scopeBrief,
        acceptanceCriteria: dto.acceptanceCriteria,
        inputPacket,
        outputContract: dto.outputContract,
        dependsOn: dto.dependsOn ?? [],
        concurrencyMode: (dto.concurrencyMode as any) ?? undefined,
        priority: dto.priority ?? 0,
        createdById: userId,
        ownerId,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
      },
      include: workItemInclude,
    });
    await this.recordWorkItemEvent(projectId, userId, 'WORK_ITEM_CREATED', created.id, {
      title: created.title,
      goalId: created.goalId,
      featureId: created.featureId,
      parentWorkItemId: created.parentWorkItemId,
      workType: created.workType,
      status: created.status,
      source: this.isRuntimeCreatedWorkItem(inputPacket) ? 'agent-runtime' : 'host',
    });
    if (this.shouldScheduleCoordinatorTickForStatus(created.status, project.settings)) {
      this.scheduleCoordinatorTick(
        projectId,
        (project as any).ownerId || (project as any).leadAgentUserId || userId,
        `work item ${created.id} created as ${created.status}`,
      );
    }
    return this.sanitizeWorkItemForResponse(created);
  }

  async listWorkItems(
    projectId: string,
    userId: string | null | undefined,
    query: {
      status?: string;
      goalId?: string;
      featureId?: string;
      ownerId?: string;
      search?: string;
      includeClosed?: boolean;
      page?: number;
      limit?: number;
    },
  ) {
    await this.ensureProjectReadable(projectId, userId);
    const { status, goalId, featureId, ownerId, includeClosed = true } = query;
    const page = Number.isFinite(Number(query.page)) ? Math.max(1, Math.floor(Number(query.page))) : 1;
    const limit = Number.isFinite(Number(query.limit)) ? Math.min(Math.max(1, Math.floor(Number(query.limit))), 100) : 50;
    const search = typeof query.search === 'string' ? query.search.trim() : '';
    const baseWhere: any = { projectId };
    const project = await this.prisma.project.findUnique({ where: { id: projectId }, select: { settings: true } });
    const statusFlow = this.resolveProjectWorkItemStatusFlow(project?.settings);

    if (goalId) baseWhere.goalId = goalId;
    if (featureId) baseWhere.featureId = featureId;
    if (ownerId) baseWhere.ownerId = ownerId;
    if (search) {
      baseWhere.OR = [
        { title: { contains: search } },
        { description: { contains: search } },
        { scopeBrief: { contains: search } },
        { acceptanceCriteria: { contains: search } },
        { workType: { contains: search } },
      ];
    }

    const where: any = { ...baseWhere };
    if (status) where.status = this.normalizeWorkItemStatusId(status) as any;
    if (!status && !includeClosed) where.status = { notIn: statusFlow.terminalStatuses as any };
    const statusCountWhere = {
      ...baseWhere,
      ...(!includeClosed ? { status: { notIn: statusFlow.terminalStatuses as any } } : {}),
    };

    const [items, total, statusCountsRaw] = await Promise.all([
      this.prisma.projectWorkItem.findMany({
        where,
        include: {
          owner: { select: { id: true, email: true, displayName: true, role: true } },
          assignments: {
            include: {
              assigneeUser: { select: { id: true, email: true, displayName: true, role: true } },
            },
            orderBy: { createdAt: 'desc' },
          },
          _count: { select: { assignments: true, artifacts: true, reviews: true, comments: true } },
        },
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.projectWorkItem.count({ where }),
      this.prisma.projectWorkItem.groupBy({
        by: ['status'],
        where: statusCountWhere,
        _count: { _all: true },
      }),
    ]);
    const statusCounts = statusCountsRaw.reduce<Record<string, number>>((counts, row) => {
      counts[row.status] = row._count._all;
      return counts;
    }, {});

    return {
      data: items.map((item) => this.sanitizeWorkItemForResponse(item)),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit), statusCounts },
    };
  }

  async getWorkItem(projectId: string, workItemId: string, userId?: string | null) {
    await this.ensureProjectReadable(projectId, userId);

    const item = await this.prisma.projectWorkItem.findFirst({
      where: { id: workItemId, projectId },
      include: {
        owner: { select: { id: true, email: true, displayName: true, role: true } },
        createdBy: { select: { id: true, email: true, displayName: true, role: true } },
        assignments: {
          include: {
            assigneeUser: { select: { id: true, email: true, displayName: true, role: true } },
            assignedByUser: { select: { id: true, email: true, displayName: true, role: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        artifacts: { orderBy: { createdAt: 'desc' }, take: 20 },
        reviews: {
          include: {
            reviewerUser: { select: { id: true, email: true, displayName: true, role: true } },
            artifact: { select: { id: true, title: true, artifactType: true, url: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        runs: { orderBy: { createdAt: 'desc' }, take: 20 },
        comments: {
          include: {
            user: { select: { id: true, email: true, displayName: true, role: true, avatarUrl: true } },
          },
          orderBy: { createdAt: 'asc' },
          take: 100,
        },
        _count: { select: { assignments: true, artifacts: true, reviews: true, runs: true, comments: true } },
      },
    });

    if (!item) {
      throw new NotFoundException('Project work item not found');
    }

    return this.sanitizeWorkItemForResponse(item);
  }

  async listWorkItemComments(projectId: string, workItemId: string, userId: string | null | undefined) {
    await this.ensureProjectReadable(projectId, userId);
    await this.ensureProjectScopedReference(projectId, 'workItem', workItemId);

    return this.prisma.projectWorkItemComment.findMany({
      where: { projectId, workItemId },
      include: {
        user: { select: { id: true, email: true, displayName: true, role: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createWorkItemComment(projectId: string, workItemId: string, userId: string, dto: CreateProjectWorkItemCommentDto) {
    await this.ensureProjectAccess(projectId, userId);
    await this.ensureProjectScopedReference(projectId, 'workItem', workItemId);

    return this.prisma.projectWorkItemComment.create({
      data: {
        projectId,
        workItemId,
        userId,
        content: dto.content,
        attachments: dto.attachments ?? [],
      },
      include: {
        user: { select: { id: true, email: true, displayName: true, role: true, avatarUrl: true } },
      },
    });
  }

  async updateWorkItem(projectId: string, workItemId: string, userId: string, dto: UpdateProjectWorkItemDto) {
    const project = await this.ensureProjectManager(projectId, userId);
    const statusFlow = this.resolveProjectWorkItemStatusFlow(project.settings);
    await this.ensureProjectScopedReference(projectId, 'workItem', workItemId);
    const current = await this.prisma.projectWorkItem.findUnique({
      where: { id: workItemId },
      select: { status: true, title: true, workType: true, goalId: true, featureId: true, inputPacket: true },
    });
    const nextStatus = dto.status ? this.normalizeWorkItemStatusId(dto.status) : current?.status;
    const nextInputPacket = dto.inputPacket ?? current?.inputPacket;
    const nextResourceRequest = this.projectGlobalResourceRequestFromPacket(nextInputPacket, current?.goalId);
    if (
      nextResourceRequest &&
      statusFlow.completedStatuses.includes(this.normalizeWorkItemStatusId(nextStatus)) &&
      !nextResourceRequest.value
    ) {
      throw new BadRequestException('Project resource value is required before completing this owner item');
    }

    const item = await this.prisma.projectWorkItem.update({
      where: { id: workItemId },
      data: {
        title: dto.title,
        description: dto.description,
        workType: dto.workType,
        status: dto.status ? this.normalizeWorkItemStatusId(dto.status) as any : undefined,
        scopeBrief: dto.scopeBrief,
        acceptanceCriteria: dto.acceptanceCriteria,
        inputPacket: dto.inputPacket,
        outputContract: dto.outputContract,
        dependsOn: dto.dependsOn,
        concurrencyMode: (dto.concurrencyMode as any) ?? undefined,
        priority: dto.priority,
        ownerId: dto.ownerId,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
      },
    });
    const completedResourceRequest = await this.applyCompletedProjectGlobalResourceRequest(projectId, userId, item);
    const ownerTodoKind = this.ownerTodoPacketKind(item.inputPacket, item.goalId);
    const completedOwnerTodo = Boolean(
      ownerTodoKind &&
      statusFlow.completedStatuses.includes(this.normalizeWorkItemStatusId(item.status)) &&
      !statusFlow.completedStatuses.includes(this.normalizeWorkItemStatusId(current?.status)),
    );
    const changedFields = Object.entries(dto)
      .filter(([, value]) => value !== undefined)
      .map(([key]) => key);
    if (changedFields.length || current?.status !== item.status) {
      await this.recordWorkItemEvent(projectId, userId, 'WORK_ITEM_UPDATED', item.id, {
        title: item.title,
        workType: item.workType,
        goalId: item.goalId,
        featureId: item.featureId,
        changedFields,
        previousStatus: current?.status || null,
        status: item.status,
        source: 'host',
      });
    }
    if (completedOwnerTodo) {
      this.notifyOwnerTodoRequester(
        projectId,
        userId,
        item,
        ownerTodoKind as 'resourceRequest' | 'ownerAction',
      ).catch((error: any) => {
        this.logger.warn(`Failed to notify owner todo requester for ${projectId}/${item.id}: ${error?.message || error}`);
      });
    }
    if (completedResourceRequest || completedOwnerTodo) {
      this.scheduleLeadPollingWake(
        projectId,
        (project as any).ownerId || (project as any).leadAgentUserId || userId,
        completedResourceRequest
          ? `resource request ${item.id} completed`
          : `owner todo ${item.id} completed`,
      );
    }
    if (completedResourceRequest || completedOwnerTodo || this.shouldScheduleCoordinatorTickForStatus(item.status, project.settings)) {
      this.scheduleCoordinatorTick(
        projectId,
        userId,
        completedResourceRequest
          ? `resource request ${item.id} completed`
          : completedOwnerTodo
            ? `owner todo ${item.id} completed`
          : `work item ${item.id} updated to ${item.status}`,
      );
    }
    return this.sanitizeWorkItemForResponse(item);
  }

  async createAssignment(projectId: string, workItemId: string, userId: string, dto: CreateProjectAssignmentDto) {
    await this.ensureProjectManager(projectId, userId);
    await this.ensureProjectScopedReference(projectId, 'workItem', workItemId);

    const membership = await this.prisma.projectMember.findFirst({
      where: {
        projectId,
        userId: dto.assigneeUserId,
        removedAt: null,
      },
      select: { id: true, permissions: true },
    });

    if (!membership) {
      throw new BadRequestException('Assignee must be an active project member before dispatch');
    }

    const contextPacket = await this.buildAssignmentContextPacket(projectId, workItemId, dto);
    const targetRuntimeId = dto.targetRuntimeId || this.runtimeIdFromPermissions(membership.permissions);

    const created = await this.withWorkspaceMutationRetry(
      () => this.agentWorkspaceClient.createAssignment(projectId, {
        workItemId,
        assigneeMemberId: membership.id,
        assignedByUserId: userId,
        ...(targetRuntimeId ? { targetRuntimeId } : {}),
        role: dto.role,
        objective: dto.objective,
        contextPacket,
      }),
      `createAssignment:${projectId}:${workItemId}`,
    );

    const assignment = await this.prisma.projectAssignment.findUnique({
      where: { id: created.assignmentId },
      include: {
        assigneeUser: { select: { id: true, email: true, displayName: true, role: true } },
        assignedByUser: { select: { id: true, email: true, displayName: true, role: true } },
      },
    });

    if (!assignment) {
      throw new NotFoundException('Project assignment not found after dispatch');
    }
    await this.syncCurrentProjectGlobalsToRuntimeSessions(projectId).catch((error: any) => {
      this.logger.warn(
        `Failed to sync project globals after assignment ${assignment.id}: ${error?.message || error}`,
      );
    });

    return assignment;
  }

  private async buildAssignmentContextPacket(
    projectId: string,
    workItemId: string,
    dto: CreateProjectAssignmentDto,
  ) {
    const workItem = await this.prisma.projectWorkItem.findFirst({
      where: { id: workItemId, projectId },
      include: {
        goal: { select: { id: true, title: true, description: true, status: true } },
        feature: { select: { id: true, title: true, description: true, status: true } },
      },
    });
    if (!workItem) {
      throw new NotFoundException('Project work item not found');
    }

    const provided =
      dto.contextPacket && typeof dto.contextPacket === 'object' && !Array.isArray(dto.contextPacket)
        ? dto.contextPacket as Record<string, any>
        : {};
    const initialProjectFiles = this.collectProjectFileReferences({
      textSources: [
        { source: 'workItem.title', value: workItem.title },
        { source: 'workItem.description', value: workItem.description },
        { source: 'workItem.scopeBrief', value: workItem.scopeBrief },
        { source: 'workItem.acceptanceCriteria', value: workItem.acceptanceCriteria },
        { source: 'contextPacket.notes', value: provided.notes },
        { source: 'contextPacket.scopeBrief', value: provided.scopeBrief },
      ],
      packetSources: [
        { source: 'workItem.inputPacket.projectFiles', value: workItem.inputPacket },
        { source: 'contextPacket.projectFiles', value: provided },
        { source: 'contextPacket.inputPacket.projectFiles', value: provided.inputPacket },
      ],
    });
    const workItemContext = await this.recentWorkItemContextForAssignment(projectId, workItemId);
    const projectFiles = this.mergeProjectFileReferences(
      initialProjectFiles,
      Array.isArray(workItemContext.projectFiles) ? workItemContext.projectFiles : [],
    );

    const workItemInputPacket =
      projectFiles.length > 0
        ? {
            ...(workItem.inputPacket && typeof workItem.inputPacket === 'object' && !Array.isArray(workItem.inputPacket)
              ? workItem.inputPacket as Record<string, any>
              : {}),
            projectFiles,
          }
        : workItem.inputPacket;
    const outputProjectFiles = this.collectOutputProjectFilePaths(workItem.inputPacket, workItem.outputContract, provided);
    const memoryRefs = await this.relevantMemoryRefsForAssignment(projectId, workItem, provided);

    return this.sanitizeAssignmentContextPacket({
      ...provided,
      source: provided.source || 'project-assignment-dispatch',
      projectId,
      assignmentRole: dto.role,
      objective: provided.objective || dto.objective || workItem.title,
      projectFiles,
      outputProjectFiles,
      memoryRefs,
      memoryContextPolicy: memoryRefs.length
        ? 'These memory refs were selected at dispatch time; treat them as reusable project constraints/decisions/risks relevant to this item.'
        : 'No reusable project memory was selected for this assignment at dispatch time.',
      revisionFeedback: workItemContext.latestChangeRequest ?? provided.revisionFeedback ?? null,
      workItemContext: {
        ...(provided.workItemContext && typeof provided.workItemContext === 'object' && !Array.isArray(provided.workItemContext)
          ? provided.workItemContext
          : {}),
        ...workItemContext,
      },
      workItem: {
        id: workItem.id,
        title: workItem.title,
        description: workItem.description,
        workType: workItem.workType,
        status: workItem.status,
        scopeBrief: workItem.scopeBrief,
        acceptanceCriteria: workItem.acceptanceCriteria,
        inputPacket: workItemInputPacket,
        outputContract: workItem.outputContract,
        dependsOn: workItem.dependsOn,
        concurrencyMode: workItem.concurrencyMode,
        priority: workItem.priority,
        dueAt: workItem.dueAt,
        ...(provided.workItem && typeof provided.workItem === 'object' ? provided.workItem : {}),
      },
      goal: workItem.goal
        ? {
            id: workItem.goal.id,
            title: workItem.goal.title,
            description: workItem.goal.description,
            status: workItem.goal.status,
            ...(provided.goal && typeof provided.goal === 'object' ? provided.goal : {}),
          }
        : provided.goal ?? null,
      feature: workItem.feature
        ? {
            id: workItem.feature.id,
            title: workItem.feature.title,
            description: workItem.feature.description,
            status: workItem.feature.status,
            ...(provided.feature && typeof provided.feature === 'object' ? provided.feature : {}),
          }
        : provided.feature ?? null,
      workerStartChecklist: [
        'Resume workspace context and inspect assignment inbox.',
        'Confirm objective, scope brief, acceptance criteria, dependencies, and output contract.',
        `Use --work-item ${workItem.id} on project-file helper writes/uploads/deletes, or include X-AgentCraft-Work-Item-Id/workItemId on direct item-scoped workspace writes.`,
        'Read and respect memoryRefs in this packet; do not do a broad memory search unless the packet is missing historical context.',
        'Read every referenced project file in projectFiles before analyzing or editing.',
        'If revisionFeedback or workItemContext.reviews contains requested changes, address those specific review points before marking the assignment complete.',
        'Check workItemContext.comments and attachment lists for owner/reviewer-provided context that is not repeated in the title or scope brief.',
        outputProjectFiles.length
          ? `Write required shared output file(s) exactly at: ${outputProjectFiles.join(', ')}. Verify each path with project-file-read or /files/read before completing.`
          : 'If the output contract names a shared project-file path, write it with project-file-write or /files/write and verify it before completing.',
        'Start or update an execution run before making substantive changes.',
        'Log blockers or meaningful progress.',
        'Submit artifacts or external links, then finish with a handoff containing changes, verification, residual risks, and any memoryCandidates that should be considered during review.',
      ],
    }) as Record<string, any>;
  }

  private collectProjectFileReferences(input: {
    textSources?: Array<{ source: string; value: unknown }>;
    packetSources?: Array<{ source: string; value: unknown }>;
  }) {
    const refs = new Map<string, { path: string; mention: string; source: string; readHint: string }>();
    const addRef = (raw: unknown, source: string, mention?: string) => {
      const path = this.normalizeProjectFileReference(raw);
      if (!path || refs.has(path)) return;
      refs.set(path, {
        path,
        mention: mention || `@${path}`,
        source,
        readHint: `Read with project-file-read ${path} or GET /v1/projects/{projectId}/files/read?path=${encodeURIComponent(path)}`,
      });
    };

    for (const { source, value } of input.packetSources || []) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
      const packet = value as Record<string, any>;
      const explicit = Array.isArray(packet.projectFiles) ? packet.projectFiles : [];
      for (const item of explicit) {
        addRef(typeof item === 'string' ? item : item?.path, source, typeof item === 'string' ? `@${item}` : item?.mention);
      }
    }

    const mentionPattern = /@(?:(project-file):)?([A-Za-z0-9._~!$&()+,;=:%/-]+)/g;
    for (const { source, value } of input.textSources || []) {
      if (typeof value !== 'string') continue;
      for (const match of value.matchAll(mentionPattern)) {
        const explicitProjectFile = Boolean(match[1]);
        const rawPath = (match[2] || '').trim();
        const previousChar = match.index > 0 ? value[match.index - 1] : '';
        if (!explicitProjectFile && previousChar && /\S/.test(previousChar)) continue;
        const isFolderMention = rawPath.endsWith('/');
        if (!explicitProjectFile && !isFolderMention && !rawPath.includes('/')) continue;
        addRef(rawPath, source, match[0]);
      }
    }

    return [...refs.values()];
  }

  private mergeProjectFileReferences(
    ...groups: Array<Array<{ path: string; mention?: string; source?: string; readHint?: string }> | undefined>
  ) {
    const merged = new Map<string, { path: string; mention: string; source: string; readHint: string }>();
    for (const group of groups) {
      for (const item of group || []) {
        const path = this.normalizeProjectFileReference(item?.path);
        if (!path || merged.has(path)) continue;
        merged.set(path, {
          path,
          mention: item.mention || `@${path}`,
          source: item.source || 'assignment-context',
          readHint:
            item.readHint ||
            `Read with project-file-read ${path} or GET /v1/projects/{projectId}/files/read?path=${encodeURIComponent(path)}`,
        });
      }
    }
    return [...merged.values()];
  }

  private truncateAssignmentContextText(value: unknown, maxLength = 4000) {
    if (typeof value !== 'string') return value ?? null;
    if (value.length <= maxLength) return value;
    return `${value.slice(0, maxLength)}\n[truncated ${value.length - maxLength} chars]`;
  }

  private assignmentContextTimestamp(value: unknown) {
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'string') return value;
    return value ?? null;
  }

  private projectFileReferencesFromAttachmentLike(value: unknown, source: string) {
    const refs: unknown[] = [];
    const collect = (item: unknown) => {
      if (!item) return;
      if (typeof item === 'string') {
        refs.push({ path: item, source });
        return;
      }
      if (typeof item !== 'object' || Array.isArray(item)) return;
      const record = item as Record<string, any>;
      const path = record.path || record.projectFilePath || record.outputPath;
      if (typeof path === 'string') {
        refs.push({
          path,
          mention: record.mention,
          source,
          readHint: record.readHint,
        });
      }
    };
    if (Array.isArray(value)) {
      for (const item of value) collect(item);
    } else {
      collect(value);
    }
    return this.collectProjectFileReferences({
      packetSources: [{ source, value: { projectFiles: refs } }],
    });
  }

  private projectFileReferencesFromArtifactMetadata(metadata: any, source: string) {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return [];
    return this.mergeProjectFileReferences(
      this.projectFileReferencesFromAttachmentLike(metadata.projectFiles, `${source}.projectFiles`),
      this.projectFileReferencesFromAttachmentLike(metadata.resources, `${source}.resources`),
      this.projectFileReferencesFromAttachmentLike(metadata.outputProjectFiles, `${source}.outputProjectFiles`),
      this.projectFileReferencesFromAttachmentLike(metadata.sharedFiles, `${source}.sharedFiles`),
    );
  }

  private normalizeAssignmentComment(comment: any) {
    return {
      id: comment.id,
      content: this.truncateAssignmentContextText(comment.content),
      attachments: Array.isArray(comment.attachments) ? comment.attachments : [],
      author: comment.user
        ? {
            id: comment.user.id,
            displayName: comment.user.displayName || null,
            email: comment.user.email || null,
            role: comment.user.role || null,
          }
        : undefined,
      createdAt: this.assignmentContextTimestamp(comment.createdAt),
      updatedAt: this.assignmentContextTimestamp(comment.updatedAt),
    };
  }

  private normalizeAssignmentArtifact(artifact: any) {
    const metadata =
      artifact?.metadata && typeof artifact.metadata === 'object' && !Array.isArray(artifact.metadata)
        ? artifact.metadata
        : {};
    return {
      id: artifact.id,
      artifactType: artifact.artifactType,
      title: artifact.title,
      content: this.truncateAssignmentContextText(artifact.content),
      url: artifact.url,
      metadata,
      projectFiles: this.projectFileReferencesFromArtifactMetadata(metadata, `artifact:${artifact.id}`),
      createdAt: this.assignmentContextTimestamp(artifact.createdAt),
    };
  }

  private normalizeAssignmentReview(review: any) {
    return {
      id: review.id,
      assignmentId: review.assignmentId,
      artifactId: review.artifactId,
      reviewerType: review.reviewerType,
      status: review.status,
      summary: this.truncateAssignmentContextText(review.reviewNote),
      details: review.checklistResult ?? null,
      reviewer: review.reviewerUser
        ? {
            id: review.reviewerUser.id,
            displayName: review.reviewerUser.displayName || null,
            email: review.reviewerUser.email || null,
            role: review.reviewerUser.role || null,
          }
        : undefined,
      artifact: review.artifact
        ? {
            id: review.artifact.id,
            title: review.artifact.title,
            artifactType: review.artifact.artifactType,
            url: review.artifact.url,
            metadata: review.artifact.metadata ?? null,
            projectFiles: this.projectFileReferencesFromArtifactMetadata(
              review.artifact.metadata,
              `review:${review.id}.artifact`,
            ),
          }
        : undefined,
      createdAt: this.assignmentContextTimestamp(review.createdAt),
      updatedAt: this.assignmentContextTimestamp(review.updatedAt),
    };
  }

  private async recentWorkItemContextForAssignment(projectId: string, workItemId: string) {
    const prismaAny = this.prisma as any;
    const [rawCommentsResult, rawReviewsResult, rawArtifactsResult] = await Promise.all([
      prismaAny.projectWorkItemComment?.findMany
        ? prismaAny.projectWorkItemComment.findMany({
            where: { projectId, workItemId },
            include: {
              user: { select: { id: true, email: true, displayName: true, role: true } },
            },
            orderBy: { createdAt: 'desc' },
            take: 20,
          })
        : [],
      prismaAny.projectReview?.findMany
        ? prismaAny.projectReview.findMany({
            where: { projectId, workItemId },
            include: {
              reviewerUser: { select: { id: true, email: true, displayName: true, role: true } },
              artifact: { select: { id: true, title: true, artifactType: true, url: true, metadata: true } },
            },
            orderBy: { createdAt: 'desc' },
            take: 20,
          })
        : [],
      prismaAny.projectArtifact?.findMany
        ? prismaAny.projectArtifact.findMany({
            where: { projectId, workItemId },
            orderBy: { createdAt: 'desc' },
            take: 20,
          })
        : [],
    ]);

    const rawComments = rawCommentsResult as any[];
    const rawReviews = rawReviewsResult as any[];
    const rawArtifacts = rawArtifactsResult as any[];
    const comments = [...rawComments].reverse().map((comment) => this.normalizeAssignmentComment(comment));
    const reviews = rawReviews.map((review) => this.normalizeAssignmentReview(review));
    const artifacts = rawArtifacts.map((artifact) => this.normalizeAssignmentArtifact(artifact));
    const latestChangeRequest =
      reviews.find((review) => ['CHANGES_REQUESTED', 'REQUEST_CHANGES'].includes(String(review.status || '').toUpperCase())) ||
      null;
    const commentProjectFiles = this.mergeProjectFileReferences(
      ...comments.map((comment) =>
        this.projectFileReferencesFromAttachmentLike(comment.attachments, `comment:${comment.id}.attachments`),
      ),
    );
    const reviewProjectFiles = this.mergeProjectFileReferences(
      ...reviews.flatMap((review) => [review.artifact?.projectFiles || []]),
    );
    const artifactProjectFiles = this.mergeProjectFileReferences(
      ...artifacts.map((artifact) => artifact.projectFiles),
    );
    const attachmentList = [
      ...comments.flatMap((comment) =>
        (comment.attachments || []).map((attachment: any) => ({
          ...attachment,
          source: `comment:${comment.id}`,
        })),
      ),
      ...artifacts.flatMap((artifact) => {
        const projectFiles = Array.isArray(artifact.metadata?.projectFiles) ? artifact.metadata.projectFiles : [];
        const resources = Array.isArray(artifact.metadata?.resources) ? artifact.metadata.resources : [];
        return [...projectFiles, ...resources].map((attachment: any) => ({
          ...attachment,
          source: `artifact:${artifact.id}`,
        }));
      }),
    ];

    return {
      comments,
      reviews,
      artifacts,
      latestChangeRequest,
      attachments: attachmentList,
      projectFiles: this.mergeProjectFileReferences(commentProjectFiles, reviewProjectFiles, artifactProjectFiles),
    };
  }

  private collectOutputProjectFilePaths(inputPacket: any, outputContract: any, provided: Record<string, any>) {
    const candidates: unknown[] = [];
    const addFromObject = (value: any) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return;
      for (const key of ['projectFilePath', 'outputPath', 'path']) {
        if (typeof value[key] === 'string') candidates.push(value[key]);
      }
      if (Array.isArray(value.sharedFiles)) {
        for (const item of value.sharedFiles) {
          candidates.push(typeof item === 'string' ? item : item?.path);
        }
      }
      if (Array.isArray(value.outputProjectFiles)) {
        for (const item of value.outputProjectFiles) {
          candidates.push(typeof item === 'string' ? item : item?.path);
        }
      }
    };

    addFromObject(inputPacket);
    addFromObject(outputContract);
    addFromObject(provided);
    addFromObject(provided?.outputContract);
    addFromObject(provided?.inputPacket);

    return [...new Set(
      candidates
        .map((candidate) => this.normalizeProjectFileReference(candidate))
        .filter((path): path is string => Boolean(path)),
    )];
  }

  private runtimeWorkItemIdempotencyPaths(inputPacket: any, outputContract: any) {
    const paths: string[] = [];
    if (inputPacket && typeof inputPacket === 'object' && !Array.isArray(inputPacket)) {
      if (typeof inputPacket.outputPath === 'string' && inputPacket.outputPath.trim()) {
        paths.push(inputPacket.outputPath.trim());
      }
    }
    if (outputContract && typeof outputContract === 'object' && !Array.isArray(outputContract)) {
      if (typeof outputContract.path === 'string' && outputContract.path.trim()) {
        paths.push(outputContract.path.trim());
      }
      if (Array.isArray(outputContract.sharedFiles)) {
        paths.push(
          ...outputContract.sharedFiles
            .filter((path: unknown): path is string => typeof path === 'string' && Boolean(path.trim()))
            .map((path: string) => path.trim()),
        );
      }
    }
    return [...new Set(paths.map((path) => path.replace(/\\/g, '/').replace(/^\/+/, '')))];
  }

  private normalizeWorkItemSemanticTitle(title: unknown) {
    return String(title || '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .replace(/\s+/g, ' ');
  }

  private runtimeWorkItemSemanticIdentities(workItem: {
    goalId?: string | null;
    workType?: string | null;
    title?: string | null;
    inputPacket?: any;
    ownerId?: string | null;
  }) {
    const goalId = typeof workItem.goalId === 'string' && workItem.goalId.trim()
      ? workItem.goalId.trim()
      : '';
    const workType = typeof workItem.workType === 'string' && workItem.workType.trim()
      ? workItem.workType.trim().toUpperCase()
      : '';
    if (!goalId || !workType) return [];

    const inputPacket = workItem.inputPacket;
    const resourceRequest = this.projectGlobalResourceRequestFromPacket(inputPacket, goalId);
    if (resourceRequest) {
      return [`resource-request:${this.projectGlobalIdentity(resourceRequest)}`];
    }
    if (
      inputPacket &&
      typeof inputPacket === 'object' &&
      !Array.isArray(inputPacket) &&
      inputPacket.ownerAction &&
      typeof inputPacket.ownerAction === 'object' &&
      !Array.isArray(inputPacket.ownerAction)
    ) {
      const key = typeof inputPacket.ownerAction.key === 'string' ? inputPacket.ownerAction.key.trim() : '';
      return key ? [`owner-action:${goalId}:${key}`] : [];
    }
    if (!this.isRuntimeCreatedWorkItem(inputPacket) || workItem.ownerId) return [];

    const identities: string[] = [];
    const title = this.normalizeWorkItemSemanticTitle(workItem.title);
    if (title) identities.push(`goal:${goalId}:type:${workType}:title:${title}`);
    if (['SECURITY_AUDIT', 'SECURITY_AUDITOR'].includes(workType)) {
      identities.push(`goal:${goalId}:type:${workType}:family:security-audit`);
    }
    if (workType === 'PLANNING') {
      identities.push(`goal:${goalId}:type:${workType}:family:planning`);
    }
    return [...new Set(identities)];
  }

  private isRuntimeCreatedWorkItem(inputPacket: any) {
    return Boolean(
      inputPacket &&
      typeof inputPacket === 'object' &&
      !Array.isArray(inputPacket) &&
      (inputPacket.source === 'agent-runtime' || inputPacket.agentRuntime),
    );
  }

  private isOwnerDirectedWorkItemPacket(inputPacket: any, fallbackGoalId?: string | null) {
    if (!inputPacket || typeof inputPacket !== 'object' || Array.isArray(inputPacket)) return false;
    if (this.projectGlobalResourceRequestFromPacket(inputPacket, fallbackGoalId)) return true;
    return Boolean(
      inputPacket.ownerAction &&
      typeof inputPacket.ownerAction === 'object' &&
      !Array.isArray(inputPacket.ownerAction),
    );
  }

  private isHackerOneOpportunityDiscoveryWorkItem(input: {
    title?: string | null;
    description?: string | null;
    scopeBrief?: string | null;
    acceptanceCriteria?: string | null;
    inputPacket?: any;
    outputContract?: any;
  }) {
    const packet = input.inputPacket;
    if (!packet || typeof packet !== 'object' || Array.isArray(packet)) return false;
    const opportunitySource = typeof packet.opportunitySource === 'string'
      ? packet.opportunitySource.toLowerCase()
      : '';
    if (opportunitySource.includes('hackerone.com/opportunities')) return true;

    const sharedFiles = Array.isArray(packet.sharedFiles)
      ? packet.sharedFiles.map((item: any) => (typeof item === 'string' ? item : item?.path))
      : [];
    const paths = [
      ...this.cleanStringList(packet.outputProjectFiles),
      ...this.cleanStringList(sharedFiles),
      ...this.cleanStringList(input.outputContract?.sharedFiles),
    ]
      .map((path) => path.replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase());
    if (
      paths.includes('analysed/project-addresses.jsonl') ||
      paths.includes('opportunities/analyzed.jsonl')
    ) {
      return true;
    }

    const text = [
      input.title,
      input.description,
      input.scopeBrief,
      input.acceptanceCriteria,
    ].filter(Boolean).join(' ').toLowerCase();
    return text.includes('hackerone opportunity discovery') && text.includes('opportunities/all');
  }

  private normalizeProjectFileReference(raw: unknown) {
    if (typeof raw !== 'string') return null;
    let value = raw.trim();
    if (!value) return null;
    value = value.replace(/^@/, '').replace(/^project-file:/, '').replace(/\\/g, '/');
    value = value.replace(/^\/+/, '').replace(/[),;:!?]+$/g, '');
    if (value.endsWith('.') && value.slice(0, -1).includes('.')) value = value.slice(0, -1);
    if (!value || value.includes('..') || value.includes('//')) return null;
    if (!value.includes('/') && !value.includes('.')) return null;
    return value;
  }

  private memorySearchTextFromWorkItem(workItem: {
    title?: string | null;
    description?: string | null;
    scopeBrief?: string | null;
    acceptanceCriteria?: string | null;
    workType?: string | null;
    inputPacket?: any;
    outputContract?: any;
    goal?: { title?: string | null; description?: string | null } | null;
    feature?: { title?: string | null; description?: string | null } | null;
  }) {
    return [
      workItem.title,
      workItem.description,
      workItem.scopeBrief,
      workItem.acceptanceCriteria,
      workItem.workType,
      workItem.goal?.title,
      workItem.goal?.description,
      workItem.feature?.title,
      workItem.feature?.description,
      JSON.stringify(workItem.inputPacket || {}),
      JSON.stringify(workItem.outputContract || {}),
    ].filter(Boolean).join(' ');
  }

  private memorySearchTokens(text: string) {
    const stopWords = new Set([
      'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'when', 'then',
      'work', 'item', 'task', 'agent', 'project', 'should', 'must', 'will', 'using',
      '一个', '这个', '需要', '任务', '项目', '进行', '完成', '相关',
    ]);
    return [...new Set(
      String(text || '')
        .toLowerCase()
        .match(/[\p{L}\p{N}_-]{3,}/gu) || [],
    )]
      .filter((token) => !stopWords.has(token))
      .slice(0, 40);
  }

  private scoreProjectMemory(memory: any, tokens: string[]) {
    const typeWeight: Record<string, number> = {
      CONSTRAINT: 5,
      INTERFACE_CONTRACT: 5,
      DECISION: 4,
      RISK: 4,
      OPEN_QUESTION: 3,
      FACT: 1,
    };
    const text = `${memory.title || ''} ${memory.summary || ''} ${memory.content || ''}`.toLowerCase();
    let score = typeWeight[memory.memoryType] || 0;
    for (const token of tokens) {
      if (text.includes(token)) score += 1;
    }
    return score;
  }

  private async relevantMemoryRefsForAssignment(projectId: string, workItem: any, provided: Record<string, any>) {
    const explicitRefs = Array.isArray(provided.memoryRefs) ? provided.memoryRefs : [];
    const tokens = this.memorySearchTokens(this.memorySearchTextFromWorkItem(workItem));
    const response = await this.agentWorkspaceClient.listProjectMemories(projectId, { limit: 80 }).catch(() => ({ memories: [] }));
    const candidates = (response.memories || [])
      .map((memory: any) => ({ memory, score: this.scoreProjectMemory(memory, tokens) }))
      .filter(({ memory, score }: any) =>
        score >= 5 &&
        ['CONSTRAINT', 'INTERFACE_CONTRACT', 'DECISION', 'RISK', 'OPEN_QUESTION'].includes(memory.memoryType),
      )
      .sort((a: any, b: any) => b.score - a.score)
      .slice(0, 5)
      .map(({ memory, score }: any) => ({
        id: memory.id,
        memoryType: memory.memoryType,
        type: memory.memoryType,
        title: memory.title || memory.summary || memory.content?.slice(0, 80),
        summary: memory.summary || memory.content?.slice(0, 500),
        sourceArtifactId: memory.sourceArtifactId || null,
        relevanceScore: score,
      }));

    const seen = new Set<string>();
    return [...explicitRefs, ...candidates].filter((memory: any) => {
      const key = memory.id || `${memory.memoryType || memory.type}:${memory.title || memory.summary || ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 8);
  }

  private plannerGoalAnalysisRule(
    rules: ProjectCoordinatorDispatchRule[],
    statusFlow: ResolvedProjectWorkItemStatusFlow,
  ) {
    return rules.find((rule) => {
      if (String(rule.role || '').toUpperCase() !== 'PLANNER_AGENT') return false;
      if (!(rule.workTypes || []).map((workType) => String(workType || '').toUpperCase()).includes('PLANNING')) return false;
      const ruleStatuses = (rule.statuses || []).map((status) => this.normalizeWorkItemStatusId(status));
      return !ruleStatuses.length || ruleStatuses.some((status) => statusFlow.claimableStatuses.includes(status));
    }) || null;
  }

  private plannerGoalAnalysisStatus(
    rule: ProjectCoordinatorDispatchRule,
    statusFlow: ResolvedProjectWorkItemStatusFlow,
  ) {
    return (rule.statuses || [])
      .map((status) => this.normalizeWorkItemStatusId(status))
      .find((status) => statusFlow.claimableStatuses.includes(status)) || statusFlow.initialStatus;
  }

  private async ensurePlannerItemsForUnanalysedGoals(
    projectId: string,
    userId: string,
    statusFlow: ResolvedProjectWorkItemStatusFlow,
    rules: ProjectCoordinatorDispatchRule[],
    maxItems: number,
  ) {
    const plannerRule = this.plannerGoalAnalysisRule(rules, statusFlow);
    const prismaAny = this.prisma as any;
    if (!plannerRule || !prismaAny.projectGoal?.findMany || !prismaAny.projectWorkItem?.create) {
      return [];
    }

    const planningStatus = this.plannerGoalAnalysisStatus(plannerRule, statusFlow);
    const goals = await prismaAny.projectGoal.findMany({
      where: {
        projectId,
        status: { in: ['OPEN', 'IN_PROGRESS', 'BLOCKED'] },
        workItems: {
          none: {
            status: { notIn: statusFlow.terminalStatuses as any },
          },
        },
      },
      select: {
        id: true,
        title: true,
        description: true,
        priority: true,
        status: true,
        createdAt: true,
        workItems: {
          where: {
            workType: { in: ['PLANNING', 'OPPORTUNITY_DISCOVERY'] as any },
          },
          select: {
            id: true,
            title: true,
            status: true,
            workType: true,
            inputPacket: true,
          },
          take: 20,
        },
        createdBy: {
          select: {
            role: true,
          },
        },
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      take: Math.max(1, Math.min(maxItems * 4 + 10, 50)),
    });

    const created: any[] = [];
    const nowMs = Date.now();
    let deferredRecentAgentGoal = false;
    const matureGoals = goals.filter((goal: any) => {
      const creatorRole = String(goal?.createdBy?.role || '').toUpperCase();
      const createdAtMs = goal?.createdAt instanceof Date
        ? goal.createdAt.getTime()
        : Number.isFinite(Date.parse(String(goal?.createdAt || '')))
          ? Date.parse(String(goal?.createdAt || ''))
          : 0;
      const recentlyCreatedByAgent =
        creatorRole === 'AI_AGENT' &&
        this.plannerGoalAnalysisGraceMs > 0 &&
        createdAtMs > 0 &&
        nowMs - createdAtMs < this.plannerGoalAnalysisGraceMs;
      if (recentlyCreatedByAgent) {
        deferredRecentAgentGoal = true;
        return false;
      }
      return true;
    })
      .filter((goal: any) => !this.hasPriorPlannerGoalAnalysisItem(goal))
      .filter((goal: any) => !this.hasPriorOpportunityDiscoveryItem(goal))
      .slice(0, Math.max(1, maxItems));

    if (deferredRecentAgentGoal) {
      this.scheduleCoordinatorTick(
        projectId,
        userId,
        'recent agent-created goal planner grace elapsed',
        this.plannerGoalAnalysisGraceMs + 1_000,
      );
    }

    for (const goal of matureGoals) {
      const item = await prismaAny.projectWorkItem.create({
        data: {
          projectId,
          goalId: goal.id,
          title: `Plan Goal: ${goal.title || goal.id}`.slice(0, 190),
          description: 'Coordinator-created planner item for a goal that has no non-terminal work items.',
          workType: 'PLANNING',
          status: planningStatus,
          scopeBrief: [
            `Analyze goal ${goal.title || goal.id}.`,
            'Create the smallest next dispatchable work item needed to move this goal forward.',
          ].join('\n'),
          acceptanceCriteria: [
            '1. Read the linked goal and any referenced project files.',
            '2. Decide the smallest next work item needed for this goal.',
            '3. Create that linked work item through the runtime work-items/create helper with the correct workType, role-facing packet, and output contract.',
            '4. Do not dispatch the work yourself; leave the created item READY for the coordinator.',
          ].join('\n'),
          inputPacket: {
            source: 'project-coordinator',
            coordinatorGenerated: true,
            planningMode: 'goal-analysis',
            goal: {
              id: goal.id,
              title: goal.title,
              status: goal.status,
              description: goal.description,
            },
          },
          outputContract: {
            type: 'object',
            properties: {
              createdWorkItemIds: { type: 'array', items: { type: 'string' } },
              analysisSummary: { type: 'string' },
            },
            required: ['createdWorkItemIds', 'analysisSummary'],
          },
          priority: goal.priority ?? 0,
          createdById: userId,
        },
      });
      created.push(item);
      await this.recordCoordinatorEvent(
        projectId,
        userId,
        'COORDINATOR_CREATED_PLANNER_ITEM',
        {
          goalId: goal.id,
          goalTitle: goal.title || null,
          workItemId: item.id,
          workItemTitle: item.title || null,
        },
        { refType: 'WORK_ITEM', refId: item.id },
      ).catch((error: any) => {
        this.logger.warn(`Failed to record coordinator planner-item event for ${projectId}: ${error?.message || error}`);
      });
    }

    return created;
  }

  private async planningItemHasActiveSiblingWork(
    projectId: string,
    item: any,
    statusFlow: ResolvedProjectWorkItemStatusFlow,
  ) {
    if (String(item?.workType || '').trim().toUpperCase() !== 'PLANNING') return false;
    const goalId = typeof item?.goalId === 'string' && item.goalId.trim() ? item.goalId.trim() : '';
    if (!goalId) return false;
    const prismaAny = this.prisma as any;
    if (!prismaAny.projectWorkItem?.count) return false;
    const count = await prismaAny.projectWorkItem.count({
      where: {
        projectId,
        goalId,
        id: { not: item.id },
        workType: { not: 'PLANNING' as any },
        status: { notIn: statusFlow.terminalStatuses as any },
      },
    });
    return count > 0;
  }

  private hasPriorPlannerGoalAnalysisItem(goal: any) {
    return (goal?.workItems || []).some((item: any) => {
      const status = this.normalizeWorkItemStatusId(item?.status);
      if (['CANCELLED', 'REJECTED'].includes(status)) return false;
      const packet = item?.inputPacket && typeof item.inputPacket === 'object' && !Array.isArray(item.inputPacket)
        ? item.inputPacket as Record<string, any>
        : {};
      return packet.source === 'project-coordinator' && packet.planningMode === 'goal-analysis';
    });
  }

  private hasPriorOpportunityDiscoveryItem(goal: any) {
    return (goal?.workItems || []).some((item: any) =>
      String(item?.workType || '').trim().toUpperCase() === 'OPPORTUNITY_DISCOVERY',
    );
  }

  private coordinatorCandidateStatuses(settings: any) {
    const statusFlow = this.resolveProjectWorkItemStatusFlow(settings);
    if (!statusFlow.coordinator.enabled) return [];
    const rules = statusFlow.dispatchRules.length
      ? statusFlow.dispatchRules
      : [{
          statuses: statusFlow.claimableStatuses,
        }];
    return [...new Set(
      rules
        .flatMap((rule: any) => Array.isArray(rule.statuses) && rule.statuses.length
          ? rule.statuses
          : statusFlow.claimableStatuses)
        .map((status) => this.normalizeWorkItemStatusId(status))
        .filter((status) => status && !statusFlow.terminalStatuses.includes(status)),
    )];
  }

  private shouldScheduleCoordinatorTickForStatus(status: string | null | undefined, settings: any) {
    const normalizedStatus = this.normalizeWorkItemStatusId(status);
    if (!normalizedStatus) return false;
    return this.coordinatorCandidateStatuses(settings).includes(normalizedStatus);
  }

  private scheduleCoordinatorTick(projectId: string, userId: string, reason: string, delayMs = 750) {
    const existing = this.coordinatorTickTimers.get(projectId);
    if (existing) clearTimeout(existing);
    const safeDelayMs = Number.isFinite(delayMs) ? Math.max(0, Math.floor(delayMs)) : 750;

    const timer = setTimeout(() => {
      this.coordinatorTickTimers.delete(projectId);
      this.coordinatorTickUserId(projectId, userId).then((tickUserId) => {
        return this.tickProjectCoordinator(projectId, tickUserId);
      }).catch((error: any) => {
        this.logger.warn(
          `Scheduled coordinator tick failed for ${projectId} after ${reason}: ${error?.message || error}`,
        );
      });
    }, safeDelayMs);
    this.coordinatorTickTimers.set(projectId, timer);
  }

  private async coordinatorTickUserId(projectId: string, fallbackUserId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, deletedAt: null },
      select: { ownerId: true, leadAgentUserId: true },
    });
    return project?.ownerId || project?.leadAgentUserId || fallbackUserId;
  }

  private scheduleLeadPollingWake(projectId: string, userId: string, reason: string) {
    const existing = this.leadPollingWakeTimers.get(projectId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.leadPollingWakeTimers.delete(projectId);
      this.wakeLeadPolling(projectId, userId, reason).catch((error: any) => {
        this.logger.warn(
          `Scheduled lead polling wake failed for ${projectId} after ${reason}: ${error?.message || error}`,
        );
      });
    }, 750);
    this.leadPollingWakeTimers.set(projectId, timer);
  }

  private async wakeLeadPolling(projectId: string, userId: string, reason: string) {
    await this.ensureProjectAccess(projectId, userId);
    const member = await this.prisma.projectMember.findFirst({
      where: { projectId, role: 'LEAD_AGENT' as any, removedAt: null },
      orderBy: { id: 'asc' },
      select: { id: true, role: true, permissions: true },
    });
    if (!member) return { triggered: false, reason: 'No lead runtime member.' };

    const rawSession = this.readRuntimeSession(member.permissions);
    const session = rawSession ? this.recoverPersistedRuntimeSession(rawSession) : null;
    if (!session) return { memberId: member.id, triggered: false, reason: 'Lead runtime is not launched.' };
    if (rawSession !== session) {
      await this.writeRuntimeSession(member.id, session);
    }

    const explicitPollingConfig = this.readAgentPollingConfig(member.permissions);
    const config = await this.agentPollingConfigForRole(member.role, explicitPollingConfig);
    if (!config.enabled) {
      return { memberId: member.id, role: member.role, triggered: false, reason: 'Lead polling is disabled.' };
    }

    const inspectedSession = await this.agentRuntimeLauncher.inspect(session).catch(() => session);
    let inspected = this.recoverPersistedRuntimeSession(inspectedSession);
    if (this.agentPollingRuntimeNeedsReconnect(inspected)) {
      const reconnectResult = await this.reconnectAgentRuntime(projectId, member.id, userId).catch((error: any) => {
        this.logger.warn(`Lead wake reconnect failed for ${projectId}/${member.id}: ${error?.message || error}`);
        return null;
      });
      const reconnectedSession = (reconnectResult as any)?.session || null;
      if (reconnectedSession) {
        inspected = this.recoverPersistedRuntimeSession(reconnectedSession as AgentRuntimeSession);
      } else {
        const latestSession = await this.latestRuntimeSessionForMember(member.id);
        if (latestSession) {
          inspected = this.recoverPersistedRuntimeSession(latestSession);
        }
      }
      inspected = this.recoverPersistedRuntimeSession(
        await this.agentRuntimeLauncher.inspect(inspected).catch(() => inspected),
      );
    }
    const now = new Date();
    const currentState = this.completedPollingState(inspected, config, inspected.pollingState || {});
    const lastRunAt = currentState.lastRunAt ? new Date(currentState.lastRunAt).getTime() : 0;
    if (lastRunAt && Number.isFinite(lastRunAt) && now.getTime() - lastRunAt < 20_000) {
      await this.writeRuntimeSession(member.id, {
        ...inspected,
        pollingConfig: config,
        pollingState: currentState,
        updatedAt: now.toISOString(),
      });
      return { memberId: member.id, role: member.role, triggered: false, reason: 'Lead polling was recently triggered.' };
    }
    const apiOk = (inspected as any).apiHealth?.ok !== false;
    const dockerRunning = (inspected as any).dockerStatus?.running !== false;
    if (config.strategy === 'IDLE_ONLY' && (!apiOk || !dockerRunning)) {
      await this.writeRuntimeSession(member.id, {
        ...inspected,
        pollingConfig: config,
        pollingState: {
          ...(inspected.pollingState || {}),
          nextRunAt: this.nextAgentPollingRunAt({ ...config, intervalMinutes: 1 }, now),
          lastError: 'Runtime is not reachable.',
        },
        updatedAt: now.toISOString(),
      });
      return { memberId: member.id, role: member.role, triggered: false, reason: 'Lead runtime is not reachable.' };
    }
    if (this.runtimeHasOngoingConversation(inspected)) {
      await this.writeRuntimeSession(member.id, {
        ...inspected,
        pollingConfig: config,
        pollingState: {
          ...(inspected.pollingState || {}),
          nextRunAt: this.nextAgentPollingRunAt({ ...config, intervalMinutes: 1 }, now),
          lastError: null,
        },
        updatedAt: now.toISOString(),
      });
      return { memberId: member.id, role: member.role, triggered: false, reason: 'Lead is already working.' };
    }

    const pollingState: AgentRuntimePollingState = {
      ...(inspected.pollingState || {}),
      lastRunAt: now.toISOString(),
      lastCompletedAt: null,
      nextRunAt: null,
      lastError: null,
    };
    await this.writeRuntimeSession(member.id, {
      ...inspected,
      pollingConfig: config,
      pollingState,
      updatedAt: now.toISOString(),
    });

    const conversationResult = await this.createAgentRuntimeConversation(projectId, member.id, userId, {
      title: this.runtimePollingConversationTitle(now),
      titleLocked: true,
    });
    const messageResult = await this.sendAgentRuntimeMessage(projectId, member.id, userId, {
      message: this.agentPollingMessage(config, { reason }),
      conversationId: conversationResult.conversation.id,
    });
    const latestSession = await this.latestRuntimeSessionForMember(member.id);
    const baseFinalSession = (latestSession || messageResult.session) as AgentRuntimeSession;
    const finalSession: AgentRuntimeSession = {
      ...baseFinalSession,
      pollingConfig: config,
      pollingState: {
        ...pollingState,
        lastConversationId: conversationResult.conversation.id,
      },
    };
    await this.writeRuntimeSession(member.id, finalSession);

    return {
      memberId: member.id,
      role: member.role,
      triggered: true,
      reason,
      conversation: conversationResult.conversation,
      session: this.sanitizeRuntimeSession(finalSession),
    };
  }

  async updateAssignment(
    projectId: string,
    workItemId: string,
    assignmentId: string,
    userId: string,
    dto: UpdateProjectAssignmentDto,
  ) {
    const project = await this.ensureProjectAccess(projectId, userId);
    const statusFlow = this.resolveProjectWorkItemStatusFlow(project.settings);
    const assignment = await this.ensureProjectAssignment(projectId, workItemId, assignmentId);
    const canManage = project.ownerId === userId || project.leadAgentUserId === userId;
    const canUpdate = canManage || assignment.assigneeUserId === userId;

    if (!canUpdate) {
      throw new ForbiddenException('Only the project manager or assignee can update this assignment');
    }
    const shouldWakeAssigneeOnManualStart =
      dto.status === 'ACTIVE' &&
      assignment.status !== 'ACTIVE' &&
      canManage &&
      assignment.assigneeUserId &&
      assignment.assigneeUserId !== userId;

    const workItemBefore = dto.status
      ? await this.prisma.projectWorkItem.findUnique({
          where: { id: workItemId },
          select: { status: true, title: true, workType: true, goalId: true, featureId: true },
        })
      : null;
    let finalWorkItemStatus: string | null = null;
    const updated = await this.prisma.projectAssignment.update({
      where: { id: assignmentId },
      data: {
        status: dto.status as any,
        objective: dto.objective,
        contextPacket: dto.contextPacket as any,
        startedAt:
          dto.status === 'ACTIVE' && !assignment.startedAt ? new Date() : undefined,
        finishedAt:
          dto.status && ['COMPLETED', 'RELEASED', 'FAILED'].includes(dto.status)
            ? new Date()
            : dto.status === 'ACTIVE'
              ? null
              : undefined,
      },
      include: {
        assigneeUser: { select: { id: true, email: true, displayName: true, role: true } },
        assignedByUser: { select: { id: true, email: true, displayName: true, role: true } },
      },
    });

    if (dto.status === 'ACTIVE') {
      const workItem = await this.prisma.projectWorkItem.findUnique({
        where: { id: workItemId },
        select: { status: true },
      });
      if (!this.isTerminalWorkItemStatus(workItem?.status, project.settings)) {
        await this.prisma.projectWorkItem.update({
          where: { id: workItemId },
          data: { status: statusFlow.activeStatus },
        });
        finalWorkItemStatus = statusFlow.activeStatus;
      }
    } else if (dto.status === 'COMPLETED') {
      const workItem = await this.prisma.projectWorkItem.findUnique({
        where: { id: workItemId },
        select: { status: true },
      });
      const currentStatus = this.normalizeWorkItemStatusId(workItem?.status);
      if (!this.isTerminalWorkItemStatus(currentStatus, project.settings)) {
        const keepExplicitHandoffStatus =
          statusFlow.claimableStatuses.includes(currentStatus) &&
          currentStatus !== statusFlow.initialStatus &&
          currentStatus !== statusFlow.assignmentFailedStatus;
        await this.prisma.projectWorkItem.update({
          where: { id: workItemId },
          data: { status: keepExplicitHandoffStatus ? currentStatus : statusFlow.assignmentCompletedStatus },
        });
        finalWorkItemStatus = keepExplicitHandoffStatus ? currentStatus : statusFlow.assignmentCompletedStatus;
      }
    } else if (dto.status === 'FAILED') {
      const openAssignments = await this.prisma.projectAssignment.count({
        where: {
          projectId,
          workItemId,
          status: { in: ['PROPOSED', 'ACTIVE', 'PAUSED'] as any },
        },
      });
      if (openAssignments === 0) {
        const workItem = await this.prisma.projectWorkItem.findUnique({
          where: { id: workItemId },
          select: { status: true },
        });
        if (!this.isTerminalWorkItemStatus(workItem?.status, project.settings)) {
          await this.prisma.projectWorkItem.update({
            where: { id: workItemId },
            data: { status: statusFlow.assignmentFailedStatus },
          });
          finalWorkItemStatus = statusFlow.assignmentFailedStatus;
        }
      }
    }

    if (finalWorkItemStatus && workItemBefore?.status !== finalWorkItemStatus) {
      await this.recordWorkItemEvent(projectId, userId, 'WORK_ITEM_STATUS_CHANGED', workItemId, {
        title: workItemBefore?.title || null,
        workType: workItemBefore?.workType || null,
        goalId: workItemBefore?.goalId || null,
        featureId: workItemBefore?.featureId || null,
        previousStatus: workItemBefore?.status || null,
        status: finalWorkItemStatus,
        source: 'assignment-status',
        assignmentId,
        assignmentStatus: dto.status,
      });
    }
    if (this.shouldScheduleCoordinatorTickForStatus(finalWorkItemStatus, project.settings)) {
      this.scheduleCoordinatorTick(
        projectId,
        project.ownerId || project.leadAgentUserId || userId,
        `assignment ${assignmentId} updated work item ${workItemId} to ${finalWorkItemStatus}`,
      );
    }
    if (shouldWakeAssigneeOnManualStart) {
      const runtimeState = await this.assignmentAssigneeRuntimeState(projectId, assignment).catch((error) => {
        this.logger.warn(
          `Failed to inspect assignee runtime before waking manually started assignment ${assignmentId}: ${error?.message || error}`,
        );
        return { available: false, memberId: null as string | null, session: null as AgentRuntimeSession | null };
      });
      if (runtimeState.available && runtimeState.memberId) {
        await this.wakeRuntimeForAssignment(
          projectId,
          project.ownerId || userId,
          runtimeState.memberId,
          {
            ...assignment,
            ...updated,
            workItemId,
            contextPacket: updated.contextPacket ?? assignment.contextPacket,
          },
          { waitForFirstResponse: false },
        ).catch((error) => {
          this.logger.warn(
            `Failed to wake manually started assignment ${assignmentId}: ${error?.message || error}`,
          );
        });
      }
    }

    return updated;
  }

  async createRun(projectId: string, userId: string, dto: CreateProjectRunDto) {
    const project = await this.ensureProjectAccess(projectId, userId);
    const statusFlow = this.resolveProjectWorkItemStatusFlow(project.settings);
    await this.ensureProjectScopedReference(projectId, 'workItem', dto.workItemId);
    const workItemBefore = await this.prisma.projectWorkItem.findUnique({
      where: { id: dto.workItemId },
      select: { status: true, title: true, workType: true, goalId: true, featureId: true },
    });

    if (dto.assignmentId) {
      const assignment = await this.prisma.projectAssignment.findFirst({
        where: { id: dto.assignmentId, projectId },
        select: { id: true },
      });
      if (!assignment) {
        throw new BadRequestException('assignmentId does not belong to the project');
      }
    }

    const run = await this.prisma.projectRun.create({
      data: {
        projectId,
        workItemId: dto.workItemId,
        assignmentId: dto.assignmentId,
        triggeredByUserId: userId,
        runType: dto.runType,
        status: 'QUEUED',
        instruction: dto.instruction,
        contextSnapshot: dto.contextSnapshot,
        resultSummary: dto.resultSummary,
        costInfo: dto.costInfo,
      },
    });

    const updatedWorkItem = await this.prisma.projectWorkItem.update({
      where: { id: dto.workItemId },
      data: { status: statusFlow.activeStatus },
      select: { status: true, title: true, workType: true, goalId: true, featureId: true },
    });
    await this.recordWorkItemEvent(projectId, userId, 'RUN_CREATED', dto.workItemId, {
      title: updatedWorkItem.title,
      workType: updatedWorkItem.workType,
      goalId: updatedWorkItem.goalId,
      featureId: updatedWorkItem.featureId,
      runId: run.id,
      runType: run.runType,
      runStatus: run.status,
      assignmentId: run.assignmentId,
      previousStatus: workItemBefore?.status || null,
      status: updatedWorkItem.status,
      source: 'run',
    });

    return run;
  }

  async getRun(projectId: string, runId: string, userId?: string | null) {
    await this.ensureProjectReadable(projectId, userId);

    const run = await this.prisma.projectRun.findFirst({
      where: { id: runId, projectId },
      include: {
        workItem: {
          select: {
            id: true,
            title: true,
            status: true,
            workType: true,
          },
        },
        assignment: {
          include: {
            assigneeUser: { select: { id: true, email: true, displayName: true, role: true } },
            assignedByUser: { select: { id: true, email: true, displayName: true, role: true } },
          },
        },
        triggeredByUser: { select: { id: true, email: true, displayName: true, role: true } },
        logs: { orderBy: { createdAt: 'asc' } },
        artifacts: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!run) {
      throw new NotFoundException('Project run not found');
    }

    return run;
  }

  async updateRun(projectId: string, runId: string, userId: string, dto: UpdateProjectRunDto) {
    const project = await this.ensureProjectAccess(projectId, userId);
    const statusFlow = this.resolveProjectWorkItemStatusFlow(project.settings);
    const run = await this.ensureProjectRun(projectId, runId);
    const canManage = project.ownerId === userId || project.leadAgentUserId === userId;
    const canUpdate =
      canManage ||
      run.triggeredByUserId === userId ||
      run.assignment?.assigneeUserId === userId;

    if (!canUpdate) {
      throw new ForbiddenException('Only the project manager or active run owner can update this run');
    }

    const workItemBefore = dto.status
      ? await this.prisma.projectWorkItem.findUnique({
          where: { id: run.workItemId },
          select: { status: true, title: true, workType: true, goalId: true, featureId: true },
        })
      : null;
    const updated = await this.prisma.projectRun.update({
      where: { id: runId },
      data: {
        status: dto.status as any,
        instruction: dto.instruction,
        contextSnapshot: dto.contextSnapshot,
        resultSummary: dto.resultSummary,
        costInfo: dto.costInfo,
        startedAt:
          dto.status === 'RUNNING' && !run.startedAt ? new Date() : undefined,
        finishedAt:
          dto.status && ['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(dto.status)
            ? new Date()
            : dto.status === 'RUNNING'
              ? null
              : undefined,
      },
    });

    let updatedWorkItem: { status: string; title: string; workType: string; goalId: string | null; featureId: string | null } | null = null;
    if (dto.status === 'RUNNING') {
      updatedWorkItem = await this.prisma.projectWorkItem.update({
        where: { id: run.workItemId },
        data: { status: statusFlow.activeStatus },
        select: { status: true, title: true, workType: true, goalId: true, featureId: true },
      });
    } else if (dto.status === 'SUCCEEDED') {
      updatedWorkItem = await this.prisma.projectWorkItem.update({
        where: { id: run.workItemId },
        data: { status: statusFlow.assignmentCompletedStatus },
        select: { status: true, title: true, workType: true, goalId: true, featureId: true },
      });
    } else if (dto.status === 'FAILED') {
      updatedWorkItem = await this.prisma.projectWorkItem.update({
        where: { id: run.workItemId },
        data: { status: statusFlow.assignmentFailedStatus },
        select: { status: true, title: true, workType: true, goalId: true, featureId: true },
      });
    }
    if (updatedWorkItem) {
      await this.recordWorkItemEvent(projectId, userId, 'RUN_UPDATED', run.workItemId, {
        title: updatedWorkItem.title,
        workType: updatedWorkItem.workType,
        goalId: updatedWorkItem.goalId,
        featureId: updatedWorkItem.featureId,
        runId,
        runType: updated.runType,
        runStatus: updated.status,
        assignmentId: updated.assignmentId,
        previousStatus: workItemBefore?.status || null,
        status: updatedWorkItem.status,
        source: 'run',
      });
    }

    return updated;
  }

  async listRunLogs(projectId: string, runId: string, userId?: string | null) {
    await this.ensureProjectReadable(projectId, userId);
    await this.ensureProjectRun(projectId, runId);

    return this.prisma.projectRunLog.findMany({
      where: { runId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createRunLog(projectId: string, runId: string, userId: string, dto: CreateProjectRunLogDto) {
    const project = await this.ensureProjectAccess(projectId, userId);
    const run = await this.ensureProjectRun(projectId, runId);
    const canManage = project.ownerId === userId || project.leadAgentUserId === userId;
    const canWrite =
      canManage ||
      run.triggeredByUserId === userId ||
      run.assignment?.assigneeUserId === userId;

    if (!canWrite) {
      throw new ForbiddenException('Only the project manager or active run owner can write logs');
    }

    return this.prisma.projectRunLog.create({
      data: {
        runId,
        level: dto.level || 'info',
        message: dto.message,
        metadata: dto.metadata,
      },
    });
  }

  private normalizeArtifactDto(dto: CreateProjectArtifactDto) {
    let metadata = dto.metadata;
    if (typeof dto.metadata === 'string') {
      try {
        metadata = JSON.parse(dto.metadata);
      } catch {
        throw new BadRequestException('Artifact metadata must be valid JSON');
      }
    }
    return {
      ...dto,
      metadata,
    };
  }

  private artifactAttachmentPath(workItemId: string | undefined, artifactId: string, file: Express.Multer.File) {
    const safeName = (file.originalname || `attachment-${Date.now()}`)
      .replace(/\\/g, '/')
      .split('/')
      .pop()
      ?.replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      || `attachment-${Date.now()}`;
    const itemSegment = workItemId ? `work-items/${workItemId}` : 'project';
    return `resources/${itemSegment}/artifacts/${artifactId}/${randomUUID()}-${safeName}`;
  }

  async createArtifact(
    projectId: string,
    userId: string,
    rawDto: CreateProjectArtifactDto,
    attachments: Express.Multer.File[] = [],
  ) {
    const dto = this.normalizeArtifactDto(rawDto);
    await this.ensureProjectAccess(projectId, userId);
    await this.ensureProjectScopedReference(projectId, 'workItem', dto.workItemId);
    const artifactId = randomUUID();
    const uploadedResources = [];
    for (const file of attachments || []) {
      const resource = await this.agentWorkspaceClient.uploadProjectFile(
        projectId,
        file,
        this.artifactAttachmentPath(dto.workItemId, artifactId, file),
      );
      uploadedResources.push({
        path: resource.path,
        key: resource.key,
        size: resource.size,
        contentType: resource.contentType,
        name: file.originalname,
      });
    }

    const existingMetadata =
      dto.metadata && typeof dto.metadata === 'object' && !Array.isArray(dto.metadata)
        ? dto.metadata
        : {};
    const metadata = uploadedResources.length
      ? {
          ...existingMetadata,
          resources: [...(Array.isArray((existingMetadata as any).resources) ? (existingMetadata as any).resources : []), ...uploadedResources],
          projectFiles: [...(Array.isArray((existingMetadata as any).projectFiles) ? (existingMetadata as any).projectFiles : []), ...uploadedResources],
        }
      : dto.metadata;

    return this.prisma.projectArtifact.create({
      data: {
        id: artifactId,
        projectId,
        workItemId: dto.workItemId,
        assignmentId: dto.assignmentId,
        runId: dto.runId,
        artifactType: dto.artifactType,
        title: dto.title,
        content: dto.content,
        url: dto.url,
        metadata,
        createdByUserId: userId,
      },
    });
  }

  async listArtifacts(projectId: string, userId: string | null | undefined, query: { workItemId?: string; limit?: number }) {
    await this.ensureProjectReadable(projectId, userId);
    const where: any = { projectId };
    if (query.workItemId) where.workItemId = query.workItemId;

    return this.prisma.projectArtifact.findMany({
      where,
      include: {
        createdByUser: { select: { id: true, email: true, displayName: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: query.limit ?? 50,
    });
  }

  private approvedMemoryCandidatesFromArtifact(
    artifact: { id: string; workItemId?: string | null; metadata?: any },
    checklistResult?: any,
  ) {
    const metadata = artifact.metadata && typeof artifact.metadata === 'object' && !Array.isArray(artifact.metadata)
      ? artifact.metadata
      : {};
    const reviewDetails = checklistResult && typeof checklistResult === 'object' && !Array.isArray(checklistResult)
      ? checklistResult
      : {};
    const rawCandidates = Array.isArray((reviewDetails as any).memoryCandidates)
      ? (reviewDetails as any).memoryCandidates
      : Array.isArray((metadata as any).memoryCandidates)
        ? (metadata as any).memoryCandidates
        : [];
    const allowedTypes = new Set(['DECISION', 'CONSTRAINT', 'FACT', 'RISK', 'OPEN_QUESTION', 'INTERFACE_CONTRACT']);
    const candidates = rawCandidates
      .map((candidate: any, index: number) => ({
        index,
        memoryType: typeof candidate?.memoryType === 'string' ? candidate.memoryType : candidate?.type,
        title: typeof candidate?.title === 'string' ? candidate.title.trim() : undefined,
        content: typeof candidate?.content === 'string' ? candidate.content.trim() : '',
        summary: typeof candidate?.summary === 'string' ? candidate.summary.trim() : undefined,
        metadata: candidate?.metadata && typeof candidate.metadata === 'object' && !Array.isArray(candidate.metadata)
          ? candidate.metadata
          : {},
      }))
      .filter((candidate: any) => allowedTypes.has(candidate.memoryType) && candidate.content)
      .slice(0, 10);
    const approvedIndexes = Array.isArray((reviewDetails as any).approvedMemoryCandidateIndexes)
      ? new Set((reviewDetails as any).approvedMemoryCandidateIndexes.map((value: any) => Number(value)))
      : null;
    const filteredCandidates = approvedIndexes
      ? candidates.filter((candidate: any) => approvedIndexes.has(candidate.index))
      : candidates;
    return filteredCandidates.map((candidate: any) => ({
        ...candidate,
        metadata: {
          ...candidate.metadata,
          source: 'approved-handoff-memory-candidate',
          sourceArtifactId: artifact.id,
          workItemId: artifact.workItemId || null,
          candidateIndex: candidate.index,
        },
      }));
  }

  private async persistApprovedMemoryCandidates(projectId: string, userId: string, review: { id: string; artifactId?: string | null }) {
    if (!review.artifactId) return;
    const artifact = await this.prisma.projectArtifact.findFirst({
      where: { id: review.artifactId, projectId },
      select: { id: true, workItemId: true, metadata: true },
    });
    if (!artifact) return;
    const candidates = this.approvedMemoryCandidatesFromArtifact(artifact, (review as any).checklistResult);
    for (const candidate of candidates) {
      await this.agentWorkspaceClient.createProjectMemory(projectId, {
        memoryType: candidate.memoryType,
        title: candidate.title,
        content: candidate.content,
        summary: candidate.summary,
        sourceArtifactId: artifact.id,
        metadata: {
          ...candidate.metadata,
          reviewId: review.id,
        },
        createdByUserId: userId,
      }).catch(() => null);
    }
  }

  async createReview(projectId: string, userId: string, dto: CreateProjectReviewDto) {
    const project = await this.ensureProjectManager(projectId, userId);
    const statusFlow = this.resolveProjectWorkItemStatusFlow(project.settings);
    await this.ensureProjectScopedReference(projectId, 'workItem', dto.workItemId);
    const workItemBefore = await this.prisma.projectWorkItem.findFirst({
      where: { id: dto.workItemId, projectId },
      select: { id: true, title: true, workType: true, goalId: true, featureId: true, status: true },
    });
    const reviewStatus = dto.status === 'REQUEST_CHANGES' ? 'CHANGES_REQUESTED' : (dto.status || 'PENDING');

    const review = await this.prisma.projectReview.create({
      data: {
        projectId,
        workItemId: dto.workItemId,
        assignmentId: dto.assignmentId,
        artifactId: dto.artifactId,
        reviewerUserId: userId,
        reviewerType: dto.reviewerType,
        status: reviewStatus as any,
        reviewNote: dto.reviewNote,
        checklistResult: dto.checklistResult,
      },
    });

    let nextWorkItemStatus: string | null = null;
    if (reviewStatus === 'APPROVED') {
      nextWorkItemStatus = statusFlow.reviewApprovedStatus;
      await this.prisma.projectWorkItem.update({
        where: { id: dto.workItemId },
        data: { status: nextWorkItemStatus as any },
      });
      await this.persistApprovedMemoryCandidates(projectId, userId, review);
    } else if (reviewStatus === 'CHANGES_REQUESTED') {
      nextWorkItemStatus = statusFlow.reviewChangesRequestedStatus;
      await this.prisma.projectWorkItem.update({
        where: { id: dto.workItemId },
        data: { status: nextWorkItemStatus as any },
      });
    } else if (reviewStatus === 'REJECTED') {
      nextWorkItemStatus = statusFlow.reviewRejectedStatus;
      await this.prisma.projectWorkItem.update({
        where: { id: dto.workItemId },
        data: { status: nextWorkItemStatus as any },
      });
    }

    await this.recordWorkItemEvent(projectId, userId, 'REVIEW_CREATED', dto.workItemId, {
      title: workItemBefore?.title || null,
      workType: workItemBefore?.workType || null,
      goalId: workItemBefore?.goalId || null,
      featureId: workItemBefore?.featureId || null,
      reviewId: review.id,
      assignmentId: dto.assignmentId || null,
      artifactId: dto.artifactId || null,
      reviewerType: dto.reviewerType,
      reviewStatus: review.status,
      summary: dto.reviewNote || null,
      hasChecklistResult: Boolean(dto.checklistResult),
      previousStatus: workItemBefore?.status || null,
      status: nextWorkItemStatus || workItemBefore?.status || null,
      source: 'host-review',
    });
    if (nextWorkItemStatus && workItemBefore?.status !== nextWorkItemStatus) {
      await this.recordWorkItemEvent(projectId, userId, 'WORK_ITEM_STATUS_CHANGED', dto.workItemId, {
        title: workItemBefore?.title || null,
        workType: workItemBefore?.workType || null,
        goalId: workItemBefore?.goalId || null,
        featureId: workItemBefore?.featureId || null,
        previousStatus: workItemBefore?.status || null,
        status: nextWorkItemStatus,
        source: 'review',
        reviewId: review.id,
        reviewStatus: review.status,
      });
    }
    if (this.shouldScheduleCoordinatorTickForStatus(nextWorkItemStatus, project.settings)) {
      this.scheduleCoordinatorTick(
        projectId,
        project.ownerId || project.leadAgentUserId || userId,
        `review ${review.id} updated work item ${dto.workItemId} to ${nextWorkItemStatus}`,
      );
    }

    return review;
  }

  async listReviews(projectId: string, userId: string | null | undefined, query: { workItemId?: string; limit?: number }) {
    await this.ensureProjectReadable(projectId, userId);
    const where: any = { projectId };
    if (query.workItemId) where.workItemId = query.workItemId;

    return this.prisma.projectReview.findMany({
      where,
      include: {
        reviewerUser: { select: { id: true, email: true, displayName: true, role: true } },
        artifact: { select: { id: true, title: true, artifactType: true, url: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: query.limit ?? 50,
    });
  }

  async createMemory(projectId: string, userId: string, dto: CreateProjectMemoryDto) {
    await this.ensureProjectAccess(projectId, userId);

    return this.agentWorkspaceClient.createProjectMemory(projectId, {
      memoryType: dto.memoryType,
      title: dto.title,
      content: dto.content,
      summary: dto.summary,
      metadata: dto.metadata,
      sourceArtifactId: dto.sourceArtifactId,
      createdByUserId: userId,
    });
  }

  async listMemories(projectId: string, userId: string | null | undefined, query: { memoryType?: string; limit?: number }) {
    await this.ensureProjectReadable(projectId, userId);
    const requestedMemoryType = query.memoryType === 'SKILL_DRAFT' ? 'INTERFACE_CONTRACT' : query.memoryType;
    const response = await this.agentWorkspaceClient.listProjectMemories(projectId, {
      memoryType: requestedMemoryType,
      limit: query.limit ?? 50,
    });
    const memories = response.memories || [];
    if (query.memoryType === 'SKILL_DRAFT') {
      return memories.filter((memory: any) => memory?.metadata?.subtype === 'skill_draft');
    }
    return memories;
  }

  private sanitizeAgentLaunchError(err: unknown) {
    const raw = err instanceof Error ? err.message : String(err);
    return raw
      .replace(
        /((?:[A-Z0-9_]*(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTHORIZATION)[A-Z0-9_]*)=)[^\s]+/gi,
        '$1[redacted]',
      )
      .replace(
        /(["']?(?:[A-Za-z0-9_]*(?:api[_-]?key|token|secret|password|credential|authorization)[A-Za-z0-9_]*)["']?\s*[:=]\s*["']?)[^"',\s}]+/gi,
        '$1[redacted]',
      )
      .replace(/(OPENAI_API_KEY=)[^\s]+/g, '$1[redacted]')
      .replace(/(AGENT_WORKSPACE_TOKEN=)[^\s]+/g, '$1[redacted]')
      .replace(/(API_SERVER_KEY=)[^\s]+/g, '$1[redacted]')
      .replace(/(sk-)[A-Za-z0-9_-]+/g, '$1[redacted]')
      .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[jwt redacted]');
  }
}
