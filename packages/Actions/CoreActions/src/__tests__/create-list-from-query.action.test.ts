/**
 * Create List From Query: the action reads its inputs, applies the Run Ad-hoc Query checks to SQL and
 * the agent's data policy to a saved query, hands the work to `ListFromQuery`, and reports the
 * outcome. `ListFromQuery`'s own behaviour is tested in `@memberjunction/lists`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  fromSQL: vi.fn(),
  fromSavedQuery: vi.fn(),
  readOnlyRunQuery: vi.fn(),
  authorize: vi.fn(),
  evaluateAdhoc: vi.fn(),
  evaluateStored: vi.fn(),
  deniedPatterns: [] as string[],
}));

vi.mock('@memberjunction/actions', () => ({
  BaseAction: class BaseAction {},
  ActionEngineServer: {
    Instance: {
      GetReadOnlyProvider: async () => ({ RunQuery: h.readOnlyRunQuery }),
      AdhocSQLAuthorizer: { Authorize: h.authorize, ClampTimeoutSeconds: () => 30 },
    },
  },
}));
vi.mock('@memberjunction/lists', () => ({
  ListFromQuery: class {
    FromSQLAsync = h.fromSQL;
    FromSavedQueryAsync = h.fromSavedQuery;
  },
}));
vi.mock('../custom/crud/agent-data-policy-guard', () => ({
  AgentDataPolicyGuard: {
    EvaluateAdhocQuery: h.evaluateAdhoc,
    EvaluateStoredQuery: h.evaluateStored,
    MaskRows: (rows: Record<string, unknown>[], patterns: string[]) =>
      rows.map((row) => Object.fromEntries(Object.entries(row).filter(([k]) => !patterns.includes(k)))),
  },
}));

import type { CheckedCallerSQL } from '@memberjunction/lists';
import { CreateListFromQueryAction } from '../custom/lists/create-list-from-query.action';

type Param = { Name: string; Type: 'Input' | 'Output'; Value: unknown };
type Result = { Success: boolean; ResultCode: string; Message: string };
type Runnable = { InternalRunAction(params: { ContextUser: unknown; Params: Param[] }): Promise<Result> };

const USER = { ID: 'user-1', Name: 'Erin' };
const SQL = 'SELECT p.ID FROM dbo.vwPersons p';
const RESULT = { Success: true, ResultCode: 'SUCCESS', Message: 'Materialized list with 2 member(s)', CreatedListId: 'list-1', Counts: { Added: 2, Removed: 0, Failed: 0 } };
const LINKED = { Kind: 'Created', Result: RESULT, SourceQueryID: 'q-1', SourceQueryName: 'Conference attendees', SavedNewQuery: false, StaticReason: null };

async function run(values: Record<string, unknown>): Promise<{ result: Result; params: Param[] }> {
  const params: Param[] = Object.entries(values).map(([Name, Value]) => ({ Name, Type: 'Input', Value }));
  const result = await (new CreateListFromQueryAction() as unknown as Runnable).InternalRunAction({ ContextUser: USER, Params: params });
  return { result, params };
}

function output(params: Param[], name: string): unknown {
  return params.find((p) => p.Type === 'Output' && p.Name === name)?.Value;
}

/** The caller SQL the action handed to `ListFromQuery.FromSQLAsync`. */
function handedSQL(): CheckedCallerSQL {
  return h.fromSQL.mock.calls[0][0] as CheckedCallerSQL;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.deniedPatterns = [];
  h.authorize.mockReturnValue(null);
  h.evaluateAdhoc.mockImplementation(async () => ({ Allowed: { Active: false, DeniedFieldPatterns: h.deniedPatterns } }));
  h.evaluateStored.mockImplementation(async () => ({ Allowed: { Active: false, DeniedFieldPatterns: h.deniedPatterns } }));
  h.fromSavedQuery.mockResolvedValue(LINKED);
  h.fromSQL.mockResolvedValue({ ...LINKED, SourceQueryID: 'q-new', SourceQueryName: 'Active members', SavedNewQuery: true });
  h.readOnlyRunQuery.mockResolvedValue({ Success: true, Results: [{ ID: 'p1' }] });
});

describe('Create List From Query — inputs', () => {
  it('needs a list name and exactly one of QueryID, QueryName and SQL', async () => {
    expect((await run({ QueryID: 'q-1' })).result.ResultCode).toBe('MISSING_PARAMETER');
    expect((await run({ ListName: 'L' })).result.ResultCode).toBe('MISSING_PARAMETER');
    expect((await run({ ListName: 'L', QueryID: 'q-1', SQL })).result.ResultCode).toBe('MISSING_PARAMETER');
  });

  it('refuses a RefreshMode other than Additive or Sync, and Parameters that are not an object', async () => {
    expect((await run({ ListName: 'L', QueryID: 'q-1', RefreshMode: 'Replace' })).result.ResultCode).toBe('INVALID_PARAMETER');
    expect((await run({ ListName: 'L', QueryID: 'q-1', Parameters: '[1,2]' })).result.ResultCode).toBe('INVALID_PARAMETER');
    expect((await run({ ListName: 'L', QueryID: 'q-1', Parameters: 'not json' })).result.ResultCode).toBe('INVALID_PARAMETER');
  });
});

describe('Create List From Query — saved query', () => {
  it('passes the request on, with Parameters as an object, and reports the linked query', async () => {
    const { result, params } = await run({
      ListName: 'Attendees', QueryID: 'q-1', Parameters: '{"EventCode":"CONF2026"}', RefreshMode: 'Sync', RefreshAutomatically: 'true',
    });

    expect(result.ResultCode).toBe('SUCCESS');
    expect(h.fromSavedQuery).toHaveBeenCalledWith({ ID: 'q-1', Name: undefined }, expect.objectContaining({
      ListName: 'Attendees', Parameters: { EventCode: 'CONF2026' }, RefreshMode: 'Sync', AutoRefresh: true,
    }));
    expect(h.evaluateStored).toHaveBeenCalledWith(expect.anything(), 'q-1', undefined, { EventCode: 'CONF2026' });
    expect(output(params, 'ListID')).toBe('list-1');
    expect(output(params, 'SourceQueryID')).toBe('q-1');
    expect(output(params, 'SourceQueryStatus')).toBeNull();
    expect(output(params, 'Refreshes')).toBe(true);
    expect(result.Message).toMatch(/refreshes from the query "Conference attendees"/);
  });

  it('defaults to Additive with Refresh automatically off', async () => {
    await run({ ListName: 'L', QueryName: 'Conference attendees' });

    expect(h.fromSavedQuery).toHaveBeenCalledWith({ ID: undefined, Name: 'Conference attendees' }, expect.objectContaining({ RefreshMode: 'Additive', AutoRefresh: false }));
    expect(h.evaluateStored).toHaveBeenCalledWith(expect.anything(), undefined, 'Conference attendees', undefined);
  });

  it('stops when the agent data policy refuses the query or hides the key column', async () => {
    h.evaluateStored.mockResolvedValueOnce({ Blocked: { Success: false, ResultCode: 'PERMISSION_DENIED', Message: 'blocked' } });
    expect((await run({ ListName: 'L', QueryID: 'q-1' })).result.ResultCode).toBe('PERMISSION_DENIED');

    h.deniedPatterns = ['ContactID'];
    expect((await run({ ListName: 'L', QueryID: 'q-1', KeyField: 'ContactID' })).result.ResultCode).toBe('PERMISSION_DENIED');
    expect(h.fromSavedQuery).not.toHaveBeenCalled();
  });

  it('passes a refusal through with its code', async () => {
    h.fromSavedQuery.mockResolvedValue({ Kind: 'Refused', Code: 'AMBIGUOUS_QUERY', Message: '2 queries are named Members' });

    const { result } = await run({ ListName: 'L', QueryName: 'Members' });

    expect(result).toEqual({ Success: false, ResultCode: 'AMBIGUOUS_QUERY', Message: '2 queries are named Members' });
  });
});

describe('Create List From Query — SQL from a conversation', () => {
  it('applies the ad-hoc checks, then hands over SQL that runs on the read-only login with the host timeout', async () => {
    const { result, params } = await run({ ListName: 'Active members', SQL, EntityName: 'Persons' });

    expect(result.ResultCode).toBe('SUCCESS');
    expect(h.authorize).toHaveBeenCalledWith(SQL, expect.anything(), USER);
    const sql = handedSQL();
    expect(sql.SQL).toBe(SQL);
    await sql.Run(1);
    expect(h.readOnlyRunQuery).toHaveBeenCalledWith({ SQL, MaxRows: 1, TimeoutSeconds: 30 }, USER);
    expect(h.fromSQL).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ ListName: 'Active members', EntityName: 'Persons' }));
    expect(output(params, 'SourceQueryStatus')).toBe('Pending');
    expect(result.Message).toMatch(/saved as the query "Active members" in your User Lists, Pending approval/);
  });

  it('hands over the columns the agent data policy hides', async () => {
    h.deniedPatterns = ['ID'];

    await run({ ListName: 'L', SQL, EntityName: 'Persons' });

    expect(handedSQL().IsColumnHidden?.('ID')).toBe(true);
    expect(handedSQL().IsColumnHidden?.('Email')).toBe(false);
  });

  it('hands nothing over when the host refuses the SQL', async () => {
    h.authorize.mockReturnValue('every table must be an entity view you can read in full');

    const { result } = await run({ ListName: 'L', SQL, EntityName: 'Persons' });

    expect(result.ResultCode).toBe('PERMISSION_DENIED');
    expect(h.fromSQL).not.toHaveBeenCalled();
  });

  it('classifies a failed run the way Run Ad-hoc Query does', async () => {
    h.fromSQL.mockResolvedValue({ Kind: 'Refused', Code: 'QUERY_FAILED', Message: 'Query timed out' });

    const { result } = await run({ ListName: 'L', SQL, EntityName: 'Persons' });

    expect(result.ResultCode).toBe('QUERY_TIMEOUT');
  });

  it("says the list won't refresh when the SQL could not be saved", async () => {
    h.fromSQL.mockResolvedValue({ ...LINKED, SourceQueryID: null, SourceQueryName: null, StaticReason: 'You do not have permission to create Queries' });

    const { result, params } = await run({ ListName: 'L', SQL, EntityName: 'Persons' });

    expect(result.ResultCode).toBe('SUCCESS');
    expect(output(params, 'Refreshes')).toBe(false);
    expect(output(params, 'SourceQueryID')).toBeNull();
    expect(result.Message).toMatch(/won't refresh.*permission to create Queries/);
  });
});
