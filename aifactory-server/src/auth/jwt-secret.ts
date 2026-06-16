const DEV_JWT_SECRET = 'dev-secret';

const INSECURE_PRODUCTION_SECRETS = new Set([
  DEV_JWT_SECRET,
  'dev-jwt-secret-change-in-production',
  'your-super-secret-jwt-key-change-in-production',
]);

export function resolveJwtSecret(value = process.env.JWT_SECRET): string {
  const secret = value?.trim();
  const isProduction = process.env.NODE_ENV === 'production';

  if (!secret) {
    if (isProduction) {
      throw new Error('JWT_SECRET must be configured in production');
    }
    return DEV_JWT_SECRET;
  }

  if (isProduction && (secret.length < 32 || INSECURE_PRODUCTION_SECRETS.has(secret))) {
    throw new Error('JWT_SECRET must be a non-placeholder secret of at least 32 characters in production');
  }

  return secret;
}
