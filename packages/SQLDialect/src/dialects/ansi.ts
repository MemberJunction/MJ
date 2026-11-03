import type { DialectLexicalRules, ParameterPlaceholderForm } from '../facets/dialectLexicalRules.js';
import type { DialectGrammar, RowCapForm } from '../facets/dialectGrammar.js';
import type { DateAddUnit, DialectWriter, LimitClauseResult } from '../facets/dialectWriter.js';
import { QueryDialect } from '../queryDialect.js';

/**
 * Standard SQL lexical rules: `"…"` identifiers with doubled-quote escapes, `'…'` strings with
 * doubled-quote escapes and an optional `N` prefix, `--` line comments and non-nested `/* *\/`
 * block comments, `?` placeholders, unquoted names folded to upper case.
 */
export const ANSI_LEXICAL: DialectLexicalRules = Object.freeze({
    IdentifierQuotes: Object.freeze([Object.freeze({ Open: '"', Close: '"', DoubledCloseEscape: true })]),
    StringLiterals: Object.freeze([
        Object.freeze({ Prefixes: Object.freeze(['', 'N']), Quote: "'", DoubledQuoteEscape: true, BackslashEscape: false }),
    ]),
    BackslashEscapesDependOnServerSettings: false,
    DollarQuotedStrings: 'none',
    AlternativeQuotingPrefixes: Object.freeze([]),
    LineComments: Object.freeze([Object.freeze({ Opener: '--', RequiresWhitespaceAfter: false })]),
    BlockComments: Object.freeze({ Nested: false, ExecutableOpeners: Object.freeze([]) }),
    ParameterPlaceholders: Object.freeze<ParameterPlaceholderForm[]>(['question']),
    UnquotedIdentifierCase: 'upper',
});

/** Statement keywords that write data, change the schema, change permissions or run code, in standard SQL. */
export const ANSI_WRITE_STATEMENT_KEYWORDS: readonly string[] = Object.freeze([
    'INSERT', 'UPDATE', 'DELETE', 'MERGE', 'CREATE', 'ALTER', 'DROP', 'TRUNCATE', 'GRANT', 'REVOKE', 'CALL',
]);

/**
 * Standard SQL grammar facts: `OFFSET … FETCH FIRST` row caps, ORDER BY allowed in CTEs and
 * derived tables, nested WITH, `WITH RECURSIVE`, no query-hint clause, `LATERAL`.
 */
export const ANSI_GRAMMAR: DialectGrammar = Object.freeze({
    ParserGrammar: null,
    DefaultSchema: null,
    RowCapForms: Object.freeze<RowCapForm[]>(['offset-fetch']),
    AllowsOrderByInCTE: true,
    AllowsOrderByInDerivedTable: true,
    SupportsNestedWith: true,
    RecursiveKeyword: 'RECURSIVE',
    QueryHintKeyword: null,
    DocumentTailClauses: Object.freeze([]),
    SetOperatorKeywords: Object.freeze(['UNION', 'INTERSECT', 'EXCEPT']),
    CorrelatedJoin: 'lateral',
    WriteStatementKeywords: ANSI_WRITE_STATEMENT_KEYWORDS,
    CallerSQLForbiddenFunctions: Object.freeze([]),
    DefaultPagingOrderBy: '1',
    SelectListPagingOrderBy: null,
    PagingRequiresOrderBy: false,
});

/**
 * Writes standard SQL. Each dialect's writer extends this and overrides only what its database
 * spells differently.
 */
export class AnsiWriter implements DialectWriter {
    QuoteIdentifier(name: string): string {
        return `"${name.replace(/"/g, '""')}"`;
    }

    QuoteSchema(schema: string, object: string): string {
        return `${this.QuoteIdentifier(schema)}.${this.QuoteIdentifier(object)}`;
    }

    QuoteColumnAlias(aliasName: string): string {
        return this.QuoteIdentifier(aliasName);
    }

    QuoteStringLiteral(value: string): string {
        return `'${value.replace(/'/g, "''")}'`;
    }

    StringLiteralPrefix(_text: string): string {
        return '';
    }

    /** Backslash-escapes `\`, `%` and `_`, for platforms whose LIKE uses backslash as the default escape. */
    EscapeLikePattern(text: string): string {
        return text.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
    }

    BooleanLiteral(value: boolean): string {
        return value ? 'TRUE' : 'FALSE';
    }

    get NullLiteral(): string {
        return 'NULL';
    }

    LimitClause(limit: number, offset?: number): LimitClauseResult {
        if (offset != null) {
            return { prefix: '', suffix: `OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY` };
        }
        return { prefix: '', suffix: `FETCH FIRST ${limit} ROWS ONLY` };
    }

    Cast(expr: string, sqlType: string): string {
        return `CAST(${expr} AS ${sqlType})`;
    }

    CastToText(expr: string): string {
        return this.Cast(expr, 'VARCHAR');
    }

    Coalesce(expr: string, fallback: string): string {
        return `COALESCE(${expr}, ${fallback})`;
    }

    IsNull(expr: string, fallback: string): string {
        return this.Coalesce(expr, fallback);
    }

    ConcatOperator(): string | null {
        return '||';
    }

    Concat(...parts: string[]): string {
        const operator = this.ConcatOperator();
        return operator === null ? `CONCAT(${parts.join(', ')})` : parts.join(` ${operator} `);
    }

    JsonExtract(column: string, path: string): string {
        return `JSON_VALUE(${column}, '${path}')`;
    }

    DateAddExpression(unit: DateAddUnit, amount: number, baseExpr: string): string {
        return `${baseExpr} + INTERVAL '${amount}' ${unit}`;
    }

    CurrentTimestampUTC(): string {
        return 'CURRENT_TIMESTAMP';
    }

    LowerCase(expr: string): string {
        return `LOWER(${expr})`;
    }

    IIF(condition: string, trueVal: string, falseVal: string): string {
        return `CASE WHEN ${condition} THEN ${trueVal} ELSE ${falseVal} END`;
    }
}

/**
 * Base for query-only dialects: standard SQL facets by default. A dialect overrides the facets
 * (or the parts of them) where its database differs.
 */
export abstract class AnsiQueryDialect extends QueryDialect {
    private readonly ansiWriter: DialectWriter = Object.freeze(new AnsiWriter());

    get Lexical(): DialectLexicalRules {
        return ANSI_LEXICAL;
    }

    get Grammar(): DialectGrammar {
        return ANSI_GRAMMAR;
    }

    get Writer(): DialectWriter {
        return this.ansiWriter;
    }
}
