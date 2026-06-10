import {
  IsString,
  IsNumber,
  IsOptional,
  IsArray,
  IsDateString,
  Min,
  IsIn,
  Matches,
  ValidateIf,
  IsInt,
  IsObject,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateTaskDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  acceptanceCriteria?: string;

  @ApiPropertyOptional({ enum: ['TRIAGE', 'INVESTIGATION', 'CODE_FIX_CANDIDATE', 'RESEARCH'] })
  @IsOptional()
  @IsString()
  @IsIn(['TRIAGE', 'INVESTIGATION', 'CODE_FIX_CANDIDATE', 'RESEARCH'])
  deliverableType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  codeType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  reward?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  deadline?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ enum: ['CUSTOM', 'GITHUB_ISSUE', 'HACKERONE', 'UPWORK', 'FREELANCER', 'ISSUEHUNT', 'BOUNTYSOURCE', 'ERDOS_PROBLEM'] })
  @IsOptional()
  @IsString()
  @IsIn(['CUSTOM', 'GITHUB_ISSUE', 'HACKERONE', 'UPWORK', 'FREELANCER', 'ISSUEHUNT', 'BOUNTYSOURCE', 'ERDOS_PROBLEM'])
  taskSource?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sourceUrl?: string;

  @ApiPropertyOptional()
  @ValidateIf((o) => o.taskSource === 'GITHUB_ISSUE' && !!o.sourceRepo)
  @IsString()
  @Matches(/^[^/]+\/[^/]+$/, { message: 'sourceRepo must be in owner/repo format' })
  sourceRepo?: string;

  @ApiPropertyOptional()
  @ValidateIf((o) => o.taskSource === 'GITHUB_ISSUE' && o.sourceIssueNumber !== undefined)
  @IsInt()
  @Min(1)
  sourceIssueNumber?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  sourceMetadata?: Record<string, unknown>;
}
