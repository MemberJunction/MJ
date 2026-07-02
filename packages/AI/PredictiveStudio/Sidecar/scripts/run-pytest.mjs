#!/usr/bin/env node
/**
 * run-pytest.mjs — run the Python sidecar's pytest suite using the bundled venv.
 *
 * Runs from `src/python/` (the pytest rootdir) so `app` and `tests` import as
 * top-level packages. On macOS injects DYLD_LIBRARY_PATH for libomp so
 * xgboost/lightgbm load.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, '..');
const pythonDir = path.join(packageRoot, 'src', 'python');
const venvPython = path.join(packageRoot, '.venv', 'bin', 'python');

if (!existsSync(venvPython)) {
  console.error('Bundled venv not found. Run `npm run setup:python` first.');
  process.exit(1);
}

const env = { ...process.env };
if (process.platform === 'darwin') {
  const libomp = '/opt/homebrew/opt/libomp/lib';
  env.DYLD_LIBRARY_PATH = env.DYLD_LIBRARY_PATH ? `${libomp}:${env.DYLD_LIBRARY_PATH}` : libomp;
}

const args = process.argv.slice(2);
const result = spawnSync(venvPython, ['-m', 'pytest', ...args], {
  cwd: pythonDir,
  stdio: 'inherit',
  env,
});
process.exit(result.status ?? 1);
