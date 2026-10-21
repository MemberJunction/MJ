import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { GateEntry, GateStatus, RunMode } from '../registry/types';

export type GateOutcome =
  | 'pass'             // required gate, threshold met
  | 'fail'             // required gate, threshold not met              → vitest test fails
  | 'xfail'            // expected-fail gate, threshold not met (normal before its owner PR lands)
  | 'xpass'            // expected-fail gate, threshold met            → reported; flip it to required
  | 'not-implemented'  // stub body (owner PR has not written it)
  | 'not-run'          // not selected in this run mode, or a requirement (live model keys) absent — reason given
  | 'error';           // the harness threw (data, DB, MJAPI, sidecar)    → vitest test fails, whatever the status

export interface GateMeasurement {
  /** True when the gate's threshold is met. */
  Passed: boolean;
  /** The measured numbers the threshold talks about, e.g. { trainingRows: 13421, holdoutRows: 3355, scored: 1000 }. */
  Measured: Record<string, number | string | boolean | null>;
  /** One sentence: what was measured against what. */
  Detail: string;
}

export interface GateResult {
  GateID: string; TestName: string; OwnerPR: GateEntry['OwnerPR']; Status: GateStatus; RunMode: RunMode;
  Outcome: GateOutcome; Measured: GateMeasurement['Measured']; Detail: string;
  Threshold: string; DurationMs: number; Error: string | null; RunID: string; MJCommit: string;
}

/** What one gate run produced, for {@link GateResults.Write}. */
export interface GateRunRecord {
  Measurement: GateMeasurement | null;
  Error: string | null;
  DurationMs: number;
  /** Overrides the measurement's detail (a `not-run` reason, a stub's owner note). */
  Note?: string;
}

/** Outcome mapping and the per-gate result files of a run. */
export class GateResults {
  /** `fail` and `error` fail the vitest test; `xpass` is reported (flip the gate); `xfail` is the normal pre-owner state. */
  public static DecideOutcome(status: GateStatus, m: GateMeasurement | null, error: string | null): GateOutcome {
    if (error !== null || m === null) return 'error';
    if (status === 'required') return m.Passed ? 'pass' : 'fail';
    return m.Passed ? 'xpass' : 'xfail';
  }

  /** `$TRUTH_RESULTS_DIR`; throws when unset (scripts/run-truth.mjs sets it), so a result is never written to the cwd. */
  public static ResultsDir(): string {
    const dir = process.env.TRUTH_RESULTS_DIR;
    if (!dir) throw new Error('TRUTH_RESULTS_DIR is not set (scripts/run-truth.mjs sets it)');
    return dir;
  }

  /** Write `$TRUTH_RESULTS_DIR/gates/<GateID>.json`. */
  public static Write(gate: GateEntry, outcome: GateOutcome, run: GateRunRecord): void {
    const dir = path.join(GateResults.ResultsDir(), 'gates');
    mkdirSync(dir, { recursive: true });
    const result: GateResult = {
      GateID: gate.GateID, TestName: gate.TestName, OwnerPR: gate.OwnerPR, Status: gate.Status, RunMode: gate.RunMode,
      Outcome: outcome, Measured: run.Measurement?.Measured || {}, Detail: run.Note || run.Measurement?.Detail || '',
      Threshold: gate.Threshold, DurationMs: Math.round(run.DurationMs), Error: run.Error,
      RunID: process.env.TRUTH_RUN_ID || 'local', MJCommit: process.env.TRUTH_MJ_COMMIT || 'unknown',
    };
    writeFileSync(path.join(dir, `${gate.GateID}.json`), `${JSON.stringify(result, null, 2)}\n`);
  }
}
