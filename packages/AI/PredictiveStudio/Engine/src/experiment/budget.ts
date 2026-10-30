/**
 * @module experiment/budget
 *
 * The bounds an experiment session runs under and the failed-attempt error that carries what a failed training spent.
 * A session over a pipeline bound to an Evaluation Protocol is held to the protocol's trainer budgets as well as its
 * plan's: at most `maxCandidates` attempts and `maxComputeSeconds` compute seconds in total, every attempt counted
 * whether it failed or completed. The plan's `MaxComputeCost` stays a separate bound in USD.
 */
import type { Budget, Budgets } from '@memberjunction/predictive-studio-core';
import type { MJMLTrainingPipelineEntity } from '@memberjunction/core-entities';
import { ProtocolSearchGuard } from '../protocol/search-guard';
import type { IEvaluationProtocolStore } from '../training/evaluation-protocol-store';
import { TrainingRefusedError } from '../training/training-refusal';

/**
 * A training attempt that failed after its run row existed: the compute the run recorded (seconds and USD) still counts
 * against the session's budget. The engine's error is kept as `cause`.
 */
export class TrainingAttemptFailedError extends Error {
  /**
   * @param message why the attempt failed (the engine's message)
   * @param ComputeSeconds the compute seconds the failed attempt's run recorded
   * @param ComputeCost the USD the failed attempt's run recorded
   * @param cause the engine's error
   */
  constructor(message: string, public readonly ComputeSeconds: number, public readonly ComputeCost: number, cause?: Error) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'TrainingAttemptFailedError';
  }
}

/** Experiment-session budget arithmetic (static members on one owner). */
export class ExperimentBudget {
  /** Each session iteration trains one candidate, so a session asks the protocol guard for a one-candidate search. */
  private static readonly CANDIDATES_PER_ITERATION = 1;

  /**
   * The session budget: the plan's (or override's) bounds, tightened by the protocol's trainer budgets when the session
   * runs under a protocol. Attempts are capped by the smaller of `MaxRuns` and `maxCandidates`, and compute seconds by
   * the smaller of `MaxComputeSeconds` and `maxComputeSeconds`; the USD `MaxComputeCost` and the wall-clock bound are
   * kept as they are.
   *
   * @param planBudget the plan's `ProposedBudget` or the caller's override
   * @param protocolBudgets the bound protocol's trainer budgets, or null when the session runs under none
   */
  public static EffectiveBudget(planBudget: Budget, protocolBudgets: Budgets | null): Budget {
    if (protocolBudgets === null) return planBudget;
    return {
      ...planBudget,
      MaxRuns: ExperimentBudget.minDefined(planBudget.MaxRuns, protocolBudgets.maxCandidates),
      MaxComputeSeconds: ExperimentBudget.minDefined(planBudget.MaxComputeSeconds, protocolBudgets.maxComputeSeconds),
    };
  }

  /**
   * Compute seconds left before the hard stop, or null when the budget has no seconds bound.
   *
   * @param budget the session budget
   * @param spentSeconds the compute seconds every attempt so far spent
   */
  public static RemainingComputeSeconds(budget: Budget, spentSeconds: number): number | null {
    return budget.MaxComputeSeconds === undefined ? null : Math.max(0, budget.MaxComputeSeconds - spentSeconds);
  }

  /**
   * The trainer budgets of the protocol a pipeline is bound to: what a session over that pipeline passes as
   * `ExperimentRunOptions.protocolBudgets`. The protocol is resolved by the same guard a training search uses, so a
   * pipeline with no protocol (or a missing protocol row) is refused before any session or iteration row exists.
   *
   * @param pipeline the pipeline the session trains
   * @param store where protocol rows are read
   * @throws TrainingRefusedError (`protocol-required`, `protocol-invalid`)
   */
  public static async ProtocolBudgetsFor(
    pipeline: Pick<MJMLTrainingPipelineEntity, 'ID' | 'EvaluationProtocolID'>,
    store: IEvaluationProtocolStore,
  ): Promise<Budgets> {
    const requirement = await ProtocolSearchGuard.RequireProtocolForSearch(store, pipeline, ExperimentBudget.CANDIDATES_PER_ITERATION);
    if (requirement.Ok === false) throw new TrainingRefusedError({ stage: 'pipeline', reason: requirement.Refusal });
    return requirement.Loaded.Protocol.budgets;
  }

  /** The smaller of an optional bound and a required one. */
  private static minDefined(a: number | undefined, b: number): number {
    return a === undefined ? b : Math.min(a, b);
  }
}
