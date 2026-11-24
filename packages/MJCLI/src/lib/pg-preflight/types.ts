/**
 * Types for the managed-PostgreSQL preflight (`mj doctor --db`, and the check `mj migrate`
 * runs before it applies anything on PostgreSQL).
 *
 * @module lib/pg-preflight/types
 */

/**
 * The one database call the checks make. An interface rather than a `pg.Client` so the
 * checks can be unit-tested against a fake.
 */
export interface PgPreflightQueryRunner {
  /** Run one statement with optional `$n` parameters and return its rows. */
  Query<T>(sql: string, params?: unknown[]): Promise<T[]>;
}

/** Outcome of one check. Only `fail` blocks `mj migrate`. */
export type PgPreflightStatus = 'pass' | 'fail' | 'warn' | 'info';

/** The checks, in the order they run and print. */
export type PgPreflightCheckId =
  | 'server-version'
  | 'group-roles'
  | 'database-create'
  | 'target-schema'
  | 'extensions'
  | 'tls'
  | 'connections';

/** One statement an administrator runs to fix a failed check. */
export interface PgRemediationStep {
  /** What the statement does, printed as a comment above it. */
  Description: string;
  /** The statement, without a trailing semicolon. */
  Sql: string;
}

/** The result of one check. */
export interface PgPreflightCheck {
  Id: PgPreflightCheckId;
  Status: PgPreflightStatus;
  /** One line describing what was found. */
  Message: string;
  /** SQL that fixes a `fail` (empty otherwise, or when the fix is not SQL). */
  Remediation: PgRemediationStep[];
  /** Fixes that are not SQL, such as a server parameter on a managed host. */
  Notes: string[];
}

/** What the session reports about itself; read once and shared by the checks. */
export interface PgSessionContext {
  Login: string;
  Database: string;
  ServerVersion: string;
  ServerVersionNum: number;
  CanCreateInDatabase: boolean;
  IsSuperuser: boolean;
}

/** Inputs to `RunPgManagedPreflight`. */
export interface PgPreflightOptions {
  /** Schema the migrations target (`__mj`, or an Open App schema). */
  TargetSchema: string;
  /** Extensions the pending migrations `CREATE`. */
  RequiredExtensions: readonly string[];
  /** Group roles the migrations grant to. Defaults to the installer's `POSTGRES_MJ_GROUP_ROLES`. */
  RequiredRoles?: readonly string[];
  /** Host the session connected to; a loopback host downgrades the TLS warning to info. */
  Host?: string;
  /** Lowest supported `server_version_num`. Defaults to 140000 (PostgreSQL 14). */
  MinimumServerVersionNum?: number;
}

/** The full preflight outcome. */
export interface PgPreflightReport {
  Session: PgSessionContext;
  TargetSchema: string;
  Checks: PgPreflightCheck[];
  /** False when any check failed. */
  Passed: boolean;
}
