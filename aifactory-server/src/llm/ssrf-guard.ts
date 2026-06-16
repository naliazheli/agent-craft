import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { BadRequestException } from '@nestjs/common';

const DEFAULT_ALLOWED_LLM_HOSTS = [
  'api.openai.com',
  'api.anthropic.com',
  'api.deepseek.com',
  'openrouter.ai',
];

function listFromEnv(value?: string) {
  return (value || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function ipv4ToNumber(ip: string) {
  const parts = ip.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return null;
  }
  return parts.reduce((sum, part) => (sum << 8) + part, 0) >>> 0;
}

function isPrivateIpv4(address: string) {
  const value = ipv4ToNumber(address);
  if (value === null) return true;
  const inRange = (base: string, bits: number) => {
    const baseValue = ipv4ToNumber(base);
    if (baseValue === null) return false;
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return (value & mask) === (baseValue & mask);
  };

  return [
    ['0.0.0.0', 8],
    ['10.0.0.0', 8],
    ['100.64.0.0', 10],
    ['127.0.0.0', 8],
    ['169.254.0.0', 16],
    ['172.16.0.0', 12],
    ['192.0.0.0', 24],
    ['192.168.0.0', 16],
    ['198.18.0.0', 15],
    ['224.0.0.0', 4],
    ['240.0.0.0', 4],
  ].some(([base, bits]) => inRange(base as string, bits as number));
}

function isPrivateIpv6(address: string) {
  const value = address.toLowerCase();
  return (
    value === '::' ||
    value === '::1' ||
    value.startsWith('fc') ||
    value.startsWith('fd') ||
    value.startsWith('fe8') ||
    value.startsWith('fe9') ||
    value.startsWith('fea') ||
    value.startsWith('feb') ||
    value.startsWith('::ffff:127.') ||
    value.startsWith('::ffff:10.') ||
    value.startsWith('::ffff:169.254.') ||
    value.startsWith('::ffff:192.168.')
  );
}

function isPrivateAddress(address: string) {
  const family = isIP(address);
  if (family === 4) return isPrivateIpv4(address);
  if (family === 6) return isPrivateIpv6(address);
  return true;
}

function matchesAllowedHost(hostname: string, allowedHosts: string[]) {
  return allowedHosts.some((allowed) => hostname === allowed || hostname.endsWith(`.${allowed}`));
}

export async function resolveSafeLlmBaseUrl(rawUrl: string) {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new BadRequestException('Invalid LLM API URL');
  }

  if (url.username || url.password) {
    throw new BadRequestException('LLM API URL must not contain credentials');
  }

  const isProduction = process.env.NODE_ENV === 'production';
  if (url.protocol !== 'https:' && (isProduction || url.protocol !== 'http:')) {
    throw new BadRequestException('LLM API URL must use HTTPS');
  }

  const hostname = url.hostname.toLowerCase();
  const allowedHosts = [
    ...DEFAULT_ALLOWED_LLM_HOSTS,
    ...listFromEnv(process.env.LLM_PROXY_ALLOWED_HOSTS),
  ];
  if (matchesAllowedHost(hostname, allowedHosts)) {
    return url.toString().replace(/\/+$/, '');
  }

  const allowCustomEndpoints =
    process.env.LLM_PROXY_ALLOW_CUSTOM_ENDPOINTS === 'true' || (!isProduction && process.env.LLM_PROXY_ALLOW_CUSTOM_ENDPOINTS !== 'false');
  if (!allowCustomEndpoints) {
    throw new BadRequestException('LLM API host is not allowed');
  }

  if (isIP(hostname) && isPrivateAddress(hostname)) {
    throw new BadRequestException('LLM API URL must not target private or link-local addresses');
  }

  const addresses = await lookup(hostname, { all: true, verbatim: true }).catch(() => {
    throw new BadRequestException('Unable to resolve LLM API host');
  });
  if (!addresses.length || addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw new BadRequestException('LLM API URL must resolve only to public addresses');
  }

  return url.toString().replace(/\/+$/, '');
}
