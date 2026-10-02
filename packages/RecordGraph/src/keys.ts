import { CompositeKey, EntityInfo } from '@memberjunction/core';

/**
 * Build a CompositeKey from entity metadata and a record data object.
 */
export function BuildCompositeKeyFromRecord(
    entityInfo: EntityInfo,
    record: Record<string, unknown>
): CompositeKey {
    return CompositeKey.FromEntityRecord(entityInfo, record);
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

/**
 * Build a CompositeKey for an entity that we know uses 'ID' as PK.
 * Documented for MJ system entities only where the key is ID.
 */
export function BuildIdKey(id: string): CompositeKey {
    return CompositeKey.FromID(id); // first-pk-ok: caller asserts entity uses single ID column
}

/** @deprecated Use {@link BuildCompositeKeyFromRecord}. */
export function buildCompositeKeyFromRecord(entityInfo: EntityInfo, record: Record<string, unknown>): CompositeKey {
    return BuildCompositeKeyFromRecord(entityInfo, record);
}

/** @deprecated Use {@link BuildPrimaryKeyForLoad}. */
export function buildPrimaryKeyForLoad(entityInfo: EntityInfo, value: string): CompositeKey {
    return BuildPrimaryKeyForLoad(entityInfo, value);
}

/** @deprecated Use {@link BuildIdKey}. */
export function buildIdKey(id: string): CompositeKey {
    return BuildIdKey(id);
}
