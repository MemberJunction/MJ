import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { SafeJSONParse } from '@memberjunction/global';
import { GateRegistry, TruthSuite } from './load';
import { GateRegistryValidator } from './validate';
import type { GateEntry } from './types';

const repoRoot = path.resolve(TruthSuite.Root(), '../../../..');
const rawArgs = process.argv.slice(2);
const args = rawArgs[0] === '--' ? rawArgs.slice(1) : rawArgs;
const { values } = parseArgs({ args, options: { against: { type: 'string' } } });
const registry = GateRegistry.Load();
const errors = GateRegistryValidator.Validate(registry, repoRoot);

if (values.against) {
  const relPath = 'packages/AI/PredictiveStudio/TruthSuite/gates/gates.json';
  const show = spawnSync('git', ['-C', repoRoot, 'show', `${values.against}:${relPath}`], { encoding: 'utf8' });
  if (show.status !== 0) {
    console.log(`note: ${relPath} does not exist at ${values.against}; skipping base comparison`);
  } else {
    const base = SafeJSONParse<GateEntry[]>(show.stdout) || [];
    errors.push(...GateRegistryValidator.ValidateAgainstBase(registry, base));
  }
}

if (errors.length > 0) {
  for (const err of errors) console.error(err);
  process.exit(1);
}

const required = registry.filter((g) => g.Status === 'required').length;
const expectedFail = registry.filter((g) => g.Status === 'expected-fail').length;
console.log(`registry OK: ${registry.length} gates (required ${required}, expected-fail ${expectedFail})`);
