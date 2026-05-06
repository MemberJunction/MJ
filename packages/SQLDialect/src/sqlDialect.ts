import { DataTypeMap, MappedType } from './dataTypeMap.js';

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
 * Abstract field type used by SchemaEngine to describe columns
 * in a platform-agnostic way before DDL generation.
 */
export type SchemaFieldType =
    | 'string' | 'text' | 'integer' | 'bigint' | 'decimal'
    | 'boolean' | 'datetime' | 'date' | 'uuid' | 'json'
    | 'float' | 'time';

/**
 * Options for resolving an abstract schema type to a concrete SQL type.
 */
export interface ResolveTypeOptions {
    /** Abstract type (e.g., 'string', 'integer', 'boolean'). */
    type: SchemaFieldType;
    /** Max length for string types. */
    maxLength?: number;
    /** Precision for decimal types. */
    precision?: number;
    /** Scale for decimal types. */
    scale?: number;
}

/**
 * Result from limitClause() — SQL Server uses a prefix (TOP n) while
 * PostgreSQL uses a suffix (LIMIT n OFFSET m).
 */
export interface LimitClauseResult {
    /** SQL placed between SELECT and the column list (e.g., "TOP 10") */
    prefix: string;
    /** SQL placed after the ORDER BY / WHERE clause (e.g., "LIMIT 10 OFFSET 20") */
    suffix: string;
}

/**
 * Schema introspection queries for a given database platform.
 * Each dialect provides platform-specific catalog queries.
 */
export interface SchemaIntrospectionSQL {
    /** Query that returns all user tables in a schema */
    listTables: string;
    /** Query that returns all columns for a given table */
    listColumns: string;
    /** Query that returns constraints (PK, UNIQUE, CHECK) */
    listConstraints: string;
    /** Query that returns foreign key relationships */
    listForeignKeys: string;
    /** Query that returns indexes */
    listIndexes: string;
    /** Template for checking if a database object exists */
    objectExists: string;
}

/**
 * Options for generating a column definition in DDL.
 */
export interface ColumnDDLOptions {
    /** Column name (unquoted — the dialect will quote it). */
    name: string;
    /** Full SQL type string (e.g., "NVARCHAR(255)", "INTEGER", "TIMESTAMPTZ"). */
    sqlType: string;
    /** Whether the column allows NULL values. */
    nullable: boolean;
    /** Optional default value expression (e.g., "'Active'", "GETUTCDATE()"). */
    defaultValue?: string;
}

/**
 * Options for ALTER TABLE column modification.
 */
export interface AlterColumnOptions {
    /** Column name (unquoted). */
    columnName: string;
    /** New SQL type string. */
    newType: string;
    /** New nullability. */
    newNullable: boolean;
}

/**
 * Options for generating trigger DDL.
 */
export interface TriggerOptions {
    /** Schema name */
    schema: string;
    /** Table name the trigger is on */
    tableName: string;
    /** Trigger name */
    triggerName: string;
    /** Timing: BEFORE, AFTER, or INSTEAD OF */
    timing: 'BEFORE' | 'AFTER' | 'INSTEAD OF';
    /** Events that fire the trigger */
    events: ('INSERT' | 'UPDATE' | 'DELETE')[];
    /** The trigger body SQL */
    body: string;
    /** For PostgreSQL: name of the trigger function */
    functionName?: string;
    /** Whether the trigger fires FOR EACH ROW or FOR EACH STATEMENT */
    forEach?: 'ROW' | 'STATEMENT';
}

/**
 * Options for generating index DDL.
 */
export interface IndexOptions {
    /** Schema name */
    schema: string;
    /** Table name */
    tableName: string;
    /** Index name */
    indexName: string;
    /** Columns to index */
    columns: string[];
    /** Whether this is a unique index */
    unique?: boolean;
    /** Index method (btree, gin, gist, hash — PostgreSQL specific, ignored for SQL Server) */
    method?: string;
    /** WHERE clause for partial indexes (PostgreSQL only) */
    where?: string;
    /** INCLUDE columns (SQL Server covering index) */
    includeColumns?: string[];
}

/**
 * Minimal dialect interface consumed by `@memberjunction/sql-parser`.
 *
 * SQLParser needs only these properties to be dialect-aware. The full
 * {@link SQLDialect} class implements this interface plus 80+ additional
 * methods for DDL/DML generation, data type mapping, etc.
 *
 * When adding a new database platform, implement at minimum this interface
 * for parser support. Implement the full `SQLDialect` for complete MJ support.
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
}

/**
 * Abstract base class for SQL dialect implementations.
 *
 * Encapsulates ALL database-specific SQL syntax patterns into a single,
 * testable abstraction. This is a pure string/logic layer with zero
 * database driver dependencies.
 */
export abstract class SQLDialect implements SQLParserDialect {
    /**
     * The platform key identifying this dialect.
     */
    abstract get PlatformKey(): DatabasePlatform;

    /**
     * Returns the dialect name used by node-sql-parser for AST parsing.
     * SQL Server: 'TransactSQL', PostgreSQL: 'PostgresQL', etc.
     */
    abstract get ParserDialect(): string;

    // ─── Identifier Quoting ──────────────────────────────────────────

    /**
     * Quotes a database identifier (table name, column name, etc.).
     * SQL Server: [name], PostgreSQL: "name"
     */
    abstract QuoteIdentifier(name: string): string;

    /**
     * Produces a schema-qualified object reference.
     * SQL Server: [schema].[object], PostgreSQL: schema."object"
     */
    abstract QuoteSchema(schema: string, object: string): string;

    /**
     * Quotes a column alias used in `SELECT ... AS <alias>`. SQL Server is
     * case-insensitive and accepts a bare identifier; PostgreSQL folds
     * unquoted identifiers to lowercase, so we must quote the alias when the
     * caller cares about preserving case (e.g. matching a TypeScript property
     * name in the result row).
     */
    abstract QuoteColumnAlias(aliasName: string): string;

    /**
     * Quotes a value as a SQL string literal. Both SQL Server and PostgreSQL
     * use single quotes with `''` doubling to escape internal apostrophes —
     * this is concrete in the base class so callers don't reinvent the
     * `value.replace(/'/g, "''")` pattern. Subclasses may override if a
     * future dialect needs a different escape rule.
     */
    QuoteStringLiteral(value: string): string {
        return `'${value.replace(/'/g, "''")}'`;
    }

    // ─── Pagination ──────────────────────────────────────────────────

    /**
     * Returns pagination SQL fragments.
     * SQL Server uses TOP (prefix) or OFFSET/FETCH (suffix).
     * PostgreSQL uses LIMIT/OFFSET (suffix).
     */
    abstract LimitClause(limit: number, offset?: number): LimitClauseResult;

    // ─── Literals & Expressions ──────────────────────────────────────

    /**
     * Returns a boolean literal for the platform.
     * SQL Server: "1"/"0", PostgreSQL: "true"/"false"
     */
    abstract BooleanLiteral(value: boolean): string;

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
    abstract BooleanParameterType(): string;

    /**
     * Returns the current UTC timestamp expression.
     * SQL Server: GETUTCDATE(), PostgreSQL: NOW() AT TIME ZONE 'UTC'
     */
    abstract CurrentTimestampUTC(): string;

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
        return `LOWER(${expr})`;
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
    abstract get BooleanTypeNames(): readonly string[];

    /** SQL type names this dialect uses for variable-length character / text columns. */
    abstract get StringTypeNames(): readonly string[];

    /** SQL type names this dialect uses for date / time / timestamp columns. */
    abstract get DateTypeNames(): readonly string[];

    /** SQL type names this dialect uses for integer columns (int, bigint, smallint, …). */
    abstract get IntegerTypeNames(): readonly string[];

    /** SQL type names this dialect uses for floating-point / decimal columns. */
    abstract get FloatTypeNames(): readonly string[];

    /** SQL type names this dialect uses for UUID / uniqueidentifier columns. */
    abstract get UuidTypeNames(): readonly string[];

    /** SQL type names this dialect uses for binary blob columns (image, bytea, varbinary). */
    abstract get BinaryTypeNames(): readonly string[];

    /** SQL type names this dialect uses for JSON / XML structured columns. */
    abstract get JsonTypeNames(): readonly string[];

    /** SQL type names this dialect uses for fixed-precision currency columns. */
    abstract get CurrencyTypeNames(): readonly string[];

    /** SQL type names this dialect uses for interval / duration columns. */
    abstract get IntervalTypeNames(): readonly string[];

    /** SQL type names this dialect uses for network address columns (inet, cidr, …). */
    abstract get NetworkTypeNames(): readonly string[];

    /**
     * Returns a new UUID generation expression.
     * SQL Server: NEWID(), PostgreSQL: gen_random_uuid()
     */
    abstract NewUUID(): string;

    /**
     * Returns the platform's n-ary null-coalescing expression. SQL Server and
     * PostgreSQL both spell this `COALESCE(...)`, but a future dialect could
     * use a different keyword — abstract on purpose so each dialect must
     * declare its own form rather than inheriting an opinionated default.
     */
    abstract Coalesce(expr: string, fallback: string): string;

    /**
     * Returns the dialect's literal representation of NULL as it would
     * appear in generated SQL (e.g. as the result of a default-value
     * formatter). Both SQL Server and PostgreSQL use the bare keyword
     * `NULL`, but a future dialect could differ — codegen comparisons
     * should route through this rather than hard-coding the string.
     */
    get NullLiteral(): string {
        return 'NULL';
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
    abstract ParameterRef(name: string): string;

    /**
     * Returns the default-value clause appended to a parameter declaration.
     * SQL Server: ` = NULL` (or ` = 0`, etc.), PostgreSQL: ` DEFAULT NULL`.
     * `value` should be a SQL literal already formatted by the caller (e.g.
     * the dialect's NullLiteral, a quoted string, a numeric literal).
     */
    abstract ParameterDefault(value: string): string;

    /**
     * Returns a CAST-to-text expression.
     * SQL Server: CAST(expr AS NVARCHAR(MAX)), PostgreSQL: CAST(expr AS TEXT)
     */
    abstract CastToText(expr: string): string;

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
        const sqlType = this.ResolveAbstractType({ type: 'string', maxLength });
        return `CAST(${expr} AS ${sqlType})`;
    }

    /**
     * Returns a CAST-to-UUID expression.
     * SQL Server: CAST(expr AS UNIQUEIDENTIFIER), PostgreSQL: CAST(expr AS UUID)
     */
    abstract CastToUUID(expr: string): string;

    /**
     * Returns the empty-GUID sentinel literal
     * (`00000000-0000-0000-0000-000000000000`) formatted for use in a
     * CASE-comparison expression. The base class returns the literal as a
     * plain quoted string — SQL Server's implicit conversion accepts that
     * directly. Dialects with strict typing (PostgreSQL) override to add
     * the explicit cast their grammar requires.
     */
    EmptyUUIDLiteral(): string {
        return `'00000000-0000-0000-0000-000000000000'`;
    }

    // ─── INSERT/UPDATE Return Patterns ───────────────────────────────

    /**
     * Returns the clause used to get inserted values back.
     * SQL Server: OUTPUT INSERTED.col1, INSERTED.col2
     * PostgreSQL: RETURNING col1, col2
     */
    abstract ReturnInsertedClause(columns?: string[]): string;

    /**
     * Returns the auto-increment PK expression for DDL.
     * SQL Server: IDENTITY(1,1), PostgreSQL: GENERATED ALWAYS AS IDENTITY
     */
    abstract AutoIncrementPKExpression(): string;

    /**
     * Returns the default expression for a UUID primary key.
     * SQL Server: NEWSEQUENTIALID(), PostgreSQL: gen_random_uuid()
     */
    abstract UUIDPKDefault(): string;

    /**
     * Returns the expression to get the last inserted identity value.
     * SQL Server: SCOPE_IDENTITY(), PostgreSQL: lastval()
     */
    abstract ScopeIdentityExpression(): string;

    /**
     * Returns the row count variable/expression for the last statement.
     * SQL Server: @@ROWCOUNT, PostgreSQL: (via GET DIAGNOSTICS or FOUND)
     */
    abstract RowCountExpression(): string;

    // ─── Batch & DDL Control ─────────────────────────────────────────

    /**
     * Returns the batch separator for the platform.
     * SQL Server: "GO", PostgreSQL: "" (none needed)
     */
    abstract BatchSeparator(): string;

    /**
     * Returns SQL to check if a database object exists.
     * @param objectType - "TABLE", "VIEW", "FUNCTION", "PROCEDURE", "TRIGGER"
     * @param schema - Schema name
     * @param name - Object name
     */
    abstract ExistenceCheckSQL(objectType: string, schema: string, name: string): string;

    /**
     * Whether the platform supports CREATE OR REPLACE for a given object type.
     * PostgreSQL supports it for FUNCTION, VIEW. SQL Server does not.
     */
    abstract CreateOrReplaceSupported(objectType: string): boolean;

    // ─── Full-Text Search ────────────────────────────────────────────

    /**
     * Returns a full-text search predicate expression.
     * SQL Server: CONTAINS(column, searchTerm)
     * PostgreSQL: column @@ plainto_tsquery('english', searchTerm)
     */
    abstract FullTextSearchPredicate(column: string, searchTerm: string): string;

    /**
     * Returns DDL to create a full-text index.
     * SQL Server: FULLTEXT CATALOG + FULLTEXT INDEX
     * PostgreSQL: tsvector column + GIN index
     */
    abstract FullTextIndexDDL(table: string, columns: string[], catalog?: string): string;

    // ─── CTE / Recursion ─────────────────────────────────────────────

    /**
     * Returns the recursive CTE syntax keyword.
     * SQL Server: "WITH", PostgreSQL: "WITH RECURSIVE"
     */
    abstract RecursiveCTESyntax(): string;

    /**
     * Whether the platform allows ORDER BY inside CTE definitions without
     * TOP, OFFSET, or FOR XML.
     * SQL Server: false (ORDER BY in CTEs is illegal without TOP/OFFSET/FOR XML)
     * PostgreSQL: true (ORDER BY in CTEs is always legal)
     */
    abstract get AllowsOrderByInCTE(): boolean;

    /**
     * Default ORDER BY expression for paging when no user-specified ORDER BY exists.
     * SQL Server: '(SELECT NULL)', PostgreSQL: '1'
     */
    abstract get DefaultPagingOrderBy(): string;

    // ─── Data Types ──────────────────────────────────────────────────

    /**
     * Returns the data type mapping for this dialect.
     */
    abstract get TypeMap(): DataTypeMap;

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
    abstract ParameterPlaceholder(index: number): string;

    /**
     * Returns the string concatenation operator.
     * SQL Server: "+", PostgreSQL: "||"
     */
    abstract ConcatOperator(): string;

    // ─── String Functions ────────────────────────────────────────────

    /**
     * Returns a STRING_SPLIT or equivalent expression.
     * SQL Server: STRING_SPLIT(value, delimiter)
     * PostgreSQL: string_to_array(value, delimiter) or regexp_split_to_table
     */
    abstract StringSplitFunction(value: string, delimiter: string): string;

    /**
     * Returns a JSON value extraction expression.
     * SQL Server: JSON_VALUE(column, path)
     * PostgreSQL: column->>'path' or jsonb_extract_path_text
     */
    abstract JsonExtract(column: string, path: string): string;

    // ─── Procedure / Function Calls ──────────────────────────────────

    /**
     * Returns the SQL syntax for calling a stored procedure or function.
     * SQL Server: EXEC [schema].[name] @p0, @p1
     * PostgreSQL: SELECT * FROM schema.name($1, $2)
     */
    abstract ProcedureCallSyntax(schema: string, name: string, params: string[]): string;

    // ─── DDL Generation (Schema/Table) ──────────────────────────────

    /**
     * Returns CREATE SCHEMA IF NOT EXISTS SQL.
     * SQL Server: IF NOT EXISTS (...) EXEC('CREATE SCHEMA [name]'); GO
     * PostgreSQL: CREATE SCHEMA IF NOT EXISTS "name";
     */
    abstract CreateSchemaDDL(schemaName: string): string;

    /**
     * Cap a column type if it cannot be used in a UNIQUE/index constraint.
     * SQL Server: NVARCHAR(MAX) → NVARCHAR(450) (MAX columns cannot be indexed).
     * PostgreSQL: no-op (TEXT can be indexed).
     * Override in platform-specific dialects.
     */
    CapIndexableType(rawSqlType: string): string {
        return rawSqlType;
    }

    /**
     * Returns the ADD COLUMN clause for ALTER TABLE.
     * SQL Server: ADD [colName] type NULL DEFAULT ...
     * PostgreSQL: ADD COLUMN "colName" type NULL DEFAULT ...
     */
    abstract AddColumnClause(col: ColumnDDLOptions): string;

    /**
     * Returns ALTER COLUMN clause(s) for type/nullability changes.
     * SQL Server: ALTER TABLE t ALTER COLUMN [col] newType NULL/NOT NULL;
     * PostgreSQL: ALTER TABLE t ALTER COLUMN "col" TYPE newType, ALTER COLUMN "col" SET/DROP NOT NULL;
     */
    abstract AlterColumnDDL(quotedTable: string, options: AlterColumnOptions): string;

    /**
     * Returns description metadata SQL for a column.
     * SQL Server: EXEC sp_addextendedproperty with @level2type = 'COLUMN'
     * PostgreSQL: COMMENT ON COLUMN schema."table"."column" IS '...';
     *
     * This extends CommentOnObject to support the 3-part column reference
     * that CommentOnObject doesn't handle.
     */
    abstract CommentOnColumn(schema: string, table: string, column: string, comment: string): string;

    /**
     * Returns the platform's fallback type for unknown/unmapped abstract types.
     * SQL Server: NVARCHAR(MAX)
     * PostgreSQL: TEXT
     */
    abstract FallbackType(): string;

    /**
     * Resolves an abstract schema field type to a concrete SQL type string.
     * Used by SchemaEngine for DDL generation from platform-agnostic definitions.
     * SQL Server: 'string' -> 'NVARCHAR(255)', 'boolean' -> 'BIT'
     * PostgreSQL: 'string' -> 'VARCHAR(255)', 'boolean' -> 'BOOLEAN'
     */
    abstract ResolveAbstractType(options: ResolveTypeOptions): string;

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
    abstract DateAddExpression(unit: 'MINUTE' | 'HOUR' | 'DAY', amount: number, baseExpr: string): string;

    /**
     * Returns a full CREATE TABLE wrapped in a "create if not exists" guard.
     * SQL Server: IF NOT EXISTS (sys.tables check) BEGIN CREATE TABLE ... END;
     * PostgreSQL: CREATE TABLE IF NOT EXISTS ...;
     *
     * @param schema - Schema name
     * @param tableName - Table name
     * @param columnsDDL - The column definitions (everything between the parentheses)
     */
    abstract CreateTableIfNotExistsDDL(schema: string, tableName: string, columnsDDL: string): string;

    /**
     * Returns a conditional IF/ELSE block in platform-appropriate procedural SQL.
     * SQL Server: IF (condition) BEGIN thenSQL END ELSE BEGIN elseSQL END
     * PostgreSQL: DO $$ BEGIN IF condition THEN thenSQL; ELSE elseSQL; END IF; END $$;
     *
     * @param condition - SQL boolean condition
     * @param thenSQL - SQL to execute when condition is true
     * @param elseSQL - Optional SQL to execute when condition is false
     */
    abstract ConditionalBlock(condition: string, thenSQL: string, elseSQL?: string): string;

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
    abstract RaiseSignalSQL(message: string): string;

    // ─── DDL Generation (Triggers/Indexes) ──────────────────────────

    /**
     * Generates trigger DDL for the platform.
     */
    abstract TriggerDDL(options: TriggerOptions): string;

    /**
     * Generates index DDL for the platform.
     */
    abstract IndexDDL(options: IndexOptions): string;

    // ─── Permissions ─────────────────────────────────────────────────

    /**
     * Returns a GRANT statement for the platform.
     */
    abstract GrantPermission(permission: string, objectType: string, schema: string, object: string, role: string): string;

    /**
     * Returns a COMMENT ON statement (PostgreSQL) or sp_addextendedproperty (SQL Server).
     */
    abstract CommentOnObject(objectType: string, schema: string, name: string, comment: string): string;

    // ─── Schema Introspection ────────────────────────────────────────

    /**
     * Returns platform-specific schema introspection queries.
     */
    abstract SchemaIntrospectionQueries(): SchemaIntrospectionSQL;

    // ─── Null Handling ───────────────────────────────────────────────

    /**
     * Returns the platform's two-argument null-coalescing expression.
     * SQL Server: `ISNULL(expr, fallback)`, PostgreSQL: `COALESCE(expr, fallback)`.
     * Abstract because each dialect must declare its own keyword — there is no
     * safe default. A future dialect that has neither `ISNULL` nor `COALESCE`
     * would silently emit invalid SQL if this fell through to a base
     * implementation.
     */
    abstract IsNull(expr: string, fallback: string): string;

    /**
     * Returns an IIF/CASE equivalent expression.
     * SQL Server: IIF(condition, trueVal, falseVal)
     * PostgreSQL: CASE WHEN condition THEN trueVal ELSE falseVal END
     */
    abstract IIF(condition: string, trueVal: string, falseVal: string): string;
}
