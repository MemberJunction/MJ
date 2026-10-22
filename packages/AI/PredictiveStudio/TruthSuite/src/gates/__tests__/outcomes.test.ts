import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { SafeJSONParse } from '@memberjunction/global';
import { GateResults } from '../results';
import { GateSelection } from '../define-gate';
import { TruthSuite } from '../../registry/load';
import type { GateEntry } from '../../registry/types';

const passed = { Passed: true, Measured: {}, Detail: 'ok' };
const failed = { Passed: false, Measured: {}, Detail: 'no' };

describe('gate outcomes', () => {
  it('maps status × measurement to an outcome', () => {
    expect(GateResults.DecideOutcome('required', passed, null)).toBe('pass');
    expect(GateResults.DecideOutcome('required', failed, null)).toBe('fail');
    expect(GateResults.DecideOutcome('expected-fail', failed, null)).toBe('xfail');
    expect(GateResults.DecideOutcome('expected-fail', passed, null)).toBe('xpass');
    expect(GateResults.DecideOutcome('expected-fail', null, 'boom')).toBe('error');
    expect(GateResults.DecideOutcome('required', passed, 'boom')).toBe('error');
  });
  it('selects gates by run mode', () => {
    const g: Pick<GateEntry, 'RunMode' | 'Requires'> = { RunMode: 'nightly', Requires: [] };
    expect(GateSelection.IsSelected(g, 'pr')).toBe(false);
    expect(GateSelection.IsSelected(g, 'nightly')).toBe(true);
    expect(GateSelection.IsSelected(g, 'weekly')).toBe(true);
  });
  it('names a missing requirement (live-model via IsTierEnabled, sidecar-16gb, bizapps-common)', () => {
    const g: Pick<GateEntry, 'RunMode' | 'Requires'> = { RunMode: 'weekly', Requires: ['live-model'] };
    expect(GateSelection.MissingRequirement(g, { RUN_AGENT_TESTS: '0' })).toBe(
      'requires live-model: RUN_AGENT_TESTS is set to 0 (enable live-model tier with model keys configured)',
    );
    expect(GateSelection.MissingRequirement(g, {})).toMatch(/AI_VENDOR_API_KEY__GeminiLLM is not set/);
    const keyed = { AI_VENDOR_API_KEY__GeminiLLM: 'k' };
    expect(GateSelection.MissingRequirement(g, keyed)).toBeNull();
    expect(GateSelection.MissingRequirement(g, { ...keyed, RUN_AGENT_TESTS: '1' })).toBeNull();
    const w8: Pick<GateEntry, 'RunMode' | 'Requires'> = { RunMode: 'weekly', Requires: ['sidecar-16gb'] };
    expect(GateSelection.MissingRequirement(w8, {})).toMatch(/^requires sidecar-16gb:/);
    expect(GateSelection.MissingRequirement(w8, { TRUTH_ALLOW_HIGH_MEMORY: '1' })).toBeNull();
    const bizapps: Pick<GateEntry, 'RunMode' | 'Requires'> = { RunMode: 'nightly', Requires: ['bizapps-common'] };
    expect(GateSelection.MissingRequirement(bizapps, {})).toBe(
      'requires bizapps-common: install bizapps-common with its Feature Pipeline changes and set TRUTH_BIZAPPS_COMMON=1');
    expect(GateSelection.MissingRequirement(bizapps, { TRUTH_BIZAPPS_COMMON: '1' })).toBeNull();
  });
  it('reads the run mode and refuses anything else', () => {
    expect(GateSelection.CurrentRunMode({ TRUTH_RUN_MODE: 'weekly' })).toBe('weekly');
    expect(() => GateSelection.CurrentRunMode({})).toThrow(/TRUTH_RUN_MODE must be pr \| nightly \| weekly \(got unset\)/);
    expect(() => GateSelection.CurrentRunMode({ TRUTH_RUN_MODE: 'daily' })).toThrow(/got daily/);
  });
  it('report.mjs carries the true outcome in the error field of outcomes.json for every non-pass row', () => {
    const tmp = mkdtempSync(path.join(tmpdir(), 'pstruth-report-'));
    try {
      const gatesDir = path.join(tmp, 'gates');
      mkdirSync(gatesDir, { recursive: true });
      writeFileSync(
        path.join(gatesDir, 'G0.1.json'),
        JSON.stringify({
          GateID: 'G0.1',
          TestName: 'W1 → S7.5',
          OwnerPR: 2,
          Status: 'required',
          RunMode: 'pr',
          Outcome: 'pass',
          Measured: {},
          Detail: 'ok',
          Threshold: 't',
          DurationMs: 12,
          Error: null,
          RunID: 'r1',
          MJCommit: 'c1',
        }),
      );
      writeFileSync(
        path.join(gatesDir, 'G0.2.json'),
        JSON.stringify({
          GateID: 'G0.2',
          TestName: 'W2 → C1.1',
          OwnerPR: 4,
          Status: 'expected-fail',
          RunMode: 'nightly',
          Outcome: 'xfail',
          Measured: {},
          Detail: 'expected failure before PR 4',
          Threshold: 't',
          DurationMs: 25,
          Error: null,
          RunID: 'r1',
          MJCommit: 'c1',
        }),
      );
      const reportScript = path.join(TruthSuite.Root(), 'scripts', 'report.mjs');
      const res = spawnSync(process.execPath, [reportScript], {
        cwd: TruthSuite.Root(),
        env: { ...process.env, TRUTH_RESULTS_DIR: tmp },
        encoding: 'utf8',
      });
      expect(res.status).toBe(0);
      const outcomes = SafeJSONParse<Array<{ name: string; passed: boolean; durationMs: number; error: string | null }>>(
        readFileSync(path.join(tmp, 'outcomes.json'), 'utf8'),
      );
      const g01 = outcomes?.find((o) => o.name === 'W1 → S7.5');
      const g02 = outcomes?.find((o) => o.name === 'W2 → C1.1');
      const g03 = outcomes?.find((o) => o.name === 'W3 → C1.1');
      expect(g01).toEqual({ name: 'W1 → S7.5', passed: true, durationMs: 12, error: null });
      expect(g02).toEqual({
        name: 'W2 → C1.1',
        passed: true,
        durationMs: 25,
        error: 'xfail: expected failure before PR 4',
      });
      expect(g03?.passed).toBe(true);
      expect(g03?.error).toBe('not-run: no result written');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
