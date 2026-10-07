import type { SQLParserDialect } from '@memberjunction/sql-dialect';

/**
 * Kinds of token {@link LexSQL} produces.
 *
 * - `word`: a bare keyword or identifier (`SELECT`, `Name`, `__mj`).
 * - `number`: a numeric literal.
 * - `string`: a string literal in any form (`'…'`, `N'…'`, `E'…'`, `$tag$…$tag$`).
 * - `identifier`: a quoted identifier (`"…"`, `[…]`, `` `…` ``).
 * - `comment`: a line or block comment.
 * - `open` / `close`: a parenthesis.
 * - `whitespace`, `comma`, `semicolon`, `dot`, `operator`: the rest.
 */
export type SQLLexTokenKind =
    | 'word' | 'number' | 'string' | 'identifier' | 'comment'
    | 'open' | 'close' | 'comma' | 'semicolon' | 'dot' | 'operator' | 'whitespace';

/** One token, with its position in the original text and its parenthesis depth. */
export interface SQLLexToken {
    Kind: SQLLexTokenKind;
    /** The token's text exactly as it appears in the input. */
    Text: string;
    /** Offset of the first character. */
    Start: number;
    /** Offset just past the last character. */
    End: number;
    /**
     * Parenthesis depth the token sits at. An `open` token carries the depth outside it and a
     * `close` token the depth outside the parenthesis it closes, so both are at the same depth as
     * the text around them.
     */
    Depth: number;
}

interface LexFeatures {
    Brackets: boolean;
    Backticks: boolean;
    EscapeStrings: boolean;
    DollarQuotes: boolean;
}

function featuresFor(dialect: SQLParserDialect): LexFeatures {
    const sample = dialect.QuoteIdentifier('x');
    return {
        Brackets: sample.startsWith('['),
        Backticks: sample.startsWith('`'),
        EscapeStrings: dialect.SupportsEscapeStringLiterals,
        DollarQuotes: dialect.SupportsDollarQuotedStrings
    };
}

const WORD_START = /[A-Za-z_\u0080-￿@#]/;
const WORD_PART = /[A-Za-z0-9_$\u0080-￿@#]/;
const DIGIT = /[0-9]/;

/**
 * Splits SQL into tokens without parsing it, so it works on any statement the engine accepts,
 * including SQL the AST parser rejects. Every character of the input belongs to exactly one
 * token, so joining the tokens' text reproduces the input.
 *
 * Recognizes string literals with doubled-quote escapes and the `N` prefix, double-quoted
 * identifiers, `--` line comments and nested block comments everywhere, and per dialect:
 * bracket or backtick identifiers when the dialect quotes identifiers that way, `E'…'` strings
 * with backslash escapes when {@link SQLParserDialect.SupportsEscapeStringLiterals} is set, and
 * dollar-quoted strings (`$$…$$`, `$tag$…$tag$`) when
 * {@link SQLParserDialect.SupportsDollarQuotedStrings} is set. An unterminated literal or comment
 * runs to the end of the input.
 */
export function LexSQL(sql: string, dialect: SQLParserDialect): SQLLexToken[] {
    const features = featuresFor(dialect);
    const tokens: SQLLexToken[] = [];
    let depth = 0;
    let i = 0;
    while (i < sql.length) {
        const [kind, end] = readToken(sql, i, features);
        if (kind === 'close') depth = Math.max(0, depth - 1);
        tokens.push({ Kind: kind, Text: sql.substring(i, end), Start: i, End: end, Depth: depth });
        if (kind === 'open') depth++;
        i = end;
    }
    return tokens;
}

/** Reads the token starting at `i`; returns its kind and the offset just past it. */
function readToken(sql: string, i: number, f: LexFeatures): [SQLLexTokenKind, number] {
    const ch = sql[i];
    const next = sql[i + 1] ?? '';
    if (/\s/.test(ch)) return ['whitespace', skipWhile(sql, i, c => /\s/.test(c))];
    if (ch === '-' && next === '-') return ['comment', skipLineComment(sql, i)];
    if (ch === '/' && next === '*') return ['comment', skipBlockComment(sql, i)];
    if (ch === "'") return ['string', skipQuoted(sql, i, "'", false)];
    if ((ch === 'N' || ch === 'n') && next === "'") return ['string', skipQuoted(sql, i + 1, "'", false)];
    if (f.EscapeStrings && (ch === 'E' || ch === 'e') && next === "'") return ['string', skipQuoted(sql, i + 1, "'", true)];
    if (f.DollarQuotes && ch === '$') {
        const end = skipDollarQuoted(sql, i);
        if (end > i) return ['string', end];
    }
    if (ch === '"') return ['identifier', skipQuoted(sql, i, '"', false)];
    if (f.Brackets && ch === '[') return ['identifier', skipQuoted(sql, i, ']', false)];
    if (f.Backticks && ch === '`') return ['identifier', skipQuoted(sql, i, '`', false)];
    if (ch === '(') return ['open', i + 1];
    if (ch === ')') return ['close', i + 1];
    if (ch === ',') return ['comma', i + 1];
    if (ch === ';') return ['semicolon', i + 1];
    if (ch === '.' && !DIGIT.test(next)) return ['dot', i + 1];
    if (DIGIT.test(ch) || (ch === '.' && DIGIT.test(next))) return ['number', skipWhile(sql, i, c => /[0-9.eE]/.test(c))];
    if (WORD_START.test(ch)) return ['word', skipWhile(sql, i, c => WORD_PART.test(c))];
    return ['operator', i + 1];
}

function skipWhile(sql: string, i: number, test: (c: string) => boolean): number {
    let j = i;
    while (j < sql.length && test(sql[j])) j++;
    return j;
}

function skipLineComment(sql: string, i: number): number {
    const nl = sql.indexOf('\n', i);
    return nl === -1 ? sql.length : nl;
}

/** Block comments nest on both SQL Server and PostgreSQL. */
function skipBlockComment(sql: string, i: number): number {
    let depth = 0;
    let j = i;
    while (j < sql.length) {
        if (sql[j] === '/' && sql[j + 1] === '*') { depth++; j += 2; continue; }
        if (sql[j] === '*' && sql[j + 1] === '/') { depth--; j += 2; if (depth === 0) return j; continue; }
        j++;
    }
    return sql.length;
}

/**
 * Skips a quoted span opening at `i`. A doubled closing character is an escaped literal; with
 * `backslashEscapes`, so is any character after a backslash.
 */
function skipQuoted(sql: string, i: number, close: string, backslashEscapes: boolean): number {
    let j = i + 1;
    while (j < sql.length) {
        const c = sql[j];
        if (backslashEscapes && c === '\\') { j += 2; continue; }
        if (c === close) {
            if (sql[j + 1] === close) { j += 2; continue; }
            return j + 1;
        }
        j++;
    }
    return sql.length;
}

/**
 * Skips a PostgreSQL dollar-quoted string opening at `i`, or returns `i` when the `$` does not
 * open one (a positional parameter such as `$1`, or a stray `$`).
 */
function skipDollarQuoted(sql: string, i: number): number {
    const tag = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.substring(i));
    if (!tag) return i;
    const delimiter = tag[0];
    const close = sql.indexOf(delimiter, i + delimiter.length);
    return close === -1 ? sql.length : close + delimiter.length;
}

/** Tokens that carry meaning: everything except whitespace and comments. */
export function SignificantTokens(tokens: SQLLexToken[]): SQLLexToken[] {
    return tokens.filter(t => t.Kind !== 'whitespace' && t.Kind !== 'comment');
}

/** Whether a token is the given keyword, ignoring case. */
export function IsKeyword(token: SQLLexToken | undefined, keyword: string): boolean {
    return token?.Kind === 'word' && token.Text.toUpperCase() === keyword;
}
