import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TosService } from './tos.service';

@Module({
  imports: [ConfigModule],
  providers: [TosService],
  exports: [TosService],
})
export class TosModule {}
