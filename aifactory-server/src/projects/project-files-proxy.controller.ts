import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Request,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AgentWorkspaceClient } from './agent-workspace.client';
import { ProjectsService } from './projects.service';

type ProjectFileProxyEntry = Record<string, any> & {
  key?: string;
  path?: string;
  type?: 'file' | 'folder';
};

@ApiTags('project-files')
@Controller('projects/:projectId/files')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ProjectFilesProxyController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly agentWorkspaceClient: AgentWorkspaceClient,
  ) {}

  private workItemIdFromRequest(req: any, explicit?: string) {
    const headers = req?.headers || {};
    const headerValue =
      headers['x-agentcraft-work-item-id'] ||
      headers['x-agent-workspace-work-item-id'] ||
      headers['x-project-work-item-id'] ||
      headers['x-work-item-id'];
    const value = explicit || (Array.isArray(headerValue) ? headerValue[0] : headerValue);
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private mergeFoldersIntoFiles(response: Record<string, any>) {
    const folders = Array.isArray(response?.folders)
      ? (response.folders as ProjectFileProxyEntry[]).map((folder) => ({
          ...folder,
          type: 'folder' as const,
          size: Number.isFinite(folder.size) ? folder.size : 0,
        }))
      : [];
    const folderKeys = new Set(
      folders
        .map((folder) => folder.key || folder.path)
        .filter((value): value is string => typeof value === 'string' && value.length > 0),
    );
    const files = Array.isArray(response?.files)
      ? (response.files as ProjectFileProxyEntry[]).filter((file) => {
          const identity = file.key || file.path;
          return !identity || !folderKeys.has(identity);
        })
      : [];

    return {
      ...response,
      folders,
      files: [...folders, ...files],
    };
  }

  @Get()
  @ApiOperation({ summary: 'List shared project resources through agent-workspace' })
  @ApiQuery({ name: 'prefix', required: false })
  @ApiQuery({ name: 'q', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiQuery({ name: 'recursive', required: false, type: Boolean })
  async list(
    @Param('projectId') projectId: string,
    @Request() req: any,
    @Query('prefix') prefix?: string,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @Query('recursive') recursive?: string,
  ) {
    await this.projectsService.ensureProjectFileAccess(projectId, req.user.id);
    const response = await this.agentWorkspaceClient.listProjectFiles(projectId, {
      prefix,
      q,
      limit: limit ? parseInt(limit, 10) : undefined,
      cursor,
      recursive,
    });
    return this.mergeFoldersIntoFiles(response);
  }

  @Post('folders')
  @ApiOperation({ summary: 'Create a shared project resource folder through agent-workspace' })
  async createFolder(
    @Param('projectId') projectId: string,
    @Request() req: any,
    @Body('path') folderPath: string,
    @Body('workItemId') workItemId?: string,
  ) {
    await this.projectsService.ensureProjectFileAccess(projectId, req.user.id);
    return this.agentWorkspaceClient.createProjectFolder(projectId, folderPath, {
      workItemId: this.workItemIdFromRequest(req, workItemId),
    });
  }

  @Get('download-url')
  @ApiOperation({ summary: 'Create a short-lived download URL through agent-workspace' })
  @ApiQuery({ name: 'path', required: true })
  @ApiQuery({ name: 'expiresIn', required: false, type: Number })
  async downloadUrl(
    @Param('projectId') projectId: string,
    @Request() req: any,
    @Query('path') filePath: string,
    @Query('expiresIn') expiresIn?: string,
  ) {
    await this.projectsService.ensureProjectFileAccess(projectId, req.user.id);
    return this.agentWorkspaceClient.getProjectFileDownloadUrl(
      projectId,
      filePath,
      expiresIn ? parseInt(expiresIn, 10) : undefined,
    );
  }

  @Get('download')
  @ApiOperation({ summary: 'Download a shared project resource through agent-workspace' })
  @ApiQuery({ name: 'path', required: true })
  async download(
    @Param('projectId') projectId: string,
    @Request() req: any,
    @Query('path') filePath: string,
    @Res() res: Response,
  ) {
    await this.projectsService.ensureProjectFileAccess(projectId, req.user.id);
    const file = await this.agentWorkspaceClient.downloadProjectFile(projectId, filePath);
    const encodedName = encodeURIComponent(file.filename);
    const asciiName = file.filename.replace(/"/g, '').replace(/[^\x20-\x7E]/g, '_') || 'download';
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Length', file.content.length);
    res.setHeader('Content-Disposition', `attachment; filename="${asciiName}"; filename*=UTF-8''${encodedName}`);
    res.send(file.content);
  }

  @Get('read')
  @ApiOperation({ summary: 'Read a shared project text file through agent-workspace' })
  @ApiQuery({ name: 'path', required: true })
  @ApiQuery({ name: 'encoding', required: false, enum: ['text', 'base64'] })
  async read(
    @Param('projectId') projectId: string,
    @Request() req: any,
    @Query('path') filePath: string,
    @Query('encoding') encoding?: 'text' | 'base64',
  ) {
    await this.projectsService.ensureProjectFileAccess(projectId, req.user.id);
    return this.agentWorkspaceClient.readProjectFile(projectId, filePath, encoding);
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 100 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        path: { type: 'string' },
        workItemId: { type: 'string' },
      },
    },
  })
  @ApiOperation({ summary: 'Upload a shared project resource through agent-workspace' })
  async upload(
    @Param('projectId') projectId: string,
    @Request() req: any,
    @UploadedFile() file: Express.Multer.File,
    @Body('path') filePath?: string,
    @Body('workItemId') workItemId?: string,
  ) {
    await this.projectsService.ensureProjectFileAccess(projectId, req.user.id);
    return this.agentWorkspaceClient.uploadProjectFile(projectId, file, filePath, {
      workItemId: this.workItemIdFromRequest(req, workItemId),
    });
  }

  @Delete()
  @ApiOperation({ summary: 'Delete a shared project resource or resource folder through agent-workspace' })
  @ApiQuery({ name: 'path', required: true })
  @ApiQuery({ name: 'recursive', required: false, type: Boolean })
  @ApiQuery({ name: 'workItemId', required: false })
  async delete(
    @Param('projectId') projectId: string,
    @Request() req: any,
    @Query('path') filePath: string,
    @Query('recursive') recursive?: string,
    @Query('workItemId') workItemId?: string,
  ) {
    await this.projectsService.ensureProjectFileAccess(projectId, req.user.id);
    return this.agentWorkspaceClient.deleteProjectFile(projectId, filePath, recursive === 'true', {
      workItemId: this.workItemIdFromRequest(req, workItemId),
    });
  }
}
