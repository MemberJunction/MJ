/**
 * Pure schema-scope predicates used by CodeGen SQL generation.
 * Kept out of sql_codegen.ts so unit tests do not load the full generator.
 */

/** Case-insensitive, trimmed membership in a schema-name list. */
export function schemaNameInList(schema: string, list: string[] | undefined | null): boolean {
    if (!list || list.length === 0) {
        return false;
    }
    const key = schema.trim().toLowerCase();
    return list.some((s) => s.trim().toLowerCase() === key);
}

/**
 * Cascade SQL for a related entity whose FK points at `parentSchema`.
 * Default is intra-schema only. `allowCrossSchemaCascadeDeletes` restores the
 * historical walk across every schema in metadata — that is a dangerous
 * escape hatch and must stay off for Open Apps.
 */
export function shouldEmitCascadeForRelatedEntity(
    parentSchema: string,
    relatedSchema: string,
    allowCrossSchemaCascadeDeletes: boolean,
): boolean {
    if (allowCrossSchemaCascadeDeletes) {
        return true;
    }
    return parentSchema.trim().toLowerCase() === relatedSchema.trim().toLowerCase();
}

/**
 * Whether a custom/layered base view for `schemaName` may be `sp_refreshview`'d
 * into the migration log (STEP 4.5).
 *
 * Always drop `excludeSchemas`. When `includeSchemas` is non-empty, keep only
 * that positive list. When it is empty/unset, keep current "all modified
 * custom views" behavior minus excludes.
 */
export function entityInCustomBaseViewRefreshScope(
    schemaName: string,
    excludeSchemas: string[],
    includeSchemas?: string[] | null,
): boolean {
    if (schemaNameInList(schemaName, excludeSchemas)) {
        return false;
    }
    if (includeSchemas && includeSchemas.length > 0) {
        return schemaNameInList(schemaName, includeSchemas);
    }
    return true;
}
