/**
 * Adapter for PostgreSQL connectivity checks and role provisioning.
 *
 * Uses the `psql` CLI for both connectivity verification and role/database
 * setup. Unlike SqlServerAdapter (which can only do TCP checks), PostgresAdapter
 * can actually execute SQL because PostgreSQL allows local superuser connections
 * without a separate GUI client.
 *
 * In a devenv.nix environment, `psql` is always available via `pkgs.postgresql_16`.
 * Outside Nix, `psql` must be on PATH (PreflightPhase checks for this).
 *
 * @module adapters/PostgresAdapter
 * @see DatabaseProvisionPhase — uses this adapter when DatabaseType is 'postgres'.
 * @see PreflightPhase — checks for `psql` binary when DatabaseType is 'postgres'.
 */

import { execSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Result of a PostgreSQL connectivity check.
 */
export interface PgConnectivityResult {
  Reachable: boolean;
  ErrorMessage?: string;
  LatencyMs: number;
}

/**
 * Parameters for provisioning a PostgreSQL database with roles.
 */
export interface PgProvisionParams {
  Host: string;
  Port: number;
  DbName: string;
  CodeGenUser: string;
  CodeGenPassword: string;
  ApiUser: string;
  ApiPassword: string;
}

/**
 * Lightweight adapter for PostgreSQL connectivity checks and role provisioning.
 *
 * Uses the `psql` CLI — no npm driver dependency. Connectivity is verified by
 * running `SELECT 1`; provisioning runs idempotent `CREATE ROLE IF NOT EXISTS`
 * and `GRANT` statements as the superuser.
 *
 * **Superuser resolution**: When the `PGHOST` environment variable points to a
 * Unix socket directory (as devenv sets it), `psql` connects via peer
 * authentication as the current OS user — no `-U` flag needed. When connecting
 * over TCP (`localhost` / an IP), the `SuperUser` parameter (default `postgres`)
 * is passed explicitly.
 *
 * @example
 * ```typescript
 * const pg = new PostgresAdapter();
 * const result = await pg.CheckConnectivity('localhost', 5432);
 * if (result.Reachable) {
 *   await pg.ProvisionDatabase({ Host: 'localhost', Port: 5432, ... });
 * }
 * ```
 */
export class PostgresAdapter {
  /**
   * Test PostgreSQL connectivity by running a trivial query via `psql`.
   *
   * When `PGHOST` is set to a socket directory (devenv), omits `-U` and lets
   * peer auth handle authentication. Over TCP, connects as `superUser`.
   *
   * @param host - PostgreSQL hostname or socket directory path.
   * @param port - PostgreSQL port (typically 5432).
   * @param superUser - Superuser name for TCP connections (default: `'postgres'`).
   * @param timeoutMs - Maximum wait time (default: 5000ms).
   * @returns Connectivity result with reachability, optional error, and latency.
   */
  async CheckConnectivity(
    host: string,
    port: number,
    superUser: string = 'postgres',
    timeoutMs: number = 5000
  ): Promise<PgConnectivityResult> {
    const start = Date.now();
    try {
      const cmd = this.buildPsqlCmd(host, port, superUser, `"SELECT 1"`, '-q -t');
      execSync(cmd, { stdio: 'pipe', timeout: timeoutMs });
      return { Reachable: true, LatencyMs: Date.now() - start };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        Reachable: false,
        ErrorMessage: this.formatError(msg, host, port),
        LatencyMs: Date.now() - start,
      };
    }
  }

  /**
   * Provision a PostgreSQL database with two roles.
   *
   * Creates `codeGenUser` (with full DB ownership) and `apiUser` (with CONNECT
   * only) if they don't already exist. All statements are idempotent — safe to
   * run on an already-provisioned database.
   *
   * @param params - Database and credential parameters.
   * @param superUser - Superuser name for TCP connections (default: `'postgres'`).
   * @throws If `psql` exits non-zero for any statement.
   */
  async ProvisionDatabase(params: PgProvisionParams, superUser: string = 'postgres'): Promise<void> {
    const { Host: host, Port: port, DbName: dbName,
            CodeGenUser: codeGenUser, CodeGenPassword: codeGenPassword,
            ApiUser: apiUser, ApiPassword: apiPassword } = params;

    const psql = (sql: string) => this.runPsql(host, port, superUser, sql);

    // Idempotent role creation
    psql(`DO $$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${codeGenUser}') THEN
        CREATE ROLE "${codeGenUser}" WITH LOGIN PASSWORD '${codeGenPassword}';
      END IF;
    END $$`);

    psql(`DO $$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${apiUser}') THEN
        CREATE ROLE "${apiUser}" WITH LOGIN PASSWORD '${apiPassword}';
      END IF;
    END $$`);

    psql(`GRANT ALL PRIVILEGES ON DATABASE "${dbName}" TO "${codeGenUser}"`);
    psql(`GRANT CONNECT ON DATABASE "${dbName}" TO "${apiUser}"`);
  }

  /**
   * Run a single SQL statement via `psql`.
   *
   * Writes the SQL to a temp file and passes it via `-f` to avoid shell
   * quoting issues with `$$`-delimited PL/pgSQL blocks.
   */
  private runPsql(host: string, port: number, superUser: string, sql: string): void {
    const tmpFile = join(tmpdir(), `mj-pg-${Date.now()}-${Math.random().toString(36).slice(2)}.sql`);
    try {
      writeFileSync(tmpFile, sql, 'utf-8');
      const cmd = this.buildPsqlFileCmd(host, port, superUser, tmpFile, '-q');
      execSync(cmd, { stdio: 'pipe', timeout: 10_000 });
    } finally {
      try { unlinkSync(tmpFile); } catch { /* best-effort cleanup */ }
    }
  }

  /**
   * Build a `psql` command that reads SQL from a file (`-f`).
   *
   * When `PGHOST` env var is set to a socket directory (devenv sets this
   * automatically), omit `-h` and `-U` — peer auth handles authentication
   * as the current OS user via the unix socket.
   * Over TCP, use explicit `-h` and `-U`.
   */
  private buildPsqlFileCmd(host: string, port: number, superUser: string, filePath: string, flags: string): string {
    const pgHostEnv = process.env['PGHOST'] ?? '';
    const useSocket = pgHostEnv.startsWith('/');

    if (useSocket) {
      // Peer auth via unix socket — PGHOST already points to the socket dir
      return `psql -p ${port} -d postgres -f ${filePath} ${flags}`;
    }
    return `psql -h ${host} -p ${port} -U ${superUser} -d postgres -f ${filePath} ${flags}`;
  }

  /**
   * Build a `psql` command that runs a simple inline SQL expression (`-c`).
   * Only used for the connectivity `SELECT 1` check (no `$$` or special chars).
   */
  private buildPsqlCmd(host: string, port: number, superUser: string, sqlArg: string, flags: string): string {
    const pgHostEnv = process.env['PGHOST'] ?? '';
    const useSocket = pgHostEnv.startsWith('/');

    if (useSocket) {
      return `psql -p ${port} -d postgres -c ${sqlArg} ${flags}`;
    }
    return `psql -h ${host} -p ${port} -U ${superUser} -d postgres -c ${sqlArg} ${flags}`;
  }

  /**
   * Format a `psql` error message into a user-friendly diagnostic string.
   */
  private formatError(raw: string, host: string, port: number): string {
    if (raw.includes('Connection refused') || raw.includes('ECONNREFUSED')) {
      return `Connection refused at ${host}:${port}. Is PostgreSQL running?`;
    }
    if (raw.includes('could not translate host')) {
      return `Host "${host}" not found. Check the hostname.`;
    }
    if (raw.includes('timeout')) {
      return `Connection to ${host}:${port} timed out.`;
    }
    return raw.slice(0, 200);
  }
}
