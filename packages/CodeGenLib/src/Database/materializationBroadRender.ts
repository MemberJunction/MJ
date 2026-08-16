import { SQLParser } from '@memberjunction/sql-parser';
import type { SQLParserDialect } from '@memberjunction/sql-dialect';
import {
    COMPARISON_OPS, isObject, nodeType, isLiteralNode, columnName, isAllLiteralBag,
    type AstNode, type AstObject,
} from './materializationSqlAst';

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
 * running the query with that value.
 *
 * **The isolation hazard, and how we refuse it:** this matcher works on *rendered* SQL (the parameter
 * is already a concrete literal) and is qualifier-blind, so it cannot by itself tell a parameter
 * predicate apart from (a) a *static* predicate on the same column (`… WHERE Region = {{r}} AND Region
 * <> 'Internal'`) or (b) a same-named column on another table (`o.Region = {{r}} AND c.Region = 'X'`).
 * Blindly stripping every match would broaden the materialization beyond what the live query can ever
 * return. Guard: the caller passes `expectedRemovals` = the number of row-filter *parameter* predicates
 * the classifier found, and we strip only when the match count equals it **exactly**. Any deviation
 * sets `ambiguous: true` and the caller refuses (query stays live-only) — the §10 "refuse under
 * uncertainty" bias. So we remove **exactly** the parameter predicates, or we decline.
 *
 * Pure — parses with @memberjunction/sql-parser, mutates the WHERE AST, re-emits. No DB/IO.
 */

/** Outcome of stripping row-filter predicates from a rendered query. */
export interface BroadRenderResult {
    /** The broad SQL (row-filter predicates removed). Equals the input when nothing was removed. */
    sql: string;
    /** How many top-level conjunctive predicates on the row-filter columns were removed. */
    removedCount: number;
    /**
     * True when `removedCount` does NOT equal the caller-supplied `expectedRemovals` (the number of
     * row-filter *parameter* predicates the classifier identified). This means broad-render either
     * matched MORE predicates than there are parameters (a static predicate on the same column, or a
     * same-named column on another table — this matcher is qualifier-blind) or FEWER (a parameter
     * predicate it could not find). In either case the parameter predicate cannot be cleanly isolated,
     * so re-applying only the filter column at read time would include/exclude rows the live query
     * never would — the caller MUST refuse to materialize. Always false when `expectedRemovals` is
     * omitted (the matcher makes no exact-count claim).
     */
    ambiguous: boolean;
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
 *
 * When `expectedRemovals` is supplied (the classifier's row-filter *parameter* count), the result's
 * `ambiguous` flag is set whenever the actual match count differs from it — and when ambiguous, the
 * original SQL is returned **unmodified** (never a partially/over-stripped query), so a caller that
 * ignores the flag fails safe (it would then still carry the filter, which is refused upstream rather
 * than silently broadened). Omit `expectedRemovals` to keep the legacy "strip all matches" behavior
 * with `ambiguous` always false.
 */
export function buildBroadRowFilterSQL(
    renderedSQL: string,
    rowFilterColumns: string[],
    dialect: SQLParserDialect,
    expectedRemovals?: number,
): BroadRenderResult {
    // ambiguous is only ever asserted when the caller told us how many parameter predicates to expect.
    const verdict = (sql: string, removedCount: number): BroadRenderResult => ({
        sql,
        removedCount,
        ambiguous: expectedRemovals != null && removedCount !== expectedRemovals,
    });
    if (!rowFilterColumns || rowFilterColumns.length === 0) {
        return verdict(renderedSQL, 0);
    }
    const parsed = SQLParser.Astify(renderedSQL, dialect);
    if (!parsed.astParsed || parsed.ast == null) {
        return verdict(renderedSQL, 0);
    }
    const stmt = soleStatement(parsed.ast);
    if (stmt == null || nodeType(stmt) !== 'select' || stmt.where == null) {
        return verdict(renderedSQL, 0);
    }

    const cols = new Set(rowFilterColumns.map((c) => c.trim().toLowerCase()));
    const conjuncts = collectConjuncts(stmt.where);
    const kept = conjuncts.filter((c) => !isRemovablePredicate(c, cols));
    const removedCount = conjuncts.length - kept.length;
    if (removedCount === 0) {
        return verdict(renderedSQL, 0);
    }
    // Fail safe: when the match count doesn't match the expected parameter count, the parameter
    // predicate can't be cleanly isolated — return the ORIGINAL SQL (unstripped) and flag ambiguous
    // so an inattentive caller carries the filter (refused upstream) rather than materializing broad.
    if (expectedRemovals != null && removedCount !== expectedRemovals) {
        return verdict(renderedSQL, removedCount);
    }

    stmt.where = rebuildWhere(kept);
    const sql = SQLParser.SqlifyAST(parsed.ast as Parameters<typeof SQLParser.SqlifyAST>[0], dialect);
    return verdict(sql, removedCount);
}
