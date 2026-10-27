/**
 * Pre-flight for a create with a literal key that a unique constraint would reject (#4400): the
 * existing row is named in place of a constraint violation.
 */
import { describe, it, expect, vi } from 'vitest';
import type { BaseEntity, DatabaseProviderBase, EntityFieldInfo, EntityInfo, IMetadataProvider, RunViewParams, UserInfo } from '@memberjunction/core';
import {
  DatabaseNaturalKeyReader,
  GroupUniqueKeyRows,
  NaturalKeyConflictMessage,
  NaturalKeyPreflight,
  UniqueKeyCatalogSQL,
  type NaturalKeyReader,
  type UniqueKeyColumns,
} from '../lib/natural-key-preflight';

const SEED_ID = '6BD4DF77-ECA1-4D70-9694-B194FD0024B9';
const EXISTING_ID = 'ECD1423E-F36B-1410-8728-003D3A6A09FA';

const info = {
  Name: 'MJ: Entity Permissions',
  PrimaryKeys: [{ Name: 'ID' }],
  Fields: ['ID', 'EntityID', 'RoleID', 'Type', 'Comment'].map((name) => ({ Name: name })),
} as unknown as EntityInfo;

function entity(values: Record<string, unknown>): BaseEntity {
  return { EntityInfo: info, Get: (field: string) => values[field] } as unknown as BaseEntity;
}

function reader(keys: UniqueKeyColumns[], existing: Record<string, unknown> | null): NaturalKeyReader & { FindKey: ReturnType<typeof vi.fn> } {
  return {
    UniqueKeys: async () => keys,
    FindKey: vi.fn(async (_info: EntityInfo, _values: ReadonlyArray<{ Field: EntityFieldInfo; Value: unknown }>) => existing),
  };
}

const UQ = { Name: 'UQ_EntityPermission_EntityID_RoleID_Type', Columns: ['EntityID', 'RoleID', 'Type'] };
const seed = () => entity({ ID: SEED_ID, EntityID: 'e-1', RoleID: 'r-1', Type: 'Allow' });

describe('NaturalKeyPreflight', () => {
  it('reports the row that already holds the natural key under another ID', async () => {
    const source = reader([UQ], { ID: EXISTING_ID });

    const conflict = await new NaturalKeyPreflight(source).Check(seed());

    expect(conflict).toEqual({ KeyName: UQ.Name, Fields: ['EntityID', 'RoleID', 'Type'], ExistingKey: { ID: EXISTING_ID } });
    expect(source.FindKey.mock.calls[0][1].map((value: { Field: EntityFieldInfo; Value: unknown }) => value.Value)).toEqual(['e-1', 'r-1', 'Allow']);
  });

  it('passes when no row has the natural key, or the row is this record', async () => {
    expect(await new NaturalKeyPreflight(reader([UQ], null)).Check(seed())).toBeNull();
    expect(await new NaturalKeyPreflight(reader([UQ], { ID: SEED_ID.toLowerCase() })).Check(seed())).toBeNull();
  });

  it('skips a key with a null value, an unknown column, or a primary-key column, and a table without keys', async () => {
    const source = reader([{ Name: 'UQ_Comment', Columns: ['Comment'] }, { Name: 'UQ_Gone', Columns: ['Gone'] }, { Name: 'UQ_ID_Type', Columns: ['ID', 'Type'] }], { ID: EXISTING_ID });
    expect(await new NaturalKeyPreflight(source).Check(seed())).toBeNull();
    expect(source.FindKey).not.toHaveBeenCalled();
    expect(await new NaturalKeyPreflight(reader([], { ID: EXISTING_ID })).Check(seed())).toBeNull();
  });

  it('names the existing ID and tells the user to re-key with @lookup', () => {
    const message = NaturalKeyConflictMessage('MJ: Entity Permissions', `ID=${SEED_ID}`, { KeyName: UQ.Name, Fields: UQ.Columns, ExistingKey: { ID: EXISTING_ID } });
    expect(message).toContain(`no row has primary key {ID=${SEED_ID}}, but row {ID=${EXISTING_ID}} already has the same EntityID, RoleID, Type`);
    expect(message).toContain(UQ.Name);
    expect(message).toContain('"@lookup:MJ: Entity Permissions.EntityID=…&RoleID=…&Type=…"');
  });
});

describe('DatabaseNaturalKeyReader.FindKey', () => {
  it('quotes each key column with the provider, so a reserved-word or spaced name still filters', async () => {
    const provider = { PlatformKey: 'sqlserver', QuoteIdentifier: (name: string) => `[${name}]` } as unknown as DatabaseProviderBase;
    const runView = vi.fn(async (_params: RunViewParams) => ({ Success: true, Results: [{ ID: EXISTING_ID }] }));
    const rows = { RunView: runView } as unknown as IMetadataProvider;
    const field = (name: string, needsQuotes: boolean) => ({ Name: name, NeedsQuotes: needsQuotes }) as unknown as EntityFieldInfo;

    const found = await new DatabaseNaturalKeyReader(provider, {} as UserInfo, rows).FindKey(info, [
      { Field: field('Order', true), Value: "O'Brien" },
      { Field: field('Line No', false), Value: 3 },
    ]);

    expect(found).toEqual({ ID: EXISTING_ID });
    expect(runView.mock.calls[0][0].ExtraFilter).toBe("[Order] = 'O''Brien' AND [Line No] = 3");
  });
});

describe('unique key catalog', () => {
  it('groups catalog rows into keys in column order', () => {
    const rows = [
      { IndexName: 'UQ_A', ColumnName: 'EntityID' },
      { IndexName: 'UQ_A', ColumnName: 'RoleID' },
      { IndexName: 'UQ_B', ColumnName: 'Name' },
    ];
    expect(GroupUniqueKeyRows(rows)).toEqual([
      { Name: 'UQ_A', Columns: ['EntityID', 'RoleID'] },
      { Name: 'UQ_B', Columns: ['Name'] },
    ]);
  });

  it('reads unfiltered non-primary unique indexes on each platform, escaping names', () => {
    const sqlServer = UniqueKeyCatalogSQL('sqlserver', "__mj", "Entity'Permission");
    expect(sqlServer).toContain("OBJECT_ID(N'[__mj].[Entity''Permission]')");
    expect(sqlServer).toContain('i.is_unique = 1 AND i.is_primary_key = 0 AND i.has_filter = 0');
    const postgres = UniqueKeyCatalogSQL('postgresql', '__mj', 'EntityPermission');
    expect(postgres).toContain("n.nspname = '__mj' AND t.relname = 'EntityPermission'");
    expect(postgres).toContain('x.indisunique AND NOT x.indisprimary AND x.indpred IS NULL');
  });
});
