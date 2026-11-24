/**
 * Connection settings for MJAPI's PostgreSQL pools, derived from the same `databaseSettings`
 * values SQL Server reads, with the same defaults.
 *
 * | Setting                              | SQL Server                       | PostgreSQL                                   |
 * |--------------------------------------|----------------------------------|----------------------------------------------|
 * | `requestTimeout`                     | driver request timeout           | `statement_timeout` on every backend         |
 * | `connectionPool.max` / `min`         | pool size                        | pool size                                    |
 * | `connectionPool.readOnlyMax`         | —                                | application read-only pool size (defaults to `max`) |
 * | `connectionPool.idleTimeoutMillis`   | idle connection eviction         | idle connection eviction                     |
 * | `connectionPool.acquireTimeoutMillis`| wait for a pooled connection     | `connectionTimeoutMillis` (see below)        |
 * | `connectionTimeout`                  | time to open a connection        | not used                                     |
 *
 * Where the two cannot match exactly:
 * - The `pg` pool has one timeout covering both waiting for a free slot and opening a connection.
 *   It is fed from `acquireTimeoutMillis`; `connectionTimeout` is not used on PostgreSQL.
 * - SQL Server's `requestTimeout` is a client-side timer over the whole request, including reading
 *   rows. PostgreSQL's `statement_timeout` is server-side execution time per statement, so a query
 *   that executes quickly and returns its rows slowly is not cut off on PostgreSQL.
 * - `idle_in_transaction_session_timeout` has no SQL Server counterpart. It is derived as twice the
 *   statement timeout, so a transaction left open by an abandoned request is ended and its locks
 *   released.
 * - When a read-only login is configured, MJAPI keeps two distinct pools on that login:
 *   1. `'read-only'`: application `RunView*` reads, sized up to `connectionPool.readOnlyMax ?? apiMax`
 *      (`MinConnections: 0`) so concurrent application reads scale with the API pool.
 *   2. `'adhoc-read-only'`: untrusted caller-supplied SQL (`ExecuteAdhocQuery`, `TestQuerySQL`,
 *      `GetDataContextData`), capped at `ADHOC_READ_ONLY_MAX_CONNECTIONS` (10) so ad-hoc queries
 *      cannot starve application traffic.
 */
import {
    BuildPgPasswordSource,
    BuildPgSslConfig,
    ResolvePgAuthMode,
    type PGConnectionConfig,
    type PgSslConfig,
    type PgSslSettings,
} from '@memberjunction/postgresql-dataprovider';
import type { Pool, PoolConfig } from 'pg';
import { BaseSingleton } from '@memberjunction/global';
import type { DatabaseSettingsInfo } from './config.js';

/** Statement timeout for the CodeGen/DDL pool, matching the SQL Server CodeGen pool. */
export const CODEGEN_STATEMENT_TIMEOUT_MS = 600000;

/** Pool size for the CodeGen/DDL pool. */
const CODEGEN_MAX_CONNECTIONS = 10;

/** Largest pool size for the untrusted ad-hoc read-only SQL pool (caller-supplied SQL). */
export const ADHOC_READ_ONLY_MAX_CONNECTIONS = 10;

/**
 * Which pool the settings are for: API traffic, the application read-only pool (`RunView*`),
 * the bounded ad-hoc read-only pool for caller-supplied SQL, or CodeGen and DDL work.
 */
export type PostgreSQLPoolPurpose = 'api' | 'read-only' | 'adhoc-read-only' | 'codegen';

/** Where a PostgreSQL pool connects and as whom. */
export interface PostgreSQLEndpoint {
    Host: string;
    Port: number;
    Database: string;
    User: string;
    Password: string;
}

/** Reads the PostgreSQL endpoint from `PG_*` environment variables, then `DB_*` ones. */
export function ResolvePostgreSQLEndpoint(env: NodeJS.ProcessEnv = process.env): PostgreSQLEndpoint {
    return {
        Host: env.PG_HOST || env.DB_HOST || 'localhost',
        Port: parseInt(env.PG_PORT || env.DB_PORT || '5432', 10),
        Database: env.PG_DATABASE || env.DB_DATABASE || '',
        User: env.PG_USERNAME || env.DB_USERNAME || 'postgres',
        Password: env.PG_PASSWORD || env.DB_PASSWORD || ''
    };
}

/** The idle-in-transaction limit for a given statement timeout; 0 means none. */
export function IdleInTransactionTimeoutFor(statementTimeoutMs: number): number {
    return statementTimeoutMs > 0 ? statementTimeoutMs * 2 : 0;
}

/** The `databaseSettings.postgres.ssl` setting, in the shape `BuildPgSslConfig` takes. */
export function PgSslSettingsFrom(settings: DatabaseSettingsInfo): PgSslSettings {
    const ssl = settings.postgres?.ssl;
    return { Mode: ssl?.mode, CAFile: ssl?.caFile, ServerName: ssl?.serverName };
}

/**
 * The TLS and login half of a pool's config: `ssl` from the `PG_SSL_*` settings, and a password
 * source when the auth mode issues tokens. BuildPgPasswordSource refuses a token login whose TLS does
 * not verify the server.
 */
export function BuildPostgreSQLSecurity(
    endpoint: PostgreSQLEndpoint,
    settings: DatabaseSettingsInfo,
    env: NodeJS.ProcessEnv = process.env
): Pick<PGConnectionConfig, 'SSL' | 'PasswordSource'> {
    const ssl: PgSslConfig = BuildPgSslConfig(endpoint.Host, PgSslSettingsFrom(settings), env);
    const authMode = ResolvePgAuthMode(settings.postgres?.authMode, env);
    // BuildPgPasswordSource refuses a token login whose TLS does not verify the server.
    const passwordSource = BuildPgPasswordSource(authMode, {
        Host: endpoint.Host,
        Port: endpoint.Port,
        User: endpoint.User,
        Database: endpoint.Database,
    }, ssl);
    return passwordSource ? { SSL: ssl, PasswordSource: passwordSource } : { SSL: ssl };
}

/** Builds the provider connection config for one of MJAPI's PostgreSQL pools. */
export function BuildPostgreSQLConnectionConfig(
    endpoint: PostgreSQLEndpoint,
    settings: DatabaseSettingsInfo,
    purpose: PostgreSQLPoolPurpose,
    env: NodeJS.ProcessEnv = process.env
): PGConnectionConfig {
    const pool = settings.connectionPool;
    const security = BuildPostgreSQLSecurity(endpoint, settings, env);
    if (purpose === 'codegen') {
        return {
            ...endpoint,
            ...security,
            MaxConnections: CODEGEN_MAX_CONNECTIONS,
            StatementTimeoutMs: CODEGEN_STATEMENT_TIMEOUT_MS,
            IdleInTransactionSessionTimeoutMs: 0
        };
    }
    const statementTimeoutMs = Math.max(0, settings.requestTimeout);
    const apiMax = pool?.max ?? 50;
    const apiMin = pool?.min ?? 5;
    let maxConnections = apiMax;
    if (purpose === 'read-only') {
        maxConnections = pool?.readOnlyMax ?? apiMax;
    } else if (purpose === 'adhoc-read-only') {
        maxConnections = Math.min(ADHOC_READ_ONLY_MAX_CONNECTIONS, apiMax);
    }
    const isReadOnlyPurpose = purpose === 'read-only' || purpose === 'adhoc-read-only';
    return {
        ...endpoint,
        ...security,
        MaxConnections: maxConnections,
        MinConnections: isReadOnlyPurpose ? 0 : apiMin,
        IdleTimeoutMillis: pool?.idleTimeoutMillis ?? 30000,
        ConnectionTimeoutMillis: pool?.acquireTimeoutMillis ?? 30000,
        StatementTimeoutMs: statementTimeoutMs,
        IdleInTransactionSessionTimeoutMs: IdleInTransactionTimeoutFor(statementTimeoutMs)
    };
}

/**
 * Maps a provider connection config onto `pg.Pool` options, for the pools MJAPI creates directly
 * rather than through the provider. Timeouts that are unset or 0 are left out.
 */
export function ToPGPoolConfig(config: PGConnectionConfig): PoolConfig {
    const pool: PoolConfig = {
        host: config.Host,
        port: config.Port,
        database: config.Database,
        user: config.User,
        password: config.PasswordSource ?? config.Password,
        max: config.MaxConnections
    };
    // Always set: an unset `ssl` lets node-postgres fall back to PGSSLMODE, which is not one of MJ's settings.
    pool.ssl = config.SSL ?? false;
    if (config.MinConnections !== undefined) pool.min = config.MinConnections;
    if (config.IdleTimeoutMillis !== undefined) pool.idleTimeoutMillis = config.IdleTimeoutMillis;
    if (config.ConnectionTimeoutMillis !== undefined) pool.connectionTimeoutMillis = config.ConnectionTimeoutMillis;
    if (config.StatementTimeoutMs) pool.statement_timeout = config.StatementTimeoutMs;
    if (config.IdleInTransactionSessionTimeoutMs) pool.idle_in_transaction_session_timeout = config.IdleInTransactionSessionTimeoutMs;
    return pool;
}

/** Credentials for a read-only database login. */
export interface ReadOnlyCredentials {
    User: string;
    Password: string;
}

/**
 * The read-only login for PostgreSQL: the `dbReadOnlyUsername` / `dbReadOnlyPassword` settings
 * SQL Server uses (which default from `DB_READ_ONLY_USERNAME` / `DB_READ_ONLY_PASSWORD`), then
 * `PG_READ_ONLY_USERNAME` / `PG_READ_ONLY_PASSWORD`. `null` when neither pair is complete.
 */
export function ResolvePostgreSQLReadOnlyCredentials(
    configured: { dbReadOnlyUsername?: string; dbReadOnlyPassword?: string },
    env: NodeJS.ProcessEnv = process.env
): ReadOnlyCredentials | null {
    if (configured.dbReadOnlyUsername && configured.dbReadOnlyPassword) {
        return { User: configured.dbReadOnlyUsername, Password: configured.dbReadOnlyPassword };
    }
    if (env.PG_READ_ONLY_USERNAME && env.PG_READ_ONLY_PASSWORD) {
        return { User: env.PG_READ_ONLY_USERNAME, Password: env.PG_READ_ONLY_PASSWORD };
    }
    return null;
}

/**
 * Holds MJAPI's PostgreSQL read-only pools, opened once at startup with the read-only login:
 * - {@link Pool}: application `RunView*` read-only pool, sized up to `apiMax` (or `connectionPool.readOnlyMax`)
 * - {@link AdhocPool}: bounded pool for untrusted caller-supplied SQL, capped at {@link ADHOC_READ_ONLY_MAX_CONNECTIONS}
 */
export class PostgreSQLReadOnlyPool extends BaseSingleton<PostgreSQLReadOnlyPool> {
    private _pool: Pool | null = null;
    private _adhocPool: Pool | null = null;

    /** Use {@link PostgreSQLReadOnlyPool.Instance}. */
    public constructor() {
        super();
    }

    public static get Instance(): PostgreSQLReadOnlyPool {
        return PostgreSQLReadOnlyPool.getInstance<PostgreSQLReadOnlyPool>();
    }

    /** The application read-only pool, or `null` when no read-only login is configured. */
    public get Pool(): Pool | null {
        return this._pool;
    }

    public set Pool(pool: Pool | null) {
        this._pool = pool;
    }

    /** The bounded ad-hoc read-only pool for caller-supplied SQL, or `null` when no read-only login is configured. */
    public get AdhocPool(): Pool | null {
        return this._adhocPool;
    }

    public set AdhocPool(pool: Pool | null) {
        this._adhocPool = pool;
    }
}

/** What {@link DescribeReadOnlyLoginOverreach} reads about the read-only login. */
export interface ReadOnlyLoginGrants {
    ReadsServerFiles: boolean;
    ReadableBaseTables: number;
}

/** The one method {@link DescribeReadOnlyLoginOverreach} needs from a connection; a `pg` client has it. */
export interface ReadOnlyLoginCheckClient {
    query(sql: string, params: unknown[]): Promise<{ rows: ReadOnlyLoginGrants[] }>;  // case-violation-ok-legacy-back-compat: mirrors the pg client's query method, which a pg client must satisfy as-is
}

/**
 * What the PostgreSQL read-only login can do beyond reading entity base views, as warnings to log at
 * startup. Ad-hoc SQL and `TestQuerySQL` run as this login, and SQL can reach data through functions
 * that no check of its table references sees (`query_to_xml`, file readers), so the login's own
 * grants are the only complete limit. It should hold `SELECT` on the entity base views and nothing
 * else: not on the base tables, and not membership of `pg_read_server_files`. Empty when the login
 * is that narrow.
 *
 * @param client - A connection opened as the read-only login.
 * @param coreSchema - The MJ core schema, whose base tables the login should not read.
 */
export async function DescribeReadOnlyLoginOverreach(client: ReadOnlyLoginCheckClient, coreSchema: string): Promise<string[]> {
    const result = await client.query(
        `SELECT pg_has_role(current_user, 'pg_read_server_files', 'MEMBER') AS "ReadsServerFiles",
                (SELECT count(*)::int FROM pg_catalog.pg_tables t
                  WHERE t.schemaname = $1
                    AND has_table_privilege(current_user, quote_ident(t.schemaname) || '.' || quote_ident(t.tablename), 'SELECT')) AS "ReadableBaseTables"`,
        [coreSchema],
    );
    const row = result.rows[0];
    const warnings: string[] = [];
    if (row?.ReadableBaseTables > 0) {
        warnings.push(`The PostgreSQL read-only login can read ${row.ReadableBaseTables} base table(s) in schema "${coreSchema}". Ad-hoc SQL and TestQuerySQL run as this login; grant it SELECT on the entity base views only.`);
    }
    if (row?.ReadsServerFiles) {
        warnings.push('The PostgreSQL read-only login is a member of pg_read_server_files, so SQL run as it can read files on the database server. Revoke that membership.');
    }
    return warnings;
}

/** One pool's share of the connection budget. */
export interface PostgreSQLPoolBudgetEntry {
    Name: string;
    MaxConnections: number;
}

/** What {@link DescribeConnectionBudget} reads from the server. */
export interface ConnectionLimitRow {
    MaxConnections: number;
    ReservedConnections: number;
}

/** The one method {@link DescribeConnectionBudget} needs from a connection; a `pg` pool or client has it. */
export interface ConnectionLimitCheckClient {
    query(sql: string): Promise<{ rows: ConnectionLimitRow[] }>;  // case-violation-ok-legacy-back-compat: mirrors the pg client's query method, which a pg client must satisfy as-is
}

/** The share of `max_connections` past which the budget check warns. */
export const CONNECTION_BUDGET_WARN_RATIO = 0.8;

/**
 * Compares the most connections MJAPI's PostgreSQL pools could open against the server's limit, as
 * a startup warning. Managed PostgreSQL tiers often allow 50-200 connections, and every MJAPI
 * instance opens its own pools, so the pools of a few instances can exhaust the server and later
 * connections fail with `too many clients`. Pools open connections only as load needs them, so
 * this is a worst case, not current use; the check warns and never blocks startup.
 *
 * @param instances - How many MJAPI instances share the server (`connectionPool.expectedInstances`).
 * @returns A warning, or `null` when the worst case fits within {@link CONNECTION_BUDGET_WARN_RATIO} of the usable connections.
 */
export async function DescribeConnectionBudget(
    client: ConnectionLimitCheckClient,
    pools: PostgreSQLPoolBudgetEntry[],
    instances: number = 1,
): Promise<string | null> {
    const result = await client.query(
        `SELECT current_setting('max_connections')::int AS "MaxConnections",
                current_setting('superuser_reserved_connections')::int
                  + COALESCE(NULLIF(current_setting('reserved_connections', true), '')::int, 0) AS "ReservedConnections"`,
    );
    const row = result.rows[0];
    if (!row) {
        return null;
    }
    const usable = row.MaxConnections - row.ReservedConnections;
    const perInstance = pools.reduce((sum, p) => sum + p.MaxConnections, 0);
    const worstCase = perInstance * Math.max(1, instances);
    if (worstCase <= usable * CONNECTION_BUDGET_WARN_RATIO) {
        return null;
    }
    const breakdown = pools.map(p => `${p.Name} ${p.MaxConnections}`).join(', ');
    return `PostgreSQL connection budget: MJAPI's pools can open up to ${perInstance} connection(s) per instance (${breakdown})` +
        `${instances > 1 ? ` × ${instances} instances = ${worstCase}` : ''}, against ${usable} usable on the server ` +
        `(max_connections ${row.MaxConnections} minus ${row.ReservedConnections} reserved). Lower databaseSettings.connectionPool.max ` +
        `or readOnlyMax, raise max_connections, or put a connection pooler in front of the server.`;
}

/**
 * The worst-case connection count of each pool MJAPI opens on PostgreSQL, from the same settings
 * the pools are built from.
 */
export function PostgreSQLPoolBudget(
    settings: DatabaseSettingsInfo,
    hasReadOnlyLogin: boolean,
    hasCodeGenLogin: boolean,
): PostgreSQLPoolBudgetEntry[] {
    const endpoint: PostgreSQLEndpoint = { Host: 'localhost', Port: 5432, Database: '', User: '', Password: '' };
    const max = (purpose: PostgreSQLPoolPurpose): number =>
        BuildPostgreSQLConnectionConfig(endpoint, settings, purpose, {}).MaxConnections ?? 0;
    const pools: PostgreSQLPoolBudgetEntry[] = [{ Name: 'API', MaxConnections: max('api') }];
    if (hasReadOnlyLogin) {
        pools.push({ Name: 'read-only', MaxConnections: max('read-only') }, { Name: 'ad-hoc read-only', MaxConnections: max('adhoc-read-only') });
    }
    if (hasCodeGenLogin) {
        pools.push({ Name: 'CodeGen', MaxConnections: max('codegen') });
    }
    return pools;
}

/** Logs {@link DescribeConnectionBudget}'s warning, if any. A failed check is logged, never thrown. */
export async function WarnIfPostgreSQLConnectionBudgetExceeded(
    client: ConnectionLimitCheckClient,
    settings: DatabaseSettingsInfo,
    hasReadOnlyLogin: boolean,
    hasCodeGenLogin: boolean,
    log: (message: string) => void,
): Promise<void> {
    try {
        const pools = PostgreSQLPoolBudget(settings, hasReadOnlyLogin, hasCodeGenLogin);
        const warning = await DescribeConnectionBudget(client, pools, settings.connectionPool?.expectedInstances ?? 1);
        if (warning) {
            log(`WARNING: ${warning}`);
        }
    } catch (err) {
        log(`WARNING: could not check the PostgreSQL connection budget: ${err instanceof Error ? err.message : String(err)}`);
    }
}

/** Which read-only pools a configured replica serves. */
export type PostgreSQLReplicaPools = 'adhoc' | 'all-read-only';

/** Where each read-only pool connects: the primary, or a read replica when one is configured. */
export interface PostgreSQLReadOnlyEndpoints {
    Application: PostgreSQLEndpoint;
    Adhoc: PostgreSQLEndpoint;
}

/**
 * Resolves the read-only pools' endpoints. `PG_READ_REPLICA_HOST` / `databaseSettings.postgres.readReplica.host`
 * moves the ad-hoc pool to a replica; `pools: 'all-read-only'` (`PG_READ_REPLICA_POOLS`) moves the
 * application read-only pool too. Without a replica both stay on the primary, as before.
 *
 * @param readOnly - The primary endpoint with the read-only login's credentials.
 */
export function ResolvePostgreSQLReadOnlyEndpoints(
    readOnly: PostgreSQLEndpoint,
    settings: DatabaseSettingsInfo,
    env: NodeJS.ProcessEnv = process.env,
): PostgreSQLReadOnlyEndpoints {
    const configured = settings.postgres?.readReplica;
    const host = env.PG_READ_REPLICA_HOST?.trim() || configured?.host?.trim();
    if (!host) {
        return { Application: readOnly, Adhoc: readOnly };
    }
    const envPort = env.PG_READ_REPLICA_PORT ? parseInt(env.PG_READ_REPLICA_PORT, 10) : NaN;
    const port = Number.isFinite(envPort) ? envPort : configured?.port ?? readOnly.Port;
    const pools = parseReplicaPools(env.PG_READ_REPLICA_POOLS ?? configured?.pools);
    const replica: PostgreSQLEndpoint = { ...readOnly, Host: host, Port: port };
    return { Application: pools === 'all-read-only' ? replica : readOnly, Adhoc: replica };
}

function parseReplicaPools(value: string | undefined): PostgreSQLReplicaPools {
    const v = (value ?? 'adhoc').trim().toLowerCase();
    if (v !== 'adhoc' && v !== 'all-read-only') {
        throw new Error(`PG_READ_REPLICA_POOLS is "${value}"; expected adhoc or all-read-only.`);
    }
    return v;
}
