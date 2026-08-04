import { describe, it, expect } from 'vitest';
import { applyIncludeSchemaScope, computeSchemasToExcludeForIncludeList } from '../Database/schema-scope';

/**
 * Unit tests for the `includeSchemas` → `excludeSchemas` resolution.
 * The rule: in-scope ⇔ named in includeSchemas AND not already excluded; everything else in the schema
 * universe is returned for exclusion. This is the single mechanism by which the positive scope becomes
 * sugar over the existing negative `excludeSchemas` list.
 */
describe('computeSchemasToExcludeForIncludeList', () => {
  it('excludes every schema not named in includeSchemas (the core scoping behavior)', () => {
    const all = ['__mj_BizAppsCommon', '__mj_BizAppsTasks', 'dbo', '__mj', 'sys', 'staging'];
    const result = computeSchemasToExcludeForIncludeList(all, ['__mj_BizAppsCommon'], ['sys', 'staging']);
    // common is included; sys/staging already excluded (not re-added); everything else is excluded.
    expect(result.sort()).toEqual(['__mj', '__mj_BizAppsTasks', 'dbo'].sort());
  });

  it('keeps an included schema IN scope (not returned for exclusion)', () => {
    const result = computeSchemasToExcludeForIncludeList(['app_a', 'app_b'], ['app_a'], []);
    expect(result).toEqual(['app_b']);
    expect(result).not.toContain('app_a');
  });

  it('does NOT auto-include the core schema — __mj is excluded unless listed', () => {
    const result = computeSchemasToExcludeForIncludeList(['app_a', '__mj'], ['app_a'], []);
    expect(result).toContain('__mj');
  });

  it('DOES keep the core schema in scope when it is explicitly listed', () => {
    const result = computeSchemasToExcludeForIncludeList(['app_a', '__mj'], ['app_a', '__mj'], []);
    expect(result).toEqual([]); // both listed → nothing excluded
  });

  it('matches include + exclude case-insensitively and trims', () => {
    const all = ['__mj_BizAppsCommon', '__mj_BizAppsTasks'];
    const result = computeSchemasToExcludeForIncludeList(all, ['  __MJ_bizappscommon '], ['__MJ_BIZAPPSTASKS']);
    // common is included (case-insensitive) → not excluded; tasks already excluded → not re-added.
    expect(result).toEqual([]);
  });

  it('does not re-add a schema already present in existingExcludeSchemas', () => {
    const result = computeSchemasToExcludeForIncludeList(['dbo', 'sys'], ['app_a'], ['sys']);
    expect(result).toEqual(['dbo']);
  });

  it('de-duplicates repeated schemas in the universe', () => {
    const result = computeSchemasToExcludeForIncludeList(['dbo', 'dbo', 'sys'], ['app_a'], []);
    expect(result).toEqual(['dbo', 'sys']);
  });
});

describe('applyIncludeSchemaScope', () => {
  it('is a NO-OP when includeSchemas is absent — classic exclude-only behavior is unchanged', () => {
    const config = { excludeSchemas: ['sys', 'staging'] };
    const added = applyIncludeSchemaScope(['dbo', 'app_a', 'sys'], config);
    expect(added).toEqual([]);
    expect(config.excludeSchemas).toEqual(['sys', 'staging']);
  });

  it('is a NO-OP when includeSchemas is an empty array', () => {
    const config = { includeSchemas: [], excludeSchemas: ['sys'] };
    applyIncludeSchemaScope(['dbo', 'app_a'], config);
    expect(config.excludeSchemas).toEqual(['sys']);
  });

  it('appends out-of-scope schemas to excludeSchemas in place', () => {
    const config = { includeSchemas: ['app_a'], excludeSchemas: ['sys'] };
    applyIncludeSchemaScope(['app_a', 'app_b', 'dbo', 'sys'], config);
    expect(config.excludeSchemas).toEqual(['sys', 'app_b', 'dbo']);
  });

  it('creates excludeSchemas when the config has none', () => {
    const config: { includeSchemas?: string[]; excludeSchemas?: string[] } = { includeSchemas: ['app_a'] };
    applyIncludeSchemaScope(['app_a', 'app_b'], config);
    expect(config.excludeSchemas).toEqual(['app_b']);
  });

  it('is IDEMPOTENT — the metadata-phase and file-phase passes may both run', () => {
    // manageMetadata resolves against the DB schema list; runCodeGen resolves again against the
    // metadata schema list (for --skipdb). The second pass must not duplicate entries.
    const config = { includeSchemas: ['app_a'], excludeSchemas: ['sys'] };
    applyIncludeSchemaScope(['app_a', 'app_b', 'dbo'], config);
    const secondPass = applyIncludeSchemaScope(['app_a', 'app_b', 'dbo'], config);
    expect(secondPass).toEqual([]);
    expect(config.excludeSchemas).toEqual(['sys', 'app_b', 'dbo']);
  });

  it('excludes a schema that has NO entities in metadata yet (the never-before-seen schema case)', () => {
    // This is why the authoritative pass sources its universe from the DATABASE: createNewEntities()
    // discovers tables with no EntityID, so a client schema absent from Metadata.Entities must still be
    // excluded or it gets adopted on the first run and orphaned on every run after.
    const config = { includeSchemas: ['app_a'], excludeSchemas: [] as string[] };
    const dbSchemas = ['app_a', 'client_private']; // client_private has zero MJ entities
    applyIncludeSchemaScope(dbSchemas, config);
    expect(config.excludeSchemas).toContain('client_private');
  });
});
