import { Module } from '@nestjs/common';
import { AvatarService } from './avatar.service';
import { AvatarController } from './avatar.controller';
import { TosModule } from '../tos/tos.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [TosModule, PrismaModule],
  controllers: [AvatarController],
  providers: [AvatarService],
  exports: [AvatarService],
})
export class AvatarModule {}
