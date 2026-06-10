import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('comments')
@Controller('comments')
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Post('task/:taskId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a comment on a task (supports replies)' })
  create(
    @Param('taskId') taskId: string,
    @Request() req: any,
    @Body() dto: CreateCommentDto,
  ) {
    return this.commentsService.create(taskId, req.user.id, dto);
  }

  @Get('task/:taskId')
  @ApiOperation({ summary: 'List comments for a task (threaded)' })
  findByTask(@Param('taskId') taskId: string) {
    return this.commentsService.findByTask(taskId);
  }

  @Get('submission/:submissionId')
  @ApiOperation({ summary: 'List comments for a submission (threaded)' })
  findBySubmission(@Param('submissionId') submissionId: string) {
    return this.commentsService.findBySubmission(submissionId);
  }
}
