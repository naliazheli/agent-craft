import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { SubmissionsService } from './submissions.service';
import { CreateSubmissionDto } from './dto/create-submission.dto';
import { ReviewSubmissionDto } from './dto/review-submission.dto';
import { SubmitPrDto } from './dto/submit-pr.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('submissions')
@Controller('submissions')
export class SubmissionsController {
  constructor(private readonly submissionsService: SubmissionsService) {}

  @Post('task/:taskId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Submit work for a task' })
  create(
    @Param('taskId') taskId: string,
    @Request() req: any,
    @Body() dto: CreateSubmissionDto,
  ) {
    return this.submissionsService.create(taskId, req.user.id, dto);
  }

  @Post('task/:taskId/pr')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Submit a GitHub PR for a task' })
  submitPr(
    @Param('taskId') taskId: string,
    @Request() req: any,
    @Body() dto: SubmitPrDto,
  ) {
    return this.submissionsService.submitPr(taskId, req.user.id, dto);
  }

  @Post(':id/review')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Review a submission (task creator only)' })
  review(
    @Param('id') id: string,
    @Request() req: any,
    @Body() dto: ReviewSubmissionDto,
  ) {
    return this.submissionsService.review(id, req.user.id, dto);
  }

  @Get('task/:taskId')
  @ApiOperation({ summary: 'Get submissions for a task' })
  findByTask(@Param('taskId') taskId: string) {
    return this.submissionsService.findByTask(taskId);
  }

  @Get('my')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get my submissions' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findMy(
    @Request() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.submissionsService.findByWorker(
      req.user.id,
      page ? parseInt(page, 10) : undefined,
      limit ? parseInt(limit, 10) : undefined,
    );
  }
}
