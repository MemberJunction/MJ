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
 * A training attempt that failed after spending compute: the trainer stopped (the run's stored `trainer-failed`
 * refusal), and the seconds it ran still count against the session's compute budget.
 */
export class TrainingAttemptFailedError extends Error {
  /**
   * @param message why the attempt failed
   * @param ComputeSeconds the compute seconds the failed attempt spent
   */
  constructor(message: string, public readonly ComputeSeconds: number) {
    super(message);
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
