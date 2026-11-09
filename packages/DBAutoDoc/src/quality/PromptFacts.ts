/**
 * Turns data quality findings into the short lines the description prompts show the model.
 */

import type { DataQualityCheck, DataQualityFinding } from '../types/data-quality.js';
import { SortFindings } from './DataQualityRules.js';

/** Most table and relationship lines in the table-analysis prompt. */
const MAX_TABLE_LINES = 10;

/** Findings that are reported but not shown to the model: they suggest constraints, not meaning. */
const NOT_FOR_PROMPTS: ReadonlySet<DataQualityCheck> = new Set<DataQualityCheck>(['NullableNeverNull', 'StaleRowCountEstimate']);

/** Per-column lines, keyed by column name, most severe first, at most `maxPerColumn` each. */
export function ColumnQualityLines(findings: DataQualityFinding[], maxPerColumn: number): Map<string, string[]> {
  const out = new Map<string, string[]>();
  if (maxPerColumn <= 0) return out;
  for (const f of SortFindings(findings)) {
    if (f.Scope !== 'column' || !f.ColumnName || NOT_FOR_PROMPTS.has(f.Kind)) continue;
    const lines = out.get(f.ColumnName) ?? [];
    if (lines.length < maxPerColumn) lines.push(f.Message);
    out.set(f.ColumnName, lines);
  }
  return out;
}

/** Table and relationship lines, most severe first. */
export function TableQualityLines(findings: DataQualityFinding[]): string[] {
  const lines: string[] = [];
  for (const f of SortFindings(findings)) {
    if (f.Scope === 'column' || NOT_FOR_PROMPTS.has(f.Kind)) continue;
    if (f.Scope === 'relationship') {
      const columns = (f.ColumnNames ?? [f.ColumnName ?? '']).join(', ');
      const target = f.Related ? ` → ${f.Related.SchemaName}.${f.Related.TableName}` : '';
      lines.push(`${columns}${target}: ${f.Message}`);
    } else {
      lines.push(f.Message);
    }
    if (lines.length >= MAX_TABLE_LINES) break;
  }
  return lines;
}

/** The measured orphan rate and checked rows of a relationship from one child column, for the pruning prompt. */
export function OrphanEvidence(
  findings: DataQualityFinding[],
  sourceColumn: string,
  targetSchema: string,
  targetTable: string,
): { OrphanRate: number; CheckedRows: number } | undefined {
  const f = findings.find(
    (x) =>
      x.Kind === 'OrphanedForeignKey' &&
      x.ColumnName?.toLowerCase() === sourceColumn.toLowerCase() &&
      x.Related?.SchemaName.toLowerCase() === targetSchema.toLowerCase() &&
      x.Related?.TableName.toLowerCase() === targetTable.toLowerCase(),
  );
  if (!f) return undefined;
  return { OrphanRate: f.Measures.OrphanRate ?? 0, CheckedRows: f.Measures.CheckedRows ?? 0 };
}
