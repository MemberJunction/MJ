/**
 * Data quality report: `data-quality.md` for people and `data-quality.json` for tools.
 */

import type { DataQualityFinding, DataQualityPhase, DataQualitySeverity } from '../types/data-quality.js';
import type { DatabaseDocumentation } from '../types/state.js';
import { SortFindings } from '../quality/DataQualityRules.js';
import { CountBySeverity } from '../quality/DataQualityRunner.js';

const SECTION_TITLE: Record<DataQualitySeverity, string> = { error: 'Errors', warning: 'Warnings', info: 'Information' };
const SECTION_NOTE: Record<DataQualitySeverity, string> = {
  error: 'Broken joins or constraints the database does not enforce.',
  warning: 'Probable data problems.',
  info: 'Facts worth knowing when querying or documenting the data.',
};

/** The JSON report's shape. */
export interface DataQualityReport {
  Database: string;
  GeneratedAt: string;
  Phase?: Omit<DataQualityPhase, 'TableProbes' | 'RelationshipProbes'>;
  Counts: Record<DataQualitySeverity, number>;
  CountsByKind: Record<string, number>;
  Findings: DataQualityFinding[];
  /** Tables and relationships the probes did not cover, with the reason. */
  NotProbed: Array<{ Target: string; Reason: string }>;
}

export class DataQualityReportGenerator {
  /** True when the state holds a data quality phase worth reporting. */
  public HasReport(state: DatabaseDocumentation): boolean {
    return state.dataQuality !== undefined && state.phases.dataQuality !== undefined && state.phases.dataQuality.Status !== 'skipped';
  }

  public BuildReport(state: DatabaseDocumentation): DataQualityReport {
    const findings = SortFindings(state.dataQuality ?? []);
    const phase = state.phases.dataQuality;
    const byKind: Record<string, number> = {};
    for (const f of findings) byKind[f.Kind] = (byKind[f.Kind] ?? 0) + 1;
    return {
      Database: state.database.name,
      GeneratedAt: new Date().toISOString(),
      Phase: phase ? phaseSummary(phase) : undefined,
      Counts: CountBySeverity(findings),
      CountsByKind: byKind,
      Findings: findings,
      NotProbed: notProbed(phase),
    };
  }

  public GenerateJson(state: DatabaseDocumentation): string {
    return JSON.stringify(this.BuildReport(state), null, 2);
  }

  public GenerateMarkdown(state: DatabaseDocumentation): string {
    const report = this.BuildReport(state);
    const lines: string[] = [`# Data Quality: ${report.Database}`, ''];
    const phase = report.Phase;
    if (phase) {
      lines.push(
        `Generated ${report.GeneratedAt}. Status: **${phase.Status}**${phase.ProbesEnabled ? '' : ' (probes off: statistics and catalog checks only)'}.`,
        '',
        `Tables probed: ${phase.TablesProbed} of ${phase.TotalTables}` +
          `${phase.TablesSkipped ? `, ${phase.TablesSkipped} skipped` : ''}${phase.TablesFailed ? `, ${phase.TablesFailed} failed` : ''}. ` +
          `Relationships probed for orphans: ${phase.RelationshipsProbed}${phase.RelationshipsFailed ? ` (${phase.RelationshipsFailed} failed)` : ''}. ` +
          `Probe time: ${(phase.ProbeDurationMs / 1000).toFixed(1)}s.`,
        '',
      );
    }
    lines.push('| Severity | Findings |', '|---|---|');
    for (const severity of ['error', 'warning', 'info'] as DataQualitySeverity[]) {
      lines.push(`| ${SECTION_TITLE[severity]} | ${report.Counts[severity]} |`);
    }
    lines.push('');
    const kinds = Object.entries(report.CountsByKind).sort((a, b) => b[1] - a[1]);
    if (kinds.length > 0) {
      lines.push('| Check | Findings |', '|---|---|', ...kinds.map(([kind, n]) => `| ${kind} | ${n} |`), '');
    }
    if (report.Findings.length === 0) {
      lines.push('No findings.', '');
    }

    for (const severity of ['error', 'warning', 'info'] as DataQualitySeverity[]) {
      const section = report.Findings.filter((f) => f.Severity === severity);
      if (section.length === 0) continue;
      lines.push(`## ${SECTION_TITLE[severity]}`, '', SECTION_NOTE[severity], '');
      let currentTable = '';
      for (const f of section) {
        const table = `${f.SchemaName}.${f.TableName}`;
        if (table !== currentTable) {
          lines.push(`### ${table}`, '');
          currentTable = table;
        }
        lines.push(`- ${FormatFindingLine(f)}`);
      }
      lines.push('');
    }

    if (report.NotProbed.length > 0) {
      lines.push('## Not probed', '', 'Findings that need a probe are missing for these; the rest still apply.', '');
      for (const item of report.NotProbed) lines.push(`- ${item.Target}: ${item.Reason}`);
      lines.push('');
    }
    return lines.join('\n');
  }
}

/** One finding as a Markdown bullet body: subject, check, message. */
export function FormatFindingLine(f: DataQualityFinding): string {
  let subject: string;
  if (f.Scope === 'relationship') {
    const columns = (f.ColumnNames ?? [f.ColumnName ?? '']).join(', ');
    subject = `**${columns}** → ${f.Related ? `${f.Related.SchemaName}.${f.Related.TableName}` : '?'}`;
  } else if (f.Scope === 'column') {
    subject = `**${f.ColumnName}**`;
  } else {
    subject = '**(table)**';
  }
  return `${subject} · ${f.Kind}: ${f.Message}${f.Approximate ? ' (approximate)' : ''}`;
}

/** The phase without its per-table and per-relationship measurements. */
function phaseSummary(phase: DataQualityPhase): Omit<DataQualityPhase, 'TableProbes' | 'RelationshipProbes'> {
  return {
    Status: phase.Status,
    StartedAt: phase.StartedAt,
    CompletedAt: phase.CompletedAt,
    ProbesEnabled: phase.ProbesEnabled,
    TotalTables: phase.TotalTables,
    TablesProbed: phase.TablesProbed,
    TablesSkipped: phase.TablesSkipped,
    TablesFailed: phase.TablesFailed,
    RelationshipsProbed: phase.RelationshipsProbed,
    RelationshipsFailed: phase.RelationshipsFailed,
    ProbeDurationMs: phase.ProbeDurationMs,
    FindingsDerivedAt: phase.FindingsDerivedAt,
    FindingCounts: phase.FindingCounts,
  };
}

function notProbed(phase: DataQualityPhase | undefined): Array<{ Target: string; Reason: string }> {
  if (!phase) return [];
  const out: Array<{ Target: string; Reason: string }> = [];
  for (const [table, probe] of Object.entries(phase.TableProbes)) {
    if (probe.Outcome === 'skipped' || probe.Outcome === 'failed') out.push({ Target: table, Reason: probe.Reason ?? probe.Outcome });
    if (probe.Outcome === 'partial') {
      const failed = Object.entries(probe.Columns).filter(([, m]) => m.Failed);
      for (const [column, m] of failed) out.push({ Target: `${table}.${column}`, Reason: m.Failed ?? 'failed' });
    }
  }
  for (const r of Object.values(phase.RelationshipProbes)) {
    if (r.Outcome === 'failed') {
      out.push({
        Target: `${r.Child.Schema}.${r.Child.Table}(${r.Child.Columns.join(', ')}) → ${r.Parent.Schema}.${r.Parent.Table}`,
        Reason: r.Reason ?? 'failed',
      });
    }
  }
  return out;
}
