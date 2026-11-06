/**
 * Adapter for PostgreSQL connectivity checks, sign-in checks, and setup execution.
 *
 * The reachability check is a raw TCP probe (no credentials are sent), the
 * same approach {@link SqlServerAdapter} uses. Signing in and running the
 * setup statements use the `pg` driver directly
 * ({@link PostgresAdapter.TryLogin}, {@link PostgresAdapter.ExecuteSteps}).
 *
 * @module adapters/PostgresAdapter
 * @see DatabaseProvisionPhase — uses this adapter on PostgreSQL installs.
 *
 * @example
 * ```typescript
 * const pg = new PostgresAdapter();
 * const result = await pg.CheckConnectivity('localhost', 5432);
 * if (result.Reachable) {
 *   console.log(`Reachable in ${result.LatencyMs}ms`);
 * } else {
 *   console.error(result.ErrorMessage);
 * }
 * ```
 */

import net from 'node:net';
import pg from 'pg';

/**
 * Result of a TCP connectivity check to a PostgreSQL server.
 *
 * @see PostgresAdapter.CheckConnectivity
 */
export interface PgConnectivityResult {
  /** Whether the TCP connection was established successfully. */
  Reachable: boolean;
  /** Human-readable error description (present only when `Reachable` is `false`). */
  ErrorMessage?: string;
  /** Round-trip time in milliseconds from connection attempt to result. */
  LatencyMs: number;
}

/** Where and as whom to sign in to PostgreSQL. */
export interface PgLoginTarget {
  Host: string;
  Port: number;
  /** Database to connect to (`postgres` for server-level work). */
  Database: string;
  User: string;
  Password: string;
}

/** Result of {@link PostgresAdapter.TryLogin}. */
export interface PgLoginResult {
  /** The sign-in succeeded and the database opened. */
  Ok: boolean;
  /**
   * PostgreSQL refused the sign-in in a way that setup fixes: the role does
   * not exist, the password is wrong, the database does not exist, or the
   * role may not connect to it. `false` for every other failure (unreachable
   * host, TLS, timeout), which setup cannot fix.
   */
  LoginRejected: boolean;
  /** Driver message when `Ok` is `false`. */
  ErrorMessage?: string;
}

/**
 * One statement of the PostgreSQL setup, in the order it must run.
 *
 * Every step is a single statement sent on its own (never a split script), so
 * statements PostgreSQL refuses inside a transaction block — `CREATE DATABASE`
 * — run as plain queries.
 */
export interface PgSetupStep {
  /** Database the statement runs in: the maintenance database or the MJ database. */
  Database: string;
  /** Short description, used in progress messages and the generated script. */
  Description: string;
  /** The statement. */
  Sql: string;
  /**
   * Optional existence check. When this query returns a row, the step is
   * skipped. Used for statements that have no `IF NOT EXISTS` form
   * (`CREATE DATABASE`, `CREATE ROLE`). `$1` is bound to `Param`.
   */
  SkipIf?: { Sql: string; Param: string };
}

/** Thrown by {@link PostgresAdapter.ExecuteSteps} when one step fails. */
export class PgStepError extends Error {
  /** 1-based position of the failing step. */
  StepNumber: number;
  /** Description of the failing step. */
  StepDescription: string;

  constructor(stepNumber: number, stepDescription: string, message: string) {
    super(message);
    this.name = 'PgStepError';
    this.StepNumber = stepNumber;
    this.StepDescription = stepDescription;
  }
}

/**
 * SQLSTATE codes that mean "not set up yet" when signing in:
 * `28P01` invalid password, `28000` invalid authorization (for example the
 * role does not exist), `3D000` database does not exist, `42501` the role
 * lacks CONNECT on the database.
 */
const LOGIN_REJECTED_CODES: ReadonlySet<string> = new Set(['28P01', '28000', '3D000', '42501']);

/**
 * Lightweight adapter for PostgreSQL reachability, sign-in checks, and running
 * the installer's setup steps.
 *
 * @example
 * ```typescript
 * const adapter = new PostgresAdapter();
 * const login = await adapter.TryLogin({ Host: 'localhost', Port: 5432, Database: 'mj', User: 'MJ_Connect', Password: 'secret' });
 * console.log(login.Ok ? 'OK' : login.ErrorMessage);
 * ```
 */
export class PostgresAdapter {
  /**
   * Test TCP connectivity to a PostgreSQL server. No credentials are sent.
   *
   * @param host - PostgreSQL hostname or IP address.
   * @param port - PostgreSQL TCP port (typically `5432`).
   * @param timeoutMs - Maximum time to wait for the connection, in milliseconds (default: `5000`).
   * @returns Connectivity result with reachability status, optional error, and latency.
   */
  async CheckConnectivity(host: string, port: number, timeoutMs: number = 5000): Promise<PgConnectivityResult> {
    const start = Date.now();

    return new Promise<PgConnectivityResult>((resolve) => {
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
          ErrorMessage: formatSocketError(err, host, port),
          LatencyMs: Date.now() - start,
        });
      });

      socket.connect(port, host);
    });
  }

  /**
   * Sign in to PostgreSQL and open `target.Database`, then disconnect.
   *
   * @param target - Server, database, and credentials to try.
   * @returns Whether the sign-in worked and, if not, whether PostgreSQL refused it.
   */
  async TryLogin(target: PgLoginTarget): Promise<PgLoginResult> {
    const client = new pg.Client(buildClientConfig(target, 'mj-installer-login'));
    try {
      await client.connect();
      return { Ok: true, LoginRejected: false };
    } catch (err) {
      const code = (err as { code?: string }).code;
      return {
        Ok: false,
        LoginRejected: code !== undefined && LOGIN_REJECTED_CODES.has(code),
        ErrorMessage: (err instanceof Error ? err.message : String(err)).replace(/\.\s*$/, ''),
      };
    } finally {
      await client.end().catch(() => undefined);
    }
  }

  /**
   * Run setup steps in order, each as its own plain query outside any
   * transaction block. A new connection is opened whenever a step targets a
   * different database than the one before it; every connection is closed
   * before this method returns, whether it succeeds or throws.
   *
   * @param server - Server and credentials; each step supplies its own database.
   * @param steps - The ordered setup steps.
   * @param onMessage - Receives a line per step (run or skipped) and each server NOTICE.
   * @throws {PgStepError} For the first step that fails; later steps do not run.
   */
  async ExecuteSteps(
    server: Omit<PgLoginTarget, 'Database'>,
    steps: PgSetupStep[],
    onMessage: (message: string) => void
  ): Promise<void> {
    let client: pg.Client | null = null;
    let currentDatabase: string | null = null;
    try {
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        try {
          if (client === null || currentDatabase !== step.Database) {
            if (client !== null) {
              const previous = client;
              client = null;
              await previous.end();
            }
            const next = new pg.Client(buildClientConfig({ ...server, Database: step.Database }, 'mj-installer-setup'));
            next.on('notice', (notice: { message?: string }) => onMessage(notice.message ?? ''));
            client = next;
            await next.connect();
            currentDatabase = step.Database;
          }

          if (step.SkipIf) {
            const existing = await client.query(step.SkipIf.Sql, [step.SkipIf.Param]);
            if ((existing.rowCount ?? 0) > 0) {
              onMessage(`Skipped (already exists): ${step.Description}`);
              continue;
            }
          }
          await client.query(step.Sql);
          onMessage(`Done: ${step.Description}`);
        } catch (err) {
          throw new PgStepError(i + 1, step.Description, err instanceof Error ? err.message : String(err));
        }
      }
    } finally {
      if (client !== null) {
        await client.end().catch(() => undefined);
      }
    }
  }
}

/**
 * Connection settings for installer work: one short-lived client with a
 * bounded connect timeout. TLS follows the `pg` driver's own environment
 * handling (`PGSSLMODE`), so managed servers that require it still work.
 */
function buildClientConfig(target: PgLoginTarget, applicationName: string): pg.ClientConfig {
  return {
    host: target.Host,
    port: target.Port,
    database: target.Database,
    user: target.User,
    password: target.Password,
    application_name: applicationName,
    connectionTimeoutMillis: 15_000,
    // CREATE DATABASE can take a while on a slow disk.
    statement_timeout: 120_000,
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
function formatSocketError(err: NodeJS.ErrnoException, host: string, port: number): string {
  switch (err.code) {
    case 'ECONNREFUSED':
      return `Connection refused at ${host}:${port}. Is PostgreSQL running?`;
    case 'ENOTFOUND':
      return `Host "${host}" not found. Check the hostname.`;
    case 'ETIMEDOUT':
      return `Connection to ${host}:${port} timed out. Check firewall rules.`;
    case 'ECONNRESET':
      return `Connection to ${host}:${port} was reset. PostgreSQL may be starting up.`;
    default:
      return `${err.code ?? 'Unknown error'}: ${err.message}`;
  }
}
