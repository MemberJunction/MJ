/**
 * @module feature-assembly/as-of/as-of-assembler
 *
 * The one assembly function for training and scoring. Every value is read as of the row's decision day from a dated
 * source; every column is typed; refusals name what is wrong and there is no partial matrix. Values are read by key
 * through the same functions in both contexts, so a row assembled for training and for scoring at the same decision
 * date is identical.
 *
 * "As of the decision day" means everything recorded on or before that UTC day: a change or an effective date counts
 * when it falls before the start of the following day.
 *
 * System timestamp columns: `__mj_CreatedAt` and `__mj_UpdatedAt` are requested only when the entity's metadata lists
 * them (entities mapped from external schemas may have neither). Without `__mj_CreatedAt`, an immutable field's
 * provenance carries the record key only (version `immutable-after-create`, computed at the assembly time); without
 * `__mj_UpdatedAt`, a windowed aggregate's version hashes the IDs of the child rows it read.
 */
import { createHash } from 'node:crypto';
import type {
  AssemblyRefusal, ChangeHistoryCoverage, ColumnEncoding, ColumnEncodingKind, ColumnProvenance, FeatureColumnSpec, FeatureVersionPin,
  PredictionUnitSpec, PreprocessingOp, ReadPolicy, UncoveredRowsCount, ValueProvenance, WindowedAggregateSource,
} from '@memberjunction/predictive-studio-core';
import { EscapeSQLString } from '@memberjunction/global';
import type { ICountingDataAccess, SourceRow } from '../data-access';
import type { AssemblyEntityInfo, IAssemblyMetadata } from '../assembly-metadata';
import type { FeatureAssemblyResult } from '../feature-assembly-executor';
import { CompleteReader } from '../read-policy';
import { KeyedReader } from './read-by-keys';
import { RecordHistory, type EntityHistory, type IRecordHistoryReader } from './record-history';
import { AssemblyRefused } from './refusal';
import { WindowedAggregates, type ChildRow, type ChildRowIndex } from './windowed-aggregate';
import { SeriesFeatures, type SeriesHistory } from './series-features';
import { UtcDay, MS_PER_DAY, type CellValue } from '../../prediction-unit/utc-day';

/** One unit row to assemble: its id, its entity key, the day it is decided on and (for period units) its period. */
export interface AssemblyRowRef { readonly RowId: string; readonly EntityKey: string; readonly DecisionDate: Date; readonly Period: Date | null }
/** One raw matrix value; preprocessing (imputation, one-hot) is fitted by the sidecar, never here. */
export type MatrixCell = string | number | null;
/** One matrix column: a feature can produce several (date parts). `Encoding` is `numeric` or `categorical`. */
export interface AssembledColumn { readonly Name: string; readonly Encoding: ColumnEncodingKind; readonly SourceColumn: string; readonly FeatureName: string }
/** One assembled row: its values in column order and the provenance of each feature's value. */
export interface AssembledRow { readonly RowId: string; readonly Values: readonly MatrixCell[]; readonly Provenance: readonly ValueProvenance[] }

export interface AsOfAssemblyInput {
  readonly Context: 'train' | 'score';
  readonly Unit: PredictionUnitSpec;
  readonly RowEntity: AssemblyEntityInfo;
  readonly Rows: readonly AssemblyRowRef[];
  readonly Features: readonly FeatureColumnSpec[];
  readonly SeriesHistory: SeriesHistory | null;
  readonly Read: ReadPolicy;
  readonly DataAccess: ICountingDataAccess;
  readonly History: IRecordHistoryReader;
  readonly Metadata: IAssemblyMetadata;
  readonly AssembledAt: Date;
  readonly ExplicitOps?: readonly PreprocessingOp[];
}

export type AsOfAssemblyResult =
  | {
      readonly Status: 'assembled';
      readonly Columns: readonly AssembledColumn[];
      readonly Rows: readonly AssembledRow[];
      readonly ExcludedRowIds: ReadonlySet<string>;
      readonly UncoveredRowsExcluded: readonly UncoveredRowsCount[];
      readonly Coverage: readonly ChangeHistoryCoverage[];
      readonly Preprocessing: readonly PreprocessingOp[];
      readonly ColumnProvenance: readonly ColumnProvenance[];
    }
  | { readonly Status: 'refused'; readonly Refusal: AssemblyRefusal };

/** An assembled matrix (the successful outcome of {@link AsOfFeatureAssembler.Assemble}). */
export type AsOfAssembledMatrix = Extract<AsOfAssemblyResult, { Status: 'assembled' }>;

interface RawValue { readonly Value: CellValue; readonly Provenance: ValueProvenance }
interface Uncovered { readonly Uncovered: true; readonly Entity: string; readonly Field: string; readonly HistoryStart: string | null }
type FeatureReader = (row: AssemblyRowRef) => RawValue | Uncovered;
interface ColumnReader { readonly Spec: FeatureColumnSpec; readonly Read: FeatureReader }
type KeyOf = (row: AssemblyRowRef) => string | null;
type FieldSource = Extract<FeatureColumnSpec['source'], { kind: 'immutable-field' | 'record-changes' }>;
type FeatureValueSource = Extract<FeatureColumnSpec['source'], { kind: 'feature-value' }>;
type SeriesSource = Extract<FeatureColumnSpec['source'], { kind: 'series' }>;
type DateParts = Extract<ColumnEncoding, { kind: 'date-parts' }>['parts'];
interface UncoveredTally { readonly Entity: string; readonly Field: string; readonly HistoryStart: string | null; Rows: number }
interface AssembledRows { readonly Rows: AssembledRow[]; readonly Excluded: Set<string>; readonly Uncovered: UncoveredTally[] }

/** The Feature Value columns a pinned read selects. */
const FEATURE_VALUE_FIELDS = ['ID', 'RecordID', 'EffectiveAsOf', 'ComputedAt', 'ValueNumeric', 'ValueText', 'ValueBoolean', 'ValueDate'];

export class AsOfFeatureAssembler {
  /** Impute (with a missing indicator) every column, one-hot every categorical, then the pipeline's explicit ops. */
  public static BuildPreprocessingOps(columns: readonly AssembledColumn[], features: readonly FeatureColumnSpec[], explicit: readonly PreprocessingOp[] = []): PreprocessingOp[] {
    const ops: PreprocessingOp[] = [];
    const byFeature = new Map(features.map((f) => [f.name, f]));
    for (const c of columns) {
      const f = byFeature.get(c.FeatureName);
      if (!f) continue;
      const fill = f.missing.impute === 'constant' && f.missing.constant !== null ? { fillValue: f.missing.constant } : {};
      ops.push({ op: 'impute', col: c.Name, strategy: f.missing.impute, ...fill, indicator: f.missing.indicator });
      if (c.Encoding === 'categorical') ops.push({ op: 'onehot', col: c.Name });
    }
    return [...ops, ...explicit];
  }

  /**
   * Adapter for the training step and the sidecar request: matrix + schema + preprocessing. With `labels` the label is
   * appended as `labelColumn` (training); with null no label column is added (scoring).
   */
  public static ToFeatureAssemblyResult(assembled: AsOfAssembledMatrix, labels: ReadonlyMap<string, string | number> | null, labelColumn: string): FeatureAssemblyResult {
    const names = assembled.Columns.map((c) => c.Name);
    return {
      matrix: {
        columns: labels === null ? names : [...names, labelColumn],
        // `??`: a label of 0 is a real label (count tasks); only a missing one becomes null.
        rows: assembled.Rows.map((r) => (labels === null ? [...r.Values] : [...r.Values, labels.get(r.RowId) ?? null])),
      },
      featureSchema: assembled.Columns.map((c) => ({ Name: c.Name, Kind: c.Encoding === 'categorical' ? 'categorical' : 'numeric' })),
      preprocessing: [...assembled.Preprocessing],
    };
  }

  /** Assembles the dated matrix, or the first refusal met (caught with `instanceof`, never by message). */
  public async Assemble(input: AsOfAssemblyInput): Promise<AsOfAssemblyResult> {
    try {
      return await this.assemble(input);
    } catch (e) {
      if (e instanceof AssemblyRefused) return { Status: 'refused', Refusal: e.Refusal };
      throw e;
    }
  }

  private async assemble(input: AsOfAssemblyInput): Promise<AsOfAssemblyResult> {
    const coverage: ChangeHistoryCoverage[] = [];
    const readers = await this.buildReaders(input, coverage);
    const columns = readers.flatMap((r) => this.columnsFor(r.Spec));
    const assembled = this.assembleRows(input, readers);
    const first = assembled.Uncovered[0];
    if (input.Unit.history.onUncoveredRow === 'refuse' && first) {
      throw new AssemblyRefused({ kind: 'decision-date-before-change-history', entity: first.Entity, field: first.Field, historyStart: first.HistoryStart, rowsAffected: first.Rows });
    }
    return {
      Status: 'assembled',
      Columns: columns,
      Rows: assembled.Rows,
      ExcludedRowIds: assembled.Excluded,
      UncoveredRowsExcluded: assembled.Uncovered.map((u) => ({ entity: u.Entity, field: u.Field, rows: u.Rows })),
      Coverage: coverage,
      Preprocessing: AsOfFeatureAssembler.BuildPreprocessingOps(columns, input.Features, input.ExplicitOps || []),
      ColumnProvenance: readers.map((r) => ({
        column: r.Spec.name, source: r.Spec.source.kind, sourceRef: AsOfFeatureAssembler.describeSource(r.Spec), sourceVersion: AsOfFeatureAssembler.columnVersion(r.Spec, input, coverage),
      })),
    };
  }

  /** One dated reader per non-identifier column; record-changes readers append their coverage. */
  private async buildReaders(input: AsOfAssemblyInput, coverage: ChangeHistoryCoverage[]): Promise<ColumnReader[]> {
    const readers: ColumnReader[] = [];
    for (const spec of input.Features) {
      if (spec.encoding.kind === 'identifier') continue;
      readers.push({ Spec: spec, Read: await this.readerFor(spec, input, coverage) });
    }
    return readers;
  }

  /**
   * Reads every row through every reader. A row with an uncovered value is excluded and counted per entity/field (in
   * the order first met), so the `refuse` policy can name the first one with its row count.
   */
  private assembleRows(input: AsOfAssemblyInput, readers: readonly ColumnReader[]): AssembledRows {
    const out: AssembledRows = { Rows: [], Excluded: new Set<string>(), Uncovered: [] };
    const tallies = new Map<string, UncoveredTally>();
    for (const row of input.Rows) {
      const values: MatrixCell[] = [];
      const provenance: ValueProvenance[] = [];
      let uncovered: Uncovered | null = null;
      for (const r of readers) {
        const raw = r.Read(row);
        if ('Uncovered' in raw) { uncovered = raw; break; }
        values.push(...this.encode(r.Spec, raw.Value, row.DecisionDate));
        provenance.push(raw.Provenance);
      }
      if (uncovered === null) {
        out.Rows.push({ RowId: row.RowId, Values: values, Provenance: provenance });
        continue;
      }
      out.Excluded.add(row.RowId);
      AsOfFeatureAssembler.tally(tallies, out.Uncovered, uncovered);
    }
    return out;
  }

  /** Counts one uncovered row against its entity/field. */
  private static tally(tallies: Map<string, UncoveredTally>, ordered: UncoveredTally[], u: Uncovered): void {
    const k = `${u.Entity}|${u.Field}`;
    const existing = tallies.get(k);
    if (existing) { existing.Rows++; return; }
    const created: UncoveredTally = { Entity: u.Entity, Field: u.Field, HistoryStart: u.HistoryStart, Rows: 1 };
    tallies.set(k, created);
    ordered.push(created);
  }

  private columnsFor(spec: FeatureColumnSpec): AssembledColumn[] {
    const source = AsOfFeatureAssembler.describeSource(spec);
    if (spec.encoding.kind === 'date-parts') {
      return spec.encoding.parts.map((p) => ({ Name: `${spec.name}__${p.replace(/-/g, '_')}`, Encoding: 'numeric', SourceColumn: source, FeatureName: spec.name }));
    }
    return [{ Name: spec.name, Encoding: spec.encoding.kind === 'boolean' ? 'numeric' : spec.encoding.kind, SourceColumn: source, FeatureName: spec.name }];
  }

  /** Typed encoding: no variant writes 0 for a value it cannot read; non-numeric text in a numeric column refuses. */
  private encode(spec: FeatureColumnSpec, value: CellValue, decision: Date): MatrixCell[] {
    const missing = value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
    switch (spec.encoding.kind) {
      case 'numeric': return [missing ? null : AsOfFeatureAssembler.numberOf(spec, value)];
      case 'boolean': return [missing ? null : AsOfFeatureAssembler.booleanOf(spec, value)];
      case 'categorical': return [missing ? null : value instanceof Date ? UtcDay.UtcDayIso(value) : String(value).trim()];
      case 'date-parts': return this.encodeDateParts(spec, spec.encoding.parts, missing ? null : value, decision);
      case 'identifier': return [];
    }
  }

  /** A present value as a finite number; a boolean reads as 1/0, a date or text that is not a number refuses. */
  private static numberOf(spec: FeatureColumnSpec, value: CellValue): number {
    const n = typeof value === 'number' ? value
      : typeof value === 'boolean' ? (value ? 1 : 0)
      : value instanceof Date ? Number.NaN
      : Number(String(value).trim());
    if (!Number.isFinite(n)) {
      throw new AssemblyRefused({ kind: 'non-numeric-in-numeric-column', column: spec.name, sampleValue: value instanceof Date ? value.toISOString() : String(value) });
    }
    return n;
  }

  /** A present value as 1/0; anything that is not a recognisable boolean refuses. */
  private static booleanOf(spec: FeatureColumnSpec, value: CellValue): number {
    if (value === true || value === 1 || value === '1' || value === 'true') return 1;
    if (value === false || value === 0 || value === '0' || value === 'false') return 0;
    throw new AssemblyRefused({ kind: 'non-numeric-in-numeric-column', column: spec.name, sampleValue: String(value) });
  }

  /** Date parts of a dated value; a value that is not a date refuses (never 0). */
  private encodeDateParts(spec: FeatureColumnSpec, parts: DateParts, value: CellValue, decision: Date): MatrixCell[] {
    const day = value === null ? null : UtcDay.ToUtcDay(value);
    if (value !== null && day === null) throw new AssemblyRefused({ kind: 'non-numeric-in-numeric-column', column: spec.name, sampleValue: String(value) });
    const decisionDay = AsOfFeatureAssembler.decisionDay(decision);
    return parts.map((p) => {
      if (day === null) return null;
      switch (p) {
        case 'days-since-decision': return Math.round((decisionDay.getTime() - day.getTime()) / MS_PER_DAY);
        case 'year': return day.getUTCFullYear();
        case 'month': return day.getUTCMonth() + 1;
        case 'dow': return day.getUTCDay();
      }
    });
  }

  private async readerFor(spec: FeatureColumnSpec, input: AsOfAssemblyInput, coverage: ChangeHistoryCoverage[]): Promise<FeatureReader> {
    const source = spec.source;
    switch (source.kind) {
      case 'immutable-field':
      case 'record-changes': return this.fieldReader(spec, source, input, coverage);
      case 'windowed-aggregate': return this.aggregateReader(spec, source, input);
      case 'series': return this.seriesReader(spec, source, input);
      case 'feature-value': return this.featureValueReader(spec, source, input);
    }
  }

  /**
   * A field read as of the decision day: replayed from Record Changes (updatable fields), or read directly when the
   * field is immutable — refused if Record Changes show it changed after any row's decision day.
   */
  private async fieldReader(spec: FeatureColumnSpec, source: FieldSource, input: AsOfAssemblyInput, coverage: ChangeHistoryCoverage[]): Promise<FeatureReader> {
    const entity = source.entity === input.RowEntity.Name ? input.RowEntity : input.Metadata.Entity(source.entity);
    if (!entity) throw new AssemblyRefused({ kind: 'unresolved-column', entity: source.entity, field: source.field });
    const keyOf = await this.keyResolver(source.keyField, input, (row) => row.RowId);
    const keys = input.Rows.map((r) => keyOf(r)).filter((k): k is string => k !== null);
    const history = await input.History.Load(entity, keys, [source.field], input.Unit.history, input.AssembledAt);
    if (source.kind === 'record-changes') {
      coverage.push(history.Coverage);
      return this.replayReader(spec, source, entity, keyOf, history);
    }
    return this.immutableReader(spec, source, entity, keys, keyOf, history, input);
  }

  /** The value Record Changes say the field held as of the decision day; a row it cannot replay is uncovered. */
  private replayReader(spec: FeatureColumnSpec, source: FieldSource, entity: AssemblyEntityInfo, keyOf: KeyOf, history: EntityHistory): FeatureReader {
    return (row) => {
      const key = keyOf(row);
      const hv = key === null ? null : history.ValueAt(key, source.field, AsOfFeatureAssembler.asOfInstant(row.DecisionDate));
      if (hv === null || hv.Status === 'uncovered') return { Uncovered: true, Entity: entity.Name, Field: source.field, HistoryStart: history.Coverage.historyStart };
      return {
        Value: hv.Value,
        Provenance: { column: spec.name, source: 'record-changes', sourceRef: AsOfFeatureAssembler.fieldRef(entity, key, source.field), sourceVersion: hv.ChangeId, computedAt: hv.ChangedAt.toISOString() },
      };
    };
  }

  /** The stored value of a field that never changes after create; any update after a decision day refuses. */
  private async immutableReader(
    spec: FeatureColumnSpec, source: FieldSource, entity: AssemblyEntityInfo, keys: readonly string[], keyOf: KeyOf, history: EntityHistory, input: AsOfAssemblyInput,
  ): Promise<FeatureReader> {
    const hasCreatedAt = AsOfFeatureAssembler.hasField(entity, '__mj_CreatedAt');
    const current = await KeyedReader.ReadByKeys(input.DataAccess, entity.Name, entity.PrimaryKey, keys, hasCreatedAt ? [source.field, '__mj_CreatedAt'] : [source.field]);
    if (current.Status === 'refused') throw new AssemblyRefused(current.Refusal);
    const changedAfter = input.Rows.reduce((n, r) => {
      const key = keyOf(r);
      return key === null ? n : n + history.UpdatesAfter(key, source.field, AsOfFeatureAssembler.asOfInstant(r.DecisionDate));
    }, 0);
    if (changedAfter > 0) throw new AssemblyRefused({ kind: 'select-changes-after-decision-date', entity: entity.Name, field: source.field, changesAfter: changedAfter });
    return (row) => {
      const key = keyOf(row);
      const rec = key === null ? undefined : current.Rows.get(key.toLowerCase());
      const created = hasCreatedAt ? AsOfFeatureAssembler.isoOf(rec?.__mj_CreatedAt) : '';
      return {
        Value: rec ? rec[source.field] : null,
        Provenance: {
          column: spec.name, source: 'immutable-field', sourceRef: AsOfFeatureAssembler.fieldRef(entity, key, source.field),
          sourceVersion: hasCreatedAt ? `created:${created}` : 'immutable-after-create', computedAt: hasCreatedAt ? created : input.AssembledAt.toISOString(),
        },
      };
    };
  }

  /** A windowed aggregate over the owner's child rows; its version hashes the contributing rows (and their update times). */
  private async aggregateReader(spec: FeatureColumnSpec, source: WindowedAggregateSource, input: AsOfAssemblyInput): Promise<FeatureReader> {
    const index = await this.childIndex(source, input);
    // The contract: a null owner key field means the row's entity key.
    const keyOf = await this.keyResolver(source.ownerKeyField, input, (row) => row.EntityKey);
    return (row) => {
      const owner = keyOf(row) || '';
      const agg = WindowedAggregates.ComputeWindowedAggregate(index, owner, row.DecisionDate, source);
      const asOf = UtcDay.UtcDayIso(AsOfFeatureAssembler.decisionDay(row.DecisionDate));
      return {
        Value: agg.Value,
        Provenance: {
          column: spec.name, source: 'windowed-aggregate', sourceRef: `${source.childEntity}?${source.foreignKey}=${owner.toLowerCase()}&as-of=${asOf}&aggregate=${source.aggregate}`,
          sourceVersion: AsOfFeatureAssembler.contributorsVersion(agg.Contributors), computedAt: input.AssembledAt.toISOString(),
        },
      };
    };
  }

  /** A declared lag or rolling window of the unit's own series. */
  private seriesReader(spec: FeatureColumnSpec, source: SeriesSource, input: AsOfAssemblyInput): FeatureReader {
    const t = input.Unit.temporal;
    const history = input.SeriesHistory;
    if (!t || !history) throw new AssemblyRefused({ kind: 'unresolved-column', entity: input.RowEntity.Name, field: `TemporalSpec.${source.feature.kind}[${source.feature.index}]` });
    return (row) => {
      const s = SeriesFeatures.ComputeSeriesFeature(history, row.EntityKey, row.Period || row.DecisionDate, t, source.feature);
      return {
        Value: s.Value,
        Provenance: { column: spec.name, source: 'series', sourceRef: `${input.RowEntity.Name}/label/${s.SourceRowIds.join('+')}`, sourceVersion: `labelVersion:${input.Unit.label.labelVersion}`, computedAt: input.AssembledAt.toISOString() },
      };
    };
  }

  /** The latest effective-dated, pinned Feature Value on or before the decision day; an unpinned source is refused. */
  private async featureValueReader(spec: FeatureColumnSpec, source: FeatureValueSource, input: AsOfAssemblyInput): Promise<FeatureReader> {
    if (source.pin === null) throw new AssemblyRefused({ kind: 'unpinned-feature-version', featureName: source.featureName });
    const pin = source.pin;
    const read = await CompleteReader.ReadCompletely(input.DataAccess, {
      EntityName: 'MJ: Feature Values', KeyField: 'ID', ExtraFilter: AsOfFeatureAssembler.featureValueFilter(input.RowEntity, source.featureName, pin), Fields: FEATURE_VALUE_FIELDS,
    }, input.Read);
    if (read.Status === 'refused') throw new AssemblyRefused(read.Refusal);
    const byRecord = AsOfFeatureAssembler.featureValuesByRecord(read.Rows);
    const version = AsOfFeatureAssembler.pinVersion(pin);
    return (row) => {
      const asOf = AsOfFeatureAssembler.asOfInstant(row.DecisionDate).getTime();
      const candidates = (byRecord.get(row.RowId.toLowerCase()) || []).filter((v) => AsOfFeatureAssembler.effectiveAt(v) < asOf);
      const v = candidates[candidates.length - 1];
      return {
        // `??`: 0, '' and false are real feature values; only an absent typed column falls through to the next.
        Value: v ? (v.ValueNumeric ?? v.ValueText ?? v.ValueBoolean ?? v.ValueDate ?? null) : null,
        Provenance: { column: spec.name, source: 'feature-value', sourceRef: v ? `MJ: Feature Values/${String(v.ID).toLowerCase()}` : 'none', sourceVersion: version, computedAt: v ? AsOfFeatureAssembler.isoOf(v.ComputedAt) : '' },
      };
    };
  }

  /** The version a Feature Value pin names: its feature pipeline and the pipeline version or prompt version it read. */
  private static pinVersion(pin: FeatureVersionPin): string {
    return `${pin.featurePipelineRecordProcessId}@${pin.pipelineVersion || pin.promptVersionHash || 'unversioned'}`;
  }

  /** The Feature Values of one feature of the row entity that a pin selects; undated values are never read. */
  private static featureValueFilter(rowEntity: AssemblyEntityInfo, featureName: string, pin: FeatureVersionPin): string {
    // Every value interpolated here comes from metadata or a pin (JSON), so each is escaped.
    return [
      `[EntityID]='${EscapeSQLString(rowEntity.ID)}'`, `[FeatureName]='${EscapeSQLString(featureName)}'`,
      `[RecordProcessID]='${EscapeSQLString(pin.featurePipelineRecordProcessId)}'`, '[EffectiveAsOf] IS NOT NULL',
      ...(pin.promptVersionHash ? [`[PromptVersionHash]='${EscapeSQLString(pin.promptVersionHash)}'`] : []),
      // The Feature Value key columns: a pin names the pipeline version, model and parameters it read.
      ...(pin.pipelineVersion !== null && Number.isInteger(pin.pipelineVersion) ? [`[PipelineVersion]=${pin.pipelineVersion}`] : []),
      ...(pin.aiModelId ? [`[AIModelID]='${EscapeSQLString(pin.aiModelId)}'`] : []),
      ...(pin.parametersHash ? [`[ParametersHash]='${EscapeSQLString(pin.parametersHash)}'`] : []),
    ].join(' AND ');
  }

  /** Feature Values keyed by lower-cased record key, each list in effective-date order. */
  private static featureValuesByRecord(rows: readonly SourceRow[]): Map<string, SourceRow[]> {
    const byRecord = new Map<string, SourceRow[]>();
    for (const v of rows) {
      const k = RecordHistory.KeyOfRecordId(String(v.RecordID));
      const list = byRecord.get(k) || [];
      list.push(v);
      byRecord.set(k, list);
    }
    for (const list of byRecord.values()) list.sort((a, b) => AsOfFeatureAssembler.effectiveAt(a) - AsOfFeatureAssembler.effectiveAt(b));
    return byRecord;
  }

  private static effectiveAt(v: SourceRow): number {
    return (v.EffectiveAsOf instanceof Date ? v.EffectiveAsOf : new Date(String(v.EffectiveAsOf))).getTime();
  }

  /**
   * How a row finds the record a source reads: through a key field on the row entity, or (no key field) `fallback` —
   * the row's own id for a field, the row's entity key for an aggregate owner.
   */
  private async keyResolver(keyField: string | null, input: AsOfAssemblyInput, fallback: KeyOf): Promise<KeyOf> {
    if (keyField === null) return fallback;
    const rowsById = await KeyedReader.ReadByKeys(input.DataAccess, input.RowEntity.Name, input.RowEntity.PrimaryKey, input.Rows.map((r) => r.RowId), [keyField]);
    if (rowsById.Status === 'refused') throw new AssemblyRefused(rowsById.Refusal);
    return (row) => {
      const v = rowsById.Rows.get(row.RowId.toLowerCase())?.[keyField];
      return v === null || v === undefined ? null : String(v);
    };
  }

  private async childIndex(source: WindowedAggregateSource, input: AsOfAssemblyInput): Promise<ChildRowIndex> {
    const child = input.Metadata.Entity(source.childEntity);
    if (!child) throw new AssemblyRefused({ kind: 'unresolved-column', entity: source.childEntity, field: '*' });
    const fields = [
      child.PrimaryKey, source.foreignKey, source.dateField, source.endDateField, source.voidedAtField, source.valueField, ...source.filter.map((f) => f.field),
      AsOfFeatureAssembler.hasField(child, '__mj_UpdatedAt') ? '__mj_UpdatedAt' : null,
    ].filter((f): f is string => !!f);
    const read = await CompleteReader.ReadCompletely(input.DataAccess, { EntityName: child.Name, KeyField: child.PrimaryKey, Fields: [...new Set(fields)] }, input.Read);
    if (read.Status === 'refused') throw new AssemblyRefused(read.Refusal);
    return WindowedAggregates.BuildChildRowIndex(read.Rows, source, child.PrimaryKey);
  }

  /** The sha-256 of the contributing rows: `ID:updatedAt` per row, or the ID alone when the row has no update time. */
  private static contributorsVersion(contributors: readonly ChildRow[]): string {
    const lines = contributors.map((c) => (c.UpdatedAt ? `${c.Id}:${c.UpdatedAt}` : c.Id)).sort();
    return createHash('sha256').update(lines.join('\n')).digest('hex');
  }

  /** The per-column version summary stored on the snapshot (per-value versions are in the provenance file). */
  private static columnVersion(spec: FeatureColumnSpec, input: AsOfAssemblyInput, coverage: readonly ChangeHistoryCoverage[]): string {
    const s = spec.source;
    switch (s.kind) {
      case 'record-changes': return `history-start:${coverage.find((c) => c.entity === s.entity)?.historyStart || 'none'}`;
      case 'immutable-field': return 'immutable-after-create';
      case 'windowed-aggregate': return `window:${s.windowDays === null ? 'all' : s.windowDays};aggregate:${s.aggregate}`;
      case 'series': return `labelVersion:${input.Unit.label.labelVersion}`;
      case 'feature-value': return s.pin ? AsOfFeatureAssembler.pinVersion(s.pin) : 'unpinned';
    }
  }

  private static describeSource(spec: FeatureColumnSpec): string {
    const s = spec.source;
    switch (s.kind) {
      case 'immutable-field':
      case 'record-changes': return `${s.entity}.${s.field}`;
      case 'windowed-aggregate': return `${s.childEntity}.${s.valueField || s.dateField}`;
      case 'series': return `series.${s.feature.kind}[${s.feature.index}]`;
      case 'feature-value': return `feature-value.${s.featureName}`;
    }
  }

  /** `<entity>/<lower-cased key>/<field>`: the record and field a value was read from. */
  private static fieldRef(entity: AssemblyEntityInfo, key: string | null, field: string): string {
    return `${entity.Name}/${(key || '').toLowerCase()}/${field}`;
  }

  private static hasField(entity: AssemblyEntityInfo, name: string): boolean {
    return entity.Fields.some((f) => f.Name === name);
  }

  /** A stored timestamp as an ISO instant; an absent one is ''. */
  private static isoOf(value: CellValue): string {
    if (value instanceof Date) return value.toISOString();
    return value === null || value === undefined ? '' : String(value);
  }

  /** The decision's UTC day; an invalid decision date is a caller defect, not a refusal. */
  private static decisionDay(decision: Date): Date {
    const day = UtcDay.ToUtcDay(decision);
    if (day === null) throw new Error('As-of assembly: a row has an invalid decision date');
    return day;
  }

  /** The start of the day after the decision day: anything strictly before it was known on the decision day. */
  private static asOfInstant(decision: Date): Date {
    return UtcDay.AddUtcDays(AsOfFeatureAssembler.decisionDay(decision), 1);
  }
}
