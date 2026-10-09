/**
 * @fileoverview Dialect-aware SQL scanner for MemberJunction's SQL denylist screens.
 *
 * A denylist screen is only as good as its idea of which text is code. This scanner reads SQL the
 * way SQL Server or PostgreSQL splits it into tokens and marks every string literal, quoted
 * identifier and comment, so a screen checks exactly the text the database runs as code. When it
 * cannot read the text the way the database would, it reports that, so the screen rejects the text
 * instead of guessing.
 *
 * Used by `SQLExpressionValidator` and `DatabaseProviderBase.ValidateUserProvidedSQLClause`.
 *
 * @module @memberjunction/global/SQLScreeningScanner
 */

/** SQL dialects whose lexical rules {@link ScanSQLForScreening} knows. */
export type SQLScreeningDialect = 'sqlserver' | 'postgresql';

/**
 * Every dialect {@link ScanSQLForScreening} knows. A screen that does not know which database will
 * run the SQL must accept it under each one.
 */
export const SQL_SCREENING_DIALECTS: readonly SQLScreeningDialect[] = ['sqlserver', 'postgresql'];

/** Kinds of text that the database never runs as code. */
export type SQLScreeningSpanKind = 'string' | 'identifier' | 'comment';

/** One string literal, quoted identifier or comment found by {@link ScanSQLForScreening}. */
export interface SQLScreeningSpan {
    Kind: SQLScreeningSpanKind;
    /** Offset of the first character, including a prefix such as `N` or `E`. */
    Start: number;
    /** Offset just past the last character. */
    End: number;
}

/** Result of {@link ScanSQLForScreening}. */
export interface SQLScreeningScan {
    /** The dialect whose rules were applied. */
    Dialect: SQLScreeningDialect;
    /** True when every character was read the way the database reads it. When false, reject the text. */
    Classified: boolean;
    /** Why the text could not be classified; null when {@link Classified} is true. */
    Error: string | null;
    /** The string literals, quoted identifiers and comments found, in order. */
    Spans: SQLScreeningSpan[];
    /** Number of comments found. */
    CommentCount: number;
    /**
     * The input with each string literal, quoted identifier and comment replaced by one space, and a
     * space between a number and a word written against it. Only code remains, split where the
     * database splits it, so `N'x'UNION` reads as ` UNION` and `1UNION` as `1 UNION`. Keyword,
     * statement-separator and comment-marker checks read this. When {@link Classified} is false,
     * the text from the point where the scan stopped is left as written.
     */
    Code: string;
    /**
     * {@link Code}, except each quoted identifier is written as its bare name between spaces, so
     * `[sys].[objects]` reads as ` sys . objects `. Checks for object and function names read this,
     * so quoting a name does not hide it.
     */
    CodeWithIdentifiers: string;
}

/** Lexical rules that differ between dialects. */
interface LexicalRules {
    /** SQL Server `[…]` identifiers. */
    BracketIdentifiers: boolean;
    /** PostgreSQL `E'…'` strings and dollar-quoted strings. */
    PostgresStrings: boolean;
    /** Characters that can start an unquoted word. */
    WordStart: RegExp;
    /** Characters that can continue an unquoted word. */
    WordPart: RegExp;
    /**
     * Whether the server can read `1e` with no exponent digits as a whole number. Then `1EXEC` has
     * two possible splits, so the scan rejects a number followed by `e` and a word character.
     */
    BareExponent: boolean;
}

const LEXICAL_RULES: Record<SQLScreeningDialect, LexicalRules> = {
    sqlserver: {
        BracketIdentifiers: true,
        PostgresStrings: false,
        WordStart: /[A-Za-z_@#\u0080-￿]/,
        WordPart: /[A-Za-z0-9_@#$\u0080-￿]/,
        BareExponent: true,
    },
    postgresql: {
        BracketIdentifiers: false,
        PostgresStrings: true,
        WordStart: /[A-Za-z_\u0080-￿]/,
        WordPart: /[A-Za-z0-9_$\u0080-￿]/,
        BareExponent: false,
    },
};

const DIGIT = /[0-9]/;
const WHITESPACE = /\s/;

/**
 * A numeric literal at `lastIndex` (sticky). An exponent needs digits, so in PostgreSQL's `1e'…'`
 * the `e` is left to open an E'…' string.
 */
const NUMBER = /0[xX][0-9A-Fa-f]*|(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?/y;

/** A PostgreSQL `$$` or `$tag$` delimiter at `lastIndex` (sticky). */
const DOLLAR_DELIMITER = /\$(?:[A-Za-z_\u0080-￿][A-Za-z0-9_\u0080-￿]*)?\$/y;

/** Line breaks other than `\n` and `\r\n`. Servers disagree on whether they end a `--` comment. */
const AMBIGUOUS_LINE_BREAKS: ReadonlySet<string> = new Set(['\r', '\u000b', '\u000c', '\u0085', ' ', ' ']);

/**
 * Reads `sql` the way `dialect` splits it into tokens. Returns the string literals, quoted
 * identifiers and comments it contains, and the code that remains.
 *
 * Both dialects: `'…'` and `N'…'` strings, in which `''` is an escaped quote and a backslash is an
 * ordinary character; `"…"` identifiers with `""` escapes; `--` comments to the end of the line; and
 * nested block comments. SQL Server adds `[…]` identifiers with `]]` escapes. PostgreSQL adds `E'…'`
 * strings, in which a backslash escapes the next character, and dollar-quoted strings (`$$…$$`,
 * `$tag$…$tag$`); a `[` is code there.
 *
 * 🚨 Do not add backslash escapes to plain `'…'` strings. Neither server honors them (PostgreSQL is
 * assumed to run with `standard_conforming_strings = on`, its default since 9.1), and a scanner that
 * does reads `x = 'a\') ; DROP TABLE t; --'` as one literal while the database runs the DROP.
 *
 * The scan stops and reports an error, instead of guessing, when:
 * - a string, quoted identifier, dollar-quoted string or block comment is not closed;
 * - the text contains a NUL character;
 * - a `--` comment contains a line break other than `\n` or `\r\n`;
 * - a PostgreSQL `E'…'` string is followed by another quoted segment, which PostgreSQL can join to
 *   it and read with backslash escapes;
 * - on SQL Server, a number is followed by `e` and a word character (`1EXEC` splits two ways).
 *
 * @param sql The clause, expression or query to read
 * @param dialect The dialect whose lexical rules apply
 */
export function ScanSQLForScreening(sql: string, dialect: SQLScreeningDialect): SQLScreeningScan {
    return new SQLScreeningScanner(sql, dialect).Scan();
}

/** One left-to-right pass over the input, with the dialect's rules. */
class SQLScreeningScanner {
    private readonly rules: LexicalRules;
    private readonly spans: SQLScreeningSpan[] = [];
    private readonly code: string[] = [];
    private readonly codeWithIdentifiers: string[] = [];
    private commentCount = 0;
    private pos = 0;

    constructor(
        private readonly sql: string,
        private readonly dialect: SQLScreeningDialect,
    ) {
        this.rules = LEXICAL_RULES[dialect];
    }

    public Scan(): SQLScreeningScan {
        if (!SQL_SCREENING_DIALECTS.includes(this.dialect)) return this.stop(`"${this.dialect}" is not a known SQL dialect`);
        if (this.sql.includes('\0')) return this.stop('the text contains a NUL character');
        while (this.pos < this.sql.length) {
            const error = this.readToken();
            if (error !== null) return this.stop(error);
        }
        return this.result(null);
    }

    /** Reads the token at `pos`. Returns why the text cannot be classified, or null. */
    private readToken(): string | null {
        const c = this.sql[this.pos];
        const next = this.sql[this.pos + 1] ?? '';
        if (c === '-' && next === '-') return this.readLineComment();
        if (c === '/' && next === '*') return this.readBlockComment();
        if (c === "'") return this.readString(this.pos + 1);
        if ((c === 'N' || c === 'n') && next === "'") return this.readString(this.pos + 2);
        if (this.rules.PostgresStrings && (c === 'E' || c === 'e') && next === "'") return this.readEscapeString();
        if (this.rules.PostgresStrings && c === '$') {
            const delimiter = this.dollarDelimiterAt(this.pos);
            if (delimiter !== null) return this.readDollarString(delimiter);
        }
        if (c === '"') return this.readQuotedIdentifier('"');
        if (this.rules.BracketIdentifiers && c === '[') return this.readQuotedIdentifier(']');
        if (DIGIT.test(c) || (c === '.' && DIGIT.test(next))) return this.readNumber();
        if (this.rules.WordStart.test(c)) return this.readWord();
        this.emitCode(this.pos + 1);
        return null;
    }

    /** Reads a `'…'` string whose content starts at `contentStart`. */
    private readString(contentStart: number): string | null {
        const end = this.findQuoteEnd(contentStart, "'", false);
        if (end === -1) return 'a string literal is not closed';
        this.emitSpan('string', end);
        return null;
    }

    /** Reads a PostgreSQL `E'…'` string, in which a backslash escapes the next character. */
    private readEscapeString(): string | null {
        const end = this.findQuoteEnd(this.pos + 2, "'", true);
        if (end === -1) return "an E'…' string is not closed";
        if (this.quoteFollows(end)) {
            return "an E'…' string is followed by another quoted segment, which PostgreSQL can read as part of it";
        }
        this.emitSpan('string', end);
        return null;
    }

    /** Reads a PostgreSQL dollar-quoted string that opens with `delimiter`. */
    private readDollarString(delimiter: string): string | null {
        const close = this.sql.indexOf(delimiter, this.pos + delimiter.length);
        if (close === -1) return 'a dollar-quoted string is not closed';
        this.emitSpan('string', close + delimiter.length);
        return null;
    }

    /** Reads a `"…"` or `[…]` identifier; `close` is its closing character. */
    private readQuotedIdentifier(close: '"' | ']'): string | null {
        const end = this.findQuoteEnd(this.pos + 1, close, false);
        if (end === -1) return 'a quoted identifier is not closed';
        const name = this.sql.slice(this.pos + 1, end - 1).split(close + close).join(close);
        this.emitSpan('identifier', end, name);
        return null;
    }

    /** Reads a `--` comment, which ends at the end of the line. */
    private readLineComment(): string | null {
        let j = this.pos + 2;
        while (j < this.sql.length && this.sql[j] !== '\n') {
            if (this.sql[j] === '\r' && this.sql[j + 1] === '\n') break;
            if (AMBIGUOUS_LINE_BREAKS.has(this.sql[j])) {
                return 'a -- comment contains a line break that database servers read differently';
            }
            j++;
        }
        this.commentCount++;
        this.emitSpan('comment', j);
        return null;
    }

    /** Reads a block comment. Block comments nest on both SQL Server and PostgreSQL. */
    private readBlockComment(): string | null {
        let depth = 0;
        let j = this.pos;
        while (j < this.sql.length) {
            if (this.sql[j] === '/' && this.sql[j + 1] === '*') {
                depth++;
                j += 2;
            } else if (this.sql[j] === '*' && this.sql[j + 1] === '/') {
                depth--;
                j += 2;
                if (depth === 0) {
                    this.commentCount++;
                    this.emitSpan('comment', j);
                    return null;
                }
            } else {
                j++;
            }
        }
        return 'a block comment is not closed';
    }

    /** Reads a number. A word written against it is a separate token, so a space is added between. */
    private readNumber(): string | null {
        NUMBER.lastIndex = this.pos;
        const match = NUMBER.exec(this.sql);
        const end = this.pos + (match ? match[0].length : 1);
        const following = this.sql[end] ?? '';
        const afterThat = this.sql[end + 1] ?? '';
        if (this.rules.BareExponent && (following === 'e' || following === 'E') && this.rules.WordStart.test(afterThat)) {
            return 'a number is followed by a word that starts with E, which the server can read as part of the number';
        }
        this.emitCode(end);
        if (following !== '' && this.rules.WordStart.test(following)) this.emitBoundary();
        return null;
    }

    /** Reads an unquoted keyword or identifier. */
    private readWord(): string | null {
        let j = this.pos + 1;
        while (j < this.sql.length && this.rules.WordPart.test(this.sql[j])) j++;
        this.emitCode(j);
        return null;
    }

    /**
     * Offset just past the `close` character that ends a quoted run whose content starts at `from`,
     * or -1 when none does. A doubled `close` is an escaped one; with `backslashEscapes`, so is any
     * character after a backslash.
     */
    private findQuoteEnd(from: number, close: string, backslashEscapes: boolean): number {
        let j = from;
        while (j < this.sql.length) {
            const ch = this.sql[j];
            if (backslashEscapes && ch === '\\') {
                j += 2;
            } else if (ch !== close) {
                j++;
            } else if (this.sql[j + 1] === close) {
                j += 2;
            } else {
                return j + 1;
            }
        }
        return -1;
    }

    /** Whether only whitespace and `--` comments come between `from` and the next `'`. */
    private quoteFollows(from: number): boolean {
        let j = from;
        while (j < this.sql.length) {
            const ch = this.sql[j];
            if (ch === "'") return true;
            if (ch === '-' && this.sql[j + 1] === '-') {
                j = this.lineEnd(j);
            } else if (WHITESPACE.test(ch)) {
                j++;
            } else {
                return false;
            }
        }
        return false;
    }

    /** Offset of the first `\n` or `\r` at or after `from`, or the input length. */
    private lineEnd(from: number): number {
        let j = from;
        while (j < this.sql.length && this.sql[j] !== '\n' && this.sql[j] !== '\r') j++;
        return j;
    }

    /** The `$$` or `$tag$` delimiter at `at`, or null when the `$` does not open a dollar-quoted string. */
    private dollarDelimiterAt(at: number): string | null {
        DOLLAR_DELIMITER.lastIndex = at;
        return DOLLAR_DELIMITER.exec(this.sql)?.[0] ?? null;
    }

    /** Copies code up to `end` into both projections. */
    private emitCode(end: number): void {
        const text = this.sql.slice(this.pos, end);
        this.code.push(text);
        this.codeWithIdentifiers.push(text);
        this.pos = end;
    }

    /** Records a span up to `end` and writes a space for it, or an identifier's bare name. */
    private emitSpan(kind: SQLScreeningSpanKind, end: number, identifierName?: string): void {
        this.spans.push({ Kind: kind, Start: this.pos, End: end });
        this.code.push(' ');
        this.codeWithIdentifiers.push(identifierName === undefined ? ' ' : ` ${identifierName} `);
        this.pos = end;
    }

    /** Writes a token boundary that the input leaves implicit. */
    private emitBoundary(): void {
        this.code.push(' ');
        this.codeWithIdentifiers.push(' ');
    }

    /** Ends the scan at `pos`, leaving the unread text as written. */
    private stop(error: string): SQLScreeningScan {
        this.emitCode(this.sql.length);
        return this.result(error);
    }

    private result(error: string | null): SQLScreeningScan {
        return {
            Dialect: this.dialect,
            Classified: error === null,
            Error: error,
            Spans: this.spans,
            CommentCount: this.commentCount,
            Code: this.code.join(''),
            CodeWithIdentifiers: this.codeWithIdentifiers.join(''),
        };
    }
}
