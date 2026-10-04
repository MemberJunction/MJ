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
import { Metadata, RunQuery, RunView } from '@memberjunction/core';
import type { DatabasePlatform, QueryDependencySpec, RunQueryResult, UserInfo } from '@memberjunction/core';
import { Assert, AssertEqual } from '@memberjunction/testing-integration';
import { QueryEngine } from '@memberjunction/core-entities';
import type { MJQueryPermissionEntity } from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';
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
        Name: 'RR Leading Semicolon CTE',
        SQL: `;WITH Picked AS (SELECT ID FROM ${T} WHERE ID % 3 = 0)\nSELECT ID FROM Picked WHERE ID <= 99 ORDER BY ID`,
        Platforms: ['sqlserver'],
        Columns: ['ID'],
        Ordered: true,
        Expect: items => ids(items.filter(i => i.ID % 3 === 0 && i.ID <= 99))
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
        Name: 'RR Union All Unordered',
        SQL: `SELECT ID FROM ${T} WHERE ID <= 5 UNION ALL SELECT ID FROM ${T} WHERE ID > 235`,
        Columns: ['ID'],
        Ordered: false,
        Expect: items => ids(items.filter(i => i.ID <= 5 || i.ID > 235))
    },
    {
        Name: 'RR Distinct Unordered',
        SQL: `SELECT DISTINCT Category FROM ${T}`,
        Columns: ['Category'],
        Ordered: false,
        Expect: items => [...new Set(items.map(i => i.Category))].map(c => ({ Category: c }))
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
        Name: 'RR PostgreSQL Quoted Strings With Comment Markers',
        SQL: `SELECT ID, $$a -- b /* c */$$ AS Dollar, E'it\\'s -- not a comment' AS Escaped FROM ${T} WHERE ID <= 12 -- a real comment\nORDER BY ID`,
        Platforms: ['postgresql'],
        Columns: ['ID', 'Dollar', 'Escaped'],
        Ordered: true,
        Expect: items => items.filter(i => i.ID <= 12).map(i => ({ ID: i.ID, Dollar: 'a -- b /* c */', Escaped: "it's -- not a comment" }))
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

// ─── Query shapes with a cap or trailing clause of their own ──────────────────

/** The first `n` fixture rows by ID, skipping `skip`. */
function firstIds(items: RenderItem[], n: number, skip = 0): ComparableRow[] {
    return ids(items.slice(skip, skip + n));
}

/** IDs from `start` up the ParentID chain to the root, with their distance from `start`. */
function ancestorChain(items: RenderItem[], start: number): ComparableRow[] {
    const byId = new Map(items.map(i => [i.ID, i]));
    const rows: ComparableRow[] = [];
    let current = byId.get(start);
    for (let depth = 0; current; depth++) {
        rows.push({ ID: current.ID, Depth: depth });
        current = current.ParentID === null ? undefined : byId.get(current.ParentID);
    }
    return rows;
}

/**
 * Shapes whose own cap or trailing clause the paging step must respect. Under every MaxRows /
 * StartRow combination the query's own cap stays in force: the smaller of the two wins, and the
 * total is the size of the capped result.
 */
const OWN_CAP_CASES: RenderCase[] = [
    {
        Name: 'RR Own TOP / LIMIT',
        SQL: `SELECT TOP 7 ID FROM ${T} ORDER BY ID`,
        Variants: { postgresql: `SELECT ID FROM ${T} ORDER BY ID LIMIT 7` },
        Columns: ['ID'], Ordered: true,
        Expect: items => firstIds(items, 7)
    },
    {
        Name: 'RR Own TOP (n) DISTINCT',
        SQL: `SELECT DISTINCT TOP (3) Category FROM ${T} ORDER BY Category`,
        Variants: { postgresql: `SELECT DISTINCT Category FROM ${T} ORDER BY Category LIMIT 3` },
        Columns: ['Category'], Ordered: true,
        Expect: items => [...new Set(items.map(i => i.Category))].sort().slice(0, 3).map(c => ({ Category: c }))
    },
    {
        Name: 'RR Own TOP PERCENT',
        SQL: `SELECT TOP 5 PERCENT ID FROM ${T} ORDER BY ID`,
        Platforms: ['sqlserver'],
        Columns: ['ID'], Ordered: true,
        Expect: items => firstIds(items, Math.ceil(items.length * 0.05))
    },
    {
        Name: 'RR Own WITH TIES',
        SQL: `SELECT TOP 3 WITH TIES ID, Category FROM ${T} ORDER BY Category, ID`,
        Variants: { postgresql: `SELECT ID, Category FROM ${T} ORDER BY Category, ID FETCH FIRST 3 ROWS WITH TIES` },
        Columns: ['ID'], Ordered: true,
        Expect: items => ids([...items].sort((a, b) => a.Category.localeCompare(b.Category) || a.ID - b.ID).slice(0, 3))
    },
    {
        Name: 'RR Own SELECT ALL TOP',
        SQL: `  SELECT ALL TOP 4 ID FROM ${T} ORDER BY ID`,
        Variants: { postgresql: `  SELECT ALL ID FROM ${T} ORDER BY ID LIMIT 4` },
        Columns: ['ID'], Ordered: true,
        Expect: items => firstIds(items, 4)
    },
    {
        Name: 'RR Own OFFSET FETCH',
        SQL: `SELECT ID FROM ${T} ORDER BY ID OFFSET 5 ROWS FETCH NEXT 10 ROWS ONLY`,
        Variants: { postgresql: `SELECT ID FROM ${T} ORDER BY ID LIMIT 10 OFFSET 5` },
        Columns: ['ID'], Ordered: true,
        Expect: items => firstIds(items, 10, 5)
    },
    {
        Name: 'RR Own OFFSET Only',
        SQL: `SELECT ID FROM ${T} WHERE ID <= 40 ORDER BY ID OFFSET 30 ROWS`,
        Variants: { postgresql: `SELECT ID FROM ${T} WHERE ID <= 40 ORDER BY ID OFFSET 30` },
        Columns: ['ID'], Ordered: true,
        Expect: items => ids(items.filter(i => i.ID > 30 && i.ID <= 40))
    },
    {
        Name: 'RR CTE With TOP',
        SQL: `-- a comment before the WITH\nWITH c AS (SELECT ID, Category FROM ${T})\nSELECT TOP 12 ID FROM c WHERE Category <> 'Alpha' ORDER BY ID`,
        Variants: { postgresql: `-- a comment before the WITH\nWITH c AS (SELECT ID, Category FROM ${T})\nSELECT ID FROM c WHERE Category <> 'Alpha' ORDER BY ID LIMIT 12` },
        Columns: ['ID'], Ordered: true,
        Expect: items => ids(items.filter(i => i.Category !== 'Alpha').slice(0, 12))
    },
    {
        Name: 'RR OPTION Hint',
        SQL: `SELECT ID FROM ${T} WHERE ID <= 30 ORDER BY ID OPTION (RECOMPILE)`,
        Platforms: ['sqlserver'],
        Columns: ['ID'], Ordered: true,
        Expect: items => ids(items.filter(i => i.ID <= 30))
    },
    {
        Name: 'RR Parser Rejects With TOP',
        SQL: `SELECT TOP 9 ID, TRY_CAST(Score AS INT) AS ScoreValue FROM ${T} ORDER BY ID`,
        Platforms: ['sqlserver'],
        Columns: ['ID', 'ScoreValue'], Ordered: true,
        Expect: items => items.slice(0, 9).map(i => ({ ID: i.ID, ScoreValue: i.Score }))
    },
    {
        Name: 'RR Recursive CTE',
        SQL: `WITH chain AS (SELECT ID, ParentID, 0 AS Depth FROM ${T} WHERE ID = 200 UNION ALL SELECT p.ID, p.ParentID, c.Depth + 1 FROM ${T} p JOIN chain c ON p.ID = c.ParentID)\nSELECT ID, Depth FROM chain ORDER BY Depth`,
        Variants: { postgresql: `WITH RECURSIVE chain AS (SELECT ID, ParentID, 0 AS Depth FROM ${T} WHERE ID = 200 UNION ALL SELECT p.ID, p.ParentID, c.Depth + 1 FROM ${T} p JOIN chain c ON p.ID = c.ParentID)\nSELECT ID, Depth FROM chain ORDER BY Depth` },
        Columns: ['ID', 'Depth'], Ordered: true,
        Expect: items => ancestorChain(items, 200)
    },
    {
        Name: 'RR ORDER BY After Literal',
        SQL: `SELECT ID FROM ${T} WHERE Category = 'Beta'ORDER BY ID DESC`,
        Columns: ['ID'], Ordered: true,
        Expect: items => ids(items.filter(i => i.Category === 'Beta').reverse())
    },
    {
        Name: 'RR VALUES Column List',
        SQL: 'SELECT N FROM (VALUES (1), (2), (3), (4), (5), (6), (7)) AS v(N) ORDER BY N',
        Columns: ['N'], Ordered: true,
        Expect: () => [1, 2, 3, 4, 5, 6, 7].map(n => ({ N: n }))
    },
    {
        Name: 'RR Ordered Aggregate',
        SQL: `SELECT Category, STRING_AGG(CAST(ID AS VARCHAR(10)), ',') WITHIN GROUP (ORDER BY ID) AS Ids FROM ${T} WHERE ID <= 20 GROUP BY Category ORDER BY Category`,
        Variants: { postgresql: `SELECT Category, STRING_AGG(ID::text, ',' ORDER BY ID) AS Ids FROM ${T} WHERE ID <= 20 GROUP BY Category ORDER BY Category` },
        Columns: ['Category', 'Ids'], Ordered: true,
        Expect: items => {
            const byCategory = new Map<string, number[]>();
            for (const i of items.filter(item => item.ID <= 20)) byCategory.set(i.Category, [...(byCategory.get(i.Category) ?? []), i.ID]);
            return [...byCategory.keys()].sort().map(c => ({ Category: c, Ids: (byCategory.get(c) ?? []).join(',') }));
        }
    },
    {
        Name: 'RR Quoted CTE Names',
        SQL: `WITH [First Set] AS (SELECT ID FROM ${T} WHERE ID <= 30), [Second Set] AS (SELECT ID FROM [First Set] WHERE ID % 3 = 0)\nSELECT ID FROM [Second Set] ORDER BY ID`,
        Variants: { postgresql: `WITH "First Set" AS (SELECT ID FROM ${T} WHERE ID <= 30), "Second Set" AS (SELECT ID FROM "First Set" WHERE ID % 3 = 0)\nSELECT ID FROM "Second Set" ORDER BY ID` },
        Columns: ['ID'], Ordered: true,
        Expect: items => ids(items.filter(i => i.ID <= 30 && i.ID % 3 === 0))
    },
    {
        Name: 'RR Concatenation And Colons',
        SQL: `SELECT ID, Category + ':' + CAST(ID AS VARCHAR(10)) AS Tag, 'x:y' AS Lit FROM ${T} WHERE ID <= 15 ORDER BY ID`,
        Variants: { postgresql: `SELECT ID, Category || ':' || ID::text AS Tag, 'x:y'::text AS Lit FROM ${T} WHERE ID <= 15 ORDER BY ID` },
        Columns: ['ID', 'Tag', 'Lit'], Ordered: true,
        Expect: items => items.filter(i => i.ID <= 15).map(i => ({ ID: i.ID, Tag: `${i.Category}:${i.ID}`, Lit: 'x:y' }))
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
    `{% endif %}{% if NoteIn %}AND Notes IN {{ NoteIn | sqlIn }}`,
    `{% endif %}{% if Contains %}AND Notes LIKE {{ Contains | sqlLikeContains }}`,
    `{% endif %}{% if OnlyActive %}AND IsActive = {{ OnlyActive | sqlBoolean }}`,
    `{% endif %}ORDER BY ID`
].join('\n');

const PARAM_QUERIES: RenderQueryDefinition[] = [
    { Name: 'RR Param Filters', SQL: PARAM_FILTER_SQL },
    { Name: 'RR Param Required', SQL: `SELECT ID FROM ${T} WHERE Category = {{ Category | sqlString }} ORDER BY ID` },
    { Name: 'RR Param Default', SQL: `SELECT ID FROM ${T} WHERE ID <= {{ MaxId | default(7) | sqlNumber }} ORDER BY ID` }
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
    { Label: 'text outside the code page (Japanese)', Parameters: { Exact: '日本語のメモ' }, Matches: i => i.Notes === '日本語のメモ' },
    { Label: 'sqlIn with Japanese text', Parameters: { NoteIn: ['日本語のメモ', 'SELECT'] }, Matches: i => i.Notes === '日本語のメモ' || i.Notes === 'SELECT' },
    { Label: 'LIKE with square brackets', Parameters: { Contains: '[bracketed]' }, Matches: i => i.Notes.includes('[bracketed]') },
    { Label: 'LIKE with a backslash', Parameters: { Contains: 'a\\b' }, Matches: i => i.Notes.includes('a\\b') },
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
    { Name: 'RR Dep Literal Order', Reusable: true, SQL: `SELECT ID FROM ${T} WHERE Category = 'Gamma'ORDER BY ID` },
    {
        Name: 'RR Dep Recursive', Reusable: true,
        SQL: `WITH chain AS (SELECT ID, ParentID, 0 AS Depth FROM ${T} WHERE ID = 200 UNION ALL SELECT p.ID, p.ParentID, c.Depth + 1 FROM ${T} p JOIN chain c ON p.ID = c.ParentID)\nSELECT ID, Depth FROM chain`,
        Variants: { postgresql: `WITH RECURSIVE chain AS (SELECT ID, ParentID, 0 AS Depth FROM ${T} WHERE ID = 200 UNION ALL SELECT p.ID, p.ParentID, c.Depth + 1 FROM ${T} p JOIN chain c ON p.ID = c.ParentID)\nSELECT ID, Depth FROM chain` }
    },
    { Name: 'RR Dep Not Reusable', Reusable: false, SQL: `SELECT ID FROM ${T}` },
    {
        Name: 'RR Dep Own Cap', Reusable: true,
        SQL: `SELECT TOP 30 ID FROM ${T} ORDER BY ID`,
        Variants: { postgresql: `SELECT ID FROM ${T} ORDER BY ID LIMIT 30` }
    },
    {
        Name: 'RR Dep Parser Rejects', Reusable: true,
        SQL: `SELECT ID, TRY_CAST(Score AS INT) AS ScoreInt FROM ${T} WHERE ID <= 40`,
        Variants: { postgresql: `SELECT ID, Score::int AS ScoreInt FROM ${T} WHERE ID <= 40` }
    },
    {
        Name: 'RR Dep Template', Reusable: true,
        SQL: `SELECT ID, Category FROM ${T} WHERE ID <= {{ Limit | default(10) | sqlNumber }}{% if Cat %} AND Category = {{ Cat | sqlString }}{% endif %}`
    },
    { Name: 'RR Dep Token In Comment', Reusable: true, SQL: `-- built like {{query:"{P}/RR Dep Base"}}\nSELECT ID FROM ${T} WHERE ID <= 8` },
    {
        Name: 'RR Dep Variant', Reusable: true,
        SQL: `SELECT ID, Category + '!' AS Tag FROM ${T} WHERE ID <= 6`,
        Variants: { postgresql: `SELECT ID, Category || '!' AS Tag FROM ${T} WHERE ID <= 6` }
    }
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
        Name: 'RR Comp Dependency Ordered After Literal',
        SQL: `SELECT d.ID FROM {{query:"{P}/RR Dep Literal Order"}} d WHERE d.ID > 100 ORDER BY d.ID`,
        Columns: ['ID'], Ordered: true,
        Expect: items => ids(items.filter(i => i.Category === 'Gamma' && i.ID > 100))
    },
    {
        Name: 'RR Comp Token Also In A Comment',
        SQL: `-- reads {{query:"{P}/RR Dep Base"}}\nSELECT b.ID FROM {{query:"{P}/RR Dep Base"}} b WHERE b.ID <= 15 ORDER BY b.ID`,
        Columns: ['ID'], Ordered: true,
        Expect: items => ids(items.filter(i => i.ID <= 15))
    },
    {
        Name: 'RR Comp Outer Comment Then WITH',
        SQL: `-- header comment\nWITH Picked AS (SELECT ID FROM {{query:"{P}/RR Dep Base"}} WHERE ID <= 20)\nSELECT p.ID FROM Picked p ORDER BY p.ID`,
        Columns: ['ID'], Ordered: true,
        Expect: items => ids(items.filter(i => i.ID <= 20))
    },
    {
        Name: 'RR Comp Outer Recursive',
        SQL: `WITH chain AS (SELECT ID, ParentID, 0 AS Depth FROM {{query:"{P}/RR Dep Base"}} b WHERE b.ID = 200 UNION ALL SELECT p.ID, p.ParentID, c.Depth + 1 FROM {{query:"{P}/RR Dep Base"}} p JOIN chain c ON p.ID = c.ParentID)\nSELECT ID, Depth FROM chain ORDER BY Depth`,
        Variants: { postgresql: `WITH RECURSIVE chain AS (SELECT ID, ParentID, 0 AS Depth FROM {{query:"{P}/RR Dep Base"}} b WHERE b.ID = 200 UNION ALL SELECT p.ID, p.ParentID, c.Depth + 1 FROM {{query:"{P}/RR Dep Base"}} p JOIN chain c ON p.ID = c.ParentID)\nSELECT ID, Depth FROM chain ORDER BY Depth` },
        Columns: ['ID', 'Depth'], Ordered: true,
        Expect: items => ancestorChain(items, 200)
    },
    {
        Name: 'RR Comp Recursive Dependency',
        SQL: `SELECT r.ID, r.Depth FROM {{query:"{P}/RR Dep Recursive"}} r ORDER BY r.Depth`,
        Columns: ['ID', 'Depth'], Ordered: true,
        Expect: items => ancestorChain(items, 200)
    },
    {
        Name: 'RR Comp Unordered',
        SQL: `SELECT b.ID FROM {{query:"{P}/RR Dep Base"}} b WHERE b.Category = 'Delta'`,
        Columns: ['ID'], Ordered: false,
        Expect: items => ids(items.filter(i => i.Category === 'Delta'))
    },
    {
        Name: 'RR Comp Static Parameter',
        SQL: `SELECT d.ID FROM {{query:"{P}/RR Dep Param(Cat='Gamma')"}} d ORDER BY d.ID`,
        Columns: ['ID'], Ordered: true,
        Expect: items => ids(items.filter(i => i.Category === 'Gamma'))
    },
    {
        Name: 'RR Comp Distinct Dependency',
        SQL: `SELECT d.Category FROM {{query:"{P}/RR Dep Distinct"}} d ORDER BY d.Category`,
        Columns: ['Category'], Ordered: true,
        Expect: items => [...new Set(items.map(i => i.Category))].sort().map(c => ({ Category: c }))
    },
    {
        Name: 'RR Comp Commented Dependency',
        SQL: `SELECT c.ID FROM {{query:"{P}/RR Dep Comment"}} c ORDER BY c.ID`,
        Columns: ['ID'], Ordered: true,
        Expect: items => ids(items.filter(i => i.ID >= 100 && i.ID <= 110))
    },
    {
        Name: 'RR Comp Dependency Own Cap',
        SQL: `SELECT c.ID FROM {{query:"{P}/RR Dep Own Cap"}} c ORDER BY c.ID`,
        Columns: ['ID'], Ordered: true,
        Expect: items => firstIds(items, 30)
    },
    {
        Name: 'RR Comp Parser Rejects Dependency',
        SQL: `SELECT r.ID, r.ScoreInt FROM {{query:"{P}/RR Dep Parser Rejects"}} r ORDER BY r.ID`,
        Columns: ['ID', 'ScoreInt'], Ordered: true,
        Expect: items => items.filter(i => i.ID <= 40).map(i => ({ ID: i.ID, ScoreInt: i.Score }))
    },
    {
        Name: 'RR Comp Template Dependency Defaults',
        SQL: `SELECT t.ID FROM {{query:"{P}/RR Dep Template"}} t ORDER BY t.ID`,
        Columns: ['ID'], Ordered: true,
        Expect: items => ids(items.filter(i => i.ID <= 10))
    },
    {
        Name: 'RR Comp Dependency Token In Comment',
        SQL: `SELECT d.ID FROM {{query:"{P}/RR Dep Token In Comment"}} d ORDER BY d.ID`,
        Columns: ['ID'], Ordered: true,
        Expect: items => ids(items.filter(i => i.ID <= 8))
    },
    {
        Name: 'RR Comp Variant Dependency',
        SQL: `SELECT v.ID, v.Tag FROM {{query:"{P}/RR Dep Variant"}} v ORDER BY v.ID`,
        Columns: ['ID', 'Tag'], Ordered: true,
        Expect: items => items.filter(i => i.ID <= 6).map(i => ({ ID: i.ID, Tag: `${i.Category}!` }))
    },
    {
        Name: 'RR Comp In Join',
        SQL: `SELECT t.ID FROM ${T} t JOIN {{query:"{P}/RR Dep Ordered"}} o ON o.ID = t.ID WHERE t.Category = 'Alpha' ORDER BY t.ID`,
        Columns: ['ID'], Ordered: true,
        Expect: items => ids(items.filter(i => i.ID <= 50 && i.Category === 'Alpha'))
    },
    {
        Name: 'RR Comp Token In String Literal',
        SQL: `SELECT b.ID, '{{query:"Nowhere/Nothing"}}' AS Note FROM {{query:"{P}/RR Dep Base"}} b WHERE b.ID <= 4 ORDER BY b.ID`,
        Columns: ['ID', 'Note'], Ordered: true,
        Expect: items => items.filter(i => i.ID <= 4).map(i => ({ ID: i.ID, Note: '{{query:"Nowhere/Nothing"}}' }))
    }
];

const PASS_THROUGH_SQL = `SELECT d.ID FROM {{query:"{P}/RR Dep Param(Cat=OuterCat)"}} d ORDER BY d.ID`;

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

/** A query definition with `{P}` replaced in its SQL and in every platform variant. */
function withPathEverywhere(definition: RenderQueryDefinition, path: string): RenderQueryDefinition {
    const variants: Partial<Record<DatabasePlatform, string>> = {};
    for (const [platform, sql] of Object.entries(definition.Variants ?? {}) as Array<[DatabasePlatform, string]>) {
        variants[platform] = withPath(sql, path);
    }
    return { ...definition, SQL: withPath(definition.SQL, path), Variants: variants };
}

async function setupRenderFixtures(ctx: IntegrationCheckContext): Promise<void> {
    await CreateRenderTable(ctx);
    const fixtures: RenderFixtures = renderFixtures = {
        Category: await CreateRenderCategory(ctx.User),
        Queries: new Map(),
        Variants: []
    };
    const platform = RenderPlatform(ctx);
    for (const c of [...casesFor(PLAIN_CASES, platform), ...casesFor(OWN_CAP_CASES, platform), ...PARAM_QUERIES]) {
        await CreateRenderQuery(fixtures, c, ctx.User);
    }
    // The category path is only known once the engine has seen a query in the category.
    await RefreshRenderQueries(ctx.User);
    const path = RenderCategoryPath(fixtures);
    for (const dep of COMPOSITION_LIBRARY) {
        await CreateRenderQuery(fixtures, withPathEverywhere(dep, path), ctx.User);
    }
    for (const c of casesFor(COMPOSED_CASES, platform)) {
        await CreateRenderQuery(fixtures, withPathEverywhere(c, path), ctx.User);
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
        Name: 'RR3: a required parameter that is missing fails the run; a template default applies when its parameter is omitted',
        Fn: async (ctx): Promise<void> => {
            const items = BuildRenderItems();
            const missing = await new RunQuery().RunQuery({ QueryID: savedQueryID('RR Param Required') }, ctx.User);
            AssertEqual(missing.Success, false, 'a required parameter that is omitted must fail the run');
            const supplied = await new RunQuery().RunQuery({ QueryID: savedQueryID('RR Param Required'), Parameters: { Category: 'Beta' } }, ctx.User);
            const failures = compareRows('required supplied', supplied, ids(items.filter(i => i.Category === 'Beta')), ['ID'], true);
            const defaulted = await new RunQuery().RunQuery({ QueryID: savedQueryID('RR Param Default') }, ctx.User);
            failures.push(...compareRows('default applied', defaulted, ids(items.filter(i => i.ID <= 7)), ['ID'], true));
            const overridden = await new RunQuery().RunQuery({ QueryID: savedQueryID('RR Param Default'), Parameters: { MaxId: 12 } }, ctx.User);
            failures.push(...compareRows('default overridden', overridden, ids(items.filter(i => i.ID <= 12)), ['ID'], true));
            FailOnMismatches('RR3', failures, 3);
        }
    },
    {
        Id: 'runquery-rendering.RR4',
        Name: 'RR4: composed queries — one, two, nested three deep, repeated, diamond, parameterized, CTE-bearing, DISTINCT, UNION and commented dependencies — return the right rows under every MaxRows / StartRow combination',
        Fn: async (ctx): Promise<void> => {
            const cases = casesFor(COMPOSED_CASES, RenderPlatform(ctx));
            FailOnMismatches('RR4', await runCaseMatrix(cases, ctx.User), cases.length);
        }
    },
    {
        Id: 'runquery-rendering.RR5',
        Name: 'RR5: composition failures name the problem — a missing dependency, a dependency that is not reusable, a circular reference, a dependency the caller may not run',
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
            await expectDeniedDependencyFailure(fixtures, path, ctx.User);
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
    },
    {
        Id: 'runquery-rendering.RR9',
        Name: 'RR9: caller-supplied SQL must be a single read query and cannot leave session settings behind',
        Fn: async (ctx): Promise<void> => {
            const rq = new RunQuery();
            const platform = RenderPlatform(ctx);
            const setStatement = platform === 'postgresql' ? "SET statement_timeout = '3s'" : 'SET LOCK_TIMEOUT 0';
            const set = await rq.ExecuteFromSpec({ SQL: setStatement, MaxRows: 10 }, ctx.User);
            Assert(!set.Success && /only a single read query/i.test(set.ErrorMessage ?? ''), `the spec path must refuse ${setStatement}, got: ${set.Success ? 'success' : set.ErrorMessage}`);

            const into = await rq.RunQuery({ SQL: `SELECT * INTO ${T}Copy FROM ${T}` }, ctx.User);
            Assert(!into.Success && /SELECT … INTO/.test(into.ErrorMessage ?? ''), `ad-hoc SELECT … INTO must be refused, got: ${into.Success ? 'success' : into.ErrorMessage}`);
            const copyCheck = await rq.RunQuery({ SQL: `SELECT COUNT(*) AS N FROM ${T} WHERE 1 = 0` }, ctx.User);
            Assert(copyCheck.Success, 'the fixture table must still be readable');

            if (platform !== 'postgresql') return;
            const changed = await rq.ExecuteFromSpec({ SQL: "SELECT set_config('statement_timeout', '3s', false) AS Changed", MaxRows: 1 }, ctx.User);
            Assert(changed.Success, `set_config call failed: ${changed.ErrorMessage}`);
            const failures: string[] = [];
            for (let i = 0; i < 10; i++) {
                const read = await rq.ExecuteFromSpec({ SQL: "SELECT current_setting('statement_timeout') AS StatementTimeout", MaxRows: 1 }, ctx.User);
                const value = read.Success ? String(ProjectRows(read.Results, ['StatementTimeout'])[0]?.StatementTimeout) : `error: ${read.ErrorMessage}`;
                if (value === '3s') failures.push(`spec call ${i + 1} saw the 3s statement_timeout set by an earlier call`);
            }
            FailOnMismatches('RR9 session isolation', failures, 10);
        }
    },
    {
        Id: 'runquery-rendering.RR10',
        Name: 'RR10: a composed query passes its own parameter through to a dependency',
        Fn: async (ctx): Promise<void> => {
            const fixtures = requireFixtures();
            const query = await CreateRenderQuery(fixtures, {
                Name: 'RR Comp Pass Through',
                SQL: withPath(PASS_THROUGH_SQL, RenderCategoryPath(fixtures))
            }, ctx.User);
            await RefreshRenderQueries(ctx.User);
            const items = BuildRenderItems();
            const expected: ExpectedResult = { Rows: ids(items.filter(i => i.Category === 'Beta')), Ordered: true };
            const failures = await RunCapAndPagingMatrix('pass-through', { QueryID: query.ID, Parameters: { OuterCat: 'Beta' } }, expected, ['ID'], ctx.User);
            FailOnMismatches('RR10', failures, 1);
        }
    },
    {
        Id: 'runquery-rendering.RR11',
        Name: 'RR11: query shapes with their own cap or trailing clause keep it under every MaxRows / StartRow combination — the smaller cap wins and the total follows it',
        Fn: async (ctx): Promise<void> => {
            const cases = casesFor(OWN_CAP_CASES, RenderPlatform(ctx));
            FailOnMismatches('RR11', await runCaseMatrix(cases, ctx.User), cases.length);
        }
    },
    {
        Id: 'runquery-rendering.RR12',
        Name: 'RR12: the row cap (spec path, MaxRows without paging) returns exactly the first rows of every ordered query shape',
        Fn: async (ctx): Promise<void> => {
            const platform = RenderPlatform(ctx);
            const items = BuildRenderItems();
            const cases = casesFor([...PLAIN_CASES, ...OWN_CAP_CASES], platform).filter(c => c.Ordered);
            const failures: string[] = [];
            for (const c of cases) {
                const expected = c.Expect(items);
                for (const cap of [1, 4, expected.length + 3]) {
                    const sql = c.Variants?.[platform] ?? c.SQL;
                    const result = await new RunQuery().ExecuteFromSpec({ SQL: sql, MaxRows: cap }, ctx.User);
                    failures.push(...compareRows(`${c.Name} [MaxRows ${cap}]`, result, expected.slice(0, cap), c.Columns, true));
                }
            }
            if (platform === 'sqlserver') {
                const sql = `SELECT TRY_CAST(t.ID AS INT) AS ID, (SELECT c.Category FROM ${T} c WHERE c.ID = t.ID FOR JSON PATH) AS J FROM ${T} t ORDER BY t.ID`;
                const result = await new RunQuery().ExecuteFromSpec({ SQL: sql, MaxRows: 5 }, ctx.User);
                failures.push(...compareRows('FOR JSON in a subquery [MaxRows 5]', result, ids(items.slice(0, 5)), ['ID'], true));
            }
            FailOnMismatches('RR12', failures, cases.length + 1);
        }
    },
    {
        Id: 'runquery-rendering.RR13',
        Name: 'RR13: a templated query that references the same dependency twice saves its dependency once and keeps its template parameters',
        Fn: async (ctx): Promise<void> => {
            const fixtures = requireFixtures();
            const path = RenderCategoryPath(fixtures);
            const query = await CreateRenderQuery(fixtures, {
                Name: 'RR Comp Same Dependency Twice Templated',
                SQL: `SELECT a.ID FROM {{query:"${path}/RR Dep Base"}} a JOIN {{query:"${path}/RR Dep Base"}} b ON b.ID = a.ID WHERE a.ID <= {{ MaxId | sqlNumber }} ORDER BY a.ID`
            }, ctx.User);
            await RefreshRenderQueries(ctx.User);
            const dependencies = await new RunView().RunView<{ ID: string }>({
                EntityName: 'MJ: Query Dependencies', ExtraFilter: `QueryID='${query.ID}'`, Fields: ['ID'], ResultType: 'simple'
            }, ctx.User);
            const failures: string[] = [];
            if (dependencies.Results.length !== 1) failures.push(`expected one dependency row, found ${dependencies.Results.length}`);
            const reloaded = QueryEngine.Instance.Queries.find(q => UUIDsEqual(q.ID, query.ID));
            if (reloaded?.UsesTemplate !== true) failures.push(`expected UsesTemplate true after save, found ${reloaded?.UsesTemplate}`);
            const result = await new RunQuery().RunQuery({ QueryID: query.ID, Parameters: { MaxId: 9 } }, ctx.User);
            failures.push(...compareRows('run with MaxId 9', result, ids(BuildRenderItems().filter(i => i.ID <= 9)), ['ID'], true));
            FailOnMismatches('RR13', failures, 1);
        }
    }
];

/**
 * Restricts a dependency to a role the caller does not hold, then expects a query composing it to
 * fail on permissions. The run is refused for the composing query itself, since running it means
 * running its dependencies. The restriction is removed afterwards so teardown can delete the query.
 */
async function expectDeniedDependencyFailure(fixtures: RenderFixtures, path: string, user: UserInfo): Promise<void> {
    const role = await roleNotHeldBy(user);
    if (!role) throw new Error('a role the test user does not hold must exist to restrict a dependency');
    const restricted = await CreateRenderQuery(fixtures, { Name: 'RR Dep Restricted', Reusable: true, SQL: `SELECT ID FROM ${T}` }, user);
    const composed = await CreateRenderQuery(fixtures, { Name: 'RR Comp Restricted', SQL: `SELECT r.ID FROM {{query:"${path}/RR Dep Restricted"}} r` }, user);
    const permission = await new Metadata().GetEntityObject<MJQueryPermissionEntity>('MJ: Query Permissions', user);
    permission.QueryID = restricted.ID;
    permission.RoleID = role.ID;
    Assert(await permission.Save(), `restricting the dependency failed: ${permission.LatestResult?.CompleteMessage}`);
    try {
        await RefreshRenderQueries(user);
        await expectFailure(composed.ID, /does not have permission to run query 'RR Comp Restricted'/i, `dependency restricted to role '${role.Name}'`, user);
    } finally {
        if (!await permission.Delete()) console.error(`runquery-rendering: removing the dependency restriction failed: ${permission.LatestResult?.CompleteMessage}`);
        await RefreshRenderQueries(user);
    }
}

/** Any role the user does not hold. */
async function roleNotHeldBy(user: UserInfo): Promise<{ ID: string; Name: string } | undefined> {
    const roles = await new RunView().RunView<{ ID: string; Name: string }>({
        EntityName: 'MJ: Roles', Fields: ['ID', 'Name'], ResultType: 'simple'
    }, user);
    return roles.Results.find(r => !user.UserRoles.some(ur => UUIDsEqual(ur.RoleID, r.ID)));
}

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
