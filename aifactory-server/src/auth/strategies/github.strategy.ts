import { Injectable, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-github2';

@Injectable()
export class GithubStrategy extends PassportStrategy(Strategy, 'github') {
  private readonly logger = new Logger(GithubStrategy.name);

  constructor() {
    const clientID = process.env.GITHUB_CLIENT_ID?.trim();
    const clientSecret = process.env.GITHUB_CLIENT_SECRET?.trim();

    super({
      clientID: clientID || 'github-oauth-disabled',
      clientSecret: clientSecret || 'github-oauth-disabled',
      callbackURL: process.env.GITHUB_CALLBACK_URL || 'http://localhost:3100/api/auth/github/callback',
      scope: ['user:email'],
    });

    if (!clientID || !clientSecret) {
      this.logger.warn('GitHub OAuth is disabled because GITHUB_CLIENT_ID or GITHUB_CLIENT_SECRET is missing.');
    }
  }

  async validate(accessToken: string, refreshToken: string, profile: any) {
    const { id, emails, displayName, username, photos } = profile;
    return {
      provider: 'github',
      providerId: id,
      githubLogin: username,
      email: emails?.[0]?.value || `${username}@github.com`,
      displayName: displayName || username,
      avatarUrl: photos?.[0]?.value,
      accessToken,
    };
  }
}
