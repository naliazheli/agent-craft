function trimTrailingSlash(value: string): string {
  if (value.length <= 1) return value;
  return value.replace(/\/+$/, '');
}

function normalizeBasePath(value: string | undefined, fallback = '/'): string {
  const raw = (value || fallback).trim();
  if (!raw || raw === '/') return '/';

  const normalized = raw.startsWith('/') ? raw : `/${raw}`;
  return trimTrailingSlash(normalized) || '/';
}

function normalizeServiceBase(value: string | undefined, fallback: string): string {
  const raw = (value || fallback).trim();
  if (!raw) return fallback;

  if (/^https?:\/\//i.test(raw)) {
    return trimTrailingSlash(raw);
  }

  return normalizeBasePath(raw, fallback);
}

export const appEnv = {
  appBasePath: normalizeBasePath(import.meta.env.VITE_APP_BASE_PATH, '/'),
  apiBaseUrl: normalizeServiceBase(import.meta.env.VITE_API_BASE_URL, '/api'),
  mcpBaseUrl: normalizeServiceBase(import.meta.env.VITE_MCP_BASE_URL, '/mcp'),
  systemUserEmail: (import.meta.env.VITE_SYSTEM_USER_EMAIL || 'system@aifactory.local').trim().toLowerCase(),
  legacySystemEmail: (import.meta.env.VITE_LEGACY_SYSTEM_EMAIL || '').trim().toLowerCase(),
} as const;
