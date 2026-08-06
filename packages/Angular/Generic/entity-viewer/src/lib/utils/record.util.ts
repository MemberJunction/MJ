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
 * Rewrite host-supplied column field names to the entity's OWN spelling.
 *
 * A page may reasonably write `field: 'name'` where the entity says `Name`, and the grid resolves
 * host names case-insensitively when it looks up metadata — so such a column *renders*. But the
 * spelling does not stay cosmetic: it becomes the AG Grid colDef's `field`, and therefore its
 * `colId`, and therefore the key in captured grid state and sort settings. Meanwhile the row objects
 * the grid builds are keyed by the ENTITY's spelling. Anything that addresses data or matches state
 * by that name then misses: cells resolve to undefined, the captured state drops the column, a saved
 * sort is discarded.
 *
 * Normalising once, here, is what keeps those two vocabularies from diverging — the alternative is a
 * case-insensitive comparison at every one of those sites, which is the state that produced the bug.
 *
 * Unchanged columns are returned by REFERENCE (so callers can detect a no-op cheaply), and changed
 * ones as copies — the host's own array and objects are never mutated. A name matching no field is
 * left alone for the existing validation to reject.
 */
export function canonicalizeColumnFields<T extends { field: string }>(
    entityInfo: EntityInfo,
    columns: readonly T[],
): T[] {
    return columns.map(col => {
        const field = entityInfo.Fields.find(f => f.Name.toLowerCase() === col.field.toLowerCase());
        return field && field.Name !== col.field ? { ...col, field: field.Name } : col;
    });
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
            const field = entityInfo.Fields.find(f => f.Name.toLowerCase() === name.toLowerCase());
            // Add the ENTITY's spelling, not the host's. A page may reasonably write `field: 'name'`
            // where the entity says `Name`, and metadata lookups here are case-insensitive so the
            // column is accepted — but this list goes on the wire. On the GraphQL transport it is
            // interpolated straight into the selection set, and GraphQL field names are case
            // SENSITIVE, so the host's spelling produces `Cannot query field "name"` and the whole
            // view fails: an error and zero rows, not one odd column. (This Set is case-sensitive
            // too, so the two spellings would not even collapse into one entry.)
            //
            // Callers that hand this function raw host names should also run them through
            // `canonicalizeColumnFields` for the column definitions, or the rendered column will
            // address a key the fetched rows do not have.
            if (field) {
                fields.add(field.Name);
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
