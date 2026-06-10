import { Controller, Post, Body, Get, UseGuards, Request, HttpCode, Res, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { SendEmailVerificationDto } from './dto/send-email-verification.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { GithubAuthGuard } from './guards/github-auth.guard';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { XOAuthService } from './x-oauth.service';
import { EmailVerificationService } from './email-verification.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly xOAuthService: XOAuthService,
    private readonly emailVerificationService: EmailVerificationService,
  ) {}

  private getOauthRedirectUrl(redirect?: string) {
    return redirect || process.env.OAUTH_REDIRECT_URL || 'http://localhost:5173/oauth/callback';
  }

  @Post('register')
  @ApiOperation({ summary: 'Register a new user' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('email/verification-code')
  @HttpCode(200)
  @ApiOperation({ summary: 'Send email verification code for registration' })
  sendEmailVerificationCode(@Body() dto: SendEmailVerificationDto) {
    return this.emailVerificationService.sendRegisterCode(dto.email);
  }

  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Login with email and password' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile' })
  getMe(@Request() req: any) {
    return req.user;
  }

  // GitHub OAuth
  @Get('github')
  @UseGuards(GithubAuthGuard)
  @ApiOperation({ summary: 'Login with GitHub' })
  githubAuth() {
    // Guard redirects to GitHub
  }

  @Get('github/callback')
  @UseGuards(GithubAuthGuard)
  @ApiOperation({ summary: 'GitHub OAuth callback' })
  async githubCallback(
    @Request() req: any,
    @Res() res: Response,
    @Query('redirect') redirect?: string,
    @Query('state') state?: string,
  ) {
    const callbackMode = this.authService.resolveGithubCallback(req.user, state);
    const result =
      callbackMode.mode === 'bind'
        ? await this.authService.bindGithubIdentity(callbackMode.userId, req.user)
        : await this.authService.oauthLogin(req.user);
    const redirectUrl = this.getOauthRedirectUrl(callbackMode.mode === 'bind' ? callbackMode.redirect : redirect);
    return res.redirect(`${redirectUrl}?token=${encodeURIComponent(result.access_token)}`);
  }

  @Get('github/bind-url')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get GitHub bind URL for the current user' })
  githubBindUrl(@Request() req: any, @Query('redirect') redirect?: string) {
    return this.authService.buildGithubBindUrl(req.user.id, redirect);
  }

  // Google OAuth
  @Get('google')
  @UseGuards(GoogleAuthGuard)
  @ApiOperation({ summary: 'Login with Google' })
  googleAuth() {
    // Guard redirects to Google
  }

  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  @ApiOperation({ summary: 'Google OAuth callback' })
  async googleCallback(@Request() req: any, @Res() res: Response, @Query('redirect') redirect?: string) {
    const result = await this.authService.oauthLogin(req.user);
    const redirectUrl = this.getOauthRedirectUrl(redirect);
    return res.redirect(`${redirectUrl}?token=${encodeURIComponent(result.access_token)}`);
  }

  // X.com OAuth
  @Get('x')
  @ApiOperation({ summary: 'Login with X.com' })
  xAuth(@Res() res: Response, @Query('redirect') redirect?: string) {
    const authorizationUrl = this.xOAuthService.buildAuthorizationRedirect(res, redirect);
    return res.redirect(authorizationUrl);
  }

  @Get('x/callback')
  @ApiOperation({ summary: 'X.com OAuth callback' })
  async xCallback(
    @Req() req: any,
    @Res() res: Response,
    @Query('code') code?: string,
    @Query('state') state?: string,
    @Query('error') error?: string,
  ) {
    const redirectUrl = this.getOauthRedirectUrl(this.xOAuthService.resolveRedirectFromState(state));
    if (error || !code) {
      this.xOAuthService.clearOauthCookies(res);
      return res.redirect(`${redirectUrl}?error=${encodeURIComponent(error || 'oauth_failed')}`);
    }

    const cookies = this.parseCookies(req.headers?.cookie);
    try {
      const oauthUser = await this.xOAuthService.fetchOAuthUser(
        code,
        state,
        cookies.agentcraft_x_oauth_verifier,
        cookies.agentcraft_x_oauth_nonce,
      );
      const result = await this.authService.oauthLogin(oauthUser);
      return res.redirect(`${redirectUrl}?token=${encodeURIComponent(result.access_token)}`);
    } catch (err: any) {
      return res.redirect(`${redirectUrl}?error=${encodeURIComponent(err?.message || 'oauth_failed')}`);
    } finally {
      this.xOAuthService.clearOauthCookies(res);
    }
  }

  private parseCookies(cookieHeader?: string) {
    return (cookieHeader || '').split(';').reduce<Record<string, string>>((cookies, cookie) => {
      const [rawName, ...rawValue] = cookie.trim().split('=');
      if (!rawName || rawValue.length === 0) {
        return cookies;
      }
      cookies[rawName] = decodeURIComponent(rawValue.join('='));
      return cookies;
    }, {});
  }
}
