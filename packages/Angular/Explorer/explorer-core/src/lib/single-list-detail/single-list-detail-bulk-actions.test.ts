// Angular components in this package are partial-compiled — load the JIT compiler first
// (same convention as the other component suites in this node test environment).
import '@angular/compiler';
import { describe, it, expect, vi } from 'vitest';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { SingleListDetailComponent } from './single-list-detail.component';

/**
 * The list detail screen changes list members with one server call per action and never
 * creates, saves or deletes List Detail objects in the browser.
 */

type Open = Record<string, unknown>;

interface Harness {
  component: SingleListDetailComponent;
  executeGQL: ReturnType<typeof vi.fn>;
  runView: ReturnType<typeof vi.fn>;
  getEntityObject: ReturnType<typeof vi.fn>;
  createTransactionGroup: ReturnType<typeof vi.fn>;
}

function applyResult() {
  return { Success: true, ResultCode: 'SUCCESS', Message: '', AddedCount: 2, RemovedCount: 2, FailedCount: 0, UpdatedCount: 2 };
}

function createComponent(state: Open = {}): Harness {
  const result = applyResult();
  const executeGQL = vi.fn(async () => ({
    AddRecordsToList: result, RemoveRecordsFromList: result, SetListRecordStatus: result,
    CopyRecordsToList: result, AddViewResultsToList: result,
  }));
  const runView = vi.fn(async () => ({ Success: true, Results: [] }));
  const getEntityObject = vi.fn(async () => ({ Load: async () => true, Save: async () => true, Delete: async () => true }));
  const createTransactionGroup = vi.fn(async () => ({ Submit: async () => true }));
  const provider = Object.create(GraphQLDataProvider.prototype) as GraphQLDataProvider;
  Object.assign(provider, {
    ExecuteGQL: executeGQL,
    RunView: runView,
    RunViews: vi.fn(async () => []),
    GetEntityObject: getEntityObject,
    CreateTransactionGroup: createTransactionGroup,
    EntityByID: () => ({ PrimaryKeys: [{ Name: 'ID' }] }),
  });
  Object.defineProperty(provider, 'CurrentUser', { get: () => ({ ID: 'user-1' }) });

  const component = Object.create(SingleListDetailComponent.prototype) as SingleListDetailComponent;
  Object.assign(component as unknown as Open, {
    sharedService: { CreateSimpleNotification: vi.fn() },
    cdr: { detectChanges: vi.fn() },
    ListRecord: { ID: 'list-1', EntityID: 'entity-1', Name: 'Source', Entity: 'Contacts' },
    SelectedKeys: ['ID|r1', 'ID|r2'],
    ExistingListDetailIds: new Set<string>(),
    userViewsToAddIds: new Set<string>(),
    RefreshGrid: vi.fn(),
    bumpStatsRefresh: vi.fn(),
    ...state,
  });
  Object.defineProperty(component, 'ProviderToUse', { get: () => provider, configurable: true });
  return { component, executeGQL, runView, getEntityObject, createTransactionGroup };
}

function expectNoDetailObjects(h: Harness): void {
  expect(h.getEntityObject).not.toHaveBeenCalled();
  expect(h.createTransactionGroup).not.toHaveBeenCalled();
}

describe('SingleListDetailComponent bulk member actions', () => {
  it('ApplyBulkStatus sets the status of the selected members in one server call', async () => {
    const h = createComponent({ BulkStatus: 'Complete' });
    await h.component.ApplyBulkStatus();
    expect(h.executeGQL).toHaveBeenCalledTimes(1);
    expect(h.executeGQL.mock.calls[0][1]).toEqual({ listId: 'list-1', recordIds: ['r1', 'r2'], status: 'Complete' });
    expectNoDetailObjects(h);
  });

  it('a copy sends the selected records to the target list in one server call', async () => {
    const h = createComponent({ MoveCopyMode: 'copy', MoveCopySelectedTarget: { ID: 'list-2', Name: 'Target' } });
    await h.component.ConfirmMoveCopy();
    expect(h.executeGQL).toHaveBeenCalledTimes(1);
    expect(h.executeGQL.mock.calls[0][1]).toEqual({ sourceListId: 'list-1', targetListId: 'list-2', recordIds: ['r1', 'r2'], removeFromSource: false });
    expectNoDetailObjects(h);
  });

  it('a move sends the selected records to the target list and removes them from the source in one server call', async () => {
    const h = createComponent({ MoveCopyMode: 'move', MoveCopySelectedTarget: { ID: 'list-2', Name: 'Target' } });
    await h.component.OnMoveConfirmCommit('client-move-delta');
    expect(h.executeGQL).toHaveBeenCalledTimes(1);
    expect(h.executeGQL.mock.calls[0][1]).toEqual({ sourceListId: 'list-1', targetListId: 'list-2', recordIds: ['r1', 'r2'], removeFromSource: true });
    expectNoDetailObjects(h);
  });

  it('ConfirmRemoveFromList removes the selected records in one server call', async () => {
    const h = createComponent();
    await h.component.ConfirmRemoveFromList();
    expect(h.executeGQL).toHaveBeenCalledTimes(1);
    expect(h.executeGQL.mock.calls[0][1]).toEqual({ listId: 'list-1', recordIds: ['r1', 'r2'] });
    expectNoDetailObjects(h);
  });

  it('ConfirmAddRecords adds the picked records in one server call', async () => {
    const h = createComponent({
      AddableRecords: [
        { ID: 'r3', Name: 'Three', isInList: false, isSelected: true },
        { ID: 'r4', Name: 'Four', isInList: false, isSelected: true },
      ],
    });
    await h.component.ConfirmAddRecords();
    expect(h.executeGQL).toHaveBeenCalledTimes(1);
    expect(h.executeGQL.mock.calls[0][1]).toEqual({ listId: 'list-1', recordIds: ['r3', 'r4'] });
    expectNoDetailObjects(h);
  });

  it('ConfirmAddFromView adds each selected view on the server, one call per view', async () => {
    const h = createComponent({ UserViewsToAdd: [{ ID: 'view-1' }, { ID: 'view-2' }] });
    await h.component.ConfirmAddFromView();
    expect(h.executeGQL.mock.calls.map((c) => c[1])).toEqual([
      { viewId: 'view-1', listId: 'list-1' },
      { viewId: 'view-2', listId: 'list-1' },
    ]);
    expectNoDetailObjects(h);
  });
});
