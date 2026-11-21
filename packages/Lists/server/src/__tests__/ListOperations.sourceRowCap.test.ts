/**
 * A list source resolves to EVERY matching record. View and ad-hoc sources go through `RunView`,
 * which applies the entity's `UserViewMaxRows` cap unless told otherwise, so without
 * `IgnoreMaxRows` a list built from a 61,000-row view silently holds the first page — the sync,
 * the delta and the audience all agree on a number that is wrong, and nothing reports it.
 *
 * A view source also has to look its view up as the acting user: the server-side User Views
 * lookup fails unscoped.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRunViewImpl = vi.fn();
const mockEntityNameFromParams = vi.fn();
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
    static GetEntityNameFromRunViewParams(params: unknown, provider: unknown, contextUser?: unknown) {
      return mockEntityNameFromParams(params, provider, contextUser);
    }
    RunView(params: unknown, _ctx?: unknown) {
      return mockRunViewImpl(params);
    }
  }
  class Metadata {
    static get Provider() {
      return { ScreenClientClause: () => {} };
    }
    get Entities() {
      return mockEntities;
    }
    EntityByName(name: string) {
      return mockEntityByName(name);
    }
  }
  return { CompositeKey, RunView, Metadata, LogError: () => {}, LogStatus: () => {} };
});

vi.mock('@memberjunction/core-entities', () => ({
  MJListDetailEntity: class {},
  MJListEntity: class {},
}));

import { ListOperations } from '../ListOperations';

const CTX_USER = { ID: 'u1', Name: 'Test', Email: 't@x', UserRoles: [] };
const CONTACTS = { ID: 'entity-contacts', Name: 'Contacts', PrimaryKeys: [{ Name: 'ID' }] };

describe('ListOperations — list sources are never capped at UserViewMaxRows', () => {
  beforeEach(() => {
    mockRunViewImpl.mockReset();
    mockEntityNameFromParams.mockReset();
    mockEntityByName.mockReset();
    mockEntities.length = 0;
    mockEntities.push(CONTACTS);
    mockEntityByName.mockReturnValue(CONTACTS);
    mockEntityNameFromParams.mockResolvedValue('Contacts');
    mockRunViewImpl.mockResolvedValue({ Success: true, Results: [{ ID: 'r1' }], RowCount: 1 });
  });

  it('a view source runs with IgnoreMaxRows', async () => {
    await new ListOperations(CTX_USER as never).ResolveSource({ kind: 'view', viewId: 'view-1' });

    expect(mockRunViewImpl).toHaveBeenCalledTimes(1);
    expect(mockRunViewImpl.mock.calls[0][0]).toMatchObject({ ViewID: 'view-1', IgnoreMaxRows: true });
  });

  it('a view source looks its view up as the acting user', async () => {
    await new ListOperations(CTX_USER as never).ResolveSource({ kind: 'view', viewId: 'view-1' });

    expect(mockEntityNameFromParams).toHaveBeenCalledWith({ ViewID: 'view-1' }, null, CTX_USER);
  });

  it('an ad-hoc source runs with IgnoreMaxRows', async () => {
    await new ListOperations(CTX_USER as never).ResolveSource({ kind: 'adhoc', entityName: 'Contacts', extraFilter: "Status='Active'" });

    expect(mockRunViewImpl).toHaveBeenCalledTimes(1);
    expect(mockRunViewImpl.mock.calls[0][0]).toMatchObject({ EntityName: 'Contacts', IgnoreMaxRows: true });
  });
});
