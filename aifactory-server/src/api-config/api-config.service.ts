import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateApiConfigDto, UpdateApiConfigDto, ApiType } from './dto/api-config.dto';

@Injectable()
export class ApiConfigService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeModelName(apiUrl?: string | null, modelName?: string | null) {
    const raw = typeof modelName === 'string' ? modelName.trim() : '';
    if (!raw) return raw;

    const host = typeof apiUrl === 'string' ? apiUrl.toLowerCase() : '';
    if (!host.includes('deepseek.com')) {
      return raw;
    }

    const normalized = raw.toLowerCase();
    if (normalized === 'deepseek-v4-pro' || normalized === 'deepseek-v4-flash') {
      return normalized;
    }
    return raw;
  }

  private normalizeCreateDto(dto: CreateApiConfigDto): CreateApiConfigDto {
    return {
      ...dto,
      apiUrl: dto.apiUrl?.trim(),
      modelName: this.normalizeModelName(dto.apiUrl, dto.modelName),
    };
  }

  private normalizeUpdateDto(existing: { apiUrl: string; modelName: string }, dto: UpdateApiConfigDto): UpdateApiConfigDto {
    const apiUrl = dto.apiUrl?.trim() ?? existing.apiUrl;
    const modelName = dto.modelName !== undefined
      ? this.normalizeModelName(apiUrl, dto.modelName)
      : this.normalizeModelName(apiUrl, existing.modelName);
    return {
      ...dto,
      ...(dto.apiUrl !== undefined ? { apiUrl } : {}),
      ...(modelName !== existing.modelName || dto.modelName !== undefined || dto.apiUrl !== undefined ? { modelName } : {}),
    };
  }

  async create(userId: string, createApiConfigDto: CreateApiConfigDto) {
    // 如果这是第一个配置，自动设为激活
    const existingCount = await this.prisma.apiConfig.count({
      where: { userId },
    });

    const apiConfig = await this.prisma.apiConfig.create({
      data: {
        ...this.normalizeCreateDto(createApiConfigDto),
        userId,
        isActive: existingCount === 0,
      },
    });

    // 不返回完整的 API key
    return {
      ...apiConfig,
      apiKey: apiConfig.apiKey.substring(0, 8) + '...',
    };
  }

  async findAll(userId: string) {
    const configs = await this.prisma.apiConfig.findMany({
      where: { userId },
      orderBy: { lastUsedAt: 'desc' },
    });

    // 不返回完整的 API key
    return configs.map(config => ({
      ...config,
      apiKey: config.apiKey.substring(0, 8) + '...',
    }));
  }

  async findAllForUse(userId: string) {
    return this.prisma.apiConfig.findMany({
      where: { userId },
      orderBy: [
        { isActive: 'desc' },
        { lastUsedAt: 'desc' },
        { createdAt: 'asc' },
      ],
    });
  }

  async findOne(userId: string, id: string) {
    const config = await this.prisma.apiConfig.findFirst({
      where: { id, userId },
    });

    if (!config) {
      throw new NotFoundException('API configuration not found');
    }

    // 返回完整的 API key 用于使用
    return config;
  }

  async update(userId: string, id: string, updateApiConfigDto: UpdateApiConfigDto) {
    const config = await this.prisma.apiConfig.findFirst({
      where: { id, userId },
    });

    if (!config) {
      throw new NotFoundException('API configuration not found');
    }

    const updated = await this.prisma.apiConfig.update({
      where: { id },
      data: this.normalizeUpdateDto(config, updateApiConfigDto),
    });

    return {
      ...updated,
      apiKey: updated.apiKey.substring(0, 8) + '...',
    };
  }

  async remove(userId: string, id: string) {
    const config = await this.prisma.apiConfig.findFirst({
      where: { id, userId },
    });

    if (!config) {
      throw new NotFoundException('API configuration not found');
    }

    // 如果删除的是激活的配置，需要激活另一个
    if (config.isActive) {
      const remainingConfigs = await this.prisma.apiConfig.findMany({
        where: { userId, id: { not: id } },
        take: 1,
      });

      if (remainingConfigs.length > 0) {
        await this.prisma.apiConfig.update({
          where: { id: remainingConfigs[0].id },
          data: { isActive: true },
        });
      }
    }

    await this.prisma.apiConfig.delete({
      where: { id },
    });

    return { message: 'API configuration deleted successfully' };
  }

  async activate(userId: string, id: string) {
    const config = await this.prisma.apiConfig.findFirst({
      where: { id, userId },
    });

    if (!config) {
      throw new NotFoundException('API configuration not found');
    }

    // 取消所有其他配置的激活状态
    await this.prisma.apiConfig.updateMany({
      where: { userId, isActive: true },
      data: { isActive: false },
    });

    // 激活当前配置
    const updated = await this.prisma.apiConfig.update({
      where: { id },
      data: { 
        isActive: true,
        lastUsedAt: new Date(),
      },
    });

    return {
      ...updated,
      apiKey: updated.apiKey.substring(0, 8) + '...',
    };
  }

  async getActive(userId: string) {
    const config = await this.prisma.apiConfig.findFirst({
      where: { userId, isActive: true },
    });

    if (!config) {
      throw new NotFoundException('No active API configuration found');
    }

    // 返回完整的 API key 用于使用
    return config;
  }
}
