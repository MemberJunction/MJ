/**
 * Managed-PostgreSQL preflight: checks that a database is ready for `mj migrate` before
 * the first migration runs, and says exactly what an administrator must run when it is
 * not. Without it, a pre-provisioned managed database fails partway through the baseline
 * with a GRANT or `CREATE EXTENSION` error.
 *
 * @module lib/pg-preflight/preflight
 */

import { POSTGRES_MJ_GROUP_ROLES } from '@memberjunction/installer';
import {
  CheckConnections,
  CheckDatabaseCreate,
  CheckGroupRoles,
  CheckServerVersion,
  CheckTargetSchema,
  CheckTls,
  MakeCheck,
  ReadSessionContext,
} from './checks';
import { CheckExtensions } from './extension-check';
import type { PgPreflightCheck, PgPreflightCheckId, PgPreflightOptions, PgPreflightQueryRunner, PgPreflightReport } from './types';

/**
 * Runs every check against an open session. A check whose query throws reports `warn`
 * rather than aborting the rest, except the session query every check needs, which throws.
 *
 * @param runner - Connected as the login `mj migrate` uses.
 * @param options - Target schema, the extensions pending migrations create, and so on.
 */
export async function RunPgManagedPreflight(runner: PgPreflightQueryRunner, options: PgPreflightOptions): Promise<PgPreflightReport> {
  const session = await ReadSessionContext(runner);
  const roles = options.RequiredRoles ?? POSTGRES_MJ_GROUP_ROLES;
  const checks: PgPreflightCheck[] = [
    CheckServerVersion(session, options.MinimumServerVersionNum),
    await guarded('group-roles', () => CheckGroupRoles(runner, session, roles)),
    CheckDatabaseCreate(session),
    await guarded('target-schema', () => CheckTargetSchema(runner, session, options.TargetSchema)),
    await guarded('extensions', () => CheckExtensions(runner, session, options.RequiredExtensions)),
    await guarded('tls', () => CheckTls(runner, options.Host)),
    await guarded('connections', () => CheckConnections(runner)),
  ];
  return { Session: session, TargetSchema: options.TargetSchema, Checks: checks, Passed: !checks.some((c) => c.Status === 'fail') };
}

/** Runs one check, turning a query error into a warning that names the check. */
async function guarded(id: PgPreflightCheckId, run: () => Promise<PgPreflightCheck>): Promise<PgPreflightCheck> {
  try {
    return await run();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return MakeCheck(id, 'warn', `Could not run the ${id} check: ${message}`);
  }
}
