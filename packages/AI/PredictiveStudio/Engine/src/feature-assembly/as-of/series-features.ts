/**
 * @module feature-assembly/as-of/series-features
 *
 * Series features declared once in the unit's Temporal Spec: lag k reads the value k periods back; rolling windows
 * aggregate periods [t − endLag − periods + 1, t − endLag]. Every lag and endLag is >= the horizon (the parser
 * refuses otherwise), so nothing inside the horizon is ever read. A period's value is its resolved outcome, so a row
 * reads it only when that period's outcome window had closed by the row's own decision day; training and scoring
 * both compute every lag here, so they null exactly the same cells.
 */
import { MS_PER_DAY, UtcDay, type DatedSource, type TemporalSpec } from '@memberjunction/predictive-studio-core';

/** 1970-01-01 was a Thursday: shifting by three days makes whole weeks counted from the epoch start on Mondays. */
const EPOCH_TO_MONDAY_MS = 3 * MS_PER_DAY;

/** A series feature reference, derived from the contract's `series` source (never restated). */
// case-violation-ok-legacy-back-compat: stored Prediction Unit JSON field name
export type SeriesFeatureRef = Extract<DatedSource, { kind: 'series' }>['feature'];

/**
 * One observed period of one entity's series. `WindowEnd` is the last day of its outcome window (decision + gap +
 * window): its value is known from the end of that day on.
 */
export interface SeriesPoint { readonly EntityKey: string; readonly Period: Date; readonly Value: number; readonly RowID: string; readonly WindowEnd: Date }
/** Series points keyed by lower-cased entity key, then by calendar period index. */
export type SeriesHistory = { readonly Spec: TemporalSpec; readonly ByEntity: ReadonlyMap<string, ReadonlyMap<number, SeriesPoint>> };

/** Series lags and rolling windows. */
export class SeriesFeatures {
  /**
   * Calendar index of a period, monotonic in time so consecutive periods differ by one: days since the epoch for daily,
   * ISO weeks (Monday to Sunday, as the holdout carve and the trainer bucket weeks) for weekly, year * 12 + month for
   * monthly, the year for yearly.
   */
  public static PeriodIndex(period: Date, unit: TemporalSpec['period']): number {
    switch (unit) {
      case 'day': return Math.floor(period.getTime() / MS_PER_DAY);
      case 'week': return Math.floor((period.getTime() + EPOCH_TO_MONDAY_MS) / (7 * MS_PER_DAY));
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

  /**
   * One lag or rolling-window value for an entity at `period`, for a row decided on `decision`; null when any period it
   * reads is missing or its outcome window had not closed by the decision day (its window end is after that day).
   */
  public static ComputeSeriesFeature(
    history: SeriesHistory, entityKey: string, period: Date, spec: TemporalSpec, feature: SeriesFeatureRef, decision: Date,
  ): { readonly Value: number | null; readonly SourceRowIDs: readonly string[] } {
    const declared = feature.kind === 'lag' ? spec.lags.length : spec.rollingWindows.length;
    if (!Number.isInteger(feature.index) || feature.index < 0 || feature.index >= declared) throw SeriesFeatures.indexError(feature, declared);
    const series = history.ByEntity.get(entityKey.toLowerCase());
    const t = SeriesFeatures.PeriodIndex(period, spec.period);
    if (!series) return { Value: null, SourceRowIDs: [] };
    const decisionDay = SeriesFeatures.requireDay(decision);
    const known = (i: number): SeriesPoint | null => {
      const p = series.get(i);
      return p && p.WindowEnd.getTime() <= decisionDay.getTime() ? p : null;
    };
    if (feature.kind === 'lag') {
      const p = known(t - spec.lags[feature.index]);
      return p ? { Value: p.Value, SourceRowIDs: [p.RowID] } : { Value: null, SourceRowIDs: [] };
    }
    const w = spec.rollingWindows[feature.index];
    const pts: SeriesPoint[] = [];
    for (let i = t - w.endLag - w.periods + 1; i <= t - w.endLag; i++) {
      const p = known(i);
      if (!p) return { Value: null, SourceRowIDs: [] };
      pts.push(p);
    }
    const values = pts.map((p) => p.Value);
    const value = w.aggregate === 'mean' ? values.reduce((s, v) => s + v, 0) / values.length
      : w.aggregate === 'sum' ? values.reduce((s, v) => s + v, 0)
      : w.aggregate === 'min' ? Math.min(...values) : Math.max(...values);
    return { Value: value, SourceRowIDs: pts.map((p) => p.RowID) };
  }

  /** A row's decision as its UTC day; the assembly validates decision dates before any feature is read. */
  private static requireDay(decision: Date): Date {
    const day = UtcDay.ToUtcDay(decision);
    if (day === null) throw new Error('Series features: a row has an invalid decision date');
    return day;
  }

  /** Feature resolution refuses an out-of-range index; this guards the computation against a caller that skipped it. */
  private static indexError(feature: SeriesFeatureRef, declared: number): Error {
    return new Error(`Series ${feature.kind} feature index ${feature.index} is outside the Temporal Spec, which declares ${declared}`);
  }
}
