import { MappedType } from './dataTypeMap.js';
import type { DataTypeMap } from './dataTypeMap.js';
import { QueryDialect } from './queryDialect.js';
import type { DialectKey } from './facets/dialectKey.js';
import type { DialectTypes } from './facets/dialectTypes.js';
import type { DialectBinding } from './facets/dialectBinding.js';
import type { LimitClauseResult, DateAddUnit } from './facets/dialectWriter.js';
import type {
    DialectSchemaDDL,
    SchemaIntrospectionSQL,
    ColumnDDLOptions,
    AlterColumnOptions,
    TriggerOptions,
    IndexOptions,
    ResolveTypeOptions,
} from './facets/dialectSchemaDDL.js';

export type { LimitClauseResult } from './facets/dialectWriter.js';
export type {
    SchemaFieldType,
    ResolveTypeOptions,
    SchemaIntrospectionSQL,
    ColumnDDLOptions,
    AlterColumnOptions,
    TriggerOptions,
    IndexOptions,
} from './facets/dialectSchemaDDL.js';

/**
 * Canonical database-platform value used across MJ. Single source of truth —
 * config validation, env-var parsing, and runtime branching all compare
 * against these literals. Aliases (`mssql`, `postgres`, `pg`) are not
 * recognized.
 *
 * Lives in `@memberjunction/sql-dialect` (not `core` or `global`) because
 * this is the package that owns SQL dialect semantics; every other package
 * imports it from here (or from core, which re-exports for back-compat).
 */
export type DatabasePlatform = 'sqlserver' | 'postgresql';


/**
 * Minimal dialect interface consumed by `@memberjunction/sql-parser`.
 *
 * SQLParser needs only these properties to be dialect-aware. The full
 * {@link SQLDialect} class implements this interface plus 80+ additional
 * methods for DDL/DML generation, data type mapping, etc.
 *
 * @deprecated Use {@link ParserDialect} (a dialect's key and its lexical and grammar facets) or
 * a {@link QueryDialect}. {@link SQLDialect} still satisfies this interface.
 */
export interface SQLParserDialect {
    /** node-sql-parser dialect string (e.g., 'TransactSQL', 'PostgresQL', 'MySQL') */
    ParserDialect: string;
    /** Quotes a database identifier. SQL Server: [name], PostgreSQL: "name", MySQL: `name` */
    QuoteIdentifier(name: string): string;
    /** Whether ORDER BY is legal inside CTE definitions on this platform */
    AllowsOrderByInCTE: boolean;
    /** Default ORDER BY expression for paging when no ORDER BY exists.
     *  SQL Server: '(SELECT NULL)', PostgreSQL: '1' */
    DefaultPagingOrderBy: string;
    /** Whether `E'…'` string literals, in which a backslash escapes the next character, exist.
     *  PostgreSQL: true, SQL Server: false */
    SupportsEscapeStringLiterals: boolean;
    /** Whether dollar-quoted string literals (`$$…$$`, `$tag$…$tag$`) exist.
     *  PostgreSQL: true, SQL Server: false */
    SupportsDollarQuotedStrings: boolean;
    /** The keyword that opens a statement's trailing query-hint clause, such as `OPTION (…)`;
     *  `null` when the platform has none. SQL Server: 'OPTION', PostgreSQL: null */
    QueryHintKeyword: string | null;
    /**
     * Functions SQL a caller supplied (ad-hoc SQL, `TestQuerySQL`, query specs, client RunView
     * clauses) may not call, lower case; a trailing `*` matches every name with that prefix. They
     * run SQL passed as a string, read files or other databases, act on the server, or pause the
     * query, so neither the check of which tables the SQL reads nor a read-only transaction stops
     * them.
     */
    CallerSQLForbiddenFunctions: readonly string[];
}

/**
 * Abstract base class for the dialects of the platforms MJ itself runs on.
 *
 * A {@link QueryDialect} (lexical rules, grammar facts, writer, types, binding) plus the
 * {@link DDL} facet MJ needs to create and run its own schema. Every member below is kept for
 * existing callers and delegates to one of the facets. This is a pure string/logic layer with
 * zero database driver dependencies.
 */
export abstract class SQLDialect extends QueryDialect implements SQLParserDialect {
    /**
     * The platform key identifying this dialect.
     */
    abstract get PlatformKey(): DatabasePlatform;

    /** The dialect key, which for a platform dialect is its {@link PlatformKey}. */
    get Key(): DialectKey {
        return this.PlatformKey;
    }

    /** SQL type-name sets. */
    abstract override get Types(): DialectTypes;

    /** Driver binding rules. */
    abstract override get Binding(): DialectBinding;

    /** DDL, stored-procedure, migration, introspection and transaction SQL. */
    abstract get DDL(): DialectSchemaDDL;

    /**
     * Returns the dialect name used by node-sql-parser for AST parsing.
     * SQL Server: 'TransactSQL', PostgreSQL: 'PostgresQL', etc.
     */
    get ParserDialect(): string {
        const grammar = this.Grammar.ParserGrammar;
        if (grammar === null) {
            throw new Error(`The ${this.PlatformKey} dialect declares no node-sql-parser grammar.`);
        }
        return grammar;
    }

    // ─── Identifier Quoting ──────────────────────────────────────────

    /**
     * Quotes a database identifier (table name, column name, etc.).
     * SQL Server: [name], PostgreSQL: "name"
     */
    QuoteIdentifier(name: string): string {
        return this.Writer.QuoteIdentifier(name);
    }

    /**
     * Produces a schema-qualified object reference.
     * SQL Server: [schema].[object], PostgreSQL: schema."object"
     */
    QuoteSchema(schema: string, object: string): string {
        return this.Writer.QuoteSchema(schema, object);
    }

    /**
     * Quotes a column alias used in `SELECT ... AS <alias>`. SQL Server is
     * case-insensitive and accepts a bare identifier; PostgreSQL folds
     * unquoted identifiers to lowercase, so we must quote the alias when the
     * caller cares about preserving case (e.g. matching a TypeScript property
     * name in the result row).
     */
    QuoteColumnAlias(aliasName: string): string {
        return this.Writer.QuoteColumnAlias(aliasName);
    }

    /**
     * Canonicalizes a SCHEMA name to the form the platform actually stores when
     * the name appears UNQUOTED in DDL. PostgreSQL folds unquoted identifiers to
     * lowercase, so `__mj_BizAppsCommon` physically becomes `__mj_bizappscommon`;
     * SQL Server is case-insensitive and stores the name as-given. Routing every
     * schema CREATE/DROP/USE through this keeps the engine's (quoted) operations
     * aligned with what unquoted migration DDL produces — so a mixed-case schema
     * name can't split into two physical schemas (one quoted-mixed, one folded-lowercase).
     */
    CanonicalSchemaName(name: string): string {
        return this.DDL.CanonicalSchemaName(name);
    }

    /**
     * Quotes a value as a SQL string literal. Both SQL Server and PostgreSQL
     * use single quotes with `''` doubling to escape internal apostrophes.
     * Use this instead of reinventing the `value.replace(/'/g, "''")` pattern;
     * the dialect's writer owns the escape rule.
     */
    QuoteStringLiteral(value: string): string {
        return this.Writer.QuoteStringLiteral(value);
    }

    /**
     * The prefix a string literal holding `text` needs so the database keeps every character, or
     * `''` when a plain literal does. SQL Server: `N` when the text has characters outside ASCII,
     * which a plain literal would lose to the database code page. PostgreSQL: always `''`.
     */
    StringLiteralPrefix(text: string): string {
        return this.Writer.StringLiteralPrefix(text);
    }

    /**
     * Escapes the characters a `LIKE` pattern treats specially, so `text` matches literally with
     * the platform's default escape rules (no `ESCAPE` clause). Quotes are not escaped here; the
     * caller still doubles them for the string literal.
     * SQL Server: `[`, `%` and `_` become `[[]`, `[%]` and `[_]`. PostgreSQL: `\`, `%` and `_`
     * are escaped with a backslash.
     */
    EscapeLikePattern(text: string): string {
        return this.Writer.EscapeLikePattern(text);
    }

    /**
     * The value to bind for a boolean query parameter. SQL Server: `1` / `0` (BIT),
     * PostgreSQL: `true` / `false`.
     */
    BooleanParameterValue(value: boolean): boolean | number {
        return this.Binding.BooleanParameterValue(value);
    }

    // ─── Pagination ──────────────────────────────────────────────────

    /**
     * Returns pagination SQL fragments.
     * SQL Server uses TOP (prefix) or OFFSET/FETCH (suffix).
     * PostgreSQL uses LIMIT/OFFSET (suffix).
     */
    LimitClause(limit: number, offset?: number): LimitClauseResult {
        return this.Writer.LimitClause(limit, offset);
    }

    // ─── Literals & Expressions ──────────────────────────────────────

    /**
     * Returns a boolean literal for the platform.
     * SQL Server: "1"/"0", PostgreSQL: "true"/"false"
     */
    BooleanLiteral(value: boolean): string {
        return this.Writer.BooleanLiteral(value);
    }

    /**
     * Returns the SQL type token for a boolean parameter in a stored-procedure /
     * function signature. Used by codegen when emitting tolerant-SP `_Clear`
     * companion parameters and other boolean-typed params.
     *
     * SQL Server: `bit` (BIT type, 0/1)
     * PostgreSQL: `boolean` (BOOLEAN type, TRUE/FALSE)
     *
     * Hardcoding `bit` everywhere worked on SQL Server but produced sprocs
     * that PG rejected as `operator does not exist: boolean = integer` when
     * the generated CASE compared a `bit`-declared parameter with `= 1`.
     */
    BooleanParameterType(): string {
        return this.DDL.BooleanParameterType();
    }

    /**
     * Returns the current UTC timestamp expression.
     * SQL Server: GETUTCDATE(), PostgreSQL: NOW() AT TIME ZONE 'UTC'
     */
    CurrentTimestampUTC(): string {
        return this.Writer.CurrentTimestampUTC();
    }

    /**
     * Wraps a single DML statement so the number of rows it affected comes back as a one-row,
     * one-column result set — the portable way to read an affected-row count without relying on a
     * driver-specific `rowsAffected` field.
     *
     * SQL Server appends `SELECT @@ROWCOUNT`. PostgreSQL has no `@@ROWCOUNT` at all, so it wraps
     * the statement in a data-modifying CTE and counts the `RETURNING` rows.
     *
     * `dmlStatement` must be exactly one INSERT/UPDATE/DELETE and carry no trailing semicolon:
     * the PostgreSQL form is a CTE, which cannot wrap a statement batch.
     */
    AffectedRowCountSQL(dmlStatement: string, alias: string): string {
        return this.DDL.AffectedRowCountSQL(dmlStatement, alias);
    }

    /**
     * Wraps an expression in the dialect's lowercase function — used for
     * case-insensitive comparison when authoring filters that must work on
     * both SS (default case-insensitive collation) and PG (case-sensitive).
     *
     * Both SQL Server and PostgreSQL implement `LOWER()` per the ANSI SQL
     * standard, so the default returns `LOWER(${expr})`. A subclass would
     * override only for an exotic dialect (e.g. one that exposes `lc()` or
     * needs a CAST first).
     *
     * Use this instead of hardcoding `LOWER(...)` in callers — keeps the
     * dialect-aware SQL surface in one place per the SQLDialect contract.
     */
    LowerCase(expr: string): string {
        return this.Writer.LowerCase(expr);
    }

    // ─── Prompt / Tooling Description ──────────────────────

    /**
     * Human-readable name for this dialect, as it should appear to a person
     * — or to an LLM being told which SQL to write.
     *
     * Abstract on purpose: the name is dialect knowledge, so a new dialect
     * declares it once here rather than every prompt/UI keeping its own map.
     */
    abstract override get DisplayName(): string;

    /**
     * The `sql-formatter` language key for this dialect (e.g. `'tsql'`,
     * `'postgresql'`). Callers that pretty-print generated SQL read this
     * instead of hardcoding a language, so formatting follows the tenant's
     * actual platform.
     */
    abstract get FormatterLanguage(): string;

    /**
     * A syntax briefing for this dialect, composed ENTIRELY from this class's
     * own primitives — nothing here is a hand-maintained per-dialect prose
     * table. Implementing the dialect is therefore sufficient to get correct
     * guidance; there is no second list to remember to update.
     *
     * Consumed by the `_SQL_DIALECT_RULES` system placeholder, which makes it
     * available to EVERY AI prompt template without any template having to be
     * registered anywhere. That is the point: the set of SQL-generating
     * templates is a predicate ("does it ask for SQL?"), never a list of IDs.
     */
    get PromptGuidance(): string {
        const topN = this.LimitClause(10);
        const firstRows = [topN.prefix, '<columns> FROM <table>', topN.suffix]
            .filter(part => part.length > 0)
            .join(' ');
        const page = this.LimitClause(25, 50);
        const pagedRows = [page.prefix, '<columns> FROM <table> ORDER BY <column>', page.suffix]
            .filter(part => part.length > 0)
            .join(' ');

        return [
            `Target database platform: **${this.DisplayName}**. Emit ${this.DisplayName} syntax ONLY — SQL written for a different platform will fail on this tenant.`,
            '',
            `${this.DisplayName} syntax reference:`,
            `- Quote an identifier: ${this.QuoteIdentifier('Order Date')}`,
            `- Qualify an object: ${this.QuoteSchema('sales', 'vwOrders')}`,
            `- Alias a column: <expression> AS ${this.QuoteColumnAlias('TotalRevenue')}`,
            `- Limit rows: SELECT ${firstRows}`,
            `- Page rows: SELECT ${pagedRows}`,
            `- Boolean literals: ${this.BooleanLiteral(true)} (true) / ${this.BooleanLiteral(false)} (false)`,
            `- Null-coalesce (2 args): ${this.IsNull('t.Amount', '0')}`,
            `- Null-coalesce (n-ary): ${this.Coalesce('t.Amount', '0')}`,
            `- Conditional expression: ${this.IIF('t.Amount > 0', "'Positive'", "'Non-positive'")}`,
            `- Current timestamp (UTC): ${this.CurrentTimestampUTC()}`,
            `- Date arithmetic (30 days ago): ${this.DateAddExpression('DAY', -30, this.CurrentTimestampUTC())}`,
            `- Case-insensitive compare: ${this.LowerCase('t.Name')} = ${this.LowerCase("'acme'")}`,
            `- Concatenate strings with the ${this.ConcatOperator()} operator, or cast first with ${this.CastToText('<expression>')}`,
            `- New UUID: ${this.NewUUID()}`,
            `- NULL literal: ${this.NullLiteral}`,
        ].join('\n');
    }

    // ─── Type-Name Sets (single source of truth for SQL ↔ category mapping) ──
    //
    // Each dialect declares the SQL type names it uses for each conceptual
    // category. Cross-dialect predicates (`IsBooleanSQLType`, `IsStringSQLType`,
    // etc. — see ./typeClassification.ts) union these lists so callers can
    // classify any type name without knowing which platform produced it.
    //
    // Adding a new dialect = implementing these getters + registering with the
    // classification module. NEVER hardcode lists of SQL type names in
    // call sites — use the predicates.
    //
    // Returned names MUST be lowercase, trimmed, and match the strings that
    // appear in `EntityField.Type` for that platform (i.e. what the platform's
    // `information_schema` / `sys.columns` reports).

    /** SQL type names this dialect uses for boolean columns. */
    get BooleanTypeNames(): readonly string[] {
        return this.Types.BooleanTypeNames;
    }

    /** SQL type names this dialect uses for variable-length character / text columns. */
    get StringTypeNames(): readonly string[] {
        return this.Types.StringTypeNames;
    }

    /**
     * Subset of {@link StringTypeNames} that represents **fixed-width** /
     * space-padded character types. SQL Server `char`/`nchar` and PostgreSQL
     * `char`/`bpchar`/`character` (without `varying`) all right-pad stored
     * values with spaces up to the declared length and return that padding
     * in result sets. Variable-width types (`varchar`, `nvarchar`, `text`,
     * etc.) do not.
     *
     * Used by `BaseEntity` to rtrim padding on load so dirty-checks and
     * downstream consumers see the logical value, not the storage form.
     */
    get FixedWidthStringTypeNames(): readonly string[] {
        return this.Types.FixedWidthStringTypeNames;
    }

    /**
     * Maximum string length usable in an INDEX KEY column (PRIMARY KEY / UNIQUE constraint) on this
     * dialect. A PK string column wider than this can't be indexed, so callers (e.g. the integration
     * schema builder) cap PK string columns at this value. Default: no practical declare-time cap — a
     * dialect overrides it where one exists. SQL Server's 900-byte index-key limit = 450 NVARCHAR chars;
     * PostgreSQL enforces its (larger) btree limit on the stored value at write time, not the declared
     * length, so it keeps the no-cap default.
     */
    get MaxKeyStringLength(): number {
        return this.DDL.MaxKeyStringLength;
    }

    /**
     * Maximum bytes that can be stored in-row for a single row, or `null` when the dialect has no
     * in-row size limit. SQL Server enforces a hard ~8060-byte in-row limit; PostgreSQL has none
     * (TOAST stores oversized variable-length values out-of-line). Consumed by schema materialization
     * to avoid emitting a table whose minimum in-row footprint can never satisfy an INSERT.
     * Default: `null` (no in-row size limit).
     */
    get MaxInRowSizeBytes(): number | null {
        return this.DDL.MaxInRowSizeBytes;
    }

    /**
     * Hard maximum number of columns per table, or `null` when effectively unbounded for our purposes.
     * SQL Server: 1024. PostgreSQL: 1600. Default: `null`.
     */
    get MaxColumnCount(): number | null {
        return this.DDL.MaxColumnCount;
    }

    /**
     * Minimum in-row byte footprint of a column of the given raw SQL type. Off-row-capable
     * variable-length / LOB types contribute only their in-row pointer; fixed-length types contribute
     * their full size. Only meaningful for dialects that report a {@link MaxInRowSizeBytes}.
     * Default: 24 (a conservative off-row-pointer floor).
     */
    EstimateInRowBytes(rawSqlType: string): number {
        return this.DDL.EstimateInRowBytes(rawSqlType);
    }

    /** SQL type names this dialect uses for date / time / timestamp columns. */
    get DateTypeNames(): readonly string[] {
        return this.Types.DateTypeNames;
    }

    /** SQL type names this dialect uses for integer columns (int, bigint, smallint, …). */
    get IntegerTypeNames(): readonly string[] {
        return this.Types.IntegerTypeNames;
    }

    /** SQL type names this dialect uses for floating-point / decimal columns. */
    get FloatTypeNames(): readonly string[] {
        return this.Types.FloatTypeNames;
    }

    /** SQL type names this dialect uses for UUID / uniqueidentifier columns. */
    get UuidTypeNames(): readonly string[] {
        return this.Types.UuidTypeNames;
    }

    /** SQL type names this dialect uses for binary blob columns (image, bytea, varbinary). */
    get BinaryTypeNames(): readonly string[] {
        return this.Types.BinaryTypeNames;
    }

    /** SQL type names this dialect uses for JSON / XML structured columns. */
    get JsonTypeNames(): readonly string[] {
        return this.Types.JsonTypeNames;
    }

    /** SQL type names this dialect uses for fixed-precision currency columns. */
    get CurrencyTypeNames(): readonly string[] {
        return this.Types.CurrencyTypeNames;
    }

    /** SQL type names this dialect uses for interval / duration columns. */
    get IntervalTypeNames(): readonly string[] {
        return this.Types.IntervalTypeNames;
    }

    /** SQL type names this dialect uses for network address columns (inet, cidr, …). */
    get NetworkTypeNames(): readonly string[] {
        return this.Types.NetworkTypeNames;
    }

    /**
     * Returns a new UUID generation expression.
     * SQL Server: NEWID(), PostgreSQL: gen_random_uuid()
     */
    NewUUID(): string {
        return this.DDL.NewUUID();
    }

    /**
     * Returns the platform's n-ary null-coalescing expression. SQL Server and
     * PostgreSQL both spell this `COALESCE(...)`; the dialect's writer owns
     * the spelling.
     */
    Coalesce(expr: string, fallback: string): string {
        return this.Writer.Coalesce(expr, fallback);
    }

    /**
     * Returns the dialect's literal representation of NULL as it would
     * appear in generated SQL (e.g. as the result of a default-value
     * formatter). Both SQL Server and PostgreSQL use the bare keyword
     * `NULL`, but a future dialect could differ — codegen comparisons
     * should route through this rather than hard-coding the string.
     */
    get NullLiteral(): string {
        return this.Writer.NullLiteral;
    }

    /**
     * Returns true if `value` is the dialect's representation of a NULL
     * literal in generated SQL. Comparison is case-insensitive after
     * trimming whitespace. Subclasses may override if a dialect uses a
     * non-keyword form (none currently do).
     */
    IsNullLiteral(value: string): boolean {
        if (value == null) return false;
        return value.trim().toUpperCase() === this.NullLiteral.toUpperCase();
    }

    /**
     * Returns the parameter-reference syntax used by this dialect's
     * stored-procedure / function bodies.
     * SQL Server: `@MyName`, PostgreSQL functions: `p_my_name`.
     * Codegen should call this rather than hard-coding `'@' + name`.
     */
    ParameterRef(name: string): string {
        return this.DDL.ParameterRef(name);
    }

    /**
     * Returns the default-value clause appended to a parameter declaration.
     * SQL Server: ` = NULL` (or ` = 0`, etc.), PostgreSQL: ` DEFAULT NULL`.
     * `value` should be a SQL literal already formatted by the caller (e.g.
     * the dialect's NullLiteral, a quoted string, a numeric literal).
     */
    ParameterDefault(value: string): string {
        return this.DDL.ParameterDefault(value);
    }

    /**
     * Returns a CAST-to-text expression.
     * SQL Server: CAST(expr AS NVARCHAR(MAX)), PostgreSQL: CAST(expr AS TEXT)
     */
    CastToText(expr: string): string {
        return this.Writer.CastToText(expr);
    }

    /**
     * Returns a CAST to a bounded-width string type. Used when the result
     * needs to be comparable against an indexed column (SQL Server cannot
     * compare/index `NVARCHAR(MAX)`) or against a fixed-width text column
     * such as MJ's `RecordID` (NVARCHAR(450) on SQL Server).
     *
     * Implemented by composing `ResolveAbstractType({ type: 'string', maxLength })`,
     * which dialects already supply — SQL Server emits `NVARCHAR(N)` and
     * PostgreSQL emits `VARCHAR(N)`. Defaults to MJ's standard 450-char
     * width to match the cap on indexable string columns in SQL Server.
     */
    CastToBoundedString(expr: string, maxLength: number = 450): string {
        return this.DDL.CastToBoundedString(expr, maxLength);
    }

    /**
     * Returns a CAST-to-UUID expression.
     * SQL Server: CAST(expr AS UNIQUEIDENTIFIER), PostgreSQL: CAST(expr AS UUID)
     */
    CastToUUID(expr: string): string {
        return this.DDL.CastToUUID(expr);
    }

    /**
     * Returns the empty-GUID sentinel literal
     * (`00000000-0000-0000-0000-000000000000`) formatted for use in a
     * CASE-comparison expression. The base class returns the literal as a
     * plain quoted string — SQL Server's implicit conversion accepts that
     * directly. Dialects with strict typing (PostgreSQL) override to add
     * the explicit cast their grammar requires.
     */
    EmptyUUIDLiteral(): string {
        return this.DDL.EmptyUUIDLiteral();
    }

    // ─── INSERT/UPDATE Return Patterns ───────────────────────────────

    /**
     * Returns the clause used to get inserted values back.
     * SQL Server: OUTPUT INSERTED.col1, INSERTED.col2
     * PostgreSQL: RETURNING col1, col2
     */
    ReturnInsertedClause(columns?: string[]): string {
        return this.DDL.ReturnInsertedClause(columns);
    }

    /**
     * Returns the auto-increment PK expression for DDL.
     * SQL Server: IDENTITY(1,1), PostgreSQL: GENERATED ALWAYS AS IDENTITY
     */
    AutoIncrementPKExpression(): string {
        return this.DDL.AutoIncrementPKExpression();
    }

    /**
     * Returns the default expression for a UUID primary key.
     * SQL Server: NEWSEQUENTIALID(), PostgreSQL: gen_random_uuid()
     */
    UUIDPKDefault(): string {
        return this.DDL.UUIDPKDefault();
    }

    /**
     * Returns the expression to get the last inserted identity value.
     * SQL Server: SCOPE_IDENTITY(), PostgreSQL: lastval()
     */
    ScopeIdentityExpression(): string {
        return this.DDL.ScopeIdentityExpression();
    }

    /**
     * Returns the row count variable/expression for the last statement.
     * SQL Server: @@ROWCOUNT, PostgreSQL: (via GET DIAGNOSTICS or FOUND)
     */
    RowCountExpression(): string {
        return this.DDL.RowCountExpression();
    }

    // ─── Batch & DDL Control ─────────────────────────────────────────

    /**
     * Returns the batch separator for the platform.
     * SQL Server: "GO", PostgreSQL: "" (none needed)
     */
    BatchSeparator(): string {
        return this.DDL.BatchSeparator();
    }

    /**
     * Splits an oversized SQL batch into individual statements on `;`+EOL
     * boundaries so a caller (e.g. the RSU migration executor) can re-group
     * them into smaller chunks that each fit under a client request timeout.
     *
     * Base implementation = the naive `split(/;\s*\n/g)` semantics: split on a
     * `;` followed by optional inline whitespace and a newline, trim each
     * fragment, drop empties, and ensure each returned statement ends with `;`.
     * This is correct for SQL Server (no dollar-quoted blocks).
     *
     * PostgreSQL overrides this with a dollar-quote-aware split that never
     * tears apart `DO $$ … $$` / `$tag$ … $tag$` blocks whose bodies
     * legitimately contain `;`+newline.
     */
    SplitStatements(batch: string): string[] {
        return this.DDL.SplitStatements(batch);
    }

    /**
     * Returns SQL to check if a database object exists.
     * @param objectType - "TABLE", "VIEW", "FUNCTION", "PROCEDURE", "TRIGGER"
     * @param schema - Schema name
     * @param name - Object name
     */
    ExistenceCheckSQL(objectType: string, schema: string, name: string): string {
        return this.DDL.ExistenceCheckSQL(objectType, schema, name);
    }

    /**
     * Whether the platform supports CREATE OR REPLACE for a given object type.
     * PostgreSQL supports it for FUNCTION, VIEW. SQL Server does not.
     */
    CreateOrReplaceSupported(objectType: string): boolean {
        return this.DDL.CreateOrReplaceSupported(objectType);
    }

    // ─── Full-Text Search ────────────────────────────────────────────

    /**
     * Returns a full-text search predicate expression.
     * SQL Server: CONTAINS(column, searchTerm)
     * PostgreSQL: column @@ plainto_tsquery('english', searchTerm)
     */
    FullTextSearchPredicate(column: string, searchTerm: string): string {
        return this.DDL.FullTextSearchPredicate(column, searchTerm);
    }

    /**
     * Returns DDL to create a full-text index.
     * SQL Server: FULLTEXT CATALOG + FULLTEXT INDEX
     * PostgreSQL: tsvector column + GIN index
     */
    FullTextIndexDDL(table: string, columns: string[], catalog?: string): string {
        return this.DDL.FullTextIndexDDL(table, columns, catalog);
    }

    // ─── CTE / Recursion ─────────────────────────────────────────────

    /**
     * Returns the recursive CTE syntax keyword.
     * SQL Server: "WITH", PostgreSQL: "WITH RECURSIVE"
     */
    RecursiveCTESyntax(): string {
        const keyword = this.Grammar.RecursiveKeyword;
        return keyword === null ? 'WITH' : `WITH ${keyword}`;
    }

    /**
     * Whether the platform allows ORDER BY inside CTE definitions without
     * TOP, OFFSET, or FOR XML.
     * SQL Server: false (ORDER BY in CTEs is illegal without TOP/OFFSET/FOR XML)
     * PostgreSQL: true (ORDER BY in CTEs is always legal)
     */
    get AllowsOrderByInCTE(): boolean {
        return this.Grammar.AllowsOrderByInCTE;
    }

    /**
     * Default ORDER BY expression for paging when no user-specified ORDER BY exists.
     * SQL Server: '(SELECT NULL)', PostgreSQL: '1'
     */
    get DefaultPagingOrderBy(): string {
        return this.Grammar.DefaultPagingOrderBy;
    }

    /**
     * The ORDER BY expression for paging a set operation (`UNION` / `INTERSECT` / `EXCEPT`) or a
     * `SELECT DISTINCT` that has no ORDER BY of its own, on a platform that only accepts select-list
     * items there. `null` when {@link DefaultPagingOrderBy} is accepted for those shapes too.
     * SQL Server: '1' (the first column), PostgreSQL: null
     */
    get SelectListPagingOrderBy(): string | null {
        return this.Grammar.SelectListPagingOrderBy;
    }

    /**
     * Whether skipping rows for a page needs an ORDER BY (`OFFSET … FETCH` does on SQL Server).
     * When true, a page taken from a derived table is ordered by {@link DefaultPagingOrderBy}.
     * SQL Server: true, PostgreSQL: false
     */
    get PagingRequiresOrderBy(): boolean {
        return this.Grammar.PagingRequiresOrderBy;
    }

    /** {@inheritDoc SQLParserDialect.SupportsEscapeStringLiterals} */
    get SupportsEscapeStringLiterals(): boolean {
        return this.Lexical.StringLiterals.some(form => form.BackslashEscape && form.Prefixes.some(prefix => prefix.toUpperCase() === 'E'));
    }

    /** {@inheritDoc SQLParserDialect.SupportsDollarQuotedStrings} */
    get SupportsDollarQuotedStrings(): boolean {
        return this.Lexical.DollarQuotedStrings !== 'none';
    }

    /** {@inheritDoc SQLParserDialect.QueryHintKeyword} */
    get QueryHintKeyword(): string | null {
        return this.Grammar.QueryHintKeyword;
    }

    /** {@inheritDoc SQLParserDialect.CallerSQLForbiddenFunctions} */
    get CallerSQLForbiddenFunctions(): readonly string[] {
        return this.Grammar.CallerSQLForbiddenFunctions;
    }

    // ─── Data Types ──────────────────────────────────────────────────

    /**
     * Returns the data type mapping for this dialect.
     */
    get TypeMap(): DataTypeMap {
        return this.DDL.TypeMap;
    }

    /**
     * Convenience: maps a SQL Server type to this dialect's equivalent.
     */
    MapDataType(sqlServerType: string, length?: number, precision?: number, scale?: number): MappedType {
        return this.TypeMap.MapType(sqlServerType, length, precision, scale);
    }

    /**
     * Convenience: maps a SQL Server type to a full type string.
     */
    MapDataTypeToString(sqlServerType: string, length?: number, precision?: number, scale?: number): string {
        return this.TypeMap.MapTypeToString(sqlServerType, length, precision, scale);
    }

    // ─── Parameters ──────────────────────────────────────────────────

    /**
     * Returns a parameter placeholder for the given index.
     * SQL Server: @p0, @p1, ... PostgreSQL: $1, $2, ...
     */
    ParameterPlaceholder(index: number): string {
        return this.Binding.ParameterPlaceholder(index);
    }

    /**
     * Returns the string concatenation operator.
     * SQL Server: "+", PostgreSQL: "||"
     */
    ConcatOperator(): string {
        const operator = this.Writer.ConcatOperator();
        if (operator === null) {
            throw new Error(`The ${this.PlatformKey} dialect has no string concatenation operator.`);
        }
        return operator;
    }

    // ─── String Functions ────────────────────────────────────────────

    /**
     * Returns a STRING_SPLIT or equivalent expression.
     * SQL Server: STRING_SPLIT(value, delimiter)
     * PostgreSQL: string_to_array(value, delimiter) or regexp_split_to_table
     */
    StringSplitFunction(value: string, delimiter: string): string {
        return this.DDL.StringSplitFunction(value, delimiter);
    }

    /**
     * Returns a JSON value extraction expression.
     * SQL Server: JSON_VALUE(column, path)
     * PostgreSQL: column->>'path' or jsonb_extract_path_text
     */
    JsonExtract(column: string, path: string): string {
        return this.Writer.JsonExtract(column, path);
    }

    // ─── Migration Emission ──────────────────────────────────────────

    /**
     * Splits `${...}` inside SQL string literals so Flyway doesn't treat
     * them as placeholders. Each `${name}` becomes a concat-split that
     * round-trips back to `${name}` at execution but contains no adjacent
     * `${` in the file text. Form is platform-specific (concat operator,
     * truncation rules) — see each dialect's implementation.
     */
    EscapeFlywayStringInterpolation(sql: string): string {
        return this.DDL.EscapeFlywayStringInterpolation(sql);
    }

    // ─── Procedure / Function Calls ──────────────────────────────────

    /**
     * Returns the SQL syntax for calling a stored procedure or function.
     * SQL Server: EXEC [schema].[name] @p0, @p1
     * PostgreSQL: SELECT * FROM schema.name($1, $2)
     */
    ProcedureCallSyntax(schema: string, name: string, params: string[]): string {
        return this.DDL.ProcedureCallSyntax(schema, name, params);
    }

    // ─── DDL Generation (Schema/Table) ──────────────────────────────

    /**
     * Returns CREATE SCHEMA IF NOT EXISTS SQL.
     * SQL Server: IF NOT EXISTS (...) EXEC('CREATE SCHEMA [name]'); GO
     * PostgreSQL: CREATE SCHEMA IF NOT EXISTS "name";
     */
    CreateSchemaDDL(schemaName: string): string {
        return this.DDL.CreateSchemaDDL(schemaName);
    }

    /**
     * Cap a column type if it cannot be used in a UNIQUE/index constraint.
     * SQL Server: NVARCHAR(MAX) → NVARCHAR(450) (MAX columns cannot be indexed).
     * PostgreSQL: no-op (TEXT can be indexed).
     * Override in platform-specific dialects.
     */
    CapIndexableType(rawSqlType: string): string {
        return this.DDL.CapIndexableType(rawSqlType);
    }

    /**
     * Returns the ADD COLUMN clause for ALTER TABLE.
     * SQL Server: ADD [colName] type NULL DEFAULT ...
     * PostgreSQL: ADD COLUMN "colName" type NULL DEFAULT ...
     */
    AddColumnClause(col: ColumnDDLOptions): string {
        return this.DDL.AddColumnClause(col);
    }

    /**
     * Returns ALTER COLUMN clause(s) for type/nullability changes.
     * SQL Server: ALTER TABLE t ALTER COLUMN [col] newType NULL/NOT NULL;
     * PostgreSQL: ALTER TABLE t ALTER COLUMN "col" TYPE newType, ALTER COLUMN "col" SET/DROP NOT NULL;
     */
    AlterColumnDDL(quotedTable: string, options: AlterColumnOptions): string {
        return this.DDL.AlterColumnDDL(quotedTable, options);
    }

    /**
     * Returns description metadata SQL for a column.
     * SQL Server: EXEC sp_addextendedproperty with @level2type = 'COLUMN'
     * PostgreSQL: COMMENT ON COLUMN schema."table"."column" IS '...';
     *
     * This extends CommentOnObject to support the 3-part column reference
     * that CommentOnObject doesn't handle.
     */
    CommentOnColumn(schema: string, table: string, column: string, comment: string): string {
        return this.DDL.CommentOnColumn(schema, table, column, comment);
    }

    /**
     * Returns the platform's fallback type for unknown/unmapped abstract types.
     * SQL Server: NVARCHAR(MAX)
     * PostgreSQL: TEXT
     */
    FallbackType(): string {
        return this.DDL.FallbackType();
    }

    /**
     * Resolves an abstract schema field type to a concrete SQL type string.
     * Used by SchemaEngine for DDL generation from platform-agnostic definitions.
     * SQL Server: 'string' -> 'NVARCHAR(255)', 'boolean' -> 'BIT'
     * PostgreSQL: 'string' -> 'VARCHAR(255)', 'boolean' -> 'BOOLEAN'
     */
    ResolveAbstractType(options: ResolveTypeOptions): string {
        return this.DDL.ResolveAbstractType(options);
    }

    // ─── DDL Generation (Conditional/Procedural) ────────────────────

    /**
     * Returns a date/time arithmetic expression.
     * SQL Server: DATEADD(MINUTE, 30, GETUTCDATE())
     * PostgreSQL: (NOW() AT TIME ZONE 'UTC') + INTERVAL '30 minutes'
     *
     * @param unit - Time unit
     * @param amount - Number of units to add (can be negative)
     * @param baseExpr - Base timestamp expression (e.g., from CurrentTimestampUTC())
     */
    DateAddExpression(unit: DateAddUnit, amount: number, baseExpr: string): string {
        return this.Writer.DateAddExpression(unit, amount, baseExpr);
    }

    /**
     * Returns a full CREATE TABLE wrapped in a "create if not exists" guard.
     * SQL Server: IF NOT EXISTS (sys.tables check) BEGIN CREATE TABLE ... END;
     * PostgreSQL: CREATE TABLE IF NOT EXISTS ...;
     *
     * @param schema - Schema name
     * @param tableName - Table name
     * @param columnsDDL - The column definitions (everything between the parentheses)
     */
    CreateTableIfNotExistsDDL(schema: string, tableName: string, columnsDDL: string): string {
        return this.DDL.CreateTableIfNotExistsDDL(schema, tableName, columnsDDL);
    }

    /**
     * Returns a conditional IF/ELSE block in platform-appropriate procedural SQL.
     * SQL Server: IF (condition) BEGIN thenSQL END ELSE BEGIN elseSQL END
     * PostgreSQL: DO $$ BEGIN IF condition THEN thenSQL; ELSE elseSQL; END IF; END $$;
     *
     * @param condition - SQL boolean condition
     * @param thenSQL - SQL to execute when condition is true
     * @param elseSQL - Optional SQL to execute when condition is false
     */
    ConditionalBlock(condition: string, thenSQL: string, elseSQL?: string): string {
        return this.DDL.ConditionalBlock(condition, thenSQL, elseSQL);
    }

    /**
     * Returns a non-fatal signal/notice statement detectable in CLI output.
     * Used for signaling conditions (e.g., "lock held") without aborting the script.
     * SQL Server: RAISERROR('message', 16, 1) — appears in sqlcmd stdout
     * PostgreSQL: RAISE NOTICE 'message' — appears in psql stderr
     *
     * Note: For PostgreSQL, this must be used inside a ConditionalBlock (DO $$ context).
     *
     * @param message - Signal message to emit (used for detection in CLI output)
     */
    RaiseSignalSQL(message: string): string {
        return this.DDL.RaiseSignalSQL(message);
    }

    // ─── DDL Generation (Triggers/Indexes) ──────────────────────────

    /**
     * Generates trigger DDL for the platform.
     */
    TriggerDDL(options: TriggerOptions): string {
        return this.DDL.TriggerDDL(options);
    }

    /**
     * Generates index DDL for the platform.
     */
    IndexDDL(options: IndexOptions): string {
        return this.DDL.IndexDDL(options);
    }

    // ─── Permissions ─────────────────────────────────────────────────

    /**
     * Returns a GRANT statement for the platform.
     */
    GrantPermission(permission: string, objectType: string, schema: string, object: string, role: string): string {
        return this.DDL.GrantPermission(permission, objectType, schema, object, role);
    }

    /**
     * Returns a COMMENT ON statement (PostgreSQL) or sp_addextendedproperty (SQL Server).
     */
    CommentOnObject(objectType: string, schema: string, name: string, comment: string): string {
        return this.DDL.CommentOnObject(objectType, schema, name, comment);
    }

    // ─── DDL Generation (Idempotent, single-statement) ──────────────
    //
    // "Create only if absent" variants that are SAFE for callers which split a migration
    // into statements on ';' boundaries (e.g. the RSU migration executor chunks oversized
    // batches that way). Unlike CreateTableIfNotExistsDDL — which wraps the CREATE in a
    // BEGIN...END block that such chunking would tear apart — each method below returns a
    // SINGLE statement. Defaults are idempotent-friendly; SQL Server overrides where its
    // syntax differs. External dialects inherit working defaults (non-breaking).

    /**
     * A full CREATE TABLE that runs only if the table is absent, as a SINGLE statement.
     * Default (PostgreSQL et al.): `CREATE TABLE IF NOT EXISTS <fullTable> (...);`
     * SQL Server overrides with an `IF OBJECT_ID(...) IS NULL` guard (it has no native
     * CREATE TABLE IF NOT EXISTS).
     * @param fullTable - Already-quoted `schema.table` identifier
     * @param columnsBody - The column/constraint lines that go between the parentheses
     */
    CreateTableIfAbsent(fullTable: string, columnsBody: string): string {
        return this.DDL.CreateTableIfAbsent(fullTable, columnsBody);
    }

    /**
     * CommentOnObject that is safe to re-run (no error if the description already exists).
     * Default returns the standard statement terminated with ';' — adequate where the
     * comment statement is inherently idempotent (PostgreSQL COMMENT ON replaces in place).
     * SQL Server overrides to guard sp_addextendedproperty with a fn_listextendedproperty check.
     */
    CommentOnObjectIfAbsent(objectType: string, schema: string, name: string, comment: string): string {
        return this.DDL.CommentOnObjectIfAbsent(objectType, schema, name, comment);
    }

    /**
     * CommentOnColumn that is safe to re-run. Default returns the standard statement
     * (PostgreSQL COMMENT ON COLUMN already includes its terminator and is idempotent).
     * SQL Server overrides to guard sp_addextendedproperty.
     */
    CommentOnColumnIfAbsent(schema: string, table: string, column: string, comment: string): string {
        return this.DDL.CommentOnColumnIfAbsent(schema, table, column, comment);
    }

    // ─── Schema Introspection ────────────────────────────────────────

    /**
     * Returns platform-specific schema introspection queries.
     */
    SchemaIntrospectionQueries(): SchemaIntrospectionSQL {
        return this.DDL.SchemaIntrospectionQueries();
    }

    /**
     * Returns a ready-to-run (no bind parameters) query that enumerates the foreign-key graph
     * of a single schema, for FK-cascade planning (e.g. Open-App metadata teardown).
     *
     * Unlike {@link SchemaIntrospectionQueries}.`listForeignKeys` (a placeholder template), this
     * embeds the schema literal directly (via {@link QuoteStringLiteral}) so it can be executed
     * with `ExecuteSQL(sql)` on any provider without a dialect-specific bind convention. It also
     * returns two extra columns the cascade planner needs:
     *
     * - `childNullable` — whether the referencing (child) column allows NULL, which decides
     *   `UPDATE … SET NULL` (nullable) vs. `DELETE` + recurse (NOT NULL).
     * - `colCount` — the number of columns in the FK constraint, so a caller can exclude
     *   composite FKs (`colCount > 1`).
     *
     * Every row is one FK column. Column aliases are IDENTICAL across dialects:
     * `parentTable, parentRefCol, childTable, childCol, childNullable, fkName, colCount`
     * (both the referenced/parent and referencing/child tables are within `schema`).
     *
     * @param schema the schema whose intra-schema FK edges to enumerate (e.g. `__mj`)
     */
    ForeignKeyGraphSQL(schema: string): string {
        return this.DDL.ForeignKeyGraphSQL(schema);
    }

    /**
     * Wraps a list of statements in ONE all-or-nothing transaction batch for this platform, ready to
     * run as a single `ExecuteSQL(script)` call. Owns the platform-specific session/transaction setup
     * so callers don't sniff `PlatformKey` themselves:
     *
     * - **SQL Server**: `SET QUOTED_IDENTIFIER ON` / `SET ANSI_NULLS ON` (required for UPDATE/DELETE
     *   against tables with filtered / computed-column indexes or indexed views — Msg 1934 otherwise)
     *   + `SET XACT_ABORT ON` (any failure rolls the whole batch back) + `BEGIN/COMMIT TRANSACTION`.
     * - **PostgreSQL**: plain `BEGIN … COMMIT` — no session pragmas (`QUOTED_IDENTIFIER`/`ANSI_NULLS`
     *   are SQL-Server concepts) and PostgreSQL already aborts the whole transaction on any error.
     *
     * Returns an empty string for an empty statement list (nothing to run).
     *
     * @param statements individual SQL statements (each WITHOUT a trailing `;`)
     */
    AtomicBatchScript(statements: string[]): string {
        return this.DDL.AtomicBatchScript(statements);
    }

    // ─── Null Handling ───────────────────────────────────────────────

    /**
     * Returns the platform's two-argument null-coalescing expression.
     * SQL Server: `ISNULL(expr, fallback)`, PostgreSQL: `COALESCE(expr, fallback)`.
     * The dialect's writer declares the keyword.
     */
    IsNull(expr: string, fallback: string): string {
        return this.Writer.IsNull(expr, fallback);
    }

    // ─── Error Classification ───────────────────────────────────────

    /**
     * Returns true if the given error represents an infrastructure-level
     * connection failure (timeout, refused, pool closed, etc.) as opposed to
     * a query-level error (bad SQL, constraint violation).
     *
     * Each dialect implements this using its driver's structured error types:
     * - SQL Server (mssql): `error.name === 'ConnectionError'`
     * - PostgreSQL (pg): Node.js network error codes on plain `Error`
     *
     * Used by GenericDatabaseProvider to re-throw connection errors from
     * RunView/RunQuery instead of swallowing them into `{ Success: false }`.
     */
    IsConnectionError(e: unknown): boolean {
        return this.Binding.IsConnectionError(e);
    }

    /**
     * Returns an IIF/CASE equivalent expression.
     * SQL Server: IIF(condition, trueVal, falseVal)
     * PostgreSQL: CASE WHEN condition THEN trueVal ELSE falseVal END
     */
    IIF(condition: string, trueVal: string, falseVal: string): string {
        return this.Writer.IIF(condition, trueVal, falseVal);
    }

    // ─── Nested transactions (savepoints) ────────────────────────────

    /**
     * SQL that marks a nested transaction savepoint. SQL Server:
     * `SAVE TRANSACTION name`. PostgreSQL: `SAVEPOINT name`.
     */
    CreateSavepointSQL(name: string): string {
        return this.DDL.CreateSavepointSQL(name);
    }

    /**
     * SQL that discards a savepoint after a nested commit, or `null` when the
     * platform has no release (SQL Server savepoints live until the outer TX
     * ends). PostgreSQL: `RELEASE SAVEPOINT name`.
     */
    ReleaseSavepointSQL(name: string): string | null {
        return this.DDL.ReleaseSavepointSQL(name);
    }

    /**
     * SQL that undoes work after a savepoint. SQL Server:
     * `ROLLBACK TRANSACTION name`. PostgreSQL: `ROLLBACK TO SAVEPOINT name`.
     */
    RollbackToSavepointSQL(name: string): string {
        return this.DDL.RollbackToSavepointSQL(name);
    }
}
