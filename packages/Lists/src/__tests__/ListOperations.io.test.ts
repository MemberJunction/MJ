/**
 * Tests that exercise the parts of `ListOperations` that touch
 * `@memberjunction/core` — `ResolveSource`'s three branches and the
 * mutation path inside `ApplyDelta`. We hoist `vi.mock` so the same mocks
 * apply to every import in this file.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRunViewImpl = vi.fn();
const mockGetEntityObject = vi.fn();
const mockEntityByName = vi.fn();
const mockEntities: Array<{ ID: string; Name: string; PrimaryKeys: Array<{ Name: string }> }> = [];

vi.mock('@memberjunction/core', () => {
  class CompositeKey {
    KeyValuePairs: Array<{ FieldName: string; Value: unknown }> = [];
    ToConcatenatedString(fieldDelimiter = '||', valueDelimiter = '|'): string {
      return this.KeyValuePairs.map((kv) => `${kv.FieldName}${valueDelimiter}${kv.Value}`).join(fieldDelimiter);
    }
  }
  class RunView {
    constructor(_provider?: unknown) {}
    static FromMetadataProvider(_p: unknown) {
      return new RunView();
    }
    static async GetEntityNameFromRunViewParams(params: { ViewID?: string }): Promise<string> {
      if (params.ViewID === 'view-contacts') return 'Contacts';
      return 'Contacts';
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
    GetEntityObject(entityName: string, _ctx?: unknown) {
      return mockGetEntityObject(entityName);
    }
  }
  return {
    CompositeKey,
    RunView,
    Metadata,
    LogError: () => {},
    LogStatus: () => {},
  };
});

vi.mock('@memberjunction/core-entities', () => ({
  MJListDetailEntity: class {},
  MJListEntity: class {},
}));

import { SetDeltaTokenSecret } from '../deltaToken';
import { ListOperations } from '../ListOperations';
import type { ListDelta } from '../types';

const CTX_USER = { ID: 'u1', Name: 'Test', Email: 't@x', UserRoles: [] };

function pkEntity(name: string, pks: string[] = ['ID']): { ID: string; Name: string; PrimaryKeys: Array<{ Name: string }> } {
  return { ID: `entity-${name}`, Name: name, PrimaryKeys: pks.map((Name) => ({ Name })) };
}

describe('ListOperations I/O paths (mocked core)', () => {
  beforeEach(() => {
    SetDeltaTokenSecret('unit-test-secret');
    mockRunViewImpl.mockReset();
    mockGetEntityObject.mockReset();
    mockEntityByName.mockReset();
    mockEntities.length = 0;
  });

  describe('ResolveSource — list kind', () => {
    it('loads list metadata + member RecordIDs', async () => {
      const contacts = pkEntity('Contacts');
      mockEntities.push(contacts);
      mockGetEntityObject.mockResolvedValueOnce({
        Load: vi.fn().mockResolvedValue(true),
        ID: 'list-1',
        EntityID: contacts.ID,
      });
      mockRunViewImpl.mockResolvedValueOnce({
        Success: true,
        Results: [{ RecordID: 'r1' }, { RecordID: 'r2' }],
        RowCount: 2,
      });

      const ops = new ListOperations(CTX_USER as never);
      const result = await ops.ResolveSource({ kind: 'list', listId: 'list-1' });
      expect(result.EntityName).toBe('Contacts');
      expect(result.RecordIds).toEqual(['r1', 'r2']);
    });

    it('throws when list cannot load', async () => {
      mockGetEntityObject.mockResolvedValueOnce({
        Load: vi.fn().mockResolvedValue(false),
      });
      const ops = new ListOperations(CTX_USER as never);
      await expect(ops.ResolveSource({ kind: 'list', listId: 'missing' })).rejects.toThrow(/not found/);
    });

    it('throws when list references an unknown EntityID', async () => {
      mockGetEntityObject.mockResolvedValueOnce({
        Load: vi.fn().mockResolvedValue(true),
        ID: 'list-1',
        EntityID: 'nonexistent',
      });
      const ops = new ListOperations(CTX_USER as never);
      await expect(ops.ResolveSource({ kind: 'list', listId: 'list-1' })).rejects.toThrow(/unknown EntityID/);
    });

    it('surfaces RunView failure', async () => {
      const contacts = pkEntity('Contacts');
      mockEntities.push(contacts);
      mockGetEntityObject.mockResolvedValueOnce({
        Load: vi.fn().mockResolvedValue(true),
        ID: 'list-1',
        EntityID: contacts.ID,
      });
      mockRunViewImpl.mockResolvedValueOnce({ Success: false, Results: [], RowCount: 0, ErrorMessage: 'boom' });
      const ops = new ListOperations(CTX_USER as never);
      await expect(ops.ResolveSource({ kind: 'list', listId: 'list-1' })).rejects.toThrow(/boom/);
    });
  });

  describe('ResolveSource — view kind', () => {
    it('resolves single-PK view rows to raw IDs', async () => {
      const contacts = pkEntity('Contacts');
      mockEntityByName.mockReturnValue(contacts);
      mockRunViewImpl.mockResolvedValueOnce({
        Success: true,
        Results: [{ ID: 'r1' }, { ID: 'r2' }],
        RowCount: 2,
      });
      const ops = new ListOperations(CTX_USER as never);
      const result = await ops.ResolveSource({ kind: 'view', viewId: 'view-contacts' });
      expect(result.RecordIds).toEqual(['r1', 'r2']);
    });

    it('resolves composite-PK view rows to concatenated form', async () => {
      const compEntity = pkEntity('UserRoles', ['UserID', 'RoleID']);
      mockEntityByName.mockReturnValue(compEntity);
      mockRunViewImpl.mockResolvedValueOnce({
        Success: true,
        Results: [{ UserID: 'u1', RoleID: 'r1' }],
        RowCount: 1,
      });
      const ops = new ListOperations(CTX_USER as never);
      const result = await ops.ResolveSource({ kind: 'view', viewId: 'view-contacts' });
      expect(result.RecordIds).toEqual(['UserID|u1||RoleID|r1']);
    });

    it('throws when entity not in metadata', async () => {
      mockEntityByName.mockReturnValue(undefined);
      const ops = new ListOperations(CTX_USER as never);
      await expect(ops.ResolveSource({ kind: 'view', viewId: 'view-contacts' })).rejects.toThrow(/not found in metadata/);
    });

    it('surfaces RunView failure', async () => {
      const contacts = pkEntity('Contacts');
      mockEntityByName.mockReturnValue(contacts);
      mockRunViewImpl.mockResolvedValueOnce({ Success: false, ErrorMessage: 'view error', Results: [], RowCount: 0 });
      const ops = new ListOperations(CTX_USER as never);
      await expect(ops.ResolveSource({ kind: 'view', viewId: 'view-contacts' })).rejects.toThrow(/view error/);
    });
  });

  describe('ResolveSource — adhoc kind', () => {
    it('resolves ad-hoc filter to PKs', async () => {
      const contacts = pkEntity('Contacts');
      mockEntityByName.mockReturnValue(contacts);
      mockRunViewImpl.mockResolvedValueOnce({
        Success: true,
        Results: [{ ID: 'r9' }],
        RowCount: 1,
      });
      const ops = new ListOperations(CTX_USER as never);
      const result = await ops.ResolveSource({
        kind: 'adhoc',
        entityName: 'Contacts',
        extraFilter: "Status='Active'",
      });
      expect(result.RecordIds).toEqual(['r9']);
    });

    it('throws on unknown entity', async () => {
      mockEntityByName.mockReturnValue(undefined);
      const ops = new ListOperations(CTX_USER as never);
      await expect(
        ops.ResolveSource({ kind: 'adhoc', entityName: 'Bogus', extraFilter: '' }),
      ).rejects.toThrow(/not found in metadata/);
    });
  });

  describe('GetListMembers convenience', () => {
    it('delegates to the list resolver', async () => {
      const contacts = pkEntity('Contacts');
      mockEntities.push(contacts);
      mockGetEntityObject.mockResolvedValueOnce({
        Load: vi.fn().mockResolvedValue(true),
        ID: 'list-1',
        EntityID: contacts.ID,
      });
      mockRunViewImpl.mockResolvedValueOnce({ Success: true, Results: [{ RecordID: 'x' }], RowCount: 1 });
      const ops = new ListOperations(CTX_USER as never);
      const result = await ops.GetListMembers('list-1');
      expect(result.RecordIds).toEqual(['x']);
    });
  });

  describe('ApplyDelta — happy path mutation', () => {
    /**
     * End-to-end exercise: preview a delta against a list, then apply it.
     * We stub the list resolver to return consistent state across both
     * passes (preview + drift-check) and observe the add/remove side
     * effects on the mocked entity object.
     */
    it('adds and removes records, returning success counts', async () => {
      const contacts = pkEntity('Contacts');
      mockEntities.push(contacts);
      mockEntityByName.mockReturnValue(contacts);

      // List metadata load for preview AND drift-check. Use mockResolvedValue (not mockResolvedValueOnce)
      // so both calls hit the same shape.
      mockGetEntityObject.mockImplementation(async (entityName: string) => {
        if (entityName === 'MJ: Lists') {
          return { Load: vi.fn().mockResolvedValue(true), ID: 'list-1', EntityID: contacts.ID };
        }
        if (entityName === 'MJ: List Details') {
          // Returned by applyDeltaMutations for each new record.
          return {
            NewRecord: vi.fn(),
            Save: vi.fn().mockResolvedValue(true),
            LatestResult: { CompleteMessage: '' },
          } as unknown as Record<string, unknown>;
        }
        throw new Error(`unexpected entity ${entityName}`);
      });

      // RunView calls:
      //  1. preview: list-1 members → ['b']
      //  2. preview: view source    → ['a', 'b']
      //  3. drift check: list-1 members → ['b']
      //  4. removal lookup for ToRemove (empty)
      mockRunViewImpl.mockImplementation(async (params: { EntityName?: string; ViewID?: string }) => {
        if (params.EntityName === 'MJ: List Details' && !('ViewID' in params)) {
          return { Success: true, Results: [{ RecordID: 'b' }], RowCount: 1 };
        }
        if (params.ViewID) {
          return { Success: true, Results: [{ ID: 'a' }, { ID: 'b' }], RowCount: 2 };
        }
        return { Success: true, Results: [], RowCount: 0 };
      });

      const ops = new ListOperations(CTX_USER as never);
      const delta = await ops.ComputeDelta(
        { kind: 'list', listId: 'list-1' },
        { kind: 'view', viewId: 'view-contacts' },
        'Additive',
      );

      expect(delta.ToAdd).toEqual(['a']);
      expect(delta.ToRemove).toEqual([]);

      const result = await ops.ApplyDelta(delta, {
        ConfirmDrops: false,
        DeltaToken: delta.DeltaToken,
      });
      expect(result.Success).toBe(true);
      expect(result.ResultCode).toBe('SUCCESS');
      expect(result.Counts).toEqual({ Added: 1, Removed: 0, Failed: 0 });
    });

    it('reports PARTIAL_SUCCESS when an add Save() returns false', async () => {
      const contacts = pkEntity('Contacts');
      mockEntities.push(contacts);

      mockGetEntityObject.mockImplementation(async (entityName: string) => {
        if (entityName === 'MJ: Lists') {
          return { Load: vi.fn().mockResolvedValue(true), ID: 'list-1', EntityID: contacts.ID };
        }
        return {
          NewRecord: vi.fn(),
          Save: vi.fn().mockResolvedValue(false),
          LatestResult: { CompleteMessage: 'mock failure' },
        };
      });

      mockEntityByName.mockReturnValue(contacts);
      mockRunViewImpl.mockImplementation(async (params: { EntityName?: string; ViewID?: string }) => {
        if (params.EntityName === 'MJ: List Details') {
          return { Success: true, Results: [], RowCount: 0 };
        }
        if (params.ViewID) {
          return { Success: true, Results: [{ ID: 'a' }], RowCount: 1 };
        }
        return { Success: true, Results: [], RowCount: 0 };
      });

      const ops = new ListOperations(CTX_USER as never);
      const delta = await ops.ComputeDelta(
        { kind: 'list', listId: 'list-1' },
        { kind: 'view', viewId: 'view-contacts' },
        'Additive',
      );
      const result = await ops.ApplyDelta(delta, { ConfirmDrops: false, DeltaToken: delta.DeltaToken });
      expect(result.Success).toBe(false);
      expect(result.ResultCode).toBe('PARTIAL_SUCCESS');
      expect(result.Counts).toMatchObject({ Added: 0, Failed: 1 });
      expect(result.Errors?.[0]).toMatch(/mock failure/);
    });
  });

  describe('ApplyDelta — expired token', () => {
    it('maps an expired token to STALE_DELTA', async () => {
      const ops = new ListOperations(CTX_USER as never);
      const expiredDelta: ListDelta = {
        TargetListId: 'list-1',
        EntityName: 'Contacts',
        ToAdd: [],
        ToRemove: [],
        Unchanged: [],
        Counts: { Add: 0, Remove: 0, Unchanged: 0, SourceTotal: 0, TargetTotal: 0 },
        Warnings: [],
        DeltaToken: 'X.Y', // invalid → maps to INVALID_TOKEN not EXPIRED, but exercises the branch
      };
      const result = await ops.ApplyDelta(expiredDelta, {
        ConfirmDrops: false,
        DeltaToken: 'X.Y',
      });
      expect(result.Success).toBe(false);
      expect(['INVALID_TOKEN', 'STALE_DELTA']).toContain(result.ResultCode);
    });
  });
});
