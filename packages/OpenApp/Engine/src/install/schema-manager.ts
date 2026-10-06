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
import { EscapeSQLString } from '@memberjunction/global';

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
  /**
   * Non-fatal: the operation succeeded but not in the intended shape (e.g. the schema was
   * created without the intended owner). Callers must surface it to the operator.
   */
  Warning?: string;
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
 * Options for {@link CreateAppSchema}.
 */
export interface CreateAppSchemaOptions extends ValidateSchemaNameOptions {
  /**
   * MJ core schema whose owner the new app schema should share (SQL Server only — see
   * {@link CreateAppSchema}). Defaults to `__mj`.
   */
  CoreSchema?: string;
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
    `SELECT 1 AS Exists_ FROM information_schema.schemata WHERE schema_name = '${EscapeSQLString(schemaName)}'`
  );
  return results.length > 0;
}

/**
 * Creates a new database schema for an Open App.
 *
 * **SQL Server: the schema is created owned by the core schema's owner.** SQL Server's
 * ownership chaining skips the permission check on an object a view references only when both
 * have the same owner, and an object's owner is its schema's owner. A plain `CREATE SCHEMA`
 * makes the INSTALLING login the owner, so an app view reading `__mj.Task` breaks the chain and
 * the API login is asked for SELECT on `__mj.Task` itself (MJ#4756). Creating the schema
 * `AUTHORIZATION <core owner>` (usually `dbo`) keeps the chain intact, so granting the app view
 * is enough. If the installer may not assign that owner (or could not grant on the objects its
 * migrations create once it no longer owns them), the schema is still created (install
 * must not fail on it) and a {@link SchemaOperationResult.Warning} names the consequence and the
 * remedy.
 *
 * **PostgreSQL is untouched**: it has no ownership chaining through schemas — a view checks its
 * base tables' privileges as the VIEW's owner, not the schema's — so the owner of the schema
 * changes nothing there.
 *
 * @param schemaName - The schema name to create
 * @param provider - MJ database provider
 * @param options - Validation overrides and the core schema; see {@link CreateAppSchemaOptions}
 * @returns Operation result; `Warning` set when the SQL Server owner could not be assigned
 */
export async function CreateAppSchema(
  schemaName: string,
  provider: DatabaseProviderBase,
  options: CreateAppSchemaOptions = {}
): Promise<SchemaOperationResult> {
  const validation = ValidateSchemaName(schemaName, options);
  if (!validation.Success) {
    return validation;
  }

  // Create the schema under its platform-canonical name (PG folds unquoted DDL to lowercase),
  // so this is the SAME physical schema the app's (typically unquoted) migration DDL will
  // target — a mixed-case name can't split into a quoted-mixed + folded-lowercase pair.
  const canonical = provider.Dialect.CanonicalSchemaName(schemaName);

  const exists = await SchemaExists(canonical, provider);
  if (exists) {
    return {
      Success: false,
      ErrorMessage: `Schema '${schemaName}' already exists`
    };
  }

  const quotedSchema = provider.Dialect.QuoteIdentifier(canonical);
  try {
    if (provider.Dialect.PlatformKey !== 'sqlserver') {
      await provider.ExecuteSQL(`CREATE SCHEMA ${quotedSchema}`);
      return { Success: true };
    }

    const coreSchema = options.CoreSchema ?? '__mj';
    const owner = await ResolveCoreSchemaOwner(coreSchema, provider);
    if ('Reason' in owner) {
      await provider.ExecuteSQL(`CREATE SCHEMA ${quotedSchema}`);
      return { Success: true, Warning: BuildOwnerFallbackWarning(schemaName, coreSchema, owner) };
    }

    // The owner name comes from the catalog, not from us, so it may contain `]` — the SQL Server
    // dialect's QuoteIdentifier doubles an embedded `]`, so pass the raw name.
    await provider.ExecuteSQL(
      `CREATE SCHEMA ${quotedSchema} AUTHORIZATION ${provider.Dialect.QuoteIdentifier(owner.OwnerName)}`
    );
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
 * Result of {@link ResolveCoreSchemaOwner}. When the owner cannot be assigned, `Reason` says why,
 * because the two causes need different remedies: a missing/invisible core schema is a
 * configuration or visibility problem, while a permission gap is fixed by installing as db_owner.
 */
type CoreSchemaOwner =
  | { CanAssign: true; OwnerName: string }
  | { CanAssign: false; Reason: 'CoreSchemaNotFound' }
  | { CanAssign: false; Reason: 'MissingPermission'; OwnerName: string };

/** The operator-facing Warning for {@link CreateAppSchema}'s installer-owned fallback, per cause. */
function BuildOwnerFallbackWarning(
  schemaName: string,
  coreSchema: string,
  owner: Extract<CoreSchemaOwner, { CanAssign: false }>
): string {
  const consequence =
    `SQL Server ownership chaining to '${coreSchema}' will not apply, so app views reading core tables ` +
    `need explicit SELECT grants on those tables for every role that reads the views. `;
  if (owner.Reason === 'CoreSchemaNotFound') {
    return (
      `Schema '${schemaName}' was created owned by the installing login because core schema '${coreSchema}' ` +
      `was not found or is not visible to the installing login, so its owner could not be determined. ` +
      consequence +
      `Remedy: check that the configured MJ core schema ('${coreSchema}') is correct and visible to the ` +
      `installing login, then reinstall, or see the Open App README section "Schema ownership on SQL Server".`
    );
  }
  return (
    `Schema '${schemaName}' was created owned by the installing login, not '${owner.OwnerName}' ` +
    `(the owner of core schema '${coreSchema}'), because the installing login cannot both assign that owner ` +
    `and grant on the schema's objects afterwards (that needs IMPERSONATE on the owner and CONTROL on the database). ` +
    consequence +
    `Remedy: remove the app without --keep-data, which drops the schema and all of its data (with ` +
    `--keep-data the next install reuses the schema as-is), and install it again as a member of db_owner, ` +
    `which may both assign '${owner.OwnerName}' as owner and grant on the schema's objects afterwards. ` +
    `To keep the data instead, run ` +
    `ALTER AUTHORIZATION ON SCHEMA::[${schemaName.replace(/]/g, ']]')}] TO [${owner.OwnerName.replace(/]/g, ']]')}] ` +
    `as db_owner after scripting out the schema's grants, because it drops them — see the Open App ` +
    `README section "Schema ownership on SQL Server".`
  );
}

/**
 * SQL Server only. Reads who owns `coreSchema` and whether the executing principal may make
 * that user the owner of a new schema AND still finish the install afterwards.
 *
 * Two permissions, both required:
 * - `CREATE SCHEMA … AUTHORIZATION <user>` requires IMPERSONATE on that user (db_owner members and
 *   dbo have it implicitly).
 * - CONTROL on the database. Once the schema belongs to someone else, the installer is no longer
 *   the owner of the objects its migrations create, and `GRANT … ON <app object>` needs CONTROL on
 *   that object. Verified on SQL Server 2022: a db_ddladmin login granted only IMPERSONATE on dbo
 *   created the schema and its views, then failed the migration's `GRANT SELECT` ("Cannot find the
 *   object … or you do not have permission"). Keeping the installer as owner is the only shape in
 *   which such a login's install can finish, so it takes the warned fallback instead.
 * We ASK first with `HAS_PERMS_BY_NAME` rather than attempting the
 * CREATE and catching Msg 15151: that error ("Cannot find the user … or you do not have
 * permission") is the same one a genuinely missing user raises, so catching it would conflate a
 * permission gap with a real fault. The probe was verified to predict the CREATE's outcome for
 * db_owner, sysadmin and a db_ddladmin-only login. No row (core schema missing or invisible) or a
 * NULL owner is `CoreSchemaNotFound` — the permissions were never measured, so it must not be
 * reported as a permission gap.
 */
async function ResolveCoreSchemaOwner(
  coreSchema: string,
  provider: DatabaseProviderBase
): Promise<CoreSchemaOwner> {
  const rows = await provider.ExecuteSQL<{
    OwnerName: string | null;
    CurrentUser: string | null;
    CanImpersonateOwner: number | null;
    CanControlDatabase: number | null;
  }>(
    `SELECT USER_NAME(s.principal_id) AS OwnerName, USER_NAME() AS CurrentUser, ` +
    // QUOTENAME (owner and database): HAS_PERMS_BY_NAME parses the securable as an identifier, so
    // a raw name containing `.`, `[` or `]` returns 0/NULL even for db_owner (verified on SQL
    // Server 2022, for an owner `john.smith` and a database `mj.review_4760`).
    `HAS_PERMS_BY_NAME(QUOTENAME(USER_NAME(s.principal_id)), 'USER', 'IMPERSONATE') AS CanImpersonateOwner, ` +
    `HAS_PERMS_BY_NAME(QUOTENAME(DB_NAME()), 'DATABASE', 'CONTROL') AS CanControlDatabase ` +
    `FROM sys.schemas s WHERE s.name = '${EscapeSQLString(coreSchema)}'`
  );
  const row = rows[0];
  if (!row?.OwnerName) {
    return { CanAssign: false, Reason: 'CoreSchemaNotFound' };
  }
  // The installer already owns the core schema (e.g. the least-privilege login that ran MJ's
  // migrations): naming itself needs no IMPERSONATE, and its migrations keep owning their objects,
  // so CONTROL on the database is not needed either (verified on SQL Server 2022, db_ddladmin).
  if (row.OwnerName === row.CurrentUser) {
    return { CanAssign: true, OwnerName: row.OwnerName };
  }
  if (row.CanImpersonateOwner === 1 && row.CanControlDatabase === 1) {
    return { CanAssign: true, OwnerName: row.OwnerName };
  }
  return { CanAssign: false, Reason: 'MissingPermission', OwnerName: row.OwnerName };
}

/**
 * SQL Server only. Checks, before an app's migrations run against an EXISTING schema, that the
 * executing login may run them: migrations write the schema's Skyway history table and `GRANT`
 * on the objects they create, and both need CONTROL on the schema. Its owner and db_owner members
 * have that; a login that neither owns the schema nor was granted CONTROL does not. That is the
 * state the README retrofit (MJ#4756) leaves a db_ddladmin installer in once `dbo` owns the
 * schema. Verified on SQL Server 2022: its history INSERT is denied, its `GRANT` fails with
 * Msg 15151, and `HAS_PERMS_BY_NAME(…, 'SCHEMA', 'CONTROL')` predicted both outcomes for owner,
 * db_owner, db_ddladmin (with and without db_datawriter) and an explicit `GRANT CONTROL ON SCHEMA`.
 *
 * Install's create path does not need this: {@link CreateAppSchema} leaves the installer as owner
 * unless it has CONTROL on the database.
 *
 * @param schemaName - The app schema the migrations will run in
 * @param provider - MJ database provider
 * @returns `Success: false` with the owner, the login and the remedies when the login lacks
 *   CONTROL; `Success: true` when it has it, when the schema does not exist yet, or on PostgreSQL
 */
export async function CheckCanMigrateAppSchema(
  schemaName: string,
  provider: DatabaseProviderBase
): Promise<SchemaOperationResult> {
  if (provider.Dialect.PlatformKey !== 'sqlserver') {
    return { Success: true };
  }
  try {
    // Existence comes from the sys.schemas row, not the permission bit: HAS_PERMS_BY_NAME returns
    // 0 (not NULL) for a schema that does not exist (verified on SQL Server 2022).
    const rows = await provider.ExecuteSQL<{ OwnerName: string | null; CurrentUser: string | null; CanControlSchema: number | null }>(
      `SELECT USER_NAME(s.principal_id) AS OwnerName, USER_NAME() AS CurrentUser, ` +
      `HAS_PERMS_BY_NAME(QUOTENAME(s.name), 'SCHEMA', 'CONTROL') AS CanControlSchema ` +
      `FROM sys.schemas s WHERE s.name = '${EscapeSQLString(schemaName)}'`
    );
    const row = rows[0];
    if (!row || row.CanControlSchema === 1) {
      return { Success: true };
    }
    const login = row.CurrentUser ?? 'the installing login';
    return {
      Success: false,
      ErrorMessage:
        `Cannot run migrations in schema '${schemaName}': it is owned by '${row.OwnerName}', not by '${login}', ` +
        `and '${login}' lacks CONTROL on it, so the migrations could neither record their history in the schema ` +
        `nor grant on its objects. Run the install or upgrade as a member of db_owner, or grant the login ` +
        `CONTROL on the schema: GRANT CONTROL ON SCHEMA::[${schemaName.replace(/]/g, ']]')}] TO ` +
        `[${login.replace(/]/g, ']]')}]; — see the Open App README section "Schema ownership on SQL Server".`
    };
  }
  catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      Success: false,
      ErrorMessage: `Could not check whether the installing login may run migrations in schema '${schemaName}': ${message}`
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

  try {
    if (provider.Dialect.PlatformKey === 'postgresql') {
      // Schema CREATE now canonicalizes the name (see CreateAppSchema), so a fresh install has a
      // single physical schema. This case-insensitive sweep additionally cleans up any LEGACY
      // split — a mixed-case schema that fragmented (folded-lowercase tables + quoted-mixed
      // Skyway history) before canonicalization existed. Every schema whose name matches
      // case-insensitively is CASCADE-dropped, so teardown is always complete.
      //
      // Blast radius (the one irreversible operation in remove): the sweep CASCADE-drops EVERY
      // schema equal to `schemaName` under `lower()`, not just the exact-case one. That is bounded
      // on purpose — `schemaName` is the removed app's own (app-controlled) schema, it has already
      // passed ValidateSchemaName + the caller's reserved-name guard, and the value is escaped
      // before interpolation. So the only schemas in range are case-variants of the app's own
      // schema (the legacy-split fragments). It will NOT touch an unrelated app's schema unless two
      // apps adopted names differing only by case — which canonicalization now prevents at install.
      const matches = await provider.ExecuteSQL<{ schema_name: string }>(
        `SELECT schema_name FROM information_schema.schemata WHERE lower(schema_name) = lower('${EscapeSQLString(schemaName)}')`
      );
      for (const m of matches) {
        await provider.ExecuteSQL(`DROP SCHEMA ${provider.Dialect.QuoteIdentifier(m.schema_name)} CASCADE`);
      }
    } else {
      // SQL Server is case-insensitive for identifiers (one schema) and has no CASCADE
      // on DROP SCHEMA — the schema must be emptied first.
      if (!(await SchemaExists(schemaName, provider))) {
        return { Success: true };
      }
      await DropAllSchemaObjects(schemaName, provider);
      await provider.ExecuteSQL(`DROP SCHEMA ${provider.Dialect.QuoteIdentifier(schemaName)}`);
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
  const escaped = EscapeSQLString(schemaName);

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
 *
 * @deprecated Import `EscapeSQLString` from `@memberjunction/global` instead — it is the one
 * canonical escaper. This alias remains only so external callers do not break; it will be
 * removed in the next major.
 */
export const EscapeSqlString = (value: string | null | undefined): string => EscapeSQLString(value);
