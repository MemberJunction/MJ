/**
 * After an Open App migrate (CLI `mj migrate --schema` or `mj app install`),
 * run the same metadata-heal steps core migrate gets from R__RefreshMetadata.
 *
 * Core Flyway/Skyway runs that repeatable at the end of the `__mj` history.
 * An Open App migrate is a different history, so EntityField.Sequence vs
 * BaseView column order (especially layered inner/outer views) is never
 * rewritten unless we do it here.
 *
 * SQL Server: R__ members except procedure recompile (that pass is slow with
 * a live API attached and is not required to align EntityField.Sequence).
 * View refresh is dependency-ordered (`spRecompileAllViews`) and scoped to
 * the app schema.
 * PostgreSQL: restar layered outer views (`spRebindLayeredOuterViewsInSchema`)
 * so `g.*` re-expands, then run the field-heal functions (orphans, AllowsNull,
 * Sequence from catalog). No `spRecompileAllViews` — PG has none.
 */

import { GetDialect, type DatabasePlatform } from '@memberjunction/sql-dialect';

export interface RefreshDatabaseConfig {
    Host: string;
    Port: number;
    Database: string;
    User: string;
    Password: string;
    Encrypt?: boolean;
    TrustServerCertificate?: boolean;
    RequestTimeout?: number;
}

const ALWAYS_EXCLUDE_FROM_FIELD_PROCS = ['sys', 'staging'];
const VIEW_REFRESH_EXCLUDED = ['sys', 'INFORMATION_SCHEMA'];

export function isOpenAppSchema(targetSchema: string, coreSchema: string): boolean {
    return normalizeSchema(targetSchema) !== normalizeSchema(coreSchema);
}

export function normalizeSchema(name: string): string {
    return name.trim().toLowerCase();
}

export function buildFieldProcExcludedSchemaNames(appSchema: string, otherEntitySchemas: string[]): string {
    const seen = new Set<string>();
    const names: string[] = [];
    for (const name of [...ALWAYS_EXCLUDE_FROM_FIELD_PROCS, ...otherEntitySchemas]) {
        const trimmed = name.trim();
        if (!trimmed) continue;
        if (normalizeSchema(trimmed) === normalizeSchema(appSchema)) continue;
        const key = normalizeSchema(trimmed);
        if (seen.has(key)) continue;
        seen.add(key);
        names.push(trimmed);
    }
    return names.join(',');
}

export function buildOpenAppRefreshMetadataSQL(
    platform: DatabasePlatform,
    coreSchema: string,
    appSchema: string,
    otherEntitySchemas: string[],
): string {
    const dialect = GetDialect(platform);
    const core = dialect.CanonicalSchemaName(coreSchema);
    const app = dialect.CanonicalSchemaName(appSchema);
    return platform === 'postgresql'
        ? buildPostgresRefreshSQL(core, app, otherEntitySchemas)
        : buildSqlServerRefreshSQL(core, app, otherEntitySchemas);
}

function sqlN(value: string): string {
    return `N'${value.replace(/'/g, "''")}'`;
}

function sqlStr(value: string): string {
    return `'${value.replace(/'/g, "''")}'`;
}

function bracketIdent(name: string): string {
    return `[${name.replace(/]/g, ']]')}]`;
}

function pgIdent(name: string): string {
    return `"${name.replace(/"/g, '""')}"`;
}

function buildSqlServerRefreshSQL(coreSchema: string, appSchema: string, otherEntitySchemas: string[]): string {
    const core = bracketIdent(coreSchema);
    const included = sqlN(appSchema);
    const viewExcluded = sqlN(VIEW_REFRESH_EXCLUDED.join(','));
    const fieldExcluded = sqlN(buildFieldProcExcludedSchemaNames(appSchema, otherEntitySchemas));

    return [
        `EXEC ${core}.spRecompileAllViews @ExcludedSchemaNames=${viewExcluded}, @IncludedSchemaNames=${included};`,
        `EXEC ${core}.spUpdateExistingEntitiesFromSchema @ExcludedSchemaNames=${fieldExcluded};`,
        `EXEC ${core}.spUpdateSchemaInfoFromDatabase @ExcludedSchemaNames=${fieldExcluded};`,
        `EXEC ${core}.spDeleteUnneededEntityFields @ExcludedSchemaNames=${fieldExcluded};`,
        `EXEC ${core}.spUpdateExistingEntityFieldsFromSchema @ExcludedSchemaNames=${fieldExcluded};`,
        `EXEC ${core}.spSetDefaultColumnWidthWhereNeeded @ExcludedSchemaNames=${fieldExcluded};`,
    ].join('\n');
}

function buildPostgresRefreshSQL(coreSchema: string, appSchema: string, otherEntitySchemas: string[]): string {
    const core = pgIdent(coreSchema);
    const fieldExcluded = sqlStr(buildFieldProcExcludedSchemaNames(appSchema, otherEntitySchemas));
    const app = sqlStr(appSchema);

    // Mirrors migrations-pg/v5/R__RefreshMetadata.pg-only.sql (AllowsNull + orphan prune)
    // PLUS spUpdateExistingEntityFieldsFromSchema so MAX+N / shifted view ordinals
    // get rewritten from the live catalog. Layered outers are restarred first so
    // Sequence heal reads the re-expanded g.* column list.
    return [
        `SELECT ${core}."spRebindLayeredOuterViewsInSchema"(${app});`,
        `UPDATE ${core}."EntityField" ef`,
        `   SET "AllowsNull" = (c.is_nullable = 'YES')`,
        `  FROM ${core}."Entity" e,`,
        `       information_schema.columns c`,
        ` WHERE ef."EntityID" = e."ID"`,
        `   AND c.table_schema = e."SchemaName"`,
        `   AND c.table_name = e."BaseTable"`,
        `   AND c.column_name = ef."Name"`,
        `   AND ef."IsVirtual" = false`,
        `   AND e."SchemaName" = ${app}`,
        `   AND ef."AllowsNull" <> (c.is_nullable = 'YES');`,
        `SELECT * FROM ${core}."spUpdateExistingEntitiesFromSchema"(${fieldExcluded});`,
        `SELECT * FROM ${core}."spUpdateSchemaInfoFromDatabase"(${fieldExcluded});`,
        `SELECT * FROM ${core}."spDeleteUnneededEntityFields"(${fieldExcluded});`,
        `SELECT * FROM ${core}."spUpdateExistingEntityFieldsFromSchema"(${fieldExcluded});`,
        `SELECT * FROM ${core}."spSetDefaultColumnWidthWhereNeeded"(${fieldExcluded});`,
    ].join('\n');
}

export function buildOtherEntitySchemasQuery(platform: DatabasePlatform, coreSchema: string, appSchema: string): string {
    const d = GetDialect(platform);
    const core = d.CanonicalSchemaName(coreSchema);
    const app = d.CanonicalSchemaName(appSchema);
    const entity = d.QuoteSchema(core, 'Entity');
    const col = d.QuoteIdentifier('SchemaName');
    const lit = platform === 'postgresql' ? sqlStr(app) : sqlN(app);
    return `SELECT DISTINCT ${col} AS "SchemaName" FROM ${entity} WHERE ${col} <> ${lit}`;
}

/**
 * Open a driver connection, run the heal SQL, close. Used by `mj migrate` and
 * `RunAppMigrations` (`mj app install` / upgrade).
 */
export async function executeOpenAppMetadataRefresh(options: {
    platform: DatabasePlatform;
    coreSchema: string;
    appSchema: string;
    database: RefreshDatabaseConfig;
}): Promise<void> {
    const { platform, database } = options;
    const dialect = GetDialect(platform);
    const coreSchema = dialect.CanonicalSchemaName(options.coreSchema);
    const appSchema = dialect.CanonicalSchemaName(options.appSchema);
    const runner = await openRefreshConnection(platform, database);
    try {
        const schemaQuery = buildOtherEntitySchemasQuery(platform, coreSchema, appSchema);
        const rows = await runner.query<{ SchemaName: string }>(schemaQuery);
        const sql = buildOpenAppRefreshMetadataSQL(
            platform,
            coreSchema,
            appSchema,
            rows.map((r) => String(r.SchemaName)),
        );
        await runner.query(sql);
    } finally {
        await runner.close();
    }
}

interface RefreshRunner {
    query<T = Record<string, unknown>>(sql: string): Promise<T[]>;
    close(): Promise<void>;
}

async function openRefreshConnection(platform: DatabasePlatform, database: RefreshDatabaseConfig): Promise<RefreshRunner> {
    if (platform === 'postgresql') {
        const pgMod = await import('pg');
        const pg = (pgMod as { Client?: typeof pgMod.Client }).Client ? pgMod : (pgMod as unknown as { default: typeof pgMod }).default;
        const client = new pg.Client({
            host: database.Host,
            port: database.Port,
            user: database.User,
            password: database.Password,
            database: database.Database,
        });
        await client.connect();
        return {
            async query<T>(sql: string): Promise<T[]> {
                const result = await client.query(sql);
                return (result.rows ?? []) as T[];
            },
            async close(): Promise<void> {
                await client.end();
            },
        };
    }

    const mssqlMod = await import('mssql');
    const mssql = (mssqlMod as { ConnectionPool?: typeof mssqlMod.ConnectionPool }).ConnectionPool
        ? mssqlMod
        : (mssqlMod as unknown as { default: typeof mssqlMod }).default;
    const isAzureSql = database.Host.includes('.database.windows.net');
    const pool = await new mssql.ConnectionPool({
        server: database.Host,
        port: database.Port ?? 1433,
        user: database.User,
        password: database.Password,
        database: database.Database,
        options: {
            encrypt: database.Encrypt ?? isAzureSql,
            trustServerCertificate: database.TrustServerCertificate ?? !isAzureSql,
            enableArithAbort: true,
        },
        requestTimeout: database.RequestTimeout ?? 600000,
    }).connect();
    return {
        async query<T>(sql: string): Promise<T[]> {
            const result = await pool.request().query(sql);
            return (result.recordset ?? []) as T[];
        },
        async close(): Promise<void> {
            await pool.close();
        },
    };
}
