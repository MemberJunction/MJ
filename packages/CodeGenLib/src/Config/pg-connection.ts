/**
 * PostgreSQL-specific connection configuration and management for
 * MemberJunction CodeGen. Provides the lazy `pg.Pool` used by the
 * PostgreSQL codegen path (see `PostgreSQLCodeGenProvider.SetupDataSource()`).
 *
 * **Scope** — this file is intentionally PostgreSQL-only; it imports
 * `@memberjunction/postgresql-data-provider`'s {@link PGConnectionManager}
 * for the actual pool lifecycle. The SQL Server codegen path lives in
 * `db-connection.ts` and is independent.
 *
 * **Lazy resolution** — the pg config is built lazily on the first call
 * to {@link PGConnection} instead of at module load. This matches the
 * shape of `db-connection.ts`'s {@link MSSQLConnection} and allows
 * `initializeConfig()` to populate {@link configInfo} before the pool
 * is created. Building the config at module load would capture empty
 * defaults whenever a caller does `await import('@memberjunction/codegen-lib')`
 * before `initializeConfig()` runs.
 *
 * **Module-level cache** — the resolved pool + config are cached at the
 * module level so repeated CodeGen operations reuse the same pool. This
 * matches SQL Server's `_pool` caching and replaces the previous
 * function-local pool in `runCodeGen.setupPostgreSQLDataSource()` that
 * created a fresh pool on every `setupDataSource()` call.
 */
import pg from 'pg';
import { PGConnectionManager, type PGConnectionConfig } from '@memberjunction/postgresql-dataprovider';
import { configInfo } from './config.js';

/**
 * Build the {@link PGConnectionConfig} from the current `configInfo`. Called
 * lazily from {@link PGConnection} so values are read AFTER `initializeConfig()`
 * has run. {@link configInfo.codegenPool} supplies optional pool-size and
 * timeout knobs; when omitted, {@link PGConnectionManager}'s defaults apply
 * (the same defaults the runtime PG data provider has been using).
 */
function buildPgConfig(): PGConnectionConfig {
  const pool = configInfo.codegenPool;
  return {
    Host: configInfo.dbHost,
    Port: configInfo.dbPort,
    Database: configInfo.dbDatabase,
    User: configInfo.codeGenLogin,
    Password: configInfo.codeGenPassword,
    MJCoreSchemaName: configInfo.mjCoreSchema,
    MaxConnections: pool?.max,
    MinConnections: pool?.min,
    IdleTimeoutMillis: pool?.idleTimeoutMillis,
    ConnectionTimeoutMillis: pool?.connectionTimeoutMillis,
  };
}

/**
 * Module-internal cache for the resolved {@link PGConnectionConfig}. Populated
 * on first call to {@link PGConnection}. Read via the {@link getPgConfig}
 * accessor — never exported directly so callers cannot observe (or depend on)
 * a mutable storage cell.
 */
let _pgConfig: PGConnectionConfig | undefined;

/** Cached connection manager instance shared across CodeGen operations. */
let _manager: PGConnectionManager | undefined;

/**
 * Get-or-create the PostgreSQL connection pool for CodeGen operations.
 * Builds the config at first call so `initializeConfig()` has had a chance
 * to populate `configInfo`. Applies the optional `statement_timeout` GUC
 * (via {@link configInfo.codegenPool.statementTimeoutMs}) on every
 * checked-out client.
 *
 * @returns Promise resolving to the pg.Pool from the underlying manager.
 * @throws Error if connection fails.
 */
export async function PGConnection(): Promise<pg.Pool> {
  if (!_manager) {
    _pgConfig = buildPgConfig();
    _manager = new PGConnectionManager();
    await _manager.Initialize(_pgConfig);

    // statement_timeout is a per-session GUC in PostgreSQL — there is no
    // pool-wide knob equivalent to mssql's `requestTimeout`. We hook the
    // pool's `connect` event so every newly-checked-out client carries the
    // configured timeout. This matches the SQL Server side where
    // codegenPool.statementTimeoutMs applies pool-wide via the mssql config.
    const stmtTimeoutMs = configInfo.codegenPool?.statementTimeoutMs;
    if (stmtTimeoutMs && stmtTimeoutMs > 0) {
      _manager.Pool.on('connect', (client) => {
        client.query(`SET statement_timeout = ${stmtTimeoutMs}`).catch(() => {
          // Swallow: failure to set a session GUC should not break a CodeGen
          // run. PG will fall back to its server-wide default. We deliberately
          // don't log here to avoid noise during the per-connection event.
        });
      });
    }
  }
  return _manager.Pool;
}

/**
 * Returns the resolved {@link PGConnectionConfig} used by the active pool,
 * or `undefined` if {@link PGConnection} has not been called yet. Use this
 * when you need to read connection details (host, port, database) for
 * logging or diagnostics — the same pattern as `getSqlConfig()` for SQL
 * Server.
 *
 * Always call {@link PGConnection} before relying on this accessor in the
 * same code path — the config is populated as a side effect of opening the
 * pool. (`await PGConnection()` followed by `getPgConfig()` is guaranteed
 * to return the live config.)
 */
export function getPgConfig(): PGConnectionConfig | undefined {
  return _pgConfig;
}

/**
 * Closes the underlying connection manager + pool. Safe to call multiple
 * times. Used by tests and by long-running processes that need explicit
 * cleanup; production CodeGen runs let the process exit handle teardown.
 */
export async function ClosePGConnection(): Promise<void> {
  if (_manager) {
    await _manager.Close();
    _manager = undefined;
    _pgConfig = undefined;
  }
}
