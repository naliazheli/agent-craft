import {
  Controller,
  Post,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Request,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AvatarService } from './avatar.service';
import { PrismaService } from '../prisma/prisma.service';

@Controller('users/avatar')
@UseGuards(JwtAuthGuard)
export class AvatarController {
  constructor(
    private readonly avatarService: AvatarService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('avatar'))
  async uploadAvatar(
    @UploadedFile() file: Express.Multer.File,
    @Request() req: any,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const validation = this.avatarService.validateImageFile(
      file.mimetype,
      file.size,
    );

    if (!validation.valid) {
      throw new BadRequestException(validation.error);
    }

    const userId = req.user.id;

    const avatarUrl = await this.avatarService.uploadCustomAvatar(
      userId,
      file.buffer,
      file.mimetype,
    );

    await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl },
    });

    return {
      avatarUrl,
      message: 'Avatar uploaded successfully',
    };
  }
}
