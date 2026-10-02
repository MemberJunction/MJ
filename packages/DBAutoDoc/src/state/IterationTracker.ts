/**
 * Tracks iteration metadata and changes
 */

import { DatabaseDocumentation, AnalysisRun, ProcessingLogEntry } from '../types/state.js';
import { TokenPricingConfig } from '../types/config.js';

export class IterationTracker {
  /**
   * Get the current (latest) analysis run
   */
  public GetCurrentRun(state: DatabaseDocumentation): AnalysisRun | null {
    if (state.phases.descriptionGeneration.length === 0) {
      return null;
    }
    return state.phases.descriptionGeneration[state.phases.descriptionGeneration.length - 1];
  }

  /** @deprecated Use {@link GetCurrentRun}. */
  public getCurrentRun(state: DatabaseDocumentation): AnalysisRun | null {
    return this.GetCurrentRun(state);
  }

  /**
   * Add processing log entry
   */
  public AddLogEntry(
    run: AnalysisRun,
    entry: Omit<ProcessingLogEntry, 'timestamp'>
  ): void {
    const logEntry: ProcessingLogEntry = {
      ...entry,
      timestamp: new Date().toISOString()
    };

    run.processingLog.push(logEntry);
  }

  /** @deprecated Use {@link AddLogEntry}. */
  public addLogEntry(
    run: AnalysisRun,
    entry: Omit<ProcessingLogEntry, 'timestamp'>
  ): void {
    return this.AddLogEntry(run, entry);
  }

  /**
   * Add processing log entry with prompt I/O details
   */
  public AddLogEntryWithPrompt(
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

  /** @deprecated Use {@link AddLogEntryWithPrompt}. */
  public addLogEntryWithPrompt(
    run: AnalysisRun,
    entry: Omit<ProcessingLogEntry, 'timestamp'>,
    promptInput?: string,
    promptOutput?: string
  ): void {
    return this.AddLogEntryWithPrompt(run, entry, promptInput, promptOutput);
  }

  /**
   * Mark run as complete
   */
  public CompleteRun(
    run: AnalysisRun,
    converged: boolean,
    convergenceReason?: string
  ): void {
    run.completedAt = new Date().toISOString();
    run.status = converged ? 'converged' : 'completed';
    run.converged = converged;
    run.convergenceReason = convergenceReason;
  }

  /** @deprecated Use {@link CompleteRun}. */
  public completeRun(
    run: AnalysisRun,
    converged: boolean,
    convergenceReason?: string
  ): void {
    return this.CompleteRun(run, converged, convergenceReason);
  }

  /**
   * Mark run as failed
   */
  public FailRun(run: AnalysisRun, error: string): void {
    run.completedAt = new Date().toISOString();
    run.status = 'failed';
    run.errors.push(error);
  }

  /** @deprecated Use {@link FailRun}. */
  public failRun(run: AnalysisRun, error: string): void {
    return this.FailRun(run, error);
  }

  /**
   * Get recent changes from processing log
   */
  public GetRecentChanges(
    run: AnalysisRun,
    count: number = 10
  ): ProcessingLogEntry[] {
    const changes = run.processingLog.filter(
      entry => entry.result === 'changed'
    );

    return changes.slice(-count);
  }

  /** @deprecated Use {@link GetRecentChanges}. */
  public getRecentChanges(
    run: AnalysisRun,
    count: number = 10
  ): ProcessingLogEntry[] {
    return this.GetRecentChanges(run, count);
  }

  /**
   * Check if any changes occurred in last N iterations
   */
  public HasRecentChanges(
    state: DatabaseDocumentation,
    windowSize: number
  ): boolean {
    const run = this.GetCurrentRun(state);
    if (!run) {
      return false;
    }

    // Get log entries from last windowSize iterations
    const recentLogs = run.processingLog.slice(-(windowSize * 10)); // Rough estimate

    return recentLogs.some(entry => entry.result === 'changed');
  }

  /** @deprecated Use {@link HasRecentChanges}. */
  public hasRecentChanges(
    state: DatabaseDocumentation,
    windowSize: number
  ): boolean {
    return this.HasRecentChanges(state, windowSize);
  }

  /**
   * Get iteration statistics
   */
  public GetIterationStats(run: AnalysisRun): {
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

  /** @deprecated Use {@link GetIterationStats}. */
  public getIterationStats(run: AnalysisRun): {
    totalProcessed: number;
    changed: number;
    unchanged: number;
    errors: number;
  } {
    return this.GetIterationStats(run);
  }

  /**
   * Add tokens to run total and calculate cost from pricing config if available
   */
  public AddTokenUsage(run: AnalysisRun, tokensUsed: number, cost?: number, inputTokens?: number, outputTokens?: number, pricing?: TokenPricingConfig): void {
    run.totalTokensUsed += tokensUsed;
    run.totalInputTokens = (run.totalInputTokens || 0) + (inputTokens || 0);
    run.totalOutputTokens = (run.totalOutputTokens || 0) + (outputTokens || 0);
    if (cost) {
      run.estimatedCost += cost;
    } else if (pricing && (inputTokens || outputTokens)) {
      run.estimatedCost += IterationTracker.CalculateCost(inputTokens || 0, outputTokens || 0, pricing);
    }
  }

  /** @deprecated Use {@link AddTokenUsage}. */
  public addTokenUsage(run: AnalysisRun, tokensUsed: number, cost?: number, inputTokens?: number, outputTokens?: number, pricing?: TokenPricingConfig): void {
    return this.AddTokenUsage(run, tokensUsed, cost, inputTokens, outputTokens, pricing);
  }

  /**
   * Calculate cost from token counts and pricing config
   */
  public static CalculateCost(inputTokens: number, outputTokens: number, pricing: TokenPricingConfig): number {
    return (inputTokens * pricing.inputCostPer1MTokens + outputTokens * pricing.outputCostPer1MTokens) / 1_000_000;
  }

  /**
   * Increment iteration count
   */
  public IncrementIteration(state: DatabaseDocumentation, run: AnalysisRun): void {
    run.iterationsPerformed++;
    state.summary.totalIterations++;
  }

  /** @deprecated Use {@link IncrementIteration}. */
  public incrementIteration(state: DatabaseDocumentation, run: AnalysisRun): void {
    return this.IncrementIteration(state, run);
  }

  /**
   * Increment backpropagation count
   */
  public IncrementBackpropagation(run: AnalysisRun): void {
    run.backpropagationCount++;
  }

  /** @deprecated Use {@link IncrementBackpropagation}. */
  public incrementBackpropagation(run: AnalysisRun): void {
    return this.IncrementBackpropagation(run);
  }

  /**
   * Add warning to run
   */
  public AddWarning(run: AnalysisRun, warning: string): void {
    run.warnings.push(warning);
  }

  /** @deprecated Use {@link AddWarning}. */
  public addWarning(run: AnalysisRun, warning: string): void {
    return this.AddWarning(run, warning);
  }

  /**
   * Add error to run
   */
  public AddError(run: AnalysisRun, error: string): void {
    run.errors.push(error);
  }

  /** @deprecated Use {@link AddError}. */
  public addError(run: AnalysisRun, error: string): void {
    return this.AddError(run, error);
  }
}
