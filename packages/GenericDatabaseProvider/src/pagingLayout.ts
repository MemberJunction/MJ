import { AnalyzePagingShape, OutputOrderBy, SqlDocument } from '@memberjunction/sql-parser';
import type { OwnRowCap, PagingShape, QueryExpression, SelectCore, StatementNode } from '@memberjunction/sql-parser';
import type { SQLDialect } from '@memberjunction/sql-dialect';

/** A query expression the structural parser read: anything but an `Unknown` node. */
type ReadQuery = Exclude<QueryExpression, { Kind: 'Unknown' }>;

/** The parsed form of a statement, kept beside its layout when the structural parser read all of it. */
export interface PagingDocument {
    readonly Document: SqlDocument;
    readonly Statement: StatementNode;
    readonly Body: ReadQuery;
}

/**
 * What the paging and row-cap steps need to know about one statement. All offsets are positions
 * in {@link Statement}.
 *
 * It is read from a {@link SqlDocument} when the structural parser reads the statement completely
 * ({@link Parsed} is then set), and from tokens otherwise, so SQL the parser cannot fully read is
 * still paged and capped as before.
 */
export interface PagingLayout {
    readonly Statement: string;
    /** The leading CTE definitions, each as written; empty when there is no leading WITH. */
    readonly CTEDefinitions: readonly string[];
    /** Whether the leading WITH carries the dialect's recursive keyword. */
    readonly Recursive: boolean;
    /** Where the main statement (after any leading CTEs) starts. */
    readonly MainStart: number;
    /** Where a clause that must stay last starts (the query-hint clause, a row lock); the length when none. */
    readonly TailStart: number;
    /** Whether that last clause is the dialect's query-hint clause (`OPTION (…)`). */
    readonly TailIsQueryHint: boolean;
    /** The caps the main statement carries at its top level, in order. */
    readonly OwnCaps: readonly OwnRowCap[];
    /** The main statement's top-level ORDER BY. */
    readonly OrderBy: { readonly Start: number; readonly End: number } | null;
    readonly IsSetOperation: boolean;
    readonly IsDistinct: boolean;
    readonly ReturnsDocument: 'json' | 'xml' | null;
    /** Just after the main statement's first top-level `SELECT [ALL | DISTINCT]`; `null` when it has none. */
    readonly SelectListStart: number | null;
    /** The parsed statement; `null` when the layout was read from tokens. */
    readonly Parsed: PagingDocument | null;
}

/** Reads the layout of one statement, from its parsed form when it can be read completely, else from tokens. */
export function ReadPagingLayout(statement: string, dialect: SQLDialect): PagingLayout {
    const parsed = parseStatement(statement, dialect);
    return parsed === null ? layoutFromTokens(statement, dialect) : layoutFromDocument(statement, parsed, dialect);
}

/**
 * The ORDER BY to put outside a derived table that wraps the statement: the statement's ORDER BY
 * with every column qualifier dropped, since the derived table's alias replaces the inner ones.
 * Qualifiers are read as identifier paths, so `a . Name` and `[a] /*c*\/ . [Name]` lose theirs like
 * `a.Name`; a schema-qualified function name keeps its schema. `null` when the statement was read
 * from tokens or has no ORDER BY.
 */
export function OuterOrderByText(layout: PagingLayout): string | null {
    const parsed = layout.Parsed;
    if (parsed === null || parsed.Body.OrderBy === null) return null;
    return OutputOrderBy(parsed.Document, parsed.Body.OrderBy).trim();
}

function parseStatement(statement: string, dialect: SQLDialect): PagingDocument | null {
    const document = SqlDocument.Parse(statement, dialect);
    if (!document.IsComplete || document.HasStackedStatements().Value) return null;
    const first = document.Statements[0];
    if (first === undefined || first.StatementKind !== 'Select' || first.Body.Kind === 'Unknown') return null;
    if (first.Tail.length > 0) return null;
    return { Document: document, Statement: first, Body: first.Body };
}

function layoutFromTokens(statement: string, dialect: SQLDialect): PagingLayout {
    const shape: PagingShape = AnalyzePagingShape(statement, dialect);
    const hint = dialect.Grammar.QueryHintKeyword;
    const tail = statement.substring(shape.TailStart).trim().toUpperCase();
    return {
        Statement: statement,
        CTEDefinitions: shape.CTEs ? shape.CTEs.Definitions.map(d => d.Text) : [],
        Recursive: shape.CTEs?.Recursive ?? false,
        MainStart: shape.MainStart,
        TailStart: shape.TailStart,
        TailIsQueryHint: hint !== null && new RegExp(`^${hint.toUpperCase()}\\b`).test(tail),
        OwnCaps: shape.OwnCaps,
        OrderBy: shape.OrderBy,
        IsSetOperation: shape.IsSetOperation,
        IsDistinct: shape.IsDistinct,
        ReturnsDocument: shape.ReturnsDocument,
        SelectListStart: shape.SelectListStart,
        Parsed: null,
    };
}

function layoutFromDocument(statement: string, parsed: PagingDocument, dialect: SQLDialect): PagingLayout {
    const { Document: doc, Statement: node, Body: body } = parsed;
    const tail = tailClause(body);
    const tailStart = tail?.Start ?? statement.length;
    const clauseCap = clauseCapOf(body, statement, tailStart);
    const orderEnd = clauseCap?.Start ?? tailStart;
    return {
        Statement: statement,
        CTEDefinitions: (node.With?.CTEs ?? []).map(cte => doc.Text(cte)),
        Recursive: node.With?.Recursive ?? false,
        MainStart: body.Span.Start,
        TailStart: tailStart,
        TailIsQueryHint: tail?.IsHint === true && dialect.Grammar.QueryHintKeyword !== null,
        OwnCaps: [...topCaps(body), ...(clauseCap ? [clauseCap] : [])],
        OrderBy: body.OrderBy === null ? null : { Start: body.OrderBy.Span.Start, End: trimmedEnd(statement, orderEnd) },
        IsSetOperation: body.Kind === 'SetOperation',
        IsDistinct: selectBlocks(body).some(s => s.Distinct !== null && s.Distinct.Form !== 'All'),
        ReturnsDocument: body.For?.Form === 'Json' ? 'json' : body.For?.Form === 'Xml' ? 'xml' : null,
        SelectListStart: body.Kind === 'Select' ? selectListStart(body) : null,
        Parsed: parsed,
    };
}

/** The clause that must stay last: the query-hint clause, or a row-locking FOR clause. */
function tailClause(body: ReadQuery): { Start: number; IsHint: boolean } | null {
    if (body.Option !== null) return { Start: body.Option.Span.Start, IsHint: true };
    const lock = body.For !== null && ['Update', 'Share', 'NoKeyUpdate', 'KeyShare'].includes(body.For.Form);
    return lock && body.For !== null ? { Start: body.For.Span.Start, IsHint: false } : null;
}

/** The select blocks at the top level: the body itself, or every branch of a set operation not in parentheses. */
function selectBlocks(body: QueryExpression): SelectCore[] {
    if (body.Kind === 'Select') return [body];
    if (body.Kind === 'SetOperation') return [...selectBlocks(body.Left), ...selectBlocks(body.Right)];
    return [];
}

/** Every top-level select block's `TOP`, as a cap. */
function topCaps(body: ReadQuery): OwnRowCap[] {
    return selectBlocks(body).flatMap(select => {
        const top = select.Top;
        if (top === null) return [];
        const rows = integerOf(top.Value.Tokens());
        const numeric = rows !== null && !top.Percent && !top.WithTies;
        return [{ Form: 'top' as const, Rows: rows, Skip: 0, Numeric: numeric, Start: top.Span.Start, End: top.Span.End }];
    });
}

/** The trailing LIMIT / OFFSET / FETCH clauses as one cap, from the first of them to the last clause. */
function clauseCapOf(body: ReadQuery, statement: string, tailStart: number): OwnRowCap | null {
    const parts = [body.Limit, body.Offset, body.Fetch].filter(p => p !== null);
    if (parts.length === 0) return null;
    const start = Math.min(...parts.map(p => p.Span.Start));
    let rows: number | null = null;
    let skip = 0;
    let numeric = true;
    if (body.Limit !== null) {
        rows = body.Limit.Value === null ? null : integerOf(body.Limit.Value.Tokens());
        if (body.Limit.Value !== null && rows === null) numeric = false;
        const leading = body.Limit.LeadingOffset === null ? 0 : integerOf(body.Limit.LeadingOffset.Tokens());
        if (leading === null) numeric = false; else skip = leading;
    }
    if (body.Offset !== null) {
        const value = integerOf(body.Offset.Value.Tokens());
        if (value === null) numeric = false; else skip = value;
    }
    if (body.Fetch !== null) {
        rows = body.Fetch.Value === null ? 1 : integerOf(body.Fetch.Value.Tokens());
        if (rows === null || body.Fetch.Percent || body.Fetch.WithTies) numeric = false;
    }
    return { Form: 'clause', Rows: rows, Skip: skip, Numeric: numeric, Start: start, End: trimmedEnd(statement, tailStart) };
}

/** Just after `SELECT`, or after its `ALL` / `DISTINCT` modifier. */
function selectListStart(select: SelectCore): number {
    if (select.Distinct !== null && select.Distinct.Form !== 'DistinctOn') return select.Distinct.Span.End;
    return select.Span.Start + 'SELECT'.length;
}

function integerOf(tokens: readonly { readonly Kind: string; readonly Text: string }[]): number | null {
    return tokens.length === 1 && tokens[0].Kind === 'Number' && /^\d+$/.test(tokens[0].Text) ? Number(tokens[0].Text) : null;
}

/** `end`, moved back over trailing whitespace. */
function trimmedEnd(statement: string, end: number): number {
    let e = end;
    while (e > 0 && /\s/.test(statement[e - 1])) e--;
    return e;
}

/**
 * Functions whose presence in a select list changes how many rows the select returns: aggregates
 * (one row for a select with no GROUP BY) and set-returning functions (several rows per input
 * row). A select list calling any of them is never replaced for counting.
 */
const ROW_COUNT_FUNCTIONS = new Set([
    'COUNT', 'COUNT_BIG', 'SUM', 'AVG', 'MIN', 'MAX', 'STDEV', 'STDEVP', 'STDDEV', 'STDDEV_POP', 'STDDEV_SAMP',
    'VAR', 'VARP', 'VARIANCE', 'VAR_POP', 'VAR_SAMP', 'STRING_AGG', 'CHECKSUM_AGG', 'GROUPING', 'GROUPING_ID',
    'APPROX_COUNT_DISTINCT', 'APPROX_PERCENTILE_CONT', 'APPROX_PERCENTILE_DISC', 'PERCENTILE_CONT', 'PERCENTILE_DISC',
    'MODE', 'ARRAY_AGG', 'JSON_AGG', 'JSONB_AGG', 'JSON_OBJECT_AGG', 'JSONB_OBJECT_AGG', 'JSON_OBJECTAGG', 'JSON_ARRAYAGG',
    'XMLAGG', 'BOOL_AND', 'BOOL_OR', 'EVERY', 'BIT_AND', 'BIT_OR', 'BIT_XOR', 'LISTAGG', 'GROUP_CONCAT', 'CORR',
    'COVAR_POP', 'COVAR_SAMP', 'REGR_SLOPE', 'REGR_INTERCEPT', 'REGR_COUNT', 'REGR_R2', 'REGR_AVGX', 'REGR_AVGY',
    'REGR_SXX', 'REGR_SYY', 'REGR_SXY', 'RANGE_AGG', 'RANGE_INTERSECT_AGG',
    'GENERATE_SERIES', 'GENERATE_SUBSCRIPTS', 'UNNEST', 'REGEXP_MATCHES', 'REGEXP_SPLIT_TO_TABLE', 'STRING_TO_TABLE',
    'JSON_ARRAY_ELEMENTS', 'JSON_ARRAY_ELEMENTS_TEXT', 'JSONB_ARRAY_ELEMENTS', 'JSONB_ARRAY_ELEMENTS_TEXT',
    'JSON_EACH', 'JSON_EACH_TEXT', 'JSONB_EACH', 'JSONB_EACH_TEXT', 'JSON_OBJECT_KEYS', 'JSONB_OBJECT_KEYS',
    'JSON_POPULATE_RECORDSET', 'JSONB_POPULATE_RECORDSET', 'JSON_TO_RECORDSET', 'JSONB_TO_RECORDSET',
    'JSONB_PATH_QUERY', 'FLATTEN', 'EXPLODE', 'POSEXPLODE', 'INLINE',
]);

/**
 * Whether a statement can be counted with its select list replaced by a constant: it was read
 * completely and is one select block with no DISTINCT, GROUP BY, HAVING, WINDOW, QUALIFY, FOR
 * clause or cap of its own, and its select list calls no aggregate or set-returning function.
 * A user-defined aggregate is not recognised by name; such a select list would be counted per
 * input row.
 */
export function CountBodyCanSelectConstant(layout: PagingLayout): boolean {
    const body = layout.Parsed?.Body;
    if (body === undefined || body.Kind !== 'Select' || layout.OwnCaps.length > 0) return false;
    if (body.Distinct !== null && body.Distinct.Form !== 'All') return false;
    if (body.GroupBy !== null || body.Having !== null || body.Window !== null || body.Qualify !== null) return false;
    if (body.For !== null || body.Into !== null || body.Unrecognized.length > 0) return false;
    return !body.SelectList.some(item => item.Expression.FunctionCalls().some(call => isRowCountFunction(call.Name.Parts)));
}

function isRowCountFunction(parts: readonly { readonly Value: string }[]): boolean {
    const last = parts[parts.length - 1];
    return last !== undefined && ROW_COUNT_FUNCTIONS.has(last.Value.toUpperCase());
}
