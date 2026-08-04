/**
 * Database connection preflight.
 *
 * Opens a real connection using the same settings `mj migrate` uses, runs a
 * trivial query, and classifies any failure into an actionable result. The
 * headline case: detecting a self-signed / untrusted TLS certificate and
 * suggesting `DB_TRUST_SERVER_CERTIFICATE` for local instances — instead of the
 * cryptic "self-signed certificate" error surfacing mid-migration.
 *
 * Lives in MJCLI (not the installer) because the SQL driver (`mssql`) ships
 * here; the installer surfaces it through `mj migrate` / `--check-connection`.
 *
 * @module lib/db-preflight
 */

import { openConnection, type DbConnectionParams } from '../baseline/connection';
import type { Dialect } from '../baseline/types';
import type { MJConfig } from '../config';

/** The subset of config a connection needs — keeps this independently testable. */
export type DbConnectionConfig = Pick<
  MJConfig,
  'dbPlatform' | 'dbHost' | 'dbPort' | 'dbDatabase' | 'codeGenLogin' | 'codeGenPassword' | 'dbEncrypt' | 'dbTrustServerCertificate'
>;

/** Why a preflight connection failed, ordered by how specifically we can advise. */
export type DbPreflightReason = 'tls-untrusted-cert' | 'auth' | 'unreachable' | 'other';

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
  /** Underlying error message (set only when `Ok` is false). */
  Message?: string;
  /** An actionable next step, when one can be offered. */
  Suggestion?: string;
}

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
 * Open a real connection with the configured encrypt/trust settings, run a
 * trivial query, and report success or a classified failure. Always closes the
 * connection it opened.
 */
export async function verifyDatabaseConnection(config: DbConnectionConfig): Promise<DbPreflightResult> {
  const params: DbConnectionParams = {
    dialect: dialectFor(config.dbPlatform),
    host: config.dbHost,
    port: config.dbPort,
    user: config.codeGenLogin,
    password: config.codeGenPassword,
    database: config.dbDatabase,
    encrypt: config.dbEncrypt,
    trustServerCertificate: config.dbTrustServerCertificate,
  };

  let conn: { close(): Promise<void> } | undefined;
  try {
    const runner = await openConnection(params);
    conn = runner;
    await runner.query('SELECT 1');
    return { Ok: true };
  } catch (err) {
    return classifyFailure(err instanceof Error ? err.message : String(err), config);
  } finally {
    await closeQuietly(conn);
  }
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
