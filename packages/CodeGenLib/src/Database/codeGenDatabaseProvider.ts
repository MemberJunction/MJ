import { EntityInfo, EntityFieldInfo, EntityPermissionInfo } from '@memberjunction/core';
import { DatabasePlatform, SQLDialect } from '@memberjunction/sql-dialect';

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
}
