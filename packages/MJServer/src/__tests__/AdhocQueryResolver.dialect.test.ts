/**
 * Regression suite for the ad-hoc read-only execution path being SQL-Server-shaped.
 *
 * The bug — `ExecuteAdhocQuery` opened with
 * `GetReadOnlyDataSource(context.dataSources, …)`, which looks for an **mssql
 * `ConnectionPool`**. A PostgreSQL provider never populates `context.dataSources`
 * with one, so the call threw and the resolver returned
 * "No read-only data source available for ad-hoc query execution" — which the
 * artifact viewer renders as "Showing cached data". The `GetReadOnlyProvider`
 * call immediately below it only resolved a platform STRING; it never executed
 * anything, so the resolver knew the tenant was PostgreSQL and still refused.
 *
 * The fix routes both questions — which dialect to render, and what to execute
 * the rendered SQL on — through the SAME read-only provider, and executes via
 * `provider.ExecuteSQL`, which every platform implements.
 *
 * Same hybrid strategy as AdhocQueryResolver.pagination.test.ts:
 *   1. Source-shape contract tests — assert structural properties of the fix.
 *   2. Behavior tests — drive ExecuteAdhocQuery against a stub PostgreSQL
 *      provider and assert it neither refuses nor emits T-SQL.
 */
import 'reflect-metadata';

import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { Metadata } from '@memberjunction/core';

// `RunQueryResultType` is a type-graphql object type whose fields rely on
// `emitDecoratorMetadata`. esbuild (what vitest transforms with) cannot emit it,
// so importing QueryResolver for real fails at decoration time. The resolver only
// uses the class as the @Query return marker, so a bare stand-in is enough and
// keeps the REAL AdhocQueryResolver under test.
vi.mock('../resolvers/QueryResolver.js', () => ({
    RunQueryResultType: class RunQueryResultType {},
}));

import { AdhocQueryResolver } from '../resolvers/AdhocQueryResolver.js';
import type { AppContext } from '../types.js';

const ADHOC_RESOLVER_PATH = resolve(__dirname, '../resolvers/AdhocQueryResolver.ts');

function readResolverSource(): string {
    return readFileSync(ADHOC_RESOLVER_PATH, 'utf8');
}

function stubMetadata(): void {
    vi.spyOn(Metadata, 'Provider', 'get').mockReturnValue({
        Queries: [],
        QueryDependencies: [],
    } as unknown as ReturnType<typeof Metadata.Provider>);
}

/** Records every statement handed to the provider so we can inspect the dialect. */
type ExecutedSQL = { statements: string[] };

function contextWithProvider(platformKey: string, executed: ExecutedSQL, rows: Record<string, unknown>[] = []): AppContext {
    const provider = {
        PlatformKey: platformKey,
        ExecuteSQL: async (sqlText: string) => {
            executed.statements.push(sqlText);
            // A COUNT wrap must answer with a count; anything else gets the page.
            if (/TotalRowCount/i.test(sqlText)) {
                return [{ TotalRowCount: rows.length }];
            }
            return rows;
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

// ════════════════════════════════════════════════════════════════════
// Source-shape contract tests
// ════════════════════════════════════════════════════════════════════

describe('AdhocQueryResolver dialect source-shape contract', () => {
    it('must NOT gate execution on a SQL-Server-only read-only data source', () => {
        const src = readResolverSource();
        expect(src).not.toContain('GetReadOnlyDataSource');
    });

    it('must NOT depend on the mssql driver', () => {
        const src = readResolverSource();
        expect(src).not.toMatch(/^import .* from 'mssql';$/m);
        expect(src).not.toContain('new sql.Request(');
        expect(src).not.toContain('sql.ConnectionPool');
    });

    it('must resolve the platform from the read-only provider, not a literal', () => {
        const src = readResolverSource();
        expect(src).toContain('GetReadOnlyProvider(context.providers');
        expect(src).toContain('ResolvePlatformKey(roProvider)');
        // The old code seeded `let platform: DatabasePlatform = 'sqlserver'` and
        // only overwrote it if a provider happened to be there.
        expect(src).not.toMatch(/platform\s*(:\s*DatabasePlatform\s*)?=\s*'sqlserver'/);
    });

    it('must execute through the provider abstraction', () => {
        const src = readResolverSource();
        expect(src).toContain('provider.ExecuteSQL');
    });
});

// ════════════════════════════════════════════════════════════════════
// Behavior tests
// ════════════════════════════════════════════════════════════════════

describe('ExecuteAdhocQuery on a PostgreSQL tenant', () => {
    it('does NOT fall into the "no read-only data source" branch', async () => {
        stubMetadata();
        const executed: ExecutedSQL = { statements: [] };
        const resolver = new AdhocQueryResolver();

        const result = await resolver.ExecuteAdhocQuery(
            { SQL: 'SELECT ID, Name FROM __mj.vwUsers' },
            contextWithProvider('postgresql', executed, [{ ID: '1', Name: 'A' }]),
        );

        expect(result.ErrorMessage).not.toContain('No read-only data source');
        expect(result.Success).toBe(true);
        expect(executed.statements.length).toBeGreaterThan(0);
    });

    it('renders the page in PostgreSQL syntax, not T-SQL', async () => {
        stubMetadata();
        const executed: ExecutedSQL = { statements: [] };
        const resolver = new AdhocQueryResolver();

        await resolver.ExecuteAdhocQuery(
            { SQL: 'SELECT ID, Name FROM __mj.vwUsers ORDER BY Name', MaxRows: 10, StartRow: 0 },
            contextWithProvider('postgresql', executed, [{ ID: '1', Name: 'A' }]),
        );

        const dataSQL = executed.statements[0];
        expect(dataSQL).toMatch(/LIMIT/i);
        expect(dataSQL).not.toMatch(/OFFSET\s+\d+\s+ROWS\s+FETCH/i);
    });

    it('returns the provider\'s rows', async () => {
        stubMetadata();
        const executed: ExecutedSQL = { statements: [] };
        const resolver = new AdhocQueryResolver();

        const result = await resolver.ExecuteAdhocQuery(
            { SQL: 'SELECT ID FROM __mj.vwUsers' },
            contextWithProvider('postgresql', executed, [{ ID: '1' }, { ID: '2' }]),
        );

        expect(result.RowCount).toBe(2);
        expect(JSON.parse(result.Results)).toEqual([{ ID: '1' }, { ID: '2' }]);
    });
});

describe('ExecuteAdhocQuery on a SQL Server tenant', () => {
    it('still renders the page in T-SQL', async () => {
        stubMetadata();
        const executed: ExecutedSQL = { statements: [] };
        const resolver = new AdhocQueryResolver();

        await resolver.ExecuteAdhocQuery(
            { SQL: 'SELECT ID, Name FROM __mj.vwUsers ORDER BY Name', MaxRows: 10, StartRow: 0 },
            contextWithProvider('sqlserver', executed, [{ ID: '1', Name: 'A' }]),
        );

        const dataSQL = executed.statements[0];
        expect(dataSQL).toMatch(/OFFSET\s+0\s+ROWS\s+FETCH\s+NEXT\s+10\s+ROWS\s+ONLY/i);
        expect(dataSQL).not.toMatch(/\bLIMIT\b/i);
    });
});

describe('ExecuteAdhocQuery refusal path', () => {
    it('still refuses when there is no read-only provider at all', async () => {
        stubMetadata();
        const resolver = new AdhocQueryResolver();

        const result = await resolver.ExecuteAdhocQuery(
            { SQL: 'SELECT ID FROM __mj.vwUsers' },
            { dataSources: [], providers: [], userPayload: { userRecord: { ID: 'u-1' } } } as unknown as AppContext,
        );

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain('No read-only data source available for ad-hoc query execution');
    });

    it('does NOT fall back to a read-write provider', async () => {
        stubMetadata();
        const resolver = new AdhocQueryResolver();

        const result = await resolver.ExecuteAdhocQuery(
            { SQL: 'SELECT ID FROM __mj.vwUsers' },
            {
                dataSources: [],
                providers: [{ type: 'Read-Write', provider: { PlatformKey: 'postgresql', ExecuteSQL: async () => [] } }],
                userPayload: { userRecord: { ID: 'u-1' } },
            } as unknown as AppContext,
        );

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain('No read-only data source available');
    });
});
