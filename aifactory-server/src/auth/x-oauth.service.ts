import { createHash, randomBytes } from 'crypto';
import { BadGatewayException, ConflictException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Response } from 'express';
import { OAuthUser } from './types/oauth-user';
import { signOAuthState, verifyOAuthState } from './oauth-state';

interface XUserResponse {
  data?: {
    id: string;
    name?: string;
    username?: string;
    profile_image_url?: string;
  };
}

@Injectable()
export class XOAuthService {
  private readonly logger = new Logger(XOAuthService.name);
  private readonly cookieName = 'agentcraft_x_oauth_verifier';
  private readonly nonceCookieName = 'agentcraft_x_oauth_nonce';

  constructor(private readonly jwtService: JwtService) {}

  buildAuthorizationRedirect(res: Response, redirect?: string) {
    const clientId = process.env.X_CLIENT_ID?.trim();
    if (!clientId) {
      throw new ConflictException('X OAuth is not configured');
    }

    const callbackUrl = process.env.X_CALLBACK_URL || 'http://localhost:3000/api/auth/x/callback';
    const codeVerifier = this.generateCodeVerifier();
    const nonce = randomBytes(16).toString('hex');
    const state = signOAuthState(this.jwtService, {
      type: 'oauth',
      provider: 'x',
      mode: 'login',
      redirect: redirect || process.env.OAUTH_REDIRECT_URL || 'http://localhost:5173/oauth/callback',
      xNonce: nonce,
    });
    const codeChallenge = this.base64UrlEncode(createHash('sha256').update(codeVerifier).digest());

    this.setOauthCookie(res, this.cookieName, codeVerifier);
    this.setOauthCookie(res, this.nonceCookieName, nonce);

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: callbackUrl,
      scope: 'users.read tweet.read',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    return `https://x.com/i/oauth2/authorize?${params.toString()}`;
  }

  resolveRedirectFromState(state?: string) {
    const payload = verifyOAuthState(this.jwtService, state);
    return payload?.provider === 'x' ? payload.redirect : undefined;
  }

  async fetchOAuthUser(code: string, state: string | undefined, codeVerifier: string | undefined, nonce: string | undefined): Promise<OAuthUser> {
    const payload = verifyOAuthState(this.jwtService, state);
    if (!payload || payload.provider !== 'x' || payload.xNonce !== nonce) {
      throw new UnauthorizedException('Invalid X OAuth state');
    }

    if (!codeVerifier) {
      throw new UnauthorizedException('Missing X OAuth verifier');
    }

    const callbackUrl = process.env.X_CALLBACK_URL || 'http://localhost:3000/api/auth/x/callback';
    const token = await this.exchangeCodeForToken(code, codeVerifier, callbackUrl);
    const profile = await this.fetchProfile(token.access_token);
    const xUser = profile.data;

    if (!xUser?.id) {
      throw new BadGatewayException('X profile response is missing user id');
    }

    const username = xUser.username || xUser.id;
    return {
      provider: 'x',
      providerId: xUser.id,
      email: `x-${xUser.id}@oauth.agentcraft.local`,
      displayName: xUser.name || username,
      username,
      avatarUrl: xUser.profile_image_url,
      accessToken: token.access_token,
    };
  }

  clearOauthCookies(res: Response) {
    this.clearOauthCookie(res, this.cookieName);
    this.clearOauthCookie(res, this.nonceCookieName);
  }

  private async exchangeCodeForToken(code: string, codeVerifier: string, callbackUrl: string) {
    const clientId = process.env.X_CLIENT_ID?.trim();
    const clientSecret = process.env.X_CLIENT_SECRET?.trim();
    if (!clientId) {
      throw new ConflictException('X OAuth is not configured');
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
    };

    if (clientSecret) {
      headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
    }

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: callbackUrl,
      code_verifier: codeVerifier,
    });

    if (!clientSecret) {
      body.set('client_id', clientId);
    }

    const response = await fetch('https://api.x.com/2/oauth2/token', {
      method: 'POST',
      headers,
      body,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      this.logger.warn(`X token exchange failed: ${response.status} ${errorBody}`);
      throw new BadGatewayException('X token exchange failed');
    }

    return response.json() as Promise<{ access_token: string; refresh_token?: string; expires_in?: number }>;
  }

  private async fetchProfile(accessToken: string): Promise<XUserResponse> {
    const params = new URLSearchParams({
      'user.fields': 'profile_image_url,username,name,verified',
    });
    const response = await fetch(`https://api.x.com/2/users/me?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      this.logger.warn(`X profile fetch failed: ${response.status} ${errorBody}`);
      throw new BadGatewayException('X profile fetch failed');
    }

    return response.json() as Promise<XUserResponse>;
  }

  private generateCodeVerifier() {
    return this.base64UrlEncode(randomBytes(32));
  }

  private base64UrlEncode(buffer: Buffer) {
    return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  private setOauthCookie(res: Response, name: string, value: string) {
    res.cookie(name, value, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 10 * 60 * 1000,
      path: '/api/auth/x',
    });
  }

  private clearOauthCookie(res: Response, name: string) {
    res.clearCookie(name, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api/auth/x',
    });
  }
}
