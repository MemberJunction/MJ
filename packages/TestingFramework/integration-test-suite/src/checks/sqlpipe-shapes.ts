/**
 * sqlpipe-shapes.ts — the query-shape dimension of the SQL pipeline scenario matrix.
 *
 * A shape is a query written around two holes: the row source (`Src`, read through alias `s`) and
 * a predicate (`Pred`). The same shape builds the MJ query (whose source may be a composition and
 * whose predicate may be a template) and the plain-SQL oracle (whose source is a CTE or table and
 * whose predicate holds literal values), so the two must return the same rows.
 *
 * Text uses the logical column tokens of {@link Sql.Text} (`{s.Score}`) and bracket quoting.
 */
import type { DatabasePlatform } from '@memberjunction/core';
import type { LogicalColumn, SchemaKey, Sql } from './sqlpipe-schema';
import { MOCK_EXT_SCHEMA, MOCK_SCHEMA } from './sqlpipe-schema';

/** What a shape is built around. */
export interface ShapeInput {
    readonly Sql: Sql;
    /** The row source, read as `${Src} s`. */
    readonly Src: string;
    /** The source's base predicate (alias `s`), or `1 = 1` when the source applies its own. */
    readonly Base: string;
    /** The scenario predicate (alias `s`). */
    readonly Pred: string;
    /** The source table itself, for shapes that read it a second time (FOR JSON). */
    readonly Table: string;
}

/** A built shape: its own CTEs (`name AS (…)`), whether one is recursive, and the final query. */
export interface ShapeText {
    readonly Ctes: string[];
    readonly Recursive: boolean;
    readonly Body: string;
    /** Text the MJ query starts with that the oracle leaves out (a comment, a semicolon). */
    readonly MJPrefix?: string;
    /** The MJ body when it differs from the oracle's (comments inside it). */
    readonly MJBody?: string;
}

/** A query shape. */
export interface ShapeDef {
    readonly Key: string;
    readonly Platforms?: readonly DatabasePlatform[];
    readonly Schemas?: readonly SchemaKey[];
    /** Whether the shape's ORDER BY fixes the row order (unique sort key). */
    readonly Ordered: boolean;
    /** Which rows come back is not fixed (a cap with no ORDER BY): only the row count is compared. */
    readonly CountOnly?: boolean;
    /** The shape caps its own rows (TOP, LIMIT, PERCENT, WITH TIES). */
    readonly OwnCap?: boolean;
    /** Ad hoc SQL of this shape is refused (the strict screen for caller SQL); the message contains this text. */
    readonly AdhocRefusal?: string;
    /** A save of this shape is refused; the message contains this text. */
    readonly Refusal?: string;
    /** Output columns that pass a source column straight through (named as the source names it), or `*` for all. */
    readonly PassThrough: readonly LogicalColumn[] | '*';
    /** Output columns that are computed: no entity field source. */
    readonly Computed?: readonly string[];
    Build(input: ShapeInput): ShapeText;
}

function body(text: string): ShapeText {
    return { Ctes: [], Recursive: false, Body: text };
}

function where(i: ShapeInput): string {
    return `WHERE ${i.Base} AND (${i.Pred})`;
}

const CORE_SHAPES: ShapeDef[] = [
    { Key: 'plain', Ordered: true, PassThrough: ['ID', 'Name', 'Score'],
        Build: i => body(`SELECT {s.ID}, {s.Name}, {s.Score} FROM ${i.Src} s ${where(i)} ORDER BY {s.ID}`) },
    { Key: 'cte', Ordered: true, PassThrough: ['ID', 'Name', 'Score'],
        Build: i => ({ Ctes: [`[base] AS (SELECT {s.ID}, {s.Name}, {s.Score} FROM ${i.Src} s ${where(i)})`], Recursive: false,
            Body: 'SELECT {b.ID}, {b.Name}, {b.Score} FROM [base] b ORDER BY {b.ID}' }) },
    { Key: 'chainedCte', Ordered: true, PassThrough: ['ID', 'Name', 'Score'],
        Build: i => ({ Ctes: [`[c1] AS (SELECT {s.ID}, {s.Name}, {s.Score} FROM ${i.Src} s ${where(i)})`,
            '[c2] AS (SELECT {c.ID}, {c.Name}, {c.Score} FROM [c1] c WHERE {c.Score} >= 0)'], Recursive: false,
            Body: 'SELECT {d.ID}, {d.Name}, {d.Score} FROM [c2] d ORDER BY {d.ID}' }) },
    { Key: 'derived', Ordered: true, PassThrough: ['ID', 'Name'],
        Build: i => body(`SELECT {d.ID}, {d.Name} FROM (SELECT {s.ID}, {s.Name}, {s.Score} FROM ${i.Src} s ${where(i)}) d WHERE {d.Score} >= 0 ORDER BY {d.ID}`) },
    { Key: 'values', Ordered: true, PassThrough: ['ID', 'Name'], Computed: ['Label'],
        Build: i => body(`SELECT {s.ID}, {s.Name}, v.[Label] FROM ${i.Src} s JOIN (VALUES (0, 'zero'), (1, 'one'), (2, 'two')) AS v ([K], [Label]) ` +
            `ON v.[K] = {s.Score} % 3 ${where(i)} ORDER BY {s.ID}`) },
    { Key: 'union', Ordered: true, PassThrough: [],
        Build: i => body(`SELECT {s.ID}, {s.Name} FROM ${i.Src} s ${where(i)} AND {s.Score} < ${i.Sql.N(30)} UNION ` +
            `SELECT {s.ID}, {s.Name} FROM ${i.Src} s ${where(i)} AND {s.Score} >= ${i.Sql.N(80)} ORDER BY [ID]`) },
    { Key: 'except', Ordered: true, PassThrough: [],
        Build: i => body(`SELECT {s.ID} FROM ${i.Src} s ${where(i)} EXCEPT SELECT {s.ID} FROM ${i.Src} s WHERE ${i.Base} AND {s.Score} >= ${i.Sql.N(50)} ORDER BY [ID]`) },
    { Key: 'distinct', Ordered: true, PassThrough: [],
        Build: i => body(`SELECT DISTINCT {s.Region} FROM ${i.Src} s ${where(i)} ORDER BY {s.Region}`) },
    { Key: 'groupHaving', Ordered: true, PassThrough: [], Computed: ['N', 'Total'],
        Build: i => body(`SELECT {s.Region}, COUNT(*) AS [N], SUM({s.Score}) AS [Total] FROM ${i.Src} s ${where(i)} ` +
            'GROUP BY {s.Region} HAVING COUNT(*) > 1 ORDER BY {s.Region}') },
    { Key: 'window', Ordered: true, PassThrough: ['ID', 'Score'], Computed: ['Rn', 'RegionTotal'],
        Build: i => body('SELECT {s.ID}, {s.Score}, ROW_NUMBER() OVER (PARTITION BY {s.Region} ORDER BY {s.Score} DESC, {s.ID}) AS [Rn], ' +
            `SUM({s.Score}) OVER (PARTITION BY {s.Region}) AS [RegionTotal] FROM ${i.Src} s ${where(i)} ORDER BY {s.ID}`) },
    { Key: 'ownTop', Ordered: true, OwnCap: true, PassThrough: ['ID', 'Name'],
        Build: i => body(`SELECT ${i.Sql.TopPrefix(15)}{s.ID}, {s.Name} FROM ${i.Src} s ${where(i)} ORDER BY {s.ID}${i.Sql.LimitSuffix(15)}`) },
    { Key: 'offsetFetch', Ordered: true, OwnCap: true, PassThrough: ['ID', 'Name'],
        Build: i => body(i.Sql.Platform === 'postgresql'
            ? `SELECT {s.ID}, {s.Name} FROM ${i.Src} s ${where(i)} ORDER BY {s.ID} OFFSET 2 LIMIT 20`
            : `SELECT {s.ID}, {s.Name} FROM ${i.Src} s ${where(i)} ORDER BY {s.ID} OFFSET 2 ROWS FETCH NEXT 20 ROWS ONLY`) },
    { Key: 'topNoOrder', Ordered: false, CountOnly: true, OwnCap: true, PassThrough: ['ID', 'Name'],
        Build: i => body(`SELECT ${i.Sql.TopPrefix(10)}{s.ID}, {s.Name} FROM ${i.Src} s ${where(i)}${i.Sql.LimitSuffix(10)}`) },
    { Key: 'withTies', Ordered: false, OwnCap: true, PassThrough: ['ID', 'Score'],
        Build: i => body(i.Sql.Platform === 'postgresql'
            ? `SELECT {s.ID}, {s.Score} FROM ${i.Src} s ${where(i)} ORDER BY {s.Score} FETCH FIRST 5 ROWS WITH TIES`
            : `SELECT TOP 5 WITH TIES {s.ID}, {s.Score} FROM ${i.Src} s ${where(i)} ORDER BY {s.Score}`) },
    { Key: 'quotedAlias', Ordered: true, PassThrough: [],
        Build: i => body(`SELECT {s.ID} AS [Account Id], {s.Name} AS [Display Name] FROM ${i.Src} s ${where(i)} ORDER BY {s.ID}`) },
    { Key: 'comments', Ordered: true, PassThrough: ['ID', 'Name'],
        Build: i => ({ Ctes: [], Recursive: false,
            MJPrefix: '-- Leading note: SELECT * FROM nowhere WHERE {{ NotATag }}\n',
            MJBody: `SELECT {s.ID}, /* FROM inline; ORDER BY nothing */ {s.Name}\nFROM ${i.Src} s -- trailing ORDER BY note\n${where(i)} ORDER BY {s.ID}`,
            Body: `SELECT {s.ID}, {s.Name} FROM ${i.Src} s ${where(i)} ORDER BY {s.ID}` }) },
    { Key: 'leadingSemicolon', Ordered: true, PassThrough: ['ID', 'Name'], AdhocRefusal: 'Semicolons are not allowed',
        Build: i => ({ Ctes: [], Recursive: false, MJPrefix: ';', Body: `SELECT {s.ID}, {s.Name} FROM ${i.Src} s ${where(i)} ORDER BY {s.ID}` }) },
    { Key: 'selectStar', Ordered: true, PassThrough: '*',
        Build: i => body(`SELECT * FROM ${i.Src} s ${where(i)} ORDER BY {s.ID}`) },
    { Key: 'aliasStar', Ordered: true, PassThrough: '*', Computed: ['Doubled'],
        Build: i => body(`SELECT s.*, {s.Score} * 2 AS [Doubled] FROM ${i.Src} s ${where(i)} ORDER BY {s.ID}`) },
    { Key: 'stringAgg', Ordered: true, PassThrough: [], Computed: ['Names'],
        Build: i => body(i.Sql.Platform === 'postgresql'
            ? `SELECT {s.Region}, STRING_AGG({s.Name}, ',' ORDER BY {s.Name}) AS [Names] FROM ${i.Src} s ${where(i)} GROUP BY {s.Region} ORDER BY {s.Region}`
            : `SELECT {s.Region}, STRING_AGG({s.Name}, ',') WITHIN GROUP (ORDER BY {s.Name}) AS [Names] FROM ${i.Src} s ${where(i)} GROUP BY {s.Region} ORDER BY {s.Region}`) },
    { Key: 'duplicateOutput', Ordered: true, PassThrough: [], Refusal: 'more than one column named',
        Build: i => body(`SELECT {s.ID}, {s.ID} FROM ${i.Src} s ${where(i)} ORDER BY {s.ID}`) },
];

const SQLSERVER_SHAPES: ShapeDef[] = [
    { Key: 'ownPercent', Platforms: ['sqlserver'], Ordered: true, OwnCap: true, PassThrough: ['ID', 'Name'],
        Build: i => body(`SELECT TOP 10 PERCENT {s.ID}, {s.Name} FROM ${i.Src} s ${where(i)} ORDER BY {s.ID}`) },
    { Key: 'forJson', Platforms: ['sqlserver'], Ordered: true, PassThrough: ['ID'], Computed: ['Detail'],
        Build: i => body(`SELECT {s.ID}, (SELECT {j.Name}, {j.Score} FROM ${i.Table} j WHERE {j.ID} = {s.ID} FOR JSON PATH) AS [Detail] ` +
            `FROM ${i.Src} s ${where(i)} ORDER BY {s.ID}`) },
    { Key: 'optionHint', Platforms: ['sqlserver'], Ordered: true, PassThrough: ['ID', 'Name'],
        Build: i => ({ ...body(`SELECT {s.ID}, {s.Name} FROM ${i.Src} s ${where(i)} ORDER BY {s.ID}`),
            MJBody: `SELECT {s.ID}, {s.Name} FROM ${i.Src} s ${where(i)} ORDER BY {s.ID} OPTION (RECOMPILE)` }) },
    { Key: 'tryCast', Platforms: ['sqlserver'], Ordered: true, PassThrough: ['ID'], Computed: ['NameNum'],
        Build: i => body(`SELECT {s.ID}, TRY_CAST({s.Name} AS INT) AS [NameNum] FROM ${i.Src} s ${where(i)} ORDER BY {s.ID}`) },
];

const MOCK_ONLY_SHAPES: ShapeDef[] = [
    { Key: 'recursiveCte', Schemas: ['mock'], Ordered: true, PassThrough: [], Computed: ['Depth'],
        Build: i => ({ Ctes: [`[tree] AS (SELECT {s.ID}, {s.ParentID}, 0 AS [Depth] FROM ${i.Src} s ${where(i)} AND {s.ParentID} IS NULL ` +
            `UNION ALL SELECT {c.ID}, {c.ParentID}, tr.[Depth] + 1 FROM ${MOCK_SCHEMA}.[Account] c JOIN [tree] tr ON {c.ParentID} = {tr.ID})`], Recursive: true,
            Body: 'SELECT {tr.ID}, tr.[Depth] FROM [tree] tr ORDER BY {tr.ID}' }) },
    { Key: 'quotedTable', Schemas: ['mock'], Ordered: true, PassThrough: [],
        Build: i => body(`SELECT ol.[Line No], ol.[Qty], {s.Name} FROM ${MOCK_EXT_SCHEMA}.[Order Line] ol JOIN ${i.Src} s ON {s.ID} = ol.[AccountID] ` +
            `${where(i)} ORDER BY ol.[Line No]`) },
    { Key: 'viewOverView', Schemas: ['mock'], Ordered: true, PassThrough: [],
        Build: i => body(`SELECT v.[ID], v.[Name], v.[Score] FROM ${MOCK_SCHEMA}.[vwAccountTop] v JOIN ${i.Src} s ON {s.ID} = v.[ID] ${where(i)} ORDER BY v.[ID]`) },
    { Key: 'tableFunction', Schemas: ['mock'], Ordered: true, PassThrough: [],
        Build: i => body(`SELECT f.[ID], f.[Name] FROM ${MOCK_SCHEMA}.[fnAccountsInRegion]('North') f JOIN ${i.Src} s ON {s.ID} = f.[ID] ${where(i)} ORDER BY f.[ID]`) },
];

/** Every shape, in dimension order. */
export const SHAPES: readonly ShapeDef[] = [...CORE_SHAPES, ...SQLSERVER_SHAPES, ...MOCK_ONLY_SHAPES];

export function ShapeByKey(key: string): ShapeDef {
    const shape = SHAPES.find(s => s.Key === key);
    if (!shape) throw new Error(`unknown shape ${key}`);
    return shape;
}

/** A shape's final text: `WITH` (or `WITH RECURSIVE` on PostgreSQL) over the given CTEs, then the body. */
export function AssembleWith(sql: Sql, ctes: readonly string[], recursive: boolean, finalBody: string): string {
    if (ctes.length === 0) return finalBody;
    return `${recursive ? sql.WithRecursive() : 'WITH'} ${ctes.join(',\n')}\n${finalBody}`;
}
