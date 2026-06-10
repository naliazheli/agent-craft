import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  Logger,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';
import { WalletService } from '../wallet/wallet.service';
import { BlockchainService } from '../wallet/blockchain.service';
import { AvatarService } from '../avatar/avatar.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { OAuthUser } from './types/oauth-user';
import { EmailVerificationService } from './email-verification.service';
import { normalizeOptionalEmail, normalizeSystemEmail } from '../common/system-email';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly legacySystemEmail = normalizeOptionalEmail(process.env.LEGACY_SYSTEM_EMAIL);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly walletService: WalletService,
    private readonly blockchainService: BlockchainService,
    private readonly avatarService: AvatarService,
    private readonly emailVerificationService: EmailVerificationService,
  ) {}

  async register(dto: RegisterDto) {
    const email = this.emailVerificationService.normalizeEmail(dto.email);
    const existing = await this.usersService.findByEmail(email);
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    await this.emailVerificationService.verifyRegisterCode(email, dto.verificationCode);

    // Use user-provided wallet or generate a custodial wallet
    let walletAddress: string | undefined;
    let walletEncrypted: string | undefined;

    if (dto.walletAddress) {
      // Validate external wallet address format
      if (!/^0x[a-fA-F0-9]{40}$/.test(dto.walletAddress)) {
        throw new ConflictException('Invalid wallet address format. Must be a valid Ethereum address.');
      }
      walletAddress = dto.walletAddress;
      // No encrypted key for external wallets
    } else {
      try {
        const wallet = this.blockchainService.createWallet();
        walletAddress = wallet.address;
        walletEncrypted = wallet.encryptedPrivateKey;
      } catch (err) {
        this.logger.warn(`Failed to generate wallet: ${err.message}`);
      }
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.usersService.create({
      email,
      passwordHash,
      displayName: dto.displayName,
      role: dto.role,
      walletAddress,
      walletEncrypted,
      isEmailVerified: true,
    });

    let avatarUrl = user.avatarUrl;

    // Generate default avatar
    try {
      avatarUrl = await this.avatarService.generateDefaultAvatar(
        user.id,
        user.email,
        user.displayName || undefined,
      );
      await this.usersService.updateAvatar(user.id, avatarUrl);
    } catch (err) {
      this.logger.warn(`Failed to generate default avatar for ${user.id}: ${err.message}`);
    }

    // On-chain airdrop: send 5 AIC from deployer wallet to user's wallet
    let airdropTxHash: string | undefined;
    if (walletAddress) {
      try {
        const bonus = process.env.SIGNUP_BONUS || '5';
        const txHash = await this.blockchainService.airdropSignupBonus(walletAddress, bonus);
        airdropTxHash = txHash || undefined;
      } catch (err) {
        this.logger.warn(`On-chain airdrop failed for ${user.id}: ${err.message}`);
      }
    }

    // Grant off-chain signup bonus (with on-chain txHash if available)
    try {
      await this.walletService.grantSignupBonus(user.id, airdropTxHash);
    } catch (err) {
      this.logger.warn(`Failed to grant signup bonus to ${user.id}: ${err.message}`);
    }

    const token = this.generateToken(user.id, user.email);
    return {
      access_token: token,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        walletAddress: user.walletAddress,
        avatarUrl,
        authProvider: user.authProvider,
        githubLogin: user.githubLogin,
      },
    };
  }

  async login(dto: LoginDto) {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const systemEmail = normalizeSystemEmail(process.env.SYSTEM_USER_EMAIL);
    const shouldTryLegacySystemAlias =
      Boolean(this.legacySystemEmail) &&
      normalizedEmail === this.legacySystemEmail &&
      normalizedEmail !== systemEmail;

    let aliasAuthenticatedAs: string | null = null;
    let user =
      shouldTryLegacySystemAlias
        ? await this.usersService.findByEmail(systemEmail)
        : await this.usersService.findByEmail(dto.email);

    if (!user) {
      throw new UnauthorizedException('用户不存在，请先注册');
    }

    let isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (isPasswordValid && shouldTryLegacySystemAlias) {
      aliasAuthenticatedAs = systemEmail;
    }

    if (!isPasswordValid) {
      throw new UnauthorizedException('密码错误');
    }

    if (aliasAuthenticatedAs) {
      this.logger.warn(
        `Legacy system login alias used for ${this.legacySystemEmail}; authenticated as ${aliasAuthenticatedAs}.`,
      );
    }

    const token = this.generateToken(user.id, user.email);
    return {
      access_token: token,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        avatarUrl: user.avatarUrl,
        authProvider: user.authProvider,
        githubLogin: user.githubLogin,
      },
    };
  }

  private generateToken(userId: string, email: string): string {
    return this.jwtService.sign({ sub: userId, email });
  }

  buildGithubBindUrl(userId: string, redirect?: string) {
    const clientId = process.env.GITHUB_CLIENT_ID?.trim();
    if (!clientId) {
      throw new ConflictException('GitHub OAuth is not configured');
    }

    const callbackUrl =
      process.env.GITHUB_CALLBACK_URL || 'http://localhost:3000/api/auth/github/callback';
    const state = this.jwtService.sign(
      {
        type: 'github_bind',
        userId,
        redirect: redirect || process.env.OAUTH_REDIRECT_URL || 'http://localhost:5173/oauth/callback',
      },
      {
        secret: process.env.JWT_SECRET || 'dev-secret',
        expiresIn: '10m',
      },
    );

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: callbackUrl,
      scope: 'user:email',
      state,
    });

    return { url: `https://github.com/login/oauth/authorize?${params.toString()}` };
  }

  async oauthLogin(oauthUser: OAuthUser) {
    // Find or create user by email
    let user = await this.usersService.findByEmail(oauthUser.email);

    if (!user) {
      // Generate wallet for new OAuth user
      let walletAddress: string | undefined;
      let walletEncrypted: string | undefined;
      try {
        const wallet = this.blockchainService.createWallet();
        walletAddress = wallet.address;
        walletEncrypted = wallet.encryptedPrivateKey;
      } catch (err) {
        this.logger.warn(`Failed to generate wallet for OAuth user: ${err.message}`);
      }

      // Create new user from OAuth data
      user = await this.usersService.create({
        email: oauthUser.email,
        displayName: oauthUser.displayName,
        passwordHash: await bcrypt.hash(Math.random().toString(36), 10), // Random password
        role: 'HUMAN',
        authProvider: oauthUser.provider,
        providerId: oauthUser.providerId,
        githubLogin: oauthUser.provider === 'github' ? oauthUser.githubLogin : undefined,
        walletAddress,
        walletEncrypted,
      });

      // Set avatar if provided by OAuth
      if (oauthUser.avatarUrl) {
        await this.usersService.updateAvatar(user.id, oauthUser.avatarUrl);
      } else {
        // Generate default avatar
        try {
          const avatarUrl = await this.avatarService.generateDefaultAvatar(
            user.id,
            user.email,
            user.displayName || undefined,
          );
          await this.usersService.updateAvatar(user.id, avatarUrl);
        } catch (err) {
          this.logger.warn(`Failed to generate avatar for OAuth user ${user.id}: ${err.message}`);
        }
      }

      // Grant signup bonus
      let airdropTxHash: string | undefined;
      if (walletAddress) {
        try {
          const bonus = process.env.SIGNUP_BONUS || '5';
          const txHash = await this.blockchainService.airdropSignupBonus(walletAddress, bonus);
          airdropTxHash = txHash || undefined;
        } catch (err) {
          this.logger.warn(`On-chain airdrop failed for OAuth user: ${err.message}`);
        }
      }

      try {
        await this.walletService.grantSignupBonus(user.id, airdropTxHash);
      } catch (err) {
        this.logger.warn(`Failed to grant signup bonus to OAuth user ${user.id}: ${err.message}`);
      }
    }

    if (
      user.authProvider !== oauthUser.provider ||
      user.providerId !== oauthUser.providerId ||
      (oauthUser.provider === 'github' && user.githubLogin !== oauthUser.githubLogin) ||
      (oauthUser.avatarUrl && user.avatarUrl !== oauthUser.avatarUrl)
    ) {
      user = await this.usersService.updateAuthIdentity(user.id, {
        authProvider: oauthUser.provider,
        providerId: oauthUser.providerId,
        githubLogin: oauthUser.provider === 'github' ? (oauthUser.githubLogin ?? null) : user.githubLogin,
        avatarUrl: oauthUser.avatarUrl,
      });
    }

    const token = this.generateToken(user.id, user.email);

    return {
      access_token: token,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        walletAddress: user.walletAddress,
        avatarUrl: user.avatarUrl,
        authProvider: user.authProvider,
        githubLogin: user.githubLogin,
      },
    };
  }

  async bindGithubIdentity(
    userId: string,
    oauthUser: OAuthUser,
  ) {
    if (oauthUser.provider !== 'github') {
      throw new ForbiddenException('Only GitHub identities can be bound here');
    }

    const currentUser = await this.usersService.findById(userId);
    if (!currentUser) {
      throw new UnauthorizedException('User not found');
    }

    const existingGithubUser = await this.usersService.findByGithubIdentity(
      oauthUser.providerId,
      oauthUser.githubLogin,
    );

    if (existingGithubUser && existingGithubUser.id !== userId) {
      throw new ConflictException('This GitHub account is already bound to another user');
    }

    const updated = await this.usersService.updateAuthIdentity(userId, {
      authProvider: 'github',
      providerId: oauthUser.providerId,
      githubLogin: oauthUser.githubLogin ?? null,
      avatarUrl: oauthUser.avatarUrl || currentUser.avatarUrl || undefined,
    });

    const token = this.generateToken(updated.id, updated.email);
    return {
      access_token: token,
      user: {
        id: updated.id,
        email: updated.email,
        displayName: updated.displayName,
        role: updated.role,
        walletAddress: updated.walletAddress,
        avatarUrl: updated.avatarUrl,
        authProvider: updated.authProvider,
        githubLogin: updated.githubLogin,
      },
    };
  }

  resolveGithubCallback(reqUser: any, state?: string) {
    if (!state) {
      return { mode: 'login' as const };
    }

    try {
      const payload = this.jwtService.verify(state, {
        secret: process.env.JWT_SECRET || 'dev-secret',
      }) as { type?: string; userId?: string; redirect?: string };

      if (payload.type === 'github_bind' && payload.userId) {
        return {
          mode: 'bind' as const,
          userId: payload.userId,
          redirect: payload.redirect,
        };
      }
    } catch {
      this.logger.warn(`Invalid GitHub OAuth state for ${reqUser?.email || 'unknown user'}`);
    }

    return { mode: 'login' as const };
  }
}
