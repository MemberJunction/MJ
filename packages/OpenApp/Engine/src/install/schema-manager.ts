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
  // information_schema.schemata is ANSI-standard and present on both SQL Server and
  // PostgreSQL, so this existence check is dialect-agnostic (no sys.schemas / pg_namespace branch).
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
    // provider.QuoteIdentifier applies the dialect's quoting ([..] on SS, ".." on PG).
    await provider.ExecuteSQL(`CREATE SCHEMA ${provider.QuoteIdentifier(schemaName)}`);
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
    // Delegate to the provider's own platform behavior (PostgreSQL: CASCADE; SQL Server:
    // empty-then-drop). No platform branching here — the provider abstraction owns the difference.
    await provider.DropSchemaWithContents(schemaName);
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
 * Escapes a string for use in SQL string literals (prevents SQL injection).
 */
export function EscapeSqlString(value: string): string {
  return value.replace(/'/g, "''");
}
