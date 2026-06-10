import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';

export class SubmitPrDto {
  @ApiProperty({ example: 'https://github.com/owner/repo/pull/123' })
  @IsString()
  prUrl: string;

  @ApiProperty({
    example: '7b1c2d3e4f5a67890123456789abcdef01234567',
    description: 'Current PR head commit SHA',
  })
  @IsString()
  @Matches(/^[a-f0-9]{7,40}$/i, {
    message: 'headSha must be a valid Git commit SHA',
  })
  headSha: string;

  @ApiPropertyOptional({ example: 'Implements the requested fix and adds tests.' })
  @IsOptional()
  @IsString()
  note?: string;
}
