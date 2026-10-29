#!/usr/bin/env node
/**
 * setup-python.mjs — create (or refresh) the TruthSuite Python virtual environment.
 * Delegates to Sidecar/scripts/setup-python.mjs with TruthSuite's venv and requirements.txt.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sidecarSetup = path.resolve(root, '..', 'Sidecar', 'scripts', 'setup-python.mjs');
const venvDir = path.join(root, '.venv');
const requirementsFile = path.join(root, 'python', 'requirements.txt');

const result = spawnSync(
  process.execPath,
  [sidecarSetup, '--venv', venvDir, '--requirements', requirementsFile],
  { stdio: 'inherit' },
);
process.exit(result.status ?? 1);
