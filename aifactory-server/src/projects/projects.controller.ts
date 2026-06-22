import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Request,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProjectsService } from './projects.service';
import {
  CloseProjectGoalDto,
  CreateProjectAgentProfileDto,
  CreateProjectArtifactDto,
  CreateProjectAssignmentDto,
  CreateProjectDto,
  CreateProjectFromTaskDto,
  DeleteProjectGoalDto,
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
  UpdateProjectGoalGlobalsDto,
  UpdateProjectGoalDto,
  UpdateProjectRolePromptDto,
  UpdateProjectRoleSkillsDto,
  UpdateProjectRunDto,
  UpdateProjectWorkItemDto,
} from './dto/projects.dto';

@ApiTags('projects')
@Controller('projects')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a project workspace' })
  createProject(@Request() req: any, @Body() dto: CreateProjectDto) {
    return this.projectsService.createProject(req.user.id, dto);
  }

  @Post('from-task/:taskId')
  @ApiOperation({ summary: 'Create a project workspace from a marketplace task' })
  createProjectFromTask(
    @Param('taskId') taskId: string,
    @Request() req: any,
    @Body() dto: CreateProjectFromTaskDto,
  ) {
    return this.projectsService.createProjectFromTask(req.user.id, taskId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List projects visible to the current user' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  listProjects(
    @Request() req: any,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.projectsService.listProjects(req.user.id, {
      status,
      search,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Post('account-local-runners/local-runner/token')
  @ApiOperation({ summary: 'Create an account-scoped local Docker runner token' })
  createAccountLocalRunnerToken(@Request() req: any, @Body() dto: any) {
    return this.projectsService.createAccountLocalRunnerToken(req.user.id, {
      ...dto,
      name: dto?.name || 'Local Docker runner device',
    });
  }

  @Post('account-local-runners/local-codex/token')
  @ApiOperation({ summary: 'Create an account-scoped local Codex runner token' })
  createAccountLocalCodexToken(@Request() req: any, @Body() dto: any) {
    return this.projectsService.createAccountLocalRunnerToken(req.user.id, {
      ...dto,
      name: dto?.name || 'Local Codex runner device',
    });
  }

  @Post('account-local-runners/local-runner/claim')
  @ApiOperation({ summary: 'Claim the next pending local Docker launch job for the current account' })
  claimAccountLocalRunnerAgentRuntime(@Request() req: any) {
    return this.projectsService.claimLocalRunnerAgentRuntimeForAccount(req.user.id);
  }

  @Post('account-local-runners/local-codex/claim')
  @ApiOperation({ summary: 'Claim the next pending local Codex launch job for the current account' })
  claimAccountLocalCodexAgentRuntime(@Request() req: any) {
    return this.projectsService.claimLocalCodexAgentRuntimeForAccount(req.user.id);
  }

  @Post('account-local-runners/local-runner/heartbeat')
  @ApiOperation({ summary: 'Refresh account-level local Docker runner presence' })
  heartbeatAccountLocalRunner(@Request() req: any, @Body() dto: any) {
    return this.projectsService.heartbeatAccountLocalRunner(req.user.id, 'local-runner', dto);
  }

  @Post('account-local-runners/local-codex/heartbeat')
  @ApiOperation({ summary: 'Refresh account-level local Codex runner presence' })
  heartbeatAccountLocalCodex(@Request() req: any, @Body() dto: any) {
    return this.projectsService.heartbeatAccountLocalRunner(req.user.id, 'local-codex', dto);
  }

  @Post('account-local-runners/local-runner/disconnect')
  @ApiOperation({ summary: 'Disconnect account-level local Docker runner presence' })
  disconnectAccountLocalRunner(@Request() req: any, @Body() dto: any) {
    return this.projectsService.disconnectAccountLocalRunner(req.user.id, 'local-runner', dto);
  }

  @Post('account-local-runners/local-codex/disconnect')
  @ApiOperation({ summary: 'Disconnect account-level local Codex runner presence' })
  disconnectAccountLocalCodex(@Request() req: any, @Body() dto: any) {
    return this.projectsService.disconnectAccountLocalRunner(req.user.id, 'local-codex', dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get project detail' })
  getProject(@Param('id') projectId: string, @Request() req: any) {
    return this.projectsService.getProject(projectId, req.user.id);
  }

  @Get(':id/board')
  @ApiOperation({ summary: 'Get project board summary, lanes, and cockpit' })
  getProjectBoard(@Param('id') projectId: string, @Request() req: any) {
    return this.projectsService.getProjectBoard(projectId, req.user.id);
  }

  @Get(':id/assignments/runtime-health')
  @ApiOperation({ summary: 'List assignment and assignee runtime health for the project owner/member view' })
    @ApiQuery({ name: 'workItemId', required: false })
    @ApiQuery({ name: 'status', required: false })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    @ApiQuery({ name: 'summary', required: false, type: Boolean })
    listAssignmentRuntimeState(
      @Param('id') projectId: string,
      @Request() req: any,
      @Query('workItemId') workItemId?: string,
      @Query('status') status?: string,
      @Query('limit') limit?: string,
      @Query('summary') summary?: string,
    ) {
      return this.projectsService.listAssignmentRuntimeStateForOwner(projectId, req.user.id, {
        workItemId,
        status,
        limit: limit ? parseInt(limit, 10) : undefined,
        summary: summary === 'true' || summary === '1',
      });
    }

  @Get(':id/activity')
  @ApiOperation({ summary: 'List recent project activity for timeline views and agents' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  listProjectActivity(
    @Param('id') projectId: string,
    @Request() req: any,
    @Query('limit') limit?: string,
  ) {
    return this.projectsService.listProjectActivity(
      projectId,
      req.user.id,
      limit ? parseInt(limit, 10) : undefined,
    );
  }

  @Get(':id/events')
  @ApiOperation({ summary: 'List durable project events from agent-workspace' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'sinceSeq', required: false, type: Number })
  @ApiQuery({ name: 'types', required: false, type: String })
  @ApiQuery({ name: 'refType', required: false, type: String })
  @ApiQuery({ name: 'refId', required: false, type: String })
  @ApiQuery({ name: 'workItemId', required: false, type: String })
  listProjectEvents(
    @Param('id') projectId: string,
    @Request() req: any,
    @Query('limit') limit?: string,
    @Query('sinceSeq') sinceSeq?: string,
    @Query('types') types?: string,
    @Query('refType') refType?: string,
    @Query('refId') refId?: string,
    @Query('workItemId') workItemId?: string,
  ) {
    return this.projectsService.listProjectEvents(projectId, req.user.id, {
      limit: limit ? parseInt(limit, 10) : undefined,
      sinceSeq: sinceSeq ? parseInt(sinceSeq, 10) : undefined,
      types: types ? types.split(',').map((item) => item.trim()).filter(Boolean) : undefined,
      refType,
      refId,
      workItemId,
    });
  }

  @Get(':id/event-graph')
  @ApiOperation({ summary: 'Get project event relationship graph' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getProjectEventGraph(
    @Param('id') projectId: string,
    @Request() req: any,
    @Query('limit') limit?: string,
  ) {
    return this.projectsService.getProjectEventGraph(
      projectId,
      req.user.id,
      limit ? parseInt(limit, 10) : undefined,
    );
  }

  @Post(':id/coordinator/tick')
  @ApiOperation({ summary: 'Run one project coordinator dispatch tick' })
  tickProjectCoordinator(
    @Param('id') projectId: string,
    @Request() req: any,
    @Body() dto: any,
  ) {
    return this.projectsService.tickProjectCoordinator(projectId, req.user.id, dto);
  }

  @Patch(':id/coordinator/config')
  @ApiOperation({ summary: 'Update project coordinator dispatch settings' })
  updateProjectCoordinatorConfig(
    @Param('id') projectId: string,
    @Request() req: any,
    @Body() dto: UpdateProjectCoordinatorConfigDto,
  ) {
    return this.projectsService.updateProjectCoordinatorConfig(projectId, req.user.id, dto);
  }

  @Get(':id/cockpit')
  @ApiOperation({ summary: 'Get project agent cockpit and staffing load summary' })
  getProjectCockpit(@Param('id') projectId: string, @Request() req: any) {
    return this.projectsService.getProjectCockpit(projectId, req.user.id);
  }

  @Get(':id/agent-runtimes')
  @ApiOperation({ summary: 'List project agent runtimes and local launcher status' })
  listAgentRuntimes(@Param('id') projectId: string, @Request() req: any) {
    return this.projectsService.listAgentRuntimes(projectId, req.user.id);
  }

  @Get(':id/agent-runtimes/images')
  @ApiOperation({ summary: 'List launchable agent runtime images' })
  listAgentRuntimeImages(@Param('id') projectId: string, @Request() req: any) {
    return this.projectsService.listAgentRuntimeImages(projectId, req.user.id);
  }

  @Get(':id/agent-profiles')
  @ApiOperation({ summary: 'List saved project agent launch profiles' })
  listProjectAgentProfiles(@Param('id') projectId: string, @Request() req: any) {
    return this.projectsService.listProjectAgentProfiles(projectId, req.user.id);
  }

  @Post(':id/agent-profiles')
  @ApiOperation({ summary: 'Create a saved project agent launch profile' })
  createProjectAgentProfile(
    @Param('id') projectId: string,
    @Request() req: any,
    @Body() dto: CreateProjectAgentProfileDto,
  ) {
    return this.projectsService.createProjectAgentProfile(projectId, req.user.id, dto);
  }

  @Patch(':id/agent-profiles/:profileId')
  @ApiOperation({ summary: 'Update a saved project agent launch profile' })
  updateProjectAgentProfile(
    @Param('id') projectId: string,
    @Param('profileId') profileId: string,
    @Request() req: any,
    @Body() dto: UpdateProjectAgentProfileDto,
  ) {
    return this.projectsService.updateProjectAgentProfile(projectId, profileId, req.user.id, dto);
  }

  @Delete(':id/agent-profiles/:profileId')
  @ApiOperation({ summary: 'Delete a saved project agent launch profile' })
  deleteProjectAgentProfile(
    @Param('id') projectId: string,
    @Param('profileId') profileId: string,
    @Request() req: any,
  ) {
    return this.projectsService.deleteProjectAgentProfile(projectId, profileId, req.user.id);
  }

  @Post(':id/agent-profiles/:profileId/launch')
  @ApiOperation({ summary: 'Launch a project agent runtime from a saved profile' })
  launchProjectAgentProfile(
    @Param('id') projectId: string,
    @Param('profileId') profileId: string,
    @Request() req: any,
    @Body() dto: LaunchProjectAgentProfileDto,
  ) {
    return this.projectsService.launchProjectAgentProfile(projectId, profileId, req.user.id, dto);
  }

  @Post(':id/agent-runtimes/launch')
  @ApiOperation({ summary: 'Launch a local Hermes runtime for a project role' })
  launchAgentRuntime(
    @Param('id') projectId: string,
    @Request() req: any,
    @Body() dto: LaunchProjectAgentRuntimeDto,
  ) {
    return this.projectsService.launchAgentRuntime(projectId, req.user.id, dto);
  }

  @Post(':id/agent-runtimes/:memberId/reconnect')
  @ApiOperation({ summary: 'Reconnect a stopped or unavailable local agent runtime' })
  reconnectAgentRuntime(
    @Param('id') projectId: string,
    @Param('memberId') memberId: string,
    @Request() req: any,
  ) {
    return this.projectsService.reconnectAgentRuntime(projectId, memberId, req.user.id);
  }

  @Post(':id/template/refresh')
  @ApiOperation({ summary: 'Refresh the saved project template role snapshot from the current template definition' })
  refreshProjectTemplate(
    @Param('id') projectId: string,
    @Request() req: any,
    @Body() dto: RefreshProjectTemplateDto,
  ) {
    return this.projectsService.refreshProjectTemplate(projectId, req.user.id, dto);
  }

  @Patch(':id/roles/:role/prompt')
  @ApiOperation({ summary: 'Update the project-level prompt override for a role' })
  updateProjectRolePrompt(
    @Param('id') projectId: string,
    @Param('role') role: string,
    @Request() req: any,
    @Body() dto: UpdateProjectRolePromptDto,
  ) {
    return this.projectsService.updateProjectRolePrompt(projectId, role, req.user.id, dto);
  }

  @Get(':id/roles/:role/skills')
  @ApiOperation({ summary: 'Get the project-level skill override for a role' })
  getProjectRoleSkills(
    @Param('id') projectId: string,
    @Param('role') role: string,
    @Request() req: any,
  ) {
    return this.projectsService.getProjectRoleSkills(projectId, role, req.user.id);
  }

  @Patch(':id/roles/:role/skills')
  @ApiOperation({ summary: 'Update the project-level skill override for a role' })
  updateProjectRoleSkills(
    @Param('id') projectId: string,
    @Param('role') role: string,
    @Request() req: any,
    @Body() dto: UpdateProjectRoleSkillsDto,
  ) {
    return this.projectsService.updateProjectRoleSkills(projectId, role, req.user.id, dto);
  }

  @Post(':id/agent-runtimes/local-runner/claim')
  @ApiOperation({ summary: 'Claim a pending local-runner agent runtime launch job' })
  claimLocalRunnerAgentRuntime(
    @Param('id') projectId: string,
    @Request() req: any,
    @Query('memberId') memberId?: string,
  ) {
    return this.projectsService.claimLocalRunnerAgentRuntime(projectId, req.user.id, memberId);
  }

  @Post(':id/agent-runtimes/local-runner/token')
  @ApiOperation({ summary: 'Create a project-scoped local runner token' })
  createLocalRunnerToken(
    @Param('id') projectId: string,
    @Request() req: any,
    @Body() dto: any,
  ) {
    return this.projectsService.createLocalRunnerToken(projectId, req.user.id, dto);
  }

  @Post(':id/agent-runtimes/local-runner/heartbeat')
  @ApiOperation({ summary: 'Refresh project-level local-runner presence' })
  heartbeatLocalRunner(
    @Param('id') projectId: string,
    @Request() req: any,
    @Body() dto: any,
  ) {
    return this.projectsService.heartbeatProjectLocalRunner(projectId, req.user.id, 'local-runner', dto);
  }

  @Post(':id/agent-runtimes/local-runner/disconnect')
  @ApiOperation({ summary: 'Disconnect project-level local-runner presence' })
  disconnectProjectLocalRunner(
    @Param('id') projectId: string,
    @Request() req: any,
    @Body() dto: any,
  ) {
    return this.projectsService.disconnectProjectLocalRunner(projectId, req.user.id, 'local-runner', dto);
  }

  @Post(':id/agent-runtimes/:memberId/local-runner/complete')
  @ApiOperation({ summary: 'Complete a local-runner agent runtime launch job' })
  completeLocalRunnerAgentRuntime(
    @Param('id') projectId: string,
    @Param('memberId') memberId: string,
    @Request() req: any,
    @Body() dto: any,
  ) {
    return this.projectsService.completeLocalRunnerAgentRuntime(projectId, memberId, req.user.id, dto);
  }

  @Post(':id/agent-runtimes/:memberId/local-runner/disconnect')
  @ApiOperation({ summary: 'Disconnect a local-runner agent runtime' })
  disconnectLocalRunnerAgentRuntime(
    @Param('id') projectId: string,
    @Param('memberId') memberId: string,
    @Request() req: any,
    @Body() dto: any,
  ) {
    return this.projectsService.disconnectLocalRunnerAgentRuntime(projectId, memberId, req.user.id, dto);
  }

  @Post(':id/agent-runtimes/:memberId/local-runner/requests/next')
  @ApiOperation({ summary: 'Fetch the next queued local-runner runtime message request' })
  nextLocalRunnerAgentRuntimeRequest(
    @Param('id') projectId: string,
    @Param('memberId') memberId: string,
    @Request() req: any,
  ) {
    return this.projectsService.nextLocalRunnerAgentRuntimeRequest(projectId, memberId, req.user.id);
  }

  @Post(':id/agent-runtimes/:memberId/local-runner/requests/:requestId/complete')
  @ApiOperation({ summary: 'Complete a local-runner runtime message request' })
  completeLocalRunnerAgentRuntimeRequest(
    @Param('id') projectId: string,
    @Param('memberId') memberId: string,
    @Param('requestId') requestId: string,
    @Request() req: any,
    @Body() dto: any,
  ) {
    return this.projectsService.completeLocalRunnerAgentRuntimeRequest(projectId, memberId, req.user.id, requestId, dto);
  }

  @Post(':id/agent-runtimes/:memberId/local-runner/requests/:requestId/progress')
  @ApiOperation({ summary: 'Report local-runner runtime message progress' })
  progressLocalRunnerAgentRuntimeRequest(
    @Param('id') projectId: string,
    @Param('memberId') memberId: string,
    @Param('requestId') requestId: string,
    @Request() req: any,
    @Body() dto: any,
  ) {
    return this.projectsService.progressLocalRunnerAgentRuntimeRequest(projectId, memberId, req.user.id, requestId, dto);
  }

  @Post(':id/agent-runtimes/local-codex/claim')
  @ApiOperation({ summary: 'Claim a pending local-codex agent runtime launch job' })
  claimLocalCodexAgentRuntime(
    @Param('id') projectId: string,
    @Request() req: any,
    @Query('memberId') memberId?: string,
  ) {
    return this.projectsService.claimLocalCodexAgentRuntime(projectId, req.user.id, memberId);
  }

  @Post(':id/agent-runtimes/local-codex/token')
  @ApiOperation({ summary: 'Create a project-scoped local Codex token' })
  createLocalCodexToken(
    @Param('id') projectId: string,
    @Request() req: any,
    @Body() dto: any,
  ) {
    return this.projectsService.createLocalRunnerToken(projectId, req.user.id, {
      ...dto,
      name: dto?.name || 'Local Codex',
    });
  }

  @Post(':id/agent-runtimes/local-codex/heartbeat')
  @ApiOperation({ summary: 'Refresh project-level local-codex presence' })
  heartbeatLocalCodex(
    @Param('id') projectId: string,
    @Request() req: any,
    @Body() dto: any,
  ) {
    return this.projectsService.heartbeatProjectLocalRunner(projectId, req.user.id, 'local-codex', dto);
  }

  @Post(':id/agent-runtimes/local-codex/disconnect')
  @ApiOperation({ summary: 'Disconnect project-level local-codex presence' })
  disconnectProjectLocalCodex(
    @Param('id') projectId: string,
    @Request() req: any,
    @Body() dto: any,
  ) {
    return this.projectsService.disconnectProjectLocalRunner(projectId, req.user.id, 'local-codex', dto);
  }

  @Post(':id/agent-runtimes/:memberId/local-codex/complete')
  @ApiOperation({ summary: 'Complete a local-codex agent runtime launch job' })
  completeLocalCodexAgentRuntime(
    @Param('id') projectId: string,
    @Param('memberId') memberId: string,
    @Request() req: any,
    @Body() dto: any,
  ) {
    return this.projectsService.completeLocalCodexAgentRuntime(projectId, memberId, req.user.id, dto);
  }

  @Post(':id/agent-runtimes/:memberId/local-codex/disconnect')
  @ApiOperation({ summary: 'Disconnect a local-codex agent runtime' })
  disconnectLocalCodexAgentRuntime(
    @Param('id') projectId: string,
    @Param('memberId') memberId: string,
    @Request() req: any,
    @Body() dto: any,
  ) {
    return this.projectsService.disconnectLocalCodexAgentRuntime(projectId, memberId, req.user.id, dto);
  }

  @Post(':id/agent-runtimes/:memberId/local-codex/requests/next')
  @ApiOperation({ summary: 'Fetch the next queued local-codex runtime message request' })
  nextLocalCodexAgentRuntimeRequest(
    @Param('id') projectId: string,
    @Param('memberId') memberId: string,
    @Request() req: any,
  ) {
    return this.projectsService.nextLocalCodexAgentRuntimeRequest(projectId, memberId, req.user.id);
  }

  @Post(':id/agent-runtimes/:memberId/local-codex/requests/:requestId/complete')
  @ApiOperation({ summary: 'Complete a local-codex runtime message request' })
  completeLocalCodexAgentRuntimeRequest(
    @Param('id') projectId: string,
    @Param('memberId') memberId: string,
    @Param('requestId') requestId: string,
    @Request() req: any,
    @Body() dto: any,
  ) {
    return this.projectsService.completeLocalCodexAgentRuntimeRequest(projectId, memberId, req.user.id, requestId, dto);
  }

  @Post(':id/agent-runtimes/:memberId/local-codex/requests/:requestId/progress')
  @ApiOperation({ summary: 'Report local-codex runtime message progress' })
  progressLocalCodexAgentRuntimeRequest(
    @Param('id') projectId: string,
    @Param('memberId') memberId: string,
    @Param('requestId') requestId: string,
    @Request() req: any,
    @Body() dto: any,
  ) {
    return this.projectsService.progressLocalCodexAgentRuntimeRequest(projectId, memberId, req.user.id, requestId, dto);
  }

  @Post(':id/agent-runtimes/:memberId/messages')
  @ApiOperation({ summary: 'Send a message to a launched agent runtime through its IM gateway' })
  sendAgentRuntimeMessage(
    @Param('id') projectId: string,
    @Param('memberId') memberId: string,
    @Request() req: any,
    @Body() dto: SendProjectAgentMessageDto,
  ) {
    return this.projectsService.sendAgentRuntimeMessage(projectId, memberId, req.user.id, dto);
  }

  @Get(':id/agent-runtimes/:memberId/messages/stream')
  @ApiOperation({ summary: 'Stream live agent runtime message updates' })
  async streamAgentRuntimeMessages(
    @Param('id') projectId: string,
    @Param('memberId') memberId: string,
    @Request() req: any,
    @Res() res: Response,
  ) {
    const writeEvent = (event: { type?: string; [key: string]: any }) => {
      res.write(`event: ${event.type || 'message'}\n`);
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    const subscription = await this.projectsService.subscribeAgentRuntimeSessionEvents(
      projectId,
      memberId,
      req.user.id,
      writeEvent,
    );

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();
    writeEvent(subscription.snapshot);

    const heartbeat = setInterval(() => {
      writeEvent({
        type: 'heartbeat',
        projectId,
        memberId,
        at: new Date().toISOString(),
      });
    }, 15000);

    req.on?.('close', () => {
      clearInterval(heartbeat);
      subscription.close();
      res.end();
    });
  }

  @Post(':id/agent-runtimes/:memberId/conversations')
  @ApiOperation({ summary: 'Start a new conversation session for a launched agent runtime' })
  createAgentRuntimeConversation(
    @Param('id') projectId: string,
    @Param('memberId') memberId: string,
    @Request() req: any,
  ) {
    return this.projectsService.createAgentRuntimeConversation(projectId, memberId, req.user.id);
  }

  @Patch(':id/agent-runtimes/:memberId/conversations/:conversationId')
  @ApiOperation({ summary: 'Rename an agent runtime conversation session' })
  updateAgentRuntimeConversation(
    @Param('id') projectId: string,
    @Param('memberId') memberId: string,
    @Param('conversationId') conversationId: string,
    @Request() req: any,
    @Body() dto: UpdateProjectAgentRuntimeConversationDto,
  ) {
    return this.projectsService.updateAgentRuntimeConversation(projectId, memberId, conversationId, req.user.id, dto);
  }

  @Delete(':id/agent-runtimes/:memberId/conversations/:conversationId')
  @ApiOperation({ summary: 'Delete an agent runtime conversation session' })
  deleteAgentRuntimeConversation(
    @Param('id') projectId: string,
    @Param('memberId') memberId: string,
    @Param('conversationId') conversationId: string,
    @Request() req: any,
  ) {
    return this.projectsService.deleteAgentRuntimeConversation(projectId, memberId, conversationId, req.user.id);
  }

  @Patch(':id/members/:memberId/polling')
  @ApiOperation({ summary: 'Update timed polling configuration for a project member agent instance' })
  updateAgentRuntimePollingConfig(
    @Param('id') projectId: string,
    @Param('memberId') memberId: string,
    @Request() req: any,
    @Body() dto: UpdateProjectAgentPollingConfigDto,
  ) {
    return this.projectsService.updateAgentRuntimePollingConfig(projectId, memberId, req.user.id, dto);
  }

  @Post(':id/agent-runtimes/:memberId/polling/tick')
  @ApiOperation({ summary: 'Trigger agent timed polling, optionally forcing a run before the next scheduled time' })
  @ApiQuery({ name: 'force', required: false, description: 'Set true to run now even if polling is not due yet.' })
  @ApiQuery({ name: 'summary', required: false, description: 'Set true to return a compact runtime session.' })
  tickAgentRuntimePolling(
    @Param('id') projectId: string,
    @Param('memberId') memberId: string,
    @Request() req: any,
    @Body() body?: { force?: boolean | string; summary?: boolean | string },
    @Query('force') force?: string,
    @Query('summary') summary?: string,
  ) {
    const bodyForce = body?.force;
    const bodySummary = body?.summary;
    return this.projectsService.tickAgentRuntimePolling(projectId, memberId, req.user.id, {
      force: String(force ?? bodyForce ?? '').toLowerCase() === 'true' || bodyForce === true,
      summary: summary === 'true' || summary === '1' || bodySummary === true || String(bodySummary || '').toLowerCase() === 'true',
    });
  }

  @Post(':id/agent-runtimes/:memberId/messages/cancel')
  @ApiOperation({ summary: 'Cancel or recover the current agent runtime message stream' })
  @ApiQuery({ name: 'summary', required: false, description: 'Set true to return a compact runtime session.' })
  cancelAgentRuntimeMessage(
    @Param('id') projectId: string,
    @Param('memberId') memberId: string,
    @Request() req: any,
    @Query('summary') summary?: string,
  ) {
    return this.projectsService.cancelAgentRuntimeMessage(projectId, memberId, req.user.id, {
      summary: summary === 'true' || summary === '1',
    });
  }

  @Get(':id/agent-runtimes/:memberId/workspace')
  @ApiOperation({ summary: 'List generated files in an agent runtime workspace' })
  @ApiQuery({ name: 'maxDepth', required: false, type: Number })
  listAgentRuntimeWorkspaceFiles(
    @Param('id') projectId: string,
    @Param('memberId') memberId: string,
    @Request() req: any,
    @Query('maxDepth') maxDepth?: string,
  ) {
    return this.projectsService.listAgentRuntimeWorkspaceFiles(
      projectId,
      memberId,
      req.user.id,
      maxDepth ? parseInt(maxDepth, 10) : undefined,
    );
  }

  @Get(':id/agent-runtimes/:memberId/workspace/download')
  @ApiOperation({ summary: 'Download a generated file from an agent runtime workspace' })
  @ApiQuery({ name: 'path', required: true })
  async downloadAgentRuntimeWorkspaceFile(
    @Param('id') projectId: string,
    @Param('memberId') memberId: string,
    @Request() req: any,
    @Query('path') filePath: string,
    @Res() res: Response,
  ) {
    const file = await this.projectsService.downloadAgentRuntimeWorkspaceFile(
      projectId,
      memberId,
      req.user.id,
      filePath,
    );
    const encodedName = encodeURIComponent(file.filename);
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Length', file.content.length);
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename.replace(/"/g, '')}"; filename*=UTF-8''${encodedName}`);
    res.send(file.content);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a project' })
  updateProject(@Param('id') projectId: string, @Request() req: any, @Body() dto: UpdateProjectDto) {
    return this.projectsService.updateProject(projectId, req.user.id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft delete a project' })
  deleteProject(@Param('id') projectId: string, @Request() req: any, @Body() dto: DeleteProjectDto) {
    return this.projectsService.deleteProject(projectId, req.user.id, dto);
  }

  @Post(':id/templates')
  @ApiOperation({ summary: 'Save the current project configuration as a personal project template' })
  saveProjectTemplate(
    @Param('id') projectId: string,
    @Request() req: any,
    @Body() dto: SaveProjectTemplateDto,
  ) {
    return this.projectsService.saveProjectAsPersonalTemplate(projectId, req.user.id, dto);
  }

  @Get(':id/members')
  @ApiOperation({ summary: 'List active project members' })
  listMembers(@Param('id') projectId: string, @Request() req: any) {
    return this.projectsService.listMembers(projectId, req.user.id);
  }

  @Post(':id/members')
  @ApiOperation({ summary: 'Hire or add a project member' })
  addMember(@Param('id') projectId: string, @Request() req: any, @Body() dto: CreateProjectMemberDto) {
    return this.projectsService.addMember(projectId, req.user.id, dto);
  }

  @Delete(':id/members/:memberId')
  @ApiOperation({ summary: 'Remove or dismiss a project member' })
  removeMember(
    @Param('id') projectId: string,
    @Param('memberId') memberId: string,
    @Request() req: any,
  ) {
    return this.projectsService.removeMember(projectId, memberId, req.user.id);
  }

  @Post(':id/activate')
  @ApiOperation({ summary: 'Set project status to ACTIVE' })
  activateProject(@Param('id') projectId: string, @Request() req: any) {
    return this.projectsService.setProjectStatus(projectId, req.user.id, 'ACTIVE');
  }

  @Post(':id/pause')
  @ApiOperation({ summary: 'Set project status to PAUSED' })
  pauseProject(@Param('id') projectId: string, @Request() req: any) {
    return this.projectsService.setProjectStatus(projectId, req.user.id, 'PAUSED');
  }

  @Post(':id/archive')
  @ApiOperation({ summary: 'Set project status to ARCHIVED' })
  archiveProject(@Param('id') projectId: string, @Request() req: any) {
    return this.projectsService.setProjectStatus(projectId, req.user.id, 'ARCHIVED');
  }

  @Post(':id/goals')
  @ApiOperation({ summary: 'Create a project goal' })
  createGoal(@Param('id') projectId: string, @Request() req: any, @Body() dto: CreateProjectGoalDto) {
    return this.projectsService.createGoal(projectId, req.user.id, dto);
  }

  @Get(':id/goals')
  @ApiOperation({ summary: 'List project goals' })
  listGoals(@Param('id') projectId: string, @Request() req: any) {
    return this.projectsService.listGoals(projectId, req.user.id);
  }

  @Get(':id/goals/:goalId/globals')
  @ApiOperation({ summary: 'List goal-scoped runtime variables' })
  listGoalGlobals(
    @Param('id') projectId: string,
    @Param('goalId') goalId: string,
    @Request() req: any,
  ) {
    return this.projectsService.listGoalGlobals(projectId, goalId, req.user.id);
  }

  @Put(':id/goals/:goalId/globals')
  @ApiOperation({ summary: 'Update goal-scoped runtime variables' })
  updateGoalGlobals(
    @Param('id') projectId: string,
    @Param('goalId') goalId: string,
    @Request() req: any,
    @Body() dto: UpdateProjectGoalGlobalsDto,
  ) {
    return this.projectsService.updateGoalGlobals(projectId, goalId, req.user.id, dto);
  }

  @Patch(':id/goals/:goalId')
  @ApiOperation({ summary: 'Update a project goal (safe fields only)' })
  updateGoal(
    @Param('id') projectId: string,
    @Param('goalId') goalId: string,
    @Request() req: any,
    @Body() dto: UpdateProjectGoalDto,
  ) {
    return this.projectsService.updateGoal(projectId, goalId, req.user.id, dto);
  }

  @Post(':id/goals/:goalId/close')
  @ApiOperation({
    summary:
      'Close a project goal with cascading cancellation of features, work items, assignments, and runs.',
  })
  closeGoal(
    @Param('id') projectId: string,
    @Param('goalId') goalId: string,
    @Request() req: any,
    @Body() dto: CloseProjectGoalDto,
  ) {
    return this.projectsService.closeGoal(projectId, goalId, req.user.id, dto);
  }

  @Delete(':id/goals/:goalId')
  @ApiOperation({
    summary:
      'Delete a project goal after optionally cascading cancellation of linked unfinished work.',
  })
  deleteGoal(
    @Param('id') projectId: string,
    @Param('goalId') goalId: string,
    @Request() req: any,
    @Body() dto: DeleteProjectGoalDto,
  ) {
    return this.projectsService.deleteGoal(projectId, goalId, req.user.id, dto);
  }

  @Post(':id/goals/:goalId/reopen')
  @ApiOperation({
    summary:
      'Reopen a cancelled goal. Always requires the ProjectProposal approval flow (M2). Currently returns 400.',
  })
  reopenGoal(
    @Param('id') projectId: string,
    @Param('goalId') goalId: string,
    @Request() req: any,
  ) {
    return this.projectsService.reopenGoal(projectId, goalId, req.user.id);
  }

  @Get(':id/members/:memberId/capabilities')
  @ApiOperation({ summary: 'List capability tags for a project member' })
  listMemberCapabilities(
    @Param('id') projectId: string,
    @Param('memberId') memberId: string,
    @Request() req: any,
  ) {
    return this.projectsService.listMemberCapabilities(projectId, memberId, req.user.id);
  }

  @Post(':id/members/:memberId/capabilities')
  @ApiOperation({ summary: 'Attach or upsert a capability tag on a project member' })
  addMemberCapability(
    @Param('id') projectId: string,
    @Param('memberId') memberId: string,
    @Request() req: any,
    @Body() dto: CreateProjectMemberCapabilityDto,
  ) {
    return this.projectsService.addMemberCapability(projectId, memberId, req.user.id, dto);
  }

  @Delete(':id/members/:memberId/capabilities/:capabilityId')
  @ApiOperation({ summary: 'Remove a capability tag from a project member' })
  removeMemberCapability(
    @Param('id') projectId: string,
    @Param('memberId') memberId: string,
    @Param('capabilityId') capabilityId: string,
    @Request() req: any,
  ) {
    return this.projectsService.removeMemberCapability(projectId, memberId, capabilityId, req.user.id);
  }

  @Post(':id/features')
  @ApiOperation({ summary: 'Create a project feature' })
  createFeature(@Param('id') projectId: string, @Request() req: any, @Body() dto: CreateProjectFeatureDto) {
    return this.projectsService.createFeature(projectId, req.user.id, dto);
  }

  @Get(':id/features')
  @ApiOperation({ summary: 'List project features' })
  listFeatures(@Param('id') projectId: string, @Request() req: any) {
    return this.projectsService.listFeatures(projectId, req.user.id);
  }

  @Post(':id/work-items')
  @ApiOperation({ summary: 'Create a project work item' })
  createWorkItem(@Param('id') projectId: string, @Request() req: any, @Body() dto: CreateProjectWorkItemDto) {
    return this.projectsService.createWorkItem(projectId, req.user.id, dto);
  }

  @Get(':id/work-items')
  @ApiOperation({ summary: 'List project work items' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'goalId', required: false })
  @ApiQuery({ name: 'featureId', required: false })
  @ApiQuery({ name: 'ownerId', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'q', required: false })
  @ApiQuery({ name: 'includeClosed', required: false, type: Boolean })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  listWorkItems(
    @Param('id') projectId: string,
    @Request() req: any,
    @Query('status') status?: string,
    @Query('goalId') goalId?: string,
    @Query('featureId') featureId?: string,
    @Query('ownerId') ownerId?: string,
    @Query('search') search?: string,
    @Query('q') q?: string,
    @Query('includeClosed') includeClosed?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.projectsService.listWorkItems(projectId, req.user.id, {
      status,
      goalId,
      featureId,
      ownerId,
      search: search || q,
      includeClosed: includeClosed === undefined ? undefined : includeClosed === 'true',
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get(':id/work-items/:workItemId')
  @ApiOperation({ summary: 'Get project work item detail' })
  getWorkItem(@Param('id') projectId: string, @Param('workItemId') workItemId: string, @Request() req: any) {
    return this.projectsService.getWorkItem(projectId, workItemId, req.user.id);
  }

  @Get(':id/work-items/:workItemId/comments')
  @ApiOperation({ summary: 'List comments for a project work item' })
  listWorkItemComments(
    @Param('id') projectId: string,
    @Param('workItemId') workItemId: string,
    @Request() req: any,
  ) {
    return this.projectsService.listWorkItemComments(projectId, workItemId, req.user.id);
  }

  @Post(':id/work-items/:workItemId/comments')
  @ApiOperation({ summary: 'Add a comment to a project work item' })
  createWorkItemComment(
    @Param('id') projectId: string,
    @Param('workItemId') workItemId: string,
    @Request() req: any,
    @Body() dto: CreateProjectWorkItemCommentDto,
  ) {
    return this.projectsService.createWorkItemComment(projectId, workItemId, req.user.id, dto);
  }

  @Patch(':id/work-items/:workItemId')
  @ApiOperation({ summary: 'Update a project work item' })
  updateWorkItem(
    @Param('id') projectId: string,
    @Param('workItemId') workItemId: string,
    @Request() req: any,
    @Body() dto: UpdateProjectWorkItemDto,
  ) {
    return this.projectsService.updateWorkItem(projectId, workItemId, req.user.id, dto);
  }

  @Post(':id/work-items/:workItemId/assignments')
  @ApiOperation({ summary: 'Assign a user or agent to a work item' })
  createAssignment(
    @Param('id') projectId: string,
    @Param('workItemId') workItemId: string,
    @Request() req: any,
    @Body() dto: CreateProjectAssignmentDto,
  ) {
    return this.projectsService.createAssignment(projectId, workItemId, req.user.id, dto);
  }

  @Patch(':id/work-items/:workItemId/assignments/:assignmentId')
  @ApiOperation({ summary: 'Update assignment status or objective' })
  updateAssignment(
    @Param('id') projectId: string,
    @Param('workItemId') workItemId: string,
    @Param('assignmentId') assignmentId: string,
    @Request() req: any,
    @Body() dto: UpdateProjectAssignmentDto,
  ) {
    return this.projectsService.updateAssignment(projectId, workItemId, assignmentId, req.user.id, dto);
  }

  @Post(':id/runs')
  @ApiOperation({ summary: 'Create a project run' })
  createRun(@Param('id') projectId: string, @Request() req: any, @Body() dto: CreateProjectRunDto) {
    return this.projectsService.createRun(projectId, req.user.id, dto);
  }

  @Get(':id/runs/:runId')
  @ApiOperation({ summary: 'Get a project run detail' })
  getRun(@Param('id') projectId: string, @Param('runId') runId: string, @Request() req: any) {
    return this.projectsService.getRun(projectId, runId, req.user.id);
  }

  @Patch(':id/runs/:runId')
  @ApiOperation({ summary: 'Update a project run status or result' })
  updateRun(
    @Param('id') projectId: string,
    @Param('runId') runId: string,
    @Request() req: any,
    @Body() dto: UpdateProjectRunDto,
  ) {
    return this.projectsService.updateRun(projectId, runId, req.user.id, dto);
  }

  @Get(':id/runs/:runId/logs')
  @ApiOperation({ summary: 'List logs for a project run' })
  listRunLogs(@Param('id') projectId: string, @Param('runId') runId: string, @Request() req: any) {
    return this.projectsService.listRunLogs(projectId, runId, req.user.id);
  }

  @Post(':id/runs/:runId/logs')
  @ApiOperation({ summary: 'Append a log entry to a project run' })
  createRunLog(
    @Param('id') projectId: string,
    @Param('runId') runId: string,
    @Request() req: any,
    @Body() dto: CreateProjectRunLogDto,
  ) {
    return this.projectsService.createRunLog(projectId, runId, req.user.id, dto);
  }

  @Post(':id/artifacts')
  @UseInterceptors(FilesInterceptor('attachments', 10, { limits: { fileSize: 100 * 1024 * 1024 } }))
  @ApiConsumes('application/json', 'multipart/form-data')
  @ApiOperation({ summary: 'Create a project artifact' })
  createArtifact(
    @Param('id') projectId: string,
    @Request() req: any,
    @Body() dto: CreateProjectArtifactDto,
    @UploadedFiles() attachments?: Express.Multer.File[],
  ) {
    return this.projectsService.createArtifact(projectId, req.user.id, dto, attachments);
  }

  @Get(':id/artifacts')
  @ApiOperation({ summary: 'List project artifacts' })
  @ApiQuery({ name: 'workItemId', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  listArtifacts(
    @Param('id') projectId: string,
    @Request() req: any,
    @Query('workItemId') workItemId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.projectsService.listArtifacts(projectId, req.user.id, {
      workItemId,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Post(':id/reviews')
  @ApiOperation({ summary: 'Create a project review' })
  createReview(@Param('id') projectId: string, @Request() req: any, @Body() dto: CreateProjectReviewDto) {
    return this.projectsService.createReview(projectId, req.user.id, dto);
  }

  @Get(':id/reviews')
  @ApiOperation({ summary: 'List project reviews' })
  @ApiQuery({ name: 'workItemId', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  listReviews(
    @Param('id') projectId: string,
    @Request() req: any,
    @Query('workItemId') workItemId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.projectsService.listReviews(projectId, req.user.id, {
      workItemId,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Post(':id/memories')
  @ApiOperation({ summary: 'Create a project memory entry' })
  createMemory(@Param('id') projectId: string, @Request() req: any, @Body() dto: CreateProjectMemoryDto) {
    return this.projectsService.createMemory(projectId, req.user.id, dto);
  }

  @Get(':id/memories')
  @ApiOperation({ summary: 'List project memories' })
  @ApiQuery({ name: 'memoryType', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  listMemories(
    @Param('id') projectId: string,
    @Request() req: any,
    @Query('memoryType') memoryType?: string,
    @Query('limit') limit?: string,
  ) {
    return this.projectsService.listMemories(projectId, req.user.id, {
      memoryType,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }
}
