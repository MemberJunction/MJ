/**
 * @module feature-assembly/as-of/record-history
 *
 * Replays fields updated in place from `MJ: Record Changes`, so a feature read for a past decision date uses the value
 * the record held then. A record's history counts only from its earliest Create or Snapshot row; before that a
 * decision date cannot be replayed. Before each assembly the last replayed value of every covered record is compared
 * with its stored value — a mismatch (a direct-SQL update, or a change made while tracking was off) marks that
 * record-field uncovered. External-source rows are replayed at detection time or are ineligible, per the unit's
 * ChangeHistoryPolicy. Today's value never fills a gap.
 */
import { CompositeKey, RunView, type EntityInfo, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { EscapeSQLString, OrdinalCompare, UUIDMap } from '@memberjunction/global';
import type { MJRecordChangeEntity } from '@memberjunction/core-entities';
import type { CellValue, ChangeHistoryCoverage, ChangeHistoryPolicy, JsonValue, ParseResult, ReadPolicy } from '@memberjunction/predictive-studio-core';
import { JsonParse } from '@memberjunction/predictive-studio-core';
import type { ICountingDataAccess, SourceRow } from '../data-access';
import { CompleteReader } from '../read-policy';
import { KeyedReader } from './read-by-keys';
import { AssemblyRefused } from './refusal';
import type { AssemblyEntityInfo } from '../assembly-metadata';

export interface RecordChangeRow {
  readonly ID: string;
  readonly RecordID: string;
  readonly Type: MJRecordChangeEntity['Type'];
  readonly Source: MJRecordChangeEntity['Source'];
  readonly ChangedAt: Date;
  readonly ChangesJSON: string;
  readonly FullRecordJSON: string;
}

export type HistoryValue =
  | { readonly Status: 'value'; readonly Value: CellValue; readonly ChangeId: string; readonly ChangedAt: Date }
  | { readonly Status: 'uncovered'; readonly Reason: 'no-history' | 'before-history-start' | 'continuity-mismatch' | 'deleted' | 'external-ineligible' };

export interface EntityHistory {
  readonly Coverage: ChangeHistoryCoverage;
  /** The field's value in force strictly before `before`. */
  ValueAt(recordKey: string, field: string, before: Date): HistoryValue;
  /** Update rows that changed `field` at or after `after`. */
  UpdatesAfter(recordKey: string, field: string, after: Date): number;
  /**
   * When the record's history starts with its own Create row, the instant of that row: the record did not exist before
   * it. Null when the history starts with a Snapshot (the record is older than its history) or there is no history.
   */
  CreatedAt(recordKey: string): Date | null;
}

export interface IRecordHistoryReader {
  Load(entity: AssemblyEntityInfo, keys: readonly string[], fields: readonly string[], policy: ChangeHistoryPolicy, now: Date): Promise<EntityHistory>;
}

/** The description every history snapshot row carries, so an operator can tell them from ordinary changes. */
const SNAPSHOT_DESCRIPTION = 'History snapshot for Predictive Studio as-of coverage';

/**
 * Snapshot saves in flight at once. Bounded because an entity loaded before tracking can have thousands of uncovered
 * records, and starting every save together would exhaust the provider's connection pool.
 */
const SNAPSHOT_SAVE_BATCH = 50;

/** Replay of `MJ: Record Changes` rows, and the snapshots that start a record's history. Static members on one owner. */
export class RecordHistory {
  /**
   * The primary-key value of a RecordID, lower-cased for in-memory matching. Parsed by MJ's own `CompositeKey` (the
   * `Field|Value` URL-segment form Record Changes store); PS units have one key column, so the first pair is the key.
   */
  public static KeyOfRecordId(recordId: string): string {
    const pair = CompositeKey.FromURLSegment(null, recordId).KeyValuePairs[0];
    return (pair ? String(pair.Value) : recordId).toLowerCase();
  }

  /**
   * Pure: index the change rows, run the continuity check against the current values, and expose replay.
   * `current` is keyed by the lower-cased record key, as `KeyedReader.ReadByKeys` produces it.
   */
  public static BuildEntityHistory(
    entityName: string,
    changes: readonly RecordChangeRow[],
    current: ReadonlyMap<string, Readonly<Record<string, CellValue>>>,
    fields: readonly string[],
    policy: ChangeHistoryPolicy,
    now: Date,
  ): EntityHistory {
    const byKey = RecordHistory.indexByKey(changes);
    const start = RecordHistory.historyStarts(byKey);
    const created = RecordHistory.creationInstants(byKey);
    const continuity = RecordHistory.checkContinuity(byKey, start, current, fields);
    const allCovered = [...current.keys()].every((k) => start.has(k));
    const historyStart = allCovered && start.size > 0 ? new Date(Math.max(...[...start.values()].map((d) => d.getTime()))).toISOString() : null;
    return {
      Coverage: {
        entity: entityName,
        historyStart,
        continuity: { checkedAt: now.toISOString(), recordsReplayed: continuity.Replayed, recordsMismatched: continuity.RecordsMismatched },
        externalSourceRows: policy.externalSourceRows,
        onUncoveredRow: policy.onUncoveredRow,
      },
      ValueAt: (recordKey, field, before) => RecordHistory.valueAt(byKey, start, continuity.Mismatched, policy, recordKey, field, before),
      UpdatesAfter: (recordKey, field, after) =>
        (byKey.get(recordKey.toLowerCase()) || []).filter((c) => c.Type === 'Update' && c.ChangedAt.getTime() >= after.getTime() && RecordHistory.changedFields(c.ChangesJSON).has(field)).length,
      CreatedAt: (recordKey) => created.get(recordKey.toLowerCase()) || null,
    };
  }

  /**
   * Starts the history of every record of `entityName` that has no complete Create or Snapshot change row, by saving
   * one Snapshot row holding the record as stored now. This is how an entity loaded before change tracking enters
   * coverage: its history starts now, so decision dates before now are still refused. Reads and saves run on
   * `provider`; returns the number of snapshots written.
   */
  public static async WriteHistorySnapshots(entityName: string, provider: IMetadataProvider, user: UserInfo): Promise<number> {
    const entity = provider.EntityByName(entityName);
    if (!entity) throw new Error(`Writing history snapshots: entity "${entityName}" is not registered`);
    if (entity.PrimaryKeys.length !== 1) throw new Error(`Writing history snapshots: "${entityName}" must have a single-column primary key`);
    const rv = RunView.FromMetadataProvider(provider);
    const [covered, records] = await Promise.all([RecordHistory.readCoveredKeys(rv, entity, user), RecordHistory.readRecords(rv, entity, user)]);
    const pkName = entity.FirstPrimaryKey.Name; // first-pk-ok: a composite key is rejected above
    const uncovered = records.filter((r) => !covered.has(String(r[pkName]).toLowerCase()));
    const now = new Date();
    const failures: string[] = [];
    for (let i = 0; i < uncovered.length; i += SNAPSHOT_SAVE_BATCH) {
      const batch = uncovered.slice(i, i + SNAPSHOT_SAVE_BATCH);
      const outcomes = await Promise.all(batch.map((r) => RecordHistory.saveSnapshot(provider, entity, pkName, r, now, user)));
      failures.push(...outcomes.filter((o): o is string => o !== null));
    }
    if (failures.length > 0) {
      throw new Error(`Writing history snapshots for ${entityName}: ${failures.length} of ${uncovered.length} failed: ${failures.join('; ')}`);
    }
    return uncovered.length;
  }

  /** Lower-cased keys of the records that already have a complete Create or Snapshot row. */
  private static async readCoveredKeys(rv: RunView, entity: EntityInfo, user: UserInfo): Promise<Set<string>> {
    const r = await rv.RunView<{ RecordID: string }>({
      EntityName: 'MJ: Record Changes',
      ExtraFilter: `[EntityID]='${EscapeSQLString(entity.ID)}' AND [Status]='Complete' AND [Type] IN ('Create','Snapshot')`,
      Fields: ['RecordID'],
      ResultType: 'simple',
      IgnoreMaxRows: true,
    }, user);
    if (!r.Success) throw new Error(`Reading Record Changes of ${entity.Name} failed: ${r.ErrorMessage}`);
    return new Set(r.Results.map((c) => RecordHistory.KeyOfRecordId(c.RecordID)));
  }

  /** Every record of the entity, every field, as plain rows (nothing read here is mutated). */
  private static async readRecords(rv: RunView, entity: EntityInfo, user: UserInfo): Promise<SourceRow[]> {
    const r = await rv.RunView<SourceRow>({
      EntityName: entity.Name,
      Fields: entity.Fields.map((f) => f.Name),
      ResultType: 'simple',
      IgnoreMaxRows: true,
    }, user);
    if (!r.Success) throw new Error(`Reading ${entity.Name} failed: ${r.ErrorMessage}`);
    return r.Results;
  }

  /**
   * Saves one Snapshot row for `record`; null on success, else the failure naming the record. Never throws, so one
   * record that cannot be snapshotted (a key holding the RecordID delimiter, a failed entity-object load) still lands in
   * the caller's aggregate error instead of hiding every other failure.
   */
  private static async saveSnapshot(provider: IMetadataProvider, entity: EntityInfo, pkName: string, record: SourceRow, now: Date, user: UserInfo): Promise<string | null> {
    const label = `${pkName} ${String(record[pkName])}`;
    try {
      return await RecordHistory.trySaveSnapshot(provider, entity, record, now, user, label);
    } catch (e) {
      return `${label}: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  /** The save itself; returns null on success, else the failure with the save's complete message. */
  private static async trySaveSnapshot(provider: IMetadataProvider, entity: EntityInfo, record: SourceRow, now: Date, user: UserInfo, label: string): Promise<string | null> {
    const change = await provider.GetEntityObject<MJRecordChangeEntity>('MJ: Record Changes', user);
    const recordId = CompositeKey.FromEntityRecord(entity, record).ToRecordID();
    change.EntityID = entity.ID;
    change.RecordID = recordId;
    change.UserID = user.ID;
    change.Type = 'Snapshot';
    change.Source = 'Internal';
    change.Status = 'Complete';
    change.ChangedAt = now;
    change.ChangesJSON = '{}';
    change.ChangesDescription = SNAPSHOT_DESCRIPTION;
    change.FullRecordJSON = JSON.stringify(record);
    if (await change.Save()) return null;
    return `${label}: ${change.LatestResult?.CompleteMessage || 'unknown error'}`;
  }

  /** Change rows per record key, in ChangedAt order (ties by ID, ordinal). */
  private static indexByKey(changes: readonly RecordChangeRow[]): Map<string, RecordChangeRow[]> {
    const byKey = new Map<string, RecordChangeRow[]>();
    for (const c of [...changes].sort((a, b) => a.ChangedAt.getTime() - b.ChangedAt.getTime() || OrdinalCompare(a.ID, b.ID))) {
      const k = RecordHistory.KeyOfRecordId(c.RecordID);
      const list = byKey.get(k) || [];
      list.push(c);
      byKey.set(k, list);
    }
    return byKey;
  }

  /** A record's history starts at its earliest Create or Snapshot row; a record without one has no history. */
  private static historyStarts(byKey: ReadonlyMap<string, readonly RecordChangeRow[]>): Map<string, Date> {
    const start = new Map<string, Date>();
    for (const [k, list] of byKey) {
      const first = list.find((c) => c.Type === 'Create' || c.Type === 'Snapshot');
      if (first) start.set(k, first.ChangedAt);
    }
    return start;
  }

  /** The Create instant of every record whose history starts with its own Create row (not a Snapshot). */
  private static creationInstants(byKey: ReadonlyMap<string, readonly RecordChangeRow[]>): Map<string, Date> {
    const created = new Map<string, Date>();
    for (const [k, list] of byKey) {
      const first = list.find((c) => c.Type === 'Create' || c.Type === 'Snapshot');
      if (first && first.Type === 'Create') created.set(k, first.ChangedAt);
    }
    return created;
  }

  /** Replays every covered record to now and compares it with the stored value; a mismatch marks that record-field. */
  private static checkContinuity(
    byKey: ReadonlyMap<string, readonly RecordChangeRow[]>, start: ReadonlyMap<string, Date>,
    current: ReadonlyMap<string, Readonly<Record<string, CellValue>>>, fields: readonly string[],
  ): { readonly Mismatched: ReadonlySet<string>; readonly Replayed: number; readonly RecordsMismatched: number } {
    const mismatched = new Set<string>();
    let replayed = 0;
    for (const [k, row] of current) {
      const list = byKey.get(k);
      if (!list || !start.has(k)) continue;
      replayed++;
      const last = list[list.length - 1];
      for (const f of fields) {
        if (RecordHistory.comparable(RecordHistory.fieldOf(last.FullRecordJSON, f)) !== RecordHistory.comparable(row[f])) mismatched.add(`${k}|${f}`);
      }
    }
    return { Mismatched: mismatched, Replayed: replayed, RecordsMismatched: new Set([...mismatched].map((x) => x.split('|')[0])).size };
  }

  /** The value in force strictly before `before`, or why it cannot be replayed. Today's value never fills a gap. */
  private static valueAt(
    byKey: ReadonlyMap<string, readonly RecordChangeRow[]>, start: ReadonlyMap<string, Date>, mismatched: ReadonlySet<string>,
    policy: ChangeHistoryPolicy, recordKey: string, field: string, before: Date,
  ): HistoryValue {
    const k = recordKey.toLowerCase();
    const list = byKey.get(k);
    const s = start.get(k);
    if (!list || !s) return { Status: 'uncovered', Reason: 'no-history' };
    if (before.getTime() <= s.getTime()) return { Status: 'uncovered', Reason: 'before-history-start' };
    if (mismatched.has(`${k}|${field}`)) return { Status: 'uncovered', Reason: 'continuity-mismatch' };
    const inForce = list.filter((c) => c.ChangedAt.getTime() < before.getTime());
    const last = inForce[inForce.length - 1];
    if (last.Type === 'Delete') return { Status: 'uncovered', Reason: 'deleted' };
    if (policy.externalSourceRows === 'ineligible' && inForce.some((c) => c.Source === 'External' && (c.Type !== 'Update' || RecordHistory.changedFields(c.ChangesJSON).has(field)))) {
      return { Status: 'uncovered', Reason: 'external-ineligible' };
    }
    return { Status: 'value', Value: RecordHistory.fieldOf(last.FullRecordJSON, field), ChangeId: last.ID, ChangedAt: last.ChangedAt };
  }

  /** A field of a FullRecordJSON snapshot; a malformed snapshot or a non-scalar value reads as null. */
  private static fieldOf(json: string, field: string): CellValue {
    const parsed: ParseResult<JsonValue> = JsonParse.ParseJsonText(json, 'FullRecordJSON');
    if (parsed.Ok === false || !JsonParse.IsJsonObject(parsed.Value)) return null;
    const v = parsed.Value[field];
    return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? v : null;
  }

  /** The field names a ChangesJSON lists; a malformed one lists none. */
  private static changedFields(json: string): ReadonlySet<string> {
    const parsed: ParseResult<JsonValue> = JsonParse.ParseJsonText(json, 'ChangesJSON');
    if (parsed.Ok === false || !JsonParse.IsJsonObject(parsed.Value)) return new Set<string>();
    return new Set(Object.keys(parsed.Value));
  }

  /** A value in the form both sides of the continuity check compare in: blank as '', dates as ISO instants. */
  private static comparable(v: CellValue): string {
    if (v === null || v === undefined || v === '') return '';
    if (v instanceof Date) return v.toISOString();
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) return new Date(v).toISOString();
    return String(v);
  }
}

/**
 * Production reader: one complete read of an entity's Record Changes plus the current values of the requested keys.
 * The change rows are read once per entity for the life of the reader, however many field lists and key sets load
 * that entity's history; the current values are read on every load, since each load asks for its own keys and fields.
 * Build one reader per assembly (as training and scoring do): a reader kept longer would replay change rows written
 * after its first load as if they did not exist.
 */
export class RunViewRecordHistoryReader implements IRecordHistoryReader {
  /** The complete change-row read of each entity, by entity ID; a refused read is kept and refuses again. */
  private readonly changeRows = new UUIDMap<Promise<RecordChangeRow[]>>();

  constructor(private readonly dataAccess: ICountingDataAccess, private readonly read: ReadPolicy) {}

  /** The entity's replayable history for `keys`; a short read of either source ends the assembly with its refusal. */
  public async Load(entity: AssemblyEntityInfo, keys: readonly string[], fields: readonly string[], policy: ChangeHistoryPolicy, now: Date): Promise<EntityHistory> {
    const changes = await this.changeRowsOf(entity);
    const current = await KeyedReader.ReadByKeys(this.dataAccess, entity.Name, entity.PrimaryKey, keys, fields);
    if (current.Status === 'refused') throw new AssemblyRefused(current.Refusal);
    return RecordHistory.BuildEntityHistory(entity.Name, changes, current.Rows, fields, policy, now);
  }

  /** The entity's complete change rows, read on the first load of the entity and shared by every later one. */
  private changeRowsOf(entity: AssemblyEntityInfo): Promise<RecordChangeRow[]> {
    const cached = this.changeRows.Get(entity.ID);
    if (cached) return cached;
    const pending = this.readChangeRows(entity);
    this.changeRows.Set(entity.ID, pending);
    return pending;
  }

  private async readChangeRows(entity: AssemblyEntityInfo): Promise<RecordChangeRow[]> {
    const changes = await CompleteReader.ReadCompletely(this.dataAccess, {
      EntityName: 'MJ: Record Changes', KeyField: 'ID',
      ExtraFilter: `[EntityID]='${EscapeSQLString(entity.ID)}' AND [Status]='Complete'`,
      Fields: ['ID', 'RecordID', 'Type', 'Source', 'ChangedAt', 'ChangesJSON', 'FullRecordJSON'],
    }, this.read);
    if (changes.Status === 'refused') throw new AssemblyRefused(changes.Refusal);
    return changes.Rows.map((r) => RunViewRecordHistoryReader.toChangeRow(r));
  }

  /** A Record Changes row as read; an unknown Type/Source value falls back to the conservative Update/Internal. */
  private static toChangeRow(r: SourceRow): RecordChangeRow {
    const type = String(r.Type);
    const source = String(r.Source);
    return {
      ID: String(r.ID),
      RecordID: String(r.RecordID),
      Type: type === 'Create' || type === 'Delete' || type === 'Snapshot' ? type : 'Update',
      Source: source === 'Clone' || source === 'External' || source === 'Restore' ? source : 'Internal',
      ChangedAt: r.ChangedAt instanceof Date ? r.ChangedAt : new Date(String(r.ChangedAt)),
      ChangesJSON: String(r.ChangesJSON || '{}'),
      FullRecordJSON: String(r.FullRecordJSON || '{}'),
    };
  }
}
