import { JwtService } from '@nestjs/jwt';

export type OAuthStateMode = 'login' | 'bind';

export interface OAuthStatePayload {
  type?: string;
  provider?: string;
  mode?: OAuthStateMode;
  userId?: string;
  redirect?: string;
  xNonce?: string;
}

export function signOAuthState(jwtService: JwtService, payload: OAuthStatePayload) {
  return jwtService.sign(payload, {
    secret: process.env.JWT_SECRET || 'dev-secret',
    expiresIn: '10m',
  });
}

export function verifyOAuthState(jwtService: JwtService, state?: string): OAuthStatePayload | null {
  if (!state) {
    return null;
  }

  try {
    return jwtService.verify(state, {
      secret: process.env.JWT_SECRET || 'dev-secret',
    }) as OAuthStatePayload;
  } catch {
    return null;
  }
}
