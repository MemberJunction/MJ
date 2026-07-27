import { describe, it, expect } from 'vitest';
import { computeSchemasToExcludeForIncludeList } from '../Database/schema-scope';

/**
 * Unit tests for the `includeSchemas` → `excludeSchemas` resolution (the pure core of Change A).
 * The rule: in-scope ⇔ named in includeSchemas AND not already excluded; everything else present in the
 * database is returned for exclusion. This is the single point where the positive scope becomes sugar over
 * the existing negative `excludeSchemas` list.
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

  it('does NOT auto-include the core schema — __mj is excluded unless listed (ruling #3)', () => {
    const result = computeSchemasToExcludeForIncludeList(['app_a', '__mj'], ['app_a'], []);
    expect(result).toContain('__mj');
  });

  it('DOES keep the core schema in scope when it is explicitly listed', () => {
    const result = computeSchemasToExcludeForIncludeList(['app_a', '__mj'], ['app_a', '__mj'], []);
    expect(result).toEqual([]); // both listed → nothing excluded
  });

  it('matches include + exclude case-insensitively and trims', () => {
    const all = ['__mj_BizAppsCommon', '__mj_BizAppsTasks'];
    // include names common in a different case + whitespace; exclude names tasks in a different case.
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
