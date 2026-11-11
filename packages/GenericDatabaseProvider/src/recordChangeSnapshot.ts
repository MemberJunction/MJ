import { BaseEntity, EntityField, UserInfo } from '@memberjunction/core';

/**
 * The old and new record snapshots a save hands to `BuildRecordChangePayload`. `OldData` is
 * null for a create.
 */
export interface RecordChangeSnapshots {
    NewData: Record<string, unknown>;
    OldData: Record<string, unknown> | null;
}

/**
 * True when the field's stored value is not in the saving object: either the hydration source
 * omitted it ({@link EntityField.NotLoaded}), or it was written after being omitted, so its old
 * value is a construction artifact rather than the stored value.
 */
function lacksStoredValue(field: EntityField): boolean {
    return field.NotLoaded || field.GetState().WrittenAfterNotLoaded === true;
}

/**
 * The names of the fields `user` may not read whose stored value the saving object does not
 * hold — the columns a restricted user's object leaves out of a snapshot. Empty for every user
 * denied nothing, which is what lets those saves skip the stored-row read: a field such a user's
 * object lacks only because its load left the column out (a list load skips binary columns)
 * stays out of the snapshot, as it always has.
 */
export function FieldsLackingStoredValue(entity: BaseEntity, user: UserInfo | null | undefined): Set<string> {
    const names = new Set<string>();
    const denied = user && entity.EntityInfo.FieldLevelSecurityApplies ? entity.EntityInfo.GetDeniedReadFields(user) : null;
    if (!denied || denied.size === 0) {
        return names;
    }
    for (const fieldInfo of entity.EntityInfo.Fields) {
        if (!denied.has(fieldInfo.Name.trim().toLowerCase())) {
            continue;
        }
        const field = entity.GetFieldByName(fieldInfo.Name);
        if (field && lacksStoredValue(field)) {
            names.add(fieldInfo.Name);
        }
    }
    return names;
}

/**
 * The fields in `lacking` that the saving object has written: their old values in the object are
 * construction artifacts, so the diff needs their stored values. A lacking field the object never
 * wrote does not appear in either snapshot, so the diff never sees it.
 */
export function FieldsWrittenWithoutStoredValue(entity: BaseEntity, lacking: ReadonlySet<string>): Set<string> {
    const written = new Set<string>();
    for (const name of lacking) {
        if (entity.GetFieldByName(name)?.GetState().WrittenAfterNotLoaded === true) {
            written.add(name);
        }
    }
    return written;
}

/**
 * The snapshots for a create. A field the INSERT omits because the user may not supply it
 * (`CreateSuppressed`) is left out of the new-values snapshot: the value the object holds is one
 * the record never received, and the column's database default is not known until the insert
 * runs. The next change to the record snapshots the stored value.
 */
export function CreateSnapshots(entity: BaseEntity): RecordChangeSnapshots {
    const newData = entity.GetAll(false) as Record<string, unknown>;
    for (const field of entity.Fields) {
        if (field.CreateSuppressed) {
            delete newData[field.Name];
        }
    }
    return { NewData: newData, OldData: null };
}

/**
 * Widens an update's snapshots to the whole record using the stored row, in entity field order.
 *
 * - **New values**: the saving object's values, and the stored value for each field it never held.
 * - **Old values**: the saving object's old values, and the stored value for each field it never
 *   held — including one it then wrote blind, whose in-memory old value is not the stored one.
 *
 * A field the object never held has the same stored value on both sides, so it never appears as
 * a change: the diff still lists only what the save changed.
 */
export function WidenUpdateSnapshots(
    entity: BaseEntity,
    narrow: RecordChangeSnapshots,
    storedRow: Record<string, unknown>,
    lacking: ReadonlySet<string>,
): RecordChangeSnapshots {
    const newData: Record<string, unknown> = {};
    const oldData: Record<string, unknown> = {};
    const narrowOld = narrow.OldData ?? {};
    for (const fieldInfo of entity.EntityInfo.Fields) {
        const name = fieldInfo.Name;
        const stored = name in storedRow;
        if (name in narrow.NewData) newData[name] = narrow.NewData[name];
        else if (stored) newData[name] = storedRow[name];

        if (lacking.has(name) && stored) oldData[name] = storedRow[name];
        else if (name in narrowOld) oldData[name] = narrowOld[name];
    }
    return { NewData: newData, OldData: oldData };
}

/**
 * Widens a delete's record snapshot to the whole record using the stored row, in entity field
 * order: the deleting object's values, and the stored value for each field it never held. A
 * deleted record is restored from this snapshot, so a narrowed one would bring the record back
 * without the columns its deleter could not read.
 */
export function WidenDeleteSnapshot(
    entity: BaseEntity,
    narrow: Record<string, unknown>,
    storedRow: Record<string, unknown>,
    lacking: ReadonlySet<string>,
): Record<string, unknown> {
    return WidenUpdateSnapshots(entity, { NewData: narrow, OldData: narrow }, storedRow, lacking).OldData ?? narrow;
}

/**
 * How a column is rendered when a save builds its Record Change's `FullRecordJSON` in SQL from
 * the row the save returned. Each kind is written the way the same value serializes from a
 * loaded entity, so snapshots built in SQL read like the ones built from an entity:
 *
 * - `utc-datetime` / `offset-datetime`: UTC ISO-8601 with milliseconds and `Z`. MJ stores date-times
 *   without an offset as UTC; written without the `Z`, a reader would parse them as local time.
 * - `date`: midnight UTC (`YYYY-MM-DDT00:00:00.000Z`); `time`: a time on 1970-01-01 UTC.
 * - `bigint`: a string, as the drivers return it, so values above 2^53 keep every digit.
 * - `binary`: base64; `json`: the JSON text as a string, not a nested object.
 * - `clr`: SQL Server CLR types (spatial, `hierarchyid`), which `FOR JSON` refuses to serialize.
 * - `text`: any type not listed here, cast to text so an unknown type can never fail the save.
 * - `native`: strings, numbers, booleans and UUIDs, written as the database's JSON renders them.
 */
export type RecordChangeSnapshotColumnKind =
    | 'utc-datetime'
    | 'offset-datetime'
    | 'date'
    | 'time'
    | 'bigint'
    | 'binary'
    | 'json'
    | 'clr'
    | 'text'
    | 'native';

/** The database platforms that build `FullRecordJSON` in SQL. */
export type RecordChangeSnapshotPlatform = 'sqlserver' | 'postgresql';

const NATIVE_SNAPSHOT_TYPES = new Set([
    'char', 'varchar', 'nchar', 'nvarchar', 'text', 'ntext', 'character', 'character varying', 'citext',
    'uniqueidentifier', 'uuid', 'bit', 'boolean', 'bool',
    'tinyint', 'smallint', 'int', 'integer', 'int2', 'int4',
    'decimal', 'numeric', 'money', 'smallmoney', 'float', 'real', 'double precision', 'float4', 'float8',
]);

const SHARED_SNAPSHOT_KINDS: ReadonlyMap<string, RecordChangeSnapshotColumnKind> = new Map<string, RecordChangeSnapshotColumnKind>([
    ['datetime', 'utc-datetime'],
    ['datetime2', 'utc-datetime'],
    ['smalldatetime', 'utc-datetime'],
    ['datetimeoffset', 'offset-datetime'],
    ['timestamptz', 'offset-datetime'],
    ['timestamp with time zone', 'offset-datetime'],
    ['timestamp without time zone', 'utc-datetime'],
    ['date', 'date'],
    ['time', 'time'],
    ['time without time zone', 'time'],
    ['bigint', 'bigint'],
    ['int8', 'bigint'],
    ['varbinary', 'binary'],
    ['binary', 'binary'],
    ['image', 'binary'],
    ['bytea', 'binary'],
    ['json', 'json'],
    ['jsonb', 'json'],
]);

/** SQL Server's `timestamp` is `rowversion` (binary); PostgreSQL's is a date-time without an offset. */
const PLATFORM_SNAPSHOT_KINDS: Record<RecordChangeSnapshotPlatform, ReadonlyMap<string, RecordChangeSnapshotColumnKind>> = {
    sqlserver: new Map<string, RecordChangeSnapshotColumnKind>([
        ['timestamp', 'binary'],
        ['rowversion', 'binary'],
        ['geography', 'clr'],
        ['geometry', 'clr'],
        ['hierarchyid', 'clr'],
    ]),
    postgresql: new Map<string, RecordChangeSnapshotColumnKind>([['timestamp', 'utc-datetime']]),
};

/**
 * The {@link RecordChangeSnapshotColumnKind} of a column with SQL type `sqlType` (an
 * `EntityField.Type`, in either SQL Server or PostgreSQL vocabulary, with or without a length).
 */
export function RecordChangeSnapshotColumnKindOf(sqlType: string, platform: RecordChangeSnapshotPlatform): RecordChangeSnapshotColumnKind {
    const name = sqlType.trim().toLowerCase().replace(/\s*\(.*\)\s*$/, '');
    const kind = PLATFORM_SNAPSHOT_KINDS[platform].get(name) ?? SHARED_SNAPSHOT_KINDS.get(name);
    if (kind) {
        return kind;
    }
    return NATIVE_SNAPSHOT_TYPES.has(name) ? 'native' : 'text';
}
