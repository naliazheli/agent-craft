import { IsString, IsOptional, IsArray, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCommentDto {
  @ApiProperty({ example: 'Can you clarify the acceptance criteria?' })
  @IsString()
  content: string;

  @ApiPropertyOptional({ example: ['https://example.com/screenshot.png'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  fileUrls?: string[];

  @ApiPropertyOptional({ example: 'uuid-of-parent-comment' })
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @ApiPropertyOptional({ example: 'uuid-of-submission-being-commented' })
  @IsOptional()
  @IsUUID()
  submissionId?: string;
}
