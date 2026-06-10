export const DEFAULT_SYSTEM_EMAIL = 'system@aifactory.local';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeSystemEmail(value?: string | null) {
  const candidate = (value || '').trim().toLowerCase();
  if (candidate && EMAIL_RE.test(candidate)) return candidate;
  return DEFAULT_SYSTEM_EMAIL;
}

export function normalizeOptionalEmail(value?: string | null) {
  const candidate = (value || '').trim().toLowerCase();
  if (candidate && EMAIL_RE.test(candidate)) return candidate;
  return '';
}
