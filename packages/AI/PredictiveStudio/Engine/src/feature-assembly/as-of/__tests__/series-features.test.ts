import { describe, it, expect } from 'vitest';
import type { TemporalSpec } from '@memberjunction/predictive-studio-core';
import { SeriesFeatures } from '../series-features';

const spec: TemporalSpec = { timeColumn: 'T', horizonPeriods: 1, lags: [1, 12], rollingWindows: [{ endLag: 1, periods: 3, aggregate: 'mean' }], period: 'month', seasonality: 12 };
// Each month's outcome window closes on its last day, so a row decided on the first of a later month reads it.
// An assembly day after every decision below, so the decision-day rule alone decides what is known.
const LATER = new Date(Date.UTC(2030, 0, 1));
const months = Array.from({ length: 24 }, (_, i) => ({ EntityKey: 'series', Period: new Date(Date.UTC(2005, i, 1)), Value: 100 + i, RowID: `m${i}`, WindowEnd: new Date(Date.UTC(2005, i + 1, 0)) }));

describe('ComputeSeriesFeature', () => {
  const history = SeriesFeatures.BuildSeriesHistory(months, spec);
  it('reads lag k as the value k periods back', () => {
    expect(SeriesFeatures.ComputeSeriesFeature(history, 'series', new Date(Date.UTC(2006, 5, 1)), spec, { kind: 'lag', index: 0 }, new Date(Date.UTC(2006, 5, 1)), LATER).Value).toBe(116);
    expect(SeriesFeatures.ComputeSeriesFeature(history, 'series', new Date(Date.UTC(2006, 5, 1)), spec, { kind: 'lag', index: 1 }, new Date(Date.UTC(2006, 5, 1)), LATER).Value).toBe(105);
  });
  it('averages the rolling window [t − endLag − periods + 1, t − endLag]', () => {
    expect(SeriesFeatures.ComputeSeriesFeature(history, 'series', new Date(Date.UTC(2006, 5, 1)), spec, { kind: 'rolling', index: 0 }, new Date(Date.UTC(2006, 5, 1)), LATER).Value).toBe(115);
  });
  it('returns null when the lag reaches before the first period', () => {
    expect(SeriesFeatures.ComputeSeriesFeature(history, 'series', new Date(Date.UTC(2005, 5, 1)), spec, { kind: 'lag', index: 1 }, new Date(Date.UTC(2005, 5, 1)), LATER).Value).toBeNull();
  });
  it('returns null when a rolling window reaches before the first period, never the mean of the periods it has', () => {
    // At 2005-03 the window [t − 3, t − 1] needs 2004-12, which the series does not have.
    expect(SeriesFeatures.ComputeSeriesFeature(history, 'series', new Date(Date.UTC(2005, 2, 1)), spec, { kind: 'rolling', index: 0 }, new Date(Date.UTC(2005, 2, 1)), LATER)).toEqual({ Value: null, SourceRowIDs: [] });
  });
  it('throws when a feature index is past the Temporal Spec', () => {
    expect(() => SeriesFeatures.ComputeSeriesFeature(history, 'series', new Date(Date.UTC(2006, 5, 1)), spec, { kind: 'lag', index: 2 }, new Date(Date.UTC(2006, 5, 1)), LATER)).toThrow(/lag.*index 2/);
    expect(() => SeriesFeatures.ComputeSeriesFeature(history, 'series', new Date(Date.UTC(2006, 5, 1)), spec, { kind: 'rolling', index: 1 }, new Date(Date.UTC(2006, 5, 1)), LATER)).toThrow(/rolling.*index 1/);
  });
});

describe('SeriesFeatures.PeriodIndex — weeks', () => {
  it('puts every day of one ISO week (Monday to Sunday) in one period and the next Monday in the next', () => {
    const idx = (d: string) => SeriesFeatures.PeriodIndex(new Date(`${d}T00:00:00Z`), 'week');
    const monday = idx('2025-01-06');
    expect([idx('2025-01-07'), idx('2025-01-09'), idx('2025-01-12')]).toEqual([monday, monday, monday]);
    expect(idx('2025-01-13')).toBe(monday + 1);
    expect(idx('2025-01-05')).toBe(monday - 1);
  });
});

describe('ComputeSeriesFeature — only periods whose outcome window had closed by the decision', () => {
  const late = SeriesFeatures.BuildSeriesHistory(months.map((m, i) => (i === 16 ? { ...m, WindowEnd: new Date(Date.UTC(2006, 6, 15)) } : m)), spec);
  it('nulls a lag whose period\'s window closes after the row\'s decision day, and reads it once the window has closed', () => {
    // 2006-06 lag 1 reads m16 (2006-05), whose window now closes 2006-07-15.
    expect(SeriesFeatures.ComputeSeriesFeature(late, 'series', new Date(Date.UTC(2006, 5, 1)), spec, { kind: 'lag', index: 0 }, new Date(Date.UTC(2006, 5, 1)), LATER).Value).toBeNull();
    expect(SeriesFeatures.ComputeSeriesFeature(late, 'series', new Date(Date.UTC(2006, 5, 1)), spec, { kind: 'lag', index: 0 }, new Date(Date.UTC(2006, 6, 15)), LATER).Value).toBe(116);
  });
  it('nulls a rolling window that reads such a period', () => {
    expect(SeriesFeatures.ComputeSeriesFeature(late, 'series', new Date(Date.UTC(2006, 5, 1)), spec, { kind: 'rolling', index: 0 }, new Date(Date.UTC(2006, 5, 1)), LATER)).toEqual({ Value: null, SourceRowIDs: [] });
  });
});

describe('ComputeSeriesFeature — a row decided after the assembly day reads only periods closed by the assembly day', () => {
  // m16 (2006-05) has a window that closes 2006-07-15.
  const late = SeriesFeatures.BuildSeriesHistory(months.map((m, i) => (i === 16 ? { ...m, WindowEnd: new Date(Date.UTC(2006, 6, 15)) } : m)), spec);
  const lag1 = (decision: Date, assembledAt: Date) => SeriesFeatures.ComputeSeriesFeature(late, 'series', new Date(Date.UTC(2006, 5, 1)), spec, { kind: 'lag', index: 0 }, decision, assembledAt);

  it('nulls a lag whose period\'s window closes after the assembly day and on or before the row\'s later decision day', () => {
    // Scored on 2006-07-01 for a decision on 2006-07-20: the window closing 2006-07-15 is still open at scoring.
    expect(lag1(new Date(Date.UTC(2006, 6, 20)), new Date(Date.UTC(2006, 6, 1, 9))).Value).toBeNull();
  });

  it('reads it once the assembly day has reached the window end, and keeps the decision-day rule for a row decided on or before the assembly day', () => {
    expect(lag1(new Date(Date.UTC(2006, 6, 20)), new Date(Date.UTC(2006, 6, 15, 9))).Value).toBe(116);
    expect(lag1(new Date(Date.UTC(2006, 6, 15)), new Date(Date.UTC(2006, 6, 20))).Value).toBe(116);
    expect(lag1(new Date(Date.UTC(2006, 6, 14)), new Date(Date.UTC(2006, 6, 20))).Value).toBeNull();
  });
});
