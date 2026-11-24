/**
 * The SQL an administrator runs to fix a failed preflight check.
 *
 * Every statement is taken from the installer's own step builder
 * (`BuildPostgresSetupSteps` in `@memberjunction/installer`) when the installer has
 * one for it, so `mj migrate` and `mj install` can never tell an administrator two
 * different things. A statement is built here only when the installer has no step for
 * it (an Open App schema, an extension outside `POSTGRES_MJ_EXTENSIONS`), and then
 * with the installer's own quoting helper.
 *
 * @module lib/pg-preflight/remediation
 */

import { BuildPostgresSetupSteps, QuotePgIdentifier, type PgSetupStep } from '@memberjunction/installer';
import type { PgPreflightReport, PgRemediationStep, PgSessionContext } from './types';

/** The installer's steps for this database and login. Passwords are never printed. */
function installerSteps(session: PgSessionContext): PgSetupStep[] {
  return BuildPostgresSetupSteps({ DatabaseName: session.Database, CodeGenUser: session.Login });
}

/** The installer step matching `predicate`, or `fallback` when it has none. */
function pickStep(steps: readonly PgSetupStep[], predicate: (step: PgSetupStep) => boolean, fallback: PgRemediationStep): PgRemediationStep {
  const step = steps.find(predicate);
  return step ? { Description: step.Description, Sql: step.Sql } : fallback;
}

/** `CREATE ROLE ... NOLOGIN` for each missing group role. */
export function RoleRemediation(session: PgSessionContext, missingRoles: readonly string[]): PgRemediationStep[] {
  const steps = installerSteps(session);
  return missingRoles.map((role) =>
    pickStep(steps, (s) => s.SkipIf?.Param === role && s.Sql.startsWith('CREATE ROLE') && s.Sql.endsWith(' NOLOGIN'), {
      Description: `Create group role ${role}`,
      Sql: `CREATE ROLE ${QuotePgIdentifier(role)} NOLOGIN`,
    }),
  );
}

/** `CREATE EXTENSION IF NOT EXISTS` for each extension. */
export function ExtensionRemediation(session: PgSessionContext, extensions: readonly string[]): PgRemediationStep[] {
  const steps = installerSteps(session);
  return extensions.map((ext) => {
    const sql = `CREATE EXTENSION IF NOT EXISTS ${QuotePgIdentifier(ext)}`;
    return pickStep(steps, (s) => s.Sql === sql, { Description: `Create extension ${ext}`, Sql: sql });
  });
}

/** `GRANT CONNECT, CREATE, TEMPORARY ON DATABASE` to the migrate login. */
export function DatabaseCreateRemediation(session: PgSessionContext): PgRemediationStep[] {
  const steps = installerSteps(session);
  const database = QuotePgIdentifier(session.Database);
  const login = QuotePgIdentifier(session.Login);
  return [
    pickStep(steps, (s) => s.Sql.startsWith('GRANT CONNECT, CREATE, TEMPORARY ON DATABASE'), {
      Description: `Let ${session.Login} connect and create schemas`,
      Sql: `GRANT CONNECT, CREATE, TEMPORARY ON DATABASE ${database} TO ${login}`,
    }),
  ];
}

/** `ALTER SCHEMA ... OWNER TO` the migrate login. */
export function SchemaOwnerRemediation(session: PgSessionContext, schema: string): PgRemediationStep[] {
  const sql = `ALTER SCHEMA ${QuotePgIdentifier(schema)} OWNER TO ${QuotePgIdentifier(session.Login)}`;
  return [pickStep(installerSteps(session), (s) => s.Sql === sql, { Description: `Make ${session.Login} the owner of schema ${schema}`, Sql: sql })];
}

/**
 * Renders every failed check's remediation as one script an administrator can paste
 * into psql or any SQL client. Returns an empty string when nothing needs fixing.
 */
export function RenderRemediationScript(report: PgPreflightReport): string {
  const steps = uniqueSteps(report.Checks.filter((c) => c.Status === 'fail').flatMap((c) => c.Remediation));
  if (steps.length === 0) return '';
  const lines = [
    '-- Run as a PostgreSQL administrator (a superuser, rds_superuser on AWS RDS, or',
    `-- azure_pg_admin on Azure), connected to database ${QuotePgIdentifier(report.Session.Database)}.`,
    '-- Then run `mj migrate` again.',
  ];
  steps.forEach((step, index) => lines.push('', `-- ${index + 1}. ${step.Description}`, `${step.Sql};`));
  return lines.join('\n');
}

/** Drops repeated statements, keeping the first. */
function uniqueSteps(steps: readonly PgRemediationStep[]): PgRemediationStep[] {
  const seen = new Set<string>();
  return steps.filter((step) => {
    if (seen.has(step.Sql)) return false;
    seen.add(step.Sql);
    return true;
  });
}
