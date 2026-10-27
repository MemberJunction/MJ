/**
 * @module feature-assembly/as-of/windowed-aggregate
 *
 * Summaries of a dated child table as of a decision date: rows dated in (d − windowDays, d] (or on/before d when no
 * window), minus rows voided on or before d, then count | sum | mean | distinct | days-since, or active-at
 * (dateField <= d and (endDateField null or >= d)). Generalises the executor's two hard-coded aggregates.
 */
import { OrdinalCompare } from '@memberjunction/global';
import type { WindowedAggregateSource } from '@memberjunction/predictive-studio-core';
import type { SourceRow } from '../data-access';
import { PredictionUnitRowReader } from '../../prediction-unit/unit-row-reader';
import { MS_PER_DAY, UtcDay, type CellValue } from '../../prediction-unit/utc-day';

/** One child row reduced to what an as-of aggregate reads: its day, end and void days, value and change stamp. */
export interface ChildRow {
  readonly Id: string;
  readonly Day: Date;
  readonly EndDay: Date | null;
  readonly VoidedDay: Date | null;
  readonly Value: CellValue;
  readonly UpdatedAt: string;
}

/** Child rows keyed by lower-cased owner key, each list sorted by day then ID. */
export type ChildRowIndex = ReadonlyMap<string, readonly ChildRow[]>;

/** Windowed aggregates over a dated child table (static members on one owner class). */
export class WindowedAggregates {
  /** Indexes the filtered, dated child rows by owner key; rows without a parseable date are skipped. */
  public static BuildChildRowIndex(rows: readonly SourceRow[], spec: WindowedAggregateSource, primaryKey: string): ChildRowIndex {
    const out = new Map<string, ChildRow[]>();
    for (const r of rows) {
      if (!PredictionUnitRowReader.MatchesRowFilters(r, spec.filter)) continue;
      const day = UtcDay.ToUtcDay(r[spec.dateField]);
      if (day === null) continue;
      // `??`: a numeric 0 owner key is a real key; only an absent one becomes ''.
      const owner = String(r[spec.foreignKey] ?? '').toLowerCase();
      const list = out.get(owner) || [];
      const updated = r.__mj_UpdatedAt;
      list.push({
        Id: String(r[primaryKey]),
        Day: day,
        EndDay: spec.endDateField ? UtcDay.ToUtcDay(r[spec.endDateField]) : null,
        VoidedDay: spec.voidedAtField ? UtcDay.ToUtcDay(r[spec.voidedAtField]) : null,
        Value: spec.valueField ? r[spec.valueField] : null,
        UpdatedAt: updated instanceof Date ? updated.toISOString() : String(updated || ''),
      });
      out.set(owner, list);
    }
    for (const list of out.values()) list.sort((a, b) => a.Day.getTime() - b.Day.getTime() || OrdinalCompare(a.Id, b.Id));
    return out;
  }

  /** The aggregate for one owner as of `decision`, with the child rows that contributed to it. */
  public static ComputeWindowedAggregate(index: ChildRowIndex, ownerKey: string, decision: Date, spec: WindowedAggregateSource): { readonly Value: number | null; readonly Contributors: readonly ChildRow[] } {
    const d = decision.getTime();
    const all = index.get(ownerKey.toLowerCase()) || [];
    const live = all.filter((c) => c.VoidedDay === null || c.VoidedDay.getTime() > d);
    if (spec.aggregate === 'active-at') {
      const active = live.filter((c) => c.Day.getTime() <= d && (c.EndDay === null || c.EndDay.getTime() >= d));
      return { Value: active.length, Contributors: active };
    }
    const from = spec.windowDays === null ? Number.NEGATIVE_INFINITY : d - spec.windowDays * MS_PER_DAY;
    const inWindow = live.filter((c) => c.Day.getTime() > from && c.Day.getTime() <= d);
    const numbers = inWindow.map((c) => Number(c.Value)).filter((n) => Number.isFinite(n));
    switch (spec.aggregate) {
      case 'count': return { Value: inWindow.length, Contributors: inWindow };
      case 'sum': return { Value: numbers.reduce((s, n) => s + n, 0), Contributors: inWindow };
      case 'mean': return { Value: numbers.length > 0 ? numbers.reduce((s, n) => s + n, 0) / numbers.length : null, Contributors: inWindow };
      case 'distinct': return { Value: new Set(inWindow.map((c) => String(c.Value))).size, Contributors: inWindow };
      case 'days-since': {
        const latest = inWindow[inWindow.length - 1];
        return { Value: latest ? Math.round((d - latest.Day.getTime()) / MS_PER_DAY) : null, Contributors: latest ? [latest] : [] };
      }
    }
  }
}
