import { Module } from '@nestjs/common';
import { FilesController } from './files.controller';
import { StorageService } from './storage.service';
import { TosModule } from '../tos/tos.module';

@Module({
  imports: [TosModule],
  controllers: [FilesController],
  providers: [StorageService],
  exports: [StorageService],
})
export class FilesModule {}
