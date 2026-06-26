/**
 * SQL Server-specific connection configuration and management for
 * MemberJunction CodeGen. Provides the lazy mssql pool used by the
 * SQL Server codegen path (see `runCodeGen.ts` → `setupSQLServerDataSource`).
 *
 * **Scope** — this file is intentionally SQL-Server-only; it imports `mssql`
 * directly. The PostgreSQL codegen path (`setupPostgreSQLDataSource` in
 * `runCodeGen.ts`) creates its `pg.Pool` inline and does not touch
 * `MSSQLConnection` or `getSqlConfig`. A future refactor may unify both
 * paths behind the existing `CodeGenDatabaseProvider` factory; for now the
 * SQL Server and PostgreSQL halves stay separate.
 *
 * **Lazy resolution** — the mssql config is built lazily on the first call
 * to {@link MSSQLConnection} instead of at module load. The previous
 * implementation destructured `configInfo` at module load time, capturing
 * empty/default values *before* `initializeConfig()` had a chance to
 * populate the live config (a real race when any caller does
 * `await import('@memberjunction/codegen-lib')` and then `initializeConfig()`
 * afterward). Lazy resolution fixes the race so `mj codegen` and `mj install`'s
 * codegen phase pick up the actual `.env` and `mj.config.cjs` values.
 */

import mssql from 'mssql';
import { configInfo } from './config';

/**
 * Build the mssql config object from the current `configInfo`. Called from
 * {@link MSSQLConnection} on each cold-start so it reflects the values that
 * are present *after* `initializeConfig()` has run, not the empty defaults
 * that may have been visible at module load time.
 *
 * Exported for unit-test access to the `codegenPool.statementTimeoutMs` →
 * `dbRequestTimeout` → 120000 precedence chain. Production code uses
 * {@link MSSQLConnection} (which caches the resolved config + pool); this
 * export gives tests a pure-function entry point without forcing them to
 * mock `mssql.connect`.
 */
export function buildSqlConfig(): mssql.config {
  const {
    dbDatabase,
    dbHost,
    codeGenPassword,
    dbPort,
    codeGenLogin,
    dbInstanceName,
    dbTrustServerCertificate,
    dbRequestTimeout,
    codegenPool,
  } = configInfo;

  // Resolve the request timeout from the cross-platform knob first, then fall
  // back to the legacy SQL-Server-only `dbRequestTimeout`, then to mssql's
  // 120000ms default. Keeps existing configs working while the unified
  // `codegenPool.statementTimeoutMs` becomes the canonical knob for both
  // providers.
  const requestTimeout = codegenPool?.statementTimeoutMs ?? dbRequestTimeout ?? 120000;

  return {
    user: codeGenLogin,
    password: codeGenPassword,
    server: dbHost,
    database: dbDatabase,
    port: dbPort,
    options: {
      /**
       * Request timeout for long-running CodeGen queries. Resolved from
       * `codegenPool.statementTimeoutMs` (cross-platform, preferred) → the legacy
       * `dbRequestTimeout` (SQL Server only) / `MJ_CODEGEN_REQUEST_TIMEOUT` env
       * var → mssql's 120000ms (2 min) default. Bump when steps like
       * spUpdateExistingEntityFieldsFromSchema run beyond the default.
       */
      requestTimeout,
      encrypt: true,
      instanceName: dbInstanceName && dbInstanceName.trim().length > 0 ? dbInstanceName : undefined,
      trustServerCertificate: dbTrustServerCertificate === 'Y',
    },
  };
}

/**
 * Module-internal cache for the resolved mssql config. Populated on first
 * call to {@link MSSQLConnection}. Read via the {@link getSqlConfig}
 * accessor — never exported directly so callers cannot observe (or depend
 * on) the mutable-`let` shape.
 */
let _sqlConfig: mssql.config | undefined;

/** Cached connection pool instance for reuse across code generation operations */
let _pool: mssql.ConnectionPool;

/**
 * Gets or creates a SQL Server connection pool for database operations.
 * Uses singleton pattern to reuse the same connection pool across multiple
 * code generation operations for better performance.
 *
 * The mssql config is built **at first connection time** so that
 * `initializeConfig()` has had a chance to populate `configInfo` from the
 * user's `.env` and `mj.config.cjs`. Building it at module load (the prior
 * behavior) captured stale empty values and triggered
 * `"config.server property is required"` at codegen time.
 *
 * @returns Promise resolving to the mssql ConnectionPool instance
 * @throws Error if connection fails
 */
export async function MSSQLConnection(): Promise<mssql.ConnectionPool> {
  if (!_pool) {
    _sqlConfig = buildSqlConfig();
    _pool = await mssql.connect(_sqlConfig);
  }
  return _pool;
}

/**
 * Returns the resolved mssql config used by the active connection pool, or
 * `undefined` if {@link MSSQLConnection} has not been called yet. Use this
 * when you need to read connection details (server, port, instance,
 * database) for logging or diagnostics.
 *
 * Always call {@link MSSQLConnection} before relying on this accessor in
 * the same code path — the config is populated as a side effect of opening
 * the pool. (`await MSSQLConnection()` followed by `getSqlConfig()` is
 * guaranteed to return the live config.)
 */
export function getSqlConfig(): mssql.config | undefined {
  return _sqlConfig;
}
