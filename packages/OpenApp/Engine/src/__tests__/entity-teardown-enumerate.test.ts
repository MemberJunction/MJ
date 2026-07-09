/**
 * Unit tests for `EnumerateMjEntityFkGraph` — the FK-graph reader. It runs the provider's
 * dialect-supplied `ForeignKeyGraphSQL(schema)` and normalizes the rows into `FkEdge[]`, excluding
 * composite (multi-column) FKs with a warning. Mocked provider (`Dialect` + `ExecuteSQL`); no DB.
 *
 * Parametrized over both dialects to prove it drives the dialect's own catalog query (SQL Server's
 * `sys.foreign_keys` vs. PostgreSQL's `pg_constraint`) and coerces nullability from either shape.
 */
import { describe, it, expect, vi } from 'vitest';
import { GetDialect, type DatabasePlatform } from '@memberjunction/sql-dialect';
import { EnumerateMjEntityFkGraph } from '../install/entity-teardown.js';
import type { DatabaseProviderBase } from '@memberjunction/core';

/** A mock provider that reports the given dialect and returns canned rows for any ExecuteSQL. */
function mockProvider(platform: DatabasePlatform, rows: Array<Record<string, unknown>>) {
  const executeSQL = vi.fn(async () => rows);
  const provider = {
    Dialect: GetDialect(platform),
    ExecuteSQL: executeSQL,
  } as unknown as DatabaseProviderBase;
  return { provider, executeSQL };
}

const platforms: DatabasePlatform[] = ['sqlserver', 'postgresql'];

describe.each(platforms)('EnumerateMjEntityFkGraph [%s]', (platform) => {
  it('runs the dialect FK-graph query and builds single-column edges (nullability coerced)', async () => {
    // childNullable arrives as SQL Server bit-ish (1/0) OR PostgreSQL boolean (true/false); both coerce.
    const rows = [
      { parentTable: 'Entity', parentRefCol: 'ID', childTable: 'RecordChange', childCol: 'EntityID', childNullable: platform === 'postgresql' ? false : 0, fkName: 'FK_RecordChange_EntityID', colCount: 1 },
      { parentTable: 'Entity', parentRefCol: 'ID', childTable: 'AuditLog', childCol: 'EntityID', childNullable: platform === 'postgresql' ? true : 1, fkName: 'FK_AuditLog_Entity', colCount: 1 },
    ];
    const { provider, executeSQL } = mockProvider(platform, rows);
    const edges = await EnumerateMjEntityFkGraph(provider, '__mj');

    // Ran the dialect's own catalog query for this platform.
    const sqlRun = executeSQL.mock.calls[0][0] as string;
    expect(sqlRun).toBe(GetDialect(platform).ForeignKeyGraphSQL('__mj'));
    expect(sqlRun).toContain(platform === 'postgresql' ? 'pg_catalog.pg_constraint' : 'sys.foreign_keys');

    expect(edges).toHaveLength(2);
    expect(edges.find((e) => e.childTable === 'RecordChange')!.childNullable).toBe(false);
    expect(edges.find((e) => e.childTable === 'AuditLog')!.childNullable).toBe(true);
  });

  it('excludes composite (colCount > 1) FKs and warns via OnWarn', async () => {
    const rows = [
      { parentTable: 'Entity', parentRefCol: 'ID', childTable: 'RecordChange', childCol: 'EntityID', childNullable: 0, fkName: 'FK_RecordChange_EntityID', colCount: 1 },
      // a composite FK — two rows share the constraint; colCount = 2 → excluded + warned
      { parentTable: 'Entity', parentRefCol: 'ID', childTable: 'WeirdTable', childCol: 'EntityID', childNullable: 0, fkName: 'FK_Weird_Composite', colCount: 2 },
    ];
    const { provider } = mockProvider(platform, rows);
    const onWarn = vi.fn();
    const edges = await EnumerateMjEntityFkGraph(provider, '__mj', { OnWarn: onWarn } as never);

    expect(edges).toHaveLength(1);
    expect(edges[0].childTable).toBe('RecordChange');
    expect(onWarn).toHaveBeenCalledTimes(1);
    expect(String(onWarn.mock.calls[0][1])).toContain('FK_Weird_Composite');
  });

  it('returns [] on an empty catalog result', async () => {
    const { provider } = mockProvider(platform, []);
    expect(await EnumerateMjEntityFkGraph(provider, '__mj')).toEqual([]);
  });
});
