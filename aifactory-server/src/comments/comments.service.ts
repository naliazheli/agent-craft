import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCommentDto } from './dto/create-comment.dto';

@Injectable()
export class CommentsService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeContent(content: string) {
    return content.trim().replace(/\s+/g, ' ');
  }

  async create(taskId: string, userId: string, dto: CreateCommentDto) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException('Task not found');

    let submissionId: string | null = null;
    if (dto.submissionId) {
      const submission = await this.prisma.submission.findUnique({
        where: { id: dto.submissionId },
        select: { id: true, taskId: true },
      });
      if (!submission) throw new NotFoundException('Submission not found');
      if (submission.taskId !== taskId) {
        throw new BadRequestException('Submission belongs to a different task');
      }
      submissionId = submission.id;
    }

    if (dto.parentId) {
      const parent = await this.prisma.comment.findUnique({
        where: { id: dto.parentId },
        select: { id: true, taskId: true, submissionId: true },
      });
      if (!parent) throw new NotFoundException('Parent comment not found');
      if (parent.taskId !== taskId) {
        throw new BadRequestException('Parent comment belongs to a different task');
      }

      if (submissionId && parent.submissionId && parent.submissionId !== submissionId) {
        throw new BadRequestException('Parent comment belongs to a different submission');
      }

      if (!submissionId && parent.submissionId) {
        submissionId = parent.submissionId;
      }
    }

    const normalizedContent = this.normalizeContent(dto.content);
    const duplicateCutoff = new Date(Date.now() - 10 * 60 * 1000);
    const recentComments = await this.prisma.comment.findMany({
      where: {
        taskId,
        userId,
        parentId: dto.parentId || null,
        submissionId,
        createdAt: { gte: duplicateCutoff },
      },
      select: { id: true, content: true },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    if (
      recentComments.some(
        (comment) => this.normalizeContent(comment.content) === normalizedContent,
      )
    ) {
      throw new BadRequestException(
        'Duplicate comment detected. Reuse the recent comment instead of posting the same update again.',
      );
    }

    return this.prisma.comment.create({
      data: {
        content: normalizedContent,
        fileUrls: dto.fileUrls || [],
        taskId,
        userId,
        parentId: dto.parentId || null,
        submissionId,
      },
      include: {
        user: { select: { id: true, displayName: true, role: true } },
        submission: { select: { id: true, workerId: true, version: true, status: true } },
      },
    });
  }

  async findByTask(taskId: string) {
    return this.prisma.comment.findMany({
      where: { taskId, parentId: null },
      include: {
        user: { select: { id: true, displayName: true, role: true } },
        submission: { select: { id: true, workerId: true, version: true, status: true } },
        replies: {
          include: {
            user: { select: { id: true, displayName: true, role: true } },
            submission: { select: { id: true, workerId: true, version: true, status: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findBySubmission(submissionId: string) {
    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
      select: { id: true },
    });
    if (!submission) throw new NotFoundException('Submission not found');

    return this.prisma.comment.findMany({
      where: { submissionId, parentId: null },
      include: {
        user: { select: { id: true, displayName: true, role: true } },
        submission: { select: { id: true, workerId: true, version: true, status: true } },
        replies: {
          include: {
            user: { select: { id: true, displayName: true, role: true } },
            submission: { select: { id: true, workerId: true, version: true, status: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }
}
