/**
 * `ListOperations` runs an ad-hoc source's `ExtraFilter` through `RunView`. That text comes from
 * the client (`ListSourceInput{Kind:'adhoc'}`) or from a list's stored `SourceFilterSnapshot`,
 * which the list owner can edit. The `AdhocFilterScreen` option lets the server boundary refuse a
 * filter before it runs; these tests pin that every ad-hoc filter, including one rebuilt from a
 * snapshot, goes through it, and that nothing it refuses reaches `RunView`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRunViewImpl = vi.fn();
const mockGetEntityObject = vi.fn();
const mockEntityByName = vi.fn();
const mockEntities: Array<{ ID: string; Name: string; PrimaryKeys: Array<{ Name: string }> }> = [];

vi.mock('@memberjunction/core', () => {
  class CompositeKey {
    KeyValuePairs: Array<{ FieldName: string; Value: unknown }> = [];
    ToCompactURLSegment(): string {
      return this.KeyValuePairs.map((kv) => String(kv.Value ?? '')).join('||');
    }
    static FromEntityRecord(entity: { PrimaryKeys: Array<{ Name: string }> }, row: Record<string, unknown>): CompositeKey {
      const key = new CompositeKey();
      key.KeyValuePairs = entity.PrimaryKeys.map((pk) => ({ FieldName: pk.Name, Value: row[pk.Name] }));
      return key;
    }
  }
  class RunView {
    static FromMetadataProvider(_p: unknown) {
      return new RunView();
    }
    RunView(params: unknown, _ctx?: unknown) {
      return mockRunViewImpl(params);
    }
  }
  class Metadata {
    get Entities() {
      return mockEntities;
    }
    EntityByName(name: string) {
      return mockEntityByName(name);
    }
    EntityByID(id: string) {
      return mockEntities.find((e) => e.ID === id);
    }
    GetEntityObject(entityName: string, _ctx?: unknown) {
      return mockGetEntityObject(entityName);
    }
  }
  return { CompositeKey, RunView, Metadata, LogError: () => {}, LogStatus: () => {} };
});

vi.mock('@memberjunction/core-entities', () => ({
  MJListDetailEntity: class {},
  MJListEntity: class {},
}));

import { SetDeltaTokenSecret } from '../deltaToken';
import { ListOperations } from '../ListOperations';

const CTX_USER = { ID: 'u1', Name: 'Test', Email: 't@x', UserRoles: [] };
const CONTACTS = { ID: 'entity-contacts', Name: 'Contacts', PrimaryKeys: [{ Name: 'ID' }] };
const STACKED = "1 = (SELECT 1 AS [a'])) ; SELECT 1 AS [x] ; SELECT 1 WHERE (1 = (SELECT 1 AS [b'])";

/** Refuses any filter carrying a statement separator, the way the server's clause screen does. */
function refusingScreen(extraFilter: string): void {
  if (extraFilter.includes(';')) throw new Error(`Invalid ExtraFilter: refused by screen`);
}

describe('ListOperations — AdhocFilterScreen', () => {
  beforeEach(() => {
    SetDeltaTokenSecret('unit-test-secret');
    mockRunViewImpl.mockReset();
    mockGetEntityObject.mockReset();
    mockEntityByName.mockReset();
    mockEntities.length = 0;
    mockEntities.push(CONTACTS);
    mockEntityByName.mockReturnValue(CONTACTS);
    mockRunViewImpl.mockResolvedValue({ Success: true, Results: [{ ID: 'r1' }], RowCount: 1 });
  });

  it('refuses a client ad-hoc filter the screen rejects, before RunView', async () => {
    const ops = new ListOperations(CTX_USER as never, undefined, { AdhocFilterScreen: refusingScreen });

    await expect(ops.ResolveSource({ kind: 'adhoc', entityName: 'Contacts', extraFilter: STACKED })).rejects.toThrow(/refused by screen/);
    expect(mockRunViewImpl).not.toHaveBeenCalled();
  });

  it('screens a filter rebuilt from a stored snapshot before a refresh runs it', async () => {
    mockGetEntityObject.mockResolvedValue({
      Load: vi.fn().mockResolvedValue(true),
      ID: 'list-1',
      EntityID: CONTACTS.ID,
      SourceViewID: 'view-1',
      UseSnapshot: true,
      SourceFilterSnapshot: JSON.stringify({ v: 1, whereClause: STACKED }),
    });
    const ops = new ListOperations(CTX_USER as never, undefined, { AdhocFilterScreen: refusingScreen });

    await expect(ops.RefreshFromSource('list-1', 'Additive', { ConfirmDrops: false })).rejects.toThrow(/refused by screen/);
    expect(mockRunViewImpl).not.toHaveBeenCalled();
  });

  it('runs a filter the screen accepts', async () => {
    const ops = new ListOperations(CTX_USER as never, undefined, { AdhocFilterScreen: refusingScreen });

    const result = await ops.ResolveSource({ kind: 'adhoc', entityName: 'Contacts', extraFilter: "Status='Active'" });

    expect(result.RecordIds).toEqual(['r1']);
    expect(mockRunViewImpl).toHaveBeenCalledWith(expect.objectContaining({ ExtraFilter: "Status='Active'" }));
  });
});
