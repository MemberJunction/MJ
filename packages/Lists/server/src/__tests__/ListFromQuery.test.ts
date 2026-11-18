/**
 * ListFromQuery: a saved query is linked directly; caller SQL is probed for its key column, saved
 * Pending in the user's User Lists, then linked; a save the user can't make falls back to a list
 * that doesn't refresh. `ListOperations`, `UserListQueries` and `@memberjunction/core` are stubbed.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  materialize: vi.fn(),
  createFromRecords: vi.fn(),
  saveQuery: vi.fn(),
  runView: vi.fn(),
}));

const PERSONS = { ID: 'entity-persons', Name: 'Persons', PrimaryKeys: [{ Name: 'ID' }], FirstPrimaryKey: { Name: 'ID' } };
const ORDER_LINES = { ID: 'entity-lines', Name: 'Order Lines', PrimaryKeys: [{ Name: 'OrderID' }, { Name: 'LineNo' }] };

vi.mock('@memberjunction/core', () => {
  class Metadata {
    EntityByName(name: string) {
      return [PERSONS, ORDER_LINES].find((e) => e.Name.toLowerCase() === name.toLowerCase());
    }
  }
  class RunView {
    RunView(params: unknown) {
      return h.runView(params);
    }
  }
  return { Metadata, RunView };
});
vi.mock('../ListOperations', () => ({
  ListOperations: class {
    MaterializeFromQuery = h.materialize;
    CreateListFromRecords = h.createFromRecords;
  },
}));
vi.mock('../UserListQueries', () => ({
  UserListQueries: class {
    SaveAsync = h.saveQuery;
  },
}));

import { type CheckedCallerSQL, ListFromQuery, type ListFromQueryRequest, MAX_STATIC_LIST_RECORDS } from '../ListFromQuery';

const USER = { ID: 'user-1', Name: 'Erin' };
const SQL = 'SELECT p.ID, p.Email FROM dbo.vwPersons p';
const CREATED = { Success: true, ResultCode: 'SUCCESS', Message: 'Materialized list with 2 member(s)', CreatedListId: 'list-1', Counts: { Added: 2, Removed: 0, Failed: 0 } };

function request(overrides: Partial<ListFromQueryRequest> = {}): ListFromQueryRequest {
  return { ListName: 'Active members', RefreshMode: 'Additive', AutoRefresh: false, ...overrides };
}

/** Caller SQL whose probe returns `probeRows` and whose full run returns `allRows`. */
function callerSQL(probeRows: Record<string, unknown>[], allRows: Record<string, unknown>[] = probeRows, hidden: string[] = []): CheckedCallerSQL & { Run: ReturnType<typeof vi.fn> } {
  return {
    SQL,
    Run: vi.fn(async (maxRows: number) => ({ Success: true, Results: maxRows === 1 ? probeRows : allRows })),
    IsColumnHidden: (column: string) => hidden.includes(column),
  };
}

const service = () => new ListFromQuery(USER as never);

beforeEach(() => {
  vi.clearAllMocks();
  h.materialize.mockResolvedValue(CREATED);
  h.createFromRecords.mockResolvedValue(CREATED);
  h.saveQuery.mockResolvedValue({ Saved: true, QueryID: 'q-new', QueryName: 'Active members' });
  h.runView.mockResolvedValue({ Success: true, Results: [{ ID: 'q-1', Name: 'Conference attendees' }] });
});

describe('ListFromQuery.FromSavedQueryAsync', () => {
  it('links the new list to the query, with its parameters and refresh settings', async () => {
    const outcome = await service().FromSavedQueryAsync(
      { ID: 'q-1' },
      request({ Parameters: { EventCode: 'CONF2026' }, RefreshMode: 'Sync', AutoRefresh: true, KeyField: 'ContactID' }),
    );

    expect(outcome).toMatchObject({ Kind: 'Created', SourceQueryID: 'q-1', SourceQueryName: 'Conference attendees', SavedNewQuery: false, StaticReason: null });
    expect(h.materialize).toHaveBeenCalledWith('q-1', expect.objectContaining({
      ListName: 'Active members', Parameters: { EventCode: 'CONF2026' }, RefreshMode: 'Sync', AutoRefresh: true, KeyField: 'ContactID',
    }));
    expect(h.saveQuery).not.toHaveBeenCalled();
  });

  it('finds a query by name, and asks for its ID when several share the name', async () => {
    expect((await service().FromSavedQueryAsync({ Name: 'Conference attendees' }, request())).Kind).toBe('Created');

    h.runView.mockResolvedValue({ Success: true, Results: [{ ID: 'q-1', Name: 'Members' }, { ID: 'q-2', Name: 'Members' }] });
    expect(await service().FromSavedQueryAsync({ Name: 'Members' }, request())).toMatchObject({ Kind: 'Refused', Code: 'AMBIGUOUS_QUERY' });

    h.runView.mockResolvedValue({ Success: true, Results: [] });
    expect(await service().FromSavedQueryAsync({ ID: 'q-9' }, request())).toMatchObject({ Kind: 'Refused', Code: 'QUERY_NOT_FOUND' });
  });
});

describe('ListFromQuery.FromSQLAsync', () => {
  it('probes the SQL, saves it Pending, then links the list to the saved query', async () => {
    const sql = callerSQL([{ id: 'p1', Email: 'a@x' }]);

    const outcome = await service().FromSQLAsync(sql, request({ EntityName: 'persons', AutoRefresh: true }));

    expect(outcome).toMatchObject({ Kind: 'Created', SourceQueryID: 'q-new', SourceQueryName: 'Active members', SavedNewQuery: true, StaticReason: null });
    expect(sql.Run).toHaveBeenCalledTimes(1);
    expect(sql.Run).toHaveBeenCalledWith(1);
    expect(h.saveQuery).toHaveBeenCalledWith(expect.objectContaining({ Name: 'Active members', SQL }));
    expect(h.materialize).toHaveBeenCalledWith('q-new', expect.objectContaining({ EntityName: 'Persons', KeyField: 'id', AutoRefresh: true }));
  });

  it('uses the key column asked for, and assumes it when the SQL returns no rows', async () => {
    await service().FromSQLAsync(callerSQL([{ PersonID: 'p1' }]), request({ EntityName: 'Persons', KeyField: 'personid' }));
    expect(h.materialize).toHaveBeenLastCalledWith('q-new', expect.objectContaining({ KeyField: 'PersonID' }));

    await service().FromSQLAsync(callerSQL([]), request({ EntityName: 'Persons' }));
    expect(h.materialize).toHaveBeenLastCalledWith('q-new', expect.objectContaining({ KeyField: 'ID' }));
  });

  it('needs an entity, a known one with a single-column key, and no Parameters', async () => {
    const sql = callerSQL([{ ID: 'p1' }]);
    expect(await service().FromSQLAsync(sql, request())).toMatchObject({ Code: 'MISSING_PARAMETER' });
    expect(await service().FromSQLAsync(sql, request({ EntityName: 'Nope' }))).toMatchObject({ Code: 'INVALID_PARAMETER' });
    expect(await service().FromSQLAsync(sql, request({ EntityName: 'Order Lines' }))).toMatchObject({ Code: 'INVALID_PARAMETER' });
    expect(await service().FromSQLAsync(sql, request({ EntityName: 'Persons', Parameters: { A: 1 } }))).toMatchObject({ Code: 'INVALID_PARAMETER' });
    expect(sql.Run).not.toHaveBeenCalled();
  });

  it('saves nothing when the SQL fails, returns no key column, or the key column is hidden', async () => {
    const failing: CheckedCallerSQL = { SQL, Run: async () => ({ Success: false, Results: [], ErrorMessage: 'Invalid object name' }) };
    expect(await service().FromSQLAsync(failing, request({ EntityName: 'Persons' }))).toEqual({ Kind: 'Refused', Code: 'QUERY_FAILED', Message: 'Invalid object name' });

    const noKey = await service().FromSQLAsync(callerSQL([{ Email: 'a@x' }]), request({ EntityName: 'Persons' }));
    expect(noKey).toMatchObject({ Code: 'INVALID_PARAMETER', Message: expect.stringMatching(/no column named 'ID'/) });

    const hidden = await service().FromSQLAsync(callerSQL([{ ID: 'p1' }], [], ['ID']), request({ EntityName: 'Persons' }));
    expect(hidden).toMatchObject({ Code: 'PERMISSION_DENIED' });

    expect(h.saveQuery).not.toHaveBeenCalled();
  });

  it("still makes the list when the query can't be saved, and says why it won't refresh", async () => {
    h.saveQuery.mockResolvedValue({ Saved: false, Reason: 'You do not have permission to create Queries' });
    const sql = callerSQL([{ ID: 'p1' }], [{ ID: 'p1' }, { ID: 'p2' }, { ID: null }, { ID: '' }]);

    const outcome = await service().FromSQLAsync(sql, request({ EntityName: 'Persons' }));

    expect(outcome).toMatchObject({ Kind: 'Created', SourceQueryID: null, SavedNewQuery: false, StaticReason: 'You do not have permission to create Queries' });
    expect(sql.Run).toHaveBeenLastCalledWith(MAX_STATIC_LIST_RECORDS + 1);
    expect(h.createFromRecords).toHaveBeenCalledWith('Persons', ['p1', 'p2'], expect.objectContaining({ ListName: 'Active members' }));
    expect(h.materialize).not.toHaveBeenCalled();
  });

  it('refuses a list that would not refresh when the SQL returns too many rows', async () => {
    h.saveQuery.mockResolvedValue({ Saved: false, Reason: 'no permission' });
    const many = Array.from({ length: MAX_STATIC_LIST_RECORDS + 1 }, (_, i) => ({ ID: `p${i}` }));

    const outcome = await service().FromSQLAsync(callerSQL([{ ID: 'p0' }], many), request({ EntityName: 'Persons' }));

    expect(outcome).toMatchObject({ Kind: 'Refused', Code: 'TOO_MANY_RECORDS' });
    expect(h.createFromRecords).not.toHaveBeenCalled();
  });
});
