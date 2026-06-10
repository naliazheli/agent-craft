import { Body, Controller, Get, Headers, Param, Patch, Post, Query, UnauthorizedException } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ProjectsService } from './projects.service';

@ApiTags('projects')
@Controller('projects')
export class ProjectsRuntimeController {
  constructor(private readonly projectsService: ProjectsService) {}

  private bearerToken(authorization?: string) {
    const match = /^Bearer\s+(.+)$/i.exec(String(authorization || '').trim());
    if (!match) {
      throw new UnauthorizedException('Missing runtime token');
    }
    return match[1];
  }

  @Post(':id/agent-runtimes/runtime/launch')
  @ApiOperation({ summary: 'Launch a project agent runtime from an authorized lead runtime' })
  launchAgentRuntimeFromRuntime(
    @Param('id') projectId: string,
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: any,
  ) {
    return this.projectsService.launchAgentRuntimeFromRuntime(
      projectId,
      this.bearerToken(authorization),
      dto,
    );
  }

  @Get(':id/assignments/runtime-state')
  @ApiOperation({ summary: 'List assignment and assignee runtime state from an authorized lead runtime' })
  @ApiQuery({ name: 'workItemId', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  listAssignmentRuntimeStateFromRuntime(
    @Param('id') projectId: string,
    @Headers('authorization') authorization: string | undefined,
    @Query('workItemId') workItemId?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
  ) {
    return this.projectsService.listAssignmentRuntimeStateFromRuntime(
      projectId,
      this.bearerToken(authorization),
      {
        workItemId,
        status,
        limit: limit ? parseInt(limit, 10) : undefined,
      },
    );
  }

  @Post(':id/goals/runtime-create')
  @ApiOperation({ summary: 'Create a project goal from an authorized lead runtime' })
  createGoalFromRuntime(
    @Param('id') projectId: string,
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: any,
  ) {
    return this.projectsService.createGoalFromRuntime(
      projectId,
      this.bearerToken(authorization),
      dto,
    );
  }

  @Patch(':id/goals/:goalId/runtime-update')
  @ApiOperation({ summary: 'Update a project goal from an authorized lead or planner runtime' })
  updateGoalFromRuntime(
    @Param('id') projectId: string,
    @Param('goalId') goalId: string,
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: any,
  ) {
    return this.projectsService.updateGoalFromRuntime(
      projectId,
      goalId,
      this.bearerToken(authorization),
      dto,
    );
  }

  @Post(':id/goals/:goalId/runtime-update')
  @ApiOperation({ summary: 'Compatibility alias for updating a project goal from an authorized runtime' })
  updateGoalFromRuntimePost(
    @Param('id') projectId: string,
    @Param('goalId') goalId: string,
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: any,
  ) {
    return this.projectsService.updateGoalFromRuntime(
      projectId,
      goalId,
      this.bearerToken(authorization),
      dto,
    );
  }

  @Post(':id/work-items/runtime-create')
  @ApiOperation({ summary: 'Create a dispatchable work item from an authorized project runtime' })
  createWorkItemFromRuntime(
    @Param('id') projectId: string,
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: any,
  ) {
    return this.projectsService.createWorkItemFromRuntime(
      projectId,
      this.bearerToken(authorization),
      dto,
    );
  }

  @Post(':id/work-items/:workItemId/assignments/runtime-dispatch')
  @ApiOperation({ summary: 'Dispatch a work item from an authorized lead runtime' })
  dispatchWorkItemFromRuntime(
    @Param('id') projectId: string,
    @Param('workItemId') workItemId: string,
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: any,
  ) {
    return this.projectsService.dispatchWorkItemFromRuntime(
      projectId,
      workItemId,
      this.bearerToken(authorization),
      dto,
    );
  }

  @Post(':id/work-items/:workItemId/assignments/runtime-claim')
  @ApiOperation({ summary: 'Self-claim an eligible work item from an authorized worker runtime' })
  claimWorkItemFromRuntime(
    @Param('id') projectId: string,
    @Param('workItemId') workItemId: string,
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: any,
  ) {
    return this.projectsService.claimWorkItemFromRuntime(
      projectId,
      workItemId,
      this.bearerToken(authorization),
      dto,
    );
  }

  @Patch(':id/work-items/:workItemId/runtime-update')
  @ApiOperation({ summary: 'Update a work item from an authorized project runtime' })
  updateWorkItemFromRuntime(
    @Param('id') projectId: string,
    @Param('workItemId') workItemId: string,
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: any,
  ) {
    return this.projectsService.updateWorkItemFromRuntime(
      projectId,
      workItemId,
      this.bearerToken(authorization),
      dto,
    );
  }

  @Post(':id/work-items/:workItemId/runtime-comments')
  @ApiOperation({ summary: 'Add a work item comment from an authorized project runtime' })
  createWorkItemCommentFromRuntime(
    @Param('id') projectId: string,
    @Param('workItemId') workItemId: string,
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: any,
  ) {
    return this.projectsService.createWorkItemCommentFromRuntime(
      projectId,
      workItemId,
      this.bearerToken(authorization),
      dto,
    );
  }

  @Get(':id/work-items/:workItemId/runtime-comments')
  @ApiOperation({ summary: 'List work item comments from an authorized project runtime' })
  listWorkItemCommentsFromRuntime(
    @Param('id') projectId: string,
    @Param('workItemId') workItemId: string,
    @Headers('authorization') authorization: string | undefined,
  ) {
    return this.projectsService.listWorkItemCommentsFromRuntime(
      projectId,
      workItemId,
      this.bearerToken(authorization),
    );
  }

  @Patch(':id/work-items/:workItemId/assignments/:assignmentId/runtime-update')
  @ApiOperation({ summary: 'Update an assignment from its authorized assignee runtime' })
  updateAssignmentFromRuntime(
    @Param('id') projectId: string,
    @Param('workItemId') workItemId: string,
    @Param('assignmentId') assignmentId: string,
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: any,
  ) {
    return this.projectsService.updateAssignmentFromRuntime(
      projectId,
      workItemId,
      assignmentId,
      this.bearerToken(authorization),
      dto,
    );
  }
}
