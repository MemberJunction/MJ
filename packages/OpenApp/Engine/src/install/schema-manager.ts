/**
 * Database schema management for MJ Open Apps.
 *
 * Handles CREATE SCHEMA and DROP SCHEMA operations for app-specific
 * database schemas. Validates schema names against reserved names
 * and checks for collisions with existing schemas.
 *
 * Uses MJ's DatabaseProviderBase for all SQL execution, ensuring
 * consistent logging, connection pooling, and provider abstraction.
 */
import { DatabaseProviderBase } from '@memberjunction/core';

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
 * Options for schema-name validation.
 */
export interface ValidateSchemaNameOptions {
  /**
   * Allow schema names starting with `__`. Exact-match reserved names (e.g. `__mj`, `dbo`)
   * remain blocked regardless of this flag. Dangerous; MJ-internal apps only.
   */
  allowDoubleUnderscore?: boolean;
}

/**
 * Validates that a schema name is allowed (not reserved, no double underscores).
 *
 * @param schemaName - The schema name to validate
 * @param options - Optional overrides; see {@link ValidateSchemaNameOptions}
 * @returns Validation result
 */
export function ValidateSchemaName(
  schemaName: string,
  options: ValidateSchemaNameOptions = {}
): SchemaOperationResult {
  if (RESERVED_SCHEMAS.has(schemaName)) {
    return {
      Success: false,
      ErrorMessage: `Schema name '${schemaName}' is reserved and cannot be used by an Open App`
    };
  }

  if (!options.allowDoubleUnderscore && schemaName.startsWith('__')) {
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
 * @param provider - MJ database provider
 * @returns True if the schema exists
 */
export async function SchemaExists(
  schemaName: string,
  provider: DatabaseProviderBase
): Promise<boolean> {
  // information_schema.schemata is ANSI-standard and present on both SQL Server
  // and PostgreSQL, so schema existence needs no dialect branch (sys.schemas is
  // SQL-Server-only and errors on PG).
  const results = await provider.ExecuteSQL<Record<string, unknown>>(
    `SELECT 1 AS Exists_ FROM information_schema.schemata WHERE schema_name = '${EscapeSqlString(schemaName)}'`
  );
  return results.length > 0;
}

/**
 * Creates a new database schema for an Open App.
 *
 * @param schemaName - The schema name to create
 * @param provider - MJ database provider
 * @returns Operation result
 */
export async function CreateAppSchema(
  schemaName: string,
  provider: DatabaseProviderBase,
  options: ValidateSchemaNameOptions = {}
): Promise<SchemaOperationResult> {
  const validation = ValidateSchemaName(schemaName, options);
  if (!validation.Success) {
    return validation;
  }

  const exists = await SchemaExists(schemaName, provider);
  if (exists) {
    return {
      Success: false,
      ErrorMessage: `Schema '${schemaName}' already exists`
    };
  }

  try {
    await provider.ExecuteSQL(`CREATE SCHEMA ${QuoteSchemaIdentifier(schemaName, provider)}`);
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
 * @param provider - MJ database provider
 * @returns Operation result
 */
export async function DropAppSchema(
  schemaName: string,
  provider: DatabaseProviderBase,
  options: ValidateSchemaNameOptions = {}
): Promise<SchemaOperationResult> {
  const validation = ValidateSchemaName(schemaName, options);
  if (!validation.Success) {
    return validation;
  }

  const exists = await SchemaExists(schemaName, provider);
  if (!exists) {
    return { Success: true };
  }

  try {
    if (provider.Dialect.PlatformKey === 'postgresql') {
      // PostgreSQL supports CASCADE: drop the schema and everything it contains atomically.
      await provider.ExecuteSQL(`DROP SCHEMA ${QuoteSchemaIdentifier(schemaName, provider)} CASCADE`);
    } else {
      // SQL Server has no CASCADE on DROP SCHEMA — the schema must be emptied first.
      await DropAllSchemaObjects(schemaName, provider);
      await provider.ExecuteSQL(`DROP SCHEMA ${QuoteSchemaIdentifier(schemaName, provider)}`);
    }
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
 * SQL-Server-only: SQL Server requires schemas to be empty before they can be
 * dropped (it has no `DROP SCHEMA ... CASCADE`). PostgreSQL uses native CASCADE
 * in {@link DropAppSchema} and never calls this. The generated T-SQL here
 * (sys.* catalogs, QUOTENAME, sp_executesql) is therefore intentionally
 * SQL-Server-specific.
 *
 * Uses QUOTENAME() for all dynamic identifiers in generated SQL to prevent
 * injection via object names. The schema name is passed as a parameterized
 * string literal to the catalog queries, and QUOTENAME() wraps all identifiers
 * in the dynamically-built DROP statements.
 *
 * Compatible with both SQL Server and Azure SQL Database.
 */
async function DropAllSchemaObjects(
  schemaName: string,
  provider: DatabaseProviderBase
): Promise<void> {
  const escaped = EscapeSqlString(schemaName);

  // Drop foreign keys first to avoid dependency issues
  await provider.ExecuteSQL(`
    DECLARE @sql NVARCHAR(MAX) = N'';
    SELECT @sql = @sql + N'ALTER TABLE ' + QUOTENAME('${escaped}') + N'.' + QUOTENAME(OBJECT_NAME(parent_object_id)) + N' DROP CONSTRAINT ' + QUOTENAME(name) + N';' + CHAR(10)
    FROM sys.foreign_keys
    WHERE SCHEMA_NAME(schema_id) = '${escaped}';
    IF @sql <> N'' EXEC sp_executesql @sql;
  `);

  // Drop views
  await provider.ExecuteSQL(`
    DECLARE @sql NVARCHAR(MAX) = N'';
    SELECT @sql = @sql + N'DROP VIEW ' + QUOTENAME('${escaped}') + N'.' + QUOTENAME(name) + N';' + CHAR(10)
    FROM sys.views WHERE SCHEMA_NAME(schema_id) = '${escaped}';
    IF @sql <> N'' EXEC sp_executesql @sql;
  `);

  // Drop stored procedures
  await provider.ExecuteSQL(`
    DECLARE @sql NVARCHAR(MAX) = N'';
    SELECT @sql = @sql + N'DROP PROCEDURE ' + QUOTENAME('${escaped}') + N'.' + QUOTENAME(name) + N';' + CHAR(10)
    FROM sys.procedures WHERE SCHEMA_NAME(schema_id) = '${escaped}';
    IF @sql <> N'' EXEC sp_executesql @sql;
  `);

  // Drop functions
  await provider.ExecuteSQL(`
    DECLARE @sql NVARCHAR(MAX) = N'';
    SELECT @sql = @sql + N'DROP FUNCTION ' + QUOTENAME('${escaped}') + N'.' + QUOTENAME(name) + N';' + CHAR(10)
    FROM sys.objects WHERE type IN ('FN','IF','TF') AND SCHEMA_NAME(schema_id) = '${escaped}';
    IF @sql <> N'' EXEC sp_executesql @sql;
  `);

  // Drop tables
  await provider.ExecuteSQL(`
    DECLARE @sql NVARCHAR(MAX) = N'';
    SELECT @sql = @sql + N'DROP TABLE ' + QUOTENAME('${escaped}') + N'.' + QUOTENAME(name) + N';' + CHAR(10)
    FROM sys.tables WHERE SCHEMA_NAME(schema_id) = '${escaped}';
    IF @sql <> N'' EXEC sp_executesql @sql;
  `);

  // Drop user-defined types (must come after tables that may reference them)
  await provider.ExecuteSQL(`
    DECLARE @sql NVARCHAR(MAX) = N'';
    SELECT @sql = @sql + N'DROP TYPE ' + QUOTENAME('${escaped}') + N'.' + QUOTENAME(name) + N';' + CHAR(10)
    FROM sys.types WHERE SCHEMA_NAME(schema_id) = '${escaped}' AND is_user_defined = 1;
    IF @sql <> N'' EXEC sp_executesql @sql;
  `);

  // Drop sequences
  await provider.ExecuteSQL(`
    DECLARE @sql NVARCHAR(MAX) = N'';
    SELECT @sql = @sql + N'DROP SEQUENCE ' + QUOTENAME('${escaped}') + N'.' + QUOTENAME(name) + N';' + CHAR(10)
    FROM sys.sequences WHERE SCHEMA_NAME(schema_id) = '${escaped}';
    IF @sql <> N'' EXEC sp_executesql @sql;
  `);
}

/**
 * Escapes a string for use in SQL string literals (prevents SQL injection).
 */
export function EscapeSqlString(value: string): string {
  return value.replace(/'/g, "''");
}

/**
 * Quotes a schema name as a SQL identifier for the provider's dialect, escaping
 * the dialect's own quote character. SQL Server -> `[name]` (`]` doubled);
 * PostgreSQL -> `"name"` (`"` doubled).
 */
function QuoteSchemaIdentifier(value: string, provider: DatabaseProviderBase): string {
  if (provider.Dialect.PlatformKey === 'postgresql') {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return `[${value.replace(/\]/g, ']]')}]`;
}
