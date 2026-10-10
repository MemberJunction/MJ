import type { SQLParserDialect } from '@memberjunction/sql-dialect';
import { IsKeyword, LexSQL, SignificantTokens } from './sqlLexer.js';
import type { SQLLexToken } from './sqlLexer.js';

/** Result of {@link IsBalancedSQLFragment}. */
export interface BalancedFragmentCheck {
    IsBalanced: boolean;
    /** Why the fragment was refused; `null` when it is balanced. */
    Reason: string | null;
}

/** Options for {@link IsBalancedSQLFragment}. */
export interface BalancedFragmentOptions {
    /**
     * Accept comments. Off by default, because a filter from a caller never needs one. Turn it on
     * only for text an administrator wrote, such as a custom view WhereClause.
     */
    AllowComments?: boolean;
}

/** Appended to the fragment before lexing; it lexes as its own token only if nothing is left open. */
const SENTINEL = ')';

const BALANCED: BalancedFragmentCheck = { IsBalanced: true, Reason: null };

const NON_ASCII = /[^\x00-\x7F]/;

/**
 * Whether `fragment`, a WHERE-clause expression a caller supplied, stays inside one pair of
 * parentheses put around it. Code that builds `(<fragment>) AND (<server filter>)` depends on this:
 * a fragment such as `1=1) OR (1=1` closes the parentheses early, so the server filter narrows only
 * one side of an OR the fragment controls.
 *
 * The fragment is read with the dialect's lexer ({@link LexSQL}), so a parenthesis inside a string
 * literal, quoted identifier or comment does not count. Text the lexer may not read the way the
 * database does is refused rather than guessed at. The fragment is refused when it:
 * - ends inside a string literal, quoted identifier or comment, which would take in the SQL that
 *   follows it;
 * - contains a comment, unless {@link BalancedFragmentOptions.AllowComments} is set;
 * - closes a parenthesis it did not open, or leaves one open;
 * - contains a statement separator (`;`);
 * - on PostgreSQL (a dialect with escape or dollar-quoted strings):
 *   - has a character outside ASCII anywhere but inside a string literal, quoted identifier or
 *     comment. PostgreSQL reads every such character as part of a name, including Unicode spaces and
 *     characters in a dollar-quote tag; the lexer does not;
 *   - has a dollar-quoted string, or a `$` anywhere but inside a name;
 *   - follows an escape string (`E'…'`) with another string literal. PostgreSQL joins literals that
 *     a line break separates and reads the second in escape mode; the lexer reads it as plain;
 *   - puts a string directly after a name that contains `@` or `#`, or after a number ending in `e`.
 *     The lexer reads `@` and `#` as name characters, but PostgreSQL reads them as operators (and
 *     splits `1e` before a quote).
 */
export function IsBalancedSQLFragment(
    fragment: string,
    dialect: SQLParserDialect,
    options?: BalancedFragmentOptions,
): BalancedFragmentCheck {
    const tokens = LexSQL(fragment + SENTINEL, dialect);
    if (!endsWithSentinel(tokens, fragment.length)) {
        return refuse('it ends inside an unterminated string literal, quoted identifier or comment');
    }
    const body = tokens.slice(0, -1);
    const reason = findComment(body, options)
        ?? findParenthesisProblem(body)
        ?? findStatementSeparator(body)
        ?? findPostgreSQLAmbiguity(body, dialect);
    return reason ? refuse(reason) : BALANCED;
}

/**
 * Splits `fragment` at its top-level ANDs: those outside parentheses and outside CASE … END, other
 * than the AND of a BETWEEN. Returns the terms as written, or `null` when the fragment has a
 * top-level OR, because putting each term in its own parentheses would then change its meaning.
 * A fragment with no top-level AND comes back as its only term.
 */
export function SplitTopLevelAndTerms(fragment: string, dialect: SQLParserDialect): string[] | null {
    const ands = findTopLevelAnds(SignificantTokens(LexSQL(fragment, dialect)));
    if (!ands) return null;
    const terms: string[] = [];
    let from = 0;
    for (const and of ands) {
        terms.push(fragment.substring(from, and.Start));
        from = and.End;
    }
    terms.push(fragment.substring(from));
    return terms;
}

function refuse(reason: string): BalancedFragmentCheck {
    return { IsBalanced: false, Reason: reason };
}

/** True when the sentinel lexed as a separate closing parenthesis, so nothing absorbed it. */
function endsWithSentinel(tokens: SQLLexToken[], fragmentLength: number): boolean {
    const last = tokens[tokens.length - 1];
    return last !== undefined && last.Kind === 'close' && last.Start === fragmentLength;
}

function findComment(tokens: SQLLexToken[], options?: BalancedFragmentOptions): string | null {
    if (options?.AllowComments) return null;
    return tokens.some(t => t.Kind === 'comment') ? 'it contains a comment' : null;
}

function findParenthesisProblem(tokens: SQLLexToken[]): string | null {
    let depth = 0;
    for (const token of tokens) {
        if (token.Kind === 'open') depth++;
        else if (token.Kind === 'close' && --depth < 0) return 'it closes a parenthesis it did not open';
    }
    return depth > 0 ? 'it leaves a parenthesis open' : null;
}

function findStatementSeparator(tokens: SQLLexToken[]): string | null {
    return tokens.some(t => t.Kind === 'semicolon') ? 'it contains a statement separator (;)' : null;
}

/** The PostgreSQL refusals listed on {@link IsBalancedSQLFragment}. */
function findPostgreSQLAmbiguity(tokens: SQLLexToken[], dialect: SQLParserDialect): string | null {
    if (!dialect.SupportsEscapeStringLiterals && !dialect.SupportsDollarQuotedStrings) return null;
    return findNonASCIIOutsideQuotes(tokens)
        ?? findDollarSign(tokens)
        ?? findEscapeStringContinuation(tokens)
        ?? findAmbiguousString(tokens);
}

/** String literals, quoted identifiers and comments: tokens whose content is not read as code. */
function isQuotedOrComment(token: SQLLexToken): boolean {
    return token.Kind === 'string' || token.Kind === 'identifier' || token.Kind === 'comment';
}

function findNonASCIIOutsideQuotes(tokens: SQLLexToken[]): string | null {
    return tokens.some(t => !isQuotedOrComment(t) && NON_ASCII.test(t.Text))
        ? 'it has a character outside ASCII outside a string literal or quoted identifier'
        : null;
}

function findDollarSign(tokens: SQLLexToken[]): string | null {
    const dollar = tokens.some(t => (t.Kind === 'string' && t.Text.startsWith('$')) || (t.Kind === 'operator' && t.Text === '$'));
    return dollar ? 'it has a dollar-quoted string or a "$" outside a name' : null;
}

function findEscapeStringContinuation(tokens: SQLLexToken[]): string | null {
    const significant = SignificantTokens(tokens);
    for (let i = 0; i + 1 < significant.length; i++) {
        if (isEscapeString(significant[i]) && significant[i + 1].Kind === 'string') {
            return 'it has an escape string followed by another string literal';
        }
    }
    return null;
}

function isEscapeString(token: SQLLexToken): boolean {
    return token.Kind === 'string' && /^[Ee]'/.test(token.Text);
}

/** Finds a token inside which PostgreSQL could start a string the lexer did not see. */
function findAmbiguousString(tokens: SQLLexToken[]): string | null {
    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        const next = tokens[i + 1];
        const escapeString = endsWithSplittableE(token) && next?.Kind === 'string' && next.Start === token.End;
        const dollarString = token.Kind === 'word' && /[@#].*\$/.test(token.Text);
        if (escapeString || dollarString) {
            return `it is ambiguous on this dialect: PostgreSQL may start a string inside "${token.Text}"`;
        }
    }
    return null;
}

/** A name holding `@` or `#` that ends in `e` (`@@E'…'`), or a number that ends in `e` (`1E'…'`). */
function endsWithSplittableE(token: SQLLexToken): boolean {
    if (token.Kind === 'word') return /[@#]/.test(token.Text) && /[Ee]$/.test(token.Text);
    if (token.Kind === 'number') return /[Ee]$/.test(token.Text);
    return false;
}

/** The top-level AND tokens, or `null` when there is a top-level OR (see {@link SplitTopLevelAndTerms}). */
function findTopLevelAnds(tokens: SQLLexToken[]): SQLLexToken[] | null {
    const ands: SQLLexToken[] = [];
    let depth = 0;
    let caseDepth = 0;
    let openBetweens = 0;
    for (const token of tokens) {
        if (token.Kind === 'open') depth++;
        else if (token.Kind === 'close') depth--;
        else if (depth !== 0) continue;
        else if (IsKeyword(token, 'CASE')) caseDepth++;
        else if (IsKeyword(token, 'END') && caseDepth > 0) caseDepth--;
        else if (caseDepth > 0) continue;
        else if (IsKeyword(token, 'OR')) return null;
        else if (IsKeyword(token, 'BETWEEN')) openBetweens++;
        else if (IsKeyword(token, 'AND') && openBetweens > 0) openBetweens--;
        else if (IsKeyword(token, 'AND')) ands.push(token);
    }
    return ands;
}
