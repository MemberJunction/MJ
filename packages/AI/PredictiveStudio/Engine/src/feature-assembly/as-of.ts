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

import type { AsOfStrategy } from '@memberjunction/predictive-studio-core';
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
