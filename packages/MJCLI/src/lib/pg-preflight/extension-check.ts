/**
 * The extension check: every extension a pending migration `CREATE`s must already be
 * installed, or be creatable by the migrate login on this server.
 *
 * Managed hosts add one more gate. Azure Database for PostgreSQL Flexible Server and
 * Azure HorizonDB refuse `CREATE EXTENSION` for anything missing from the
 * `azure.extensions` server parameter, whatever the login's privileges, so the check
 * reads that parameter whenever the server defines it.
 *
 * @module lib/pg-preflight/extension-check
 */

import { MakeCheck } from './checks';
import { ExtensionRemediation } from './remediation';
import type { PgPreflightCheck, PgPreflightQueryRunner, PgSessionContext } from './types';

/** One required extension as the catalog describes it. */
export interface ExtensionCatalogRow {
  Name: string;
  InstalledVersion: string | null;
  Trusted: boolean;
}

/** Why an extension blocks the migration. */
type ExtensionProblem = 'unavailable' | 'not-allowlisted' | 'needs-admin';

/** Reads the catalog rows for the required extensions, and the Azure allowlist when defined. */
async function readExtensionState(runner: PgPreflightQueryRunner, required: readonly string[]): Promise<{ Rows: ExtensionCatalogRow[]; Allowlist: string[] | null }> {
  const rows = await runner.Query<ExtensionCatalogRow>(
    `SELECT e.name AS "Name", e.installed_version AS "InstalledVersion", COALESCE(v.trusted, false) AS "Trusted"
       FROM pg_catalog.pg_available_extensions e
       LEFT JOIN pg_catalog.pg_available_extension_versions v ON v.name = e.name AND v.version = e.default_version
      WHERE e.name = ANY($1::text[])`,
    [[...required]],
  );
  const allow = await runner.Query<{ Allowlist: string | null }>(`SELECT current_setting('azure.extensions', true) AS "Allowlist"`);
  return { Rows: rows, Allowlist: ParseAllowlist(allow[0]?.Allowlist ?? null) };
}

/** Splits the `azure.extensions` value; null when the server does not define the parameter. */
export function ParseAllowlist(value: string | null): string[] | null {
  if (value === null) return null;
  return value
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter((name) => name.length > 0);
}

/** Classifies one required extension; null means it is fine. */
export function ClassifyExtension(
  name: string,
  row: ExtensionCatalogRow | undefined,
  allowlist: string[] | null,
  session: PgSessionContext,
): ExtensionProblem | null {
  if (row?.InstalledVersion) return null;
  if (!row) return 'unavailable';
  if (allowlist !== null && !allowlist.includes(name.toLowerCase())) return 'not-allowlisted';
  const canCreate = session.IsSuperuser || (row.Trusted && session.CanCreateInDatabase);
  return canCreate ? null : 'needs-admin';
}

/** Runs the extension check. */
export async function CheckExtensions(runner: PgPreflightQueryRunner, session: PgSessionContext, required: readonly string[]): Promise<PgPreflightCheck> {
  if (required.length === 0) {
    return MakeCheck('extensions', 'pass', 'No pending migration creates an extension');
  }
  const state = await readExtensionState(runner, required);
  const problems = new Map<string, ExtensionProblem>();
  for (const name of required) {
    const problem = ClassifyExtension(name, state.Rows.find((r) => r.Name === name), state.Allowlist, session);
    if (problem) problems.set(name, problem);
  }
  if (problems.size === 0) {
    return MakeCheck('extensions', 'pass', `Extensions installed or creatable by ${session.Login}: ${required.join(', ')}`);
  }
  return buildFailure(session, problems, state.Allowlist);
}

/** The failed check, with SQL for what SQL can fix and notes for what it cannot. */
function buildFailure(session: PgSessionContext, problems: Map<string, ExtensionProblem>, allowlist: string[] | null): PgPreflightCheck {
  const byProblem = (p: ExtensionProblem) => [...problems].filter(([, v]) => v === p).map(([k]) => k);
  const unavailable = byProblem('unavailable');
  const notAllowlisted = byProblem('not-allowlisted');
  const needsAdmin = byProblem('needs-admin');
  const parts = [
    unavailable.length ? `are not available on this server: ${unavailable.join(', ')}` : '',
    notAllowlisted.length ? `are not in the azure.extensions allowlist: ${notAllowlisted.join(', ')}` : '',
    needsAdmin.length ? `${session.Login} cannot create without an administrator: ${needsAdmin.join(', ')}` : '',
  ].filter((p) => p.length > 0);
  return MakeCheck(
    'extensions',
    'fail',
    `Pending migrations need extension(s) that ${parts.join('; ')}`,
    ExtensionRemediation(session, [...notAllowlisted, ...needsAdmin]),
    extensionNotes(unavailable, notAllowlisted, allowlist ?? []),
  );
}

/** Non-SQL fixes: install packages, or extend the Azure allowlist. */
function extensionNotes(unavailable: string[], notAllowlisted: string[], allowlist: string[]): string[] {
  const notes: string[] = [];
  if (unavailable.length > 0) {
    notes.push(`Install the server package that provides ${unavailable.join(', ')}, or use a host that offers it.`);
  }
  if (notAllowlisted.length > 0) {
    const merged = [...new Set([...allowlist, ...notAllowlisted.map((n) => n.toLowerCase())])].join(',');
    notes.push(
      `Add ${notAllowlisted.join(', ')} to the azure.extensions server parameter before running the SQL below, for example: ` +
        `az postgres flexible-server parameter set --resource-group <rg> --server-name <server> --name azure.extensions --value "${merged}"`,
    );
  }
  return notes;
}
