import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  Request,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { TaskGeneratorService } from './task-generator.service';
import { FetchGithubDto } from './dto/fetch-github.dto';
import { FetchHackerOneDto } from './dto/fetch-hackerone.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UpdateGithubPolicyDto } from './dto/update-github-policy.dto';
import { normalizeOptionalEmail, normalizeSystemEmail } from '../common/system-email';

@ApiTags('task-generator')
@Controller('task-generator')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class TaskGeneratorController {
  constructor(private readonly service: TaskGeneratorService) {}

  private assertSystemUser(req: any) {
    const allowedEmail = normalizeSystemEmail(process.env.TASK_GENERATOR_SYSTEM_EMAIL || process.env.SYSTEM_USER_EMAIL);
    const legacyEmail = normalizeOptionalEmail(process.env.LEGACY_SYSTEM_EMAIL);
    const normalizedEmail = req.user?.email?.toLowerCase() || '';
    const isPrivilegedUser =
      req.user?.role === 'ADMIN' ||
      normalizedEmail === allowedEmail.toLowerCase() ||
      (Boolean(legacyEmail) && normalizedEmail === legacyEmail);

    if (!isPrivilegedUser) {
      throw new ForbiddenException('Only the configured system user can access task generator.');
    }
  }

  @Post('fetch/github')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Fetch GitHub issues into raw_tasks table' })
  async fetchGithub(@Request() req: any, @Body() dto: FetchGithubDto) {
    this.assertSystemUser(req);
    return this.service.fetchGithub(dto.repos, dto.limit);
  }

  @Post('fetch/hackerone')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Fetch HackerOne program scopes into raw_tasks table' })
  async fetchHackerOne(@Request() req: any, @Body() dto: FetchHackerOneDto) {
    this.assertSystemUser(req);
    return this.service.fetchHackerOne(dto.handles, dto.limit, dto.scopeLimit);
  }

  @Post('score')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Run LLM scoring on PENDING raw tasks' })
  async score(@Request() req: any, @Query('batchSize') batchSize?: number) {
    this.assertSystemUser(req);
    return this.service.score(batchSize ? Number(batchSize) : 20);
  }

  @Post('publish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Publish SCORED raw tasks as platform Tasks' })
  async publish(@Request() req: any) {
    this.assertSystemUser(req);
    return this.service.publish();
  }

  @Post('runs')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Queue a task-generator background run' })
  async createRun(
    @Request() req: any,
    @Body()
    body: {
      type: 'FETCH_GITHUB' | 'FETCH_HACKERONE' | 'SCORE' | 'PUBLISH' | 'SCORE_AND_PUBLISH';
      repos?: string;
      handles?: string;
      limit?: number;
      scopeLimit?: number;
      batchSize?: number;
    },
  ) {
    this.assertSystemUser(req);
    return this.service.startRun(body.type, req.user?.email || req.user?.id || 'system', {
      repos: body.repos,
      handles: body.handles,
      limit: body.limit,
      scopeLimit: body.scopeLimit,
      batchSize: body.batchSize,
    });
  }

  @Get('runs')
  @ApiOperation({ summary: 'List recent task-generator runs' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async listRuns(@Request() req: any, @Query('limit') limit?: number) {
    this.assertSystemUser(req);
    return this.service.listRuns(limit ? Number(limit) : 20);
  }

  @Get('runs/:id')
  @ApiOperation({ summary: 'Get a single task-generator run' })
  async getRun(@Request() req: any, @Param('id') id: string) {
    this.assertSystemUser(req);
    return this.service.getRun(id);
  }

  @Get('raw-tasks')
  @ApiOperation({ summary: 'List raw tasks' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'processingStage', required: false })
  @ApiQuery({ name: 'handledOnly', required: false, type: Boolean })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async listRawTasks(
    @Request() req: any,
    @Query('status') status?: string,
    @Query('processingStage') processingStage?: string,
    @Query('handledOnly') handledOnly?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    this.assertSystemUser(req);
    return this.service.listRawTasks({
      status,
      processingStage,
      handledOnly: handledOnly === 'true',
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
    });
  }

  @Get('raw-tasks/stats')
  @ApiOperation({ summary: 'Get raw task summary statistics' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'processingStage', required: false })
  @ApiQuery({ name: 'handledOnly', required: false, type: Boolean })
  async getRawTaskStats(
    @Request() req: any,
    @Query('status') status?: string,
    @Query('processingStage') processingStage?: string,
    @Query('handledOnly') handledOnly?: string,
  ) {
    this.assertSystemUser(req);
    return this.service.getRawTaskStats({
      status,
      processingStage,
      handledOnly: handledOnly === 'true',
    });
  }

  @Get('raw-tasks/:id')
  @ApiOperation({ summary: 'Get a single raw task by ID' })
  async getRawTask(@Request() req: any, @Param('id') id: string) {
    this.assertSystemUser(req);
    return this.service.getRawTask(id);
  }

  @Get('policy/github')
  @ApiOperation({ summary: 'Get live GitHub publish policy from database' })
  async getGithubPolicy(@Request() req: any) {
    this.assertSystemUser(req);
    return this.service.getGithubPolicy();
  }

  @Post('policy/github')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update live GitHub publish policy in database' })
  async updateGithubPolicy(@Request() req: any, @Body() dto: UpdateGithubPolicyDto) {
    this.assertSystemUser(req);
    return this.service.updateGithubPolicy(dto);
  }
}
