/**
 * Adapter for SQL Server connectivity checks.
 *
 * Uses raw TCP sockets (no SQL driver dependency) for the preflight
 * connectivity test. Future phases that need actual SQL queries
 * will use @memberjunction/sqlserver-dataprovider.
 */

import net from 'node:net';

export interface SqlConnectivityResult {
  Reachable: boolean;
  ErrorMessage?: string;
  LatencyMs: number;
}

export class SqlServerAdapter {
  /**
   * Test TCP connectivity to a SQL Server instance.
   * This is a lightweight check — it verifies the host:port is accepting
   * connections, not that authentication succeeds.
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
