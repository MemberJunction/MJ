import type { Span } from '../common/analysis.js';
import type { SqlDocument } from '../sql/sqlDocument.js';
import type { CTEDeclaration, IdentifierNode, OrderByClause, WithClause } from '../sql/sqlNodes.js';
import type { ScopeSource } from '../sql/sqlScope.js';
import { NameKey } from '../sql/sqlScope.js';
import {
    ClauseRemovalSpan, FromEdits, FromText, HasOwnCap, NotApplied, SingleQueryOf,
} from './transformSupport.js';
import type { SingleQuery, SqlTransformResult, TransformDialect } from './transformSupport.js';

/** One CTE of a leading WITH clause, as written. */
export interface HoistedCTE {
    /** The name, unquoted. */
    readonly Name: string;
    /** The name exactly as written, quotes included. */
    readonly NameText: string;
    /** The whole definition: name, column list, `AS`, body with parentheses. */
    readonly Text: string;
    /** The body, without its parentheses. */
    readonly Body: string;
    readonly Node: CTEDeclaration;
}

/** A statement's leading CTE list, split from the query it feeds. */
export interface HoistedCTEs {
    /** The leading WITH clause; `null` when there is none. */
    readonly With: WithClause | null;
    readonly Recursive: boolean;
    readonly CTEs: readonly HoistedCTE[];
    /** The definitions as written, from the first CTE to the end of the last (no `WITH` keyword). */
    readonly CTEListText: string;
    /** The query after the WITH clause, to the end of the statement (its `;` excluded). */
    readonly Body: string;
    /** Where {@link Body} starts in the text. */
    readonly BodyStart: number;
}

/**
 * Splits the document's single query statement into its leading CTE list and the remaining body,
 * by position, so every part is returned as written. `null` when the document is not a single
 * query statement that was read completely.
 */
export function HoistCTEs(doc: SqlDocument): HoistedCTEs | null {
    const query = SingleQueryOf(doc);
    if (typeof query === 'string') return null;
    const statement = query.Statement;
    const clause = statement.With;
    const bodyEnd = statement.Terminator?.Start ?? statement.Span.End;
    const ctes = (clause?.CTEs ?? []).map(cte => Object.freeze({
        Name: cte.Name.Value, NameText: doc.Text(cte.Name), Text: doc.Text(cte), Node: cte,
        Body: doc.Text({ Start: cte.BodySpan.Start + 1, End: cte.BodySpan.End - 1 }),
    }));
    const first = clause?.CTEs[0];
    const last = clause?.CTEs[clause.CTEs.length - 1];
    return Object.freeze({
        With: clause, Recursive: clause?.Recursive ?? false, CTEs: Object.freeze(ctes),
        CTEListText: first !== undefined && last !== undefined ? doc.Text({ Start: first.Span.Start, End: last.Span.End }) : '',
        Body: doc.Text({ Start: query.Body.Span.Start, End: bodyEnd }), BodyStart: query.Body.Span.Start,
    });
}

/**
 * Renames a CTE: its declaration and every reference the scope analysis binds to it (FROM and
 * JOIN sources, qualifiers such as `Old.ID` and `Old.*` where the source has no alias of its
 * own). String literals, aliases and same-named columns are never touched. The new name is
 * always quoted with the dialect's writer. By default the first CTE named `oldName` is renamed,
 * leading WITH clauses first; pass `cte` to choose one.
 */
export function RenameCTE(doc: SqlDocument, dialect: TransformDialect, oldName: string, newName: string, cte?: CTEDeclaration): SqlTransformResult {
    if (!doc.IsComplete) return NotApplied(doc, 'RenameCTE', 'part of the text could not be read');
    const target = cte ?? findCTE(doc, oldName);
    if (target === null) return NotApplied(doc, 'RenameCTE', `there is no CTE named ${oldName}`);
    const quoted = dialect.Writer.QuoteIdentifier(newName);
    return FromEdits(doc.Edit().ReplaceAll(renameSpans(doc, target), quoted));
}

function findCTE(doc: SqlDocument, name: string): CTEDeclaration | null {
    const all = doc.CTEs().Value;
    const matches = (node: IdentifierNode) => NameKey(node, doc.Dialect) === NameKey({ ...node, Value: name }, doc.Dialect);
    const leading = all.find(c => c.Leading && matches(c.Name));
    return (leading ?? all.find(c => matches(c.Name)))?.Node ?? null;
}

/** The spans to rewrite: the declaration, the referencing table names, and the qualifiers bound through them. */
function renameSpans(doc: SqlDocument, cte: CTEDeclaration): Span[] {
    const scope = doc.Scope();
    const references = new Set(scope.ReferencesTo(cte));
    const viaName = (source: ScopeSource | undefined) => source !== undefined && source.NameIsTableName && source.Source.Kind === 'Table' && references.has(source.Source);
    const spans = new Map<number, Span>([[cte.Name.Span.Start, cte.Name.Span]]);
    for (const reference of references) spans.set(reference.Name.Span.Start, reference.Name.Parts[0].Span);
    for (const column of doc.ColumnReferences().Value) {
        const qualifier = column.Qualifier[column.Qualifier.length - 1];
        if (qualifier !== undefined && column.Binding?.Via === 'Qualifier' && viaName(column.Binding.Source)) spans.set(qualifier.Span.Start, qualifier.Span);
    }
    for (const context of scope.Expressions) {
        for (const star of context.Expression.Stars()) {
            if (star.Qualifier === null) continue;
            const binding = scope.ResolveQualifier(star.Qualifier.Parts, context.Scope);
            const part = star.Qualifier.Parts[star.Qualifier.Parts.length - 1];
            if (viaName(binding?.Source)) spans.set(part.Span.Start, part.Span);
        }
    }
    return [...spans.values()].sort((a, b) => a.Start - b.Start);
}

/** Options for {@link WrapAsDerivedTable}. */
export interface WrapOptions {
    /** The outer select list; `*` by default. */
    readonly SelectList?: string;
    /**
     * What happens to the query's ORDER BY. `Auto` (the default): it moves to the outer query,
     * or, when the query has its own row cap, stays inside and is copied outside. `Keep`: it stays
     * inside only. `Drop`: it is removed. Moved and copied items name output columns, so their
     * qualifiers are dropped (`a.Name` becomes `Name`).
     */
    readonly OrderBy?: 'Auto' | 'Keep' | 'Drop';
}

/**
 * Wraps the query as a derived table, `SELECT * FROM (query) AS alias`. Leading CTEs are hoisted
 * out first (a WITH cannot sit inside a derived table on SQL Server), the query-hint clause moves
 * to the outer query, and the ORDER BY is handled by {@link WrapOptions.OrderBy}. Not applied to
 * a query with `FOR JSON` / `FOR XML` or a row-locking clause.
 */
export function WrapAsDerivedTable(doc: SqlDocument, dialect: TransformDialect, alias: string, options: WrapOptions = {}): SqlTransformResult {
    const query = SingleQueryOf(doc);
    if (typeof query === 'string') return NotApplied(doc, 'WrapAsDerivedTable', query);
    if (query.Body.For !== null) return NotApplied(doc, 'WrapAsDerivedTable', 'the query ends with a FOR clause, which cannot sit in a derived table');
    const mode = options.OrderBy ?? 'Auto';
    const orderBy = query.Body.OrderBy;
    const keepInside = orderBy !== null && (mode === 'Keep' || (mode === 'Auto' && HasOwnCap(query.Body)));
    const outerOrderBy = orderBy !== null && mode === 'Auto' ? OutputOrderBy(doc, orderBy) : null;
    const inner = innerText(doc, query, keepInside ? null : orderBy);
    const withText = query.Statement.With === null ? '' : `${doc.Text(query.Statement.With)}\n`;
    const option = query.Body.Option === null ? '' : `\n${doc.Text(query.Body.Option)}`;
    const ordered = outerOrderBy === null ? '' : `\n${outerOrderBy}`;
    const text = `${withText}SELECT ${options.SelectList ?? '*'} FROM (\n${inner}\n) AS ${dialect.Writer.QuoteIdentifier(alias)}${ordered}${option}`;
    return FromText(doc, text);
}

/** The query body's text without its OPTION clause, and without `orderBy` when given. */
function innerText(doc: SqlDocument, query: SingleQuery, orderBy: OrderByClause | null): string {
    let edits = doc.Edit();
    if (query.Body.Option !== null) edits = edits.Remove(ClauseRemovalSpan(doc, query.Body.Option.Span));
    if (orderBy !== null) edits = edits.Remove(ClauseRemovalSpan(doc, orderBy.Span));
    const applied = edits.Apply();
    const span = applied.SpanMap.MapSpan(query.Body.Span) ?? { Start: 0, End: applied.Text.length };
    return applied.Text.substring(span.Start, span.End).trimEnd();
}

/**
 * An ORDER BY's text with every column qualifier dropped, so it can order a query that wraps the
 * original as a derived table: `ORDER BY a.Name, [a] /*c*\/ . [ID]` becomes `ORDER BY Name, [ID]`.
 * Function names keep their schema (`dbo.fnLen(a.Name)` becomes `dbo.fnLen(Name)`).
 */
export function OutputOrderBy(doc: SqlDocument, orderBy: OrderByClause): string {
    let edits = doc.Edit();
    for (const item of orderBy.Items) {
        for (const path of item.Expression.Identifiers()) {
            if (path.Parts.length < 2) continue;
            const column = path.Parts[path.Parts.length - 1];
            edits = edits.Replace(path.Span, doc.Text(column));
        }
    }
    const applied = edits.Apply();
    const span = applied.SpanMap.MapSpan(orderBy.Span) ?? orderBy.Span;
    return applied.Text.substring(span.Start, span.End);
}
