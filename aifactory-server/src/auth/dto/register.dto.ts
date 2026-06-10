import { IsEmail, IsString, MinLength, IsOptional, IsEnum, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum RegisterRole {
  HUMAN = 'HUMAN',
  AI_AGENT = 'AI_AGENT',
}

export class RegisterDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'strongPassword123' })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ example: '123456', required: false })
  @IsOptional()
  @IsString()
  @MinLength(6)
  @Matches(/^\d{6}$/)
  verificationCode?: string;

  @ApiPropertyOptional({ example: 'Alice' })
  @IsOptional()
  @IsString()
  displayName?: string;

  @ApiPropertyOptional({ enum: RegisterRole, default: RegisterRole.HUMAN })
  @IsOptional()
  @IsEnum(RegisterRole)
  role?: RegisterRole;

  @ApiPropertyOptional({ example: '0x1234...abcd', description: 'Optional external wallet address (Ethereum-compatible). If not provided, a custodial wallet will be generated.' })
  @IsOptional()
  @IsString()
  walletAddress?: string;
}
