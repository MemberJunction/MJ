/**
 * Shared constants and utilities for the version-history package.
 */

import { EscapeSQLString } from '@memberjunction/global';

// ---------------------------------------------------------------------------
// Entity name constants
// ---------------------------------------------------------------------------

/** Entity name for Version Labels */
export const ENTITY_VERSION_LABELS = 'MJ: Version Labels';

/** Entity name for Version Label Items */
export const ENTITY_VERSION_LABEL_ITEMS = 'MJ: Version Label Items';

/** Entity name for Version Label Restores */
export const ENTITY_VERSION_LABEL_RESTORES = 'MJ: Version Label Restores';

/** Entity name for Record Changes */
export const ENTITY_RECORD_CHANGES = 'MJ: Record Changes';

// ---------------------------------------------------------------------------
// SQL safety utilities
// ---------------------------------------------------------------------------

/**
 * Escape a string value for safe inclusion in a SQL filter.
 *
 * @deprecated Import `EscapeSQLString` from `@memberjunction/global` instead — it is the one
 * canonical escaper. This alias remains only so external callers do not break; it will be
 * removed in the next major.
 */
export const escapeSqlString = (value: string | null | undefined): string => EscapeSQLString(value);

/**
 * Build a safe SQL equality filter: FieldName = 'escapedValue'
 */
export function SqlEquals(fieldName: string, value: string): string {
    return `${fieldName} = '${EscapeSQLString(value)}'`;
}

/** @deprecated Use {@link SqlEquals}. */
export function sqlEquals(fieldName: string, value: string): string {
    return SqlEquals(fieldName, value);
}

/**
 * Build a safe SQL LIKE filter: FieldName LIKE '%escapedValue%'
 *
 * NOTE: `EscapeSQLString` neutralises quotes but NOT LIKE metacharacters — a `value` containing
 * `%`, `_` or `[` is still interpreted as a wildcard pattern rather than as literal text. That is
 * the long-standing behaviour of this helper and callers depend on it. If you need a literal
 * match, escape the metacharacters and add `ESCAPE '\'` (see `escapeLikeValue()` in
 * `@memberjunction/core`, `generic/runQuerySQLFilterImplementations.ts`).
 */
export function SqlContains(fieldName: string, value: string): string {
    return `${fieldName} LIKE '%${EscapeSQLString(value)}%'`;
}

/** @deprecated Use {@link SqlContains}. */
export function sqlContains(fieldName: string, value: string): string {
    return SqlContains(fieldName, value);
}

/**
 * Build a safe SQL IN filter: FieldName IN ('a','b','c')
 */
export function SqlIn(fieldName: string, values: string[]): string {
    const escaped = values.map(v => `'${EscapeSQLString(v)}'`).join(', ');
    return `${fieldName} IN (${escaped})`;
}

/** @deprecated Use {@link SqlIn}. */
export function sqlIn(fieldName: string, values: string[]): string {
    return SqlIn(fieldName, values);
}

/**
 * Build a safe SQL NOT IN filter: FieldName NOT IN ('a','b','c')
 */
export function SqlNotIn(fieldName: string, values: string[]): string {
    const escaped = values.map(v => `'${EscapeSQLString(v)}'`).join(', ');
    return `${fieldName} NOT IN (${escaped})`;
}

/** @deprecated Use {@link SqlNotIn}. */
export function sqlNotIn(fieldName: string, values: string[]): string {
    return SqlNotIn(fieldName, values);
}

// ---------------------------------------------------------------------------
// Composite key utilities
// ---------------------------------------------------------------------------

import { CompositeKey, EntityInfo } from '@memberjunction/core';

/**
 * Build a CompositeKey from entity metadata and a record data object.
 * Shared utility to avoid duplication across Walker and SnapshotBuilder.
 */
export function BuildCompositeKeyFromRecord(
    entityInfo: EntityInfo,
    record: Record<string, unknown>
): CompositeKey {
    return CompositeKey.FromEntityRecord(entityInfo, record);
}

/** @deprecated Use {@link BuildCompositeKeyFromRecord}. */
export function buildCompositeKeyFromRecord(
    entityInfo: EntityInfo,
    record: Record<string, unknown>
): CompositeKey {
    return BuildCompositeKeyFromRecord(entityInfo, record);
}

/**
 * Build a CompositeKey for loading from a stored record id. Accepts the bare value of a
 * single-column key (any column name) or the `Field1|Value1||Field2|Value2` segment Record
 * Changes / Version Label Items persist, so composite keys load too.
 */
export function BuildPrimaryKeyForLoad(
    entityInfo: EntityInfo,
    value: string
): CompositeKey {
    return CompositeKey.FromURLSegment(entityInfo, value);
}

/** @deprecated Use {@link BuildPrimaryKeyForLoad}. */
export function buildPrimaryKeyForLoad(
    entityInfo: EntityInfo,
    value: string
): CompositeKey {
    return BuildPrimaryKeyForLoad(entityInfo, value);
}

/**
 * Build a CompositeKey for an entity that we know uses 'ID' as PK.
 * Only for MJ system entities (VersionLabel, VersionLabelItem, etc.)
 * where we control the schema and know the PK is always 'ID'.
 */
export function BuildIdKey(id: string): CompositeKey {
    return CompositeKey.FromID(id); // first-pk-ok: documented for MJ system entities only (Version Labels / Label Items / Restores / Record Changes), whose key is ID
}

/** @deprecated Use {@link BuildIdKey}. */
export function buildIdKey(id: string): CompositeKey {
    return BuildIdKey(id);
}

// ---------------------------------------------------------------------------
// Record change utilities
// ---------------------------------------------------------------------------

import { BaseEntity, IMetadataProvider, Metadata, RunView, UserInfo, LogError } from '@memberjunction/core';

/**
 * Load a FullRecordJSON snapshot from a RecordChange entry.
 * Returns parsed JSON or null on failure.
 * Shared by DiffEngine and RestoreEngine.
 */
export async function LoadRecordChangeSnapshot(
    recordChangeId: string,
    contextUser: UserInfo
): Promise<Record<string, unknown> | null> {
    const rv = new RunView();
    const result = await rv.RunView<Record<string, unknown>>({
        EntityName: ENTITY_RECORD_CHANGES,
        ExtraFilter: SqlEquals('ID', recordChangeId),
        // 'EntityID' is required, not decorative: field-level security projects a Record Change's
        // payload against the entity the row is ABOUT, and a row arriving without EntityID cannot be
        // resolved — so the payload is withheld. See guides/FIELD_LEVEL_SECURITY_GUIDE.md §3.2.
        //
        // For a restricted caller on a field-secured entity the snapshot comes back NARROWED, which
        // is what both consumers want: RestoreEngine skips fields the snapshot omits (so a denied
        // column keeps its stored value rather than being overwritten), and DiffEngine simply has
        // nothing to show for them.
        Fields: ['ID', 'EntityID', 'FullRecordJSON'],
        MaxRows: 1,
        ResultType: 'simple',
    }, contextUser);

    if (!result.Success || result.Results.length === 0) {
        LogError(`VersionHistory: RecordChange '${recordChangeId}' not found`);
        return null;
    }

    const jsonStr = result.Results[0]['FullRecordJSON'] as string;
    if (!jsonStr) {
        LogError(`VersionHistory: RecordChange '${recordChangeId}' has null FullRecordJSON`);
        return null;
    }

    try {
        return JSON.parse(jsonStr);
    } catch {
        LogError(`VersionHistory: Failed to parse FullRecordJSON for RecordChange '${recordChangeId}'`);
        return null;
    }
}

/** @deprecated Use {@link LoadRecordChangeSnapshot}. */
export async function loadRecordChangeSnapshot(
    recordChangeId: string,
    contextUser: UserInfo
): Promise<Record<string, unknown> | null> {
    return LoadRecordChangeSnapshot(recordChangeId, contextUser);
}

/**
 * Load a strongly-typed entity by its ID using InnerLoad with the entity's actual PK name.
 * Returns null if not found or on error.
 */
export async function LoadEntityById<T extends BaseEntity = BaseEntity>(
    entityName: string,
    id: string,
    contextUser: UserInfo,
    provider?: IMetadataProvider
): Promise<T | null> {
    const md = provider ?? Metadata.Provider;
    const entityInfo = md.EntityByName(entityName);
    if (!entityInfo) {
        LogError(`VersionHistory: Entity '${entityName}' not found in metadata`);
        return null;
    }

    const entity = await md.GetEntityObject<T>(entityName, contextUser);
    const key = BuildPrimaryKeyForLoad(entityInfo, id);
    const loaded = await entity.InnerLoad(key);
    if (!loaded) return null;
    return entity;
}

/** @deprecated Use {@link LoadEntityById}. */
export async function loadEntityById<T extends BaseEntity = BaseEntity>(
    entityName: string,
    id: string,
    contextUser: UserInfo,
    provider?: IMetadataProvider
): Promise<T | null> {
    return LoadEntityById(entityName, id, contextUser, provider);
}
