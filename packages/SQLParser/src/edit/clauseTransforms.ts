import type { ParserDialect } from '@memberjunction/sql-dialect';
import type { SqlDocument } from '../sql/sqlDocument.js';
import type { QueryExpression } from '../sql/sqlNodes.js';
import type { RowCap } from '../sql/analyses/analysisTypes.js';
import type { EditSet } from './editSet.js';
import {
    ClauseRemovalSpan, FromEdits, HasOwnCap, NotApplied, PagingOrderBy, SingleQueryOf, TailInsertionPoint,
} from './transformSupport.js';
import type { SingleQuery, SqlTransformResult } from './transformSupport.js';

/**
 * Removes exactly the ORDER BY clause of the document's top-level query expression (or of
 * `target`), and the whitespace before it. Clauses after it (`OFFSET`, `FETCH`, `LIMIT`, `FOR`,
 * `OPTION`) are kept. Not applied when there is no ORDER BY.
 */
export function StripOrderBy(doc: SqlDocument, target?: QueryExpression): SqlTransformResult {
    const query = SingleQueryOf(doc);
    if (typeof query === 'string') return NotApplied(doc, 'StripOrderBy', query);
    const owner = target ?? query.Body;
    if (owner.Kind === 'Unknown' || owner.OrderBy === null) return NotApplied(doc, 'StripOrderBy', null);
    return FromEdits(doc.Edit().Remove(ClauseRemovalSpan(doc, owner.OrderBy.Span)));
}

/**
 * Replaces the select list of a plain select block with `text`, such as `1` for a count body.
 * Not applied to a set operation, a `VALUES` list or a `SELECT DISTINCT`, where the select list
 * decides which rows there are.
 */
export function ReplaceSelectList(doc: SqlDocument, text: string): SqlTransformResult {
    const query = SingleQueryOf(doc);
    if (typeof query === 'string') return NotApplied(doc, 'ReplaceSelectList', query);
    const body = query.Body;
    if (body.Kind !== 'Select') return NotApplied(doc, 'ReplaceSelectList', 'the query is not a single select block');
    if (body.Distinct !== null && body.Distinct.Form !== 'All') return NotApplied(doc, 'ReplaceSelectList', 'the select list of a SELECT DISTINCT decides its rows');
    if (body.SelectList.length === 0) return NotApplied(doc, 'ReplaceSelectList', 'the select list is empty');
    return FromEdits(doc.Edit().Replace(body.SelectListSpan, text));
}

/** The clauses {@link AppendTail} can add. Values are written as given (numbers or parameter text). */
export interface AppendTailOptions {
    readonly Offset?: number | string;
    readonly Fetch?: number | string;
    readonly Limit?: number | string;
    /** Query hints merged into the dialect's hint clause (`OPTION (…)`), added when there is none. */
    readonly OptionHints?: readonly string[];
}

/**
 * Appends row-cap clauses (`OFFSET`, `FETCH`, `LIMIT`) to the top-level query expression, before
 * its `FOR` and `OPTION` clauses, and merges query hints into its hint clause. Adds the ORDER BY
 * the dialect needs for paging (`ORDER BY (SELECT NULL)` on SQL Server) and the `OFFSET 0 ROWS`
 * a lone `FETCH` needs. Not applied when a clause it would add is already there.
 */
export function AppendTail(doc: SqlDocument, dialect: ParserDialect, options: AppendTailOptions): SqlTransformResult {
    const query = SingleQueryOf(doc);
    if (typeof query === 'string') return NotApplied(doc, 'AppendTail', query);
    const conflict = appendConflict(query.Body, options, dialect);
    if (conflict !== null) return NotApplied(doc, 'AppendTail', conflict);
    let edits = appendCaps(doc.Edit(), query.Body, dialect, options);
    edits = mergeHints(edits, doc, query.Body, dialect, options.OptionHints ?? []);
    return FromEdits(edits);
}

function appendConflict(body: SingleQuery['Body'], options: AppendTailOptions, dialect: ParserDialect): string | null {
    if (options.Offset !== undefined && body.Offset !== null) return 'the query already has an OFFSET';
    if (options.Fetch !== undefined && (body.Fetch !== null || body.Limit !== null)) return 'the query already has a FETCH or LIMIT';
    if (options.Limit !== undefined && (body.Limit !== null || body.Fetch !== null)) return 'the query already has a LIMIT or FETCH';
    if (options.Limit !== undefined && !dialect.Grammar.RowCapForms.includes('limit-offset')) return 'the dialect has no LIMIT';
    if (options.Fetch !== undefined && !dialect.Grammar.RowCapForms.includes('offset-fetch')) return 'the dialect has no FETCH';
    if ((options.OptionHints ?? []).length > 0 && dialect.Grammar.QueryHintKeyword === null) return 'the dialect has no query-hint clause';
    if (body.Kind === 'Select' && body.Top !== null && (options.Offset !== undefined || options.Fetch !== undefined)) return 'the query has a TOP, which OFFSET and FETCH cannot be combined with';
    return null;
}

/** The text of the row-cap clauses to append, ORDER BY and OFFSET 0 included where the dialect needs them. */
function capText(body: SingleQuery['Body'], dialect: ParserDialect, options: AppendTailOptions): string {
    const offsetFetch = dialect.Grammar.RowCapForms.includes('offset-fetch');
    const usesOffsetFetch = options.Fetch !== undefined || (options.Offset !== undefined && options.Limit === undefined && offsetFetch);
    const parts: string[] = [];
    const paging = options.Offset !== undefined || options.Fetch !== undefined;
    if (paging && body.OrderBy === null && dialect.Grammar.PagingRequiresOrderBy) parts.push(`ORDER BY ${PagingOrderBy(dialect, body)}`);
    if (options.Limit !== undefined) parts.push(`LIMIT ${options.Limit}`);
    const offset = options.Offset ?? (options.Fetch !== undefined && body.Offset === null ? 0 : undefined);
    if (offset !== undefined) parts.push(usesOffsetFetch ? `OFFSET ${offset} ROWS` : `OFFSET ${offset}`);
    if (options.Fetch !== undefined) parts.push(`FETCH NEXT ${options.Fetch} ROWS ONLY`);
    return parts.join(' ');
}

function appendCaps(edits: EditSet, body: SingleQuery['Body'], dialect: ParserDialect, options: AppendTailOptions): EditSet {
    const text = capText(body, dialect, options);
    if (text === '') return edits;
    if (options.Fetch !== undefined && options.Offset === undefined && body.Offset !== null) return edits.InsertAfter(body.Offset, ` ${text}`);
    const point = TailInsertionPoint(body);
    const span = { Start: point.At, End: point.At };
    return point.BeforeClause ? edits.InsertBefore(span, `${text} `) : edits.InsertAfter(span, ` ${text}`);
}

function mergeHints(edits: EditSet, doc: SqlDocument, body: SingleQuery['Body'], dialect: ParserDialect, hints: readonly string[]): EditSet {
    if (hints.length === 0) return edits;
    if (body.Option !== null) {
        const close = body.Option.ListSpan.End - 1;
        const separator = body.Option.Hints.IsEmpty ? '' : ', ';
        return edits.InsertBefore({ Start: close, End: close }, `${separator}${hints.join(', ')}`);
    }
    const keyword = (dialect.Grammar.QueryHintKeyword ?? 'OPTION').toUpperCase();
    const end = body.Span.End;
    return edits.InsertAfter({ Start: end, End: end }, `\n${keyword} (${hints.join(', ')})`);
}

/**
 * Caps the rows the query returns at `rows`: tightens a numeric TOP, LIMIT or FETCH the
 * top-level query already has, or adds one by the dialect's grammar: `TOP n` after
 * `SELECT [DISTINCT]`, else a `LIMIT n`, else `OFFSET 0 ROWS FETCH NEXT n ROWS ONLY` (with the
 * ORDER BY the dialect needs). Not applied when the query's own cap is not a plain number
 * (`PERCENT`, `WITH TIES`, a parameter): wrap it as a derived table first.
 */
export function SetRowCap(doc: SqlDocument, dialect: ParserDialect, rows: number): SqlTransformResult {
    const query = SingleQueryOf(doc);
    if (typeof query === 'string') return NotApplied(doc, 'SetRowCap', query);
    if (!Number.isInteger(rows) || rows < 0) return NotApplied(doc, 'SetRowCap', 'the row count must be a non-negative integer');
    const caps = doc.RowCaps().Value;
    const limiting = caps.filter(c => c.Form !== 'Offset');
    if (limiting.some(c => !c.Numeric) || caps.some(c => c.Form === 'Offset' && !c.Numeric)) {
        return NotApplied(doc, 'SetRowCap', 'the query has a row cap that is not a plain number');
    }
    if (limiting.length > 0) return tighten(doc, limiting, rows);
    return addCap(doc, query.Body, dialect, rows);
}

function tighten(doc: SqlDocument, caps: readonly RowCap[], rows: number): SqlTransformResult {
    let edits = doc.Edit();
    for (const cap of caps) {
        if (cap.Rows === null || cap.Rows > rows) edits = tightenOne(edits, cap.Node, rows);
    }
    return FromEdits(edits);
}

function tightenOne(edits: EditSet, node: RowCap['Node'], rows: number): EditSet {
    switch (node.Kind) {
        case 'Top':
            return edits.Replace(node.Value, String(rows));
        case 'Limit':
            return node.Value !== null ? edits.Replace(node.Value, String(rows)) : edits.Replace(node, `LIMIT ${rows}`);
        case 'Fetch':
            return node.Value !== null ? edits.Replace(node.Value, String(rows)) : edits.Replace(node, `FETCH NEXT ${rows} ROWS ONLY`);
        default:
            return edits;
    }
}

function addCap(doc: SqlDocument, body: SingleQuery['Body'], dialect: ParserDialect, rows: number): SqlTransformResult {
    const forms = dialect.Grammar.RowCapForms;
    if (body.Kind === 'Select' && forms.includes('top') && body.Offset === null) {
        const anchor = body.Distinct ?? { Span: { Start: body.Span.Start, End: body.Span.Start + 'SELECT'.length } };
        return FromEdits(doc.Edit().InsertAfter(anchor, ` TOP ${rows}`));
    }
    if (forms.includes('limit-offset')) return AppendTail(doc, dialect, { Limit: rows });
    if (forms.includes('offset-fetch')) return AppendTail(doc, dialect, { Fetch: rows });
    return NotApplied(doc, 'SetRowCap', 'the dialect has no row-cap form');
}
