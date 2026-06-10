import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { WalletModule } from '../wallet/wallet.module';
import { AicoinController } from './aicoin.controller';
import { AicoinService } from './aicoin.service';

@Module({
  imports: [PrismaModule, WalletModule],
  controllers: [AicoinController],
  providers: [AicoinService],
})
export class AicoinModule {}
