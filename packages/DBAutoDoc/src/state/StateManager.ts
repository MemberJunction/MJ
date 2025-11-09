/**
 * State file management
 * Handles loading, saving, and updating the state file
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import {
  DatabaseDocumentation,
  SchemaDefinition,
  TableDefinition,
  ColumnDefinition,
  DescriptionIteration,
  AnalysisRun
} from '../types/state.js';

export class StateManager {
  constructor(private stateFilePath: string) {}

  /**
   * Load state from file
   */
  public async load(): Promise<DatabaseDocumentation | null> {
    try {
      const exists = await this.fileExists();
      if (!exists) {
        return null;
      }

      const content = await fs.readFile(this.stateFilePath, 'utf-8');
      const state = JSON.parse(content) as DatabaseDocumentation;

      // Migrate old structure to new phases structure (backward compatibility)
      if (!state.phases) {
        state.phases = {
          descriptionGeneration: (state as any).analysisRuns || []
        };
        if ((state as any).relationshipDiscoveryPhase) {
          state.phases.keyDetection = (state as any).relationshipDiscoveryPhase;
        }
      }

      // Initialize summary if it doesn't exist (backward compatibility)
      if (!state.summary) {
        state.summary = {
          createdAt: (state as any).createdAt || new Date().toISOString(),
          lastModified: (state as any).lastModified || new Date().toISOString(),
          totalIterations: (state as any).totalIterations || 0,
          totalPromptsRun: 0,
          totalInputTokens: 0,
          totalOutputTokens: 0,
          totalTokens: 0,
          totalSchemas: 0,
          totalTables: 0,
          totalColumns: 0,
          estimatedCost: 0
        };
        this.updateSummary(state);
      } else {
        // Migrate timing fields into summary if they exist at top level
        if ((state as any).createdAt && !state.summary.createdAt) {
          state.summary.createdAt = (state as any).createdAt;
        }
        if ((state as any).lastModified && !state.summary.lastModified) {
          state.summary.lastModified = (state as any).lastModified;
        }
        if ((state as any).totalIterations !== undefined && !state.summary.totalIterations) {
          state.summary.totalIterations = (state as any).totalIterations;
        }
      }

      return state;
    } catch (error) {
      throw new Error(`Failed to load state file: ${(error as Error).message}`);
    }
  }

  /**
   * Save state to file
   */
  public async save(state: DatabaseDocumentation): Promise<void> {
    try {
      // Update lastModified timestamp in summary
      state.summary.lastModified = new Date().toISOString();

      // Ensure output directory exists
      const dir = path.dirname(this.stateFilePath);
      await fs.mkdir(dir, { recursive: true });

      // Write state file
      const content = JSON.stringify(state, null, 2);
      await fs.writeFile(this.stateFilePath, content, 'utf-8');
    } catch (error) {
      throw new Error(`Failed to save state file: ${(error as Error).message}`);
    }
  }

  /**
   * Create initial empty state
   */
  public createInitialState(
    databaseName: string,
    serverName: string
  ): DatabaseDocumentation {
    const now = new Date().toISOString();
    return {
      version: '1.0.0',
      summary: {
        createdAt: now,
        lastModified: now,
        totalIterations: 0,
        totalPromptsRun: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalTokens: 0,
        totalSchemas: 0,
        totalTables: 0,
        totalColumns: 0,
        estimatedCost: 0
      },
      database: {
        name: databaseName,
        server: serverName,
        analyzedAt: now
      },
      phases: {
        descriptionGeneration: []
      },
      schemas: []
    };
  }

  /**
   * Start a new analysis run
   */
  public createAnalysisRun(
    state: DatabaseDocumentation,
    modelUsed: string,
    vendor: string,
    temperature: number,
    topP?: number,
    topK?: number
  ): AnalysisRun {
    const run: AnalysisRun = {
      runId: this.generateRunId(),
      startedAt: new Date().toISOString(),
      status: 'in_progress',
      levelsProcessed: 0,
      iterationsPerformed: 0,
      backpropagationCount: 0,
      sanityCheckCount: 0,
      converged: false,
      modelUsed,
      vendor,
      temperature,
      topP,
      topK,
      totalTokensUsed: 0,
      estimatedCost: 0,
      warnings: [],
      errors: [],
      processingLog: [],
      sanityChecks: []
    };

    state.phases.descriptionGeneration.push(run);
    return run;
  }

  /**
   * Update table description with new iteration
   */
  public updateTableDescription(
    table: TableDefinition,
    description: string,
    reasoning: string,
    confidence: number,
    modelUsed: string,
    triggeredBy: 'initial' | 'backpropagation' | 'refinement' | 'dependency_sanity_check' | 'schema_sanity_check' | 'cross_schema_sanity_check'
  ): void {
    const iteration: DescriptionIteration = {
      description,
      reasoning,
      generatedAt: new Date().toISOString(),
      modelUsed,
      confidence,
      triggeredBy,
      changedFrom: table.description
    };

    table.descriptionIterations.push(iteration);
    table.description = description;
  }

  /**
   * Update column description with new iteration
   */
  public updateColumnDescription(
    column: ColumnDefinition,
    description: string,
    reasoning: string,
    modelUsed: string
  ): void {
    const iteration: DescriptionIteration = {
      description,
      reasoning,
      generatedAt: new Date().toISOString(),
      modelUsed
    };

    column.descriptionIterations.push(iteration);
    column.description = description;
  }

  /**
   * Update schema description
   */
  public updateSchemaDescription(
    schema: SchemaDefinition,
    description: string,
    reasoning: string,
    modelUsed: string
  ): void {
    const iteration: DescriptionIteration = {
      description,
      reasoning,
      generatedAt: new Date().toISOString(),
      modelUsed,
      triggeredBy: 'schema_sanity_check'
    };

    schema.descriptionIterations.push(iteration);
    schema.description = description;
  }

  /**
   * Find a table in the state
   */
  public findTable(
    state: DatabaseDocumentation,
    schemaName: string,
    tableName: string
  ): TableDefinition | null {
    const schema = state.schemas.find(s => s.name === schemaName);
    if (!schema) {
      return null;
    }

    return schema.tables.find(t => t.name === tableName) || null;
  }

  /**
   * Get all unapproved tables
   */
  public getUnapprovedTables(state: DatabaseDocumentation): TableDefinition[] {
    const unapproved: TableDefinition[] = [];

    for (const schema of state.schemas) {
      for (const table of schema.tables) {
        if (!table.userApproved) {
          unapproved.push(table);
        }
      }
    }

    return unapproved;
  }

  /**
   * Get low-confidence tables
   */
  public getLowConfidenceTables(
    state: DatabaseDocumentation,
    threshold: number
  ): Array<{ schema: string; table: string; confidence: number; description: string; reasoning: string }> {
    const lowConfidence: Array<{
      schema: string;
      table: string;
      confidence: number;
      description: string;
      reasoning: string;
    }> = [];

    for (const schema of state.schemas) {
      for (const table of schema.tables) {
        if (table.descriptionIterations.length > 0) {
          const latest = table.descriptionIterations[table.descriptionIterations.length - 1];
          const confidence = latest.confidence ?? 0;

          if (confidence < threshold) {
            lowConfidence.push({
              schema: schema.name,
              table: table.name,
              confidence,
              description: latest.description,
              reasoning: latest.reasoning
            });
          }
        }
      }
    }

    return lowConfidence;
  }

  /**
   * Get tables that need processing (no descriptions yet)
   */
  public getUnprocessedTables(state: DatabaseDocumentation): Array<{ schema: string; table: string }> {
    const unprocessed: Array<{ schema: string; table: string }> = [];

    for (const schema of state.schemas) {
      for (const table of schema.tables) {
        if (table.descriptionIterations.length === 0) {
          unprocessed.push({
            schema: schema.name,
            table: table.name
          });
        }
      }
    }

    return unprocessed;
  }

  /**
   * Check if state file exists
   */
  private async fileExists(): Promise<boolean> {
    try {
      await fs.access(this.stateFilePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Generate unique run ID
   */
  private generateRunId(): string {
    return `run_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Update summary statistics from current state and analysis runs
   */
  public updateSummary(state: DatabaseDocumentation): void {
    // Count schemas, tables, columns
    let totalTables = 0;
    let totalColumns = 0;
    for (const schema of state.schemas) {
      totalTables += schema.tables.length;
      for (const table of schema.tables) {
        totalColumns += table.columns.length;
      }
    }

    // Aggregate from all analysis runs
    let totalPromptsRun = 0;
    let totalTokens = 0;
    let estimatedCost = 0;

    for (const run of state.phases.descriptionGeneration) {
      // Count prompts from processing log
      totalPromptsRun += run.processingLog.filter(
        log => log.tokensUsed && log.tokensUsed > 0
      ).length;

      // Sum tokens and cost
      totalTokens += run.totalTokensUsed;
      estimatedCost += run.estimatedCost;
    }

    // Update summary (preserve timing fields)
    state.summary = {
      ...state.summary,
      totalPromptsRun,
      totalInputTokens: 0,  // TODO: Will need to track separately when available
      totalOutputTokens: 0, // TODO: Will need to track separately when available
      totalTokens,
      totalSchemas: state.schemas.length,
      totalTables,
      totalColumns,
      estimatedCost
    };
  }

  /**
   * Delete state file
   */
  public async delete(): Promise<void> {
    try {
      const exists = await this.fileExists();
      if (exists) {
        await fs.unlink(this.stateFilePath);
      }
    } catch (error) {
      throw new Error(`Failed to delete state file: ${(error as Error).message}`);
    }
  }
}
