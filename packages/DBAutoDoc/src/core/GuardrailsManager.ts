/**
 * Manages granular guardrails enforcement for DBAutoDoc analysis
 *
 * Supports:
 * - Per-phase token limits (discovery, analysis, sanity checks)
 * - Per-iteration token and duration limits
 * - Cost-based limits with configurable thresholds
 * - Configurable warning thresholds at percentages of limits
 * - Detailed tracking of exceedances and warnings
 */

import { GuardrailsConfig } from '../types/config.js';
import { AnalysisRun, PhaseMetrics, PhaseMetric, IterationMetrics, GuardrailEnforcement, GuardrailExceeded, GuardrailWarning } from '../types/state.js';

export type PhaseType = 'discovery' | 'analysis' | 'sanityChecks';

export interface GuardrailCheckResult {
  canContinue: boolean;
  warning?: string;
  reason?: string;
  warnings?: GuardrailWarning[];
  exceedances?: GuardrailExceeded[];
}

export class GuardrailsManager {
  private config: GuardrailsConfig;
  private startTime: number;
  private phaseStartTimes: Map<PhaseType, number> = new Map();
  private currentPhase?: PhaseType;
  private currentIteration: number = 0;
  private iterationStartTime?: number;

  constructor(config?: GuardrailsConfig) {
    this.config = config || {};
    this.startTime = Date.now();
  }

  /**
   * Begin tracking a new phase
   */
  public startPhase(phase: PhaseType): void {
    this.currentPhase = phase;
    this.phaseStartTimes.set(phase, Date.now());
  }

  /**
   * End tracking current phase and record metrics
   */
  public endPhase(run: AnalysisRun, phase: PhaseType): void {
    if (!run.phaseMetrics) {
      run.phaseMetrics = {};
    }

    const startTime = this.phaseStartTimes.get(phase);
    if (startTime) {
      const metric: PhaseMetric = {
        startedAt: new Date(startTime).toISOString(),
        completedAt: new Date().toISOString(),
        tokensUsed: this.getPhaseTokens(run, phase),
        estimatedCost: this.getPhaseCost(run, phase)
      };

      if (phase === 'discovery') {
        run.phaseMetrics.discovery = metric;
      } else if (phase === 'analysis') {
        run.phaseMetrics.analysis = metric;
      } else if (phase === 'sanityChecks') {
        run.phaseMetrics.sanityChecks = metric;
      }
    }

    this.currentPhase = undefined;
  }

  /**
   * Start tracking a new iteration
   */
  public startIteration(iteration: number): void {
    this.currentIteration = iteration;
    this.iterationStartTime = Date.now();
  }

  /**
   * End tracking current iteration and record metrics
   */
  public endIteration(run: AnalysisRun, iteration: number): void {
    if (!run.iterationMetrics) {
      run.iterationMetrics = [];
    }

    if (this.iterationStartTime) {
      const metric: IterationMetrics = {
        iterationNumber: iteration,
        startedAt: new Date(this.iterationStartTime).toISOString(),
        completedAt: new Date().toISOString(),
        tokensUsed: run.totalTokensUsed || 0,
        estimatedCost: run.estimatedCost || 0,
        duration: Date.now() - this.iterationStartTime
      };

      run.iterationMetrics.push(metric);
    }

    this.iterationStartTime = undefined;
  }

  /**
   * Check all guardrails and return enforcement status
   */
  public checkGuardrails(run: AnalysisRun): GuardrailCheckResult {
    // If guardrails disabled, allow continuation
    if (this.config.enabled === false) {
      return { canContinue: true };
    }

    const elapsedSeconds = (Date.now() - this.startTime) / 1000;
    const totalTokens = run.totalTokensUsed || 0;
    const totalCost = run.estimatedCost || 0;

    // Get default thresholds
    const warnThresholds = this.config.warnThresholds || {};
    const tokenWarnPercent = warnThresholds.tokenPercentage ?? 80;
    const durationWarnPercent = warnThresholds.durationPercentage ?? 80;
    const costWarnPercent = warnThresholds.costPercentage ?? 80;
    const iterationTokenWarnPercent = warnThresholds.iterationTokenPercentage ?? 80;
    const phaseTokenWarnPercent = warnThresholds.phaseTokenPercentage ?? 80;

    const warnings: GuardrailWarning[] = [];
    const exceedances: GuardrailExceeded[] = [];

    // 1. Check hard limits - STOP
    if (this.config.maxTokensPerRun && totalTokens >= this.config.maxTokensPerRun) {
      exceedances.push({
        type: 'tokens_per_run',
        limit: this.config.maxTokensPerRun,
        actual: totalTokens,
        unit: 'tokens'
      });
      return this.createStopResult(
        `Token limit exceeded: ${totalTokens.toLocaleString()} / ${this.config.maxTokensPerRun.toLocaleString()} tokens`,
        warnings,
        exceedances
      );
    }

    if (this.config.maxDurationSeconds && elapsedSeconds >= this.config.maxDurationSeconds) {
      exceedances.push({
        type: 'duration',
        limit: this.config.maxDurationSeconds,
        actual: Math.round(elapsedSeconds),
        unit: 'seconds'
      });
      return this.createStopResult(
        `Duration limit exceeded: ${Math.round(elapsedSeconds)}s / ${this.config.maxDurationSeconds}s`,
        warnings,
        exceedances
      );
    }

    if (this.config.maxCostDollars && totalCost >= this.config.maxCostDollars) {
      exceedances.push({
        type: 'cost',
        limit: this.config.maxCostDollars,
        actual: Number(totalCost.toFixed(2)),
        unit: 'dollars'
      });
      return this.createStopResult(
        `Cost limit exceeded: $${totalCost.toFixed(2)} / $${this.config.maxCostDollars.toFixed(2)}`,
        warnings,
        exceedances
      );
    }

    // 2. Check phase-specific token limits
    if (this.currentPhase && this.config.maxTokensPerPhase) {
      const phaseLimits = this.config.maxTokensPerPhase;
      let phaseLimit: number | undefined;
      let phaseTokens: number | undefined;

      if (this.currentPhase === 'discovery' && phaseLimits.discovery) {
        phaseLimit = phaseLimits.discovery;
        phaseTokens = this.getPhaseTokens(run, 'discovery');
      } else if (this.currentPhase === 'analysis' && phaseLimits.analysis) {
        phaseLimit = phaseLimits.analysis;
        phaseTokens = this.getPhaseTokens(run, 'analysis');
      } else if (this.currentPhase === 'sanityChecks' && phaseLimits.sanityChecks) {
        phaseLimit = phaseLimits.sanityChecks;
        phaseTokens = this.getPhaseTokens(run, 'sanityChecks');
      }

      if (phaseLimit && phaseTokens !== undefined && phaseTokens >= phaseLimit) {
        if (this.config.stopOnExceeded !== false) {
          exceedances.push({
            type: 'tokens_per_phase',
            phase: this.currentPhase,
            limit: phaseLimit,
            actual: phaseTokens,
            unit: 'tokens'
          });
          return this.createStopResult(
            `Phase token limit exceeded (${this.currentPhase}): ${phaseTokens.toLocaleString()} / ${phaseLimit.toLocaleString()} tokens`,
            warnings,
            exceedances
          );
        }
      }
    }

    // 3. Check per-iteration limits
    if (this.currentIteration > 0 && this.config.maxTokensPerIteration) {
      const iterationTokens = this.getCurrentIterationTokens(run);
      if (iterationTokens >= this.config.maxTokensPerIteration) {
        if (this.config.stopOnExceeded !== false) {
          exceedances.push({
            type: 'tokens_per_iteration',
            iteration: this.currentIteration,
            limit: this.config.maxTokensPerIteration,
            actual: iterationTokens,
            unit: 'tokens'
          });
          return this.createStopResult(
            `Iteration token limit exceeded (iteration ${this.currentIteration}): ${iterationTokens.toLocaleString()} / ${this.config.maxTokensPerIteration.toLocaleString()} tokens`,
            warnings,
            exceedances
          );
        }
      }
    }

    if (this.currentIteration > 0 && this.iterationStartTime && this.config.maxIterationDurationSeconds) {
      const iterationDuration = (Date.now() - this.iterationStartTime) / 1000;
      if (iterationDuration >= this.config.maxIterationDurationSeconds) {
        if (this.config.stopOnExceeded !== false) {
          exceedances.push({
            type: 'iteration_duration',
            iteration: this.currentIteration,
            limit: this.config.maxIterationDurationSeconds,
            actual: Math.round(iterationDuration),
            unit: 'seconds'
          });
          return this.createStopResult(
            `Iteration duration exceeded (iteration ${this.currentIteration}): ${Math.round(iterationDuration)}s / ${this.config.maxIterationDurationSeconds}s`,
            warnings,
            exceedances
          );
        }
      }
    }

    // 4. Check warning thresholds
    if (this.config.maxTokensPerRun) {
      const tokenPercent = (totalTokens / this.config.maxTokensPerRun) * 100;
      if (tokenPercent >= tokenWarnPercent) {
        warnings.push({
          type: 'tokens_per_run',
          percentage: Math.round(tokenPercent),
          message: `Token usage at ${Math.round(tokenPercent)}% (${totalTokens.toLocaleString()} / ${this.config.maxTokensPerRun.toLocaleString()})`
        });
      }
    }

    if (this.config.maxDurationSeconds) {
      const durationPercent = (elapsedSeconds / this.config.maxDurationSeconds) * 100;
      if (durationPercent >= durationWarnPercent) {
        warnings.push({
          type: 'duration',
          percentage: Math.round(durationPercent),
          message: `Duration at ${Math.round(durationPercent)}% (${Math.round(elapsedSeconds)}s / ${this.config.maxDurationSeconds}s)`
        });
      }
    }

    if (this.config.maxCostDollars) {
      const costPercent = (totalCost / this.config.maxCostDollars) * 100;
      if (costPercent >= costWarnPercent) {
        warnings.push({
          type: 'cost',
          percentage: Math.round(costPercent),
          message: `Cost at ${Math.round(costPercent)}% ($${totalCost.toFixed(2)} / $${this.config.maxCostDollars.toFixed(2)})`
        });
      }
    }

    if (this.currentPhase && this.config.maxTokensPerPhase) {
      const phaseLimits = this.config.maxTokensPerPhase;
      let phaseLimit: number | undefined;
      let phaseTokens: number | undefined;

      if (this.currentPhase === 'discovery' && phaseLimits.discovery) {
        phaseLimit = phaseLimits.discovery;
        phaseTokens = this.getPhaseTokens(run, 'discovery');
      } else if (this.currentPhase === 'analysis' && phaseLimits.analysis) {
        phaseLimit = phaseLimits.analysis;
        phaseTokens = this.getPhaseTokens(run, 'analysis');
      } else if (this.currentPhase === 'sanityChecks' && phaseLimits.sanityChecks) {
        phaseLimit = phaseLimits.sanityChecks;
        phaseTokens = this.getPhaseTokens(run, 'sanityChecks');
      }

      if (phaseLimit && phaseTokens !== undefined) {
        const phaseTokenPercent = (phaseTokens / phaseLimit) * 100;
        if (phaseTokenPercent >= phaseTokenWarnPercent) {
          warnings.push({
            type: 'tokens_per_phase',
            phase: this.currentPhase,
            percentage: Math.round(phaseTokenPercent),
            message: `Phase token usage at ${Math.round(phaseTokenPercent)}% (${phaseTokens.toLocaleString()} / ${phaseLimit.toLocaleString()})`
          });
        }
      }
    }

    if (this.currentIteration > 0 && this.config.maxTokensPerIteration) {
      const iterationTokens = this.getCurrentIterationTokens(run);
      const iterationTokenPercent = (iterationTokens / this.config.maxTokensPerIteration) * 100;
      if (iterationTokenPercent >= iterationTokenWarnPercent) {
        warnings.push({
          type: 'tokens_per_iteration',
          iteration: this.currentIteration,
          percentage: Math.round(iterationTokenPercent),
          message: `Iteration token usage at ${Math.round(iterationTokenPercent)}% (${iterationTokens.toLocaleString()} / ${this.config.maxTokensPerIteration.toLocaleString()})`
        });
      }
    }

    return {
      canContinue: true,
      warnings: warnings.length > 0 ? warnings : undefined,
      exceedances: exceedances.length > 0 ? exceedances : undefined
    };
  }

  /**
   * Record guardrail enforcement in the run
   */
  public recordEnforcement(run: AnalysisRun, result: GuardrailCheckResult): void {
    if (!result.warnings && !result.exceedances && result.canContinue) {
      return; // Nothing to record
    }

    if (!run.guardrailsEnforced) {
      run.guardrailsEnforced = {
        exceedances: [],
        warnings: []
      };
    }

    if (result.exceedances) {
      run.guardrailsEnforced.exceedances.push(...result.exceedances);
      run.guardrailsEnforced.stoppedDueToGuardrails = true;
      run.guardrailsEnforced.stoppedReason = result.reason;
    }

    if (result.warnings) {
      run.guardrailsEnforced.warnings.push(...result.warnings);
    }
  }

  /**
   * Get tokens used in a specific phase
   */
  private getPhaseTokens(run: AnalysisRun, phase: PhaseType): number {
    if (!run.phaseMetrics) return 0;

    if (phase === 'discovery') {
      return run.phaseMetrics.discovery?.tokensUsed || 0;
    } else if (phase === 'analysis') {
      return run.phaseMetrics.analysis?.tokensUsed || 0;
    } else if (phase === 'sanityChecks') {
      return run.phaseMetrics.sanityChecks?.tokensUsed || 0;
    }

    return 0;
  }

  /**
   * Get estimated cost for a specific phase
   */
  private getPhaseCost(run: AnalysisRun, phase: PhaseType): number {
    if (!run.phaseMetrics) return 0;

    if (phase === 'discovery') {
      return run.phaseMetrics.discovery?.estimatedCost || 0;
    } else if (phase === 'analysis') {
      return run.phaseMetrics.analysis?.estimatedCost || 0;
    } else if (phase === 'sanityChecks') {
      return run.phaseMetrics.sanityChecks?.estimatedCost || 0;
    }

    return 0;
  }

  /**
   * Get tokens used in current iteration
   */
  private getCurrentIterationTokens(run: AnalysisRun): number {
    if (!run.iterationMetrics || run.iterationMetrics.length === 0) {
      return 0;
    }

    // Return tokens for current iteration only (latest entry)
    const currentMetric = run.iterationMetrics[run.iterationMetrics.length - 1];
    return currentMetric.tokensUsed || 0;
  }

  /**
   * Create a stop result with warnings and exceedances
   */
  private createStopResult(
    reason: string,
    warnings: GuardrailWarning[],
    exceedances: GuardrailExceeded[]
  ): GuardrailCheckResult {
    return {
      canContinue: false,
      reason,
      warnings: warnings.length > 0 ? warnings : undefined,
      exceedances: exceedances.length > 0 ? exceedances : undefined
    };
  }

  /**
   * Get current elapsed time in seconds
   */
  public getElapsedSeconds(): number {
    return (Date.now() - this.startTime) / 1000;
  }

  /**
   * Get current phase token budget (remaining tokens)
   */
  public getPhaseTokenBudgetRemaining(phase: PhaseType): number | undefined {
    if (!this.config.maxTokensPerPhase) return undefined;

    const limit = this.config.maxTokensPerPhase[phase];
    if (!limit) return undefined;

    // This would need access to the current run to calculate remaining
    // For now, just return the limit
    return limit;
  }
}
