/**
 * AudienceResolver is a thin re-export over ListOperations.ResolveSource.
 * We mock @memberjunction/core (same pattern as other tests in this
 * package) and verify it routes through to the underlying ResolveSource
 * for each source kind.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRunViewImpl = vi.fn();
const mockGetEntityObject = vi.fn();
const mockEntities: Array<{ ID: string; Name: string; PrimaryKeys: Array<{ Name: string }> }> = [];

vi.mock('@memberjunction/core', () => {
  class CompositeKey {
    KeyValuePairs: Array<{ FieldName: string; Value: unknown }> = [];
    ToConcatenatedString() {
      return this.KeyValuePairs.map((kv) => `${kv.FieldName}|${kv.Value}`).join('||');
    }
  }
  class RunView {
    constructor(_p?: unknown) {}
    static FromMetadataProvider() {
      return new RunView();
    }
    static async GetEntityNameFromRunViewParams() {
      return 'Contacts';
    }
    RunView(params: unknown) {
      return mockRunViewImpl(params);
    }
  }
  class Metadata {
    get Entities() {
      return mockEntities;
    }
    EntityByName(name: string) {
      return mockEntities.find((e) => e.Name === name);
    }
    GetEntityObject(entityName: string) {
      return mockGetEntityObject(entityName);
    }
  }
  return { CompositeKey, Metadata, RunView, LogError: () => {}, LogStatus: () => {} };
});

vi.mock('@memberjunction/core-entities', () => ({
  MJListDetailEntity: class {},
  MJListEntity: class {},
  MJUserViewEntity: class {},
}));

import { AudienceResolver } from '../AudienceResolver';

const CTX_USER = { ID: 'u1', Name: 'Test', Email: 't@x', UserRoles: [] };
const CONTACTS = { ID: 'entity-contacts', Name: 'Contacts', PrimaryKeys: [{ Name: 'ID' }] };

describe('AudienceResolver', () => {
  beforeEach(() => {
    mockRunViewImpl.mockReset();
    mockGetEntityObject.mockReset();
    mockEntities.length = 0;
    mockEntities.push(CONTACTS);
  });

  it('resolves a view source to record IDs', async () => {
    mockRunViewImpl.mockResolvedValue({
      Success: true,
      Results: [{ ID: 'a' }, { ID: 'b' }, { ID: 'c' }],
      RowCount: 3,
    });
    const resolver = new AudienceResolver(CTX_USER as never);
    const result = await resolver.Resolve({ kind: 'view', viewId: 'view-1' });
    expect(result.EntityName).toBe('Contacts');
    expect(result.RecordIds).toEqual(['a', 'b', 'c']);
  });

  it('resolves an ad-hoc source by entity + filter', async () => {
    mockRunViewImpl.mockResolvedValue({
      Success: true,
      Results: [{ ID: 'x' }, { ID: 'y' }],
      RowCount: 2,
    });
    const resolver = new AudienceResolver(CTX_USER as never);
    const result = await resolver.Resolve({
      kind: 'adhoc',
      entityName: 'Contacts',
      extraFilter: "Status='Active'",
    });
    expect(result.RecordIds).toEqual(['x', 'y']);
  });

  it('resolves a list source via the list-details path', async () => {
    mockGetEntityObject.mockResolvedValueOnce({
      Load: vi.fn().mockResolvedValue(true),
      ID: 'list-1',
      EntityID: CONTACTS.ID,
    });
    mockRunViewImpl.mockResolvedValueOnce({
      Success: true,
      Results: [{ RecordID: 'r1' }, { RecordID: 'r2' }],
      RowCount: 2,
    });
    const resolver = new AudienceResolver(CTX_USER as never);
    const result = await resolver.Resolve({ kind: 'list', listId: 'list-1' });
    expect(result.EntityName).toBe('Contacts');
    expect(result.RecordIds).toEqual(['r1', 'r2']);
  });
});
