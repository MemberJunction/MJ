/**
 * GetData runs its SQL through the read-only PROVIDER, on any platform (#3427).
 *
 * It used to open an mssql `Request` on the read-only `ConnectionPool` from `context.dataSources`.
 * A PostgreSQL install never has one, so every GetData call failed there before running anything.
 * These tests drive the real resolver against a PostgreSQL-shaped read-only provider with no mssql
 * pool at all, and pin the parts that must not change: no read-write fallback, and the SELECT-only
 * validator still refusing DML.
 */
import 'reflect-metadata';

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../auth/index.js', () => ({ GetSystemUser: vi.fn(async () => ({ ID: 'system-user', Name: 'System' })) }));

import { GetDataErrorMessage, GetDataResolver, RegisterAccessToken } from '../resolvers/GetDataResolver.js';
import type { AppContext } from '../types.js';

type ExecuteCall = { sql: string; options: { description?: string; ignoreLogging?: boolean } | undefined };

function postgresContext(calls: ExecuteCall[], rows: Record<string, unknown>[], type: 'Read-Only' | 'Read-Write' = 'Read-Only'): AppContext {
    const provider = {
        PlatformKey: 'postgresql',
        ExecuteSQL: async (sql: string, _params: unknown, options?: ExecuteCall['options']) => {
            calls.push({ sql, options });
            return rows;
        },
    };
    return {
        // Deliberately EMPTY: a PostgreSQL install has no mssql ConnectionPool here.
        dataSources: [],
        providers: [{ type, provider }],
        userPayload: { isSystemUser: true },
    } as unknown as AppContext;
}

describe('GetDataResolver.GetData on a PostgreSQL read-only provider', () => {
    let token: string;

    beforeEach(() => {
        token = RegisterAccessToken().Token;
    });

    it('runs the query through the provider and returns its rows, with no data source touched', async () => {
        const calls: ExecuteCall[] = [];
        const result = await new GetDataResolver().GetData(
            { Token: token, Queries: ['SELECT "Name" FROM __mj."vwUsers"'] },
            postgresContext(calls, [{ Name: 'Ada' }])
        );

        expect(result.ErrorMessages).toEqual([null]);
        expect(result.Success).toBe(true);
        expect(result.Results).toEqual([JSON.stringify([{ Name: 'Ada' }])]);
        expect(calls).toHaveLength(1);
        expect(calls[0].sql).toBe('SELECT "Name" FROM __mj."vwUsers"');
        expect(calls[0].options).toEqual({ description: 'GetData', ignoreLogging: true });
    });

    it('fails when there is no read-only provider, rather than falling back to the read-write login', async () => {
        const calls: ExecuteCall[] = [];
        const result = await new GetDataResolver().GetData(
            { Token: token, Queries: ['SELECT 1'] },
            postgresContext(calls, [], 'Read-Write')
        );

        expect(result.Success).toBe(false);
        expect(result.ErrorMessages[0]).toMatch(/Read-only provider not found/);
        expect(calls).toHaveLength(0);
    });

    it('still refuses DML before it reaches the provider', async () => {
        const calls: ExecuteCall[] = [];
        const result = await new GetDataResolver().GetData(
            { Token: token, Queries: ['DELETE FROM __mj."User"'] },
            postgresContext(calls, [])
        );

        expect(result.Success).toBe(false);
        expect(result.ErrorMessages[0]).toBeTruthy();
        expect(calls).toHaveLength(0);
    });
});

describe('GetDataErrorMessage', () => {
    it('keeps the first line of a plain error', () => {
        expect(GetDataErrorMessage(new Error('relation "x" does not exist\nSELECT * FROM x'))).toBe('relation "x" does not exist');
    });

    it('prefers a SQL Server preceding error and appends its line number', () => {
        const err = Object.assign(new Error('Statement(s) could not be prepared.'), {
            precedingErrors: [{ message: "Invalid column name 'Nope'." }],
            lineNumber: 3,
        });
        expect(GetDataErrorMessage(err)).toBe("Invalid column name 'Nope'. (Line 3)");
    });

    it('reads the SQL Server details from the cause when the provider wraps the driver error', () => {
        const driver = { precedingErrors: [{ message: 'Incorrect syntax near FROM.' }], lineNumber: 1 };
        expect(GetDataErrorMessage(new Error('wrapped', { cause: driver }))).toBe('Incorrect syntax near FROM. (Line 1)');
    });
});
