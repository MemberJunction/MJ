import { DataTypeMap, MappedType } from './dataTypeMap.js';

/**
 * Supported database platforms.
 * Extensible — add new platforms as support is implemented.
 */
export type DatabasePlatform = 'sqlserver' | 'postgresql';

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
 * Abstract base class for SQL dialect implementations.
 *
 * Encapsulates ALL database-specific SQL syntax patterns into a single,
 * testable abstraction. This is a pure string/logic layer with zero
 * database driver dependencies.
 */
export abstract class SQLDialect {
    /**
     * The platform key identifying this dialect.
     */
    abstract get PlatformKey(): DatabasePlatform;

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
     * Returns the current UTC timestamp expression.
     * SQL Server: GETUTCDATE(), PostgreSQL: NOW() AT TIME ZONE 'UTC'
     */
    abstract CurrentTimestampUTC(): string;

    /**
     * Returns a new UUID generation expression.
     * SQL Server: NEWID(), PostgreSQL: gen_random_uuid()
     */
    abstract NewUUID(): string;

    /**
     * Returns the COALESCE expression wrapper.
     */
    Coalesce(expr: string, fallback: string): string {
        return `COALESCE(${expr}, ${fallback})`;
    }

    /**
     * Returns a CAST-to-text expression.
     * SQL Server: CAST(expr AS NVARCHAR(MAX)), PostgreSQL: CAST(expr AS TEXT)
     */
    abstract CastToText(expr: string): string;

    /**
     * Returns a CAST-to-UUID expression.
     * SQL Server: CAST(expr AS UNIQUEIDENTIFIER), PostgreSQL: CAST(expr AS UUID)
     */
    abstract CastToUUID(expr: string): string;

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

    // ─── DDL Generation ──────────────────────────────────────────────

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
     * Returns the platform's ISNULL/COALESCE equivalent.
     * SQL Server: ISNULL(expr, fallback), PostgreSQL: COALESCE(expr, fallback)
     * Note: COALESCE works on both, but ISNULL is SQL Server-specific.
     */
    IsNull(expr: string, fallback: string): string {
        return this.Coalesce(expr, fallback);
    }

    /**
     * Returns an IIF/CASE equivalent expression.
     * SQL Server: IIF(condition, trueVal, falseVal)
     * PostgreSQL: CASE WHEN condition THEN trueVal ELSE falseVal END
     */
    abstract IIF(condition: string, trueVal: string, falseVal: string): string;
}
