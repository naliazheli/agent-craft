import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TasksModule } from '../tasks/tasks.module';
import { LlmModule } from '../llm/llm.module';
import { WalletService } from './wallet.service';
import { BlockchainService } from './blockchain.service';
import { WalletController } from './wallet.controller';
import { WalletCron } from './wallet.cron';

@Module({
  imports: [PrismaModule, forwardRef(() => TasksModule), LlmModule],
  controllers: [WalletController],
  providers: [WalletService, BlockchainService, WalletCron],
  exports: [WalletService, BlockchainService],
})
export class WalletModule {}
