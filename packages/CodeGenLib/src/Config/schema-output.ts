import { schemaNameMatches } from '../Misc/schema-emit';

/**
 * Per-schema output override. Lets a brownfield / demo schema emit into its
 * own directory (or be skipped) instead of landing in `@memberjunction/core-entities`
 * or the host app's generated folder.
 *
 * `schema` accepts an exact name or a `%` wildcard (`bsd_%` matches `bsd_crm`).
 */
export interface SchemaOutputOverride {
  schema: string;
  EntitySubClasses?: string;
  GraphQLServer?: string;
  Angular?: string;
  skip?: Array<'EntitySubClasses' | 'GraphQLServer' | 'Angular' | 'SQL'>;
}

export type SchemaOutputKind = 'EntitySubClasses' | 'GraphQLServer' | 'Angular' | 'SQL';

/**
 * First matching override wins. Returns undefined when no override applies.
 */
export function findSchemaOutputOverride(
  schemaName: string,
  overrides: readonly SchemaOutputOverride[] | undefined,
): SchemaOutputOverride | undefined {
  if (!overrides || overrides.length === 0) {
    return undefined;
  }
  return overrides.find((entry) => schemaNameMatches(entry.schema, schemaName));
}

/**
 * Resolve the output directory for one entity's schema + artifact kind.
 * `undefined` means "use the default `outputDir(kind)`". `null` means skip.
 */
export function resolveSchemaOutputDirectory(
  schemaName: string,
  kind: SchemaOutputKind,
  overrides: readonly SchemaOutputOverride[] | undefined,
): string | null | undefined {
  const match = findSchemaOutputOverride(schemaName, overrides);
  if (!match) {
    return undefined;
  }
  if (match.skip?.includes(kind)) {
    return null;
  }
  const dir = match[kind as 'EntitySubClasses' | 'GraphQLServer' | 'Angular'];
  return dir;
}

/**
 * Partition entities into destination directories for one artifact kind.
 * Entities whose override says `skip` are dropped. Entities with no override
 * go to `defaultDirectory` (and are dropped if that is empty).
 */
export function partitionEntitiesByOutputDirectory<T extends { SchemaName: string }>(
  entities: readonly T[],
  kind: SchemaOutputKind,
  defaultDirectory: string | null,
  overrides: readonly SchemaOutputOverride[] | undefined,
): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const entity of entities) {
    const resolved = resolveSchemaOutputDirectory(entity.SchemaName, kind, overrides);
    if (resolved === null) {
      continue;
    }
    const dir = resolved ?? defaultDirectory;
    if (!dir) {
      continue;
    }
    const list = groups.get(dir);
    if (list) {
      list.push(entity);
    } else {
      groups.set(dir, [entity]);
    }
  }
  return groups;
}
