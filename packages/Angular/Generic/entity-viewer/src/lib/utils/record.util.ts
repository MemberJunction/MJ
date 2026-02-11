import { EntityInfo, CompositeKey } from '@memberjunction/core';
import { ViewGridState } from '@memberjunction/core-entities';

/**
 * Build a CompositeKey from a plain record using EntityInfo PK fields.
 * Works with both plain objects (from ResultType: 'simple') and BaseEntity instances.
 */
export function buildCompositeKey(record: Record<string, unknown>, entityInfo: EntityInfo): CompositeKey {
    const kvps = entityInfo.PrimaryKeys.map(pk => ({
        FieldName: pk.Name,
        Value: record[pk.Name]
    }));
    return new CompositeKey(kvps);
}

/**
 * Build a PK concatenated string matching CompositeKey.ToConcatenatedString() format.
 * Used as a stable row identifier for selection, tracking, and map keys.
 */
export function buildPkString(record: Record<string, unknown>, entityInfo: EntityInfo): string {
    return buildCompositeKey(record, entityInfo).ToConcatenatedString();
}

/**
 * Compute the Fields array to request from RunView based on EntityInfo and optional grid state.
 * Includes: PK fields, NameField, visible display fields, and timestamp fields.
 */
export function computeFieldsList(entityInfo: EntityInfo, gridState?: ViewGridState | null): string[] {
    const fields = new Set<string>();

    // Always include PK fields
    for (const pk of entityInfo.PrimaryKeys) {
        fields.add(pk.Name);
    }

    // Include NameField for display name resolution
    if (entityInfo.NameField) {
        fields.add(entityInfo.NameField.Name);
    }

    // Include visible fields from gridState or DefaultInView
    if (gridState?.columnSettings?.length) {
        for (const col of gridState.columnSettings) {
            if (!col.hidden) {
                fields.add(col.Name);
            }
        }
    } else {
        for (const f of entityInfo.Fields) {
            if (f.DefaultInView) {
                fields.add(f.Name);
            }
        }
    }

    // Include __mj timestamp fields (commonly used for sort and display)
    fields.add('__mj_CreatedAt');
    fields.add('__mj_UpdatedAt');

    return Array.from(fields);
}
