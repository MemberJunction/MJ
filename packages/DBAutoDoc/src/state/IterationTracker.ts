/**
 * Tracks iteration metadata and changes
 */

import { DatabaseDocumentation, AnalysisRun, ProcessingLogEntry } from '../types/state.js';

export class IterationTracker {
  /**
   * Get the current (latest) analysis run
   */
  public getCurrentRun(state: DatabaseDocumentation): AnalysisRun | null {
    if (state.phases.descriptionGeneration.length === 0) {
      return null;
    }
    return state.phases.descriptionGeneration[state.phases.descriptionGeneration.length - 1];
  }

  /**
   * Add processing log entry
   */
  public addLogEntry(
    run: AnalysisRun,
    entry: Omit<ProcessingLogEntry, 'timestamp'>
  ): void {
    const logEntry: ProcessingLogEntry = {
      ...entry,
      timestamp: new Date().toISOString()
    };

    run.processingLog.push(logEntry);
  }

  /**
   * Add processing log entry with prompt I/O details
   */
  public addLogEntryWithPrompt(
    run: AnalysisRun,
    entry: Omit<ProcessingLogEntry, 'timestamp'>,
    promptInput?: string,
    promptOutput?: string
  ): void {
    const logEntry: ProcessingLogEntry = {
      ...entry,
      timestamp: new Date().toISOString(),
      promptInput,
      promptOutput
    };

    run.processingLog.push(logEntry);
  }

  /**
   * Mark run as complete
   */
  public completeRun(
    run: AnalysisRun,
    converged: boolean,
    convergenceReason?: string
  ): void {
    run.completedAt = new Date().toISOString();
    run.status = converged ? 'converged' : 'completed';
    run.converged = converged;
    run.convergenceReason = convergenceReason;
  }

  /**
   * Mark run as failed
   */
  public failRun(run: AnalysisRun, error: string): void {
    run.completedAt = new Date().toISOString();
    run.status = 'failed';
    run.errors.push(error);
  }

  /**
   * Get recent changes from processing log
   */
  public getRecentChanges(
    run: AnalysisRun,
    count: number = 10
  ): ProcessingLogEntry[] {
    const changes = run.processingLog.filter(
      entry => entry.result === 'changed'
    );

    return changes.slice(-count);
  }

  /**
   * Check if any changes occurred in last N iterations
   */
  public hasRecentChanges(
    state: DatabaseDocumentation,
    windowSize: number
  ): boolean {
    const run = this.getCurrentRun(state);
    if (!run) {
      return false;
    }

    // Get log entries from last windowSize iterations
    const recentLogs = run.processingLog.slice(-(windowSize * 10)); // Rough estimate

    return recentLogs.some(entry => entry.result === 'changed');
  }

  /**
   * Get iteration statistics
   */
  public getIterationStats(run: AnalysisRun): {
    totalProcessed: number;
    changed: number;
    unchanged: number;
    errors: number;
  } {
    const stats = {
      totalProcessed: run.processingLog.length,
      changed: 0,
      unchanged: 0,
      errors: 0
    };

    for (const entry of run.processingLog) {
      switch (entry.result) {
        case 'changed':
          stats.changed++;
          break;
        case 'unchanged':
          stats.unchanged++;
          break;
        case 'error':
          stats.errors++;
          break;
      }
    }

    return stats;
  }

  /**
   * Add tokens to run total
   */
  public addTokenUsage(run: AnalysisRun, tokensUsed: number, cost?: number): void {
    run.totalTokensUsed += tokensUsed;
    if (cost) {
      run.estimatedCost += cost;
    }
  }

  /**
   * Increment iteration count
   */
  public incrementIteration(state: DatabaseDocumentation, run: AnalysisRun): void {
    run.iterationsPerformed++;
    state.summary.totalIterations++;
  }

  /**
   * Increment backpropagation count
   */
  public incrementBackpropagation(run: AnalysisRun): void {
    run.backpropagationCount++;
  }

  /**
   * Add warning to run
   */
  public addWarning(run: AnalysisRun, warning: string): void {
    run.warnings.push(warning);
  }

  /**
   * Add error to run
   */
  public addError(run: AnalysisRun, error: string): void {
    run.errors.push(error);
  }
}
