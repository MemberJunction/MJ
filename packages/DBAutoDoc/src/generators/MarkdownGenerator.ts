/**
 * Generates Markdown documentation
 */

import { DatabaseDocumentation } from '../types/state.js';

export class MarkdownGenerator {
  /**
   * Generate markdown documentation
   */
  public generate(state: DatabaseDocumentation): string {
    const lines: string[] = [];

    // Header
    lines.push(`# Database Documentation: ${state.database.name}`);
    lines.push('');
    lines.push(`**Server**: ${state.database.server}`);
    lines.push(`**Generated**: ${new Date().toISOString()}`);
    lines.push(`**Total Iterations**: ${state.totalIterations}`);
    lines.push('');

    // Analysis summary
    if (state.analysisRuns.length > 0) {
      const lastRun = state.analysisRuns[state.analysisRuns.length - 1];
      lines.push('## Analysis Summary');
      lines.push('');
      lines.push(`- **Status**: ${lastRun.status}`);
      lines.push(`- **Iterations**: ${lastRun.iterationsPerformed}`);
      lines.push(`- **Tokens Used**: ${lastRun.totalTokensUsed.toLocaleString()}`);
      lines.push(`- **Estimated Cost**: $${lastRun.estimatedCost.toFixed(2)}`);
      lines.push(`- **Model**: ${lastRun.modelUsed}`);
      if (lastRun.converged) {
        lines.push(`- **Convergence**: ${lastRun.convergenceReason}`);
      }
      lines.push('');
    }

    // Seed context
    if (state.seedContext) {
      lines.push('## Database Context');
      lines.push('');
      if (state.seedContext.overallPurpose) {
        lines.push(`**Purpose**: ${state.seedContext.overallPurpose}`);
        lines.push('');
      }
      if (state.seedContext.industryContext) {
        lines.push(`**Industry**: ${state.seedContext.industryContext}`);
        lines.push('');
      }
      if (state.seedContext.businessDomains && state.seedContext.businessDomains.length > 0) {
        lines.push(`**Business Domains**: ${state.seedContext.businessDomains.join(', ')}`);
        lines.push('');
      }
    }

    // Table of contents
    lines.push('## Schemas');
    lines.push('');
    for (const schema of state.schemas) {
      lines.push(`- [${schema.name}](#schema-${schema.name.toLowerCase()}) (${schema.tables.length} tables)`);
    }
    lines.push('');

    // Schemas
    for (const schema of state.schemas) {
      lines.push(`## Schema: ${schema.name}`);
      lines.push('');

      if (schema.description) {
        lines.push(schema.description);
        lines.push('');
      }

      if (schema.inferredPurpose) {
        lines.push(`**Purpose**: ${schema.inferredPurpose}`);
        lines.push('');
      }

      if (schema.businessDomains && schema.businessDomains.length > 0) {
        lines.push(`**Business Domains**: ${schema.businessDomains.join(', ')}`);
        lines.push('');
      }

      // Tables
      lines.push('### Tables');
      lines.push('');

      for (const table of schema.tables) {
        lines.push(`#### ${table.name}`);
        lines.push('');

        if (table.description) {
          lines.push(table.description);
          lines.push('');
        }

        // Metadata
        lines.push(`**Row Count**: ${table.rowCount.toLocaleString()}`);
        if (table.dependencyLevel !== undefined) {
          lines.push(`**Dependency Level**: ${table.dependencyLevel}`);
        }
        lines.push('');

        // Confidence
        if (table.descriptionIterations.length > 0) {
          const latest = table.descriptionIterations[table.descriptionIterations.length - 1];
          if (latest.confidence) {
            lines.push(`**Confidence**: ${(latest.confidence * 100).toFixed(0)}%`);
            lines.push('');
          }
        }

        // Relationships
        if (table.dependsOn && table.dependsOn.length > 0) {
          lines.push('**Depends On**:');
          for (const dep of table.dependsOn) {
            lines.push(`- ${dep.schema}.${dep.table} (via ${dep.column})`);
          }
          lines.push('');
        }

        if (table.dependents && table.dependents.length > 0) {
          lines.push('**Referenced By**:');
          for (const dep of table.dependents) {
            lines.push(`- ${dep.schema}.${dep.table}`);
          }
          lines.push('');
        }

        // Columns
        lines.push('**Columns**:');
        lines.push('');
        lines.push('| Column | Type | Description |');
        lines.push('|--------|------|-------------|');

        for (const column of table.columns) {
          const flags = [];
          if (column.isPrimaryKey) flags.push('PK');
          if (column.isForeignKey) flags.push('FK');
          if (!column.isNullable) flags.push('NOT NULL');

          const typeInfo = flags.length > 0 ? `${column.dataType} (${flags.join(', ')})` : column.dataType;
          const description = column.description || '';

          lines.push(`| ${column.name} | ${typeInfo} | ${description} |`);
        }

        lines.push('');
      }
    }

    return lines.join('\n');
  }
}
