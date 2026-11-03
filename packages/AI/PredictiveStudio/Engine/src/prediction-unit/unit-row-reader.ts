/**
 * @module prediction-unit/unit-row-reader
 *
 * Reads a Prediction Unit's rows: one per grain record, or one per grain record × period. Each row gets its
 * decision date, outcome window end, group key, period and label. Rows are excluded — and counted — in this order:
 * censored (window ends after the cutoff), label known at the decision (next-period rule: the outcome was recorded
 * on or before the decision date), outcome inside the gap (the next period or a child event falls after the decision
 * date and on or before the window start, so it was settled before the window opened), empty label. Exact duplicates
 * of (entity key, decision date, period) are removed and counted. A next-period label reads only the rows the unit's
 * filter keeps, and two kept rows at one (grain key, period index) refuse the read. The source is read completely or
 * the read is refused.
 */
import { OrdinalCompare } from '@memberjunction/global';
import { UtcDay, type CellValue, TaskTypeRules, PredictionUnit, type LabelRule, type PredictionUnitSpec, type ReadPolicy, type RowFilter, type TaskType, type TrainingRefusal, type UnitRefusal, type UnitResolutionCounts, type UnitRows } from '@memberjunction/predictive-studio-core';
import type { ICountingDataAccess, SourceRow } from '../feature-assembly/data-access';
import { CompleteReader } from '../feature-assembly/read-policy';
import type { AssemblyEntityInfo, IAssemblyMetadata } from '../feature-assembly/assembly-metadata';
import type { AssemblyRowRef } from '../feature-assembly/as-of/as-of-assembler';

export type CanonicalLabelValue = string | number;

export interface UnitRow {
  readonly RowID: string;
  readonly EntityKey: string;
  readonly DecisionDate: Date;
  readonly WindowEnd: Date;
  /** The row's group: its value of the unit's group key field, or its entity key when the unit declares none (lower-cased). */
  readonly GroupKey: string;
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
  /**
   * True only for a read whose rows become a series history at scoring: rows whose outcome window has not closed by the
   * cutoff are kept instead of censored, because a lag reads the period's recorded value, not a resolved label, and
   * training read every earlier period's value. A read that trains or labels never sets it.
   */
  readonly KeepOpenWindows?: boolean;
}

export type UnitRowReadResult =
  | { readonly Status: 'read'; readonly Rows: readonly UnitRow[]; readonly Counts: UnitResolutionCounts; readonly DataCutoff: Date; readonly RowEntity: AssemblyEntityInfo }
  | { readonly Status: 'refused'; readonly Refusal: TrainingRefusal };

/** A row's label, or why it has none: known at the decision, or the outcome fell inside the gap before the window. */
type ResolvedLabel =
  | { readonly Kind: 'label'; readonly Label: CanonicalLabelValue | null }
  | { readonly Kind: 'known-at-decision' }
  | { readonly Kind: 'outcome-in-gap' };
type Labeler = (row: SourceRow, entityKey: string, decision: Date, windowStart: Date, windowEnd: Date) => ResolvedLabel;
interface ResolvedRows { readonly Rows: UnitRow[]; readonly Censored: number; readonly LabelKnown: number; readonly GapOutcome: number; readonly EmptyLabel: number }

export class PredictionUnitRowReader {
  /** Labels in one canonical form: classes are trimmed strings (booleans → '1'/'0'); numeric tasks are numbers. Empty → null. */
  public static CanonicalLabel(value: CellValue, task: TaskType): CanonicalLabelValue | null {
    if (value === null || value === undefined) return null;
    if (TaskTypeRules.IsClassificationTask(task)) return TaskTypeRules.ClassLabel(value);
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

  /** True for a cell with no value: null, undefined or the empty string. */
  private static isEmptyCell(value: CellValue): boolean {
    return value === null || value === undefined || value === '';
  }

  /** A summed child-event value: an empty cell adds 0; a value that is not a number fails instead of making the label NaN. */
  private static requireEventValue(value: CellValue, what: string): number {
    if (PredictionUnitRowReader.isEmptyCell(value)) return 0;
    const n = Number(value);
    if (!Number.isFinite(n)) throw new Error(`PredictionUnitRowReader: ${what} is not a number`);
    return n;
  }

  /**
   * A row's period index as an integer. `Number()` coerces an absent index (null, '') to 0, which would label the row
   * against the entity's first period, so an absent or non-integer index fails loudly instead.
   */
  private static requirePeriodIndex(value: CellValue, what: string): number {
    if (PredictionUnitRowReader.isEmptyCell(value)) throw new Error(`PredictionUnitRowReader: ${what} is empty`);
    const idx = Number(value);
    if (!Number.isInteger(idx)) throw new Error(`PredictionUnitRowReader: ${what} is not an integer`);
    return idx;
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
    const candidates = read.Rows.filter((r) => PredictionUnitRowReader.MatchesRowFilters(r, unit.rows.filter));
    const labeler = await this.buildLabeler(unit, rowEntity, candidates, deps);
    if ('Status' in labeler) return labeler;

    const undated = candidates.filter((r) => this.decisionDate(unit, r) === null).length;
    if (undated > 0) return PredictionUnitRowReader.unitRefusal({ kind: 'missing-decision-date', entity: rowEntity.Name, rows: undated });
    // A grain row's series period is its time column (a grain × periods row's is its period date, checked above).
    const timeColumn = unit.temporal && unit.rows.kind === 'grain' ? unit.temporal.timeColumn : null;
    const unperiodic = timeColumn === null ? 0 : candidates.filter((r) => UtcDay.ToUtcDay(r[timeColumn]) === null).length;
    if (timeColumn !== null && unperiodic > 0) return PredictionUnitRowReader.unitRefusal({ kind: 'missing-period', entity: rowEntity.Name, field: timeColumn, rows: unperiodic });

    const resolved = this.resolveRows(unit, rowEntity, candidates, deps.KeepOpenWindows === true ? null : cutoff, labeler);
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
        gapOutcomeRowsExcluded: resolved.GapOutcome,
        emptyLabelRowsExcluded: resolved.EmptyLabel,
        duplicateRowsRemoved: resolved.Rows.length - rows.length,
        resolvedRows: rows.length,
        dataCutoff: UtcDay.UtcDayIso(cutoff),
      },
    };
  }

  /**
   * Applies the exclusions in their documented order — censored, label known at the decision, outcome inside the gap,
   * empty label — and
   * builds the unit rows, sorted by decision date then row id (ordinal). A null `cutoff` censors nothing.
   */
  private resolveRows(unit: PredictionUnitSpec, rowEntity: AssemblyEntityInfo, candidates: readonly SourceRow[], cutoff: Date | null, labeler: Labeler): ResolvedRows {
    let censored = 0;
    let labelKnown = 0;
    let gapOutcome = 0;
    let emptyLabel = 0;
    const resolved: UnitRow[] = [];
    for (const row of candidates) {
      const rowId = PredictionUnitRowReader.requireKey(row[rowEntity.PrimaryKey], `${rowEntity.Name}.${rowEntity.PrimaryKey}`);
      const decision = PredictionUnitRowReader.requireDay(this.decisionDate(unit, row), `decision date of ${rowEntity.Name} ${rowId}`);
      const windowStart = UtcDay.AddUtcDays(decision, unit.label.gapDays);
      const windowEnd = UtcDay.AddUtcDays(windowStart, unit.label.windowDays);
      if (cutoff !== null && windowEnd.getTime() > cutoff.getTime()) { censored++; continue; }
      const ref = PredictionUnitRowReader.UnitRowRef(unit, rowEntity, row, decision);
      const label = labeler(row, ref.EntityKey, decision, windowStart, windowEnd);
      if (label.Kind === 'known-at-decision') { labelKnown++; continue; }
      if (label.Kind === 'outcome-in-gap') { gapOutcome++; continue; }
      if (label.Label === null) { emptyLabel++; continue; }
      resolved.push({
        ...ref,
        WindowEnd: windowEnd,
        GroupKey: unit.groupKey ? PredictionUnitRowReader.requireKey(row[unit.groupKey], `${rowEntity.Name}.${unit.groupKey} of ${rowId}`).toLowerCase() : ref.EntityKey.toLowerCase(),
        Label: label.Label,
        Source: row,
      });
    }
    resolved.sort((a, b) => a.DecisionDate.getTime() - b.DecisionDate.getTime() || OrdinalCompare(a.RowID, b.RowID));
    return { Rows: resolved, Censored: censored, LabelKnown: labelKnown, GapOutcome: gapOutcome, EmptyLabel: emptyLabel };
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
    return PredictionUnitRowReader.UnitDecisionDate(unit, row);
  }

  /**
   * A row as the assembly reads it, by the one rule training and scoring share: its key (the primary key), its entity
   * key (the key itself for a grain unit, else the grain foreign key), the given decision day and its period (the
   * period date of a grain × periods unit, else the Temporal Spec's time column, else null). Keys read as text; a date
   * key reads as its UTC day.
   */
  public static UnitRowRef(unit: PredictionUnitSpec, rowEntity: AssemblyEntityInfo, row: SourceRow, decision: Date): AssemblyRowRef {
    const rowId = PredictionUnitRowReader.requireKey(row[rowEntity.PrimaryKey], `${rowEntity.Name}.${rowEntity.PrimaryKey}`);
    const entityKey = unit.rows.kind === 'grain' ? rowId : PredictionUnitRowReader.requireKey(row[unit.rows.foreignKey], `${rowEntity.Name}.${unit.rows.foreignKey} of ${rowId}`);
    const period = unit.rows.kind === 'grain-x-periods' ? UtcDay.ToUtcDay(row[unit.rows.periodDate]) : unit.temporal ? UtcDay.ToUtcDay(row[unit.temporal.timeColumn]) : null;
    return { RowID: rowId, EntityKey: entityKey, DecisionDate: decision, Period: period };
  }

  /**
   * A row's decision day by the unit's rule: the period date of a grain × periods unit, else the decision-date column
   * (offset when the rule says so) or the fixed date. Null when the row has no date there. Training and scoring both
   * date their rows with it.
   */
  public static UnitDecisionDate(unit: PredictionUnitSpec, row: SourceRow): Date | null {
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

  /** `keptRows` are the rows the unit's filter keeps; a next-period label reads only them. */
  private async buildLabeler(unit: PredictionUnitSpec, rowEntity: AssemblyEntityInfo, keptRows: readonly SourceRow[], deps: UnitReadDeps): Promise<Labeler | UnitRowReadResult> {
    const rule: LabelRule = unit.label.rule;
    switch (rule.kind) {
      case 'column':
        if (!rowEntity.Fields.some((f) => f.Name === rule.column)) return PredictionUnitRowReader.unitRefusal({ kind: 'unresolved-reference', entity: rowEntity.Name, field: rule.column });
        return (row) => ({ Kind: 'label', Label: PredictionUnitRowReader.CanonicalLabel(row[rule.column], unit.label.outcome) });
      case 'next-period':
        if (unit.rows.kind !== 'grain-x-periods') return PredictionUnitRowReader.unitRefusal({ kind: 'unresolved-reference', entity: rowEntity.Name, field: rule.periodIndexField });
        return this.nextPeriodLabeler(rule, unit.rows, rowEntity, keptRows);
      case 'child-event':
        return this.childEventLabeler(rule, unit.label.outcome, deps);
    }
  }

  /**
   * next-period: 1 when the period `offset` later falls in the window; label known when it is on or before the decision;
   * the row is excluded when it falls inside the gap (after the decision, on or before the window start). Only the
   * kept rows are indexed, and two of them at one (grain key, period index) refuse the read: the label would otherwise
   * depend on which of them was read last.
   */
  private nextPeriodLabeler(rule: Extract<LabelRule, { kind: 'next-period' }>, unitRows: Extract<UnitRows, { kind: 'grain-x-periods' }>, rowEntity: AssemblyEntityInfo, keptRows: readonly SourceRow[]): Labeler | UnitRowReadResult {
    const byKey = new Map<string, Map<number, Date>>();
    for (const r of keptRows) {
      // A row without an index is never a "next period"; it is not indexed (a candidate without one fails when labelled).
      if (PredictionUnitRowReader.isEmptyCell(r[rule.periodIndexField])) continue;
      const idx = Number(r[rule.periodIndexField]);
      const d = UtcDay.ToUtcDay(r[unitRows.periodDate]);
      if (!Number.isInteger(idx) || d === null) continue;
      const k = PredictionUnitRowReader.keyOf(r[unitRows.foreignKey]);
      const m = byKey.get(k) || new Map<number, Date>();
      if (m.has(idx)) {
        const entityKey = PredictionUnitRowReader.requireKey(r[unitRows.foreignKey], `${rowEntity.Name}.${unitRows.foreignKey}`);
        return PredictionUnitRowReader.unitRefusal({ kind: 'duplicate-period-index', entity: rowEntity.Name, field: rule.periodIndexField, entityKey, periodIndex: idx });
      }
      m.set(idx, d);
      byKey.set(k, m);
    }
    return (row, entityKey, decision, windowStart, windowEnd) => {
      const rowId = PredictionUnitRowReader.requireKey(row[rowEntity.PrimaryKey], `${rowEntity.Name}.${rowEntity.PrimaryKey}`);
      const idx = PredictionUnitRowReader.requirePeriodIndex(row[rule.periodIndexField], `${rowEntity.Name}.${rule.periodIndexField} of ${rowId}`);
      const next = byKey.get(entityKey.toLowerCase())?.get(idx + rule.offset);
      if (next === undefined) return { Kind: 'label', Label: '0' };
      if (next.getTime() <= decision.getTime()) return { Kind: 'known-at-decision' };
      if (next.getTime() <= windowStart.getTime()) return { Kind: 'outcome-in-gap' };
      return { Kind: 'label', Label: next.getTime() <= windowEnd.getTime() ? '1' : '0' };
    };
  }

  /**
   * child-event: exists / count / sum of the owner's child events inside the window. A row with an event inside the
   * gap (after the decision, on or before the window start) is excluded: its outcome happened before the window opened.
   */
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
      const value = rule.valueField
        ? PredictionUnitRowReader.requireEventValue(r[rule.valueField], `${child.Name}.${rule.valueField} of ${PredictionUnitRowReader.keyOf(r[child.PrimaryKey])}`)
        : 1;
      list.push({ Day: d, Value: value });
      events.set(k, list);
    }
    return (row, entityKey, decision, windowStart, windowEnd) => {
      const owner = rule.ownerKeyField ? PredictionUnitRowReader.keyOf(row[rule.ownerKeyField]) : entityKey.toLowerCase();
      const ownerEvents = events.get(owner) || [];
      if (ownerEvents.some((e) => e.Day.getTime() > decision.getTime() && e.Day.getTime() <= windowStart.getTime())) return { Kind: 'outcome-in-gap' };
      const hits = ownerEvents.filter((e) => e.Day.getTime() > windowStart.getTime() && e.Day.getTime() <= windowEnd.getTime());
      if (rule.aggregate === 'exists') return { Kind: 'label', Label: PredictionUnitRowReader.CanonicalLabel(hits.length > 0 ? '1' : '0', task) };
      if (rule.aggregate === 'count') return { Kind: 'label', Label: hits.length };
      return { Kind: 'label', Label: hits.reduce((s, e) => s + e.Value, 0) };
    };
  }
}
