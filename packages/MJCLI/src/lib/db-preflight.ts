/**
 * Database connection preflight.
 *
 * Opens a real connection using the same settings `mj migrate` uses, runs a
 * trivial query, and classifies any failure into an actionable result. The
 * headline cases:
 * - a self-signed / untrusted TLS certificate — suggest `DB_TRUST_SERVER_CERTIFICATE`
 *   for local instances, instead of the cryptic "self-signed certificate" error
 *   surfacing mid-migration;
 * - a database that does not exist — SQL Server reports it to the client as
 *   "Login failed for user" (error 18456; the "state 38" that names the cause is
 *   written only to the server's log), exactly like a wrong password. A login
 *   failure is therefore followed by a short probe against `master` that tells
 *   the two apart, so a missing database is not blamed on the credentials.
 *
 * Lives in MJCLI (not the installer) because the SQL driver (`mssql`) ships
 * here; the installer surfaces it through `mj migrate` / `--check-connection`.
 *
 * @module lib/db-preflight
 */

import mssql from 'mssql';
import { OpenConnection, type DbConnectionParams } from '../baseline/connection';
import type { Dialect } from '../baseline/types';
import type { MJConfig } from '../config';

/** The subset of config a connection needs — keeps this independently testable. */
export type DbConnectionConfig = Pick<
  MJConfig,
  'dbPlatform' | 'dbHost' | 'dbPort' | 'dbDatabase' | 'codeGenLogin' | 'codeGenPassword' | 'dbEncrypt' | 'dbTrustServerCertificate'
>;

/** Why a preflight connection failed, ordered by how specifically we can advise. */
export type DbPreflightReason = 'tls-untrusted-cert' | 'database-missing' | 'auth' | 'unreachable' | 'other';

/**
 * Outcome of a connection preflight. A flat shape (rather than a discriminated
 * union) because this package compiles without `strictNullChecks`, so union
 * narrowing on `Ok` is unreliable; `Reason`/`Message`/`Suggestion` are populated
 * only when `Ok` is false.
 */
export interface DbPreflightResult {
  /** True when a connection was established and a probe query succeeded. */
  Ok: boolean;
  /** Failure classification (set only when `Ok` is false). */
  Reason?: DbPreflightReason;
  /**
   * What went wrong (set only when `Ok` is false): the driver's error message — or,
   * for `database-missing`, the actual cause followed by the driver's text, because
   * SQL Server's own message names the login, not the database.
   */
  Message?: string;
  /** An actionable next step, when one can be offered. */
  Suggestion?: string;
}

/** What the `master` probe learned about the configured database. */
type DatabaseProbeOutcome = 'present' | 'absent' | 'inconclusive';

/**
 * Connect and query budgets for the probe. It runs only after a login failure,
 * when the server has just answered, so a short limit costs nothing on the
 * normal path and keeps a misbehaving server from stalling the error report.
 */
const DATABASE_PROBE_TIMEOUT_MS = 5_000;

/** Parameterized: the database name is bound as `@db`, never spliced into the SQL. */
const DATABASE_ID_QUERY = 'SELECT DB_ID(@db) AS DatabaseId';

/** The row {@link DATABASE_ID_QUERY} returns — `DB_ID()` is NULL for a database the server does not have. */
interface DatabaseIdRow {
  DatabaseId: number | null;
}

/**
 * The slice of `mssql`'s API the probe uses. MJCLI does not install `@types/mssql`,
 * so the module import is untyped; these interfaces pin the contract the probe
 * relies on instead of letting it flow through untyped.
 */
interface ProbeRequest {
  input(name: string, value: string): ProbeRequest;
  query<T>(command: string): Promise<{ recordset: T[] }>;
}
interface ProbePool {
  connect(): Promise<ProbePool>;
  request(): ProbeRequest;
  close(): Promise<void>;
}
/** `mssql`'s own option names for the settings the probe controls. */
interface ProbePoolConfig {
  server: string;
  port: number;
  user: string;
  password: string;
  database: string;
  connectionTimeout: number;
  requestTimeout: number;
  options: { encrypt: boolean; trustServerCertificate: boolean };
}
type ProbePoolConstructor = new (config: ProbePoolConfig) => ProbePool;

/** Map the config's DB platform to the connection helper's dialect. */
function dialectFor(platform: DbConnectionConfig['dbPlatform']): Dialect {
  return platform === 'postgresql' ? 'postgres' : 'mssql';
}

/** True when the error indicates an untrusted / self-signed TLS certificate. */
function isUntrustedCertError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('self-signed certificate') ||
    m.includes('self signed certificate') ||
    m.includes('depth_zero_self_signed_cert') ||
    m.includes('self_signed_cert_in_chain') ||
    m.includes('unable to verify the first certificate') ||
    m.includes('unable to get local issuer certificate')
  );
}

/** True when the error indicates a credentials / login problem. */
function isAuthError(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes('login failed') || m.includes('password authentication failed');
}

/** True when the error indicates the host / port could not be reached. */
function isUnreachableError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('econnrefused') || m.includes('etimedout') || m.includes('enotfound') || m.includes('connection timed out') || m.includes('could not connect')
  );
}

/** Turn a connection error message into a classified, actionable result. */
function classifyFailure(message: string, config: DbConnectionConfig): DbPreflightResult {
  if (isUntrustedCertError(message)) {
    // Only suggest trusting the cert when we aren't already trusting it — otherwise
    // the problem is a different cert issue and that advice would mislead.
    const suggestion = config.dbTrustServerCertificate
      ? undefined
      : 'The database is presenting a self-signed / untrusted TLS certificate. For a local or ' +
        'development instance, set DB_TRUST_SERVER_CERTIFICATE=1 in your .env (or ' +
        'dbTrustServerCertificate: true in mj.config.cjs) to trust it, then retry.';
    return { Ok: false, Reason: 'tls-untrusted-cert', Message: message, Suggestion: suggestion };
  }
  if (isAuthError(message)) {
    return {
      Ok: false,
      Reason: 'auth',
      Message: message,
      Suggestion: 'Check the database login (codeGenLogin / codeGenPassword) in your .env or mj.config.cjs.',
    };
  }
  if (isUnreachableError(message)) {
    return {
      Ok: false,
      Reason: 'unreachable',
      Message: message,
      Suggestion: `Confirm the database is running and reachable at ${config.dbHost}:${config.dbPort}.`,
    };
  }
  return { Ok: false, Reason: 'other', Message: message };
}

/**
 * Classify a failed connection. A SQL Server login failure gets one more look,
 * because it is also how the server reports a database that does not exist; if
 * that probe learns nothing, the plain classification stands.
 */
async function classifyConnectionFailure(message: string, config: DbConnectionConfig): Promise<DbPreflightResult> {
  const classified = classifyFailure(message, config);
  if (!mayBeMissingDatabase(classified, config)) {
    return classified;
  }
  const outcome = await probeDatabaseExists(config);
  if (outcome === 'absent') {
    return databaseMissingResult(message, config);
  }
  if (outcome === 'present') {
    return databaseNotOpenableResult(message, config);
  }
  return classified;
}

/**
 * A SQL Server login failure against a named database other than `master` — the
 * only failure a missing database can hide behind. (PostgreSQL names a missing
 * database outright, so it never needs the probe.)
 */
function mayBeMissingDatabase(classified: DbPreflightResult, config: DbConnectionConfig): boolean {
  return (
    classified.Reason === 'auth' &&
    dialectFor(config.dbPlatform) === 'mssql' &&
    !!config.dbDatabase &&
    config.dbDatabase.toLowerCase() !== 'master'
  );
}

/**
 * Ask `master`, with the same login, whether the configured database exists.
 * Never throws: a probe that cannot connect or query is `inconclusive`. Always
 * closes the connection it opened.
 */
async function probeDatabaseExists(config: DbConnectionConfig): Promise<DatabaseProbeOutcome> {
  let pool: ProbePool | undefined;
  try {
    const PoolConstructor: ProbePoolConstructor = mssql.ConnectionPool;
    pool = new PoolConstructor(buildProbePoolConfig(config));
    await pool.connect();
    const result = await pool.request().input('db', config.dbDatabase).query<DatabaseIdRow>(DATABASE_ID_QUERY);
    return interpretDatabaseIdRow(result.recordset?.[0]);
  } catch (probeErr) {
    // Intentionally not surfaced: the probe only refines a failure that is already
    // being reported. When it cannot connect either — a wrong password fails here
    // too — it has learned nothing, and the caller keeps the original classification.
    void probeErr;
    return 'inconclusive';
  } finally {
    await closeQuietly(pool);
  }
}

/** `DB_ID()` always returns one row; anything else means the probe learned nothing. */
function interpretDatabaseIdRow(row: DatabaseIdRow | undefined): DatabaseProbeOutcome {
  if (!row) {
    return 'inconclusive';
  }
  return row.DatabaseId == null ? 'absent' : 'present';
}

/**
 * The probe's connection: the configured server and login, `master` as the
 * database, and short timeouts. The TLS settings repeat {@link OpenConnection}'s
 * defaults on purpose, so the probe negotiates exactly as the failed attempt did.
 */
function buildProbePoolConfig(config: DbConnectionConfig): ProbePoolConfig {
  return {
    server: config.dbHost,
    port: config.dbPort ?? 1433,
    user: config.codeGenLogin,
    password: config.codeGenPassword,
    database: 'master',
    connectionTimeout: DATABASE_PROBE_TIMEOUT_MS,
    requestTimeout: DATABASE_PROBE_TIMEOUT_MS,
    options: {
      encrypt: config.dbEncrypt ?? false,
      trustServerCertificate: config.dbTrustServerCertificate ?? true,
    },
  };
}

/** The login works on the server, but the configured database is not there. */
function databaseMissingResult(message: string, config: DbConnectionConfig): DbPreflightResult {
  return {
    Ok: false,
    Reason: 'database-missing',
    Message:
      `Database '${config.dbDatabase}' does not exist on ${config.dbHost}:${config.dbPort}. ` +
      `(SQL Server reports a missing database as a failed login: ${message})`,
    Suggestion:
      'The login works — it connected to master — so this is not a credentials problem. Create the database ' +
      `(CREATE DATABASE ${quoteSqlServerIdentifier(config.dbDatabase)};), or run the mj-db-setup.sql script that ` +
      'mj install generated in the install directory, then retry. If the database does exist, this login cannot ' +
      'see it: grant the login access to it.',
  };
}

/** The login works and the database exists, but the login cannot open it. */
function databaseNotOpenableResult(message: string, config: DbConnectionConfig): DbPreflightResult {
  return {
    Ok: false,
    Reason: 'auth',
    Message: message,
    Suggestion:
      `The login works — it connected to master on ${config.dbHost}:${config.dbPort} — and database ` +
      `'${config.dbDatabase}' exists, so the credentials are not the problem: this login cannot open that ` +
      'database. Give the login a user in it (CREATE USER … FOR LOGIN …), or check that the database is online.',
  };
}

/** Bracket-quote a SQL Server identifier for a suggested statement (`]` is written as `]]`). */
function quoteSqlServerIdentifier(name: string): string {
  return `[${name.replace(/]/g, ']]')}]`;
}

/**
 * Open a real connection with the configured encrypt/trust settings, run a
 * trivial query, and report success or a classified failure. Always closes the
 * connection it opened. On a SQL Server login failure it makes one more short
 * connection, to `master`, to tell a missing database apart from bad credentials.
 */
export async function VerifyDatabaseConnection(config: DbConnectionConfig): Promise<DbPreflightResult> {
  const params: DbConnectionParams = {
    Dialect: dialectFor(config.dbPlatform),
    Host: config.dbHost,
    port: config.dbPort,
    User: config.codeGenLogin,
    Password: config.codeGenPassword,
    Database: config.dbDatabase,
    encrypt: config.dbEncrypt,
    trustServerCertificate: config.dbTrustServerCertificate,
  };

  let conn: { close(): Promise<void> } | undefined;
  try {
    const runner = await OpenConnection(params);
    conn = runner;
    await runner.query('SELECT 1');
    return { Ok: true };
  } catch (err) {
    return await classifyConnectionFailure(err instanceof Error ? err.message : String(err), config);
  } finally {
    await closeQuietly(conn);
  }
}

/** @deprecated Use {@link VerifyDatabaseConnection}. */
export async function verifyDatabaseConnection(config: DbConnectionConfig): Promise<DbPreflightResult> {
  return VerifyDatabaseConnection(config);
}

/** Best-effort close of a preflight connection; a teardown error must not mask the verdict. */
async function closeQuietly(conn: { close(): Promise<void> } | undefined): Promise<void> {
  if (!conn) return;
  try {
    await conn.close();
  } catch (closeErr) {
    // Intentionally ignored: this connection only probed reachability, so a close
    // failure is not actionable and must not overwrite the preflight result.
    void closeErr;
  }
}
