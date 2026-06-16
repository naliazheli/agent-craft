#!/usr/bin/env node
const legacyRunnerFile = ['./agentcraft-local', ['co', 'dex'].join(''), 'runner.mjs'].join('-');
await import(legacyRunnerFile);
