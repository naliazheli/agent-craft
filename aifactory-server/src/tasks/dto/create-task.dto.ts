import {
  IsString,
  IsNumber,
  IsOptional,
  IsArray,
  IsDateString,
  IsBoolean,
  Min,
  IsIn,
  Matches,
  ValidateIf,
  IsInt,
  IsObject,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTaskDto {
  @ApiProperty({ example: 'Build a landing page' })
  @IsString()
  title: string;

  @ApiProperty({ example: 'Create a responsive landing page with React...' })
  @IsString()
  description: string;

  @ApiPropertyOptional({ example: 'Page must be responsive and pass Lighthouse >90' })
  @IsOptional()
  @IsString()
  acceptanceCriteria?: string;

  @ApiPropertyOptional({
    example: 'CODE_FIX_CANDIDATE',
    enum: ['TRIAGE', 'INVESTIGATION', 'CODE_FIX_CANDIDATE', 'RESEARCH'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['TRIAGE', 'INVESTIGATION', 'CODE_FIX_CANDIDATE', 'RESEARCH'])
  deliverableType?: string;

  @ApiPropertyOptional({
    example: 'typescript',
    description: 'Primary code ecosystem for agent-side task filtering.',
  })
  @IsOptional()
  @IsString()
  codeType?: string;

  @ApiProperty({ example: 100 })
  @IsNumber()
  @Min(0)
  reward: number;

  @ApiPropertyOptional({ example: 'AIC', default: 'AIC' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ example: '2025-12-31T23:59:59Z' })
  @IsOptional()
  @IsDateString()
  deadline?: string;

  @ApiPropertyOptional({ example: ['frontend', 'react', 'design'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ example: ['https://example.com/file1.pdf'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachments?: string[];

  @ApiPropertyOptional({ example: false, default: false })
  @IsOptional()
  @IsBoolean()
  autoReview?: boolean;

  @ApiPropertyOptional({
    example: 'CUSTOM',
    enum: ['CUSTOM', 'GITHUB_ISSUE', 'HACKERONE', 'UPWORK', 'FREELANCER', 'ISSUEHUNT', 'BOUNTYSOURCE', 'ERDOS_PROBLEM'],
    default: 'CUSTOM',
  })
  @IsOptional()
  @IsString()
  @IsIn(['CUSTOM', 'GITHUB_ISSUE', 'HACKERONE', 'UPWORK', 'FREELANCER', 'ISSUEHUNT', 'BOUNTYSOURCE', 'ERDOS_PROBLEM'])
  taskSource?: string;

  @ApiPropertyOptional({ example: 'https://github.com/owner/repo/issues/123' })
  @IsOptional()
  @IsString()
  sourceUrl?: string;

  @ApiPropertyOptional({ example: 'owner/repo' })
  @ValidateIf((o) => o.taskSource === 'GITHUB_ISSUE' && !!o.sourceRepo)
  @IsString()
  @Matches(/^[^/]+\/[^/]+$/, { message: 'sourceRepo must be in owner/repo format' })
  sourceRepo?: string;

  @ApiPropertyOptional({ example: 123 })
  @ValidateIf((o) => o.taskSource === 'GITHUB_ISSUE' && o.sourceIssueNumber !== undefined)
  @IsInt()
  @Min(1)
  sourceIssueNumber?: number;

  @ApiPropertyOptional({
    example: {
      catalog: 'erdosproblems',
      externalProblemId: 1,
      bibliographySourceCode: 'Er59',
    },
  })
  @IsOptional()
  @IsObject()
  sourceMetadata?: Record<string, unknown>;
}
