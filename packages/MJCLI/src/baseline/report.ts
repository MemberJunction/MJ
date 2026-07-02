/**
 * Diff report rendering: JSON (machine-readable) + Markdown (human-readable).
 */

import { ellipsize } from './util';
import type { DiffReport, ObjectDiff, RowDiff, TableRowDiff } from './types';

export function renderJson(report: DiffReport): string {
  return JSON.stringify(
    report,
    (_k, v) => {
      if (typeof v === 'bigint') return v.toString();
      if (Buffer.isBuffer(v)) return `0x${v.toString('hex')}`;
      if (v instanceof Uint8Array) return `0x${Buffer.from(v).toString('hex')}`;
      if (v instanceof Date) return v.toISOString();
      return v;
    },
    2,
  );
}

export function renderMarkdown(report: DiffReport): string {
  const lines: string[] = [];
  lines.push(`# Baseline Comparison Report`);
  lines.push('');
  lines.push(`- **Generated**: ${report.generatedAt}`);
  lines.push(`- **Left**: \`${report.leftLabel}\``);
  lines.push(`- **Right**: \`${report.rightLabel}\``);
  lines.push(`- **Row compare mode**: \`${report.rowCompareMode}\``);
  lines.push(`- **Result**: ${report.isClean ? '**CLEAN ✓**' : '**DIFFS FOUND ✗**'}`);
  lines.push('');
  lines.push(`## Summary`);
  lines.push('');
  lines.push(`| Metric | Count |`);
  lines.push(`| --- | --- |`);
  lines.push(`| Schemas checked | ${report.summary.schemasChecked} |`);
  lines.push(`| Tables checked | ${report.summary.tablesChecked} |`);
  lines.push(`| Views checked | ${report.summary.viewsChecked} |`);
  lines.push(`| Procedures checked | ${report.summary.proceduresChecked} |`);
  lines.push(`| Functions checked | ${report.summary.functionsChecked} |`);
  lines.push(`| Triggers checked | ${report.summary.triggersChecked} |`);
  lines.push(`| Sequences checked | ${report.summary.sequencesChecked} |`);
  lines.push(`| User-defined types checked | ${report.summary.userDefinedTypesChecked} |`);
  lines.push(`| Extended properties checked | ${report.summary.extendedPropertiesChecked} |`);
  lines.push(`| Database principals checked | ${report.summary.principalsChecked} |`);
  lines.push(`| Role memberships checked | ${report.summary.roleMembershipsChecked} |`);
  lines.push(`| Permissions checked | ${report.summary.permissionsChecked} |`);
  lines.push(`| Objects with diffs | ${report.summary.objectsWithDiffs} |`);
  lines.push(`| Tables with row diffs | ${report.summary.tablesWithRowDiffs} |`);
  lines.push(`| Total row diffs | ${report.summary.totalRowDiffs} |`);
  lines.push('');

  if (report.objectDiffs.length > 0) {
    lines.push(`## Object Differences`);
    lines.push('');
    lines.push(`| Kind | Object | Diff | Details |`);
    lines.push(`| --- | --- | --- | --- |`);
    for (const d of report.objectDiffs) lines.push(formatObjectDiffRow(d));
    lines.push('');
  }

  if (report.tableRowDiffs.length > 0) {
    lines.push(`## Row Differences`);
    lines.push('');
    for (const t of report.tableRowDiffs) {
      lines.push(formatRowDiffsForTable(t));
      lines.push('');
    }
  }

  if (report.isClean) {
    lines.push(`✅ No differences detected. The new baseline produces an identical end-state.`);
  }

  return lines.join('\n') + '\n';
}

function formatObjectDiffRow(diff: ObjectDiff): string {
  const details = diff.details ? ellipsize(diff.details, 120) : '';
  return `| ${diff.kind} | \`${diff.qualifiedName}\` | ${diff.diffKind} | ${details} |`;
}

function formatRowDiffsForTable(t: TableRowDiff): string {
  const lines: string[] = [];
  lines.push(`### \`${t.schema}.${t.table}\``);
  lines.push(`Rows — left: ${t.leftRowCount}, right: ${t.rightRowCount}, diffs: ${t.diffCount}${t.truncated ? ' (sample truncated)' : ''}`);
  if (t.sampleDiffs.length === 0) return lines.join('\n');
  lines.push('');
  for (const r of t.sampleDiffs) lines.push(formatRowDiff(r));
  return lines.join('\n');
}

function formatRowDiff(r: RowDiff): string {
  if (r.diffKind !== 'changed' || !r.columnDiffs?.length) {
    return `- ${r.diffKind}: \`${ellipsize(r.key, 80)}\``;
  }
  const cols = r.columnDiffs
    .map((c) => `\`${c.column}\`: ${formatVal(c.leftValue)} → ${formatVal(c.rightValue)}`)
    .join('; ');
  return `- changed \`${ellipsize(r.key, 60)}\`: ${cols}`;
}

function formatVal(v: unknown): string {
  if (v === null || v === undefined) return '`null`';
  if (typeof v === 'string') return `\`"${ellipsize(v, 40)}"\``;
  if (v instanceof Date) return `\`${v.toISOString()}\``;
  if (Buffer.isBuffer(v)) return `\`0x${ellipsize(v.toString('hex'), 20)}\``;
  return `\`${ellipsize(String(v), 40)}\``;
}
