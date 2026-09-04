/**
 * Schema is the incremental unit for CodeGen file emit.
 *
 * A 2,000-entity database is almost never one schema with 2,000 tables. It is
 * two-to-three dozen schemas of 100–150 tables each. Entity identity stays the
 * entity (names, FKs, metadata rows). Everything that can be incremental —
 * emit, dirty regen, parallelism, output-directory routing, agent context —
 * keys off the schema.
 */

import fs from 'fs';
import path from 'path';

import { writeFileIfChanged } from './file-write';

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
/** Case-insensitive schema/entity key. Null/undefined become ''. */
export function schemaKey(name: string | null | undefined): string {
  return (name ?? '').trim().toLowerCase();
}

export function schemaNameMatches(pattern: string, schemaName: string | null | undefined): boolean {
  const p = schemaKey(pattern);
  const s = schemaKey(schemaName);
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
export function sanitizeSchemaFileName(schemaName: string | null | undefined): string {
  // Keep leading underscores — `__mj` is a real schema name and a valid file stem.
  const cleaned = (schemaName ?? '').trim().replace(/[^A-Za-z0-9_]+/g, '_').replace(/_+$/g, '');
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
/**
 * Resolve which schemas a file-emit pass should rebuild.
 * `--skipdb` and `dirtySchemaOnly === false` rebuild every schema (write-if-changed
 * still keeps mtimes stable). Otherwise only schemas that contain a new/modified
 * entity are dirty — missing files are added later by {@link schemasToEmit}.
 */
export function resolveDirtySchemasForEmit(
  entities: readonly SchemaNamed[],
  dirtyEntityNames: Iterable<string>,
  skipDB: boolean,
  dirtySchemaOnly: boolean,
  deletedEntitySchemas: Iterable<string> = [],
): DirtySchemaSet {
  if (skipDB || !dirtySchemaOnly) {
    return 'all';
  }
  const schemas = collectDirtySchemas(entities, dirtyEntityNames);
  // Deletion arrives as a schema, not an entity name: by the time this runs the entity is gone
  // from `entities`, so `collectDirtySchemas` could never resolve it. Union it in directly, or
  // the schema is not rebuilt and the dead class survives on disk.
  for (const schema of deletedEntitySchemas) {
    const trimmed = (schema ?? '').trim();
    if (trimmed.length > 0) {
      schemas.add(trimmed);
    }
  }
  return schemas;
}

export function collectDirtySchemas(
  entities: readonly SchemaNamed[],
  dirtyEntityNames: Iterable<string>,
): Set<string> {
  const dirty = new Set<string>();
  for (const name of dirtyEntityNames) {
    const key = schemaKey(name);
    if (key.length > 0) {
      dirty.add(key);
    }
  }
  const schemas = new Set<string>();
  if (dirty.size === 0) {
    return schemas;
  }
  for (const entity of entities) {
    if (dirty.has(schemaKey(entity.Name))) {
      const schema = (entity.SchemaName ?? '').trim();
      if (schema.length > 0) {
        schemas.add(schema);
      }
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

/**
 * Names of files in a per-schema emit directory that no live schema claims.
 *
 * Kept pure and separate from the deletion so the decision is testable without a
 * filesystem. `fileNames` is a plain directory listing; `schemas` is every schema in the
 * run, not just the dirty subset.
 */
export function selectOrphanedSchemaFiles(fileNames: readonly string[], schemas: readonly string[]): string[] {
  const live = new Set(schemas.map((schema) => `${sanitizeSchemaFileName(schema)}.ts`));
  return fileNames.filter((name) => name.endsWith('.ts') && !live.has(name)).sort();
}

/**
 * Delete per-schema files that no live schema claims, returning what was removed.
 *
 * A schema that empties out — its last table dropped — leaves its file on disk. The barrel
 * stops exporting it, which is not enough: `tsc` still compiles it through `include`, the
 * class-registration manifest still globs it into the registry, and the CodeGen-tail guard
 * reads every `.ts` in the directory regardless of what the barrel names. So a deleted
 * entity keeps a live `@RegisterClass` registration and inflates the roster the guard
 * compares. The old monolith could not drift this way; it was rewritten in full every run.
 *
 * Safe under dirty-schema regen: `schemas` is the full set for the run, so a schema that
 * simply was not dirty this time is still live and is never pruned.
 */
export function pruneOrphanedSchemaFiles(directory: string, schemas: readonly string[]): string[] {
  if (!fs.existsSync(directory)) {
    return [];
  }
  const orphans = selectOrphanedSchemaFiles(fs.readdirSync(directory), schemas);
  for (const name of orphans) {
    fs.unlinkSync(path.join(directory, name));
  }
  return orphans;
}

/**
 * Fill in a partial {@link SchemaEmitOptions} from config defaults.
 *
 * Shared by both generators so the defaults cannot drift between entity subclasses and
 * GraphQL resolvers — they must agree, or one emits per-schema while the other emits a
 * monolith and the two rosters stop lining up.
 *
 * `parallel` / `concurrency` are resolved for every caller even though only the entity
 * generator uses them: its per-schema assembly is async (each file awaits its entities),
 * while GraphQL assembly is synchronous, so there is nothing to overlap there.
 */
export function resolveSchemaEmitOptions(
  options: SchemaEmitOptions | undefined,
  defaults: SchemaEmitOptions | undefined,
): Required<SchemaEmitOptions> {
  return {
    perSchema: options?.perSchema ?? defaults?.perSchema ?? true,
    dirtySchemas: options?.dirtySchemas ?? 'all',
    parallel: options?.parallel ?? defaults?.parallel ?? true,
    concurrency: options?.concurrency ?? defaults?.concurrency ?? 8,
    writeIfChanged: options?.writeIfChanged ?? defaults?.writeIfChanged ?? true,
  };
}

/**
 * Write one emitted file, honouring the write-if-changed setting.
 *
 * Shared for the same reason as {@link resolveSchemaEmitOptions}: both generators must treat
 * an unchanged file identically, or one leaves mtimes alone while the other churns them and
 * downstream incremental builds see phantom work.
 */
export function emitSchemaFile(filePath: string, content: string, useWriteIfChanged: boolean): void {
  if (useWriteIfChanged) {
    writeFileIfChanged(filePath, content);
    return;
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}
