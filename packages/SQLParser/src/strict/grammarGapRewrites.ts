import type { SQLParserDialect } from '@memberjunction/sql-dialect';
import { IsKeyword, LexSQL, SignificantTokens, type SQLLexToken } from '../sqlLexer.js';

/**
 * Rewrites for valid SQL Server reads that node-sql-parser's TransactSQL grammar cannot parse.
 * Each rewrite changes only syntax the grammar lacks, never what the statement reads: every
 * relation, subquery, column and write stays where it was, and a removed span is only keywords or
 * one string literal. The strict validator parses the result only to decide whether a statement
 * is a safe read and to collect its reads; the database still runs the original text. Never use
 * it to produce SQL to run.
 */

/**
 * Aggregates the grammar reads with a dedicated rule that has no `WITHIN GROUP` clause, so
 * `STRING_AGG(x, ', ') WITHIN GROUP (ORDER BY y)` does not parse: the grammar ends the call at its
 * closing parenthesis and reads `WITHIN` as a column alias. Its generic function rule does read
 * `WITHIN GROUP`, which is why `PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY x)` parses.
 */
const WITHIN_GROUP_AGGREGATES = new Set<string>(['STRING_AGG', 'ARRAY_AGG']);

/** Set operators the TransactSQL grammar lacks (it reads only UNION and UNION ALL). */
const UNSUPPORTED_SET_OPERATORS = new Set<string>(['INTERSECT', 'EXCEPT']);

/**
 * Function names the grammar lacks, each with a name it reads that takes the same arguments in the
 * same form: `TRY_CAST(x AS INT)` reads exactly what `CAST(x AS INT)` reads, and `COUNT_BIG(*)`
 * what `COUNT(*)` reads.
 */
const UNSUPPORTED_FUNCTIONS: ReadonlyMap<string, string> = new Map([
    ['TRY_CAST', 'CAST'],
    ['COUNT_BIG', 'COUNT'],
]);

/** Words that follow `RANGE` only in a window frame (`RANGE UNBOUNDED PRECEDING`, `RANGE BETWEEN …`). */
const WINDOW_FRAME_STARTS = new Set<string>(['UNBOUNDED', 'BETWEEN', 'CURRENT']);

/** Replace the tokens `From` through `To` (inclusive) with `Text`. */
interface TokenEdit {
    From: number;
    To: number;
    Text: string;
}

/**
 * `sql` with the grammar gaps rewritten, for bracket-quoting dialects (SQL Server); `sql` itself
 * for any other, whose grammar reads these forms. Each rewrite acts on tokens outside literals,
 * quoted identifiers and comments:
 * - the name of each {@link WITHIN_GROUP_AGGREGATES} call that `WITHIN GROUP (` follows is
 *   bracket-quoted, so the generic function rule reads it, arguments and ORDER BY included;
 * - each `INTERSECT` / `EXCEPT` set operator becomes `UNION`, which reads the same branches;
 * - each call of an {@link UNSUPPORTED_FUNCTIONS} name is renamed to its stand-in;
 * - a `RANGE` window frame becomes a `ROWS` frame with the same bounds;
 * - `ESCAPE '<char>'` after a LIKE pattern, `WITH TIES` after a TOP clause, and semicolons before
 *   the statement are dropped.
 */
export function RewriteGrammarGaps(sql: string, dialect: SQLParserDialect): string {
    if (!dialect.QuoteIdentifier('x').startsWith('[')) return sql;
    const tokens = SignificantTokens(LexSQL(sql, dialect));
    let out = sql;
    // Right to left, so an earlier token's offsets still hold after a later span is rewritten.
    for (let k = tokens.length - 1; k >= 0; k--) {
        const edit = editAt(tokens, k);
        if (edit !== null) {
            out = `${out.substring(0, tokens[edit.From].Start)}${edit.Text}${out.substring(tokens[edit.To].End)}`;
        }
    }
    return out;
}

/** The edit that starts at `tokens[k]`, or null when the token stays. */
function editAt(tokens: SQLLexToken[], k: number): TokenEdit | null {
    const token = tokens[k];
    if (token.Kind === 'semicolon') return isBeforeStatement(tokens, k) ? { From: k, To: k, Text: '' } : null;
    if (token.Kind !== 'word') return null;
    const upper = token.Text.toUpperCase();
    if (UNSUPPORTED_SET_OPERATORS.has(upper)) return { From: k, To: k, Text: 'UNION' };
    const standIn = UNSUPPORTED_FUNCTIONS.get(upper);
    if (standIn && isUnqualifiedCall(tokens, k)) return { From: k, To: k, Text: standIn };
    if (isWithinGroupAggregateCall(tokens, k)) return { From: k, To: k, Text: `[${token.Text}]` };
    return keywordEditAt(tokens, k, upper);
}

/** The edit for a clause keyword at `tokens[k]` (`RANGE`, `ESCAPE`, `WITH TIES`), or null. */
function keywordEditAt(tokens: SQLLexToken[], k: number, upper: string): TokenEdit | null {
    const next = tokens[k + 1];
    if (upper === 'RANGE' && next?.Kind === 'word' && WINDOW_FRAME_STARTS.has(next.Text.toUpperCase())) {
        return { From: k, To: k, Text: 'ROWS' };
    }
    if (upper === 'ESCAPE' && next?.Kind === 'string') {
        return { From: k, To: k + 1, Text: '' };
    }
    if (upper === 'WITH' && IsKeyword(next, 'TIES') && isAfterTopClause(tokens, k)) {
        return { From: k, To: k + 1, Text: '' };
    }
    return null;
}

/** Whether every token before `tokens[k]` is a semicolon too: separators ahead of the statement. */
function isBeforeStatement(tokens: SQLLexToken[], k: number): boolean {
    for (let i = 0; i < k; i++) {
        if (tokens[i].Kind !== 'semicolon') return false;
    }
    return true;
}

/** Whether `tokens[k]` is called (`(` follows) and is not qualified (no `.` before it). */
function isUnqualifiedCall(tokens: SQLLexToken[], k: number): boolean {
    return tokens[k - 1]?.Kind !== 'dot' && tokens[k + 1]?.Kind === 'open';
}

/**
 * Whether the `WITH` at `tokens[k]` ends a TOP clause: `TOP n`, `TOP (expr)`, or either followed
 * by `PERCENT`.
 */
function isAfterTopClause(tokens: SQLLexToken[], k: number): boolean {
    let end = k - 1;
    if (IsKeyword(tokens[end], 'PERCENT')) end--;
    const last = tokens[end];
    if (last?.Kind === 'number') return IsKeyword(tokens[end - 1], 'TOP');
    if (last?.Kind !== 'close') return false;
    const open = matchingOpenIndex(tokens, end);
    return open > 0 && IsKeyword(tokens[open - 1], 'TOP');
}

/** Whether `tokens[k]` names an unqualified {@link WITHIN_GROUP_AGGREGATES} call that `WITHIN GROUP (` follows. */
function isWithinGroupAggregateCall(tokens: SQLLexToken[], k: number): boolean {
    if (!WITHIN_GROUP_AGGREGATES.has(tokens[k].Text.toUpperCase()) || !isUnqualifiedCall(tokens, k)) return false;
    const close = matchingCloseIndex(tokens, k + 1);
    return close !== -1
        && IsKeyword(tokens[close + 1], 'WITHIN')
        && IsKeyword(tokens[close + 2], 'GROUP')
        && tokens[close + 3]?.Kind === 'open';
}

/** The index of the `close` token that ends the parenthesis opened at `tokens[open]`, or -1. */
function matchingCloseIndex(tokens: SQLLexToken[], open: number): number {
    const depth = tokens[open].Depth;
    for (let i = open + 1; i < tokens.length; i++) {
        if (tokens[i].Kind === 'close' && tokens[i].Depth === depth) return i;
    }
    return -1;
}

/** The index of the `open` token that the parenthesis closed at `tokens[close]` began with, or -1. */
function matchingOpenIndex(tokens: SQLLexToken[], close: number): number {
    const depth = tokens[close].Depth;
    for (let i = close - 1; i >= 0; i--) {
        if (tokens[i].Kind === 'open' && tokens[i].Depth === depth) return i;
    }
    return -1;
}
