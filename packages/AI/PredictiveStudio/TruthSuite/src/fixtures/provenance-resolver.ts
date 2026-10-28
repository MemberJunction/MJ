/**
 * Resolves one assembled value's provenance back to its source: the record (or Record Change, or contributing child
 * rows) the provenance names is read again through the passed provider, the value is re-derived from it with the
 * column's encoding and compared with the matrix cells, and the source version and computed-at are checked against
 * what the source says. Every read uses `ResultType: 'simple'` with `Fields`; every key taken from a provenance
 * reference is escaped. A value that cannot be resolved does not resolve: there is no "skipped".
 */
import { CompositeKey, RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { EscapeSQLString, UUIDsEqual } from '@memberjunction/global';
import type { MJRecordChangeEntity } from '@memberjunction/core-entities';
import { JsonParse, type ColumnEncoding, type DatedSource, type FeatureColumnSpec, type ValueProvenance, type WindowedAggregateSource } from '@memberjunction/predictive-studio-core';
import {
  AsOfFeatureAssembler, OTHER_CATEGORY_LEVEL, ProviderAssemblyMetadata, RecordHistory, UtcDay, WindowedAggregates,
  type AssemblyEntityInfo, type CellValue, type MatrixCell, type SourceRow,
} from '@memberjunction/predictive-studio';

/** A field source of a feature column (`immutable-field` or `record-changes`). */
type FieldSource = Extract<DatedSource, { kind: 'immutable-field' | 'record-changes' }>;

/** A parsed `<entity>/<lower-cased key>/<field>` reference. */
interface FieldRef { readonly Entity: string; readonly Key: string; readonly Field: string }

/** A parsed `<child>?<fk>=<owner>&as-of=<day>&aggregate=<agg>` reference. */
interface AggregateRef { readonly Child: string; readonly Owner: string; readonly AsOfDay: string; readonly Aggregate: string }

/** The Record Change fields the resolver reads. */
type RecordChangeRow = Pick<MJRecordChangeEntity, 'ID' | 'EntityID' | 'RecordID' | 'Type' | 'Status' | 'ChangedAt' | 'FullRecordJSON'>;

/** Two numbers agree when they differ by at most this much, relative to the larger of 1 and the expected value. */
const NUMERIC_TOLERANCE = 1e-12;
/** Version of a value read as missing because its record did not exist on the decision day. */
const CREATED_AFTER_DECISION = 'created-after-decision';
/** Version of an immutable value whose record's creation instant is unknown. */
const IMMUTABLE_AFTER_CREATE = 'immutable-after-create';
/** Prefix of an immutable value's version when its record's creation instant is known. */
const CREATED_PREFIX = 'created:';
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The provenance resolver, as static members on one owner class. */
export class ProvenanceResolver {
  /**
   * Whether one assembled value resolves to its source, its source version and its computed-at.
   *
   * @param provider the provider every source read goes through
   * @param user the acting user of every read
   * @param p the value's provenance entry (one per feature)
   * @param cells the matrix cells of the entry's feature, in column order (one, or several for date parts)
   * @param spec the feature's column spec, as the training assembly resolved it
   * @param folded the levels the column's category fold folded into `__other` (empty when it folded none)
   */
  public static async ResolveValueProvenance(
    provider: IMetadataProvider, user: UserInfo, p: ValueProvenance, cells: readonly MatrixCell[], spec: FeatureColumnSpec, folded: readonly string[],
  ): Promise<boolean> {
    if (p.column !== spec.name || p.source !== spec.source.kind || !ProvenanceResolver.computedAtValid(p.computedAt)) return false;
    const s = spec.source;
    switch (s.kind) {
      case 'immutable-field': return ProvenanceResolver.resolveImmutableField(provider, user, p, cells, spec.encoding, s, folded);
      case 'record-changes': return ProvenanceResolver.resolveRecordChange(provider, user, p, cells, spec.encoding, s, folded);
      case 'windowed-aggregate': return ProvenanceResolver.resolveWindowedAggregate(provider, user, p, cells, s);
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
   * The stored record by key: the field equals the cell, and the version is `created:<instant>` when the record's
   * creation instant is known (it must equal that instant, and so must `computedAt`) or `immutable-after-create` when
   * it is not. `created-after-decision` resolves to a missing value.
   */
  private static async resolveImmutableField(
    provider: IMetadataProvider, user: UserInfo, p: ValueProvenance, cells: readonly MatrixCell[], encoding: ColumnEncoding, source: FieldSource, folded: readonly string[],
  ): Promise<boolean> {
    if (p.sourceVersion === CREATED_AFTER_DECISION) return ProvenanceResolver.allMissing(cells);
    const target = ProvenanceResolver.fieldTarget(provider, p.sourceRef, source);
    if (target === null) return false;
    const { Entity: entity, Ref: ref } = target;
    const hasCreatedAt = ProvenanceResolver.hasField(entity, '__mj_CreatedAt');
    const row = await ProvenanceResolver.readByKey(provider, user, entity, ref.Key, hasCreatedAt ? [ref.Field, '__mj_CreatedAt'] : [ref.Field]);
    if (row === null || !ProvenanceResolver.cellsMatch(encoding, row[ref.Field], cells, folded)) return false;
    const created = await ProvenanceResolver.creationInstant(provider, user, entity, ref.Key, hasCreatedAt ? row.__mj_CreatedAt : null);
    if (p.sourceVersion === IMMUTABLE_AFTER_CREATE) return created === null;
    if (!p.sourceVersion.startsWith(CREATED_PREFIX) || created === null) return false;
    const versionAt = Date.parse(p.sourceVersion.slice(CREATED_PREFIX.length));
    return versionAt === created.getTime() && Date.parse(p.computedAt) === created.getTime();
  }

  /**
   * When the record came into existence, by the assembly's creation rule: its own Create row when the entity tracks
   * Record Changes and its history starts with one, its `__mj_CreatedAt` when the entity lists the column, the later
   * of the two when both are known, else null.
   */
  private static async creationInstant(provider: IMetadataProvider, user: UserInfo, entity: AssemblyEntityInfo, key: string, stored: CellValue): Promise<Date | null> {
    const fromColumn = ProvenanceResolver.instantOf(stored);
    const fromHistory = entity.TrackRecordChanges ? await ProvenanceResolver.createRowInstant(provider, user, entity, key) : null;
    if (fromColumn === null || fromHistory === null) return fromColumn || fromHistory;
    return fromHistory.getTime() >= fromColumn.getTime() ? fromHistory : fromColumn;
  }

  /** The instant of the record's first Record Change when that change is its Create row, else null. */
  private static async createRowInstant(provider: IMetadataProvider, user: UserInfo, entity: AssemblyEntityInfo, key: string): Promise<Date | null> {
    const recordId = CompositeKey.FromKeyValuePair(entity.PrimaryKey, key).ToURLSegment();
    const r = await RunView.FromMetadataProvider(provider).RunView<Pick<RecordChangeRow, 'ID' | 'Type' | 'ChangedAt'>>({
      EntityName: 'MJ: Record Changes',
      ExtraFilter: `[EntityID]='${EscapeSQLString(entity.ID)}' AND [RecordID]='${EscapeSQLString(recordId)}' AND [Status]='Complete'`,
      OrderBy: 'ChangedAt ASC, ID ASC', MaxRows: 1, Fields: ['ID', 'Type', 'ChangedAt'], ResultType: 'simple',
    }, user);
    if (!r.Success) throw new Error(`Reading the Record Changes of ${entity.Name} ${key} failed: ${r.ErrorMessage || 'unknown error'}`);
    const first = r.Results[0];
    return first && first.Type === 'Create' ? ProvenanceResolver.instantOf(first.ChangedAt) : null;
  }

  // ----- Record Changes -----

  /**
   * The Record Change the version names: complete, of the source entity and record, its `FullRecordJSON` field equals
   * the cell and its `ChangedAt` equals `computedAt`. A row read with no join key (`none`/`none`) and a record created
   * after the decision day resolve to a missing value.
   */
  private static async resolveRecordChange(
    provider: IMetadataProvider, user: UserInfo, p: ValueProvenance, cells: readonly MatrixCell[], encoding: ColumnEncoding, source: FieldSource, folded: readonly string[],
  ): Promise<boolean> {
    if (p.sourceVersion === CREATED_AFTER_DECISION || (p.sourceRef === 'none' && p.sourceVersion === 'none')) return ProvenanceResolver.allMissing(cells);
    const target = ProvenanceResolver.fieldTarget(provider, p.sourceRef, source);
    if (target === null) return false;
    const change = await ProvenanceResolver.readRecordChange(provider, user, p.sourceVersion);
    if (change === null || change.Status !== 'Complete' || !UUIDsEqual(change.EntityID, target.Entity.ID)) return false;
    if (!UUIDsEqual(RecordHistory.KeyOfRecordId(change.RecordID), target.Ref.Key)) return false;
    const changedAt = ProvenanceResolver.instantOf(change.ChangedAt);
    if (changedAt === null || changedAt.getTime() !== Date.parse(p.computedAt)) return false;
    return ProvenanceResolver.cellsMatch(encoding, ProvenanceResolver.fieldOfSnapshot(change.FullRecordJSON, target.Ref.Field), cells, folded);
  }

  private static async readRecordChange(provider: IMetadataProvider, user: UserInfo, id: string): Promise<RecordChangeRow | null> {
    const r = await RunView.FromMetadataProvider(provider).RunView<RecordChangeRow>({
      EntityName: 'MJ: Record Changes', ExtraFilter: `ID='${EscapeSQLString(id)}'`,
      Fields: ['ID', 'EntityID', 'RecordID', 'Type', 'Status', 'ChangedAt', 'FullRecordJSON'], ResultType: 'simple',
    }, user);
    if (!r.Success) throw new Error(`Reading Record Change ${id} failed: ${r.ErrorMessage || 'unknown error'}`);
    return r.Results[0] || null;
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
   * The owner's child rows are read again and the aggregate rebuilt from the spec's window as of the reference's day
   * (rows entered after that day dropped, as the assembly drops them): the value equals the cell and the contributor
   * hash equals the version. A row with no owner resolves to a missing value with the empty contributor hash.
   */
  private static async resolveWindowedAggregate(provider: IMetadataProvider, user: UserInfo, p: ValueProvenance, cells: readonly MatrixCell[], source: WindowedAggregateSource): Promise<boolean> {
    if (p.sourceVersion === CREATED_AFTER_DECISION) return ProvenanceResolver.allMissing(cells);
    if (p.sourceRef === 'none') return ProvenanceResolver.allMissing(cells) && p.sourceVersion === AsOfFeatureAssembler.ContributorsVersion([]);
    const ref = ProvenanceResolver.parseAggregateRef(p.sourceRef, source.foreignKey);
    if (ref === null || ref.Child !== source.childEntity || ref.Aggregate !== source.aggregate || cells.length !== 1) return false;
    const child = new ProviderAssemblyMetadata(provider).Entity(ref.Child);
    if (!child) return false;
    const rows = await ProvenanceResolver.readOwnerChildRows(provider, user, child, source, ref);
    const decision = new Date(`${ref.AsOfDay}T00:00:00.000Z`);
    const agg = WindowedAggregates.ComputeWindowedAggregate(WindowedAggregates.BuildChildRowIndex(rows, source, child.PrimaryKey), ref.Owner, decision, source);
    return ProvenanceResolver.numberMatches(agg.Value, cells[0]) && p.sourceVersion === AsOfFeatureAssembler.ContributorsVersion(agg.Contributors);
  }

  /** The owner's child rows with the fields the assembly reads, minus those created after the reference's day. */
  private static async readOwnerChildRows(provider: IMetadataProvider, user: UserInfo, child: AssemblyEntityInfo, source: WindowedAggregateSource, ref: AggregateRef): Promise<SourceRow[]> {
    const hasCreatedAt = ProvenanceResolver.hasField(child, '__mj_CreatedAt');
    const fields = [
      child.PrimaryKey, source.foreignKey, source.dateField, source.endDateField, source.voidedAtField, source.valueField, ...source.filter.map((f) => f.field),
      ProvenanceResolver.hasField(child, '__mj_UpdatedAt') ? '__mj_UpdatedAt' : null, hasCreatedAt ? '__mj_CreatedAt' : null,
    ].filter((f): f is string => !!f);
    const r = await RunView.FromMetadataProvider(provider).RunView<SourceRow>({
      EntityName: child.Name, ExtraFilter: `[${source.foreignKey}]='${EscapeSQLString(ref.Owner)}'`, Fields: [...new Set(fields)], ResultType: 'simple', IgnoreMaxRows: true,
    }, user);
    if (!r.Success) throw new Error(`Reading the ${child.Name} rows of ${ref.Owner} failed: ${r.ErrorMessage || 'unknown error'}`);
    if (!hasCreatedAt) return r.Results;
    const asOf = UtcDay.AddUtcDays(new Date(`${ref.AsOfDay}T00:00:00.000Z`), 1).getTime();
    return r.Results.filter((row) => {
      const created = ProvenanceResolver.instantOf(row.__mj_CreatedAt);
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

  // ----- shared reads and comparisons -----

  /** The entity and parsed reference of a field source's `sourceRef`, when the reference names the spec's entity and field. */
  private static fieldTarget(provider: IMetadataProvider, sourceRef: string, source: FieldSource): { readonly Entity: AssemblyEntityInfo; readonly Ref: FieldRef } | null {
    const ref = ProvenanceResolver.parseFieldRef(sourceRef);
    if (ref === null || ref.Entity !== source.entity || ref.Field !== source.field || ref.Key === '') return null;
    const entity = new ProviderAssemblyMetadata(provider).Entity(ref.Entity);
    return entity ? { Entity: entity, Ref: ref } : null;
  }

  /** Parses `<entity>/<key>/<field>` from the right, so an entity name may itself hold a slash. */
  private static parseFieldRef(ref: string): FieldRef | null {
    const lastSlash = ref.lastIndexOf('/');
    const keySlash = lastSlash > 0 ? ref.lastIndexOf('/', lastSlash - 1) : -1;
    if (keySlash <= 0) return null;
    return { Entity: ref.slice(0, keySlash), Key: ref.slice(keySlash + 1, lastSlash), Field: ref.slice(lastSlash + 1) };
  }

  /** The one record with that key (the key compared back), or null when none or more than one is read. */
  private static async readByKey(provider: IMetadataProvider, user: UserInfo, entity: AssemblyEntityInfo, key: string, fields: readonly string[]): Promise<SourceRow | null> {
    const r = await RunView.FromMetadataProvider(provider).RunView<SourceRow>({
      EntityName: entity.Name, ExtraFilter: `[${entity.PrimaryKey}]='${EscapeSQLString(key)}'`, Fields: [entity.PrimaryKey, ...fields], ResultType: 'simple',
    }, user);
    if (!r.Success) throw new Error(`Reading ${entity.Name} ${key} failed: ${r.ErrorMessage || 'unknown error'}`);
    const row = r.Results.length === 1 ? r.Results[0] : null;
    return row && UUIDsEqual(String(row[entity.PrimaryKey]), key) ? row : null;
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
   * Year, month and day-of-week parts re-derived from the stored date. Days since the decision depend on the row's
   * decision day, which a field reference does not carry, so a column with that part never resolves here.
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
