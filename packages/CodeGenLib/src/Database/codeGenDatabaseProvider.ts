import { EntityInfo, EntityFieldInfo, EntityPermissionInfo } from '@memberjunction/core';
import { DatabasePlatform, SQLDialect } from '@memberjunction/sql-dialect';

// ─── CONNECTION ABSTRACTION ──────────────────────────────────────────────────

/**
 * Represents a single row from a query result.
 *
 * NOTE: This is typed as `any` for backward compatibility with the existing codebase,
 * which extensively accesses recordset rows with inline type annotations and untyped
 * property access inherited from the mssql driver's `IRecordSet<any>`. As individual
 * call sites are migrated to proper typing, this can be narrowed to
 * `Record<string, unknown>` or a generic parameter.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CodeGenQueryRow = any;

/**
 * Result from executing a SQL query through a CodeGenConnection.
 * Normalizes the result shapes from different database drivers (mssql, pg, etc.)
 * into a single interface that the orchestrator code can rely on.
 */
export interface CodeGenQueryResult {
    /** The array of rows returned by the query. Empty array if no rows. */
    recordset: CodeGenQueryRow[];
}

/**
 * A database transaction handle that supports query execution, commit, and rollback.
 * Obtained from CodeGenConnection.beginTransaction().
 */
export interface CodeGenTransaction {
    /**
     * Executes a SQL query within this transaction.
     * @param sql The SQL statement to execute.
     * @returns The query result.
     */
    query(sql: string): Promise<CodeGenQueryResult>;

    /**
     * Commits the transaction. After commit, this transaction handle must not be reused.
     */
    commit(): Promise<void>;

    /**
     * Rolls back the transaction. After rollback, this transaction handle must not be reused.
     */
    rollback(): Promise<void>;
}

/**
 * Database-agnostic connection interface for CodeGen operations.
 *
 * This interface abstracts the underlying database driver (mssql.ConnectionPool,
 * pg.Pool, etc.) so that the orchestration code in SQLCodeGenBase, ManageMetadataBase,
 * and related classes can work with any supported database platform.
 *
 * ## Usage Patterns
 *
 * **Simple query (no parameters):**
 * ```typescript
 * const result = await conn.query("SELECT ID, Name FROM MyTable WHERE Status = Active");
 * const rows = result.recordset;
 * ```
 *
 * **Parameterized query (safe from SQL injection):**
 * ```typescript
 * const result = await conn.queryWithParams(
 *     "SELECT ID FROM MyTable WHERE Name = @Name AND SchemaName = @Schema",
 *     { Name: Users, Schema: dbo }
 * );
 * ```
 *
 * **Stored procedure / function call:**
 * ```typescript
 * const result = await conn.executeStoredProcedure(
 *     "[dbo].[spCreateEntity]",
 *     { Name: NewEntity, SchemaName: dbo }
 * );
 * ```
 *
 * **Transaction:**
 * ```typescript
 * const tx = await conn.beginTransaction();
 * try {
 *     await tx.query("INSERT INTO ...");
 *     await tx.query("UPDATE ...");
 *     await tx.commit();
 * } catch (e) {
 *     await tx.rollback();
 *     throw e;
 * }
 * ```
 *
 * ## Implementations
 * - `SQLServerCodeGenConnection` wraps `mssql.ConnectionPool` (in CodeGenLib)
 * - `PostgreSQLCodeGenConnection` wraps `pg.Pool` (in PostgreSQLDataProvider)
 */
export interface CodeGenConnection {
    /**
     * Executes a SQL query without parameters.
     * @param sql The SQL statement to execute.
     * @returns The query result with a `recordset` array.
     */
    query(sql: string): Promise<CodeGenQueryResult>;

    /**
     * Executes a SQL query with named parameters.
     * Parameters are passed as key-value pairs and the implementation is responsible
     * for binding them safely (e.g., @Name for SQL Server, $1/$2 for PostgreSQL).
     *
     * For SQL Server, the parameter names in the SQL should use @-prefix notation
     * matching the keys in the params object.
     * For PostgreSQL, the implementation translates @-prefixed names to $N notation.
     *
     * @param sql The SQL statement with parameter placeholders.
     * @param params Named parameters as key-value pairs.
     * @returns The query result with a `recordset` array.
     */
    queryWithParams(sql: string, params: Record<string, unknown>): Promise<CodeGenQueryResult>;

    /**
     * Executes a stored procedure (SQL Server) or function call (PostgreSQL).
     * @param name The fully qualified routine name (e.g., "[dbo].[spCreateEntity]").
     * @param params Named parameters for the routine.
     * @returns The query result with a `recordset` array.
     */
    executeStoredProcedure(name: string, params: Record<string, unknown>): Promise<CodeGenQueryResult>;

    /**
     * Begins a new database transaction.
     * @returns A CodeGenTransaction handle for executing queries within the transaction.
     */
    beginTransaction(): Promise<CodeGenTransaction>;
}


/**
 * Union type for stored procedure / function types (Create, Update, Delete).
 */
export const CRUDType = {
    Create: 'Create',
    Update: 'Update',
    Delete: 'Delete',
} as const;
export type CRUDType = (typeof CRUDType)[keyof typeof CRUDType];

/**
 * Result from full-text search SQL generation.
 */
export interface FullTextSearchResult {
    /** The complete SQL string for creating the FTS objects */
    sql: string;
    /** The name of the generated search function */
    functionName: string;
}

/**
 * Options for generating a base view.
 */
export interface BaseViewGenerationContext {
    /** Entity to generate the view for */
    entity: EntityInfo;
    /** Related field SELECT expressions (e.g., joined name fields) */
    relatedFieldsSelect: string;
    /** JOIN clauses for related entities */
    relatedFieldsJoins: string;
    /** IS-A parent entity field SELECTs */
    parentFieldsSelect: string;
    /** IS-A parent entity JOIN clauses */
    parentJoins: string;
    /** Root ID field SELECTs (for recursive FKs) */
    rootFieldsSelect: string;
    /** Root ID JOIN clauses (for recursive FKs) */
    rootJoins: string;
}

/**
 * Options for cascade delete generation.
 */
export interface CascadeDeleteContext {
    /** The parent entity being deleted */
    parentEntity: EntityInfo;
    /** The related entity whose records must be cascaded */
    relatedEntity: EntityInfo;
    /** The FK field on the related entity pointing to the parent */
    fkField: EntityFieldInfo;
    /** The operation to perform: 'delete' cascades by deleting records, 'update' sets the FK to NULL */
    operation: 'delete' | 'update';
}

/**
 * Abstract base class for database-specific code generation providers.
 *
 * Each database platform (SQL Server, PostgreSQL, etc.) implements this class
 * to generate the appropriate DDL for views, CRUD routines, triggers, indexes,
 * full-text search, permissions, and other database objects.
 *
 * The orchestrator (SQLCodeGenBase) calls these methods to produce platform-specific
 * SQL while keeping the high-level generation logic database-agnostic.
 */
export abstract class CodeGenDatabaseProvider {
    /**
     * The SQL dialect instance for this provider.
     */
    abstract get Dialect(): SQLDialect;

    /**
     * The database platform key (e.g., 'sqlserver', 'postgresql').
     */
    abstract get PlatformKey(): DatabasePlatform;

    // ─── DROP GUARDS ─────────────────────────────────────────────────────

    /**
     * Generates a conditional DROP + CREATE guard for a database object.
     * For SQL Server: `IF OBJECT_ID(...) IS NOT NULL DROP ...`
     * For PostgreSQL: `DROP ... IF EXISTS ...` or `CREATE OR REPLACE ...`
     */
    abstract generateDropGuard(objectType: 'VIEW' | 'PROCEDURE' | 'FUNCTION' | 'TRIGGER', schema: string, name: string): string;

    // ─── BASE VIEWS ──────────────────────────────────────────────────────

    /**
     * Generates the complete base view DDL for an entity, including the DROP guard.
     * The orchestrator provides pre-computed context (related fields, joins, parent joins, etc.)
     * so the provider only needs to assemble the platform-specific SQL.
     */
    abstract generateBaseView(context: BaseViewGenerationContext): string;

    // ─── CRUD ROUTINES ───────────────────────────────────────────────────

    /**
     * Generates the CREATE stored procedure or function for an entity.
     * SQL Server: `CREATE PROCEDURE [schema].[spCreate...]`
     * PostgreSQL: `CREATE OR REPLACE FUNCTION schema.fn_create_...()`
     */
    abstract generateCRUDCreate(entity: EntityInfo): string;

    /**
     * Generates the UPDATE stored procedure or function for an entity.
     * Includes the updated-at trigger generation.
     */
    abstract generateCRUDUpdate(entity: EntityInfo): string;

    /**
     * Generates the DELETE stored procedure or function for an entity.
     * Handles both hard and soft delete types, and includes cascade delete logic.
     */
    abstract generateCRUDDelete(entity: EntityInfo, cascadeSQL: string): string;

    // ─── TRIGGERS ────────────────────────────────────────────────────────

    /**
     * Generates the __mj_UpdatedAt timestamp trigger for an entity.
     * SQL Server: single AFTER UPDATE trigger.
     * PostgreSQL: companion function + BEFORE UPDATE trigger.
     */
    abstract generateTimestampTrigger(entity: EntityInfo): string;

    // ─── INDEXES ─────────────────────────────────────────────────────────

    /**
     * Generates CREATE INDEX statements for all foreign key columns on an entity.
     * Returns an array of individual index DDL strings.
     */
    abstract generateForeignKeyIndexes(entity: EntityInfo): string[];

    // ─── FULL-TEXT SEARCH ────────────────────────────────────────────────

    /**
     * Generates full-text search infrastructure for an entity:
     * SQL Server: FULLTEXT CATALOG + INDEX + inline TVF
     * PostgreSQL: tsvector column + GIN index + trigger + search function
     */
    abstract generateFullTextSearch(entity: EntityInfo, searchFields: EntityFieldInfo[], primaryKeyIndexName: string): FullTextSearchResult;

    // ─── RECURSIVE FUNCTIONS (ROOT ID) ───────────────────────────────────

    /**
     * Generates a recursive root-ID function for a self-referencing FK field.
     * SQL Server: inline TVF with recursive CTE + OUTER APPLY in view.
     * PostgreSQL: scalar function with recursive CTE + LEFT JOIN LATERAL in view.
     */
    abstract generateRootIDFunction(entity: EntityInfo, field: EntityFieldInfo): string;

    /**
     * Generates the SELECT expression for a root ID field in a base view.
     * SQL Server: `rootFn.RootID AS [FieldRoot...]`
     * PostgreSQL: `root_fn.root_id AS "FieldRoot..."`
     */
    abstract generateRootFieldSelect(entity: EntityInfo, field: EntityFieldInfo, alias: string): string;

    /**
     * Generates the JOIN clause for a root ID function in a base view.
     * SQL Server: `OUTER APPLY [schema].[fnTable_GetRootID](t.ID) AS rootFn`
     * PostgreSQL: `LEFT JOIN LATERAL schema.fn_table_get_root_id(t."ID") AS root_fn ON true`
     */
    abstract generateRootFieldJoin(entity: EntityInfo, field: EntityFieldInfo, alias: string): string;

    // ─── PERMISSIONS ─────────────────────────────────────────────────────

    /**
     * Generates GRANT SELECT permission for a base view.
     */
    abstract generateViewPermissions(entity: EntityInfo): string;

    /**
     * Generates GRANT EXECUTE permission for a CRUD routine.
     */
    abstract generateCRUDPermissions(entity: EntityInfo, routineName: string, type: CRUDType): string;

    /**
     * Generates GRANT EXECUTE permission for a full-text search function.
     */
    abstract generateFullTextSearchPermissions(entity: EntityInfo, functionName: string): string;

    // ─── CASCADE DELETES ─────────────────────────────────────────────────

    /**
     * Generates the cascade delete/update SQL for a single related entity.
     * Called by the orchestrator for each FK relationship when CascadeDeletes is true.
     */
    abstract generateSingleCascadeOperation(context: CascadeDeleteContext): string;

    // ─── TIMESTAMP COLUMNS ───────────────────────────────────────────────

    /**
     * Generates ALTER TABLE statements to add __mj_CreatedAt and __mj_UpdatedAt columns.
     */
    abstract generateTimestampColumns(schema: string, tableName: string): string;

    // ─── PARAMETER / FIELD HELPERS ───────────────────────────────────────

    /**
     * Generates the parameter list string for a CRUD routine.
     * SQL Server: `@Name NVARCHAR(255), @Email NVARCHAR(255)`
     * PostgreSQL: `p_name VARCHAR(255), p_email VARCHAR(255)`
     */
    abstract generateCRUDParamString(entityFields: EntityFieldInfo[], isUpdate: boolean): string;

    /**
     * Generates the column-list or value-list portion of an INSERT statement.
     * When `prefix` is empty, generates column names.
     * When `prefix` is '@' (SQL Server) or 'p_' (PostgreSQL), generates parameter references.
     */
    abstract generateInsertFieldString(entity: EntityInfo, entityFields: EntityFieldInfo[], prefix: string, excludePrimaryKey?: boolean): string;

    /**
     * Generates the SET clause for an UPDATE statement.
     * SQL Server: `[Name] = @Name, [Email] = @Email`
     * PostgreSQL: `"Name" = p_name, "Email" = p_email`
     */
    abstract generateUpdateFieldString(entityFields: EntityFieldInfo[]): string;

    // ─── ROUTINE NAMING ──────────────────────────────────────────────────

    /**
     * Returns the name of the CRUD routine for an entity.
     * SQL Server: `spCreateEntityName`
     * PostgreSQL: `fn_create_entity_name`
     */
    abstract getCRUDRoutineName(entity: EntityInfo, type: CRUDType): string;

    // ─── SQL HEADERS ─────────────────────────────────────────────────────

    /**
     * Generates a comment header for a generated SQL file.
     */
    abstract generateSQLFileHeader(entity: EntityInfo, itemName: string): string;

    /**
     * Generates a comment header for the combined all-entities SQL file.
     */
    abstract generateAllEntitiesSQLFileHeader(): string;

    // ─── UTILITY ─────────────────────────────────────────────────────────

    /**
     * Formats a default value for use in generated SQL.
     * Handles SQL functions (GETUTCDATE, gen_random_uuid, etc.) and literal values.
     */
    abstract formatDefaultValue(defaultValue: string, needsQuotes: boolean): string;

    /**
     * Builds primary key variable declarations, select fields, fetch-into, and SP param strings
     * for use in cursor-based cascade operations.
     */
    abstract buildPrimaryKeyComponents(entity: EntityInfo, prefix?: string): {
        varDeclarations: string;
        selectFields: string;
        fetchInto: string;
        routineParams: string;
    };

    // ─── DATABASE INTROSPECTION ──────────────────────────────────────────

    /**
     * Returns a SQL query string to retrieve the current view definition from the database.
     * SQL Server: `SELECT OBJECT_DEFINITION(OBJECT_ID('[schema].[viewName]')) AS ViewDefinition`
     * PostgreSQL: `SELECT pg_get_viewdef('"schema"."viewName"'::regclass, true) AS "ViewDefinition"`
     *
     * The result set must include a column named `ViewDefinition`.
     */
    abstract getViewDefinitionSQL(schema: string, viewName: string): string;

    /**
     * Returns a SQL query string to retrieve the primary key index name for a table.
     * SQL Server: queries `sys.indexes` + `sys.key_constraints`
     * PostgreSQL: queries `pg_index` + `pg_class`
     *
     * The result set must include a column named `IndexName`.
     */
    abstract getPrimaryKeyIndexNameSQL(schema: string, tableName: string): string;

    /**
     * Returns a SQL query string to check if a given column is part of a composite unique constraint.
     * The query should accept the schema, table, and column name as parameters (platform-specific).
     *
     * The orchestrator checks `result.recordset.length > 0` to determine if the column
     * participates in a multi-column unique index.
     *
     * Note: Implementations should return the SQL query string. The orchestrator is responsible
     * for executing the query with proper parameterization for the target database platform.
     */
    abstract getCompositeUniqueConstraintCheckSQL(schema: string, tableName: string, columnName: string): string;

    /**
     * Returns a SQL query string to check if a foreign key index already exists.
     * Used by the orchestrator to conditionally create FK indexes.
     * SQL Server: queries `sys.indexes` with OBJECT_ID
     * PostgreSQL: queries `pg_indexes`
     *
     * The result set should return rows if the index exists (length > 0 means exists).
     */
    abstract getForeignKeyIndexExistsSQL(schema: string, tableName: string, indexName: string): string;

    /**
     * Returns the batch separator for the database platform.
     * SQL Server: 'GO'
     * PostgreSQL: '' (empty string, uses semicolons)
     */
    get BatchSeparator(): string {
        return this.Dialect.BatchSeparator();
    }

    // ─── METADATA MANAGEMENT: STORED PROCEDURE CALLS ─────────────────

    /**
     * Generates SQL to invoke a stored procedure or function.
     * SQL Server: `EXEC [schema].[spName] @Param1='val1', @Param2='val2'`
     * PostgreSQL: `SELECT * FROM schema."spName"('val1', 'val2')`
     *
     * @param schema The schema containing the routine.
     * @param routineName The routine name (e.g., `spUpdateExistingEntitiesFromSchema`).
     * @param params Ordered array of parameter values as pre-formatted SQL strings.
     *              For SQL Server these become `@ParamName='value'` pairs;
     *              for PostgreSQL they become positional arguments.
     * @param paramNames Optional parameter names for SQL Server's `@Name=value` syntax.
     *                   Ignored on PostgreSQL.
     */
    abstract callRoutineSQL(schema: string, routineName: string, params: string[], paramNames?: string[]): string;

    // ─── METADATA MANAGEMENT: CONDITIONAL INSERT ─────────────────────

    /**
     * Generates a conditional INSERT statement (insert only if not exists).
     * SQL Server: `IF NOT EXISTS (checkQuery) BEGIN insertSQL END`
     * PostgreSQL: `DO $$ BEGIN IF NOT EXISTS (checkQuery) THEN insertSQL; END IF; END $$`
     *
     * @param checkQuery The SELECT query to check for existence.
     * @param insertSQL The INSERT statement to execute if the check returns no rows.
     */
    abstract conditionalInsertSQL(checkQuery: string, insertSQL: string): string;

    /**
     * Wraps an INSERT statement with a conditional existence check at the statement level.
     * SQL Server: Adds `IF NOT EXISTS (...) BEGIN` prefix and `END` suffix.
     * PostgreSQL: Adds `ON CONFLICT DO NOTHING` suffix (no prefix needed).
     *
     * @param conflictCheckSQL The SQL Server existence check query. Ignored on PostgreSQL.
     * @returns An object with `prefix` and `suffix` strings to wrap around the INSERT.
     */
    abstract wrapInsertWithConflictGuard(conflictCheckSQL: string): { prefix: string; suffix: string };

    // ─── METADATA MANAGEMENT: DDL OPERATIONS ─────────────────────────

    /**
     * Generates ALTER TABLE ... ADD COLUMN SQL.
     * SQL Server: `ALTER TABLE [schema].[table] ADD colName TYPE [NOT] NULL [DEFAULT expr]`
     * PostgreSQL: `ALTER TABLE schema."table" ADD COLUMN "colName" TYPE [NOT] NULL [DEFAULT expr]`
     */
    abstract addColumnSQL(schema: string, tableName: string, columnName: string, dataType: string, nullable: boolean, defaultExpression?: string): string;

    /**
     * Generates ALTER TABLE ... ALTER COLUMN to change type and nullability.
     * SQL Server: `ALTER TABLE ... ALTER COLUMN col TYPE NULL|NOT NULL`
     * PostgreSQL: `ALTER TABLE ... ALTER COLUMN "col" TYPE type, ALTER COLUMN "col" SET|DROP NOT NULL`
     */
    abstract alterColumnTypeAndNullabilitySQL(schema: string, tableName: string, columnName: string, dataType: string, nullable: boolean): string;

    /**
     * Generates SQL to add a default constraint/value to a column.
     * SQL Server: `ALTER TABLE ... ADD CONSTRAINT DF_name DEFAULT expr FOR [col]`
     * PostgreSQL: `ALTER TABLE ... ALTER COLUMN "col" SET DEFAULT expr`
     */
    abstract addDefaultConstraintSQL(schema: string, tableName: string, columnName: string, defaultExpression: string): string;

    /**
     * Generates SQL to drop an existing default constraint from a column.
     * SQL Server: Dynamic lookup of constraint name from sys catalog + DROP.
     * PostgreSQL: Dynamic lookup from pg_catalog + ALTER COLUMN DROP DEFAULT.
     */
    abstract dropDefaultConstraintSQL(schema: string, tableName: string, columnName: string): string;

    /**
     * Generates a DROP statement for a database object (view/procedure/function).
     * SQL Server: `IF OBJECT_ID('...', 'P') IS NOT NULL DROP PROCEDURE ...`
     * PostgreSQL: `DROP FUNCTION IF EXISTS ... CASCADE`
     *
     * Note: This differs from `generateDropGuard()` which is used for CREATE OR REPLACE
     * patterns. This method is used for cleanup operations.
     */
    abstract dropObjectSQL(objectType: 'VIEW' | 'PROCEDURE' | 'FUNCTION', schema: string, name: string): string;

    // ─── METADATA MANAGEMENT: VIEW INTROSPECTION ─────────────────────

    /**
     * Returns SQL to check if a view exists.
     * The query uses `@ViewName` and `@SchemaName` as named parameters.
     * Returns 1 row if the view exists.
     */
    abstract getViewExistsSQL(): string;

    /**
     * Returns SQL to get column metadata for a view or table.
     * Result columns: FieldName, Type, Length, Precision, Scale, AllowsNull.
     */
    abstract getViewColumnsSQL(schema: string, viewName: string): string;

    // ─── METADATA MANAGEMENT: TYPE SYSTEM ────────────────────────────

    /**
     * Returns the native timestamp-with-timezone type name for this platform.
     * SQL Server: `DATETIMEOFFSET`
     * PostgreSQL: `TIMESTAMPTZ`
     */
    abstract get TimestampType(): string;

    /**
     * Compares two data type names, accounting for platform-specific aliases.
     * For example, PostgreSQL reports `timestamp with time zone` in information_schema
     * but DDL uses `timestamptz`.
     *
     * @param reported The type name as reported by the database catalog.
     * @param expected The expected type name (from DDL or configuration).
     * @returns True if the types are equivalent.
     */
    abstract compareDataTypes(reported: string, expected: string): boolean;

    // ─── METADATA MANAGEMENT: PLATFORM CONFIGURATION ─────────────────

    /**
     * Returns an array of system schema names that should be excluded from
     * metadata synchronization. Empty array if the platform has no system
     * schemas that need excluding.
     * SQL Server: `[]` (no system schemas need excluding)
     * PostgreSQL: `['information_schema', 'pg_catalog', 'pg_toast', ...]`
     */
    abstract getSystemSchemasToExclude(): string[];

    /**
     * Whether this platform needs explicit view refresh after schema changes.
     * SQL Server: `true` (uses `sp_refreshview`)
     * PostgreSQL: `false` (views resolve at query time)
     */
    abstract get NeedsViewRefresh(): boolean;

    /**
     * Generates SQL to refresh/recompile a view.
     * SQL Server: `EXEC sp_refreshview 'schema.viewName';`
     * PostgreSQL: returns empty string (no-op).
     */
    abstract generateViewRefreshSQL(schema: string, viewName: string): string;

    /**
     * Generates a simple test query to validate a view is functional.
     * SQL Server: `SELECT TOP 1 * FROM [schema].[viewName]`
     * PostgreSQL: `SELECT * FROM "schema"."viewName" LIMIT 1`
     */
    abstract generateViewTestQuerySQL(schema: string, viewName: string): string;

    /**
     * Whether this platform needs a post-sync fix for virtual field nullability.
     * SQL Server: `false`
     * PostgreSQL: `true` (PG view columns always report attnotnull=false)
     */
    abstract get NeedsVirtualFieldNullabilityFix(): boolean;

    // ─── METADATA MANAGEMENT: SQL QUOTING ────────────────────────────

    /**
     * Quotes mixed-case identifiers in a raw SQL string for execution.
     * SQL Server: returns the SQL unchanged (case-insensitive identifiers).
     * PostgreSQL: double-quotes PascalCase identifiers to preserve case.
     */
    abstract quoteSQLForExecution(sql: string): string;

    // ─── METADATA MANAGEMENT: DEFAULT VALUE PARSING ──────────────────

    /**
     * Parses a raw default-value string from the database catalog into a clean value.
     * SQL Server: strips wrapping parens and N'' prefix, e.g. `(getdate())` → `getdate()`
     * PostgreSQL: strips `::type` casts, recognizes `nextval()` as auto-increment (returns null).
     *
     * @returns The cleaned default value, or `null` if the column has no meaningful default.
     */
    abstract parseColumnDefaultValue(sqlDefaultValue: string): string | null;

    // ─── METADATA MANAGEMENT: COMPLEX SQL GENERATION ─────────────────

    /**
     * Generates the SQL to retrieve pending entity fields that exist in the database
     * but not yet in the MJ metadata. This is a large, platform-specific query.
     *
     * @param mjCoreSchema The MJ core schema name (e.g., `__mj`).
     */
    abstract getPendingEntityFieldsSQL(mjCoreSchema: string): string;

    /**
     * Returns an additional WHERE clause fragment for the check-constraints query.
     * SQL Server: ` WHERE SchemaName NOT IN (...)` when excludeSchemas is provided.
     * PostgreSQL: empty string (the PG view already handles schema filtering).
     */
    abstract getCheckConstraintsSchemaFilter(excludeSchemas: string[]): string;

    /**
     * Returns an additional WHERE clause fragment for the missing-base-tables query.
     * SQL Server: ` WHERE VirtualEntity=0`
     * PostgreSQL: empty string (PG query doesn't need this filter).
     */
    abstract getEntitiesWithMissingBaseTablesFilter(): string;

    /**
     * Generates SQL to fix virtual field nullability after metadata sync.
     * PostgreSQL: Updates AllowsNull for virtual fields based on the FK column's nullability.
     * SQL Server: returns empty string (no fix needed).
     *
     * @param mjCoreSchema The MJ core schema name.
     */
    abstract getFixVirtualFieldNullabilitySQL(mjCoreSchema: string): string;

    // ─── METADATA MANAGEMENT: SQL FILE EXECUTION ─────────────────────

    /**
     * Executes a SQL file using the platform's native CLI tool (sqlcmd/psql).
     * The implementation is responsible for reading connection configuration
     * from the environment or config objects.
     *
     * @param filePath Path to the SQL file to execute.
     * @returns True if execution succeeded, false otherwise.
     */
    abstract executeSQLFileViaShell(filePath: string): Promise<boolean>;
}
