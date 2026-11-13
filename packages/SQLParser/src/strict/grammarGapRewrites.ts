import type { SQLParserDialect } from '@memberjunction/sql-dialect';
import { IsKeyword, LexSQL, SignificantTokens, type SQLLexToken } from '../sqlLexer.js';

/**
 * Rewrites for valid read-only SQL that node-sql-parser's TransactSQL or PostgresQL grammar cannot
 * parse. Each rewrite changes only syntax the grammar lacks, never what the statement reads: every
 * relation, subquery, column and write stays where it was, and a removed span is only keywords,
 * literal row counts or one string literal. The strict validator parses the result only to decide
 * whether a statement is a safe read and to collect its reads; the database still runs the
 * original text. Never use it to produce SQL to run.
 */

/**
 * Aggregates the TransactSQL grammar reads with a dedicated rule that has no `WITHIN GROUP` clause,
 * so `STRING_AGG(x, ', ') WITHIN GROUP (ORDER BY y)` does not parse: the grammar ends the call at its
 * closing parenthesis and reads `WITHIN` as a column alias. Its generic function rule does read
 * `WITHIN GROUP`, which is why `PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY x)` parses.
 */
const WITHIN_GROUP_AGGREGATES = new Set<string>(['STRING_AGG', 'ARRAY_AGG']);

/** Set operators the TransactSQL grammar lacks (it reads only UNION and UNION ALL). */
const UNSUPPORTED_SET_OPERATORS = new Set<string>(['INTERSECT', 'EXCEPT']);

/**
 * Function names the TransactSQL grammar lacks, each with a name it reads that takes the same
 * arguments in the same form: `TRY_CAST(x AS INT)` reads exactly what `CAST(x AS INT)` reads, and
 * `COUNT_BIG(*)` what `COUNT(*)` reads.
 */
const UNSUPPORTED_FUNCTIONS: ReadonlyMap<string, string> = new Map([
    ['TRY_CAST', 'CAST'],
    ['COUNT_BIG', 'COUNT'],
]);

/** Words that follow `RANGE` only in a window frame (`RANGE UNBOUNDED PRECEDING`, `RANGE BETWEEN …`). */
const WINDOW_FRAME_STARTS = new Set<string>(['UNBOUNDED', 'BETWEEN', 'CURRENT']);

/** The gaps one grammar has; each flag turns on the rewrite of that form. */
interface GrammarGaps {
    /** `STRING_AGG … WITHIN GROUP`, `INTERSECT` / `EXCEPT`, `TRY_CAST`, `COUNT_BIG`. */
    FunctionsAndSetOperators: boolean;
    /** `LIKE … ESCAPE '<char>'`, `TOP … WITH TIES`, semicolons before the statement. */
    ClauseKeywords: boolean;
    /** A `RANGE` window frame. */
    RangeFrames: boolean;
    /** `OFFSET <n> ROW[S]` and `FETCH FIRST|NEXT [<n>] ROW[S] ONLY|WITH TIES` with literal counts. */
    OffsetFetch: boolean;
}

/** The gaps of each grammar the rewrites know, keyed by grammar name. */
const GRAMMAR_GAPS: Readonly<Record<string, GrammarGaps>> = {
    TransactSQL: { FunctionsAndSetOperators: true, ClauseKeywords: true, RangeFrames: true, OffsetFetch: true },
    PostgresQL: { FunctionsAndSetOperators: false, ClauseKeywords: false, RangeFrames: true, OffsetFetch: true },
};

/** Replace the tokens `From` through `To` (inclusive) with `Text`. */
interface TokenEdit {
    From: number;
    To: number;
    Text: string;
}

/**
 * `sql` with the gaps of the grammar `dialect` parses with (its `ParserDialect`) rewritten; `sql`
 * itself for a grammar with no known gaps. Each rewrite acts on tokens outside literals, quoted
 * identifiers and comments:
 * - TransactSQL: the name of each {@link WITHIN_GROUP_AGGREGATES} call that `WITHIN GROUP (` follows
 *   is bracket-quoted, so the generic function rule reads it, arguments and ORDER BY included; each
 *   `INTERSECT` / `EXCEPT` becomes `UNION`, which reads the same branches; each call of an
 *   {@link UNSUPPORTED_FUNCTIONS} name is renamed to its stand-in; and `ESCAPE '<char>'` after a
 *   LIKE pattern, `WITH TIES` after a TOP clause and semicolons before the statement are dropped;
 * - TransactSQL and PostgresQL: a `RANGE` window frame becomes a `ROWS` frame with the same bounds,
 *   and an `OFFSET <n> ROW[S]` or `FETCH FIRST|NEXT [<n>] ROW[S] ONLY|WITH TIES` clause with a
 *   literal count is dropped.
 */
export function RewriteGrammarGaps(sql: string, dialect: SQLParserDialect): string {
    const gaps = GRAMMAR_GAPS[dialect.ParserDialect];
    if (!gaps) return sql;
    const tokens = SignificantTokens(LexSQL(sql, dialect));
    let out = sql;
    // Right to left, so an earlier token's offsets still hold after a later span is rewritten.
    for (let k = tokens.length - 1; k >= 0; k--) {
        const edit = editAt(tokens, k, gaps);
        if (edit !== null) {
            out = `${out.substring(0, tokens[edit.From].Start)}${edit.Text}${out.substring(tokens[edit.To].End)}`;
        }
    }
    return out;
}

/** The edit that starts at `tokens[k]` under `gaps`, or null when the token stays. */
function editAt(tokens: SQLLexToken[], k: number, gaps: GrammarGaps): TokenEdit | null {
    const token = tokens[k];
    if (token.Kind === 'semicolon') {
        return gaps.ClauseKeywords && isBeforeStatement(tokens, k) ? { From: k, To: k, Text: '' } : null;
    }
    if (token.Kind !== 'word') return null;
    const upper = token.Text.toUpperCase();
    return (gaps.FunctionsAndSetOperators ? functionOrSetOperatorEdit(tokens, k, upper) : null)
        ?? (gaps.ClauseKeywords ? clauseKeywordEdit(tokens, k, upper) : null)
        ?? (gaps.RangeFrames ? rangeFrameEdit(tokens, k, upper) : null)
        ?? (gaps.OffsetFetch ? offsetFetchEdit(tokens, k, upper) : null);
}

/** The edit for a set operator, an unsupported function name or a WITHIN GROUP aggregate at `tokens[k]`. */
function functionOrSetOperatorEdit(tokens: SQLLexToken[], k: number, upper: string): TokenEdit | null {
    if (UNSUPPORTED_SET_OPERATORS.has(upper)) return { From: k, To: k, Text: 'UNION' };
    const standIn = UNSUPPORTED_FUNCTIONS.get(upper);
    if (standIn && isUnqualifiedCall(tokens, k)) return { From: k, To: k, Text: standIn };
    if (isWithinGroupAggregateCall(tokens, k)) return { From: k, To: k, Text: `[${tokens[k].Text}]` };
    return null;
}

/** The edit for `ESCAPE '<char>'` or `WITH TIES` after a TOP clause at `tokens[k]`. */
function clauseKeywordEdit(tokens: SQLLexToken[], k: number, upper: string): TokenEdit | null {
    const next = tokens[k + 1];
    if (upper === 'ESCAPE' && next?.Kind === 'string') return { From: k, To: k + 1, Text: '' };
    if (upper === 'WITH' && IsKeyword(next, 'TIES') && isAfterTopClause(tokens, k)) return { From: k, To: k + 1, Text: '' };
    return null;
}

/** The edit that turns a `RANGE` window frame at `tokens[k]` into a `ROWS` frame. */
function rangeFrameEdit(tokens: SQLLexToken[], k: number, upper: string): TokenEdit | null {
    const next = tokens[k + 1];
    if (upper !== 'RANGE' || next?.Kind !== 'word' || !WINDOW_FRAME_STARTS.has(next.Text.toUpperCase())) return null;
    return { From: k, To: k, Text: 'ROWS' };
}

/**
 * The edit that drops `OFFSET <n> ROW[S]` or `FETCH FIRST|NEXT [<n>] ROW[S] ONLY|WITH TIES` starting
 * at `tokens[k]`. Only a literal count is dropped, so a count that is an expression (a subquery
 * among them) always stays to be read.
 */
function offsetFetchEdit(tokens: SQLLexToken[], k: number, upper: string): TokenEdit | null {
    if (upper === 'OFFSET') {
        return tokens[k + 1]?.Kind === 'number' && isRowWord(tokens[k + 2]) ? { From: k, To: k + 2, Text: '' } : null;
    }
    if (upper !== 'FETCH' || !(IsKeyword(tokens[k + 1], 'FIRST') || IsKeyword(tokens[k + 1], 'NEXT'))) return null;
    let i = k + 2;
    if (tokens[i]?.Kind === 'number') i++;
    if (!isRowWord(tokens[i])) return null;
    if (IsKeyword(tokens[i + 1], 'ONLY')) return { From: k, To: i + 1, Text: '' };
    if (IsKeyword(tokens[i + 1], 'WITH') && IsKeyword(tokens[i + 2], 'TIES')) return { From: k, To: i + 2, Text: '' };
    return null;
}

/** Whether `token` is `ROW` or `ROWS`. */
function isRowWord(token: SQLLexToken | undefined): boolean {
    return IsKeyword(token, 'ROW') || IsKeyword(token, 'ROWS');
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
