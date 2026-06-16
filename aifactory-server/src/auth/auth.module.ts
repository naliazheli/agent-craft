import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { GithubStrategy } from './strategies/github.strategy';
import { GoogleStrategy } from './strategies/google.strategy';
import { UsersModule } from '../users/users.module';
import { WalletModule } from '../wallet/wallet.module';
import { AvatarModule } from '../avatar/avatar.module';
import { GithubAuthGuard } from './guards/github-auth.guard';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { XOAuthService } from './x-oauth.service';
import { EmailService } from './email.service';
import { EmailVerificationService } from './email-verification.service';
import { resolveJwtSecret } from './jwt-secret';

@Module({
  imports: [
    UsersModule,
    WalletModule,
    AvatarModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: resolveJwtSecret(configService.get<string>('JWT_SECRET')),
        signOptions: { expiresIn: (configService.get<string>('JWT_EXPIRES_IN') || '7d') as any },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    GithubStrategy,
    GoogleStrategy,
    GithubAuthGuard,
    GoogleAuthGuard,
    XOAuthService,
    EmailService,
    EmailVerificationService,
  ],
  exports: [AuthService],
})
export class AuthModule {}
