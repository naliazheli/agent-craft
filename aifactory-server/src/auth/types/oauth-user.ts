export type OAuthProvider = 'github' | 'google' | 'x';

export interface OAuthUser {
  provider: OAuthProvider;
  providerId: string;
  email: string;
  displayName: string;
  githubLogin?: string;
  username?: string;
  avatarUrl?: string;
  accessToken?: string;
}
