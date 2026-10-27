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
 * Current values: a value read from the stored row (an `immutable-field` source, or the key field a row joins through)
 * is used only when it is the value the row held on every decision day. A field the metadata declares not updatable is
 * read; an updatable field is read only when the entity tracks Record Changes, none of them updated it after a row's
 * decision day (else `select-changes-after-decision-date`) and its history covers every decision day (else
 * `decision-date-before-change-history`, naming where the history starts); an updatable field of an untracked entity
 * refuses `decision-date-before-change-history`, since its past value cannot be known. The child rows a windowed
 * aggregate reads pass the same rule for their owner key, date, value and filter fields, as of the owner row's decision
 * day (void and end dates are compared with the decision day and need no check).
 *
 * Coverage: every Record Changes history the assembly reads (replayed fields and the stable-value rule) is reported in
 * the result's `Coverage`, one entry per entity and field.
 *
 * Record creation: when the entity lists `__mj_CreatedAt`, a record created after a row's decision day did not exist
 * then, so its `immutable-field` value reads as missing (version `created-after-decision`), never the stored value.
 * Without the column the rule cannot be applied and the value is read; such entities (those mapped from external
 * schemas) rely on the unit's premise that its rows exist on their decision dates. The same rule applies to the key
 * a unit row joins through: a unit row created after its decision day resolves its join key as null, so every value
 * read through that key is missing (version `created-after-decision`).
 *
 * System timestamp columns: `__mj_CreatedAt` and `__mj_UpdatedAt` are requested only when the entity's metadata lists
 * them. Without `__mj_CreatedAt`, an immutable field's provenance carries the record key only (version
 * `immutable-after-create`, computed at the assembly time); without `__mj_UpdatedAt`, a windowed aggregate's version
 * hashes the IDs of the child rows it read.
 *
 * Categorical columns: when a column has more distinct levels than its encoding's `cardinalityCap`, the least frequent
 * levels beyond the cap (by count, ties by value) fold into one `__other` level, recorded on the column's provenance.
 * The kept levels are a fitted encoding step, like the sidecar's one-hot vocabulary: training returns them
 * (`CategoryLevels` on the result) and scoring passes them back (`CategoryLevels` on the input), so a value is folded
 * the same way in both contexts; a value not among the kept levels becomes `__other` and nothing is recounted. A
 * scoring assembly without training's levels for a categorical column fails, and so does a stored value equal to
 * `__other`, which the fold could not tell apart from folded levels.
 * One-hot is the only categorical method the sidecar fits; any other method fails loudly.
 */
import { createHash } from 'node:crypto';
import type {
  AssemblyRefusal, ChangeHistoryCoverage, ColumnEncoding, ColumnEncodingKind, ColumnProvenance, FeatureColumnSpec, FeatureVersionPin,
  PredictionUnitSpec, PreprocessingOp, ReadPolicy, UncoveredRowsCount, ValueProvenance, WindowedAggregateSource,
} from '@memberjunction/predictive-studio-core';
import { EscapeSQLString, OrdinalCompare } from '@memberjunction/global';
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
  /**
   * The kept levels of each categorical column, by column name, as training produced them (the result's
   * `CategoryLevels`). Scoring must pass training's levels so a value folds into `__other` exactly as it did in
   * training; a column listed here is folded to these levels without recounting. Absent (training), the levels are
   * computed from the assembled rows.
   */
  readonly CategoryLevels?: ReadonlyMap<string, readonly string[]>;
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
      /** The kept levels of every categorical column, by column name: persist them with the model and pass them back at scoring. */
      readonly CategoryLevels: ReadonlyMap<string, readonly string[]>;
    }
  | { readonly Status: 'refused'; readonly Refusal: AssemblyRefusal };

/** An assembled matrix (the successful outcome of {@link AsOfFeatureAssembler.Assemble}). */
export type AsOfAssembledMatrix = Extract<AsOfAssemblyResult, { Status: 'assembled' }>;

interface RawValue { readonly Value: CellValue; readonly Provenance: ValueProvenance }
interface Uncovered { readonly Uncovered: true; readonly Entity: string; readonly Field: string; readonly HistoryStart: string | null }
type FeatureReader = (row: AssemblyRowRef) => RawValue | Uncovered;
interface ColumnReader { readonly Spec: FeatureColumnSpec; readonly Read: FeatureReader }
type KeyOf = (row: AssemblyRowRef) => string | null;
/** How rows resolve a join key, and which rows' keys are unknown because the unit row was created after its decision day. */
interface JoinKeys { readonly KeyOf: KeyOf; readonly CreatedAfter: (row: AssemblyRowRef) => boolean }
type FieldSource = Extract<FeatureColumnSpec['source'], { kind: 'immutable-field' | 'record-changes' }>;
type FeatureValueSource = Extract<FeatureColumnSpec['source'], { kind: 'feature-value' }>;
type SeriesSource = Extract<FeatureColumnSpec['source'], { kind: 'series' }>;
type DateParts = Extract<ColumnEncoding, { kind: 'date-parts' }>['parts'];
interface UncoveredTally { readonly Entity: string; readonly Field: string; readonly HistoryStart: string | null; Rows: number }
interface AssembledRows { readonly Rows: AssembledRow[]; readonly Excluded: Set<string>; readonly Uncovered: UncoveredTally[] }
/** A row with the key it reads a source record by. */
interface KeyedRow { readonly Row: AssemblyRowRef; readonly Key: string }
type CategoryFold = NonNullable<ColumnProvenance['categoryFold']>;
/** Coverage per entity and field (`entity|field`): one entry for every history the assembly read. */
type CoverageByField = Map<string, ChangeHistoryCoverage>;

/** The level the least frequent categories beyond a column's cardinality cap fold into. */
export const OTHER_CATEGORY_LEVEL = '__other';

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
    const coverage: CoverageByField = new Map();
    const readers = await this.buildReaders(input, coverage);
    const columns = readers.flatMap((r) => this.columnsFor(r.Spec));
    const assembled = this.assembleRows(input, readers);
    const first = assembled.Uncovered[0];
    if (input.Unit.history.onUncoveredRow === 'refuse' && first) {
      throw new AssemblyRefused({ kind: 'decision-date-before-change-history', entity: first.Entity, field: first.Field, historyStart: first.HistoryStart, rowsAffected: first.Rows });
    }
    const folded = AsOfFeatureAssembler.foldCategoricals(columns, input.Features, assembled.Rows, input.CategoryLevels, input.Context);
    return {
      Status: 'assembled',
      Columns: columns,
      Rows: folded.Rows,
      ExcludedRowIds: assembled.Excluded,
      UncoveredRowsExcluded: assembled.Uncovered.map((u) => ({ entity: u.Entity, field: u.Field, rows: u.Rows })),
      Coverage: [...coverage.values()],
      Preprocessing: AsOfFeatureAssembler.BuildPreprocessingOps(columns, input.Features, input.ExplicitOps || []),
      ColumnProvenance: readers.map((r) => AsOfFeatureAssembler.columnProvenance(r.Spec, input, coverage, folded.Folds.get(r.Spec.name))),
      CategoryLevels: folded.Levels,
    };
  }

  private static columnProvenance(spec: FeatureColumnSpec, input: AsOfAssemblyInput, coverage: CoverageByField, fold: CategoryFold | undefined): ColumnProvenance {
    const base: ColumnProvenance = { column: spec.name, source: spec.source.kind, sourceRef: AsOfFeatureAssembler.describeSource(spec), sourceVersion: AsOfFeatureAssembler.columnVersion(spec, input, coverage) };
    return fold && fold.folded.length > 0 ? { ...base, categoryFold: fold } : base;
  }

  /**
   * Caps every categorical column's levels. With training's kept levels for a column (`given`), every other value becomes
   * `__other`. Otherwise, when a column has more distinct non-missing levels than its cap, the levels beyond the cap
   * (count descending, then value ascending, so the fold is deterministic) become `__other`. Returns the kept levels of
   * every categorical column and the fold of each column that folded anything.
   */
  private static foldCategoricals(
    columns: readonly AssembledColumn[], features: readonly FeatureColumnSpec[], rows: readonly AssembledRow[], given: ReadonlyMap<string, readonly string[]> | undefined, context: AsOfAssemblyInput['Context'],
  ): { readonly Rows: AssembledRow[]; readonly Folds: Map<string, CategoryFold>; readonly Levels: Map<string, readonly string[]> } {
    const byFeature = new Map(features.map((f) => [f.name, f]));
    const folds = new Map<string, CategoryFold>();
    const levels = new Map<string, readonly string[]>();
    const kept = new Map<number, ReadonlySet<string>>();
    columns.forEach((c, i) => {
      const encoding = byFeature.get(c.FeatureName)?.encoding;
      if (c.Encoding !== 'categorical' || !encoding || encoding.kind !== 'categorical') return;
      const values = rows.map((r) => r.Values[i]);
      AsOfFeatureAssembler.assertFoldable(c.Name, values, given, context);
      const fold = AsOfFeatureAssembler.levelFold(values, encoding.cardinalityCap, given?.get(c.Name));
      levels.set(c.Name, fold.kept);
      folds.set(c.Name, fold);
      if (fold.folded.length > 0) kept.set(i, new Set(fold.kept));
    });
    if (kept.size === 0) return { Rows: [...rows], Folds: folds, Levels: levels };
    const foldedRows = rows.map((r) => ({ ...r, Values: r.Values.map((v, i) => (typeof v === 'string' && kept.has(i) && !kept.get(i).has(v) ? OTHER_CATEGORY_LEVEL : v)) }));
    return { Rows: foldedRows, Folds: folds, Levels: levels };
  }

  /** A column the fold cannot treat honestly fails: scoring without training's levels, or a stored `__other` value. */
  private static assertFoldable(column: string, values: readonly MatrixCell[], given: ReadonlyMap<string, readonly string[]> | undefined, context: AsOfAssemblyInput['Context']): void {
    if (context === 'score' && !given?.has(column)) {
      throw new Error(`Column ${column}: a scoring assembly needs the categorical levels training kept for it, and none were given`);
    }
    if (values.some((v) => v === OTHER_CATEGORY_LEVEL)) {
      throw new Error(`Column ${column}: a stored value equals the fold level "${OTHER_CATEGORY_LEVEL}", which would merge it with folded levels`);
    }
  }

  /**
   * The kept and folded levels of one column's values. With `trained` levels the kept levels are exactly those and the
   * folded ones are the other values seen; without, the most frequent `cap` levels are kept.
   */
  private static levelFold(values: readonly MatrixCell[], cap: number, trained: readonly string[] | undefined): CategoryFold {
    const counts = new Map<string, number>();
    for (const v of values) if (typeof v === 'string') counts.set(v, (counts.get(v) || 0) + 1);
    const ordered = [...counts.entries()].sort((a, b) => b[1] - a[1] || OrdinalCompare(a[0], b[0])).map(([level]) => level);
    if (trained) {
      const keep = new Set(trained);
      return { kept: [...trained], folded: ordered.filter((level) => !keep.has(level)) };
    }
    return { kept: ordered.slice(0, cap), folded: ordered.slice(cap) };
  }

  /** One dated reader per non-identifier column; record-changes readers append their coverage. */
  private async buildReaders(input: AsOfAssemblyInput, coverage: CoverageByField): Promise<ColumnReader[]> {
    const readers: ColumnReader[] = [];
    for (const spec of input.Features) {
      if (spec.encoding.kind === 'identifier') continue;
      AsOfFeatureAssembler.assertEncodable(spec);
      readers.push({ Spec: spec, Read: await this.readerFor(spec, input, coverage) });
    }
    return readers;
  }

  /** One-hot is the only categorical method the sidecar fits; any other is a pipeline the assembly cannot honour. */
  private static assertEncodable(spec: FeatureColumnSpec): void {
    if (spec.encoding.kind === 'categorical' && spec.encoding.method !== 'onehot') {
      throw new Error(`Column ${spec.name}: the categorical method "${spec.encoding.method}" is not supported; only one-hot is fitted`);
    }
  }

  /**
   * Reads every row through every reader. A row with an uncovered value is excluded; every reader still runs, so the row
   * is counted once against each entity/field it is uncovered for (in the order first met), and the `refuse` policy can
   * name the first one with its row count. An excluded row's other values are not encoded.
   */
  private assembleRows(input: AsOfAssemblyInput, readers: readonly ColumnReader[]): AssembledRows {
    const out: AssembledRows = { Rows: [], Excluded: new Set<string>(), Uncovered: [] };
    const tallies = new Map<string, UncoveredTally>();
    for (const row of input.Rows) {
      const values: MatrixCell[] = [];
      const provenance: ValueProvenance[] = [];
      const uncovered: Uncovered[] = [];
      for (const r of readers) {
        const raw = r.Read(row);
        if ('Uncovered' in raw) {
          if (!uncovered.some((u) => u.Entity === raw.Entity && u.Field === raw.Field)) uncovered.push(raw);
          continue;
        }
        if (uncovered.length > 0) continue;
        values.push(...this.encode(r.Spec, raw.Value, row.DecisionDate));
        provenance.push(raw.Provenance);
      }
      if (uncovered.length === 0) {
        out.Rows.push({ RowId: row.RowId, Values: values, Provenance: provenance });
        continue;
      }
      out.Excluded.add(row.RowId);
      for (const u of uncovered) AsOfFeatureAssembler.tally(tallies, out.Uncovered, u);
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

  private async readerFor(spec: FeatureColumnSpec, input: AsOfAssemblyInput, coverage: CoverageByField): Promise<FeatureReader> {
    const source = spec.source;
    switch (source.kind) {
      case 'immutable-field':
      case 'record-changes': return this.fieldReader(spec, source, input, coverage);
      case 'windowed-aggregate': return this.aggregateReader(spec, source, input, coverage);
      case 'series': return this.seriesReader(spec, source, input);
      case 'feature-value': return this.featureValueReader(spec, source, input);
    }
  }

  /**
   * A field read as of the decision day: replayed from Record Changes (updatable fields), or read from the stored row
   * when the stable-value rule says the stored value is the value on every decision day.
   */
  private async fieldReader(spec: FeatureColumnSpec, source: FieldSource, input: AsOfAssemblyInput, coverage: CoverageByField): Promise<FeatureReader> {
    const entity = source.entity === input.RowEntity.Name ? input.RowEntity : input.Metadata.Entity(source.entity);
    if (!entity) throw new AssemblyRefused({ kind: 'unresolved-column', entity: source.entity, field: source.field });
    const join = await this.keyResolver(source.keyField, input, (row) => row.RowId, coverage);
    const keyOf = join.KeyOf;
    if (source.kind === 'immutable-field') return AsOfFeatureAssembler.missingWhenCreatedAfter(spec, join, await this.currentValueReader(spec, source, entity, keyOf, input, coverage), input);
    const keys = input.Rows.map((r) => keyOf(r)).filter((k): k is string => k !== null);
    const history = await input.History.Load(entity, keys, [source.field], input.Unit.history, input.AssembledAt);
    AsOfFeatureAssembler.recordCoverage(coverage, entity, source.field, history);
    return AsOfFeatureAssembler.missingWhenCreatedAfter(spec, join, this.replayReader(spec, source, entity, keyOf, history, input), input);
  }

  /** Records the history read for one entity and field; the first read of a field is kept. */
  private static recordCoverage(coverage: CoverageByField, entity: AssemblyEntityInfo, field: string, history: EntityHistory): void {
    const k = `${entity.Name}|${field}`;
    if (!coverage.has(k)) coverage.set(k, { ...history.Coverage, field });
  }

  /**
   * The value Record Changes say the field held as of the decision day; a row it cannot replay is uncovered. A row with
   * no join key has no record to replay, so its value is missing.
   */
  private replayReader(spec: FeatureColumnSpec, source: FieldSource, entity: AssemblyEntityInfo, keyOf: KeyOf, history: EntityHistory, input: AsOfAssemblyInput): FeatureReader {
    return (row) => {
      const key = keyOf(row);
      if (key === null) return { Value: null, Provenance: { column: spec.name, source: 'record-changes', sourceRef: 'none', sourceVersion: 'none', computedAt: input.AssembledAt.toISOString() } };
      const hv = history.ValueAt(key, source.field, AsOfFeatureAssembler.asOfInstant(row.DecisionDate));
      if (hv.Status === 'uncovered') return { Uncovered: true, Entity: entity.Name, Field: source.field, HistoryStart: history.Coverage.historyStart };
      return {
        Value: hv.Value,
        Provenance: { column: spec.name, source: 'record-changes', sourceRef: AsOfFeatureAssembler.fieldRef(entity, key, source.field), sourceVersion: hv.ChangeId, computedAt: hv.ChangedAt.toISOString() },
      };
    };
  }

  /**
   * The stored value of a field the stable-value rule admits. A record created after a row's decision day (known only
   * when the entity lists `__mj_CreatedAt`) reads as missing, never as its stored value.
   */
  private async currentValueReader(spec: FeatureColumnSpec, source: FieldSource, entity: AssemblyEntityInfo, keyOf: KeyOf, input: AsOfAssemblyInput, coverage: CoverageByField): Promise<FeatureReader> {
    const keyed = input.Rows.map((r) => ({ Row: r, Key: keyOf(r) })).filter((k): k is KeyedRow => k.Key !== null);
    const hasCreatedAt = AsOfFeatureAssembler.hasField(entity, '__mj_CreatedAt');
    // Read first: a key with no record is a short read, whatever the history of the records that exist.
    const current = await KeyedReader.ReadByKeys(input.DataAccess, entity.Name, entity.PrimaryKey, keyed.map((k) => k.Key), hasCreatedAt ? [source.field, '__mj_CreatedAt'] : [source.field]);
    if (current.Status === 'refused') throw new AssemblyRefused(current.Refusal);
    await this.assertStableCurrentValue(entity, source.field, keyed, input, coverage);
    return (row) => {
      const key = keyOf(row);
      const rec = key === null ? undefined : current.Rows.get(key.toLowerCase());
      const created = hasCreatedAt && rec ? AsOfFeatureAssembler.instantOf(rec.__mj_CreatedAt) : null;
      const createdAfter = created !== null && created.getTime() >= AsOfFeatureAssembler.asOfInstant(row.DecisionDate).getTime();
      const version = !hasCreatedAt ? 'immutable-after-create' : createdAfter ? 'created-after-decision' : `created:${AsOfFeatureAssembler.isoOf(rec?.__mj_CreatedAt)}`;
      return {
        Value: rec && !createdAfter ? rec[source.field] : null,
        Provenance: {
          column: spec.name, source: 'immutable-field', sourceRef: AsOfFeatureAssembler.fieldRef(entity, key, source.field), sourceVersion: version,
          computedAt: hasCreatedAt ? AsOfFeatureAssembler.isoOf(rec?.__mj_CreatedAt) : input.AssembledAt.toISOString(),
        },
      };
    };
  }

  /**
   * The stable-value rule for a value read from the stored row (a field, or the key field a row joins through): the
   * stored value stands for the value on every row's decision day only when the field is declared not updatable, or
   * the entity tracks Record Changes and none updated the field after any row's decision day. An updatable field of an
   * untracked entity cannot be known on a past day and refuses.
   */
  private async assertStableCurrentValue(entity: AssemblyEntityInfo, field: string, keyed: readonly KeyedRow[], input: AsOfAssemblyInput, coverage: CoverageByField): Promise<void> {
    const info = entity.Fields.find((f) => f.Name === field);
    if (!info) throw new AssemblyRefused({ kind: 'unresolved-column', entity: entity.Name, field });
    if (info.AllowUpdateAPI === false || keyed.length === 0) return;
    if (!entity.TrackRecordChanges) {
      throw new AssemblyRefused({ kind: 'decision-date-before-change-history', entity: entity.Name, field, historyStart: null, rowsAffected: keyed.length });
    }
    const history = await input.History.Load(entity, [...new Set(keyed.map((k) => k.Key))], [field], input.Unit.history, input.AssembledAt);
    AsOfFeatureAssembler.recordCoverage(coverage, entity, field, history);
    const changedAfter = keyed.reduce((n, k) => n + history.UpdatesAfter(k.Key, field, AsOfFeatureAssembler.asOfInstant(k.Row.DecisionDate)), 0);
    if (changedAfter > 0) throw new AssemblyRefused({ kind: 'select-changes-after-decision-date', entity: entity.Name, field, changesAfter: changedAfter });
    // A history that starts after a decision day (tracking enabled late, a snapshot written since) cannot tell its value then.
    const uncovered = keyed.filter((k) => history.ValueAt(k.Key, field, AsOfFeatureAssembler.asOfInstant(k.Row.DecisionDate)).Status === 'uncovered').length;
    if (uncovered > 0) {
      throw new AssemblyRefused({ kind: 'decision-date-before-change-history', entity: entity.Name, field, historyStart: history.Coverage.historyStart, rowsAffected: uncovered });
    }
  }

  /**
   * A windowed aggregate over the owner's child rows; its version hashes the contributing rows (and their update times).
   * Every row is computed up front so the child rows that contributed pass the stable-value rule before any value is used.
   */
  private async aggregateReader(spec: FeatureColumnSpec, source: WindowedAggregateSource, input: AsOfAssemblyInput, coverage: CoverageByField): Promise<FeatureReader> {
    const { Child: child, Index: index } = await this.childIndex(source, input);
    // The contract: a null owner key field means the row's entity key.
    const join = await this.keyResolver(source.ownerKeyField, input, (row) => row.EntityKey, coverage);
    const values = new Map<AssemblyRowRef, RawValue>();
    const contributing: KeyedRow[] = [];
    for (const row of input.Rows) {
      if (join.CreatedAfter(row)) continue;
      const owner = join.KeyOf(row);
      if (owner === null) {
        values.set(row, AsOfFeatureAssembler.aggregateValue(spec, source, null, row, [], null, input));
        continue;
      }
      const agg = WindowedAggregates.ComputeWindowedAggregate(index, owner, row.DecisionDate, source);
      for (const c of agg.Contributors) contributing.push({ Row: row, Key: c.Id });
      values.set(row, AsOfFeatureAssembler.aggregateValue(spec, source, owner, row, agg.Contributors, agg.Value, input));
    }
    for (const field of AsOfFeatureAssembler.childStableFields(source)) await this.assertStableCurrentValue(child, field, contributing, input, coverage);
    return AsOfFeatureAssembler.missingWhenCreatedAfter(spec, join, (row) => {
      const v = values.get(row);
      if (!v) throw new Error(`Windowed aggregate ${spec.name}: row ${row.RowId} was not computed`);
      return v;
    }, input);
  }

  /** One aggregate value; a row with no owner key has no child rows ('' would read the bucket of ownerless child rows). */
  private static aggregateValue(
    spec: FeatureColumnSpec, source: WindowedAggregateSource, owner: string | null, row: AssemblyRowRef, contributors: readonly ChildRow[], value: number | null, input: AsOfAssemblyInput,
  ): RawValue {
    const sourceRef = owner === null ? 'none'
      : `${source.childEntity}?${source.foreignKey}=${owner.toLowerCase()}&as-of=${UtcDay.UtcDayIso(AsOfFeatureAssembler.decisionDay(row.DecisionDate))}&aggregate=${source.aggregate}`;
    return { Value: value, Provenance: { column: spec.name, source: 'windowed-aggregate', sourceRef, sourceVersion: AsOfFeatureAssembler.contributorsVersion(contributors), computedAt: input.AssembledAt.toISOString() } };
  }

  /** The child fields whose stored values decide what an aggregate reads: the owner key, the date, the value and every filter. */
  private static childStableFields(source: WindowedAggregateSource): string[] {
    return [...new Set([source.foreignKey, source.dateField, source.valueField, ...source.filter.map((f) => f.field)].filter((f): f is string => !!f))];
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
    const pin = AsOfFeatureAssembler.pinOf(source);
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

  /**
   * The source's pin, when it names a version: a whole-number pipeline version (0 included) or a prompt version hash.
   * No pin, a fractional version, or a pin naming neither refuses: such a pin cannot select one version of a value.
   */
  private static pinOf(source: FeatureValueSource): FeatureVersionPin {
    const pin = source.pin;
    const unpinned = new AssemblyRefused({ kind: 'unpinned-feature-version', featureName: source.featureName });
    if (pin === null) throw unpinned;
    if (pin.pipelineVersion !== null && !Number.isInteger(pin.pipelineVersion)) throw unpinned;
    if (pin.pipelineVersion === null && !pin.promptVersionHash) throw unpinned;
    return pin;
  }

  /** The version a valid Feature Value pin names: its feature pipeline and the pipeline version or prompt version it read. */
  private static pinVersion(pin: FeatureVersionPin): string {
    return `${pin.featurePipelineRecordProcessId}@${pin.pipelineVersion !== null ? pin.pipelineVersion : pin.promptVersionHash}`;
  }

  /** The Feature Values of one feature of the row entity that a pin selects; undated values are never read. */
  private static featureValueFilter(rowEntity: AssemblyEntityInfo, featureName: string, pin: FeatureVersionPin): string {
    // Every value interpolated here comes from metadata or a pin (JSON), so each is escaped.
    return [
      `[EntityID]='${EscapeSQLString(rowEntity.ID)}'`, `[FeatureName]='${EscapeSQLString(featureName)}'`,
      `[RecordProcessID]='${EscapeSQLString(pin.featurePipelineRecordProcessId)}'`, '[EffectiveAsOf] IS NOT NULL',
      ...(pin.promptVersionHash ? [`[PromptVersionHash]='${EscapeSQLString(pin.promptVersionHash)}'`] : []),
      // The Feature Value key columns: a pin names the pipeline version, model and parameters it read.
      ...(pin.pipelineVersion !== null ? [`[PipelineVersion]=${pin.pipelineVersion}`] : []),
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
  private async keyResolver(keyField: string | null, input: AsOfAssemblyInput, fallback: KeyOf, coverage: CoverageByField): Promise<JoinKeys> {
    if (keyField === null) return { KeyOf: fallback, CreatedAfter: () => false };
    await this.assertStableCurrentValue(input.RowEntity, keyField, input.Rows.map((r) => ({ Row: r, Key: r.RowId })), input, coverage);
    const hasCreatedAt = AsOfFeatureAssembler.hasField(input.RowEntity, '__mj_CreatedAt');
    const rowsById = await KeyedReader.ReadByKeys(input.DataAccess, input.RowEntity.Name, input.RowEntity.PrimaryKey, input.Rows.map((r) => r.RowId), hasCreatedAt ? [keyField, '__mj_CreatedAt'] : [keyField]);
    if (rowsById.Status === 'refused') throw new AssemblyRefused(rowsById.Refusal);
    const createdAfter = (row: AssemblyRowRef): boolean => {
      if (!hasCreatedAt) return false;
      const created = AsOfFeatureAssembler.instantOf(rowsById.Rows.get(row.RowId.toLowerCase())?.__mj_CreatedAt);
      return created !== null && created.getTime() >= AsOfFeatureAssembler.asOfInstant(row.DecisionDate).getTime();
    };
    return {
      CreatedAfter: createdAfter,
      KeyOf: (row) => {
        if (createdAfter(row)) return null;
        const v = rowsById.Rows.get(row.RowId.toLowerCase())?.[keyField];
        return v === null || v === undefined ? null : String(v);
      },
    };
  }

  /** A reader whose rows created after their decision day (so their join key is unknown) read as missing. */
  private static missingWhenCreatedAfter(spec: FeatureColumnSpec, join: JoinKeys, read: FeatureReader, input: AsOfAssemblyInput): FeatureReader {
    return (row) => (join.CreatedAfter(row)
      ? { Value: null, Provenance: { column: spec.name, source: spec.source.kind, sourceRef: 'none', sourceVersion: 'created-after-decision', computedAt: input.AssembledAt.toISOString() } }
      : read(row));
  }

  private async childIndex(source: WindowedAggregateSource, input: AsOfAssemblyInput): Promise<{ readonly Child: AssemblyEntityInfo; readonly Index: ChildRowIndex }> {
    const child = input.Metadata.Entity(source.childEntity);
    if (!child) throw new AssemblyRefused({ kind: 'unresolved-column', entity: source.childEntity, field: '*' });
    const fields = [
      child.PrimaryKey, source.foreignKey, source.dateField, source.endDateField, source.voidedAtField, source.valueField, ...source.filter.map((f) => f.field),
      AsOfFeatureAssembler.hasField(child, '__mj_UpdatedAt') ? '__mj_UpdatedAt' : null,
    ].filter((f): f is string => !!f);
    const read = await CompleteReader.ReadCompletely(input.DataAccess, { EntityName: child.Name, KeyField: child.PrimaryKey, Fields: [...new Set(fields)] }, input.Read);
    if (read.Status === 'refused') throw new AssemblyRefused(read.Refusal);
    return { Child: child, Index: WindowedAggregates.BuildChildRowIndex(read.Rows, source, child.PrimaryKey) };
  }

  /** The sha-256 of the contributing rows: `ID:updatedAt` per row, or the ID alone when the row has no update time. */
  private static contributorsVersion(contributors: readonly ChildRow[]): string {
    const lines = contributors.map((c) => (c.UpdatedAt ? `${c.Id}:${c.UpdatedAt}` : c.Id)).sort();
    return createHash('sha256').update(lines.join('\n')).digest('hex');
  }

  /** The per-column version summary stored on the snapshot (per-value versions are in the provenance file). */
  private static columnVersion(spec: FeatureColumnSpec, input: AsOfAssemblyInput, coverage: CoverageByField): string {
    const s = spec.source;
    switch (s.kind) {
      case 'record-changes': return `history-start:${coverage.get(`${s.entity}|${s.field}`)?.historyStart || 'none'}`;
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

  /** A stored timestamp as an instant; an absent or unparseable one is null. */
  private static instantOf(value: CellValue): Date | null {
    const d = value instanceof Date ? value : typeof value === 'string' ? new Date(value) : null;
    return d === null || Number.isNaN(d.getTime()) ? null : d;
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
