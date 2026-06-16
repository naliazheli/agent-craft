const DEFAULT_OAUTH_REDIRECT_URL = 'http://localhost:5174/oauth/callback';

function splitList(value?: string) {
  return (value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function configuredDefaultRedirect() {
  return process.env.OAUTH_REDIRECT_URL?.trim() || DEFAULT_OAUTH_REDIRECT_URL;
}

function addOriginFromUrl(value: string | undefined, origins: Set<string>) {
  if (!value || value === '*') return;
  try {
    origins.add(new URL(value).origin);
  } catch {
    // Values such as bare paths are not origins.
  }
}

function allowedRedirectOrigins() {
  const origins = new Set<string>();
  addOriginFromUrl(configuredDefaultRedirect(), origins);
  addOriginFromUrl(process.env.FRONTEND_BASE_URL, origins);
  addOriginFromUrl(process.env.PUBLIC_APP_URL, origins);
  addOriginFromUrl(process.env.APP_BASE_URL, origins);

  for (const value of splitList(process.env.CORS_ORIGIN)) {
    addOriginFromUrl(value, origins);
  }
  for (const value of splitList(process.env.OAUTH_ALLOWED_REDIRECT_ORIGINS)) {
    addOriginFromUrl(value, origins);
  }

  return origins;
}

export function resolveOAuthRedirectUrl(redirect?: string) {
  const fallback = configuredDefaultRedirect();
  const raw = redirect?.trim();
  if (!raw) return fallback;

  if (/[\x00-\x1F\x7F]/.test(raw)) {
    return fallback;
  }

  if (raw.startsWith('/') && !raw.startsWith('//')) {
    return new URL(raw, new URL(fallback).origin).toString();
  }

  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol)) {
      return fallback;
    }
    if (!allowedRedirectOrigins().has(url.origin)) {
      return fallback;
    }
    return url.toString();
  } catch {
    return fallback;
  }
}

export function appendOAuthRedirectParam(redirectUrl: string, key: 'token' | 'error', value: string) {
  const url = new URL(resolveOAuthRedirectUrl(redirectUrl));
  url.searchParams.set(key, value);
  return url.toString();
}
