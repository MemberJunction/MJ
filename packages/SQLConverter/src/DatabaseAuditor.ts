import type {
  IDatabaseAuditor,
  AuditReport,
  DatabaseInventory,
  RowCountMismatch,
} from './types.js';

/**
 * Compares source and target database inventories to produce an audit report.
 * Uses pluggable IDatabaseAuditor implementations for actual database access.
 */
export class DatabaseAuditRunner {
  /**
   * Run an audit comparing source and target databases.
   * @param sourceAuditor Auditor connected to the source database
   * @param targetAuditor Auditor connected to the target database
   * @param sourceSchema Schema name in source database
   * @param targetSchema Schema name in target database
   */
  async RunAudit(
    sourceAuditor: IDatabaseAuditor,
    targetAuditor: IDatabaseAuditor,
    sourceSchema?: string,
    targetSchema?: string
  ): Promise<AuditReport> {
    const [sourceInventory, targetInventory, sourceRowCounts, targetRowCounts] =
      await Promise.all([
        sourceAuditor.GetInventory(sourceSchema),
        targetAuditor.GetInventory(targetSchema),
        sourceAuditor.GetRowCounts(sourceSchema),
        targetAuditor.GetRowCounts(targetSchema),
      ]);

    const missing = this.findMissing(sourceInventory, targetInventory);
    const rowCountMismatches = this.compareRowCounts(sourceRowCounts, targetRowCounts);

    return {
      source: sourceInventory,
      target: targetInventory,
      missing,
      rowCountMismatches,
    };
  }

  /**
   * Format an audit report as a human-readable string.
   */
  FormatReport(report: AuditReport): string {
    const lines: string[] = [];
    lines.push('=== SQL Conversion Audit Report ===');
    lines.push('');

    lines.push('--- Source Database ---');
    lines.push(`  Tables:    ${report.source.tables.length}`);
    lines.push(`  Views:     ${report.source.views.length}`);
    lines.push(`  Functions: ${report.source.functions.length}`);
    lines.push(`  Triggers:  ${report.source.triggers.length}`);
    lines.push(`  Indexes:   ${report.source.indexes.length}`);
    lines.push('');

    lines.push('--- Target Database ---');
    lines.push(`  Tables:    ${report.target.tables.length}`);
    lines.push(`  Views:     ${report.target.views.length}`);
    lines.push(`  Functions: ${report.target.functions.length}`);
    lines.push(`  Triggers:  ${report.target.triggers.length}`);
    lines.push(`  Indexes:   ${report.target.indexes.length}`);
    lines.push('');

    if (report.missing.length > 0) {
      lines.push(`--- Missing from Target (${report.missing.length}) ---`);
      for (const obj of report.missing) {
        lines.push(`  - ${obj}`);
      }
      lines.push('');
    } else {
      lines.push('--- No Missing Objects ---');
      lines.push('');
    }

    if (report.rowCountMismatches.length > 0) {
      lines.push(`--- Row Count Mismatches (${report.rowCountMismatches.length}) ---`);
      for (const m of report.rowCountMismatches) {
        lines.push(`  ${m.tableName}: source=${m.sourceCount}, target=${m.targetCount}`);
      }
    } else {
      lines.push('--- Row Counts Match ---');
    }

    return lines.join('\n');
  }

  private findMissing(source: DatabaseInventory, target: DatabaseInventory): string[] {
    const missing: string[] = [];
    const targetTableSet = new Set(target.tables.map((t) => t.toLowerCase()));
    const targetViewSet = new Set(target.views.map((v) => v.toLowerCase()));
    const targetFuncSet = new Set(target.functions.map((f) => f.toLowerCase()));
    const targetTriggerSet = new Set(target.triggers.map((t) => t.toLowerCase()));

    for (const t of source.tables) {
      if (!targetTableSet.has(t.toLowerCase())) {
        missing.push(`TABLE: ${t}`);
      }
    }
    for (const v of source.views) {
      if (!targetViewSet.has(v.toLowerCase())) {
        missing.push(`VIEW: ${v}`);
      }
    }
    for (const f of source.functions) {
      if (!targetFuncSet.has(f.toLowerCase())) {
        missing.push(`FUNCTION: ${f}`);
      }
    }
    for (const t of source.triggers) {
      if (!targetTriggerSet.has(t.toLowerCase())) {
        missing.push(`TRIGGER: ${t}`);
      }
    }

    return missing;
  }

  private compareRowCounts(
    source: Map<string, number>,
    target: Map<string, number>
  ): RowCountMismatch[] {
    const mismatches: RowCountMismatch[] = [];

    for (const [tableName, sourceCount] of source) {
      const targetCount = target.get(tableName.toLowerCase()) ?? target.get(tableName) ?? -1;
      if (targetCount === -1) {
        // Table missing from target — already reported in missing objects
        continue;
      }
      if (sourceCount !== targetCount) {
        mismatches.push({ tableName, sourceCount, targetCount });
      }
    }

    return mismatches;
  }
}
