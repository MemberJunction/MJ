/**
 * run-all.ts — runs the whole MJServer integration suite in sequence and aggregates the result.
 *
 * Each underlying script is self-contained (own bootstrap, own exit code), so this just spawns them
 * via tsx, streams their output, and returns ONE exit code for CI. The agent/prompt suites SKIP
 * (exit 0) unless RUN_AGENT_TESTS=1 — so the default run is the deterministic, credential-free
 * cache + runquery coverage; opt in to the live-model tier explicitly.
 *
 * USAGE (from the repo root):
 *   npx tsx packages/MJServer/integration-test-scripts/run-all.ts                 # cache + runquery
 *   RUN_AGENT_TESTS=1 npx tsx packages/MJServer/integration-test-scripts/run-all.ts   # + prompt + agent
 *
 * Exit code: 0 = all passed/skipped, 1 = any suite had failures, 2 = any suite hit a bootstrap error.
 */
import { spawnSync } from 'child_process';

const DIR = 'packages/MJServer/integration-test-scripts';
const SCRIPTS = [
    // Deterministic tier — runs by default (no credentials, CI-ready):
    'server-cache-tests.ts',
    'runquery-cache-tests.ts',
    'record-process-tests.ts',
    'record-process-facade-tests.ts',
    'rls-isolation-tests.ts',
    'api-keys-tests.ts',
    'scheduled-jobs-tests.ts',
    'field-rules-bulk-update-tests.ts',
    'remote-operations-tests.ts',
    'remote-op-wire-progress-tests.ts',
    'predictive-studio-tests.ts',
    // Predictive Studio integration tier — each SKIPs (exit 0) unless PS_INTEGRATION=1 + AssociationDemo is
    // loaded (the Python sidecar trains/scores). The ps-inproc-* run in-process; the ps-live-* drive the
    // GraphQL wire and additionally SKIP unless a live MJAPI is reachable. See README.md.
    'ps-inproc-scored-query.ts',
    'ps-inproc-scheduled-scoring.ts',
    'ps-inproc-operate-flow.ts',
    'ps-live-recordprocess-scoring.ts',
    'ps-live-modelaction-generation.ts',
    'ps-live-renewal-lifecycle.ts',
    'ps-live-writeback-demo.ts',
    'ps-live-multimodel-lifecycle.ts',
    // Live model tier — skips unless RUN_AGENT_TESTS=1:
    'prompt-runner-tests.ts',
    'agent-runner-tests.ts',
    'concurrent-tests.ts',
    'remote-op-ai-authoring-tests.ts',
];

const results: { Script: string; Code: number }[] = [];
for (const script of SCRIPTS) {
    console.log(`\n\n████████ ${script} ████████`);
    const run = spawnSync('npx', ['tsx', `${DIR}/${script}`], { stdio: 'inherit', env: process.env });
    results.push({ Script: script, Code: run.status ?? 2 });
}

console.log('\n\n═══════════ Integration suite summary ═══════════');
let worst = 0;
for (const r of results) {
    const label = r.Code === 0 ? '✓ PASS ' : r.Code === 2 ? '✗ ERROR' : '✗ FAIL ';
    worst = Math.max(worst, r.Code);
    console.log(`  ${label}  ${r.Script}  (exit ${r.Code})`);
}
process.exit(worst);
