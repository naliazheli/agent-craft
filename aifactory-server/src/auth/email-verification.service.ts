import { randomInt } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { EmailService } from './email.service';

const REGISTER_PURPOSE = 'register';

@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly emailService: EmailService,
    private readonly config: ConfigService,
  ) {}

  async sendRegisterCode(rawEmail: string) {
    const email = this.normalizeEmail(rawEmail);
    const existing = await this.usersService.findByEmail(email);
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    if (this.isVerificationDisabled()) {
      this.logger.warn(`Email verification is disabled; skipping register code delivery for ${email}.`);
      return {
        email,
        expiresInSeconds: 0,
        skipped: true,
        ...(this.shouldReturnDebugCode() ? { debugCode: '000000' } : {}),
      };
    }

    await this.enforceCooldown(email);
    const code = randomInt(100000, 1000000).toString();
    const codeHash = await bcrypt.hash(code, 10);
    const ttlMinutes = Number(this.config.get<string>('EMAIL_VERIFICATION_TTL_MINUTES') || 10);
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

    await this.prisma.emailVerificationCode.create({
      data: {
        email,
        codeHash,
        purpose: REGISTER_PURPOSE,
        expiresAt,
      },
    });

    await this.emailService.sendVerificationCode(email, code);

    return {
      email,
      expiresInSeconds: ttlMinutes * 60,
      ...(this.shouldReturnDebugCode() ? { debugCode: code } : {}),
    };
  }

  async verifyRegisterCode(rawEmail: string, code?: string) {
    if (this.isVerificationDisabled()) {
      return;
    }

    const email = this.normalizeEmail(rawEmail);
    if (!code || !/^\d{6}$/.test(code)) {
      throw new BadRequestException('Invalid verification code');
    }

    const record = await this.prisma.emailVerificationCode.findFirst({
      where: {
        email,
        purpose: REGISTER_PURPOSE,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!record) {
      throw new UnauthorizedException('Verification code is invalid or expired');
    }

    if (record.attempts >= 5) {
      throw new HttpException('Too many verification attempts', HttpStatus.TOO_MANY_REQUESTS);
    }

    const isValid = await bcrypt.compare(code, record.codeHash);
    if (!isValid) {
      await this.prisma.emailVerificationCode.update({
        where: { id: record.id },
        data: { attempts: { increment: 1 } },
      });
      throw new UnauthorizedException('Verification code is invalid or expired');
    }

    await this.prisma.emailVerificationCode.update({
      where: { id: record.id },
      data: { consumedAt: new Date() },
    });
  }

  normalizeEmail(email: string) {
    return email.trim().toLowerCase();
  }

  isVerificationDisabled() {
    return (
      this.config.get<string>('EMAIL_VERIFICATION_DISABLED') === 'true' ||
      this.config.get<string>('SKIP_EMAIL_VERIFICATION') === 'true'
    );
  }

  private async enforceCooldown(email: string) {
    const cooldownSeconds = Number(this.config.get<string>('EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS') || 60);
    const latest = await this.prisma.emailVerificationCode.findFirst({
      where: {
        email,
        purpose: REGISTER_PURPOSE,
        createdAt: { gt: new Date(Date.now() - cooldownSeconds * 1000) },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (latest) {
      throw new HttpException(
        'Verification code was sent recently. Please wait before trying again.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private shouldReturnDebugCode() {
    if (this.config.get<string>('EMAIL_VERIFICATION_DEBUG_RESPONSE') === 'true') {
      return true;
    }

    if (process.env.NODE_ENV !== 'production') {
      this.logger.warn('Returning email verification debugCode because NODE_ENV is not production.');
      return true;
    }

    return false;
  }
}
