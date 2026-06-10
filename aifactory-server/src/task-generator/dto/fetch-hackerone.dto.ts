import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class FetchHackerOneDto {
  @ApiPropertyOptional({
    description: 'Comma-separated HackerOne program handles. Leave empty to fetch the public program list.',
    example: 'gitlab,shopify',
  })
  @IsOptional()
  @IsString()
  handles?: string;

  @ApiPropertyOptional({ description: 'Max programs to fetch', example: 25 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number;

  @ApiPropertyOptional({ description: 'Max structured scopes to fetch per program', example: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  scopeLimit?: number;
}
