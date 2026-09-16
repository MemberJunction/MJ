/**
 * Shared, dialect-tolerant primitives for walking node-sql-parser's loosely-typed JSON AST, used by the
 * materialization CodeGen analyzers: the parameter verifier (materializationParamVerifier.ts), the broad-render
 * predicate stripper (materializationBroadRender.ts), and the GROUP BY key detector (materializationAnalysis.ts).
 *
 * These MUST be a single source of truth. The verifier classifies a parameter as a clean RowFilter using
 * LITERAL_NODE_TYPES / COMPARISON_OPS, and broad-render strips exactly those predicates; if divergent hand-kept
 * copies drifted (e.g. a node-sql-parser upgrade adds a literal node type to one set but not the other), the
 * verifier could accept a predicate broad-render then fails to isolate — a wrongly-filtered materialization.
 * Centralizing them here removes that hazard.
 *
 * node-sql-parser emits a discriminated-ish union of dozens of node shapes; walking it generically is the
 * correct use of `unknown` + type guards (every access is narrowed), not a lazy escape. A node is a scalar,
 * an array, or a keyed object with an optional `type` discriminant.
 */

export type AstNode = unknown;
export type AstObject = Record<string, unknown>;

/** Literal-leaf node types whose `value` is the substituted literal (the value side of a filter predicate). */
export const LITERAL_NODE_TYPES = new Set<string>([
    'single_quote_string',
    'double_quote_string',
    'backticks_quote_string',
    'string',
    'number',
    'bool',
    'boolean',
    'null',
    'date',
    'datetime',
    'time',
    'timestamp',
    'hex_string',
    'bit_string',
]);

/** Comparison operators whose `column <op> value` form is a re-applicable read-time row filter. */
export const COMPARISON_OPS = new Set<string>([
    '=', '!=', '<>', '<', '>', '<=', '>=',
    'IN', 'NOT IN', 'LIKE', 'NOT LIKE', 'IS', 'IS NOT', 'BETWEEN', 'NOT BETWEEN',
]);

export function IsObject(v: AstNode): v is AstObject {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** @deprecated Use {@link IsObject}. */
export function isObject(v: AstNode): v is AstObject {
    return IsObject(v);
}

export function NodeType(v: AstNode): string | undefined {
    return IsObject(v) && typeof v.type === 'string' ? v.type : undefined;
}

/** @deprecated Use {@link NodeType}. */
export function nodeType(v: AstNode): string | undefined {
    return NodeType(v);
}

export function IsLiteralNode(v: AstNode): boolean {
    const t = NodeType(v);
    return t !== undefined && LITERAL_NODE_TYPES.has(t);
}

/** @deprecated Use {@link IsLiteralNode}. */
export function isLiteralNode(v: AstNode): boolean {
    return IsLiteralNode(v);
}

/**
 * Unwraps a node-sql-parser identifier slot (`column`, `table`) to plain text across dialects.
 * SQL Server emits a bare string; PostgreSQL wraps a quoted identifier as
 * `{ expr: { type: 'double_quote_string' | 'default', value: 'X' } }`. Returns null for anything else
 * (an absent qualifier, or a computed/expression node that is not a plain identifier).
 */
function identifierText(v: AstNode): string | null {
    if (typeof v === 'string') {
        return v;
    }
    if (IsObject(v) && IsObject(v.expr) && typeof v.expr.value === 'string') {
        return v.expr.value;
    }
    return null;
}

/**
 * Resolves a `column_ref` node's bare column name across dialects. SQL Server emits `column` as a string;
 * PostgreSQL emits `column: { expr: { type: 'default', value: 'X' } }`. Returns null for computed/expression
 * columns (which are not clean filter/grouping columns).
 *
 * **This deliberately DISCARDS the table qualifier** — `o.Status` and `c.Status` both return `'Status'`.
 * That is correct for callers that only need a name, but a caller that MATCHES a column reference against
 * another column reference (a SELECT-list output, another predicate) MUST also compare
 * {@link columnQualifier} — see {@link qualifiedColumn}. Matching on the bare name alone silently conflates
 * same-named columns from different tables in a join.
 */
export function ColumnName(v: AstNode): string | null {
    if (NodeType(v) !== 'column_ref' || !IsObject(v)) {
        return null;
    }
    return identifierText(v.column);
}

/** @deprecated Use {@link ColumnName}. */
export function columnName(v: AstNode): string | null {
    return ColumnName(v);
}

/**
 * Resolves a `column_ref` node's TABLE QUALIFIER — the `o` in `o.Status` (a table alias, or the table name
 * when no alias is declared). Returns null when the reference is unqualified (`Status`) or when the node is
 * not a `column_ref`. Dialect-tolerant in the same way as {@link columnName}.
 */
export function ColumnQualifier(v: AstNode): string | null {
    if (NodeType(v) !== 'column_ref' || !IsObject(v)) {
        return null;
    }
    return identifierText(v.table);
}

/** @deprecated Use {@link ColumnQualifier}. */
export function columnQualifier(v: AstNode): string | null {
    return ColumnQualifier(v);
}

/** A `column_ref` split into its optional table qualifier and its bare column name. */
export interface QualifiedColumn {
    /** Table alias / table name qualifying the reference (`o` in `o.Status`); null when unqualified. */
    qualifier: string | null;
    /** Bare column name (`Status` in `o.Status`). */
    column: string;
}

/**
 * Resolves a `column_ref` into its qualifier + column pair, or null when the node is not a plain column
 * reference. Prefer this over {@link columnName} whenever the resolved column is compared to ANOTHER
 * column reference — the qualifier is what distinguishes `o.Status` from `c.Status`.
 */
export function qualifiedColumn(v: AstNode): QualifiedColumn | null {  // case-violation-ok-legacy-back-compat: the PascalCase name is already taken in this scope
    const column = ColumnName(v);
    if (column == null) {
        return null;
    }
    return { qualifier: ColumnQualifier(v), column };
}

/** Case- and whitespace-insensitive SQL identifier equality. Null/undefined never matches anything. */
export function IdentifiersEqual(a: string | null | undefined, b: string | null | undefined): boolean {
    if (a == null || b == null) {
        return false;
    }
    return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** @deprecated Use {@link IdentifiersEqual}. */
export function identifiersEqual(a: string | null | undefined, b: string | null | undefined): boolean {
    return IdentifiersEqual(a, b);
}

/**
 * True when a parsed statement root is a SET OPERATION (`UNION` / `UNION ALL` / `EXCEPT` / `INTERSECT`).
 *
 * **Why every analyzer needs this guard:** node-sql-parser does NOT emit a distinct `union` node type. It
 * emits a SINGLE `type: 'select'` root for the FIRST branch, carrying `set_op: 'union all'` and `_next`
 * (the remaining branch, itself a select node). So a naive `ast[0]` reader sees a plain SELECT whose
 * `columns`, `where`, and `groupby` describe **only the first branch** — every other branch is invisible.
 * Any analyzer that draws a conclusion about the whole result set (its key, its predicates, its shape)
 * from that root is silently reasoning about a fraction of the query. All such analyzers MUST refuse a
 * set-op root outright (§10 refuse-under-uncertainty).
 */
export function IsSetOperationRoot(node: AstNode): boolean {
    return IsObject(node) && (node.set_op != null || node._next != null);
}

/** @deprecated Use {@link IsSetOperationRoot}. */
export function isSetOperationRoot(node: AstNode): boolean {
    return IsSetOperationRoot(node);
}

/**
 * Returns the sole statement of a parsed AST, or null when it is not exactly one statement.
 * A multi-statement script cannot be analyzed from its first statement alone, so callers refuse
 * rather than inspect only `ast[0]`.
 */
export function SoleStatement(ast: AstNode): AstNode | null {
    if (Array.isArray(ast)) {
        return ast.length === 1 ? ast[0] : null;
    }
    return ast;
}

/** @deprecated Use {@link SoleStatement}. */
export function soleStatement(ast: AstNode): AstNode | null {
    return SoleStatement(ast);
}

/** True when every element of an `expr_list` value array is a literal leaf (an all-literal bag). */
export function IsAllLiteralBag(v: AstNode): boolean {
    if (NodeType(v) !== 'expr_list' || !IsObject(v) || !Array.isArray(v.value)) {
        return false;
    }
    return v.value.length > 0 && v.value.every(IsLiteralNode);
}

/** @deprecated Use {@link IsAllLiteralBag}. */
export function isAllLiteralBag(v: AstNode): boolean {
    return IsAllLiteralBag(v);
}
