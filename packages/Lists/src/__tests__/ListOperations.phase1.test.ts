/**
 * Phase 1 — MaterializeFromView / AddViewResultsToList / RefreshFromSource.
 *
 * Same mock pattern as `ListOperations.io.test.ts`: we stub `@memberjunction/core`
 * so we can exercise the lineage-write paths and the snapshot vs live refresh
 * branches without a real database.
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
    static async GetEntityNameFromRunViewParams(_params: { ViewID?: string }): Promise<string> {
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
    EntityByID(id: string) {
      return mockEntities.find((e) => e.ID === id);
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
  MJUserViewEntity: class {},
}));

import { SetDeltaTokenSecret } from '../deltaToken';
import { ListOperations } from '../ListOperations';
import type { MaterializeOptions } from '../types';

const CTX_USER = { ID: 'user-1', Name: 'Test', Email: 't@x', UserRoles: [] };
const CONTACTS_ENTITY = { ID: 'entity-contacts', Name: 'Contacts', PrimaryKeys: [{ Name: 'ID' }] };

/** Build a fresh mock List entity with the lineage fields we need. */
function makeMockList(overrides: Record<string, unknown> = {}) {
  const state: Record<string, unknown> = {
    ID: 'list-new',
    Name: '',
    EntityID: CONTACTS_ENTITY.ID,
    UserID: CTX_USER.ID,
    SourceViewID: null,
    SourceFilterSnapshot: null,
    RefreshMode: 'Additive',
    UseSnapshot: false,
    LastRefreshedAt: null,
    LastRefreshedByUserID: null,
    Description: null,
    CategoryID: null,
    ...overrides,
  };
  return {
    NewRecord: vi.fn(),
    Load: vi.fn().mockResolvedValue(true),
    Save: vi.fn().mockResolvedValue(true),
    LatestResult: { CompleteMessage: '' },
    get ID() {
      return state.ID;
    },
    get Name() {
      return state.Name;
    },
    set Name(v: unknown) {
      state.Name = v;
    },
    get EntityID() {
      return state.EntityID;
    },
    set EntityID(v: unknown) {
      state.EntityID = v;
    },
    get UserID() {
      return state.UserID;
    },
    set UserID(v: unknown) {
      state.UserID = v;
    },
    get Description() {
      return state.Description;
    },
    set Description(v: unknown) {
      state.Description = v;
    },
    get CategoryID() {
      return state.CategoryID;
    },
    set CategoryID(v: unknown) {
      state.CategoryID = v;
    },
    get SourceViewID() {
      return state.SourceViewID;
    },
    set SourceViewID(v: unknown) {
      state.SourceViewID = v;
    },
    get SourceFilterSnapshot() {
      return state.SourceFilterSnapshot;
    },
    set SourceFilterSnapshot(v: unknown) {
      state.SourceFilterSnapshot = v;
    },
    get RefreshMode() {
      return state.RefreshMode;
    },
    set RefreshMode(v: unknown) {
      state.RefreshMode = v;
    },
    get UseSnapshot() {
      return state.UseSnapshot;
    },
    set UseSnapshot(v: unknown) {
      state.UseSnapshot = v;
    },
    get LastRefreshedAt() {
      return state.LastRefreshedAt;
    },
    set LastRefreshedAt(v: unknown) {
      state.LastRefreshedAt = v;
    },
    get LastRefreshedByUserID() {
      return state.LastRefreshedByUserID;
    },
    set LastRefreshedByUserID(v: unknown) {
      state.LastRefreshedByUserID = v;
    },
    _state: state,
  };
}

function makeMockUserView(filterState: Record<string, unknown>) {
  return {
    Load: vi.fn().mockResolvedValue(true),
    EntityID: CONTACTS_ENTITY.ID,
    WhereClause: filterState.whereClause ?? null,
    CustomWhereClause: filterState.customWhereClause ?? null,
    FilterState: filterState.filterState ?? null,
    CustomFilterState: filterState.customFilterState ?? null,
    SmartFilterEnabled: filterState.smartFilterEnabled ?? false,
    SmartFilterWhereClause: filterState.smartFilterWhereClause ?? null,
    SortState: filterState.sortState ?? null,
  };
}

function makeMockListDetail(saveResult = true, errorMessage = '') {
  return {
    NewRecord: vi.fn(),
    Save: vi.fn().mockResolvedValue(saveResult),
    LatestResult: { CompleteMessage: errorMessage },
    ListID: '',
    RecordID: '',
    Sequence: 0,
  };
}

describe('ListOperations — Phase 1', () => {
  beforeEach(() => {
    SetDeltaTokenSecret('phase1-test-secret');
    mockRunViewImpl.mockReset();
    mockGetEntityObject.mockReset();
    mockEntityByName.mockReset();
    mockEntities.length = 0;
    mockEntities.push(CONTACTS_ENTITY);
    mockEntityByName.mockReturnValue(CONTACTS_ENTITY);
  });

  describe('MaterializeFromView', () => {
    it('creates a list with no lineage when RememberLineage=false', async () => {
      const list = makeMockList();
      mockGetEntityObject.mockImplementation((name: string) => {
        if (name === 'MJ: Lists') return list;
        if (name === 'MJ: List Details') return makeMockListDetail();
        throw new Error(`unexpected entity ${name}`);
      });
      // ResolveSource(view) → 2 records
      mockRunViewImpl.mockResolvedValue({
        Success: true,
        Results: [{ ID: 'r1' }, { ID: 'r2' }],
        RowCount: 2,
      });

      const ops = new ListOperations(CTX_USER as never);
      const result = await ops.MaterializeFromView('view-1', {
        ListName: 'My new list',
        RememberLineage: false,
        UseSnapshot: false,
        RefreshMode: 'Additive',
      } satisfies MaterializeOptions);

      expect(result.Success).toBe(true);
      expect(result.ResultCode).toBe('SUCCESS');
      expect(result.CreatedListId).toBe('list-new');
      expect(result.Counts).toEqual({ Added: 2, Removed: 0, Failed: 0 });
      expect(list._state.Name).toBe('My new list');
      expect(list._state.EntityID).toBe(CONTACTS_ENTITY.ID);
      expect(list._state.UserID).toBe(CTX_USER.ID);
      // Lineage explicitly NOT populated:
      expect(list._state.SourceViewID).toBeNull();
      expect(list._state.SourceFilterSnapshot).toBeNull();
    });

    it('captures SourceViewID when RememberLineage=true (live mode)', async () => {
      const list = makeMockList();
      mockGetEntityObject.mockImplementation((name: string) => {
        if (name === 'MJ: Lists') return list;
        if (name === 'MJ: List Details') return makeMockListDetail();
        throw new Error(`unexpected entity ${name}`);
      });
      mockRunViewImpl.mockResolvedValue({ Success: true, Results: [{ ID: 'r1' }], RowCount: 1 });

      const ops = new ListOperations(CTX_USER as never);
      await ops.MaterializeFromView('view-42', {
        ListName: 'Live-lineage list',
        RememberLineage: true,
        UseSnapshot: false,
        RefreshMode: 'Sync',
      });

      expect(list._state.SourceViewID).toBe('view-42');
      expect(list._state.RefreshMode).toBe('Sync');
      expect(list._state.UseSnapshot).toBe(false);
      expect(list._state.SourceFilterSnapshot).toBeNull();
    });

    it('captures filter snapshot when UseSnapshot=true', async () => {
      const list = makeMockList();
      const view = makeMockUserView({
        whereClause: "Status='Active'",
        customWhereClause: null,
        filterState: '{"someJson":true}',
      });
      mockGetEntityObject.mockImplementation((name: string) => {
        if (name === 'MJ: Lists') return list;
        if (name === 'MJ: User Views') return view;
        if (name === 'MJ: List Details') return makeMockListDetail();
        throw new Error(`unexpected entity ${name}`);
      });
      mockRunViewImpl.mockResolvedValue({ Success: true, Results: [{ ID: 'r1' }], RowCount: 1 });

      const ops = new ListOperations(CTX_USER as never);
      await ops.MaterializeFromView('view-snap', {
        ListName: 'Snapshot list',
        RememberLineage: true,
        UseSnapshot: true,
        RefreshMode: 'Additive',
      });

      expect(list._state.SourceViewID).toBe('view-snap');
      expect(list._state.UseSnapshot).toBe(true);
      expect(list._state.SourceFilterSnapshot).not.toBeNull();
      const parsed = JSON.parse(list._state.SourceFilterSnapshot as string);
      expect(parsed.v).toBe(1);
      expect(parsed.whereClause).toBe("Status='Active'");
      expect(parsed.sourceViewId).toBe('view-snap');
    });

    it('returns PARTIAL_SUCCESS when some inserts fail', async () => {
      const list = makeMockList();
      let detailCallCount = 0;
      mockGetEntityObject.mockImplementation((name: string) => {
        if (name === 'MJ: Lists') return list;
        if (name === 'MJ: List Details') {
          detailCallCount++;
          // First insert succeeds, second fails.
          return detailCallCount === 1
            ? makeMockListDetail(true)
            : makeMockListDetail(false, 'constraint violation');
        }
        throw new Error(`unexpected entity ${name}`);
      });
      mockRunViewImpl.mockResolvedValue({
        Success: true,
        Results: [{ ID: 'r1' }, { ID: 'r2' }],
        RowCount: 2,
      });

      const ops = new ListOperations(CTX_USER as never);
      const result = await ops.MaterializeFromView('view-1', {
        ListName: 'Half-failing list',
        RememberLineage: false,
        UseSnapshot: false,
        RefreshMode: 'Additive',
      });

      expect(result.Success).toBe(false);
      expect(result.ResultCode).toBe('PARTIAL_SUCCESS');
      expect(result.Counts).toEqual({ Added: 1, Removed: 0, Failed: 1 });
      expect(result.Errors?.[0]).toMatch(/constraint violation/);
    });

    it('fails clearly when the list save itself fails', async () => {
      const failingList = makeMockList();
      failingList.Save = vi.fn().mockResolvedValue(false);
      failingList.LatestResult = { CompleteMessage: 'permission denied' };
      mockGetEntityObject.mockImplementation((name: string) => {
        if (name === 'MJ: Lists') return failingList;
        throw new Error(`unexpected entity ${name}`);
      });
      mockRunViewImpl.mockResolvedValue({ Success: true, Results: [], RowCount: 0 });

      const ops = new ListOperations(CTX_USER as never);
      const result = await ops.MaterializeFromView('view-1', {
        ListName: 'Doomed list',
        RememberLineage: false,
        UseSnapshot: false,
        RefreshMode: 'Additive',
      });
      expect(result.Success).toBe(false);
      expect(result.ResultCode).toBe('UNEXPECTED_ERROR');
      expect(result.Message).toMatch(/permission denied/);
    });
  });

  describe('AddViewResultsToList', () => {
    it('adds new records and dedupes existing', async () => {
      const list = makeMockList({
        ID: 'list-target',
        Name: 'Target',
      });
      // Three RunView calls happen: list members (preview), view source (preview),
      // list members again (drift check).
      mockRunViewImpl.mockImplementation(async (params: { EntityName?: string; ViewID?: string }) => {
        if (params.EntityName === 'MJ: List Details') {
          return { Success: true, Results: [{ RecordID: 'b' }], RowCount: 1 };
        }
        if (params.ViewID) {
          return { Success: true, Results: [{ ID: 'a' }, { ID: 'b' }], RowCount: 2 };
        }
        return { Success: true, Results: [], RowCount: 0 };
      });
      mockGetEntityObject.mockImplementation((name: string) => {
        if (name === 'MJ: Lists') return list;
        if (name === 'MJ: List Details') return makeMockListDetail();
        throw new Error(`unexpected entity ${name}`);
      });

      const ops = new ListOperations(CTX_USER as never);
      const result = await ops.AddViewResultsToList('view-1', 'list-target');

      expect(result.Success).toBe(true);
      // 'a' added, 'b' deduped, 0 removed.
      expect(result.Counts).toEqual({ Added: 1, Removed: 0, Failed: 0 });
    });
  });

  describe('RefreshFromSource', () => {
    it('returns TARGET_NOT_FOUND when list has no SourceViewID', async () => {
      const list = makeMockList({ ID: 'list-orphan', SourceViewID: null });
      mockGetEntityObject.mockImplementation((name: string) => {
        if (name === 'MJ: Lists') return list;
        throw new Error(`unexpected entity ${name}`);
      });

      const ops = new ListOperations(CTX_USER as never);
      const result = await ops.RefreshFromSource('list-orphan', 'Additive', { ConfirmDrops: false });
      expect(result.Success).toBe(false);
      expect(result.ResultCode).toBe('TARGET_NOT_FOUND');
      expect(result.Message).toMatch(/no SourceViewID/);
    });

    it('refuses Sync refresh without ConfirmDrops when drops would occur', async () => {
      const list = makeMockList({
        ID: 'list-sync',
        SourceViewID: 'view-1',
        UseSnapshot: false,
      });
      mockGetEntityObject.mockImplementation((name: string) => {
        if (name === 'MJ: Lists') return list;
        throw new Error(`unexpected entity ${name}`);
      });
      // Source view has {a}, list currently has {a, b}. Sync would drop {b}.
      mockRunViewImpl.mockImplementation(async (params: { EntityName?: string; ViewID?: string }) => {
        if (params.EntityName === 'MJ: List Details') {
          return { Success: true, Results: [{ RecordID: 'a' }, { RecordID: 'b' }], RowCount: 2 };
        }
        if (params.ViewID) {
          return { Success: true, Results: [{ ID: 'a' }], RowCount: 1 };
        }
        return { Success: true, Results: [], RowCount: 0 };
      });

      const ops = new ListOperations(CTX_USER as never);
      const result = await ops.RefreshFromSource('list-sync', 'Sync', { ConfirmDrops: false });
      expect(result.Success).toBe(false);
      expect(result.ResultCode).toBe('DROP_NOT_CONFIRMED');
    });

    it('uses the captured filter snapshot when UseSnapshot=true', async () => {
      const snapshot = JSON.stringify({
        v: 1,
        capturedAt: '2026-01-01T00:00:00Z',
        sourceViewId: 'view-1',
        entityId: CONTACTS_ENTITY.ID,
        whereClause: "Status='Active'",
        customWhereClause: null,
        smartFilterWhereClause: null,
      });
      const list = makeMockList({
        ID: 'list-snap',
        SourceViewID: 'view-1',
        UseSnapshot: true,
        SourceFilterSnapshot: snapshot,
      });
      const capturedRunViewCalls: Array<{ EntityName?: string; ExtraFilter?: string; ViewID?: string }> = [];
      mockGetEntityObject.mockImplementation((name: string) => {
        if (name === 'MJ: Lists') return list;
        if (name === 'MJ: List Details') return makeMockListDetail();
        throw new Error(`unexpected entity ${name}`);
      });
      mockRunViewImpl.mockImplementation(async (params: { EntityName?: string; ExtraFilter?: string; ViewID?: string }) => {
        capturedRunViewCalls.push(params);
        if (params.EntityName === 'MJ: List Details') {
          return { Success: true, Results: [{ RecordID: 'a' }], RowCount: 1 };
        }
        // ad-hoc source query
        if (params.EntityName === 'Contacts') {
          return { Success: true, Results: [{ ID: 'a' }, { ID: 'b' }], RowCount: 2 };
        }
        return { Success: true, Results: [], RowCount: 0 };
      });

      const ops = new ListOperations(CTX_USER as never);
      const result = await ops.RefreshFromSource('list-snap', 'Additive', { ConfirmDrops: false });

      expect(result.Success).toBe(true);
      // Verify we issued an ad-hoc query against Contacts with the snapshot's WHERE clause.
      const adhocCall = capturedRunViewCalls.find((c) => c.EntityName === 'Contacts');
      expect(adhocCall).toBeDefined();
      expect(adhocCall?.ExtraFilter).toBe("Status='Active'");
      // No ViewID call should have happened (we're in snapshot mode, not live).
      expect(capturedRunViewCalls.some((c) => c.ViewID)).toBe(false);
    });

    it('stamps LastRefreshedAt + LastRefreshedByUserID on success', async () => {
      const list = makeMockList({
        ID: 'list-live',
        SourceViewID: 'view-1',
        UseSnapshot: false,
      });
      mockGetEntityObject.mockImplementation((name: string) => {
        if (name === 'MJ: Lists') return list;
        if (name === 'MJ: List Details') return makeMockListDetail();
        throw new Error(`unexpected entity ${name}`);
      });
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
      const before = Date.now();
      const result = await ops.RefreshFromSource('list-live', 'Additive', { ConfirmDrops: false });
      expect(result.Success).toBe(true);
      const stamped = list._state.LastRefreshedAt as Date | null;
      expect(stamped).toBeInstanceOf(Date);
      expect(stamped!.getTime()).toBeGreaterThanOrEqual(before);
      expect(list._state.LastRefreshedByUserID).toBe(CTX_USER.ID);
    });

    it('fails when snapshot mode is set but snapshot is missing', async () => {
      const list = makeMockList({
        ID: 'list-broken',
        SourceViewID: 'view-1',
        UseSnapshot: true,
        SourceFilterSnapshot: null,
      });
      mockGetEntityObject.mockImplementation((name: string) => {
        if (name === 'MJ: Lists') return list;
        throw new Error(`unexpected entity ${name}`);
      });

      const ops = new ListOperations(CTX_USER as never);
      const result = await ops.RefreshFromSource('list-broken', 'Additive', { ConfirmDrops: false });
      expect(result.Success).toBe(false);
      expect(result.ResultCode).toBe('UNEXPECTED_ERROR');
      expect(result.Message).toMatch(/no usable SourceFilterSnapshot/);
    });
  });
});
