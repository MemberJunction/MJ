/**
 * The individual managed-PostgreSQL preflight checks. Each one runs a read-only catalog
 * query through a {@link PgPreflightQueryRunner} and returns a {@link PgPreflightCheck}.
 *
 * @module lib/pg-preflight/checks
 */

import { DatabaseCreateRemediation, RoleRemediation, SchemaOwnerRemediation } from './remediation';
import type { PgPreflightCheck, PgPreflightCheckId, PgPreflightQueryRunner, PgPreflightStatus, PgRemediationStep, PgSessionContext } from './types';

/** PostgreSQL 14, the lowest version MJ supports. */
export const MIN_PG_SERVER_VERSION_NUM = 140000;

/** Builds a check result. */
export function MakeCheck(
  Id: PgPreflightCheckId,
  Status: PgPreflightStatus,
  Message: string,
  Remediation: PgRemediationStep[] = [],
  Notes: string[] = [],
): PgPreflightCheck {
  return { Id, Status, Message, Remediation, Notes };
}

/** Reads the facts every check shares, in one round trip. */
export async function ReadSessionContext(runner: PgPreflightQueryRunner): Promise<PgSessionContext> {
  const rows = await runner.Query<PgSessionContext>(
    `SELECT current_user AS "Login",
            current_database() AS "Database",
            current_setting('server_version') AS "ServerVersion",
            current_setting('server_version_num')::int AS "ServerVersionNum",
            has_database_privilege(current_database(), 'CREATE') AS "CanCreateInDatabase",
            COALESCE((SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname = current_user), false) AS "IsSuperuser"`,
  );
  if (rows.length === 0) throw new Error('The session context query returned no rows.');
  return rows[0];
}

/** The server must be PostgreSQL 14 or later. */
export function CheckServerVersion(session: PgSessionContext, minimum = MIN_PG_SERVER_VERSION_NUM): PgPreflightCheck {
  const minimumMajor = Math.floor(minimum / 10000);
  if (session.ServerVersionNum >= minimum) {
    return MakeCheck('server-version', 'pass', `PostgreSQL ${session.ServerVersion} (${minimumMajor} or later required)`);
  }
  return MakeCheck('server-version', 'fail', `PostgreSQL ${session.ServerVersion} is older than ${minimumMajor}, the lowest version MJ supports`, [], [
    `Upgrade the server to PostgreSQL ${minimumMajor} or later.`,
  ]);
}

/** Every group role the migrations grant to must exist. */
export async function CheckGroupRoles(runner: PgPreflightQueryRunner, session: PgSessionContext, roles: readonly string[]): Promise<PgPreflightCheck> {
  const rows = await runner.Query<{ rolname: string }>('SELECT rolname FROM pg_catalog.pg_roles WHERE rolname = ANY($1::text[])', [[...roles]]);
  const present = new Set(rows.map((r) => r.rolname));
  const missing = roles.filter((role) => !present.has(role));
  if (missing.length === 0) {
    return MakeCheck('group-roles', 'pass', `Group roles exist: ${roles.join(', ')}`);
  }
  return MakeCheck('group-roles', 'fail', `Missing group role(s) the migrations grant to: ${missing.join(', ')}`, RoleRemediation(session, missing));
}

/** The migrate login needs CREATE on the database: Skyway runs `CREATE SCHEMA IF NOT EXISTS`, which checks it even when the schema exists. */
export function CheckDatabaseCreate(session: PgSessionContext): PgPreflightCheck {
  if (session.CanCreateInDatabase) {
    return MakeCheck('database-create', 'pass', `${session.Login} has CREATE on database ${session.Database}`);
  }
  return MakeCheck(
    'database-create',
    'fail',
    `${session.Login} lacks CREATE on database ${session.Database} (needed to create schemas and trusted extensions)`,
    DatabaseCreateRemediation(session),
  );
}

/** The target schema must be owned by the migrate login, or not exist yet. */
export async function CheckTargetSchema(runner: PgPreflightQueryRunner, session: PgSessionContext, schema: string): Promise<PgPreflightCheck> {
  const rows = await runner.Query<{ Owner: string; Owned: boolean }>(
    `SELECT pg_catalog.pg_get_userbyid(nspowner) AS "Owner", pg_catalog.pg_has_role(current_user, nspowner, 'USAGE') AS "Owned"
       FROM pg_catalog.pg_namespace WHERE nspname = $1`,
    [schema],
  );
  if (rows.length === 0) {
    return MakeCheck('target-schema', 'info', `Schema ${schema} does not exist yet; the migration creates it, owned by ${session.Login}`);
  }
  if (rows[0].Owned) {
    return MakeCheck('target-schema', 'pass', `Schema ${schema} is owned by ${rows[0].Owner}, which ${session.Login} is or belongs to`);
  }
  return MakeCheck(
    'target-schema',
    'fail',
    `Schema ${schema} is owned by ${rows[0].Owner}, not ${session.Login}, so the migrations cannot alter its objects`,
    SchemaOwnerRemediation(session, schema),
  );
}

/** TLS for the current backend. Never fails: a warning (info on a loopback host). */
export async function CheckTls(runner: PgPreflightQueryRunner, host: string | undefined): Promise<PgPreflightCheck> {
  const rows = await runner.Query<{ ssl: boolean; version: string | null }>(
    'SELECT ssl, version FROM pg_catalog.pg_stat_ssl WHERE pid = pg_catalog.pg_backend_pid()',
  );
  if (rows[0]?.ssl) {
    return MakeCheck('tls', 'pass', `The connection uses TLS (${rows[0].version ?? 'unknown version'})`);
  }
  if (IsLoopbackHost(host)) {
    return MakeCheck('tls', 'info', 'The connection does not use TLS (expected for a local server)');
  }
  return MakeCheck('tls', 'warn', 'The connection does not use TLS; a managed host should require it');
}

/** True for localhost and the loopback addresses. */
export function IsLoopbackHost(host: string | undefined): boolean {
  const h = (host ?? '').trim().toLowerCase();
  return h === 'localhost' || h === '::1' || h === '[::1]' || h.startsWith('127.');
}

/** Reports `max_connections` and current use. Informational only. */
export async function CheckConnections(runner: PgPreflightQueryRunner): Promise<PgPreflightCheck> {
  const rows = await runner.Query<{ Max: number; Reserved: number; InUse: number }>(
    `SELECT current_setting('max_connections')::int AS "Max",
            current_setting('superuser_reserved_connections')::int AS "Reserved",
            (SELECT count(*) FROM pg_catalog.pg_stat_activity)::int AS "InUse"`,
  );
  const row = rows[0];
  if (!row) return MakeCheck('connections', 'info', 'Could not read max_connections');
  return MakeCheck('connections', 'info', `max_connections=${row.Max} (${row.Reserved} reserved for superusers), ${row.InUse} in use`);
}

