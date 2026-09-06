import { EntityInfo } from './entityInfo';

/**
 * Runtime helpers for a multi-schema catalog.
 *
 * `Metadata.Entities` is the complete, always-in-sync catalog. We do **not**
 * shard that array by schema — agents, permissions, and RunView all assume
 * every entity is addressable. What we *do* offer is hydrate-by-schema:
 * take the full catalog and project the subset (or the compact summary) a
 * caller actually needs. MCP tools and agent prompts should ask for
 * `bsd_crm` rather than stuffing 2,880 table definitions into a context window.
 *
 * This module is pure. It never talks to a provider.
 */

export interface SchemaHydrationOptions {
  /** Restrict to these schema names (case-insensitive). Omit to use every schema. */
  schemas?: readonly string[];
  /** Hard cap on entities in the projection, applied after schema filtering. */
  maxEntities?: number;
  /** Include a compact field list (name + type) per entity. Default false. */
  includeFields?: boolean;
}

export interface EntityCatalogSummary {
  SchemaName: string;
  Name: string;
  ClassName: string;
  BaseTable: string;
  Description: string;
  FieldCount: number;
  Fields?: Array<{ Name: string; Type: string }>;
}

/**
 * Group a catalog by trimmed `SchemaName`. Insertion order of schemas follows
 * first occurrence in `entities`.
 */
export function groupEntitiesBySchema(entities: readonly EntityInfo[]): Map<string, EntityInfo[]> {
  const map = new Map<string, EntityInfo[]>();
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
 * Filter a catalog to the named schemas. Matching is case-insensitive and
 * trimmed. Unknown schema names are ignored (the result is just smaller).
 */
export function entitiesInSchemas(
  entities: readonly EntityInfo[],
  schemas: readonly string[],
): EntityInfo[] {
  const wanted = new Set(schemas.map((s) => s.trim().toLowerCase()).filter((s) => s.length > 0));
  if (wanted.size === 0) {
    return [];
  }
  return entities.filter((e) => wanted.has((e.SchemaName ?? '').trim().toLowerCase()));
}

/**
 * Distinct schema names in catalog order (first occurrence wins).
 */
export function distinctSchemaNames(entities: readonly EntityInfo[]): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const entity of entities) {
    const name = (entity.SchemaName ?? '').trim() || 'unknown';
    const key = name.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      names.push(name);
    }
  }
  return names;
}

/**
 * Project entities into a compact, JSON-serializable summary for agent / MCP
 * context. The catalog itself is not mutated. When `maxEntities` is hit the
 * remaining rows are omitted — callers who need the rest ask for another schema.
 */
export function summarizeEntitiesForContext(
  entities: readonly EntityInfo[],
  options?: SchemaHydrationOptions,
): EntityCatalogSummary[] {
  const scoped = options?.schemas && options.schemas.length > 0
    ? entitiesInSchemas(entities, options.schemas)
    : [...entities];
  const capped = options?.maxEntities != null && options.maxEntities >= 0
    ? scoped.slice(0, options.maxEntities)
    : scoped;
  const includeFields = options?.includeFields === true;
  return capped.map((entity) => {
    const fields = entity.Fields ?? [];
    const summary: EntityCatalogSummary = {
      SchemaName: entity.SchemaName,
      Name: entity.Name,
      ClassName: entity.ClassName,
      BaseTable: entity.BaseTable,
      Description: entity.Description ?? '',
      FieldCount: fields.length,
    };
    if (includeFields) {
      summary.Fields = fields.map((f) => ({ Name: f.Name, Type: f.Type }));
    }
    return summary;
  });
}
