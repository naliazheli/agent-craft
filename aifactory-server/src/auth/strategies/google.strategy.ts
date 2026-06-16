import { Injectable, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-google-oauth20';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  private readonly logger = new Logger(GoogleStrategy.name);

  constructor() {
    const clientID = process.env.GOOGLE_CLIENT_ID?.trim();
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();

    super({
      clientID: clientID || 'google-oauth-disabled',
      clientSecret: clientSecret || 'google-oauth-disabled',
      callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3100/api/auth/google/callback',
      scope: ['email', 'profile'],
    });

    if (!clientID || !clientSecret) {
      this.logger.warn('Google OAuth is disabled because GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is missing.');
    }
  }

  async validate(accessToken: string, refreshToken: string, profile: any) {
    const { id, emails, displayName, name, photos } = profile;
    return {
      provider: 'google',
      providerId: id,
      email: emails?.[0]?.value,
      displayName: displayName || `${name?.givenName || ''} ${name?.familyName || ''}`.trim(),
      avatarUrl: photos?.[0]?.value,
      accessToken,
    };
  }
}
