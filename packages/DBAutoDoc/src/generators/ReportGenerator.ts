/**
 * Generates analysis reports
 */

import { DatabaseDocumentation } from '../types/state.js';
import { StateManager } from '../state/StateManager.js';

export class ReportGenerator {
  constructor(private stateManager: StateManager) {}

  /**
   * Generate analysis report
   */
  public generate(state: DatabaseDocumentation): string {
    const lines: string[] = [];

    lines.push('# Database Documentation Analysis Report');
    lines.push('');
    lines.push(`**Database**: ${state.database.name}`);
    lines.push(`**Server**: ${state.database.server}`);
    lines.push(`**Generated**: ${new Date().toISOString()}`);
    lines.push('');

    // Overall statistics
    const stats = this.calculateStatistics(state);
    lines.push('## Overall Statistics');
    lines.push('');
    lines.push(`- **Schemas**: ${stats.schemaCount}`);
    lines.push(`- **Tables**: ${stats.tableCount}`);
    lines.push(`- **Columns**: ${stats.columnCount}`);
    lines.push(`- **Total Iterations**: ${state.totalIterations}`);
    lines.push(`- **Analysis Runs**: ${state.analysisRuns.length}`);
    lines.push('');

    // Latest run details
    if (state.analysisRuns.length > 0) {
      const lastRun = state.analysisRuns[state.analysisRuns.length - 1];

      lines.push('## Latest Analysis Run');
      lines.push('');
      lines.push(`- **Run ID**: ${lastRun.runId}`);
      lines.push(`- **Status**: ${lastRun.status}`);
      lines.push(`- **Started**: ${lastRun.startedAt}`);
      if (lastRun.completedAt) {
        lines.push(`- **Completed**: ${lastRun.completedAt}`);
      }
      lines.push(`- **Model**: ${lastRun.modelUsed}`);
      lines.push(`- **Iterations**: ${lastRun.iterationsPerformed}`);
      lines.push(`- **Levels Processed**: ${lastRun.levelsProcessed}`);
      lines.push(`- **Backpropagations**: ${lastRun.backpropagationCount}`);
      lines.push(`- **Total Tokens**: ${lastRun.totalTokensUsed.toLocaleString()}`);
      lines.push(`- **Estimated Cost**: $${lastRun.estimatedCost.toFixed(2)}`);
      lines.push('');

      if (lastRun.converged) {
        lines.push(`**Convergence**: ${lastRun.convergenceReason}`);
        lines.push('');
      }

      // Warnings
      if (lastRun.warnings.length > 0) {
        lines.push('### Warnings');
        lines.push('');
        for (const warning of lastRun.warnings) {
          lines.push(`- ${warning}`);
        }
        lines.push('');
      }

      // Errors
      if (lastRun.errors.length > 0) {
        lines.push('### Errors');
        lines.push('');
        for (const error of lastRun.errors) {
          lines.push(`- ${error}`);
        }
        lines.push('');
      }
    }

    // Confidence distribution
    const confidenceStats = this.calculateConfidenceStats(state);
    lines.push('## Confidence Distribution');
    lines.push('');
    lines.push(`- **Average Confidence**: ${(confidenceStats.average * 100).toFixed(1)}%`);
    lines.push(`- **High (>= 0.9)**: ${confidenceStats.high} tables`);
    lines.push(`- **Medium (0.7 - 0.9)**: ${confidenceStats.medium} tables`);
    lines.push(`- **Low (< 0.7)**: ${confidenceStats.low} tables`);
    lines.push('');

    // Low confidence tables
    const lowConfidence = this.stateManager.getLowConfidenceTables(state, 0.7);
    if (lowConfidence.length > 0) {
      lines.push('### Low Confidence Tables');
      lines.push('');
      lines.push('| Schema | Table | Confidence | Description |');
      lines.push('|--------|-------|------------|-------------|');

      for (const item of lowConfidence) {
        const descPreview = item.description.substring(0, 100);
        lines.push(
          `| ${item.schema} | ${item.table} | ${(item.confidence * 100).toFixed(0)}% | ${descPreview}... |`
        );
      }

      lines.push('');
    }

    // Unprocessed tables
    const unprocessed = this.stateManager.getUnprocessedTables(state);
    if (unprocessed.length > 0) {
      lines.push('### Unprocessed Tables');
      lines.push('');
      lines.push('| Schema | Table |');
      lines.push('|--------|-------|');

      for (const item of unprocessed) {
        lines.push(`| ${item.schema} | ${item.table} |`);
      }

      lines.push('');
    }

    // Iteration history
    if (state.analysisRuns.length > 1) {
      lines.push('## Iteration History');
      lines.push('');
      lines.push('| Run | Status | Iterations | Tokens | Cost | Converged |');
      lines.push('|-----|--------|------------|--------|------|-----------|');

      for (const run of state.analysisRuns) {
        lines.push(
          `| ${run.runId} | ${run.status} | ${run.iterationsPerformed} | ${run.totalTokensUsed.toLocaleString()} | $${run.estimatedCost.toFixed(2)} | ${run.converged ? 'Yes' : 'No'} |`
        );
      }

      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Calculate overall statistics
   */
  private calculateStatistics(state: DatabaseDocumentation): {
    schemaCount: number;
    tableCount: number;
    columnCount: number;
  } {
    let tableCount = 0;
    let columnCount = 0;

    for (const schema of state.schemas) {
      tableCount += schema.tables.length;

      for (const table of schema.tables) {
        columnCount += table.columns.length;
      }
    }

    return {
      schemaCount: state.schemas.length,
      tableCount,
      columnCount
    };
  }

  /**
   * Calculate confidence statistics
   */
  private calculateConfidenceStats(state: DatabaseDocumentation): {
    average: number;
    high: number;
    medium: number;
    low: number;
  } {
    let total = 0;
    let count = 0;
    let high = 0;
    let medium = 0;
    let low = 0;

    for (const schema of state.schemas) {
      for (const table of schema.tables) {
        if (table.descriptionIterations.length > 0) {
          const latest = table.descriptionIterations[table.descriptionIterations.length - 1];
          if (latest.confidence !== undefined) {
            total += latest.confidence;
            count++;

            if (latest.confidence >= 0.9) {
              high++;
            } else if (latest.confidence >= 0.7) {
              medium++;
            } else {
              low++;
            }
          }
        }
      }
    }

    return {
      average: count > 0 ? total / count : 0,
      high,
      medium,
      low
    };
  }
}
