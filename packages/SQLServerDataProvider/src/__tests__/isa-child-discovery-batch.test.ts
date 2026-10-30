import { describe, it, expect, vi } from 'vitest';
import type { EntityInfo, UserInfo } from '@memberjunction/core';
import { SQLServerDataProvider } from '../SQLServerDataProvider';

/**
 * Batched IS-A child discovery (`FindISAChildEntitiesBatch` + the T-SQL
 * `BuildChildDiscoveryBatchSQL` override): one `UNION ALL ... WHERE pk IN (...)` statement
 * per 500 keys replaces one probe per parent row. These tests pin the SQL shape, literal
 * escaping, the 500-key chunking, duplicate-key collapsing and the priority ordering of
 * multi-subtype matches, with `ExecuteSQL` stubbed — no live database.
 */

/** Structural view of the provider surface these tests drive. */
interface ProviderTestSurface {
  BuildChildDiscoveryBatchSQL(childEntities: EntityInfo[], recordPKValues: string[]): string;
  FindISAChildEntitiesBatch(entityInfo: EntityInfo, recordPKValues: string[], contextUser?: UserInfo): Promise<Map<string, string[]>>;
  ExecuteSQL(query: string, parameters?: unknown, options?: unknown, contextUser?: UserInfo): Promise<unknown>;
}

type DiscoveryRow = { EntityName: string; RecordPK: string; Priority: number };

function child(name: string, baseView: string, pk: string | null, schema = '__mj'): EntityInfo {
  const pks = pk ? [{ Name: pk }] : [];
  return {
    Name: name,
    SchemaName: schema,
    BaseView: baseView,
    PrimaryKeys: pks,
    FirstPrimaryKey: pks[0],
  } as unknown as EntityInfo;
}

function parent(children: EntityInfo[]): EntityInfo {
  return { Name: 'Products', ChildEntities: children } as unknown as EntityInfo;
}

function makeProvider(): { provider: ProviderTestSurface; executeSpy: ReturnType<typeof vi.fn> } {
  const provider = new SQLServerDataProvider() as unknown as ProviderTestSurface;
  const executeSpy = vi.fn(async (): Promise<DiscoveryRow[]> => []);
  provider.ExecuteSQL = executeSpy as unknown as ProviderTestSurface['ExecuteSQL'];
  return { provider, executeSpy };
}

describe('SQLServerDataProvider.BuildChildDiscoveryBatchSQL', () => {
  it('emits one SELECT per child joined by UNION ALL, each with the IN list, a CAST pk alias (bare column aliases, bracketed identifiers) and a 1-based priority', () => {
    const { provider } = makeProvider();
    const sql = provider.BuildChildDiscoveryBatchSQL(
      [child('Meetings', 'vwMeetings', 'ID'), child('Publications', 'vwPublications', 'ID', 'sales')],
      ['a1', 'b2']
    );
    const parts = sql.split(' UNION ALL ');
    expect(parts).toHaveLength(2);
    expect(parts[0]).toBe(
      "SELECT 'Meetings' AS EntityName, CAST([ID] AS NVARCHAR(255)) AS RecordPK, 1 AS Priority FROM [__mj].[vwMeetings] WHERE [ID] IN ('a1', 'b2')"
    );
    expect(parts[1]).toContain("'Publications' AS EntityName");
    expect(parts[1]).toContain('2 AS Priority');
    expect(parts[1]).toContain('FROM [sales].[vwPublications]');
  });

  it('escapes quotes in keys and entity names, and skips children without a primary key', () => {
    const { provider } = makeProvider();
    const sql = provider.BuildChildDiscoveryBatchSQL(
      [child("O'Brien Types", 'vwOBrien', 'ID'), child('NoKey', 'vwNoKey', null)],
      ["x'y"]
    );
    expect(sql).not.toContain('UNION ALL');
    expect(sql).toContain("'O''Brien Types' AS EntityName");
    expect(sql).toContain("IN ('x''y')");
    expect(sql).not.toContain('vwNoKey');
  });

  it('returns an empty string for no keys or no keyed children', () => {
    const { provider } = makeProvider();
    expect(provider.BuildChildDiscoveryBatchSQL([child('Meetings', 'vwMeetings', 'ID')], [])).toBe('');
    expect(provider.BuildChildDiscoveryBatchSQL([child('NoKey', 'vwNoKey', null)], ['a'])).toBe('');
  });
});

describe('DatabaseProviderBase.FindISAChildEntitiesBatch (via SQLServerDataProvider)', () => {
  it('runs one statement per 500 unique keys and collapses duplicate / differently-cased keys', async () => {
    const { provider, executeSpy } = makeProvider();
    const keys = Array.from({ length: 1200 }, (_, i) => `K${i}`);
    const withDupes = [...keys, 'k0', 'K1 ', '', ...keys.slice(0, 10)]; // same keys, case/space variants, a blank
    const result = await provider.FindISAChildEntitiesBatch(parent([child('Meetings', 'vwMeetings', 'ID')]), withDupes);
    expect(executeSpy).toHaveBeenCalledTimes(3); // ceil(1200 / 500)
    const sent = executeSpy.mock.calls.map(c => c[0] as string);
    expect(sent[0].match(/'K\d+'/g)).toHaveLength(500);
    expect(sent[2].match(/'K\d+'/g)).toHaveLength(200);
    // Every unique key appears exactly once across the three statements — no duplicate probing.
    const allKeys = sent.flatMap(q => q.match(/'K\d+'/g) ?? []);
    expect(new Set(allKeys).size).toBe(1200);
    expect(allKeys).toHaveLength(1200);
    expect(result.size).toBe(0); // the stub returned no rows
  });

  it('falls back to the child declaration order when a dialect omits the Priority column', async () => {
    const { provider, executeSpy } = makeProvider();
    executeSpy.mockResolvedValueOnce([
      { EntityName: 'Publications', RecordPK: 'abc' }, // no Priority → declaration order decides
      { EntityName: 'Meetings', RecordPK: 'abc' },
    ]);
    const result = await provider.FindISAChildEntitiesBatch(
      parent([child('Meetings', 'vwMeetings', 'ID'), child('Publications', 'vwPublications', 'ID')]),
      ['abc']
    );
    expect(result.get('abc')).toEqual(['Meetings', 'Publications']);
  });

  it('merges matches for one key across chunks into a single ordered list', async () => {
    const { provider, executeSpy } = makeProvider();
    // 501 keys → two chunks; the stub answers the first chunk only, for a key in that chunk.
    executeSpy
      .mockResolvedValueOnce([{ EntityName: 'Meetings', RecordPK: 'K0', Priority: 1 }])
      .mockResolvedValueOnce([]);
    const keys = Array.from({ length: 501 }, (_, i) => `K${i}`);
    const result = await provider.FindISAChildEntitiesBatch(parent([child('Meetings', 'vwMeetings', 'ID')]), keys);
    expect(executeSpy).toHaveBeenCalledTimes(2);
    expect(result.get('k0')).toEqual(['Meetings']);
    expect(result.size).toBe(1);
  });

  it('keys the result by the lower-cased pk and orders multi-subtype matches by child priority', async () => {
    const { provider, executeSpy } = makeProvider();
    executeSpy.mockResolvedValueOnce([
      { EntityName: 'Publications', RecordPK: 'ABC', Priority: 2 },
      { EntityName: 'Meetings', RecordPK: 'abc', Priority: 1 },
      { EntityName: 'Meetings', RecordPK: 'DEF', Priority: 1 },
    ]);
    const result = await provider.FindISAChildEntitiesBatch(
      parent([child('Meetings', 'vwMeetings', 'ID'), child('Publications', 'vwPublications', 'ID')]),
      ['ABC', 'DEF', 'GHI']
    );
    expect(result.get('abc')).toEqual(['Meetings', 'Publications']);
    expect(result.get('def')).toEqual(['Meetings']);
    expect(result.has('ghi')).toBe(false); // no child row → absent, so callers treat it as a plain parent
  });

  it('returns an empty map without executing SQL when the parent has no children or no keys', async () => {
    const { provider, executeSpy } = makeProvider();
    expect((await provider.FindISAChildEntitiesBatch(parent([]), ['a'])).size).toBe(0);
    expect((await provider.FindISAChildEntitiesBatch(parent([child('Meetings', 'vwMeetings', 'ID')]), [])).size).toBe(0);
    expect(executeSpy).not.toHaveBeenCalled();
  });
});
