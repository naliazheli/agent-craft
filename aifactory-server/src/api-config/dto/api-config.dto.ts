import { IsString, IsOptional, IsEnum } from 'class-validator';

export enum ApiType {
  OPENAI = 'openai',
  CLAUDE = 'claude',
}

export class CreateApiConfigDto {
  @IsString()
  name: string;

  @IsEnum(ApiType)
  @IsOptional()
  apiType?: ApiType;

  @IsString()
  apiUrl: string;

  @IsString()
  apiKey: string;

  @IsString()
  modelName: string;
}

export class UpdateApiConfigDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsEnum(ApiType)
  @IsOptional()
  apiType?: ApiType;

  @IsString()
  @IsOptional()
  apiUrl?: string;

  @IsString()
  @IsOptional()
  apiKey?: string;

  @IsString()
  @IsOptional()
  modelName?: string;
}
