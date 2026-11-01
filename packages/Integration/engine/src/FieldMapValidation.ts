/**
 * Start-of-run validation for the MJ side of a field map.
 *
 * A field map's `DestinationFieldName` is the MJ column, in BOTH directions — pull writes it,
 * push reads it back out to build the external payload. Nothing checks that the column exists.
 * `BaseEntity.Set` looks the field up and, when it finds nothing, returns without doing anything
 * and without saying anything: the value is dropped for every record, the entity is never dirtied
 * by it, the save succeeds, and the run reports the rows as written. The observable result is a
 * column's worth of data that never arrives, on a sync that reports success — and if that field is
 * a key field, every record is re-created on the next run because it can never be matched again.
 *
 * This is the cheap check that turns that into one warning per map per run: the map is metadata,
 * so it is verifiable the moment the run knows its entity, long before the first record is fetched.
 * The decision is kept pure so it is tested without a provider or an entity.
 */

/** The parts of a field map this validation reads. */
export type ValidatableFieldMap = {
    SourceFieldName: string;
    DestinationFieldName: string;
    Status?: string | null;
    IsKeyField?: boolean | null;
};

/** One map that cannot bind, with the detail an operator needs to fix it. */
export type UnbindableFieldMap = {
    SourceFieldName: string;
    DestinationFieldName: string;
    IsKeyField: boolean;
};

/**
 * Returns the ACTIVE field maps whose destination column does not exist on the target entity.
 *
 * Matching is case-insensitive, because `BaseEntity` resolves field names case-insensitively — a
 * map that differs only in casing binds fine and is not a finding. An empty `entityFieldNames`
 * means the caller could not resolve the entity at all; that is a different (already reported)
 * condition, so nothing is returned rather than flagging every map.
 */
export function FindUnbindableFieldMaps(
    fieldMaps: readonly ValidatableFieldMap[],
    entityFieldNames: readonly string[],
): UnbindableFieldMap[] {
    if (entityFieldNames.length === 0) return [];
    const known = new Set(entityFieldNames.map(n => n.toLowerCase()));
    const unbindable: UnbindableFieldMap[] = [];
    for (const fm of fieldMaps) {
        if (fm.Status !== 'Active') continue;             // an inactive map is never applied
        const dest = fm.DestinationFieldName;
        if (!dest) continue;                              // no destination is a different defect
        if (known.has(dest.toLowerCase())) continue;
        unbindable.push({
            SourceFieldName: fm.SourceFieldName,
            DestinationFieldName: dest,
            IsKeyField: fm.IsKeyField === true,
        });
    }
    return unbindable;
}

/** The operator-facing sentence for a set of unbindable maps on one entity map. */
export function DescribeUnbindableFieldMaps(
    unbindable: readonly UnbindableFieldMap[],
    externalObjectName: string,
    entityName: string,
): string {
    const pairs = unbindable.map(u => `${u.SourceFieldName} -> ${u.DestinationFieldName}${u.IsKeyField ? ' (KEY)' : ''}`);
    const keyCount = unbindable.filter(u => u.IsKeyField).length;
    return (
        `${unbindable.length} active field map(s) for '${externalObjectName}' target a column that does not exist ` +
        `on '${entityName}': ${pairs.join(', ')}. Those values are silently dropped for every record — the write ` +
        `succeeds without them` +
        (keyCount > 0
            ? `, and because ${keyCount === 1 ? 'one of them is a KEY field' : `${keyCount} of them are KEY fields`}, ` +
              `records cannot be matched on a later run and will be re-created.`
            : `.`) +
        ` Apply the schema so the column exists, or point the map at a column that does.`
    );
}
