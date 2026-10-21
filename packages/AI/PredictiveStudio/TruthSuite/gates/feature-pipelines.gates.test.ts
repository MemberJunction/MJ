/**
 * The Feature Pipeline gates shipped in PR 1 (C1 → C2.1, C2.2, C2.3, C2.5; G7.8 C1 → C3.3 was extracted to patch 04).
 * Each is an `mj test` row of the suite "Predictive Studio Gates — Feature Pipelines" (whose Name uses ASCII `->`);
 * this file runs the row through the MJ CLI and reports its status to the truth-suite registry.
 * The four TruthGate.Define calls are literal so the registry validator finds each title exactly once.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SafeJSONParse } from '@memberjunction/global';
import type { TestRunResult } from '@memberjunction/testing-engine-base';
import { TruthGate } from '../src/gates/define-gate';
import type { GateMeasurement } from '../src/gates/results';

/** gates/ → TruthSuite → PredictiveStudio → AI → packages → repository root (where mj.config.cjs loads the check bundles). */
const REPO_ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));

/** The fields of the `TestRunResult` JSON `mj test run --output` writes that this bridge reads (derived, not restated). */
type MJTestRunJSON = Pick<TestRunResult, 'testRunId' | 'testName' | 'status' | 'passedChecks' | 'failedChecks' | 'totalChecks'>;

/**
 * The stderr an `execFileSync` failure carries. `unknown` on purpose: a catch boundary, narrowed by `in`/`instanceof`
 * before any field is read.
 */
function stderrOf(e: unknown): string {
  if (typeof e === 'object' && e !== null && 'stderr' in e) {
    const stderr: unknown = e.stderr;
    if (typeof stderr === 'string') return stderr;
    if (Buffer.isBuffer(stderr)) return stderr.toString('utf8');
  }
  return e instanceof Error ? e.message : String(e);
}

/**
 * Run one `mj test` row by name and turn its result into a gate measurement. Passed → threshold met; Failed → not met
 * (a measurement); no result file, or Skipped / Error / Timeout → the bridge could not measure, so it throws and the
 * gate's outcome is `error` (which always fails the run).
 */
function runMJTest(testName: string): GateMeasurement {
  const mjRowName = testName.replace('→', '->');
  const dir = mkdtempSync(path.join(tmpdir(), 'truth-mj-test-'));
  const resultFile = path.join(dir, 'result.json');
  let stderr = '';
  try {
    execFileSync('node', ['packages/MJCLI/bin/run.js', 'test', 'run', '--name', mjRowName, '--format', 'json', '--output', resultFile], {
      cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, MJ_INTEGRATION_TEST: '1', RUN_MUTATION_TESTS: '1' },
    });
  } catch (e) {
    stderr = stderrOf(e); // exit 1 is also a failed test; the result file decides
  }
  try {
    if (!existsSync(resultFile)) {
      throw new Error(`mj test run --name "${mjRowName}" wrote no result: ${stderr.trim().split('\n').slice(-3).join(' | ')}`);
    }
    const parsed = SafeJSONParse<MJTestRunJSON | MJTestRunJSON[]>(readFileSync(resultFile, 'utf8'));
    if (!parsed) {
      throw new Error(`mj test run --name "${mjRowName}" wrote invalid JSON in ${resultFile}`);
    }
    const runs = Array.isArray(parsed) ? parsed : [parsed];
    const unmeasured = runs.find((r) => r.status !== 'Passed' && r.status !== 'Failed');
    if (unmeasured) {
      throw new Error(`mj test run "${mjRowName}" ended ${unmeasured.status} (MJ: Test Runs ${unmeasured.testRunId})`);
    }
    const passed = runs.every((r) => r.status === 'Passed');
    const last = runs[runs.length - 1]!;
    return {
      Passed: passed,
      Measured: { testRunId: last.testRunId, status: last.status, iterations: runs.length,
        passedChecks: last.passedChecks, failedChecks: last.failedChecks, totalChecks: last.totalChecks },
      Detail: `mj test run "${mjRowName}": ${runs.map((r) => r.status).join(', ')}; ${last.passedChecks}/${last.totalChecks} checks (MJ: Test Runs ${last.testRunId})`,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

TruthGate.Define('C1 → C2.1', async () => runMJTest('C1 → C2.1'));
TruthGate.Define('C1 → C2.2', async () => runMJTest('C1 → C2.2'));
TruthGate.Define('C1 → C2.3', async () => runMJTest('C1 → C2.3'));
TruthGate.Define('C1 → C2.5', async () => runMJTest('C1 → C2.5'));
