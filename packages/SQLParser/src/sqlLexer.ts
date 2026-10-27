import type {
    DialectLexicalRules,
    IdentifierQuoteForm,
    LineCommentForm,
    ParserDialect,
    SQLParserDialect,
    StringLiteralForm,
} from '@memberjunction/sql-dialect';

/**
 * Kinds of token {@link LexSQL} produces.
 *
 * - `word`: a bare keyword or identifier (`SELECT`, `Name`, `__mj`).
 * - `number`: a numeric literal.
 * - `string`: a string literal in any form (`'…'`, `N'…'`, `E'…'`, `$tag$…$tag$`, `q'[…]'`).
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

/** A dialect the lexer accepts: one with a lexical facet, or the older parser-dialect interface. */
export type LexDialect = ParserDialect | SQLParserDialect;

const DOUBLE_QUOTED_IDENTIFIER: IdentifierQuoteForm = { Open: '"', Close: '"', DoubledCloseEscape: true };
const PLAIN_STRING: StringLiteralForm = { Prefixes: ['', 'N'], Quote: "'", DoubledQuoteEscape: true, BackslashEscape: false };
const ESCAPE_STRING: StringLiteralForm = { Prefixes: ['E'], Quote: "'", DoubledQuoteEscape: true, BackslashEscape: true };

/**
 * The lexical rules of a dialect. A dialect with a {@link DialectLexicalRules} facet supplies its
 * own; for one with only the older interface they are derived from its quoting and string flags:
 * `"…"` identifiers plus `[…]` or `` `…` `` when it quotes that way, `'…'` / `N'…'` strings plus
 * `E'…'` and dollar quoting when flagged, `--` comments and nested block comments.
 */
function rulesFor(dialect: LexDialect): DialectLexicalRules {
    if ('Lexical' in dialect) {
        return dialect.Lexical;
    }
    return legacyRules(dialect);
}

function legacyRules(dialect: SQLParserDialect): DialectLexicalRules {
    const sample = dialect.QuoteIdentifier('x');
    const identifiers: IdentifierQuoteForm[] = [DOUBLE_QUOTED_IDENTIFIER];
    if (sample.startsWith('[')) identifiers.push({ Open: '[', Close: ']', DoubledCloseEscape: true });
    if (sample.startsWith('`')) identifiers.push({ Open: '`', Close: '`', DoubledCloseEscape: true });
    return {
        IdentifierQuotes: identifiers,
        StringLiterals: dialect.SupportsEscapeStringLiterals ? [PLAIN_STRING, ESCAPE_STRING] : [PLAIN_STRING],
        BackslashEscapesDependOnServerSettings: false,
        DollarQuotedStrings: dialect.SupportsDollarQuotedStrings ? 'tagged' : 'none',
        AlternativeQuotingPrefixes: [],
        LineComments: [{ Opener: '--', RequiresWhitespaceAfter: false }],
        BlockComments: { Nested: true, ExecutableOpeners: [] },
        ParameterPlaceholders: [],
        UnquotedIdentifierCase: 'none',
    };
}

/** Lexical rules with each form's prefixes sorted longest first, so `NQ'` is tried before `N'`. */
interface CompiledRules {
    Rules: DialectLexicalRules;
    Strings: { Form: StringLiteralForm; Prefixes: string[] }[];
    AlternativePrefixes: string[];
}

function compile(rules: DialectLexicalRules): CompiledRules {
    const longestFirst = (prefixes: readonly string[]) => [...prefixes].sort((a, b) => b.length - a.length);
    return {
        Rules: rules,
        Strings: rules.StringLiterals.map(form => ({ Form: form, Prefixes: longestFirst(form.Prefixes) })),
        AlternativePrefixes: longestFirst(rules.AlternativeQuotingPrefixes),
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
 * The dialect's lexical rules decide which string literal forms (prefixes, doubled-quote and
 * backslash escapes, dollar quoting, Oracle `q'…'` quoting), quoted identifier forms and comment
 * forms (`--`, `#`, `//`, nested or flat block comments) exist. An unterminated literal or
 * comment runs to the end of the input.
 */
export function LexSQL(sql: string, dialect: LexDialect): SQLLexToken[] {
    const rules = compile(rulesFor(dialect));
    const tokens: SQLLexToken[] = [];
    let depth = 0;
    let i = 0;
    while (i < sql.length) {
        const [kind, end] = readToken(sql, i, rules);
        if (kind === 'close') depth = Math.max(0, depth - 1);
        tokens.push({ Kind: kind, Text: sql.substring(i, end), Start: i, End: end, Depth: depth });
        if (kind === 'open') depth++;
        i = end;
    }
    return tokens;
}

/** Reads the token starting at `i`; returns its kind and the offset just past it. */
function readToken(sql: string, i: number, rules: CompiledRules): [SQLLexTokenKind, number] {
    const ch = sql[i];
    if (/\s/.test(ch)) return ['whitespace', skipWhile(sql, i, c => /\s/.test(c))];
    const comment = readComment(sql, i, rules.Rules);
    if (comment > i) return ['comment', comment];
    const literal = readStringLiteral(sql, i, rules);
    if (literal > i) return ['string', literal];
    const identifier = readQuotedIdentifier(sql, i, rules.Rules.IdentifierQuotes);
    if (identifier > i) return ['identifier', identifier];
    return readPlainToken(sql, i);
}

/** Punctuation, numbers, words and operators: the tokens every dialect shares. */
function readPlainToken(sql: string, i: number): [SQLLexTokenKind, number] {
    const ch = sql[i];
    const next = sql[i + 1] ?? '';
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

/** The end of a comment starting at `i`, or `i` when none starts there. */
function readComment(sql: string, i: number, rules: DialectLexicalRules): number {
    for (const form of rules.LineComments) {
        if (opensLineComment(sql, i, form)) return skipLineComment(sql, i);
    }
    if (sql.startsWith('/*', i)) return skipBlockComment(sql, i, rules.BlockComments.Nested);
    return i;
}

/**
 * Whether a line comment of this form opens at `i`. A form that needs whitespace after its opener
 * accepts a whitespace or control character, or the end of the text.
 */
function opensLineComment(sql: string, i: number, form: LineCommentForm): boolean {
    if (!sql.startsWith(form.Opener, i)) return false;
    if (!form.RequiresWhitespaceAfter) return true;
    const following = sql.charCodeAt(i + form.Opener.length);
    return Number.isNaN(following) || following <= 0x20 || following === 0x7f;
}

/** A line comment ends at a CR or an LF. */
function skipLineComment(sql: string, i: number): number {
    let j = i;
    while (j < sql.length && sql[j] !== '\n' && sql[j] !== '\r') j++;
    return j;
}

/** A block comment ends at the matching `*\/`; with `nested`, each inner `/*` needs its own. */
function skipBlockComment(sql: string, i: number, nested: boolean): number {
    let depth = 0;
    let j = i;
    while (j < sql.length) {
        if (sql[j] === '/' && sql[j + 1] === '*' && (nested || depth === 0)) { depth++; j += 2; continue; }
        if (sql[j] === '*' && sql[j + 1] === '/') { depth--; j += 2; if (depth === 0) return j; continue; }
        j++;
    }
    return sql.length;
}

/** The end of a string literal starting at `i`, or `i` when none starts there. */
function readStringLiteral(sql: string, i: number, rules: CompiledRules): number {
    const alternative = readAlternativeQuoted(sql, i, rules.AlternativePrefixes);
    if (alternative > i) return alternative;
    for (const { Form, Prefixes } of rules.Strings) {
        const prefix = Prefixes.find(p => startsWithIgnoringCase(sql, i, p) && sql[i + p.length] === Form.Quote);
        if (prefix !== undefined) {
            return skipQuoted(sql, i + prefix.length, Form.Quote, Form.DoubledQuoteEscape, Form.BackslashEscape);
        }
    }
    return readDollarQuoted(sql, i, rules.Rules);
}

function startsWithIgnoringCase(sql: string, i: number, prefix: string): boolean {
    return sql.substring(i, i + prefix.length).toUpperCase() === prefix.toUpperCase();
}

/** The end of a quoted identifier starting at `i`, or `i` when none starts there. */
function readQuotedIdentifier(sql: string, i: number, forms: readonly IdentifierQuoteForm[]): number {
    const form = forms.find(f => sql[i] === f.Open);
    return form ? skipQuoted(sql, i, form.Close, form.DoubledCloseEscape, false) : i;
}

/**
 * Skips a quoted span opening at `i`. With `doubledEscape`, a doubled closing character is an
 * escaped literal; with `backslashEscapes`, so is any character after a backslash.
 */
function skipQuoted(sql: string, i: number, close: string, doubledEscape: boolean, backslashEscapes: boolean): number {
    let j = i + 1;
    while (j < sql.length) {
        const c = sql[j];
        if (backslashEscapes && c === '\\') { j += 2; continue; }
        if (c === close) {
            if (doubledEscape && sql[j + 1] === close) { j += 2; continue; }
            return j + 1;
        }
        j++;
    }
    return sql.length;
}

const ALTERNATIVE_QUOTE_PARTNERS: Readonly<Record<string, string>> = { '[': ']', '{': '}', '<': '>', '(': ')' };

/**
 * Skips an Oracle alternative-quoted literal (`q'[…]'`, `nq'!…!'`) opening at `i`, or returns `i`.
 * The delimiter is any character but a space, tab or line break; `[ { < (` close with their
 * partner, any other delimiter with itself, and the closing delimiter is followed by a quote.
 */
function readAlternativeQuoted(sql: string, i: number, prefixes: readonly string[]): number {
    const prefix = prefixes.find(p => startsWithIgnoringCase(sql, i, p) && sql[i + p.length] === "'");
    if (prefix === undefined) return i;
    const delimiterAt = i + prefix.length + 1;
    const delimiter = String.fromCodePoint(sql.codePointAt(delimiterAt) ?? 0x20);
    if (delimiterAt >= sql.length || /[ \t\r\n]/.test(delimiter)) return i;
    const terminator = (ALTERNATIVE_QUOTE_PARTNERS[delimiter] ?? delimiter) + "'";
    const close = sql.indexOf(terminator, delimiterAt + delimiter.length);
    return close === -1 ? sql.length : close + terminator.length;
}

/** The end of a dollar-quoted string starting at `i`, or `i` when none starts there. */
function readDollarQuoted(sql: string, i: number, rules: DialectLexicalRules): number {
    if (sql[i] !== '$' || rules.DollarQuotedStrings === 'none') return i;
    if (rules.DollarQuotedStrings === 'untagged') {
        if (!sql.startsWith('$$', i)) return i;
        const close = sql.indexOf('$$', i + 2);
        return close === -1 ? sql.length : close + 2;
    }
    return skipTaggedDollarQuoted(sql, i);
}

/**
 * Skips a PostgreSQL dollar-quoted string opening at `i`, or returns `i` when the `$` does not
 * open one (a positional parameter such as `$1`, or a stray `$`).
 */
function skipTaggedDollarQuoted(sql: string, i: number): number {
    // PostgreSQL accepts any non-ASCII character in a tag, as well as ASCII letters, digits and `_`.
    const tag = /^\$([A-Za-z_\u0080-￿][A-Za-z0-9_\u0080-￿]*)?\$/.exec(sql.substring(i));
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
