import { appEnv } from './env';

export function canAccessSystemArea(user?: { email?: string; role?: string } | null) {
  const normalizedEmail = user?.email?.toLowerCase() || '';
  return (
    user?.role === 'ADMIN' ||
    normalizedEmail === appEnv.systemUserEmail ||
    (Boolean(appEnv.legacySystemEmail) && normalizedEmail === appEnv.legacySystemEmail)
  );
}
