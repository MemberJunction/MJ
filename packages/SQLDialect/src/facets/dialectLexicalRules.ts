/**
 * One way a dialect quotes an identifier, such as `"name"`, `[name]` or `` `name` ``.
 */
export interface IdentifierQuoteForm {
    /** The character that opens the quoted identifier. */
    readonly Open: string;
    /** The character that closes it. */
    readonly Close: string;
    /** Whether a doubled closing character inside the identifier stands for one literal closing character. */
    readonly DoubledCloseEscape: boolean;
}

/**
 * One form of string literal: a quote character, the prefixes that may introduce it, and the
 * escapes recognized inside it.
 */
export interface StringLiteralForm {
    /**
     * The prefixes that open this form, matched ignoring case. `''` is the bare form (no prefix);
     * `'N'` is a national-character literal, `'E'` a PostgreSQL escape string, `'R'` a raw string.
     */
    readonly Prefixes: readonly string[];
    /** The quote character that opens and closes the literal. */
    readonly Quote: string;
    /** Whether a doubled quote character inside the literal stands for one literal quote. */
    readonly DoubledQuoteEscape: boolean;
    /** Whether a backslash makes the next character literal. */
    readonly BackslashEscape: boolean;
}

/**
 * Dollar-quoted string literals: `'none'`, `'untagged'` (`$$…$$` only) or `'tagged'`
 * (`$$…$$` and `$tag$…$tag$`).
 */
export type DollarQuoting = 'none' | 'untagged' | 'tagged';

/** A line comment opener, such as `--`, `#` or `//`. A line comment ends at a CR or an LF. */
export interface LineCommentForm {
    /** The characters that open the comment. */
    readonly Opener: string;
    /**
     * Whether the opener starts a comment only when a whitespace or control character (or the end
     * of the text) follows it. MySQL's `--` works this way, so `1--1` is `1 - (-1)` there.
     */
    readonly RequiresWhitespaceAfter: boolean;
}

/** How `/* … *\/` block comments behave. */
export interface BlockCommentRules {
    /** Whether a `/*` inside a block comment opens a nested comment that needs its own `*\/`. */
    readonly Nested: boolean;
    /**
     * Openers of block comments whose content the database runs or interprets as SQL, such as
     * MySQL's `/*!` (executed by MySQL) and `/*+` (optimizer hints). Empty when there are none.
     */
    readonly ExecutableOpeners: readonly string[];
}

/**
 * The parameter placeholder token forms a dialect's drivers accept:
 * `'at-name'` (`@name`), `'question'` (`?`), `'dollar-number'` (`$1`), `'colon-name'` (`:name`),
 * `'colon-number'` (`:1`).
 */
export type ParameterPlaceholderForm = 'at-name' | 'question' | 'dollar-number' | 'colon-name' | 'colon-number';

/**
 * What a dialect does to an unquoted identifier: `'upper'` folds it to upper case (the SQL
 * standard, Oracle, Snowflake), `'lower'` to lower case (PostgreSQL), and `'none'` keeps it as
 * written and compares it according to the server's collation or settings (SQL Server, MySQL,
 * Databricks).
 */
export type IdentifierCaseFolding = 'upper' | 'lower' | 'none';

/**
 * The lexical rules of a dialect: how its text splits into tokens. These decide where string
 * literals, quoted identifiers and comments begin and end, which is what every safe scan of SQL
 * text (stacked statements, comment markers, keyword searches) depends on.
 */
export interface DialectLexicalRules {
    /** Identifier quoting forms, in the order they are tried. */
    readonly IdentifierQuotes: readonly IdentifierQuoteForm[];
    /** String literal forms, in the order they are tried. */
    readonly StringLiterals: readonly StringLiteralForm[];
    /**
     * Whether a server or session setting can turn backslash escapes in string literals on or off
     * (MySQL's `NO_BACKSLASH_ESCAPES` SQL mode, Spark's `spark.sql.parser.escapedStringLiterals`).
     * When true, text reading a string literal that contains a backslash cannot know where the
     * literal ends, so a screen should refuse it.
     */
    readonly BackslashEscapesDependOnServerSettings: boolean;
    /** Dollar-quoted string literals. */
    readonly DollarQuotedStrings: DollarQuoting;
    /**
     * Prefixes of Oracle-style alternative quoting (`q'[…]'`, `nq'{…}'`), matched ignoring case.
     * The character after the quote is the delimiter: `[`, `{`, `<` and `(` close with their
     * partner, any other character closes with itself, always followed by a quote. Empty when the
     * dialect has no alternative quoting.
     */
    readonly AlternativeQuotingPrefixes: readonly string[];
    /** Line comment openers. */
    readonly LineComments: readonly LineCommentForm[];
    /** Block comment behaviour. */
    readonly BlockComments: BlockCommentRules;
    /** Parameter placeholder forms. */
    readonly ParameterPlaceholders: readonly ParameterPlaceholderForm[];
    /** What happens to an unquoted identifier's case. */
    readonly UnquotedIdentifierCase: IdentifierCaseFolding;
}
