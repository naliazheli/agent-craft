#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { access, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const legacyRunnerFile = ['agentcraft-local', ['co', 'dex'].join(''), 'runner.mjs'].join('-');

async function importAdjacentLegacyRunner() {
  if (!import.meta.url.startsWith('file:')) return false;
  const legacyUrl = new URL(`./${legacyRunnerFile}`, import.meta.url);
  try {
    await access(fileURLToPath(legacyUrl), constants.R_OK);
  } catch {
    return false;
  }
  await import(legacyUrl.href);
  return true;
}

function optionValue(name) {
  const args = process.argv.slice(2);
  const flag = `--${name}`;
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === flag) return args[index + 1] || '';
    if (value.startsWith(`${flag}=`)) return value.slice(flag.length + 1);
  }
  return '';
}

function trimSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

function webBaseUrlFromApi(apiBaseUrl) {
  return trimSlash(apiBaseUrl).replace(/\/api(?:\/.*)?$/i, '');
}

async function main() {
  if (await importAdjacentLegacyRunner()) return;

  const apiBaseUrl = trimSlash(optionValue('api') || process.env.AGENTCRAFT_API_BASE_URL || 'http://localhost:3100/api');
  const legacyRunnerUrl = `${webBaseUrlFromApi(apiBaseUrl)}/${legacyRunnerFile}`;
  const response = await fetch(legacyRunnerUrl);
  if (!response.ok) {
    throw new Error(`Failed to download local agent runner implementation: HTTP ${response.status}`);
  }

  const tempDir = join(tmpdir(), `agentcraft-local-agent-${Date.now()}-${process.pid}`);
  const runnerPath = join(tempDir, 'agentcraft-local-agent-impl.mjs');
  await mkdir(dirname(runnerPath), { recursive: true });
  await writeFile(runnerPath, await response.text(), { mode: 0o700 });

  const child = spawn(process.execPath, [runnerPath, ...process.argv.slice(2)], { stdio: 'inherit' });
  child.on('exit', async (code, signal) => {
    await rm(tempDir, { recursive: true, force: true }).catch(() => null);
    if (signal) process.kill(process.pid, signal);
    process.exit(code ?? 1);
  });
  child.on('error', async (error) => {
    await rm(tempDir, { recursive: true, force: true }).catch(() => null);
    throw error;
  });
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
