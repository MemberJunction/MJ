import { SQLParser } from '@memberjunction/sql-parser';
import type { SQLParserDialect } from '@memberjunction/sql-dialect';

/**
 * Phase 2d — broad-render for row-filter materialization
 * (plan /plans/query-entity-materialization.md §6.4 "materialize broad, filter at read").
 *
 * A parameterized query classified `RowFilterBroad` (by Phase 2b/2c) is materialized **broad** —
 * every row the query could return for any value of the row-filter parameter — and the filter is
 * re-applied at read time as an ordinary predicate on the (projected) filter column. This module
 * produces that broad source SQL by **removing** the row-filter predicate from a rendered query.
 *
 * **Why this is sound:** the verifier only classifies a parameter `RowFilter(column)` when its value
 * varies a literal at a *clean top-level conjunctive* `WHERE` predicate on a single column, and the
 * qualifier only accepts it when that column is in the materialized output. A top-level conjunctive
 * `WHERE` predicate on a projected (for GROUP-BY queries, grouped) column commutes with the rest of
 * the query, so stripping it and re-applying it as an outer filter is algebraically identical to
 * running the query with that value. This module removes **exactly** those predicates and nothing else.
 *
 * Pure — parses with @memberjunction/sql-parser, mutates the WHERE AST, re-emits. No DB/IO.
 */

/** Outcome of stripping row-filter predicates from a rendered query. */
export interface BroadRenderResult {
    /** The broad SQL (row-filter predicates removed). Equals the input when nothing was removed. */
    sql: string;
    /** How many top-level conjunctive predicates on the row-filter columns were removed. */
    removedCount: number;
}

type AstNode = unknown;
type AstObject = Record<string, unknown>;

/** Literal-leaf node types (the value side of a removable predicate). Mirrors the verifier's set. */
const LITERAL_NODE_TYPES = new Set<string>([
    'single_quote_string', 'double_quote_string', 'backticks_quote_string', 'string',
    'number', 'bool', 'boolean', 'null', 'date', 'datetime', 'time', 'timestamp', 'hex_string', 'bit_string',
]);

/** Comparison operators whose `column <op> value` form is a removable row-filter predicate. */
const COMPARISON_OPS = new Set<string>([
    '=', '!=', '<>', '<', '>', '<=', '>=', 'IN', 'NOT IN', 'LIKE', 'NOT LIKE', 'IS', 'IS NOT', 'BETWEEN', 'NOT BETWEEN',
]);

function isObject(v: AstNode): v is AstObject {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function nodeType(v: AstNode): string | undefined {
    return isObject(v) && typeof v.type === 'string' ? v.type : undefined;
}

function isLiteralNode(v: AstNode): boolean {
    const t = nodeType(v);
    return t !== undefined && LITERAL_NODE_TYPES.has(t);
}

/** Resolves a `column_ref`'s bare name across dialects (SS string vs PG `{expr:{value}}`). */
function columnName(v: AstNode): string | null {
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

/** True when an `expr_list` holds only literals (the value side of `col IN (...)` / `BETWEEN`). */
function isAllLiteralBag(v: AstNode): boolean {
    if (nodeType(v) !== 'expr_list' || !isObject(v) || !Array.isArray(v.value)) {
        return false;
    }
    return v.value.length > 0 && v.value.every(isLiteralNode);
}

/** Flattens a top-level AND-chain into its individual conjuncts (non-AND leaves). */
function collectConjuncts(node: AstNode): AstNode[] {
    if (nodeType(node) === 'binary_expr' && isObject(node) && node.operator === 'AND') {
        return [...collectConjuncts(node.left), ...collectConjuncts(node.right)];
    }
    return [node];
}

/**
 * True when a conjunct is a removable row-filter predicate: a comparison `column <op> value`
 * (or `column IN/BETWEEN (literals)`) where the column is one of `cols` and the other side is a
 * literal / all-literal bag. Anything else (OR-expr, function, column=column, subquery) is kept.
 */
function isRemovablePredicate(conjunct: AstNode, cols: Set<string>): boolean {
    if (nodeType(conjunct) !== 'binary_expr' || !isObject(conjunct)) {
        return false;
    }
    const op = conjunct.operator;
    if (typeof op !== 'string' || !COMPARISON_OPS.has(op)) {
        return false;
    }
    const leftCol = columnName(conjunct.left);
    const rightCol = columnName(conjunct.right);
    const leftMatches = leftCol != null && cols.has(leftCol.trim().toLowerCase());
    const rightMatches = rightCol != null && cols.has(rightCol.trim().toLowerCase());
    if (leftMatches && !rightMatches) {
        return isLiteralNode(conjunct.right) || isAllLiteralBag(conjunct.right);
    }
    if (rightMatches && !leftMatches) {
        return isLiteralNode(conjunct.left) || isAllLiteralBag(conjunct.left);
    }
    return false;
}

/** Rebuilds a left-deep AND-chain from kept conjuncts, or null when none remain. */
function rebuildWhere(kept: AstNode[]): AstNode {
    if (kept.length === 0) {
        return null;
    }
    let node = kept[0];
    for (let i = 1; i < kept.length; i++) {
        node = { type: 'binary_expr', operator: 'AND', left: node, right: kept[i] } as AstObject;
    }
    return node;
}

/** Returns the sole statement of an AST, or null if it is not exactly one statement. */
function soleStatement(ast: AstNode): AstObject | null {
    const node = Array.isArray(ast) ? (ast.length === 1 ? ast[0] : null) : ast;
    return isObject(node) ? node : null;
}

/**
 * Produces the broad source SQL for a row-filter materialization by removing the top-level
 * conjunctive `WHERE` predicate(s) on `rowFilterColumns` from a **rendered** (concrete, non-templated)
 * query. Other conjuncts are preserved; if the row-filter predicates were the only ones, the `WHERE`
 * is dropped entirely.
 *
 * Returns the input unchanged with `removedCount: 0` when the SQL cannot be parsed as a single
 * simple SELECT, or when no matching predicate is found — the caller should treat `removedCount: 0`
 * on a query it believes is RowFilterBroad as an anomaly worth refusing (a broad materialization
 * that still carries the filter would be wrong).
 */
export function buildBroadRowFilterSQL(
    renderedSQL: string,
    rowFilterColumns: string[],
    dialect: SQLParserDialect,
): BroadRenderResult {
    if (!rowFilterColumns || rowFilterColumns.length === 0) {
        return { sql: renderedSQL, removedCount: 0 };
    }
    const parsed = SQLParser.Astify(renderedSQL, dialect);
    if (!parsed.astParsed || parsed.ast == null) {
        return { sql: renderedSQL, removedCount: 0 };
    }
    const stmt = soleStatement(parsed.ast);
    if (stmt == null || nodeType(stmt) !== 'select' || stmt.where == null) {
        return { sql: renderedSQL, removedCount: 0 };
    }

    const cols = new Set(rowFilterColumns.map((c) => c.trim().toLowerCase()));
    const conjuncts = collectConjuncts(stmt.where);
    const kept = conjuncts.filter((c) => !isRemovablePredicate(c, cols));
    const removedCount = conjuncts.length - kept.length;
    if (removedCount === 0) {
        return { sql: renderedSQL, removedCount: 0 };
    }

    stmt.where = rebuildWhere(kept);
    const sql = SQLParser.SqlifyAST(parsed.ast as Parameters<typeof SQLParser.SqlifyAST>[0], dialect);
    return { sql, removedCount };
}
