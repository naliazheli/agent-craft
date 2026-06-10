import { Module } from '@nestjs/common';
import { ApiConfigController } from './api-config.controller';
import { ApiConfigService } from './api-config.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ApiConfigController],
  providers: [ApiConfigService],
  exports: [ApiConfigService],
})
export class ApiConfigModule {}
