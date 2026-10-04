/**
 * Connection settings for MJAPI's PostgreSQL pools, derived from the same `databaseSettings`
 * values SQL Server reads, with the same defaults.
 *
 * | Setting                              | SQL Server                       | PostgreSQL                                   |
 * |--------------------------------------|----------------------------------|----------------------------------------------|
 * | `requestTimeout`                     | driver request timeout           | `statement_timeout` on every backend         |
 * | `connectionPool.max` / `min`         | pool size                        | pool size                                    |
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
 * - MJAPI opens a raw compatibility pool and a provider pool, each up to `connectionPool.max`, plus
 *   a CodeGen pool of 10 and, when a read-only login is configured, a read-only pool of at most 10,
 *   where SQL Server opens one pool (and a read-only one). PostgreSQL's default `max_connections`
 *   is 100, so the read-only and CodeGen pools are kept small.
 */
import type { PGConnectionConfig } from '@memberjunction/postgresql-dataprovider';
import type { Pool, PoolConfig } from 'pg';
import { BaseSingleton } from '@memberjunction/global';
import type { DatabaseSettingsInfo } from './config.js';

/** Statement timeout for the CodeGen/DDL pool, matching the SQL Server CodeGen pool. */
export const CODEGEN_STATEMENT_TIMEOUT_MS = 600000;

/** Pool size for the CodeGen/DDL pool. */
const CODEGEN_MAX_CONNECTIONS = 10;

/** Largest pool size for the read-only pool, which serves only caller-supplied SQL. */
const READ_ONLY_MAX_CONNECTIONS = 10;

/**
 * Which pool the settings are for: API traffic, the read-only pool for caller-supplied SQL, or
 * CodeGen and DDL work.
 */
export type PostgreSQLPoolPurpose = 'api' | 'read-only' | 'codegen';

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

/** Builds the provider connection config for one of MJAPI's PostgreSQL pools. */
export function BuildPostgreSQLConnectionConfig(
    endpoint: PostgreSQLEndpoint,
    settings: DatabaseSettingsInfo,
    purpose: PostgreSQLPoolPurpose
): PGConnectionConfig {
    const pool = settings.connectionPool;
    if (purpose === 'codegen') {
        return {
            ...endpoint,
            MaxConnections: CODEGEN_MAX_CONNECTIONS,
            StatementTimeoutMs: CODEGEN_STATEMENT_TIMEOUT_MS,
            IdleInTransactionSessionTimeoutMs: 0
        };
    }
    const statementTimeoutMs = Math.max(0, settings.requestTimeout);
    const apiMax = pool?.max ?? 50;
    const apiMin = pool?.min ?? 5;
    const readOnly = purpose === 'read-only';
    return {
        ...endpoint,
        MaxConnections: readOnly ? Math.min(READ_ONLY_MAX_CONNECTIONS, apiMax) : apiMax,
        MinConnections: readOnly ? 0 : apiMin,
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
        password: config.Password,
        max: config.MaxConnections
    };
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
 * Holds MJAPI's PostgreSQL read-only pool, opened once at startup with the read-only login.
 * Per-request read-only providers share it, so they connect as the read-only user rather than
 * through the read-write pool.
 */
export class PostgreSQLReadOnlyPool extends BaseSingleton<PostgreSQLReadOnlyPool> {
    private _pool: Pool | null = null;

    /** Use {@link PostgreSQLReadOnlyPool.Instance}. */
    public constructor() {
        super();
    }

    public static get Instance(): PostgreSQLReadOnlyPool {
        return PostgreSQLReadOnlyPool.getInstance<PostgreSQLReadOnlyPool>();
    }

    /** The read-only pool, or `null` when no read-only login is configured. */
    public get Pool(): Pool | null {
        return this._pool;
    }

    public set Pool(pool: Pool | null) {
        this._pool = pool;
    }
}
