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

export function isObject(v: AstNode): v is AstObject {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function nodeType(v: AstNode): string | undefined {
    return isObject(v) && typeof v.type === 'string' ? v.type : undefined;
}

export function isLiteralNode(v: AstNode): boolean {
    const t = nodeType(v);
    return t !== undefined && LITERAL_NODE_TYPES.has(t);
}

/**
 * Resolves a `column_ref` node's bare column name across dialects. SQL Server emits `column` as a string;
 * PostgreSQL emits `column: { expr: { type: 'default', value: 'X' } }`. Returns null for computed/expression
 * columns (which are not clean filter/grouping columns).
 */
export function columnName(v: AstNode): string | null {
    if (nodeType(v) !== 'column_ref' || !isObject(v)) {
        return null;
    }
    const col = v.column;
    if (typeof col === 'string') {
        return col;
    }
    if (isObject(col) && isObject(col.expr) && typeof col.expr.value === 'string') {
        return col.expr.value;
    }
    return null;
}

/** True when every element of an `expr_list` value array is a literal leaf (an all-literal bag). */
export function isAllLiteralBag(v: AstNode): boolean {
    if (nodeType(v) !== 'expr_list' || !isObject(v) || !Array.isArray(v.value)) {
        return false;
    }
    return v.value.length > 0 && v.value.every(isLiteralNode);
}
