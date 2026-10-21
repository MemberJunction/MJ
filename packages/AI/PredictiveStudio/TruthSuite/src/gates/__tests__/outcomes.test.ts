import { describe, it, expect } from 'vitest';
import { GateResults } from '../results';
import { GateSelection } from '../define-gate';
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
  it('names a missing requirement (live-model, sidecar-16gb, bizapps-common)', () => {
    const g: Pick<GateEntry, 'RunMode' | 'Requires'> = { RunMode: 'weekly', Requires: ['live-model'] };
    expect(GateSelection.MissingRequirement(g, {})).toBe('requires live-model: set TRUTH_LIVE_MODEL=1 with model keys configured');
    expect(GateSelection.MissingRequirement(g, { TRUTH_LIVE_MODEL: '1' })).toBeNull();
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
});
