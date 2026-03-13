/**
 * Handles backpropagation of insights from child tables to parent tables
 */

import { DatabaseDocumentation, TableDefinition, AnalysisRun } from '../types/state.js';
import { BackpropagationTrigger, TableGroundTruthContext } from '../types/analysis.js';
import { BackpropagationPromptResult } from '../types/prompts.js';
import { DBAutoDocConfig } from '../types/config.js';
import { PromptEngine } from '../prompts/PromptEngine.js';
import { StateManager } from '../state/StateManager.js';
import { IterationTracker } from '../state/IterationTracker.js';

export class BackpropagationEngine {
  private config?: DBAutoDocConfig;

  constructor(
    private promptEngine: PromptEngine,
    private stateManager: StateManager,
    private iterationTracker: IterationTracker,
    private maxDepth: number,
    config?: DBAutoDocConfig
  ) {
    this.config = config;
  }

  /**
   * Execute backpropagation for a set of triggers
   */
  public async execute(
    state: DatabaseDocumentation,
    run: AnalysisRun,
    triggers: BackpropagationTrigger[]
  ): Promise<{ tablesUpdated: number; tokensUsed: number }> {
    let tablesUpdated = 0;
    let totalTokensUsed = 0;

    // Group triggers by target table
    const triggersByTable = this.groupTriggersByTable(triggers);

    for (const [tableKey, tableTriggers] of triggersByTable) {
      const [schemaName, tableName] = tableKey.split('.');
      const table = this.stateManager.findTable(state, schemaName, tableName);

      if (!table) {
        this.iterationTracker.addWarning(
          run,
          `Backpropagation target table not found: ${tableKey}`
        );
        continue;
      }

      // Skip user-approved tables — they should not be revised
      if (table.userApproved) {
        this.iterationTracker.addLogEntry(run, {
          level: table.dependencyLevel || 0,
          schema: schemaName,
          table: tableName,
          action: 'backpropagate',
          result: 'unchanged',
          message: 'Skipped: user-approved description'
        });
        continue;
      }

      // Skip if no current description
      if (!table.description) {
        continue;
      }

      // Get current description details
      const latestIteration = table.descriptionIterations[table.descriptionIterations.length - 1];

      // Combine insights from all triggers for this table
      const insights = tableTriggers.map(t => t.insight).join('\n\n');

      // Build ground truth context if available
      const groundTruth = this.buildGroundTruthForTable(schemaName, tableName);

      // Execute backpropagation prompt
      const result = await this.promptEngine.executePrompt<BackpropagationPromptResult>(
        'backpropagation',
        {
          schemaName,
          tableName,
          currentDescription: table.description,
          currentReasoning: latestIteration?.reasoning || '',
          currentConfidence: latestIteration?.confidence || 0,
          insights,
          groundTruth
        },
        {
          responseFormat: 'JSON'
        }
      );

      if (!result.success || !result.result) {
        this.iterationTracker.addError(run, `Backpropagation failed for ${tableKey}: ${result.errorMessage}`);
        continue;
      }

      totalTokensUsed += result.tokensUsed;
      this.iterationTracker.addTokenUsage(run, result.tokensUsed, result.cost);

      // Check if revision is needed
      if (result.result.needsRevision) {
        // Update table description
        this.stateManager.updateTableDescription(
          table,
          result.result.revisedDescription || result.result.reasoning,
          result.result.reasoning,
          result.result.confidence,
          run.modelUsed,
          'backpropagation'
        );

        tablesUpdated++;

        this.iterationTracker.addLogEntry(run, {
          level: table.dependencyLevel || 0,
          schema: schemaName,
          table: tableName,
          action: 'backpropagate',
          result: 'changed',
          message: 'Description revised based on child table insights',
          tokensUsed: result.tokensUsed
        });
      } else {
        this.iterationTracker.addLogEntry(run, {
          level: table.dependencyLevel || 0,
          schema: schemaName,
          table: tableName,
          action: 'backpropagate',
          result: 'unchanged',
          message: 'No revision needed',
          tokensUsed: result.tokensUsed
        });
      }
    }

    if (tablesUpdated > 0) {
      this.iterationTracker.incrementBackpropagation(run);
    }

    return { tablesUpdated, tokensUsed: totalTokensUsed };
  }

  /**
   * Detect insights about parent tables from analysis result
   * Uses LLM-provided insights instead of NLP pattern matching
   */
  public detectParentInsights(
    table: TableDefinition,
    analysisResult: any,
    schema?: string,
    tableName?: string
  ): BackpropagationTrigger[] {
    const triggers: BackpropagationTrigger[] = [];

    // Current table full name for source
    const sourceTable = schema && tableName ? `${schema}.${tableName}` : 'unknown';

    // Use LLM-provided parent table insights (much more accurate than NLP)
    const parentInsights = analysisResult.parentTableInsights || [];

    for (const insight of parentInsights) {
      triggers.push({
        sourceTable,
        targetTable: insight.parentTable,
        insight: insight.insight,
        confidence: insight.confidence
      });
    }

    return triggers;
  }

  /**
   * Build ground truth context for a table
   */
  private buildGroundTruthForTable(schemaName: string, tableName: string): TableGroundTruthContext | undefined {
    const gt = this.config?.groundTruth;
    if (!gt) return undefined;

    const tableKey = `${schemaName}.${tableName}`;
    const tableGT = gt.tables?.[tableKey];
    if (!tableGT) return undefined;

    const context: TableGroundTruthContext = {};
    if (tableGT.description) context.tableDescription = tableGT.description;
    if (tableGT.notes) context.tableNotes = tableGT.notes;
    return context;
  }

  /**
   * Group triggers by target table
   */
  private groupTriggersByTable(
    triggers: BackpropagationTrigger[]
  ): Map<string, BackpropagationTrigger[]> {
    const grouped = new Map<string, BackpropagationTrigger[]>();

    for (const trigger of triggers) {
      if (!grouped.has(trigger.targetTable)) {
        grouped.set(trigger.targetTable, []);
      }
      grouped.get(trigger.targetTable)!.push(trigger);
    }

    return grouped;
  }
}
