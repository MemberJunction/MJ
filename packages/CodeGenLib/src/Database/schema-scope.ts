import { snapshotAuthoredExcludeSchemas } from './heal-schema-params';

/**
 * Schema-scope resolution helpers for CodeGen.
 *
 * `includeSchemas` is an opt-in POSITIVE scope list. Rather than add a second filtering path
 * throughout CodeGen, it is resolved INTO the existing `excludeSchemas` list, so every downstream
 * consumer (metadata management, `createExcludeTablesAndSchemasFilter`, the file-generation phases)
 * keeps reading a single already-scoped exclude list and needs no include-awareness.
 *
 * This module holds the pure resolution logic so it can be unit-tested without a database or config
 * globals.
 */

/**
 * Resolve an opt-in `includeSchemas` positive scope into the list of schema names to ADD to
 * `excludeSchemas`. A schema stays IN SCOPE iff it is named in `includeSchemas` AND not already in
 * `existingExcludeSchemas`; every other schema in `allSchemas` is returned for exclusion. Matching is
 * case-insensitive + trimmed, and the result is de-duplicated. No hidden auto-includes — the MJ core
 * schema is excluded unless it is listed explicitly (include shrinks the addressable space;
 * `excludeSchemas` still overlays on top).
 *
 * @param allSchemas             the schema universe to scope against — see {@link applyIncludeSchemaScope}
 *                               for why this must be sourced from the DATABASE, not from loaded metadata
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

/** The subset of the CodeGen config this module reads and mutates. */
export interface SchemaScopeConfig {
  includeSchemas?: string[];
  excludeSchemas?: string[];
}

/**
 * Apply an `includeSchemas` positive scope by appending every out-of-scope schema in `allSchemas` to
 * `config.excludeSchemas` in place. No-op when `includeSchemas` is absent or empty, which preserves
 * classic exclude-only behavior exactly. Idempotent, so it is safe to call from more than one phase
 * as the schema universe becomes better known.
 *
 * **`allSchemas` must be the DATABASE's schema list, not the schemas present in loaded metadata.**
 * The primary job of an include list is to keep CodeGen off schemas it does not own — and the
 * highest-risk case is a schema MJ has never seen before, because `createNewEntities()` discovers
 * tables with no `EntityID` straight from the database and filters them only through
 * `excludeSchemas`. A universe derived from `Metadata.Entities` contains, by definition, only schemas
 * that ALREADY have entities, so it cannot exclude a never-seen schema: that schema would be adopted
 * into metadata on the first run and then excluded on every subsequent run, leaving its entity
 * records permanently orphaned. Callers without database access (e.g. the `--skipdb` file-generation
 * path) may pass the metadata-derived universe as a secondary safety net, but it is not sufficient on
 * its own.
 *
 * @param allSchemas the schema universe to scope against
 * @param config     the config to mutate; `excludeSchemas` is created if absent
 * @returns the schema names that were newly appended (empty when the scope is unused or already applied)
 */
export function applyIncludeSchemaScope(allSchemas: string[], config: SchemaScopeConfig): string[] {
  // Capture authored excludes before this run mutates excludeSchemas. Heal EXEC
  // statements must serialize that original list, not the sibling snapshot.
  snapshotAuthoredExcludeSchemas(config.excludeSchemas);
  if (!config.includeSchemas || config.includeSchemas.length === 0) {
    return []; // classic exclude-only behavior, unchanged
  }
  if (!config.excludeSchemas) {
    config.excludeSchemas = [];
  }
  const toExclude = computeSchemasToExcludeForIncludeList(allSchemas, config.includeSchemas, config.excludeSchemas);
  config.excludeSchemas.push(...toExclude);
  return toExclude;
}
