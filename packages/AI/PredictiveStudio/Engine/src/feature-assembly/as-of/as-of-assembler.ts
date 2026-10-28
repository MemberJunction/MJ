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
 * Current values: a value read from the stored row (an `immutable-field` source, the key field a row joins through, or
 * the fields a windowed aggregate reads from its child rows) is used only when it is the value the row held on every
 * decision day. A field the metadata declares not updatable is read (on a tracked entity its history is read too, only
 * to learn when the record was created); an updatable field is read only when the entity
 * tracks Record Changes, its history covers the decision day (else `decision-date-before-change-history`, naming where
 * the history starts) and none of them updated it afterwards (else `select-changes-after-decision-date`); an updatable
 * field of an untracked entity refuses `decision-date-before-change-history`, since its past value cannot be known.
 * Both refusals count distinct unit rows. A record whose history cannot be replayed for another reason (a continuity
 * mismatch, a deletion, an ineligible external row) makes the rows reading it uncovered, exactly as a replayed field
 * does. Child rows are judged for the whole batch, against the earliest decision day: a child row re-owned or re-dated
 * after a decision day can move between owners, so every child row read passes the rule for its owner key, date, value
 * and filter fields (void and end dates are compared with the decision day and need no check), and one the rule
 * excludes makes every unit row uncovered.
 *
 * Coverage: every Record Changes history the assembly reads (replayed fields and the stable-value rule) is reported in
 * the result's `Coverage`, one entry per entity and field. A history is loaded once per assembly for one entity, field
 * list and key set, however many features read it; two loads of one field (other keys, another join, a child entity)
 * merge: no history start wins, else the later start, and the continuity counts add.
 *
 * Record creation: a record created after a row's decision day did not exist then, so its value reads as missing
 * (version `created-after-decision`), never the stored value and never as uncovered. When creation is known: on an
 * entity that tracks Record Changes, from the record's own Create row (a history that starts with a Snapshot says
 * nothing about creation, and the column below is consulted instead); on any entity that lists `__mj_CreatedAt`, from
 * that column; when both tell, the later of the two (a record is never read before either says it existed); when
 * neither tells, the unit's premise that its records exist on their decision days applies. The rule
 * is consulted on every current read: fields declared not updatable and the key a unit row joins through included,
 * and by the stable-value rule before it judges a history that starts after the decision day. A
 * unit row created after its decision day resolves its join key as null, so every value read through that key is
 * missing. A child row created after an owner row's decision day (late-entered) is dropped from that owner's window
 * before its aggregate is computed; the number of drops is recorded on the column's provenance (`lateEnteredDropped`).
 *
 * System timestamp columns: `__mj_CreatedAt` and `__mj_UpdatedAt` are requested only when the entity's metadata lists
 * them. An immutable field's provenance carries the record's creation instant when it is known (version
 * `created:<instant>`), else the record key only (version `immutable-after-create`, computed at the assembly time);
 * without `__mj_UpdatedAt`, a windowed aggregate's version hashes the IDs of the child rows it read.
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
/**
 * How rows resolve a join key, and which rows have none: created after their decision day (the key is unknown, the
 * values read through it missing), or uncovered for the key field (the rows are uncovered).
 */
interface JoinKeys { readonly KeyOf: KeyOf; readonly CreatedAfter: (row: AssemblyRowRef) => boolean; readonly UncoveredFor: (row: AssemblyRowRef) => Uncovered | null }
type FieldSource = Extract<FeatureColumnSpec['source'], { kind: 'immutable-field' | 'record-changes' }>;
type FeatureValueSource = Extract<FeatureColumnSpec['source'], { kind: 'feature-value' }>;
type SeriesSource = Extract<FeatureColumnSpec['source'], { kind: 'series' }>;
type DateParts = Extract<ColumnEncoding, { kind: 'date-parts' }>['parts'];
interface UncoveredTally { readonly Entity: string; readonly Field: string; readonly HistoryStart: string | null; Rows: number }
interface AssembledRows { readonly Rows: AssembledRow[]; readonly Excluded: Set<string>; readonly Uncovered: UncoveredTally[] }
/** One stored record the stable-value rule judges, with the unit rows whose values its stored fields stand for. */
interface StableRead { readonly Key: string; readonly Rows: readonly AssemblyRowRef[] }
/** The rule's verdict on a stored record; `changed` and `uncovered` refuse the assembly and are never returned. */
type StableOutcome = 'stable' | 'created-after' | 'changed' | 'uncovered' | 'excluded';
/** The verdicts of a stable-value check, aligned with its reads, the history it read (null when none was) and where it starts. */
interface StableValues { readonly Outcomes: readonly StableOutcome[]; readonly History: EntityHistory | null; readonly HistoryStart: string | null }
type CategoryFold = NonNullable<ColumnProvenance['categoryFold']>;
/** Coverage per entity and field (`entity|field`): one entry for every history the assembly read. */
type CoverageByField = Map<string, ChangeHistoryCoverage>;
/**
 * The state of one assembly: the coverage read so far, the histories loaded (one per entity, field list and key set)
 * and, per windowed-aggregate column, the late-entered child rows dropped from owner windows.
 */
interface AssemblyState { readonly Coverage: CoverageByField; readonly Histories: Map<string, EntityHistory>; readonly LateEntered: Map<string, number> }

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
    const state: AssemblyState = { Coverage: new Map(), Histories: new Map(), LateEntered: new Map() };
    const readers = await this.buildReaders(input, state);
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
      Coverage: [...state.Coverage.values()],
      Preprocessing: AsOfFeatureAssembler.BuildPreprocessingOps(columns, input.Features, input.ExplicitOps || []),
      ColumnProvenance: readers.map((r) => AsOfFeatureAssembler.columnProvenance(r.Spec, input, state, folded.Folds.get(r.Spec.name))),
      CategoryLevels: folded.Levels,
    };
  }

  private static columnProvenance(spec: FeatureColumnSpec, input: AsOfAssemblyInput, state: AssemblyState, fold: CategoryFold | undefined): ColumnProvenance {
    const base: ColumnProvenance = { column: spec.name, source: spec.source.kind, sourceRef: AsOfFeatureAssembler.describeSource(spec), sourceVersion: AsOfFeatureAssembler.columnVersion(spec, input, state) };
    const dropped = state.LateEntered.get(spec.name);
    const withDrops: ColumnProvenance = dropped === undefined ? base : { ...base, lateEnteredDropped: dropped };
    return fold && fold.folded.length > 0 ? { ...withDrops, categoryFold: fold } : withDrops;
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
  private async buildReaders(input: AsOfAssemblyInput, state: AssemblyState): Promise<ColumnReader[]> {
    const readers: ColumnReader[] = [];
    for (const spec of input.Features) {
      if (spec.encoding.kind === 'identifier') continue;
      AsOfFeatureAssembler.assertEncodable(spec);
      readers.push({ Spec: spec, Read: await this.readerFor(spec, input, state) });
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

  private async readerFor(spec: FeatureColumnSpec, input: AsOfAssemblyInput, state: AssemblyState): Promise<FeatureReader> {
    const source = spec.source;
    switch (source.kind) {
      case 'immutable-field':
      case 'record-changes': return this.fieldReader(spec, source, input, state);
      case 'windowed-aggregate': return this.aggregateReader(spec, source, input, state);
      case 'series': return this.seriesReader(spec, source, input);
      case 'feature-value': return this.featureValueReader(spec, source, input);
    }
  }

  /**
   * A field read as of the decision day: replayed from Record Changes (updatable fields), or read from the stored row
   * when the stable-value rule says the stored value is the value on every decision day.
   */
  private async fieldReader(spec: FeatureColumnSpec, source: FieldSource, input: AsOfAssemblyInput, state: AssemblyState): Promise<FeatureReader> {
    const entity = source.entity === input.RowEntity.Name ? input.RowEntity : input.Metadata.Entity(source.entity);
    if (!entity) throw new AssemblyRefused({ kind: 'unresolved-column', entity: source.entity, field: source.field });
    const join = await this.keyResolver(source.keyField, input, (row) => row.RowId, state);
    const keyOf = join.KeyOf;
    if (source.kind === 'immutable-field') return AsOfFeatureAssembler.throughJoin(spec, join, await this.currentValueReader(spec, source, entity, keyOf, input, state), input);
    const keys = input.Rows.map((r) => keyOf(r)).filter((k): k is string => k !== null);
    const history = await AsOfFeatureAssembler.loadHistory(entity, keys, [source.field], input, state);
    return AsOfFeatureAssembler.throughJoin(spec, join, this.replayReader(spec, source, entity, keyOf, history, input), input);
  }

  /**
   * The entity's history for `keys` and `fields`, loaded once per assembly for one entity, field list and key set (keys
   * case-folded and deduplicated), so every feature that reads the same records shares one load, and that load's
   * coverage is recorded once.
   */
  private static async loadHistory(entity: AssemblyEntityInfo, keys: readonly string[], fields: readonly string[], input: AsOfAssemblyInput, state: AssemblyState): Promise<EntityHistory> {
    const unique = AsOfFeatureAssembler.uniqueKeys(keys);
    const cacheKey = JSON.stringify([entity.Name, [...fields].sort(OrdinalCompare), unique.map((k) => k.toLowerCase()).sort(OrdinalCompare)]);
    const cached = state.Histories.get(cacheKey);
    if (cached) return cached;
    const history = await input.History.Load(entity, unique, fields, input.Unit.history, input.AssembledAt);
    state.Histories.set(cacheKey, history);
    for (const field of fields) AsOfFeatureAssembler.recordCoverage(state.Coverage, entity, field, history);
    return history;
  }

  /**
   * Records one history load for one entity and field. A second load of the same field (another key set, through
   * another join or as a child entity's field) merges into the first: no history start wins over any start, else the
   * later start, and the continuity counts add.
   */
  private static recordCoverage(coverage: CoverageByField, entity: AssemblyEntityInfo, field: string, history: EntityHistory): void {
    const k = `${entity.Name}|${field}`;
    const read: ChangeHistoryCoverage = { ...history.Coverage, field };
    const prior = coverage.get(k);
    coverage.set(k, prior ? AsOfFeatureAssembler.mergeCoverage(prior, read) : read);
  }

  private static mergeCoverage(a: ChangeHistoryCoverage, b: ChangeHistoryCoverage): ChangeHistoryCoverage {
    // History starts are ISO instants, so the ordinal order is the time order.
    const historyStart = a.historyStart === null || b.historyStart === null ? null : OrdinalCompare(a.historyStart, b.historyStart) >= 0 ? a.historyStart : b.historyStart;
    return {
      ...a,
      historyStart,
      continuity: { checkedAt: a.continuity.checkedAt, recordsReplayed: a.continuity.recordsReplayed + b.continuity.recordsReplayed, recordsMismatched: a.continuity.recordsMismatched + b.continuity.recordsMismatched },
    };
  }

  /**
   * The value Record Changes say the field held as of the decision day. A row with no join key has no record to replay,
   * so its value is missing; so is a record created after the decision day. A row the history cannot replay is uncovered.
   */
  private replayReader(spec: FeatureColumnSpec, source: FieldSource, entity: AssemblyEntityInfo, keyOf: KeyOf, history: EntityHistory, input: AsOfAssemblyInput): FeatureReader {
    return (row) => {
      const key = keyOf(row);
      if (key === null) return AsOfFeatureAssembler.missingValue(spec, 'none', 'none', input);
      const asOf = AsOfFeatureAssembler.asOfInstant(row.DecisionDate);
      const hv = history.ValueAt(key, source.field, asOf);
      if (hv.Status === 'uncovered') {
        if (AsOfFeatureAssembler.createdAfter(history, key, asOf, null)) return AsOfFeatureAssembler.missingValue(spec, AsOfFeatureAssembler.fieldRef(entity, key, source.field), 'created-after-decision', input);
        return { Uncovered: true, Entity: entity.Name, Field: source.field, HistoryStart: history.Coverage.historyStart };
      }
      return {
        Value: hv.Value,
        Provenance: { column: spec.name, source: 'record-changes', sourceRef: AsOfFeatureAssembler.fieldRef(entity, key, source.field), sourceVersion: hv.ChangeId, computedAt: hv.ChangedAt.toISOString() },
      };
    };
  }

  /**
   * The stored value of a field the stable-value rule admits. A record created after a row's decision day (by the one
   * creation rule, `creationInstant`) reads as missing, never as its stored value; a record the rule excludes makes its
   * row uncovered. The provenance carries the creation instant when it is known.
   */
  private async currentValueReader(spec: FeatureColumnSpec, source: FieldSource, entity: AssemblyEntityInfo, keyOf: KeyOf, input: AsOfAssemblyInput, state: AssemblyState): Promise<FeatureReader> {
    const reads = AsOfFeatureAssembler.rowReads(input.Rows, keyOf);
    const hasCreatedAt = AsOfFeatureAssembler.hasField(entity, '__mj_CreatedAt');
    // Read first: a key with no record is a short read, whatever the history of the records that exist.
    const current = await KeyedReader.ReadByKeys(input.DataAccess, entity.Name, entity.PrimaryKey, reads.map((r) => r.Key), hasCreatedAt ? [source.field, '__mj_CreatedAt'] : [source.field]);
    if (current.Status === 'refused') throw new AssemblyRefused(current.Refusal);
    const storedCreatedAt = (key: string): CellValue => (hasCreatedAt ? current.Rows.get(key.toLowerCase())?.__mj_CreatedAt : null);
    const stable = await this.assertStableCurrentValue(entity, source.field, reads, storedCreatedAt, input, state);
    const outcomes = AsOfFeatureAssembler.outcomesByRow(reads, stable);
    return (row) => {
      const key = keyOf(row);
      if (outcomes.get(row.RowId) === 'excluded') return { Uncovered: true, Entity: entity.Name, Field: source.field, HistoryStart: stable.HistoryStart };
      const rec = key === null ? undefined : current.Rows.get(key.toLowerCase());
      const created = key === null ? null : AsOfFeatureAssembler.creationInstant(stable.History, key, storedCreatedAt(key));
      const createdAfter = !AsOfFeatureAssembler.existedBefore(created, AsOfFeatureAssembler.asOfInstant(row.DecisionDate));
      const version = createdAfter ? 'created-after-decision' : created !== null ? `created:${created.toISOString()}` : 'immutable-after-create';
      return {
        Value: rec && !createdAfter ? rec[source.field] : null,
        Provenance: {
          column: spec.name, source: 'immutable-field', sourceRef: AsOfFeatureAssembler.fieldRef(entity, key, source.field), sourceVersion: version,
          computedAt: created !== null ? created.toISOString() : input.AssembledAt.toISOString(),
        },
      };
    };
  }

  /**
   * The stable-value rule for values read from stored rows: a field, the key field a row joins through, or the fields a
   * windowed aggregate reads from its child rows. Each read is one stored record and the unit rows whose values its
   * stored fields stand for; it is judged at the earliest of those rows' decision instants at which the record existed.
   * The stored value stands (`stable`) when the field is declared not updatable, or the entity tracks Record Changes,
   * the history covers that instant and no update to the field follows it. A record created after a row's decision
   * instant did not exist then (`created-after`); one the history cannot replay for another reason (a continuity
   * mismatch, a deletion, an ineligible external row) is `excluded`, as a replayed field treats it. An update after the
   * instant refuses `select-changes-after-decision-date`; a history that starts after it with a Snapshot, or no history,
   * refuses `decision-date-before-change-history`; both count the distinct unit rows whose own decision instant is
   * affected. An updatable field of an untracked entity cannot be known on a past day and refuses for every unit row.
   * On a tracked entity the history is read for every field, a field declared not updatable included: its stored value
   * is the value since creation, so only the creation instant is consulted for it. Creation follows the one creation
   * rule, so a record whose history starts with a Snapshot after the decision day but whose `__mj_CreatedAt`
   * (`storedCreatedAt`, null when the entity does not list it) is after it too did not exist then, and is not uncovered.
   */
  private async assertStableCurrentValue(
    entity: AssemblyEntityInfo, field: string, reads: readonly StableRead[], storedCreatedAt: (key: string) => CellValue, input: AsOfAssemblyInput, state: AssemblyState,
  ): Promise<StableValues> {
    const info = entity.Fields.find((f) => f.Name === field);
    if (!info) throw new AssemblyRefused({ kind: 'unresolved-column', entity: entity.Name, field });
    const unread: StableValues = { Outcomes: reads.map(() => 'stable'), History: null, HistoryStart: null };
    if (reads.length === 0) return unread;
    if (!entity.TrackRecordChanges) {
      if (info.AllowUpdateAPI === false) return unread;
      throw new AssemblyRefused({ kind: 'decision-date-before-change-history', entity: entity.Name, field, historyStart: null, rowsAffected: AsOfFeatureAssembler.distinctRows(reads) });
    }
    const history = await AsOfFeatureAssembler.loadHistory(entity, reads.map((r) => r.Key), [field], input, state);
    const judge = (key: string, at: Date): StableOutcome => (info.AllowUpdateAPI === false
      ? (AsOfFeatureAssembler.createdAfter(history, key, at, storedCreatedAt(key)) ? 'created-after' : 'stable')
      : AsOfFeatureAssembler.judgeStoredValue(history, key, field, at, storedCreatedAt(key)));
    const instants = AsOfFeatureAssembler.instantsOf(reads);
    const outcomes = reads.map((r) => AsOfFeatureAssembler.outcomeOf(r, instants.get(r.Rows), judge));
    const changed = AsOfFeatureAssembler.affectedRows(reads, outcomes, 'changed', judge);
    if (changed > 0) throw new AssemblyRefused({ kind: 'select-changes-after-decision-date', entity: entity.Name, field, changesAfter: changed });
    const uncovered = AsOfFeatureAssembler.affectedRows(reads, outcomes, 'uncovered', judge);
    if (uncovered > 0) throw new AssemblyRefused({ kind: 'decision-date-before-change-history', entity: entity.Name, field, historyStart: history.Coverage.historyStart, rowsAffected: uncovered });
    return { Outcomes: outcomes, History: history, HistoryStart: history.Coverage.historyStart };
  }

  /** The rule's verdict on one stored record at one instant (the order of the checks is the order of the doc above). */
  private static judgeStoredValue(history: EntityHistory, key: string, field: string, at: Date, storedCreatedAt: CellValue): StableOutcome {
    if (AsOfFeatureAssembler.createdAfter(history, key, at, storedCreatedAt)) return 'created-after';
    if (history.UpdatesAfter(key, field, at) > 0) return 'changed';
    const hv = history.ValueAt(key, field, at);
    if (hv.Status === 'value') return 'stable';
    return hv.Reason === 'before-history-start' || hv.Reason === 'no-history' ? 'uncovered' : 'excluded';
  }

  /**
   * Whether the record came into existence (by the one creation rule, `stored` being its `__mj_CreatedAt` or null) at
   * or after `at`: it did not exist on the decision day `at` closes.
   */
  private static createdAfter(history: EntityHistory, key: string, at: Date, stored: CellValue): boolean {
    return !AsOfFeatureAssembler.existedBefore(AsOfFeatureAssembler.creationInstant(history, key, stored), at);
  }

  /**
   * The one rule for when a record came into existence: its own Create row when the entity tracks Record Changes and
   * its history starts with one; else `__mj_CreatedAt` when the entity lists the column (`stored` is its value for the
   * record); when both are known, the later one, so neither source can make a record readable before the other says it
   * existed; else null, and the unit's premise that its records exist on their decision days applies.
   */
  private static creationInstant(history: EntityHistory | null, key: string, stored: CellValue): Date | null {
    const fromHistory = history === null ? null : history.CreatedAt(key);
    const fromColumn = AsOfFeatureAssembler.instantOf(stored);
    if (fromHistory === null || fromColumn === null) return fromHistory || fromColumn;
    return fromHistory.getTime() >= fromColumn.getTime() ? fromHistory : fromColumn;
  }

  /** Whether a record with creation instant `created` (null = unknown, the premise applies) existed before `at`. */
  private static existedBefore(created: Date | null, at: Date): boolean {
    return created === null || created.getTime() < at.getTime();
  }

  /** A read's verdict: at the earliest of its instants at which the record existed, or `created-after` when it never did. */
  private static outcomeOf(read: StableRead, instants: readonly Date[], judge: (key: string, at: Date) => StableOutcome): StableOutcome {
    for (const at of instants) {
      const outcome = judge(read.Key, at);
      if (outcome !== 'created-after') return outcome;
    }
    return 'created-after';
  }

  /** The distinct unit rows whose own decision instant gives `outcome`, over the reads whose verdict it is. */
  private static affectedRows(reads: readonly StableRead[], outcomes: readonly StableOutcome[], outcome: StableOutcome, judge: (key: string, at: Date) => StableOutcome): number {
    const ids = new Set<string>();
    reads.forEach((r, i) => {
      if (outcomes[i] !== outcome) return;
      const byInstant = new Map<number, boolean>();
      for (const row of r.Rows) {
        const at = AsOfFeatureAssembler.asOfInstant(row.DecisionDate);
        if (!byInstant.has(at.getTime())) byInstant.set(at.getTime(), judge(r.Key, at) === outcome);
        if (byInstant.get(at.getTime())) ids.add(row.RowId);
      }
    });
    return ids.size;
  }

  /** The distinct decision instants of each reads' rows, ascending, computed once per rows list (child reads share one). */
  private static instantsOf(reads: readonly StableRead[]): Map<readonly AssemblyRowRef[], readonly Date[]> {
    const out = new Map<readonly AssemblyRowRef[], readonly Date[]>();
    for (const r of reads) {
      if (out.has(r.Rows)) continue;
      const times = [...new Set(r.Rows.map((row) => AsOfFeatureAssembler.asOfInstant(row.DecisionDate).getTime()))].sort((a, b) => a - b);
      out.set(r.Rows, times.map((t) => new Date(t)));
    }
    return out;
  }

  /** The number of distinct unit rows the reads stand for. */
  private static distinctRows(reads: readonly StableRead[]): number {
    const ids = new Set<string>();
    for (const rows of new Set(reads.map((r) => r.Rows))) for (const row of rows) ids.add(row.RowId);
    return ids.size;
  }

  /** One read per unit row with a key: the record it reads, standing for that row alone. */
  private static rowReads(rows: readonly AssemblyRowRef[], keyOf: KeyOf): StableRead[] {
    const reads: StableRead[] = [];
    for (const row of rows) {
      const key = keyOf(row);
      if (key !== null) reads.push({ Key: key, Rows: [row] });
    }
    return reads;
  }

  /** The verdict of each unit row's own read (reads built by `rowReads`), by row id. */
  private static outcomesByRow(reads: readonly StableRead[], stable: StableValues): Map<string, StableOutcome> {
    return new Map(reads.map((r, i) => [r.Rows[0].RowId, stable.Outcomes[i]]));
  }

  /** The keys with case-insensitive duplicates removed (first spelling kept), as a keyed read deduplicates them. */
  private static uniqueKeys(keys: readonly string[]): string[] {
    const seen = new Map<string, string>();
    for (const k of keys) if (!seen.has(k.toLowerCase())) seen.set(k.toLowerCase(), k);
    return [...seen.values()];
  }

  /**
   * A windowed aggregate over the owner's child rows; its version hashes the contributing rows (and their update times).
   * Every child row read passes the stable-value rule before any value is used, and a child row that did not exist on
   * the owner row's decision day (late-entered) is dropped from that owner's window; the drops are recorded per column.
   */
  private async aggregateReader(spec: FeatureColumnSpec, source: WindowedAggregateSource, input: AsOfAssemblyInput, state: AssemblyState): Promise<FeatureReader> {
    const { Child: child, Index: index, Keys: keys, CreatedAt: createdAt } = await this.childIndex(source, input);
    // The contract: a null owner key field means the row's entity key.
    const join = await this.keyResolver(source.ownerKeyField, input, (row) => row.EntityKey, state);
    const excluded = await this.assertStableChildRows(child, source, keys, (key) => createdAt.get(key.toLowerCase()) || null, input, state);
    const history = child.TrackRecordChanges && keys.length > 0 ? await AsOfFeatureAssembler.loadHistory(child, keys, [source.foreignKey], input, state) : null;
    const existedAt = (c: ChildRow, at: Date): boolean => AsOfFeatureAssembler.existedBefore(AsOfFeatureAssembler.creationInstant(history, c.Id, createdAt.get(c.Id.toLowerCase())), at);
    const values = new Map<AssemblyRowRef, RawValue>();
    let dropped = 0;
    for (const row of input.Rows) {
      if (join.CreatedAfter(row) || join.UncoveredFor(row) !== null) continue;
      const owner = join.KeyOf(row);
      if (owner === null) {
        values.set(row, AsOfFeatureAssembler.aggregateValue(spec, source, null, row, [], null, input));
        continue;
      }
      const agg = AsOfFeatureAssembler.aggregateOfPresentRows(index, owner, row, source, existedAt);
      dropped += agg.Dropped;
      values.set(row, AsOfFeatureAssembler.aggregateValue(spec, source, owner, row, agg.Contributors, agg.Value, input));
    }
    // A column whose every row is uncovered read no window, so it has no drop count to report.
    if (excluded === null) state.LateEntered.set(spec.name, dropped);
    return AsOfFeatureAssembler.throughJoin(spec, join, (row) => {
      if (excluded) return excluded;
      const v = values.get(row);
      if (!v) throw new Error(`Windowed aggregate ${spec.name}: row ${row.RowId} was not computed`);
      return v;
    }, input);
  }

  /**
   * One owner's aggregate as of its decision day over the child rows that existed then: the rows the full window would
   * have read but that were entered after the decision day are dropped and counted, and the aggregate is recomputed
   * over the owner's remaining rows.
   */
  private static aggregateOfPresentRows(
    index: ChildRowIndex, owner: string, row: AssemblyRowRef, source: WindowedAggregateSource, existedAt: (c: ChildRow, at: Date) => boolean,
  ): { readonly Value: number | null; readonly Contributors: readonly ChildRow[]; readonly Dropped: number } {
    const full = WindowedAggregates.ComputeWindowedAggregate(index, owner, row.DecisionDate, source);
    const asOf = AsOfFeatureAssembler.asOfInstant(row.DecisionDate);
    const late = full.Contributors.filter((c) => !existedAt(c, asOf)).length;
    if (late === 0) return { ...full, Dropped: 0 };
    const present = (index.get(owner.toLowerCase()) || []).filter((c) => existedAt(c, asOf));
    const recomputed = WindowedAggregates.ComputeWindowedAggregate(new Map([[owner.toLowerCase(), present]]), owner, row.DecisionDate, source);
    return { ...recomputed, Dropped: late };
  }

  /**
   * Every child row the index was built from passes the stable-value rule for the fields that decide what an aggregate
   * reads, judged for the whole batch (each read stands for every unit row): a child row re-owned or re-dated after a
   * decision day can move between owners, so none is exempt for contributing to no row. Every field is judged, so a
   * later field's refusal is never hidden by an earlier field's exclusion. A child row the rule excludes makes every
   * unit row uncovered for that field, since its owner on a past day cannot be trusted; the first such field's marker
   * is returned, else null.
   */
  private async assertStableChildRows(
    child: AssemblyEntityInfo, source: WindowedAggregateSource, keys: readonly string[], storedCreatedAt: (key: string) => CellValue, input: AsOfAssemblyInput, state: AssemblyState,
  ): Promise<Uncovered | null> {
    const reads: StableRead[] = keys.map((k) => ({ Key: k, Rows: input.Rows }));
    let excluded: Uncovered | null = null;
    for (const field of AsOfFeatureAssembler.childStableFields(source)) {
      const stable = await this.assertStableCurrentValue(child, field, reads, storedCreatedAt, input, state);
      if (excluded === null && stable.Outcomes.includes('excluded')) excluded = { Uncovered: true, Entity: child.Name, Field: field, HistoryStart: stable.HistoryStart };
    }
    return excluded;
  }

  /** One aggregate value; a row with no owner key has no child rows ('' would read the bucket of ownerless child rows). */
  private static aggregateValue(
    spec: FeatureColumnSpec, source: WindowedAggregateSource, owner: string | null, row: AssemblyRowRef, contributors: readonly ChildRow[], value: number | null, input: AsOfAssemblyInput,
  ): RawValue {
    const sourceRef = owner === null ? 'none'
      : `${source.childEntity}?${source.foreignKey}=${owner.toLowerCase()}&as-of=${UtcDay.UtcDayIso(AsOfFeatureAssembler.decisionDay(row.DecisionDate))}&aggregate=${source.aggregate}`;
    return { Value: value, Provenance: { column: spec.name, source: 'windowed-aggregate', sourceRef, sourceVersion: AsOfFeatureAssembler.ContributorsVersion(contributors), computedAt: input.AssembledAt.toISOString() } };
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
  private async keyResolver(keyField: string | null, input: AsOfAssemblyInput, fallback: KeyOf, state: AssemblyState): Promise<JoinKeys> {
    if (keyField === null) return { KeyOf: fallback, CreatedAfter: () => false, UncoveredFor: () => null };
    const reads = AsOfFeatureAssembler.rowReads(input.Rows, (row) => row.RowId);
    const hasCreatedAt = AsOfFeatureAssembler.hasField(input.RowEntity, '__mj_CreatedAt');
    // Read first, as a current value is: a unit row with no record is a short read, whatever its history.
    const rowsById = await KeyedReader.ReadByKeys(input.DataAccess, input.RowEntity.Name, input.RowEntity.PrimaryKey, reads.map((r) => r.Key), hasCreatedAt ? [keyField, '__mj_CreatedAt'] : [keyField]);
    if (rowsById.Status === 'refused') throw new AssemblyRefused(rowsById.Refusal);
    const storedCreatedAt = (key: string): CellValue => (hasCreatedAt ? rowsById.Rows.get(key.toLowerCase())?.__mj_CreatedAt : null);
    const stable = await this.assertStableCurrentValue(input.RowEntity, keyField, reads, storedCreatedAt, input, state);
    const outcomes = AsOfFeatureAssembler.outcomesByRow(reads, stable);
    const createdAfter = (row: AssemblyRowRef): boolean => {
      const created = AsOfFeatureAssembler.creationInstant(stable.History, row.RowId, storedCreatedAt(row.RowId));
      return !AsOfFeatureAssembler.existedBefore(created, AsOfFeatureAssembler.asOfInstant(row.DecisionDate));
    };
    const uncoveredFor = (row: AssemblyRowRef): Uncovered | null =>
      (outcomes.get(row.RowId) === 'excluded' ? { Uncovered: true, Entity: input.RowEntity.Name, Field: keyField, HistoryStart: stable.HistoryStart } : null);
    return {
      CreatedAfter: createdAfter,
      UncoveredFor: uncoveredFor,
      KeyOf: (row) => {
        if (createdAfter(row) || uncoveredFor(row) !== null) return null;
        const v = rowsById.Rows.get(row.RowId.toLowerCase())?.[keyField];
        return v === null || v === undefined ? null : String(v);
      },
    };
  }

  /** A reader behind a join: a row uncovered for the key field is uncovered; one created after its decision day reads as missing. */
  private static throughJoin(spec: FeatureColumnSpec, join: JoinKeys, read: FeatureReader, input: AsOfAssemblyInput): FeatureReader {
    return (row) => {
      const uncovered = join.UncoveredFor(row);
      if (uncovered !== null) return uncovered;
      return join.CreatedAfter(row) ? AsOfFeatureAssembler.missingValue(spec, 'none', 'created-after-decision', input) : read(row);
    };
  }

  /** A missing value with the given source reference and version, computed at the assembly time. */
  private static missingValue(spec: FeatureColumnSpec, sourceRef: string, sourceVersion: string, input: AsOfAssemblyInput): RawValue {
    return { Value: null, Provenance: { column: spec.name, source: spec.source.kind, sourceRef, sourceVersion, computedAt: input.AssembledAt.toISOString() } };
  }

  /**
   * The child entity, its indexed rows, the keys of every row read (the index skips undated and filtered-out rows) and,
   * when the entity lists `__mj_CreatedAt`, each row's value of it by lower-cased key.
   */
  private async childIndex(source: WindowedAggregateSource, input: AsOfAssemblyInput): Promise<{ readonly Child: AssemblyEntityInfo; readonly Index: ChildRowIndex; readonly Keys: readonly string[]; readonly CreatedAt: ReadonlyMap<string, CellValue> }> {
    const child = input.Metadata.Entity(source.childEntity);
    if (!child) throw new AssemblyRefused({ kind: 'unresolved-column', entity: source.childEntity, field: '*' });
    const hasCreatedAt = AsOfFeatureAssembler.hasField(child, '__mj_CreatedAt');
    const fields = [
      child.PrimaryKey, source.foreignKey, source.dateField, source.endDateField, source.voidedAtField, source.valueField, ...source.filter.map((f) => f.field),
      AsOfFeatureAssembler.hasField(child, '__mj_UpdatedAt') ? '__mj_UpdatedAt' : null, hasCreatedAt ? '__mj_CreatedAt' : null,
    ].filter((f): f is string => !!f);
    const read = await CompleteReader.ReadCompletely(input.DataAccess, { EntityName: child.Name, KeyField: child.PrimaryKey, Fields: [...new Set(fields)] }, input.Read);
    if (read.Status === 'refused') throw new AssemblyRefused(read.Refusal);
    const keyOf = (r: SourceRow): string => String(r[child.PrimaryKey]);
    return {
      Child: child,
      Index: WindowedAggregates.BuildChildRowIndex(read.Rows, source, child.PrimaryKey),
      Keys: read.Rows.map(keyOf),
      CreatedAt: new Map(hasCreatedAt ? read.Rows.map((r) => [keyOf(r).toLowerCase(), r.__mj_CreatedAt] as const) : []),
    };
  }

  /**
   * A windowed aggregate's source version: the sha-256 of the contributing rows, `ID:updatedAt` per row (or the ID
   * alone when the row has no update time), sorted, one per line. The one rule for the version, so a reader that
   * rebuilds the contributor set can check a stored version against it.
   */
  public static ContributorsVersion(contributors: readonly ChildRow[]): string {
    const lines = contributors.map((c) => (c.UpdatedAt ? `${c.Id}:${c.UpdatedAt}` : c.Id)).sort();
    return createHash('sha256').update(lines.join('\n')).digest('hex');
  }

  /** The per-column version summary stored on the snapshot (per-value versions are in the provenance file). */
  private static columnVersion(spec: FeatureColumnSpec, input: AsOfAssemblyInput, state: AssemblyState): string {
    const s = spec.source;
    switch (s.kind) {
      case 'record-changes': return `history-start:${state.Coverage.get(`${s.entity}|${s.field}`)?.historyStart || 'none'}`;
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
