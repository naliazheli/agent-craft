import { randomBytes, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { mkdir, mkdtemp, cp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { basename, dirname, join, posix as posixPath, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BedrockAgentCoreClient,
  InvokeAgentRuntimeCommand,
  InvokeAgentRuntimeCommandCommand,
} from '@aws-sdk/client-bedrock-agentcore';
import {
  BedrockAgentCoreControlClient,
  CreateAgentRuntimeCommand,
} from '@aws-sdk/client-bedrock-agentcore-control';
import {
  DescribeTasksCommand,
  ECSClient,
  type LaunchType,
  RunTaskCommand,
  type Task,
} from '@aws-sdk/client-ecs';

const execFileAsync = promisify(execFile);

export type AgentRuntimeLlmConfig = {
  configId: string;
  name: string;
  apiType: string;
  apiUrl: string;
  apiKey: string;
  modelName: string;
};

export type AgentRuntimeLaunchConfig = {
  projectId: string;
  projectGithubUrl?: string | null;
  projectGlobals?: Array<{
    key: string;
    label?: string | null;
    description?: string | null;
    value?: string | null;
    isSecret?: boolean;
    scope?: string | null;
    goalId?: string | null;
  }>;
  memberId: string;
  userId: string;
  role: string;
  agentType?: string | null;
  runtimeId: string;
  workspaceToken: string;
  workspaceBaseUrl: string;
  projectApiBaseUrl?: string | null;
  grantId: string;
  scopes: string[];
  skillBundleRefs: string[];
  projectSkillOverrides?: AgentRuntimeProjectSkillOverride[];
  capabilityBundleRefs?: string[];
  capabilityBundles?: AgentRuntimeCapabilityBundle[];
  runtimeFeatureSupport?: AgentRuntimeFeatureSupport;
  runtimeCapabilityWarnings?: string[];
  agentDisplayName?: string | null;
  rolePrompt?: string | null;
  repoWorkspaceDir?: string;
  deploymentDays?: number;
  dailyCostAmount?: number;
  budgetCurrency?: string;
  enableSudo?: boolean;
  llm?: AgentRuntimeLlmConfig | null;
  image?: string;
  model?: string;
};

export type AgentRuntimeFeatureSupport = {
  agentType: string;
  supportedFeatures: string[];
  unsupportedFeatures: string[];
  notes: string[];
};

export type AgentRuntimeCapabilityBundle = {
  ref: string;
  name?: string | null;
  version?: string | null;
  description?: string | null;
  surfaces?: {
    skills?: string[];
    tools?: string[];
    mcpServers?: string[];
    hooks?: string[];
  };
  requiredScopes?: string[];
  requiredProjectGlobals?: string[];
  runtimeCompatibility?: Record<string, any> | null;
  shareContext?: Record<string, any> | null;
  source?: string;
};

export type AgentRuntimeLaunchMode = 'local-docker' | 'aws-ecs' | 'local-runner' | 'local-codex' | 'aws-agentcore';

export type AgentRuntimeLocalRunnerFile = {
  path: string;
  content: string;
  mode?: number;
};

export type AgentRuntimeProjectSkillOverride = {
  ref: string;
  name: string;
  storagePath?: string | null;
  files: AgentRuntimeLocalRunnerFile[];
  updatedAt?: string | null;
  updatedById?: string | null;
};

export type AgentRuntimeLocalRunnerJob = {
  projectId: string;
  memberId: string;
  userId: string;
  role: string;
  agentType?: string | null;
  runtimeId: string;
  grantId: string;
  image: string;
  containerName: string;
  apiKey: string;
  workspaceToken: string;
  workspaceBaseUrl: string;
  projectApiBaseUrl?: string | null;
  repoWorkspaceDir: string;
  projectGithubUrl?: string | null;
  projectGlobals?: AgentRuntimeLaunchConfig['projectGlobals'];
  scopes: string[];
  skillBundleRefs: string[];
  projectSkillOverrides?: AgentRuntimeProjectSkillOverride[];
  capabilityBundleRefs?: string[];
  capabilityBundles?: AgentRuntimeCapabilityBundle[];
  runtimeFeatureSupport?: AgentRuntimeFeatureSupport;
  runtimeCapabilityWarnings?: string[];
  agentDisplayName?: string | null;
  rolePrompt?: string | null;
  deploymentDays?: number;
  dailyCostAmount?: number;
  budgetCurrency?: string;
  enableSudo?: boolean;
  llm?: AgentRuntimeLaunchConfig['llm'];
  files: AgentRuntimeLocalRunnerFile[];
  env: Record<string, string>;
  command: string[];
};

export type AgentRuntimeLocalRunnerBridgeRequest = {
  id: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'ERROR';
  payload: Record<string, any>;
  conversationId?: string | null;
  assistantMessageId?: string | null;
  files?: AgentRuntimeLocalRunnerFile[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
  outputText?: string | null;
  statusText?: string | null;
  recentActions?: AgentRuntimeAction[];
  error?: string | null;
};

export type AgentRuntimeSession = {
  provider: AgentRuntimeLaunchMode;
  agentType?: string | null;
  piBackend?: 'rpc' | 'cli' | null;
  image: string;
  containerName: string;
  containerId?: string | null;
  cloudTaskArn?: string | null;
  cloudClusterArn?: string | null;
  cloudPrivateIp?: string | null;
  agentCoreRuntimeArn?: string | null;
  agentCoreQualifier?: string | null;
  agentCoreRuntimeSessionId?: string | null;
  agentCoreRegion?: string | null;
  apiBaseUrl: string;
  apiKey: string;
  dataDir: string;
  runtimeId: string;
  grantId: string;
  workspaceToken: string;
  projectGithubUrl?: string | null;
  projectGlobalKeys?: string[];
  repoWorkspaceDir?: string;
  scopes: string[];
  skillBundleRefs: string[];
  projectSkillOverrides?: AgentRuntimeProjectSkillOverride[];
  capabilityBundleRefs?: string[];
  capabilityBundles?: AgentRuntimeCapabilityBundle[];
  runtimeFeatureSupport?: AgentRuntimeFeatureSupport;
  runtimeCapabilityWarnings?: string[];
  agentDisplayName?: string | null;
  launchedBy?: {
    userId?: string | null;
    memberId?: string | null;
    role?: string | null;
    runtimeId?: string | null;
    source?: string | null;
    launchedAt?: string | null;
  } | null;
  rolePrompt?: string | null;
  deploymentDays?: number;
  dailyCostAmount?: number;
  budgetCurrency?: string;
  llm?: {
    configId: string;
    name: string;
    apiType: string;
    apiUrl: string;
    modelName: string;
  } | null;
  role: string;
  status: string;
  launchedAt: string;
  updatedAt: string;
  lastMessageAt?: string | null;
  lastResponseAt?: string | null;
  activeRequestId?: string | null;
  activeRequestStartedAt?: string | null;
  activeRequestConversationId?: string | null;
  lastStreamAt?: string | null;
  lastError?: string | null;
  currentActivity?: string | null;
  activeConversationId?: string | null;
  conversations?: AgentRuntimeConversation[];
  messageHistory?: AgentRuntimeMessage[];
  pollingConfig?: AgentRuntimePollingConfig | null;
  pollingState?: AgentRuntimePollingState | null;
  recentActions?: AgentRuntimeAction[];
  dockerStatus?: Record<string, any>;
  apiHealth?: Record<string, any>;
  localRunnerJob?: AgentRuntimeLocalRunnerJob;
  enableSudo?: boolean;
  localRunnerBridge?: {
    requests: AgentRuntimeLocalRunnerBridgeRequest[];
    syncFiles?: AgentRuntimeLocalRunnerFile[];
    connectedAt?: string | null;
    lastSeenAt?: string | null;
    disconnectedAt?: string | null;
    disconnectReason?: string | null;
  };
};

export type AgentRuntimePollingConfig = {
  enabled: boolean;
  strategy: 'IDLE_ONLY' | 'FIXED_INTERVAL';
  intervalMinutes: number;
  message: string;
};

export type AgentRuntimePollingState = {
  lastRunAt?: string | null;
  lastCompletedAt?: string | null;
  nextRunAt?: string | null;
  lastConversationId?: string | null;
  lastError?: string | null;
};

export type AgentRuntimeConversation = {
  id: string;
  title: string;
  titleLocked?: boolean;
  createdAt: string;
  updatedAt: string;
  messageHistory: AgentRuntimeMessage[];
};

export type AgentRuntimeMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  createdAt: string;
  status?: string | null;
  actions?: AgentRuntimeAction[];
};

export type AgentRuntimeAction = {
  kind: 'tool' | 'tool_result' | 'message';
  name: string;
  summary: string;
  status?: 'ok' | 'error' | 'pending';
};

export type AgentRuntimeWorkspaceFile = {
  path: string;
  name: string;
  size: number;
  modifiedAt?: string | null;
  downloadUrl?: string | null;
};

export type AgentRuntimeWorkspaceDownload = {
  path: string;
  filename: string;
  contentType: string;
  content: Buffer;
};

type AgentWorkspaceContextSync = {
  projectId: string;
  memberId: string;
  userId: string;
  role: string;
  agentDisplayName?: string | null;
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
};

type AgentRuntimeSendMessageOptions = {
  requestId?: string;
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
  onTextDelta?: (text: string) => void | Promise<void>;
  streamingBehavior?: 'steer' | 'followUp';
};

@Injectable()
export class AgentRuntimeLauncherService {
  private readonly activeMessageControllers = new Map<string, AbortController>();
  private ecsClient?: ECSClient;
  private agentCoreClient?: BedrockAgentCoreClient;
  private agentCoreControlClient?: BedrockAgentCoreControlClient;

  constructor(private readonly configService: ConfigService) {}

  runtimeFeatureSupport(agentType?: string | null): AgentRuntimeFeatureSupport {
    const normalized = this.normalizeAgentType(agentType);
    const baseline = ['filesystemSkills', 'skillPrompts', 'projectFiles', 'projectGlobals'];
    if (['hermes-agent', 'codex', 'claude-code'].includes(normalized)) {
      return {
        agentType: normalized,
        supportedFeatures: [...baseline, 'nativePlugins', 'pluginHooks', 'mcpServers'],
        unsupportedFeatures: [],
        notes: [
          `${this.agentTypeLabel(normalized)} runtimes can support native plugin surfaces when the selected image and adapter expose that agent's plugin loader. AgentCraft still records bundle metadata separately from grant scopes.`,
        ],
      };
    }
    return {
      agentType: normalized,
      supportedFeatures: baseline,
      unsupportedFeatures: ['nativePlugins', 'pluginHooks', 'mcpServers'],
      notes: [
        `${this.agentTypeLabel(normalized)} runtimes receive portable skill/prompt/context surfaces only unless their adapter declares native plugin support.`,
      ],
    };
  }

  listImages() {
    const configured = this.configService.get<string>('HERMES_AGENT_IMAGES');
    const localRunnerImage = this.localRunnerImage('hermes-agent');
    const localImages = configured
      ? configured
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
      : [localRunnerImage, this.smokeImage()].filter(Boolean);
    const images = this.uniqueImages(localImages)
      .map((image) => ({ id: image, label: this.imageLabel(image), provider: 'local-docker', agentType: 'hermes-agent' }));
    for (const agentType of ['mini-swe-agent', 'pi', 'claude-code', 'codex']) {
      const image = this.defaultImage(agentType);
      images.push({ id: image, label: this.imageLabel(image), provider: 'local-docker', agentType });
      images.push({ id: image, label: `${this.imageLabel(image)} (local runner)`, provider: 'local-runner', agentType });
      if (['codex', 'pi'].includes(agentType)) {
        images.push({ id: image, label: `${this.imageLabel(image)} (local agent)`, provider: 'local-codex', agentType });
      }
    }
    const cloudImage = this.cloudImage();
    if (cloudImage && !images.some((image) => image.id === cloudImage && image.provider === 'aws-ecs')) {
      images.push({ id: cloudImage, label: cloudImage, provider: 'aws-ecs', agentType: 'hermes-agent' });
    }
    const agentCoreRuntimeArn = this.agentCoreRuntimeArn();
    const agentCoreImage = this.agentCoreContainerImage() || cloudImage;
    if (agentCoreRuntimeArn || agentCoreImage) {
      images.push({
        id: agentCoreRuntimeArn || agentCoreImage,
        label: agentCoreRuntimeArn ? 'Amazon Bedrock AgentCore Runtime' : `${agentCoreImage} (AgentCore)`,
        provider: 'aws-agentcore',
        agentType: 'hermes-agent',
      });
    }
    for (const image of this.uniqueImages([localRunnerImage, ...localImages])) {
      if (!images.some((candidate) => candidate.id === image && candidate.provider === 'local-runner')) {
        images.push({ id: image, label: `${this.imageLabel(image)} (local runner)`, provider: 'local-runner', agentType: 'hermes-agent' });
      }
    }
    return images;
  }

  defaultImage(agentType?: string | null) {
    const normalized = this.normalizeAgentType(agentType);
    if (normalized === 'mini-swe-agent') {
      return this.configService.get<string>('MINI_SWE_AGENT_IMAGE') || 'aifactory/mini-swe-agent:local';
    }
    if (normalized === 'pi') {
      return this.configService.get<string>('PI_AGENT_IMAGE') || 'aifactory/pi-agent:local';
    }
    if (normalized === 'claude-code') {
      return this.configService.get<string>('CLAUDE_CODE_AGENT_IMAGE') || 'aifactory/claude-code-agent:local';
    }
    if (normalized === 'codex') {
      return this.configService.get<string>('CODEX_AGENT_IMAGE') || 'aifactory/codex-agent:local';
    }
    return this.configService.get<string>('HERMES_AGENT_IMAGE') || 'aifactory/hermes-agent:real-local';
  }

  localRunnerImage(agentType?: string | null) {
    const normalized = this.normalizeAgentType(agentType);
    if (normalized === 'mini-swe-agent') {
      return this.configService.get<string>('MINI_SWE_AGENT_LOCAL_RUNNER_IMAGE') || this.defaultImage(normalized);
    }
    if (normalized === 'pi') {
      return this.configService.get<string>('PI_AGENT_LOCAL_RUNNER_IMAGE') || this.defaultImage(normalized);
    }
    if (normalized === 'claude-code') {
      return this.configService.get<string>('CLAUDE_CODE_AGENT_LOCAL_RUNNER_IMAGE') || this.defaultImage(normalized);
    }
    if (normalized === 'codex') {
      return this.configService.get<string>('CODEX_AGENT_LOCAL_RUNNER_IMAGE') || this.defaultImage(normalized);
    }
    return this.configService.get<string>('HERMES_AGENT_LOCAL_RUNNER_IMAGE') || this.defaultImage(normalized);
  }

  smokeImage() {
    return this.configService.get<string>('HERMES_AGENT_SMOKE_IMAGE') || 'aifactory/hermes-agent:local';
  }

  private uniqueImages(images: string[]) {
    return Array.from(new Set(images.map((image) => image.trim()).filter(Boolean)));
  }

  private imageLabel(image: string) {
    if (/aifactory\/hermes-agent:local$/i.test(image)) {
      return `${image} (smoke test only)`;
    }
    if (/aifactory\/hermes-agent:real-local$/i.test(image)) {
      return `${image} (full local runtime)`;
    }
    if (/aifactory\/mini-swe-agent:local$/i.test(image)) {
      return `${image} (mini-swe-agent CLI/TUI bridge)`;
    }
    if (/aifactory\/pi-agent:local$/i.test(image)) {
      return `${image} (Pi CLI print bridge)`;
    }
    if (/aifactory\/claude-code-agent:local$/i.test(image)) {
      return `${image} (Claude Code CLI bridge)`;
    }
    if (/aifactory\/codex-agent:local$/i.test(image)) {
      return `${image} (Codex CLI bridge)`;
    }
    return image;
  }

  cloudImage() {
    return this.configService.get<string>('HERMES_AGENT_CLOUD_IMAGE') || '';
  }

  agentCoreRuntimeArn() {
    return (
      this.configService.get<string>('AGENTCORE_RUNTIME_ARN') ||
      this.configService.get<string>('AWS_AGENTCORE_RUNTIME_ARN') ||
      ''
    ).trim();
  }

  agentCoreRuntimeQualifier() {
    return (
      this.configService.get<string>('AGENTCORE_RUNTIME_QUALIFIER') ||
      this.configService.get<string>('AWS_AGENTCORE_RUNTIME_QUALIFIER') ||
      'DEFAULT'
    ).trim();
  }

  agentCoreContainerImage() {
    return (
      this.configService.get<string>('AGENTCORE_RUNTIME_IMAGE') ||
      this.configService.get<string>('AWS_AGENTCORE_RUNTIME_IMAGE') ||
      this.cloudImage() ||
      ''
    ).trim();
  }

  private agentCoreRegion() {
    return (
      this.configService.get<string>('AGENTCORE_REGION') ||
      this.configService.get<string>('AWS_AGENTCORE_REGION') ||
      this.configService.get<string>('AWS_REGION') ||
      this.configService.get<string>('AWS_DEFAULT_REGION') ||
      'us-west-2'
    ).trim();
  }

  async launch(config: AgentRuntimeLaunchConfig): Promise<AgentRuntimeSession> {
    const launchLlm = this.localDockerLlmConfig(config.llm);
    const launchConfig = launchLlm === config.llm ? config : { ...config, llm: launchLlm };
    const agentType = this.normalizeAgentType(config.agentType);
    const capabilityBundleRefs = config.capabilityBundleRefs || [];
    const capabilityBundles = config.capabilityBundles || [];
    const runtimeFeatureSupport = config.runtimeFeatureSupport || this.runtimeFeatureSupport(agentType);
    const runtimeCapabilityWarnings = config.runtimeCapabilityWarnings || [];
    const image = config.image || this.defaultImage(agentType);
    const apiKey = randomBytes(24).toString('hex');
    const port = await this.getFreePort();
    const containerName = this.containerName(config.projectId, config.role, config.runtimeId);
    const dataDir = this.runtimeDataDir(config.projectId, config.role, config.runtimeId);
    await mkdir(dataDir, { recursive: true });
    const materializedSkills = await this.materializeSkillBundle(dataDir, config.role, config.skillBundleRefs, config.projectSkillOverrides);
    if (!materializedSkills.length) {
      throw new Error(
        `Local Docker agent launch is not available on this API host. No requested skills could be materialized from ${this.skillsPath()} or ${this.projectRolesPath()}. Configure AGENT_WORKSPACE_SKILLS_PATH / AGENT_WORKSPACE_PROJECT_ROLES_PATH, or use AWS Cloud Agent.`,
      );
    }
    if (launchLlm) {
      await this.writeHermesConfig(dataDir, launchLlm);
      if (agentType === 'pi') {
        await this.writePiModelsConfig(dataDir, launchLlm);
        await this.writePiSettingsConfig(dataDir);
      }
    }
    await writeFile(
      resolve(dataDir, 'AGENT_WORKSPACE_CONTEXT.json'),
      JSON.stringify(
        {
          projectId: config.projectId,
          projectGithubUrl: config.projectGithubUrl ?? null,
          projectGlobals: (config.projectGlobals || []).map((global) => ({
            key: global.key,
            label: global.label ?? null,
            description: global.description ?? null,
            isSecret: Boolean(global.isSecret),
            scope: global.scope === 'goal' && global.goalId ? 'goal' : 'project',
            goalId: global.scope === 'goal' && global.goalId ? global.goalId : null,
            configured: Boolean(global.value),
            ...(global.isSecret ? {} : { value: global.value ?? null }),
          })),
          memberId: config.memberId,
          userId: config.userId,
          role: config.role,
          agentDisplayName: config.agentDisplayName || null,
          agentType,
          runtimeId: config.runtimeId,
          grantId: config.grantId,
          scopes: config.scopes,
          skillBundleRefs: config.skillBundleRefs,
          projectSkillOverrides: config.projectSkillOverrides || [],
          capabilityBundleRefs,
          capabilityBundles,
          runtimeFeatureSupport,
          runtimeCapabilityWarnings,
          rolePrompt: config.rolePrompt || null,
          deploymentDays: config.deploymentDays ?? 1,
          dailyCostAmount: config.dailyCostAmount ?? 10,
          budgetCurrency: config.budgetCurrency || 'AIC',
          llm: this.sanitizeLlmConfig(launchLlm),
          repoWorkspaceDir: config.repoWorkspaceDir || '/opt/data/workspace',
          workspaceBaseUrl: this.agentWorkspaceBaseUrl(config.workspaceBaseUrl),
          projectApiBaseUrl: this.projectApiBaseUrl(config.projectApiBaseUrl),
          workspaceToken: config.workspaceToken,
        },
        null,
        2,
      ),
    );
    await writeFile(
      resolve(dataDir, 'AGENT_WORKSPACE_RUNTIME.env'),
      this.workspaceRuntimeEnvContents(
        this.agentWorkspaceBaseUrl(config.workspaceBaseUrl),
        this.projectApiBaseUrl(config.projectApiBaseUrl),
        config.workspaceToken,
        config.projectGithubUrl ?? null,
        config.repoWorkspaceDir || '/opt/data/workspace',
        config.projectGlobals || [],
        capabilityBundleRefs,
        {
          projectId: config.projectId,
          memberId: config.memberId,
          runtimeId: config.runtimeId,
          agentDisplayName: config.agentDisplayName,
        },
      ),
    );

    if (this.useMockRuntime()) {
      return {
        provider: 'local-docker',
        agentType,
        piBackend: agentType === 'pi' ? this.piBackend() : null,
        image,
        containerName,
        containerId: null,
        apiBaseUrl: this.runtimeApiBaseUrl(port),
        apiKey,
        dataDir,
        runtimeId: config.runtimeId,
        grantId: config.grantId,
        workspaceToken: config.workspaceToken,
        projectGithubUrl: config.projectGithubUrl ?? null,
        projectGlobalKeys: (config.projectGlobals || []).map((global) => global.key),
        repoWorkspaceDir: config.repoWorkspaceDir || '/opt/data/workspace',
        scopes: config.scopes,
        skillBundleRefs: config.skillBundleRefs,
        projectSkillOverrides: config.projectSkillOverrides || [],
        capabilityBundleRefs,
        capabilityBundles,
        runtimeFeatureSupport,
        runtimeCapabilityWarnings,
        agentDisplayName: config.agentDisplayName || null,
        rolePrompt: config.rolePrompt || null,
        deploymentDays: config.deploymentDays ?? 1,
        dailyCostAmount: config.dailyCostAmount ?? 10,
        budgetCurrency: config.budgetCurrency || 'AIC',
        enableSudo: Boolean(config.enableSudo),
        llm: this.sanitizeLlmConfig(launchLlm),
        role: config.role,
        status: 'IDLE',
        launchedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        currentActivity: `${config.role} ${this.agentTypeLabel(agentType)} mock runtime is ready`,
        messageHistory: [
          {
            id: randomBytes(12).toString('hex'),
            role: 'system',
            content: [
              `${config.role} ${this.agentTypeLabel(agentType)} mock runtime launched with ${config.skillBundleRefs.join(', ')}.`,
              config.agentDisplayName ? `Agent identity: your display name is ${config.agentDisplayName}.` : '',
              config.rolePrompt ? `Initial role prompt: ${config.rolePrompt}` : '',
            ].filter(Boolean).join('\n\n'),
            createdAt: new Date().toISOString(),
            status: 'IDLE',
          },
        ],
      };
    }

    await this.docker(['rm', '-f', containerName]).catch(() => null);
    const containerId = this.useDockerCopyStrategy()
      ? await this.createAndStartWithCopiedData(containerName, image, port, dataDir, launchConfig, apiKey)
      : await this.runWithBindMount(containerName, image, port, dataDir, launchConfig, apiKey);

    return {
      provider: 'local-docker',
      agentType,
      piBackend: agentType === 'pi' ? this.piBackend() : null,
      image,
      containerName,
      containerId,
      apiBaseUrl: this.runtimeApiBaseUrl(port),
      apiKey,
      dataDir,
      runtimeId: config.runtimeId,
      grantId: config.grantId,
      workspaceToken: config.workspaceToken,
      projectGithubUrl: config.projectGithubUrl ?? null,
      projectGlobalKeys: (config.projectGlobals || []).map((global) => global.key),
      repoWorkspaceDir: config.repoWorkspaceDir || '/opt/data/workspace',
      scopes: config.scopes,
      skillBundleRefs: config.skillBundleRefs,
      projectSkillOverrides: config.projectSkillOverrides || [],
      capabilityBundleRefs,
      capabilityBundles,
      runtimeFeatureSupport,
      runtimeCapabilityWarnings,
      agentDisplayName: config.agentDisplayName || null,
      rolePrompt: config.rolePrompt || null,
      deploymentDays: config.deploymentDays ?? 1,
      dailyCostAmount: config.dailyCostAmount ?? 10,
      budgetCurrency: config.budgetCurrency || 'AIC',
      enableSudo: Boolean(config.enableSudo),
      llm: this.sanitizeLlmConfig(launchLlm),
      role: config.role,
      status: 'STARTING',
      launchedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      currentActivity: `${config.role} ${this.agentTypeLabel(agentType)} runtime is starting`,
      messageHistory: [
        {
          id: randomBytes(12).toString('hex'),
          role: 'system',
          content: [
            `${config.role} ${this.agentTypeLabel(agentType)} runtime launched with ${config.skillBundleRefs.join(', ')}.`,
            config.agentDisplayName ? `Agent identity: your display name is ${config.agentDisplayName}.` : '',
            config.rolePrompt ? `Initial role prompt: ${config.rolePrompt}` : '',
          ].filter(Boolean).join('\n\n'),
          createdAt: new Date().toISOString(),
          status: 'STARTING',
        },
      ],
    };
  }

  private async runWithBindMount(
    containerName: string,
    image: string,
    port: number,
    dataDir: string,
    config: AgentRuntimeLaunchConfig,
    apiKey: string,
  ) {
    const run = await this.docker([
      'run',
      '-d',
      '--name',
      containerName,
      '-p',
      `${port}:8642`,
      '-e',
      'API_SERVER_ENABLED=true',
      '-e',
      'API_SERVER_HOST=0.0.0.0',
      '-e',
      'API_SERVER_PORT=8642',
      '-e',
      `API_SERVER_KEY=${apiKey}`,
      '-e',
      'API_SERVER_CORS_ORIGINS=*',
      '-e',
      `AGENTCRAFT_AGENT_TYPE=${this.normalizeAgentType(config.agentType)}`,
      ...this.agentTypeEnvironment(config.agentType),
      '-e',
      `AGENT_WORKSPACE_PROJECT_ID=${config.projectId}`,
      '-e',
      `AGENT_WORKSPACE_MEMBER_ID=${config.memberId}`,
      '-e',
      `AGENT_WORKSPACE_RUNTIME_ID=${config.runtimeId}`,
      '-e',
      `AGENT_WORKSPACE_ROLE=${config.role}`,
      '-e',
      `AGENT_WORKSPACE_CAPABILITY_BUNDLE_REFS=${(config.capabilityBundleRefs || []).join(',')}`,
      '-e',
      `AGENT_RUNTIME_WORKSPACE_DIR=${config.repoWorkspaceDir || '/opt/data/workspace'}`,
      '-e',
      `AGENT_WORKSPACE_BASE_URL=${this.agentWorkspaceBaseUrl(config.workspaceBaseUrl)}`,
      '-e',
      `AGENT_WORKSPACE_TOKEN=${config.workspaceToken}`,
      '-e',
      `AIFACTORY_API_BASE_URL=${this.projectApiBaseUrl(config.projectApiBaseUrl)}`,
      '-e',
      `AIFACTORY_RUNTIME_TOKEN=${config.workspaceToken}`,
      '-e',
      `ENABLE_AGENT_SUDO=${config.enableSudo ? 'true' : 'false'}`,
      ...(config.projectGithubUrl ? ['-e', `AGENT_WORKSPACE_GITHUB_URL=${config.projectGithubUrl}`] : []),
      ...this.llmEnvironment(config.llm),
      '-v',
      `${this.toDockerVolumePath(dataDir)}:/opt/data`,
      '--entrypoint',
      this.runtimeShellEntrypoint(config.agentType),
      image,
      '-lc',
      this.copyStrategyEntrypointScript(),
      this.runtimeShellName(config.agentType),
      ...this.runtimeCommandArgs(config.agentType),
    ]);
    return run.stdout.trim() || null;
  }

  private async createAndStartWithCopiedData(
    containerName: string,
    image: string,
    port: number,
    dataDir: string,
    config: AgentRuntimeLaunchConfig,
    apiKey: string,
  ) {
    const create = await this.docker([
      'create',
      '--name',
      containerName,
      '-p',
      `${port}:8642`,
      '-e',
      'API_SERVER_ENABLED=true',
      '-e',
      'API_SERVER_HOST=0.0.0.0',
      '-e',
      'API_SERVER_PORT=8642',
      '-e',
      `API_SERVER_KEY=${apiKey}`,
      '-e',
      'API_SERVER_CORS_ORIGINS=*',
      '-e',
      `AGENTCRAFT_AGENT_TYPE=${this.normalizeAgentType(config.agentType)}`,
      ...this.agentTypeEnvironment(config.agentType),
      '-e',
      `AGENT_WORKSPACE_PROJECT_ID=${config.projectId}`,
      '-e',
      `AGENT_WORKSPACE_MEMBER_ID=${config.memberId}`,
      '-e',
      `AGENT_WORKSPACE_RUNTIME_ID=${config.runtimeId}`,
      '-e',
      `AGENT_WORKSPACE_ROLE=${config.role}`,
      '-e',
      `AGENT_WORKSPACE_CAPABILITY_BUNDLE_REFS=${(config.capabilityBundleRefs || []).join(',')}`,
      '-e',
      `AGENT_RUNTIME_WORKSPACE_DIR=${config.repoWorkspaceDir || '/opt/data/workspace'}`,
      '-e',
      `AGENT_WORKSPACE_BASE_URL=${this.agentWorkspaceBaseUrl(config.workspaceBaseUrl)}`,
      '-e',
      `AGENT_WORKSPACE_TOKEN=${config.workspaceToken}`,
      '-e',
      `AIFACTORY_API_BASE_URL=${this.projectApiBaseUrl(config.projectApiBaseUrl)}`,
      '-e',
      `AIFACTORY_RUNTIME_TOKEN=${config.workspaceToken}`,
      '-e',
      `ENABLE_AGENT_SUDO=${config.enableSudo ? 'true' : 'false'}`,
      ...(config.projectGithubUrl ? ['-e', `AGENT_WORKSPACE_GITHUB_URL=${config.projectGithubUrl}`] : []),
      ...this.llmEnvironment(config.llm),
      '--entrypoint',
      this.runtimeShellEntrypoint(config.agentType),
      image,
      '-lc',
      this.copyStrategyEntrypointScript(),
      this.runtimeShellName(config.agentType),
      ...this.runtimeCommandArgs(config.agentType),
    ]);
    await this.docker(['cp', `${dataDir}${this.copySourceSuffix()}`, `${containerName}:/opt/data`]);
    await this.docker(['start', containerName]);
    return create.stdout.trim() || null;
  }

  private copyStrategyEntrypointScript() {
    return [
      'set -eu',
      'agent_type="${AGENTCRAFT_AGENT_TYPE:-hermes-agent}"',
      'if [ "$agent_type" = "hermes-agent" ]; then',
      '  chown -R hermes:hermes /opt/data 2>/dev/null || true',
      '  if [ "${ENABLE_AGENT_SUDO:-false}" = "true" ]; then',
      '    if ! command -v sudo >/dev/null 2>&1; then',
      '      DEBIAN_FRONTEND=noninteractive apt-get update >/dev/null && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends sudo >/dev/null && rm -rf /var/lib/apt/lists/*',
      '    fi',
      '    usermod -aG sudo hermes 2>/dev/null || true',
      '    printf "hermes ALL=(ALL) NOPASSWD:ALL\\n" >/etc/sudoers.d/90-hermes-agent',
      '    chmod 0440 /etc/sudoers.d/90-hermes-agent',
      '  fi',
      '  if command -v hermes-docker-entrypoint >/dev/null 2>&1; then',
      '    exec hermes-docker-entrypoint "$@"',
      '  fi',
      '  if [ -x /opt/hermes/docker/entrypoint.sh ]; then',
      '    tr -d "\\r" </opt/hermes/docker/entrypoint.sh >/tmp/hermes-entrypoint.sh',
      '    if ! command -v gosu >/dev/null 2>&1 && command -v runuser >/dev/null 2>&1; then',
      '      sed -i \'s/exec gosu hermes /exec runuser -u hermes -- /\' /tmp/hermes-entrypoint.sh',
      '    fi',
      '    chmod 0755 /tmp/hermes-entrypoint.sh',
      '    exec bash /tmp/hermes-entrypoint.sh "$@"',
      '  fi',
      'fi',
      'exec "$@"',
    ].join('\n');
  }

  private localRunnerHeartbeatStaleMs() {
    const configured = Number(this.configService.get<string>('AGENTCRAFT_LOCAL_RUNNER_STALE_MS') || 0);
    if (Number.isFinite(configured) && configured > 0) {
      return configured;
    }
    return 30_000;
  }

  private localRunnerHeartbeatAgeMs(session: AgentRuntimeSession) {
    const lastSeen = session.localRunnerBridge?.lastSeenAt || null;
    const lastSeenMs = lastSeen ? Date.parse(lastSeen) : Number.NaN;
    return Number.isFinite(lastSeenMs) ? Date.now() - lastSeenMs : 0;
  }

  private isLocalRunnerHeartbeatStale(session: AgentRuntimeSession) {
    const lastSeen = session.localRunnerBridge?.lastSeenAt || null;
    if (!lastSeen) {
      return false;
    }
    return this.localRunnerHeartbeatAgeMs(session) > this.localRunnerHeartbeatStaleMs();
  }

  async inspect(session: AgentRuntimeSession) {
    if (this.useMockRuntime()) {
      return {
        ...session,
        dockerStatus: { running: true, status: 'mock' },
        apiHealth: { ok: true, statusCode: 200, mock: true },
        status: session.status === 'STARTING' ? 'IDLE' : session.status,
        currentActivity: session.currentActivity || 'Mock runtime ready',
        updatedAt: new Date().toISOString(),
      };
    }

    if (session.provider === 'aws-ecs') {
      const cloudTask = await this.describeCloudTask(session.cloudTaskArn || session.containerId || '').catch(() => null);
      const privateIp = cloudTask ? this.taskPrivateIp(cloudTask) : session.cloudPrivateIp || null;
      const apiBaseUrl = privateIp ? `http://${privateIp}:8642` : session.apiBaseUrl;
      const apiHealth = await this.checkApiHealth({ ...session, apiBaseUrl });
      const lastStatus = cloudTask?.lastStatus || cloudTask?.desiredStatus || null;
      const stoppedReason = cloudTask?.stoppedReason || null;
      const status = apiHealth.ok
        ? session.status === 'STARTING'
          ? 'IDLE'
          : session.status
        : lastStatus === 'STOPPED'
          ? 'STOPPED'
          : 'STARTING';

      return {
        ...session,
        apiBaseUrl,
        cloudPrivateIp: privateIp,
        dockerStatus: { running: lastStatus !== 'STOPPED', status: lastStatus || 'UNKNOWN', cloud: true },
        apiHealth,
        status,
        currentActivity:
          status === 'IDLE'
            ? 'Idle'
            : status === 'STOPPED'
              ? stoppedReason || 'Cloud runtime stopped'
              : session.currentActivity || 'Waiting for cloud runtime health',
        updatedAt: new Date().toISOString(),
      };
    }

    if (session.provider === 'aws-agentcore') {
      const reachable = Boolean(session.agentCoreRuntimeArn || session.apiBaseUrl);
      return {
        ...session,
        dockerStatus: { running: reachable && session.status !== 'STOPPED', status: reachable ? 'agentcore-ready' : 'missing-runtime-arn', agentCore: true },
        apiHealth: { ok: reachable, statusCode: reachable ? 200 : 0, agentCore: true },
        status: reachable && session.status === 'STARTING' ? 'IDLE' : session.status,
        currentActivity:
          session.status === 'TYPING'
            ? session.currentActivity || 'AgentCore runtime is processing'
            : reachable
              ? session.currentActivity || 'AgentCore runtime ready'
              : 'AgentCore runtime ARN is not configured',
        updatedAt: new Date().toISOString(),
      };
    }

    if (session.provider === 'local-runner' || session.provider === 'local-codex') {
      const queuedRuntime = session.provider === 'local-codex' ? 'local agent runner' : 'local runner';
      const queuedScheme = session.provider === 'local-codex' ? 'local-codex://' : 'local-runner://';
      if (!session.apiBaseUrl || session.apiBaseUrl.startsWith(queuedScheme)) {
        const activeBridgeRequest = (session.localRunnerBridge?.requests || []).find((request) => {
          if (!['PENDING', 'RUNNING'].includes(request.status)) return false;
          return session.activeRequestId ? request.id === session.activeRequestId : true;
        });
        const heartbeatStale =
          Boolean(session.apiBaseUrl?.startsWith(queuedScheme)) &&
          !activeBridgeRequest &&
          this.isLocalRunnerHeartbeatStale(session);
        if (heartbeatStale) {
          const waitingStatus = session.provider === 'local-codex' ? 'WAITING_LOCAL_CODEX' : 'WAITING_LOCAL_RUNNER';
          return {
            ...session,
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
            status: waitingStatus,
            currentActivity: `${queuedRuntime} is offline. Restart the project runner to reconnect this runtime.`,
            lastError: session.status === 'TYPING'
              ? `${queuedRuntime} heartbeat stopped before the active message completed.`
              : session.lastError || null,
            updatedAt: new Date().toISOString(),
            localRunnerBridge: {
              requests: session.localRunnerBridge?.requests || [],
              connectedAt: session.localRunnerBridge?.connectedAt || null,
              lastSeenAt: session.localRunnerBridge?.lastSeenAt || null,
              disconnectedAt: session.localRunnerBridge?.disconnectedAt || null,
              disconnectReason: session.localRunnerBridge?.disconnectReason || 'heartbeat-stale',
            },
          };
        }
        const localStatus =
          session.apiBaseUrl?.startsWith(queuedScheme) &&
          (session.status === 'STARTING' || session.status === 'WAITING_LOCAL_RUNNER' || session.status === 'WAITING_LOCAL_CODEX')
            ? 'IDLE'
            : session.status || (session.provider === 'local-codex' ? 'WAITING_LOCAL_CODEX' : 'WAITING_LOCAL_RUNNER');
        return {
          ...session,
          dockerStatus: { running: Boolean(session.apiBaseUrl), status: session.apiBaseUrl ? 'runner-connected' : `waiting-${session.provider}`, localRunner: session.provider === 'local-runner', localCodex: session.provider === 'local-codex' },
          apiHealth: { ok: Boolean(session.apiBaseUrl), statusCode: session.apiBaseUrl ? 200 : 0, localRunner: session.provider === 'local-runner', localCodex: session.provider === 'local-codex' },
          status: localStatus,
          currentActivity: session.apiBaseUrl
            ? session.currentActivity || `${queuedRuntime} connected`
            : session.currentActivity || `Waiting for ${queuedRuntime} to claim this runtime`,
          updatedAt: new Date().toISOString(),
        };
      }
      const apiHealth = await this.checkApiHealth(session);
      return {
        ...session,
        dockerStatus: { running: apiHealth.ok, status: apiHealth.ok ? 'running' : 'unreachable', localRunner: session.provider === 'local-runner', localCodex: session.provider === 'local-codex' },
        apiHealth,
        status: apiHealth.ok
          ? session.status === 'STARTING' || session.status === 'WAITING_LOCAL_RUNNER' || session.status === 'WAITING_LOCAL_CODEX'
            ? 'IDLE'
            : session.status
          : session.status === 'STOPPED'
          ? 'STOPPED'
          : 'STARTING',
        currentActivity: apiHealth.ok ? 'Idle' : session.currentActivity || 'Waiting for local runner health',
        updatedAt: new Date().toISOString(),
      };
    }

    const dockerStatus = await this.inspectContainer(session.containerName);
    const apiHealth = await this.checkApiHealth(session);
    const recoveredSession = await this.recoverCompletedSessionFromLogs(session, dockerStatus);
    const activity = await this.loadRuntimeSessionActivity(recoveredSession).catch(() => ({
      actions: [] as AgentRuntimeAction[],
      messages: [] as AgentRuntimeMessage[],
      completedOutputText: null as string | null,
    }));
    const completedSession = this.recoverCompletedSessionFromActivity(recoveredSession, activity.completedOutputText);
    const status = this.mergeStatus(completedSession.status, dockerStatus, apiHealth);
    return {
      ...completedSession,
      dockerStatus,
      apiHealth,
      status,
      messageHistory: activity.messages.length
        ? this.mergeRuntimeActivityMessages(completedSession, activity.messages)
        : completedSession.messageHistory,
      recentActions: activity.actions.length ? activity.actions : completedSession.recentActions,
      currentActivity:
        status === 'IDLE'
          ? 'Idle'
          : status === 'STARTING'
            ? 'Waiting for runtime health'
            : status === 'STOPPED'
              ? 'Runtime stopped'
              : status === 'WAITING_CONFIRMATION'
                ? completedSession.currentActivity || 'Waiting for confirmation'
              : completedSession.currentActivity,
      updatedAt: new Date().toISOString(),
    };
  }

  async launchCloud(config: AgentRuntimeLaunchConfig): Promise<AgentRuntimeSession> {
    const agentType = this.normalizeAgentType(config.agentType);
    const capabilityBundleRefs = config.capabilityBundleRefs || [];
    const capabilityBundles = config.capabilityBundles || [];
    const runtimeFeatureSupport = config.runtimeFeatureSupport || this.runtimeFeatureSupport(agentType);
    const runtimeCapabilityWarnings = config.runtimeCapabilityWarnings || [];
    const image = config.image || this.cloudImage();
    if (!image) {
      throw new Error('HERMES_AGENT_CLOUD_IMAGE is required for AWS cloud agent launches');
    }

    const apiKey = randomBytes(24).toString('hex');
    const containerName = this.containerName(config.projectId, config.role, config.runtimeId);
    const now = new Date().toISOString();
    const launchType =
      (this.configService.get<string>('HERMES_AGENT_CLOUD_LAUNCH_TYPE') || 'FARGATE') as LaunchType;
    const runTask = await this.ecs().send(new RunTaskCommand({
      cluster: this.requiredConfig('HERMES_AGENT_CLOUD_CLUSTER', this.configService.get<string>('ECS_CLUSTER')),
      launchType,
      taskDefinition: this.requiredConfig('HERMES_AGENT_CLOUD_TASK_DEFINITION', 'agentcraft-hermes-runtime'),
      count: 1,
      enableExecuteCommand: this.configService.get<string>('HERMES_AGENT_CLOUD_ENABLE_EXEC') === 'true',
      networkConfiguration: {
        awsvpcConfiguration: {
          subnets: this.requiredListConfig('HERMES_AGENT_CLOUD_SUBNET_IDS'),
          securityGroups: this.requiredListConfig('HERMES_AGENT_CLOUD_SECURITY_GROUP_IDS'),
          assignPublicIp: (this.configService.get<string>('HERMES_AGENT_CLOUD_ASSIGN_PUBLIC_IP') || 'DISABLED') as any,
        },
      },
      overrides: {
        containerOverrides: [
          {
            name: this.cloudContainerName(),
            command: this.runtimeCommandArgs(agentType),
            environment: [
              { name: 'API_SERVER_ENABLED', value: 'true' },
              { name: 'API_SERVER_HOST', value: '0.0.0.0' },
              { name: 'API_SERVER_PORT', value: '8642' },
              { name: 'API_SERVER_KEY', value: apiKey },
              { name: 'API_SERVER_CORS_ORIGINS', value: '*' },
              { name: 'AGENTCRAFT_AGENT_TYPE', value: agentType },
              { name: 'AGENT_WORKSPACE_PROJECT_ID', value: config.projectId },
              { name: 'AGENT_WORKSPACE_MEMBER_ID', value: config.memberId },
              { name: 'AGENT_WORKSPACE_RUNTIME_ID', value: config.runtimeId },
              { name: 'AGENT_WORKSPACE_ROLE', value: config.role },
              { name: 'AGENT_WORKSPACE_CAPABILITY_BUNDLE_REFS', value: capabilityBundleRefs.join(',') },
              { name: 'AGENT_RUNTIME_WORKSPACE_DIR', value: config.repoWorkspaceDir || '/opt/data/workspace' },
              { name: 'AGENT_WORKSPACE_BASE_URL', value: this.agentWorkspaceBaseUrl(config.workspaceBaseUrl) },
              { name: 'AGENT_WORKSPACE_TOKEN', value: config.workspaceToken },
              ...(config.projectGithubUrl ? [{ name: 'AGENT_WORKSPACE_GITHUB_URL', value: config.projectGithubUrl }] : []),
              ...this.llmEnvironment(config.llm).reduce<Array<{ name: string; value: string }>>((env, item, index, items) => {
                if (item === '-e' && items[index + 1]) {
                  const [name, ...valueParts] = items[index + 1].split('=');
                  env.push({ name, value: valueParts.join('=') });
                }
                return env;
              }, []),
            ],
          },
        ],
      },
    }));

    const failure = runTask.failures?.[0];
    if (failure) {
      throw new Error(`ECS run-task failed: ${failure.reason || failure.arn || 'unknown failure'}`);
    }

    const task = runTask.tasks?.[0];
    const taskArn = task?.taskArn;
    if (!taskArn) {
      throw new Error('ECS run-task did not return a task ARN');
    }

    const readyTask = await this.waitForCloudTaskNetwork(taskArn);
    const privateIp = this.taskPrivateIp(readyTask);
    if (!privateIp) {
      throw new Error('ECS task started without a private IP address');
    }

    return {
      provider: 'aws-ecs',
      agentType,
      image,
      containerName,
      containerId: taskArn,
      cloudTaskArn: taskArn,
      cloudClusterArn: readyTask.clusterArn || this.configService.get<string>('HERMES_AGENT_CLOUD_CLUSTER') || null,
      cloudPrivateIp: privateIp,
      apiBaseUrl: `http://${privateIp}:8642`,
      apiKey,
      dataDir: '/opt/data',
      runtimeId: config.runtimeId,
      grantId: config.grantId,
      workspaceToken: config.workspaceToken,
      projectGithubUrl: config.projectGithubUrl ?? null,
      projectGlobalKeys: (config.projectGlobals || []).map((global) => global.key),
      repoWorkspaceDir: config.repoWorkspaceDir || '/opt/data/workspace',
      scopes: config.scopes,
      skillBundleRefs: config.skillBundleRefs,
      projectSkillOverrides: config.projectSkillOverrides || [],
      capabilityBundleRefs,
      capabilityBundles,
      runtimeFeatureSupport,
      runtimeCapabilityWarnings,
      agentDisplayName: config.agentDisplayName || null,
      rolePrompt: config.rolePrompt || null,
      deploymentDays: config.deploymentDays ?? 1,
      dailyCostAmount: config.dailyCostAmount ?? 10,
      budgetCurrency: config.budgetCurrency || 'AIC',
      enableSudo: Boolean(config.enableSudo),
      llm: this.sanitizeLlmConfig(config.llm),
      role: config.role,
      status: 'STARTING',
      launchedAt: now,
      updatedAt: now,
      currentActivity: `${config.role} ${this.agentTypeLabel(agentType)} cloud runtime is starting on ECS`,
      messageHistory: [
        {
          id: randomBytes(12).toString('hex'),
          role: 'system',
          content: [
            `${config.role} ${this.agentTypeLabel(agentType)} cloud runtime launched on ECS with ${config.skillBundleRefs.join(', ')}.`,
            config.agentDisplayName ? `Agent identity: your display name is ${config.agentDisplayName}.` : '',
            config.rolePrompt ? `Initial role prompt: ${config.rolePrompt}` : '',
          ].filter(Boolean).join('\n\n'),
          createdAt: now,
          status: 'STARTING',
        },
      ],
    };
  }

  async launchAgentCore(config: AgentRuntimeLaunchConfig): Promise<AgentRuntimeSession> {
    const agentType = this.normalizeAgentType(config.agentType);
    const capabilityBundleRefs = config.capabilityBundleRefs || [];
    const capabilityBundles = config.capabilityBundles || [];
    const runtimeFeatureSupport = config.runtimeFeatureSupport || this.runtimeFeatureSupport(agentType);
    const runtimeCapabilityWarnings = config.runtimeCapabilityWarnings || [];
    const now = new Date().toISOString();
    const runtimeArn = await this.resolveAgentCoreRuntimeArn(config);
    const qualifier = this.agentCoreRuntimeQualifier();
    const runtimeSessionId = this.agentCoreSessionId(config);
    const workspaceDir = this.agentCoreWorkspaceDir();

    return {
      provider: 'aws-agentcore',
      agentType,
      image: config.image || this.agentCoreContainerImage() || runtimeArn,
      containerName: `agentcore-${config.runtimeId}`,
      containerId: runtimeArn,
      agentCoreRuntimeArn: runtimeArn,
      agentCoreQualifier: qualifier,
      agentCoreRuntimeSessionId: runtimeSessionId,
      agentCoreRegion: this.agentCoreRegion(),
      apiBaseUrl: runtimeArn,
      apiKey: '',
      dataDir: workspaceDir,
      runtimeId: config.runtimeId,
      grantId: config.grantId,
      workspaceToken: config.workspaceToken,
      projectGithubUrl: config.projectGithubUrl ?? null,
      projectGlobalKeys: (config.projectGlobals || []).map((global) => global.key),
      repoWorkspaceDir: workspaceDir,
      scopes: config.scopes,
      skillBundleRefs: config.skillBundleRefs,
      projectSkillOverrides: config.projectSkillOverrides || [],
      capabilityBundleRefs,
      capabilityBundles,
      runtimeFeatureSupport,
      runtimeCapabilityWarnings,
      agentDisplayName: config.agentDisplayName || null,
      rolePrompt: config.rolePrompt || null,
      deploymentDays: config.deploymentDays ?? 1,
      dailyCostAmount: config.dailyCostAmount ?? 0,
      budgetCurrency: config.budgetCurrency || 'AIC',
      llm: this.sanitizeLlmConfig(config.llm),
      role: config.role,
      status: 'IDLE',
      launchedAt: now,
      updatedAt: now,
      currentActivity: `${config.role} ${this.agentTypeLabel(agentType)} AgentCore runtime is ready`,
      messageHistory: [
        {
          id: randomBytes(12).toString('hex'),
          role: 'system',
          content: [
            `${config.role} ${this.agentTypeLabel(agentType)} AgentCore runtime attached with ${config.skillBundleRefs.join(', ')}.`,
            `AgentCore session: ${runtimeSessionId}.`,
            config.agentDisplayName ? `Agent identity: your display name is ${config.agentDisplayName}.` : '',
            config.rolePrompt ? `Initial role prompt: ${config.rolePrompt}` : '',
          ].filter(Boolean).join('\n\n'),
          createdAt: now,
          status: 'IDLE',
        },
      ],
    };
  }

  async createLocalRunnerPendingSession(config: AgentRuntimeLaunchConfig): Promise<AgentRuntimeSession> {
    return this.createQueuedLocalRuntimePendingSession(config, 'local-runner');
  }

  async createLocalCodexPendingSession(config: AgentRuntimeLaunchConfig): Promise<AgentRuntimeSession> {
    return this.createQueuedLocalRuntimePendingSession(config, 'local-codex');
  }

  private async createQueuedLocalRuntimePendingSession(
    config: AgentRuntimeLaunchConfig,
    provider: 'local-runner' | 'local-codex',
  ): Promise<AgentRuntimeSession> {
    const now = new Date().toISOString();
    const launchLlm = provider === 'local-runner' ? this.localDockerLlmConfig(config.llm) : config.llm;
    const launchConfig = launchLlm === config.llm ? config : { ...config, llm: launchLlm };
    const agentType = this.normalizeAgentType(config.agentType);
    const capabilityBundleRefs = config.capabilityBundleRefs || [];
    const capabilityBundles = config.capabilityBundles || [];
    const runtimeFeatureSupport = config.runtimeFeatureSupport || this.runtimeFeatureSupport(agentType);
    const runtimeCapabilityWarnings = config.runtimeCapabilityWarnings || [];
    const image = config.image || this.localRunnerImage(agentType);
    const apiKey = randomBytes(24).toString('hex');
    const containerName = this.containerName(config.projectId, config.role, config.runtimeId);
    const job = await this.createLocalRunnerJob(launchConfig, image, containerName, apiKey, {
      piDirectModelApi: provider === 'local-codex',
    });

    return {
      provider,
      agentType,
      image,
      containerName,
      containerId: null,
      apiBaseUrl: '',
      apiKey,
      dataDir: '',
      runtimeId: config.runtimeId,
      grantId: config.grantId,
      workspaceToken: config.workspaceToken,
      projectGithubUrl: config.projectGithubUrl ?? null,
      projectGlobalKeys: (config.projectGlobals || []).map((global) => global.key),
      repoWorkspaceDir: config.repoWorkspaceDir || '/opt/data/workspace',
      scopes: config.scopes,
      skillBundleRefs: config.skillBundleRefs,
      projectSkillOverrides: config.projectSkillOverrides || [],
      capabilityBundleRefs,
      capabilityBundles,
      runtimeFeatureSupport,
      runtimeCapabilityWarnings,
      agentDisplayName: config.agentDisplayName || null,
      rolePrompt: config.rolePrompt || null,
      deploymentDays: config.deploymentDays ?? 1,
      dailyCostAmount: config.dailyCostAmount ?? 10,
      budgetCurrency: config.budgetCurrency || 'AIC',
      llm: this.sanitizeLlmConfig(launchLlm),
      role: config.role,
      status: provider === 'local-codex' ? 'WAITING_LOCAL_CODEX' : 'WAITING_LOCAL_RUNNER',
      launchedAt: now,
      updatedAt: now,
      currentActivity: provider === 'local-codex'
        ? `${config.role} ${this.agentTypeLabel(agentType)} is waiting for local agent runner to claim the launch job`
        : `${config.role} ${this.agentTypeLabel(agentType)} is waiting for a local runner to claim the launch job`,
      localRunnerJob: job,
      messageHistory: [
        {
          id: randomBytes(12).toString('hex'),
          role: 'system',
          content: [
            provider === 'local-codex'
              ? `${config.role} ${this.agentTypeLabel(agentType)} local agent launch job created with ${config.skillBundleRefs.join(', ')}.`
              : `${config.role} ${this.agentTypeLabel(agentType)} local runner launch job created with ${config.skillBundleRefs.join(', ')}.`,
            config.agentDisplayName ? `Agent identity: your display name is ${config.agentDisplayName}.` : '',
            provider === 'local-codex'
              ? 'Start agentcraft-local-codex-runner on a machine with Node.js to claim this runtime. Codex jobs use Codex CLI; Pi jobs use the Pi npm package.'
              : 'Start agentcraft-local-runner on a machine with Docker to claim this runtime.',
            config.rolePrompt ? `Initial role prompt: ${config.rolePrompt}` : '',
          ].filter(Boolean).join('\n\n'),
          createdAt: now,
          status: provider === 'local-codex' ? 'WAITING_LOCAL_CODEX' : 'WAITING_LOCAL_RUNNER',
        },
      ],
    };
  }

  async createLocalRunnerJobForSession(
    session: AgentRuntimeSession,
    context: AgentWorkspaceContextSync,
    llm: AgentRuntimeLaunchConfig['llm'],
    options: { provider?: 'local-runner' | 'local-codex' } = {},
  ): Promise<AgentRuntimeLocalRunnerJob> {
    const agentType = this.normalizeAgentType(session.agentType);
    const image = session.image || this.localRunnerImage(agentType);
    const containerName = session.containerName || this.containerName(context.projectId, context.role, session.runtimeId);
    const apiKey = session.apiKey || randomBytes(24).toString('hex');
    return this.createLocalRunnerJob(
      {
        projectId: context.projectId,
        memberId: context.memberId,
        userId: context.userId,
        role: context.role,
        agentDisplayName: session.agentDisplayName ?? context.agentDisplayName ?? null,
        agentType,
        runtimeId: session.runtimeId,
        grantId: session.grantId,
        workspaceToken: session.workspaceToken,
        workspaceBaseUrl: context.workspaceBaseUrl,
        projectGithubUrl: session.projectGithubUrl ?? null,
        projectGlobals: context.projectGlobals || [],
        repoWorkspaceDir: session.repoWorkspaceDir || '/opt/data/workspace',
        scopes: session.scopes || [],
        skillBundleRefs: session.skillBundleRefs || [],
        projectSkillOverrides: session.projectSkillOverrides || [],
        capabilityBundleRefs: session.capabilityBundleRefs || [],
        runtimeFeatureSupport: session.runtimeFeatureSupport || this.runtimeFeatureSupport(agentType),
        runtimeCapabilityWarnings: session.runtimeCapabilityWarnings || [],
        rolePrompt: session.rolePrompt ?? null,
        deploymentDays: session.deploymentDays ?? 1,
        dailyCostAmount: session.dailyCostAmount ?? 0,
        budgetCurrency: session.budgetCurrency || 'AIC',
        enableSudo: Boolean(session.enableSudo),
        llm,
        image,
      },
      image,
      containerName,
      apiKey,
      {
        piDirectModelApi: options.provider === 'local-codex',
      },
    );
  }

  hasActiveMessage(runtimeId: string, requestId?: string | null) {
    if (!requestId) return false;
    return this.activeMessageControllers.has(this.activeMessageKey(runtimeId, requestId));
  }

  private clearActiveMessage(runtimeId: string, requestId?: string | null) {
    if (!requestId) return;
    this.activeMessageControllers.delete(this.activeMessageKey(runtimeId, requestId));
  }

  trackActiveMessage(session: AgentRuntimeSession, requestId: string) {
    const key = this.activeMessageKey(session.runtimeId, requestId);
    const controller = new AbortController();
    this.activeMessageControllers.set(key, controller);
    return () => {
      if (this.activeMessageControllers.get(key) === controller) {
        this.activeMessageControllers.delete(key);
      }
    };
  }

  cancelMessage(session: AgentRuntimeSession) {
    const requestId = session.activeRequestId;
    if (!requestId) return false;
    const key = this.activeMessageKey(session.runtimeId, requestId);
    const controller = this.activeMessageControllers.get(key);
    if (!controller) return false;
    controller.abort(new Error('Agent message cancelled'));
    this.activeMessageControllers.delete(key);
    return true;
  }

  async sendMessage(
    session: AgentRuntimeSession,
    message: string,
    systemPrompt: string,
    options: AgentRuntimeSendMessageOptions = {},
  ) {
    if (this.useMockRuntime()) {
      const outputText = `Mock ${session.role} received: ${message}`;
      if (options.onTextDelta) await options.onTextDelta(outputText);
      return {
        payload: {
          id: `mock_${Date.now()}`,
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
        recentActions: [
          {
            kind: 'message' as const,
            name: 'assistant',
            summary: outputText,
            status: 'ok' as const,
          },
        ],
      };
    }

    if (session.provider === 'aws-agentcore') {
      return this.sendAgentCoreMessage(session, message, systemPrompt, options);
    }

    const requestPayload = await this.buildResponsesRequest(session, message, systemPrompt, true, {
      streamingBehavior: options.streamingBehavior,
    });
    const timeoutMs =
      options.timeoutMs ?? Number(this.configService.get<string>('HERMES_AGENT_MESSAGE_TIMEOUT_MS') || 0);
    const isCliBridge = ['mini-swe-agent', 'pi', 'claude-code', 'codex'].includes(this.normalizeAgentType(session.agentType));
    const requestedRetries =
      options.retries ?? Number(this.configService.get<string>('HERMES_AGENT_MESSAGE_RETRIES') || (isCliBridge ? 1 : 3));
    const retries = isCliBridge && options.retries === undefined ? 1 : requestedRetries;
    const retryDelayMs =
      options.retryDelayMs ?? Number(this.configService.get<string>('HERMES_AGENT_MESSAGE_RETRY_DELAY_MS') || 2000);
    let lastError: any = null;
    const requestId = options.requestId || randomUUID();
    const messageKey = this.activeMessageKey(session.runtimeId, requestId);
    const controller = new AbortController();
    this.activeMessageControllers.set(messageKey, controller);

    try {
      for (let attempt = 1; attempt <= retries; attempt += 1) {
        try {
          const signal =
            timeoutMs > 0 && typeof AbortSignal.any === 'function'
              ? AbortSignal.any([controller.signal, AbortSignal.timeout(timeoutMs)])
              : timeoutMs > 0
                ? AbortSignal.timeout(timeoutMs)
                : controller.signal;
        const response = await fetch(`${session.apiBaseUrl}/v1/responses`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${session.apiKey}`,
          },
          body: JSON.stringify(requestPayload),
          signal,
        });

        if (!response.ok) {
          const text = await response.text().catch(() => response.statusText);
          throw new Error(`Agent runtime request failed with ${response.status}: ${text}`);
        }

        const payload = await this.readResponsesResponse(response, options.onTextDelta);
        const outputText = this.extractOutputText(payload);
        const failureMessage = this.extractResponsesFailureMessage(payload, outputText);
        if (failureMessage) {
          throw new Error(failureMessage);
        }
        return { payload, outputText, recentActions: this.extractRecentActions(payload) };
        } catch (error: any) {
          lastError = error;
          if (controller.signal.aborted || attempt >= retries) {
            throw error;
          }
          await this.sleep(retryDelayMs);
        }
      }

      throw lastError || new Error('Agent runtime request failed');
    } finally {
      if (this.activeMessageControllers.get(messageKey) === controller) {
        this.activeMessageControllers.delete(messageKey);
      }
    }
  }

  async buildResponsesRequest(
    session: AgentRuntimeSession,
    message: string,
    systemPrompt: string,
    stream = true,
    options: { streamingBehavior?: 'steer' | 'followUp' } = {},
  ) {
    const skillPrompt = await this.loadSkillPrompt(
      session.skillBundleRefs,
      session.role,
      session.projectSkillOverrides,
      {
        progressive: this.shouldUseProgressiveSkillPrompt(session),
        mountRoot: session.provider === 'local-codex' ? './skills' : undefined,
      },
    );
    const pageConversationId = this.pageConversationId(session);
    return {
      model: session.agentType || 'hermes-agent',
      input: this.buildRuntimeInput(session, message),
      instructions: [
        systemPrompt,
        session.rolePrompt,
        skillPrompt,
        this.runtimeConversationContinuityPrompt(session),
      ].filter(Boolean).join('\n\n'),
      conversation: this.hermesConversationKey(session),
      stream,
      agentcraft: {
        runtimeId: session.runtimeId,
        role: session.role,
        agentDisplayName: session.agentDisplayName || null,
        agentType: session.agentType || 'hermes-agent',
        conversationId: pageConversationId,
        currentUserMessage: message,
        inputMode: 'agentcraft-message',
        ...(options.streamingBehavior ? { streamingBehavior: options.streamingBehavior } : {}),
      },
    };
  }

  private async sendAgentCoreMessage(
    session: AgentRuntimeSession,
    message: string,
    systemPrompt: string,
    options: AgentRuntimeSendMessageOptions = {},
  ) {
    const requestPayload = await this.buildAgentCoreInvocationPayload(session, message, systemPrompt);
    const requestId = options.requestId || randomUUID();
    const messageKey = this.activeMessageKey(session.runtimeId, requestId);
    const controller = new AbortController();
    this.activeMessageControllers.set(messageKey, controller);
    try {
      const response = await this.agentCore().send(
        new InvokeAgentRuntimeCommand({
          agentRuntimeArn: this.requiredAgentCoreRuntimeArn(session),
          qualifier: session.agentCoreQualifier || this.agentCoreRuntimeQualifier(),
          runtimeSessionId: this.requiredAgentCoreRuntimeSessionId(session),
          contentType: 'application/json',
          accept: 'text/event-stream, application/json',
          payload: Buffer.from(JSON.stringify(requestPayload)),
        }),
        { abortSignal: controller.signal },
      );
      const outputText = await this.readAgentCoreInvocationResponse(response, options.onTextDelta);
      const payload = this.agentCoreResponsePayload(outputText);
      return {
        payload,
        outputText,
        recentActions: [
          {
            kind: 'message' as const,
            name: 'agentcore',
            summary: outputText.slice(0, 240),
            status: 'ok' as const,
          },
        ],
      };
    } finally {
      if (this.activeMessageControllers.get(messageKey) === controller) {
        this.activeMessageControllers.delete(messageKey);
      }
    }
  }

  private async buildAgentCoreInvocationPayload(
    session: AgentRuntimeSession,
    message: string,
    systemPrompt: string,
  ) {
    const skillPrompt = await this.loadSkillPrompt(session.skillBundleRefs, session.role, session.projectSkillOverrides);
    const instructions = [
      systemPrompt,
      session.rolePrompt,
      skillPrompt,
      this.runtimeConversationContinuityPrompt(session),
      '[SYSTEM: AgentCore runtime context]',
      `This request is running through Amazon Bedrock AgentCore Runtime session ${this.requiredAgentCoreRuntimeSessionId(session)}.`,
      `Use ${session.repoWorkspaceDir || this.agentCoreWorkspaceDir()} as the persistent workspace when filesystem storage is available.`,
      'Role prompt and skill instructions are injected in this payload by AgentCraft; do not assume they exist as files unless your runtime writes them to disk.',
    ].filter(Boolean).join('\n\n');
    const input = this.buildRuntimeInput(session, message);

    return {
      prompt: [
        instructions,
        '',
        '[Current user request]',
        input,
      ].join('\n'),
      message,
      input,
      instructions,
      system_prompt: instructions,
      session_id: session.activeConversationId || `default-${session.runtimeId}`,
      agentcraft: {
        runtimeId: session.runtimeId,
        role: session.role,
        grantId: session.grantId,
        scopes: session.scopes,
        skillBundleRefs: session.skillBundleRefs,
        projectSkillOverrides: session.projectSkillOverrides || [],
        capabilityBundleRefs: session.capabilityBundleRefs || [],
        capabilityBundles: session.capabilityBundles || [],
        runtimeFeatureSupport: session.runtimeFeatureSupport || null,
        runtimeCapabilityWarnings: session.runtimeCapabilityWarnings || [],
        projectGithubUrl: session.projectGithubUrl || null,
        workspaceDir: session.repoWorkspaceDir || this.agentCoreWorkspaceDir(),
      },
    };
  }

  private async readAgentCoreInvocationResponse(
    response: any,
    onTextDelta?: AgentRuntimeSendMessageOptions['onTextDelta'],
  ) {
    const body = (response as any).response;
    let raw = '';
    if (body?.transformToString) {
      raw = await body.transformToString();
    } else if (body && Symbol.asyncIterator in Object(body)) {
      const decoder = new TextDecoder();
      for await (const chunk of body as AsyncIterable<Uint8Array>) {
        raw += decoder.decode(chunk, { stream: true });
        if (onTextDelta) await onTextDelta(this.extractAgentCoreOutputText(raw));
      }
      raw += decoder.decode();
    }
    const outputText = this.extractAgentCoreOutputText(raw);
    if (onTextDelta) await onTextDelta(outputText);
    return outputText;
  }

  private agentCoreResponsePayload(outputText: string) {
    return {
      id: `agentcore_${Date.now()}`,
      object: 'response',
      status: 'completed',
      output: [
        {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: outputText }],
        },
      ],
    };
  }

  private extractAgentCoreOutputText(raw: string) {
    const text = (raw || '').trim();
    if (!text) return '';
    const eventLines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice('data:'.length).trim())
      .filter((line) => line && line !== '[DONE]');
    if (eventLines.length) {
      const chunks = eventLines.map((line) => this.extractAgentCoreJsonText(line)).filter(Boolean);
      return chunks.join('\n').trim() || eventLines.join('\n');
    }
    return this.extractAgentCoreJsonText(text) || text;
  }

  private extractAgentCoreJsonText(raw: string) {
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === 'string') return parsed;
      if (typeof parsed?.response === 'string') return parsed.response;
      if (typeof parsed?.message === 'string') return parsed.message;
      if (typeof parsed?.output === 'string') return parsed.output;
      if (typeof parsed?.text === 'string') return parsed.text;
      if (Array.isArray(parsed?.content)) {
        return parsed.content
          .map((part: any) => typeof part === 'string' ? part : part?.text || part?.content || '')
          .filter(Boolean)
          .join('\n');
      }
      return this.extractOutputText(parsed);
    } catch {
      return '';
    }
  }

  private hermesConversationKey(session: AgentRuntimeSession) {
    const pageConversationId = this.pageConversationId(session);
    const safeConversationId = pageConversationId.replace(/[^A-Za-z0-9._:-]/g, '_').slice(0, 160);
    return `agent-workspace:${session.runtimeId}:${safeConversationId || `default-${session.runtimeId}`}`;
  }

  private pageConversationId(session: AgentRuntimeSession) {
    return session.activeRequestConversationId?.trim() || session.activeConversationId?.trim() || `default-${session.runtimeId}`;
  }

  private runtimeConversationContinuityPrompt(session: AgentRuntimeSession) {
    const pageConversationId = this.pageConversationId(session);
    return [
      '[SYSTEM: Conversation continuity]',
      `The Hermes conversation is keyed to app conversation "${pageConversationId}".`,
      'Messages with the same app conversation id are the same ongoing conversation; a new app conversation id is a fresh conversation.',
      'For an ongoing conversation, do not repeat a full project resume or board refresh just because another user message arrived if current project context was already loaded in this Hermes conversation.',
      'Reuse prior turn context, and refresh workspace state only before workspace mutations, when the user asks for current status, or when prior context is missing, stale, or ambiguous.',
    ].join('\n');
  }

  private async readResponsesResponse(response: Response, onTextDelta?: AgentRuntimeSendMessageOptions['onTextDelta']) {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const payload = await response.json();
      if (onTextDelta) await onTextDelta(this.extractOutputText(payload));
      return payload;
    }
    return this.readResponsesStream(response, onTextDelta);
  }

  async listWorkspaceFiles(session: AgentRuntimeSession, options: { maxDepth?: number } = {}) {
    const maxDepth = Math.min(Math.max(Math.floor(options.maxDepth || 4), 1), 8);
    if (session.provider === 'aws-agentcore') {
      return this.listAgentCoreWorkspaceFiles(session, maxDepth);
    }
    if (session.provider === 'aws-ecs' || session.provider === 'local-runner') {
      return [];
    }
    if (this.useMockRuntime() || !session.containerName) {
      return this.listLocalWorkspaceFiles(session, maxDepth);
    }

    const root = session.repoWorkspaceDir || '/opt/data/workspace';
    const command = [
      'sh',
      '-lc',
      [
        'root="${AGENT_RUNTIME_WORKSPACE_DIR:-/opt/data/workspace}"',
        'depth="${MAX_DEPTH:-4}"',
        'if [ ! -d "$root" ]; then exit 0; fi',
        'cd "$root"',
        'find . -maxdepth "$depth" -type f ! -path "./.git/*" -printf "%P\\t%s\\t%T@\\n" | sort',
      ].join('; '),
    ];
    const result = await this.docker([
      'exec',
      '-e',
      `AGENT_RUNTIME_WORKSPACE_DIR=${root}`,
      '-e',
      `MAX_DEPTH=${maxDepth}`,
      session.containerName,
      ...command,
    ]);
    return result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line): AgentRuntimeWorkspaceFile | null => {
        const [path, rawSize, rawModified] = line.split('\t');
        if (!path) return null;
        return {
          path,
          name: basename(path),
          size: Number(rawSize || 0),
          modifiedAt: rawModified && Number.isFinite(Number(rawModified))
            ? new Date(Number(rawModified) * 1000).toISOString()
            : null,
        };
      })
      .filter((file): file is AgentRuntimeWorkspaceFile => Boolean(file));
  }

  async downloadWorkspaceFile(session: AgentRuntimeSession, filePath: string): Promise<AgentRuntimeWorkspaceDownload> {
    const safePath = this.normalizeWorkspaceRelativePath(filePath);
    if (session.provider === 'aws-agentcore') {
      return this.downloadAgentCoreWorkspaceFile(session, safePath);
    }
    if (session.provider === 'aws-ecs' || session.provider === 'local-runner') {
      throw new Error('Remote runtime workspace download is not available yet');
    }
    if (this.useMockRuntime() || !session.containerName) {
      const localPath = resolve(this.localWorkspaceRoot(session), safePath);
      const localRoot = this.localWorkspaceRoot(session);
      if (localPath !== localRoot && !localPath.startsWith(`${localRoot}\\`) && !localPath.startsWith(`${localRoot}/`)) {
        throw new Error('Invalid workspace file path');
      }
      const fileStat = await stat(localPath);
      if (!fileStat.isFile()) {
        throw new Error('Workspace path is not a file');
      }
      return {
        path: safePath,
        filename: basename(safePath),
        contentType: this.contentTypeForPath(safePath),
        content: await readFile(localPath),
      };
    }

    const tmpRoot = await mkdtemp(join(tmpdir(), 'aifactory-runtime-workspace-'));
    const target = join(tmpRoot, basename(safePath));
    try {
      const root = session.repoWorkspaceDir || '/opt/data/workspace';
      const source = `${session.containerName}:${posixPath.join(root, safePath)}`;
      await this.docker(['cp', source, target]);
      const fileStat = await stat(target);
      if (!fileStat.isFile()) {
        throw new Error('Workspace path is not a file');
      }
      return {
        path: safePath,
        filename: basename(safePath),
        contentType: this.contentTypeForPath(safePath),
        content: await readFile(target),
      };
    } finally {
      await rm(tmpRoot, { recursive: true, force: true }).catch(() => null);
    }
  }

  private async listAgentCoreWorkspaceFiles(session: AgentRuntimeSession, maxDepth: number) {
    const root = session.repoWorkspaceDir || this.agentCoreWorkspaceDir();
    const command = [
      'root=${AGENT_RUNTIME_WORKSPACE_DIR:-' + this.shellQuote(root) + '}',
      'depth=${MAX_DEPTH:-4}',
      'if [ ! -d "$root" ]; then exit 0; fi',
      'cd "$root"',
      'find . -maxdepth "$depth" -type f ! -path "./.git/*" -printf "%P\\t%s\\t%T@\\n" | sort',
    ].join('; ');
    const result = await this.invokeAgentCoreShellCommand(session, `/bin/bash -lc ${this.shellQuote(command)}`, 30, {
      AGENT_RUNTIME_WORKSPACE_DIR: root,
      MAX_DEPTH: String(maxDepth),
    });
    if (result.exitCode !== 0) {
      throw new Error(result.stderr || result.stdout || 'AgentCore workspace listing failed');
    }
    return result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line): AgentRuntimeWorkspaceFile | null => {
        const [path, rawSize, rawModified] = line.split('\t');
        if (!path) return null;
        return {
          path,
          name: basename(path),
          size: Number(rawSize || 0),
          modifiedAt: rawModified && Number.isFinite(Number(rawModified))
            ? new Date(Number(rawModified) * 1000).toISOString()
            : null,
        };
      })
      .filter((file): file is AgentRuntimeWorkspaceFile => Boolean(file));
  }

  private async downloadAgentCoreWorkspaceFile(
    session: AgentRuntimeSession,
    safePath: string,
  ): Promise<AgentRuntimeWorkspaceDownload> {
    const root = session.repoWorkspaceDir || this.agentCoreWorkspaceDir();
    const command = [
      `root=${this.shellQuote(root)}`,
      `rel=${this.shellQuote(safePath)}`,
      'file="$root/$rel"',
      'if [ ! -f "$file" ]; then echo "workspace path is not a file" >&2; exit 44; fi',
      'base64 "$file" | tr -d "\\n"',
    ].join('; ');
    const result = await this.invokeAgentCoreShellCommand(session, `/bin/bash -lc ${this.shellQuote(command)}`, 120);
    if (result.exitCode !== 0) {
      throw new Error(result.stderr || result.stdout || 'AgentCore workspace download failed');
    }
    return {
      path: safePath,
      filename: basename(safePath),
      contentType: this.contentTypeForPath(safePath),
      content: Buffer.from(result.stdout.trim(), 'base64'),
    };
  }

  private activeMessageKey(runtimeId: string, requestId: string) {
    return `${runtimeId}:${requestId}`;
  }

  async loadRuntimeSessionActions(session: AgentRuntimeSession) {
    return (await this.loadRuntimeSessionActivity(session)).actions;
  }

  async loadRuntimeSessionActivity(session: AgentRuntimeSession): Promise<{
    actions: AgentRuntimeAction[];
    messages: AgentRuntimeMessage[];
    completedOutputText?: string | null;
  }> {
    if (session.provider === 'aws-ecs' || session.provider === 'aws-agentcore') {
      return { actions: session.recentActions || [], messages: [], completedOutputText: null };
    }
    if (this.useMockRuntime() || !session.containerName) {
      return { actions: session.recentActions || [], messages: [], completedOutputText: null };
    }

    const conversationKey = this.hermesConversationKey(session);
    const allowLatestSessionFallback =
      session.status === 'TYPING' ||
      (session.status === 'ERROR' && session.lastError === 'Previous background message stalled and was reset.');
    const result = await this.docker([
      'exec',
      session.containerName,
      'sh',
      '-lc',
      [
        `key=${this.shellQuote(conversationKey)}`,
        `allow_latest_fallback=${allowLatestSessionFallback ? '1' : '0'}`,
        'match=',
        'for file in $(ls -t /opt/data/sessions/*.json 2>/dev/null); do',
        '  if grep -Fq -- "$key" "$file"; then match="$file"; break; fi',
        'done',
        'if [ -z "$match" ] && [ "$allow_latest_fallback" = "1" ]; then',
        '  match=$(ls -t /opt/data/sessions/*.json 2>/dev/null | head -1)',
        'fi',
        'if [ -z "$match" ]; then',
        '  for file in $(ls -t /opt/data/.pi/sessions/*/*.jsonl 2>/dev/null); do',
        '    if [ "$(basename "$file" .jsonl)" = "$key" ]; then match="$file"; break; fi',
        '  done',
        'fi',
        'if [ -z "$match" ] && [ "$allow_latest_fallback" = "1" ]; then',
        '  match=$(ls -t /opt/data/.pi/sessions/*/*.jsonl 2>/dev/null | head -1)',
        'fi',
        'if [ -n "$match" ]; then cat "$match"; fi',
      ].join('\n'),
    ]);
    const raw = result.stdout.trim();
    if (!raw) return { actions: [], messages: [], completedOutputText: null };

    const piActivity = this.parsePiJsonlRuntimeActivity(raw, session);
    if (piActivity) return piActivity;

    let payload: any;
    try {
      payload = JSON.parse(raw);
    } catch {
      return { actions: [], messages: [], completedOutputText: null };
    }

    const messages = Array.isArray(payload?.messages) ? payload.messages : [];
    const completedOutputText = this.completedRuntimeActivityOutputText(messages, payload?.last_updated);
    const callNames = new Map<string, string>();
    const actions: AgentRuntimeAction[] = [];
    const timelineMessages: AgentRuntimeMessage[] = [];
    const turnStartIndex = Math.max(0, messages.map((message: any) => message?.role).lastIndexOf('user') + 1);
    let activityGroup: AgentRuntimeAction[] = [];

    const flushActivityGroup = (index: number) => {
      if (!activityGroup.length) return;
      const groupActions = this.compactRecentActions(activityGroup).slice(-12);
      const summary = this.activityGroupSummary(groupActions);
      timelineMessages.push({
        id: `hermes-${session.runtimeId}-activity-${index}-${groupActions.length}`,
        role: 'tool',
        content: summary,
        createdAt: session.lastStreamAt || session.lastMessageAt || new Date().toISOString(),
        status: 'RUNTIME_ACTIVITY',
        actions: groupActions,
      });
      activityGroup = [];
    };

    for (let index = turnStartIndex; index < messages.length; index += 1) {
      const message = messages[index];
      const toolCalls = Array.isArray(message?.tool_calls) ? message.tool_calls : [];
      for (const call of toolCalls) {
        const name = String(call?.function?.name || call?.name || 'tool');
        const callId = String(call?.id || call?.call_id || `${name}:${actions.length}`);
        callNames.set(callId, name);
        const action: AgentRuntimeAction = {
          kind: 'tool',
          name,
          summary: this.summarizeToolCall(call),
          status: 'pending',
        };
        actions.push(action);
        activityGroup.push(action);
      }

      if (message?.role === 'tool') {
        const callId = String(message?.tool_call_id || message?.call_id || `tool-result:${actions.length}`);
        const name = callNames.get(callId) || callId;
        const action: AgentRuntimeAction = {
          kind: 'tool_result',
          name,
          summary: this.summarizeToolOutput(message?.content),
          status: this.toolOutputStatus(message?.content),
        };
        actions.push(action);
        activityGroup.push(action);
      }

      if (message?.role === 'assistant') {
        const text = this.extractHermesMessageText(message);
        if (text) {
          flushActivityGroup(index);
          timelineMessages.push({
            id: `hermes-${session.runtimeId}-assistant-${index}`,
            role: 'assistant',
            content: text,
            createdAt: session.lastStreamAt || session.lastResponseAt || session.lastMessageAt || new Date().toISOString(),
            status: session.status === 'TYPING' ? 'TYPING' : 'IDLE',
          });
        }
      }
    }

    flushActivityGroup(messages.length);

    const currentTimelineMessages = timelineMessages
      .filter((message) => !this.runtimeTimelineMessageSeenBeforeLatestUser(session, message))
      .slice(-20);
    const staleCompletedOutput =
      completedOutputText && this.assistantContentSeenBeforeLatestUser(session, completedOutputText);

    return {
      actions: currentTimelineMessages.length ? this.compactRecentActions(actions).slice(-12) : [],
      messages: currentTimelineMessages,
      completedOutputText: staleCompletedOutput ? null : completedOutputText,
    };
  }

  private completedRuntimeActivityOutputText(messages: any[], lastUpdated?: unknown) {
    const lastUpdatedMs = typeof lastUpdated === 'string' ? Date.parse(lastUpdated) : Number.NaN;
    if (Number.isFinite(lastUpdatedMs) && Date.now() - lastUpdatedMs < 1000) {
      return null;
    }
    const lastMessage = [...messages]
      .reverse()
      .find((message) => message?.role === 'assistant' || message?.role === 'tool');
    if (!lastMessage || lastMessage.role !== 'assistant') return null;
    if (Array.isArray(lastMessage.tool_calls) && lastMessage.tool_calls.length) return null;
    const finishReason = String(lastMessage.finish_reason || '').toLowerCase();
    if (finishReason && finishReason !== 'stop' && finishReason !== 'end_turn') return null;
    return this.extractHermesMessageText(lastMessage) || null;
  }

  private parsePiJsonlRuntimeActivity(raw: string, session: AgentRuntimeSession): {
    actions: AgentRuntimeAction[];
    messages: AgentRuntimeMessage[];
    completedOutputText?: string | null;
  } | null {
    const events = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    if (!events.length || !events.every((event: any) => typeof event?.type === 'string')) {
      return null;
    }

    const messageEvents = events.filter((event: any) => event?.type === 'message' && event?.message?.role);
    if (!messageEvents.length) return { actions: [], messages: [], completedOutputText: null };
    const turnStartIndex = Math.max(
      0,
      messageEvents.map((event: any) => event?.message?.role).lastIndexOf('user') + 1,
    );
    const timelineMessages: AgentRuntimeMessage[] = [];
    let completedOutputText: string | null = null;

    for (let index = turnStartIndex; index < messageEvents.length; index += 1) {
      const event = messageEvents[index];
      const message = event.message;
      if (message.role !== 'assistant') continue;
      const text = this.extractPiAssistantText(message.content);
      if (!text) continue;
      const createdAt = this.piEventCreatedAt(event);
      timelineMessages.push({
        id: `pi-${session.runtimeId}-assistant-${index}`,
        role: 'assistant',
        content: text,
        createdAt,
        status: session.status === 'TYPING' ? 'TYPING' : 'IDLE',
      });
      const hasToolCall = Array.isArray(message.content) && message.content.some((part: any) => part?.type === 'toolCall');
      const stopReason = String(message.stopReason || '').toLowerCase();
      if (!hasToolCall && (!stopReason || ['stop', 'end_turn'].includes(stopReason))) {
        completedOutputText = text;
      }
    }

    const currentTimelineMessages = timelineMessages
      .filter((message) => !this.runtimeTimelineMessageSeenBeforeLatestUser(session, message))
      .slice(-20);
    const staleCompletedOutput =
      completedOutputText && this.assistantContentSeenBeforeLatestUser(session, completedOutputText);

    return {
      actions: [],
      messages: currentTimelineMessages,
      completedOutputText: staleCompletedOutput ? null : completedOutputText,
    };
  }

  private extractPiAssistantText(content: any) {
    if (typeof content === 'string') return content.trim();
    if (!Array.isArray(content)) return '';
    return content
      .map((part: any) => {
        if (typeof part === 'string') return part;
        if (part?.type && part.type !== 'text') return '';
        if (typeof part?.text === 'string') return part.text;
        if (typeof part?.content === 'string') return part.content;
        return '';
      })
      .filter(Boolean)
      .join('\n')
      .trim();
  }

  private piEventCreatedAt(event: any) {
    if (typeof event?.timestamp === 'string' && event.timestamp) return event.timestamp;
    if (typeof event?.message?.timestamp === 'number') {
      return new Date(event.message.timestamp).toISOString();
    }
    return new Date().toISOString();
  }

  private recoverCompletedSessionFromActivity(session: AgentRuntimeSession, outputText?: string | null) {
    const staleRecoveryMessage = 'Previous background message stalled and was reset.';
    const isStaleRecoveryError =
      session.status === 'ERROR' &&
      session.lastError === staleRecoveryMessage;
    if ((session.status !== 'TYPING' && !isStaleRecoveryError) || !outputText?.trim()) {
      return session;
    }
    this.clearActiveMessage(session.runtimeId, session.activeRequestId);
    const withoutStaleRecoveryMessage = (messages?: AgentRuntimeMessage[]) =>
      (messages || []).filter(
        (message) =>
          !(
            message.role === 'system' &&
            message.status === 'ERROR' &&
            message.content === staleRecoveryMessage
          ),
      );
    return {
      ...session,
      status: 'IDLE',
      activeRequestId: null,
      lastError: null,
      lastResponseAt: session.lastResponseAt || new Date().toISOString(),
      currentActivity: 'Idle',
      messageHistory: isStaleRecoveryError
        ? withoutStaleRecoveryMessage(session.messageHistory)
        : session.messageHistory,
      conversations: isStaleRecoveryError
        ? (session.conversations || []).map((conversation) => ({
            ...conversation,
            messageHistory: withoutStaleRecoveryMessage(conversation.messageHistory),
          }))
        : session.conversations,
    };
  }

  private mergeRuntimeActivityMessages(session: AgentRuntimeSession, timelineMessages: AgentRuntimeMessage[]) {
    const currentTimelineMessages = this.compactRuntimeTimelineMessages(session, timelineMessages);
    const incomingIds = new Set(currentTimelineMessages.map((message) => message.id).filter(Boolean));
    const history = (session.messageHistory || []).filter(
      (message) =>
        message.role !== 'tool' &&
        message.status !== 'RUNTIME_ACTIVITY' &&
        !(message.id && incomingIds.has(message.id)),
    );
    const latestUserIndex = this.latestNonSteeringUserIndex(history);
    if (latestUserIndex < 0) {
      return [...history, ...currentTimelineMessages].slice(-80);
    }

    const prefix = history.slice(0, latestUserIndex + 1);
    const suffixSystemMessages = history
      .slice(latestUserIndex + 1)
      .filter((message) => message.role === 'system');
    return [...prefix, ...currentTimelineMessages, ...suffixSystemMessages].slice(-80);
  }

  private compactRuntimeTimelineMessages(
    session: AgentRuntimeSession,
    timelineMessages: AgentRuntimeMessage[],
  ) {
    const byIdentity = new Map<string, AgentRuntimeMessage>();
    for (const message of timelineMessages) {
      if (this.runtimeTimelineMessageSeenBeforeLatestUser(session, message)) continue;
      if (this.runtimeTimelineMessageCoveredByFinalAssistant(session, message)) continue;
      const identity = message.id || `${message.role}:${message.status || ''}:${message.content || ''}`;
      byIdentity.set(identity, message);
    }
    return [...byIdentity.values()];
  }

  private runtimeTimelineMessageSeenBeforeLatestUser(
    session: AgentRuntimeSession,
    message: AgentRuntimeMessage,
  ) {
    const history = session.messageHistory || [];
    const latestUserIndex = this.latestNonSteeringUserIndex(history);
    if (latestUserIndex < 0) return false;
    const priorMessages = history.slice(0, latestUserIndex);
    if (message.id && priorMessages.some((entry) => entry.id === message.id)) {
      return true;
    }
    if (message.role === 'assistant' && message.content?.trim()) {
      return this.assistantContentSeenBeforeLatestUser(session, message.content);
    }
    if (message.role === 'tool' && message.status === 'RUNTIME_ACTIVITY') {
      return priorMessages.some(
        (entry) =>
          entry.role === 'tool' &&
          entry.status === 'RUNTIME_ACTIVITY' &&
          (entry.id === message.id || entry.content === message.content),
      );
    }
    return false;
  }

  private runtimeTimelineMessageCoveredByFinalAssistant(
    session: AgentRuntimeSession,
    message: AgentRuntimeMessage,
  ) {
    if (message.role !== 'assistant' || !message.content?.trim()) return false;
    return (session.messageHistory || []).some((entry) => {
      if (entry.id === message.id) return false;
      if (entry.role !== 'assistant') return false;
      if (entry.status === 'TYPING') return false;
      return this.assistantContentCovers(entry.content, message.content);
    });
  }

  private assistantContentSeenBeforeLatestUser(session: AgentRuntimeSession, content: string) {
    const normalizedContent = content.trim();
    if (!normalizedContent) return false;
    const history = session.messageHistory || [];
    const latestUserIndex = this.latestNonSteeringUserIndex(history);
    if (latestUserIndex < 0) return false;
    return history
      .slice(0, latestUserIndex)
      .some((entry) => entry.role === 'assistant' && this.assistantContentCovers(entry.content, normalizedContent));
  }

  private latestNonSteeringUserIndex(history: AgentRuntimeMessage[]) {
    for (let index = history.length - 1; index >= 0; index -= 1) {
      const message = history[index];
      if (message.role === 'user' && String(message.status || '').toUpperCase() !== 'STEERING') {
        return index;
      }
    }
    return -1;
  }

  private assistantContentCovers(existing: unknown, candidate: unknown) {
    const existingContent = typeof existing === 'string' ? existing.trim() : '';
    const candidateContent = typeof candidate === 'string' ? candidate.trim() : '';
    if (!existingContent || !candidateContent) return false;
    if (existingContent === candidateContent) return true;
    if (existingContent.startsWith(`${candidateContent}\n`)) return true;
    if (existingContent.endsWith(`\n${candidateContent}`)) return true;
    return existingContent.includes(`\n\n${candidateContent}`);
  }

  private activityGroupSummary(actions: AgentRuntimeAction[]) {
    const names = actions
      .filter((action) => action.kind !== 'message')
      .map((action) => action.name)
      .filter(Boolean);
    const uniqueNames = [...new Set(names)];
    return uniqueNames.length ? `Activity: ${uniqueNames.slice(0, 5).join(', ')}` : 'Activity';
  }

  private extractHermesMessageText(message: any) {
    const content = message?.content;
    if (typeof content === 'string') return content.trim();
    if (!Array.isArray(content)) return '';
    return content
      .map((part: any) => {
        if (typeof part === 'string') return part;
        if (typeof part?.text === 'string') return part.text;
        if (typeof part?.content === 'string') return part.content;
        return '';
      })
      .join('\n')
      .trim();
  }

  private async readResponsesStream(response: Response, onTextDelta?: AgentRuntimeSendMessageOptions['onTextDelta']) {
    if (!response.body) {
      const payload = await response.json();
      if (onTextDelta) await onTextDelta(this.extractOutputText(payload));
      return payload;
    }

    const decoder = new TextDecoder();
    const reader = response.body.getReader();
    let buffer = '';
    let eventName = '';
    let dataLines: string[] = [];
    let outputText = '';
    let completedPayload: any = null;

    const dispatchEvent = async () => {
      if (!dataLines.length) return;
      const rawData = dataLines.join('\n');
      const currentEvent = eventName;
      eventName = '';
      dataLines = [];
      if (!rawData || rawData === '[DONE]') return;
      let payload: any;
      try {
        payload = JSON.parse(rawData);
      } catch {
        return;
      }
      const type = payload?.type || currentEvent;
      if (type === 'response.output_text.delta' && typeof payload.delta === 'string') {
        outputText += payload.delta;
        if (onTextDelta) await onTextDelta(outputText);
        return;
      }
      if (type === 'response.completed' || type === 'response.failed' || type === 'response.incomplete') {
        completedPayload = payload.response || payload;
      }
    };

    const consumeLine = async (line: string) => {
      if (!line) {
        await dispatchEvent();
        return;
      }
      if (line.startsWith(':')) return;
      if (line.startsWith('event:')) {
        eventName = line.slice('event:'.length).trim();
        return;
      }
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
      for (const line of lines) {
        await consumeLine(line);
      }
    }
    buffer += decoder.decode();
    if (buffer) await consumeLine(buffer);
    await dispatchEvent();

    if (completedPayload) {
      if (!this.extractOutputText(completedPayload) && outputText) {
        return {
          ...completedPayload,
          output: [
            ...(Array.isArray(completedPayload.output) ? completedPayload.output : []),
            {
              type: 'message',
              role: 'assistant',
              content: [{ type: 'output_text', text: outputText }],
            },
          ],
        };
      }
      return completedPayload;
    }

    return {
      id: `stream_${Date.now()}`,
      object: 'response',
      status: 'completed',
      output: [
        {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: outputText }],
        },
      ],
    };
  }

  private buildRuntimeInput(session: AgentRuntimeSession, message: string) {
    const trimmedMessage = message.trim();
    const needsHistory =
      trimmedMessage.length <= 80 ||
      /^(yes|y|no|n|continue|go ahead|approved?|ok|retry)\b/i.test(trimmedMessage);

    if (!needsHistory) {
      return message;
    }

    const transcript = (session.messageHistory || [])
      .filter((entry) =>
        (entry.role === 'user' || entry.role === 'assistant') &&
        !(entry.role === 'user' && String(entry.status || '').toUpperCase() === 'STEERING'),
      )
      .slice(-4)
      .map((entry) => `${entry.role.toUpperCase()}: ${entry.content.slice(0, 1200)}`)
      .join('\n\n');

    if (!transcript) {
      return message;
    }

    return [
      '[Recent conversation from the app state]',
      transcript,
      '',
      '[Instruction]',
      'Treat the most recent USER message above as the current request. Preserve only the minimal context needed from the recent conversation.',
    ].join('\n');
  }

  async loadSkillPrompt(
    skillBundleRefs: string[],
    role?: string | null,
    projectSkillOverrides: AgentRuntimeProjectSkillOverride[] = [],
    options: { progressive?: boolean; mountRoot?: string } = {},
  ) {
    const parts: string[] = [];
    const overridesByRef = this.projectSkillOverridesByRef(projectSkillOverrides);
    for (const ref of skillBundleRefs || []) {
      const name = this.skillNameFromRef(ref);
      if (!name) continue;
      try {
        const override = overridesByRef.get(ref);
        const content = override
          ? this.projectSkillFileContent(override, 'SKILL.md') || ''
          : await this.loadSkillMarkdown(ref, role || undefined);
        if (options.progressive) {
          parts.push(this.progressiveSkillPrompt(ref, name, content, override, role || undefined, options.mountRoot));
          continue;
        }
        parts.push(
          [
            `[SYSTEM: The "${name}" skill is active for this agent runtime. Follow its instructions within your role authorization boundary.]`,
            content.trim(),
          ].join('\n\n'),
        );
      } catch {
        parts.push(`[SYSTEM: Requested skill "${name}" was not found in the mounted skill bundle.]`);
      }
    }
    return parts.join('\n\n');
  }

  private progressiveSkillPrompt(
    ref: string,
    name: string,
    content: string,
    override?: AgentRuntimeProjectSkillOverride,
    role?: string,
    mountRoot?: string,
  ) {
    const metadata = this.skillMarkdownMetadata(content);
    const normalizedMountRoot = (mountRoot || '/opt/data/skills').replace(/\/+$/, '');
    const mountedDir = `${normalizedMountRoot}/${name}`;
    const scriptPaths = this.skillScriptPaths(ref, name, override, role, normalizedMountRoot);
    return [
      `[SYSTEM: The "${name}" skill is available for this agent runtime. Use progressive disclosure.]`,
      `Ref: ${ref}.`,
      `Mounted entrypoint: ${mountedDir}/SKILL.md.`,
      metadata.description ? `Description: ${metadata.description}` : '',
      scriptPaths.length ? `Mounted helper scripts: ${scriptPaths.join(', ')}.` : '',
      `Read ${mountedDir}/SKILL.md only when this turn needs that skill's detailed workflow. Resolve relative files and scripts from ${mountedDir}.`,
    ].filter(Boolean).join('\n');
  }

  private shouldUseProgressiveSkillPrompt(session: AgentRuntimeSession) {
    const agentType = this.normalizeAgentType(session.agentType);
    if (agentType === 'pi') return true;
    return session.provider === 'local-codex' || session.provider === 'local-runner' || session.provider === 'local-docker';
  }

  private skillMarkdownMetadata(content: string) {
    const markdown = String(content || '');
    const metadata: { name?: string; description?: string } = {};
    const match = markdown.match(/^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/);
    if (!match) return metadata;
    for (const line of match[1].split(/\r?\n/)) {
      const field = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
      if (!field) continue;
      const key = field[1];
      const value = field[2].trim().replace(/^['"]|['"]$/g, '');
      if (key === 'name') metadata.name = value;
      if (key === 'description') metadata.description = value;
    }
    return metadata;
  }

  private skillScriptPaths(
    ref: string,
    name: string,
    override?: AgentRuntimeProjectSkillOverride,
    role?: string,
    mountRoot = '/opt/data/skills',
  ) {
    const relativePaths = new Set<string>();
    for (const file of override?.files || []) {
      const safePath = this.safeSkillFilePath(file.path);
      if (safePath.startsWith('scripts/')) relativePaths.add(safePath);
    }
    const source = this.skillPathForRef(ref, role);
    const scriptsDir = resolve(source, 'scripts');
    if (existsSync(scriptsDir)) {
      const stack = [{ absolute: scriptsDir, relative: 'scripts' }];
      while (stack.length) {
        const current = stack.pop()!;
        let entries: any[] = [];
        try {
          entries = readdirSync(current.absolute, { withFileTypes: true });
        } catch {
          entries = [];
        }
        for (const entry of entries) {
          const absolute = resolve(current.absolute, entry.name);
          const relative = `${current.relative}/${entry.name}`.replace(/\\/g, '/');
          if (entry.isDirectory()) {
            stack.push({ absolute, relative });
          } else if (entry.isFile()) {
            relativePaths.add(relative);
          }
        }
      }
    }
    const normalizedMountRoot = mountRoot.replace(/\/+$/, '');
    return [...relativePaths].sort().map((filePath) => `${normalizedMountRoot}/${name}/${filePath}`);
  }

  async loadSkillMarkdown(ref: string, role?: string | null) {
    const skillPath = this.skillPathForRef(ref, role || undefined);
    return readFile(resolve(skillPath, 'SKILL.md'), 'utf8');
  }

  private async materializeSkillBundle(
    dataDir: string,
    role: string,
    skillBundleRefs: string[],
    projectSkillOverrides: AgentRuntimeProjectSkillOverride[] = [],
  ) {
    const copied: string[] = [];
    await mkdir(resolve(dataDir, 'skills'), { recursive: true });
    const overridesByRef = this.projectSkillOverridesByRef(projectSkillOverrides);
    for (const ref of skillBundleRefs || []) {
      const name = this.skillNameFromRef(ref);
      if (!name) continue;
      const source = this.skillPathForRef(ref, role);
      const target = resolve(dataDir, 'skills', name);
      const hasSource = existsSync(source);
      if (hasSource) {
        await cp(source, target, { recursive: true, force: true });
      }
      const override = overridesByRef.get(ref);
      if (override) {
        await this.writeProjectSkillOverrideFiles(target, override);
      }
      if (hasSource || override) copied.push(name);
    }
    return copied;
  }

  private async createLocalRunnerJob(
    config: AgentRuntimeLaunchConfig,
    image: string,
    containerName: string,
    apiKey: string,
    options: { piDirectModelApi?: boolean } = {},
  ): Promise<AgentRuntimeLocalRunnerJob> {
    const agentType = this.normalizeAgentType(config.agentType);
    const capabilityBundleRefs = config.capabilityBundleRefs || [];
    const capabilityBundles = config.capabilityBundles || [];
    const runtimeFeatureSupport = config.runtimeFeatureSupport || this.runtimeFeatureSupport(agentType);
    const runtimeCapabilityWarnings = config.runtimeCapabilityWarnings || [];
    const repoWorkspaceDir = config.repoWorkspaceDir || '/opt/data/workspace';
    const workspaceBaseUrl = this.localRunnerWorkspaceBaseUrl(config.workspaceBaseUrl);
    const files: AgentRuntimeLocalRunnerFile[] = [
      {
        path: 'AGENT_WORKSPACE_CONTEXT.json',
        content: JSON.stringify(
          {
            projectId: config.projectId,
            projectGithubUrl: config.projectGithubUrl ?? null,
            projectGlobals: (config.projectGlobals || []).map((global) => ({
              key: global.key,
              label: global.label ?? null,
              description: global.description ?? null,
              isSecret: Boolean(global.isSecret),
              scope: global.scope === 'goal' && global.goalId ? 'goal' : 'project',
              goalId: global.scope === 'goal' && global.goalId ? global.goalId : null,
              configured: Boolean(global.value),
              ...(global.isSecret ? {} : { value: global.value ?? null }),
            })),
            memberId: config.memberId,
            userId: config.userId,
            role: config.role,
            agentDisplayName: config.agentDisplayName || null,
            agentType,
            runtimeId: config.runtimeId,
            grantId: config.grantId,
            scopes: config.scopes,
            skillBundleRefs: config.skillBundleRefs,
            projectSkillOverrides: config.projectSkillOverrides || [],
            capabilityBundleRefs,
            capabilityBundles,
            runtimeFeatureSupport,
            runtimeCapabilityWarnings,
            rolePrompt: config.rolePrompt || null,
            deploymentDays: config.deploymentDays ?? 1,
            dailyCostAmount: config.dailyCostAmount ?? 10,
            budgetCurrency: config.budgetCurrency || 'AIC',
            enableSudo: Boolean(config.enableSudo),
            llm: this.sanitizeLlmConfig(config.llm),
            repoWorkspaceDir,
            workspaceBaseUrl,
            projectApiBaseUrl: this.projectApiBaseUrl(config.projectApiBaseUrl),
          },
          null,
          2,
        ),
      },
      {
        path: 'AGENT_WORKSPACE_RUNTIME.env',
        content: this.workspaceRuntimeEnvContents(
          workspaceBaseUrl,
          this.projectApiBaseUrl(config.projectApiBaseUrl),
          config.workspaceToken,
          config.projectGithubUrl ?? null,
          repoWorkspaceDir,
          config.projectGlobals || [],
          capabilityBundleRefs,
          {
            projectId: config.projectId,
            memberId: config.memberId,
            runtimeId: config.runtimeId,
            agentDisplayName: config.agentDisplayName,
          },
        ),
      },
    ];
    if (config.llm) {
      files.push({
        path: 'config.yaml',
        content: this.hermesConfigContents(config.llm),
      });
      if (agentType === 'pi') {
        files.push({
          path: '.pi/agent/models.json',
          content: this.piModelsConfigContents(config.llm, { directModelApi: Boolean(options.piDirectModelApi) }),
        });
        files.push({
          path: '.pi/agent/settings.json',
          content: this.piSettingsConfigContents(),
        });
      }
    }

    files.push(...await this.skillBundleFiles(config.role, config.skillBundleRefs, config.projectSkillOverrides));

    return {
      projectId: config.projectId,
      memberId: config.memberId,
      userId: config.userId,
      role: config.role,
      agentDisplayName: config.agentDisplayName || null,
      agentType,
      runtimeId: config.runtimeId,
      grantId: config.grantId,
      image,
      containerName,
      apiKey,
      workspaceToken: config.workspaceToken,
      workspaceBaseUrl,
      projectApiBaseUrl: this.projectApiBaseUrl(config.projectApiBaseUrl),
      repoWorkspaceDir,
      projectGithubUrl: config.projectGithubUrl ?? null,
      projectGlobals: config.projectGlobals || [],
      scopes: config.scopes,
      skillBundleRefs: config.skillBundleRefs,
      projectSkillOverrides: config.projectSkillOverrides || [],
      capabilityBundleRefs,
      capabilityBundles,
      runtimeFeatureSupport,
      runtimeCapabilityWarnings,
      rolePrompt: config.rolePrompt || null,
      deploymentDays: config.deploymentDays ?? 1,
      dailyCostAmount: config.dailyCostAmount ?? 10,
      budgetCurrency: config.budgetCurrency || 'AIC',
      enableSudo: Boolean(config.enableSudo),
      llm: config.llm,
      files,
      env: {
        API_SERVER_ENABLED: 'true',
        API_SERVER_HOST: '0.0.0.0',
        API_SERVER_PORT: '8642',
        API_SERVER_KEY: apiKey,
        API_SERVER_CORS_ORIGINS: '*',
        AGENTCRAFT_AGENT_TYPE: agentType,
        ...this.agentTypeEnvironmentObject(agentType),
        AGENT_WORKSPACE_PROJECT_ID: config.projectId,
        AGENT_WORKSPACE_MEMBER_ID: config.memberId,
        AGENT_WORKSPACE_RUNTIME_ID: config.runtimeId,
        AGENT_WORKSPACE_ROLE: config.role,
        ...(config.agentDisplayName ? { AGENT_WORKSPACE_AGENT_NAME: config.agentDisplayName } : {}),
        AGENT_WORKSPACE_CAPABILITY_BUNDLE_REFS: capabilityBundleRefs.join(','),
        AGENT_RUNTIME_WORKSPACE_DIR: repoWorkspaceDir,
        AGENT_WORKSPACE_BASE_URL: workspaceBaseUrl,
        AGENT_WORKSPACE_TOKEN: config.workspaceToken,
        AIFACTORY_API_BASE_URL: this.projectApiBaseUrl(config.projectApiBaseUrl),
        AIFACTORY_RUNTIME_TOKEN: config.workspaceToken,
        ENABLE_AGENT_SUDO: config.enableSudo ? 'true' : 'false',
        ...(config.projectGithubUrl ? { AGENT_WORKSPACE_GITHUB_URL: config.projectGithubUrl } : {}),
        ...this.llmEnvironmentObject(config.llm),
      },
      command: this.runtimeCommandArgs(agentType),
    };
  }

  private async skillBundleFiles(
    role: string,
    skillBundleRefs: string[],
    projectSkillOverrides: AgentRuntimeProjectSkillOverride[] = [],
  ) {
    const filesByPath = new Map<string, AgentRuntimeLocalRunnerFile>();
    const overridesByRef = this.projectSkillOverridesByRef(projectSkillOverrides);
    for (const ref of skillBundleRefs || []) {
      const name = this.skillNameFromRef(ref);
      if (!name) continue;
      const source = this.skillPathForRef(ref, role);
      if (existsSync(source)) {
        for (const file of await this.directoryFiles(source, `skills/${name}`)) {
          filesByPath.set(file.path, file);
        }
      }
      const override = overridesByRef.get(ref);
      if (override) {
        for (const file of override.files || []) {
          const safePath = this.safeSkillFilePath(file.path);
          filesByPath.set(`skills/${name}/${safePath}`, { ...file, path: `skills/${name}/${safePath}` });
        }
      }
    }
    return [...filesByPath.values()];
  }

  private projectSkillOverridesByRef(projectSkillOverrides: AgentRuntimeProjectSkillOverride[] = []) {
    return new Map(
      projectSkillOverrides
        .filter((override) => override?.ref && Array.isArray(override.files))
        .map((override) => [override.ref, override]),
    );
  }

  private projectSkillFileContent(override: AgentRuntimeProjectSkillOverride, filePath: string) {
    const normalized = this.safeSkillFilePath(filePath);
    const file = (override.files || []).find((candidate) => this.safeSkillFilePath(candidate.path) === normalized);
    return typeof file?.content === 'string' ? file.content : null;
  }

  private safeSkillFilePath(filePath: string) {
    const normalized = posixPath
      .normalize(String(filePath || '').replace(/\\/g, '/'))
      .replace(/^(\.\.\/)+/, '')
      .replace(/^\/+/, '');
    if (!normalized || normalized === '.' || normalized.startsWith('../')) return 'SKILL.md';
    return normalized;
  }

  private async writeProjectSkillOverrideFiles(targetDir: string, override: AgentRuntimeProjectSkillOverride) {
    await mkdir(targetDir, { recursive: true });
    for (const file of override.files || []) {
      const targetPath = resolve(targetDir, this.safeSkillFilePath(file.path));
      await mkdir(dirname(targetPath), { recursive: true });
      await writeFile(targetPath, file.content || '');
    }
  }

  private async directoryFiles(sourceDir: string, targetPrefix: string) {
    const files: AgentRuntimeLocalRunnerFile[] = [];
    const walk = async (dir: string, prefix: string): Promise<void> => {
      const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        const source = resolve(dir, entry.name);
        const target = `${prefix}/${entry.name}`.replace(/\\/g, '/');
        if (entry.isDirectory()) {
          await walk(source, target);
          continue;
        }
        if (!entry.isFile()) continue;
        files.push({ path: target, content: await readFile(source, 'utf8') });
      }
    };
    await walk(sourceDir, targetPrefix);
    return files;
  }

  async syncWorkspaceContext(session: AgentRuntimeSession, context: AgentWorkspaceContextSync) {
    await mkdir(session.dataDir, { recursive: true });
    const contextPath = resolve(session.dataDir, 'AGENT_WORKSPACE_CONTEXT.json');
    const envPath = resolve(session.dataDir, 'AGENT_WORKSPACE_RUNTIME.env');
    const baseUrl = this.localRunnerWorkspaceBaseUrl(context.workspaceBaseUrl);
    let existing: Record<string, any> = {};

    try {
      existing = JSON.parse(await readFile(contextPath, 'utf8'));
    } catch {
      existing = {};
    }

    await writeFile(contextPath, this.localRunnerRuntimeContextFile(session, context, existing).content);
    await writeFile(
      envPath,
      this.workspaceRuntimeEnvContents(
        baseUrl,
        this.projectApiBaseUrl(existing.projectApiBaseUrl),
        session.workspaceToken,
        session.projectGithubUrl ?? existing.projectGithubUrl ?? null,
        session.repoWorkspaceDir || existing.repoWorkspaceDir || '/opt/data/workspace',
        context.projectGlobals || [],
        session.capabilityBundleRefs || existing.capabilityBundleRefs || [],
        {
          projectId: context.projectId,
          memberId: context.memberId,
          runtimeId: session.runtimeId,
          agentDisplayName: session.agentDisplayName ?? context.agentDisplayName,
        },
      ),
    );

    if (this.useDockerCopyStrategy()) {
      await this.docker(['cp', contextPath, `${session.containerName}:/opt/data/AGENT_WORKSPACE_CONTEXT.json`]);
      await this.docker(['cp', envPath, `${session.containerName}:/opt/data/AGENT_WORKSPACE_RUNTIME.env`]);
    }
  }

  localRunnerRuntimeContextFile(
    session: AgentRuntimeSession,
    context: AgentWorkspaceContextSync,
    existing: Record<string, any> = {},
  ): AgentRuntimeLocalRunnerFile {
    const baseUrl = this.localRunnerWorkspaceBaseUrl(context.workspaceBaseUrl);
    const safeExisting = { ...(existing || {}) };
    delete safeExisting.workspaceToken;
    delete safeExisting.accessToken;
    delete safeExisting.token;
    return {
      path: 'AGENT_WORKSPACE_CONTEXT.json',
      content: JSON.stringify(
        {
          ...safeExisting,
          projectId: context.projectId,
          projectGithubUrl: session.projectGithubUrl ?? safeExisting.projectGithubUrl ?? null,
          projectGlobals: (context.projectGlobals || safeExisting.projectGlobals || []).map((global: any) => ({
            key: global.key,
            label: global.label ?? null,
            description: global.description ?? null,
            isSecret: Boolean(global.isSecret),
            scope: global.scope === 'goal' && global.goalId ? 'goal' : 'project',
            goalId: global.scope === 'goal' && global.goalId ? global.goalId : null,
            configured: Boolean(global.value),
            ...(global.isSecret ? {} : { value: global.value ?? null }),
          })),
          memberId: context.memberId,
          userId: context.userId,
          role: context.role,
          agentDisplayName: session.agentDisplayName ?? context.agentDisplayName ?? safeExisting.agentDisplayName ?? null,
          agentType: session.agentType ?? safeExisting.agentType ?? null,
          runtimeId: session.runtimeId,
          grantId: session.grantId,
          scopes: session.scopes,
          skillBundleRefs: session.skillBundleRefs,
          projectSkillOverrides: session.projectSkillOverrides || safeExisting.projectSkillOverrides || [],
          capabilityBundleRefs: session.capabilityBundleRefs || safeExisting.capabilityBundleRefs || [],
          capabilityBundles: session.capabilityBundles || safeExisting.capabilityBundles || [],
          runtimeFeatureSupport: session.runtimeFeatureSupport || safeExisting.runtimeFeatureSupport || this.runtimeFeatureSupport(session.agentType),
          runtimeCapabilityWarnings: session.runtimeCapabilityWarnings || safeExisting.runtimeCapabilityWarnings || [],
          rolePrompt: session.rolePrompt ?? safeExisting.rolePrompt ?? null,
          llm: session.llm || safeExisting.llm,
          repoWorkspaceDir: session.repoWorkspaceDir || safeExisting.repoWorkspaceDir || '/opt/data/workspace',
          workspaceBaseUrl: baseUrl,
          projectApiBaseUrl: this.projectApiBaseUrl(safeExisting.projectApiBaseUrl),
        },
        null,
        2,
      ),
    };
  }

  localRunnerRuntimeEnvFile(session: AgentRuntimeSession, context: AgentWorkspaceContextSync): AgentRuntimeLocalRunnerFile {
    return {
      path: 'AGENT_WORKSPACE_RUNTIME.env',
      content: this.workspaceRuntimeEnvContents(
        this.localRunnerWorkspaceBaseUrl(context.workspaceBaseUrl),
        this.projectApiBaseUrl(null),
        session.workspaceToken,
        session.projectGithubUrl ?? null,
        session.repoWorkspaceDir || '/opt/data/workspace',
        context.projectGlobals || [],
        session.capabilityBundleRefs || [],
        {
          projectId: context.projectId,
          memberId: context.memberId,
          runtimeId: session.runtimeId,
          agentDisplayName: session.agentDisplayName ?? context.agentDisplayName,
        },
      ),
    };
  }

  async localRunnerJobWithSkillBundle(
    job: AgentRuntimeLocalRunnerJob | undefined,
    role: string,
    skillBundleRefs: string[],
    projectSkillOverrides: AgentRuntimeProjectSkillOverride[] = [],
  ): Promise<AgentRuntimeLocalRunnerJob | undefined> {
    if (!job) return job;
    const nonSkillFiles = (job.files || []).filter((file) => !file.path.startsWith('skills/')).map((file) => {
      if (file.path !== 'AGENT_WORKSPACE_CONTEXT.json') return file;
      try {
        const parsed = JSON.parse(file.content || '{}');
        return {
          ...file,
          content: JSON.stringify({ ...parsed, skillBundleRefs, projectSkillOverrides }, null, 2),
        };
      } catch {
        return file;
      }
    });
    return {
      ...job,
      skillBundleRefs,
      projectSkillOverrides,
      files: [
        ...nonSkillFiles,
        ...await this.skillBundleFiles(role, skillBundleRefs, projectSkillOverrides),
      ],
    };
  }

  async applySkillBundleToRuntime(session: AgentRuntimeSession) {
    if (!session.dataDir) return;
    await this.materializeSkillBundle(
      session.dataDir,
      session.role,
      session.skillBundleRefs || [],
      session.projectSkillOverrides || [],
    );
    if (session.provider === 'local-docker' && session.containerName && this.useDockerCopyStrategy()) {
      await this.docker(['cp', resolve(session.dataDir, 'skills'), `${session.containerName}:/opt/data/skills`]);
    }
  }

  private sanitizeLlmConfig(llm?: AgentRuntimeLaunchConfig['llm']) {
    if (!llm) return null;
    return {
      configId: llm.configId,
      name: llm.name,
      apiType: llm.apiType,
      apiUrl: llm.apiUrl,
      modelName: llm.modelName,
    };
  }

  private hermesProvider(llm: AgentRuntimeLlmConfig) {
    return llm.apiType === 'claude' ? 'anthropic' : 'custom';
  }

  private hermesApiMode(llm: AgentRuntimeLlmConfig) {
    return llm.apiType === 'claude' ? 'anthropic_messages' : 'chat_completions';
  }

  private localDockerLlmConfig(llm?: AgentRuntimeLaunchConfig['llm']) {
    if (!llm) return llm;
    const apiUrl = this.rewriteLocalhostForDockerHost(llm.apiUrl);
    return apiUrl === llm.apiUrl ? llm : { ...llm, apiUrl };
  }

  private rewriteLocalhostForDockerHost(value: string) {
    try {
      const url = new URL(value);
      if (!this.isLoopbackHost(url.hostname)) return value;
      url.hostname = 'host.docker.internal';
      return url.toString().replace(/\/+$/, '');
    } catch {
      return value.replace(
        /^(https?:\/\/)(localhost|127(?:\.\d{1,3}){0,3})(?=[:/]|$)/i,
        '$1host.docker.internal',
      );
    }
  }

  private isLoopbackHost(hostname: string) {
    const host = hostname.toLowerCase().replace(/^\[(.*)]$/, '$1');
    return host === 'localhost' || host === '::1' || /^127(?:\.\d{1,3}){0,3}$/.test(host);
  }

  private normalizeLlmBaseUrl(llm: AgentRuntimeLlmConfig) {
    const trimmed = llm.apiUrl.trim().replace(/\/+$/, '');
    if (llm.apiType === 'claude') {
      return trimmed.replace(/\/v1$/, '');
    }
    return trimmed;
  }

  private hermesConfigContents(llm: AgentRuntimeLlmConfig) {
    const provider = this.hermesProvider(llm);
    const apiMode = this.hermesApiMode(llm);
    const baseUrl = this.normalizeLlmBaseUrl(llm);
    return [
      'model:',
      `  default: ${this.yamlString(llm.modelName)}`,
      `  provider: ${this.yamlString(provider)}`,
      `  base_url: ${this.yamlString(baseUrl)}`,
      `  api_key: ${this.yamlString(llm.apiKey)}`,
      `  api_mode: ${this.yamlString(apiMode)}`,
      '',
      'platform_toolsets:',
      '  api_server:',
      '    - web',
      '    - terminal',
      '    - file',
      '    - skills',
      '    - todo',
      '    - messaging',
      '',
      'skills:',
      '  creation_nudge_interval: 0',
      '',
      'approvals:',
      '  mode: "off"',
      '  cron_mode: "approve"',
      '',
    ].join('\n');
  }

  private async writeHermesConfig(dataDir: string, llm: AgentRuntimeLlmConfig) {
    await writeFile(resolve(dataDir, 'config.yaml'), this.hermesConfigContents(llm));
  }

  private async writePiModelsConfig(dataDir: string, llm: AgentRuntimeLlmConfig) {
    const piAgentDir = resolve(dataDir, '.pi', 'agent');
    await mkdir(piAgentDir, { recursive: true });
    await writeFile(resolve(piAgentDir, 'models.json'), this.piModelsConfigContents(llm));
  }

  private async writePiSettingsConfig(dataDir: string) {
    const piAgentDir = resolve(dataDir, '.pi', 'agent');
    await mkdir(piAgentDir, { recursive: true });
    await writeFile(resolve(piAgentDir, 'settings.json'), this.piSettingsConfigContents());
  }

  private piSettingsConfigContents() {
    return JSON.stringify(
      {
        retry: {
          enabled: false,
          maxRetries: 0,
          provider: {
            maxRetries: 0,
          },
        },
      },
      null,
      2,
    );
  }

  private piModelsConfigContents(llm: AgentRuntimeLlmConfig, options: { directModelApi?: boolean } = {}) {
    const isClaude = llm.apiType === 'claude';
    const baseUrl = isClaude || options.directModelApi
      ? this.normalizeLlmBaseUrl(llm)
      : 'http://127.0.0.1:8642/v1';
    return JSON.stringify(
      {
        providers: {
          agentcraft: {
            baseUrl,
            api: isClaude ? 'anthropic-messages' : 'openai-completions',
            apiKey: '$AGENTCRAFT_MODEL_API_KEY',
            ...(isClaude
              ? {}
              : {
                  compat: {
                    supportsDeveloperRole: false,
                    supportsReasoningEffort: false,
                    supportsUsageInStreaming: false,
                  },
                }),
            models: [
              {
                id: llm.modelName,
                name: llm.modelName,
                reasoning: false,
                input: ['text'],
              },
            ],
          },
        },
      },
      null,
      2,
    );
  }

  private llmEnvironment(llm?: AgentRuntimeLaunchConfig['llm']) {
    if (!llm) return [];
    const provider = this.hermesProvider(llm);
    const baseUrl = this.normalizeLlmBaseUrl(llm);
    const compatibilityEnv = this.llmCompatibilityEnvironment(llm, baseUrl);
    const env = [
      '-e',
      `HERMES_INFERENCE_PROVIDER=${provider}`,
      '-e',
      `API_SERVER_MODEL_NAME=${llm.modelName}`,
      '-e',
      `AGENTCRAFT_MODEL_API_KEY=${llm.apiKey}`,
      '-e',
      'AGENTCRAFT_PI_PROVIDER=agentcraft',
    ];
    if (llm.apiType === 'claude') {
      env.push('-e', `ANTHROPIC_API_KEY=${llm.apiKey}`, '-e', `ANTHROPIC_BASE_URL=${baseUrl}`);
    } else {
      env.push(
        '-e',
        `OPENAI_API_KEY=${llm.apiKey}`,
        '-e',
        `OPENAI_BASE_URL=${baseUrl}`,
        '-e',
        `OPENAI_API_BASE=${baseUrl}`,
        '-e',
        `AGENTCRAFT_UPSTREAM_OPENAI_BASE_URL=${baseUrl}`,
      );
    }
    for (const [key, value] of Object.entries(compatibilityEnv)) {
      env.push('-e', `${key}=${value}`);
    }
    return env;
  }

  private agentTypeEnvironment(agentType?: string | null) {
    return Object.entries(this.agentTypeEnvironmentObject(agentType)).flatMap(([key, value]) => ['-e', `${key}=${value}`]);
  }

  private agentTypeEnvironmentObject(agentType?: string | null): Record<string, string> {
    const cliTimeoutSeconds = this.cliTimeoutSeconds();
    switch (this.normalizeAgentType(agentType)) {
      case 'mini-swe-agent':
        return {
          MSWEA_CONFIGURED: 'true',
          MSWEA_COST_TRACKING: 'ignore_errors',
          AGENTCRAFT_CLI_TIMEOUT_SECONDS: cliTimeoutSeconds,
          AGENTCRAFT_INCLUDE_RESPONSE_INSTRUCTIONS: 'true',
          AGENTCRAFT_CLI_COMMAND_TEMPLATE:
            'mini -y --exit-immediately -m "${AGENTCRAFT_MINI_MODEL_NAME:-$API_SERVER_MODEL_NAME}" -t $AGENTCRAFT_TASK_QUOTED',
        };
      case 'pi':
        return {
          AGENTCRAFT_PI_BACKEND: this.piBackend(),
          AGENTCRAFT_CLI_TIMEOUT_SECONDS: cliTimeoutSeconds,
          AGENTCRAFT_INCLUDE_RESPONSE_INSTRUCTIONS: 'true',
          AGENTCRAFT_PI_PROVIDER: 'agentcraft',
          PI_CODING_AGENT_DIR: '/opt/data/.pi/agent',
          AGENTCRAFT_PI_SESSION_ROOT: '/opt/data/.pi/sessions',
          AGENTCRAFT_CLI_COMMAND_TEMPLATE:
            'pi --mode json --session-dir "$AGENTCRAFT_PI_SESSION_DIR" --session "$AGENTCRAFT_PI_SESSION_FILE" --provider "$AGENTCRAFT_PI_PROVIDER" --model "$API_SERVER_MODEL_NAME" ${AGENTCRAFT_PI_EXTRA_ARGS:-} $AGENTCRAFT_INSTRUCTIONS_ARG -p $AGENTCRAFT_TASK_QUOTED',
        };
      case 'claude-code':
        return {
          AGENTCRAFT_CLI_TIMEOUT_SECONDS: cliTimeoutSeconds,
          AGENTCRAFT_INCLUDE_RESPONSE_INSTRUCTIONS: 'true',
          AGENTCRAFT_CLI_COMMAND_TEMPLATE:
            'claude --bare -p --output-format text --no-session-persistence --tools "" --model "${AGENTCRAFT_CLAUDE_MODEL_NAME:-$API_SERVER_MODEL_NAME}" $AGENTCRAFT_TASK_QUOTED',
        };
      case 'codex':
        return {
          AGENTCRAFT_CLI_TIMEOUT_SECONDS: cliTimeoutSeconds,
          AGENTCRAFT_INCLUDE_RESPONSE_INSTRUCTIONS: 'true',
          AGENTCRAFT_CLI_COMMAND_TEMPLATE:
            'codex exec --skip-git-repo-check --ephemeral --ignore-user-config --ignore-rules --color never --sandbox read-only --model "$API_SERVER_MODEL_NAME" $AGENTCRAFT_TASK_QUOTED',
        };
      default:
        return {};
    }
  }

  private piBackend() {
    const configured = String(this.configService.get<string>('AGENTCRAFT_PI_BACKEND') || 'rpc').trim().toLowerCase();
    return configured === 'cli' ? 'cli' : 'rpc';
  }

  private cliTimeoutSeconds() {
    const configured =
      this.configService.get<string>('AGENTCRAFT_CLI_TIMEOUT_SECONDS') ||
      this.configService.get<string>('HERMES_AGENT_CLI_TIMEOUT_SECONDS');
    const value = Number(configured ?? 1800);
    if (!Number.isFinite(value) || value < 0) return '1800';
    return String(Math.floor(value));
  }

  private llmEnvironmentObject(llm?: AgentRuntimeLaunchConfig['llm']): Record<string, string> {
    if (!llm) return {};
    const provider = this.hermesProvider(llm);
    const baseUrl = this.normalizeLlmBaseUrl(llm);
    const compatibilityEnv = this.llmCompatibilityEnvironment(llm, baseUrl);
    const env: Record<string, string> = {
      HERMES_INFERENCE_PROVIDER: provider,
      API_SERVER_MODEL_NAME: llm.modelName,
      AGENTCRAFT_MODEL_API_KEY: llm.apiKey,
      AGENTCRAFT_PI_PROVIDER: 'agentcraft',
    };
    if (llm.apiType === 'claude') {
      env.ANTHROPIC_API_KEY = llm.apiKey;
      env.ANTHROPIC_BASE_URL = baseUrl;
    } else {
      env.OPENAI_API_KEY = llm.apiKey;
      env.OPENAI_BASE_URL = baseUrl;
      env.OPENAI_API_BASE = baseUrl;
      env.AGENTCRAFT_UPSTREAM_OPENAI_BASE_URL = baseUrl;
    }
    return { ...env, ...compatibilityEnv };
  }

  private llmCompatibilityEnvironment(
    llm: AgentRuntimeLlmConfig,
    baseUrl: string,
  ): Record<string, string> {
    if (llm.apiType === 'claude') return {};
    const host = this.safeHostname(baseUrl);
    const env: Record<string, string> = {};
    if (host.includes('token-plan-cn.xiaomimimo.com')) {
      env.XIAOMI_TOKEN_PLAN_CN_API_KEY = llm.apiKey;
      env.AGENTCRAFT_PI_EXTRA_ARGS = '--thinking off';
    } else if (host.includes('token-plan-ams.xiaomimimo.com')) {
      env.XIAOMI_TOKEN_PLAN_AMS_API_KEY = llm.apiKey;
      env.AGENTCRAFT_PI_EXTRA_ARGS = '--thinking off';
    } else if (host.includes('token-plan-sgp.xiaomimimo.com')) {
      env.XIAOMI_TOKEN_PLAN_SGP_API_KEY = llm.apiKey;
      env.AGENTCRAFT_PI_EXTRA_ARGS = '--thinking off';
    } else if (host.includes('xiaomimimo.com')) {
      env.XIAOMI_API_KEY = llm.apiKey;
    } else if (host.includes('deepseek.com')) {
      env.DEEPSEEK_API_KEY = llm.apiKey;
    } else if (host.includes('openrouter.ai')) {
      env.OPENROUTER_API_KEY = llm.apiKey;
    }
    if (!host.includes('api.openai.com') && !llm.modelName.includes('/')) {
      env.AGENTCRAFT_MINI_MODEL_NAME = `openai/${llm.modelName}`;
    }
    return env;
  }

  private safeHostname(value: string) {
    try {
      return new URL(value).hostname.toLowerCase();
    } catch {
      return value.toLowerCase();
    }
  }

  private yamlString(value: string) {
    return JSON.stringify(value ?? '');
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private workspaceRuntimeEnvContents(
    baseUrl: string,
    projectApiBaseUrl: string,
    token: string,
    projectGithubUrl?: string | null,
    repoWorkspaceDir?: string,
    projectGlobals: Array<{
      key: string;
      value?: string | null;
      isSecret?: boolean;
    }> = [],
    capabilityBundleRefs: string[] = [],
    identifiers: {
      projectId?: string | null;
      memberId?: string | null;
      runtimeId?: string | null;
      agentDisplayName?: string | null;
    } = {},
  ) {
    return [
      `export AGENT_WORKSPACE_BASE_URL=${JSON.stringify(baseUrl)}`,
      `export AGENT_WORKSPACE_TOKEN=${JSON.stringify(token)}`,
      ...this.runtimeIdentityEnvLines(identifiers),
      `export AIFACTORY_API_BASE_URL=${JSON.stringify(projectApiBaseUrl)}`,
      `export AIFACTORY_RUNTIME_TOKEN=${JSON.stringify(token)}`,
      `export AGENT_RUNTIME_WORKSPACE_DIR=${JSON.stringify(repoWorkspaceDir || '/opt/data/workspace')}`,
      `export AGENT_WORKSPACE_CAPABILITY_BUNDLE_REFS=${JSON.stringify(capabilityBundleRefs.join(','))}`,
      ...(projectGithubUrl ? [`export AGENT_WORKSPACE_GITHUB_URL=${JSON.stringify(projectGithubUrl)}`] : []),
      ...this.projectGlobalEnvLines(projectGlobals),
      '',
    ].join('\n');
  }

  private runtimeIdentityEnvLines(identifiers: {
    projectId?: string | null;
    memberId?: string | null;
    runtimeId?: string | null;
    agentDisplayName?: string | null;
  }) {
    const pairs: Array<[string, string | null | undefined]> = [
      ['AGENT_WORKSPACE_PROJECT_ID', identifiers.projectId],
      ['AGENT_WORKSPACE_MEMBER_ID', identifiers.memberId],
      ['AGENT_WORKSPACE_RUNTIME_ID', identifiers.runtimeId],
      ['AGENT_WORKSPACE_AGENT_NAME', identifiers.agentDisplayName],
      ['AIFACTORY_PROJECT_ID', identifiers.projectId],
      ['AIFACTORY_MEMBER_ID', identifiers.memberId],
      ['AIFACTORY_RUNTIME_ID', identifiers.runtimeId],
      ['AIFACTORY_AGENT_NAME', identifiers.agentDisplayName],
      ['PROJECT_ID', identifiers.projectId],
      ['MEMBER_ID', identifiers.memberId],
      ['RUNTIME_ID', identifiers.runtimeId],
      ['AGENT_NAME', identifiers.agentDisplayName],
    ];

    return pairs.flatMap(([key, value]) => (value ? [`export ${key}=${JSON.stringify(value)}`] : []));
  }

  private projectGlobalEnvLines(
    projectGlobals: Array<{
      key: string;
      value?: string | null;
      isSecret?: boolean;
    }>,
  ) {
    const lines: string[] = [];
    const seen = new Set<string>();

    for (const global of projectGlobals || []) {
      if (!global?.key || !global.value) continue;
      const aliases = [this.toProjectGlobalEnvKey(global.key), ...this.projectGlobalAliases(global.key)];
      for (const alias of aliases) {
        if (!alias || seen.has(alias)) continue;
        seen.add(alias);
        lines.push(`export ${alias}=${JSON.stringify(global.value)}`);
      }
    }

    return lines;
  }

  private toProjectGlobalEnvKey(key: string) {
    const normalized = key.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').toUpperCase();
    return `PROJECT_GLOBAL_${normalized}`;
  }

  private projectGlobalAliases(key: string) {
    const normalized = key.replace(/[^a-zA-Z0-9]+/g, '_').toLowerCase();
    if (normalized === 'github_token' || normalized === 'githubtoken' || normalized === 'gh_token') {
      return ['GITHUB_TOKEN', 'GH_TOKEN'];
    }
    if (normalized === 'hackerone_username' || normalized === 'h1_username') {
      return ['HACKERONE_USERNAME', 'H1_USERNAME'];
    }
    if (normalized === 'hackerone_api_token' || normalized === 'h1_api_token') {
      return ['HACKERONE_API_TOKEN', 'H1_API_TOKEN'];
    }
    return [];
  }

  private mergeStatus(current: string, dockerStatus: any, apiHealth: any) {
    if (current === 'ERROR') {
      return current;
    }
    if (!dockerStatus?.running) return 'STOPPED';
    if (current === 'TYPING' || current === 'WAITING_CONFIRMATION') {
      return current;
    }
    if (!apiHealth?.ok) return 'STARTING';
    return 'IDLE';
  }

  private async recoverCompletedSessionFromLogs(session: AgentRuntimeSession, dockerStatus: any) {
    if (session.status !== 'TYPING' || !dockerStatus?.running) {
      return session;
    }

    const doneLine =
      (await this.findDoneLineInLogs(session.containerName)) ||
      (await this.findGitAutomationDoneLine(session));
    if (!doneLine) {
      return session;
    }

    const lastAssistant = [...(session.messageHistory || [])]
      .reverse()
      .find((entry) => entry.role === 'assistant');
    if (lastAssistant?.content?.includes(doneLine)) {
      return {
        ...session,
        status: 'IDLE',
        currentActivity: 'Tool call completed',
        lastResponseAt: session.lastResponseAt || new Date().toISOString(),
      };
    }

    const history = [...(session.messageHistory || [])];
    history.push({
      id: randomUUID(),
      role: 'assistant',
      status: 'IDLE',
      content: doneLine,
      createdAt: new Date().toISOString(),
    });

    return {
      ...session,
      status: 'IDLE',
      lastError: null,
      lastResponseAt: new Date().toISOString(),
      currentActivity: 'Tool call completed',
      recentActions: [
        ...(session.recentActions || []).filter((action) => action.kind !== 'message'),
        {
          kind: 'message' as const,
          name: 'assistant',
          summary: doneLine.slice(0, 180),
          status: 'ok' as const,
        },
      ].slice(-6),
      messageHistory: history,
    };
  }

  private async findDoneLineInLogs(containerName: string) {
    try {
      const { stdout, stderr } = await this.docker(['logs', '--tail', '200', containerName]);
      const combined = `${stdout || ''}\n${stderr || ''}`;
      const lines = combined
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      for (let index = lines.length - 1; index >= 0; index -= 1) {
        const line = lines[index];
        const match = line.match(/DONE branch=[^\s]+ commit=[0-9a-f]{7,40} pr=\S+/i);
        if (match) {
          return match[0];
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  private async findGitAutomationDoneLine(session: AgentRuntimeSession) {
    const repoDir = session.repoWorkspaceDir || '/opt/data/workspace';
    const expectedBranch = this.expectedBranchFromSession(session);
    const repo = this.githubRepoFromUrl(session.projectGithubUrl);
    if (!expectedBranch || !repo) {
      return null;
    }

    try {
      const { stdout } = await this.docker([
        'exec',
        session.containerName,
        'bash',
        '-lc',
        `cd ${JSON.stringify(repoDir)} && printf 'BRANCH=%s\\nSHA=%s\\n' "$(git branch --show-current)" "$(git rev-parse HEAD)" && git ls-remote --heads origin ${JSON.stringify(expectedBranch)}`,
      ]);
      const branchMatch = stdout.match(/BRANCH=(.+)/);
      const shaMatch = stdout.match(/SHA=([0-9a-f]{40})/i);
      if (!branchMatch?.[1] || !shaMatch?.[1]) {
        return null;
      }

      const currentBranch = branchMatch[1].trim();
      const commitSha = shaMatch[1].trim();
      if (currentBranch !== expectedBranch || !stdout.includes(`refs/heads/${expectedBranch}`)) {
        return null;
      }

      const githubToken = await this.githubTokenFromRuntimeEnv(session);
      if (!githubToken) {
        return null;
      }

      const prUrl = await this.findPullRequestUrl(repo.owner, repo.repo, expectedBranch, githubToken);
      if (!prUrl) {
        return null;
      }

      return `DONE branch=${expectedBranch} commit=${commitSha} pr=${prUrl}`;
    } catch {
      return null;
    }
  }

  private expectedBranchFromSession(session: AgentRuntimeSession) {
    const lastUser = [...(session.messageHistory || [])]
      .reverse()
      .find((entry) => entry.role === 'user');
    const content = lastUser?.content || '';
    const namedBranch = content.match(/\bbranch named\s+([A-Za-z0-9._/-]+)/i);
    if (namedBranch?.[1]) return namedBranch[1].replace(/[.。,;:!?]+$/, '');
    const createBranch = content.match(/\bcreate branch\s+([A-Za-z0-9._/-]+)/i);
    if (createBranch?.[1]) return createBranch[1].replace(/[.。,;:!?]+$/, '');
    const doneBranch = content.match(/\bDONE branch=([A-Za-z0-9._/-]+)/i);
    if (doneBranch?.[1]) return doneBranch[1].replace(/[.。,;:!?]+$/, '');
    return null;
  }

  private githubRepoFromUrl(projectGithubUrl?: string | null) {
    const match = projectGithubUrl?.match(/github\.com\/([^/]+)\/([^/.]+)(?:\.git)?/i);
    if (!match) return null;
    return { owner: match[1], repo: match[2] };
  }

  private async githubTokenFromRuntimeEnv(session: AgentRuntimeSession) {
    try {
      const { stdout } = await this.docker([
        'exec',
        session.containerName,
        'bash',
        '-lc',
        'cat /opt/data/AGENT_WORKSPACE_RUNTIME.env',
      ]);
      const content = stdout || '';
      const match =
        content.match(/export GITHUB_TOKEN=(.+)/) ||
        content.match(/export PROJECT_GLOBAL_GITHUB_TOKEN=(.+)/);
      if (!match?.[1]) {
        return null;
      }
      return JSON.parse(match[1].trim());
    } catch {
      return null;
    }
  }

  private async findPullRequestUrl(owner: string, repo: string, branch: string, githubToken: string) {
    try {
      const response = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/pulls?head=${encodeURIComponent(`${owner}:${branch}`)}&state=all`,
        {
          headers: {
            authorization: `Bearer ${githubToken}`,
            accept: 'application/vnd.github+json',
            'user-agent': 'agentcraft-runtime-recovery',
          },
          signal: AbortSignal.timeout(10000),
        },
      );
      if (!response.ok) {
        return null;
      }
      const payload = (await response.json()) as Array<{ html_url?: string }>;
      return payload?.[0]?.html_url || null;
    } catch {
      return null;
    }
  }

  private async checkApiHealth(session: AgentRuntimeSession) {
    try {
      const response = await fetch(`${session.apiBaseUrl}/health`, {
        signal: AbortSignal.timeout(2000),
      });
      const authMismatch = response.ok
        ? await this.localDockerRuntimeApiKeyMismatch(session)
        : false;
      return {
        ok: response.ok && !authMismatch,
        statusCode: response.status,
        ...(authMismatch
          ? {
              authMismatch: true,
              error: 'Runtime API key mismatch',
            }
          : {}),
      };
    } catch (error: any) {
      return { ok: false, error: error?.message || 'health check failed' };
    }
  }

  private async localDockerRuntimeApiKeyMismatch(session: AgentRuntimeSession) {
    if (session.provider !== 'local-docker' || !session.containerName || !session.apiKey) {
      return false;
    }
    try {
      const { stdout } = await this.docker([
        'inspect',
        session.containerName,
        '--format',
        '{{json .Config.Env}}',
      ]);
      const env = JSON.parse(stdout.trim());
      if (!Array.isArray(env)) return false;
      const entry = env.find((item) => typeof item === 'string' && item.startsWith('API_SERVER_KEY='));
      const runtimeApiKey = typeof entry === 'string' ? entry.slice('API_SERVER_KEY='.length) : '';
      return Boolean(runtimeApiKey && runtimeApiKey !== session.apiKey);
    } catch {
      return false;
    }
  }

  private async inspectContainer(containerName: string) {
    try {
      const { stdout } = await this.docker([
        'inspect',
        containerName,
        '--format',
        '{{json .State}}',
      ]);
      const state = JSON.parse(stdout.trim());
      return {
        running: Boolean(state.Running),
        status: state.Status,
        startedAt: state.StartedAt,
        finishedAt: state.FinishedAt,
        exitCode: state.ExitCode,
        error: state.Error || null,
      };
    } catch (error: any) {
      return { running: false, status: 'missing', error: error?.message || 'container not found' };
    }
  }

  private extractOutputText(payload: any) {
    const output = Array.isArray(payload?.output) ? payload.output : [];
    const chunks: string[] = [];
    for (const item of output) {
      const content = Array.isArray(item?.content) ? item.content : [];
      for (const part of content) {
        if (typeof part?.text === 'string') chunks.push(part.text);
      }
    }
    return chunks.join('\n').trim();
  }

  private extractResponsesFailureMessage(payload: any, outputText = '') {
    const status = String(payload?.status || '').toLowerCase();
    const errorMessage = (
      payload?.error?.message ||
      payload?.last_error?.message ||
      payload?.incomplete_details?.reason ||
      ''
    ).toString().trim();
    if (payload?.error || status === 'failed' || status === 'error') {
      return errorMessage || outputText || 'Agent runtime response failed.';
    }
    if (status === 'incomplete') {
      return errorMessage || outputText || 'Agent runtime response was incomplete.';
    }
    return '';
  }

  private extractRecentActions(payload: any): AgentRuntimeAction[] {
    const output = this.currentResponseOutputItems(payload);
    const actions: AgentRuntimeAction[] = [];
    const callNames = new Map<string, string>();

    for (const item of output) {
      if (item?.type === 'function_call') {
        const name = String(item.name || item?.function?.name || 'tool');
        const callId = String(item.call_id || item.id || item.callId || '');
        if (callId) callNames.set(callId, name);
        actions.push({
          kind: 'tool',
          name,
          summary: this.summarizeToolCall(item),
          status: 'pending',
        });
        continue;
      }

      if (item?.type === 'function_call_output') {
        const callId = String(item.call_id || item.id || item.callId || '');
        actions.push({
          kind: 'tool_result',
          name: callNames.get(callId) || String(item.name || callId || 'tool-result'),
          summary: this.summarizeToolOutput(item.output),
          status: this.toolOutputStatus(item.output),
        });
        continue;
      }

      if (item?.type === 'message') {
        const content = Array.isArray(item.content) ? item.content : [];
        const text = content
          .map((part: any) => (typeof part?.text === 'string' ? part.text : ''))
          .join('\n')
          .trim();
        if (text) {
          actions.push({
            kind: 'message',
            name: String(item.role || 'assistant'),
            summary: text.slice(0, 180),
            status: 'ok',
          });
        }
      }
    }

    return this.compactRecentActions(actions).slice(-6);
  }

  private currentResponseOutputItems(payload: any) {
    const output = Array.isArray(payload?.output) ? payload.output : [];
    if (!output.length) return [];

    const selected: any[] = [];
    let seenTailMessage = false;

    for (let index = output.length - 1; index >= 0; index -= 1) {
      const item = output[index];
      if (item?.type === 'message') {
        if (!seenTailMessage) {
          seenTailMessage = true;
          selected.push(item);
          continue;
        }
        break;
      }
      selected.push(item);
    }

    return selected.reverse();
  }

  private summarizeToolCall(item: any) {
    const name = String(item?.function?.name || item?.name || 'tool');
    const args = item?.function?.arguments ?? item?.arguments ?? {};
    const rawArgs = typeof args === 'string' ? args : JSON.stringify(args || {});
    const compact = this.redactSensitiveText(rawArgs.replace(/\s+/g, ' ').trim());
    return compact ? `${name}: ${compact.slice(0, 180)}` : name;
  }

  private summarizeToolOutput(output: any) {
    const text = typeof output === 'string' ? output : JSON.stringify(output || {});
    const compact = this.redactSensitiveText(text.replace(/\s+/g, ' ').trim());
    return compact.slice(0, 180) || 'tool completed';
  }

  private redactSensitiveText(text: string) {
    return text
      .replace(/(authorization|api[_-]?key|token|secret|password|workspaceToken|accessToken)["']?\s*[:=]\s*["']?[^"',\s}]+/gi, '$1=[redacted]')
      .replace(/(token created\s*:\s*)(?:(?!\\n|\n|["'}]).)+/gi, '$1[redacted]')
      .replace(/\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\b/g, '[redacted-jwt]')
      .replace(/\b(sk|ak|pk)-[A-Za-z0-9_-]{16,}\b/g, '[redacted-key]');
  }

  private toolOutputStatus(output: any): 'ok' | 'error' {
    const text = typeof output === 'string' ? output : JSON.stringify(output || {});
    const exitCodeMatch = text.match(/"exit_code"\s*:\s*(\d+)/i);
    if (exitCodeMatch && Number(exitCodeMatch[1]) > 0) {
      return 'error';
    }

    const statusCodeMatch = text.match(/"statusCode"\s*:\s*(\d+)/i);
    if (statusCodeMatch && Number(statusCodeMatch[1]) >= 400) {
      return 'error';
    }

    return 'ok';
  }

  private compactRecentActions(actions: AgentRuntimeAction[]) {
    const compact: AgentRuntimeAction[] = [];

    for (const action of actions) {
      if (action.kind === 'tool_result' && /duplicate tool output/i.test(action.summary)) {
        continue;
      }

      if (action.kind === 'tool') {
        const family = this.actionFamily(action);
        const tailTool = compact[compact.length - 2];
        const tailResult = compact[compact.length - 1];
        if (
          tailTool &&
          tailResult &&
          tailTool.kind === 'tool' &&
          tailResult.kind === 'tool_result' &&
          this.actionFamily(tailTool) === family &&
          this.actionFamily(tailResult) === family
        ) {
          compact.splice(compact.length - 2, 2);
        }
      }

      const prev = compact[compact.length - 1];
      if (
        prev &&
        prev.kind === action.kind &&
        this.actionFamily(prev) === this.actionFamily(action)
      ) {
        compact[compact.length - 1] = action;
        continue;
      }

      compact.push(action);
    }

    return this.foldRepeatedPairs(this.completeResolvedToolActions(compact));
  }

  private completeResolvedToolActions(actions: AgentRuntimeAction[]) {
    const completed = actions.map((action) => ({ ...action }));
    const pendingToolIndexes: number[] = [];
    const pendingToolByName = new Map<string, number>();

    completed.forEach((action, index) => {
      if (action.kind === 'tool') {
        if (action.status === 'pending') {
          pendingToolIndexes.push(index);
          pendingToolByName.set(action.name, index);
        }
        return;
      }

      if (action.kind !== 'tool_result') return;
      const toolIndex = pendingToolByName.get(action.name) ?? pendingToolIndexes[pendingToolIndexes.length - 1];
      if (toolIndex === undefined) return;
      completed[toolIndex].status = action.status === 'error' ? 'error' : 'ok';
      pendingToolByName.delete(completed[toolIndex].name);
      const stackIndex = pendingToolIndexes.lastIndexOf(toolIndex);
      if (stackIndex >= 0) pendingToolIndexes.splice(stackIndex, 1);
    });

    return completed;
  }

  private actionFamily(action: AgentRuntimeAction) {
    if (action.kind === 'tool_result') {
      return action.name.replace(/^functions\./, '').replace(/:\d+$/, '');
    }
    return action.name;
  }

  private foldRepeatedPairs(actions: AgentRuntimeAction[]) {
    const folded: AgentRuntimeAction[] = [];

    for (let index = 0; index < actions.length; ) {
      const tool = actions[index];
      const result = actions[index + 1];

      if (
        tool?.kind === 'tool' &&
        result?.kind === 'tool_result' &&
        this.actionFamily(tool) === this.actionFamily(result)
      ) {
        const family = this.actionFamily(tool);
        let count = 1;
        let cursor = index + 2;

        while (cursor + 1 < actions.length) {
          const nextTool = actions[cursor];
          const nextResult = actions[cursor + 1];
          if (
            nextTool?.kind === 'tool' &&
            nextResult?.kind === 'tool_result' &&
            this.actionFamily(nextTool) === family &&
            this.sameActionShape(tool, nextTool) &&
            this.sameResultShape(result, nextResult)
          ) {
            count += 1;
            cursor += 2;
            continue;
          }
          break;
        }

        const completedTool: AgentRuntimeAction = {
          ...tool,
          status: result.status === 'error' ? 'error' : 'ok',
        };

        if (count > 1) {
          folded.push({
            ...completedTool,
            summary: `${completedTool.summary} (repeated ${count}x)`,
          });
          folded.push({
            ...result,
            summary: `${result.summary} after ${count} repeated runs`,
          });
          index = cursor;
          continue;
        }

        folded.push(completedTool);
        folded.push(result);
        index = cursor;
        continue;
      }

      folded.push(tool);
      index += 1;
    }

    return folded;
  }

  private sameActionShape(left: AgentRuntimeAction, right: AgentRuntimeAction) {
    return (
      this.actionFamily(left) === this.actionFamily(right) &&
      this.normalizeActionSummary(left.summary) === this.normalizeActionSummary(right.summary)
    );
  }

  private sameResultShape(left: AgentRuntimeAction, right: AgentRuntimeAction) {
    return (
      this.actionFamily(left) === this.actionFamily(right) &&
      this.normalizeActionSummary(left.summary) === this.normalizeActionSummary(right.summary) &&
      left.status === right.status
    );
  }

  private normalizeActionSummary(summary: string) {
    return summary.replace(/\(repeated \d+x\)$/i, '').replace(/ after \d+ repeated runs$/i, '').trim();
  }

  private async docker(args: string[]) {
    const command = this.dockerCommand();
    return execFileAsync(command.binary, [...command.prefixArgs, ...args], {
      timeout: Number(this.configService.get<string>('HERMES_AGENT_DOCKER_TIMEOUT_MS') || 120000),
      maxBuffer: 1024 * 1024 * 5,
    });
  }

  private normalizeWorkspaceRelativePath(filePath: string) {
    const normalized = filePath.replace(/\\/g, '/').trim();
    if (
      !normalized ||
      normalized.startsWith('/') ||
      /^[a-zA-Z]:\//.test(normalized) ||
      normalized.includes('\0')
    ) {
      throw new Error('Invalid workspace file path');
    }
    const parts = normalized.split('/').filter(Boolean);
    if (!parts.length || parts.some((part) => part === '.' || part === '..')) {
      throw new Error('Invalid workspace file path');
    }
    return parts.join('/');
  }

  private localWorkspaceRoot(session: AgentRuntimeSession) {
    const repoDir = (session.repoWorkspaceDir || '/opt/data/workspace').replace(/\\/g, '/');
    if (repoDir === '/opt/data' || repoDir.startsWith('/opt/data/')) {
      const suffix = repoDir.replace(/^\/opt\/data\/?/, '').replace(/\//g, '\\');
      return resolve(session.dataDir, suffix || '.');
    }
    return resolve(session.dataDir, 'workspace');
  }

  private async listLocalWorkspaceFiles(session: AgentRuntimeSession, maxDepth: number) {
    const root = this.localWorkspaceRoot(session);
    if (!existsSync(root)) {
      return [];
    }
    const files: AgentRuntimeWorkspaceFile[] = [];
    const walk = async (dir: string, depth: number, prefix = ''): Promise<void> => {
      if (depth < 0) return;
      const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        if (entry.name === '.git') continue;
        const fullPath = resolve(dir, entry.name);
        const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          await walk(fullPath, depth - 1, relativePath);
          continue;
        }
        if (!entry.isFile()) continue;
        const fileStat = await stat(fullPath).catch(() => null);
        files.push({
          path: relativePath.replace(/\\/g, '/'),
          name: entry.name,
          size: fileStat?.size || 0,
          modifiedAt: fileStat?.mtime ? fileStat.mtime.toISOString() : null,
        });
      }
    };
    await walk(root, maxDepth);
    return files.sort((left, right) => left.path.localeCompare(right.path));
  }

  private contentTypeForPath(filePath: string) {
    const ext = filePath.toLowerCase().split('.').pop();
    const byExt: Record<string, string> = {
      md: 'text/markdown; charset=utf-8',
      txt: 'text/plain; charset=utf-8',
      json: 'application/json; charset=utf-8',
      csv: 'text/csv; charset=utf-8',
      html: 'text/html; charset=utf-8',
      css: 'text/css; charset=utf-8',
      js: 'text/javascript; charset=utf-8',
      ts: 'text/plain; charset=utf-8',
      tsx: 'text/plain; charset=utf-8',
      jsx: 'text/plain; charset=utf-8',
      pdf: 'application/pdf',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      webp: 'image/webp',
      zip: 'application/zip',
    };
    return ext ? byExt[ext] || 'application/octet-stream' : 'application/octet-stream';
  }

  private dockerCommand() {
    const configured =
      this.configService.get<string>('HERMES_AGENT_DOCKER_COMMAND') ||
      this.configService.get<string>('DOCKER_BIN') ||
      'docker';
    const parts = configured.match(/"[^"]+"|'[^']+'|\S+/g)?.map((part) => part.replace(/^['"]|['"]$/g, '')) || [
      'docker',
    ];
    return { binary: parts[0], prefixArgs: parts.slice(1) };
  }

  private runtimeCommandArgs(agentType?: string | null) {
    const normalized = this.normalizeAgentType(agentType);
    const configured =
      normalized === 'mini-swe-agent'
        ? this.configService.get<string>('MINI_SWE_AGENT_RUNTIME_COMMAND')
        : normalized === 'pi'
          ? this.configService.get<string>('PI_AGENT_RUNTIME_COMMAND')
          : normalized === 'claude-code'
            ? this.configService.get<string>('CLAUDE_CODE_AGENT_RUNTIME_COMMAND')
            : normalized === 'codex'
              ? this.configService.get<string>('CODEX_AGENT_RUNTIME_COMMAND')
              : this.configService.get<string>('HERMES_AGENT_RUNTIME_COMMAND');
    const fallback =
      normalized === 'hermes-agent'
        ? 'gateway run'
        : ['pi', 'claude-code', 'codex'].includes(normalized)
          ? 'node /opt/agentcraft/cli-adapter.mjs'
          : 'python3 /opt/agentcraft/cli-adapter.py';
    const command = (configured || fallback).trim();
    return command.match(/"[^"]+"|'[^']+'|\S+/g)?.map((part) => part.replace(/^['"]|['"]$/g, '')) || [
      ...(normalized === 'hermes-agent'
        ? ['gateway', 'run']
        : ['pi', 'claude-code', 'codex'].includes(normalized)
          ? ['node', '/opt/agentcraft/cli-adapter.mjs']
          : ['python3', '/opt/agentcraft/cli-adapter.py']),
    ];
  }

  private runtimeShellEntrypoint(agentType?: string | null) {
    return this.normalizeAgentType(agentType) === 'hermes-agent' ? '/bin/bash' : '/bin/sh';
  }

  private runtimeShellName(agentType?: string | null) {
    return this.normalizeAgentType(agentType) === 'hermes-agent' ? 'bash' : 'sh';
  }

  private normalizeAgentType(agentType?: string | null) {
    const normalized = (agentType || 'hermes-agent').trim().toLowerCase();
    if (['mini-swe-agent', 'mini_swe_agent', 'mini'].includes(normalized)) return 'mini-swe-agent';
    if (['pi', 'pi-agent', 'pi_agent'].includes(normalized)) return 'pi';
    if (['claude-code', 'claude_code', 'claude'].includes(normalized)) return 'claude-code';
    if (['codex', 'codex-agent', 'codex_agent'].includes(normalized)) return 'codex';
    return normalized || 'hermes-agent';
  }

  private agentTypeLabel(agentType?: string | null) {
    const normalized = this.normalizeAgentType(agentType);
    if (normalized === 'mini-swe-agent') return 'mini-swe-agent';
    if (normalized === 'pi') return 'pi';
    if (normalized === 'claude-code') return 'Claude Code';
    if (normalized === 'codex') return 'Codex';
    if (normalized === 'hermes-agent') return 'Hermes';
    return normalized;
  }

  private agentCore() {
    if (!this.agentCoreClient) {
      this.agentCoreClient = new BedrockAgentCoreClient({ region: this.agentCoreRegion() });
    }
    return this.agentCoreClient;
  }

  private agentCoreControl() {
    if (!this.agentCoreControlClient) {
      this.agentCoreControlClient = new BedrockAgentCoreControlClient({ region: this.agentCoreRegion() });
    }
    return this.agentCoreControlClient;
  }

  private agentCoreWorkspaceDir() {
    const configured =
      this.configService.get<string>('AGENTCORE_SESSION_STORAGE_MOUNT_PATH') ||
      this.configService.get<string>('AWS_AGENTCORE_SESSION_STORAGE_MOUNT_PATH') ||
      '/mnt/workspace';
    return configured.trim() || '/mnt/workspace';
  }

  private agentCoreSessionId(config: AgentRuntimeLaunchConfig) {
    return `agentcraft-${config.runtimeId}`.slice(0, 64);
  }

  private agentCoreRuntimeName(config: AgentRuntimeLaunchConfig) {
    const prefix = (
      this.configService.get<string>('AGENTCORE_RUNTIME_NAME_PREFIX') ||
      'agentcraft'
    ).replace(/[^A-Za-z0-9_]+/g, '_') || 'agentcraft';
    const role = config.role.toLowerCase().replace(/[^a-z0-9_]+/g, '_') || 'agent';
    const name = `${prefix}_${role}_${config.runtimeId.replace(/-/g, '').slice(0, 8)}`;
    return (/^[A-Za-z]/.test(name) ? name : `a${name}`).slice(0, 48);
  }

  private requiredAgentCoreRuntimeArn(session: AgentRuntimeSession) {
    const arn = session.agentCoreRuntimeArn || session.apiBaseUrl || this.agentCoreRuntimeArn();
    if (!arn) {
      throw new Error('AGENTCORE_RUNTIME_ARN is required for aws-agentcore runtime messaging');
    }
    return arn;
  }

  private requiredAgentCoreRuntimeSessionId(session: AgentRuntimeSession) {
    const id = session.agentCoreRuntimeSessionId || session.runtimeId;
    if (!id || id.length < 33) {
      return `agentcraft-${session.runtimeId}`.slice(0, 64);
    }
    return id;
  }

  private async resolveAgentCoreRuntimeArn(config: AgentRuntimeLaunchConfig) {
    const configured = this.agentCoreRuntimeArn();
    if (configured) return configured;

    if (this.configService.get<string>('AGENTCORE_CREATE_RUNTIME_ON_LAUNCH') !== 'true') {
      throw new Error('AGENTCORE_RUNTIME_ARN is required for aws-agentcore launches');
    }

    const image = config.image || this.agentCoreContainerImage();
    const roleArn =
      this.configService.get<string>('AGENTCORE_RUNTIME_ROLE_ARN') ||
      this.configService.get<string>('AWS_AGENTCORE_RUNTIME_ROLE_ARN') ||
      '';
    if (!image || !roleArn) {
      throw new Error('AGENTCORE_RUNTIME_IMAGE and AGENTCORE_RUNTIME_ROLE_ARN are required to create AgentCore runtimes');
    }

    const networkMode = (
      this.configService.get<string>('AGENTCORE_NETWORK_MODE') ||
      this.configService.get<string>('AWS_AGENTCORE_NETWORK_MODE') ||
      'PUBLIC'
    ).trim().toUpperCase();
    const request = new CreateAgentRuntimeCommand({
      agentRuntimeName: this.agentCoreRuntimeName(config),
      agentRuntimeArtifact: { containerConfiguration: { containerUri: image } },
      roleArn,
      networkConfiguration: this.agentCoreNetworkConfiguration(networkMode),
      protocolConfiguration: { serverProtocol: 'HTTP' },
      lifecycleConfiguration: {
        idleRuntimeSessionTimeout: Number(this.configService.get<string>('AGENTCORE_IDLE_SESSION_TIMEOUT_SECONDS') || 900),
        maxLifetime: Number(this.configService.get<string>('AGENTCORE_MAX_LIFETIME_SECONDS') || 28800),
      },
      filesystemConfigurations: [
        { sessionStorage: { mountPath: this.agentCoreWorkspaceDir() } },
      ],
      environmentVariables: {
        AGENTCRAFT_AGENTCORE_RUNTIME: 'true',
        AGENT_RUNTIME_WORKSPACE_DIR: this.agentCoreWorkspaceDir(),
      },
      tags: {
        agentcraftProjectId: config.projectId,
        agentcraftRole: config.role,
      },
    });
    const response = await this.agentCoreControl().send(request);
    if (!response.agentRuntimeArn) {
      throw new Error('CreateAgentRuntime did not return an AgentCore runtime ARN');
    }
    return response.agentRuntimeArn;
  }

  private agentCoreNetworkConfiguration(networkMode: string) {
    if (networkMode !== 'VPC') {
      return { networkMode: 'PUBLIC' as const };
    }
    return {
      networkMode: 'VPC' as const,
      networkModeConfig: {
        subnets: this.requiredListConfig('AGENTCORE_SUBNET_IDS'),
        securityGroups: this.requiredListConfig('AGENTCORE_SECURITY_GROUP_IDS'),
      },
    };
  }

  private async invokeAgentCoreShellCommand(
    session: AgentRuntimeSession,
    command: string,
    timeout = 60,
    env: Record<string, string> = {},
  ) {
    const envPrefix = Object.entries(env)
      .map(([key, value]) => `export ${key.replace(/[^A-Za-z0-9_]/g, '')}=${this.shellQuote(value)}`)
      .join('; ');
    const finalCommand = envPrefix ? `${envPrefix}; ${command}` : command;
    const response = await this.agentCore().send(new InvokeAgentRuntimeCommandCommand({
      agentRuntimeArn: this.requiredAgentCoreRuntimeArn(session),
      qualifier: session.agentCoreQualifier || this.agentCoreRuntimeQualifier(),
      runtimeSessionId: this.requiredAgentCoreRuntimeSessionId(session),
      contentType: 'application/json',
      accept: 'application/vnd.amazon.eventstream',
      body: {
        command: finalCommand,
        timeout,
      },
    }));
    let stdout = '';
    let stderr = '';
    let exitCode = 0;
    let status = 'COMPLETED';
    for await (const event of response.stream || []) {
      const error = (event as any).accessDeniedException ||
        (event as any).internalServerException ||
        (event as any).resourceNotFoundException ||
        (event as any).serviceQuotaExceededException ||
        (event as any).throttlingException ||
        (event as any).validationException ||
        (event as any).runtimeClientError;
      if (error) {
        throw new Error(error.message || 'AgentCore command failed');
      }
      const chunk = (event as any).chunk;
      if (chunk?.contentDelta?.stdout) stdout += chunk.contentDelta.stdout;
      if (chunk?.contentDelta?.stderr) stderr += chunk.contentDelta.stderr;
      if (chunk?.contentStop) {
        exitCode = Number(chunk.contentStop.exitCode ?? exitCode);
        status = String(chunk.contentStop.status || status);
      }
    }
    return { stdout, stderr, exitCode, status };
  }

  private shellQuote(value: string) {
    return `'${String(value).replace(/'/g, `'\\''`)}'`;
  }

  private ecs() {
    if (!this.ecsClient) {
      this.ecsClient = new ECSClient({
        region: this.configService.get<string>('AWS_REGION') || 'ap-southeast-1',
      });
    }
    return this.ecsClient;
  }

  private cloudContainerName() {
    return this.configService.get<string>('HERMES_AGENT_CLOUD_CONTAINER_NAME') || 'hermes-agent';
  }

  private requiredConfig(name: string, fallback?: string | null) {
    const value = this.configService.get<string>(name) || fallback || '';
    if (!value) {
      throw new Error(`${name} is required for AWS cloud agent launches`);
    }
    return value;
  }

  private requiredListConfig(name: string) {
    const values = (this.configService.get<string>(name) || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    if (!values.length) {
      throw new Error(`${name} is required for AWS cloud agent launches`);
    }
    return values;
  }

  private async describeCloudTask(taskArn: string) {
    if (!taskArn) return null;
    const response = await this.ecs().send(new DescribeTasksCommand({
      cluster: this.requiredConfig('HERMES_AGENT_CLOUD_CLUSTER', this.configService.get<string>('ECS_CLUSTER')),
      tasks: [taskArn],
    }));
    return response.tasks?.[0] || null;
  }

  private async waitForCloudTaskNetwork(taskArn: string) {
    const waitMs = Number(this.configService.get<string>('HERMES_AGENT_CLOUD_WAIT_MS') || 90000);
    const deadline = Date.now() + waitMs;
    let lastTask: Task | null = null;

    while (Date.now() < deadline) {
      lastTask = await this.describeCloudTask(taskArn);
      if (lastTask && this.taskPrivateIp(lastTask)) {
        return lastTask;
      }
      if (lastTask?.lastStatus === 'STOPPED') {
        throw new Error(lastTask.stoppedReason || 'ECS cloud agent task stopped before becoming reachable');
      }
      await this.sleep(3000);
    }

    throw new Error(`Timed out waiting for ECS cloud agent network attachment (${lastTask?.lastStatus || 'unknown'})`);
  }

  private taskPrivateIp(task: Task | null | undefined) {
    for (const attachment of task?.attachments || []) {
      for (const detail of attachment.details || []) {
        if (detail.name === 'privateIPv4Address' && detail.value) {
          return detail.value;
        }
      }
    }
    return null;
  }

  private useDockerCopyStrategy() {
    return this.configService.get<string>('HERMES_AGENT_DOCKER_VOLUME_STRATEGY') === 'copy';
  }

  private useMockRuntime() {
    return this.configService.get<string>('HERMES_AGENT_LAUNCH_MODE') === 'mock';
  }

  private copySourceSuffix() {
    return process.platform === 'win32' ? '\\.' : '/.';
  }

  private toDockerVolumePath(path: string) {
    const mode = this.configService.get<string>('HERMES_AGENT_VOLUME_PATH_MODE');
    const command = [
      this.configService.get<string>('HERMES_AGENT_DOCKER_COMMAND'),
      this.configService.get<string>('DOCKER_BIN'),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    if (mode === 'wsl' || (!mode && command.includes('wsl'))) {
      const match = path.match(/^([a-zA-Z]):[\\/](.*)$/);
      if (match) {
        return `/mnt/${match[1].toLowerCase()}/${match[2].replace(/\\/g, '/')}`;
      }
    }
    return path;
  }

  private containerName(projectId: string, role: string, runtimeId: string) {
    const cleanRole = role.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const prefix = (this.configService.get<string>('HERMES_AGENT_CONTAINER_PREFIX') || 'aifactory-hermes')
      .toLowerCase()
      .replace(/[^a-z0-9_.-]+/g, '-')
      .replace(/^-|-$/g, '');
    return `${prefix}-${projectId.slice(0, 8)}-${cleanRole}-${runtimeId.slice(0, 8)}`;
  }

  private runtimeDataDir(projectId: string, role: string, runtimeId: string) {
    const root =
      this.configService.get<string>('HERMES_AGENT_DATA_ROOT') ||
      resolve(process.cwd(), '..', '.agent-runtimes');
    const cleanRole = role.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    return resolve(root, projectId, `${cleanRole}-${runtimeId.slice(0, 8)}`);
  }

  private runtimeApiBaseUrl(port: number) {
    const host =
      this.configService.get<string>('HERMES_AGENT_API_HOST') ||
      (existsSync('/.dockerenv') ? 'host.docker.internal' : '127.0.0.1');
    return `http://${host}:${port}`;
  }

  private agentWorkspaceBaseUrl(defaultBaseUrl: string) {
    // This is the URL the launched agent container can reach itself.
    // Local Docker runtimes usually need host.docker.internal, while ECS
    // or other cloud runtimes should use a real service domain.
    return this.configService.get<string>('HERMES_AGENT_WORKSPACE_BASE_URL') || defaultBaseUrl;
  }

  private projectApiBaseUrl(configured?: string | null) {
    return (
      configured ||
      this.configService.get<string>('HERMES_AGENT_PROJECT_API_BASE_URL') ||
      this.configService.get<string>('AIFACTORY_PUBLIC_API_BASE_URL') ||
      this.configService.get<string>('AIFACTORY_API_BASE_URL') ||
      'http://host.docker.internal:3000/api'
    ).replace(/\/+$/, '');
  }

  private localRunnerWorkspaceBaseUrl(defaultBaseUrl: string) {
    return (
      this.configService.get<string>('HERMES_AGENT_LOCAL_RUNNER_WORKSPACE_BASE_URL') ||
      this.configService.get<string>('HERMES_AGENT_PUBLIC_WORKSPACE_BASE_URL') ||
      this.agentWorkspaceBaseUrl(defaultBaseUrl)
    );
  }

  private skillsPath() {
    const configured = this.configService.get<string>('AGENT_WORKSPACE_SKILLS_PATH');
    if (configured) return resolve(configured);
    return this.firstExistingPath([
      '/agent-workspace/skills',
      resolve(process.cwd(), 'agent-workspace-bundle', 'skills'),
      resolve(process.cwd(), '..', 'agent-workspace', 'skills'),
    ]);
  }

  private projectRolesPath() {
    const configured = this.configService.get<string>('AGENT_WORKSPACE_PROJECT_ROLES_PATH');
    if (configured) return resolve(configured);
    return this.firstExistingPath([
      '/agent-workspace/project-roles',
      resolve(process.cwd(), 'agent-workspace-bundle', 'project-roles'),
      resolve(process.cwd(), '..', 'agent-workspace', 'project-roles'),
    ]);
  }

  private projectTemplatesPath() {
    const configured = this.configService.get<string>('AGENT_WORKSPACE_PROJECT_TEMPLATES_PATH');
    if (configured) return resolve(configured);
    return this.firstExistingPath([
      '/agent-workspace/project-templates',
      resolve(process.cwd(), 'agent-workspace-bundle', 'project-templates'),
      resolve(process.cwd(), '..', 'agent-workspace', 'project-templates'),
    ]);
  }

  private firstExistingPath(paths: string[]) {
    return paths.find((path) => existsSync(path)) || paths[paths.length - 1];
  }

  private roleSlug(role?: string | null) {
    return (role || 'worker-agent').toLowerCase().replace(/_/g, '-');
  }

  private isRoleSkillRef(ref: string) {
    return ref.startsWith('role-skill://');
  }

  private isTemplateSkillRef(ref: string) {
    return ref.startsWith('template-skill://');
  }

  private isTemplateRoleSkillRef(ref: string) {
    return ref.startsWith('template-role-skill://');
  }

  private safeRefSegments(ref: string, scheme: string) {
    const body = ref.replace(new RegExp(`^${scheme}:\\/\\/`), '').trim();
    const segments = body.split('/').map((segment) => segment.trim()).filter(Boolean);
    if (!segments.length || segments.some((segment) => segment === '.' || segment === '..' || segment.includes('\\'))) {
      return [];
    }
    return segments;
  }

  private skillNameFromRef(ref: string) {
    if (this.isTemplateRoleSkillRef(ref)) {
      const segments = this.safeRefSegments(ref, 'template-role-skill');
      return segments.length >= 3 ? segments[2] : '';
    }
    if (this.isTemplateSkillRef(ref)) {
      const segments = this.safeRefSegments(ref, 'template-skill');
      return segments.length >= 2 ? segments[1] : '';
    }
    return ref.replace(/^(skill|role-skill):\/\//, '').trim();
  }

  private skillPathForRef(ref: string, role?: string) {
    const name = this.skillNameFromRef(ref);
    if (this.isRoleSkillRef(ref)) {
      return resolve(this.projectRolesPath(), this.roleSlug(role), 'skills', name);
    }
    if (this.isTemplateRoleSkillRef(ref)) {
      const [templateId, roleSlug, skillName] = this.safeRefSegments(ref, 'template-role-skill');
      return resolve(this.projectTemplatesPath(), templateId || '', 'roles', roleSlug || '', 'skills', skillName || name);
    }
    if (this.isTemplateSkillRef(ref)) {
      const [templateId, skillName] = this.safeRefSegments(ref, 'template-skill');
      return resolve(this.projectTemplatesPath(), templateId || '', 'skills', skillName || name);
    }
    return resolve(this.skillsPath(), name);
  }

  private getFreePort(): Promise<number> {
    return new Promise((resolvePort, reject) => {
      const server = createServer();
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        server.close(() => {
          if (typeof address === 'object' && address?.port) resolvePort(address.port);
          else reject(new Error('Unable to allocate local port'));
        });
      });
      server.on('error', reject);
    });
  }
}
