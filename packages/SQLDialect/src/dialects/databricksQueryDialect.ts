import type { DialectKey } from '../facets/dialectKey.js';
import type { DialectLexicalRules, ParameterPlaceholderForm } from '../facets/dialectLexicalRules.js';
import type { DialectGrammar, RowCapForm } from '../facets/dialectGrammar.js';
import type { DateAddUnit, DialectWriter, LimitClauseResult } from '../facets/dialectWriter.js';
import { ANSI_GRAMMAR, ANSI_LEXICAL, ANSI_WRITE_STATEMENT_KEYWORDS, AnsiQueryDialect, AnsiWriter } from './ansi.js';

/** Base URL: https://docs.databricks.com/en/sql/language-manual/ */
export const DATABRICKS_LEXICAL: DialectLexicalRules = Object.freeze({
    ...ANSI_LEXICAL,
    // Backtick identifiers, "Use ` to escape ` itself"; identifiers are case-insensitive.
    // https://docs.databricks.com/en/sql/language-manual/sql-ref-identifiers.html
    IdentifierQuotes: Object.freeze([Object.freeze({ Open: '`', Close: '`', DoubledCloseEscape: true })]),
    UnquotedIdentifierCase: 'none',
    // '…' or "…" strings with backslash escapes; an r / R prefix makes a raw string with no escape
    // character. A doubled quote is not documented as an escape: adjacent literals are chained,
    // so 'a''b' is two literals. Double quotes are strings unless spark.sql.ansi.doubleQuotedIdentifiers.
    // https://docs.databricks.com/en/sql/language-manual/data-types/string-type.html
    // https://spark.apache.org/docs/latest/sql-ref-literals.html
    // https://spark.apache.org/docs/latest/configuration.html (spark.sql.ansi.doubleQuotedIdentifiers)
    StringLiterals: Object.freeze([
        Object.freeze({ Prefixes: Object.freeze(['R']), Quote: "'", DoubledQuoteEscape: false, BackslashEscape: false }),
        Object.freeze({ Prefixes: Object.freeze(['R']), Quote: '"', DoubledQuoteEscape: false, BackslashEscape: false }),
        Object.freeze({ Prefixes: Object.freeze(['']), Quote: "'", DoubledQuoteEscape: false, BackslashEscape: true }),
        Object.freeze({ Prefixes: Object.freeze(['']), Quote: '"', DoubledQuoteEscape: false, BackslashEscape: true }),
    ]),
    // spark.sql.parser.escapedStringLiterals turns backslash escape processing off.
    // https://spark.apache.org/docs/latest/sql-ref-literals.html
    BackslashEscapesDependOnServerSettings: true,
    // `--` comments (no whitespace needed) and nestable bracketed comments.
    // https://docs.databricks.com/en/sql/language-manual/sql-ref-syntax-comment.html
    BlockComments: Object.freeze({ Nested: true, ExecutableOpeners: Object.freeze([]) }),
    // Named `:name` and unnamed `?` parameter markers.
    // https://docs.databricks.com/en/sql/language-manual/sql-ref-parameter-marker.html
    ParameterPlaceholders: Object.freeze<ParameterPlaceholderForm[]>(['colon-name', 'question']),
});

/**
 * Databricks grammar facts. `LIMIT` and `OFFSET`, no TOP or FETCH FIRST
 * (https://docs.databricks.com/en/sql/language-manual/sql-ref-syntax-qry-query.html);
 * `WITH RECURSIVE` (https://docs.databricks.com/en/sql/language-manual/sql-ref-syntax-qry-select-cte.html);
 * MINUS as an alternative for EXCEPT
 * (https://docs.databricks.com/en/sql/language-manual/sql-ref-syntax-qry-select-setops.html);
 * LATERAL (https://docs.databricks.com/en/sql/language-manual/sql-ref-syntax-qry-select-table-reference.html).
 * node-sql-parser reads it with its Hive grammar.
 */
export const DATABRICKS_GRAMMAR: DialectGrammar = Object.freeze({
    ...ANSI_GRAMMAR,
    ParserGrammar: 'Hive',
    RowCapForms: Object.freeze<RowCapForm[]>(['limit-offset']),
    SetOperatorKeywords: Object.freeze(['UNION', 'INTERSECT', 'EXCEPT', 'MINUS']),
    WriteStatementKeywords: Object.freeze([
        ...ANSI_WRITE_STATEMENT_KEYWORDS,
        'COPY', 'OPTIMIZE', 'VACUUM', 'MSCK', 'REPAIR', 'REFRESH', 'CACHE', 'UNCACHE', 'RESTORE', 'ADD', 'COMMENT',
    ]),
    // reflect / java_method call a Java method by name.
    CallerSQLForbiddenFunctions: Object.freeze(['reflect', 'try_reflect', 'java_method']),
});

/** Writes Databricks SQL: backtick identifiers, backslash-escaped literals, `LIMIT`, `TIMESTAMPADD`. */
export class DatabricksWriter extends AnsiWriter {
    QuoteIdentifier(name: string): string {
        return `\`${name.replace(/`/g, '``')}\``;
    }

    /** Escapes with backslashes only: a doubled quote would end the literal and start another. */
    QuoteStringLiteral(value: string): string {
        return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
    }

    LimitClause(limit: number, offset?: number): LimitClauseResult {
        return { prefix: '', suffix: offset != null ? `LIMIT ${limit} OFFSET ${offset}` : `LIMIT ${limit}` };
    }

    CastToText(expr: string): string {
        return this.Cast(expr, 'STRING');
    }

    /** https://docs.databricks.com/en/sql/language-manual/functions/get_json_object.html */
    JsonExtract(column: string, path: string): string {
        return `get_json_object(${column}, '${path}')`;
    }

    /** https://docs.databricks.com/en/sql/language-manual/functions/timestampadd.html */
    DateAddExpression(unit: DateAddUnit, amount: number, baseExpr: string): string {
        return `TIMESTAMPADD(${unit}, ${amount}, ${baseExpr})`;
    }

    /** https://docs.databricks.com/en/sql/language-manual/functions/current_timestamp.html */
    CurrentTimestampUTC(): string {
        return 'current_timestamp()';
    }
}

/** Databricks, read as an External Data Source. Query-only: no DDL facet. */
export class DatabricksQueryDialect extends AnsiQueryDialect {
    private readonly writer: DialectWriter = Object.freeze(new DatabricksWriter());

    get Key(): DialectKey {
        return 'databricks';
    }

    get DisplayName(): string {
        return 'Databricks SQL';
    }

    get Lexical(): DialectLexicalRules {
        return DATABRICKS_LEXICAL;
    }

    get Grammar(): DialectGrammar {
        return DATABRICKS_GRAMMAR;
    }

    get Writer(): DialectWriter {
        return this.writer;
    }
}
