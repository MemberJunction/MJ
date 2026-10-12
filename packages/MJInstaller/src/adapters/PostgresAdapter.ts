/**
 * Adapter for PostgreSQL connectivity checks and setup execution.
 *
 * Uses the `pg` driver for connection testing and script execution.
 * This adapter mirrors SqlServerAdapter's interface for platform-agnostic
 * provisioning logic.
 *
 * @module adapters/PostgresAdapter
 * @see DatabaseProvisionPhase — uses this adapter for PostgreSQL setup.
 *
 * @example
 * ```typescript
 * const pg = new PostgresAdapter();
 * const result = await pg.CheckConnectivity('localhost', 5432);
 * if (result.Reachable) {
 *   console.log(`Connected in ${result.LatencyMs}ms`);
 * } else {
 *   console.error(result.ErrorMessage);
 * }
 * ```
 */

import { Client, type ClientConfig } from 'pg';

/**
 * Result of a connectivity check to a PostgreSQL server.
 *
 * @see PostgresAdapter.CheckConnectivity
 */
export interface PgConnectivityResult {
  /** Whether the connection was established successfully. */
  Reachable: boolean;
  /** Human-readable error description (present only when `Reachable` is `false`). */
  ErrorMessage?: string;
  /** Round-trip time in milliseconds from connection attempt to result. */
  LatencyMs: number;
}

/**
 * Result of attempting to log in to a PostgreSQL server.
 *
 * @see PostgresAdapter.TryLogin
 */
export interface PgLoginResult {
  /** Whether login succeeded. */
  Success: boolean;
  /** Reason for login failure (only when `Success` is `false`). */
  ErrorMessage?: string;
  /** Whether the error was specifically due to wrong password (error code 28P01) or invalid authorization (28000). */
  IsLoginRejected: boolean;
  /** Whether the database does not exist (error code 3D000). */
  IsDatabaseMissing: boolean;
}

/**
 * Lightweight adapter for testing PostgreSQL connectivity and login.
 *
 * @example
 * ```typescript
 * const adapter = new PostgresAdapter();
 * const result = await adapter.CheckConnectivity('localhost', 5432, 10000);
 * console.log(result.Reachable ? 'OK' : result.ErrorMessage);
 * ```
 */
export class PostgresAdapter {
  /**
   * Test TCP connectivity to a PostgreSQL server.
   *
   * Opens a connection to the specified host and port. If the connection
   * is established within the timeout, returns `{ Reachable: true }`. Otherwise
   * returns a structured error with a human-readable message tailored to common
   * failure modes.
   *
   * @param host - PostgreSQL hostname or IP address.
   * @param port - PostgreSQL TCP port (typically `5432`).
   * @param timeoutMs - Maximum time to wait for the connection, in milliseconds (default: `5000`).
   * @returns Connectivity result with reachability status, optional error, and latency.
   *
   * @example
   * ```typescript
   * const result = await adapter.CheckConnectivity('localhost', 5432);
   * if (!result.Reachable) {
   *   console.error(`PostgreSQL unreachable: ${result.ErrorMessage}`);
   * }
   * ```
   */
  async CheckConnectivity(
    host: string,
    port: number,
    timeoutMs: number = 5000
  ): Promise<PgConnectivityResult> {
    const start = Date.now();
    const client = new Client({
      host,
      port,
      database: 'postgres', // Use the maintenance database for connectivity check
      user: 'postgres',
      password: 'ignored', // We don't care if auth fails; we just care if the server is there
      application_name: 'mj-installer-check',
      connect_timeout: Math.ceil(timeoutMs / 1000), // pg expects seconds
    });

    try {
      await client.connect();
      const latency = Date.now() - start;
      await client.end();
      return { Reachable: true, LatencyMs: latency };
    } catch (err) {
      const latency = Date.now() - start;
      return {
        Reachable: false,
        ErrorMessage: formatPgConnectionError(err, host, port),
        LatencyMs: latency,
      };
    }
  }

  /**
   * Attempt to log in to a PostgreSQL server and optionally a specific database.
   *
   * Tests both server connectivity and login credentials. Returns structured results
   * distinguishing between connection failures, login rejections, and missing databases.
   *
   * @param host - PostgreSQL hostname or IP address.
   * @param port - PostgreSQL TCP port.
   * @param username - PostgreSQL user to authenticate as.
   * @param password - Password for the user.
   * @param database - Optional database to connect to (defaults to 'postgres').
   * @param timeoutMs - Connection timeout in milliseconds (default: `10000`).
   * @returns Login result with success status and detailed error classification.
   *
   * @example
   * ```typescript
   * const result = await adapter.TryLogin('localhost', 5432, 'mj_codegen', 'secret', 'mj_database');
   * if (result.IsLoginRejected) {
   *   console.error('Invalid credentials');
   * } else if (result.IsDatabaseMissing) {
   *   console.error('Database does not exist');
   * }
   * ```
   */
  async TryLogin(
    host: string,
    port: number,
    username: string,
    password: string,
    database: string = 'postgres',
    timeoutMs: number = 10000
  ): Promise<PgLoginResult> {
    const client = new Client({
      host,
      port,
      database,
      user: username,
      password,
      application_name: 'mj-installer-login',
      connect_timeout: Math.ceil(timeoutMs / 1000),
    });

    try {
      await client.connect();
      await client.end();
      return { Success: true, IsLoginRejected: false, IsDatabaseMissing: false };
    } catch (err) {
      const error = err as NodeJS.ErrnoException & { code?: string };
      const code = error?.code;

      // Check for login rejection (invalid password or invalid authorization)
      if (code === '28P01' || code === '28000') {
        return {
          Success: false,
          ErrorMessage: `Invalid credentials for user '${username}': ${error?.message ?? 'unknown error'}`,
          IsLoginRejected: true,
          IsDatabaseMissing: false,
        };
      }

      // Check for missing database
      if (code === '3D000') {
        return {
          Success: false,
          ErrorMessage: `Database '${database}' does not exist.`,
          IsLoginRejected: false,
          IsDatabaseMissing: true,
        };
      }

      // Other error
      return {
        Success: false,
        ErrorMessage: `Failed to connect to PostgreSQL: ${error?.message ?? 'unknown error'}`,
        IsLoginRejected: false,
        IsDatabaseMissing: false,
      };
    }
  }

  /**
   * Execute a SQL script against a PostgreSQL database.
   *
   * Connects as the specified user and executes the SQL text. Each statement
   * must be separated by a semicolon (simple split-by-semicolon parsing).
   *
   * @param host - PostgreSQL hostname or IP address.
   * @param port - PostgreSQL TCP port.
   * @param database - Database to connect to.
   * @param username - User to authenticate as.
   * @param password - Password for the user.
   * @param sqlText - SQL script to execute (statements separated by `;`).
   * @param timeoutMs - Statement timeout in milliseconds (default: `60000`).
   * @returns Result with success status and optional error message.
   *
   * @example
   * ```typescript
   * const result = await adapter.ExecuteScript(
   *   'localhost', 5432, 'postgres', 'postgres', 'secret',
   *   'CREATE SCHEMA IF NOT EXISTS __mj;'
   * );
   * ```
   */
  async ExecuteScript(
    host: string,
    port: number,
    database: string,
    username: string,
    password: string,
    sqlText: string,
    timeoutMs: number = 60000
  ): Promise<{ Success: boolean; ErrorMessage?: string }> {
    const client = new Client({
      host,
      port,
      database,
      user: username,
      password,
      application_name: 'mj-installer-setup',
      connect_timeout: Math.ceil(timeoutMs / 1000),
    });

    try {
      await client.connect();
      await client.query(`SET statement_timeout TO ${timeoutMs}`);

      // Split on semicolon but preserve them for accurate error reporting
      const statements = sqlText.split(';').map((s) => s.trim()).filter((s) => s.length > 0);

      for (const statement of statements) {
        try {
          await client.query(statement);
        } catch (err) {
          const error = err as Error;
          throw new Error(`Statement failed: ${error.message}\n\nStatement:\n${statement}`);
        }
      }

      await client.end();
      return { Success: true };
    } catch (err) {
      const error = err as Error;
      return {
        Success: false,
        ErrorMessage: `PostgreSQL script execution failed: ${error?.message ?? 'unknown error'}`,
      };
    }
  }
}

/**
 * Map common PostgreSQL error codes and Node.js socket errors to human-readable diagnostic messages.
 *
 * @param err - The error object (may have a `code` property for PostgreSQL errors).
 * @param host - The hostname that was being connected to.
 * @param port - The port that was being connected to.
 * @returns A user-friendly error message with diagnostic hints.
 */
function formatPgConnectionError(err: unknown, host: string, port: number): string {
  const error = err as NodeJS.ErrnoException & { code?: string };

  // PostgreSQL-specific error codes
  if (error?.code) {
    switch (error.code) {
      case '28P01':
        return `Authentication failed for PostgreSQL at ${host}:${port}. Check the password.`;
      case '28000':
        return `Authorization failed for PostgreSQL at ${host}:${port}. Check the username and password.`;
      case '3D000':
        return `Database does not exist on PostgreSQL at ${host}:${port}.`;
      case 'ECONNREFUSED':
        return `Connection refused at ${host}:${port}. Is PostgreSQL running?`;
      case 'ENOTFOUND':
        return `Host "${host}" not found. Check the hostname.`;
      case 'ETIMEDOUT':
        return `Connection to ${host}:${port} timed out. Check firewall rules.`;
      case 'ECONNRESET':
        return `Connection to ${host}:${port} was reset. PostgreSQL may be starting up.`;
      default:
        return `${error.code}: ${error.message}`;
    }
  }

  // Fallback for unknown errors
  return `Failed to connect to PostgreSQL at ${host}:${port}: ${(error as Error)?.message ?? 'unknown error'}`;
}
