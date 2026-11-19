import { describe, expect, it } from 'vitest';
import type { IntervalSpec, TaskType } from '@memberjunction/predictive-studio-core';

import type { JoinedRow } from '../monitoring-seams';
import { PeriodEvaluation, type PeriodScoringSpec } from '../period-evaluation';

/** Task M6.3 — the period's numbers: proper scores with intervals, tracked metrics, calibration, degradation, paired difference. */
const BINARY: TaskType = { kind: 'binary', classOrder: ['0', '1'], adverseIndex: 1 };
const BOOT: IntervalSpec = { level: 0.95, method: 'bootstrap', resamples: 400, pairedTest: 'paired-bootstrap' };
const spec = (over: Partial<PeriodScoringSpec> = {}): PeriodScoringSpec => ({ PrimaryScore: { family: 'binary', metric: 'log-loss' }, Interval: BOOT, Task: BINARY, Seed: 7, ...over });

const row = (id: string, score: number, outcome: string | number | null, day = 1): JoinedRow => ({
  RecordID: id, EffectiveAsOf: new Date(Date.UTC(2026, 0, day)), DecisionDate: new Date(Date.UTC(2026, 0, day)), InTraining: false,
  ScoreFromPeriod: score, Score: score, Probabilities: { '0': 1 - score, '1': score }, Outcome: outcome, GroupKey: id,
});
const rows = (n: number, score: number, positives: number): JoinedRow[] => Array.from({ length: n }, (_, i) => row(`r${i}`, score, i < positives ? '1' : '0', (i % 28) + 1));

describe('PeriodEvaluation.Score', () => {
  it('computes the log loss exactly and brackets it with its 95% interval', () => {
    const r = PeriodEvaluation.Score(rows(100, 0.2, 20), spec());
    const expected = -(0.2 * Math.log(0.2) + 0.8 * Math.log(0.8));
    expect(r.Primary.value).toBeCloseTo(expected, 12);
    expect(r.Primary.interval.lower).toBeLessThanOrEqual(expected);
    expect(r.Primary.interval.upper).toBeGreaterThanOrEqual(expected);
    expect(r.Primary.n).toBe(100);
  });

  it('tracks the positive rate from the labels (not the scores), with bounds', () => {
    const r = PeriodEvaluation.Score(rows(100, 0.9, 30), spec());
    const rate = r.Tracked.find((t) => t.metric === 'positive-rate');
    expect(rate).toMatchObject({ value: 0.3, className: '1' });
    expect(rate && rate.interval.lower < 0.3 && rate.interval.upper > 0.3).toBe(true);
  });

  it('is reproducible under its seed', () => {
    const a = PeriodEvaluation.Score(rows(60, 0.4, 25), spec());
    const b = PeriodEvaluation.Score(rows(60, 0.4, 25), spec());
    expect(a.Primary.interval).toEqual(b.Primary.interval);
  });

  it('a block bootstrap widens the interval of a serially correlated period beyond the iid one', () => {
    const correlated = Array.from({ length: 120 }, (_, i) => row(`s${i}`, 0.5, Math.floor(i / 20) % 2 === 0 ? '1' : '0', (i % 28) + 1))
      .map((r, i) => ({ ...r, DecisionDate: new Date(Date.UTC(2026, 0, 1, 0, i)) }));
    const iid = PeriodEvaluation.Score(correlated, spec({ PrimaryScore: { family: 'binary', metric: 'brier' } }));
    const block = PeriodEvaluation.Score(correlated, spec({ PrimaryScore: { family: 'binary', metric: 'brier' }, Interval: { ...BOOT, method: 'block-bootstrap' } }));
    const rate = (s: typeof iid): number => {
      const t = s.Tracked.find((x) => x.metric === 'positive-rate');
      return t ? t.interval.upper - t.interval.lower : 0;
    };
    expect(rate(block)).toBeGreaterThan(rate(iid));
  });

  it('scores a regression by RMSE and reports no calibration', () => {
    const regression = [row('a', 1, 2), row('b', 3, 3), row('c', 5, 3)];
    const r = PeriodEvaluation.Score(regression, spec({ PrimaryScore: { family: 'continuous', metric: 'rmse' }, Task: { kind: 'continuous' } }));
    expect(r.Primary.value).toBeCloseTo(Math.sqrt((1 + 0 + 4) / 3), 12);
    expect(r.Calibration).toBeNull();
  });

  it('a binary calibration fit of a calibrated period has slope near 1', () => {
    const calibrated = [...rows(500, 0.2, 100).map((r) => ({ ...r, RecordID: `a${r.RecordID}` })), ...rows(500, 0.6, 300).map((r) => ({ ...r, RecordID: `b${r.RecordID}` }))];
    const r = PeriodEvaluation.Score(calibrated, spec());
    expect(r.Calibration?.slope).toBeCloseTo(1, 6);
  });

  it('refuses a period with no realised outcome', () => {
    expect(() => PeriodEvaluation.Score([row('x', 0.5, null)], spec())).toThrow(/no row with a realised outcome/);
  });
});

describe('PeriodEvaluation.Degradation and PairedDifference', () => {
  it('the degradation interval is the difference with both standard errors combined', () => {
    const d = PeriodEvaluation.Degradation(
      { metric: 'log-loss', value: 0.7, interval: { level: 0.95, lower: 0.66, upper: 0.74 }, n: 100 },
      { metric: 'log-loss', value: 0.5, interval: { level: 0.95, lower: 0.47, upper: 0.53 }, n: 1000 },
    );
    expect((d.lower + d.upper) / 2).toBeCloseTo(0.2, 12);
    expect(d.upper - d.lower).toBeCloseTo(2 * Math.sqrt(0.04 ** 2 + 0.03 ** 2), 10);
  });

  it('the paired difference is current minus predecessor loss on identical rows', () => {
    const current = rows(80, 0.6, 0);
    const predecessor = current.map((r) => ({ ...r, Score: 0.1, ScoreFromPeriod: 0.1 }));
    const d = PeriodEvaluation.PairedDifference(current, predecessor, spec());
    expect(d.value).toBeCloseTo(-Math.log(0.4) + Math.log(0.9), 12);
    expect(d.interval.lower).toBeGreaterThan(0);
  });

  it('refuses rows that are not the same records in the same order', () => {
    const a = rows(3, 0.5, 1);
    expect(() => PeriodEvaluation.PairedDifference(a, [...a].reverse(), spec())).toThrow(/same rows/);
  });
});
