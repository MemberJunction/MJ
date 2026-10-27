import { describe, it, expect } from 'vitest';
import type { TemporalSpec } from '@memberjunction/predictive-studio-core';
import { SeriesFeatures } from '../series-features';

const spec: TemporalSpec = { timeColumn: 'T', horizonPeriods: 1, lags: [1, 12], rollingWindows: [{ endLag: 1, periods: 3, aggregate: 'mean' }], period: 'month', seasonality: 12 };
const months = Array.from({ length: 24 }, (_, i) => ({ EntityKey: 'series', Period: new Date(Date.UTC(2005, i, 1)), Value: 100 + i, RowId: `m${i}` }));

describe('ComputeSeriesFeature', () => {
  const history = SeriesFeatures.BuildSeriesHistory(months, spec);
  it('reads lag k as the value k periods back', () => {
    expect(SeriesFeatures.ComputeSeriesFeature(history, 'series', new Date(Date.UTC(2006, 5, 1)), spec, { kind: 'lag', index: 0 }).Value).toBe(116);
    expect(SeriesFeatures.ComputeSeriesFeature(history, 'series', new Date(Date.UTC(2006, 5, 1)), spec, { kind: 'lag', index: 1 }).Value).toBe(105);
  });
  it('averages the rolling window [t − endLag − periods + 1, t − endLag]', () => {
    expect(SeriesFeatures.ComputeSeriesFeature(history, 'series', new Date(Date.UTC(2006, 5, 1)), spec, { kind: 'rolling', index: 0 }).Value).toBe(115);
  });
  it('returns null when the lag reaches before the first period', () => {
    expect(SeriesFeatures.ComputeSeriesFeature(history, 'series', new Date(Date.UTC(2005, 5, 1)), spec, { kind: 'lag', index: 1 }).Value).toBeNull();
  });
});
