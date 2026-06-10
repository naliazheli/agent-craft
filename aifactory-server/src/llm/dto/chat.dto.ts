import { IsString, IsArray, IsEnum, ValidateNested, IsOptional, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum LlmApiType {
  OPENAI = 'openai',
  CLAUDE = 'claude',
}

export class ChatMessageDto {
  @ApiProperty({ example: 'user' })
  @IsString()
  role: string;

  @ApiProperty({ example: 'Hello, how are you?' })
  @IsString()
  content: string;
}

export class LlmChatDto {
  @ApiProperty({ type: [ChatMessageDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  messages: ChatMessageDto[];

  @ApiProperty({ example: 'https://api.openai.com/v1' })
  @IsString()
  apiUrl: string;

  @ApiProperty({ example: 'sk-...' })
  @IsString()
  apiKey: string;

  @ApiProperty({ example: 'gpt-4o' })
  @IsString()
  modelName: string;

  @ApiProperty({ enum: LlmApiType, example: LlmApiType.OPENAI })
  @IsEnum(LlmApiType)
  apiType: LlmApiType;

  @ApiPropertyOptional({ example: 4096 })
  @IsOptional()
  @IsNumber()
  maxTokens?: number;
}
