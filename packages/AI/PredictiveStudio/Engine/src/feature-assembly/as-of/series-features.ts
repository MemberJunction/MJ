/**
 * @module feature-assembly/as-of/series-features
 *
 * Series features declared once in the unit's Temporal Spec: lag k reads the value k periods back; rolling windows
 * aggregate periods [t − endLag − periods + 1, t − endLag]. Every lag and endLag is >= the horizon (the parser
 * refuses otherwise), so nothing inside the horizon is ever read.
 */
import type { DatedSource, TemporalSpec } from '@memberjunction/predictive-studio-core';
import { MS_PER_DAY } from '../../prediction-unit/utc-day';

/** A series feature reference, derived from the contract's `series` source (never restated). */
// case-violation-ok-legacy-back-compat: `kind` is DatedSource's contracts.ts wire discriminant
export type SeriesFeatureRef = Extract<DatedSource, { kind: 'series' }>['feature'];

/** One observed period of one entity's series. */
export interface SeriesPoint { readonly EntityKey: string; readonly Period: Date; readonly Value: number; readonly RowId: string }
/** Series points keyed by lower-cased entity key, then by calendar period index. */
export type SeriesHistory = { readonly Spec: TemporalSpec; readonly ByEntity: ReadonlyMap<string, ReadonlyMap<number, SeriesPoint>> };

/** Series lags and rolling windows (static members on one owner class). */
export class SeriesFeatures {
  /** Calendar index of a period start (months since 1970 for monthly, days for daily, …). */
  public static PeriodIndex(period: Date, unit: TemporalSpec['period']): number {
    switch (unit) {
      case 'day': return Math.floor(period.getTime() / MS_PER_DAY);
      case 'week': return Math.floor(period.getTime() / (7 * MS_PER_DAY));
      case 'month': return period.getUTCFullYear() * 12 + period.getUTCMonth();
      case 'year': return period.getUTCFullYear();
    }
  }

  /** Indexes series points by entity and period; a later point for the same period replaces an earlier one. */
  public static BuildSeriesHistory(points: readonly SeriesPoint[], spec: TemporalSpec): SeriesHistory {
    const byEntity = new Map<string, Map<number, SeriesPoint>>();
    for (const p of points) {
      const k = p.EntityKey.toLowerCase();
      const m = byEntity.get(k) || new Map<number, SeriesPoint>();
      m.set(SeriesFeatures.PeriodIndex(p.Period, spec.period), p);
      byEntity.set(k, m);
    }
    return { Spec: spec, ByEntity: byEntity };
  }

  /** One lag or rolling-window value for an entity at `period`; null when any period it reads is missing. */
  public static ComputeSeriesFeature(
    history: SeriesHistory, entityKey: string, period: Date, spec: TemporalSpec, feature: SeriesFeatureRef,
  ): { readonly Value: number | null; readonly SourceRowIds: readonly string[] } {
    const series = history.ByEntity.get(entityKey.toLowerCase());
    const t = SeriesFeatures.PeriodIndex(period, spec.period);
    if (!series) return { Value: null, SourceRowIds: [] };
    if (feature.kind === 'lag') {
      const p = series.get(t - spec.lags[feature.index]);
      return p ? { Value: p.Value, SourceRowIds: [p.RowId] } : { Value: null, SourceRowIds: [] };
    }
    const w = spec.rollingWindows[feature.index];
    const pts: SeriesPoint[] = [];
    for (let i = t - w.endLag - w.periods + 1; i <= t - w.endLag; i++) {
      const p = series.get(i);
      if (!p) return { Value: null, SourceRowIds: [] };
      pts.push(p);
    }
    const values = pts.map((p) => p.Value);
    const value = w.aggregate === 'mean' ? values.reduce((s, v) => s + v, 0) / values.length
      : w.aggregate === 'sum' ? values.reduce((s, v) => s + v, 0)
      : w.aggregate === 'min' ? Math.min(...values) : Math.max(...values);
    return { Value: value, SourceRowIds: pts.map((p) => p.RowId) };
  }
}
