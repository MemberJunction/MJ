import type { ParserDialect } from '@memberjunction/sql-dialect';
import type { SqlExpression } from '../sqlExpression.js';
import type { SqlScope } from '../sqlScope.js';
import { NameKey } from '../sqlScope.js';
import type { LimitClause, QueryExpression, SelectCore, SelectItem, SqlNode, StatementNode } from '../sqlNodes.js';
import { WalkSqlNodes } from '../sqlWalker.js';
import type {
    CTEInfo, DuplicateOutputName, DuplicateOutputNameOptions, OutputItem, OutputItems, ReadOnlyCheck, RowCap,
    TableReference, TopLevelOrderBy,
} from './analysisTypes.js';

const LOCKING_FORMS: ReadonlySet<string> = new Set(['Update', 'Share', 'NoKeyUpdate', 'KeyShare']);

/** Every table, CTE and table-valued function read anywhere in the statements, in source order. */
export function FindTableReferences(statements: readonly StatementNode[], scope: SqlScope): TableReference[] {
    const found: TableReference[] = [];
    WalkSqlNodes(statements, node => {
        if (node.Kind === 'Table') {
            const cte = scope.CTEOf(node);
            found.push(Object.freeze({
                Name: node.Name, Kind: cte !== null ? 'CTE' : 'Table', Schema: schemaOf(node.Name.Parts.map(p => p.Value)),
                Span: node.Name.Span, Source: node, CTE: cte,
            }));
        } else if (node.Kind === 'Function') {
            found.push(Object.freeze({
                Name: node.Name, Kind: 'Function', Schema: schemaOf(node.Name.Parts.map(p => p.Value)), Span: node.Name.Span,
                Source: node, CTE: null,
            }));
        }
    });
    return found;
}

function schemaOf(parts: readonly string[]): string | null {
    return parts.length >= 2 ? parts[parts.length - 2] : null;
}

/** Every CTE declared anywhere, in source order. */
export function FindCTEs(statements: readonly StatementNode[]): CTEInfo[] {
    const found: CTEInfo[] = [];
    statements.forEach((statement, index) => {
        WalkSqlNodes([statement], (node, parent) => {
            if (node.Kind !== 'With') return;
            const leading = parent === statement;
            for (const cte of node.CTEs) {
                found.push(Object.freeze({
                    Name: cte.Name, Node: cte, ColumnList: cte.ColumnList, Recursive: node.Recursive, Leading: leading, StatementIndex: index,
                }));
            }
        });
    });
    return found;
}

/** The top-level query expression of the first statement; `null` when it is not a query. */
export function TopQuery(statements: readonly StatementNode[]): QueryExpression | null {
    const first = statements[0];
    if (first === undefined || first.Body.Kind === 'Unknown') return null;
    return first.Body;
}

/** The output columns of the first statement's query. */
export function FindOutputItems(statements: readonly StatementNode[]): OutputItems {
    const top = TopQuery(statements);
    const branches = top === null ? [] : SelectBranches(top).map(core => core.SelectList.map(item => outputItem(item)));
    return Object.freeze({
        Items: Object.freeze(branches[0] ?? []),
        Branches: Object.freeze(branches.map(b => Object.freeze(b))),
        IsSetOperation: top?.Kind === 'SetOperation',
    });
}

/** The select blocks of a query expression's set-operation branches, left to right, without recursion. */
export function SelectBranches(expression: QueryExpression): SelectCore[] {
    const cores: SelectCore[] = [];
    const pending: QueryExpression[] = [expression];
    for (let current = pending.pop(); current !== undefined; current = pending.pop()) {
        if (current.Kind === 'Select') cores.push(current);
        else if (current.Kind === 'SetOperation') pending.push(current.Right, current.Left);
        else if (current.Kind === 'Parenthesized' && current.Query.Body.Kind !== 'Unknown') pending.push(current.Query.Body);
    }
    return cores;
}

function outputItem(item: SelectItem): OutputItem {
    const bare = item.Alias === null && !item.IsStar ? bareColumn(item.Expression) : null;
    const nameNode = item.Alias ?? bare;
    return Object.freeze({
        Name: nameNode?.Value ?? null, NameNode: nameNode, Alias: item.Alias, ExpressionSpan: item.Expression.Span,
        IsStar: item.IsStar, StarQualifier: item.StarQualifier, Item: item,
    });
}

/** The last part of an expression that is exactly one identifier path. */
function bareColumn(expression: SqlExpression): OutputItem['NameNode'] {
    const ids = expression.Identifiers();
    if (ids.length !== 1 || expression.FunctionCalls().length > 0) return null;
    const path = ids[0];
    if (path.Span.Start !== expression.Span.Start || path.Span.End !== expression.Span.End) return null;
    return path.Parts[path.Parts.length - 1];
}

/** Output names used more than once in the first statement's output. */
export function FindDuplicateOutputNames(items: readonly OutputItem[], dialect: ParserDialect, options: DuplicateOutputNameOptions): DuplicateOutputName[] {
    const groups = new Map<string, OutputItem[]>();
    for (const item of items) {
        if (item.NameNode === null) continue;
        const key = options.CaseSensitive ? item.NameNode.Value : NameKey(item.NameNode, dialect);
        const group = groups.get(key);
        if (group === undefined) groups.set(key, [item]);
        else group.push(item);
    }
    return [...groups.values()].filter(g => g.length > 1).map(g => Object.freeze({ Name: g[0].Name ?? '', Items: Object.freeze(g) }));
}

/** The ORDER BY of the top-level query expression. */
export function FindTopLevelOrderBy(statements: readonly StatementNode[]): TopLevelOrderBy | null {
    const top = TopQuery(statements);
    if (top === null || top.Kind === 'Unknown' || top.OrderBy === null) return null;
    return Object.freeze({ Node: top.OrderBy, Span: top.OrderBy.Span, Owner: top });
}

/** The row caps the top-level query expression carries itself. */
export function FindRowCaps(statements: readonly StatementNode[]): RowCap[] {
    const top = TopQuery(statements);
    if (top === null || top.Kind === 'Unknown') return [];
    const caps: RowCap[] = [];
    if (top.Kind === 'Select' && top.Top !== null) {
        const rows = IntegerValue(top.Top.Value);
        caps.push(cap('Top', top.Top, rows, null, rows !== null && !top.Top.Percent && !top.Top.WithTies, top.Top.Percent, top.Top.WithTies));
    }
    if (top.Limit !== null) caps.push(limitCap(top.Limit));
    if (top.Offset !== null) {
        const skip = IntegerValue(top.Offset.Value);
        caps.push(cap('Offset', top.Offset, null, skip, skip !== null, false, false));
    }
    if (top.Fetch !== null) {
        const rows = top.Fetch.Value === null ? 1 : IntegerValue(top.Fetch.Value);
        caps.push(cap('Fetch', top.Fetch, rows, null, rows !== null && !top.Fetch.Percent && !top.Fetch.WithTies, top.Fetch.Percent, top.Fetch.WithTies));
    }
    return caps;
}

function limitCap(limit: LimitClause): RowCap {
    const rows = limit.Value === null ? null : IntegerValue(limit.Value);
    const skip = limit.LeadingOffset === null ? null : IntegerValue(limit.LeadingOffset);
    const numeric = (limit.Value === null || rows !== null) && (limit.LeadingOffset === null || skip !== null);
    return cap('Limit', limit, rows, skip, numeric, false, false);
}

function cap(form: RowCap['Form'], node: RowCap['Node'], rows: number | null, skip: number | null, numeric: boolean, percent: boolean, withTies: boolean): RowCap {
    return Object.freeze({ Form: form, Node: node, Span: node.Span, Rows: rows, Skip: skip, Numeric: numeric, Percent: percent, WithTies: withTies });
}

/** The value of an expression that is one integer literal; `null` otherwise. */
export function IntegerValue(expression: SqlExpression): number | null {
    const tokens = expression.Tokens();
    return tokens.length === 1 && tokens[0].Kind === 'Number' && /^\d+$/.test(tokens[0].Text) ? Number(tokens[0].Text) : null;
}

/** The statements that hold tokens. */
export function NonEmptyStatements(statements: readonly StatementNode[]): StatementNode[] {
    return statements.filter(s => s.StatementKind !== 'Empty');
}

/**
 * Whether the statements are exactly one read query. Fails closed: anything the parser could not
 * read, or any diagnostic that is an error or warning, refuses it.
 */
export function CheckReadOnly(statements: readonly StatementNode[], parsedCleanly: boolean): ReadOnlyCheck {
    const real = NonEmptyStatements(statements);
    if (real.length === 0) return refuse('it is empty');
    if (real.length > 1) return refuse('it contains more than one statement');
    const statement = real[0];
    if (statement.StatementKind !== 'Select') return refuse(`it is ${article(statement.StatementKind)} ${statement.StatementKind.toUpperCase()} statement, not a query`);
    const nested = findWrite(statement);
    if (nested !== null) return refuse(nested);
    if (!parsedCleanly) return refuse('part of it could not be read');
    return { IsReadOnly: true, Reason: null };
}

function findWrite(statement: StatementNode): string | null {
    let reason: string | null = null;
    WalkSqlNodes([statement], node => {
        if (reason !== null) return;
        reason = writeReason(node);
    });
    return reason;
}

function writeReason(node: SqlNode): string | null {
    if (node.Kind === 'Query' && node.StatementKind !== 'Select') return `it contains ${article(node.StatementKind)} ${node.StatementKind.toUpperCase()} inside a nested query or CTE`;
    if (node.Kind === 'Select' && node.Into !== null) return 'it writes its result into a table (SELECT … INTO)';
    if (node.Kind === 'For' && LOCKING_FORMS.has(node.Form)) return 'it locks the rows it reads (FOR UPDATE / FOR SHARE)';
    if (node.Kind === 'Unknown') return 'part of it could not be read';
    return null;
}

function article(kind: string): string {
    return /^[AEIOU]/i.test(kind) ? 'an' : 'a';
}

function refuse(reason: string): ReadOnlyCheck {
    return { IsReadOnly: false, Reason: reason };
}
