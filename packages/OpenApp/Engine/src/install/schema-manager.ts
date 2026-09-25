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
 * Schemas the DATABASE PLATFORM owns. MJ did not create these and cannot recreate what they
 * carry, which is precisely why an Open App may never claim one — with or without the
 * double-underscore override.
 *
 * Stored lowercase and matched lowercase: SQL Server compares identifiers case-insensitively
 * and PostgreSQL folds unquoted DDL to lowercase, so `DBO` and `INFORMATION_SCHEMA` name the
 * same physical schemas as their canonical spellings.
 *
 * **What makes this list load-bearing rather than tidy.** Every name here already exists in a
 * stock database, so an app declaring one is never *created* — `HandleSchemaCreation` finds it
 * present and ADOPTS it on the default path, no flag involved. `mj app remove` then hands the
 * adopted name to `DropAppSchema`, which drops it for real. So the danger is not "MJ refuses a
 * name it should allow", it is "MJ silently takes ownership of a schema it must never delete".
 *
 * The three groups, and why each exists in every database of its platform:
 * - `dbo` / `public` are the platforms' default schemas, and the direct analogue of each other.
 *   MJ's own generated PG migrations target `public` (`SET search_path TO __mj, public`) and the
 *   extensions they rely on (`pgcrypto`, `uuid-ossp`) install into it, so dropping it takes
 *   unqualified `gen_random_uuid()` with it.
 * - `sys` / `information_schema` are the catalogs.
 * - `db_owner` … `db_denydatawriter` are SQL Server's nine FIXED DATABASE ROLES. SQL Server
 *   creates one schema per fixed role in every database. They accept tables and they DROP
 *   cleanly (verified on SQL Server 2022), which is the whole hazard. The repo already treats
 *   them as system schemas: `MJCLI/src/baseline/introspector-mssql.ts` excludes this exact list.
 *
 * PostgreSQL's `pg_*` schemas are covered by {@link PG_RESERVED_PREFIX} instead of being listed,
 * because `pg_temp_N` / `pg_toast_temp_N` are created per session and cannot be enumerated ahead
 * of time.
 */
const PLATFORM_SCHEMAS = new Set([
  // SQL Server — default, catalogs, guest
  'dbo',
  'sys',
  'guest',
  // SQL Server — one schema per fixed database role, present in every database
  'db_owner',
  'db_accessadmin',
  'db_securityadmin',
  'db_ddladmin',
  'db_backupoperator',
  'db_datareader',
  'db_datawriter',
  'db_denydatareader',
  'db_denydatawriter',
  // PostgreSQL — default schema
  'public',
  // ANSI — present on both
  'information_schema'
]);

/**
 * PostgreSQL reserves the entire `pg_` prefix for system use, and creates `pg_temp_N` /
 * `pg_toast_temp_N` per backend session. A prefix rule covers the per-session names that an
 * enumerated list structurally cannot, and subsumes `pg_catalog` / `pg_toast`.
 */
const PG_RESERVED_PREFIX = 'pg_';

/**
 * Schemas MEMBERJUNCTION owns. Blocked by exact match regardless of the override.
 *
 * `__mj_udt` is here because MJ core creates it (migrations/v5/V202604292210) as the sandbox for
 * user-defined tables. It sits inside the `__mj_` app namespace opened up below, so without this
 * entry an app could adopt it and `mj app remove` would CASCADE-drop every user-defined table in
 * the database.
 */
const MJ_SCHEMAS = new Set([
  '__mj',
  '__mj_udt'
]);

/**
 * Who owns `normalized`, or `undefined` if it is claimable. One decision in one place, so the
 * error message can name the real owner instead of asserting MJ owns `dbo`.
 */
function ReservedOwnerOf(normalized: string): 'the database platform' | 'MemberJunction' | undefined {
  if (PLATFORM_SCHEMAS.has(normalized) || normalized.startsWith(PG_RESERVED_PREFIX)) {
    return 'the database platform';
  }
  if (MJ_SCHEMAS.has(normalized)) {
    return 'MemberJunction';
  }
  return undefined;
}

/**
 * The namespace MJ Open Apps live in: `__mj_<AppName>` (`__mj_BizAppsCommon`,
 * `__mj_BizAppsForms`, …). It is the convention every first-party app ships and the manifest
 * schema already permits it (see `schemaNameRegex` in manifest-schema.ts, "May start with up
 * to two underscores"). Everything else under `__` stays reserved for MJ internals.
 */
export const MJ_APP_SCHEMA_PREFIX = '__mj_';

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
   * Allow a `__`-prefixed schema name that is outside the `__mj_<AppName>` app namespace
   * (which needs no override). Exact-match reserved names (`__mj`, `__mj_UDT`, `dbo`, …)
   * remain blocked regardless of this flag. Dangerous; MJ-internal apps only.
   */
  allowDoubleUnderscore?: boolean;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
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
 * Which of {@link ValidateSchemaName}'s rules refused a name. `Malformed` covers both the
 * empty/whitespace-only and the leading/trailing-whitespace branches — neither is a naming
 * *policy* decision, so MJ claims no ownership of the name: a caller must not describe it as
 * one MJ is protecting, only as one nothing can be addressed by.
 */
export type SchemaNameRule = 'Malformed' | 'ReservedByPlatform' | 'ReservedByMJ' | 'MJNamespace';

/**
 * Result of {@link ValidateSchemaName}. Carries which rule refused the name, and whether a
 * caller option would have permitted it, so a caller can name a remedy instead of just quoting
 * `ErrorMessage` back at the operator.
 */
export interface SchemaNameValidation extends SchemaOperationResult {
  /** Which rule refused the name. Absent when Success. */
  Rule?: SchemaNameRule;
  /**
   * The caller option that would have permitted this name, when one exists — it is offered by the
   * install, upgrade AND remove options alike. Absent means nothing unblocks it. Callers branch on
   * `OverriddenBy` first, then on `Rule` for the classes `OverriddenBy` cannot distinguish (see
   * `BuildSchemaDropRefusalMessage` in install-orchestrator.ts).
   */
  OverriddenBy?: 'AllowDoubleUnderscoreSchema';
}

/**
 * Validates that a schema name is one an Open App is allowed to claim.
 *
 * The rule, in one place: MemberJunction owns the `__` namespace. Names MJ itself uses are
 * reserved by exact match and are never available. `__mj_<AppName>` is the documented home
 * for MJ Open Apps. Any other `__` name is rejected unless the caller passes
 * `allowDoubleUnderscore`.
 *
 * @param schemaName - The schema name to validate
 * @param options - Optional overrides; see {@link ValidateSchemaNameOptions}
 * @returns Validation result, classified by {@link SchemaNameRule} on rejection
 */
export function ValidateSchemaName(
  schemaName: string,
  options: ValidateSchemaNameOptions = {}
): SchemaNameValidation {
  if (!schemaName || schemaName.trim().length === 0) {
    return {
      Success: false,
      ErrorMessage: 'Schema name is required and cannot be empty',
      Rule: 'Malformed'
    };
  }

  // Callers act on the raw `schemaName` — CreateAppSchema/DropAppSchema hand it straight to
  // Dialect.CanonicalSchemaName, which does not trim. Accepting a name that needs trimming would
  // validate one identifier and create a different one, so reject it instead of normalizing it.
  if (schemaName !== schemaName.trim()) {
    return {
      Success: false,
      ErrorMessage: `Schema name '${schemaName}' has leading or trailing whitespace`,
      Rule: 'Malformed'
    };
  }

  const normalized = schemaName.toLowerCase();

  const owner = ReservedOwnerOf(normalized);
  if (owner) {
    return {
      Success: false,
      ErrorMessage: `Schema name '${schemaName}' is reserved by ${owner} and cannot be used by an Open App`,
      Rule: owner === 'the database platform' ? 'ReservedByPlatform' : 'ReservedByMJ'
    };
  }

  const isMJAppNamespace =
    normalized.startsWith(MJ_APP_SCHEMA_PREFIX) && normalized.length > MJ_APP_SCHEMA_PREFIX.length;

  if (!options.allowDoubleUnderscore && normalized.startsWith('__') && !isMJAppNamespace) {
    return {
      Success: false,
      ErrorMessage:
        `Schema name '${schemaName}' is not available: names starting with '__' are reserved for MemberJunction. ` +
        `MJ Open Apps use the '${MJ_APP_SCHEMA_PREFIX}<AppName>' convention; any other app should choose a name that does not start with '__'.`,
      Rule: 'MJNamespace',
      OverriddenBy: 'AllowDoubleUnderscoreSchema'
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
    if (owner.CanAssign) {
      // The owner name comes from the catalog, not from us, so it may contain `]`. The SQL Server
      // dialect's QuoteIdentifier wraps in brackets WITHOUT doubling an embedded `]` (unlike the PG
      // dialect, which doubles `"`), so double it here, on the SQL-Server-only path, before quoting.
      const escapedOwner = owner.OwnerName.replace(/]/g, ']]');
      await provider.ExecuteSQL(
        `CREATE SCHEMA ${quotedSchema} AUTHORIZATION ${provider.Dialect.QuoteIdentifier(escapedOwner)}`
      );
      return { Success: true };
    }

    await provider.ExecuteSQL(`CREATE SCHEMA ${quotedSchema}`);
    const ownerLabel = owner.OwnerName ? `'${owner.OwnerName}'` : `the owner of ${coreSchema}`;
    const grantee = owner.OwnerName ?? `<owner of ${coreSchema}>`;
    return {
      Success: true,
      Warning:
        `Schema '${schemaName}' was created owned by the installing login, not ${ownerLabel} ` +
        `(the owner of core schema '${coreSchema}'), because the installing login cannot both assign that owner ` +
        `and grant on the schema's objects afterwards (that needs IMPERSONATE on the owner and CONTROL on the database). ` +
        `SQL Server ownership chaining to '${coreSchema}' will not apply, so app views reading core tables ` +
        `need explicit SELECT grants on those tables for every role that reads the views. ` +
        `Remedy: run the install as a member of db_owner (which may both assign '${grantee}' as owner and ` +
        `grant on the schema's objects afterwards) and reinstall, or see the Open App README section ` +
        `"Schema ownership on SQL Server".`
    };
  }
  catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      Success: false,
      ErrorMessage: `Failed to create schema '${schemaName}': ${message}`
    };
  }
}

/** Result of {@link ResolveCoreSchemaOwner}: the owner is only assignable when it is known. */
type CoreSchemaOwner =
  | { CanAssign: true; OwnerName: string }
  | { CanAssign: false; OwnerName: string | null };

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
 * db_owner, sysadmin and a db_ddladmin-only login. No row (core schema invisible) or a NULL owner
 * both mean "cannot assign".
 */
async function ResolveCoreSchemaOwner(
  coreSchema: string,
  provider: DatabaseProviderBase
): Promise<CoreSchemaOwner> {
  const rows = await provider.ExecuteSQL<{
    OwnerName: string | null;
    CanImpersonateOwner: number | null;
    CanControlDatabase: number | null;
  }>(
    `SELECT USER_NAME(s.principal_id) AS OwnerName, ` +
    `HAS_PERMS_BY_NAME(USER_NAME(s.principal_id), 'USER', 'IMPERSONATE') AS CanImpersonateOwner, ` +
    `HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'CONTROL') AS CanControlDatabase ` +
    `FROM sys.schemas s WHERE s.name = '${EscapeSQLString(coreSchema)}'`
  );
  const row = rows[0];
  if (row?.OwnerName && row.CanImpersonateOwner === 1 && row.CanControlDatabase === 1) {
    return { CanAssign: true, OwnerName: row.OwnerName };
  }
  return { CanAssign: false, OwnerName: row?.OwnerName ?? null };
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
