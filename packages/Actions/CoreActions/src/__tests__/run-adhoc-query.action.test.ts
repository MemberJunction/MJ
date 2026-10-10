/**
 * Run Ad-hoc Query runs SQL the caller wrote, so it must pass the same gates as the
 * ExecuteAdhocQuery resolver:
 * - a scope-limited session (magic-link guest, widget guest, resource-scoped link) is refused,
 *   because raw SQL never applies the row-level filters that confine it;
 * - the SQL runs only on the read-only database login, never on the read-write pool, and is
 *   refused when no read-only login is configured;
 * - it runs through the provider's ad-hoc read path, which accepts one read statement only;
 * - the host's ad-hoc SQL authorizer (MJServer registers ExecuteAdhocQuery's table check) must
 *   accept the SQL, and the host's timeout limit applies.
 *
 * `BaseEntity.Provider` is the global read-write provider; it is replaced with a stand-in that records
 * calls, so a run that falls back to it is caught.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseEntity, type MagicLinkScope, type RunQueryParams, type RunQueryResult } from '@memberjunction/core';

const h = vi.hoisted(() => {
    const readOnlyRunQuery = vi.fn();
    return {
        readWriteExecuteSQL: vi.fn(),
        readOnlyRunQuery,
        readOnlyProvider: { RunQuery: readOnlyRunQuery },
        hasReadOnlyProvider: true,
        authorize: vi.fn(),
        clampTimeoutSeconds: vi.fn(),
        hasAuthorizer: true,
    };
});

vi.mock('@memberjunction/actions', () => ({
    BaseAction: class BaseAction {},
    ActionEngineServer: {
        Instance: {
            GetReadOnlyProvider: async () => (h.hasReadOnlyProvider ? h.readOnlyProvider : null),
            get AdhocSQLAuthorizer() {
                return h.hasAuthorizer ? { Authorize: h.authorize, ClampTimeoutSeconds: h.clampTimeoutSeconds } : null;
            },
        },
    },
}));
vi.mock('@memberjunction/ai-core-plus', () => ({ AIPromptParams: class AIPromptParams {} }));
vi.mock('@memberjunction/aiengine', () => ({ AIEngine: { Instance: { Config: vi.fn(), Prompts: [] } } }));
vi.mock('@memberjunction/ai-prompts', () => ({ AIPromptRunner: class AIPromptRunner {} }));

import { RunAdhocQueryAction } from '../custom/data/run-adhoc-query.action';

type Caller = { ID: string; IsMagicLinkAnonymous?: boolean; MagicLinkScope?: MagicLinkScope };
type Param = { Name: string; Type: 'Input'; Value: unknown };
type Result = { Success: boolean; ResultCode: string; Message?: string; RowCount?: number; WasTruncated?: boolean };
type Runnable = { InternalRunAction(params: { ContextUser: Caller; Params: Param[] }): Promise<Result> };

const USER: Caller = { ID: 'user-1' };
const SQL = 'SELECT Month, Total FROM Sales';
const ROWS = [{ Month: 'Jan', Total: 1 }, { Month: 'Feb', Total: 2 }];

function queryResult(over: Partial<RunQueryResult>): RunQueryResult {
    return {
        QueryID: '', QueryName: 'Ad-Hoc Query', Success: true, Results: ROWS, RowCount: ROWS.length,
        TotalRowCount: ROWS.length, ExecutionTime: 3, ErrorMessage: '', ...over,
    };
}

function run(caller: Caller, extra: Param[] = []): Promise<Result> {
    const action = new RunAdhocQueryAction() as unknown as Runnable;
    return action.InternalRunAction({ ContextUser: caller, Params: [{ Name: 'Query', Type: 'Input', Value: SQL }, ...extra] });
}

/** The parameters the read-only provider was asked to run. */
function sentQuery(): RunQueryParams {
    expect(h.readOnlyRunQuery).toHaveBeenCalledTimes(1);
    return h.readOnlyRunQuery.mock.calls[0][0];
}

beforeEach(() => {
    vi.spyOn(BaseEntity, 'Provider', 'get').mockReturnValue(
        { PlatformKey: 'sqlserver', ExecuteSQL: h.readWriteExecuteSQL } as unknown as ReturnType<typeof BaseEntity.Provider>
    );
    h.hasReadOnlyProvider = true;
    h.hasAuthorizer = true;
    h.readWriteExecuteSQL.mockReset().mockResolvedValue(ROWS);
    h.readOnlyRunQuery.mockReset().mockResolvedValue(queryResult({}));
    h.authorize.mockReset().mockReturnValue(null);
    // The host's limit: what was asked for, else 30 seconds, never more than 60.
    h.clampTimeoutSeconds.mockReset().mockImplementation((requested?: number) => Math.min(requested && requested > 0 ? requested : 30, 60));
});

describe('Run Ad-hoc Query: who may run it', () => {
    it.each([
        ['an anonymous magic-link or widget guest', { ID: 'guest', IsMagicLinkAnonymous: true }],
        ['a resource-scoped magic-link session', { ID: 'scoped', MagicLinkScope: { ResourceID: 'dashboard-1', ResourceType: 'Dashboards' } }],
    ])('refuses %s without touching a data source', async (_label, caller) => {
        const result = await run(caller);

        expect(result.Success).toBe(false);
        expect(result.ResultCode).toBe('PERMISSION_DENIED');
        expect(h.readOnlyRunQuery).not.toHaveBeenCalled();
        expect(h.readWriteExecuteSQL).not.toHaveBeenCalled();
    });

    it('runs for a session whose scope object carries no confinement', async () => {
        const result = await run({ ID: 'user-2', MagicLinkScope: {} });

        expect(result.Success).toBe(true);
    });
});

describe('Run Ad-hoc Query: where it runs', () => {
    it('refuses to run when no read-only data source is configured, instead of using the read-write pool', async () => {
        h.hasReadOnlyProvider = false;

        const result = await run(USER);

        expect(result.Success).toBe(false);
        expect(result.ResultCode).toBe('PERMISSION_DENIED');
        expect(result.Message).toMatch(/read-only/i);
        expect(h.readWriteExecuteSQL).not.toHaveBeenCalled();
    });

    it('runs the SQL on the read-only provider through its ad-hoc read path', async () => {
        const result = await run(USER);

        expect(result.Success).toBe(true);
        expect(result.RowCount).toBe(2);
        expect(h.readOnlyRunQuery).toHaveBeenCalledTimes(1);
        expect(sentQuery()).toEqual({ SQL, MaxRows: 1000, TimeoutSeconds: 30 });
        expect(h.readOnlyRunQuery.mock.calls[0][1]).toBe(USER);
        expect(h.readWriteExecuteSQL).not.toHaveBeenCalled();
    });

    it('passes the row limit and timeout to the database', async () => {
        await run(USER, [{ Name: 'MaxRows', Type: 'Input', Value: 25 }, { Name: 'Timeout', Type: 'Input', Value: 5 }]);

        expect(sentQuery()).toEqual({ SQL, MaxRows: 25, TimeoutSeconds: 5 });
    });

    it('never asks for an unbounded result', async () => {
        await run(USER, [{ Name: 'MaxRows', Type: 'Input', Value: 0 }]);

        expect(sentQuery().MaxRows).toBe(1000);
    });

    it('marks the result truncated when the query matched more rows than it returned', async () => {
        h.readOnlyRunQuery.mockResolvedValue(queryResult({ TotalRowCount: 50 }));

        const result = await run(USER);

        expect(result.WasTruncated).toBe(true);
    });
});

describe('Run Ad-hoc Query: the host\'s ad-hoc SQL checks', () => {
    it('refuses when the host registered no SQL authorizer', async () => {
        h.hasAuthorizer = false;

        const result = await run(USER);

        expect(result.Success).toBe(false);
        expect(result.ResultCode).toBe('PERMISSION_DENIED');
        expect(h.readOnlyRunQuery).not.toHaveBeenCalled();
        expect(h.readWriteExecuteSQL).not.toHaveBeenCalled();
    });

    it('refuses SQL the host refuses, without running it', async () => {
        h.authorize.mockReturnValue("Invalid ad-hoc SQL: entity 'MJ: Rubric Evaluations' is row-level-security filtered for you");

        const result = await run(USER);

        expect(result.Success).toBe(false);
        expect(result.ResultCode).toBe('PERMISSION_DENIED');
        expect(result.Message).toMatch(/row-level-security filtered/);
        expect(h.readOnlyRunQuery).not.toHaveBeenCalled();
    });

    it('reports a host refusal of the statement shape as NOT_SELECT_STATEMENT', async () => {
        h.authorize.mockReturnValue('RenderPipeline: only a single read query may be run here, and this SQL is not one: it contains more than one statement.');

        const result = await run(USER);

        expect(result.ResultCode).toBe('NOT_SELECT_STATEMENT');
        expect(h.readOnlyRunQuery).not.toHaveBeenCalled();
    });

    it('asks the host about the SQL it will run, on the read-only provider, for the caller', async () => {
        await run(USER);

        expect(h.authorize).toHaveBeenCalledWith(SQL, h.readOnlyProvider, USER);
    });

    it('runs with the timeout the host allows', async () => {
        await run(USER, [{ Name: 'Timeout', Type: 'Input', Value: 600 }]);

        expect(h.clampTimeoutSeconds).toHaveBeenCalledWith(600);
        expect(sentQuery().TimeoutSeconds).toBe(60);
    });
});

describe('Run Ad-hoc Query: refusals from the read path', () => {
    it('reports a statement that is not a single read query as NOT_SELECT_STATEMENT', async () => {
        h.readOnlyRunQuery.mockResolvedValue(queryResult({
            Success: false, Results: [], RowCount: 0, TotalRowCount: 0,
            ErrorMessage: 'Ad-hoc SQL must be a single read query: it contains more than one statement.',
        }));

        const result = await run(USER);

        expect(result.Success).toBe(false);
        expect(result.ResultCode).toBe('NOT_SELECT_STATEMENT');
    });

    it('reports a database timeout as QUERY_TIMEOUT', async () => {
        h.readOnlyRunQuery.mockResolvedValue(queryResult({
            Success: false, Results: [], RowCount: 0, TotalRowCount: 0,
            ErrorMessage: 'Ad-hoc query execution failed: Timeout: Request failed to complete in 5000ms',
        }));

        const result = await run(USER);

        expect(result.Success).toBe(false);
        expect(result.ResultCode).toBe('QUERY_TIMEOUT');
    });
});
