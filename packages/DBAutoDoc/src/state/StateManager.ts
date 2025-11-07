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
      return JSON.parse(content) as DatabaseDocumentation;
    } catch (error) {
      throw new Error(`Failed to load state file: ${(error as Error).message}`);
    }
  }

  /**
   * Save state to file
   */
  public async save(state: DatabaseDocumentation): Promise<void> {
    try {
      // Update lastModified timestamp
      state.lastModified = new Date().toISOString();

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
    return {
      version: '1.0.0',
      database: {
        name: databaseName,
        server: serverName,
        analyzedAt: new Date().toISOString()
      },
      schemas: [],
      analysisRuns: [],
      createdAt: new Date().toISOString(),
      lastModified: new Date().toISOString(),
      totalIterations: 0
    };
  }

  /**
   * Start a new analysis run
   */
  public createAnalysisRun(state: DatabaseDocumentation, modelUsed: string): AnalysisRun {
    const run: AnalysisRun = {
      runId: this.generateRunId(),
      startedAt: new Date().toISOString(),
      status: 'in_progress',
      levelsProcessed: 0,
      iterationsPerformed: 0,
      backpropagationCount: 0,
      converged: false,
      modelUsed,
      totalTokensUsed: 0,
      estimatedCost: 0,
      warnings: [],
      errors: [],
      processingLog: []
    };

    state.analysisRuns.push(run);
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
    triggeredBy: 'initial' | 'backpropagation' | 'refinement' | 'sanity_check'
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
      triggeredBy: 'sanity_check'
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
