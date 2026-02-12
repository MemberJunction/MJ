/**
 * Database schema management for MJ Open Apps.
 *
 * Handles CREATE SCHEMA and DROP SCHEMA operations for app-specific
 * database schemas. Validates schema names against reserved names
 * and checks for collisions with existing schemas.
 */

/**
 * Reserved schema names that apps cannot claim.
 */
const RESERVED_SCHEMAS = new Set([
    'dbo',
    'sys',
    'guest',
    'INFORMATION_SCHEMA',
    '__mj'
]);

/**
 * Result of a schema operation.
 */
export interface SchemaOperationResult {
    /** Whether the operation succeeded */
    Success: boolean;
    /** Error message if the operation failed */
    ErrorMessage?: string;
}

/**
 * Interface for the database connection used by the schema manager.
 * Follows MJ's pattern of accepting a connection/query runner.
 */
export interface SchemaManagerConnection {
    /** Executes a SQL statement and returns the result */
    ExecuteSQL(sql: string): Promise<Record<string, unknown>[]>;
}

/**
 * Validates that a schema name is allowed (not reserved, no double underscores).
 *
 * @param schemaName - The schema name to validate
 * @returns Validation result
 */
export function ValidateSchemaName(schemaName: string): SchemaOperationResult {
    if (RESERVED_SCHEMAS.has(schemaName)) {
        return {
            Success: false,
            ErrorMessage: `Schema name '${schemaName}' is reserved and cannot be used by an Open App`
        };
    }

    if (schemaName.startsWith('__')) {
        return {
            Success: false,
            ErrorMessage: `Schema names starting with '__' are reserved for MJ internals`
        };
    }

    return { Success: true };
}

/**
 * Checks whether a schema already exists in the database.
 *
 * @param schemaName - The schema name to check
 * @param connection - Database connection
 * @returns True if the schema exists
 */
export async function SchemaExists(
    schemaName: string,
    connection: SchemaManagerConnection
): Promise<boolean> {
    const results = await connection.ExecuteSQL(
        `SELECT 1 AS Exists_ FROM sys.schemas WHERE name = '${EscapeSqlString(schemaName)}'`
    );
    return results.length > 0;
}

/**
 * Creates a new database schema for an Open App.
 *
 * @param schemaName - The schema name to create
 * @param connection - Database connection
 * @returns Operation result
 */
export async function CreateAppSchema(
    schemaName: string,
    connection: SchemaManagerConnection
): Promise<SchemaOperationResult> {
    const validation = ValidateSchemaName(schemaName);
    if (!validation.Success) {
        return validation;
    }

    const exists = await SchemaExists(schemaName, connection);
    if (exists) {
        return {
            Success: false,
            ErrorMessage: `Schema '${schemaName}' already exists`
        };
    }

    try {
        await connection.ExecuteSQL(`CREATE SCHEMA [${EscapeSqlIdentifier(schemaName)}]`);
        return { Success: true };
    }
    catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return {
            Success: false,
            ErrorMessage: `Failed to create schema '${schemaName}': ${message}`
        };
    }
}

/**
 * Drops an app schema and all contained objects.
 *
 * @param schemaName - The schema name to drop
 * @param connection - Database connection
 * @returns Operation result
 */
export async function DropAppSchema(
    schemaName: string,
    connection: SchemaManagerConnection
): Promise<SchemaOperationResult> {
    const validation = ValidateSchemaName(schemaName);
    if (!validation.Success) {
        return validation;
    }

    const exists = await SchemaExists(schemaName, connection);
    if (!exists) {
        return { Success: true };
    }

    try {
        // Drop all objects in the schema first (SQL Server doesn't support CASCADE on DROP SCHEMA)
        await DropAllSchemaObjects(schemaName, connection);
        await connection.ExecuteSQL(`DROP SCHEMA [${EscapeSqlIdentifier(schemaName)}]`);
        return { Success: true };
    }
    catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return {
            Success: false,
            ErrorMessage: `Failed to drop schema '${schemaName}': ${message}`
        };
    }
}

/**
 * Drops all objects within a schema before the schema itself can be dropped.
 * SQL Server requires schemas to be empty before they can be dropped.
 */
async function DropAllSchemaObjects(
    schemaName: string,
    connection: SchemaManagerConnection
): Promise<void> {
    const escaped = EscapeSqlString(schemaName);

    // Drop foreign keys first to avoid dependency issues
    await connection.ExecuteSQL(`
        DECLARE @sql NVARCHAR(MAX) = '';
        SELECT @sql = @sql + 'ALTER TABLE [${escaped}].[' + OBJECT_NAME(parent_object_id) + '] DROP CONSTRAINT [' + name + '];' + CHAR(10)
        FROM sys.foreign_keys
        WHERE SCHEMA_NAME(schema_id) = '${escaped}';
        EXEC sp_executesql @sql;
    `);

    // Drop views
    await connection.ExecuteSQL(`
        DECLARE @sql NVARCHAR(MAX) = '';
        SELECT @sql = @sql + 'DROP VIEW [${escaped}].[' + name + '];' + CHAR(10)
        FROM sys.views WHERE SCHEMA_NAME(schema_id) = '${escaped}';
        EXEC sp_executesql @sql;
    `);

    // Drop stored procedures
    await connection.ExecuteSQL(`
        DECLARE @sql NVARCHAR(MAX) = '';
        SELECT @sql = @sql + 'DROP PROCEDURE [${escaped}].[' + name + '];' + CHAR(10)
        FROM sys.procedures WHERE SCHEMA_NAME(schema_id) = '${escaped}';
        EXEC sp_executesql @sql;
    `);

    // Drop functions
    await connection.ExecuteSQL(`
        DECLARE @sql NVARCHAR(MAX) = '';
        SELECT @sql = @sql + 'DROP FUNCTION [${escaped}].[' + name + '];' + CHAR(10)
        FROM sys.objects WHERE type IN ('FN','IF','TF') AND SCHEMA_NAME(schema_id) = '${escaped}';
        EXEC sp_executesql @sql;
    `);

    // Drop tables
    await connection.ExecuteSQL(`
        DECLARE @sql NVARCHAR(MAX) = '';
        SELECT @sql = @sql + 'DROP TABLE [${escaped}].[' + name + '];' + CHAR(10)
        FROM sys.tables WHERE SCHEMA_NAME(schema_id) = '${escaped}';
        EXEC sp_executesql @sql;
    `);
}

/**
 * Escapes a string for use in SQL string literals (prevents SQL injection).
 */
function EscapeSqlString(value: string): string {
    return value.replace(/'/g, "''");
}

/**
 * Escapes a string for use as a SQL identifier (within square brackets).
 */
function EscapeSqlIdentifier(value: string): string {
    return value.replace(/\]/g, ']]');
}
