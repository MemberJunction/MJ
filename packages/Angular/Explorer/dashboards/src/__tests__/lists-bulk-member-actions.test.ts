// Angular components in this package are partial-compiled — load the JIT compiler first.
import '@angular/compiler';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RunView, type IMetadataProvider, type RunViewParams } from '@memberjunction/core';
import type { MJListEntity } from '@memberjunction/core-entities';
import type { ApplyResult } from '@memberjunction/lists-base';

/** The bulk list client every test reads: one spy per server operation. */
const listsClient = {
  DuplicateList: vi.fn<(listId: string, listName?: string) => Promise<ApplyResult>>(),
  AddRecordsToList: vi.fn<(listId: string, recordIds: readonly string[]) => Promise<ApplyResult>>(),
  CreateListFromRecords: vi.fn<(args: { EntityName: string; RecordIds: readonly string[]; ListName: string; Description?: string }) => Promise<ApplyResult>>(),
};

vi.mock('@memberjunction/graphql-dataprovider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/graphql-dataprovider')>();
  return { ...actual, GraphQLListsClient: vi.fn(function GraphQLListsClientDouble() { return listsClient; }) };
});

import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { ListsBrowseResource } from '../Lists/components/lists-browse-resource.component';
import { ListsMyListsResource } from '../Lists/components/lists-my-lists-resource.component';
import { ListsOperationsResource } from '../Lists/components/lists-operations-resource.component';

const USER_ID = 'U0000000-0000-4000-8000-000000000001';
const LIST_ID = 'L0000000-0000-4000-8000-000000000001';
const NEW_LIST_ID = 'L0000000-0000-4000-8000-000000000002';
const ENTITY_ID = 'E0000000-0000-4000-8000-000000000001';

interface ProviderDouble {
  Provider: IMetadataProvider;
  EntityObjectNames: string[];
  CreateTransactionGroup: ReturnType<typeof vi.fn>;
}

/** A GraphQL provider double that records which entity objects the screen creates. */
function providerDouble(): ProviderDouble {
  const EntityObjectNames: string[] = [];
  const CreateTransactionGroup = vi.fn(async () => ({ Submit: async () => true }));
  const fake = {
    CurrentUser: { ID: USER_ID, UserRoles: [] },
    CreateTransactionGroup,
    GetEntityObject: vi.fn(async (name: string) => {
      EntityObjectNames.push(name);
      return { ID: NEW_LIST_ID, NewRecord: () => true, Save: async () => true, LatestResult: null };
    }),
  };
  Object.setPrototypeOf(fake, GraphQLDataProvider.prototype);
  return { Provider: fake as unknown as IMetadataProvider, EntityObjectNames, CreateTransactionGroup };
}

function applyResult(overrides: Partial<ApplyResult>): ApplyResult {
  return { Success: true, ResultCode: 'SUCCESS', Message: 'ok', Counts: { Added: 0, Removed: 0, Failed: 0 }, ...overrides };
}

function sourceList(): MJListEntity {
  return {
    ID: LIST_ID,
    Name: 'Members',
    Description: null,
    EntityID: ENTITY_ID,
    CategoryID: null,
    UserID: USER_ID,
    LatestResult: null,
    Delete: vi.fn(async () => true),
  } as unknown as MJListEntity;
}

interface ScreenInternals {
  cdr: { detectChanges: () => void; markForCheck: () => void };
  notificationService: { CreateSimpleNotification: ReturnType<typeof vi.fn> };
  loadData: () => Promise<void>;
  applyFilters: () => void;
  buildCategoryTree: () => void;
  LoadAvailableLists: () => Promise<void>;
}

/** A component instance built without Angular: the provider, notifications and reloads are doubles. */
function harness<T extends object>(ctor: { prototype: T }, provider: IMetadataProvider): { Screen: T; Notify: ReturnType<typeof vi.fn>; Internals: ScreenInternals } {
  const raw: object = Object.create(ctor.prototype) as object;
  const internals = raw as ScreenInternals;
  const Notify = vi.fn();
  internals.cdr = { detectChanges: vi.fn(), markForCheck: vi.fn() };
  internals.notificationService = { CreateSimpleNotification: Notify };
  internals.loadData = vi.fn(async () => undefined);
  internals.applyFilters = vi.fn();
  internals.buildCategoryTree = vi.fn();
  internals.LoadAvailableLists = vi.fn(async () => undefined);
  (raw as { Provider: IMetadataProvider }).Provider = provider;
  return { Screen: raw as T, Notify, Internals: internals };
}

let runViewEntities: string[] = [];

beforeEach(() => {
  runViewEntities = [];
  vi.spyOn(RunView.prototype, 'RunView').mockImplementation(async (params: RunViewParams) => {
    runViewEntities.push(params.EntityName ?? '');
    return { Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 0, ErrorMessage: '', UserViewRunID: '' };
  });
  listsClient.DuplicateList.mockReset();
  listsClient.AddRecordsToList.mockReset();
  listsClient.CreateListFromRecords.mockReset();
});

afterEach(() => vi.restoreAllMocks());

describe('Lists browse — duplicate and delete', () => {
  it('duplicates a list with one server call and creates no list rows in the browser', async () => {
    const p = providerDouble();
    const { Screen, Notify } = harness(ListsBrowseResource, p.Provider);
    listsClient.DuplicateList.mockResolvedValue(applyResult({ CreatedListId: NEW_LIST_ID, Counts: { Added: 3, Removed: 0, Failed: 0 } }));
    Screen.SelectedContextItem = { list: sourceList(), itemCount: 3, entityName: 'Members', ownerName: '', isOwner: true };

    await Screen.DuplicateList();

    expect(listsClient.DuplicateList.mock.calls).toEqual([[LIST_ID]]);
    expect(p.EntityObjectNames).toEqual([]);
    expect(runViewEntities).not.toContain('MJ: List Details');
    expect(Notify.mock.calls[0]).toEqual(['List duplicated with 3 items', 'success', 3000]);
  });

  it('deletes a list without loading or deleting its members in the browser', async () => {
    const p = providerDouble();
    const { Screen } = harness(ListsBrowseResource, p.Provider);
    const list = sourceList();
    Screen.AllLists = [];
    Screen.ListToDelete = list;

    await Screen.DeleteList();

    expect(runViewEntities).not.toContain('MJ: List Details');
    expect(p.CreateTransactionGroup).not.toHaveBeenCalled();
    expect(list.Delete).toHaveBeenCalledTimes(1);
  });
});

describe('Lists my-lists — duplicate', () => {
  it('duplicates a list with one server call and creates no list rows in the browser', async () => {
    const p = providerDouble();
    const { Screen, Notify } = harness(ListsMyListsResource, p.Provider);
    listsClient.DuplicateList.mockResolvedValue(applyResult({ CreatedListId: NEW_LIST_ID, Counts: { Added: 2, Removed: 0, Failed: 0 } }));
    Screen.SelectedContextList = sourceList();

    await Screen.DuplicateList();

    expect(listsClient.DuplicateList.mock.calls).toEqual([[LIST_ID]]);
    expect(p.EntityObjectNames).toEqual([]);
    expect(runViewEntities).not.toContain('MJ: List Details');
    expect(Notify.mock.calls[0]).toEqual(['List duplicated with 2 items', 'success', 3000]);
  });
});

describe('Lists operations — create list and add to list', () => {
  function operationsScreen(p: ProviderDouble) {
    const h = harness(ListsOperationsResource, p.Provider);
    h.Screen.SelectedLists = [{ list: sourceList(), entityName: 'Members', color: '' }];
    h.Screen.RecordsToAdd = ['r1', 'r2', 'r3'];
    return h;
  }

  it('creates the list and its members with one server call', async () => {
    const p = providerDouble();
    const { Screen, Notify } = operationsScreen(p);
    listsClient.CreateListFromRecords.mockResolvedValue(applyResult({ CreatedListId: NEW_LIST_ID, Counts: { Added: 3, Removed: 0, Failed: 0 } }));
    Screen.NewListName = 'Top members';
    Screen.NewListDescription = 'Created from: A';

    await Screen.ConfirmCreateList();

    expect(listsClient.CreateListFromRecords.mock.calls).toEqual([
      [{ EntityName: 'Members', RecordIds: ['r1', 'r2', 'r3'], ListName: 'Top members', Description: 'Created from: A' }],
    ]);
    expect(p.EntityObjectNames).toEqual([]);
    expect(p.CreateTransactionGroup).not.toHaveBeenCalled();
    expect(Notify.mock.calls[0]).toEqual(['Created "Top members" with 3 items', 'success', 3000]);
  });

  it('adds records to an existing list with one server call', async () => {
    const p = providerDouble();
    const { Screen, Notify } = operationsScreen(p);
    listsClient.AddRecordsToList.mockResolvedValue(applyResult({ TargetListId: LIST_ID, Counts: { Added: 2, Removed: 0, Failed: 0 } }));
    Screen.SelectedTargetListId = LIST_ID;
    Screen.AvailableLists = [sourceList()];

    await Screen.ConfirmAddToList();

    expect(listsClient.AddRecordsToList.mock.calls).toEqual([[LIST_ID, ['r1', 'r2', 'r3']]]);
    expect(p.EntityObjectNames).toEqual([]);
    expect(p.CreateTransactionGroup).not.toHaveBeenCalled();
    expect(Notify.mock.calls[0]).toEqual(['Added 2 records to "Members"', 'success', 3000]);
  });

  it('says how many records failed when the add is a partial success', async () => {
    const p = providerDouble();
    const { Screen, Notify } = operationsScreen(p);
    listsClient.AddRecordsToList.mockResolvedValue(
      applyResult({ Success: false, ResultCode: 'PARTIAL_SUCCESS', Message: 'Added 2, removed 0 member(s), 1 failed', Counts: { Added: 2, Removed: 0, Failed: 1 } }),
    );
    Screen.SelectedTargetListId = LIST_ID;
    Screen.AvailableLists = [sourceList()];

    await Screen.ConfirmAddToList();

    expect(Notify.mock.calls[0]).toEqual(['Added 2 records to "Members"; 1 failed', 'warning', 5000]);
  });
});
