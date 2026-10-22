#!/usr/bin/env node
/**
 * run-truth.mjs — orchestrate a truth-suite gate run (`--mode pr|nightly|weekly [--gate "<testName>"]`).
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rawArgs = process.argv.slice(2);
const args = rawArgs[0] === '--' ? rawArgs.slice(1) : rawArgs;

const { values } = parseArgs({
  args,
  options: {
    mode: { type: 'string', default: 'pr' },
    gate: { type: 'string' },
  },
});

const mode = values.mode || 'pr';
if (mode !== 'pr' && mode !== 'nightly' && mode !== 'weekly') {
  console.error(`Invalid --mode "${mode}" (expected pr | nightly | weekly)`);
  process.exit(2);
}

const gates = JSON.parse(readFileSync(path.join(root, 'gates', 'gates.json'), 'utf8'));
const gateFilter = values.gate;
if (gateFilter !== undefined) {
  const match = gates.find((g) => g.TestName === gateFilter);
  if (!match) {
    console.error(`no gate named "${gateFilter}"`);
    process.exit(2);
  }
}

const sidecarUrlFile = path.join(root, '.run', 'sidecar.url');
console.log(`Expected MJAPI start command:\n  PREDICTIVE_STUDIO_SIDECAR_URL=$(cat ${sidecarUrlFile}) pnpm --filter mj_api start`);

if (!existsSync(sidecarUrlFile)) {
  console.error(`Sidecar URL file missing at ${sidecarUrlFile}. Start it first: pnpm run truth:sidecar`);
  process.exit(1);
}
const sidecarUrl = readFileSync(sidecarUrlFile, 'utf8').trim();
const healthRes = await fetch(`${sidecarUrl.replace(/\/$/, '')}/health`, { signal: AbortSignal.timeout(5_000) }).catch(() => null);
if (!healthRes || !healthRes.ok) {
  console.error(`Truth sidecar at ${sidecarUrl}/health did not answer OK`);
  process.exit(1);
}

const graphqlPort = process.env.GRAPHQL_PORT || '4000';
const mjapiUrl = process.env.MJAPI_URL || `http://localhost:${graphqlPort}/`;
const mjapiRes = await fetch(mjapiUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(process.env.MJ_API_KEY ? { 'x-mj-api-key': process.env.MJ_API_KEY } : {}) },
  body: JSON.stringify({ query: '{ __typename }' }),
  signal: AbortSignal.timeout(5_000),
}).catch(() => null);
if (!mjapiRes || (!mjapiRes.ok && mjapiRes.status >= 500)) {
  console.error(`MJAPI at ${mjapiUrl} is not reachable`);
  process.exit(1);
}

const utcStamp = new Date().toISOString().replace(/[:.]/g, '-');
const runId = process.env.TRUTH_RUN_ID || `${mode}-${utcStamp}`;
let mjCommit = process.env.TRUTH_MJ_COMMIT || 'unknown';
try {
  mjCommit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
} catch {
  // leave fallback
}
const resultsDir = process.env.TRUTH_RESULTS_DIR || path.join(root, 'results', runId);
mkdirSync(resultsDir, { recursive: true });

const env = {
  ...process.env,
  TRUTH_RUN_MODE: mode,
  TRUTH_RUN_ID: runId,
  TRUTH_MJ_COMMIT: mjCommit,
  TRUTH_RESULTS_DIR: resultsDir,
};

function runStep(cmd, stepArgs) {
  const res = spawnSync(cmd, stepArgs, { cwd: root, env, stdio: 'inherit' });
  if ((res.status ?? 1) !== 0) {
    process.exit(res.status ?? 1);
  }
}

runStep('pnpm', ['run', 'truth:data', '--', '--set', 'base']);
if (mode === 'nightly' || mode === 'weekly') {
  runStep('pnpm', ['run', 'truth:data', '--', '--set', 't2', '--only', 'W2-noise']);
}

const vitestArgs = ['vitest', 'run', '--config', 'vitest.gates.config.ts'];
if (gateFilter !== undefined) {
  const escaped = gateFilter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  vitestArgs.push('-t', escaped);
}
const vitestRes = spawnSync('npx', vitestArgs, { cwd: root, env, stdio: 'inherit' });
if ((vitestRes.status ?? 1) !== 0 && gateFilter === undefined) {
  // report.mjs determines the final exit code from the per-gate JSON files, but log vitest non-zero if any
  console.error(`vitest exited ${vitestRes.status}`);
}

if (env.TRUTH_KEEP_FIXTURES !== '1') {
  const cleanRes = spawnSync('pnpm', ['run', 'truth:clean'], { cwd: root, env, stdio: 'inherit' });
  if ((cleanRes.status ?? 0) !== 0) {
    console.warn(`truth:clean exited ${cleanRes.status}`);
  }
}

const reportRes = spawnSync(process.execPath, [path.join(root, 'scripts', 'report.mjs')], { cwd: root, env, stdio: 'inherit' });
process.exit(reportRes.status ?? 1);
