import { describe, it, expect, vi, beforeEach } from 'vitest';

const addRecordsToList = vi.fn();
const removeRecordsFromList = vi.fn();
const runViewMock = vi.fn();

vi.mock('@memberjunction/core', () => ({
  Metadata: { Provider: {} },
  RunView: { FromMetadataProvider: () => ({ RunView: runViewMock }) },
}));
vi.mock('@memberjunction/core-entities', () => ({}));
vi.mock('@angular/core', () => ({ Injectable: () => (c: unknown) => c }));
vi.mock('@memberjunction/graphql-dataprovider', () => {
  class GraphQLDataProvider {}
  class GraphQLListsClient {
    AddRecordsToList = addRecordsToList;
    RemoveRecordsFromList = removeRecordsFromList;
  }
  return { GraphQLDataProvider, GraphQLListsClient };
});

import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import type { IMetadataProvider } from '@memberjunction/core';
import { ListManagementService } from '../lib/services/list-management.service';

interface FakeProvider {
  CurrentUser: { ID: string };
  GetEntityObject: ReturnType<typeof vi.fn>;
  CreateTransactionGroup: ReturnType<typeof vi.fn>;
}

function makeProvider(): FakeProvider {
  const provider = new GraphQLDataProvider() as unknown as FakeProvider;
  provider.CurrentUser = { ID: 'user-1' };
  provider.GetEntityObject = vi.fn(async () => ({ Save: async () => true, Delete: async () => true, LatestResult: null }));
  provider.CreateTransactionGroup = vi.fn(async () => ({ Submit: async () => true }));
  return provider;
}

function makeService(provider: FakeProvider): ListManagementService {
  const service = new ListManagementService();
  service.Provider = provider as unknown as IMetadataProvider;
  return service;
}

describe('ListManagementService bulk membership', () => {
  beforeEach(() => {
    addRecordsToList.mockReset();
    removeRecordsFromList.mockReset();
    runViewMock.mockReset();
    runViewMock.mockResolvedValue({ Success: true, Results: [] });
  });

  it('adds records with one server call per list and creates no List Detail objects', async () => {
    addRecordsToList.mockResolvedValue({ Success: true, ResultCode: 'SUCCESS', Message: '', Counts: { Added: 2, Removed: 0, Failed: 0 } });
    const provider = makeProvider();
    const result = await makeService(provider).AddRecordsToLists(['list-a', 'list-b'], ['r1', 'r2', 'r3']);

    expect(addRecordsToList).toHaveBeenCalledTimes(2);
    expect(addRecordsToList).toHaveBeenCalledWith('list-a', ['r1', 'r2', 'r3']);
    expect(addRecordsToList).toHaveBeenCalledWith('list-b', ['r1', 'r2', 'r3']);
    expect(provider.GetEntityObject).not.toHaveBeenCalled();
    expect(provider.CreateTransactionGroup).not.toHaveBeenCalled();
    expect(result).toEqual({ success: 4, failed: 0, skipped: 2, errors: [] });
  });

  it('removes records with one server call per list and deletes no List Detail objects', async () => {
    removeRecordsFromList.mockResolvedValue({ Success: true, ResultCode: 'SUCCESS', Message: '', Counts: { Added: 0, Removed: 2, Failed: 0 } });
    const provider = makeProvider();
    const result = await makeService(provider).RemoveRecordsFromLists(['list-a', 'list-b'], ['r1', 'r2']);

    expect(removeRecordsFromList).toHaveBeenCalledTimes(2);
    expect(removeRecordsFromList).toHaveBeenCalledWith('list-a', ['r1', 'r2']);
    expect(removeRecordsFromList).toHaveBeenCalledWith('list-b', ['r1', 'r2']);
    expect(runViewMock).not.toHaveBeenCalled();
    expect(provider.CreateTransactionGroup).not.toHaveBeenCalled();
    expect(result).toEqual({ success: 4, failed: 0, skipped: 0, errors: [] });
  });
});
