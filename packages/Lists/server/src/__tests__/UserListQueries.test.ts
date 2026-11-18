/**
 * UserListQueries saves conversation SQL as a Pending query in the user's own subcategory of
 * "User Lists", creating that subcategory on first use. `@memberjunction/core` is stubbed.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRunView = vi.fn();
const mockGetEntityObject = vi.fn();
/** Entities the user may create records in. */
const creatable = new Set<string>();

vi.mock('@memberjunction/core', () => {
  class RunView {
    static FromMetadataProvider() {
      return new RunView();
    }
    RunView(params: unknown) {
      return mockRunView(params);
    }
  }
  class Metadata {
    GetEntityObject(entityName: string) {
      return mockGetEntityObject(entityName);
    }
    EntityByName(entityName: string) {
      return { GetUserPermisions: () => ({ CanCreate: creatable.has(entityName) }) };
    }
  }
  return { RunView, Metadata, LogError: () => {} };
});

import { USER_LISTS_QUERY_CATEGORY_ID, UserListQueries } from '../UserListQueries';

const USER = { ID: 'user-1', Name: 'Erin Jones', Email: 'erin@x', UserRoles: [] };

interface FakeRecord {
  ID: string;
  LatestResult: { CompleteMessage: string };
  NewRecord: ReturnType<typeof vi.fn>;
  Load: ReturnType<typeof vi.fn>;
  Save: ReturnType<typeof vi.fn>;
  [field: string]: unknown;
}

function fakeRecord(id: string, overrides: Partial<FakeRecord> = {}): FakeRecord {
  return {
    ID: id,
    LatestResult: { CompleteMessage: '' },
    NewRecord: vi.fn(),
    Load: vi.fn().mockResolvedValue(true),
    Save: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

/** The user's existing categories under User Lists, and the names already used in theirs. */
function wireViews(userCategories: Array<{ ID: string }>, takenNames: string[] = []) {
  mockRunView.mockImplementation(async (params: { EntityName: string }) => {
    if (params.EntityName === 'MJ: Query Categories') return { Success: true, Results: userCategories };
    if (params.EntityName === 'MJ: Queries') return { Success: true, Results: takenNames.map((Name) => ({ Name })) };
    throw new Error(`unexpected view ${params.EntityName}`);
  });
}

function wireEntities(query: FakeRecord, categories: FakeRecord[] = []) {
  const queue = [...categories];
  mockGetEntityObject.mockImplementation((name: string) => {
    if (name === 'MJ: Queries') return query;
    if (name === 'MJ: Query Categories') return queue.shift();
    throw new Error(`unexpected entity ${name}`);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  creatable.clear();
  creatable.add('MJ: Queries').add('MJ: Query Categories');
});

describe('UserListQueries.SaveAsync', () => {
  it('saves the SQL as a Pending query in the user\'s existing User Lists category', async () => {
    const query = fakeRecord('q-new');
    wireViews([{ ID: 'cat-erin' }]);
    wireEntities(query);

    const result = await new UserListQueries(USER as never).SaveAsync({ Name: 'Active members', SQL: 'SELECT 1', Description: 'For a list' });

    expect(result).toEqual({ Saved: true, QueryID: 'q-new', QueryName: 'Active members' });
    expect(query).toMatchObject({ Name: 'Active members', SQL: 'SELECT 1', Status: 'Pending', CategoryID: 'cat-erin', Description: 'For a list' });
    const lookup = mockRunView.mock.calls[0][0] as { ExtraFilter: string; BypassCache: boolean };
    expect(lookup.ExtraFilter).toBe(`ParentID='${USER_LISTS_QUERY_CATEGORY_ID}' AND UserID='user-1'`);
    expect(lookup.BypassCache).toBe(true);
  });

  it('creates the user\'s category under User Lists on first use, owned by the user', async () => {
    const root = fakeRecord(USER_LISTS_QUERY_CATEGORY_ID);
    const created = fakeRecord('cat-new');
    const query = fakeRecord('q-new');
    wireViews([]);
    wireEntities(query, [root, created]);

    const result = await new UserListQueries(USER as never).SaveAsync({ Name: 'Members', SQL: 'SELECT 1' });

    expect(result.Saved).toBe(true);
    expect(root.Load).toHaveBeenCalledWith(USER_LISTS_QUERY_CATEGORY_ID);
    expect(created).toMatchObject({ Name: 'Erin Jones', ParentID: USER_LISTS_QUERY_CATEGORY_ID, UserID: 'user-1' });
    expect(query.CategoryID).toBe('cat-new');
  });

  it('picks a name not yet used in the category', async () => {
    const query = fakeRecord('q-new');
    wireViews([{ ID: 'cat-erin' }], ['Members', 'members (2)']);
    wireEntities(query);

    const result = await new UserListQueries(USER as never).SaveAsync({ Name: ' Members ', SQL: 'SELECT 1' });

    expect(result).toMatchObject({ Saved: true, QueryName: 'Members (3)' });
  });

  it('reports a missing User Lists category instead of creating one', async () => {
    const root = fakeRecord(USER_LISTS_QUERY_CATEGORY_ID, { Load: vi.fn().mockResolvedValue(false) });
    const query = fakeRecord('q-new');
    wireViews([]);
    wireEntities(query, [root]);

    const result = await new UserListQueries(USER as never).SaveAsync({ Name: 'Members', SQL: 'SELECT 1' });

    expect(result).toEqual({ Saved: false, Reason: expect.stringMatching(/"User Lists" query category is missing/) });
    expect(query.Save).not.toHaveBeenCalled();
  });

  it('reports a category the user may not create', async () => {
    const root = fakeRecord(USER_LISTS_QUERY_CATEGORY_ID);
    const created = fakeRecord('cat-new', { Save: vi.fn().mockResolvedValue(false), LatestResult: { CompleteMessage: 'no Create permission' } });
    const query = fakeRecord('q-new');
    wireViews([]);
    wireEntities(query, [root, created]);

    const result = await new UserListQueries(USER as never).SaveAsync({ Name: 'Members', SQL: 'SELECT 1' });

    expect(result).toEqual({ Saved: false, Reason: expect.stringMatching(/could not be created: no Create permission/) });
    expect(query.Save).not.toHaveBeenCalled();
  });

  it('says plainly when the user may not save queries, before touching anything', async () => {
    creatable.delete('MJ: Queries');

    const result = await new UserListQueries(USER as never).SaveAsync({ Name: 'Members', SQL: 'SELECT 1' });

    expect(result).toEqual({ Saved: false, Reason: "You don't have permission to save queries." });
    expect(mockRunView).not.toHaveBeenCalled();
    expect(mockGetEntityObject).not.toHaveBeenCalled();
  });

  it('says plainly when the user may not create their User Lists folder', async () => {
    creatable.delete('MJ: Query Categories');
    const query = fakeRecord('q-new');
    wireViews([]);
    wireEntities(query);

    const result = await new UserListQueries(USER as never).SaveAsync({ Name: 'Members', SQL: 'SELECT 1' });

    expect(result).toEqual({ Saved: false, Reason: expect.stringMatching(/^You don't have permission to create your folder in User Lists/) });
    expect(query.Save).not.toHaveBeenCalled();
  });

  it('uses an existing folder even when the user may not create one', async () => {
    creatable.delete('MJ: Query Categories');
    const query = fakeRecord('q-new');
    wireViews([{ ID: 'cat-erin' }]);
    wireEntities(query);

    const result = await new UserListQueries(USER as never).SaveAsync({ Name: 'Members', SQL: 'SELECT 1' });

    expect(result).toMatchObject({ Saved: true, QueryID: 'q-new' });
  });

  it('reports a query the user may not save', async () => {
    const query = fakeRecord('q-new', { Save: vi.fn().mockResolvedValue(false), LatestResult: { CompleteMessage: 'no Create permission on Queries' } });
    wireViews([{ ID: 'cat-erin' }]);
    wireEntities(query);

    const result = await new UserListQueries(USER as never).SaveAsync({ Name: 'Members', SQL: 'SELECT 1' });

    expect(result).toEqual({ Saved: false, Reason: 'The query could not be saved: no Create permission on Queries' });
  });
});
