import { SQLDialect, DatabasePlatform } from './sqlDialect.js';
import { ANSI_GRAMMAR, ANSI_LEXICAL, ANSI_WRITE_STATEMENT_KEYWORDS, AnsiWriter } from './dialects/ansi.js';
import { SQLServerSchemaDDL } from './dialects/sqlServerSchemaDDL.js';
import type { DialectLexicalRules, ParameterPlaceholderForm } from './facets/dialectLexicalRules.js';
import type { DialectGrammar, RowCapForm } from './facets/dialectGrammar.js';
import type { DialectWriter, LimitClauseResult } from './facets/dialectWriter.js';
import type { DialectTypes } from './facets/dialectTypes.js';
import type { DialectBinding } from './facets/dialectBinding.js';
import type { DialectSchemaDDL } from './facets/dialectSchemaDDL.js';

/**
 * SQL Server lexical rules: `[…]` and `"…"` identifiers, `'…'` and `N'…'` strings with doubled
 * quotes, `--` line comments and nested block comments, `@name` parameters.
 *
 * - Identifiers: https://learn.microsoft.com/en-us/sql/relational-databases/databases/database-identifiers
 * - Nested block comments: https://learn.microsoft.com/en-us/sql/t-sql/language-elements/slash-star-comment-transact-sql
 * - `--` comments: https://learn.microsoft.com/en-us/sql/t-sql/language-elements/comment-transact-sql
 */
export const SQL_SERVER_LEXICAL: DialectLexicalRules = Object.freeze({
    ...ANSI_LEXICAL,
    IdentifierQuotes: Object.freeze([
        Object.freeze({ Open: '"', Close: '"', DoubledCloseEscape: true }),
        Object.freeze({ Open: '[', Close: ']', DoubledCloseEscape: true }),
    ]),
    BlockComments: Object.freeze({ Nested: true, ExecutableOpeners: Object.freeze([]) }),
    ParameterPlaceholders: Object.freeze<ParameterPlaceholderForm[]>(['at-name']),
    UnquotedIdentifierCase: 'none',
});

/**
 * SQL Server functions caller-supplied SQL may not call: the rowset functions that reach other
 * servers, databases or files, `OPENXML`, and the functions that read trace, audit and
 * extended-event files.
 */
const SQL_SERVER_CALLER_SQL_FORBIDDEN_FUNCTIONS: readonly string[] = [
    'openrowset', 'openquery', 'opendatasource', 'openxml',
    'fn_get_audit_file', 'fn_xe_file_target_read_file', 'fn_trace_gettable'
];

/**
 * SQL Server grammar facts: `TOP` and `OFFSET … FETCH` row caps, no ORDER BY in a CTE or derived
 * table without TOP/OFFSET/FOR XML, no nested WITH, plain `WITH` for recursion, the `OPTION (…)`
 * hint clause, `FOR JSON` / `FOR XML`, `CROSS/OUTER APPLY`.
 */
export const SQL_SERVER_GRAMMAR: DialectGrammar = Object.freeze({
    ...ANSI_GRAMMAR,
    ParserGrammar: 'TransactSQL',
    RowCapForms: Object.freeze<RowCapForm[]>(['top', 'offset-fetch']),
    AllowsOrderByInCTE: false,
    AllowsOrderByInDerivedTable: false,
    SupportsNestedWith: false,
    RecursiveKeyword: null,
    QueryHintKeyword: 'OPTION',
    DocumentTailClauses: Object.freeze(['FOR JSON', 'FOR XML']),
    CorrelatedJoin: 'apply',
    WriteStatementKeywords: Object.freeze([
        ...ANSI_WRITE_STATEMENT_KEYWORDS.filter(keyword => keyword !== 'CALL'),
        'EXEC', 'EXECUTE', 'DENY', 'BULK', 'BACKUP', 'RESTORE', 'DBCC', 'RECONFIGURE', 'SHUTDOWN', 'KILL',
    ]),
    CallerSQLForbiddenFunctions: SQL_SERVER_CALLER_SQL_FORBIDDEN_FUNCTIONS,
    DefaultPagingOrderBy: '(SELECT NULL)',
    SelectListPagingOrderBy: '1',
    PagingRequiresOrderBy: true,
});

/**
 * SQL Server's column-type names as they appear in `sys.columns.name` / `EntityField.Type` for
 * entities backed by a SQL Server schema. `char` and `nchar` right-pad stored values with spaces.
 */
export const SQL_SERVER_TYPES: DialectTypes = Object.freeze({
    BooleanTypeNames: Object.freeze(['bit']),
    StringTypeNames: Object.freeze(['text', 'ntext', 'varchar', 'nvarchar', 'char', 'nchar']),
    FixedWidthStringTypeNames: Object.freeze(['char', 'nchar']),
    DateTypeNames: Object.freeze(['date', 'time', 'datetime', 'datetime2', 'datetimeoffset', 'smalldatetime']),
    IntegerTypeNames: Object.freeze(['int', 'integer', 'bigint', 'smallint', 'tinyint', 'rowversion', 'timestamp']),
    FloatTypeNames: Object.freeze(['decimal', 'numeric', 'float', 'real']),
    UuidTypeNames: Object.freeze(['uniqueidentifier']),
    BinaryTypeNames: Object.freeze(['binary', 'varbinary', 'image']),
    JsonTypeNames: Object.freeze(['xml']),
    CurrencyTypeNames: Object.freeze(['money', 'smallmoney']),
    IntervalTypeNames: Object.freeze([]),
    NetworkTypeNames: Object.freeze([]),
});

/** Writes T-SQL: bracket quoting, `TOP`, `BIT` booleans, `ISNULL`, `+` concatenation. */
export class SQLServerWriter extends AnsiWriter {
    QuoteIdentifier(name: string): string {
        // Double embedded closing brackets so a name containing `]` cannot terminate the
        // quoting early (mirrors the PostgreSQL dialect's doubling of embedded `"`).
        return `[${name.replace(/]/g, ']]')}]`;
    }

    QuoteSchema(schema: string, object: string): string {
        return `${this.QuoteIdentifier(schema)}.${this.QuoteIdentifier(object)}`;
    }

    /**
     * SQL Server identifiers are case-insensitive by default, so a bare
     * alias preserves the requested casing when echoed in result-set
     * column metadata. Bracketed quoting would also work but is unnecessary.
     */
    QuoteColumnAlias(aliasName: string): string {
        return aliasName;
    }

    LimitClause(limit: number, offset?: number): LimitClauseResult {
        if (offset != null) {
            return { prefix: '', suffix: `OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY` };
        }
        return { prefix: `TOP ${limit}`, suffix: '' };
    }

    BooleanLiteral(value: boolean): string {
        return value ? '1' : '0';
    }

    /**
     * SQL Server has both `ISNULL` (T-SQL native, two-arg only) and `COALESCE`
     * (ANSI, n-ary). For two-argument null-coalescing we emit the native
     * `ISNULL` form so generated SPs match the conventional T-SQL idiom and
     * the data-type-of-first-argument semantics callers may already rely on.
     */
    IsNull(expr: string, fallback: string): string {
        return `ISNULL(${expr}, ${fallback})`;
    }

    /**
     * SQL Server supports `COALESCE` as an ANSI-standard alternative to its
     * native `ISNULL`. The two differ subtly in return-type inference and
     * argument arity (`COALESCE` is n-ary; `ISNULL` is two-arg only). Use
     * this helper when codegen needs the n-ary form or when caller intent
     * is ANSI-portable rather than T-SQL-native.
     */
    Coalesce(expr: string, fallback: string): string {
        return `COALESCE(${expr}, ${fallback})`;
    }

    CurrentTimestampUTC(): string {
        return 'GETUTCDATE()';
    }

    CastToText(expr: string): string {
        return `CAST(${expr} AS NVARCHAR(MAX))`;
    }

    StringLiteralPrefix(text: string): string {
        return /[^\x00-\x7F]/.test(text) ? 'N' : '';
    }

    EscapeLikePattern(text: string): string {
        return text.replace(/\[/g, '[[]').replace(/%/g, '[%]').replace(/_/g, '[_]');
    }

    ConcatOperator(): string {
        return '+';
    }

    JsonExtract(column: string, path: string): string {
        return `JSON_VALUE(${column}, '${path}')`;
    }

    DateAddExpression(unit: 'MINUTE' | 'HOUR' | 'DAY', amount: number, baseExpr: string): string {
        return `DATEADD(${unit}, ${amount}, ${baseExpr})`;
    }

    IIF(condition: string, trueVal: string, falseVal: string): string {
        return `IIF(${condition}, ${trueVal}, ${falseVal})`;
    }
}

/** SQL Server binding through the `mssql` driver: `@p0` placeholders, `1`/`0` booleans. */
export class SQLServerBinding implements DialectBinding {
    BooleanParameterValue(value: boolean): boolean | number {
        return value ? 1 : 0;
    }

    ParameterPlaceholder(index: number): string {
        return `@p${index}`;
    }

    IsConnectionError(e: unknown): boolean {
        if (!(e instanceof Error)) return false;

        // mssql driver sets error.name to 'ConnectionError' for all connectivity
        // failures (timeout, refused, reset, TLS handshake, etc.)
        return e.name === 'ConnectionError';
    }
}

/**
 * SQL Server dialect implementation.
 * Uses [bracket] quoting, TOP for pagination, BIT for booleans, T-SQL functions.
 */
export class SQLServerDialect extends SQLDialect {
    private readonly writer: DialectWriter = Object.freeze(new SQLServerWriter());
    private readonly binding: DialectBinding = Object.freeze(new SQLServerBinding());
    private readonly ddl: DialectSchemaDDL = Object.freeze(new SQLServerSchemaDDL(this.writer));

    get PlatformKey(): DatabasePlatform {
        return 'sqlserver';
    }

    get DisplayName(): string {
        return 'Microsoft SQL Server (T-SQL)';
    }

    /** `sql-formatter` ships T-SQL under the `tsql` language key. */
    get FormatterLanguage(): string {
        return 'tsql';
    }

    get Lexical(): DialectLexicalRules {
        return SQL_SERVER_LEXICAL;
    }

    get Grammar(): DialectGrammar {
        return SQL_SERVER_GRAMMAR;
    }

    get Writer(): DialectWriter {
        return this.writer;
    }

    get Types(): DialectTypes {
        return SQL_SERVER_TYPES;
    }

    get Binding(): DialectBinding {
        return this.binding;
    }

    get DDL(): DialectSchemaDDL {
        return this.ddl;
    }
}
