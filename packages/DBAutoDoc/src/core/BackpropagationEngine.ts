/**
 * Handles backpropagation of insights from child tables to parent tables
 */

import { DatabaseDocumentation, TableDefinition, AnalysisRun } from '../types/state.js';
import { BackpropagationTrigger } from '../types/analysis.js';
import { BackpropagationPromptResult } from '../types/prompts.js';
import { PromptEngine } from '../prompts/PromptEngine.js';
import { StateManager } from '../state/StateManager.js';
import { IterationTracker } from '../state/IterationTracker.js';

export class BackpropagationEngine {
  constructor(
    private promptEngine: PromptEngine,
    private stateManager: StateManager,
    private iterationTracker: IterationTracker,
    private maxDepth: number
  ) {}

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

      // Skip if no current description
      if (!table.description) {
        continue;
      }

      // Get current description details
      const latestIteration = table.descriptionIterations[table.descriptionIterations.length - 1];

      // Combine insights from all triggers for this table
      const insights = tableTriggers.map(t => t.insight).join('\n\n');

      // Execute backpropagation prompt
      const result = await this.promptEngine.executePrompt<BackpropagationPromptResult>(
        'backpropagation',
        {
          schemaName,
          tableName,
          currentDescription: table.description,
          currentReasoning: latestIteration?.reasoning || '',
          currentConfidence: latestIteration?.confidence || 0,
          insights
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
   */
  public detectParentInsights(
    table: TableDefinition,
    analysisResult: any
  ): BackpropagationTrigger[] {
    const triggers: BackpropagationTrigger[] = [];

    // Check if analysis revealed insights about parent tables
    // This would need to be extracted from the analysis reasoning
    // For now, we'll use a simple heuristic based on foreign keys

    if (!table.dependsOn || table.dependsOn.length === 0) {
      return triggers;
    }

    // Example: If child table analysis mentions parent table characteristics
    // that weren't known before, trigger backpropagation

    // This is a placeholder - in practice, you might want to:
    // 1. Parse the reasoning text for mentions of parent tables
    // 2. Check if the child's description contradicts parent's description
    // 3. Look for patterns that suggest parent table misclassification

    return triggers;
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
