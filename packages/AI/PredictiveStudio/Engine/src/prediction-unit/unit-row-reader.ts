/**
 * @module prediction-unit/unit-row-reader
 *
 * Reads a Prediction Unit's rows: one per grain record, or one per grain record × period. Each row gets its
 * decision date, outcome window end, group key, period and label. Rows are excluded — and counted — in this order:
 * censored (window ends after the cutoff), label known at the decision (next-period rule: the outcome was recorded
 * on or before the decision date), empty label. Exact duplicates of (entity key, decision date, period) are removed
 * and counted. The source is read completely or the read is refused.
 */
import { OrdinalCompare } from '@memberjunction/global';
import { TaskTypeRules, PredictionUnit, type LabelRule, type PredictionUnitSpec, type ReadPolicy, type RowFilter, type TaskType, type TrainingRefusal, type UnitRefusal, type UnitResolutionCounts, type UnitRows } from '@memberjunction/predictive-studio-core';
import type { ICountingDataAccess, SourceRow } from '../feature-assembly/data-access';
import { CompleteReader } from '../feature-assembly/read-policy';
import type { AssemblyEntityInfo, IAssemblyMetadata } from '../feature-assembly/assembly-metadata';
import { UtcDay, type CellValue } from './utc-day';

export type CanonicalLabelValue = string | number;

export interface UnitRow {
  readonly RowId: string;
  readonly EntityKey: string;
  readonly DecisionDate: Date;
  readonly WindowEnd: Date;
  readonly GroupKey: string | null;
  readonly Period: Date | null;
  readonly Label: CanonicalLabelValue;
  readonly Source: SourceRow;
}

export interface UnitReadDeps {
  readonly DataAccess: ICountingDataAccess;
  readonly Metadata: IAssemblyMetadata;
  readonly Read: ReadPolicy;
  /** The clock for `cutoff.kind = 'now'` (injected so tests are deterministic). */
  readonly Now: Date;
}

export type UnitRowReadResult =
  | { readonly Status: 'read'; readonly Rows: readonly UnitRow[]; readonly Counts: UnitResolutionCounts; readonly DataCutoff: Date; readonly RowEntity: AssemblyEntityInfo }
  | { readonly Status: 'refused'; readonly Refusal: TrainingRefusal };

interface ResolvedLabel { readonly Label: CanonicalLabelValue | null; readonly Known: boolean }
type Labeler = (row: SourceRow, entityKey: string, decision: Date, windowStart: Date, windowEnd: Date) => ResolvedLabel;
interface ResolvedRows { readonly Rows: UnitRow[]; readonly Censored: number; readonly LabelKnown: number; readonly EmptyLabel: number }

export class PredictionUnitRowReader {
  /** Labels in one canonical form: classes are trimmed strings (booleans → '1'/'0'); numeric tasks are numbers. Empty → null. */
  public static CanonicalLabel(value: CellValue, task: TaskType): CanonicalLabelValue | null {
    if (value === null || value === undefined) return null;
    if (TaskTypeRules.IsClassificationTask(task)) {
      if (typeof value === 'boolean') return value ? '1' : '0';
      if (typeof value === 'number') return Number.isFinite(value) ? String(value) : null;
      if (value instanceof Date) return UtcDay.UtcDayIso(value);
      const t = value.trim();
      return t.length === 0 ? null : t;
    }
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (value instanceof Date) return null;
    const t = value.trim();
    if (t.length === 0) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : t;
  }

  /** In-memory filter (no SQL is built from unit JSON). */
  public static MatchesRowFilters(row: SourceRow, filters: readonly RowFilter[]): boolean {
    return filters.every((f) => {
      const v = row[f.field];
      const s = v instanceof Date ? UtcDay.UtcDayIso(v) : v;
      switch (f.op) {
        case 'not-null': return s !== null && s !== undefined && s !== '';
        case 'is-null': return s === null || s === undefined || s === '';
        case 'eq': return s === f.values[0] || String(s) === String(f.values[0]);
        case 'neq': return !(s === f.values[0] || String(s) === String(f.values[0]));
        case 'in': return f.values.some((x) => s === x || String(s) === String(x));
      }
    });
  }

  private static unitRefusal(reason: UnitRefusal): UnitRowReadResult {
    return { Status: 'refused', Refusal: { stage: 'unit', reason } };
  }

  /** A day that the code path guarantees (validated date strings, Dates, rows already checked for a decision date). */
  private static requireDay(day: Date | null, what: string): Date {
    if (day === null) throw new Error(`PredictionUnitRowReader: ${what} is not a date`);
    return day;
  }

  /**
   * A row's key value as a string. An absent key would otherwise be coerced to the literal string "undefined"/"null"
   * and group unrelated rows under one fake entity, so it fails loudly instead.
   */
  private static requireKey(value: CellValue, what: string): string {
    if (value === null || value === undefined || value === '') throw new Error(`PredictionUnitRowReader: ${what} is empty`);
    return value instanceof Date ? UtcDay.UtcDayIso(value) : String(value);
  }

  /** Lower-cased key for in-memory matching. `??` keeps a legitimate 0/false key value; only null/undefined become ''. */
  private static keyOf(v: CellValue): string {
    return (v instanceof Date ? UtcDay.UtcDayIso(v) : String(v ?? '')).toLowerCase();
  }

  public async Read(unit: PredictionUnitSpec, deps: UnitReadDeps): Promise<UnitRowReadResult> {
    const rowEntityName = PredictionUnit.UnitRowEntityName(unit.rows);
    const rowEntity = deps.Metadata.Entity(rowEntityName);
    if (!rowEntity) return PredictionUnitRowReader.unitRefusal({ kind: 'unresolved-reference', entity: rowEntityName, field: null });
    if (!deps.Metadata.Entity(unit.rows.grainEntity)) return PredictionUnitRowReader.unitRefusal({ kind: 'unresolved-reference', entity: unit.rows.grainEntity, field: null });

    const read = await CompleteReader.ReadCompletely(deps.DataAccess, { EntityName: rowEntity.Name, KeyField: rowEntity.PrimaryKey }, deps.Read);
    if (read.Status === 'refused') return { Status: 'refused', Refusal: { stage: 'assembly', reason: read.Refusal } };

    const cutoff = await this.resolveCutoff(unit, deps);
    if ('Status' in cutoff) return cutoff;
    const labeler = await this.buildLabeler(unit, rowEntity, read.Rows, deps);
    if ('Status' in labeler) return labeler;

    const candidates = read.Rows.filter((r) => PredictionUnitRowReader.MatchesRowFilters(r, unit.rows.filter));
    const undated = candidates.filter((r) => this.decisionDate(unit, r) === null).length;
    if (undated > 0) return PredictionUnitRowReader.unitRefusal({ kind: 'missing-decision-date', entity: rowEntity.Name, rows: undated });

    const resolved = this.resolveRows(unit, rowEntity, candidates, cutoff, labeler);
    const rows = this.removeDuplicates(resolved.Rows);
    return {
      Status: 'read',
      Rows: rows,
      DataCutoff: cutoff,
      RowEntity: rowEntity,
      Counts: {
        rowsRead: read.Rows.length,
        censoredRowsExcluded: resolved.Censored,
        labelKnownRowsExcluded: resolved.LabelKnown,
        emptyLabelRowsExcluded: resolved.EmptyLabel,
        duplicateRowsRemoved: resolved.Rows.length - rows.length,
        resolvedRows: rows.length,
        dataCutoff: UtcDay.UtcDayIso(cutoff),
      },
    };
  }

  /**
   * Applies the exclusions in their documented order — censored, label known at the decision, empty label — and
   * builds the unit rows, sorted by decision date then row id (ordinal).
   */
  private resolveRows(unit: PredictionUnitSpec, rowEntity: AssemblyEntityInfo, candidates: readonly SourceRow[], cutoff: Date, labeler: Labeler): ResolvedRows {
    let censored = 0;
    let labelKnown = 0;
    let emptyLabel = 0;
    const resolved: UnitRow[] = [];
    for (const row of candidates) {
      const rowId = PredictionUnitRowReader.requireKey(row[rowEntity.PrimaryKey], `${rowEntity.Name}.${rowEntity.PrimaryKey}`);
      const decision = PredictionUnitRowReader.requireDay(this.decisionDate(unit, row), `decision date of ${rowEntity.Name} ${rowId}`);
      const windowStart = UtcDay.AddUtcDays(decision, unit.label.gapDays);
      const windowEnd = UtcDay.AddUtcDays(windowStart, unit.label.windowDays);
      if (windowEnd.getTime() > cutoff.getTime()) { censored++; continue; }
      const entityKey = unit.rows.kind === 'grain' ? rowId : PredictionUnitRowReader.requireKey(row[unit.rows.foreignKey], `${rowEntity.Name}.${unit.rows.foreignKey} of ${rowId}`);
      const label = labeler(row, entityKey, decision, windowStart, windowEnd);
      if (label.Known) { labelKnown++; continue; }
      if (label.Label === null) { emptyLabel++; continue; }
      resolved.push({
        RowId: rowId,
        EntityKey: entityKey,
        DecisionDate: decision,
        WindowEnd: windowEnd,
        GroupKey: unit.groupKey ? PredictionUnitRowReader.keyOf(row[unit.groupKey]) : entityKey.toLowerCase(),
        Period: unit.rows.kind === 'grain-x-periods' ? decision : unit.temporal ? UtcDay.ToUtcDay(row[unit.temporal.timeColumn]) : null,
        Label: label.Label,
        Source: row,
      });
    }
    resolved.sort((a, b) => a.DecisionDate.getTime() - b.DecisionDate.getTime() || OrdinalCompare(a.RowId, b.RowId));
    return { Rows: resolved, Censored: censored, LabelKnown: labelKnown, EmptyLabel: emptyLabel };
  }

  /** Keeps the first row of each (entity key, decision date, period); the caller counts the rest as duplicates. */
  private removeDuplicates(resolved: readonly UnitRow[]): UnitRow[] {
    const seen = new Set<string>();
    const rows: UnitRow[] = [];
    for (const r of resolved) {
      const k = `${r.EntityKey.toLowerCase()}|${UtcDay.UtcDayIso(r.DecisionDate)}|${r.Period ? UtcDay.UtcDayIso(r.Period) : ''}`;
      if (seen.has(k)) continue;
      seen.add(k);
      rows.push(r);
    }
    return rows;
  }

  private decisionDate(unit: PredictionUnitSpec, row: SourceRow): Date | null {
    if (unit.rows.kind === 'grain-x-periods') return UtcDay.ToUtcDay(row[unit.rows.periodDate]);
    const rule = unit.rows.decisionDate;
    switch (rule.kind) {
      case 'column': return UtcDay.ToUtcDay(row[rule.column]);
      case 'column-offset': {
        const d = UtcDay.ToUtcDay(row[rule.column]);
        return d === null ? null : UtcDay.AddUtcDays(d, rule.offsetDays);
      }
      case 'fixed': return UtcDay.ToUtcDay(rule.date);
    }
  }

  private async resolveCutoff(unit: PredictionUnitSpec, deps: UnitReadDeps): Promise<Date | UnitRowReadResult> {
    const cutoff = unit.censoring.cutoff;
    if (cutoff.kind === 'now') return PredictionUnitRowReader.requireDay(UtcDay.ToUtcDay(deps.Now), 'the current day');
    if (cutoff.kind === 'fixed') return PredictionUnitRowReader.requireDay(UtcDay.ToUtcDay(cutoff.at), `the fixed cutoff ${cutoff.at}`);
    const entity = deps.Metadata.Entity(cutoff.entity);
    // The field name comes from unit JSON; it is used in SQL text only after it matched a metadata field name.
    if (!entity || !entity.Fields.some((f) => f.Name === cutoff.field)) return PredictionUnitRowReader.unitRefusal({ kind: 'unresolved-reference', entity: cutoff.entity, field: cutoff.field });
    const res = await deps.DataAccess.fetchRows({ EntityName: entity.Name, Fields: [cutoff.field], ExtraFilter: `[${cutoff.field}] IS NOT NULL`, OrderBy: `[${cutoff.field}] DESC`, MaxRows: 1 });
    if (!res.Success) throw new Error(`Reading the corpus end from ${entity.Name}.${cutoff.field} failed: ${res.ErrorMessage || 'unknown error'}`);
    const end = res.Rows.length > 0 ? UtcDay.ToUtcDay(res.Rows[0][cutoff.field]) : null;
    if (end === null) return PredictionUnitRowReader.unitRefusal({ kind: 'unresolved-reference', entity: cutoff.entity, field: cutoff.field });
    return end;
  }

  private async buildLabeler(unit: PredictionUnitSpec, rowEntity: AssemblyEntityInfo, rows: readonly SourceRow[], deps: UnitReadDeps): Promise<Labeler | UnitRowReadResult> {
    const rule: LabelRule = unit.label.rule;
    switch (rule.kind) {
      case 'column':
        if (!rowEntity.Fields.some((f) => f.Name === rule.column)) return PredictionUnitRowReader.unitRefusal({ kind: 'unresolved-reference', entity: rowEntity.Name, field: rule.column });
        return (row) => ({ Label: PredictionUnitRowReader.CanonicalLabel(row[rule.column], unit.label.outcome), Known: false });
      case 'next-period':
        if (unit.rows.kind !== 'grain-x-periods') return PredictionUnitRowReader.unitRefusal({ kind: 'unresolved-reference', entity: rowEntity.Name, field: rule.periodIndexField });
        return this.nextPeriodLabeler(rule, unit.rows, rows);
      case 'child-event':
        return this.childEventLabeler(rule, unit.label.outcome, deps);
    }
  }

  /** next-period: 1 when the period `offset` later falls in the window; label known when it is on or before the decision. */
  private nextPeriodLabeler(rule: Extract<LabelRule, { kind: 'next-period' }>, unitRows: Extract<UnitRows, { kind: 'grain-x-periods' }>, rows: readonly SourceRow[]): Labeler {
    const byKey = new Map<string, Map<number, Date>>();
    for (const r of rows) {
      const idx = Number(r[rule.periodIndexField]);
      const d = UtcDay.ToUtcDay(r[unitRows.periodDate]);
      if (!Number.isInteger(idx) || d === null) continue;
      const k = PredictionUnitRowReader.keyOf(r[unitRows.foreignKey]);
      const m = byKey.get(k) || new Map<number, Date>();
      m.set(idx, d);
      byKey.set(k, m);
    }
    return (row, entityKey, decision, windowStart, windowEnd) => {
      const next = byKey.get(entityKey.toLowerCase())?.get(Number(row[rule.periodIndexField]) + rule.offset);
      if (next !== undefined && next.getTime() <= decision.getTime()) return { Label: null, Known: true };
      const inWindow = next !== undefined && next.getTime() > windowStart.getTime() && next.getTime() <= windowEnd.getTime();
      return { Label: inWindow ? '1' : '0', Known: false };
    };
  }

  /** child-event: exists / count / sum of the owner's child events inside the window. */
  private async childEventLabeler(rule: Extract<LabelRule, { kind: 'child-event' }>, task: TaskType, deps: UnitReadDeps): Promise<Labeler | UnitRowReadResult> {
    const child = deps.Metadata.Entity(rule.childEntity);
    if (!child) return PredictionUnitRowReader.unitRefusal({ kind: 'unresolved-reference', entity: rule.childEntity, field: null });
    const read = await CompleteReader.ReadCompletely(deps.DataAccess, { EntityName: child.Name, KeyField: child.PrimaryKey }, deps.Read);
    if (read.Status === 'refused') return { Status: 'refused', Refusal: { stage: 'assembly', reason: read.Refusal } };
    const events = new Map<string, { readonly Day: Date; readonly Value: number }[]>();
    for (const r of read.Rows) {
      if (!PredictionUnitRowReader.MatchesRowFilters(r, rule.filter)) continue;
      const d = UtcDay.ToUtcDay(r[rule.dateField]);
      if (d === null) continue;
      const k = PredictionUnitRowReader.keyOf(r[rule.foreignKey]);
      const list = events.get(k) || [];
      list.push({ Day: d, Value: rule.valueField ? Number(r[rule.valueField] || 0) : 1 });
      events.set(k, list);
    }
    return (row, entityKey, _decision, windowStart, windowEnd) => {
      const owner = rule.ownerKeyField ? PredictionUnitRowReader.keyOf(row[rule.ownerKeyField]) : entityKey.toLowerCase();
      const hits = (events.get(owner) || []).filter((e) => e.Day.getTime() > windowStart.getTime() && e.Day.getTime() <= windowEnd.getTime());
      if (rule.aggregate === 'exists') return { Label: PredictionUnitRowReader.CanonicalLabel(hits.length > 0 ? '1' : '0', task), Known: false };
      if (rule.aggregate === 'count') return { Label: hits.length, Known: false };
      return { Label: hits.reduce((s, e) => s + e.Value, 0), Known: false };
    };
  }
}
