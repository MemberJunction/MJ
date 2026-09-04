/**
 * Parameters for CodeGen's metadata-heal stored procedures
 * (`spUpdateExistingEntitiesFromSchema`, `spUpdateExistingEntityFieldsFromSchema`,
 * `spSetDefaultColumnWidthWhereNeeded`, `spUpdateSchemaInfoFromDatabase`,
 * `spDeleteUnneededEntityFields`).
 *
 * `includeSchemas` is compiled into `excludeSchemas` in memory so this CodeGen
 * *run* does not generate other apps. That expanded list is a photograph of
 * whoever is installed on the publisher database and MUST NOT be serialized
 * into a migration. Heal EXEC statements use:
 *   - authored `excludeSchemas` from mj.config.cjs (`sys`, `staging`, …)
 *   - `includeSchemas` as `@IncludedSchemaNames` when set
 */

export interface HealSchemaRoutineParams {
    values: string[];
    names: string[];
}

let authoredExcludeSchemas: string[] | null = null;

/** Capture the config exclude list before `applyIncludeSchemaScope` mutates it. Idempotent. */
export function snapshotAuthoredExcludeSchemas(excludeSchemas: string[] | undefined): void {
    if (authoredExcludeSchemas === null) {
        authoredExcludeSchemas = [...(excludeSchemas ?? [])];
    }
}

/** Test-only: reset the snapshot between cases. */
export function resetAuthoredExcludeSnapshot(): void {
    authoredExcludeSchemas = null;
}

export function getAuthoredExcludeSchemas(fallback?: string[]): string[] {
    if (authoredExcludeSchemas !== null) {
        return authoredExcludeSchemas;
    }
    return [...(fallback ?? [])];
}

/**
 * Named-parameter lists for a heal SP call.
 * `@IncludedSchemaNames` is omitted when `includeSchemas` is empty so classic
 * MJ (no include list) keeps the historical EXEC shape.
 */
export function buildHealSchemaRoutineParams(options: {
    authoredExclude: string[];
    includeSchemas?: string[] | null;
    entityIDs?: string[];
}): HealSchemaRoutineParams {
    const exclude = options.authoredExclude.join(',');
    const values: string[] = [`'${exclude}'`];
    const names: string[] = ['ExcludedSchemaNames'];

    if (options.entityIDs !== undefined && options.entityIDs.length > 0) {
        values.push(`'${options.entityIDs.join(',')}'`);
        names.push('EntityIDs');
    }

    const include = (options.includeSchemas ?? []).map((s) => s.trim()).filter((s) => s.length > 0);
    if (include.length > 0) {
        values.push(`'${include.join(',')}'`);
        names.push('IncludedSchemaNames');
    }

    return { values, names };
}
