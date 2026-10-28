#!/usr/bin/env node
/**
 * run-pytest.mjs — run TruthSuite's Python tests using its bundled .venv.
 * `--mypy` type-checks the Python package and its tests, and the sidecar's trainer-contract, column-encoding,
 * snapshot-loading, inner-fold and estimator-factory modules and test fixtures (`mypy --strict`, python/mypy.ini), instead.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pythonDir = path.join(root, 'python');
const fromEnv = process.env.PREDICTIVE_STUDIO_TRUTH_PYTHON?.trim();
const venvPython = fromEnv && fromEnv.length > 0 ? fromEnv : path.join(root, '.venv', 'bin', 'python');
if (!existsSync(venvPython)) {
  console.error(`Python not found at ${venvPython}. Run \`pnpm run setup:python\` or set PREDICTIVE_STUDIO_TRUTH_PYTHON.`);
  process.exit(1);
}

const env = {
  ...process.env,
  PYTHONHASHSEED: '0',
  OMP_NUM_THREADS: '1',
  OPENBLAS_NUM_THREADS: '1',
  MKL_NUM_THREADS: '1',
};
if (process.platform === 'darwin') {
  const libomp = '/opt/homebrew/opt/libomp/lib';
  env.DYLD_LIBRARY_PATH = env.DYLD_LIBRARY_PATH ? `${libomp}:${env.DYLD_LIBRARY_PATH}` : libomp;
}

// The sidecar's trainer contract, its column encoding, its snapshot loading, its inner-validation folds, its estimator
// factories and test fixtures: type-checked here under the same strict configuration (the sidecar's own venv carries no mypy).
const SIDECAR_TYPED_MODULES = [
  'app/trainer_schemas.py',
  'app/failures.py',
  'app/snapshot_format.py',
  'app/encoding.py',
  'app/snapshot.py',
  'app/folds.py',
  'app/algorithms.py',
  'tests/tools/trainer_fixture.py',
  'tests/tools/trainer_scaffold.py',
].map((m) => path.join('..', 'Sidecar', 'src', 'python', m));

const rawArgs = process.argv.slice(2);
const args = rawArgs[0] === '--' ? rawArgs.slice(1) : rawArgs;
const result = args[0] === '--mypy'
  ? spawnSync(venvPython, ['-m', 'mypy', '--config-file', 'python/mypy.ini', 'python/truthsuite', 'python/tests', ...SIDECAR_TYPED_MODULES], {
      cwd: root,
      stdio: 'inherit',
      env,
    })
  : spawnSync(venvPython, ['-m', 'pytest', ...args], {
      cwd: pythonDir,
      stdio: 'inherit',
      env,
    });
process.exit(result.status ?? 1);
