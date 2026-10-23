import { EntityInfo, EntityFieldInfo, CompositeKey, EntityRecordNameInput, IMetadataProvider } from '@memberjunction/core';
import { ViewGridState } from '../types';

/**
 * Build a CompositeKey from a plain record using EntityInfo PK fields.
 * Works with both plain objects (from ResultType: 'simple') and BaseEntity instances.
 */
export function BuildCompositeKey(record: Record<string, unknown>, entityInfo: EntityInfo): CompositeKey {
    return CompositeKey.FromEntityRecord(entityInfo, record);
}

/** @deprecated Use {@link BuildCompositeKey}. */
export function buildCompositeKey(record: Record<string, unknown>, entityInfo: EntityInfo): CompositeKey {
    return BuildCompositeKey(record, entityInfo);
}

/**
 * Build a PK concatenated string matching CompositeKey.ToConcatenatedString() format.
 * Used as a stable row identifier for selection, tracking, and map keys.
 */
export function BuildPkString(record: Record<string, unknown>, entityInfo: EntityInfo): string {
    return BuildCompositeKey(record, entityInfo).ToConcatenatedString();
}

/** @deprecated Use {@link BuildPkString}. */
export function buildPkString(record: Record<string, unknown>, entityInfo: EntityInfo): string {
    return BuildPkString(record, entityInfo);
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
export function CanonicalizeColumnFields<T extends { field: string }>(
    entityInfo: EntityInfo,
    columns: readonly T[],
): T[] {
    return columns.map(col => {
        const field = entityInfo.Fields.find(f => f.Name.toLowerCase() === col.field.toLowerCase());
        return field && field.Name !== col.field ? { ...col, field: field.Name } : col;
    });
}

/** @deprecated Use {@link CanonicalizeColumnFields}. */
export function canonicalizeColumnFields<T extends { field: string }>(
    entityInfo: EntityInfo,
    columns: readonly T[],
): T[] {
    return CanonicalizeColumnFields(entityInfo, columns);
}

/**
 * Compute the Fields array to request from RunView based on EntityInfo and optional grid state.
 * Includes: PK fields, NameField, visible display fields, and timestamp fields.
 */
export function ComputeFieldsList(
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

    // Include visible fields from gridState or DefaultInView.
    //
    // Resolved against the entity, exactly as the host branch above is, and for the same reason:
    // this list goes on the wire, and `GraphQLDataProvider.getViewRunTimeFieldList()` passes it
    // straight through into a selection set where field names are case SENSITIVE. An unresolvable
    // name does not produce one odd column, it fails the WHOLE view with zero rows. (That provider
    // already drops view-definition fields an entity no longer has, "rather than letting the whole
    // view blow up" — this branch was the one route that bypassed that care.) A saved state can
    // name a field this entity does not have in two ways: it belongs to a DIFFERENT entity, or the
    // schema dropped the field since it was saved.
    //
    // Nothing MJ produces internally can be invalid here — `buildCurrentGridState()` resolves every
    // captured `colId` against entity metadata and skips what does not resolve, which is also why
    // the row-number and filler columns never appear — so only an externally supplied `[GridState]`
    // reaches this with a foreign name.
    const gridStateFields: string[] = [];
    if (gridState?.columnSettings?.length) {
        for (const col of gridState.columnSettings) {
            if (col.hidden) {
                continue;
            }
            const field = entityInfo.Fields.find(f => f.Name.toLowerCase() === col.Name.toLowerCase());
            if (field) {
                // The entity's spelling, so the fetched key matches the key the rendered column
                // addresses the row by. The Set is case-sensitive, so two spellings would not
                // collapse into one entry.
                gridStateFields.push(field.Name);
            }
        }
    }

    // Falling through when the state contributed NOTHING is what keeps the fetch in step with what
    // is rendered. `buildAgColumnDefs()` applies the same floor (MemberJunction/MJ#4244): a state
    // matching no field of this entity is treated as absent and the grid renders DefaultInView
    // columns instead. Without the matching floor here those columns would be rendered but never
    // SELECTed, so every cell would come back empty — a stale-state problem wearing the costume of
    // missing data. A PARTIAL match is left alone, because dropping to DefaultInView there would
    // silently re-add columns the user had removed.
    if (gridStateFields.length > 0) {
        for (const name of gridStateFields) {
            fields.add(name);
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

    // For any polymorphic FK field (where EntityField.EntityIDFieldName is populated) included in
    // the projection, always include its companion EntityIDFieldName column (and any mapped virtual
    // name column) so the grid/cards/detail panel can resolve the target entity and record name
    // even if the user hid the EntityID column in their view settings.
    for (const f of entityInfo.Fields) {
        if (!fields.has(f.Name)) continue;
        const companionName = f.EntityIDFieldName?.trim();
        if (companionName) {
            const companionField = entityInfo.Fields.find(
                cf => cf.Name.toLowerCase() === companionName.toLowerCase()
            );
            if (companionField) {
                fields.add(companionField.Name);
                if (companionField.RelatedEntityNameFieldMap) {
                    fields.add(companionField.RelatedEntityNameFieldMap);
                }
            }
        }
        if (f.RelatedEntityNameFieldMap) {
            fields.add(f.RelatedEntityNameFieldMap);
        }
    }

    return Array.from(fields);
}

/** @deprecated Use {@link ComputeFieldsList}. */
export function computeFieldsList(
    entityInfo: EntityInfo,
    gridState?: ViewGridState | null,
    hostColumnFields?: readonly string[] | null,
): string[] {
    return ComputeFieldsList(entityInfo, gridState, hostColumnFields);
}

/**
 * Resolves the target `EntityInfo` for a polymorphic FK field (`field.EntityIDFieldName`)
 * on a plain record or `BaseEntity`-like map. Strictly relies on the hard metadata link
 * `field.EntityIDFieldName` — never falls back to field-name heuristics.
 */
export function ResolvePolymorphicTargetEntity(
    record: Record<string, unknown>,
    field: EntityFieldInfo,
    provider: IMetadataProvider | null | undefined,
): EntityInfo | undefined {
    const companionName = field.EntityIDFieldName?.trim();
    if (!companionName || !provider || !record) return undefined;
    const rawRef = record[companionName];
    if (rawRef == null) return undefined;
    const refStr = String(rawRef).trim();
    if (!refStr) return undefined;
    return provider.EntityByID(refStr) ?? provider.EntityByName(refStr);
}

/**
 * Builds a `CompositeKey` for a polymorphic `RecordID` value against `targetEntity`,
 * supporting both single-column bare values and `Field1|Val1||Field2|Val2` segments.
 */
export function BuildPolymorphicCompositeKey(
    rawRecordId: unknown,
    targetEntity: EntityInfo,
): CompositeKey | null {
    if (rawRecordId == null) return null;
    const str = String(rawRecordId).trim();
    if (!str) return null;
    return CompositeKey.FromURLSegment(targetEntity, str);
}

/**
 * Stable lookup key for a resolved polymorphic record name in a view's cache map.
 */
export function PolymorphicCacheKey(entityName: string, key: CompositeKey): string {
    return `${entityName}::${key.ToConcatenatedString()}`;
}

/**
 * Batch-resolves human-readable record names for all polymorphic FK fields (`EntityIDFieldName`)
 * across a page of records using a single `provider.GetEntityRecordNames(...)` call.
 */
export async function BatchResolvePolymorphicRecordNames(
    records: readonly Record<string, unknown>[],
    entityInfo: EntityInfo | null | undefined,
    provider: IMetadataProvider | null | undefined,
    existingCache?: Map<string, string>,
): Promise<Map<string, string>> {
    const cache = existingCache ?? new Map<string, string>();
    if (!entityInfo?.Fields || !provider || !records || records.length === 0) {
        return cache;
    }

    const polyFields = entityInfo.Fields.filter(
        f => typeof f.EntityIDFieldName === 'string' && f.EntityIDFieldName.trim().length > 0
    );
    if (polyFields.length === 0) {
        return cache;
    }

    const pendingByKey = new Map<string, EntityRecordNameInput>();
    for (const row of records) {
        for (const pf of polyFields) {
            const rawId = row[pf.Name];
            if (rawId == null || rawId === '') continue;
            const targetEntity = ResolvePolymorphicTargetEntity(row, pf, provider);
            if (!targetEntity) continue;
            const compositeKey = BuildPolymorphicCompositeKey(rawId, targetEntity);
            if (!compositeKey || !compositeKey.HasValue) continue;
            const cacheKey = PolymorphicCacheKey(targetEntity.Name, compositeKey);
            if (!cache.has(cacheKey) && !pendingByKey.has(cacheKey)) {
                pendingByKey.set(cacheKey, {
                    EntityName: targetEntity.Name,
                    CompositeKey: compositeKey,
                });
            }
        }
    }

    if (pendingByKey.size === 0) {
        return cache;
    }

    try {
        const inputs = Array.from(pendingByKey.values());
        const results = await provider.GetEntityRecordNames(inputs);
        for (const res of results) {
            if (res.Success && res.RecordName) {
                const key = PolymorphicCacheKey(res.EntityName, res.CompositeKey);
                cache.set(key, res.RecordName);
            }
        }
    } catch {
        // Non-fatal: unresolved cells fall back to showing the raw RecordID
    }

    return cache;
}
