import type { SQLParserDialect } from '@memberjunction/sql-dialect';
import { LexSQL } from './sqlLexer.js';
import type { SQLLexToken } from './sqlLexer.js';

/** Result of {@link IsBalancedSQLFragment}. */
export interface BalancedFragmentCheck {
    IsBalanced: boolean;
    /** Why the fragment was refused; `null` when it is balanced. */
    Reason: string | null;
}

/** Appended to the fragment before lexing; it lexes as its own token only if nothing is left open. */
const SENTINEL = ')';

const BALANCED: BalancedFragmentCheck = { IsBalanced: true, Reason: null };

/**
 * Whether `fragment`, a WHERE-clause expression a caller supplied, stays inside one pair of
 * parentheses put around it. Code that builds `(<fragment>) AND (<server filter>)` depends on this:
 * a fragment such as `1=1) OR (1=1` closes the parentheses early, so the server filter narrows only
 * one side of an OR the fragment controls.
 *
 * The fragment is read with the dialect's lexer ({@link LexSQL}), so a parenthesis inside a string
 * literal, quoted identifier or comment does not count. The fragment is refused when it:
 * - closes a parenthesis it did not open, or leaves one open;
 * - ends inside a string literal, quoted identifier or comment, which would take in the SQL that
 *   follows it (a line comment needs a newline before the end of the fragment);
 * - contains a statement separator (`;`);
 * - on a dialect with escape or dollar-quoted strings, puts a string directly after a name that
 *   contains `@` or `#`, or directly after a number ending in `e`. The lexer reads `@` and `#` as name
 *   characters, but PostgreSQL reads them as operators (and splits `1e` before a quote), so the two
 *   would not agree on where the string starts.
 */
export function IsBalancedSQLFragment(fragment: string, dialect: SQLParserDialect): BalancedFragmentCheck {
    const tokens = LexSQL(fragment + SENTINEL, dialect);
    if (!endsWithSentinel(tokens, fragment.length)) {
        return refuse('it ends inside an unterminated string literal, quoted identifier or comment');
    }
    const body = tokens.slice(0, -1);
    const reason = findParenthesisProblem(body)
        ?? findStatementSeparator(body)
        ?? findAmbiguousString(body, dialect);
    return reason ? refuse(reason) : BALANCED;
}

function refuse(reason: string): BalancedFragmentCheck {
    return { IsBalanced: false, Reason: reason };
}

/** True when the sentinel lexed as a separate closing parenthesis, so nothing absorbed it. */
function endsWithSentinel(tokens: SQLLexToken[], fragmentLength: number): boolean {
    const last = tokens[tokens.length - 1];
    return last !== undefined && last.Kind === 'close' && last.Start === fragmentLength;
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

/** Finds a token inside which PostgreSQL could start a string the lexer did not see (see {@link IsBalancedSQLFragment}). */
function findAmbiguousString(tokens: SQLLexToken[], dialect: SQLParserDialect): string | null {
    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        const escapeString = dialect.SupportsEscapeStringLiterals
            && endsWithSplittableE(token)
            && tokens[i + 1]?.Kind === 'string'
            && tokens[i + 1].Start === token.End;
        const dollarString = dialect.SupportsDollarQuotedStrings
            && token.Kind === 'word'
            && /[@#].*\$/.test(token.Text);
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
