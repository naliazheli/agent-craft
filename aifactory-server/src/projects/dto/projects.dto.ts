import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  Min,
} from 'class-validator';
import type { ConcurrencyMode, TaskPacket } from '../project-workspace.types';

export class CreateProjectDto {
  @ApiPropertyOptional({ example: 'Cloud Agent Platform' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'Build a cloud-native platform where agents can claim project work.' })
  @IsOptional()
  @IsString()
  initialGoal?: string;

  @ApiPropertyOptional({ example: 'cloud-agent-platform' })
  @IsOptional()
  @IsString()
  slug?: string;

  @ApiPropertyOptional({ example: 'A project workspace for multi-agent collaboration.' })
  @IsOptional()
  @IsString()
  summary?: string;

  @ApiPropertyOptional({ example: 'Build a cloud-native project platform that coordinates lead and worker agents.' })
  @IsOptional()
  @IsString()
  brief?: string;

  @ApiPropertyOptional({ example: 'private' })
  @IsOptional()
  @IsString()
  visibility?: string;

  @ApiPropertyOptional({ example: 'https://github.com/naliazheli/agent-workspace' })
  @IsOptional()
  @IsUrl()
  githubUrl?: string;

  @ApiPropertyOptional({ example: 'uuid-of-lead-agent-user' })
  @IsOptional()
  @IsUUID()
  leadAgentUserId?: string;

  @ApiPropertyOptional({ example: 1000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  budgetAmount?: number;

  @ApiPropertyOptional({ example: 'AIC' })
  @IsOptional()
  @IsString()
  budgetCurrency?: string;

  @ApiPropertyOptional({ example: 'default', description: 'Project template id used to seed roles and default project variables.' })
  @IsOptional()
  @IsString()
  projectTemplateId?: string;

  @ApiPropertyOptional({ type: 'object' })
  @IsOptional()
  settings?: any;
}

export class CreateProjectFromTaskDto {
  @ApiPropertyOptional({ example: 'Coupang Taiwan reco.tw.coupang.com bounty project' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: true, description: 'User confirmed creating a project from the task, required for HackerOne bounty tasks.' })
  @IsOptional()
  @IsBoolean()
  confirmed?: boolean;

  @ApiPropertyOptional({ example: true, description: 'Seed goals, features, work items, and skill memory from the task.' })
  @IsOptional()
  @IsBoolean()
  seedPlan?: boolean;
}

export class UpdateProjectDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  summary?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  brief?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  visibility?: string;

  @ApiPropertyOptional({ example: 'https://github.com/naliazheli/agent-workspace' })
  @IsOptional()
  @IsUrl()
  githubUrl?: string;

  @ApiPropertyOptional({ example: 'uuid-of-lead-agent-user' })
  @IsOptional()
  @IsUUID()
  leadAgentUserId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  budgetAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  budgetCurrency?: string;

  @ApiPropertyOptional({ type: 'object' })
  @IsOptional()
  settings?: any;
}

export class UpdateProjectGoalGlobalsDto {
  @ApiPropertyOptional({ type: 'array', items: { type: 'object' } })
  @IsOptional()
  @IsArray()
  globals?: any[];

  @ApiPropertyOptional({ example: true, description: 'Rewrite runtime context files for already launched agents.' })
  @IsOptional()
  @IsBoolean()
  syncRuntimes?: boolean;
}

export class DeleteProjectDto {
  @ApiProperty({ example: 'delete' })
  @IsString()
  confirmation!: string;
}

export class SaveProjectTemplateDto {
  @ApiPropertyOptional({ example: 'My legal review team template' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'Reusable project configuration for contract review teams.' })
  @IsOptional()
  @IsString()
  description?: string;
}

export class CreateProjectGoalDto {
  @ApiProperty({ example: 'Launch project coordination MVP' })
  @IsString()
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsNumber()
  priority?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsNumber()
  sortOrder?: number;
}

export class CreateProjectFeatureDto {
  @ApiProperty({ example: 'Project work item board' })
  @IsString()
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  goalId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsNumber()
  priority?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsNumber()
  sortOrder?: number;

  @ApiPropertyOptional({ type: 'object' })
  @IsOptional()
  spec?: any;
}

export class CreateProjectWorkItemDto {
  @ApiProperty({ example: 'Design work item status model' })
  @IsString()
  title!: string;

  @ApiProperty({ example: 'DESIGN' })
  @IsString()
  workType!: string;

  @ApiPropertyOptional({ example: 'READY' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  goalId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  featureId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  parentWorkItemId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  scopeBrief?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  acceptanceCriteria?: string;

  @ApiPropertyOptional({ type: 'object' })
  @IsOptional()
  inputPacket?: any;

  @ApiPropertyOptional({ type: 'object' })
  @IsOptional()
  outputContract?: any;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  outputProjectFiles?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  dependsOn?: string[];

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsNumber()
  priority?: number;

  @ApiPropertyOptional({ example: 'uuid-of-owner' })
  @IsOptional()
  @IsUUID()
  ownerId?: string;

  @ApiPropertyOptional({
    enum: ['SINGLE', 'RACE', 'MULTI_ROLE', 'PRIMARY_BACKUP'],
    description:
      'Concurrency mode for the work item. Defaults to SINGLE.',
  })
  @IsOptional()
  @IsIn(['SINGLE', 'RACE', 'MULTI_ROLE', 'PRIMARY_BACKUP'])
  concurrencyMode?: ConcurrencyMode;

  @ApiPropertyOptional({ example: '2026-05-01T00:00:00.000Z' })
  @IsOptional()
  @IsString()
  dueAt?: string;
}

export class CreateProjectMemberDto {
  @ApiProperty({ example: 'uuid-of-member-user' })
  @IsUUID()
  userId!: string;

  @ApiProperty({ example: 'WORKER_AGENT' })
  @IsString()
  role!: string;

  @ApiPropertyOptional({ type: 'object' })
  @IsOptional()
  permissions?: any;
}

export class UpdateProjectWorkItemDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  workType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  scopeBrief?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  acceptanceCriteria?: string;

  @ApiPropertyOptional({ type: 'object' })
  @IsOptional()
  inputPacket?: any;

  @ApiPropertyOptional({ type: 'object' })
  @IsOptional()
  outputContract?: any;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  dependsOn?: string[];

  @ApiPropertyOptional({
    enum: ['SINGLE', 'RACE', 'MULTI_ROLE', 'PRIMARY_BACKUP'],
    description:
      'Concurrency mode for the work item.',
  })
  @IsOptional()
  @IsIn(['SINGLE', 'RACE', 'MULTI_ROLE', 'PRIMARY_BACKUP'])
  concurrencyMode?: ConcurrencyMode;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  priority?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  ownerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  dueAt?: string;
}

export class CreateProjectWorkItemCommentDto {
  @ApiProperty({ example: 'I uploaded the latest design reference for this item.' })
  @IsString()
  content!: string;

  @ApiPropertyOptional({
    type: [Object],
    description: 'Project-file attachment refs, for example { path, name, size, downloadUrl }.',
  })
  @IsOptional()
  @IsArray()
  attachments?: any[];
}

export class CreateProjectAssignmentDto {
  @ApiProperty({ example: 'uuid-of-worker-agent' })
  @IsUUID()
  assigneeUserId!: string;

  @ApiProperty({ example: 'WORKER_AGENT' })
  @IsString()
  role!: string;

  @ApiPropertyOptional({ example: 'uuid-of-runtime-to-wake' })
  @IsOptional()
  @IsUUID()
  targetRuntimeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  objective?: string;

  @ApiPropertyOptional({
    type: 'object',
    description:
      'L3 TaskPacket snapshot handed to the assignee.',
  })
  @IsOptional()
  contextPacket?: TaskPacket;
}

export class UpdateProjectAssignmentDto {
  @ApiPropertyOptional({ example: 'ACTIVE' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  objective?: string;

  @ApiPropertyOptional({
    type: 'object',
    description:
      'Updated L3 TaskPacket.',
  })
  @IsOptional()
  contextPacket?: TaskPacket;
}

export class CreateProjectRunDto {
  @ApiProperty({ example: 'EXECUTION' })
  @IsString()
  runType!: string;

  @ApiProperty({ example: 'uuid-of-work-item' })
  @IsUUID()
  workItemId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  assignmentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  instruction?: string;

  @ApiPropertyOptional({ type: 'object' })
  @IsOptional()
  contextSnapshot?: any;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  resultSummary?: string;

  @ApiPropertyOptional({ type: 'object' })
  @IsOptional()
  costInfo?: any;
}

export class UpdateProjectRunDto {
  @ApiPropertyOptional({ example: 'RUNNING' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  instruction?: string;

  @ApiPropertyOptional({ type: 'object' })
  @IsOptional()
  contextSnapshot?: any;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  resultSummary?: string;

  @ApiPropertyOptional({ type: 'object' })
  @IsOptional()
  costInfo?: any;
}

export class CreateProjectRunLogDto {
  @ApiPropertyOptional({ example: 'info' })
  @IsOptional()
  @IsString()
  level?: string;

  @ApiProperty({ example: 'Worker agent started implementation.' })
  @IsString()
  message!: string;

  @ApiPropertyOptional({ type: 'object' })
  @IsOptional()
  metadata?: any;
}

export class CreateProjectArtifactDto {
  @ApiProperty({ example: 'HANDOFF' })
  @IsString()
  artifactType!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  workItemId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  assignmentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  runId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  url?: string;

  @ApiPropertyOptional({ type: 'object' })
  @IsOptional()
  metadata?: any;
}

export class CreateProjectReviewDto {
  @ApiProperty({ example: 'uuid-of-work-item' })
  @IsUUID()
  workItemId!: string;

  @ApiProperty({ example: 'LEAD_AGENT' })
  @IsString()
  reviewerType!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  assignmentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  artifactId?: string;

  @ApiPropertyOptional({ example: 'APPROVED' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reviewNote?: string;

  @ApiPropertyOptional({ type: 'object' })
  @IsOptional()
  checklistResult?: any;
}

export class CreateProjectMemoryDto {
  @ApiProperty({ example: 'DECISION' })
  @IsString()
  memoryType!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiProperty({ example: 'We will isolate the project platform behind a separate tab and table set.' })
  @IsString()
  content!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  summary?: string;

  @ApiPropertyOptional({ example: 'uuid-of-source-artifact' })
  @IsOptional()
  @IsUUID()
  sourceArtifactId?: string;

  @ApiPropertyOptional({ type: 'object' })
  @IsOptional()
  metadata?: any;
}

export class UpdateProjectGoalDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsNumber()
  priority?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsNumber()
  sortOrder?: number;

  @ApiPropertyOptional({ enum: ['OPEN', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED'] })
  @IsOptional()
  @IsIn(['OPEN', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED'])
  status?: 'OPEN' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE' | 'CANCELLED';
}

export class CloseProjectGoalDto {
  @ApiProperty({ example: 'Pivoting strategy; goal no longer required.' })
  @IsString()
  reason!: string;

  @ApiPropertyOptional({
    example: true,
    description:
      'If true (default), cancel all non-DONE features, non-ACCEPTED work items, active assignments, and queued/running runs under this goal.',
  })
  @IsOptional()
  @IsBoolean()
  cascade?: boolean;
}

export class CreateProjectMemberCapabilityDto {
  @ApiProperty({
    example: 'language.typescript',
    description: 'Namespaced capability tag, e.g. "frontend", "language.typescript", "review.code".',
  })
  @IsString()
  capability!: string;

  @ApiPropertyOptional({ enum: ['NOVICE', 'COMPETENT', 'EXPERT'] })
  @IsOptional()
  @IsIn(['NOVICE', 'COMPETENT', 'EXPERT'])
  level?: 'NOVICE' | 'COMPETENT' | 'EXPERT';

  @ApiPropertyOptional({ enum: ['SELF_DECLARED', 'VERIFIED_BY_REVIEW', 'VERIFIED_BY_METRIC'] })
  @IsOptional()
  @IsIn(['SELF_DECLARED', 'VERIFIED_BY_REVIEW', 'VERIFIED_BY_METRIC'])
  source?: 'SELF_DECLARED' | 'VERIFIED_BY_REVIEW' | 'VERIFIED_BY_METRIC';
}

export class LaunchProjectAgentRuntimeDto {
  @ApiProperty({ example: 'WORKER_AGENT' })
  @IsString()
  role!: string;

  @ApiPropertyOptional({ example: 'uuid-of-project-member' })
  @IsOptional()
  @IsUUID()
  memberId?: string;

  @ApiPropertyOptional({ example: 'uuid-of-api-config' })
  @IsOptional()
  @IsUUID()
  llmConfigId?: string;

  @ApiPropertyOptional({ example: 'aifactory/hermes-agent:local' })
  @IsOptional()
  @IsString()
  image?: string;

  @ApiPropertyOptional({ example: 'nous/hermes-agent' })
  @IsOptional()
  @IsString()
  model?: string;

  @ApiPropertyOptional({ example: 'hermes-agent' })
  @IsOptional()
  @IsString()
  agentType?: string;

  @ApiPropertyOptional({ enum: ['local-docker', 'aws-ecs', 'local-runner', 'local-codex', 'aws-agentcore'], example: 'local-docker' })
  @IsOptional()
  @IsIn(['local-docker', 'aws-ecs', 'local-runner', 'local-codex', 'aws-agentcore'])
  launchMode?: 'local-docker' | 'aws-ecs' | 'local-runner' | 'local-codex' | 'aws-agentcore';

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  deploymentDays?: number;

  @ApiPropertyOptional({ example: false, description: 'Enable passwordless sudo inside local Hermes runtimes.' })
  @IsOptional()
  @IsBoolean()
  enableSudo?: boolean;
}

export class UpdateProjectRolePromptDto {
  @ApiPropertyOptional({ example: 'Review contracts using the project-specific legal workflow.' })
  @IsOptional()
  @IsString()
  initialPrompt?: string | null;

  @ApiPropertyOptional({ example: false, description: 'Remove the project-level override and fall back to the template role prompt.' })
  @IsOptional()
  @IsBoolean()
  reset?: boolean;

  @ApiPropertyOptional({ example: true, description: 'Apply the prompt to existing runtime sessions for this role.' })
  @IsOptional()
  @IsBoolean()
  applyToRunning?: boolean;
}

export class UpdateProjectRoleSkillsDto {
  @ApiPropertyOptional({ type: [String], example: ['skill://agent-workspace', 'role-skill://agent-workspace-worker'] })
  @IsOptional()
  @IsArray()
  skillBundleRefs?: string[];

  @ApiPropertyOptional({
    type: 'object',
    description: 'Map of skill bundle ref to replacement SKILL.md content. Content is stored in project shared object storage.',
  })
  @IsOptional()
  skillMarkdownByRef?: Record<string, string | null>;

  @ApiPropertyOptional({ example: false, description: 'Remove the project-level skill override and fall back to the template role skills.' })
  @IsOptional()
  @IsBoolean()
  reset?: boolean;

  @ApiPropertyOptional({ example: true, description: 'Apply the skill set to existing runtime sessions for this role.' })
  @IsOptional()
  @IsBoolean()
  applyToRunning?: boolean;
}

export class RefreshProjectTemplateDto {
  @ApiPropertyOptional({ example: true, description: 'Apply refreshed template role prompts to existing runtime sessions.' })
  @IsOptional()
  @IsBoolean()
  applyToRunning?: boolean;
}

export class UpdateProjectCoordinatorConfigDto {
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  maxDispatchesPerTick?: number;

  @ApiPropertyOptional({ enum: ['local-docker', 'aws-ecs', 'local-runner', 'local-codex', 'aws-agentcore'], example: 'local-docker' })
  @IsOptional()
  @IsIn(['local-docker', 'aws-ecs', 'local-runner', 'local-codex', 'aws-agentcore'])
  launchMode?: 'local-docker' | 'aws-ecs' | 'local-runner' | 'local-codex' | 'aws-agentcore';

  @ApiPropertyOptional({ example: 'pi' })
  @IsOptional()
  @IsString()
  agentType?: string;

  @ApiPropertyOptional({ example: '请处理 item {{title}}，workType={{workType}}，目标角色 {{role}}。' })
  @IsOptional()
  @IsString()
  messageTemplate?: string;

  @ApiPropertyOptional({
    type: 'array',
    description: 'Template-style coordinator trigger rules mapping work-item statuses/workTypes to launchable roles.',
  })
  @IsOptional()
  @IsArray()
  dispatchRules?: Array<Record<string, unknown>>;
}

export class CreateProjectAgentProfileDto {
  @ApiProperty({ example: 'Default AgentCore worker' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ example: 'Reusable worker profile for implementation tasks.' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 'WORKER_AGENT' })
  @IsString()
  role!: string;

  @ApiPropertyOptional({ enum: ['local-docker', 'aws-ecs', 'local-runner', 'local-codex', 'aws-agentcore'], example: 'aws-agentcore' })
  @IsOptional()
  @IsIn(['local-docker', 'aws-ecs', 'local-runner', 'local-codex', 'aws-agentcore'])
  launchMode?: 'local-docker' | 'aws-ecs' | 'local-runner' | 'local-codex' | 'aws-agentcore';

  @ApiPropertyOptional({ example: 'hermes-agent' })
  @IsOptional()
  @IsString()
  agentType?: string;

  @ApiPropertyOptional({ example: 'arn:aws:bedrock-agentcore:us-west-2:123456789012:runtime/coding-agent' })
  @IsOptional()
  @IsString()
  image?: string;

  @ApiPropertyOptional({ example: 'gpt-4o' })
  @IsOptional()
  @IsString()
  model?: string;

  @ApiPropertyOptional({ example: 'uuid-of-api-config' })
  @IsOptional()
  @IsUUID()
  llmConfigId?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  deploymentDays?: number;

  @ApiPropertyOptional({ example: false, description: 'Enable passwordless sudo inside local Hermes runtimes launched from this profile.' })
  @IsOptional()
  @IsBoolean()
  enableSudo?: boolean;

  @ApiPropertyOptional({ type: 'object' })
  @IsOptional()
  settings?: any;
}

export class UpdateProjectAgentProfileDto {
  @ApiPropertyOptional({ example: 'Default AgentCore worker' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'Reusable worker profile for implementation tasks.' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'WORKER_AGENT' })
  @IsOptional()
  @IsString()
  role?: string;

  @ApiPropertyOptional({ enum: ['local-docker', 'aws-ecs', 'local-runner', 'local-codex', 'aws-agentcore'] })
  @IsOptional()
  @IsIn(['local-docker', 'aws-ecs', 'local-runner', 'local-codex', 'aws-agentcore'])
  launchMode?: 'local-docker' | 'aws-ecs' | 'local-runner' | 'local-codex' | 'aws-agentcore';

  @ApiPropertyOptional({ example: 'hermes-agent' })
  @IsOptional()
  @IsString()
  agentType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  image?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  model?: string;

  @ApiPropertyOptional({ example: 'uuid-of-api-config' })
  @IsOptional()
  @IsUUID()
  llmConfigId?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  deploymentDays?: number;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  enableSudo?: boolean;

  @ApiPropertyOptional({ type: 'object' })
  @IsOptional()
  settings?: any;
}

export class LaunchProjectAgentProfileDto {
  @ApiPropertyOptional({ example: 'uuid-of-project-member' })
  @IsOptional()
  @IsUUID()
  memberId?: string;

  @ApiPropertyOptional({ example: 'uuid-of-api-config' })
  @IsOptional()
  @IsUUID()
  llmConfigId?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  deploymentDays?: number;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  enableSudo?: boolean;
}

export class SendProjectAgentMessageDto {
  @ApiProperty({ example: '请先读取当前项目上下文，然后给我一个下一步建议。' })
  @IsString()
  message!: string;

  @ApiPropertyOptional({ example: 'uuid-of-runtime-conversation' })
  @IsOptional()
  @IsString()
  conversationId?: string;

  @ApiPropertyOptional({ example: 'steer', enum: ['steer', 'followUp'] })
  @IsOptional()
  @IsIn(['steer', 'followUp'])
  delivery?: 'steer' | 'followUp';
}

export class UpdateProjectAgentRuntimeConversationDto {
  @ApiProperty({ example: '排查本地 runner 重连' })
  @IsString()
  title!: string;
}

export class UpdateProjectAgentPollingConfigDto {
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ enum: ['IDLE_ONLY', 'FIXED_INTERVAL'], example: 'IDLE_ONLY' })
  @IsOptional()
  @IsIn(['IDLE_ONLY', 'FIXED_INTERVAL'])
  strategy?: 'IDLE_ONLY' | 'FIXED_INTERVAL';

  @ApiPropertyOptional({ example: 60 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  intervalMinutes?: number;

  @ApiPropertyOptional({ example: 'keep working' })
  @IsOptional()
  @IsString()
  message?: string;
}
