/**
 * runquery-rendering.checks.ts — the 'runquery-rendering' bundle: saved queries, created for real
 * as `MJ: Queries` records over a fixture table, run through the whole rendering pipeline
 * (parameters, composition, platform variants, row caps, paging and counts) on whichever platform
 * the suite is running against.
 *
 * Every check compares returned rows and `TotalRowCount` with rows computed in TypeScript from the
 * fixture model ({@link BuildRenderItems}), so the same logical query must return the same rows on
 * SQL Server and PostgreSQL. Each query shape runs through the cap-and-paging matrix in
 * runquery-rendering-matrix.ts: `MaxRows` absent, 0, 1, the result size and larger; every page of
 * a three-page walk; a page past the end; and `StartRow` without `MaxRows`.
 *
 * TRANSPORT: server. The bundle creates a table, which needs the database provider. The GraphQL
 * path is covered by the `runquery-rendering-client` bundle.
 *
 * FIXTURES: the lifecycle creates schema `mjit_render` with one table, a query category, and the
 * saved queries every check shares; teardown removes all of them. Checks that need their own
 * queries create them in the same category, which teardown sweeps. The whole bundle writes, so no
 * check is gated on RequiresMutation.
 */
import { RunQuery } from '@memberjunction/core';
import type { DatabasePlatform, QueryDependencySpec, RunQueryResult, UserInfo } from '@memberjunction/core';
import { Assert, AssertEqual } from '@memberjunction/testing-integration';
import { IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import type { IntegrationCheckContext, NamedCheck } from '@memberjunction/testing-integration';
import {
    BuildRenderItems,
    CreateRenderCategory,
    CreateRenderQuery,
    CreateRenderTable,
    DeleteRenderQueries,
    DropRenderTable,
    RefreshRenderQueries,
    RenderCategoryPath,
    RenderPlatform,
    RENDER_TABLE
} from './runquery-rendering-fixture';
import type { RenderFixtures, RenderItem, RenderQueryDefinition } from './runquery-rendering-fixture';
import { DescribeRowMismatch, FailOnMismatches, ProjectRows, RunCapAndPagingMatrix } from './runquery-rendering-matrix';
import type { ComparableRow, ExpectedResult } from './runquery-rendering-matrix';

const T = RENDER_TABLE;

/** A saved query shape plus the rows it must return. */
interface RenderCase extends RenderQueryDefinition {
    /** Columns compared between the result and the expectation. */
    Columns: readonly string[];
    /** Rows the query returns, computed from the fixture model. */
    Expect: (items: RenderItem[]) => ComparableRow[];
    /** Whether the query's ORDER BY makes the row order part of the expectation. */
    Ordered: boolean;
    /** Platforms where the SQL is valid. Omitted means every platform. */
    Platforms?: DatabasePlatform[];
}

/** Picks the listed columns from each fixture row. */
function pick(items: RenderItem[], columns: readonly (keyof RenderItem)[]): ComparableRow[] {
    return items.map(item => {
        const row: ComparableRow = {};
        for (const c of columns) row[c] = item[c];
        return row;
    });
}

function ids(items: RenderItem[]): ComparableRow[] {
    return pick(items, ['ID']);
}

// ─── Plain query shapes ────────────────────────────────────────────────────────

/** Shapes that carry no row cap of their own. */
const PLAIN_CASES: RenderCase[] = [
    {
        Name: 'RR Ordered',
        SQL: `SELECT ID, DisplayName FROM ${T} WHERE ID <= 100 ORDER BY ID`,
        Columns: ['ID', 'DisplayName'],
        Ordered: true,
        Expect: items => pick(items.filter(i => i.ID <= 100), ['ID', 'DisplayName'])
    },
    {
        Name: 'RR Order By Non-Projected',
        SQL: `SELECT ID FROM ${T} WHERE Score IS NOT NULL AND ID <= 90 ORDER BY Score DESC, ID`,
        Columns: ['ID'],
        Ordered: true,
        Expect: items => ids(items
            .filter(i => i.Score !== null && i.ID <= 90)
            .sort((a, b) => (b.Score ?? 0) - (a.Score ?? 0) || a.ID - b.ID))
    },
    {
        Name: 'RR Unordered',
        SQL: `SELECT ID FROM ${T} WHERE Category = 'Beta'`,
        Columns: ['ID'],
        Ordered: false,
        Expect: items => ids(items.filter(i => i.Category === 'Beta'))
    },
    {
        Name: 'RR Distinct',
        SQL: `SELECT DISTINCT Category FROM ${T} ORDER BY Category`,
        Columns: ['Category'],
        Ordered: true,
        Expect: items => [...new Set(items.map(i => i.Category))].sort().map(c => ({ Category: c }))
    },
    {
        Name: 'RR Group By',
        SQL: `SELECT Category, COUNT(*) AS ItemCount FROM ${T} GROUP BY Category ORDER BY Category`,
        Columns: ['Category', 'ItemCount'],
        Ordered: true,
        Expect: items => [...new Set(items.map(i => i.Category))].sort()
            .map(c => ({ Category: c, ItemCount: items.filter(i => i.Category === c).length }))
    },
    {
        Name: 'RR CTE',
        SQL: `WITH Recent AS (SELECT ID, Category FROM ${T} WHERE ID > 150)\nSELECT ID FROM Recent WHERE Category <> 'Alpha' ORDER BY ID`,
        Columns: ['ID'],
        Ordered: true,
        Expect: items => ids(items.filter(i => i.ID > 150 && i.Category !== 'Alpha'))
    },
    {
        Name: 'RR Comment Then CTE',
        SQL: `-- leading line comment\n/* and a block comment */\nWITH Evens AS (SELECT ID FROM ${T} WHERE ID % 2 = 0)\nSELECT ID FROM Evens WHERE ID <= 80 ORDER BY ID`,
        Columns: ['ID'],
        Ordered: true,
        Expect: items => ids(items.filter(i => i.ID % 2 === 0 && i.ID <= 80))
    },
    {
        Name: 'RR Subquery',
        SQL: `SELECT ID FROM ${T} WHERE ParentID IN (SELECT ID FROM ${T} WHERE Category = 'Gamma') ORDER BY ID`,
        Columns: ['ID'],
        Ordered: true,
        Expect: items => {
            const gamma = new Set(items.filter(i => i.Category === 'Gamma').map(i => i.ID));
            return ids(items.filter(i => i.ParentID !== null && gamma.has(i.ParentID)));
        }
    },
    {
        Name: 'RR Window Function',
        SQL: `SELECT ID, ROW_NUMBER() OVER (PARTITION BY Category ORDER BY ID) AS RowInCategory FROM ${T} WHERE ID <= 60 ORDER BY ID`,
        Columns: ['ID', 'RowInCategory'],
        Ordered: true,
        Expect: items => {
            const seen = new Map<string, number>();
            return items.filter(i => i.ID <= 60).map(i => {
                const n = (seen.get(i.Category) ?? 0) + 1;
                seen.set(i.Category, n);
                return { ID: i.ID, RowInCategory: n };
            });
        }
    },
    {
        Name: 'RR Trailing Semicolon',
        SQL: `SELECT ID FROM ${T} WHERE ID % 5 = 0 ORDER BY ID;`,
        Columns: ['ID'],
        Ordered: true,
        Expect: items => ids(items.filter(i => i.ID % 5 === 0))
    },
    {
        Name: 'RR Quoted Identifiers',
        SQL: `SELECT "ID", "DisplayName" FROM "mjit_render"."RenderItem" WHERE "ID" BETWEEN 10 AND 40 ORDER BY "ID"`,
        Columns: ['ID', 'DisplayName'],
        Ordered: true,
        Expect: items => pick(items.filter(i => i.ID >= 10 && i.ID <= 40), ['ID', 'DisplayName'])
    },
    {
        Name: 'RR Parser Rejects (TRY_CAST)',
        SQL: `SELECT ID, TRY_CAST(Score AS INT) AS ScoreValue FROM ${T} WHERE ID <= 45 ORDER BY ID`,
        Columns: ['ID', 'ScoreValue'],
        Ordered: true,
        Platforms: ['sqlserver'],
        Expect: items => items.filter(i => i.ID <= 45).map(i => ({ ID: i.ID, ScoreValue: i.Score }))
    },
    {
        Name: 'RR PostgreSQL Casts',
        SQL: `SELECT ID, CAST(Score AS VARCHAR(10)) AS ScoreText FROM ${T} WHERE ID <= 20 ORDER BY ID`,
        Variants: { postgresql: `SELECT ID, Score::text AS ScoreText FROM ${T} WHERE ID <= 20 ORDER BY ID` },
        Columns: ['ID', 'ScoreText'],
        Ordered: true,
        Expect: items => items.filter(i => i.ID <= 20)
            .map(i => ({ ID: i.ID, ScoreText: i.Score }))
    }
];

// ─── Parameters ────────────────────────────────────────────────────────────────

const PARAM_FILTER_SQL = [
    `SELECT ID FROM ${T}`,
    `WHERE ID > 0`,
    `{% if Category %}AND Category = {{ Category | sqlString }}`,
    `{% endif %}{% if MinScore %}AND Score >= {{ MinScore | sqlNumber }}`,
    `{% endif %}{% if Ids %}AND ID IN {{ Ids | sqlIn }}`,
    `{% endif %}{% if Since %}AND CreatedOn >= {{ Since | sqlDate }}`,
    `{% endif %}{% if Exact %}AND Notes = {{ Exact | sqlString }}`,
    `{% endif %}{% if Contains %}AND Notes LIKE {{ Contains | sqlLikeContains }}`,
    `{% endif %}{% if OnlyActive %}AND IsActive = {{ OnlyActive | sqlBoolean }}`,
    `{% endif %}ORDER BY ID`
].join('\n');

const PARAM_QUERIES: RenderQueryDefinition[] = [
    { Name: 'RR Param Filters', SQL: PARAM_FILTER_SQL },
    { Name: 'RR Param Required', SQL: `SELECT ID FROM ${T} WHERE Category = {{ Category | sqlString }} ORDER BY ID` }
];

/** One parameter set for the filter query and the rows it selects. */
interface ParamCase {
    Label: string;
    Parameters: Record<string, string | number | boolean | null | Array<string | number>>;
    Matches: (item: RenderItem) => boolean;
}

const PARAM_CASES: ParamCase[] = [
    { Label: 'no parameters', Parameters: {}, Matches: () => true },
    { Label: 'null value is treated as absent', Parameters: { Category: null }, Matches: () => true },
    { Label: 'sqlString', Parameters: { Category: 'Gamma' }, Matches: i => i.Category === 'Gamma' },
    { Label: 'sqlNumber', Parameters: { MinScore: 80 }, Matches: i => i.Score !== null && i.Score >= 80 },
    { Label: 'sqlNumber from text', Parameters: { MinScore: '95' }, Matches: i => i.Score !== null && i.Score >= 95 },
    { Label: 'sqlIn numbers', Parameters: { Ids: [3, 5, 7, 240] }, Matches: i => [3, 5, 7, 240].includes(i.ID) },
    { Label: 'sqlDate', Parameters: { Since: '2026-02-15' }, Matches: i => i.CreatedOn >= '2026-02-15' },
    { Label: 'sqlBoolean', Parameters: { OnlyActive: true }, Matches: i => i.IsActive },
    { Label: 'apostrophes', Parameters: { Exact: "O'Brien's note" }, Matches: i => i.Notes === "O'Brien's note" },
    { Label: 'percent sign', Parameters: { Exact: '100% sure' }, Matches: i => i.Notes === '100% sure' },
    { Label: 'underscore', Parameters: { Exact: 'under_score' }, Matches: i => i.Notes === 'under_score' },
    { Label: 'square brackets', Parameters: { Exact: '[bracketed]' }, Matches: i => i.Notes === '[bracketed]' },
    { Label: 'SQL keyword', Parameters: { Exact: 'SELECT' }, Matches: i => i.Notes === 'SELECT' },
    { Label: 'non-ASCII', Parameters: { Exact: 'Ünïcödé café' }, Matches: i => i.Notes === 'Ünïcödé café' },
    { Label: 'LIKE with a literal %', Parameters: { Contains: '0% s' }, Matches: i => i.Notes.includes('0% s') },
    { Label: 'LIKE with a literal _', Parameters: { Contains: '%_off' }, Matches: i => i.Notes.includes('%_off') },
    { Label: 'LIKE with an apostrophe', Parameters: { Contains: "n's" }, Matches: i => i.Notes.includes("n's") },
    { Label: 'combined filters', Parameters: { Category: 'Alpha', MinScore: 30, OnlyActive: true }, Matches: i => i.Category === 'Alpha' && i.Score !== null && i.Score >= 30 && i.IsActive },
    { Label: 'injection through sqlString', Parameters: { Category: "' OR 1=1 --" }, Matches: () => false },
    { Label: 'injection through LIKE', Parameters: { Contains: "x' OR '1'='1" }, Matches: () => false },
    { Label: 'stacked statement through sqlString', Parameters: { Exact: "x'; DELETE FROM mjit_render.RenderItem; --" }, Matches: () => false }
];

// ─── Composition ───────────────────────────────────────────────────────────────

/** The reusable queries the composition cases reference. `{P}` is replaced by the category path. */
const COMPOSITION_LIBRARY: RenderQueryDefinition[] = [
    { Name: 'RR Dep Base', Reusable: true, SQL: `SELECT ID, Category, Score, ParentID FROM ${T}` },
    { Name: 'RR Dep Ordered', Reusable: true, SQL: `SELECT ID, Category FROM ${T} WHERE ID <= 50 ORDER BY ID DESC` },
    { Name: 'RR Dep CTE', Reusable: true, SQL: `WITH EvenItems AS (SELECT ID, Category FROM ${T} WHERE ID % 2 = 0)\nSELECT ID, Category FROM EvenItems` },
    { Name: 'RR Dep Param', Reusable: true, SQL: `SELECT ID, Category FROM ${T} WHERE Category = {{ Cat | sqlString }}` },
    { Name: 'RR Dep Distinct', Reusable: true, SQL: `SELECT DISTINCT Category FROM ${T}` },
    { Name: 'RR Dep Union', Reusable: true, SQL: `SELECT ID FROM ${T} WHERE ID <= 3 UNION ALL SELECT ID FROM ${T} WHERE ID >= 238` },
    { Name: 'RR Dep Comment', Reusable: true, SQL: `-- a dependency that starts with a comment\nSELECT ID FROM ${T} WHERE ID BETWEEN 100 AND 110` },
    { Name: 'RR Dep Nested', Reusable: true, SQL: `SELECT ID, Category FROM {{query:"{P}/RR Dep Base"}} WHERE ID <= 120` },
    { Name: 'RR Dep Nested Deeper', Reusable: true, SQL: `SELECT ID FROM {{query:"{P}/RR Dep Nested"}} WHERE Category = 'Beta'` },
    { Name: 'RR Dep Left', Reusable: true, SQL: `SELECT ID FROM {{query:"{P}/RR Dep Base"}} WHERE ID <= 100` },
    { Name: 'RR Dep Right', Reusable: true, SQL: `SELECT ID FROM {{query:"{P}/RR Dep Base"}} WHERE ID >= 60` },
    { Name: 'RR Dep Not Reusable', Reusable: false, SQL: `SELECT ID FROM ${T}` }
];

/** Composed queries and the rows they return. */
const COMPOSED_CASES: RenderCase[] = [
    {
        Name: 'RR Comp One Reference',
        SQL: `SELECT b.ID FROM {{query:"{P}/RR Dep Base"}} b WHERE b.Category = 'Alpha' ORDER BY b.ID`,
        Columns: ['ID'], Ordered: true,
        Expect: items => ids(items.filter(i => i.Category === 'Alpha'))
    },
    {
        Name: 'RR Comp Two References',
        SQL: `SELECT b.ID FROM {{query:"{P}/RR Dep Base"}} b JOIN {{query:"{P}/RR Dep Ordered"}} o ON o.ID = b.ID WHERE b.Score IS NOT NULL ORDER BY b.ID`,
        Columns: ['ID'], Ordered: true,
        Expect: items => ids(items.filter(i => i.ID <= 50 && i.Score !== null))
    },
    {
        Name: 'RR Comp Nested Three Deep',
        SQL: `SELECT n.ID FROM {{query:"{P}/RR Dep Nested Deeper"}} n ORDER BY n.ID`,
        Columns: ['ID'], Ordered: true,
        Expect: items => ids(items.filter(i => i.ID <= 120 && i.Category === 'Beta'))
    },
    {
        Name: 'RR Comp Same Dependency Twice',
        SQL: `SELECT c.ID FROM {{query:"{P}/RR Dep Base"}} c JOIN {{query:"{P}/RR Dep Base"}} p ON p.ID = c.ParentID WHERE p.Category = 'Delta' ORDER BY c.ID`,
        Columns: ['ID'], Ordered: true,
        Expect: items => {
            const delta = new Set(items.filter(i => i.Category === 'Delta').map(i => i.ID));
            return ids(items.filter(i => i.ParentID !== null && delta.has(i.ParentID)));
        }
    },
    {
        Name: 'RR Comp Diamond',
        SQL: `SELECT l.ID FROM {{query:"{P}/RR Dep Left"}} l JOIN {{query:"{P}/RR Dep Right"}} r ON r.ID = l.ID ORDER BY l.ID`,
        Columns: ['ID'], Ordered: true,
        Expect: items => ids(items.filter(i => i.ID >= 60 && i.ID <= 100))
    },
    {
        Name: 'RR Comp Dependency With CTE',
        SQL: `SELECT e.ID FROM {{query:"{P}/RR Dep CTE"}} e WHERE e.Category = 'Alpha' ORDER BY e.ID`,
        Columns: ['ID'], Ordered: true,
        Expect: items => ids(items.filter(i => i.ID % 2 === 0 && i.Category === 'Alpha'))
    },
    {
        Name: 'RR Comp Union Dependency',
        SQL: `SELECT u.ID FROM {{query:"{P}/RR Dep Union"}} u ORDER BY u.ID`,
        Columns: ['ID'], Ordered: true,
        Expect: items => ids(items.filter(i => i.ID <= 3 || i.ID >= 238))
    },
    {
        Name: 'RR Comp In Subquery',
        SQL: `SELECT ID FROM ${T} WHERE ID IN (SELECT ID FROM {{query:"{P}/RR Dep Ordered"}}) AND Category = 'Beta' ORDER BY ID`,
        Columns: ['ID'], Ordered: true,
        Expect: items => ids(items.filter(i => i.ID <= 50 && i.Category === 'Beta'))
    },
    {
        Name: 'RR Comp In Outer CTE',
        SQL: `WITH Picked AS (SELECT ID FROM {{query:"{P}/RR Dep Base"}} WHERE ID <= 30)\nSELECT p.ID FROM Picked p ORDER BY p.ID`,
        Columns: ['ID'], Ordered: true,
        Expect: items => ids(items.filter(i => i.ID <= 30))
    },
    {
        Name: 'RR Comp Outer Starts With Comment',
        SQL: `/* outer comment */\nSELECT b.ID FROM {{query:"{P}/RR Dep Base"}} b WHERE b.ID > 225 ORDER BY b.ID`,
        Columns: ['ID'], Ordered: true,
        Expect: items => ids(items.filter(i => i.ID > 225))
    },
    {
        Name: 'RR Comp Unordered',
        SQL: `SELECT b.ID FROM {{query:"{P}/RR Dep Base"}} b WHERE b.Category = 'Delta'`,
        Columns: ['ID'], Ordered: false,
        Expect: items => ids(items.filter(i => i.Category === 'Delta'))
    }
];

// ─── Fixture lifecycle ─────────────────────────────────────────────────────────

let renderFixtures: RenderFixtures | undefined;

function requireFixtures(): RenderFixtures {
    if (!renderFixtures) {
        throw new Error('runquery-rendering fixtures not initialized — the bundle lifecycle Setup must run first.');
    }
    return renderFixtures;
}

/** Cases valid on the platform the suite is running against. */
function casesFor(cases: RenderCase[], platform: DatabasePlatform): RenderCase[] {
    return cases.filter(c => !c.Platforms || c.Platforms.includes(platform));
}

/** Replaces the `{P}` category placeholder in composition SQL. */
function withPath(sql: string, path: string): string {
    return sql.split('{P}').join(path);
}

async function setupRenderFixtures(ctx: IntegrationCheckContext): Promise<void> {
    await CreateRenderTable(ctx);
    const fixtures: RenderFixtures = renderFixtures = {
        Category: await CreateRenderCategory(ctx.User),
        Queries: new Map(),
        Variants: []
    };
    const platform = RenderPlatform(ctx);
    for (const c of [...casesFor(PLAIN_CASES, platform), ...PARAM_QUERIES]) {
        await CreateRenderQuery(fixtures, c, ctx.User);
    }
    // The category path is only known once the engine has seen a query in the category.
    await RefreshRenderQueries(ctx.User);
    const path = RenderCategoryPath(fixtures);
    for (const dep of COMPOSITION_LIBRARY) {
        await CreateRenderQuery(fixtures, { ...dep, SQL: withPath(dep.SQL, path) }, ctx.User);
    }
    for (const c of casesFor(COMPOSED_CASES, platform)) {
        await CreateRenderQuery(fixtures, { ...c, SQL: withPath(c.SQL, path) }, ctx.User);
    }
    await RefreshRenderQueries(ctx.User);
}

async function teardownRenderFixtures(ctx: IntegrationCheckContext): Promise<void> {
    try {
        await DeleteRenderQueries(renderFixtures, ctx.User);
    } finally {
        renderFixtures = undefined;
        await DropRenderTable(ctx);
    }
}

// ─── Check helpers ─────────────────────────────────────────────────────────────

function savedQueryID(name: string): string {
    const query = requireFixtures().Queries.get(name);
    if (!query) throw new Error(`Fixture query '${name}' was not created.`);
    return query.ID;
}

/** Runs each case's saved query through the cap-and-paging matrix. */
async function runCaseMatrix(cases: RenderCase[], user: UserInfo): Promise<string[]> {
    const items = BuildRenderItems();
    const failures: string[] = [];
    for (const c of cases) {
        const expected: ExpectedResult = { Rows: c.Expect(items), Ordered: c.Ordered };
        failures.push(...await RunCapAndPagingMatrix(c.Name, { QueryID: savedQueryID(c.Name) }, expected, c.Columns, user));
    }
    return failures;
}

/** Compares one result's rows with the expectation; returns a failure line or nothing. */
function compareRows(label: string, result: RunQueryResult, expected: ComparableRow[], columns: readonly string[], ordered: boolean): string[] {
    if (!result.Success) return [`${label}: failed — ${result.ErrorMessage}`];
    const mismatch = DescribeRowMismatch(ProjectRows(result.Results, columns), expected, ordered);
    return mismatch ? [`${label}: ${mismatch}`] : [];
}

// ─── Checks ────────────────────────────────────────────────────────────────────

export const RunQueryRenderingChecks: NamedCheck[] = [
    {
        Id: 'runquery-rendering.RR1',
        Name: 'RR1: query shapes without a cap of their own return the right rows and totals under every MaxRows / StartRow combination',
        Fn: async (ctx): Promise<void> => {
            const cases = casesFor(PLAIN_CASES, RenderPlatform(ctx));
            FailOnMismatches('RR1', await runCaseMatrix(cases, ctx.User), cases.length);
        }
    },
    {
        Id: 'runquery-rendering.RR2',
        Name: 'RR2: template parameters — every filter, special characters, null and injection attempts — select exactly the expected rows',
        Fn: async (ctx): Promise<void> => {
            const items = BuildRenderItems();
            const failures: string[] = [];
            for (const p of PARAM_CASES) {
                const result = await new RunQuery().RunQuery({ QueryID: savedQueryID('RR Param Filters'), Parameters: p.Parameters }, ctx.User);
                failures.push(...compareRows(`filters: ${p.Label}`, result, ids(items.filter(p.Matches)), ['ID'], true));
            }
            const paged: ExpectedResult = { Rows: ids(items.filter(i => i.Category === 'Delta')), Ordered: true };
            failures.push(...await RunCapAndPagingMatrix('filters: sqlString, paged', { QueryID: savedQueryID('RR Param Filters'), Parameters: { Category: 'Delta' } }, paged, ['ID'], ctx.User));
            const table = await new RunQuery().RunQuery({ SQL: `SELECT COUNT(*) AS N FROM ${T}` }, ctx.User);
            failures.push(...compareRows('table intact after injection attempts', table, [{ N: items.length }], ['N'], true));
            FailOnMismatches('RR2', failures, PARAM_CASES.length + 2);
        }
    },
    {
        Id: 'runquery-rendering.RR3',
        Name: 'RR3: a required parameter that is missing fails the run; supplied, it selects the expected rows',
        Fn: async (ctx): Promise<void> => {
            const items = BuildRenderItems();
            const missing = await new RunQuery().RunQuery({ QueryID: savedQueryID('RR Param Required') }, ctx.User);
            AssertEqual(missing.Success, false, 'a required parameter that is omitted must fail the run');
            const supplied = await new RunQuery().RunQuery({ QueryID: savedQueryID('RR Param Required'), Parameters: { Category: 'Beta' } }, ctx.User);
            const failures = compareRows('required supplied', supplied, ids(items.filter(i => i.Category === 'Beta')), ['ID'], true);
            FailOnMismatches('RR3', failures, 1);
        }
    },
    {
        Id: 'runquery-rendering.RR4',
        Name: 'RR4: composed queries — one, two, nested three deep, repeated, diamond, CTE-bearing and UNION dependencies — return the right rows under every MaxRows / StartRow combination',
        Fn: async (ctx): Promise<void> => {
            const cases = casesFor(COMPOSED_CASES, RenderPlatform(ctx));
            FailOnMismatches('RR4', await runCaseMatrix(cases, ctx.User), cases.length);
        }
    },
    {
        Id: 'runquery-rendering.RR5',
        Name: 'RR5: composition failures name the problem — a missing dependency, a dependency that is not reusable, a circular reference',
        Fn: async (ctx): Promise<void> => {
            const fixtures = requireFixtures();
            const path = RenderCategoryPath(fixtures);
            const missing = await CreateRenderQuery(fixtures, { Name: 'RR Comp Missing', SQL: `SELECT ID FROM {{query:"${path}/RR Nonexistent"}}` }, ctx.User);
            const notReusable = await CreateRenderQuery(fixtures, { Name: 'RR Comp Not Reusable', SQL: `SELECT ID FROM {{query:"${path}/RR Dep Not Reusable"}}` }, ctx.User);
            const cycleA = await CreateRenderQuery(fixtures, { Name: 'RR Cycle A', Reusable: true, SQL: `SELECT ID FROM {{query:"${path}/RR Cycle B"}}` }, ctx.User);
            await CreateRenderQuery(fixtures, { Name: 'RR Cycle B', Reusable: true, SQL: `SELECT ID FROM {{query:"${path}/RR Cycle A"}}` }, ctx.User);
            await RefreshRenderQueries(ctx.User);
            await expectFailure(missing.ID, /not found/i, 'missing dependency', ctx.User);
            await expectFailure(notReusable.ID, /not marked as Reusable/i, 'non-reusable dependency', ctx.User);
            await expectFailure(cycleA.ID, /Circular query dependency/i, 'circular reference', ctx.User);
        }
    },
    {
        Id: 'runquery-rendering.RR6',
        Name: 'RR6: the platform SQL variant is used when one exists for the running platform',
        Fn: async (ctx): Promise<void> => {
            const fixtures = requireFixtures();
            const platform = RenderPlatform(ctx);
            const other: DatabasePlatform = platform === 'postgresql' ? 'sqlserver' : 'postgresql';
            const query = await CreateRenderQuery(fixtures, {
                Name: 'RR Variant Choice',
                SQL: `SELECT ID FROM ${T} WHERE ID <= 5 ORDER BY ID`,
                Variants: {
                    [platform]: `SELECT ID FROM ${T} WHERE ID <= 3 ORDER BY ID`,
                    [other]: 'SELECT this is not valid SQL on purpose'
                }
            }, ctx.User);
            await RefreshRenderQueries(ctx.User);
            const items = BuildRenderItems();
            const expected: ExpectedResult = { Rows: ids(items.filter(i => i.ID <= 3)), Ordered: true };
            FailOnMismatches('RR6', await RunCapAndPagingMatrix('variant', { QueryID: query.ID }, expected, ['ID'], ctx.User), 1);
        }
    },
    {
        Id: 'runquery-rendering.RR7',
        Name: 'RR7: ad-hoc SQL returns the right rows and totals under every MaxRows / StartRow combination',
        Fn: async (ctx): Promise<void> => {
            const items = BuildRenderItems();
            const expected: ExpectedResult = { Rows: ids(items.filter(i => i.Category === 'Alpha')), Ordered: true };
            const sql = `SELECT ID FROM ${T} WHERE Category = 'Alpha' ORDER BY ID`;
            FailOnMismatches('RR7', await RunCapAndPagingMatrix('ad-hoc', { SQL: sql }, expected, ['ID'], ctx.User), 1);
        }
    },
    {
        Id: 'runquery-rendering.RR8',
        Name: 'RR8: the spec path (ExecuteFromSpec) applies MaxRows, parameters and inline dependencies',
        Fn: async (ctx): Promise<void> => {
            const items = BuildRenderItems();
            const rq = new RunQuery();
            const capped = await rq.ExecuteFromSpec({ SQL: `SELECT ID FROM ${T} ORDER BY ID`, MaxRows: 7 }, ctx.User);
            const failures = compareRows('MaxRows 7', capped, ids(items.slice(0, 7)), ['ID'], true);
            const templated = await rq.ExecuteFromSpec({
                SQL: `SELECT ID FROM ${T} WHERE Category = {{ Category | sqlString }} ORDER BY ID`,
                UsesTemplate: true,
                Parameters: { Category: 'Gamma' },
                MaxRows: 1000
            }, ctx.User);
            failures.push(...compareRows('parameter', templated, ids(items.filter(i => i.Category === 'Gamma')), ['ID'], true));
            const dependency: QueryDependencySpec = {
                Name: 'Inline Dep', CategoryPath: '/Inline/', SQL: `SELECT ID, Category FROM ${T} WHERE ID <= 40`
            };
            const composed = await rq.ExecuteFromSpec({
                SQL: `SELECT d.ID FROM {{query:"Inline/Inline Dep"}} d WHERE d.Category = 'Delta' ORDER BY d.ID`,
                Dependencies: [dependency],
                MaxRows: 1000
            }, ctx.User);
            failures.push(...compareRows('inline dependency', composed, ids(items.filter(i => i.ID <= 40 && i.Category === 'Delta')), ['ID'], true));
            FailOnMismatches('RR8', failures, 3);
        }
    }
];

async function expectFailure(queryID: string, pattern: RegExp, label: string, user: UserInfo): Promise<void> {
    const result = await new RunQuery().RunQuery({ QueryID: queryID }, user);
    Assert(!result.Success, `${label}: the run must fail`);
    Assert(pattern.test(result.ErrorMessage ?? ''), `${label}: error must match ${pattern}, got: ${result.ErrorMessage}`);
}

for (const check of RunQueryRenderingChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('runquery-rendering', {
    Setup: setupRenderFixtures,
    Teardown: teardownRenderFixtures
});
