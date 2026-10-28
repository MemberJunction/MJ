import type { DialectKey } from '../facets/dialectKey.js';
import type { DialectLexicalRules, ParameterPlaceholderForm } from '../facets/dialectLexicalRules.js';
import type { DialectGrammar, RowCapForm } from '../facets/dialectGrammar.js';
import type { DateAddUnit, DialectWriter, LimitClauseResult } from '../facets/dialectWriter.js';
import { ANSI_GRAMMAR, ANSI_LEXICAL, ANSI_WRITE_STATEMENT_KEYWORDS, AnsiQueryDialect, AnsiWriter } from './ansi.js';

/** Base URL: https://docs.snowflake.com/en/ */
export const SNOWFLAKE_LEXICAL: DialectLexicalRules = Object.freeze({
    ...ANSI_LEXICAL,
    // "…" identifiers with "" for a quote; unquoted identifiers are stored and resolved as upper case.
    // https://docs.snowflake.com/en/sql-reference/identifiers-syntax
    UnquotedIdentifierCase: 'upper',
    // '…' strings take backslash escape sequences and '' for a quote; $$…$$ strings take no
    // escapes. Only the untagged $$ form is documented. https://docs.snowflake.com/en/sql-reference/data-types-text
    StringLiterals: Object.freeze([
        Object.freeze({ Prefixes: Object.freeze(['']), Quote: "'", DoubledQuoteEscape: true, BackslashEscape: true }),
    ]),
    DollarQuotedStrings: 'untagged',
    // `--` and `//` line comments, `/* */` block comments. Snowflake has no comment-syntax page:
    // `//` is a line comment per the Python connector release notes (4.7.2, "split_statements
    // treating // as SQL instead of a line comment"), and a block comment ends at the first `*/`
    // per https://docs.snowflake.com/en/migrations/snowconvert-docs/general/getting-started/running-snowconvert/validation/ambiguous-comments-validations
    // https://docs.snowflake.com/en/release-notes/clients-drivers/python-connector-2026
    LineComments: Object.freeze([
        Object.freeze({ Opener: '--', RequiresWhitespaceAfter: false }),
        Object.freeze({ Opener: '//', RequiresWhitespaceAfter: false }),
    ]),
    // `?`, `:name` and `:1` binds. https://docs.snowflake.com/en/sql-reference/bind-variables
    ParameterPlaceholders: Object.freeze<ParameterPlaceholderForm[]>(['question', 'colon-name', 'colon-number']),
});

/**
 * Snowflake grammar facts. `TOP n`, `LIMIT n OFFSET m` and `OFFSET … FETCH`
 * (https://docs.snowflake.com/en/sql-reference/constructs/limit,
 * https://docs.snowflake.com/en/sql-reference/constructs/top_n); RECURSIVE is optional
 * (https://docs.snowflake.com/en/sql-reference/constructs/with); MINUS and EXCEPT are synonyms
 * (https://docs.snowflake.com/en/sql-reference/operators-query); LATERAL
 * (https://docs.snowflake.com/en/sql-reference/constructs/join-lateral); ORDER BY in a subquery
 * applies only there (https://docs.snowflake.com/en/sql-reference/constructs/order-by).
 */
export const SNOWFLAKE_GRAMMAR: DialectGrammar = Object.freeze({
    ...ANSI_GRAMMAR,
    ParserGrammar: 'Snowflake',
    DefaultSchema: 'PUBLIC',
    RowCapForms: Object.freeze<RowCapForm[]>(['top', 'limit-offset', 'offset-fetch']),
    SetOperatorKeywords: Object.freeze(['UNION', 'INTERSECT', 'EXCEPT', 'MINUS']),
    WriteStatementKeywords: Object.freeze([
        ...ANSI_WRITE_STATEMENT_KEYWORDS,
        'COPY', 'PUT', 'GET', 'REMOVE', 'UNDROP', 'EXECUTE', 'COMMENT',
    ]),
});

/** Writes Snowflake SQL: `"…"` identifiers, backslash-safe literals, `LIMIT`, `DATEADD`. */
export class SnowflakeWriter extends AnsiWriter {
    /** Escapes backslashes as well as quotes, since a backslash starts an escape sequence in a '…' string. */
    QuoteStringLiteral(value: string): string {
        return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
    }

    LimitClause(limit: number, offset?: number): LimitClauseResult {
        return { prefix: '', suffix: offset != null ? `LIMIT ${limit} OFFSET ${offset}` : `LIMIT ${limit}` };
    }

    /** https://docs.snowflake.com/en/sql-reference/functions/nvl */
    IsNull(expr: string, fallback: string): string {
        return `NVL(${expr}, ${fallback})`;
    }

    /** https://docs.snowflake.com/en/sql-reference/functions/json_extract_path_text */
    JsonExtract(column: string, path: string): string {
        return `JSON_EXTRACT_PATH_TEXT(${column}, '${path}')`;
    }

    /** https://docs.snowflake.com/en/sql-reference/functions/dateadd */
    DateAddExpression(unit: DateAddUnit, amount: number, baseExpr: string): string {
        return `DATEADD(${unit}, ${amount}, ${baseExpr})`;
    }

    /** SYSDATE() is the current timestamp in UTC. https://docs.snowflake.com/en/sql-reference/functions/sysdate */
    CurrentTimestampUTC(): string {
        return 'SYSDATE()';
    }
}

/** Snowflake, read as an External Data Source. Query-only: no DDL facet. */
export class SnowflakeQueryDialect extends AnsiQueryDialect {
    private readonly writer: DialectWriter = Object.freeze(new SnowflakeWriter());

    get Key(): DialectKey {
        return 'snowflake';
    }

    get DisplayName(): string {
        return 'Snowflake';
    }

    get Lexical(): DialectLexicalRules {
        return SNOWFLAKE_LEXICAL;
    }

    get Grammar(): DialectGrammar {
        return SNOWFLAKE_GRAMMAR;
    }

    get Writer(): DialectWriter {
        return this.writer;
    }
}
