/**
 * `ListOperations` runs an ad-hoc source's `ExtraFilter` through `RunView`. That text comes from a
 * client (`ListSourceInput{Kind:'adhoc'}`, and the Compose Lists, Refresh List From Source, Resolve
 * Audience and Send To Audience actions) or from a list's stored `SourceFilterSnapshot`, which the
 * list owner can edit. These tests pin that every ad-hoc filter passes its provider's client-clause
 * screen, with the acting user, before it runs, and that it fails closed when the provider cannot
 * screen.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRunViewImpl = vi.fn();
const mockGetEntityObject = vi.fn();
const mockEntityByName = vi.fn();
const mockEntities: Array<{ ID: string; Name: string; PrimaryKeys: Array<{ Name: string }> }> = [];
/** The global provider `ListOperations` falls back to when it is given none. */
let globalProvider: object = {};

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
    static get Provider() {
      return globalProvider;
    }
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

/** What a screening provider was asked to screen. */
interface ScreenCall {
  Clause: string;
  Label: string;
  User: unknown;
  Entity: unknown;
}

/** A provider whose screen refuses any filter carrying a statement separator, as the real one does. */
function screeningProvider(calls: ScreenCall[]) {
  return {
    ScreenClientClause(clause: string, label: string, user?: unknown, entity?: unknown): void {
      calls.push({ Clause: clause, Label: label, User: user, Entity: entity });
      if (clause.includes(';')) throw new Error(`Invalid ${label}: refused by the provider's screen`);
    },
  };
}

describe('ListOperations — ad-hoc filters pass the provider screen by default', () => {
  let calls: ScreenCall[];

  beforeEach(() => {
    SetDeltaTokenSecret('unit-test-secret');
    mockRunViewImpl.mockReset();
    mockGetEntityObject.mockReset();
    mockEntityByName.mockReset();
    mockEntities.length = 0;
    mockEntities.push(CONTACTS);
    mockEntityByName.mockReturnValue(CONTACTS);
    mockRunViewImpl.mockResolvedValue({ Success: true, Results: [{ ID: 'r1' }], RowCount: 1 });
    calls = [];
    globalProvider = screeningProvider(calls);
  });

  it('refuses a client ad-hoc filter the screen rejects, before RunView', async () => {
    const ops = new ListOperations(CTX_USER as never);

    await expect(ops.ResolveSource({ kind: 'adhoc', entityName: 'Contacts', extraFilter: STACKED })).rejects.toThrow(/refused by the provider's screen/);
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
    const ops = new ListOperations(CTX_USER as never);

    await expect(ops.RefreshFromSource('list-1', 'Additive', { ConfirmDrops: false })).rejects.toThrow(/refused by the provider's screen/);
    expect(mockRunViewImpl).not.toHaveBeenCalled();
  });

  it('fails closed when the provider cannot screen client SQL', async () => {
    globalProvider = { Entities: [] };
    const ops = new ListOperations(CTX_USER as never);

    await expect(ops.ResolveSource({ kind: 'adhoc', entityName: 'Contacts', extraFilter: "Status='Active'" })).rejects.toThrow(/cannot screen client SQL/);
    expect(mockRunViewImpl).not.toHaveBeenCalled();
  });

  it('runs a filter the screen accepts, screened with the acting user and the entity', async () => {
    const ops = new ListOperations(CTX_USER as never);

    const result = await ops.ResolveSource({ kind: 'adhoc', entityName: 'Contacts', extraFilter: "Status='Active'" });

    expect(result.RecordIds).toEqual(['r1']);
    expect(calls).toEqual([{ Clause: "Status='Active'", Label: 'ExtraFilter', User: CTX_USER, Entity: CONTACTS }]);
    expect(mockRunViewImpl).toHaveBeenCalledWith(expect.objectContaining({ ExtraFilter: "Status='Active'" }));
  });
});
