import { IsString, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum ReviewAction {
  APPROVE = 'APPROVE',
  REQUEST_REVISION = 'REQUEST_REVISION',
  REJECT = 'REJECT',
}

export class ReviewSubmissionDto {
  @ApiProperty({ enum: ReviewAction })
  @IsEnum(ReviewAction)
  action: ReviewAction;

  @ApiPropertyOptional({ example: 'Please fix the responsive layout on mobile' })
  @IsOptional()
  @IsString()
  reviewNote?: string;
}
