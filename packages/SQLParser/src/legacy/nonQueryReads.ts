import type { Span } from '../common/analysis.js';
import { SqlDocument } from '../sql/sqlDocument.js';
import type { ObjectName, SqlNode } from '../sql/sqlNodes.js';
import { WalkSqlNodes } from '../sql/sqlWalker.js';
import { TokenTable } from '../sql/tokenTable.js';

/** A table a statement names, before the legacy default schema is filled in. */
export interface NamedTable {
    readonly Name: ObjectName;
    readonly Alias: string | null;
}

/** The keywords after which a statement that is not a query names a table, as the legacy extractor read them. */
const TARGET_KEYWORDS: ReadonlySet<string> = new Set(['FROM', 'JOIN', 'INTO']);

/** The keywords that end a statement's own WHERE condition. */
const WHERE_END_KEYWORDS: ReadonlySet<string> = new Set(['RETURNING', 'OUTPUT', 'ORDER', 'LIMIT', 'OPTION']);

/** What the parts of a document that are not queries read. */
export interface NonQueryReads {
    /** Tables named right after `FROM`, `JOIN` or `INTO`. */
    readonly Tables: NamedTable[];
    /** The queries such statements hold, each parsed on its own. */
    readonly Queries: SqlDocument[];
    /** Each such statement's own WHERE condition, parsed as `SELECT 1 WHERE <condition>`. */
    readonly Conditions: SqlDocument[];
}

/**
 * The tables named by the parts of a document that are not queries: a `CREATE VIEW … AS SELECT`,
 * an `INSERT … SELECT`, a `DELETE FROM`, a `MERGE INTO`, a `DELETE … RETURNING` CTE body. The query
 * such a statement holds (from its first `SELECT`, or a `WITH` right after `AS`) is parsed and read
 * in full; before it, a name right after `FROM`, `JOIN` or `INTO` is read as a table. Names in
 * comments and strings are never read.
 */
export function NonQueryTables(document: SqlDocument): NonQueryReads {
    const table = new TokenTable(document.Tokens, document.Dialect);
    const reads: NonQueryReads = { Tables: [], Queries: [], Conditions: [] };
    for (const span of nonQuerySpans(document)) {
        const [first, last] = tokenRange(table, span);
        const query = embeddedQueryStart(table, first, last);
        reads.Tables.push(...keywordTargets(table, first, query ?? last));
        if (query !== null) reads.Queries.push(SqlDocument.Parse(document.Text({ Start: table.Tokens[query].Span.Start, End: span.End }), document.Dialect));
        const condition = whereCondition(table, first, query ?? last);
        if (condition !== null) reads.Conditions.push(SqlDocument.Parse(`SELECT 1 WHERE ${document.Text(condition)}`, document.Dialect));
    }
    return reads;
}

/** The span of a statement's own WHERE condition, at its depth, up to `RETURNING` / `OUTPUT` or the end. */
function whereCondition(table: TokenTable, first: number, end: number): Span | null {
    const depth = table.Tokens[first]?.Depth ?? 0;
    let where = -1;
    for (let i = first; i < end && where < 0; i++) if (table.Tokens[i].Depth === depth && table.IsWord(i, 'WHERE')) where = i;
    if (where < 0 || where + 1 >= end) return null;
    let stop = where + 1;
    while (stop < end && !(table.Tokens[stop].Depth === depth && WHERE_END_KEYWORDS.has(table.Upper(stop)))) stop++;
    return stop > where + 1 ? table.SpanOf(where + 1, stop - 1) : null;
}

/** The spans of statement and nested-query bodies the parser kept whole because they are not queries. */
function nonQuerySpans(document: SqlDocument): Span[] {
    const spans: Span[] = [];
    WalkSqlNodes(document.Statements, (node: SqlNode) => {
        if ((node.Kind === 'Statement' || node.Kind === 'Query') && node.StatementKind !== 'Empty' && node.Body.Kind === 'Unknown') {
            spans.push(node.Body.Span);
        }
    });
    return spans;
}

/** The significant-token indexes `[first, end)` that lie inside a span. */
function tokenRange(table: TokenTable, span: Span): [number, number] {
    let first = 0;
    while (first < table.Length && table.Tokens[first].Span.Start < span.Start) first++;
    let end = first;
    while (end < table.Length && table.Tokens[end].Span.End <= span.End) end++;
    return [first, end];
}

/** The index of the query a non-query statement holds: its first `SELECT` at the statement's depth, or a `WITH` after `AS`. */
function embeddedQueryStart(table: TokenTable, first: number, end: number): number | null {
    const depth = table.Tokens[first]?.Depth ?? 0;
    for (let i = first + 1; i < end; i++) {
        if (table.Tokens[i].Depth !== depth) continue;
        if (table.IsWord(i, 'SELECT') || (table.IsWord(i, 'WITH') && table.IsWord(i - 1, 'AS'))) return i;
    }
    return null;
}

/** Names right after `FROM`, `JOIN` or `INTO` at the statement's own depth, with the alias written after them. */
function keywordTargets(table: TokenTable, first: number, end: number): NamedTable[] {
    const depth = table.Tokens[first]?.Depth ?? 0;
    const found: NamedTable[] = [];
    for (let i = first; i < end - 1; i++) {
        if (table.Tokens[i].Depth !== depth || !TARGET_KEYWORDS.has(table.Upper(i))) continue;
        const name = table.ReadObjectName(i + 1, end);
        if (name === null) continue;
        found.push({ Name: name.Name, Alias: aliasAt(table, name.Next, end) });
    }
    return found;
}

function aliasAt(table: TokenTable, i: number, end: number): string | null {
    const at = table.IsWord(i, 'AS') ? i + 1 : i;
    return at < end && table.IsNamePart(at) ? table.Identifier(at).Value : null;
}

/** The spans of every PIVOT's `IN (…)` list: the names there are the new columns, not references. */
export function PivotInLists(document: SqlDocument): Span[] {
    const pivots: Span[] = [];
    WalkSqlNodes(document.Statements, (node: SqlNode) => {
        if (node.Kind === 'Pivot') pivots.push(node.Body.Span);
    });
    if (pivots.length === 0) return [];
    const table = new TokenTable(document.Tokens, document.Dialect);
    return pivots.flatMap(span => {
        const [first, end] = tokenRange(table, span);
        for (let i = first; i < end; i++) {
            if (table.IsWord(i, 'IN') && table.IsChar(i + 1, '(') && table.Match(i + 1) > i + 1) return [table.SpanOf(i + 1, table.Match(i + 1))];
        }
        return [];
    });
}
