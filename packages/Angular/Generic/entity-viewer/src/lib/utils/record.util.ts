import { EntityInfo, CompositeKey } from '@memberjunction/core';
import { ViewGridState } from '../types';

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
export function computeFieldsList(
    entityInfo: EntityInfo,
    gridState?: ViewGridState | null,
    hostColumnFields?: readonly string[] | null,
): string[] {
    const fields = new Set<string>();

    // Fields the HOST explicitly asked to display. Without these, a page that supplies `[Columns]`
    // renders columns whose data was never fetched — every cell shows as empty, which reads as a
    // data bug rather than a missing SELECT. They are added unconditionally (not as an alternative
    // to the branches below) because a host column list says what to SHOW, while DefaultInView and
    // the grid state say what to fetch by default; the host's columns must be a superset, not a
    // replacement. Names are validated against the entity so a stale column can't break the query.
    if (hostColumnFields?.length) {
        for (const name of hostColumnFields) {
            if (entityInfo.Fields.some(f => f.Name.toLowerCase() === name.toLowerCase())) {
                fields.add(name);
            }
        }
    }

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
        // First try to use DefaultInView fields
        const defaultInViewFields = entityInfo.Fields.filter(f => f.DefaultInView);

        if (defaultInViewFields.length > 0) {
            for (const f of defaultInViewFields) {
                fields.add(f.Name);
            }
        } else {
            // Fallback: when no DefaultInView fields are defined, include the first 10
            // non-system fields. This matches the fallback in generateAgColumnDefs()
            // which uses getDefaultFieldsFallback() to show columns even when
            // DefaultInView isn't configured.
            const fallbackFields = entityInfo.Fields
                .filter(f =>
                    !f.Name.startsWith('__mj_') &&
                    !(f.IsPrimaryKey && f.SQLFullType?.toLowerCase() === 'uniqueidentifier') &&
                    (f.Length <= 500 || f.Length < 0)  // Exclude very long text unless nvarchar(max)
                )
                .slice(0, 10);

            for (const f of fallbackFields) {
                fields.add(f.Name);
            }
        }
    }

    // Include __mj timestamp fields (commonly used for sort and display)
    fields.add('__mj_CreatedAt');
    fields.add('__mj_UpdatedAt');

    // Lat/lng only — never address-tagged fields. The map uses pre-geocoded
    // coords, never text-based location guessing.
    for (const f of entityInfo.Fields) {
        if (f.ExtendedType === 'GeoLatitude' || f.ExtendedType === 'GeoLongitude') {
            fields.add(f.Name);
        }
    }
    // Gated on SupportsGeoCoding — BoundaryGeoJSON is nvarchar(max), wasteful
    // to pull for grid views that won't render a map.
    if (entityInfo.SupportsGeoCoding && entityInfo.Fields.some(f => f.Name === 'BoundaryGeoJSON')) {
        fields.add('BoundaryGeoJSON');
    }

    return Array.from(fields);
}
