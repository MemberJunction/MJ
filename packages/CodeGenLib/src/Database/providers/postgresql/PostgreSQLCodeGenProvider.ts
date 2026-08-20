import { EntityInfo, EntityFieldInfo, EntityPermissionInfo, ResolveStartupMode, SetProvider, StartupManager } from '@memberjunction/core';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import {
    CodeGenDatabaseProvider,
    CRUDType,
    BaseViewGenerationContext,
    CascadeDeleteContext,
    FullTextSearchResult,
    MaterializedColumnSpec,
    PhasedExecutionResult,
    DataSourceResult,
} from '../../codeGenDatabaseProvider';
import { ExtractCreatedObjectName, SQLExecutionDiagnostics } from '../../sql-execution-diagnostics';
import { configInfo, mj_core_schema } from '../../../Config/config';
import { logError, logWarning, startSpinner, succeedSpinner } from '../../../Misc/status_logging';
import { buildMetadataSupportObjectsSQL } from './metadataSupportObjects';
import { PostgreSQLDialect, DatabasePlatform, SQLDialect, AutoQuotePostgreSQLIdentifiers } from '@memberjunction/sql-dialect';
import {
    shouldIncludeFieldInParams,
    useJsonArgShape,
    UserCache,
} from '@memberjunction/generic-database-provider';
import {
    POSTGRESQL_PROCEDURE_PARAM_LIMIT,
    PostgreSQLDataProvider,
    PostgreSQLProviderConfigData,
} from '@memberjunction/postgresql-dataprovider';
import { PGConnection, getPgConfig } from '../../../Config/pg-connection';
import { PostgreSQLCodeGenConnection } from './PostgreSQLCodeGenConnection';
import * as fs from 'fs';
import path from 'path';
import { executeWithFallback } from './viewFallback';

const pgDialect = new PostgreSQLDialect();

/**
 * PostgreSQL implementation of the CodeGen database provider.
 * Generates PostgreSQL-native DDL for views, CRUD functions, triggers, indexes,
 * full-text search, permissions, and other database objects.
 *
 * Registered with `MJGlobal.ClassFactory` against the canonical `'postgresql'`
 * platform key — `SQLCodeGenBase` resolves this provider via
 * `ClassFactory.CreateInstance(CodeGenDatabaseProvider, configInfo.dbPlatform)`.
 */
@RegisterClass(CodeGenDatabaseProvider, 'postgresql')
export class PostgreSQLCodeGenProvider extends CodeGenDatabaseProvider {
    /** @inheritdoc */
    get Dialect(): SQLDialect {
        return pgDialect;
    }

    /** @inheritdoc */
    get PlatformKey(): DatabasePlatform {
        return 'postgresql';
    }

    /**
     * PostgreSQL implementation of {@link CodeGenDatabaseProvider.SetupDataSource}.
     *
     * Acquires the module-cached `pg.Pool` via {@link PGConnection} (so repeated
     * CodeGen operations reuse the same pool — matching SQL Server's behavior),
     * wires up `PostgreSQLDataProvider`, registers it as the active provider,
     * and loads the audit user.
     *
     * **Env var resolution** — PG_HOST / PG_PORT / PG_DATABASE / PG_USERNAME /
     * PG_PASSWORD now flow through `configInfo.{dbHost,dbPort,dbDatabase,codeGenLogin,codeGenPassword}`
     * via `DEFAULT_CODEGEN_CONFIG` (see `Config/config.ts`). The provider just
     * reads `configInfo`.
     */
    async SetupDataSource(): Promise<DataSourceResult> {
        startSpinner('Initializing database connection...');
        const pool = await PGConnection();
        const pgConfig = getPgConfig()!;
        const coreSchema = mj_core_schema();

        const dpConfig = new PostgreSQLProviderConfigData(
            {
                Host: pgConfig.Host,
                Port: pgConfig.Port ?? 5432,
                Database: pgConfig.Database,
                User: pgConfig.User,
                Password: pgConfig.Password,
            },
            coreSchema,
            1, // checkRefreshIntervalSeconds: must be > 0 to trigger initial metadata load
        );
        const provider = new PostgreSQLDataProvider();
        await provider.Config(dpConfig);
        SetProvider(provider);

        const conn = new PostgreSQLCodeGenConnection(pool);

        await UserCache.Instance.Refresh(provider);
        const userMatch = UserCache.Users.find((u) => u?.Type?.trim().toLowerCase() === 'owner');
        const currentUser = userMatch ?? UserCache.Users[0];
        if (!currentUser) {
            throw new Error('No users found in PostgreSQL. Ensure vwUsers has at least one user.');
        }

        // Run MJ startup with the same 'task' entry-point default as the SQL Server path
        // (where setupSQLServerClient runs this internally). Previously the PG path skipped
        // Startup() entirely — adding it initializes LocalCacheManager and makes an
        // MJ_STARTUP_MODE=full opt-up actually pre-warm engines on PG too.
        const startupMode = ResolveStartupMode({ configValue: configInfo.startup?.mode, defaultMode: 'task' });
        await StartupManager.Instance.Startup(false, currentUser, provider, { mode: startupMode.mode });

        const connectionInfo = `${pgConfig.Host}:${pgConfig.Port ?? 5432}/${pgConfig.Database}`;
        succeedSpinner('PostgreSQL connection initialized: ' + connectionInfo);
        return { provider, connection: conn, currentUser, connectionInfo };
    }

    /**
     * @inheritdoc
     *
     * PostgreSQL: NOT supported. PG's strict `CREATE OR REPLACE VIEW` parser
     * resolves view names against the existing catalog state at parse time, so
     * a body that LEFT-JOINs the view-being-created to itself (e.g. for a
     * self-FK's virtual NameField) raises `42P01 undefined_table` on first
     * creation. A `CREATE OR REPLACE` retry against a NULL-typed stub then
     * fails with `cannot change data type of view column ... from text to
     * character varying(N)` because PG enforces strict column-type compat in
     * `CREATE OR REPLACE`.
     *
     * Returning `false` tells `sql_codegen.ts` to skip the self-join entirely
     * for self-FK + virtual-NameField cases. The trade-off: the corresponding
     * virtual column (e.g. `RestoredFrom` on `vwRecordChanges`) is not emitted.
     * Matches the baseline-shipped vwRecordChanges shape, which never had this
     * column either.
     */
    override canSelfJoinViewForVirtualNameField(): boolean {
        return false;
    }

    // ─── DROP GUARDS ─────────────────────────────────────────────────────

    /**
     * Generates a PostgreSQL `DROP ... IF EXISTS ... CASCADE` statement as a guard before
     * creating or replacing a database object. For triggers, PostgreSQL relies on
     * `CREATE OR REPLACE` on the trigger function, so a comment is emitted instead.
     */
    generateDropGuard(objectType: 'VIEW' | 'PROCEDURE' | 'FUNCTION' | 'TRIGGER', schema: string, name: string): string {
        // PostgreSQL uses CREATE OR REPLACE for views and functions, so we mostly
        // just need DROP IF EXISTS for procedures and triggers
        switch (objectType) {
            case 'VIEW':
                return `DROP VIEW IF EXISTS ${pgDialect.QuoteSchema(schema, name)} CASCADE;`;
            case 'FUNCTION':
                return `DROP FUNCTION IF EXISTS ${pgDialect.QuoteSchema(schema, name)} CASCADE;`;
            case 'PROCEDURE':
                return `DROP PROCEDURE IF EXISTS ${pgDialect.QuoteSchema(schema, name)} CASCADE;`;
            case 'TRIGGER':
                // Triggers need table context, but for the guard alone we use the name
                return `-- Trigger ${name} will be dropped via CREATE OR REPLACE on the function`;
            default:
                return `-- Unknown object type: ${objectType}`;
        }
    }

    // ─── BASE VIEWS ──────────────────────────────────────────────────────

    /**
     * Generates a PostgreSQL view-regeneration block for an entity's base view.
     *
     * Includes all base table columns, parent/related field joins, and root field lateral
     * joins. Applies a soft-delete `WHERE` filter when the entity uses soft deletes.
     *
     * **Two-path emission (try-then-fallback).** The output wraps `CREATE OR REPLACE VIEW`
     * in a `DO $$ ... EXCEPTION WHEN invalid_table_definition THEN DROP VIEW ... CASCADE;
     * EXECUTE vsql; END $$` block. Why:
     *
     *   - Happy path: `CREATE OR REPLACE VIEW` succeeds (new column list is a prefix of
     *     the existing one plus optional trailing additions). Zero destruction. No
     *     dependent views, functions, triggers, or grants are touched.
     *
     *   - Sad path: PG raises SQLSTATE `42P16 invalid_table_definition` for any column
     *     rename / reorder / type change / removal. The exception handler runs
     *     `DROP VIEW ... CASCADE` and re-executes the CREATE. Dependent codegen-managed
     *     functions (spCreate/spUpdate/spDelete returning `SETOF vwFoo`) and dependent
     *     views are CASCADE-dropped — they are regenerated later in the same codegen
     *     output stream, so by the end of the run all dependents are restored to the new
     *     shape. GRANTs on the view itself are also lost on the CASCADE; codegen always
     *     re-emits permissions immediately after the view, so they come back too.
     *
     * The runtime-apply path also calls this, so the live DB applies the same DO block.
     * `executeWithFallback` (the runtime helper) becomes a no-op for these statements
     * because the DO block handles 42P16 internally — but it still runs as a safety net
     * for any other failure modes.
     *
     * **What this DOES NOT preserve on the sad path:** non-codegen-managed dependent
     * objects (e.g. a hand-written sproc against this view that codegen doesn't know
     * about). Those would be CASCADE-dropped and not restored. MJ codegen-generated
     * sprocs cover all standard CRUD pathways; bespoke sprocs against base views are
     * extremely rare in practice. If a project does have them, they need to be re-applied
     * after a 42P16 fallback fires.
     *
     * This pattern matches the v5.30.x fix migration `V202604282300` — which used the
     * same DO/EXCEPTION construct to recreate `vwEntityPermissions` after the unquoted
     * RoleName alias bug — proving the pattern is production-tested.
     *
     * Permissions are handled separately by sql_codegen.ts via generateViewPermissions().
     */
    generateBaseView(context: BaseViewGenerationContext): string {
        const { entity } = context;
        this.assertLayeredBaseViewSupported(entity);
        // The GENERATED view — `GeneratedViewName` is BaseView unless the entity layers a custom view
        // over an inner generated one, in which case CodeGen writes the inner name. The CRUD
        // routines keep using getBaseViewName(): they return rows from the PUBLIC view, so a
        // column added by a custom layer comes back on create/update like any other.
        const viewName = entity.GeneratedViewName;
        const alias = entity.BaseTableCodeName.charAt(0).toLowerCase();
        const whereClause = this.buildSoftDeleteWhereClause(entity, alias);

        const selectParts = this.buildBaseViewSelectParts(context, alias);
        const fromParts = this.buildBaseViewFromParts(context, entity, alias);
        const quotedView = pgDialect.QuoteSchema(entity.SchemaName, viewName);
        const schemaLit = entity.SchemaName.replace(/'/g, "''");
        const viewNameLit = viewName.replace(/'/g, "''");

        // Inner CREATE OR REPLACE statement (no trailing semicolon — embedded inside
        // the DO block via dollar-quoted literal).
        const createOrReplaceSQL = `CREATE OR REPLACE VIEW ${quotedView}
AS
SELECT
    ${selectParts}
FROM
    ${pgDialect.QuoteSchema(entity.SchemaName, entity.BaseTable)} AS ${alias}${fromParts}
${whereClause}`;

        return `
------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      ${entity.Name}
-----               SCHEMA:      ${entity.SchemaName}
-----               BASE TABLE:  ${entity.BaseTable}
-----               PRIMARY KEY: ${entity.PrimaryKeys.map((pk: EntityFieldInfo) => pk.Name).join(', ')}
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$${createOrReplaceSQL}$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql)
  SELECT DISTINCT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'\n')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'))
  FROM pg_depend d
  JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
  JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '${schemaLit}'
    AND tc.relname = '${viewNameLit}'
    AND tc.relkind IN ('v', 'm')
    AND dc.oid <> tc.oid;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_proc pp ON pp.oid = d.objid AND d.classid = 'pg_proc'::regclass
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '${schemaLit}'
    AND tc.relname = '${viewNameLit}'
    AND tc.relkind IN ('v', 'm')
  UNION
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_type pt ON pt.oid = d.refobjid AND d.refclassid = 'pg_type'::regclass
  JOIN pg_proc pp ON pp.prorettype = pt.oid OR pt.typrelid = pp.oid
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE EXISTS (
      SELECT 1 FROM pg_class tc
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tc.reltype = pt.oid
        AND tn.nspname = '${schemaLit}'
        AND tc.relname = '${viewNameLit}'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS ${quotedView} CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
`;
    }

    // ─── MATERIALIZATION ─────────────────────────────────────────────────

    /**
     * PostgreSQL materialized-table DDL. The create is **conditional** (`CREATE TABLE IF NOT
     * EXISTS`) so a migration-provided `materialized_<name>` table with bespoke indexing is
     * detected and reused rather than clobbered (plan §12). Emits the single-column surrogate
     * PRIMARY KEY, which is itself the required unique index.
     *
     * PG dialect vs. SQL Server: double-quoted identifiers, `CREATE TABLE IF NOT EXISTS` in
     * place of the `IF OBJECT_ID(...) IS NULL` guard, and the surrogate column carries PG's
     * `GENERATED ALWAYS AS IDENTITY` clause (see {@link getMaterializedSurrogateColumnType}).
     */
    override generateMaterializedTableSQL(schema: string, tableName: string, columns: MaterializedColumnSpec[]): string {
        // MJ entity-field metadata stores CANONICAL (SQL Server-flavored) type names — e.g. 'uniqueidentifier',
        // 'nvarchar(50)' — regardless of the physical DB dialect. Every other PG DDL path maps these via
        // mapSQLType (see spCreate/spUpdate generation); the materialized-table DDL must do the same, or a
        // base-view/query materialization emits `... uniqueidentifier ...` and PG fails the CREATE TABLE with
        // `type "uniqueidentifier" does not exist`, aborting the whole codegen run.
        const colLines = columns.map(
            (c) => `    ${pgDialect.QuoteIdentifier(c.Name)} ${this.mapSQLType(c.SQLType)} ${c.Nullable ? 'NULL' : 'NOT NULL'}`,
        );
        const pkCols = columns.filter((c) => c.IsPrimaryKey).map((c) => c.Name);
        const pkClause = pkCols.length
            ? `,\n    CONSTRAINT ${pgDialect.QuoteIdentifier(`PK_${tableName}`)} PRIMARY KEY (${pkCols
                  .map((n) => pgDialect.QuoteIdentifier(n))
                  .join(', ')})`
            : '';
        return `CREATE TABLE IF NOT EXISTS ${pgDialect.QuoteSchema(schema, tableName)} (
${colLines.join(',\n')}${pkClause}
);`;
    }

    /**
     * PostgreSQL wrapper-view DDL — the stable read contract over the materialized table.
     * Uses `CREATE OR REPLACE VIEW` so the same statement both creates the view and atomically
     * repoints it at a freshly-built table during refresh (plan §11.2). The body is always
     * `SELECT * FROM <table>` and the shadow table shares the column shape, so PG's
     * `CREATE OR REPLACE` column-compatibility rule is satisfied on the swap.
     */
    override generateMaterializedWrapperViewSQL(schema: string, viewName: string, tableName: string): string {
        return `CREATE OR REPLACE VIEW ${pgDialect.QuoteSchema(schema, viewName)}
AS
SELECT * FROM ${pgDialect.QuoteSchema(schema, tableName)};`;
    }

    /**
     * PostgreSQL synthetic surrogate key: a SQL-standard auto-assigned identity column
     * (`GENERATED ALWAYS AS IDENTITY`), `bigint` for headroom on large materialized sets.
     * v1 full-rebuild only; the deterministic combined-key hashing in §5 replaces this in Phase 3.
     */
    override getMaterializedSurrogateColumnType(): string {
        return 'bigint GENERATED ALWAYS AS IDENTITY';
    }

    /**
     * PostgreSQL KEYED surrogate key type: the combined-key SHA-256 hash the refresh writes comes from
     * `encode(digest(…), 'hex')`, whose type is `text`, and the full rebuild's `CREATE TABLE AS` infers
     * exactly that. Typing the minted entity's PK column `text` MATCHES the post-refresh physical column,
     * avoiding the int-vs-hash divergence between CodeGen metadata and the rebuilt table.
     */
    override getMaterializedHashSurrogateColumnType(): string {
        return 'text';
    }

    // ─── CRUD CREATE ─────────────────────────────────────────────────────

    /**
     * Emits a `DO` block that drops every existing overload of `<schema>.<fnName>`.
     * Run before each `CREATE OR REPLACE FUNCTION` to prevent PG's "function name is
     * not unique" error when the parameter list grows (e.g. a new column adds a new
     * `DEFAULT NULL` parameter — old + new overloads become call-ambiguous and PG
     * refuses both `CREATE OR REPLACE` and any caller dispatch). Iterating overloads
     * via `pg_proc` is the only way to drop without knowing the exact prior signature.
     */
    private generateDropAllOverloadsBlock(schemaName: string, fnName: string): string {
        // Single quotes inside the DO block need to escape the surrounding quoting.
        // We use dollar-quoted strings to keep the body readable.
        return `DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = '${fnName}'
               AND pronamespace = '${schemaName}'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;
`;
    }

    /**
     * Returns true when this entity should emit JSON-arg sprocs (single `JSONB`
     * parameter, key-presence semantics) for the given CRUD verb instead of the
     * default typed-arg shape. Driven by PostgreSQL's hard 100-arg `FUNC_MAX_ARGS`
     * ceiling — once a typed-arg sproc would project past `POSTGRESQL_PROCEDURE_PARAM_LIMIT`,
     * we switch to JSON-arg.
     *
     * Calls the same `useJsonArgShape` predicate used by the runtime so codegen
     * emit and runtime invocation cannot disagree (see `crudSprocFieldRules`
     * in `@memberjunction/generic-database-provider`).
     */
    private shouldUseJsonArgShape(entity: EntityInfo, sprocType: 'create' | 'update' | 'delete'): boolean {
        return useJsonArgShape(entity, sprocType, POSTGRESQL_PROCEDURE_PARAM_LIMIT);
    }

    /**
     * Returns the per-column JSON cast expression for the JSON-arg sproc body,
     * e.g. `(p_data->>'PromptID')::UUID` or `(p_data->>'Status')` for plain text.
     * The mapping mirrors `mapSQLType` but as JSON-extraction casts; types that
     * don't need a cast (TEXT/VARCHAR) emit just the bare extraction. Binary
     * (BYTEA) decodes from base64 string. JSON-typed columns use `->` (not
     * `->>`) to keep the JSONB structure intact.
     */
    private renderJsonExtractAndCast(field: EntityFieldInfo): string {
        const pgType = this.mapSQLType(field.SQLFullType).toUpperCase();
        const fieldKey = `'${field.Name}'`;

        // JSON / JSONB columns: keep structure via `p_data->'Field'`, no text cast.
        if (pgType === 'JSONB' || pgType === 'JSON') {
            return `(p_data->${fieldKey})::${pgType}`;
        }
        // Binary: caller serializes as base64-encoded string; sproc decodes.
        if (pgType === 'BYTEA') {
            return `decode(p_data->>${fieldKey}, 'base64')`;
        }
        // Plain text — no cast needed; PG returns TEXT from `->>`.
        if (pgType === 'TEXT' || pgType.startsWith('VARCHAR') || pgType.startsWith('CHAR')) {
            return `(p_data->>${fieldKey})`;
        }
        // Everything else (UUID, INTEGER, BIGINT, NUMERIC, BOOLEAN, TIMESTAMP[TZ], DATE, etc.)
        // gets an explicit cast off the text extraction.
        return `(p_data->>${fieldKey})::${pgType}`;
    }

    /**
     * Generates the SET clause body for a JSON-arg UPDATE sproc — one `CASE WHEN
     * p_data ? 'Field' THEN <cast> ELSE "Field" END` per writable column, plus
     * the audit-timestamp assignment.
     */
    private renderJsonArgUpdateSetClause(entity: EntityInfo): string {
        const writableFields = entity.Fields.filter((f) => shouldIncludeFieldInParams(f, 'update') && !f.IsPrimaryKey);
        const setClauses = writableFields.map((field) => {
            const colName = pgDialect.QuoteIdentifier(field.Name);
            const fieldKey = `'${field.Name}'`;
            const cast = this.renderJsonExtractAndCast(field);
            return `${colName} = CASE WHEN p_data ? ${fieldKey} THEN ${cast} ELSE ${colName} END`;
        });
        // __mj_UpdatedAt is always touched on UPDATE, never driven by p_data.
        setClauses.push(`${pgDialect.QuoteIdentifier(EntityInfo.UpdatedAtFieldName)} = NOW()`);
        return setClauses.join(',\n        ');
    }

    /**
     * Generates the JSON-arg variant of `spUpdate*` for wide entities. Single
     * `p_data JSONB` parameter; per-column `CASE WHEN p_data ? 'Field' THEN
     * <cast> ELSE "Field" END` body. Key-absent leaves the column unchanged;
     * key=null clears it; key=value sets it. Identity column (`ID`) is required
     * in the payload; all other columns are optional.
     */
    private generateCRUDUpdateJsonArg(entity: EntityInfo): string {
        const fnName = this.getCRUDRoutineName(entity, CRUDType.Update);
        const viewName = this.getBaseViewName(entity);
        const permissions = this.generateCRUDPermissions(entity, fnName, CRUDType.Update);
        const setClause = this.renderJsonArgUpdateSetClause(entity);
        const trigger = this.generateTimestampTrigger(entity);

        // PK lookup. Composite-PK entities aren't expected to hit JSON-arg in
        // practice (no current wide entity has a composite PK), but the shape
        // still needs to handle them — extract each PK from p_data and AND the
        // WHERE clause.
        const pkExtractions = entity.PrimaryKeys.map(
            (pk) => `    v_${this.toSnakeCase(pk.CodeName)} ${this.mapSQLType(pk.SQLFullType)} := (p_data->>'${pk.Name}')::${this.mapSQLType(pk.SQLFullType)};`
        ).join('\n');
        const pkValidation = entity.PrimaryKeys.map((pk) => `p_data ? '${pk.Name}'`).join(' AND ');
        const whereClause = entity.PrimaryKeys.map(
            (pk) => `${pgDialect.QuoteIdentifier(pk.Name)} = v_${this.toSnakeCase(pk.CodeName)}`
        ).join(' AND ');

        return `
------------------------------------------------------------
----- UPDATE FUNCTION FOR ${entity.BaseTable} (JSON-arg shape)
------------------------------------------------------------
${this.generateDropAllOverloadsBlock(entity.SchemaName, fnName)}
CREATE OR REPLACE FUNCTION ${pgDialect.QuoteSchema(entity.SchemaName, fnName)}(p_data JSONB)
RETURNS SETOF ${pgDialect.QuoteSchema(entity.SchemaName, viewName)}
AS $$
DECLARE
${pkExtractions}
    v_updated_count INTEGER;
BEGIN
    IF p_data IS NULL OR NOT (${pkValidation}) THEN
        RAISE EXCEPTION '${fnName}: p_data must include ${entity.PrimaryKeys.map((pk) => `"${pk.Name}"`).join(', ')}';
    END IF;

    UPDATE ${pgDialect.QuoteSchema(entity.SchemaName, entity.BaseTable)}
    SET
        ${setClause}
    WHERE
        ${whereClause};

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM ${pgDialect.QuoteSchema(entity.SchemaName, viewName)}
    WHERE ${whereClause};
END;
$$ LANGUAGE plpgsql;
${permissions}

${trigger}
`;
    }

    /**
     * Generates the JSON-arg variant of `spCreate*` for wide entities. Single
     * `p_data JSONB` parameter; uses `EXECUTE format(...)` to build the INSERT
     * dynamically based on which keys are present in `p_data` so absent keys
     * fall back to column DEFAULT (matching the typed-arg sproc's default-
     * substitution behavior). Returns the newly created row from the base view.
     *
     * Single-UUID-PK entities auto-generate the PK if `p_data` doesn't include
     * one (matching `gen_random_uuid()` default). Composite-PK entities require
     * caller-supplied PKs.
     */
    private generateCRUDCreateJsonArg(entity: EntityInfo): string {
        const fnName = this.getCRUDRoutineName(entity, CRUDType.Create);
        const viewName = this.getBaseViewName(entity);
        const permissions = this.generateCRUDPermissions(entity, fnName, CRUDType.Create);

        const firstKey = entity.FirstPrimaryKey;
        const pkType = firstKey.Type.toLowerCase().trim();
        const pkIsUuidSingle =
            (pkType === 'uniqueidentifier' || pkType === 'uuid') && entity.PrimaryKeys.length === 1;
        const pkPgType = this.mapSQLType(firstKey.SQLFullType);
        const pkColQuoted = pgDialect.QuoteIdentifier(firstKey.Name);

        // Writable fields participating in the INSERT — exclude PK (handled
        // separately so we can supply a generated UUID when key is absent),
        // exclude virtual / special-date / non-API-writable.
        const writableFields = entity.Fields.filter(
            (f) => shouldIncludeFieldInParams(f, 'create') && !f.IsPrimaryKey
        );

        // Per-field cast tokens for the dynamic INSERT. The expressions reference
        // `$1` (a positional parameter) instead of `p_data` because they end up
        // inside a dynamic SQL string passed to `EXECUTE ... USING p_data`. Inside
        // EXECUTE'd SQL only the bound positional parameters are visible — the
        // outer function's local variables (including p_data) are NOT in scope.
        const fieldCastEntries = writableFields
            .map((f) => {
                let cast = this.renderJsonExtractAndCast(f).replace(/p_data/g, '$1');
                // Non-nullable columns with a DB default: a present-but-NULL payload
                // value inserts NULL and violates the NOT NULL constraint (an ABSENT
                // key is fine — the FOREACH omits it so the column DEFAULT applies).
                // Mirror the typed-arg sproc (generateInsertFieldString): coalesce
                // NULL — and, for UUIDs, the empty-UUID sentinel — to the column default.
                if (f.HasDefaultValue && !f.AllowsNull) {
                    const def = this.formatInsertDefaultValue(f);
                    cast = f.IsUniqueIdentifier
                        ? `CASE WHEN ${cast} = '00000000-0000-0000-0000-000000000000'::uuid THEN ${def} ELSE COALESCE(${cast}, ${def}) END`
                        : `COALESCE(${cast}, ${def})`;
                }
                return `        WHEN '${f.Name}' THEN '${cast.replace(/'/g, "''")}'`;
            })
            .join('\n');

        const fieldNamesArrayLiteral = writableFields.map((f) => `'${f.Name}'`).join(', ');

        // ID resolution body: differs by PK strategy. Single-UUID PK is auto-
        // generated when the caller doesn't supply one; everything else (composite,
        // non-UUID) requires the caller to provide the key explicitly.
        const idResolveBody = pkIsUuidSingle
            ? `    IF p_data ? '${firstKey.Name}' THEN
        v_id := (p_data->>'${firstKey.Name}')::${pkPgType};
    ELSE
        v_id := gen_random_uuid();
    END IF;`
            : `    IF NOT (p_data ? '${firstKey.Name}') THEN
        RAISE EXCEPTION '${fnName}: p_data must include "${firstKey.Name}"';
    END IF;
    v_id := (p_data->>'${firstKey.Name}')::${pkPgType};`;

        return `
------------------------------------------------------------
----- CREATE FUNCTION FOR ${entity.BaseTable} (JSON-arg shape)
------------------------------------------------------------
${this.generateDropAllOverloadsBlock(entity.SchemaName, fnName)}
CREATE OR REPLACE FUNCTION ${pgDialect.QuoteSchema(entity.SchemaName, fnName)}(p_data JSONB)
RETURNS SETOF ${pgDialect.QuoteSchema(entity.SchemaName, viewName)}
AS $$
DECLARE
    v_id ${pkPgType};
    v_field_name TEXT;
    v_cast_expr  TEXT;
    v_col_list   TEXT;
    v_val_list   TEXT;
    v_sql        TEXT;
BEGIN
${idResolveBody}

    v_col_list := quote_ident('${firstKey.Name.replace(/'/g, "''")}');
    v_val_list := quote_literal(v_id) || '::${pkPgType}';

    -- Build column / value lists from keys present in p_data. Absent keys are
    -- omitted entirely so the column's DEFAULT applies (matching the typed-arg
    -- sproc's default-substitution semantics).
    FOREACH v_field_name IN ARRAY ARRAY[${fieldNamesArrayLiteral}]
    LOOP
        IF p_data ? v_field_name THEN
            v_cast_expr := CASE v_field_name
${fieldCastEntries}
            END;
            v_col_list := v_col_list || ', ' || quote_ident(v_field_name);
            v_val_list := v_val_list || ', ' || v_cast_expr;
        END IF;
    END LOOP;

    v_sql := format(
        'INSERT INTO ${pgDialect.QuoteSchema(entity.SchemaName, entity.BaseTable).replace(/'/g, "''")} (%s) VALUES (%s)',
        v_col_list,
        v_val_list
    );
    -- Pass p_data as a positional parameter so the cast expressions inside
    -- v_val_list (which reference $1) can read the JSONB payload.
    EXECUTE v_sql USING p_data;

    RETURN QUERY
    SELECT * FROM ${pgDialect.QuoteSchema(entity.SchemaName, viewName)}
    WHERE ${pkColQuoted} = v_id;
END;
$$ LANGUAGE plpgsql;
${permissions}
`;
    }

    /**
     * Generates a PostgreSQL `CREATE OR REPLACE FUNCTION` for inserting a new record.
     * The function accepts typed parameters for each writable field, performs an `INSERT`
     * into the base table, and returns the newly created row from the base view via
     * `RETURN QUERY SELECT`. Handles auto-increment PKs (using `RETURNING ... INTO`),
     * UUID PKs (with `COALESCE` to gen_random_uuid()), and composite PKs. Also emits
     * `GRANT EXECUTE` permissions for authorized roles.
     *
     * Prepends a DROP-all-overloads block (see `generateDropAllOverloadsBlock`) so
     * adding/removing a column doesn't trigger PG's overload-ambiguity error.
     *
     * Wide entities (where `useJsonArgShape` returns true) emit a JSON-arg variant
     * via `generateCRUDCreateJsonArg` — single `p_data JSONB` parameter, dynamic
     * INSERT built from keys present in the payload. Same semantics; different
     * wire shape needed because of PostgreSQL's 100-arg function ceiling.
     */
    generateCRUDCreate(entity: EntityInfo): string {
        if (this.shouldUseJsonArgShape(entity, 'create')) {
            return this.generateCRUDCreateJsonArg(entity);
        }

        const fnName = this.getCRUDRoutineName(entity, CRUDType.Create);
        const viewName = this.getBaseViewName(entity);
        const paramString = this.generateCRUDParamString(entity.Fields, false);
        const permissions = this.generateCRUDPermissions(entity, fnName, CRUDType.Create);

        const firstKey = entity.FirstPrimaryKey;
        // For UUID PKs and AutoIncrement PKs, the strategy below adds the PK
        // column manually (with v_new_id or RETURNING). Excluding it from the
        // auto-generated insertColumns/insertValues avoids the column appearing
        // twice in the INSERT statement.
        const pkType = firstKey.Type.toLowerCase().trim();
        const pkHandledByStrategy =
            firstKey.AutoIncrement ||
            ((pkType === 'uniqueidentifier' || pkType === 'uuid') && entity.PrimaryKeys.length === 1) ||
            // Composite PK: buildCreateInsertStrategy prepends every PK column explicitly. The
            // generateInsertFieldString `isCallerSuppliedPK` exception would ALSO emit those same
            // caller-supplied composite-PK columns, producing `column "x" specified more than once`
            // on PostgreSQL (real bug on composite-PK association/junction tables). Exclude the PK
            // from the auto field list so the strategy's prepend is the single source for them.
            entity.PrimaryKeys.length > 1;
        const insertColumns = this.generateInsertFieldString(entity, entity.Fields, '', pkHandledByStrategy);
        const insertValues = this.generateInsertFieldString(entity, entity.Fields, 'p_', pkHandledByStrategy);

        const strategy = this.buildCreateInsertStrategy(
            entity, firstKey, insertColumns, insertValues
        );

        return `
------------------------------------------------------------
----- CREATE FUNCTION FOR ${entity.BaseTable}
------------------------------------------------------------
${this.generateDropAllOverloadsBlock(entity.SchemaName, fnName)}
CREATE OR REPLACE FUNCTION ${pgDialect.QuoteSchema(entity.SchemaName, fnName)}(
    ${paramString}
) RETURNS SETOF ${pgDialect.QuoteSchema(entity.SchemaName, viewName)} AS $$
DECLARE
    v_new_id ${this.mapSQLType(firstKey.SQLFullType)};
BEGIN
    ${strategy.preInsert}INSERT INTO ${pgDialect.QuoteSchema(entity.SchemaName, entity.BaseTable)}
        (
            ${strategy.finalColumns}
        )
    VALUES
        (
            ${strategy.finalValues}
        )
    ${strategy.returningClause};

    RETURN QUERY
    ${strategy.selectClause};
END;
$$ LANGUAGE plpgsql;
${permissions}
`;
    }

    // ─── CRUD UPDATE ─────────────────────────────────────────────────────

    /**
     * Generates a PostgreSQL `CREATE OR REPLACE FUNCTION` for updating an existing record.
     * The function accepts typed parameters for all updatable fields plus primary key(s),
     * performs an `UPDATE ... SET ... WHERE PK = param`, checks `ROW_COUNT` to detect
     * missing rows, and returns the updated record from the base view via `RETURN QUERY
     * SELECT`. Also generates the `__mj_UpdatedAt` timestamp trigger for the entity
     * and emits `GRANT EXECUTE` permissions.
     */
    generateCRUDUpdate(entity: EntityInfo): string {
        if (this.shouldUseJsonArgShape(entity, 'update')) {
            return this.generateCRUDUpdateJsonArg(entity);
        }

        const fnName = this.getCRUDRoutineName(entity, CRUDType.Update);
        const viewName = this.getBaseViewName(entity);
        const paramString = this.generateCRUDParamString(entity.Fields, true);
        const permissions = this.generateCRUDPermissions(entity, fnName, CRUDType.Update);
        const updateFields = this.generateUpdateFieldString(entity.Fields);
        const whereClause = this.buildPrimaryKeyWhereClause(entity);
        const selectWhereClause = this.buildPrimaryKeyWhereClause(entity);

        const trigger = this.generateTimestampTrigger(entity);

        // PK-only entities (e.g. junction tables with only PK + __mj timestamp columns)
        // have no updatable fields. Generate a no-op function that just returns the
        // existing row rather than emitting an invalid UPDATE with an empty SET clause.
        const hasUpdatableFields = updateFields.trim().length > 0;

        const fnBody = hasUpdatableFields
            ? `    UPDATE ${pgDialect.QuoteSchema(entity.SchemaName, entity.BaseTable)}
    SET
        ${updateFields}
    WHERE
        ${whereClause};

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM ${pgDialect.QuoteSchema(entity.SchemaName, viewName)}
    WHERE ${selectWhereClause};`
            : `    -- No updatable fields (PK-only entity, e.g. junction table). Return the existing row.
    RETURN QUERY
    SELECT * FROM ${pgDialect.QuoteSchema(entity.SchemaName, viewName)}
    WHERE ${selectWhereClause};`;

        // Only declare v_updated_count when we actually perform an UPDATE.
        const declareBlock = hasUpdatableFields ? '\n    v_updated_count INTEGER;' : '';

        return `
------------------------------------------------------------
----- UPDATE FUNCTION FOR ${entity.BaseTable}
------------------------------------------------------------
${this.generateDropAllOverloadsBlock(entity.SchemaName, fnName)}
CREATE OR REPLACE FUNCTION ${pgDialect.QuoteSchema(entity.SchemaName, fnName)}(
    ${paramString}
) RETURNS SETOF ${pgDialect.QuoteSchema(entity.SchemaName, viewName)} AS $$
DECLARE${declareBlock}
BEGIN
${fnBody}
END;
$$ LANGUAGE plpgsql;
${permissions}

${trigger}
`;
    }

    // ─── CRUD DELETE ─────────────────────────────────────────────────────

    /**
     * Generates a PostgreSQL `CREATE OR REPLACE FUNCTION` for deleting a record.
     * Supports both hard deletes (`DELETE FROM`) and soft deletes (`UPDATE ... SET
     * __mj_DeletedAt`). Prepends any cascade SQL for dependent records, uses
     * `#variable_conflict use_column` to avoid PL/pgSQL naming conflicts, and returns
     * the affected primary key(s) or NULLs if no row was found. Emits `GRANT EXECUTE`
     * permissions for authorized roles.
     */
    generateCRUDDelete(entity: EntityInfo, cascadeSQL: string): string {
        const fnName = this.getCRUDRoutineName(entity, CRUDType.Delete);
        const permissions = this.generateCRUDPermissions(entity, fnName, CRUDType.Delete);

        const { paramDecl, deleteBody, returnType, returnStatement } = this.buildDeleteStrategy(entity, cascadeSQL);

        const needsRecordVar = cascadeSQL.includes('v_rec');

        return `
------------------------------------------------------------
----- DELETE FUNCTION FOR ${entity.BaseTable}
------------------------------------------------------------
${this.generateDropAllOverloadsBlock(entity.SchemaName, fnName)}
CREATE OR REPLACE FUNCTION ${pgDialect.QuoteSchema(entity.SchemaName, fnName)}(
    ${paramDecl}
) RETURNS ${returnType} AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;${needsRecordVar ? '\n    v_rec RECORD;' : ''}
BEGIN
${cascadeSQL}
${deleteBody}

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

${returnStatement}
END;
$$ LANGUAGE plpgsql;
${permissions}
`;
    }

    // ─── TIMESTAMP TRIGGER ───────────────────────────────────────────────

    /**
     * Generates a PL/pgSQL trigger function and a `BEFORE UPDATE` trigger that
     * automatically sets the `__mj_UpdatedAt` column to the current UTC time on every
     * row update. Uses `CREATE OR REPLACE FUNCTION` for the trigger function and
     * `DROP TRIGGER IF EXISTS` + `CREATE TRIGGER` for idempotent trigger creation.
     * Returns an empty string if the entity has no `__mj_UpdatedAt` field.
     */
    generateTimestampTrigger(entity: EntityInfo): string {
        const updatedAtField = entity.Fields.find(
            (f: EntityFieldInfo) => f.Name.toLowerCase().trim() === EntityInfo.UpdatedAtFieldName.toLowerCase().trim()
        );
        if (!updatedAtField) return '';

        const trigFnName = `fn_trg_update_${this.toSnakeCase(entity.BaseTableCodeName)}`;
        const trigName = `trg_update_${this.toSnakeCase(entity.BaseTableCodeName)}`;

        return `
------------------------------------------------------------
----- TRIGGER FOR ${EntityInfo.UpdatedAtFieldName} field for the ${entity.BaseTable} table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION ${pgDialect.QuoteSchema(entity.SchemaName, trigFnName)}()
RETURNS TRIGGER AS $$
BEGIN
    NEW."${EntityInfo.UpdatedAtFieldName}" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ${pgDialect.QuoteIdentifier(trigName)} ON ${pgDialect.QuoteSchema(entity.SchemaName, entity.BaseTable)};

CREATE TRIGGER ${pgDialect.QuoteIdentifier(trigName)}
BEFORE UPDATE ON ${pgDialect.QuoteSchema(entity.SchemaName, entity.BaseTable)}
FOR EACH ROW
EXECUTE FUNCTION ${pgDialect.QuoteSchema(entity.SchemaName, trigFnName)}();
`;
    }

    // ─── INDEXES ─────────────────────────────────────────────────────────

    /**
     * Generates `CREATE INDEX IF NOT EXISTS` statements for each foreign key column
     * on the entity's base table. Index names follow the `idx_auto_mj_fkey_<table>_<column>`
     * convention and are truncated to 63 characters (PostgreSQL's maximum identifier length).
     * Skips primary key columns and virtual fields.
     */
    protected indexPrefix(): string {
        return 'idx_auto_mj_fkey_';
    }

    /** PostgreSQL's maximum identifier length. */
    protected maxIdentifierLength(): number {
        return 63;
    }

    protected tableToken(entity: EntityInfo): string {
        return this.toSnakeCase(entity.BaseTable);
    }

    protected columnToken(f: EntityFieldInfo): string {
        return this.toSnakeCase(f.Name);
    }

    protected formatIndexStatement(entity: EntityInfo, f: EntityFieldInfo, indexName: string): string {
        return (
            `CREATE INDEX IF NOT EXISTS ${pgDialect.QuoteIdentifier(indexName)}\n` +
            `    ON ${pgDialect.QuoteSchema(entity.SchemaName, entity.BaseTable)} (${pgDialect.QuoteIdentifier(f.Name)});`
        );
    }

    // ─── FULL-TEXT SEARCH ────────────────────────────────────────────────

    /**
     * Generates a complete PostgreSQL full-text search infrastructure for an entity.
     * This includes:
     * 1. A `tsvector` column (`__mj_fts_vector`) added via conditional `ALTER TABLE`
     * 2. A PL/pgSQL trigger function that concatenates search fields into a `tsvector`
     * 3. A `BEFORE INSERT OR UPDATE` trigger to keep the vector column in sync
     * 4. A GIN index on the `tsvector` column for fast lookups
     * 5. A SQL `STABLE` search function that joins the base view with a `plainto_tsquery` match
     * 6. A backfill `UPDATE` to populate existing rows where the vector is NULL
     *
     * @returns A {@link FullTextSearchResult} with the generated SQL and the search function name.
     */
    generateFullTextSearch(entity: EntityInfo, searchFields: EntityFieldInfo[], _primaryKeyIndexName: string): FullTextSearchResult {
        const ftsColName = '__mj_fts_vector';
        const trigName = `trg_fts_${this.toSnakeCase(entity.BaseTable)}`;
        const indexName = `idx_fts_${this.toSnakeCase(entity.BaseTable)}`;
        const fnName = `fn_search_${this.toSnakeCase(entity.BaseTable)}`;
        const viewName = this.getBaseViewName(entity);

        const fieldNames = searchFields.map((f: EntityFieldInfo) => pgDialect.QuoteIdentifier(f.Name));
        const fieldList = fieldNames.join(', ');

        const sql = `
------------------------------------------------------------
----- FULL-TEXT SEARCH FOR ${entity.BaseTable}
------------------------------------------------------------
-- Add tsvector column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = '${entity.SchemaName}'
        AND table_name = '${entity.BaseTable}'
        AND column_name = '${ftsColName}'
    ) THEN
        ALTER TABLE ${pgDialect.QuoteSchema(entity.SchemaName, entity.BaseTable)}
        ADD COLUMN ${ftsColName} TSVECTOR;
    END IF;
END $$;

-- Create trigger to keep tsvector updated
CREATE OR REPLACE FUNCTION ${pgDialect.QuoteSchema(entity.SchemaName, `fn_${trigName}`)}()
RETURNS TRIGGER AS $$
BEGIN
    NEW.${ftsColName} := to_tsvector('english', ${fieldNames.map((n: string) => `COALESCE(NEW.${n}::TEXT, '')`).join(" || ' ' || ")});
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ${pgDialect.QuoteIdentifier(trigName)} ON ${pgDialect.QuoteSchema(entity.SchemaName, entity.BaseTable)};

CREATE TRIGGER ${pgDialect.QuoteIdentifier(trigName)}
BEFORE INSERT OR UPDATE OF ${fieldList}
ON ${pgDialect.QuoteSchema(entity.SchemaName, entity.BaseTable)}
FOR EACH ROW
EXECUTE FUNCTION ${pgDialect.QuoteSchema(entity.SchemaName, `fn_${trigName}`)}();

-- Create GIN index for fast full-text search
CREATE INDEX IF NOT EXISTS ${pgDialect.QuoteIdentifier(indexName)}
    ON ${pgDialect.QuoteSchema(entity.SchemaName, entity.BaseTable)} USING GIN(${ftsColName});

-- Create search function
CREATE OR REPLACE FUNCTION ${pgDialect.QuoteSchema(entity.SchemaName, fnName)}(
    p_search_term TEXT
) RETURNS SETOF ${pgDialect.QuoteSchema(entity.SchemaName, viewName)} AS $$
    SELECT v.*
    FROM ${pgDialect.QuoteSchema(entity.SchemaName, viewName)} v
    JOIN ${pgDialect.QuoteSchema(entity.SchemaName, entity.BaseTable)} t
        ON ${entity.PrimaryKeys.map((pk: EntityFieldInfo) => `v.${pgDialect.QuoteIdentifier(pk.Name)} = t.${pgDialect.QuoteIdentifier(pk.Name)}`).join(' AND ')}
    WHERE t.${ftsColName} @@ plainto_tsquery('english', p_search_term);
$$ LANGUAGE sql STABLE;

-- Backfill existing rows
UPDATE ${pgDialect.QuoteSchema(entity.SchemaName, entity.BaseTable)}
SET ${ftsColName} = to_tsvector('english', ${fieldNames.map((n: string) => `COALESCE(${n}::TEXT, '')`).join(" || ' ' || ")})
WHERE ${ftsColName} IS NULL;
`;

        return { sql, functionName: fnName };
    }

    // ─── RECURSIVE ROOT ID FUNCTIONS ─────────────────────────────────────

    /**
     * Generates a PostgreSQL SQL `STABLE` function that walks a self-referencing hierarchy
     * (e.g., ParentCategoryID) using a recursive CTE to find the root ancestor record.
     * The CTE starts from `COALESCE(p_parent_id, p_record_id)` as the anchor and follows
     * the parent FK upward, capped at 100 levels to prevent infinite loops. Returns the
     * root record's primary key value.
     */
    // ─── RECURSIVE HIERARCHY FUNCTIONS ──────────────────────────────────

    /**
     * Generates a PostgreSQL function returning a table of hierarchy metadata
     * (RootID, Depth, Path, IsLeaf, ChildCount) for a self-referencing foreign key.
     */
    generateHierarchyMetaFunction(entity: EntityInfo, field: EntityFieldInfo): string {
        if (entity.PrimaryKeys.length !== 1) {
            throw new Error(`[Hierarchy] Entity '${entity.Name}' has ${entity.PrimaryKeys.length} primary key fields. MemberJunction hierarchy TVF generation requires a single-column primary key.`);
        }
        const primaryKey = entity.FirstPrimaryKey.Name;
        const primaryKeyType = this.mapSQLType(entity.FirstPrimaryKey.SQLFullType);
        const fieldName = field.Name;
        const fnName = this.getHierarchyMetaFunctionName(entity, field);

        return `
------------------------------------------------------------
----- HIERARCHY METADATA FUNCTION FOR: ${entity.BaseTable}.${fieldName}
------------------------------------------------------------
CREATE OR REPLACE FUNCTION ${pgDialect.QuoteSchema(entity.SchemaName, fnName)}(
    p_record_id ${primaryKeyType},
    p_parent_id ${primaryKeyType}
) RETURNS TABLE (
    "RootID" ${primaryKeyType},
    "Depth" INTEGER,
    "Path" TEXT,
    "IsLeaf" BOOLEAN,
    "ChildCount" INTEGER
) AS $$
    WITH RECURSIVE cte_ancestors AS (
        SELECT
            ${pgDialect.QuoteIdentifier(primaryKey)},
            ${pgDialect.QuoteIdentifier(fieldName)},
            0 AS depth,
            '/' || ${pgDialect.QuoteIdentifier(primaryKey)}::TEXT || '/' AS path
        FROM
            ${pgDialect.QuoteSchema(entity.SchemaName, entity.BaseTable)}
        WHERE
            ${pgDialect.QuoteIdentifier(primaryKey)} = p_record_id

        UNION ALL

        SELECT
            p.${pgDialect.QuoteIdentifier(primaryKey)},
            p.${pgDialect.QuoteIdentifier(fieldName)},
            c.depth + 1 AS depth,
            '/' || p.${pgDialect.QuoteIdentifier(primaryKey)}::TEXT || c.path AS path
        FROM
            ${pgDialect.QuoteSchema(entity.SchemaName, entity.BaseTable)} p
        INNER JOIN
            cte_ancestors c ON p.${pgDialect.QuoteIdentifier(primaryKey)} = c.${pgDialect.QuoteIdentifier(fieldName)}
        WHERE
            c.depth < 100
    )
    SELECT
        a.${pgDialect.QuoteIdentifier(primaryKey)} AS "RootID",
        (SELECT MAX(depth) FROM cte_ancestors)::INTEGER AS "Depth",
        (SELECT path FROM cte_ancestors ORDER BY depth DESC LIMIT 1)::TEXT AS "Path",
        (NOT EXISTS (SELECT 1 FROM ${pgDialect.QuoteSchema(entity.SchemaName, entity.BaseTable)} WHERE ${pgDialect.QuoteIdentifier(fieldName)} = p_record_id))::BOOLEAN AS "IsLeaf",
        (SELECT COUNT(1)::INTEGER FROM ${pgDialect.QuoteSchema(entity.SchemaName, entity.BaseTable)} WHERE ${pgDialect.QuoteIdentifier(fieldName)} = p_record_id) AS "ChildCount"
    FROM
        cte_ancestors a
    WHERE
        a.${pgDialect.QuoteIdentifier(fieldName)} IS NULL OR p_parent_id IS NULL
    ORDER BY
        a.depth DESC
    LIMIT 1;
$$ LANGUAGE sql STABLE;
`;
    }

    /**
     * Generates a PostgreSQL table-valued function returning all descendant records of a root node.
     */
    generateDescendantsFunction(entity: EntityInfo, field: EntityFieldInfo): string {
        if (entity.PrimaryKeys.length !== 1) {
            throw new Error(`[Hierarchy] Entity '${entity.Name}' has ${entity.PrimaryKeys.length} primary key fields. MemberJunction hierarchy TVF generation requires a single-column primary key.`);
        }
        const primaryKey = entity.FirstPrimaryKey.Name;
        const primaryKeyType = this.mapSQLType(entity.FirstPrimaryKey.SQLFullType);
        const fieldName = field.Name;
        const fnName = this.getDescendantsFunctionName(entity, field);

        return `
------------------------------------------------------------
----- DESCENDANTS FUNCTION FOR: ${entity.BaseTable}.${fieldName}
------------------------------------------------------------
CREATE OR REPLACE FUNCTION ${pgDialect.QuoteSchema(entity.SchemaName, fnName)}(
    p_root_id ${primaryKeyType},
    p_max_depth INTEGER DEFAULT NULL
) RETURNS TABLE (
    "ID" ${primaryKeyType},
    "Depth" INTEGER,
    "Path" TEXT,
    "IsLeaf" BOOLEAN,
    "ChildCount" INTEGER
) AS $$
    WITH RECURSIVE cte_descendants AS (
        SELECT
            ${pgDialect.QuoteIdentifier(primaryKey)},
            ${pgDialect.QuoteIdentifier(fieldName)},
            0 AS relative_depth,
            '/' || ${pgDialect.QuoteIdentifier(primaryKey)}::TEXT || '/' AS path
        FROM
            ${pgDialect.QuoteSchema(entity.SchemaName, entity.BaseTable)}
        WHERE
            ${pgDialect.QuoteIdentifier(primaryKey)} = p_root_id

        UNION ALL

        SELECT
            c.${pgDialect.QuoteIdentifier(primaryKey)},
            c.${pgDialect.QuoteIdentifier(fieldName)},
            p.relative_depth + 1 AS relative_depth,
            p.path || c.${pgDialect.QuoteIdentifier(primaryKey)}::TEXT || '/' AS path
        FROM
            ${pgDialect.QuoteSchema(entity.SchemaName, entity.BaseTable)} c
        INNER JOIN
            cte_descendants p ON c.${pgDialect.QuoteIdentifier(fieldName)} = p.${pgDialect.QuoteIdentifier(primaryKey)}
        WHERE
            (p_max_depth IS NULL OR p.relative_depth < p_max_depth)
            AND p.relative_depth < 100
    )
    SELECT
        d.${pgDialect.QuoteIdentifier(primaryKey)} AS "ID",
        d.relative_depth AS "Depth",
        d.path AS "Path",
        (NOT EXISTS (SELECT 1 FROM ${pgDialect.QuoteSchema(entity.SchemaName, entity.BaseTable)} WHERE ${pgDialect.QuoteIdentifier(fieldName)} = d.${pgDialect.QuoteIdentifier(primaryKey)}))::BOOLEAN AS "IsLeaf",
        (SELECT COUNT(1)::INTEGER FROM ${pgDialect.QuoteSchema(entity.SchemaName, entity.BaseTable)} WHERE ${pgDialect.QuoteIdentifier(fieldName)} = d.${pgDialect.QuoteIdentifier(primaryKey)}) AS "ChildCount"
    FROM
        cte_descendants d;
$$ LANGUAGE sql STABLE;
`;
    }

    /**
     * Generates a PostgreSQL table-valued function returning all ancestors of a node walking upward.
     */
    generateAncestorsFunction(entity: EntityInfo, field: EntityFieldInfo): string {
        if (entity.PrimaryKeys.length !== 1) {
            throw new Error(`[Hierarchy] Entity '${entity.Name}' has ${entity.PrimaryKeys.length} primary key fields. MemberJunction hierarchy TVF generation requires a single-column primary key.`);
        }
        const primaryKey = entity.FirstPrimaryKey.Name;
        const primaryKeyType = this.mapSQLType(entity.FirstPrimaryKey.SQLFullType);
        const fieldName = field.Name;
        const fnName = this.getAncestorsFunctionName(entity, field);

        return `
------------------------------------------------------------
----- ANCESTORS FUNCTION FOR: ${entity.BaseTable}.${fieldName}
------------------------------------------------------------
CREATE OR REPLACE FUNCTION ${pgDialect.QuoteSchema(entity.SchemaName, fnName)}(
    p_record_id ${primaryKeyType}
) RETURNS TABLE (
    "ID" ${primaryKeyType},
    "LevelUp" INTEGER,
    "Path" TEXT
) AS $$
    WITH RECURSIVE cte_ancestors AS (
        SELECT
            ${pgDialect.QuoteIdentifier(primaryKey)},
            ${pgDialect.QuoteIdentifier(fieldName)},
            0 AS level_up,
            '/' || ${pgDialect.QuoteIdentifier(primaryKey)}::TEXT || '/' AS path
        FROM
            ${pgDialect.QuoteSchema(entity.SchemaName, entity.BaseTable)}
        WHERE
            ${pgDialect.QuoteIdentifier(primaryKey)} = p_record_id

        UNION ALL

        SELECT
            p.${pgDialect.QuoteIdentifier(primaryKey)},
            p.${pgDialect.QuoteIdentifier(fieldName)},
            c.level_up + 1 AS level_up,
            '/' || p.${pgDialect.QuoteIdentifier(primaryKey)}::TEXT || c.path AS path
        FROM
            ${pgDialect.QuoteSchema(entity.SchemaName, entity.BaseTable)} p
        INNER JOIN
            cte_ancestors c ON p.${pgDialect.QuoteIdentifier(primaryKey)} = c.${pgDialect.QuoteIdentifier(fieldName)}
        WHERE
            c.level_up < 100
    )
    SELECT
        a.${pgDialect.QuoteIdentifier(primaryKey)} AS "ID",
        a.level_up AS "LevelUp",
        a.path AS "Path"
    FROM
        cte_ancestors a;
$$ LANGUAGE sql STABLE;
`;
    }

    public getHierarchyMetaFunctionName(entity: EntityInfo, field: EntityFieldInfo): string {
        return `fn_${this.toSnakeCase(entity.BaseTable)}_${this.toSnakeCase(field.Name)}_get_hierarchy_meta`;
    }

    public getDescendantsFunctionName(entity: EntityInfo, field: EntityFieldInfo): string {
        return `fn_${this.toSnakeCase(entity.BaseTable)}_${this.toSnakeCase(field.Name)}_get_descendants`;
    }

    public getAncestorsFunctionName(entity: EntityInfo, field: EntityFieldInfo): string {
        return `fn_${this.toSnakeCase(entity.BaseTable)}_${this.toSnakeCase(field.Name)}_get_ancestors`;
    }

    /** @inheritdoc */
    generateHierarchyFieldSelect(_entity: EntityInfo, field: EntityFieldInfo, alias: string): string {
        const rootFieldName = `Root${field.Name}`;
        const depthFieldName = `${field.Name}Depth`;
        const pathFieldName = `${field.Name}Path`;
        const isLeafFieldName = `${field.Name}IsLeaf`;
        const childCountFieldName = `${field.Name}ChildCount`;
        return `${alias}."RootID" AS ${pgDialect.QuoteIdentifier(rootFieldName)},
    ${alias}."Depth" AS ${pgDialect.QuoteIdentifier(depthFieldName)},
    ${alias}."Path" AS ${pgDialect.QuoteIdentifier(pathFieldName)},
    ${alias}."IsLeaf" AS ${pgDialect.QuoteIdentifier(isLeafFieldName)},
    ${alias}."ChildCount" AS ${pgDialect.QuoteIdentifier(childCountFieldName)}`;
    }

    /**
     * Generates a `LEFT JOIN LATERAL` clause that invokes the hierarchy metadata function
     * for a self-referencing field.
     */
    generateHierarchyFieldJoin(entity: EntityInfo, field: EntityFieldInfo, alias: string): string {
        const fnName = this.getHierarchyMetaFunctionName(entity, field);
        const tableAlias = entity.BaseTableCodeName.charAt(0).toLowerCase();
        return `LEFT JOIN LATERAL ${pgDialect.QuoteSchema(entity.SchemaName, fnName)}(${tableAlias}.${pgDialect.QuoteIdentifier(entity.FirstPrimaryKey.Name)}, ${tableAlias}.${pgDialect.QuoteIdentifier(field.Name)}) AS ${alias} ON true`;
    }

    /**
     * Generates a PostgreSQL function that recursively calculates the root record ID for a
     * self-referencing foreign key.
     */
    generateRootIDFunction(entity: EntityInfo, field: EntityFieldInfo): string {
        if (entity.PrimaryKeys.length !== 1) {
            throw new Error(`[Hierarchy] Entity '${entity.Name}' has ${entity.PrimaryKeys.length} primary key fields. MemberJunction hierarchy TVF generation requires a single-column primary key.`);
        }
        const primaryKey = entity.FirstPrimaryKey.Name;
        const primaryKeyType = this.mapSQLType(entity.FirstPrimaryKey.SQLFullType);
        const fieldName = field.Name;
        const fnName = this.getRootIDFunctionName(entity, field);

        return `
------------------------------------------------------------
----- ROOT ID FUNCTION FOR: ${entity.BaseTable}.${fieldName}
------------------------------------------------------------
CREATE OR REPLACE FUNCTION ${pgDialect.QuoteSchema(entity.SchemaName, fnName)}(
    p_record_id ${primaryKeyType},
    p_parent_id ${primaryKeyType}
) RETURNS ${primaryKeyType} AS $$
    WITH RECURSIVE cte_root_parent AS (
        -- Anchor: Start from p_parent_id if not null, otherwise start from p_record_id
        SELECT
            ${pgDialect.QuoteIdentifier(primaryKey)},
            ${pgDialect.QuoteIdentifier(fieldName)},
            ${pgDialect.QuoteIdentifier(primaryKey)} AS root_parent_id,
            0 AS depth
        FROM
            ${pgDialect.QuoteSchema(entity.SchemaName, entity.BaseTable)}
        WHERE
            ${pgDialect.QuoteIdentifier(primaryKey)} = COALESCE(p_parent_id, p_record_id)

        UNION ALL

        -- Recursive: Keep going up the hierarchy
        SELECT
            c.${pgDialect.QuoteIdentifier(primaryKey)},
            c.${pgDialect.QuoteIdentifier(fieldName)},
            c.${pgDialect.QuoteIdentifier(primaryKey)} AS root_parent_id,
            p.depth + 1 AS depth
        FROM
            ${pgDialect.QuoteSchema(entity.SchemaName, entity.BaseTable)} c
        INNER JOIN
            cte_root_parent p ON c.${pgDialect.QuoteIdentifier(primaryKey)} = p.${pgDialect.QuoteIdentifier(fieldName)}
        WHERE
            p.depth < 100  -- Prevent infinite loops
    )
    SELECT root_parent_id
    FROM cte_root_parent
    WHERE ${pgDialect.QuoteIdentifier(fieldName)} IS NULL
    ORDER BY root_parent_id
    LIMIT 1;
$$ LANGUAGE sql STABLE;
`;
    }

    /**
     * Produces the canonical name for the recursive root-finder helper function
     * generated for self-referencing fields. The function definition and the
     * view's LATERAL-JOIN reference must agree on this name (caller side calls
     * via `generateRootFieldJoin`, definition via `generateRootIDFunction`).
     *
     * Note: this intentionally does NOT match the baseline-shipped PascalCase
     * `fn{Table}{Field}_GetRootID` form, because the baseline returns
     * `TABLE("RootID" type)` and the view callers expect a scalar — using the
     * baseline name would clash with `cannot change return type of existing
     * function`. The snake_case scalar form is codegen's own naming space and
     * is consistent with how downstream views are emitted.
     */
    public getRootIDFunctionName(entity: EntityInfo, field: EntityFieldInfo): string {
        return `fn_${this.toSnakeCase(entity.BaseTable)}_${this.toSnakeCase(field.Name)}_get_root_id`;
    }

    /** @inheritdoc */
    generateRootFieldSelect(_entity: EntityInfo, field: EntityFieldInfo, alias: string): string {
        const rootFieldName = `Root${field.Name}`;
        return `${alias}.root_id AS ${pgDialect.QuoteIdentifier(rootFieldName)}`;
    }

    /**
     * Generates a `LEFT JOIN LATERAL` clause that invokes the root ID function for a
     * self-referencing field. PostgreSQL uses `LATERAL` joins (rather than SQL Server's
     * `OUTER APPLY`) to call scalar functions inline within a view definition.
     */
    generateRootFieldJoin(entity: EntityInfo, field: EntityFieldInfo, alias: string): string {
        const fnName = this.getRootIDFunctionName(entity, field);
        const tableAlias = entity.BaseTableCodeName.charAt(0).toLowerCase();
        return `LEFT JOIN LATERAL (
    SELECT ${pgDialect.QuoteSchema(entity.SchemaName, fnName)}(${tableAlias}.${pgDialect.QuoteIdentifier(entity.FirstPrimaryKey.Name)}, ${tableAlias}.${pgDialect.QuoteIdentifier(field.Name)}) AS root_id
) AS ${alias} ON true`;
    }

    // ─── PERMISSIONS ─────────────────────────────────────────────────────

    /** @inheritdoc */
    generateViewPermissions(entity: EntityInfo): string {
        const viewName = this.getBaseViewName(entity);
        const roles = this.collectPermissionRoles(entity.Permissions);
        if (roles.length === 0) return '';
        return roles.map((role: string) =>
            `GRANT SELECT ON ${pgDialect.QuoteSchema(entity.SchemaName, viewName)} TO ${pgDialect.QuoteIdentifier(role)};`
        ).join('\n');
    }

    /**
     * Generates `GRANT EXECUTE ON FUNCTION` statements for the given CRUD function,
     * granting access to each role that has the corresponding permission (Create, Update,
     * or Delete) on the entity.
     */
    generateCRUDPermissions(entity: EntityInfo, routineName: string, type: CRUDType): string {
        const roles: string[] = [];
        for (const ep of entity.Permissions) {
            if (!ep.RoleSQLName || ep.RoleSQLName.length === 0) continue;
            if (
                (type === CRUDType.Create && ep.CanCreate) ||
                (type === CRUDType.Update && ep.CanUpdate) ||
                (type === CRUDType.Delete && ep.CanDelete)
            ) {
                roles.push(ep.RoleSQLName);
            }
        }
        if (roles.length === 0) return '';
        return roles.map((role: string) =>
            `GRANT EXECUTE ON FUNCTION ${pgDialect.QuoteSchema(entity.SchemaName, routineName)} TO ${pgDialect.QuoteIdentifier(role)};`
        ).join('\n');
    }

    /** @inheritdoc */
    generateFullTextSearchPermissions(entity: EntityInfo, functionName: string): string {
        const roles = this.collectPermissionRoles(entity.Permissions);
        if (roles.length === 0) return '';
        return roles.map((role: string) =>
            `GRANT EXECUTE ON FUNCTION ${pgDialect.QuoteSchema(entity.SchemaName, functionName)} TO ${pgDialect.QuoteIdentifier(role)};`
        ).join('\n');
    }

    // ─── CASCADE DELETES ─────────────────────────────────────────────────

    /** @inheritdoc */
    generateSingleCascadeOperation(context: CascadeDeleteContext): string {
        const { parentEntity, relatedEntity, fkField, operation } = context;

        // Use the operation type from the orchestrator's decision
        if (operation === 'update') {
            return this.generateCascadeUpdateToNull(parentEntity, relatedEntity, fkField);
        }
        return this.generateCascadeCursorDelete(parentEntity, relatedEntity, fkField);
    }

    // ─── TIMESTAMP COLUMNS ───────────────────────────────────────────────

    /**
     * Generates a PL/pgSQL `DO $$` block that conditionally adds `__mj_CreatedAt` and
     * `__mj_UpdatedAt` columns to a table using `TIMESTAMPTZ` type with a UTC default.
     * Uses `information_schema` checks to skip columns that already exist.
     */
    generateTimestampColumns(schema: string, tableName: string): string {
        return `
-- Add timestamp columns to ${tableName}
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = '${schema}' AND table_name = '${tableName}' AND column_name = '__mj_CreatedAt') THEN
        ALTER TABLE ${pgDialect.QuoteSchema(schema, tableName)}
        ADD COLUMN __mj_CreatedAt TIMESTAMPTZ NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = '${schema}' AND table_name = '${tableName}' AND column_name = '__mj_UpdatedAt') THEN
        ALTER TABLE ${pgDialect.QuoteSchema(schema, tableName)}
        ADD COLUMN __mj_UpdatedAt TIMESTAMPTZ NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC');
    END IF;
END $$;
`;
    }

    // ─── PARAMETER / FIELD HELPERS ───────────────────────────────────────

    /**
     * Builds the parameter declaration list for a PostgreSQL CRUD function signature.
     * Each parameter is prefixed with `p_` and uses the PostgreSQL-mapped type. For
     * CREATE functions, parameters with default values or primary keys get `DEFAULT NULL`
     * to allow optional arguments, and PostgreSQL's requirement that all subsequent
     * parameters also have defaults once the first default appears is respected.
     */
    /**
     * PostgreSQL parameter types are mapped from the entity field's
     * T-SQL `SQLFullType` (the metadata is canonically T-SQL) into the
     * equivalent PostgreSQL type. SQL Server's base-class default would
     * pass the type through unchanged, which would emit invalid PG
     * function signatures.
     */
    protected renderParameterType(ef: EntityFieldInfo): string {
        return this.mapSQLType(ef.SQLFullType);
    }

    /**
     * PostgreSQL override: same tolerant-SP shape as the base class, but
     * with PG's "all params after the first DEFAULT must also have DEFAULTs"
     * rule enforced. Once any parameter becomes optional (or a `_Clear`
     * companion is emitted), every subsequent parameter is forced to
     * `DEFAULT NULL` even if it would otherwise be required, because PG
     * function signatures don't allow gaps between defaulted params.
     *
     * All decision logic and dialect-syntax bits route through the same
     * base-class helpers / dialect methods used by SQL Server — the only
     * thing that differs is the sticky-defaults walk.
     */
    generateCRUDParamString(entityFields: EntityFieldInfo[], isUpdate: boolean): string {
        const dialect = this.Dialect;
        const nullDefault = dialect.ParameterDefault(dialect.NullLiteral);
        const parts: string[] = [];
        let foundDefault = false;
        for (const ef of entityFields) {
            if (!this.shouldIncludeFieldInParams(ef, isUpdate)) continue;

            // _Clear companion is emitted immediately before its main parameter
            // for nullable columns whose database default is non-NULL.
            //
            // Type was historically `bit DEFAULT 0` (a copy-paste from the
            // SQL Server emitter). PG has no implicit cast from integer to
            // its `bit` type, and `bit` here was meant to mean a boolean
            // anyway — so the function compiles but every caller that passes
            // `0`/`false` fails type-checking. Emit native PG `boolean DEFAULT FALSE`.
            if (!ef.IsPrimaryKey && this.needsClearCompanion(ef)) {
                parts.push(`${dialect.ParameterRef(ef.CodeName + '_Clear')} ${dialect.BooleanParameterType()}${dialect.ParameterDefault(dialect.BooleanLiteral(false))}`);
                foundDefault = true;
            }

            const isOptional = !this.isParamRequired(ef, isUpdate);
            // Sticky-defaults: once any param has a default, all subsequent params
            // must also be defaulted in PG. We default them to NULL.
            const needsStickyDefault = foundDefault && !isOptional;
            const defaultClause = isOptional || needsStickyDefault ? nullDefault : '';
            if (defaultClause) foundDefault = true;

            parts.push(`${dialect.ParameterRef(ef.CodeName)} ${this.renderParameterType(ef)}${defaultClause}`);
        }
        return parts.join(',\n    ');
    }

    /**
     * PostgreSQL override of the INSERT default-value renderer to handle
     * the BIT→BOOLEAN type-strictness gap. The base implementation passes
     * the SQL Server-style default through unchanged, but PG's strict
     * typing means `COALESCE(boolean_param, 0)` fails with "operator does
     * not exist: boolean = integer". This override remaps `BIT` defaults
     * (`0`/`1`) to `BOOLEAN` literals (`FALSE`/`TRUE`) when the field's
     * underlying type is bit/boolean.
     */
    protected formatInsertDefaultValue(ef: EntityFieldInfo): string {
        return this.formatBooleanCompatibleDefault(ef);
    }

    // ─── ROUTINE NAMING ──────────────────────────────────────────────────

    /** @inheritdoc */
    getCRUDRoutineName(entity: EntityInfo, type: CRUDType): string {
        // Match the baseline-ported `sp{Verb}{TableCodeName}` convention (SQL Server
        // names ported verbatim into PG). The runtime PostgreSQLDataProvider calls
        // these names directly — diverging here (e.g. `fn_create_<snake>`) means new
        // CodeGen runs leave functions the runtime can never find.
        const tableCodeName = entity.BaseTableCodeName;
        switch (type) {
            case CRUDType.Create:
                return entity.spCreate || `spCreate${tableCodeName}`;
            case CRUDType.Update:
                return entity.spUpdate || `spUpdate${tableCodeName}`;
            case CRUDType.Delete:
                return entity.spDelete || `spDelete${tableCodeName}`;
        }
    }

    // ─── SQL HEADERS ─────────────────────────────────────────────────────

    /** @inheritdoc */
    generateSQLFileHeader(entity: EntityInfo, itemName: string): string {
        return `-- ============================================================
-- PostgreSQL Generated SQL for Entity: ${entity.Name}
-- Item: ${itemName}
-- Generated at: ${new Date().toISOString()}
-- ============================================================
`;
    }

    /** @inheritdoc */
    generateAllEntitiesSQLFileHeader(): string {
        return `-- ============================================================
-- PostgreSQL Generated SQL for All Entities
-- Generated at: ${new Date().toISOString()}
-- ============================================================
`;
    }

    // ─── UTILITY ─────────────────────────────────────────────────────────

    /**
     * SQL Server built-in functions (e.g., `NEWID()` to `gen_random_uuid()`,
     * `GETUTCDATE()` to `NOW() AT TIME ZONE 'UTC'`), strips outer parentheses and
     * surrounding single quotes, and re-applies quoting based on the {@link needsQuotes}
     * flag. Returns `'NULL'` for empty or whitespace-only input.
     */
    formatDefaultValue(defaultValue: string, needsQuotes: boolean): string {
        if (!defaultValue || defaultValue.trim().length === 0) return 'NULL';

        let trimmedValue = defaultValue.trim();
        const lowerValue = trimmedValue.toLowerCase();

        // Map SQL Server and PostgreSQL functions to canonical PostgreSQL equivalents
        const functionMap: Record<string, string> = {
            'newid()': 'gen_random_uuid()',
            'newsequentialid()': 'gen_random_uuid()',
            'gen_random_uuid()': 'gen_random_uuid()',
            'getdate()': "NOW() AT TIME ZONE 'UTC'",
            'getutcdate()': "NOW() AT TIME ZONE 'UTC'",
            'sysdatetime()': "NOW() AT TIME ZONE 'UTC'",
            'sysdatetimeoffset()': "NOW() AT TIME ZONE 'UTC'",
            'sysutcdatetime()': "NOW() AT TIME ZONE 'UTC'",
            'now()': 'NOW()',
            'current_timestamp': 'CURRENT_TIMESTAMP',
            'user_name()': 'CURRENT_USER',
            'suser_name()': 'SESSION_USER',
            'system_user': 'CURRENT_USER',
        };

        for (const [sqlFunc, pgFunc] of Object.entries(functionMap)) {
            if (lowerValue.includes(sqlFunc)) {
                return pgFunc;
            }
        }

        // Remove outer parentheses if present
        if (trimmedValue.startsWith('(') && trimmedValue.endsWith(')')) {
            trimmedValue = trimmedValue.substring(1, trimmedValue.length - 1);
        }

        // PG default values can come back as typed literals like
        // `'Pending'::character varying` or `'Active'::text`. The cast
        // suffix means the value is already a fully-formed PG expression —
        // stripping the leading-and-trailing quotes (line 14721 bug:
        // `'Pending'::character varying` → cleanValue = `Pending'::character varying`
        // → re-wrap → `'Pending'::character varying'` which is invalid SQL)
        // is wrong here. Detect this shape and pass through verbatim.
        if (/^'.*'::\w+(\s*\(\s*\d+\s*\))?(\s*\[\s*\])?$/.test(trimmedValue)) {
            return trimmedValue;
        }

        // Remove surrounding quotes for clean value
        let cleanValue = trimmedValue;
        if (cleanValue.startsWith("'") && cleanValue.endsWith("'")) {
            cleanValue = cleanValue.substring(1, cleanValue.length - 1);
        }

        if (needsQuotes) {
            // Single-quote-escape the cleaned value (SQL standard: '' → ').
            // Without this, a default of `O'Brien` would re-emit as `'O'Brien'`
            // which closes the literal at the apostrophe and then fails parsing.
            const escaped = cleanValue.replace(/'/g, "''");
            return `'${escaped}'`;
        }
        return cleanValue;
    }

    /**
     * Builds a set of PL/pgSQL components for working with an entity's primary key(s)
     * in cascade operations: variable declarations, SELECT field list, FETCH INTO
     * variable list, and named routine parameter assignments. Used by cascade delete
     * and update-to-NULL generators to construct cursor-based loops.
     */
    buildPrimaryKeyComponents(entity: EntityInfo, prefix?: string): {
        varDeclarations: string;
        selectFields: string;
        fetchInto: string;
        routineParams: string;
    } {
        const varPrefix = prefix || 'v_related_';
        const varDecls: string[] = [];
        const selectFlds: string[] = [];
        const fetchVars: string[] = [];
        const routineParamParts: string[] = [];

        for (const pk of entity.PrimaryKeys) {
            const varName = `${varPrefix}${this.toSnakeCase(pk.CodeName)}`;
            const sqlType = this.mapSQLType(pk.SQLFullType);

            varDecls.push(`${varName} ${sqlType}`);
            selectFlds.push(pgDialect.QuoteIdentifier(pk.Name));
            fetchVars.push(varName);
            // Param NAME must use the canonical flat builder (ParameterRef → `p_<lower>`) so it
            // matches the CRUD routine's declared signature; only the local VARIABLE (v_…) uses
            // snake_case. Using toSnakeCase here produced `p_record_key` for a multi-word PK while
            // the routine declared `p_recordkey`, breaking cascade delete/update-to-NULL on PG.
            routineParamParts.push(`${pgDialect.ParameterRef(pk.CodeName)} := ${varName}`);
        }

        return {
            varDeclarations: varDecls.join(', '),
            selectFields: selectFlds.join(', '),
            fetchInto: fetchVars.join(', '),
            routineParams: routineParamParts.join(', '),
        };
    }

    // ─── METADATA MANAGEMENT: STORED PROCEDURE CALLS ─────────────────

    /** @inheritdoc */
    callRoutineSQL(schema: string, routineName: string, params: string[], _paramNames?: string[], discardResult?: boolean): string {
        const qualifiedName = pgDialect.QuoteSchema(schema, routineName);
        const paramList = params.join(', ');
        if (discardResult) {
            // `SELECT * FROM routine(...)` is not universally valid on PostgreSQL: a function
            // declared `RETURNS SETOF record` — which spDeleteEntityWithCoreDependencies is — is
            // rejected with "a column definition list is required for functions returning record",
            // and a work-performing routine has no column list to supply. PERFORM runs the function
            // and discards whatever it returns, which is exactly what these callers want.
            //
            // Left broken, this fails in a way that points somewhere else entirely: the
            // entity-pruning pass throws per entity, CodeGen logs "Error removing metadata for
            // entity undefined" and continues, and the run reports success having pruned nothing.
            return `DO $$ BEGIN PERFORM ${qualifiedName}(${paramList}); END $$`;
        }
        return `SELECT * FROM ${qualifiedName}(${paramList})`;
    }

    // ─── METADATA MANAGEMENT: CONDITIONAL INSERT ─────────────────────

    /** @inheritdoc */
    conditionalInsertSQL(checkQuery: string, insertSQL: string): string {
        return `DO $$ BEGIN\n   IF NOT EXISTS (${checkQuery}) THEN\n      ${insertSQL};\n   END IF;\nEND $$`;
    }

    /** @inheritdoc */
    wrapInsertWithConflictGuard(_conflictCheckSQL: string): { prefix: string; suffix: string } {
        return { prefix: '', suffix: 'ON CONFLICT DO NOTHING' };
    }

    // ─── METADATA MANAGEMENT: DDL OPERATIONS ─────────────────────────

    /** @inheritdoc */
    addColumnSQL(schema: string, tableName: string, columnName: string, dataType: string, nullable: boolean, defaultExpression?: string): string {
        const table = pgDialect.QuoteSchema(schema, tableName);
        const col = pgDialect.QuoteIdentifier(columnName);
        const nullClause = nullable ? 'NULL' : 'NOT NULL';
        const defaultClause = defaultExpression ? ` DEFAULT ${defaultExpression}` : '';
        return `ALTER TABLE ${table} ADD COLUMN ${col} ${dataType} ${nullClause}${defaultClause}`;
    }

    /** @inheritdoc */
    alterColumnTypeAndNullabilitySQL(schema: string, tableName: string, columnName: string, dataType: string, nullable: boolean): string {
        const table = pgDialect.QuoteSchema(schema, tableName);
        const col = pgDialect.QuoteIdentifier(columnName);
        const nullAction = nullable ? 'DROP NOT NULL' : 'SET NOT NULL';
        return `ALTER TABLE ${table} ALTER COLUMN ${col} TYPE ${dataType}, ALTER COLUMN ${col} ${nullAction}`;
    }

    /** @inheritdoc */
    addDefaultConstraintSQL(schema: string, tableName: string, columnName: string, defaultExpression: string): string {
        const table = pgDialect.QuoteSchema(schema, tableName);
        const col = pgDialect.QuoteIdentifier(columnName);
        // Prepend SET CONSTRAINTS ALL IMMEDIATE so any deferred constraint
        // trigger events queued by earlier INSERTs in the same migration
        // transaction fire NOW, freeing the target table for ALTER. Without
        // this, mid-migration ALTER TABLE on a table that received earlier
        // INSERTs fails with `cannot ALTER TABLE because it has pending
        // trigger events` — codegen interleaves INSERTs (data sync) and
        // ALTER TABLE (default refresh) within a single Skyway-wrapped
        // transaction so the queue must be flushed at the boundary.
        return `SET CONSTRAINTS ALL IMMEDIATE;\nALTER TABLE ${table} ALTER COLUMN ${col} SET DEFAULT ${defaultExpression}`;
    }

    /**
     * Generates a PL/pgSQL `DO $$` block that drops both a named CHECK constraint (if one
     * exists on the column, found via `pg_catalog.pg_constraint`) and the column's default
     * value. Uses dynamic SQL (`EXECUTE format(...)`) to drop the constraint by name,
     * then unconditionally runs `ALTER COLUMN ... DROP DEFAULT`.
     */
    dropDefaultConstraintSQL(schema: string, tableName: string, columnName: string): string {
        const table = pgDialect.QuoteSchema(schema, tableName);
        const col = pgDialect.QuoteIdentifier(columnName);
        // SET CONSTRAINTS ALL IMMEDIATE outside the DO block so it executes
        // first; any deferred trigger events from earlier INSERTs in the
        // same transaction fire NOW, clearing the queue before the ALTER
        // TABLE inside this DO block runs. See addDefaultConstraintSQL for
        // the rationale on why this is needed.
        return `SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${schema}'
     AND rel.relname = '${tableName}'
     AND att.attname = '${columnName}'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${schema}', '${tableName}', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE ${table} ALTER COLUMN ${col} DROP DEFAULT;
END $$`;
    }

    /** @inheritdoc */
    dropObjectSQL(objectType: 'VIEW' | 'PROCEDURE' | 'FUNCTION', schema: string, name: string): string {
        // PostgreSQL uses FUNCTION for both procedures and functions in DROP statements
        const typeStr = objectType === 'PROCEDURE' ? 'FUNCTION' : objectType;
        const qualifiedName = pgDialect.QuoteSchema(schema, name);
        const cascade = (objectType === 'PROCEDURE' || objectType === 'FUNCTION') ? ' CASCADE' : '';
        return `DROP ${typeStr} IF EXISTS ${qualifiedName}${cascade}`;
    }

    // ─── METADATA MANAGEMENT: VIEW INTROSPECTION ─────────────────────

    /** @inheritdoc */
    getViewExistsSQL(): string {
        return `SELECT 1 FROM information_schema.views WHERE table_name = @ViewName AND table_schema = @SchemaName`;
    }

    /** @inheritdoc */
    getViewColumnsSQL(schema: string, viewName: string): string {
        return `SELECT
    column_name AS "FieldName",
    data_type AS "Type",
    COALESCE(character_maximum_length, 0) AS "Length",
    COALESCE(numeric_precision, 0) AS "Precision",
    COALESCE(numeric_scale, 0) AS "Scale",
    CASE WHEN is_nullable = 'YES' THEN TRUE ELSE FALSE END AS "AllowsNull"
FROM information_schema.columns
WHERE table_schema = '${schema}'
  AND table_name = '${viewName}'
ORDER BY ordinal_position`;
    }

    // ─── METADATA MANAGEMENT: TYPE SYSTEM ────────────────────────────

    /** @inheritdoc */
    get TimestampType(): string {
        return 'TIMESTAMPTZ';
    }

    /**
     * Compares two PostgreSQL data type strings for equivalence, accounting for common
     * aliases. For example, `'timestamptz'` and `'timestamp with time zone'` are
     * considered equal. Returns `true` if the types match directly or via alias lookup.
     */
    compareDataTypes(reported: string, expected: string): boolean {
        if (reported === expected) return true;
        const aliases: Record<string, string> = {
            'timestamptz': 'timestamp with time zone',
            'timestamp with time zone': 'timestamptz',
        };
        return aliases[reported] === expected;
    }

    // ─── METADATA MANAGEMENT: PLATFORM CONFIGURATION ─────────────────

    /** @inheritdoc */
    getSystemSchemasToExclude(): string[] {
        return ['information_schema', 'pg_catalog', 'pg_toast', 'pg_temp_1', 'pg_toast_temp_1'];
    }

    /**
     * PostgreSQL has no view-refresh mechanism, so this always returns `false`.
     *
     * NOT because PG views track their source automatically — they do not. PG expands `SELECT *`
     * into an explicit column list at creation and freezes it; a view gains a new underlying column
     * only when the view itself is recreated. CodeGen gets away without a refresh step because it
     * emits every generated view with an explicit column list and re-issues `CREATE OR REPLACE` on
     * every run, so the definition it controls is always current.
     *
     * That holds only for views CodeGen writes. A view CodeGen does not own — such as the
     * application-owned outer view of a layered entity — has no mechanism here to re-resolve it, and
     * `generateViewRefreshSQL` returning empty is a genuine no-op rather than a cheap one. This is
     * why {@link generateBaseView} refuses layered entities outright on PostgreSQL.
     */
    get NeedsViewRefresh(): boolean {
        return false;
    }

    /** @inheritdoc */
    generateViewRefreshSQL(_schema: string, _viewName: string): string {
        return '';
    }

    /** @inheritdoc */
    generateIfViewExistsSQL(schema: string, viewName: string, innerSQL: string): string {
        // Reached only if a future change enables layering on PG; today generateBaseView throws
        // first. Implemented properly regardless, so the guard is not a lie if that day comes.
        const escaped = innerSQL.replace(/'/g, "''");
        const regclass = `${schema}.${viewName}`.replace(/'/g, "''");
        return `DO $if_view_exists$
BEGIN
  IF to_regclass('${regclass}') IS NOT NULL THEN
    EXECUTE '${escaped}';
  END IF;
END
$if_view_exists$;
`;
    }

    /** @inheritdoc */
    generateViewTestQuerySQL(schema: string, viewName: string): string {
        return `SELECT * FROM ${pgDialect.QuoteSchema(schema, viewName)} LIMIT 1`;
    }

    /**
     * PostgreSQL requires a nullability fix for virtual (computed) fields in views.
     * View columns derived from expressions may report incorrect nullability in
     * `information_schema.columns`, so CodeGen must correct these after view creation.
     */
    get NeedsVirtualFieldNullabilityFix(): boolean {
        return true;
    }

    // ─── METADATA MANAGEMENT: SQL QUOTING ────────────────────────────

    /**
     * Quotes mixed-case identifiers in a SQL string for PostgreSQL compatibility.
     *
     * The tokenizer lives in `@memberjunction/sql-dialect` and is shared with
     * `PostgreSQLDataProvider.autoQuoteIdentifiers`, so codegen-time and runtime SQL are
     * quoted by one implementation rather than two hand-synced copies. See
     * {@link AutoQuotePostgreSQLIdentifiers} for the quoting rule and its rationale.
     *
     * @inheritdoc
     */
    quoteSQLForExecution(sql: string): string {
        return AutoQuotePostgreSQLIdentifiers(sql);
    }

    // ─── METADATA MANAGEMENT: DEFAULT VALUE PARSING ──────────────────

    /**
     * Parses a PostgreSQL column default value by stripping PG-specific type cast syntax
     * (e.g., `'2024-01-01'::timestamp` becomes `'2024-01-01'`). Returns `null` for
     * auto-increment sequences (`nextval(...)`) and for null/undefined input, indicating
     * no meaningful default.
     */
    parseColumnDefaultValue(sqlDefaultValue: string): string | null {
        if (sqlDefaultValue === null || sqlDefaultValue === undefined) {
            return null;
        }

        let sResult = sqlDefaultValue;

        // Strip type casts like '2024-01-01'::timestamp, 'value'::character varying
        const castMatch = sResult.match(/^'(.*)'::.*$/);
        if (castMatch) {
            sResult = castMatch[1];
        }

        // Strip nextval('...') for auto-increment sequences - treated as no default
        if (sResult.match(/^nextval\(/i)) {
            return null;
        }

        return sResult;
    }

    // ─── METADATA MANAGEMENT: COMPLEX SQL GENERATION ─────────────────

    /** @inheritdoc */
    getPendingEntityFieldsSQL(mjCoreSchema: string, entityIDs?: string[]): string {
        const qs = pgDialect.QuoteSchema.bind(pgDialect);
        return this.buildPendingEntityFieldsQuery(mjCoreSchema, qs, entityIDs);
    }

    /** @inheritdoc */
    getCheckConstraintsSchemaFilter(_excludeSchemas: string[]): string {
        // PostgreSQL view already handles schema filtering
        return '';
    }

    /** @inheritdoc */
    getEntitiesWithMissingBaseTablesFilter(): string {
        // PostgreSQL query doesn't need this filter
        return '';
    }

    /** @inheritdoc */
    getFixVirtualFieldNullabilitySQL(mjCoreSchema: string): string {
        const qs = pgDialect.QuoteSchema.bind(pgDialect);
        return this.buildFixVirtualFieldNullabilityUpdateSQL(mjCoreSchema, qs);
    }

    /** @inheritdoc */
    getMetadataSupportObjectsSQL(mjCoreSchema: string): string | null {
        return buildMetadataSupportObjectsSQL(mjCoreSchema);
    }

    // ─── METADATA MANAGEMENT: SQL FILE EXECUTION ─────────────────────

    /**
     * Executes a SQL file against the PostgreSQL database using an in-process `pg` client.
     * Mirrors the SQL Server provider's in-process approach so CodeGen does not depend on
     * the `psql` CLI being installed on the host. Reads connection parameters from
     * environment variables (`PG_HOST`, `PG_PORT`, `PG_DATABASE`, `PG_USERNAME`,
     * `PG_PASSWORD`) with fallback to `configInfo` values.
     */
    async executeSQLFileViaShell(filePath: string): Promise<boolean> {
        const absoluteFilePath = path.resolve(process.cwd(), filePath);
        let sql: string;
        try {
            sql = fs.readFileSync(absoluteFilePath, 'utf-8');
        } catch (e) {
            logError(`[CodeGen] Failed to read SQL file ${absoluteFilePath}: ${e instanceof Error ? e.message : e}`);
            return false;
        }
        if (!sql.trim()) return true;

        // [Large Schema Series] pooled client (was `new pg.Client()` per file) —
        // reuses a physical connection instead of a fresh handshake every call.
        let client: Awaited<ReturnType<typeof this.acquireCodeGenClient>> | undefined;
        try {
            client = await this.acquireCodeGenClient();
            // Postgres executes a multi-statement script in a single query call. A single
            // statement error aborts the rest of the batch server-side (simple query
            // protocol) — so silently converting that to `return true` hid real data loss:
            // CodeGen-generated DROP VIEW CASCADE would succeed, the follow-up CREATE
            // would fail, and the caller would believe everything was fine. Return false
            // on error and log it as an error, not a warning, so the per-entity batching
            // loops can aggregate and (in strict mode) halt the install.
            try {
                await client.query(sql);
                return true;
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                // Recorded (not just logged) so STEP 4 can attribute a downstream permissions
                // failure on the same object back to this error — MJ#3975 §1.
                SQLExecutionDiagnostics.Record({
                    file: path.basename(absoluteFilePath),
                    objectName: ExtractCreatedObjectName(sql),
                    message: msg,
                });
                logError(`[CodeGen] SQL execution failed in ${path.basename(absoluteFilePath)}: ${msg.substring(0, 400)}`);
                return false;
            }
        } catch (e) {
            logError(`[CodeGen] Failed to execute SQL file ${absoluteFilePath}: ${e instanceof Error ? e.message : e}`);
            return false;
        } finally {
            if (client) client.release();
        }
    }

    /** @inheritdoc */
    getRoutineNamesBySchemaSQL(schemas: string[]): string {
        if (schemas.length === 0) return '';
        // pg_proc holds every function (PL/pgSQL, SQL, C, etc.). prokind filters:
        //   'f' = normal function, 'p' = procedure, 'a' = aggregate, 'w' = window.
        // CodeGen emits 'f' (CRUD functions, root-ID TVFs, FTS functions) and 'p'
        // is unused on PG today but cheap to include in case we add procedures later.
        const inList = schemas.map(s => `'${s.replace(/'/g, "''")}'`).join(', ');
        return `SELECT n.nspname AS schema_name, p.proname AS routine_name
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.prokind IN ('f', 'p')
  AND n.nspname IN (${inList});`;
    }

    /**
     * PG-specific base-view regeneration with 42P16 recovery.
     *
     * Runs the provided `CREATE OR REPLACE VIEW` SQL through `executeWithFallback`
     * on a dedicated connection: happy path issues the CREATE OR REPLACE directly,
     * and only on SQLSTATE 42P16 does the capture/drop/recreate/restore dance fire
     * inside a transaction that preserves every dependent view, function, grant,
     * comment, and owner. See `viewFallback.ts` for the contract.
     *
     * `willRegenerate` is passed through so dependents CodeGen is about to rebuild
     * in the same run are skipped at restore time (avoids restoring a stale
     * captured definition against a newly-regenerated target).
     */
    override async regenerateBaseView(
        entity: EntityInfo,
        viewSQL: string,
        willRegenerate?: Set<string>
    ): Promise<void> {
        // [Large Schema Series] pooled client (was `new pg.Client()` per entity).
        const client = await this.acquireCodeGenClient();
        try {
            // PG-only: emit recursive-FK root-ID helpers ahead of the view.
            //
            // PG codegen intentionally uses snake_case scalar
            // `fn_<table>_<field>_get_root_id` rather than the SS baseline's
            // PascalCase table-returning `fn<Table><Field>_GetRootID` — see
            // `getRootIDFunctionName`. The two names CAN'T coexist as the
            // same function (different return type), so codegen owns its
            // own snake_case namespace.
            //
            // Consequence: on a fresh PG database, the snake_case helpers
            // don't exist until codegen has run successfully at least once.
            // The `recompileAllBaseViews` → `regenerateFailedBaseViews`
            // recovery path used to call `generateBaseView` directly with
            // no helper emission, so customer first-run codegen against a
            // managed PG (where only baseline PascalCase functions exist)
            // hit `function fn_ai_agent_run_parent_run_id_get_root_id does
            // not exist` when LATERAL JOINs in the regenerated view body
            // resolved to the snake_case scalar form.
            //
            // SS doesn't have this problem because its codegen-generated
            // helper name matches the baseline name — the baseline always
            // satisfies the LATERAL JOIN. Hence the fix lives here, not
            // in the dialect-agnostic recovery loop.
            const recursiveFKs = entity.Fields.filter(f =>
                f.RelatedEntityID != null && UUIDsEqual(f.RelatedEntityID, entity.ID)
            );
            for (const field of recursiveFKs) {
                const metaSQL = this.generateHierarchyMetaFunction(entity, field);
                if (metaSQL && metaSQL.trim().length > 0) {
                    await client.query(metaSQL);
                }
                const descSQL = this.generateDescendantsFunction(entity, field);
                if (descSQL && descSQL.trim().length > 0) {
                    await client.query(descSQL);
                }
                const ancSQL = this.generateAncestorsFunction(entity, field);
                if (ancSQL && ancSQL.trim().length > 0) {
                    await client.query(ancSQL);
                }
                const fnSQL = this.generateRootIDFunction(entity, field);
                if (fnSQL && fnSQL.trim().length > 0) {
                    await client.query(fnSQL);
                }
            }

            await executeWithFallback({
                client,
                schema: entity.SchemaName,
                viewName: entity.BaseView,
                createOrReplaceSQL: viewSQL,
                willRegenerate,
                // Pass the base table so viewFallback can materialize a stub
                // first if the view body has a self-reference and the view
                // doesn't yet exist (e.g. vwRecordChanges joins to itself for
                // parent lookup; if it was CASCADE-dropped earlier in the
                // same codegen run, CREATE OR REPLACE can't resolve the
                // self-reference until a placeholder exists).
                baseTableQualified: pgDialect.QuoteSchema(entity.SchemaName, entity.BaseTable),
            });
        } finally {
            client.release();
        }
    }

    /**
     * Phased per-entity execution for PG. Runs view → CRUD functions → view
     * permissions against the target DB, guaranteeing phase 2 is skipped if
     * phase 1 failed (so we never leave `fn_create_*` functions pointing at
     * a missing or stale view's rowtype).
     *
     * Phase 1 routes through `executeWithFallback` so a 42P16 triggers the
     * capture/drop/recreate/restore flow rather than blowing up. Phase 2 runs
     * each CRUD function's CREATE individually — we do NOT concatenate them
     * because node-pg's simple query protocol would then abort the whole
     * batch on the first failure; running them separately gives a per-routine
     * error signal. Phase 3 applies view-level GRANTs.
     */
    override async executeEntityPhased(opts: {
        entity: EntityInfo;
        tvfSQL: string;
        viewSQL: string;
        crudCreateSQL: string;
        crudUpdateSQL: string;
        crudDeleteSQL: string;
        viewPermSQL: string;
        willRegenerate?: Set<string>;
    }): Promise<PhasedExecutionResult> {
        // [Large Schema Series] pooled client (was `new pg.Client()` per entity —
        // the per-entity handshake that dominated manageSQLScriptsAndExecution).
        const client = await this.acquireCodeGenClient();
        try {
            // ── Phase 0: root-ID TVFs ────────────────────────────────────
            // The base view references these helper functions; PG rejects
            // CREATE VIEW with `function does not exist` if they aren't
            // installed first. Run as a single batch — these are independent
            // CREATE OR REPLACE FUNCTION statements separated by GO.
            if (opts.tvfSQL && opts.tvfSQL.trim()) {
                try {
                    await client.query(opts.tvfSQL);
                } catch (e) {
                    return {
                        success: false,
                        phase: 'tvf',
                        error: e instanceof Error ? e : new Error(String(e)),
                    };
                }
            }

            // ── Phase 1: base view (fallback-aware for 42P16) ────────────
            if (opts.viewSQL && opts.viewSQL.trim()) {
                try {
                    await executeWithFallback({
                        client,
                        schema: opts.entity.SchemaName,
                        viewName: opts.entity.BaseView,
                        createOrReplaceSQL: opts.viewSQL,
                        willRegenerate: opts.willRegenerate,
                        baseTableQualified: pgDialect.QuoteSchema(opts.entity.SchemaName, opts.entity.BaseTable),
                    });
                } catch (e) {
                    return {
                        success: false,
                        phase: 'view',
                        error: e instanceof Error ? e : new Error(String(e)),
                    };
                }
            }

            // ── Phase 2: CRUD functions (skipped if phase 1 failed) ──────
            // Run each CREATE FUNCTION separately so per-function errors
            // don't abort the others via simple-query-protocol semantics.
            for (const crudSQL of [opts.crudCreateSQL, opts.crudUpdateSQL, opts.crudDeleteSQL]) {
                if (!crudSQL || !crudSQL.trim()) continue;
                try {
                    await client.query(crudSQL);
                } catch (e) {
                    return {
                        success: false,
                        phase: 'functions',
                        error: e instanceof Error ? e : new Error(String(e)),
                    };
                }
            }

            // ── Phase 3: view permissions ────────────────────────────────
            if (opts.viewPermSQL && opts.viewPermSQL.trim()) {
                try {
                    await client.query(opts.viewPermSQL);
                } catch (e) {
                    return {
                        success: false,
                        phase: 'permissions',
                        error: e instanceof Error ? e : new Error(String(e)),
                    };
                }
            }

            return { success: true, phase: null };
        } finally {
            client.release();
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PRIVATE HELPERS
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * [Large Schema Series] Acquire a POOLED PG client for a per-entity codegen
     * operation, replacing the previous `new pg.Client()` + connect + end that
     * ran once PER ENTITY. On a large-schema run that was ~one full connection
     * handshake per entity (≈2,000 on a 2k-table install) — a dominant cost of
     * the manageSQLScriptsAndExecution phase. The module-cached pool (via
     * {@link PGConnection}) hands back a reused physical connection AND applies
     * the codegen `statement_timeout` GUC that the ad-hoc clients never set.
     *
     * Callers MUST `release()` the returned client in a `finally`. The connection
     * is always transaction-clean at release time: `executeWithFallback` issues
     * its own BEGIN/COMMIT and rolls back internally on error, and the other
     * callers only run autonomous simple-query statements that never open a
     * transaction — so a normal `release()` (not `release(err)`) is correct on
     * every path and no poisoned connection is returned to the pool.
     *
     * Env-var precedence is already resolved into `configInfo` upstream (see
     * CLAUDE.md — PG_* wins on the PostgreSQL platform, resolved once in
     * Config/config.ts), so the pool targets the same host/db the per-entity
     * clients did; the previous `process.env.PG_* ?? configInfo.*` reads here
     * were redundant.
     */
    private async acquireCodeGenClient() {
        const pool = await PGConnection();
        return pool.connect();
    }

    /**
     * Converts a PascalCase or camelCase string to snake_case.
     * Handles consecutive uppercase letters (e.g., "ID" → "id", "HTMLParser" → "html_parser").
     */
    private toSnakeCase(name: string): string {
        return name
            // Insert underscore between a lowercase letter and an uppercase letter
            .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
            // Insert underscore between consecutive uppercase letters followed by a lowercase letter
            .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
            .toLowerCase()
            .replace(/__+/g, '_');
    }

    /**
     * Maps a SQL Server type string to its PostgreSQL equivalent.
     */
    private mapSQLType(sqlType: string): string {
        const lower = sqlType.toLowerCase().trim();
        if (lower.startsWith('uniqueidentifier')) return 'UUID';
        if (lower.startsWith('nvarchar(max)') || lower.startsWith('varchar(max)')) return 'TEXT';
        if (lower.startsWith('nvarchar') || lower.startsWith('nchar')) return sqlType.replace(/^n/i, '');
        if (lower === 'bit') return 'BOOLEAN';
        if (lower === 'datetime' || lower === 'datetime2') return 'TIMESTAMP';
        if (lower === 'datetimeoffset') return 'TIMESTAMPTZ';
        if (lower === 'money' || lower === 'smallmoney') return 'NUMERIC(19,4)';
        if (lower === 'tinyint') return 'SMALLINT';
        if (lower.startsWith('image') || lower.startsWith('varbinary')) return 'BYTEA';
        if (lower === 'xml') return 'XML';
        if (lower === 'sql_variant') return 'TEXT';
        return sqlType; // Pass through INT, BIGINT, etc.
    }

    /** Gets the base view name for an entity */
    private getBaseViewName(entity: EntityInfo): string {
        return entity.BaseView || `vw_${this.toSnakeCase(entity.CodeName)}`;
    }

    /**
     * Refuses layered base views on PostgreSQL, where the arrangement cannot deliver what it
     * promises.
     *
     * Layering exists so an application can add a computed column without inheriting — and then
     * hand-maintaining — the generated view, the payoff being that a foreign key added later still
     * shows up on its own. That payoff depends entirely on the application-owned outer view's
     * `SELECT g.*` being re-resolved after the inner view regenerates. SQL Server does that with
     * `sp_refreshview`. PostgreSQL expands `*` at creation and freezes it, offers no refresh
     * equivalent, and CodeGen does not own the outer view, so nothing recreates it.
     *
     * The resulting behaviour is worse than plainly broken, it is intermittent: an ADDED column (the
     * common case) leaves the outer view stale, because `CREATE OR REPLACE` on the inner view
     * succeeds and never touches dependents. A column RENAME or type change raises 42P16, which
     * sends CodeGen down the capture/`DROP CASCADE`/replay path — and that incidentally recreates
     * the outer view, so it picks the new columns up. Same feature, opposite outcomes, decided by
     * which kind of schema change happened to land that day.
     *
     * That is precisely the silent-staleness failure layering was built to eliminate, so this throws
     * rather than documenting a footgun. Fully custom base views (`BaseViewGenerated = 0` with no
     * `GeneratedBaseViewName`) are unaffected and keep working on PostgreSQL as before.
     */
    private assertLayeredBaseViewSupported(entity: EntityInfo): void {
        if (!entity.HasLayeredBaseView) return;
        throw new Error(
            `Entity "${entity.Name}" sets GeneratedBaseViewName = '${entity.GeneratedBaseViewName}', but layered ` +
            `base views are not supported on PostgreSQL. PostgreSQL freezes a view's column list at creation and ` +
            `has no sp_refreshview equivalent, so the application-owned view "${entity.BaseView}" would silently ` +
            `stop gaining columns that the generated view underneath it picks up. Clear GeneratedBaseViewName and ` +
            `use a fully custom base view (BaseViewGenerated = 0) instead, accepting that it must be ` +
            `hand-maintained as the schema changes.`
        );
    }

    /** Builds the WHERE clause for soft-delete filtering */
    private buildSoftDeleteWhereClause(entity: EntityInfo, alias: string): string {
        if (entity.DeleteType === 'Soft') {
            return `WHERE\n    ${alias}.${pgDialect.QuoteIdentifier(EntityInfo.DeletedAtFieldName)} IS NULL\n`;
        }
        return '';
    }

    /** Assembles the SELECT parts for a base view */
    private buildBaseViewSelectParts(context: BaseViewGenerationContext, alias: string): string {
        // parentFieldsSelect and rootFieldsSelect have leading commas (e.g. ",\n    Field AS Alias").
        // relatedFieldsSelect does NOT have a leading comma for the first field (starts with "\n    Field...").
        let select = `${alias}.*`;
        if (context.parentFieldsSelect) select += context.parentFieldsSelect;
        if (context.relatedFieldsSelect) select += `,${context.relatedFieldsSelect}`;
        if (context.rootFieldsSelect) select += context.rootFieldsSelect;
        return select;
    }

    /** Assembles the FROM/JOIN parts for a base view */
    private buildBaseViewFromParts(context: BaseViewGenerationContext, entity: EntityInfo, _alias: string): string {
        const joins: string[] = [];
        if (context.parentJoins) joins.push(context.parentJoins);
        if (context.relatedFieldsJoins) joins.push(context.relatedFieldsJoins);
        if (context.rootJoins) joins.push(context.rootJoins);
        return joins.length > 0 ? '\n' + joins.join('\n') : '';
    }

    /**
     * Like formatDefaultValue, but maps SQL Server BIT defaults (0/1) to PG
     * BOOLEAN literals (FALSE/TRUE) when the field type is bit/boolean.
     * COALESCE() in PG is type-strict — passing `COALESCE(boolean_param, 0)`
     * fails with "types boolean and integer cannot be matched".
     */
    private formatBooleanCompatibleDefault(ef: EntityFieldInfo): string {
        const formatted = this.formatDefaultValue(ef.DefaultValue, ef.NeedsQuotes);
        const fieldType = ef.Type.toLowerCase().trim();
        if (fieldType === 'bit' || fieldType === 'boolean' || fieldType === 'bool') {
            const t = formatted.trim().toLowerCase();
            if (t === '0' || t === "'0'") return 'FALSE';
            if (t === '1' || t === "'1'") return 'TRUE';
        }
        return formatted;
    }

    /** Builds a WHERE clause using primary key fields with a parameter prefix */
    private buildPrimaryKeyWhereClause(entity: EntityInfo): string {
        // Param name via the canonical flat builder (ParameterRef → `p_<lower>`), NOT toSnakeCase,
        // so the WHERE matches the CRUD function's declared parameter. A `p_${toSnakeCase}` here
        // emitted `p_record_key` for a multi-word PK while the signature declared `p_recordkey`,
        // so every UPDATE failed on PostgreSQL with `column "p_record_key" does not exist`.
        return entity.PrimaryKeys.map((k: EntityFieldInfo) =>
            `${pgDialect.QuoteIdentifier(k.Name)} = ${pgDialect.ParameterRef(k.CodeName)}`
        ).join(' AND ');
    }

    /** Builds the INSERT strategy for CREATE function based on PK type */
    private buildCreateInsertStrategy(
        entity: EntityInfo,
        firstKey: EntityFieldInfo,
        insertColumns: string,
        insertValues: string
    ): { preInsert: string; returningClause: string; selectClause: string; finalColumns: string; finalValues: string } {
        const viewName = this.getBaseViewName(entity);
        const pkCol = pgDialect.QuoteIdentifier(firstKey.Name);

        if (firstKey.AutoIncrement) {
            return {
                preInsert: '',
                returningClause: `RETURNING ${pkCol} INTO v_new_id`,
                selectClause: `SELECT * FROM ${pgDialect.QuoteSchema(entity.SchemaName, viewName)}\n    WHERE ${pkCol} = v_new_id`,
                finalColumns: insertColumns,
                finalValues: insertValues,
            };
        }

        if ((firstKey.Type.toLowerCase().trim() === 'uniqueidentifier' || firstKey.Type.toLowerCase().trim() === 'uuid') && entity.PrimaryKeys.length === 1) {
            const paramName = pgDialect.ParameterRef(firstKey.CodeName);
            const hasNonPkFields = insertColumns.trim().length > 0;
            return {
                preInsert: `v_new_id := COALESCE(${paramName}, gen_random_uuid());\n    `,
                returningClause: '',
                selectClause: `SELECT * FROM ${pgDialect.QuoteSchema(entity.SchemaName, viewName)}\n    WHERE ${pkCol} = v_new_id`,
                // Include the PK column in the INSERT so caller-provided IDs are respected.
                // When there are no non-PK columns, omit the trailing comma.
                finalColumns: hasNonPkFields ? `${pkCol},\n            ${insertColumns}` : pkCol,
                finalValues: hasNonPkFields ? `v_new_id,\n            ${insertValues}` : 'v_new_id',
            };
        }

        // Composite keys or non-auto, non-UUID PKs
        const selectWhere = entity.PrimaryKeys.map((k: EntityFieldInfo) =>
            `${pgDialect.QuoteIdentifier(k.Name)} = ${pgDialect.ParameterRef(k.CodeName)}`
        ).join(' AND ');

        // Composite-PK tables: every PK column has AllowUpdateAPI=0, so generateInsertFieldString
        // filters them all out. Prepend them to finalColumns/finalValues so the INSERT is valid.
        // (The single-PK uniqueidentifier case is already handled above via v_new_id.)
        // When insertColumns is empty (PK-only entities like junction tables), we must not
        // emit a trailing comma after the PK columns.
        let finalColumns = insertColumns;
        let finalValues = insertValues;
        if (entity.PrimaryKeys.length > 1) {
            const pkColumns = entity.PrimaryKeys
                .map((k: EntityFieldInfo) => pgDialect.QuoteIdentifier(k.Name))
                .join(',\n            ');
            const pkValues = entity.PrimaryKeys
                .map((k: EntityFieldInfo) => pgDialect.ParameterRef(k.CodeName))
                .join(',\n            ');
            const hasNonPkColumns = insertColumns.trim().length > 0;
            finalColumns = hasNonPkColumns ? `${pkColumns},\n            ${insertColumns}` : pkColumns;
            finalValues = hasNonPkColumns ? `${pkValues},\n            ${insertValues}` : pkValues;
        }

        return {
            preInsert: '',
            returningClause: '',
            selectClause: `SELECT * FROM ${pgDialect.QuoteSchema(entity.SchemaName, viewName)}\n    WHERE ${selectWhere}`,
            finalColumns,
            finalValues,
        };
    }

    /** Builds the DELETE body and return type based on entity delete type */
    private buildDeleteStrategy(entity: EntityInfo, cascadeSQL: string): {
        paramDecl: string;
        deleteBody: string;
        returnType: string;
        returnStatement: string;
    } {
        const paramParts: string[] = [];
        const selectParts: string[] = [];
        const nullParts: string[] = [];

        for (const k of entity.PrimaryKeys) {
            const paramName = pgDialect.ParameterRef(k.CodeName);
            paramParts.push(`${paramName} ${this.mapSQLType(k.SQLFullType)}`);
            selectParts.push(`${paramName} AS ${pgDialect.QuoteIdentifier(k.Name)}`);
            nullParts.push(`NULL::${this.mapSQLType(k.SQLFullType)} AS ${pgDialect.QuoteIdentifier(k.Name)}`);
        }

        const whereClause = entity.PrimaryKeys.map((k: EntityFieldInfo) =>
            `${pgDialect.QuoteIdentifier(k.Name)} = ${pgDialect.ParameterRef(k.CodeName)}`
        ).join(' AND ');

        let deleteBody: string;
        if (entity.DeleteType === 'Hard') {
            deleteBody = `    DELETE FROM ${pgDialect.QuoteSchema(entity.SchemaName, entity.BaseTable)}\n    WHERE ${whereClause};`;
        } else {
            deleteBody = `    UPDATE ${pgDialect.QuoteSchema(entity.SchemaName, entity.BaseTable)}
    SET ${pgDialect.QuoteIdentifier(EntityInfo.DeletedAtFieldName)} = NOW() AT TIME ZONE 'UTC'
    WHERE ${whereClause}
        AND ${pgDialect.QuoteIdentifier(EntityInfo.DeletedAtFieldName)} IS NULL;`;
        }

        // Return type is a TABLE with PK columns
        const returnCols = entity.PrimaryKeys.map((k: EntityFieldInfo) =>
            `${pgDialect.QuoteIdentifier(k.Name)} ${this.mapSQLType(k.SQLFullType)}`
        ).join(', ');

        const returnStatement = `    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT ${nullParts.join(', ')};
    ELSE
        RETURN QUERY SELECT ${selectParts.join(', ')};
    END IF;`;

        return {
            paramDecl: paramParts.join(',\n    '),
            deleteBody,
            returnType: `TABLE(${returnCols})`,
            returnStatement,
        };
    }

    /** Generates cascade update-to-NULL SQL for nullable FK */
    private generateCascadeUpdateToNull(parentEntity: EntityInfo, relatedEntity: EntityInfo, fkField: EntityFieldInfo): string {
        if (!relatedEntity.AllowUpdateAPI) {
            return `    -- WARNING: Cannot cascade update ${relatedEntity.Name}.${fkField.Name} to NULL - entity does not allow updates`;
        }

        const updateFnName = this.getCRUDRoutineName(relatedEntity, CRUDType.Update);
        const whereClause = `${pgDialect.QuoteIdentifier(fkField.Name)} = ${pgDialect.ParameterRef(parentEntity.FirstPrimaryKey.CodeName)}`;

        return `    -- Cascade: Set ${relatedEntity.Name}.${fkField.Name} to NULL
    FOR v_rec IN
        SELECT ${relatedEntity.PrimaryKeys.map((pk: EntityFieldInfo) => pgDialect.QuoteIdentifier(pk.Name)).join(', ')}
        FROM ${pgDialect.QuoteSchema(relatedEntity.SchemaName, relatedEntity.BaseTable)}
        WHERE ${whereClause}
    LOOP
        -- Update related record to set FK to NULL
        UPDATE ${pgDialect.QuoteSchema(relatedEntity.SchemaName, relatedEntity.BaseTable)}
        SET ${pgDialect.QuoteIdentifier(fkField.Name)} = NULL
        WHERE ${relatedEntity.PrimaryKeys.map((pk: EntityFieldInfo) => `${pgDialect.QuoteIdentifier(pk.Name)} = v_rec.${pgDialect.QuoteIdentifier(pk.Name)}`).join(' AND ')};
    END LOOP;
`;
    }

    /** Generates cascade cursor-based DELETE SQL for non-nullable FK */
    private generateCascadeCursorDelete(parentEntity: EntityInfo, relatedEntity: EntityInfo, fkField: EntityFieldInfo): string {
        if (!relatedEntity.AllowDeleteAPI) {
            return `    -- WARNING: Cannot cascade delete ${relatedEntity.Name} records - entity does not allow deletes`;
        }

        const deleteFnName = this.getCRUDRoutineName(relatedEntity, CRUDType.Delete);
        const whereClause = `${pgDialect.QuoteIdentifier(fkField.Name)} = ${pgDialect.ParameterRef(parentEntity.FirstPrimaryKey.CodeName)}`;

        return `    -- Cascade: Delete ${relatedEntity.Name} records via ${fkField.Name}
    FOR v_rec IN
        SELECT ${relatedEntity.PrimaryKeys.map((pk: EntityFieldInfo) => pgDialect.QuoteIdentifier(pk.Name)).join(', ')}
        FROM ${pgDialect.QuoteSchema(relatedEntity.SchemaName, relatedEntity.BaseTable)}
        WHERE ${whereClause}
    LOOP
        PERFORM ${pgDialect.QuoteSchema(relatedEntity.SchemaName, deleteFnName)}(${relatedEntity.PrimaryKeys.map((pk: EntityFieldInfo) => `v_rec.${pgDialect.QuoteIdentifier(pk.Name)}`).join(', ')});
    END LOOP;
`;
    }

    /** Collects unique role SQL names from permissions that have a role name */
    private collectPermissionRoles(permissions: EntityPermissionInfo[]): string[] {
        const roles: string[] = [];
        for (const ep of permissions) {
            if (ep.RoleSQLName && ep.RoleSQLName.length > 0 && !roles.includes(ep.RoleSQLName)) {
                roles.push(ep.RoleSQLName);
            }
        }
        return roles;
    }

    // ─── DATABASE INTROSPECTION ──────────────────────────────────────────

    /** @inheritdoc */
    getViewDefinitionSQL(schema: string, viewName: string): string {
        return `SELECT pg_get_viewdef('"${schema}"."${viewName}"'::regclass, true) AS "ViewDefinition"`;
    }

    /**
     * Generates a query against `pg_index`, `pg_class`, and `pg_namespace` to retrieve
     * the index name for a table's primary key constraint. Used by CodeGen to reference
     * the PK index in full-text search and other operations.
     */
    getPrimaryKeyIndexNameSQL(schema: string, tableName: string): string {
        return `SELECT
        i.relname AS "IndexName"
    FROM
        pg_index ix
    INNER JOIN
        pg_class t ON t.oid = ix.indrelid
    INNER JOIN
        pg_class i ON i.oid = ix.indexrelid
    INNER JOIN
        pg_namespace n ON n.oid = t.relnamespace
    WHERE
        ix.indisprimary = true
        AND t.relname = '${tableName}'
        AND n.nspname = '${schema}'`;
    }

    /**
     * Generates a query against `pg_index`, `pg_class`, `pg_namespace`, and `pg_attribute`
     * to check whether a column participates in a multi-column unique constraint. Returns
     * rows only when the unique index contains more than one column and includes the
     * specified column.
     */
    getCompositeUniqueConstraintCheckSQL(schema: string, tableName: string, columnName: string): string {
        return `SELECT ix.indexrelid AS index_id
    FROM pg_index ix
    INNER JOIN pg_class t ON t.oid = ix.indrelid
    INNER JOIN pg_namespace n ON n.oid = t.relnamespace
    INNER JOIN pg_class i ON i.oid = ix.indexrelid
    WHERE ix.indisunique = true
      AND ix.indisprimary = false
      AND n.nspname = '${schema}'
      AND t.relname = '${tableName}'
      AND EXISTS (
          SELECT 1
          FROM pg_attribute a
          WHERE a.attrelid = t.oid
            AND a.attnum = ANY(ix.indkey)
            AND a.attname = '${columnName}'
      )
      AND array_length(ix.indkey, 1) > 1`;
    }

    /** @inheritdoc */
    getForeignKeyIndexExistsSQL(schema: string, tableName: string, indexName: string): string {
        return `SELECT 1
    FROM pg_indexes
    WHERE schemaname = '${schema}'
      AND tablename = '${tableName}'
      AND indexname = '${indexName}'`;
    }

    // ─── COMPLEX SQL GENERATION HELPERS ──────────────────────────────

    /**
     * Builds the full pending entity fields query for PostgreSQL.
     * Uses CTEs for FK, PK, and UK caches, then joins against entity metadata
     * to find fields that exist in the database but not in MJ metadata.
     */
    private buildPendingEntityFieldsQuery(
        schema: string,
        qs: (schema: string, name: string) => string,
        entityIDs?: string[]
    ): string {
        // PG uses lowercase UUIDs; entity IDs from the metadata cache are already
        // normalized so direct string interpolation is safe (internal IDs, not user input).
        const scopeFilter = entityIDs && entityIDs.length > 0
            ? `AND sf."EntityID" IN (${entityIDs.map(id => `'${id}'`).join(',')})`
            : '';
        return `
WITH fk_cache AS (
   SELECT "column", "table", "schema_name", "referenced_table", "referenced_column", "referenced_schema"
   FROM ${qs(schema, 'vwForeignKeys')}
),
pk_cache AS (
   SELECT "TableName", "ColumnName", "SchemaName"
   FROM ${qs(schema, 'vwTablePrimaryKeys')}
),
uk_cache AS (
   SELECT "TableName", "ColumnName", "SchemaName"
   FROM ${qs(schema, 'vwTableUniqueKeys')}
),
max_sequences AS (
   SELECT
      "EntityID",
      COALESCE(MAX("Sequence"), 0) AS "MaxSequence"
   FROM
      ${qs(schema, 'EntityField')}
   GROUP BY
      "EntityID"
),
numbered_rows AS (
   SELECT
      sf."EntityID",
      COALESCE(ms."MaxSequence", 0) + 100000 + sf."Sequence" AS "Sequence",
      -- The RAW schema ordinal, carried alongside the temporary Sequence above. The INSERT emitter
      -- adds it to an apply-time MAX(), so the ordering of newly discovered fields is encoded in the
      -- emitted VALUE rather than depending on the order the INSERT statements happen to execute.
      sf."Sequence" AS "SourceOrdinal",
      sf."FieldName",
      sf."Description",
      sf."Type",
      sf."Length",
      sf."Precision",
      sf."Scale",
      sf."AllowsNull",
      sf."DefaultValue",
      sf."AutoIncrement",
      ${this.buildAllowUpdateAPICase()},
      sf."IsVirtual",
      sf."IsComputed",
      e."RelationshipDefaultDisplayType",
      e."Name" AS "EntityName",
      re."ID" AS "RelatedEntityID",
      fk."referenced_column" AS "RelatedEntityFieldName",
      CASE WHEN sf."FieldName" = 'Name' THEN TRUE ELSE FALSE END AS "IsNameField",
      CASE WHEN pk."ColumnName" IS NOT NULL THEN TRUE ELSE FALSE END AS "IsPrimaryKey",
      CASE
            WHEN pk."ColumnName" IS NOT NULL THEN TRUE
            WHEN uk."ColumnName" IS NOT NULL THEN TRUE
            ELSE FALSE
      END AS "IsUnique",
      ROW_NUMBER() OVER (PARTITION BY sf."EntityID", sf."FieldName" ORDER BY (SELECT NULL)) AS rn
   FROM
      ${qs(schema, 'vwSQLColumnsAndEntityFields')} sf
   LEFT OUTER JOIN
      max_sequences ms ON sf."EntityID" = ms."EntityID"
   LEFT OUTER JOIN
      ${qs(schema, 'Entity')} e ON sf."EntityID" = e."ID"
   LEFT OUTER JOIN
      fk_cache fk ON sf."FieldName" = fk."column" AND e."BaseTable" = fk."table" AND e."SchemaName" = fk."schema_name"
   LEFT OUTER JOIN
      ${qs(schema, 'Entity')} re ON re."BaseTable" = fk."referenced_table" AND re."SchemaName" = fk."referenced_schema"
   LEFT OUTER JOIN
      pk_cache pk ON e."BaseTable" = pk."TableName" AND sf."FieldName" = pk."ColumnName" AND e."SchemaName" = pk."SchemaName"
   LEFT OUTER JOIN
      uk_cache uk ON e."BaseTable" = uk."TableName" AND sf."FieldName" = uk."ColumnName" AND e."SchemaName" = uk."SchemaName"
   WHERE
      "EntityFieldID" IS NULL
      ${scopeFilter}
)
SELECT *
FROM numbered_rows
WHERE rn = 1
ORDER BY "EntityID", "Sequence";
`;
    }

    /**
     * Builds the CASE expression for AllowUpdateAPI in the pending entity fields query.
     */
    private buildAllowUpdateAPICase(): string {
        // sf is the schema view (vwSQLColumnsAndEntityFields), whose "IsVirtual"
        // is an INTEGER 1/0 (not the EntityField table's BOOLEAN). Compare with
        // <> 0, not `= true`, or PG raises `operator does not exist: integer = boolean`.
        return `CASE WHEN sf."IsVirtual" <> 0 THEN FALSE
           WHEN sf."FieldName" = '${EntityInfo.CreatedAtFieldName}' THEN FALSE
           WHEN sf."FieldName" = '${EntityInfo.UpdatedAtFieldName}' THEN FALSE
           WHEN sf."FieldName" = '${EntityInfo.DeletedAtFieldName}' THEN FALSE
           WHEN pk."ColumnName" IS NOT NULL THEN FALSE
           ELSE TRUE
      END AS "AllowUpdateAPI"`;
    }

    /**
     * Builds the UPDATE SQL to fix virtual field nullability.
     * Updates AllowsNull for virtual fields based on the FK column's nullability.
     */
    private buildFixVirtualFieldNullabilityUpdateSQL(
        mjCoreSchema: string,
        qs: (schema: string, name: string) => string
    ): string {
        return `
UPDATE ${qs(mjCoreSchema, 'EntityField')} vf
SET "AllowsNull" = fk."AllowsNull"
FROM ${qs(mjCoreSchema, 'EntityField')} fk
WHERE vf."IsVirtual" = true
  AND fk."IsVirtual" = false
  AND vf."EntityID" = fk."EntityID"
  AND fk."RelatedEntityID" IS NOT NULL
  AND (
     (LENGTH(fk."Name") > 2
      AND LOWER(vf."Name") = LOWER(LEFT(fk."Name", LENGTH(fk."Name") - 2)))
     OR
     (LENGTH(fk."Name") > 2
      AND LOWER(vf."Name") = LOWER(LEFT(fk."Name", LENGTH(fk."Name") - 2) || '_Virtual'))
     OR
     (fk."RelatedEntityNameFieldMap" IS NOT NULL
      AND fk."RelatedEntityNameFieldMap" != ''
      AND LOWER(vf."Name") = LOWER(fk."RelatedEntityNameFieldMap"))
  )
  AND vf."AllowsNull" != fk."AllowsNull";
`;
    }

}
