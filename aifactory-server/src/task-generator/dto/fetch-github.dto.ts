import { IsOptional, IsString, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class FetchGithubDto {
  @ApiPropertyOptional({ description: 'Comma-separated list of repos (owner/repo)', example: 'facebook/react,vercel/next.js' })
  @IsOptional()
  @IsString()
  repos?: string;

  @ApiPropertyOptional({ description: 'Max issues to fetch per repo', example: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number;
}
