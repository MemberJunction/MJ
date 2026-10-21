#!/usr/bin/env node
/**
 * setup-python.mjs — create a venv on a supported interpreter (CPython 3.11 / 3.12) and install pinned requirements.
 *
 *   node scripts/setup-python.mjs                                   # .venv at the package root + src/python/requirements.txt
 *   node scripts/setup-python.mjs --python /opt/homebrew/bin/python3.11
 *   node scripts/setup-python.mjs --venv <dir> --requirements <file>  # any venv built on these pins (the truth suite)
 *
 * macOS: xgboost / lightgbm need an OpenMP runtime (`brew install libomp`); MLSidecar and run-pytest.mjs add
 * /opt/homebrew/opt/libomp/lib to DYLD_LIBRARY_PATH. Linux: libgomp1.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { PythonProbe } from './python-probe.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, '..');
const { values } = parseArgs({
  options: { python: { type: 'string' }, venv: { type: 'string' }, requirements: { type: 'string' } },
});
const venvDir = path.resolve(values.venv || path.join(packageRoot, '.venv'));
const requirements = path.resolve(values.requirements || path.join(packageRoot, 'src', 'python', 'requirements.txt'));
const venvPython = path.join(venvDir, 'bin', 'python');

function run(cmd, args) {
  console.log(`> ${cmd} ${args.join(' ')}`);
  const result = spawnSync(cmd, args, { stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(`Command failed (${result.status}): ${cmd} ${args.join(' ')}`);
    process.exit(result.status || 1); // status is non-zero or null here; null (killed by a signal) exits 1
  }
}

if (!existsSync(requirements)) {
  console.error(`requirements file not found at ${requirements}`);
  process.exit(1);
}

if (existsSync(venvPython)) {
  const existing = PythonProbe.ProbeCommand(venvPython);
  if (!PythonProbe.IsSupported(existing.Version)) {
    const v = existing.Version ? `${existing.Version.Major}.${existing.Version.Minor}.${existing.Version.Patch}` : 'an unknown Python';
    console.error(`The venv at ${venvDir} runs ${v}; the pins need 3.11 or 3.12. Delete it (rm -rf "${venvDir}") and re-run.`);
    process.exit(1);
  }
  console.log(`Reusing venv at ${venvDir} (Python ${existing.Version.Major}.${existing.Version.Minor}.${existing.Version.Patch})`);
} else {
  const selection = PythonProbe.Select(values.python ? [values.python] : PythonProbe.DefaultCandidates);
  if (!selection.Ok) {
    console.error(PythonProbe.FormatReport(selection.Probed));
    process.exit(1);
  }
  console.log(`Creating venv at ${venvDir} with ${selection.Command} (Python ${selection.Version.Major}.${selection.Version.Minor}.${selection.Version.Patch})`);
  run(selection.Command, ['-m', 'venv', venvDir]);
}

run(venvPython, ['-m', 'pip', 'install', '--upgrade', 'pip']);
run(venvPython, ['-m', 'pip', 'install', '-r', requirements]);
console.log('\nPython environment ready:', venvPython);
if (process.platform === 'darwin') {
  console.log('macOS: ensure libomp is installed (`brew install libomp`) so xgboost/lightgbm load.');
}
