/**
 * A4 attacks 1 and 2 — the fixed refusals (`ProfileVerdict`, DD-5, D5-10): the small-data refusal fires on
 * W7-small-imbalanced s42's counts and on 12 people, never on W1-signal, C1 or C4 (`<`, not `<=`); the no-usable-signal
 * refusal fires when the GLM's improvement interval over the dummy includes 0.
 */
import { describe, expect, it } from 'vitest';
import type { MetricWithInterval } from '@memberjunction/predictive-studio-core';
import { ProfileVerdict } from '../profile-verdict';

function improvement(lower: number, upper: number): MetricWithInterval {
  return { metric: 'log-loss', value: (lower + upper) / 2, interval: { level: 0.95, lower, upper }, n: 1000 };
}

describe('A4 attack 1: ProfileVerdict.SmallData', () => {
  it('W7-small-imbalanced s42 (301 persons, ≈ 24 positives) → small-data with the counts and the thresholds', () => {
    expect(ProfileVerdict.SmallData(301, 24)).toEqual({ kind: 'small-data', resolvedRows: 301, minorityRows: 24, minResolved: 200, minMinority: 50 });
  });

  it('the 12-person small-n scenario → small-data', () => {
    expect(ProfileVerdict.SmallData(12, 3)).toEqual({ kind: 'small-data', resolvedRows: 12, minorityRows: 3, minResolved: 200, minMinority: 50 });
  });

  it.each([
    ['W1-signal (12,419 development rows, ≈ 20% minority)', 12419, 2484],
    ['C1 (3,298 training rows, ~11% lapses)', 3298, 363],
    ['C4 (12,000 rows)', 12000, 1500],
  ])('%s → null', (_name, resolved, minority) => {
    expect(ProfileVerdict.SmallData(resolved, minority)).toBeNull();
  });

  it('the thresholds are strict: 200 resolved and 50 minority rows pass, one fewer of either is refused', () => {
    expect(ProfileVerdict.SmallData(200, 50)).toBeNull();
    expect(ProfileVerdict.SmallData(199, 50)?.kind).toBe('small-data');
    expect(ProfileVerdict.SmallData(200, 49)?.kind).toBe('small-data');
  });

  it('the thresholds are the DD-5 constants', () => {
    expect(ProfileVerdict.MIN_RESOLVED_ROWS).toBe(200);
    expect(ProfileVerdict.MIN_MINORITY_ROWS).toBe(50);
  });
});

describe('A4 attack 2: ProfileVerdict.NoSignal', () => {
  it('an improvement interval [−0.01, 0.02] (includes 0) → no-usable-signal carrying the improvement', () => {
    const i = improvement(-0.01, 0.02);
    expect(ProfileVerdict.NoSignal(i)).toEqual({ kind: 'no-usable-signal', improvement: i });
  });

  it('an improvement interval [0.01, 0.05] → null', () => {
    expect(ProfileVerdict.NoSignal(improvement(0.01, 0.05))).toBeNull();
  });

  it('an interval touching 0 at its lower end includes 0 → no-usable-signal', () => {
    expect(ProfileVerdict.NoSignal(improvement(0, 0.03))?.kind).toBe('no-usable-signal');
  });

  it('an interval wholly below 0 (the GLM is worse than the dummy) → no-usable-signal', () => {
    expect(ProfileVerdict.NoSignal(improvement(-0.05, -0.01))?.kind).toBe('no-usable-signal');
  });
});
