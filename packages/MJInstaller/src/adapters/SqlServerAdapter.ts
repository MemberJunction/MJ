/**
 * Adapter for SQL Server connectivity checks.
 *
 * Uses raw TCP sockets (no SQL driver dependency) for the preflight
 * connectivity test. This keeps the installer's dependency footprint small —
 * a full SQL driver (`tedious`, `mssql`) is not needed just to verify
 * that a server is accepting connections.
 *
 * The database phase also needs real SQL: it signs in to check whether the
 * database is already set up, and runs the generated setup script with an
 * administrator login when it is not. Those use the `mssql` driver directly
 * ({@link SqlServerAdapter.TryLogin}, {@link SqlServerAdapter.ExecuteBatches}).
 *
 * @module adapters/SqlServerAdapter
 * @see PreflightPhase — uses this adapter for the SQL connectivity check.
 * @see DatabaseProvisionPhase — uses this adapter for post-script validation.
 *
 * @example
 * ```typescript
 * const sql = new SqlServerAdapter();
 * const result = await sql.CheckConnectivity('localhost', 1433);
 * if (result.Reachable) {
 *   console.log(`Connected in ${result.LatencyMs}ms`);
 * } else {
 *   console.error(result.ErrorMessage);
 * }
 * ```
 */

import net from 'node:net';
import sql from 'mssql';

/**
 * Result of a TCP connectivity check to a SQL Server instance.
 *
 * @see SqlServerAdapter.CheckConnectivity
 */
export interface SqlConnectivityResult {
  /** Whether the TCP connection was established successfully. */
  Reachable: boolean;
  /** Human-readable error description (present only when `Reachable` is `false`). */
  ErrorMessage?: string;
  /** Round-trip time in milliseconds from connection attempt to result. */
  LatencyMs: number;
}

/** Where and as whom to sign in to SQL Server. */
export interface SqlLoginTarget {
  Host: string;
  Port: number;
  /** Database to open after signing in (`master` for server-level work). */
  Database: string;
  User: string;
  Password: string;
  /** Accept a self-signed server certificate (local and Docker instances). */
  TrustServerCertificate: boolean;
}

/** Result of {@link SqlServerAdapter.TryLogin}. */
export interface SqlLoginResult {
  /** The login succeeded and the database opened. */
  Ok: boolean;
  /**
   * SQL Server rejected the sign-in: the login does not exist, the password is
   * wrong, or the login cannot open the database. This is what an install looks
   * like before `mj-db-setup.sql` has run. `false` for every other failure
   * (unreachable host, TLS, timeout), which setup cannot fix.
   */
  LoginRejected: boolean;
  /** Driver message when `Ok` is `false`. */
  ErrorMessage?: string;
}

/** Thrown by {@link SqlServerAdapter.ExecuteBatches} when one batch fails. */
export class SqlBatchError extends Error {
  /** 1-based position of the failing batch in the script. */
  BatchNumber: number;

  constructor(batchNumber: number, message: string) {
    super(message);
    this.name = 'SqlBatchError';
    this.BatchNumber = batchNumber;
  }
}

/**
 * Lightweight adapter for testing SQL Server connectivity via raw TCP sockets.
 *
 * Does **not** perform SQL authentication or execute queries — only verifies
 * that the host:port is accepting TCP connections. This is sufficient for
 * preflight checks and post-provisioning validation.
 *
 * @example
 * ```typescript
 * const adapter = new SqlServerAdapter();
 * const result = await adapter.CheckConnectivity('db.example.com', 1433, 10000);
 * console.log(result.Reachable ? 'OK' : result.ErrorMessage);
 * ```
 */
export class SqlServerAdapter {
  /**
   * Test TCP connectivity to a SQL Server instance.
   *
   * Opens a raw TCP socket to the specified host and port. If the connection
   * is established within the timeout, returns `{ Reachable: true }`. Otherwise
   * returns a structured error with a human-readable message tailored to common
   * failure modes (ECONNREFUSED, ENOTFOUND, ETIMEDOUT, ECONNRESET).
   *
   * @param host - SQL Server hostname or IP address.
   * @param port - SQL Server TCP port (typically `1433`).
   * @param timeoutMs - Maximum time to wait for the connection, in milliseconds (default: `5000`).
   * @returns Connectivity result with reachability status, optional error, and latency.
   *
   * @example
   * ```typescript
   * const result = await adapter.CheckConnectivity('localhost', 1433);
   * if (!result.Reachable) {
   *   console.error(`SQL Server unreachable: ${result.ErrorMessage}`);
   * }
   * ```
   */
  async CheckConnectivity(host: string, port: number, timeoutMs: number = 5000): Promise<SqlConnectivityResult> {
    const start = Date.now();

    return new Promise<SqlConnectivityResult>((resolve) => {
      const socket = new net.Socket();

      const cleanup = () => {
        socket.removeAllListeners();
        socket.destroy();
      };

      socket.setTimeout(timeoutMs);

      socket.on('connect', () => {
        const latency = Date.now() - start;
        cleanup();
        resolve({ Reachable: true, LatencyMs: latency });
      });

      socket.on('timeout', () => {
        cleanup();
        resolve({
          Reachable: false,
          ErrorMessage: `Connection timed out after ${timeoutMs}ms`,
          LatencyMs: Date.now() - start,
        });
      });

      socket.on('error', (err: NodeJS.ErrnoException) => {
        cleanup();
        resolve({
          Reachable: false,
          ErrorMessage: formatConnectionError(err, host, port),
          LatencyMs: Date.now() - start,
        });
      });

      socket.connect(port, host);
    });
  }

  /**
   * Sign in to SQL Server and open `target.Database`, then disconnect.
   *
   * @param target - Server, database, and credentials to try.
   * @returns Whether the sign-in worked and, if not, whether SQL Server refused it.
   */
  async TryLogin(target: SqlLoginTarget): Promise<SqlLoginResult> {
    const pool = new sql.ConnectionPool(buildPoolConfig(target));
    try {
      await pool.connect();
      return { Ok: true, LoginRejected: false };
    } catch (err) {
      const code = (err as { code?: string }).code;
      return {
        Ok: false,
        LoginRejected: code === 'ELOGIN',
        // Drop the driver's closing period; callers embed this in their own sentences.
        ErrorMessage: (err instanceof Error ? err.message : String(err)).replace(/\.\s*$/, ''),
      };
    } finally {
      await pool.close().catch(() => undefined);
    }
  }

  /**
   * Run SQL batches in order on one connection, so `USE` in one batch carries
   * into the next, exactly as SSMS or `sqlcmd` would run a script split on `GO`.
   *
   * @param target - Server and credentials; `Database` is where the session starts.
   * @param batches - Batch texts with the `GO` separators already removed.
   * @param onMessage - Receives each `PRINT` / informational message the server sends.
   * @throws {SqlBatchError} For the first batch that fails; later batches do not run.
   */
  async ExecuteBatches(target: SqlLoginTarget, batches: string[], onMessage: (message: string) => void): Promise<void> {
    const pool = new sql.ConnectionPool(buildPoolConfig(target));
    try {
      await pool.connect();
      for (let i = 0; i < batches.length; i++) {
        const request = pool.request();
        request.on('info', (info: { message: string }) => onMessage(info.message));
        try {
          await request.batch(batches[i]);
        } catch (err) {
          throw new SqlBatchError(i + 1, err instanceof Error ? err.message : String(err));
        }
      }
    } finally {
      await pool.close().catch(() => undefined);
    }
  }
}

/**
 * Pool settings for installer SQL work: a single connection (so session state
 * such as `USE` survives between batches) and generous timeouts, because
 * `CREATE DATABASE` can take a while on a slow disk.
 */
function buildPoolConfig(target: SqlLoginTarget): sql.config {
  return {
    server: target.Host,
    port: target.Port,
    database: target.Database,
    user: target.User,
    password: target.Password,
    connectionTimeout: 15_000,
    requestTimeout: 120_000,
    pool: { max: 1, min: 0 },
    options: {
      encrypt: true,
      trustServerCertificate: target.TrustServerCertificate,
    },
  };
}

/**
 * Map common TCP socket error codes to human-readable diagnostic messages.
 *
 * @param err - The Node.js socket error with an `errno` code.
 * @param host - The hostname that was being connected to.
 * @param port - The port that was being connected to.
 * @returns A user-friendly error message with diagnostic hints.
 */
function formatConnectionError(err: NodeJS.ErrnoException, host: string, port: number): string {
  switch (err.code) {
    case 'ECONNREFUSED':
      return `Connection refused at ${host}:${port}. Is SQL Server running?`;
    case 'ENOTFOUND':
      return `Host "${host}" not found. Check the hostname.`;
    case 'ETIMEDOUT':
      return `Connection to ${host}:${port} timed out. Check firewall rules.`;
    case 'ECONNRESET':
      return `Connection to ${host}:${port} was reset. SQL Server may be starting up.`;
    default:
      return `${err.code ?? 'Unknown error'}: ${err.message}`;
  }
}
