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
      lines.push(`- **AI Model**: ${lastRun.modelUsed}`);
      lines.push(`- **AI Vendor**: ${lastRun.vendor}`);
      lines.push(`- **Temperature**: ${lastRun.temperature}`);
      if (lastRun.topP !== undefined) {
        lines.push(`- **Top P**: ${lastRun.topP}`);
      }
      if (lastRun.topK !== undefined) {
        lines.push(`- **Top K**: ${lastRun.topK}`);
      }
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

    // Table of contents - Schemas
    lines.push('## Table of Contents');
    lines.push('');
    for (const schema of state.schemas) {
      lines.push(`### [${schema.name}](#schema-${this.toAnchor(schema.name)}) (${schema.tables.length} tables)`);
      for (const table of schema.tables) {
        lines.push(`- [${table.name}](#${this.toAnchor(table.name)})`);
      }
      lines.push('');
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

      // Entity Relationship Diagram
      lines.push('### Entity Relationship Diagram');
      lines.push('');
      lines.push('```mermaid');
      lines.push(this.generateMermaidERD(schema));
      lines.push('```');
      lines.push('');

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
            const link = `[${dep.schema}.${dep.table}](#${this.toAnchor(dep.table)})`;
            lines.push(`- ${link} (via ${dep.column})`);
          }
          lines.push('');
        }

        if (table.dependents && table.dependents.length > 0) {
          lines.push('**Referenced By**:');
          for (const dep of table.dependents) {
            const link = `[${dep.schema}.${dep.table}](#${this.toAnchor(dep.table)})`;
            lines.push(`- ${link}`);
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

    // Iteration Analysis Appendix
    lines.push('---');
    lines.push('');
    lines.push('## Appendix: Iteration Analysis');
    lines.push('');
    lines.push('This section documents the iterative refinement process used to generate the database documentation, highlighting corrections and improvements discovered through backpropagation.');
    lines.push('');

    // Generate summary statistics
    const iterationStats = this.collectIterationStats(state);

    if (iterationStats.totalRefinements > 0) {
      lines.push('### Summary');
      lines.push('');
      lines.push(`- **Total Tables with Refinements**: ${iterationStats.tablesWithRefinements}`);
      lines.push(`- **Total Columns with Refinements**: ${iterationStats.columnsWithRefinements}`);
      lines.push(`- **Total Refinement Iterations**: ${iterationStats.totalRefinements}`);
      lines.push(`- **Refinements Triggered by Backpropagation**: ${iterationStats.backpropRefinements}`);
      lines.push('');

      // List tables that were refined
      lines.push('### Tables Refined Through Iteration');
      lines.push('');
      for (const schema of state.schemas) {
        for (const table of schema.tables) {
          if (table.descriptionIterations && table.descriptionIterations.length > 1) {
            const iterations = table.descriptionIterations.length;
            const lastIteration = table.descriptionIterations[iterations - 1];
            const triggeredBy = lastIteration.triggeredBy || 'unknown';

            lines.push(`#### [${table.name}](#${this.toAnchor(table.name)})`);
            lines.push('');
            lines.push(`**Iterations**: ${iterations} | **Trigger**: ${triggeredBy}`);
            lines.push('');

            // Show the evolution of the description
            for (let i = 0; i < table.descriptionIterations.length; i++) {
              const iter = table.descriptionIterations[i];
              lines.push(`**Iteration ${i + 1}** (${iter.triggeredBy || 'initial'}):`);
              lines.push('');
              lines.push(`> ${iter.description}`);
              lines.push('');
              if (iter.reasoning) {
                lines.push(`*Reasoning*: ${iter.reasoning}`);
                lines.push('');
              }
              if (i < table.descriptionIterations.length - 1) {
                lines.push('---');
                lines.push('');
              }
            }
            lines.push('');
          }
        }
      }

      // Mermaid sequence diagram
      lines.push('### Iteration Process Visualization');
      lines.push('');
      lines.push('The following diagram illustrates the analysis workflow and highlights where corrections were made through backpropagation:');
      lines.push('');
      lines.push('```mermaid');
      lines.push(this.generateIterationSequenceDiagram(state));
      lines.push('```');
      lines.push('');
    } else {
      lines.push('No iterative refinements were needed - all descriptions were accepted on first analysis.');
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Generate Mermaid ERD diagram for a schema
   */
  private generateMermaidERD(schema: any): string {
    const lines: string[] = [];
    lines.push('erDiagram');

    // Add entities with their columns
    for (const table of schema.tables) {
      lines.push(`    ${table.name} {`);

      for (const column of table.columns) {
        const type = column.dataType.replace(/\s+/g, '_');
        const constraints = [];
        if (column.isPrimaryKey) constraints.push('PK');
        if (column.isForeignKey) constraints.push('FK');
        if (!column.isNullable) constraints.push('NOT_NULL');

        const constraintStr = constraints.length > 0 ? ` "${constraints.join(',')}"` : '';
        lines.push(`        ${type} ${column.name}${constraintStr}`);
      }

      lines.push('    }');
    }

    lines.push('');

    // Add relationships
    for (const table of schema.tables) {
      if (table.dependsOn && table.dependsOn.length > 0) {
        for (const dep of table.dependsOn) {
          // Format: ParentTable ||--o{ ChildTable : "relationship"
          lines.push(`    ${dep.table} ||--o{ ${table.name} : "has"`);
        }
      }
    }

    return lines.join('\n');
  }

  /**
   * Convert a string to a markdown anchor-friendly format
   */
  private toAnchor(text: string): string {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  /**
   * Collect iteration statistics from the state
   */
  private collectIterationStats(state: DatabaseDocumentation): {
    tablesWithRefinements: number;
    columnsWithRefinements: number;
    totalRefinements: number;
    backpropRefinements: number;
  } {
    let tablesWithRefinements = 0;
    let columnsWithRefinements = 0;
    let totalRefinements = 0;
    let backpropRefinements = 0;

    for (const schema of state.schemas) {
      for (const table of schema.tables) {
        // Check table iterations
        if (table.descriptionIterations && table.descriptionIterations.length > 1) {
          tablesWithRefinements++;
          totalRefinements += table.descriptionIterations.length - 1;

          // Count backprop triggers
          for (let i = 1; i < table.descriptionIterations.length; i++) {
            if (table.descriptionIterations[i].triggeredBy === 'backpropagation') {
              backpropRefinements++;
            }
          }
        }

        // Check column iterations
        for (const column of table.columns) {
          if (column.descriptionIterations && column.descriptionIterations.length > 1) {
            columnsWithRefinements++;
            totalRefinements += column.descriptionIterations.length - 1;

            // Count backprop triggers
            for (let i = 1; i < column.descriptionIterations.length; i++) {
              if (column.descriptionIterations[i].triggeredBy === 'backpropagation') {
                backpropRefinements++;
              }
            }
          }
        }
      }
    }

    return {
      tablesWithRefinements,
      columnsWithRefinements,
      totalRefinements,
      backpropRefinements
    };
  }

  /**
   * Generate a Mermaid sequence diagram showing the iteration process
   */
  private generateIterationSequenceDiagram(state: DatabaseDocumentation): string {
    const lines: string[] = [];
    lines.push('sequenceDiagram');
    lines.push('    participant User');
    lines.push('    participant Analyzer');
    lines.push('    participant AI');
    lines.push('    participant SemanticCheck');
    lines.push('');
    lines.push('    User->>Analyzer: Start Analysis');
    lines.push('    Analyzer->>AI: Analyze Schema');
    lines.push('');

    // Track which tables had iterations
    const processedTables: string[] = [];

    for (const schema of state.schemas) {
      for (const table of schema.tables) {
        if (table.descriptionIterations && table.descriptionIterations.length > 0) {
          const iterations = table.descriptionIterations.length;

          // First iteration (initial)
          lines.push(`    AI->>Analyzer: Initial description for ${table.name}`);

          if (iterations > 1) {
            // Subsequent iterations - show refinement
            for (let i = 1; i < iterations; i++) {
              const iter = table.descriptionIterations[i];
              const trigger = iter.triggeredBy || 'unknown';

              if (trigger === 'backpropagation') {
                lines.push(`    Note right of Analyzer: Backpropagation triggered`);
                lines.push(`    Analyzer->>SemanticCheck: Compare iterations for ${table.name}`);
                lines.push(`    SemanticCheck->>Analyzer: Material change detected`);
                lines.push(`    Analyzer->>AI: Refine description (iteration ${i + 1})`);
                lines.push(`    AI->>Analyzer: Updated description`);
                lines.push(`    rect rgb(255, 220, 100)`);
                lines.push(`        Note over Analyzer: ${table.name} refined via backprop`);
                lines.push(`    end`);
              } else {
                lines.push(`    Analyzer->>AI: Refine description (iteration ${i + 1})`);
                lines.push(`    AI->>Analyzer: Updated description`);
              }
            }

            processedTables.push(table.name);
          }
        }
      }
    }

    lines.push('');
    lines.push('    Analyzer->>User: Analysis Complete');

    if (processedTables.length > 0) {
      lines.push('    Note over User,AI: Tables refined: ' + processedTables.join(', '));
    }

    return lines.join('\n');
  }
}
