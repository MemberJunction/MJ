/**
 * runquery-rendering-client.checks.ts — the 'runquery-rendering-client' bundle: the GraphQL slice
 * of the query rendering matrix. The server-transport `runquery-rendering` bundle covers the
 * pipeline in depth; this bundle proves the same results arrive intact over the wire.
 *
 * TRANSPORT: client. Needs a running MJAPI. Fixtures are created over GraphQL, so they cannot
 * include a table; the queries read a literal derived table instead, which is valid unchanged on
 * SQL Server and PostgreSQL.
 */
import { RunQuery, RunView } from '@memberjunction/core';
import type { UserInfo } from '@memberjunction/core';
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

/**
 * The errors a refused caller-supplied statement reports: the server's keyword screen for ad-hoc
 * SQL, or the render pipeline's single-read-query rule behind it.
 */
const REFUSAL = /Dangerous SQL keyword detected|single read query/i;

/**
 * Whether the server can run ad-hoc SQL. ExecuteAdhocQuery uses only the read-only login and
 * never falls back to the read-write pool, so a server with no read-only login refuses every
 * ad-hoc query. Warns that the check is skipped when it cannot.
 */
async function adhocAvailable(checkId: string, user: UserInfo): Promise<boolean> {
    const probe = await new RunQuery().RunQuery({ SQL: 'SELECT 1 AS N', StartRow: 0, MaxRows: 1 }, user);
    if (probe.Success || !/No read-only data source available/i.test(probe.ErrorMessage ?? '')) return true;
    console.warn(`  ⚠ ${checkId} SKIPPED — the server has no read-only connection configured, which ad-hoc SQL requires.`);
    return false;
}

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
    },
    {
        Id: 'runquery-rendering-client.RRC5',
        Name: 'RRC5: TestQuerySQL runs as the configured read-only database login',
        Fn: async (ctx): Promise<void> => {
            const wire = requireWire(ctx);
            // The same variable MJAPI reads its read-only login from; the runner needs it to know
            // which user to expect.
            const expectedUser = process.env.DB_READ_ONLY_USERNAME;
            if (!expectedUser) {
                console.warn('  ⚠ runquery-rendering-client.RRC5 SKIPPED — DB_READ_ONLY_USERNAME is not set for the runner, so there is no read-only login to expect.');
                return;
            }
            const result = await runTestQuerySQL(wire, 'SELECT CURRENT_USER AS UserName', 1);
            Assert(result.Success, `TestQuerySQL failed: ${result.ErrorMessage}`);
            const user = String(ProjectRows(JSON.parse(result.Results ?? '[]') as Record<string, unknown>[], ['UserName'])[0]?.UserName);
            Assert(user.toLowerCase() === expectedUser.toLowerCase(),
                `TestQuerySQL ran as '${user}', not the read-only login '${expectedUser}' — the read-only provider is using another connection`);
        }
    },
    {
        Id: 'runquery-rendering-client.RRC6',
        Name: 'RRC6: on PostgreSQL, a session setting changed by caller-supplied SQL is not seen by later requests',
        Fn: async (ctx): Promise<void> => {
            const wire = requireWire(ctx);
            const probe = await new RunQuery().RunQuery({ QueryID: queryID('RRC Session Timeouts') }, ctx.User);
            Assert(probe.Success, `platform probe failed: ${probe.ErrorMessage}`);
            if (ProjectRows(probe.Results, ['StatementTimeout'])[0].StatementTimeout === 'n/a') {
                console.log('      → RRC6: SQL Server read queries cannot change session settings; nothing to check');
                return;
            }
            const change = await runTestQuerySQL(wire, "SELECT set_config('statement_timeout', '3s', false) AS Changed", 1);
            if (!change.Success && /Read-only data source is not available/i.test(change.ErrorMessage ?? '')) {
                console.warn('  ⚠ runquery-rendering-client.RRC6 SKIPPED — the server has no read-only connection configured.');
                return;
            }
            Assert(change.Success, `set_config call failed: ${change.ErrorMessage}`);
            const failures: string[] = [];
            for (let i = 0; i < 20; i++) {
                const read = await runTestQuerySQL(wire, "SELECT current_setting('statement_timeout') AS StatementTimeout", 1);
                const value = read.Success ? String(ProjectRows(JSON.parse(read.Results ?? '[]') as Record<string, unknown>[], ['StatementTimeout'])[0]?.StatementTimeout) : `error: ${read.ErrorMessage}`;
                if (value !== '30s') failures.push(`request ${i + 1} saw statement_timeout '${value}'`);
            }
            FailOnMismatches('RRC6 (a later request must still see 30s)', failures, 20);
        }
    },
    {
        Id: 'runquery-rendering-client.RRC7',
        Name: 'RRC7: TestQuerySQL on the read-only login returns counts and decimals as numbers, as every other query does',
        Fn: async (ctx): Promise<void> => {
            const wire = requireWire(ctx);
            const result = await runTestQuerySQL(wire, `SELECT COUNT(*) AS RowTotal, SUM(CAST(N AS DECIMAL(10, 2))) AS ValueTotal FROM ${NUMBER_SOURCE}`, 1);
            if (!result.Success && /Read-only data source is not available/i.test(result.ErrorMessage ?? '')) {
                console.warn('  ⚠ runquery-rendering-client.RRC7 SKIPPED — the server has no read-only connection configured, which TestQuerySQL requires.');
                return;
            }
            Assert(result.Success, `TestQuerySQL failed: ${result.ErrorMessage}`);
            const row = (JSON.parse(result.Results ?? '[]') as Record<string, unknown>[])[0] ?? {};
            const valueOf = (name: string): unknown => Object.entries(row).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1];
            const failures: string[] = [];
            const expected: Array<[string, number]> = [['RowTotal', NUMBER_COUNT], ['ValueTotal', (NUMBER_COUNT * (NUMBER_COUNT + 1)) / 2]];
            for (const [name, value] of expected) {
                const actual = valueOf(name);
                if (actual !== value) failures.push(`${name}: expected the number ${value}, got ${JSON.stringify(actual)} (${typeof actual})`);
            }
            FailOnMismatches('RRC7', failures, expected.length);
        }
    },
    {
        Id: 'runquery-rendering-client.RRC8',
        Name: 'RRC8: ad-hoc SQL over GraphQL returns the right rows and totals under every MaxRows / StartRow combination',
        Fn: async (ctx): Promise<void> => {
            requireWire(ctx);
            if (!await adhocAvailable('runquery-rendering-client.RRC8', ctx.User)) return;
            const expected: ExpectedResult = { Rows: numbers(n => n % 2 === 0), Ordered: true };
            const sql = `SELECT N FROM ${NUMBER_SOURCE} WHERE N % 2 = 0 ORDER BY N`;
            FailOnMismatches('RRC8', await RunCapAndPagingMatrix('ad-hoc over GraphQL', { SQL: sql }, expected, ['N'], ctx.User), 1);
        }
    },
    {
        Id: 'runquery-rendering-client.RRC9',
        Name: 'RRC9: ad-hoc SQL over GraphQL must be a single read query; a write, alone or stacked after a read, is refused and changes nothing',
        Fn: async (ctx): Promise<void> => {
            requireWire(ctx);
            if (!await adhocAvailable('runquery-rendering-client.RRC9', ctx.User)) return;
            const category = requireFixtures().Category;
            // Double-quoted identifiers are valid on both platforms, so only the read-only guard can stop these.
            const update = `UPDATE __mj."QueryCategory" SET "Description" = 'changed by RRC9' WHERE "ID" = '${category.ID}'`;
            const attempts: Array<[string, string]> = [['a write', update], ['a write stacked after a read', `SELECT 1 AS A; ${update}`]];
            const failures: string[] = [];
            for (const [label, sql] of attempts) {
                const result = await new RunQuery().RunQuery({ SQL: sql }, ctx.User);
                if (result.Success) failures.push(`${label} was accepted`);
                else if (!REFUSAL.test(result.ErrorMessage ?? '')) failures.push(`${label} failed for another reason: ${result.ErrorMessage}`);
            }
            const reread = await new RunView().RunView<{ Description: string | null }>({
                EntityName: 'MJ: Query Categories', ExtraFilter: `ID='${category.ID}'`, Fields: ['Description'], ResultType: 'simple', BypassCache: true
            }, ctx.User);
            const description = reread.Results?.[0]?.Description ?? null;
            if (description === 'changed by RRC9') failures.push('the fixture category was changed');
            FailOnMismatches('RRC9', failures, attempts.length);
        }
    },
    {
        Id: 'runquery-rendering-client.RRC10',
        Name: 'RRC10: ad-hoc SQL over GraphQL stops at the caller timeout and reports it',
        Fn: async (ctx): Promise<void> => {
            requireWire(ctx);
            if (!await adhocAvailable('runquery-rendering-client.RRC10', ctx.User)) return;
            // Seven copies of the 30-row source cross joined: far too many rows to count in a second.
            const copies = Array.from({ length: 7 }, (_, i) => NUMBER_SOURCE.replace(/ AS v$/, () => ` AS v${i}`)).join(' CROSS JOIN ');
            const started = Date.now();
            const result = await new RunQuery().RunQuery({ SQL: `SELECT COUNT(*) AS Total FROM ${copies}`, TimeoutSeconds: 1 }, ctx.User);
            const elapsedMs = Date.now() - started;
            Assert(!result.Success, `the query must not finish inside 1 second (it returned ${JSON.stringify(result.Results)})`);
            Assert(/exceeded 1 second timeout/i.test(result.ErrorMessage ?? ''), `expected the timeout to be reported, got: ${result.ErrorMessage}`);
            Assert(elapsedMs < 10000, `the run took ${elapsedMs} ms; the database should have stopped it at about 1 second`);
            console.log(`      → RRC10: stopped after ${elapsedMs} ms`);
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
