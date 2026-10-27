import { SQLDialect, DatabasePlatform } from './sqlDialect.js';
import { ANSI_GRAMMAR, ANSI_LEXICAL, ANSI_WRITE_STATEMENT_KEYWORDS, AnsiWriter } from './dialects/ansi.js';
import { PostgreSQLSchemaDDL } from './dialects/postgresqlSchemaDDL.js';
import type { DialectLexicalRules, ParameterPlaceholderForm } from './facets/dialectLexicalRules.js';
import type { DialectGrammar, RowCapForm } from './facets/dialectGrammar.js';
import type { DialectWriter, LimitClauseResult } from './facets/dialectWriter.js';
import type { DialectTypes } from './facets/dialectTypes.js';
import type { DialectBinding } from './facets/dialectBinding.js';
import type { DialectSchemaDDL } from './facets/dialectSchemaDDL.js';

/**
 * PostgreSQL lexical rules: `"…"` identifiers, `'…'` / `N'…'` strings with doubled quotes,
 * `E'…'` strings with backslash escapes, `$$…$$` / `$tag$…$tag$` dollar quoting, `--` line
 * comments and nested block comments, `$1` parameters, unquoted names folded to lower case.
 *
 * All from https://www.postgresql.org/docs/current/sql-syntax-lexical.html (4.1.1 identifiers and
 * case folding, 4.1.2.2 escape strings, 4.1.2.4 dollar quoting, 4.1.4 positional parameters,
 * 4.1.5 comments).
 */
export const POSTGRESQL_LEXICAL: DialectLexicalRules = Object.freeze({
    ...ANSI_LEXICAL,
    StringLiterals: Object.freeze([
        Object.freeze({ Prefixes: Object.freeze(['', 'N']), Quote: "'", DoubledQuoteEscape: true, BackslashEscape: false }),
        Object.freeze({ Prefixes: Object.freeze(['E']), Quote: "'", DoubledQuoteEscape: true, BackslashEscape: true }),
    ]),
    DollarQuotedStrings: 'tagged',
    BlockComments: Object.freeze({ Nested: true, ExecutableOpeners: Object.freeze([]) }),
    ParameterPlaceholders: Object.freeze<ParameterPlaceholderForm[]>(['dollar-number']),
    UnquotedIdentifierCase: 'lower',
});

/**
 * PostgreSQL functions caller-supplied SQL may not call: the XML exporters that run SQL given as a
 * string (`query_to_xml`, `cursor_to_xml`, `table_to_xml`, `schema_to_xml`, `database_to_xml` and
 * their schema variants), the text-search functions that do the same (`ts_stat`, `ts_rewrite`),
 * `dblink`, the server-file readers, large objects, the administrative functions a read-only
 * transaction does not stop, and the sleep functions.
 */
const POSTGRESQL_CALLER_SQL_FORBIDDEN_FUNCTIONS: readonly string[] = [
    'query_to_xml*', 'cursor_to_xml*', 'table_to_xml*', 'schema_to_xml*', 'database_to_xml*',
    'ts_stat', 'ts_rewrite',
    'dblink*',
    'pg_read_file', 'pg_read_binary_file', 'pg_ls_*', 'pg_stat_file', 'pg_file_*',
    'lo_*',
    'pg_terminate_backend', 'pg_cancel_backend', 'pg_reload_conf', 'pg_rotate_logfile', 'pg_promote',
    'pg_switch_wal', 'pg_create_restore_point', 'pg_log_backend_memory_contexts',
    'pg_sleep*'
];

/**
 * PostgreSQL grammar facts: `LIMIT … OFFSET` and `FETCH FIRST` row caps, ORDER BY allowed in
 * CTEs and derived tables, nested WITH, `WITH RECURSIVE`, no hint clause, `LATERAL`.
 */
export const POSTGRESQL_GRAMMAR: DialectGrammar = Object.freeze({
    ...ANSI_GRAMMAR,
    ParserGrammar: 'PostgresQL',
    RowCapForms: Object.freeze<RowCapForm[]>(['limit-offset', 'offset-fetch']),
    WriteStatementKeywords: Object.freeze([
        ...ANSI_WRITE_STATEMENT_KEYWORDS,
        'COPY', 'DO', 'VACUUM', 'REINDEX', 'CLUSTER', 'REFRESH', 'LOCK', 'COMMENT', 'IMPORT', 'SECURITY',
    ]),
    CallerSQLForbiddenFunctions: POSTGRESQL_CALLER_SQL_FORBIDDEN_FUNCTIONS,
});

/**
 * PostgreSQL's column-type names as they appear in `pg_catalog` / `information_schema` /
 * `EntityField.Type`, with both the formal names (`character varying`) and the short or internal
 * aliases (`varchar`, `bpchar`). `tsvector` / `tsquery` serialize as text.
 */
export const POSTGRESQL_TYPES: DialectTypes = Object.freeze({
    BooleanTypeNames: Object.freeze(['bool', 'boolean']),
    StringTypeNames: Object.freeze(['text', 'varchar', 'char', 'character', 'character varying', 'bpchar', 'citext', 'name', 'tsvector', 'tsquery']),
    FixedWidthStringTypeNames: Object.freeze(['char', 'character', 'bpchar']),
    DateTypeNames: Object.freeze(['date', 'time', 'time without time zone', 'time with time zone', 'timestamp', 'timestamptz', 'timestamp with time zone', 'timestamp without time zone']),
    IntegerTypeNames: Object.freeze(['int', 'int2', 'int4', 'int8', 'integer', 'bigint', 'smallint', 'serial', 'bigserial', 'smallserial', 'oid']),
    FloatTypeNames: Object.freeze(['decimal', 'numeric', 'real', 'double precision', 'float4', 'float8']),
    UuidTypeNames: Object.freeze(['uuid']),
    BinaryTypeNames: Object.freeze(['bytea']),
    JsonTypeNames: Object.freeze(['json', 'jsonb', 'xml']),
    CurrencyTypeNames: Object.freeze(['money']),
    IntervalTypeNames: Object.freeze(['interval']),
    NetworkTypeNames: Object.freeze(['inet', 'cidr', 'macaddr', 'macaddr8']),
});

/** Writes PostgreSQL: double-quote identifiers, `LIMIT`/`OFFSET`, native booleans, `->>` JSON. */
export class PostgreSQLWriter extends AnsiWriter {
    QuoteIdentifier(name: string): string {
        // Double any embedded double-quote (`"`→`""`) so an identifier from an untrusted source — e.g. an
        // external entity's remote column/table names, which arrive via remote-schema introspection — cannot
        // break out of its quoting in generated DDL/DML. A no-op for normal identifiers (they contain no `"`).
        return `"${name.replace(/"/g, '""')}"`;
    }

    QuoteSchema(schema: string, object: string): string {
        // Quote BOTH parts (schema was previously interpolated bare). PG folds an unquoted identifier to
        // lowercase, so quoting the schema also preserves case for any non-lowercase schema; for the
        // all-lowercase core schema it is behavior-neutral. Escaping comes from QuoteIdentifier.
        return `${this.QuoteIdentifier(schema)}.${this.QuoteIdentifier(object)}`;
    }

    /**
     * PostgreSQL folds unquoted identifiers to lowercase, which would turn
     * `AS EntityName` into the result column `entityname`. Quoting the
     * alias preserves the requested casing for callers that key off the
     * column name (e.g. when consuming results into a TypeScript object
     * with a PascalCase property). Any embedded `"` is doubled (`"`→`""`),
     * for consistency with QuoteIdentifier — an alias sourced from an
     * untrusted name can't break out of its quoting.
     */
    QuoteColumnAlias(aliasName: string): string {
        return `"${aliasName.replace(/"/g, '""')}"`;
    }

    LimitClause(limit: number, offset?: number): LimitClauseResult {
        const parts = [`LIMIT ${limit}`];
        if (offset != null) {
            parts.push(`OFFSET ${offset}`);
        }
        return { prefix: '', suffix: parts.join(' ') };
    }

    BooleanLiteral(value: boolean): string {
        return value ? 'true' : 'false';
    }

    /**
     * PostgreSQL has no `ISNULL` keyword; the standard is `COALESCE` (which
     * SQL Server also supports). PG generated SPs/functions emit COALESCE
     * everywhere a null-coalescing wrap is needed.
     */
    IsNull(expr: string, fallback: string): string {
        return `COALESCE(${expr}, ${fallback})`;
    }

    /**
     * PostgreSQL's n-ary null-coalescing is also `COALESCE`. Same form as
     * the two-arg `IsNull` since PG has no `ISNULL` to differentiate from.
     */
    Coalesce(expr: string, fallback: string): string {
        return `COALESCE(${expr}, ${fallback})`;
    }

    CurrentTimestampUTC(): string {
        return "(NOW() AT TIME ZONE 'UTC')";
    }

    CastToText(expr: string): string {
        return `CAST(${expr} AS TEXT)`;
    }

    StringLiteralPrefix(_text: string): string {
        return '';
    }

    EscapeLikePattern(text: string): string {
        return text.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
    }

    ConcatOperator(): string {
        return '||';
    }

    JsonExtract(column: string, path: string): string {
        // PostgreSQL JSONB operator for text extraction
        return `${column}->>'${path}'`;
    }

    DateAddExpression(unit: 'MINUTE' | 'HOUR' | 'DAY', amount: number, baseExpr: string): string {
        const pgUnit = unit.toLowerCase() + 's'; // MINUTE -> minutes, HOUR -> hours, DAY -> days
        return `${baseExpr} + INTERVAL '${amount} ${pgUnit}'`;
    }

    IIF(condition: string, trueVal: string, falseVal: string): string {
        return `CASE WHEN ${condition} THEN ${trueVal} ELSE ${falseVal} END`;
    }
}

/** PostgreSQL binding through the `pg` driver: `$1` placeholders, native booleans. */
export class PostgreSQLBinding implements DialectBinding {
    BooleanParameterValue(value: boolean): boolean | number {
        return value;
    }

    ParameterPlaceholder(index: number): string {
        return `$${index + 1}`; // PostgreSQL uses 1-based indexing
    }

    IsConnectionError(e: unknown): boolean {
        if (!(e instanceof Error)) return false;

        // pg driver throws plain Error with Node.js network error codes for
        // connection failures. DatabaseError (from pg-protocol) is for
        // server-side SQL errors, which are NOT connection errors.
        if (e.name === 'DatabaseError') return false;

        const code = (e as { code?: string }).code ?? '';
        return (
            code === 'ECONNREFUSED' ||
            code === 'ECONNRESET' ||
            code === 'ETIMEDOUT' ||
            code === 'ENOTFOUND' ||
            code === 'EPIPE' ||
            e.message.includes('Connection terminated') ||
            e.message.includes('connection is insecure')
        );
    }
}

/**
 * PostgreSQL dialect implementation.
 * Uses "double-quote" identifiers, LIMIT/OFFSET pagination, native BOOLEAN, PL/pgSQL functions.
 */
export class PostgreSQLDialect extends SQLDialect {
    private readonly writer: DialectWriter = Object.freeze(new PostgreSQLWriter());
    private readonly binding: DialectBinding = Object.freeze(new PostgreSQLBinding());
    private readonly ddl: DialectSchemaDDL = Object.freeze(new PostgreSQLSchemaDDL(this.writer));

    get PlatformKey(): DatabasePlatform {
        return 'postgresql';
    }

    get DisplayName(): string {
        return 'PostgreSQL';
    }

    /** `sql-formatter` ships PostgreSQL under the `postgresql` language key. */
    get FormatterLanguage(): string {
        return 'postgresql';
    }

    get Lexical(): DialectLexicalRules {
        return POSTGRESQL_LEXICAL;
    }

    get Grammar(): DialectGrammar {
        return POSTGRESQL_GRAMMAR;
    }

    get Writer(): DialectWriter {
        return this.writer;
    }

    get Types(): DialectTypes {
        return POSTGRESQL_TYPES;
    }

    get Binding(): DialectBinding {
        return this.binding;
    }

    get DDL(): DialectSchemaDDL {
        return this.ddl;
    }
}
