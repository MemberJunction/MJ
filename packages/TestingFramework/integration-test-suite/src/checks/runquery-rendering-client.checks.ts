/**
 * runquery-rendering-client.checks.ts — the 'runquery-rendering-client' bundle: the GraphQL slice
 * of the query rendering matrix. The server-transport `runquery-rendering` bundle covers the
 * pipeline in depth; this bundle proves the same results arrive intact over the wire.
 *
 * TRANSPORT: client. Needs a running MJAPI. Fixtures are created over GraphQL, so they cannot
 * include a table; the queries read a literal derived table instead, which is valid unchanged on
 * SQL Server and PostgreSQL.
 */
import { RunQuery } from '@memberjunction/core';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { Assert } from '@memberjunction/testing-integration';
import { IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import type { IntegrationCheckContext, NamedCheck } from '@memberjunction/testing-integration';
import {
    CreateRenderCategory,
    CreateRenderQuery,
    DeleteRenderQueries,
    RefreshRenderQueries,
    RenderCategoryPath
} from './runquery-rendering-fixture';
import type { RenderFixtures } from './runquery-rendering-fixture';
import { DescribeRowMismatch, FailOnMismatches, ProjectRows, RunCapAndPagingMatrix } from './runquery-rendering-matrix';
import type { ComparableRow, ExpectedResult } from './runquery-rendering-matrix';

/** Size of the literal row source. */
const NUMBER_COUNT = 30;

/** A derived table of the numbers 1 to 30, valid unchanged on both platforms. */
const NUMBER_SOURCE = `(${Array.from({ length: NUMBER_COUNT }, (_, i) => `SELECT ${i + 1} AS N`).join(' UNION ALL ')}) AS v`;

function numbers(predicate: (n: number) => boolean): ComparableRow[] {
    return Array.from({ length: NUMBER_COUNT }, (_, i) => i + 1).filter(predicate).map(n => ({ N: n }));
}

let clientFixtures: RenderFixtures | undefined;

function requireFixtures(): RenderFixtures {
    if (!clientFixtures) {
        throw new Error('runquery-rendering-client fixtures not initialized — the bundle lifecycle Setup must run first.');
    }
    return clientFixtures;
}

function requireWire(ctx: IntegrationCheckContext): GraphQLDataProvider {
    if (!(ctx.Provider instanceof GraphQLDataProvider)) {
        throw new Error('runquery-rendering-client needs the client transport: the context provider is not a GraphQLDataProvider.');
    }
    return ctx.Provider;
}

async function setupClientFixtures(ctx: IntegrationCheckContext): Promise<void> {
    requireWire(ctx);
    const fixtures: RenderFixtures = clientFixtures = {
        Category: await CreateRenderCategory(ctx.User),
        Queries: new Map(),
        Variants: []
    };
    await CreateRenderQuery(fixtures, { Name: 'RRC Numbers', SQL: `SELECT N FROM ${NUMBER_SOURCE} ORDER BY N` }, ctx.User);
    await CreateRenderQuery(fixtures, { Name: 'RRC Dep Numbers', Reusable: true, SQL: `SELECT N FROM ${NUMBER_SOURCE}` }, ctx.User);
    await CreateRenderQuery(fixtures, {
        Name: 'RRC Session Timeouts',
        SQL: `SELECT 'n/a' AS StatementTimeout, 'n/a' AS IdleInTransactionTimeout`,
        Variants: {
            postgresql: `SELECT current_setting('statement_timeout') AS StatementTimeout, current_setting('idle_in_transaction_session_timeout') AS IdleInTransactionTimeout`
        }
    }, ctx.User);
    await RefreshRenderQueries(ctx.User);
    const path = RenderCategoryPath(fixtures);
    await CreateRenderQuery(fixtures, {
        Name: 'RRC Composed',
        SQL: `SELECT d.N FROM {{query:"${path}/RRC Dep Numbers"}} d WHERE d.N > 10 ORDER BY d.N`
    }, ctx.User);
    await RefreshRenderQueries(ctx.User);
}

async function teardownClientFixtures(ctx: IntegrationCheckContext): Promise<void> {
    try {
        await DeleteRenderQueries(clientFixtures, ctx.User);
    } finally {
        clientFixtures = undefined;
    }
}

function queryID(name: string): string {
    const query = requireFixtures().Queries.get(name);
    if (!query) throw new Error(`Fixture query '${name}' was not created.`);
    return query.ID;
}

/** The raw `TestQuerySQL` response as the resolver returns it. */
interface TestQuerySQLResponse {
    TestQuerySQL: {
        Success: boolean;
        Results: string | null;
        RowCount: number;
        ErrorMessage: string | null;
    };
}

const TEST_QUERY_SQL = `query TestQuerySQL($input: TestQuerySQLInput!) {
    TestQuerySQL(input: $input) { Success Results RowCount ErrorMessage }
}`;

async function runTestQuerySQL(wire: GraphQLDataProvider, sql: string, maxRows: number): Promise<TestQuerySQLResponse['TestQuerySQL']> {
    const response: TestQuerySQLResponse = await wire.ExecuteGQL(TEST_QUERY_SQL, { input: { SQL: sql, MaxRows: maxRows } });
    return response.TestQuerySQL;
}

export const RunQueryRenderingClientChecks: NamedCheck[] = [
    {
        Id: 'runquery-rendering-client.RRC1',
        Name: 'RRC1: a saved query run over GraphQL returns the right rows and totals under every MaxRows / StartRow combination',
        Fn: async (ctx): Promise<void> => {
            requireWire(ctx);
            const expected: ExpectedResult = { Rows: numbers(() => true), Ordered: true };
            FailOnMismatches('RRC1', await RunCapAndPagingMatrix('values', { QueryID: queryID('RRC Numbers') }, expected, ['N'], ctx.User), 1);
        }
    },
    {
        Id: 'runquery-rendering-client.RRC2',
        Name: 'RRC2: a composed query run over GraphQL returns the right rows and totals under every MaxRows / StartRow combination',
        Fn: async (ctx): Promise<void> => {
            requireWire(ctx);
            const expected: ExpectedResult = { Rows: numbers(n => n > 10), Ordered: true };
            FailOnMismatches('RRC2', await RunCapAndPagingMatrix('composed', { QueryID: queryID('RRC Composed') }, expected, ['N'], ctx.User), 1);
        }
    },
    {
        Id: 'runquery-rendering-client.RRC3',
        Name: 'RRC3: TestQuerySQL over GraphQL applies MaxRows to transient SQL',
        Fn: async (ctx): Promise<void> => {
            const wire = requireWire(ctx);
            const result = await runTestQuerySQL(wire, `SELECT N FROM ${NUMBER_SOURCE} ORDER BY N`, 7);
            if (!result.Success && /Read-only data source is not available/i.test(result.ErrorMessage ?? '')) {
                console.warn('  ⚠ runquery-rendering-client.RRC3 SKIPPED — the server has no read-only connection configured, which TestQuerySQL requires.');
                return;
            }
            Assert(result.Success, `TestQuerySQL failed: ${result.ErrorMessage}`);
            const rows = ProjectRows(JSON.parse(result.Results ?? '[]') as Record<string, unknown>[], ['N']);
            const mismatch = DescribeRowMismatch(rows, numbers(n => n <= 7), true);
            Assert(mismatch === null, `TestQuerySQL MaxRows 7: ${mismatch}`);
        }
    },
    {
        Id: 'runquery-rendering-client.RRC4',
        Name: 'RRC4: on PostgreSQL, every MJAPI backend runs with the statement and idle-in-transaction timeouts from the default requestTimeout',
        Fn: async (ctx): Promise<void> => {
            requireWire(ctx);
            // Concurrent runs land on different pooled backends, including ones the pool opens now.
            const runs = await Promise.all(Array.from({ length: 12 }, () =>
                new RunQuery().RunQuery({ QueryID: queryID('RRC Session Timeouts') }, ctx.User)));
            const failures: string[] = [];
            for (const run of runs) {
                if (!run.Success) {
                    failures.push(`run failed: ${run.ErrorMessage}`);
                    continue;
                }
                const row = ProjectRows(run.Results, ['StatementTimeout', 'IdleInTransactionTimeout'])[0];
                if (row.StatementTimeout === 'n/a') {
                    console.log('      → RRC4: SQL Server applies requestTimeout in the driver; nothing to read from the server');
                    return;
                }
                if (row.StatementTimeout !== '30s' || row.IdleInTransactionTimeout !== '1min') {
                    failures.push(`statement_timeout '${row.StatementTimeout}', idle_in_transaction_session_timeout '${row.IdleInTransactionTimeout}'`);
                }
            }
            FailOnMismatches('RRC4 (expected 30s and 1min on every backend)', failures, runs.length);
        }
    }
];

for (const check of RunQueryRenderingClientChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('runquery-rendering-client', {
    Setup: setupClientFixtures,
    Teardown: teardownClientFixtures
});
