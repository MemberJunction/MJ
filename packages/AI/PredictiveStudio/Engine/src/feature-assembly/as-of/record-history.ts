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
  | { readonly Status: 'value'; readonly Value: CellValue; readonly ChangeID: string; readonly ChangedAt: Date }
  | { readonly Status: 'uncovered'; readonly Reason: 'no-history' | 'before-history-start' | 'continuity-mismatch' | 'deleted' | 'external-ineligible' };

/** A hard-deleted record as a read of its stored value sees it at one instant (see {@link EntityHistory.DeletedRecordAt}). */
export interface DeletedRecordRead {
  /** `held` when the Delete is at or after the instant, so the record still stood then; `deleted` when it is before. */
  readonly Status: 'held' | 'deleted';
  /** The record as its Delete row recorded it, by field (the row's FullRecordJSON; a non-scalar value reads as null). */
  readonly Row: ReadonlyMap<string, CellValue>;
  /** The Delete change row. */
  readonly ChangeID: string;
  readonly ChangedAt: Date;
}

/** A child record whose change rows end in a Delete, as that Delete row recorded it (see {@link IRecordHistoryReader.LoadDeletedChildren}). */
export interface DeletedChildRecord {
  /** The record's key, lower-cased, as {@link RecordHistory.KeyOfRecordID} reads it. */
  readonly Key: string;
  /** The record as its Delete row recorded it, by field (the row's FullRecordJSON; a non-scalar value reads as null). */
  readonly Row: ReadonlyMap<string, CellValue>;
  /** The Delete change row. */
  readonly ChangeID: string;
  readonly ChangedAt: Date;
}

export interface EntityHistory {
  readonly Coverage: ChangeHistoryCoverage;
  /** The field's value in force strictly before `before`. */
  ValueAt(recordKey: string, field: string, before: Date): HistoryValue;
  /**
   * Change rows at or after `after` that changed `field` or replaced the record: an Update that lists the field, a
   * Delete, and a row of any type whose recorded value of the field differs from the row before it (a Create or
   * Snapshot written after an untracked change carries the new value without listing it). The final Delete of a
   * hard-deleted record (see {@link DeletedRecordAt}) is where its stored value is read from, so it counts only when it
   * records a different value of the field.
   */
  ChangesAfter(recordKey: string, field: string, after: Date): number;
  /**
   * The number of the record's change rows strictly before `before`. Every verdict the history gives at `before` is
   * fixed by this count, so callers judging many instants can judge each distinct count once.
   */
  RowsBefore(recordKey: string, before: Date): number;
  /**
   * When the record's history starts with its own Create row, the instant of that row: the record did not exist before
   * it. Null when the history starts with any other row (a Snapshot: the record is older than its history; an Update or a
   * Delete: it was created before tracking) or there is no history. A re-created record keeps its first creation.
   */
  CreatedAt(recordKey: string): Date | null;
  /**
   * A hard-deleted record — its change rows end in a Delete ({@link RecordHistory.KeysDeletedByHistory}) and the
   * history was built with no current row for it — as a read of its stored value sees it at `before`: the record as
   * its Delete row recorded it, `held` when the Delete is at or after `before` (not in force before `before`, as
   * {@link ValueAt} reads an instant), `deleted` when it is before. Null for a record that is not hard-deleted, so a caller holding
   * no current row for a key with a null here has a short read.
   */
  DeletedRecordAt(recordKey: string, before: Date): DeletedRecordRead | null;
  /**
   * The Delete row that ended an earlier incarnation of a re-created record: the first Delete at or after `before`
   * (not in force before `before`, as {@link ValueAt} reads an instant) when a later change row follows it. The
   * record as that row recorded it is the incarnation that stood at `before` (status `held`). Null when no such Delete
   * exists: the record was not re-created after `before` (a final Delete of a hard-deleted record is
   * {@link DeletedRecordAt}'s).
   */
  EarlierIncarnationEnd(recordKey: string, before: Date): DeletedRecordRead | null;
}

export interface IRecordHistoryReader {
  Load(entity: AssemblyEntityInfo, keys: readonly string[], fields: readonly string[], policy: ChangeHistoryPolicy, now: Date): Promise<EntityHistory>;
  /**
   * The records of a child entity whose change rows end in a Delete and any of whose change rows records one of
   * `ownerKeys` (compared lower-cased) in `foreignKeyField`: the children a windowed aggregate over those owners could
   * have read on a past day although no current row is left. A record re-owned before its deletion is included when it
   * was ever held by one of the owners, so the stable-value rule judges the move as it does a present child's. Whether
   * a record still has a current row is the caller's to check.
   */
  LoadDeletedChildren(entity: AssemblyEntityInfo, foreignKeyField: string, ownerKeys: readonly string[]): Promise<readonly DeletedChildRecord[]>;
}

/** The description every history snapshot row carries, so an operator can tell them from ordinary changes. */
const SNAPSHOT_DESCRIPTION = 'History snapshot for Predictive Studio as-of coverage';

/**
 * Snapshot saves in flight at once. Bounded because an entity loaded before tracking can have thousands of uncovered
 * records, and starting every save together would exhaust the provider's connection pool.
 */
const SNAPSHOT_SAVE_BATCH = 50;

/** Text written as an ISO timestamp: a date, `T`, hours and minutes, optional seconds and fraction, optional zone. */
const TIMESTAMP_TEXT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/;
/** Text written as an ISO calendar date alone (how a SQL `date` column can serialize): `YYYY-MM-DD`. */
const DATE_ONLY_TEXT = /^\d{4}-\d{2}-\d{2}$/;

/** The rank of a change row's type among one key's rows at one instant (see `RecordHistory.indexByKey`). */
type InstantRank = Readonly<Record<RecordChangeRow['Type'], number>>;
const SAME_INSTANT_RANK: { readonly NoDelete: InstantRank; readonly Gone: InstantRank; readonly Continues: InstantRank } = {
  // No Delete at the instant: a record is created, then snapshotted or updated (Delete is unused here).
  NoDelete: { Create: 0, Snapshot: 1, Update: 2, Delete: 3 },
  // A Delete, and the record is gone after the instant: whatever happened at the instant, the Delete ends it.
  Gone: { Create: 0, Snapshot: 1, Update: 2, Delete: 3 },
  // A Delete, and the record continues after the instant: the Delete ended the earlier incarnation and the Create re-created it.
  Continues: { Snapshot: 0, Update: 1, Delete: 2, Create: 3 },
};

/** The entity a history is built for: its name, and its fields, whose declared types decide how values compare. */
export type HistoryEntity = Pick<AssemblyEntityInfo, 'Name' | 'Fields'>;

/** What a comparison needs to know about the entity: its name (for a refusal) and its boolean (bit) fields. */
interface ComparisonScope { readonly EntityName: string; readonly BooleanFields: ReadonlySet<string> }

/** Replay of `MJ: Record Changes` rows, and the snapshots that start a record's history. */
export class RecordHistory {
  /**
   * The primary-key value of a RecordID, lower-cased for in-memory matching. Parsed by MJ's own `CompositeKey` (the
   * `Field|Value` URL-segment form Record Changes store); PS units have one key column, so the first pair is the key.
   */
  public static KeyOfRecordID(recordId: string): string {
    const pair = CompositeKey.FromURLSegment(null, recordId).KeyValuePairs[0];
    return (pair ? String(pair.Value) : recordId).toLowerCase();
  }

  /**
   * The lower-cased keys whose latest change row is a Delete: records the history says were deleted, so a missing
   * current row is explained rather than a short read. Asked only about keys with no current row, so each key's last
   * instant is gone after it (a Delete there ends it) and earlier instants rank by the later rows (see `indexByKey`).
   */
  public static KeysDeletedByHistory(changes: readonly RecordChangeRow[]): ReadonlySet<string> {
    return RecordHistory.endingInDelete(RecordHistory.indexByKey(changes));
  }

  /** Pure: see {@link IRecordHistoryReader.LoadDeletedChildren}; `changes` are the child entity's change rows. */
  public static DeletedChildren(changes: readonly RecordChangeRow[], foreignKeyField: string, ownerKeys: readonly string[]): DeletedChildRecord[] {
    const owners = new Set(ownerKeys.map((k) => k.toLowerCase()));
    const byKey = RecordHistory.indexByKey(changes);
    const out: DeletedChildRecord[] = [];
    for (const k of RecordHistory.endingInDelete(byKey)) {
      const list = byKey.get(k) || [];
      const held = list.some((c) => {
        const owner = RecordHistory.fieldOf(c.FullRecordJSON, foreignKeyField);
        return owner !== null && owner !== undefined && owners.has(String(owner).toLowerCase());
      });
      if (!held) continue;
      const del = list[list.length - 1];
      out.push({ Key: k, Row: RecordHistory.recordOf(del.FullRecordJSON), ChangeID: del.ID, ChangedAt: del.ChangedAt });
    }
    return out;
  }

  /**
   * Pure: index the change rows, run the continuity check against the current values, and expose replay.
   * `changes` is the history of the requested keys, and coverage and continuity are computed over exactly those keys: a
   * caller holding an entity-wide read hands in only the requested keys' rows. `current` is keyed by the lower-cased record key, as `KeyedReader.ReadPresentByKeys` produces it; a hard-deleted
   * record has no current row, so its Delete row stands in for it in the continuity check. The entity's field types
   * decide how two values of a field compare (see {@link comparable}).
   */
  public static BuildEntityHistory(
    entity: HistoryEntity,
    changes: readonly RecordChangeRow[],
    current: ReadonlyMap<string, Readonly<Record<string, CellValue>>>,
    fields: readonly string[],
    policy: ChangeHistoryPolicy,
    now: Date,
  ): EntityHistory {
    const scope: ComparisonScope = { EntityName: entity.Name, BooleanFields: new Set(entity.Fields.filter((f) => f.TSType === 'boolean').map((f) => f.Name)) };
    const byKey = RecordHistory.indexByKey(changes, (k) => current.has(k));
    const start = RecordHistory.historyStarts(byKey);
    const created = RecordHistory.creationInstants(byKey);
    const hardDeleted = new Set([...RecordHistory.endingInDelete(byKey)].filter((k) => !current.has(k)));
    const continuity = RecordHistory.checkContinuity(scope, byKey, start, current, hardDeleted, fields);
    const allCovered = [...current.keys(), ...hardDeleted].every((k) => start.has(k));
    const historyStart = allCovered && start.size > 0 ? new Date(Math.max(...[...start.values()].map((d) => d.getTime()))).toISOString() : null;
    return {
      Coverage: {
        entity: entity.Name,
        historyStart,
        continuity: { checkedAt: now.toISOString(), recordsReplayed: continuity.Replayed, recordsMismatched: continuity.RecordsMismatched },
        externalSourceRows: policy.externalSourceRows,
        onUncoveredRow: policy.onUncoveredRow,
      },
      ValueAt: (recordKey, field, before) => RecordHistory.valueAt(byKey, start, continuity.Mismatched, policy, recordKey, field, before),
      ChangesAfter: (recordKey, field, after) => RecordHistory.changesAfter(scope, byKey.get(recordKey.toLowerCase()) || [], field, after, hardDeleted.has(recordKey.toLowerCase())),
      RowsBefore: (recordKey, before) => RecordHistory.rowsBefore(byKey.get(recordKey.toLowerCase()) || [], before),
      CreatedAt: (recordKey) => created.get(recordKey.toLowerCase()) || null,
      DeletedRecordAt: (recordKey, before) => RecordHistory.deletedRecordAt(byKey, hardDeleted, recordKey, before),
      EarlierIncarnationEnd: (recordKey, before) => RecordHistory.earlierIncarnationEnd(byKey.get(recordKey.toLowerCase()) || [], before),
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
    return new Set(r.Results.map((c) => RecordHistory.KeyOfRecordID(c.RecordID)));
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

  /**
   * Change rows per record key, in ChangedAt order. Rows of one key that share an instant are ranked by whether the
   * record continues after that instant, then by ID (ordinal) within one rank:
   * - no Delete at the instant: Create, Snapshot, Update (a record is created, then snapshotted or updated);
   * - a Delete at the instant, and the record continues after it: Snapshot, Update, Delete, Create (the Delete ended
   *   the earlier incarnation and the Create re-created it);
   * - a Delete at the instant, and the record is gone after it: Create, Snapshot, Update, Delete (the Delete ends the
   *   instant).
   * The record continues after an instant when the key has a row at a later instant, or, at its last instant, when it
   * has a current row; so the current row decides only the last instant. `hasCurrentRow` takes the lower-cased key;
   * without it every key is read as having no current row (its last instant is gone), the order
   * {@link KeysDeletedByHistory} and {@link DeletedChildren} need, since they are asked only about such keys.
   */
  private static indexByKey(changes: readonly RecordChangeRow[], hasCurrentRow: (key: string) => boolean = () => false): Map<string, RecordChangeRow[]> {
    const byKey = new Map<string, RecordChangeRow[]>();
    for (const c of changes) {
      const k = RecordHistory.KeyOfRecordID(c.RecordID);
      const list = byKey.get(k) || [];
      list.push(c);
      byKey.set(k, list);
    }
    for (const [k, list] of byKey) byKey.set(k, RecordHistory.orderedRows(list, hasCurrentRow(k)));
    return byKey;
  }

  /** One key's rows in ChangedAt order, the rows of each instant ranked as {@link indexByKey} describes. */
  private static orderedRows(list: readonly RecordChangeRow[], hasCurrentRow: boolean): RecordChangeRow[] {
    const byInstant = new Map<number, RecordChangeRow[]>();
    for (const c of list) {
      const at = byInstant.get(c.ChangedAt.getTime()) || [];
      at.push(c);
      byInstant.set(c.ChangedAt.getTime(), at);
    }
    const instants = [...byInstant.entries()].sort((a, b) => a[0] - b[0]);
    return instants.flatMap(([, rows], i) => {
      const continues = i < instants.length - 1 || hasCurrentRow;
      const rank = !rows.some((c) => c.Type === 'Delete') ? SAME_INSTANT_RANK.NoDelete : continues ? SAME_INSTANT_RANK.Continues : SAME_INSTANT_RANK.Gone;
      return [...rows].sort((a, b) => rank[a.Type] - rank[b.Type] || OrdinalCompare(a.ID, b.ID));
    });
  }

  /** The keys of `byKey` whose last row is a Delete. */
  private static endingInDelete(byKey: ReadonlyMap<string, readonly RecordChangeRow[]>): Set<string> {
    const deleted = new Set<string>();
    for (const [k, list] of byKey) if (list[list.length - 1].Type === 'Delete') deleted.add(k);
    return deleted;
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

  /**
   * The Create instant of every record whose history starts with its own Create row: the first row in ChangedAt order
   * is the Create (not a Snapshot, an Update or a Delete). A re-created record keeps its first creation; a history that
   * opens with any other row has no known creation instant.
   */
  private static creationInstants(byKey: ReadonlyMap<string, readonly RecordChangeRow[]>): Map<string, Date> {
    const created = new Map<string, Date>();
    for (const [k, list] of byKey) if (list[0].Type === 'Create') created.set(k, list[0].ChangedAt);
    return created;
  }

  /**
   * Replays every covered record to now and compares it with the stored value; a mismatch marks that record-field. A
   * covered hard-deleted record (`hardDeleted`) has no stored value, so its Delete row is compared with the change row
   * before it: a value the Delete recorded that no change row produced is the same untracked write.
   */
  private static checkContinuity(
    scope: ComparisonScope, byKey: ReadonlyMap<string, readonly RecordChangeRow[]>, start: ReadonlyMap<string, Date>,
    current: ReadonlyMap<string, Readonly<Record<string, CellValue>>>, hardDeleted: ReadonlySet<string>, fields: readonly string[],
  ): { readonly Mismatched: ReadonlySet<string>; readonly Replayed: number; readonly RecordsMismatched: number } {
    const mismatched = new Set<string>();
    let replayed = 0;
    for (const [k, row] of current) {
      const list = byKey.get(k);
      if (!list || !start.has(k)) continue;
      replayed++;
      const last = list[list.length - 1];
      for (const f of fields) {
        if (RecordHistory.comparable(RecordHistory.fieldOf(last.FullRecordJSON, f), scope, f) !== RecordHistory.comparable(row[f], scope, f)) mismatched.add(`${k}|${f}`);
      }
    }
    for (const k of hardDeleted) {
      const list = byKey.get(k);
      if (!list || list.length < 2 || !start.has(k)) continue;
      replayed++;
      const lastChange = list[list.length - 2];
      const del = list[list.length - 1];
      for (const f of fields) {
        if (RecordHistory.comparable(RecordHistory.fieldOf(lastChange.FullRecordJSON, f), scope, f) !== RecordHistory.comparable(RecordHistory.fieldOf(del.FullRecordJSON, f), scope, f)) mismatched.add(`${k}|${f}`);
      }
    }
    return { Mismatched: mismatched, Replayed: replayed, RecordsMismatched: new Set([...mismatched].map((x) => x.split('|')[0])).size };
  }

  /**
   * See {@link EntityHistory.ChangesAfter}; `list` is one record's rows in ChangedAt order, and `hardDeleted` says the
   * record's last row is the Delete its stored value is read from, which then counts only for a moved value.
   */
  private static changesAfter(scope: ComparisonScope, list: readonly RecordChangeRow[], field: string, after: Date, hardDeleted: boolean): number {
    let n = 0;
    list.forEach((c, i) => {
      if (c.ChangedAt.getTime() < after.getTime()) return;
      const listsField = c.Type === 'Update' && RecordHistory.changedFields(c.ChangesJSON).has(field);
      const valueMoved = i > 0
        && RecordHistory.comparable(RecordHistory.fieldOf(c.FullRecordJSON, field), scope, field) !== RecordHistory.comparable(RecordHistory.fieldOf(list[i - 1].FullRecordJSON, field), scope, field);
      const replacesRecord = c.Type === 'Delete' && !(hardDeleted && i === list.length - 1);
      if (listsField || replacesRecord || valueMoved) n++;
    });
    return n;
  }

  /** See {@link EntityHistory.DeletedRecordAt}; `hardDeleted` holds the lower-cased keys deleted with no current row. */
  private static deletedRecordAt(
    byKey: ReadonlyMap<string, readonly RecordChangeRow[]>, hardDeleted: ReadonlySet<string>, recordKey: string, before: Date,
  ): DeletedRecordRead | null {
    const k = recordKey.toLowerCase();
    const list = byKey.get(k);
    if (!hardDeleted.has(k) || !list) return null;
    const del = list[list.length - 1];
    return {
      Status: del.ChangedAt.getTime() >= before.getTime() ? 'held' : 'deleted',
      Row: RecordHistory.recordOf(del.FullRecordJSON),
      ChangeID: del.ID,
      ChangedAt: del.ChangedAt,
    };
  }

  /** See {@link EntityHistory.EarlierIncarnationEnd}; `list` is one record's rows in ChangedAt order. */
  private static earlierIncarnationEnd(list: readonly RecordChangeRow[], before: Date): DeletedRecordRead | null {
    const end = list.findIndex((c, i) => i >= RecordHistory.rowsBefore(list, before) && c.Type === 'Delete');
    if (end < 0 || end === list.length - 1) return null;
    const del = list[end];
    return { Status: 'held', Row: RecordHistory.recordOf(del.FullRecordJSON), ChangeID: del.ID, ChangedAt: del.ChangedAt };
  }

  /** The number of rows of `list` (ChangedAt order) strictly before `before`, by binary search. */
  private static rowsBefore(list: readonly RecordChangeRow[], before: Date): number {
    let lo = 0;
    let hi = list.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (list[mid].ChangedAt.getTime() < before.getTime()) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  /**
   * The value in force strictly before `before`, or why it cannot be replayed. Today's value never fills a gap. A Delete
   * in force before the instant reads as deleted whatever the record's history start.
   */
  private static valueAt(
    byKey: ReadonlyMap<string, readonly RecordChangeRow[]>, start: ReadonlyMap<string, Date>, mismatched: ReadonlySet<string>,
    policy: ChangeHistoryPolicy, recordKey: string, field: string, before: Date,
  ): HistoryValue {
    const k = recordKey.toLowerCase();
    const list = byKey.get(k);
    const s = start.get(k);
    const inForce = list ? list.filter((c) => c.ChangedAt.getTime() < before.getTime()) : [];
    if (inForce.length > 0 && inForce[inForce.length - 1].Type === 'Delete') return { Status: 'uncovered', Reason: 'deleted' };
    if (!list || !s) return { Status: 'uncovered', Reason: 'no-history' };
    if (before.getTime() <= s.getTime()) return { Status: 'uncovered', Reason: 'before-history-start' };
    if (mismatched.has(`${k}|${field}`)) return { Status: 'uncovered', Reason: 'continuity-mismatch' };
    const last = inForce[inForce.length - 1];
    if (policy.externalSourceRows === 'ineligible' && inForce.some((c) => c.Source === 'External' && (c.Type !== 'Update' || RecordHistory.changedFields(c.ChangesJSON).has(field)))) {
      return { Status: 'uncovered', Reason: 'external-ineligible' };
    }
    return { Status: 'value', Value: RecordHistory.fieldOf(last.FullRecordJSON, field), ChangeID: last.ID, ChangedAt: last.ChangedAt };
  }

  /** The scalar fields of a FullRecordJSON snapshot; a malformed snapshot reads as no fields, a non-scalar value as null. */
  private static recordOf(json: string): ReadonlyMap<string, CellValue> {
    const parsed: ParseResult<JsonValue> = JsonParse.ParseJsonText(json, 'FullRecordJSON');
    if (parsed.Ok === false || !JsonParse.IsJsonObject(parsed.Value)) return new Map<string, CellValue>();
    return new Map(Object.entries(parsed.Value).map(([f, v]) => [f, typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? v : null] as const));
  }

  /** A field of a FullRecordJSON snapshot; a malformed snapshot, an absent field or a non-scalar value reads as null. */
  private static fieldOf(json: string, field: string): CellValue {
    return RecordHistory.recordOf(json).get(field) ?? null;
  }

  /** The field names a ChangesJSON lists; a malformed one lists none. */
  private static changedFields(json: string): ReadonlySet<string> {
    const parsed: ParseResult<JsonValue> = JsonParse.ParseJsonText(json, 'ChangesJSON');
    if (parsed.Ok === false || !JsonParse.IsJsonObject(parsed.Value)) return new Set<string>();
    return new Set(Object.keys(parsed.Value));
  }

  /**
   * A value in the form both sides of a comparison use, so one value written by two serializers (the Record Changes
   * snapshot and the driver's current row, or two change rows) is one value: blank as '', dates and timestamp text as ISO
   * instants, a date-only text (`2025-01-15`, how a SQL `date` column can serialize) as that day's UTC-midnight instant,
   * 1/0 and true/false as one boolean on a field the metadata declares boolean, anything else as text. Text that only
   * starts like a timestamp (a code such as `2025-01-15T-BATCH-1`) stays text. The midnight instant is written from the
   * date text itself, never through a Date, which would roll a text that names no day (`2025-02-30`) into another day
   * (2025-03-02) and equal it; written out, such a text can only equal itself.
   *
   * The boolean rule is scoped to boolean (bit) fields because only there is it safe: a bit column's serializers write
   * it as 1/0 or as true/false, so the two are one value. On a numeric field 1 is a quantity, and a value that moved
   * from 1 to `true` there was written by something other than the column's own type; equating them would hide that
   * change, so a numeric field compares numbers and booleans as written.
   *
   * @throws AssemblyRefused `invalid-date-in-history` for timestamp text that names no valid instant (`2025-99-99T00:00`,
   * or `2025-02-30T00:00`, whose date is no calendar day)
   */
  private static comparable(v: CellValue, scope: ComparisonScope, field: string): string {
    if (v === null || v === undefined || v === '') return '';
    if (v instanceof Date) return v.toISOString();
    if (scope.BooleanFields.has(field) && (typeof v === 'boolean' || v === 1 || v === 0)) return v === true || v === 1 ? 'true' : 'false';
    if (typeof v === 'string' && TIMESTAMP_TEXT.test(v)) {
      const instant = new Date(v);
      if (Number.isNaN(instant.getTime()) || !RecordHistory.isCalendarDay(v)) throw new AssemblyRefused({ kind: 'invalid-date-in-history', entity: scope.EntityName, field, value: v });
      return instant.toISOString();
    }
    if (typeof v === 'string' && DATE_ONLY_TEXT.test(v)) return `${v}T00:00:00.000Z`;
    return String(v);
  }

  /**
   * Whether the `YYYY-MM-DD` a timestamp text starts with is a calendar day. A Date does not reject `2025-02-30`: it
   * rolls it to 2025-03-02, so the day is checked by reading it back.
   */
  private static isCalendarDay(text: string): boolean {
    const date = text.slice(0, 10);
    const day = new Date(`${date}T00:00:00.000Z`);
    return !Number.isNaN(day.getTime()) && day.toISOString().slice(0, 10) === date;
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

  /**
   * The entity's replayable history for `keys`. A key with no current row whose change rows end in a Delete is a
   * deleted record and replays from its history (uncovered from the Delete on); a key with no current row and no such
   * Delete, or a short read of the change rows, ends the assembly with its refusal.
   */
  public async Load(entity: AssemblyEntityInfo, keys: readonly string[], fields: readonly string[], policy: ChangeHistoryPolicy, now: Date): Promise<EntityHistory> {
    const requested = new Set(keys.map((k) => k.toLowerCase()));
    const changes = (await this.changeRowsOf(entity)).filter((c) => requested.has(RecordHistory.KeyOfRecordID(c.RecordID)));
    const current = await KeyedReader.ReadPresentByKeys(this.dataAccess, entity.Name, entity.PrimaryKey, keys, fields);
    const history = RecordHistory.BuildEntityHistory(entity, changes, current.Rows, fields, policy, now);
    if (current.MissingKeys.some((k) => history.DeletedRecordAt(k, now) === null)) {
      throw new AssemblyRefused({ kind: 'truncated-read', entity: entity.Name, rowsExpected: current.Rows.size + current.MissingKeys.length, rowsRead: current.Rows.size });
    }
    return history;
  }

  /** See {@link IRecordHistoryReader.LoadDeletedChildren}; reads the entity's change rows once, shared with {@link Load}. */
  public async LoadDeletedChildren(entity: AssemblyEntityInfo, foreignKeyField: string, ownerKeys: readonly string[]): Promise<readonly DeletedChildRecord[]> {
    return RecordHistory.DeletedChildren(await this.changeRowsOf(entity), foreignKeyField, ownerKeys);
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
