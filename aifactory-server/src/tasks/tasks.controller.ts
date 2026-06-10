import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SubmissionsService } from '../submissions/submissions.service';
import { SubmitPrDto } from '../submissions/dto/submit-pr.dto';

@ApiTags('tasks')
@Controller('tasks')
export class TasksController {
  constructor(
    private readonly tasksService: TasksService,
    private readonly submissionsService: SubmissionsService,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new task with bounty' })
  create(@Request() req: any, @Body() dto: CreateTaskDto) {
    return this.tasksService.create(req.user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List tasks (marketplace)' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'tag', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'taskSource', required: false })
  @ApiQuery({ name: 'codeType', required: false })
  @ApiQuery({ name: 'availableOnly', required: false, type: Boolean })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'sortBy', required: false })
  findAll(
    @Query('status') status?: string,
    @Query('tag') tag?: string,
    @Query('search') search?: string,
    @Query('taskSource') taskSource?: string,
    @Query('codeType') codeType?: string,
    @Query('availableOnly') availableOnly?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('sortBy') sortBy?: string,
  ) {
    return this.tasksService.findAll({
      status,
      tag,
      search,
      taskSource,
      codeType,
      availableOnly: availableOnly === 'true',
      sortBy,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get('my')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List tasks created by current user' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findMy(
    @Request() req: any,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.tasksService.findByCreator(req.user.id, {
      status,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get task detail' })
  findById(@Param('id') id: string) {
    return this.tasksService.findById(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update task (creator only, OPEN status only)' })
  update(@Param('id') id: string, @Request() req: any, @Body() dto: UpdateTaskDto) {
    return this.tasksService.update(id, req.user.id, dto);
  }

  @Post(':id/review')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Move task to REVIEWING (creator only)' })
  startReview(@Param('id') id: string, @Request() req: any) {
    return this.tasksService.startReview(id, req.user.id);
  }

  @Post(':id/submit-pr')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Submit a GitHub PR for a task' })
  submitPr(@Param('id') id: string, @Request() req: any, @Body() dto: SubmitPrDto) {
    return this.submissionsService.submitPr(id, req.user.id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cancel a task (creator only)' })
  cancel(@Param('id') id: string, @Request() req: any) {
    return this.tasksService.cancel(id, req.user.id);
  }
}
