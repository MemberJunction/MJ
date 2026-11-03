import type { DataTypeMap } from '../dataTypeMap.js';

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
 * Everything a dialect needs to run MJ itself on the database: DDL, stored-procedure syntax,
 * migration and batch control, schema introspection, transactions and the platform functions
 * CodeGen emits. Only a full {@link SQLDialect} has one; a query-only dialect does not.
 */
export interface DialectSchemaDDL {
    /** Canonicalizes a schema name to the form the platform stores when it appears unquoted in DDL. */
    CanonicalSchemaName(name: string): string;
    /** The SQL type token for a boolean stored-procedure or function parameter. */
    BooleanParameterType(): string;
    /** The parameter-reference syntax of stored-procedure / function bodies. */
    ParameterRef(name: string): string;
    /** The default-value clause appended to a parameter declaration. */
    ParameterDefault(value: string): string;
    /** A new UUID generation expression. */
    NewUUID(): string;
    /** A CAST-to-UUID expression. */
    CastToUUID(expr: string): string;
    /** The empty-GUID sentinel literal, formatted for a CASE comparison. */
    EmptyUUIDLiteral(): string;
    /** A CAST to a bounded-width string type. */
    CastToBoundedString(expr: string, maxLength?: number): string;
    /** A string-split row source expression. */
    StringSplitFunction(value: string, delimiter: string): string;
    /** A full-text search predicate. */
    FullTextSearchPredicate(column: string, searchTerm: string): string;
    /** Wraps one DML statement so its affected-row count comes back as a one-row result set. */
    AffectedRowCountSQL(dmlStatement: string, alias: string): string;
    /** The data type mapping from SQL Server types to this platform's. */
    readonly TypeMap: DataTypeMap;
    /** Maximum string length usable in an index key column. */
    readonly MaxKeyStringLength: number;
    /** Maximum in-row bytes per row, or `null` when there is no limit. */
    readonly MaxInRowSizeBytes: number | null;
    /** Maximum columns per table, or `null` when effectively unbounded. */
    readonly MaxColumnCount: number | null;
    /** Minimum in-row byte footprint of a column of the given raw SQL type. */
    EstimateInRowBytes(rawSqlType: string): number;
    /** The clause that returns inserted values. */
    ReturnInsertedClause(columns?: string[]): string;
    /** The auto-increment primary-key expression for DDL. */
    AutoIncrementPKExpression(): string;
    /** The default expression for a UUID primary key. */
    UUIDPKDefault(): string;
    /** The expression returning the last inserted identity value. */
    ScopeIdentityExpression(): string;
    /** The row count variable or expression for the last statement. */
    RowCountExpression(): string;
    /** The batch separator. */
    BatchSeparator(): string;
    /** Splits an oversized batch into statements on `;` + end-of-line boundaries. */
    SplitStatements(batch: string): string[];
    /** SQL that checks whether a database object exists. */
    ExistenceCheckSQL(objectType: string, schema: string, name: string): string;
    /** Whether the platform supports CREATE OR REPLACE for the object type. */
    CreateOrReplaceSupported(objectType: string): boolean;
    /** DDL that creates a full-text index. */
    FullTextIndexDDL(table: string, columns: string[], catalog?: string): string;
    /** Splits `${...}` inside SQL string literals so Flyway does not treat it as a placeholder. */
    EscapeFlywayStringInterpolation(sql: string): string;
    /** The syntax for calling a stored procedure or function. */
    ProcedureCallSyntax(schema: string, name: string, params: string[]): string;
    /** CREATE SCHEMA IF NOT EXISTS. */
    CreateSchemaDDL(schemaName: string): string;
    /** Caps a column type that cannot be used in a UNIQUE or index constraint. */
    CapIndexableType(rawSqlType: string): string;
    /** The ADD COLUMN clause for ALTER TABLE. */
    AddColumnClause(col: ColumnDDLOptions): string;
    /** ALTER COLUMN clause(s) for type and nullability changes. */
    AlterColumnDDL(quotedTable: string, options: AlterColumnOptions): string;
    /** Description metadata SQL for a column. */
    CommentOnColumn(schema: string, table: string, column: string, comment: string): string;
    /** The fallback type for unknown abstract types. */
    FallbackType(): string;
    /** Resolves an abstract schema field type to a concrete SQL type. */
    ResolveAbstractType(options: ResolveTypeOptions): string;
    /** A CREATE TABLE wrapped in a create-if-not-exists guard. */
    CreateTableIfNotExistsDDL(schema: string, tableName: string, columnsDDL: string): string;
    /** A conditional IF/ELSE block in procedural SQL. */
    ConditionalBlock(condition: string, thenSQL: string, elseSQL?: string): string;
    /** A non-fatal signal statement detectable in CLI output. */
    RaiseSignalSQL(message: string): string;
    /** Trigger DDL. */
    TriggerDDL(options: TriggerOptions): string;
    /** Index DDL. */
    IndexDDL(options: IndexOptions): string;
    /** A GRANT statement. */
    GrantPermission(permission: string, objectType: string, schema: string, object: string, role: string): string;
    /** A description (comment) statement for an object. */
    CommentOnObject(objectType: string, schema: string, name: string, comment: string): string;
    /** A single-statement CREATE TABLE that runs only when the table is absent. */
    CreateTableIfAbsent(fullTable: string, columnsBody: string): string;
    /** {@link CommentOnObject} that is safe to re-run. */
    CommentOnObjectIfAbsent(objectType: string, schema: string, name: string, comment: string): string;
    /** {@link CommentOnColumn} that is safe to re-run. */
    CommentOnColumnIfAbsent(schema: string, table: string, column: string, comment: string): string;
    /** Schema introspection queries. */
    SchemaIntrospectionQueries(): SchemaIntrospectionSQL;
    /** A ready-to-run query enumerating one schema's foreign-key graph. */
    ForeignKeyGraphSQL(schema: string): string;
    /** Wraps statements in one all-or-nothing transaction batch. */
    AtomicBatchScript(statements: string[]): string;
    /** SQL that marks a savepoint. */
    CreateSavepointSQL(name: string): string;
    /** SQL that releases a savepoint, or `null` when the platform has none. */
    ReleaseSavepointSQL(name: string): string | null;
    /** SQL that rolls back to a savepoint. */
    RollbackToSavepointSQL(name: string): string;
}
