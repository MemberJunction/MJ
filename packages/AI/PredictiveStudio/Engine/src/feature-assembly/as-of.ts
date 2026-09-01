/**
 * @module feature-assembly/as-of
 *
 * Point-in-time ("as-of") assembly — the single biggest **new** correctness
 * primitive in Predictive Studio (plan §6.3). For forward prediction, features
 * must be assembled **as they were at the decision point**, not as they are
 * today. A time-relative feature like `days_since_last_activity` computed over
 * data that includes events *after* the decision date leaks the future and
 * produces a model that scores beautifully in the lab and uselessly in
 * production.
 *
 * This module resolves a per-record **as-of date** from the {@link AsOfStrategy}
 * and provides helpers that filter dated source rows to those at-or-before that
 * date, then compute recency/aggregate features only over the surviving rows.
 */

import type { AsOfAggregateKind, AsOfStrategy, AsOfWindowSpec } from '@memberjunction/predictive-studio-core';
import type { SourceRow } from './data-access';

/** A single dated event/activity row scoped to a target record. */
export interface DatedRow {
  /** The event's timestamp. */
  Date: Date;
  /** The underlying source row (carried through for aggregate computations). */
  Row: SourceRow;
}

/**
 * Resolves the per-record as-of date from the configured {@link AsOfStrategy}.
 *
 * - `none` → `null` (no point-in-time filtering; features reflect "now").
 * - `column` → the value of `Strategy.Column` on the record, parsed as a date.
 * - `offset` → `labelEventDate − OffsetDays`. The label-event date is the
 *   per-record anchor (e.g. the renewal-window start); we assemble features as
 *   of N days *before* it so the model only ever sees pre-decision data.
 *
 * @param strategy the configured as-of strategy
 * @param record the training/scoring unit record
 * @param labelEventDate the record's label-event date (required for `offset`)
 * @returns the resolved as-of cutoff, or `null` when no filtering applies
 */
export function resolveAsOfDate(strategy: AsOfStrategy, record: SourceRow, labelEventDate?: Date | null): Date | null {
  switch (strategy.Mode) {
    case 'none':
      return null;
    case 'column': {
      if (!strategy.Column) {
        throw new Error(`AsOfStrategy.Mode='column' requires a Column name.`);
      }
      const raw = record[strategy.Column];
      const parsed = coerceDate(raw);
      if (parsed === null) {
        throw new Error(`AsOfStrategy column '${strategy.Column}' is missing or not a date on the record.`);
      }
      return parsed;
    }
    case 'offset': {
      if (strategy.OffsetDays == null) {
        throw new Error(`AsOfStrategy.Mode='offset' requires OffsetDays.`);
      }
      if (!labelEventDate) {
        throw new Error(`AsOfStrategy.Mode='offset' requires a label-event date per record.`);
      }
      const asOf = new Date(labelEventDate.getTime());
      asOf.setUTCDate(asOf.getUTCDate() - strategy.OffsetDays);
      return asOf;
    }
    default: {
      // Exhaustiveness guard — narrows to `never` if a new mode is added.
      const exhaustive: never = strategy.Mode;
      throw new Error(`Unsupported AsOfStrategy mode: ${String(exhaustive)}`);
    }
  }
}

/**
 * Filters dated rows to those occurring at-or-before the as-of cutoff. A `null`
 * cutoff (i.e. `Mode='none'`) is the identity filter — all rows survive.
 *
 * This is the leakage-prevention boundary: **only** rows passing this filter may
 * feed any time-relative feature.
 *
 * @param rows the candidate dated rows for one record
 * @param asOfDate the resolved cutoff, or `null` for no filtering
 * @returns the rows at-or-before the cutoff
 */
export function filterAsOf(rows: DatedRow[], asOfDate: Date | null): DatedRow[] {
  if (asOfDate === null) {
    return rows;
  }
  const cutoff = asOfDate.getTime();
  return rows.filter((r) => r.Date.getTime() <= cutoff);
}

/**
 * Computes `days_since_last_activity` as of the cutoff: the whole-day gap
 * between the cutoff date and the most recent surviving event. Returns `null`
 * when there is no qualifying activity (the caller decides how to encode "no
 * activity" — typically imputed downstream by the sidecar, §6.2).
 *
 * Computing recency relative to the **as-of date** (not "now") is what keeps
 * train-time ("as-of-then") and score-time ("as-of-now") consistent.
 *
 * @param rows candidate dated rows (will be filtered to the cutoff internally)
 * @param asOfDate the resolved cutoff; when `null`, recency is measured from "now"
 */
export function daysSinceLastActivityAsOf(rows: DatedRow[], asOfDate: Date | null): number | null {
  const reference = asOfDate ?? new Date();
  const surviving = filterAsOf(rows, asOfDate);
  if (surviving.length === 0) {
    return null;
  }
  let mostRecent = surviving[0].Date.getTime();
  for (const r of surviving) {
    const t = r.Date.getTime();
    if (t > mostRecent) {
      mostRecent = t;
    }
  }
  const diffMs = reference.getTime() - mostRecent;
  return Math.floor(diffMs / MS_PER_DAY);
}

/**
 * Counts surviving activity rows as of the cutoff — a generic point-in-time
 * aggregate (e.g. `activity_count_asof`). Only rows at-or-before the cutoff are
 * counted, preventing future leakage.
 *
 * @param rows candidate dated rows
 * @param asOfDate the resolved cutoff, or `null` for no filtering
 */
export function activityCountAsOf(rows: DatedRow[], asOfDate: Date | null): number {
  return filterAsOf(rows, asOfDate).length;
}


// ---------------------------------------------------------------------------
// Windowed aggregates — the widened as-of vocabulary (ported from Sonar)
// ---------------------------------------------------------------------------

/**
 * Clamped calendar-month subtraction: `31 Jul − 1 month = 30 Jun`, never a rollover into July.
 * Ported from Sonar's `subtractMonthsClamped` (PR #49's in-memory reference implementation).
 */
export function subtractMonthsClamped(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() - months);
  const daysInTarget = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, daysInTarget));
  return result;
}

/** The UTC start of the calendar period containing `asOf`. */
export function calendarPeriodStart(asOf: Date, period: 'month' | 'quarter' | 'year'): Date {
  const year = asOf.getUTCFullYear();
  if (period === 'year') return new Date(Date.UTC(year, 0, 1));
  if (period === 'quarter') return new Date(Date.UTC(year, Math.floor(asOf.getUTCMonth() / 3) * 3, 1));
  return new Date(Date.UTC(year, asOf.getUTCMonth(), 1));
}

/** Bounds resolved for one record's window: lower (exclusivity flagged) and upper, both optional. */
interface WindowBounds {
  lower: Date | null;
  lowerExclusive: boolean;
  upper: Date | null;
}

/**
 * Resolve a window's bounds for one record. `null` window = AllTime (no bounds beyond the as-of
 * cutoff the caller already applied). Per-record windows (SinceEvent/RenewalRelative) read their
 * anchor date off the target record and yield `null` bounds when the anchor is absent — the
 * aggregate then sees no rows, which is "no data", not an error.
 */
export function resolveWindowBounds(
  window: AsOfWindowSpec | null | undefined,
  asOf: Date | null,
  record: SourceRow,
): WindowBounds | null {
  if (!window || window.Kind === 'AllTime') {
    return { lower: null, lowerExclusive: false, upper: null };
  }
  const reference = asOf ?? new Date();
  switch (window.Kind) {
    case 'Rolling': {
      const lower = window.LengthMonths != null
        ? subtractMonthsClamped(reference, window.LengthMonths)
        : new Date(reference.getTime() - (window.LengthDays ?? 0) * MS_PER_DAY);
      // Sonar semantics: the ROLLING lower bound is exclusive (a row exactly `length` ago is out).
      return { lower, lowerExclusive: true, upper: null };
    }
    case 'Calendar':
      return { lower: calendarPeriodStart(reference, window.Period), lowerExclusive: false, upper: null };
    case 'SinceEvent': {
      const anchor = coerceDate(record[window.AnchorDateField]);
      if (!anchor) return null;
      const lower = new Date(anchor.getTime() + (window.OffsetDays ?? 0) * MS_PER_DAY);
      return { lower, lowerExclusive: false, upper: null };
    }
    case 'RenewalRelative': {
      const anchor = coerceDate(record[window.AnchorDateField]);
      if (!anchor) return null;
      const upper = new Date(anchor.getTime());
      const lower = new Date(anchor.getTime() + (window.OffsetDays ?? 0) * MS_PER_DAY);
      return { lower, lowerExclusive: false, upper };
    }
    default: {
      const exhaustive: never = window;
      throw new Error(`Unsupported window: ${String(exhaustive)}`);
    }
  }
}

/**
 * Filter already-as-of-filtered rows to a window's bounds for one record. Returns `[]` when a
 * per-record window's anchor date is absent (no data, not an error).
 */
export function filterWindow(
  rows: DatedRow[],
  window: AsOfWindowSpec | null | undefined,
  asOf: Date | null,
  record: SourceRow,
): DatedRow[] {
  const bounds = resolveWindowBounds(window, asOf, record);
  if (bounds === null) return [];
  return rows.filter((r) => {
    const t = r.Date.getTime();
    if (bounds.lower) {
      if (bounds.lowerExclusive ? t <= bounds.lower.getTime() : t < bounds.lower.getTime()) return false;
    }
    if (bounds.upper && t > bounds.upper.getTime()) return false;
    return true;
  });
}

/** Numeric values of `field` over rows, NULL/non-numeric excluded (SQL aggregate semantics). */
function numericFieldValues(rows: DatedRow[], field: string): number[] {
  const out: number[] = [];
  for (const r of rows) {
    const raw = r.Row[field];
    if (raw == null) continue;
    const n = typeof raw === 'number' ? raw : Number(raw);
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

/** The window's length in whole days, or null when it has no computable length (AllTime). */
function windowLengthDays(bounds: WindowBounds, asOf: Date | null): number | null {
  const upper = bounds.upper ?? asOf ?? new Date();
  if (!bounds.lower) return null;
  const days = (upper.getTime() - bounds.lower.getTime()) / MS_PER_DAY;
  return days > 0 ? days : null;
}

/**
 * Compute one widened as-of aggregate over a record's dated rows — the executable semantics of
 * the `Input → As-Of Aggregate` component leaves. Rows must ALREADY be as-of filtered
 * ({@link filterAsOf}); this applies the window then aggregates with SQL NULL rules
 * (empty set → `count` 0 / `exists` 0 / everything else `null`; nulls excluded from
 * field aggregates). `rate_per_period` is the per-30-day rate; `trend_slope` is the OLS slope of
 * per-30-day-bucket counts — both `null` when the window has no computable length.
 */
export function aggregateAsOf(
  rows: DatedRow[],
  kind: AsOfAggregateKind,
  field: string | null | undefined,
  window: AsOfWindowSpec | null | undefined,
  asOf: Date | null,
  record: SourceRow,
): number | null {
  const bounds = resolveWindowBounds(window, asOf, record);
  const surviving = bounds === null ? [] : filterWindow(rows, window, asOf, record);
  switch (kind) {
    case 'count':
      return surviving.length;
    case 'exists':
      return surviving.length > 0 ? 1 : 0;
    case 'recency':
      return daysSinceLastActivityAsOf(surviving, asOf);
    case 'sum':
    case 'avg':
    case 'min':
    case 'max': {
      const values = numericFieldValues(surviving, requireField(kind, field));
      if (values.length === 0) return null;
      if (kind === 'sum') return values.reduce((a, b) => a + b, 0);
      if (kind === 'avg') return values.reduce((a, b) => a + b, 0) / values.length;
      if (kind === 'min') return Math.min(...values);
      return Math.max(...values);
    }
    case 'distinct_count': {
      const distinct = new Set<string>();
      for (const r of surviving) {
        const raw = r.Row[requireField(kind, field)];
        if (raw != null) distinct.add(String(raw));
      }
      return distinct.size === 0 && surviving.length === 0 ? null : distinct.size;
    }
    case 'rate_per_period': {
      if (bounds === null) return null;
      const length = windowLengthDays(bounds, asOf);
      return length === null ? null : (surviving.length / length) * 30;
    }
    case 'trend_slope': {
      if (bounds === null) return null;
      const length = windowLengthDays(bounds, asOf);
      if (length === null || length < 60) return null; // fewer than 2 buckets → no trend
      const reference = (bounds.upper ?? asOf ?? new Date()).getTime();
      const buckets = Math.floor(length / 30);
      const counts = new Array<number>(buckets).fill(0);
      for (const r of surviving) {
        const bucket = Math.floor((reference - r.Date.getTime()) / (30 * MS_PER_DAY));
        if (bucket >= 0 && bucket < buckets) counts[buckets - 1 - bucket] += 1; // oldest → newest
      }
      return olsSlope(counts);
    }
    default: {
      const exhaustive: never = kind;
      throw new Error(`Unsupported as-of aggregate: ${String(exhaustive)}`);
    }
  }
}

/** A field-taking aggregate without a Field is a configuration error — fail loud. */
function requireField(kind: string, field: string | null | undefined): string {
  if (!field) {
    throw new Error(`As-of aggregate '${kind}' requires a Field (the value column on the dated source).`);
  }
  return field;
}

/** OLS slope of evenly-spaced values (x = 0..n−1). */
function olsSlope(values: number[]): number | null {
  const n = values.length;
  if (n < 2) return null;
  const meanX = (n - 1) / 2;
  const meanY = values.reduce((a, b) => a + b, 0) / n;
  let cov = 0;
  let varX = 0;
  for (let i = 0; i < n; i++) {
    cov += (i - meanX) * (values[i] - meanY);
    varX += (i - meanX) * (i - meanX);
  }
  return varX === 0 ? null : cov / varX;
}

/** Milliseconds in one day. */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Coerces a loosely-typed source value into a `Date`, or `null` when it cannot
 * be interpreted as a valid date.
 */
function coerceDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}
