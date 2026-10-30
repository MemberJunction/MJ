/**
 * Resolves one assembled value's provenance back to its source and to the scored row it belongs to: the reference
 * must name that row (its key, its join key, its decision day), the record (or Record Change, or contributing child
 * rows) it names is read again, the value is re-derived from it with the column's encoding and compared with the
 * matrix cells, and the source version and computed-at are checked against what the source says.
 *
 * Reads go through the engine's read seams (the production ones read with RunView, `simple` rows, `Fields`), every key
 * taken from a provenance reference is escaped in the filter and re-checked on the rows returned, and IDs are compared
 * with `UUIDsEqual`. A value that cannot be resolved does not resolve: there is no "skipped".
 */
import { CompositeKey, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { EscapeSQLString, OrdinalCompare, UUIDsEqual } from '@memberjunction/global';
import type { MJRecordChangeEntity } from '@memberjunction/core-entities';
import { JsonParse, type ColumnEncoding, type DatedSource, type FeatureColumnSpec, type ValueProvenance, type WindowedAggregateSource } from '@memberjunction/predictive-studio-core';
import {
  AsOfFeatureAssembler, OTHER_CATEGORY_LEVEL, ProviderAssemblyMetadata, RecordHistory, RunViewDataAccess, UtcDay, WindowedAggregates,
  type AssemblyEntityInfo, type CellValue, type FetchRowsParams, type IAssemblyMetadata, type IFeatureDataAccess, type MatrixCell, type SourceRow,
} from '@memberjunction/predictive-studio';

/** Where the resolver reads: the data-access and metadata seams the assembly itself reads through. */
export interface ProvenanceSources {
  readonly DataAccess: IFeatureDataAccess;
  readonly Metadata: IAssemblyMetadata;
}

/** The scored row a value belongs to, as read independently of the assembly. */
export interface ScoredRowBinding {
  /** The unit row entity's name. */
  readonly Entity: string;
  /** The row's key (the row entity's primary key value). */
  readonly RowId: string;
  /** The row's decision date, computed by the unit's rule from the row's stored fields. */
  readonly DecisionDate: Date;
  /** The row's stored fields the features join through (key fields and aggregate owner key fields). */
  readonly Fields: SourceRow;
}

/** One value to resolve: its provenance entry, its matrix cells, its column spec and fold, and the row it belongs to. */
export interface ProvenanceCheck {
  /** The value's provenance entry (one per feature). */
  readonly Provenance: ValueProvenance;
  /** The matrix cells of the entry's feature, in column order (one, or several for date parts). */
  readonly Cells: readonly MatrixCell[];
  /** The feature's column spec, as the training assembly resolved it. */
  readonly Spec: FeatureColumnSpec;
  /** The levels the column's category fold folded into `__other` (empty when it folded none). */
  readonly Folded: readonly string[];
  /** The scored row the value belongs to. */
  readonly Row: ScoredRowBinding;
}

/** A field source of a feature column (`immutable-field` or `record-changes`). */
type FieldSource = Extract<DatedSource, { kind: 'immutable-field' | 'record-changes' }>;

/** A parsed `<entity>/<lower-cased key>/<field>` reference. */
interface FieldRef { readonly Entity: string; readonly Key: string; readonly Field: string }

/** A parsed `<child>?<fk>=<owner>&as-of=<day>&aggregate=<agg>` reference. */
interface AggregateRef { readonly Child: string; readonly Owner: string; readonly AsOfDay: string; readonly Aggregate: string }

/** One Record Change as compared: its id, type, instant and full record. */
interface ChangeAt { readonly ID: string; readonly Type: string; readonly ChangedAt: Date; readonly FullRecordJSON: string }

/** Two numbers agree when they differ by at most this much, relative to the larger of 1 and the expected value. */
const NUMERIC_TOLERANCE = 1e-12;
/** Version of a value read as missing because its record did not exist on the decision day. */
const CREATED_AFTER_DECISION = 'created-after-decision';
/** Version of an immutable value whose record's creation instant is unknown. */
const IMMUTABLE_AFTER_CREATE = 'immutable-after-create';
/** Prefix of an immutable value's version when its record's creation instant is known. */
const CREATED_PREFIX = 'created:';
const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** The Record Change fields the resolver reads. */
const RECORD_CHANGE_FIELDS: ReadonlyArray<keyof MJRecordChangeEntity> = ['ID', 'EntityID', 'RecordID', 'Type', 'Status', 'ChangedAt', 'FullRecordJSON'];

/** The provenance resolver, as static members on one owner class. */
export class ProvenanceResolver {
  /** The production read seams on a provider, as the acting user (the ones the assembly reads through). */
  public static Sources(provider: IMetadataProvider, user: UserInfo): ProvenanceSources {
    return { DataAccess: new RunViewDataAccess(user, provider), Metadata: new ProviderAssemblyMetadata(provider) };
  }

  /** Whether one assembled value names its scored row and resolves to its source, its source version and its computed-at. */
  public static async ResolveValueProvenance(sources: ProvenanceSources, check: ProvenanceCheck): Promise<boolean> {
    const { Provenance: p, Spec: spec } = check;
    if (p.column !== spec.name || p.source !== spec.source.kind || !ProvenanceResolver.computedAtValid(p.computedAt)) return false;
    const s = spec.source;
    switch (s.kind) {
      case 'immutable-field': return ProvenanceResolver.resolveImmutableField(sources, check, s);
      case 'record-changes': return ProvenanceResolver.resolveRecordChange(sources, check, s);
      case 'windowed-aggregate': return ProvenanceResolver.resolveWindowedAggregate(sources, check, s);
      // Series and feature-value sources are not re-derived here, so their values never count as resolved.
      case 'series':
      case 'feature-value': return false;
    }
  }

  /**
   * The folded levels of each categorical column, by column name, from a snapshot's stored `ColumnProvenance` JSON
   * (columns without a fold are absent).
   */
  public static FoldedLevels(columnProvenanceJson: string): Map<string, readonly string[]> {
    const out = new Map<string, readonly string[]>();
    const parsed = JsonParse.ParseJsonText(columnProvenanceJson, 'ColumnProvenance');
    if (parsed.Ok === false || !Array.isArray(parsed.Value)) throw new Error('The snapshot ColumnProvenance is not a JSON array');
    for (const entry of parsed.Value) {
      if (!JsonParse.IsJsonObject(entry)) continue;
      const column = JsonParse.JsonString(entry, 'column');
      const fold = JsonParse.JsonObjectField(entry, 'categoryFold');
      const levels = fold ? JsonParse.JsonStringArray(fold, 'folded') : null;
      if (column !== null && levels !== null && levels.length > 0) out.set(column, levels);
    }
    return out;
  }

  // ----- immutable fields -----

  /**
   * The stored record by key: the reference names the row's own record (or the record its key field joins to), the
   * field equals the cell, and the version is `created:<instant>` when the record's creation instant is known (it
   * must equal that instant, and so must `computedAt`) or `immutable-after-create` when it is not.
   * `created-after-decision` resolves to a missing value.
   */
  private static async resolveImmutableField(sources: ProvenanceSources, check: ProvenanceCheck, source: FieldSource): Promise<boolean> {
    const { Provenance: p, Cells: cells } = check;
    const target = ProvenanceResolver.fieldTarget(sources, p.sourceRef, source, check.Row);
    if (target === null) return false;
    if (p.sourceVersion === CREATED_AFTER_DECISION) return ProvenanceResolver.allMissing(cells);
    const { Entity: entity, Ref: ref } = target;
    const hasCreatedAt = ProvenanceResolver.hasField(entity, '__mj_CreatedAt');
    const row = await ProvenanceResolver.readByKey(sources, entity, ref.Key, hasCreatedAt ? [ref.Field, '__mj_CreatedAt'] : [ref.Field]);
    if (row === null || !ProvenanceResolver.cellsMatch(check.Spec.encoding, row[ref.Field], cells, check.Folded)) return false;
    const created = await ProvenanceResolver.creationInstant(sources, entity, ref.Key, hasCreatedAt ? row.__mj_CreatedAt : null);
    if (p.sourceVersion === IMMUTABLE_AFTER_CREATE) return created === null;
    if (!p.sourceVersion.startsWith(CREATED_PREFIX) || created === null) return false;
    const versionAt = Date.parse(p.sourceVersion.slice(CREATED_PREFIX.length));
    return versionAt === created.getTime() && Date.parse(p.computedAt) === created.getTime();
  }

  /**
   * When a record came into existence, by the assembly's one creation rule: its own Create row when the entity tracks
   * Record Changes and its history starts with one, its `__mj_CreatedAt` when the entity lists the column, the later
   * of the two when both are known, else null.
   */
  private static async creationInstant(sources: ProvenanceSources, entity: AssemblyEntityInfo, key: string, stored: CellValue): Promise<Date | null> {
    const fromHistory = entity.TrackRecordChanges ? (await ProvenanceResolver.createRowInstants(sources, entity, [key])).get(key.toLowerCase()) || null : null;
    return ProvenanceResolver.laterOf(ProvenanceResolver.instantOf(stored), fromHistory);
  }

  /** The later of two known instants; when one is unknown, the other (null when both are). */
  private static laterOf(a: Date | null, b: Date | null): Date | null {
    if (a === null || b === null) return a || b;
    return b.getTime() >= a.getTime() ? b : a;
  }

  /**
   * For each key, its Create instant when its history starts with its own Create row (by lower-cased key), as the
   * assembly's history decides it: the history starts at the record's first Create or Snapshot row (earlier Update rows
   * do not start it), and only a Create row says when the record was created. Keys whose history starts with a
   * Snapshot, or that have none, are absent.
   */
  private static async createRowInstants(sources: ProvenanceSources, entity: AssemblyEntityInfo, keys: readonly string[]): Promise<Map<string, Date>> {
    const out = new Map<string, Date>();
    for (const [key, changes] of await ProvenanceResolver.changesByKey(sources, entity, keys)) {
      const first = changes.find((c) => c.Type === 'Create' || c.Type === 'Snapshot');
      if (first && first.Type === 'Create') out.set(key, first.ChangedAt);
    }
    return out;
  }

  /**
   * The complete Record Changes of the given records of an entity, by lower-cased record key, each list in ChangedAt
   * order (ties by ID, ordinal), as the assembly's history orders them. The filter is re-checked on the rows read.
   */
  private static async changesByKey(sources: ProvenanceSources, entity: AssemblyEntityInfo, keys: readonly string[]): Promise<Map<string, ChangeAt[]>> {
    const wanted = new Set(keys.map((k) => k.toLowerCase()));
    const out = new Map<string, ChangeAt[]>();
    if (wanted.size === 0) return out;
    const recordIds = [...wanted].map((k) => `'${EscapeSQLString(CompositeKey.FromKeyValuePair(entity.PrimaryKey, k).ToURLSegment())}'`).join(',');
    const rows = await ProvenanceResolver.fetch(sources, {
      EntityName: 'MJ: Record Changes', Fields: [...RECORD_CHANGE_FIELDS],
      ExtraFilter: `[EntityID]='${EscapeSQLString(entity.ID)}' AND [Status]='Complete' AND [RecordID] IN (${recordIds})`,
    });
    for (const r of rows) {
      const key = RecordHistory.KeyOfRecordId(String(r.RecordID));
      const at = ProvenanceResolver.instantOf(r.ChangedAt);
      if (!wanted.has(key) || r.Status !== 'Complete' || !UUIDsEqual(String(r.EntityID), entity.ID) || at === null) continue;
      const list = out.get(key) || [];
      list.push({ ID: String(r.ID), Type: String(r.Type), ChangedAt: at, FullRecordJSON: String(r.FullRecordJSON || '{}') });
      out.set(key, list);
    }
    for (const list of out.values()) list.sort((a, b) => a.ChangedAt.getTime() - b.ChangedAt.getTime() || OrdinalCompare(a.ID, b.ID));
    return out;
  }

  // ----- Record Changes -----

  /**
   * The Record Change the version names: complete, of the reference's entity and the row's record, the latest of that
   * record's changes in effect on the row's decision day (made before the following day, as the assembly replays
   * history), its `FullRecordJSON` field equals the cell and its `ChangedAt` equals `computedAt`. A row read with no
   * join key (`none`/`none`) and a record created after the decision day resolve to a missing value.
   */
  private static async resolveRecordChange(sources: ProvenanceSources, check: ProvenanceCheck, source: FieldSource): Promise<boolean> {
    const { Provenance: p, Cells: cells } = check;
    if (p.sourceRef === 'none' && p.sourceVersion === 'none') return ProvenanceResolver.expectedKey(source, check.Row) === null && ProvenanceResolver.allMissing(cells);
    const target = ProvenanceResolver.fieldTarget(sources, p.sourceRef, source, check.Row);
    if (target === null) return false;
    if (p.sourceVersion === CREATED_AFTER_DECISION) return ProvenanceResolver.allMissing(cells);
    const changes = (await ProvenanceResolver.changesByKey(sources, target.Entity, [target.Ref.Key])).get(target.Ref.Key.toLowerCase()) || [];
    const before = ProvenanceResolver.dayAfterDecision(check.Row);
    const inEffect = before === null ? [] : changes.filter((c) => c.ChangedAt.getTime() < before.getTime());
    const change = inEffect[inEffect.length - 1];
    if (!change || !UUIDsEqual(change.ID, p.sourceVersion) || change.ChangedAt.getTime() !== Date.parse(p.computedAt)) return false;
    return ProvenanceResolver.cellsMatch(check.Spec.encoding, ProvenanceResolver.fieldOfSnapshot(change.FullRecordJSON, target.Ref.Field), cells, check.Folded);
  }

  /** One field of a Record Change's FullRecordJSON; a malformed snapshot or a non-scalar value reads as null. */
  private static fieldOfSnapshot(json: string, field: string): CellValue {
    const parsed = JsonParse.ParseJsonText(json, 'FullRecordJSON');
    if (parsed.Ok === false || !JsonParse.IsJsonObject(parsed.Value)) return null;
    const v = parsed.Value[field];
    return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? v : null;
  }

  // ----- windowed aggregates -----

  /**
   * The reference names the row's owner (the row's stored owner key) and the row's decision day; the owner's child
   * rows are read again and the aggregate rebuilt from the spec's window as of that day (rows entered after it dropped,
   * as the assembly drops them): the value equals the cell and the contributor hash equals the version. A row with no
   * owner resolves to a missing value with the empty contributor hash. A `created-after-decision` entry (the join
   * through the row's owner key read no owner because the row itself did not exist on its decision day) names no
   * record, so it is bound to the row by checking that claim: the row's own record was created on or after the day
   * after its decision day.
   */
  private static async resolveWindowedAggregate(sources: ProvenanceSources, check: ProvenanceCheck, source: WindowedAggregateSource): Promise<boolean> {
    const { Provenance: p, Cells: cells } = check;
    const owner = ProvenanceResolver.expectedOwner(source, check.Row);
    if (p.sourceVersion === CREATED_AFTER_DECISION) {
      if (p.sourceRef !== 'none' || source.ownerKeyField === null || !(await ProvenanceResolver.rowCreatedAfterDecision(sources, check.Row))) return false;
      return ProvenanceResolver.allMissing(cells);
    }
    if (p.sourceRef === 'none') return owner === null && ProvenanceResolver.allMissing(cells) && p.sourceVersion === AsOfFeatureAssembler.ContributorsVersion([]);
    const ref = ProvenanceResolver.parseAggregateRef(p.sourceRef, source.foreignKey);
    if (ref === null || owner === null || !UUIDsEqual(ref.Owner, owner) || ref.AsOfDay !== ProvenanceResolver.decisionDayIso(check.Row)) return false;
    if (ref.Child !== source.childEntity || ref.Aggregate !== source.aggregate || cells.length !== 1) return false;
    const child = sources.Metadata.Entity(ref.Child);
    if (!child) return false;
    const rows = await ProvenanceResolver.presentOwnerChildRows(sources, child, source, ref);
    const decision = new Date(`${ref.AsOfDay}T00:00:00.000Z`);
    const agg = WindowedAggregates.ComputeWindowedAggregate(WindowedAggregates.BuildChildRowIndex(rows, source, child.PrimaryKey), ref.Owner, decision, source);
    return ProvenanceResolver.numberMatches(agg.Value, cells[0]) && p.sourceVersion === AsOfFeatureAssembler.ContributorsVersion(agg.Contributors);
  }

  /**
   * The owner's child rows with the fields the assembly reads, minus those that did not exist on the reference's day:
   * a row's creation instant follows the assembly's one rule (the later of its Create row, when the child tracks
   * Record Changes, and its `__mj_CreatedAt`, when the child lists it), and a row created on or after the following
   * day is dropped.
   */
  private static async presentOwnerChildRows(sources: ProvenanceSources, child: AssemblyEntityInfo, source: WindowedAggregateSource, ref: AggregateRef): Promise<SourceRow[]> {
    const hasCreatedAt = ProvenanceResolver.hasField(child, '__mj_CreatedAt');
    const fields = [
      child.PrimaryKey, source.foreignKey, source.dateField, source.endDateField, source.voidedAtField, source.valueField, ...source.filter.map((f) => f.field),
      ProvenanceResolver.hasField(child, '__mj_UpdatedAt') ? '__mj_UpdatedAt' : null, hasCreatedAt ? '__mj_CreatedAt' : null,
    ].filter((f): f is string => !!f);
    const all = await ProvenanceResolver.fetch(sources, { EntityName: child.Name, ExtraFilter: `[${source.foreignKey}]='${EscapeSQLString(ref.Owner)}'`, Fields: [...new Set(fields)] });
    const rows = all.filter((row) => UUIDsEqual(String(row[source.foreignKey] || ''), ref.Owner));
    const keyOf = (row: SourceRow): string => String(row[child.PrimaryKey]).toLowerCase();
    const fromHistory = child.TrackRecordChanges ? await ProvenanceResolver.createRowInstants(sources, child, rows.map(keyOf)) : new Map<string, Date>();
    const asOf = UtcDay.AddUtcDays(new Date(`${ref.AsOfDay}T00:00:00.000Z`), 1).getTime();
    return rows.filter((row) => {
      const created = ProvenanceResolver.laterOf(hasCreatedAt ? ProvenanceResolver.instantOf(row.__mj_CreatedAt) : null, fromHistory.get(keyOf(row)) || null);
      return created === null || created.getTime() < asOf;
    });
  }

  /** Parses `<child>?<fk>=<owner>&as-of=<day>&aggregate=<agg>`; null when a part is missing or the day is malformed. */
  private static parseAggregateRef(ref: string, foreignKey: string): AggregateRef | null {
    const q = ref.indexOf('?');
    if (q < 0) return null;
    const params = new Map(ref.slice(q + 1).split('&').map((pair) => {
      const eq = pair.indexOf('=');
      return eq < 0 ? [pair, ''] as const : [pair.slice(0, eq), pair.slice(eq + 1)] as const;
    }));
    const owner = params.get(foreignKey);
    const day = params.get('as-of');
    const aggregate = params.get('aggregate');
    if (!owner || !day || !DAY.test(day) || !aggregate) return null;
    return { Child: ref.slice(0, q), Owner: owner, AsOfDay: day, Aggregate: aggregate };
  }

  // ----- the row binding -----

  /**
   * The key the row reads a field source through: its own key when the source has no key field, else its stored
   * value of the key field (null when that is empty).
   */
  private static expectedKey(source: FieldSource, row: ScoredRowBinding): string | null {
    if (source.keyField === null) return row.RowId;
    const v = row.Fields[source.keyField];
    return v === null || v === undefined || String(v) === '' ? null : String(v);
  }

  /**
   * The owner key a row's aggregate reads: its stored owner key field. An aggregate keyed on the row's entity key
   * (no owner key field) is not bound here, so it never resolves.
   */
  private static expectedOwner(source: WindowedAggregateSource, row: ScoredRowBinding): string | null {
    if (source.ownerKeyField === null) return null;
    const v = row.Fields[source.ownerKeyField];
    return v === null || v === undefined || String(v) === '' ? null : String(v);
  }

  /**
   * Whether the scored row's own record came into existence (by the assembly's creation rule) on or after the day after
   * its decision day; false when its creation instant is unknown (the unit's premise: it existed).
   */
  private static async rowCreatedAfterDecision(sources: ProvenanceSources, row: ScoredRowBinding): Promise<boolean> {
    const entity = sources.Metadata.Entity(row.Entity);
    const before = ProvenanceResolver.dayAfterDecision(row);
    if (!entity || before === null) return false;
    const hasCreatedAt = ProvenanceResolver.hasField(entity, '__mj_CreatedAt');
    const record = await ProvenanceResolver.readByKey(sources, entity, row.RowId, hasCreatedAt ? ['__mj_CreatedAt'] : []);
    if (record === null) return false;
    const created = await ProvenanceResolver.creationInstant(sources, entity, row.RowId, hasCreatedAt ? record.__mj_CreatedAt : null);
    return created !== null && created.getTime() >= before.getTime();
  }

  /** The start of the day after the row's decision day (anything before it was known on the decision day); null when the date is invalid. */
  private static dayAfterDecision(row: ScoredRowBinding): Date | null {
    const day = UtcDay.ToUtcDay(row.DecisionDate);
    return day === null ? null : UtcDay.AddUtcDays(day, 1);
  }

  /** The row's decision day, `YYYY-MM-DD`; '' when its decision date is invalid (which matches no reference). */
  private static decisionDayIso(row: ScoredRowBinding): string {
    const day = UtcDay.ToUtcDay(row.DecisionDate);
    return day === null ? '' : UtcDay.UtcDayIso(day);
  }

  // ----- shared reads and comparisons -----

  /**
   * The entity and parsed reference of a field source's `sourceRef`, when the reference names the spec's entity and
   * field and the record the row reads through.
   */
  private static fieldTarget(sources: ProvenanceSources, sourceRef: string, source: FieldSource, row: ScoredRowBinding): { readonly Entity: AssemblyEntityInfo; readonly Ref: FieldRef } | null {
    const ref = ProvenanceResolver.parseFieldRef(sourceRef);
    const key = ProvenanceResolver.expectedKey(source, row);
    if (ref === null || key === null || ref.Entity !== source.entity || ref.Field !== source.field || !UUIDsEqual(ref.Key, key)) return null;
    const entity = sources.Metadata.Entity(ref.Entity);
    return entity ? { Entity: entity, Ref: ref } : null;
  }

  /** Parses `<entity>/<key>/<field>` from the right, so an entity name may itself hold a slash. */
  private static parseFieldRef(ref: string): FieldRef | null {
    const lastSlash = ref.lastIndexOf('/');
    const keySlash = lastSlash > 0 ? ref.lastIndexOf('/', lastSlash - 1) : -1;
    if (keySlash <= 0) return null;
    return { Entity: ref.slice(0, keySlash), Key: ref.slice(keySlash + 1, lastSlash), Field: ref.slice(lastSlash + 1) };
  }

  /** The one record with that key (the key compared back on the row read), or null when none or more than one is read. */
  private static async readByKey(sources: ProvenanceSources, entity: AssemblyEntityInfo, key: string, fields: readonly string[]): Promise<SourceRow | null> {
    const rows = (await ProvenanceResolver.fetch(sources, { EntityName: entity.Name, ExtraFilter: `[${entity.PrimaryKey}]='${EscapeSQLString(key)}'`, Fields: [entity.PrimaryKey, ...fields] }))
      .filter((r) => UUIDsEqual(String(r[entity.PrimaryKey]), key));
    return rows.length === 1 ? rows[0] : null;
  }

  /** A complete read through the data-access seam; a failed read throws (the gate cannot measure). */
  private static async fetch(sources: ProvenanceSources, params: FetchRowsParams): Promise<SourceRow[]> {
    const r = await sources.DataAccess.fetchRows(params);
    if (!r.Success) throw new Error(`Reading ${params.EntityName} failed: ${r.ErrorMessage || 'unknown error'}`);
    return r.Rows;
  }

  /** Whether a source value, encoded as the column encodes it, equals the column's matrix cells. */
  private static cellsMatch(encoding: ColumnEncoding, stored: CellValue, cells: readonly MatrixCell[], folded: readonly string[]): boolean {
    const missing = ProvenanceResolver.isMissing(stored);
    switch (encoding.kind) {
      case 'numeric': return cells.length === 1 && ProvenanceResolver.numberMatches(missing ? null : ProvenanceResolver.numericOf(stored), cells[0]);
      case 'boolean': return cells.length === 1 && ProvenanceResolver.numberMatches(missing ? null : ProvenanceResolver.bitOf(stored), cells[0]);
      case 'categorical': return cells.length === 1 && ProvenanceResolver.categoryMatches(missing ? null : stored, cells[0], folded);
      case 'date-parts': return ProvenanceResolver.datePartsMatch(encoding.parts, missing ? null : stored, cells);
      case 'identifier': return false;
    }
  }

  /** A stored value as a number: a bit/boolean decodes to 1/0, a date or non-numeric text is NaN (never matches). */
  private static numericOf(v: CellValue): number {
    if (typeof v === 'number') return v;
    if (typeof v === 'boolean') return v ? 1 : 0;
    return v instanceof Date ? Number.NaN : Number(String(v).trim());
  }

  /** A stored bit as 1/0; anything that is not a recognisable boolean is NaN (never matches). */
  private static bitOf(v: CellValue): number {
    if (v === true || v === 1 || v === '1' || v === 'true') return 1;
    if (v === false || v === 0 || v === '0' || v === 'false') return 0;
    return Number.NaN;
  }

  /** Expected null ↔ a null cell; else a numeric cell within the tolerance. */
  private static numberMatches(expected: number | null, cell: MatrixCell): boolean {
    if (expected === null) return cell === null;
    return typeof cell === 'number' && Number.isFinite(expected) && Math.abs(cell - expected) <= NUMERIC_TOLERANCE * Math.max(1, Math.abs(expected));
  }

  /** A level equals the cell exactly, or the cell is `__other` and the level is one the fold folded. */
  private static categoryMatches(stored: CellValue, cell: MatrixCell, folded: readonly string[]): boolean {
    if (stored === null || stored === undefined) return cell === null;
    const level = stored instanceof Date ? UtcDay.UtcDayIso(stored) : String(stored).trim();
    return cell === level || (cell === OTHER_CATEGORY_LEVEL && folded.includes(level));
  }

  /**
   * Year, month and day-of-week parts re-derived from the stored date. Days since the decision are not re-derived
   * here, so a column with that part never resolves.
   */
  private static datePartsMatch(parts: Extract<ColumnEncoding, { kind: 'date-parts' }>['parts'], stored: CellValue, cells: readonly MatrixCell[]): boolean {
    if (cells.length !== parts.length || parts.includes('days-since-decision')) return false;
    const day = stored === null ? null : UtcDay.ToUtcDay(stored);
    if (stored !== null && day === null) return false;
    return parts.every((part, i) => {
      if (day === null) return cells[i] === null;
      const expected = part === 'year' ? day.getUTCFullYear() : part === 'month' ? day.getUTCMonth() + 1 : day.getUTCDay();
      return cells[i] === expected;
    });
  }

  /** `computedAt` is an ISO instant (round-trips exactly) not after now. */
  private static computedAtValid(computedAt: string): boolean {
    const t = Date.parse(computedAt);
    return Number.isFinite(t) && new Date(t).toISOString() === computedAt && t <= Date.now();
  }

  private static allMissing(cells: readonly MatrixCell[]): boolean {
    return cells.length > 0 && cells.every((c) => c === null);
  }

  private static isMissing(v: CellValue): boolean {
    return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
  }

  private static hasField(entity: AssemblyEntityInfo, name: string): boolean {
    return entity.Fields.some((f) => f.Name === name);
  }

  /** A stored timestamp (a Date, or the ISO text a simple read returns) as an instant; absent or unparseable is null. */
  private static instantOf(value: CellValue): Date | null {
    const d = value instanceof Date ? value : typeof value === 'string' ? new Date(value) : null;
    return d === null || Number.isNaN(d.getTime()) ? null : d;
  }
}
