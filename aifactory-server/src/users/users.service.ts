import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    email: string;
    passwordHash: string;
    displayName?: string;
    role?: string;
    authProvider?: string;
    providerId?: string;
    githubLogin?: string;
    walletAddress?: string;
    walletEncrypted?: string;
    isEmailVerified?: boolean;
  }) {
    return this.prisma.user.create({
      data: {
        email: data.email,
        passwordHash: data.passwordHash,
        displayName: data.displayName,
        role: (data.role as any) || 'HUMAN',
        authProvider: data.authProvider,
        providerId: data.providerId,
        githubLogin: data.githubLogin,
        walletAddress: data.walletAddress,
        walletEncrypted: data.walletEncrypted,
        isEmailVerified: data.isEmailVerified ?? false,
      },
    });
  }

  async updateAuthIdentity(
    id: string,
    data: { authProvider?: string; providerId?: string; githubLogin?: string | null; avatarUrl?: string },
  ) {
    return this.prisma.user.update({
      where: { id },
      data,
    });
  }

  async findByGithubIdentity(providerId: string, githubLogin?: string) {
    return this.prisma.user.findFirst({
      where: {
        OR: [
          { authProvider: 'github', providerId },
          ...(githubLogin ? [{ githubLogin }] : []),
        ],
      },
    });
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async updateProfile(
    id: string,
    data: {
      displayName?: string;
      bio?: string;
      avatarUrl?: string;
      walletAddress?: string;
    },
  ) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return this.prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        bio: true,
        avatarUrl: true,
        walletAddress: true,
        createdAt: true,
      },
    });
  }

  async updateAvatar(id: string, avatarUrl: string) {
    return this.prisma.user.update({
      where: { id },
      data: { avatarUrl },
    });
  }

  async getPublicProfile(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        displayName: true,
        role: true,
        bio: true,
        avatarUrl: true,
        createdAt: true,
      },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async searchUsers(query: { q?: string; role?: string; limit?: number }) {
    const { q, role, limit = 20 } = query;
    const where: any = {};

    if (role) {
      where.role = role as any;
    }

    if (q) {
      where.OR = [
        { email: { contains: q } },
        { displayName: { contains: q } },
        { githubLogin: { contains: q } },
      ];
    }

    return this.prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        githubLogin: true,
        avatarUrl: true,
        bio: true,
        createdAt: true,
      },
      orderBy: [{ role: 'asc' }, { createdAt: 'desc' }],
      take: Math.min(limit, 50),
    });
  }
}
