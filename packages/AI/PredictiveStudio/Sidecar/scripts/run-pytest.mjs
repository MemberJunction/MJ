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
const fromEnv = process.env.PREDICTIVE_STUDIO_PYTHON?.trim();
const venvPython = fromEnv && fromEnv.length > 0 ? fromEnv : path.join(packageRoot, '.venv', 'bin', 'python');
const isPath = venvPython.includes('/') || venvPython.includes('\\');
if (isPath && !existsSync(venvPython)) {
  console.error(`Python not found at ${venvPython}. Run \`pnpm run setup:python\` or set PREDICTIVE_STUDIO_PYTHON.`);
  process.exit(1);
}

const env = { ...process.env };
if (process.platform === 'darwin') {
  const libomp = '/opt/homebrew/opt/libomp/lib';
  env.DYLD_LIBRARY_PATH = env.DYLD_LIBRARY_PATH ? `${libomp}:${env.DYLD_LIBRARY_PATH}` : libomp;
}

const rawArgs = process.argv.slice(2);
const args = rawArgs[0] === '--' ? rawArgs.slice(1) : rawArgs;
const result = spawnSync(venvPython, ['-m', 'pytest', ...args], {
  cwd: pythonDir,
  stdio: 'inherit',
  env,
});
process.exit(result.status ?? 1);
