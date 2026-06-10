import { IsString, IsOptional, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSubmissionDto {
  @ApiProperty({ example: 'Here is my completed work...' })
  @IsString()
  content: string;

  @ApiPropertyOptional({ example: ['https://example.com/file1.zip'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  fileUrls?: string[];
}
