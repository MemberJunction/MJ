import { describe, expect, it } from 'vitest';

import { EvaluationProtocol, type RetrainTrigger, type RollbackTrigger } from '../evaluation-protocol';
import type { MonitoringPeriodResult } from '../monitoring-contracts';
import { MonitoringRules, type ScoredValue } from '../monitoring-rules';

const D = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);
const V = (recordId: string, score: number | null): ScoredValue => ({ RecordID: recordId, Score: score });
const nn = (x: number) => EvaluationProtocol.ToNonNegative(x);

let period = 0;
/** A period result whose (current − reference) primary-loss interval is `[lower, lower + 0.02]`, with an optional slope. */
const P = (lower: number | null, slope: number | null = null): MonitoringPeriodResult => ({
  ModelID: '00000000-0000-0000-0000-000000000001',
  Period: `2026-${String((period++ % 12) + 1).padStart(2, '0')}-01`,
  JoinedRows: 100,
  Primary: { metric: 'log-loss', value: 0.5, interval: { level: 0.95, lower: 0.45, upper: 0.55 }, n: 100 },
  Degradation: lower === null ? null : { level: 0.95, lower, upper: lower + 0.02 },
  Calibration: slope === null ? null : { method: 'platt', intercept: 0, slope, reliability: [] },
  DriftAlarms: [],
  Parity: { Sampled: 0, MaxAbsDifference: 0, Passed: true },
  TriggersFired: [],
  ChallengerRunID: null,
});
const Ok = (): MonitoringPeriodResult => P(-0.01);
const Below = (lower: number): MonitoringPeriodResult => P(lower);

describe('MonitoringRules.TriggerFires', () => {
  it('the outcome-degradation trigger fires after N consecutive periods below the reference band, not after N-1', () => {
    const t: RetrainTrigger = { kind: 'outcome-degradation', margin: nn(0.02), consecutivePeriods: 2 };
    expect(MonitoringRules.TriggerFires(t, [Ok(), Below(0.03)]).Fired).toBe(false);
    expect(MonitoringRules.TriggerFires(t, [Below(0.03), Below(0.03)]).Fired).toBe(true);
  });

  it('a lower bound equal to the margin does not count as degraded (strictly above)', () => {
    const t: RetrainTrigger = { kind: 'outcome-degradation', margin: nn(0.02), consecutivePeriods: 1 };
    expect(MonitoringRules.TriggerFires(t, [Below(0.02)]).Fired).toBe(false);
    expect(MonitoringRules.TriggerFires(t, [Below(0.021)]).Fired).toBe(true);
  });

  it('only the most recent run of periods counts: an old streak followed by a clear period does not fire', () => {
    const t: RetrainTrigger = { kind: 'outcome-degradation', margin: nn(0.02), consecutivePeriods: 2 };
    expect(MonitoringRules.TriggerFires(t, [Below(0.05), Below(0.05), Ok()]).Fired).toBe(false);
  });

  it('a period with no degradation interval (window open, no joined rows) breaks the streak', () => {
    const t: RetrainTrigger = { kind: 'outcome-degradation', margin: nn(0.02), consecutivePeriods: 2 };
    expect(MonitoringRules.TriggerFires(t, [Below(0.05), P(null)]).Fired).toBe(false);
  });

  it('the calibration-drift trigger fires when the slope is outside the band for N consecutive periods', () => {
    const t: RetrainTrigger = { kind: 'calibration-drift', slopeOutside: [0.8, 1.2], consecutivePeriods: 2 };
    expect(MonitoringRules.TriggerFires(t, [P(0, 1.0), P(0, 1.4)]).Fired).toBe(false);
    expect(MonitoringRules.TriggerFires(t, [P(0, 0.6), P(0, 1.4)]).Fired).toBe(true);
    expect(MonitoringRules.TriggerFires(t, [P(0, 0.8), P(0, 1.2)]).Fired).toBe(false);
  });

  it('names the trigger and the streak in its reason', () => {
    const t: RetrainTrigger = { kind: 'outcome-degradation', margin: nn(0.02), consecutivePeriods: 1 };
    const r = MonitoringRules.TriggerFires(t, [Below(0.03)]);
    expect(r.Reason).toContain('outcome-degradation');
    expect(r.Reason).toContain('0.03');
  });

  it('fewer periods than N never fire', () => {
    const t: RetrainTrigger = { kind: 'outcome-degradation', margin: nn(0), consecutivePeriods: 3 };
    expect(MonitoringRules.TriggerFires(t, [Below(1), Below(1)]).Fired).toBe(false);
    expect(MonitoringRules.TriggerFires(t, []).Fired).toBe(false);
  });
});

describe('MonitoringRules.RollbackFires', () => {
  it('rollback needs the lower bound strictly above the margin in consecutive periods', () => {
    const r: RollbackTrigger = { kind: 'previous-beats-current', margin: nn(0.01), consecutivePeriods: 2 };
    expect(MonitoringRules.RollbackFires(r, [{ Lower: 0.02 }])).toBe(false);
    expect(MonitoringRules.RollbackFires(r, [{ Lower: 0.01 }, { Lower: 0.02 }])).toBe(false);
    expect(MonitoringRules.RollbackFires(r, [{ Lower: 0.011 }, { Lower: 0.02 }])).toBe(true);
  });

  it('reads only the last N checks', () => {
    const r: RollbackTrigger = { kind: 'previous-beats-current', margin: nn(0.01), consecutivePeriods: 2 };
    expect(MonitoringRules.RollbackFires(r, [{ Lower: 0.5 }, { Lower: 0.5 }, { Lower: 0 }])).toBe(false);
    expect(MonitoringRules.RollbackFires(r, [{ Lower: 0 }, { Lower: 0.5 }, { Lower: 0.5 }])).toBe(true);
  });
});

describe('MonitoringRules.LabelWindowClosed', () => {
  it('a label window is closed only after its gap and window have passed', () => {
    expect(MonitoringRules.LabelWindowClosed({ LabelWindowDays: 30, LabelGapDays: 7 }, D('2026-01-01'), D('2026-02-06'))).toBe(false);
    expect(MonitoringRules.LabelWindowClosed({ LabelWindowDays: 30, LabelGapDays: 7 }, D('2026-01-01'), D('2026-02-07'))).toBe(true);
  });

  it('a zero gap closes after the window alone', () => {
    expect(MonitoringRules.LabelWindowClosed({ LabelWindowDays: 1, LabelGapDays: 0 }, D('2026-01-01'), D('2026-01-02'))).toBe(true);
    expect(MonitoringRules.LabelWindowClosed({ LabelWindowDays: 1, LabelGapDays: 0 }, D('2026-01-01'), new Date('2026-01-01T23:59:59.000Z'))).toBe(false);
  });
});

describe('MonitoringRules.Divergence', () => {
  it('divergence pairs champion and challenger rows by key and counts unpaired rows as failures', () => {
    expect(MonitoringRules.Divergence([V('r1', 0.7), V('r2', 0.2)], [V('r1', 0.6)])).toEqual({ Paired: 1, Agreement: 1, MeanScoreDelta: expect.closeTo(-0.1, 12), Failures: 1 });
  });

  it('a challenger row with no score is a failure, not a pair', () => {
    expect(MonitoringRules.Divergence([V('r1', 0.7), V('r2', 0.2)], [V('r1', 0.6), V('r2', null)])).toEqual({ Paired: 1, Agreement: 1, MeanScoreDelta: expect.closeTo(-0.1, 12), Failures: 1 });
  });

  it('agreement is the share of pairs on the same side of the 0.5 decision threshold', () => {
    const d = MonitoringRules.Divergence([V('a', 0.7), V('b', 0.2)], [V('a', 0.4), V('b', 0.1)]);
    expect(d.Agreement).toBe(0.5);
    expect(d.MeanScoreDelta).toBeCloseTo(-0.2, 12);
  });

  it('matches record keys case-insensitively (UUIDsEqual) and with no rows reports zero pairs', () => {
    const upper = 'AAAAAAAA-0000-0000-0000-000000000001';
    expect(MonitoringRules.Divergence([V(upper, 0.6)], [V(upper.toLowerCase(), 0.6)]).Paired).toBe(1);
    expect(MonitoringRules.Divergence([], [])).toEqual({ Paired: 0, Agreement: 0, MeanScoreDelta: 0, Failures: 0 });
  });
});
