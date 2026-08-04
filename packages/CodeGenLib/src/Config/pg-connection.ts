/**
 * PostgreSQL-specific connection configuration and management for
 * MemberJunction CodeGen. Provides the lazy `pg.Pool` used by the
 * PostgreSQL codegen path (see `PostgreSQLCodeGenProvider.SetupDataSource()`).
 *
 * **Scope** — this file is intentionally PostgreSQL-only; it imports
 * `@memberjunction/postgresql-dataprovider`'s {@link PGConnectionManager}
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
 * has run. {@link configInfo.codegenPool} supplies optional pool-size, timeout,
 * and SSL knobs; when omitted, the pre-multi-provider-refactor inline `pg.Pool`
 * behavior is preserved — no SSL by default (matches the historical local-codegen
 * default), no startup options, and `PGConnectionManager`'s own pool-size defaults
 * (20 max, 2 min).
 *
 * `statementTimeoutMs` is carried via the libpq `-c statement_timeout=<ms>`
 * startup option rather than a runtime `SET` on the pool's `connect` event.
 * The startup option is honored by every backend including the verify-SELECT-1
 * connection that `PGConnectionManager.Initialize()` opens — a runtime listener
 * would attach AFTER that connection had already been created and released back
 * into the pool, leaving the first pool client without the GUC.
 */
function buildPgConfig(): PGConnectionConfig {
  const pool = configInfo.codegenPool;

  // SSL: default to false (preserves the pre-refactor inline `pg.Pool` behavior
  // where no `ssl` key was set → pg default OFF). Without this explicit `false`,
  // `PGConnectionManager.Initialize()` would default SSL ON in `NODE_ENV=production`,
  // breaking codegen against non-SSL/locally-bridged Postgres in production shells.
  const ssl = pool?.ssl ?? false;

  // statement_timeout via libpq startup option — applied server-side from
  // connection #1, including the verify-SELECT-1 connection.
  const stmtTimeoutMs = pool?.statementTimeoutMs;
  const options = stmtTimeoutMs && stmtTimeoutMs > 0 ? `-c statement_timeout=${stmtTimeoutMs}` : undefined;

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
    SSL: ssl,
    Options: options,
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
 * to populate `configInfo`. The optional `statement_timeout` GUC (via
 * {@link configInfo.codegenPool.statementTimeoutMs}) is carried in the libpq
 * startup options assembled by {@link buildPgConfig} — see its docstring for
 * why the startup-option path is preferred over a runtime `connect` listener.
 *
 * @returns Promise resolving to the pg.Pool from the underlying manager.
 * @throws Error if connection fails.
 */
export async function PGConnection(): Promise<pg.Pool> {
  if (!_manager) {
    _pgConfig = buildPgConfig();
    _manager = new PGConnectionManager();
    await _manager.Initialize(_pgConfig);
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
