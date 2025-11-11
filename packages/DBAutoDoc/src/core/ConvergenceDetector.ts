/**
 * Determines when analysis has converged
 */

import { DatabaseDocumentation, AnalysisRun } from '../types/state.js';
import { ConvergenceConfig } from '../types/config.js';
import { ConvergenceResult } from '../types/analysis.js';
import { IterationTracker } from '../state/IterationTracker.js';
import { StateManager } from '../state/StateManager.js';

export class ConvergenceDetector {
  constructor(
    private config: ConvergenceConfig,
    private stateManager: StateManager,
    private iterationTracker: IterationTracker
  ) {}

  /**
   * Check if analysis has converged
   */
  public hasConverged(
    state: DatabaseDocumentation,
    run: AnalysisRun
  ): ConvergenceResult {
    const reasons: string[] = [];

    // 1. Check max iterations
    if (run.iterationsPerformed >= this.config.maxIterations) {
      return {
        converged: true,
        reason: `Reached maximum iteration limit (${this.config.maxIterations})`,
        iterationsPerformed: run.iterationsPerformed,
        suggestions: ['Consider increasing maxIterations if results are unsatisfactory']
      };
    }

    // 2. Check stability window (no changes in last N iterations)
    if (run.iterationsPerformed >= 2) {
      const hasChanges = this.hasRecentChanges(run, this.config.stabilityWindow);
      if (!hasChanges) {
        reasons.push(
          `No changes in last ${this.config.stabilityWindow} iterations (stability achieved)`
        );
      }
    }

    // 3. Check confidence threshold
    const lowConfidenceTables = this.stateManager.getLowConfidenceTables(
      state,
      this.config.confidenceThreshold
    );

    if (lowConfidenceTables.length === 0 && run.iterationsPerformed >= 1) {
      reasons.push(
        `All tables meet confidence threshold (${this.config.confidenceThreshold})`
      );
    }

    // Converged if we have at least 2 reasons and minimum iterations
    if (reasons.length >= 2 && run.iterationsPerformed >= 2) {
      return {
        converged: true,
        reason: reasons.join('; '),
        iterationsPerformed: run.iterationsPerformed
      };
    }

    // Not yet converged
    const suggestions: string[] = [];

    if (lowConfidenceTables.length > 0) {
      suggestions.push(
        `${lowConfidenceTables.length} tables below confidence threshold - needs more iteration`
      );
    }

    if (run.iterationsPerformed < 2) {
      suggestions.push('Minimum 2 iterations required before convergence check');
    }

    return {
      converged: false,
      reason: 'Analysis still evolving',
      iterationsPerformed: run.iterationsPerformed,
      suggestions
    };
  }

  /**
   * Check if there were changes in recent iterations
   */
  private hasRecentChanges(run: AnalysisRun, windowSize: number): boolean {
    // Get log entries from last window
    const logsPerIteration = Math.ceil(run.processingLog.length / run.iterationsPerformed);
    const windowLogs = run.processingLog.slice(-(windowSize * logsPerIteration));

    return windowLogs.some(entry => entry.result === 'changed');
  }

  /**
   * Calculate average confidence across all tables
   */
  public calculateAverageConfidence(state: DatabaseDocumentation): number {
    let totalConfidence = 0;
    let count = 0;

    for (const schema of state.schemas) {
      for (const table of schema.tables) {
        if (table.descriptionIterations.length > 0) {
          const latest = table.descriptionIterations[table.descriptionIterations.length - 1];
          if (latest.confidence !== undefined) {
            totalConfidence += latest.confidence;
            count++;
          }
        }
      }
    }

    return count > 0 ? totalConfidence / count : 0;
  }
}
