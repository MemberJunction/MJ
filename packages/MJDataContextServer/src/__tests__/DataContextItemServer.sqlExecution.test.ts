/**
 * A `sql` Data Context Item carries SQL text stored in the database. `DataContextItemServer` must
 * never hand that text to a raw connection. It runs it only through a query provider's ad-hoc path
 * (`RunQuery({ SQL })`), which accepts only a single read statement, and only for a known user.
 *
 * `mssql` is replaced by a recorder so a test can see whether SQL reached a raw connection.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserInfo } from '@memberjunction/core';
import type { RunQueryParams, RunQueryResult } from '@memberjunction/core';

/** Every SQL text that a raw mssql connection was asked to run. */
const rawConnectionQueries: string[] = [];

vi.mock('mssql', () => {
    class RecordingRequest {
        public input(): this {
            return this;
        }
        public async query(sqlText: string): Promise<{ recordset: Array<Record<string, unknown>> }> {
            rawConnectionQueries.push(sqlText);
            return { recordset: [{ One: 1 }] };
        }
    }
    class ConnectionPool {}
    return {
        default: { ConnectionPool, Request: RecordingRequest },
        ConnectionPool,
        Request: RecordingRequest,
    };
});

import { DataContextItemServer } from '../index';

const READ_SQL = 'SELECT 1 AS One';

/** The result shape the provider's ad-hoc path returns for a successful run. */
const AD_HOC_SUCCESS: RunQueryResult = {
    QueryID: '',
    QueryName: 'Ad-Hoc Query',
    Success: true,
    Results: [{ One: 1 }],
    RowCount: 1,
    TotalRowCount: 1,
    ExecutionTime: 0,
    ErrorMessage: '',
};

/** The result shape the provider's ad-hoc path returns when its read-only screen refuses the SQL. */
const AD_HOC_REFUSAL: RunQueryResult = {
    QueryID: '',
    QueryName: 'Ad-Hoc Query',
    Success: false,
    Results: [],
    RowCount: 0,
    TotalRowCount: 0,
    ExecutionTime: 0,
    ErrorMessage: 'Ad-hoc SQL must be a single read query: it contains more than one statement.',
};

interface RecordedRun {
    Params: RunQueryParams;
    User: UserInfo | undefined;
}

/** A query provider that records each ad-hoc run and answers with a fixed result. */
function recordingProvider(result: RunQueryResult): {
    Runs: RecordedRun[];
    RunQuery(params: RunQueryParams, contextUser?: UserInfo): Promise<RunQueryResult>;
} {
    const runs: RecordedRun[] = [];
    return {
        Runs: runs,
        async RunQuery(params: RunQueryParams, contextUser?: UserInfo): Promise<RunQueryResult> {
            runs.push({ Params: params, User: contextUser });
            return result;
        },
    };
}

function sqlItem(sqlText: string): DataContextItemServer {
    const item = new DataContextItemServer();
    item.Type = 'sql';
    item.SQL = sqlText;
    return item;
}

function contextUser(): UserInfo {
    const user = new UserInfo();
    user.ID = 'D1F1A0C4-0000-4000-8000-000000000001';
    user.Email = 'owner@example.com';
    return user;
}

describe('DataContextItemServer — sql items', () => {
    beforeEach(() => {
        rawConnectionQueries.length = 0;
    });

    it('refuses to run its SQL on a raw connection pool', async () => {
        const item = sqlItem(READ_SQL);
        const rawPool = { name: 'read-write connection pool' };

        const loaded = await item.LoadData(rawPool, true, false, 0, contextUser());

        expect(loaded).toBe(false);
        expect(rawConnectionQueries).toEqual([]);
        expect(item.DataLoadingError).toMatch(/query provider/i);
    });

    it('runs its SQL through the query provider, for the context user', async () => {
        const item = sqlItem(READ_SQL);
        const provider = recordingProvider(AD_HOC_SUCCESS);
        const user = contextUser();

        const loaded = await item.LoadData(provider, true, false, 0, user);

        expect(loaded).toBe(true);
        expect(item.Data).toEqual([{ One: 1 }]);
        expect(provider.Runs).toEqual([{ Params: { SQL: READ_SQL }, User: user }]);
        expect(rawConnectionQueries).toEqual([]);
    });

    it('refuses to run its SQL when there is no context user', async () => {
        const item = sqlItem(READ_SQL);
        const provider = recordingProvider(AD_HOC_SUCCESS);

        const loaded = await item.LoadData(provider, true, false, 0, undefined);

        expect(loaded).toBe(false);
        expect(provider.Runs).toEqual([]);
        expect(rawConnectionQueries).toEqual([]);
    });

    it('fails the load and keeps the reason when the provider refuses the SQL', async () => {
        const item = sqlItem('SELECT 1 AS One; SELECT 2 AS Two');
        const provider = recordingProvider(AD_HOC_REFUSAL);

        const loaded = await item.LoadData(provider, true, false, 0, contextUser());

        expect(loaded).toBe(false);
        expect(item.DataLoaded).toBe(false);
        expect(item.DataLoadingError).toContain('single read query');
        expect(rawConnectionQueries).toEqual([]);
    });
});
