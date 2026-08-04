#!/usr/bin/env node
import { config as dotenvConfig } from 'dotenv';
import { fileURLToPath } from 'url';
import { resolve, dirname } from 'path';

// Load .env from repo root (3 levels up from bin/run.js) so MJ config vars are available
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenvConfig({ path: resolve(__dirname, '../../../.env') });
// Also load from CWD if present (for local overrides)
dotenvConfig();

// Commands that need MJ class registrations (AI providers for LLM/embedding calls)
const heavyCommands = ['analyze', 'generate-queries', 'export-sample-queries', 'prune'];
const commandArg = process.argv[2];
const needsBootstrap = heavyCommands.includes(commandArg);

if (needsBootstrap) {
  await import('@memberjunction/server-bootstrap-lite/mj-class-registrations');
}

const { execute } = await import('@oclif/core');
await execute({ dir: import.meta.url });
