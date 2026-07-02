#!/usr/bin/env node
/**
 * setup-python.mjs — create the bundled Python venv for the Predictive Studio
 * sidecar and install its pinned requirements.
 *
 * Creates `.venv/` at the package root and runs
 * `pip install -r src/python/requirements.txt`. The resulting interpreter is
 * what `MLSidecar` spawns by default in managed mode.
 *
 * macOS note: xgboost / lightgbm need an OpenMP runtime. Install it once with
 *   brew install libomp
 * `MLSidecar` injects DYLD_LIBRARY_PATH=/opt/homebrew/opt/libomp/lib at spawn
 * time so the venv finds it. On Linux the OpenMP runtime is libgomp1 (installed
 * by the Dockerfile / your distro).
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, '..');
const venvDir = path.join(packageRoot, '.venv');
const venvPython = path.join(venvDir, 'bin', 'python');
const requirements = path.join(packageRoot, 'src', 'python', 'requirements.txt');

function run(cmd, args, opts = {}) {
  console.log(`> ${cmd} ${args.join(' ')}`);
  const result = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  if (result.status !== 0) {
    console.error(`Command failed (${result.status}): ${cmd} ${args.join(' ')}`);
    process.exit(result.status ?? 1);
  }
}

function resolveBasePython() {
  // Prefer python3, fall back to python.
  for (const candidate of ['python3', 'python']) {
    const probe = spawnSync(candidate, ['--version']);
    if (probe.status === 0) return candidate;
  }
  console.error('No python3/python interpreter found on PATH. Install Python 3.9+ first.');
  process.exit(1);
}

if (!existsSync(requirements)) {
  console.error(`requirements.txt not found at ${requirements}`);
  process.exit(1);
}

if (!existsSync(venvPython)) {
  const basePython = resolveBasePython();
  console.log(`Creating venv at ${venvDir} ...`);
  run(basePython, ['-m', 'venv', venvDir]);
} else {
  console.log(`Reusing existing venv at ${venvDir}`);
}

console.log('Upgrading pip ...');
run(venvPython, ['-m', 'pip', 'install', '--upgrade', 'pip']);

console.log('Installing pinned requirements ...');
run(venvPython, ['-m', 'pip', 'install', '-r', requirements]);

console.log('\nPredictive Studio sidecar Python environment ready.');
if (process.platform === 'darwin') {
  console.log(
    'macOS: ensure libomp is installed (`brew install libomp`) so xgboost/lightgbm load.'
  );
}
