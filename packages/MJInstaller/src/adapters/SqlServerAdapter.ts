/**
 * Adapter for SQL Server connectivity checks.
 *
 * Uses raw TCP sockets (no SQL driver dependency) for the preflight
 * connectivity test. This keeps the installer's dependency footprint small —
 * a full SQL driver (`tedious`, `mssql`) is not needed just to verify
 * that a server is accepting connections.
 *
 * Future phases that need actual SQL queries (e.g., user creation) will
 * use `@memberjunction/sqlserver-dataprovider` instead.
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
