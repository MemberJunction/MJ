/**
 * The CreateListFromQuery mutation's checks on caller SQL, the only thing between a GraphQL caller
 * and a saved query: each refusal must leave `ListFromQuery.FromSQLAsync` uncalled. The ad-hoc SQL
 * authorizer and the scope-limited test are stubbed; the provider helpers are the real ones.
 */
import 'reflect-metadata';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DatabaseProviderBase, UserInfo } from '@memberjunction/core';
import { ListFromQuery, type ListFromQueryOutcome } from '@memberjunction/lists';

import type { AppContext } from '../types.js';

const h = vi.hoisted(() => ({
  authorizer: null as { Authorize: ReturnType<typeof vi.fn>; ClampTimeoutSeconds: ReturnType<typeof vi.fn> } | null,
  scopeLimited: false,
}));

vi.mock('@memberjunction/actions', () => ({
  ActionEngineServer: {
    Instance: {
      get AdhocSQLAuthorizer() {
        return h.authorizer;
      },
    },
  },
}));

vi.mock('../auth/scopeLimitedPrincipal.js', () => ({
  IsScopeLimitedPrincipal: () => h.scopeLimited,
}));

import { CreateListFromQueryInput, ListOperationsResolver } from '../resolvers/ListOperationsResolver.js';

const USER = { ID: 'user-1', Email: 'reader@example.com', Name: 'Reader' } as UserInfo;
const SQL = 'SELECT ID FROM crm.vwContacts';
const CREATED: ListFromQueryOutcome = {
  Kind: 'Created',
  Result: { Success: true, ResultCode: 'SUCCESS', Message: 'ok', CreatedListId: 'list-1', Counts: { Added: 1, Removed: 0, Failed: 0 } },
  SourceQueryID: 'q-1',
  SourceQueryName: 'Active contacts',
  SavedNewQuery: true,
  StaticReason: null,
};

const readWrite = { name: 'read-write' } as unknown as DatabaseProviderBase;
const readOnly = { name: 'read-only', RunQuery: vi.fn() } as unknown as DatabaseProviderBase;

function context(providers: Array<{ type: string; provider: DatabaseProviderBase }>): AppContext {
  return { providers, userPayload: { email: USER.Email, userRecord: USER } } as unknown as AppContext;
}

const BOTH_PROVIDERS = [
  { type: 'Read-Write', provider: readWrite },
  { type: 'Read-Only', provider: readOnly },
];

function input(overrides: Partial<CreateListFromQueryInput> = {}): CreateListFromQueryInput {
  return Object.assign(new CreateListFromQueryInput(), {
    ListName: 'Active contacts',
    EntityName: 'Contacts',
    RefreshMode: 'Additive',
    AutoRefresh: false,
    SQL,
    ...overrides,
  });
}

describe('CreateListFromQuery — checks on caller SQL', () => {
  let fromSQL: ReturnType<typeof vi.spyOn>;
  let fromSaved: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    h.scopeLimited = false;
    h.authorizer = { Authorize: vi.fn().mockReturnValue(null), ClampTimeoutSeconds: vi.fn().mockReturnValue(30) };
    fromSQL = vi.spyOn(ListFromQuery.prototype, 'FromSQLAsync').mockResolvedValue(CREATED);
    fromSaved = vi.spyOn(ListFromQuery.prototype, 'FromSavedQueryAsync').mockResolvedValue(CREATED);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('refuses a scope-limited session before checking anything else', async () => {
    h.scopeLimited = true;

    const result = await new ListOperationsResolver().CreateListFromQuery(input(), context(BOTH_PROVIDERS));

    expect(result).toMatchObject({ Success: false, ResultCode: 'PERMISSION_DENIED', Message: expect.stringMatching(/scope-limited/) });
    expect(h.authorizer!.Authorize).not.toHaveBeenCalled();
    expect(fromSQL).not.toHaveBeenCalled();
  });

  it('refuses when there is no read-only login, rather than running the SQL on the read-write one', async () => {
    const result = await new ListOperationsResolver().CreateListFromQuery(input(), context([{ type: 'Read-Write', provider: readWrite }]));

    expect(result).toMatchObject({ Success: false, ResultCode: 'PERMISSION_DENIED', Message: expect.stringMatching(/No read-only data source/) });
    expect(fromSQL).not.toHaveBeenCalled();
  });

  it('refuses when no ad-hoc SQL authorizer is registered', async () => {
    h.authorizer = null;

    const result = await new ListOperationsResolver().CreateListFromQuery(input(), context(BOTH_PROVIDERS));

    expect(result).toMatchObject({ Success: false, ResultCode: 'PERMISSION_DENIED', Message: expect.stringMatching(/no ad-hoc SQL authorizer/) });
    expect(fromSQL).not.toHaveBeenCalled();
  });

  it("refuses SQL the authorizer rejects, with the authorizer's reason", async () => {
    h.authorizer!.Authorize.mockReturnValue('reads __mj.User, which is not an entity view');

    const result = await new ListOperationsResolver().CreateListFromQuery(input(), context(BOTH_PROVIDERS));

    expect(h.authorizer!.Authorize).toHaveBeenCalledWith(SQL, readOnly, USER);
    expect(result).toMatchObject({ Success: false, ResultCode: 'PERMISSION_DENIED', Message: 'Not permitted to run this query: reads __mj.User, which is not an entity view' });
    expect(fromSQL).not.toHaveBeenCalled();
  });

  it('refuses QueryID and SQL together, and neither', async () => {
    const both = await new ListOperationsResolver().CreateListFromQuery(input({ QueryID: 'q-1' }), context(BOTH_PROVIDERS));
    const neither = await new ListOperationsResolver().CreateListFromQuery(input({ SQL: undefined }), context(BOTH_PROVIDERS));

    for (const result of [both, neither]) {
      expect(result).toMatchObject({ Success: false, ResultCode: 'MISSING_PARAMETER', Message: 'Pass QueryID or SQL, not both.' });
    }
    expect(fromSQL).not.toHaveBeenCalled();
    expect(fromSaved).not.toHaveBeenCalled();
  });

  it('passes SQL the authorizer accepts to ListFromQuery, run on the read-only login with the clamped timeout', async () => {
    const result = await new ListOperationsResolver().CreateListFromQuery(input(), context(BOTH_PROVIDERS));

    expect(result).toMatchObject({ Success: true, CreatedListId: 'list-1', Refreshes: true });
    expect(fromSQL).toHaveBeenCalledTimes(1);
    const [checked] = fromSQL.mock.calls[0] as [{ SQL: string; Run(maxRows: number): Promise<unknown> }];
    expect(checked.SQL).toBe(SQL);
    vi.mocked(readOnly.RunQuery).mockResolvedValue({ Success: true, Results: [] } as never);
    await checked.Run(1);
    expect(readOnly.RunQuery).toHaveBeenCalledWith({ SQL, MaxRows: 1, TimeoutSeconds: 30 }, USER);
  });
});
