/**
 * Schema is the incremental unit for CodeGen file emit.
 *
 * A 2,000-entity database is almost never one schema with 2,000 tables. It is
 * two-to-three dozen schemas of 100–150 tables each. Entity identity stays the
 * entity (names, FKs, metadata rows). Everything that can be incremental —
 * emit, dirty regen, parallelism, output-directory routing, agent context —
 * keys off the schema.
 */

export type DirtySchemaSet = Set<string> | 'all';

export interface SchemaEmitOptions {
  /**
   * When true (the default), emit one TypeScript file per schema plus a thin
   * barrel. When false, emit the historical single monolith.
   */
  perSchema?: boolean;
  /**
   * Schemas whose files must be rebuilt. `'all'` rebuilds every schema
   * (used by `--skipdb` file-only runs). A Set rebuilds only those schemas
   * plus any schema whose file is missing. An omitted / empty set with
   * existing files is the fast path: skip the string-build entirely.
   */
  dirtySchemas?: DirtySchemaSet;
  /** Assemble independent schema files in parallel. Defaults to true. */
  parallel?: boolean;
  /** Max schemas to assemble in parallel. Defaults to 8. */
  concurrency?: number;
  /** Skip the disk write when bytes are identical. Defaults to true. */
  writeIfChanged?: boolean;
}

export interface SchemaNamed {
  Name: string;
  SchemaName: string;
}

/**
 * Case-insensitive schema match. `%` is the only wildcard (SQL `_` is a
 * literal — schema names like `bsd_crm` are common and must not glob).
 */
export function schemaNameMatches(pattern: string, schemaName: string): boolean {
  const p = pattern.trim().toLowerCase();
  const s = schemaName.trim().toLowerCase();
  if (!p.includes('%')) {
    return p === s;
  }
  const escaped = p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*');
  return new RegExp(`^${escaped}$`).test(s);
}

/**
 * Turn a SQL schema name into a safe TypeScript file stem.
 * `__mj` stays `__mj`; `bsd_crm` stays `bsd_crm`; `Sales.Analytics` becomes `Sales_Analytics`.
 */
export function sanitizeSchemaFileName(schemaName: string): string {
  // Keep leading underscores — `__mj` is a real schema name and a valid file stem.
  const cleaned = schemaName.trim().replace(/[^A-Za-z0-9_]+/g, '_').replace(/_+$/g, '');
  return cleaned.length > 0 ? cleaned : 'schema';
}

/**
 * Group entities by their raw `SchemaName` (trimmed, original casing of the
 * first occurrence). Order inside each group is the input order.
 */
export function groupEntitiesBySchema<T extends { SchemaName: string }>(entities: readonly T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const entity of entities) {
    const key = (entity.SchemaName ?? '').trim() || 'unknown';
    const list = map.get(key);
    if (list) {
      list.push(entity);
    } else {
      map.set(key, [entity]);
    }
  }
  return map;
}

/**
 * Map dirty entity names (from `newEntityList` ∪ `modifiedEntityList`) back to
 * the schemas those entities live in. Comparison is case-insensitive.
 */
export function collectDirtySchemas(
  entities: readonly SchemaNamed[],
  dirtyEntityNames: Iterable<string>,
): Set<string> {
  const dirty = new Set<string>();
  for (const name of dirtyEntityNames) {
    dirty.add(name.trim().toLowerCase());
  }
  const schemas = new Set<string>();
  if (dirty.size === 0) {
    return schemas;
  }
  for (const entity of entities) {
    if (dirty.has(entity.Name.trim().toLowerCase())) {
      schemas.add(entity.SchemaName.trim());
    }
  }
  return schemas;
}

/**
 * Decide which schema files to rebuild. Missing files are always rebuilt so a
 * fresh clone / first run is complete. When `dirty` is `'all'` every schema is
 * rebuilt (callers still use write-if-changed to keep mtimes stable).
 */
export function schemasToEmit(
  allSchemas: readonly string[],
  dirty: DirtySchemaSet | undefined,
  fileExists: (schemaName: string) => boolean,
): string[] {
  if (dirty === 'all' || dirty == null) {
    return [...allSchemas];
  }
  const dirtyLower = new Set([...dirty].map((s) => s.trim().toLowerCase()));
  return allSchemas.filter((schema) => {
    if (!fileExists(schema)) {
      return true;
    }
    return dirtyLower.has(schema.trim().toLowerCase());
  });
}

/**
 * Bounded parallel map. Order of results matches `items`. A limit of 1 is serial.
 */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const concurrency = Math.max(1, Math.floor(limit));
  const results: R[] = new Array(items.length);
  let next = 0;

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Barrel that re-exports every per-schema file. Uses `.js` specifiers so the
 * file is valid in `"type": "module"` packages (MJCoreEntities, MJServer).
 */
export function buildSchemaBarrel(
  schemas: readonly string[],
  relativeDir: string,
  extraHeader: string,
): string {
  const dir = relativeDir.replace(/\\/g, '/').replace(/\/+$/, '');
  const exports = [...schemas]
    .sort((a, b) => a.localeCompare(b))
    .map((schema) => `export * from './${dir}/${sanitizeSchemaFileName(schema)}.js';`)
    .join('\n');
  return `${extraHeader}${exports}\n`;
}
