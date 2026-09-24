/**
 * Pure schema-scope predicates used by CodeGen SQL generation.
 * Kept out of sql_codegen.ts so unit tests do not load the full generator.
 */

/** Case-insensitive, trimmed membership in a schema-name list. */
export function SchemaNameInList(schema: string, list: string[] | undefined | null): boolean {
    if (!list || list.length === 0) {
        return false;
    }
    const key = schema.trim().toLowerCase();
    return list.some((s) => s.trim().toLowerCase() === key);
}

/** @deprecated Use {@link SchemaNameInList}. */
export function schemaNameInList(schema: string, list: string[] | undefined | null): boolean {
    return SchemaNameInList(schema, list);
}

/**
 * Cascade SQL for a related entity whose FK points at `parentSchema`.
 * Default is intra-schema only. `allowCrossSchemaCascadeDeletes` restores the
 * historical walk across every schema in metadata — that is a dangerous
 * escape hatch and must stay off for Open Apps.
 */
export function ShouldEmitCascadeForRelatedEntity(
    parentSchema: string,
    relatedSchema: string,
    allowCrossSchemaCascadeDeletes: boolean,
): boolean {
    if (allowCrossSchemaCascadeDeletes) {
        return true;
    }
    return parentSchema.trim().toLowerCase() === relatedSchema.trim().toLowerCase();
}

/** @deprecated Use {@link ShouldEmitCascadeForRelatedEntity}. */
export function shouldEmitCascadeForRelatedEntity(
    parentSchema: string,
    relatedSchema: string,
    allowCrossSchemaCascadeDeletes: boolean,
): boolean {
    return ShouldEmitCascadeForRelatedEntity(parentSchema, relatedSchema, allowCrossSchemaCascadeDeletes);
}

/**
 * Whether a custom/layered base view for `schemaName` may be `sp_refreshview`'d
 * into the migration log (STEP 4.5).
 *
 * Always drop `excludeSchemas`. When `includeSchemas` is non-empty, keep only
 * that positive list. When it is empty/unset, keep current "all modified
 * custom views" behavior minus excludes.
 */
export function EntityInCustomBaseViewRefreshScope(
    schemaName: string,
    excludeSchemas: string[],
    includeSchemas?: string[] | null,
): boolean {
    if (SchemaNameInList(schemaName, excludeSchemas)) {
        return false;
    }
    if (includeSchemas && includeSchemas.length > 0) {
        return SchemaNameInList(schemaName, includeSchemas);
    }
    return true;
}

/** @deprecated Use {@link EntityInCustomBaseViewRefreshScope}. */
export function entityInCustomBaseViewRefreshScope(
    schemaName: string,
    excludeSchemas: string[],
    includeSchemas?: string[] | null,
): boolean {
    return EntityInCustomBaseViewRefreshScope(schemaName, excludeSchemas, includeSchemas);
}
