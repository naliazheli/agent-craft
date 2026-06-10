import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  Req,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength, IsOptional } from 'class-validator';
import * as bcrypt from 'bcryptjs';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WalletService } from './wallet.service';
import { BlockchainService } from './blockchain.service';
import { PrismaService } from '../prisma/prisma.service';

class ExportKeyDto {
  @ApiProperty({ description: 'Current password for verification' })
  @IsString()
  @MinLength(1)
  password: string;
}

class WithdrawDto {
  @ApiProperty({ description: 'Amount of AIC to withdraw to on-chain wallet' })
  amount: number;

  @ApiProperty({ description: 'Target wallet address (defaults to custodial wallet)', required: false })
  @IsOptional()
  @IsString()
  toAddress?: string;
}

class BindExternalWalletDto {
  @ApiProperty({ description: 'External wallet address to bind' })
  @IsString()
  walletAddress: string;
}

@ApiTags('wallet')
@Controller('wallet')
export class WalletController {
  constructor(
    private readonly walletService: WalletService,
    private readonly blockchainService: BlockchainService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('balance')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user AIC balance (off-chain + on-chain)' })
  async getBalance(@Req() req: any) {
    const user = await this.prisma.user.findUnique({
      where: { id: req.user.id },
      select: { balance: true, walletAddress: true },
    });
    if (!user) throw new BadRequestException('User not found');

    let onchainBalance = '0';
    if (user.walletAddress) {
      onchainBalance = await this.blockchainService.getOnchainBalance(user.walletAddress);
    }

    return {
      offchain: user.balance,
      onchain: onchainBalance,
      walletAddress: user.walletAddress,
      blockchainConfigured: this.blockchainService.isConfigured(),
    };
  }

  @Get('transactions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get transaction history for current user' })
  async getTransactions(
    @Req() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.walletService.getTransactions(
      req.user.id,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Post('export-key')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Export custodial wallet private key (requires password verification)' })
  async exportKey(@Req() req: any, @Body() dto: ExportKeyDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: req.user.id },
      select: { passwordHash: true, walletEncrypted: true, walletAddress: true },
    });
    if (!user) throw new BadRequestException('User not found');
    if (!user.walletEncrypted) throw new BadRequestException('No custodial wallet found');

    const isValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isValid) throw new UnauthorizedException('Invalid password');

    const privateKey = this.blockchainService.decryptPrivateKey(user.walletEncrypted);
    return {
      walletAddress: user.walletAddress,
      privateKey,
    };
  }

  @Post('bind-external')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Bind an external wallet address (replaces custodial wallet for receiving)' })
  async bindExternalWallet(@Req() req: any, @Body() dto: BindExternalWalletDto) {
    if (!/^0x[a-fA-F0-9]{40}$/.test(dto.walletAddress)) {
      throw new BadRequestException('Invalid Ethereum address format');
    }

    const user = await this.prisma.user.update({
      where: { id: req.user.id },
      data: { walletAddress: dto.walletAddress },
      select: { id: true, walletAddress: true },
    });

    return { walletAddress: user.walletAddress };
  }

  @Post('withdraw')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Withdraw off-chain AIC balance to on-chain wallet' })
  async withdraw(@Req() req: any, @Body() dto: WithdrawDto) {
    if (!dto.amount || dto.amount <= 0) {
      throw new BadRequestException('Amount must be positive');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: req.user.id },
      select: { balance: true, walletAddress: true },
    });
    if (!user) throw new BadRequestException('User not found');

    const toAddress = dto.toAddress || user.walletAddress;
    if (!toAddress) throw new BadRequestException('No wallet address available');
    if (!/^0x[a-fA-F0-9]{40}$/.test(toAddress)) {
      throw new BadRequestException('Invalid Ethereum address format');
    }

    if (!this.blockchainService.isConfigured()) {
      throw new BadRequestException('On-chain withdrawals not yet available');
    }

    const rewardPoolStatus = await this.blockchainService.getRewardPoolStatus();
    if (!rewardPoolStatus.address) {
      throw new BadRequestException('Reward-pool wallet is not configured for withdrawals');
    }
    if (Number(rewardPoolStatus.aicBalance) < dto.amount) {
      throw new BadRequestException('Insufficient on-chain reward-pool AIC for withdrawal');
    }
    if (Number(rewardPoolStatus.nativeBalance) <= 0) {
      throw new BadRequestException('Reward-pool wallet needs MATIC to pay Polygon gas');
    }

    const withdrawal = await this.walletService.reserveWithdrawal(req.user.id, dto.amount);

    try {
      const txHash = await this.blockchainService.transferFromRewardPool(
        toAddress,
        dto.amount.toString(),
      );

      await this.walletService.completeWithdrawal(withdrawal.id, txHash);

      return { txHash, amount: dto.amount, toAddress };
    } catch (err) {
      await this.walletService.failWithdrawal(withdrawal.id);
      throw new BadRequestException(`On-chain transfer failed: ${err.message}`);
    }
  }
}
