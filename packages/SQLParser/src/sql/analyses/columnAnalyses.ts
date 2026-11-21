import type { ParserDialect } from '@memberjunction/sql-dialect';
import type { IdentifierPath } from '../sqlExpression.js';
import { COUNT_FUNCTIONS, ROW_VALUE_FUNCTIONS } from '../sqlKeywords.js';
import type { ExpressionContext, SqlScope } from '../sqlScope.js';
import type { IdentifierNode, QueryExpression, SelectCore, StatementNode } from '../sqlNodes.js';
import { IsQueryExpression, WalkSqlNodes } from '../sqlWalker.js';
import type { ColumnBinding, ColumnReference, WholeRowConstruct } from './analysisTypes.js';

/**
 * Every identifier path that can be a column, with its clause and, when it can be told without
 * the catalog, the source it binds to. Also the names of `JOIN … USING (…)`, and the column part
 * of a method call on a column (`a.Payload.value(…)`).
 */
export function FindColumnReferences(statements: readonly StatementNode[], scope: SqlScope): ColumnReference[] {
    const found: ColumnReference[] = [];
    for (const context of scope.Expressions) {
        for (const path of context.Expression.Identifiers()) found.push(columnReference(path.Parts, path.Span, context, scope));
        for (const call of context.Expression.FunctionCalls()) {
            const parts = call.Name.Parts;
            if (parts.length < 3 || scope.ResolveQualifier([parts[0]], context.Scope) === null) continue;
            const columnParts = parts.slice(0, parts.length - 1);
            const span = { Start: columnParts[0].Span.Start, End: columnParts[columnParts.length - 1].Span.End };
            found.push(columnReference(columnParts, span, context, scope));
        }
    }
    found.push(...usingColumns(statements));
    return found.sort((a, b) => a.Span.Start - b.Span.Start);
}

function columnReference(parts: readonly IdentifierNode[], span: IdentifierPath['Span'], context: ExpressionContext, scope: SqlScope): ColumnReference {
    const column = parts[parts.length - 1];
    const qualifier = parts.slice(0, parts.length - 1);
    const aliasMatch = qualifier.length === 0 && context.Clause === 'OrderBy' && matchesOutputAlias(column, context.OutputCore, scope);
    return Object.freeze({
        Path: parts, Column: column, Qualifier: Object.freeze(qualifier), Span: Object.freeze({ Start: span.Start, End: span.End }),
        Clause: context.Clause, Binding: aliasMatch ? null : bind(qualifier, context, scope), RefersToOutputAlias: aliasMatch,
        Scope: context.Scope,
    });
}

function bind(qualifier: readonly IdentifierNode[], context: ExpressionContext, scope: SqlScope): ColumnBinding | null {
    if (qualifier.length > 0) {
        const resolved = scope.ResolveQualifier(qualifier, context.Scope);
        return resolved === null ? null : Object.freeze({ ...resolved, Via: 'Qualifier' });
    }
    const own = context.Scope;
    if (own === null || own.Sources.length !== 1) return null;
    return Object.freeze({ Source: own.Sources[0], Scope: own, Via: 'OnlySource', Outer: false });
}

function matchesOutputAlias(column: IdentifierNode, core: SelectCore | null, scope: SqlScope): boolean {
    if (core === null) return false;
    const key = scope.NameKey(column);
    return core.SelectList.some(item => item.Alias !== null && scope.NameKey(item.Alias) === key);
}

function usingColumns(statements: readonly StatementNode[]): ColumnReference[] {
    const found: ColumnReference[] = [];
    WalkSqlNodes(statements, node => {
        if (node.Kind !== 'Join' || node.Using === null) return;
        for (const name of node.Using) {
            found.push(Object.freeze({
                Path: Object.freeze([name]), Column: name, Qualifier: Object.freeze([]), Span: name.Span, Clause: 'Join',
                Binding: null, RefersToOutputAlias: false, Scope: null,
            }));
        }
    });
    return found;
}

/**
 * Every construct that reads, outputs or compares whole rows: `*` and `alias.*` (except
 * `COUNT(*)`), `FOR JSON` / `FOR XML`, `NATURAL JOIN`, set operations, row-to-value functions
 * over a source (`row_to_json(t)`), a source name used as a value where the dialect reads it as
 * the row, and ordinal ORDER BY items.
 */
export function FindWholeRowConstructs(statements: readonly StatementNode[], scope: SqlScope, dialect: ParserDialect): WholeRowConstruct[] {
    const found: WholeRowConstruct[] = [];
    for (const context of scope.Expressions) found.push(...expressionConstructs(context, scope, dialect.Grammar.SourceNameIsRowValue === true));
    WalkSqlNodes(statements, node => {
        if (node.Kind === 'For' && (node.Form === 'Json' || node.Form === 'Xml')) found.push(construct('ForDocument', node.Span, null, `FOR ${node.Form.toUpperCase()}`));
        else if (node.Kind === 'Join' && node.Natural) found.push(construct('NaturalJoin', node.KeywordSpan, 'Join', 'NATURAL JOIN'));
        else if (node.Kind === 'SetOperation') found.push(construct('SetOperation', node.OperatorSpan, null, `${node.Operator.toUpperCase()}${node.All ? ' ALL' : ''}`));
        if (IsQueryExpression(node)) found.push(...ordinalOrderBys(node));
    });
    return found.sort((a, b) => a.Span.Start - b.Span.Start);
}

function expressionConstructs(context: ExpressionContext, scope: SqlScope, sourceNameIsRow: boolean): WholeRowConstruct[] {
    const found: WholeRowConstruct[] = [];
    for (const star of context.Expression.Stars()) {
        if (star.FunctionName !== null && COUNT_FUNCTIONS.has(star.FunctionName)) continue;
        const binding = star.Qualifier === null ? null : scope.ResolveQualifier(star.Qualifier.Parts, context.Scope);
        found.push({ ...construct(star.Qualifier === null ? 'Star' : 'QualifiedStar', star.Span, context.Clause, '*'), Binding: binding });
    }
    for (const call of context.Expression.FunctionCalls()) {
        const name = call.Name.Parts[call.Name.Parts.length - 1].Value.toUpperCase();
        if (!ROW_VALUE_FUNCTIONS.has(name)) continue;
        const binding = rowArgumentBinding(call.Arguments.Identifiers(), context, scope);
        if (binding !== null) found.push({ ...construct('RowFunction', call.Span, context.Clause, name.toLowerCase()), Binding: binding });
    }
    if (sourceNameIsRow) {
        const insideRowFunction = (start: number) => found.some(f => f.Kind === 'RowFunction' && f.Span.Start <= start && start < f.Span.End);
        found.push(...rowReferences(context, scope).filter(r => !insideRowFunction(r.Span.Start)));
    }
    return found;
}

/** The source a row function's sole argument names, when the argument is a bare source name. */
function rowArgumentBinding(ids: readonly IdentifierPath[], context: ExpressionContext, scope: SqlScope): WholeRowConstruct['Binding'] {
    if (ids.length !== 1 || ids[0].Parts.length !== 1) return null;
    return scope.ResolveQualifier(ids[0].Parts, context.Scope);
}

/** Unqualified names equal to a visible source name: the whole row, in dialects that read them so. */
function rowReferences(context: ExpressionContext, scope: SqlScope): WholeRowConstruct[] {
    const found: WholeRowConstruct[] = [];
    for (const path of context.Expression.Identifiers()) {
        if (path.Parts.length !== 1) continue;
        const binding = scope.ResolveQualifier(path.Parts, context.Scope);
        if (binding !== null) found.push({ ...construct('RowReference', path.Span, context.Clause, path.Parts[0].Value), Binding: binding });
    }
    return found;
}

function ordinalOrderBys(node: QueryExpression): WholeRowConstruct[] {
    if (node.Kind === 'Unknown' || node.OrderBy === null) return [];
    const paged = node.Limit !== null || node.Offset !== null || node.Fetch !== null || (node.Kind === 'Select' && node.Top !== null);
    return node.OrderBy.Items.filter(item => item.IsOrdinal).map(item => ({
        ...construct('OrdinalOrderBy', item.Span, 'OrderBy', `ORDER BY ${item.Expression.Text}`), Paged: paged,
    }));
}

function construct(kind: WholeRowConstruct['Kind'], span: WholeRowConstruct['Span'], clause: WholeRowConstruct['Clause'], detail: string): WholeRowConstruct {
    return { Kind: kind, Span: span, Clause: clause, Binding: null, Paged: false, Detail: detail };
}
