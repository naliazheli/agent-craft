import { Controller, Get, Headers, Param, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { ProjectsService } from './projects.service';

@ApiTags('projects-public')
@Controller('public/projects')
export class ProjectsPublicController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  @ApiOperation({ summary: 'List public projects' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  listProjects(
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.projectsService.listProjects(undefined, {
      status,
      search,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get public project detail' })
  getProject(@Param('id') projectId: string) {
    return this.projectsService.getProject(projectId, undefined);
  }

  @Get(':id/board')
  @ApiOperation({ summary: 'Get public project board summary' })
  getProjectBoard(@Param('id') projectId: string) {
    return this.projectsService.getProjectBoard(projectId, undefined);
  }

  @Get(':id/activity')
  @ApiOperation({ summary: 'List public project activity' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  listProjectActivity(@Param('id') projectId: string, @Query('limit') limit?: string) {
    return this.projectsService.listProjectActivity(
      projectId,
      undefined,
      limit ? parseInt(limit, 10) : undefined,
    );
  }

  @Get(':id/events')
  @ApiOperation({ summary: 'List public durable project events' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'sinceSeq', required: false, type: Number })
  @ApiQuery({ name: 'types', required: false, type: String })
  @ApiQuery({ name: 'refType', required: false, type: String })
  @ApiQuery({ name: 'refId', required: false, type: String })
  @ApiQuery({ name: 'workItemId', required: false, type: String })
  listProjectEvents(
    @Param('id') projectId: string,
    @Query('limit') limit?: string,
    @Query('sinceSeq') sinceSeq?: string,
    @Query('types') types?: string,
    @Query('refType') refType?: string,
    @Query('refId') refId?: string,
    @Query('workItemId') workItemId?: string,
  ) {
    return this.projectsService.listProjectEvents(projectId, undefined, {
      limit: limit ? parseInt(limit, 10) : undefined,
      sinceSeq: sinceSeq ? parseInt(sinceSeq, 10) : undefined,
      types: types ? types.split(',').map((item) => item.trim()).filter(Boolean) : undefined,
      refType,
      refId,
      workItemId,
    });
  }

  @Get(':id/event-graph')
  @ApiOperation({ summary: 'Get public project event relationship graph' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getProjectEventGraph(@Param('id') projectId: string, @Query('limit') limit?: string) {
    return this.projectsService.getProjectEventGraph(
      projectId,
      undefined,
      limit ? parseInt(limit, 10) : undefined,
    );
  }

  @Get(':id/work-items')
  @ApiOperation({ summary: 'List public project work items' })
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
    return this.projectsService.listWorkItems(projectId, undefined, {
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

  @Get(':id/artifacts')
  @ApiOperation({ summary: 'List public project artifacts' })
  @ApiQuery({ name: 'workItemId', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  listArtifacts(
    @Param('id') projectId: string,
    @Query('workItemId') workItemId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.projectsService.listArtifacts(projectId, undefined, {
      workItemId,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get(':id/reviews')
  @ApiOperation({ summary: 'List public project reviews' })
  @ApiQuery({ name: 'workItemId', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  listReviews(
    @Param('id') projectId: string,
    @Query('workItemId') workItemId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.projectsService.listReviews(projectId, undefined, {
      workItemId,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get(':id/memories')
  @ApiOperation({ summary: 'List public project memories' })
  @ApiQuery({ name: 'memoryType', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  listMemories(
    @Param('id') projectId: string,
    @Query('memoryType') memoryType?: string,
    @Query('limit') limit?: string,
  ) {
    return this.projectsService.listMemories(projectId, undefined, {
      memoryType,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get(':id/agent-runtimes/:memberId/workspace')
  @ApiOperation({ summary: 'List generated files in an agent runtime workspace using a runtime token' })
  @ApiQuery({ name: 'maxDepth', required: false, type: Number })
  listAgentRuntimeWorkspaceFilesForRuntime(
    @Param('id') projectId: string,
    @Param('memberId') memberId: string,
    @Headers('authorization') authorization?: string,
    @Query('maxDepth') maxDepth?: string,
  ) {
    return this.projectsService.listAgentRuntimeWorkspaceFilesForRuntime(
      projectId,
      memberId,
      authorization,
      maxDepth ? parseInt(maxDepth, 10) : undefined,
    );
  }

  @Get(':id/agent-runtimes/:memberId/workspace/download')
  @ApiOperation({ summary: 'Download a generated file from an agent runtime workspace using a runtime token' })
  @ApiQuery({ name: 'path', required: true })
  async downloadAgentRuntimeWorkspaceFileForRuntime(
    @Param('id') projectId: string,
    @Param('memberId') memberId: string,
    @Headers('authorization') authorization: string | undefined,
    @Query('path') filePath: string,
    @Res() res: Response,
  ) {
    const file = await this.projectsService.downloadAgentRuntimeWorkspaceFileForRuntime(
      projectId,
      memberId,
      authorization,
      filePath,
    );
    const encodedName = encodeURIComponent(file.filename);
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Length', file.content.length);
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename.replace(/"/g, '')}"; filename*=UTF-8''${encodedName}`);
    res.send(file.content);
  }
}
