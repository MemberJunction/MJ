/**
 * Regression suite for the ad-hoc read-only execution path being SQL-Server-shaped.
 *
 * The bug — `ExecuteAdhocQuery` opened with
 * `GetReadOnlyDataSource(context.dataSources, …)`, which looks for an **mssql
 * `ConnectionPool`**. A PostgreSQL provider never populates `context.dataSources`
 * with one, so every ad-hoc query on PostgreSQL returned
 * "No read-only data source available for ad-hoc query execution".
 *
 * `next` fixed the execution path (R31): the resolver now hands the SQL to the
 * read-only PROVIDER's `RunQuery`, and renders it for that provider's platform.
 * This suite pins the dialect half of that contract — the platform comes from the
 * provider the SQL runs on, never from a literal, and nothing reaches for mssql —
 * and drives the resolver against a PostgreSQL provider with no mssql pool at all.
 * Paging, the timeout clamp and the read authorizer have their own suites.
 */
import 'reflect-metadata';

import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// `RunQueryResultType` is a type-graphql object type whose fields rely on
// `emitDecoratorMetadata`. esbuild (what vitest transforms with) cannot emit it,
// so importing QueryResolver for real fails at decoration time. The resolver only
// uses the class as the @Query return marker, so a bare stand-in is enough and
// keeps the REAL AdhocQueryResolver under test.
vi.mock('../resolvers/QueryResolver.js', () => ({
    RunQueryResultType: class RunQueryResultType {},
}));

// The server config is read from mj.config at import; only the timeout cap is used here.
vi.mock('../config.js', () => ({ configInfo: { databaseSettings: { requestTimeout: 120_000 } } }));

import { AdhocQueryResolver } from '../resolvers/AdhocQueryResolver.js';
import type { AppContext } from '../types.js';

const ADHOC_RESOLVER_PATH = resolve(__dirname, '../resolvers/AdhocQueryResolver.ts');

function readResolverSource(): string {
    return readFileSync(ADHOC_RESOLVER_PATH, 'utf8');
}

type RunQueryCall = { SQL: string; MaxRows?: number; StartRow?: number };

function postgresContext(calls: RunQueryCall[], rows: Record<string, unknown>[]): AppContext {
    const provider = {
        PlatformKey: 'postgresql',
        RunQuery: async (params: RunQueryCall) => {
            calls.push(params);
            return { Success: true, Results: rows, RowCount: rows.length, TotalRowCount: rows.length };
        },
    };
    return {
        // Deliberately EMPTY: a PostgreSQL tenant has no mssql ConnectionPool here.
        // If the resolver still reaches for one, these tests fail.
        dataSources: [],
        providers: [{ type: 'Read-Only', provider }],
        userPayload: { userRecord: { ID: 'u-1', Name: 'Tester' } },
    } as unknown as AppContext;
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('AdhocQueryResolver dialect source-shape contract', () => {
    it('must NOT gate execution on a SQL-Server-only read-only data source', () => {
        expect(readResolverSource()).not.toContain('GetReadOnlyDataSource');
    });

    it('must NOT depend on the mssql driver', () => {
        const src = readResolverSource();
        expect(src).not.toMatch(/^import .* from 'mssql';$/m);
        expect(src).not.toContain('new sql.Request(');
        expect(src).not.toContain('sql.ConnectionPool');
    });

    it('renders for the platform of the read-only provider the SQL runs on, not a literal', () => {
        const src = readResolverSource();
        expect(src).toContain('GetReadOnlyProvider(context.providers');
        expect(src).toContain('Platform: provider.PlatformKey');
        expect(src).not.toMatch(/platform\s*(:\s*DatabasePlatform\s*)?=\s*'sqlserver'/);
        expect(src).not.toMatch(/Platform:\s*'sqlserver'/);
    });
});

describe('ExecuteAdhocQuery on a PostgreSQL tenant', () => {
    it('runs on the read-only provider instead of refusing for want of an mssql pool', async () => {
        const resolver = new AdhocQueryResolver();
        const authorize = vi.spyOn(resolver, 'AuthorizeRenderedSQL').mockReturnValue(null);
        const calls: RunQueryCall[] = [];

        const result = await resolver.ExecuteAdhocQuery(
            { SQL: 'SELECT ID FROM __mj.vwUsers' },
            postgresContext(calls, [{ ID: '1' }, { ID: '2' }]),
        );

        expect(result.ErrorMessage).not.toContain('No read-only data source');
        expect(result.Success).toBe(true);
        expect(calls).toHaveLength(1);
        expect(calls[0].SQL).toBe('SELECT ID FROM __mj.vwUsers');
        expect(JSON.parse(result.Results)).toEqual([{ ID: '1' }, { ID: '2' }]);
        // The SQL is authorized (and so rendered) against the same PostgreSQL provider it runs on.
        expect((authorize.mock.calls[0][1] as { PlatformKey: string }).PlatformKey).toBe('postgresql');
    });
});

describe('ExecuteAdhocQuery refusal path', () => {
    it('still refuses when there is no read-only provider at all', async () => {
        const resolver = new AdhocQueryResolver();

        const result = await resolver.ExecuteAdhocQuery(
            { SQL: 'SELECT ID FROM __mj.vwUsers' },
            { dataSources: [], providers: [], userPayload: { userRecord: { ID: 'u-1' } } } as unknown as AppContext,
        );

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain('No read-only data source available for ad-hoc query execution');
    });

    it('does NOT fall back to a read-write provider', async () => {
        const resolver = new AdhocQueryResolver();

        const result = await resolver.ExecuteAdhocQuery(
            { SQL: 'SELECT ID FROM __mj.vwUsers' },
            {
                dataSources: [],
                providers: [{ type: 'Read-Write', provider: { PlatformKey: 'postgresql', RunQuery: async () => ({ Success: true, Results: [] }) } }],
                userPayload: { userRecord: { ID: 'u-1' } },
            } as unknown as AppContext,
        );

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain('No read-only data source available');
    });
});
