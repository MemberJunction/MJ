/**
 * Database connection configuration and management for MemberJunction CodeGen.
 * Provides SQL Server connection setup using mssql package with configuration
 * from the main config file.
 *
 * **Lazy resolution**: `sqlConfig` is built each time `MSSQLConnection()` is
 * called rather than at module load. The previous implementation destructured
 * `configInfo` at module load time, which baked in empty/default values
 * before `initializeConfig()` had a chance to populate the live config (an
 * invocation order that breaks when a command does
 * `await import('@memberjunction/codegen-lib')` and then calls
 * `initializeConfig()` afterward). Lazy resolution fixes that race so
 * `mj codegen` and `mj install`'s codegen phase pick up the actual `.env`
 * and `mj.config.cjs` values.
 */

import mssql from 'mssql';
import { configInfo } from './config';

/**
 * Build the mssql config object from the current `configInfo`. Called from
 * {@link MSSQLConnection} on each cold-start so it reflects the values that
 * are present *after* `initializeConfig()` has run, not the empty defaults
 * that may have been visible at module load time.
 */
function buildSqlConfig(): mssql.config {
  const {
    dbDatabase,
    dbHost,
    codeGenPassword,
    dbPort,
    codeGenLogin,
    dbInstanceName,
    dbTrustServerCertificate,
    dbRequestTimeout,
  } = configInfo;

  return {
    user: codeGenLogin,
    password: codeGenPassword,
    server: dbHost,
    database: dbDatabase,
    port: dbPort,
    options: {
      /**
       * Request timeout for long-running CodeGen queries. Defaults to 120000ms
       * (2 min); override via `dbRequestTimeout` in mj.config.cjs or the
       * MJ_CODEGEN_REQUEST_TIMEOUT environment variable when steps like
       * spUpdateExistingEntityFieldsFromSchema run beyond the default.
       */
      requestTimeout: dbRequestTimeout ?? 120000,
      encrypt: true,
      instanceName: dbInstanceName && dbInstanceName.trim().length > 0 ? dbInstanceName : undefined,
      trustServerCertificate: dbTrustServerCertificate === 'Y',
    },
  };
}

/**
 * SQL Server configuration object for mssql package — exported for
 * backwards compatibility with callers that read it directly. Built once on
 * first access via the same lazy path as {@link MSSQLConnection}. Most code
 * should prefer `MSSQLConnection()` so the config reflects the latest
 * `initializeConfig()` state.
 */
export let sqlConfig: mssql.config | undefined;

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
    sqlConfig = buildSqlConfig();
    _pool = await mssql.connect(sqlConfig);
  }
  return _pool;
}
