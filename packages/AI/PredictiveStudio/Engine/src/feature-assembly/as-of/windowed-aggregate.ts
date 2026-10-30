/**
 * @module feature-assembly/as-of/windowed-aggregate
 *
 * Summaries of a dated child table as of a decision date: rows dated in (d − windowDays, d] (or on/before d when no
 * window), minus rows voided on or before d, then count | sum | mean | distinct | days-since, or active-at
 * (dateField <= d and (endDateField null or >= d)). Generalises the executor's two hard-coded aggregates. sum and
 * mean skip a missing value (null, undefined or blank) and refuse a present value that is not a number (a date, a
 * boolean or text).
 */
import { OrdinalCompare } from '@memberjunction/global';
import { MS_PER_DAY, UtcDay, type CellValue, type WindowedAggregateSource } from '@memberjunction/predictive-studio-core';
import type { SourceRow } from '../data-access';
import { PredictionUnitRowReader } from '../../prediction-unit/unit-row-reader';
import { AssemblyRefused } from './refusal';

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

  /**
   * The aggregate for one owner as of `decision`, read as its UTC day so a time of day never shifts the window.
   * `Contributors` are the child rows the aggregate read (the window, or the rows active on the day; the latest row for
   * days-since), including rows whose value a sum or mean skipped as missing.
   */
  public static ComputeWindowedAggregate(index: ChildRowIndex, ownerKey: string, decision: Date, spec: WindowedAggregateSource): { readonly Value: number | null; readonly Contributors: readonly ChildRow[] } {
    const decisionDay = UtcDay.ToUtcDay(decision);
    if (decisionDay === null) throw new Error(`Windowed aggregate ${spec.childEntity}: the decision date is not a valid date`);
    const d = decisionDay.getTime();
    const all = index.get(ownerKey.toLowerCase()) || [];
    const live = all.filter((c) => c.VoidedDay === null || c.VoidedDay.getTime() > d);
    if (spec.aggregate === 'active-at') {
      const active = live.filter((c) => c.Day.getTime() <= d && (c.EndDay === null || c.EndDay.getTime() >= d));
      return { Value: active.length, Contributors: active };
    }
    const from = spec.windowDays === null ? Number.NEGATIVE_INFINITY : d - spec.windowDays * MS_PER_DAY;
    const inWindow = live.filter((c) => c.Day.getTime() > from && c.Day.getTime() <= d);
    switch (spec.aggregate) {
      case 'count': return { Value: inWindow.length, Contributors: inWindow };
      case 'sum': return { Value: WindowedAggregates.numericValues(inWindow, spec).reduce((s, n) => s + n, 0), Contributors: inWindow };
      case 'mean': {
        const numbers = WindowedAggregates.numericValues(inWindow, spec);
        return { Value: numbers.length > 0 ? numbers.reduce((s, n) => s + n, 0) / numbers.length : null, Contributors: inWindow };
      }
      case 'distinct': return { Value: new Set(inWindow.map((c) => String(c.Value))).size, Contributors: inWindow };
      case 'days-since': {
        const latest = inWindow[inWindow.length - 1];
        return { Value: latest ? Math.round((d - latest.Day.getTime()) / MS_PER_DAY) : null, Contributors: latest ? [latest] : [] };
      }
    }
  }

  /**
   * The numbers a sum or mean reads: a missing value (null, undefined or a blank string) is skipped so it neither adds
   * nor counts in a mean's denominator. A number is a finite number or a non-blank string that parses to one; any
   * other present value (a date, a boolean, text) refuses, so it is never silently dropped or read as epoch ms / 1 / 0.
   */
  private static numericValues(rows: readonly ChildRow[], spec: WindowedAggregateSource): number[] {
    const out: number[] = [];
    for (const c of rows) {
      const v = c.Value;
      if (v === null || v === undefined || (typeof v === 'string' && v.trim() === '')) continue;
      const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : Number.NaN;
      if (!Number.isFinite(n)) {
        throw new AssemblyRefused({ kind: 'non-numeric-in-numeric-column', column: `${spec.childEntity}.${spec.valueField}`, sampleValue: String(v) });
      }
      out.push(n);
    }
    return out;
  }
}
