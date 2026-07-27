/**
 * Schema-scope resolution helpers for CodeGen.
 *
 * The `includeSchemas` config option is an opt-in POSITIVE scope list. Rather than add a second filtering
 * path throughout CodeGen, it is resolved INTO the existing `excludeSchemas` list at a single point
 * (`ManageMetadataBase.manageMetadata`). This module holds the pure resolution logic so it can be
 * unit-tested without a database or config globals.
 */

/**
 * Resolve an opt-in `includeSchemas` positive scope into the list of schema names to ADD to
 * `excludeSchemas`. A schema stays IN SCOPE iff it is named in `includeSchemas` AND not already in
 * `existingExcludeSchemas`; every other schema in `allSchemas` (the schema universe present in the
 * database) is returned for exclusion. Matching is case-insensitive + trimmed, and the result is
 * de-duplicated. No hidden auto-includes — the MJ core schema is excluded unless it is listed explicitly
 * (include shrinks the addressable space; `excludeSchemas` still overlays on top).
 *
 * @param allSchemas             every schema name present in the database
 * @param includeSchemas         the opt-in positive scope (assumed non-empty by the caller)
 * @param existingExcludeSchemas schemas already excluded (system + user config), left untouched
 * @returns the schema names to append to `excludeSchemas`
 */
export function computeSchemasToExcludeForIncludeList(
  allSchemas: string[],
  includeSchemas: string[],
  existingExcludeSchemas: string[],
): string[] {
  const includeSet = new Set(includeSchemas.map((s) => s.trim().toLowerCase()));
  const seenExcluded = new Set(existingExcludeSchemas.map((s) => s.trim().toLowerCase()));
  const toExclude: string[] = [];
  for (const schema of allSchemas) {
    const key = schema.trim().toLowerCase();
    if (!includeSet.has(key) && !seenExcluded.has(key)) {
      toExclude.push(schema);
      seenExcluded.add(key); // guard against duplicates within allSchemas
    }
  }
  return toExclude;
}
