/**
 * Shared constants and utilities for the version-history package.
 */


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
// SQL safety & Composite key utilities
// NOTE: Moved to @memberjunction/record-graph. Re-exported here for backward compatibility.
// ---------------------------------------------------------------------------

export {
    escapeSqlString,
    SqlEquals,
    sqlEquals,
    SqlContains,
    sqlContains,
    SqlIn,
    sqlIn,
    SqlNotIn,
    sqlNotIn,
    BuildCompositeKeyFromRecord,
    buildCompositeKeyFromRecord,
    BuildPrimaryKeyForLoad,
    buildPrimaryKeyForLoad,
    BuildIdKey,
    buildIdKey,
} from '@memberjunction/record-graph';
import { SqlEquals, BuildPrimaryKeyForLoad } from '@memberjunction/record-graph';

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
