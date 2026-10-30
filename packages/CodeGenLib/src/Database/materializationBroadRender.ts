import type { ConditionClause, IdentifierPath, Span, SqlDocument, SqlToken } from '@memberjunction/sql-parser';
import type { SQLParserDialect } from '@memberjunction/sql-dialect';
import {
    IsReadableCondition, ParseSoleSelect, PathColumn, ReadComparison, ReadConditionTree,
    type ConditionAnd, type ConditionLeaf, type ConditionNode,
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
 * The removal is a set of span edits on the author's text: each removed conjunct goes with one
 * adjacent `AND` (and the whole `WHERE` goes when every conjunct does). Everything else — comments,
 * casing, identifier quoting, whitespace — stays exactly as written.
 *
 * Pure — reads the query with @memberjunction/sql-parser's SqlDocument and edits its text. No DB/IO.
 */

/** Outcome of stripping row-filter predicates from a rendered query. */
export interface BroadRenderResult {
    /** The broad SQL (row-filter predicates removed). Equals the input when nothing was removed. */
    Sql: string;
    /** How many top-level conjunctive predicates on the row-filter columns were removed. */
    RemovedCount: number;
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
    Ambiguous: boolean;
}

/** The document and top-level WHERE that broad-render edits. */
interface BroadTarget {
    Document: SqlDocument;
    Where: ConditionClause;
    /** The condition's significant tokens. */
    Tokens: readonly SqlToken[];
    /** The condition's identifier paths (nested subqueries excluded). */
    Paths: readonly IdentifierPath[];
}

/** Which conjuncts of a condition subtree go: every one (`All`), or the listed spans of the author's text. */
interface RemovalPlan {
    All: boolean;
    Removed: number;
    Spans: Span[];
}

/**
 * The top-level WHERE of a rendered query that is one SELECT block (a leading WITH clause allowed);
 * null when the text could not be read completely, holds several statements, is not a query, is a set
 * operation, or has no WHERE (or a WHERE that is not one condition) — the cases broad-render leaves
 * the SQL unchanged.
 */
function broadTargetOf(renderedSQL: string, dialect: SQLParserDialect): BroadTarget | null {
    const sole = ParseSoleSelect(renderedSQL, dialect);
    const where = sole?.Select.Where ?? null;
    const tokens = where?.Condition.Tokens() ?? [];
    if (sole === null || where === null || !IsReadableCondition(tokens)) {
        return null;
    }
    return { Document: sole.Document, Where: where, Tokens: tokens, Paths: where.Condition.Identifiers() };
}

/**
 * True when a leaf conjunct is a removable row-filter predicate: a comparison `column <op> value`
 * (or `column IN/BETWEEN` literals) where the column is one of `cols` and the other side is a
 * literal / all-literal list. Anything else (OR-expr, function, column=column, subquery) is kept.
 */
function isRemovablePredicate(target: BroadTarget, leaf: ConditionLeaf, cols: Set<string>): boolean {
    const predicate = ReadComparison(target.Tokens, leaf.InnerStart, leaf.InnerEnd, target.Paths);
    return predicate !== null && cols.has(PathColumn(predicate.Column).trim().toLowerCase());
}

/** The whitespace token just before `offset`, unless a line comment ends right before it (removing its line break would comment out what follows). */
function whitespaceBefore(document: SqlDocument, offset: number): Span | null {
    const tokens = document.Tokens.Tokens;
    const index = document.Tokens.IndexAt(offset);
    const before = tokens[index - 1];
    if (index < 1 || before === undefined || before.Kind !== 'Whitespace') {
        return null;
    }
    const beforeThat = tokens[index - 2];
    const lineComment = beforeThat !== undefined && beforeThat.Kind === 'Comment' && !beforeThat.Text.startsWith('/*');
    return lineComment ? null : before.Span;
}

/** The whitespace token just after `offset` (the end of a token), or null. */
function whitespaceAfter(document: SqlDocument, offset: number): Span | null {
    const token = document.Tokens.Tokens[document.Tokens.IndexAt(offset)];
    return token !== undefined && token.Kind === 'Whitespace' ? token.Span : null;
}

/**
 * The span that removes child `k` of an AND chain together with one adjacent `AND`. When a kept conjunct
 * comes before it, the `AND` before it goes (with the whitespace before that `AND`); otherwise the `AND`
 * after it goes (with the whitespace after that `AND`), so the kept text keeps its own spacing.
 */
function childRemovalSpan(target: BroadTarget, node: ConditionAnd, k: number, keptBefore: boolean): Span {
    const t = target.Tokens;
    const child = node.Children[k];
    if (keptBefore) {
        const separator = t[node.Separators[k - 1]].Span;
        const start = whitespaceBefore(target.Document, separator.Start)?.Start ?? separator.Start;
        return { Start: start, End: t[child.End - 1].Span.End };
    }
    const separator = t[node.Separators[k]].Span;
    const end = whitespaceAfter(target.Document, separator.End)?.End ?? separator.End;
    return { Start: t[child.Start].Span.Start, End: end };
}

/** Plans the removals for a condition subtree: a removable leaf goes whole; an AND chain goes conjunct by conjunct. */
function planRemovals(target: BroadTarget, node: ConditionNode, cols: Set<string>): RemovalPlan {
    if (node.Kind === 'Leaf') {
        const removable = isRemovablePredicate(target, node, cols);
        return { All: removable, Removed: removable ? 1 : 0, Spans: [] };
    }
    const plans = node.Children.map((child) => planRemovals(target, child, cols));
    const removed = plans.reduce((sum, p) => sum + p.Removed, 0);
    if (plans.every((p) => p.All)) {
        return { All: true, Removed: removed, Spans: [] };
    }
    const spans: Span[] = [];
    let keptBefore = false;
    plans.forEach((plan, k) => {
        if (plan.All) {
            spans.push(childRemovalSpan(target, node, k, keptBefore));
        } else {
            spans.push(...plan.Spans);
            keptBefore = true;
        }
    });
    return { All: false, Removed: removed, Spans: spans };
}

/** The span that removes the whole WHERE clause, with the whitespace before it. */
function whereRemovalSpan(target: BroadTarget): Span {
    const clause = target.Where.Span;
    const before = whitespaceBefore(target.Document, clause.Start);
    return { Start: before?.Start ?? clause.Start, End: clause.End };
}

/**
 * Produces the broad source SQL for a row-filter materialization by removing the top-level
 * conjunctive `WHERE` predicate(s) on `rowFilterColumns` from a **rendered** (concrete, non-templated)
 * query. Other conjuncts are preserved; if the row-filter predicates were the only ones, the `WHERE`
 * is dropped entirely.
 *
 * Returns the input unchanged with `removedCount: 0` when the SQL cannot be read completely as a
 * single SELECT block (a set operation included), or when no matching predicate is found — the caller should treat `removedCount: 0`
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
export function BuildBroadRowFilterSQL(
    renderedSQL: string,
    rowFilterColumns: string[],
    dialect: SQLParserDialect,
    expectedRemovals?: number,
): BroadRenderResult {
    // ambiguous is only ever asserted when the caller told us how many parameter predicates to expect.
    const verdict = (sql: string, removedCount: number): BroadRenderResult => ({
        Sql: sql,
        RemovedCount: removedCount,
        Ambiguous: expectedRemovals != null && removedCount !== expectedRemovals,
    });
    if (!rowFilterColumns || rowFilterColumns.length === 0) {
        return verdict(renderedSQL, 0);
    }
    const target = broadTargetOf(renderedSQL, dialect);
    if (target === null) {
        return verdict(renderedSQL, 0);
    }

    const cols = new Set(rowFilterColumns.map((c) => c.trim().toLowerCase()));
    const plan = planRemovals(target, ReadConditionTree(target.Tokens), cols);
    if (plan.Removed === 0) {
        return verdict(renderedSQL, 0);
    }
    // Fail safe: when the match count doesn't match the expected parameter count, the parameter
    // predicate can't be cleanly isolated — return the ORIGINAL SQL (unstripped) and flag ambiguous
    // so an inattentive caller carries the filter (refused upstream) rather than materializing broad.
    if (expectedRemovals != null && plan.Removed !== expectedRemovals) {
        return verdict(renderedSQL, plan.Removed);
    }

    const spans = plan.All ? [whereRemovalSpan(target)] : plan.Spans;
    const edits = spans.reduce((set, span) => set.Remove(span), target.Document.Edit());
    return verdict(edits.Apply().Text, plan.Removed);
}

/** @deprecated Use {@link BuildBroadRowFilterSQL}. */
export function buildBroadRowFilterSQL(
    renderedSQL: string,
    rowFilterColumns: string[],
    dialect: SQLParserDialect,
    expectedRemovals?: number,
): BroadRenderResult {
    return BuildBroadRowFilterSQL(renderedSQL, rowFilterColumns, dialect, expectedRemovals);
}
