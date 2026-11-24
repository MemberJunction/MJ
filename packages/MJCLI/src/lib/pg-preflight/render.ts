/**
 * Text output for the managed-PostgreSQL preflight, shared by `mj doctor --db` and
 * `mj migrate` so both print the same thing.
 *
 * @module lib/pg-preflight/render
 */

import chalk from 'chalk';
import { RenderRemediationScript } from './remediation';
import type { PgPreflightReport, PgPreflightStatus } from './types';

/** `[PASS]`-style tag for a status. */
function statusTag(status: PgPreflightStatus): string {
  switch (status) {
    case 'pass':
      return chalk.green('[PASS]');
    case 'fail':
      return chalk.red('[FAIL]');
    case 'warn':
      return chalk.yellow('[WARN]');
    default:
      return chalk.blue('[INFO]');
  }
}

/**
 * The report as printable lines: one per check, then (when anything failed) the
 * non-SQL notes and the remediation script.
 */
export function FormatPgPreflightReport(report: PgPreflightReport): string[] {
  const { Session } = report;
  const lines = [chalk.bold(`PostgreSQL readiness — database ${Session.Database}, login ${Session.Login}, schema ${report.TargetSchema}`)];
  for (const check of report.Checks) {
    lines.push(`${statusTag(check.Status)} ${check.Message}`);
  }
  const failed = report.Checks.filter((c) => c.Status === 'fail');
  const notes = failed.flatMap((c) => c.Notes);
  if (notes.length > 0) {
    lines.push('', chalk.yellow('Also required:'), ...notes.map((n) => `  - ${n}`));
  }
  const script = RenderRemediationScript(report);
  if (script) {
    lines.push('', chalk.yellow('An administrator must run this SQL first:'), '', script);
  }
  return lines;
}

/** One-line summary: counts of each status. */
export function SummarizePgPreflightReport(report: PgPreflightReport): string {
  const count = (s: PgPreflightStatus) => report.Checks.filter((c) => c.Status === s).length;
  return `${count('fail')} failed, ${count('warn')} warning(s), ${count('pass')} passed`;
}
