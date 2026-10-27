import type { DialectKey } from '../facets/dialectKey.js';
import type { DialectLexicalRules, ParameterPlaceholderForm } from '../facets/dialectLexicalRules.js';
import type { ColumnAliasForm, DialectGrammar, RowCapForm } from '../facets/dialectGrammar.js';
import type { DateAddUnit, DialectWriter, LimitClauseResult } from '../facets/dialectWriter.js';
import { ANSI_GRAMMAR, ANSI_LEXICAL, ANSI_WRITE_STATEMENT_KEYWORDS, AnsiQueryDialect, AnsiWriter } from './ansi.js';

/**
 * MySQL lexical rules under the default SQL mode (no `ANSI_QUOTES`, no `NO_BACKSLASH_ESCAPES`,
 * no `PIPES_AS_CONCAT`). Base URL: https://dev.mysql.com/doc/refman/8.4/en/
 */
export const MYSQL_LEXICAL: DialectLexicalRules = Object.freeze({
    ...ANSI_LEXICAL,
    // Backtick identifiers; an embedded backtick is doubled ("…you need to double the character").
    // `"` quotes identifiers only under ANSI_QUOTES, which is not in the default SQL mode.
    // https://dev.mysql.com/doc/refman/8.4/en/identifiers.html
    IdentifierQuotes: Object.freeze([Object.freeze({ Open: '`', Close: '`', DoubledCloseEscape: true })]),
    // Strings in single OR double quotes; a doubled quote and a backslash both escape; N'…' is a
    // national-character literal. https://dev.mysql.com/doc/refman/8.4/en/string-literals.html
    StringLiterals: Object.freeze([
        Object.freeze({ Prefixes: Object.freeze(['', 'N']), Quote: "'", DoubledQuoteEscape: true, BackslashEscape: true }),
        Object.freeze({ Prefixes: Object.freeze(['']), Quote: '"', DoubledQuoteEscape: true, BackslashEscape: true }),
    ]),
    // NO_BACKSLASH_ESCAPES makes backslash an ordinary character.
    // https://dev.mysql.com/doc/refman/8.4/en/sql-mode.html#sqlmode_no_backslash_escapes
    BackslashEscapesDependOnServerSettings: true,
    // `#` comments run to the end of the line; `--` is a comment only when the second dash is
    // followed by a whitespace or control character, so `1--1` is `1 - (-1)`.
    // https://dev.mysql.com/doc/refman/8.4/en/comments.html
    // https://dev.mysql.com/doc/refman/8.4/en/ansi-diff-comments.html
    LineComments: Object.freeze([
        Object.freeze({ Opener: '#', RequiresWhitespaceAfter: false }),
        Object.freeze({ Opener: '--', RequiresWhitespaceAfter: true }),
    ]),
    // Nested comments are not supported. MySQL "parses and executes the code within" a `/*! … */`
    // comment; `/*+ … */` holds optimizer hints. https://dev.mysql.com/doc/refman/8.4/en/comments.html
    BlockComments: Object.freeze({ Nested: false, ExecutableOpeners: Object.freeze(['/*!', '/*+']) }),
    // `?` parameter markers in prepared statements. https://dev.mysql.com/doc/refman/8.4/en/prepare.html
    ParameterPlaceholders: Object.freeze<ParameterPlaceholderForm[]>(['question']),
    // Table names follow lower_case_table_names and the OS; column names are case-insensitive.
    // https://dev.mysql.com/doc/refman/8.4/en/identifier-case-sensitivity.html
    UnquotedIdentifierCase: 'none',
});

/**
 * MySQL grammar facts. `LIMIT [offset,] n` / `LIMIT n OFFSET m` and no FETCH FIRST
 * (https://dev.mysql.com/doc/refman/8.4/en/select.html); `WITH RECURSIVE`
 * (https://dev.mysql.com/doc/refman/8.4/en/with.html); EXCEPT and INTERSECT from 8.0.31
 * (https://dev.mysql.com/doc/refman/8.0/en/except.html); LATERAL from 8.0.14
 * (https://dev.mysql.com/doc/refman/8.0/en/lateral-derived-tables.html). ORDER BY in a derived
 * table is accepted, though the optimizer may ignore it
 * (https://dev.mysql.com/doc/refman/8.4/en/derived-table-optimization.html).
 */
export const MYSQL_GRAMMAR: DialectGrammar = Object.freeze({
    ...ANSI_GRAMMAR,
    ParserGrammar: 'MySQL',
    RowCapForms: Object.freeze<RowCapForm[]>(['limit-offset']),
    WriteStatementKeywords: Object.freeze([
        ...ANSI_WRITE_STATEMENT_KEYWORDS,
        'REPLACE', 'LOAD', 'HANDLER', 'RENAME', 'DO', 'LOCK', 'UNLOCK', 'FLUSH', 'KILL', 'SHUTDOWN', 'INSTALL', 'UNINSTALL',
    ]),
    // LOAD_FILE reads server files; SLEEP and BENCHMARK stall the query; the lock functions hold
    // named locks across statements.
    CallerSQLForbiddenFunctions: Object.freeze(['load_file', 'sleep', 'benchmark', 'get_lock', 'release_lock', 'release_all_locks']),
    // ORDER BY a column position is deprecated in MySQL; ORDER BY NULL is accepted and imposes no order.
    DefaultPagingOrderBy: 'NULL',
    ExtraColumnAliasForms: Object.freeze<ColumnAliasForm[]>(['string']),
});

/** Writes MySQL: backtick identifiers, backslash-safe string literals, `LIMIT`, `CONCAT()`. */
export class MySQLWriter extends AnsiWriter {
    QuoteIdentifier(name: string): string {
        return `\`${name.replace(/`/g, '``')}\``;
    }

    /** Escapes backslashes as well as quotes, since a backslash escapes the next character in the default SQL mode. */
    QuoteStringLiteral(value: string): string {
        return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
    }

    LimitClause(limit: number, offset?: number): LimitClauseResult {
        return { prefix: '', suffix: offset != null ? `LIMIT ${limit} OFFSET ${offset}` : `LIMIT ${limit}` };
    }

    /** `CAST(… AS CHAR)`: MySQL does not accept VARCHAR as a cast target. https://dev.mysql.com/doc/refman/8.4/en/cast-functions.html */
    CastToText(expr: string): string {
        return this.Cast(expr, 'CHAR');
    }

    /** `||` is logical OR unless PIPES_AS_CONCAT, so MySQL concatenates with CONCAT(). */
    ConcatOperator(): string | null {
        return null;
    }

    /** https://dev.mysql.com/doc/refman/8.4/en/json-search-functions.html */
    JsonExtract(column: string, path: string): string {
        return `JSON_UNQUOTE(JSON_EXTRACT(${column}, '${path}'))`;
    }

    /** https://dev.mysql.com/doc/refman/8.4/en/date-and-time-functions.html#function_date-add */
    DateAddExpression(unit: DateAddUnit, amount: number, baseExpr: string): string {
        return `DATE_ADD(${baseExpr}, INTERVAL ${amount} ${unit})`;
    }

    CurrentTimestampUTC(): string {
        return 'UTC_TIMESTAMP()';
    }
}

/** MySQL, read as an External Data Source. Query-only: no DDL facet. */
export class MySQLQueryDialect extends AnsiQueryDialect {
    private readonly writer: DialectWriter = Object.freeze(new MySQLWriter());

    get Key(): DialectKey {
        return 'mysql';
    }

    get DisplayName(): string {
        return 'MySQL';
    }

    get Lexical(): DialectLexicalRules {
        return MYSQL_LEXICAL;
    }

    get Grammar(): DialectGrammar {
        return MYSQL_GRAMMAR;
    }

    get Writer(): DialectWriter {
        return this.writer;
    }
}
