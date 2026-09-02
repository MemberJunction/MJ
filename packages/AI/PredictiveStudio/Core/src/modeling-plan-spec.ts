import type { ProblemType } from './sidecar-contract';
/**
 * @module modeling-plan-spec
 *
 * The strongly-typed payload the **Model Development Agent** builds and refines
 * (plan §9.2), analogous to Agent Manager's `AgentSpec`. The Loop orchestrator's
 * sub-agents each write a guarded slice of this spec; the user approves it at the
 * plan gate; the deterministic `ExperimentOrchestrator` then executes it.
 *
 * Also defines the {@link Budget} primitive (bounded autonomy, plan §8.4) and the
 * {@link LeaderboardEntry} shape used to rank experiment iterations.
 */

import type { CandidateGateReport, DatasetStatistics } from './statistics-spec';
import type { ArchitectureSpec, ComponentGraphNode } from './component-graph-spec';

/**
 * Explicit resource budget for an experiment session — the bounded-autonomy
 * guardrail (plan §8.4). Enforced by Record Set Processing's budget gate within
 * each wave and re-checked by the orchestrator between waves.
 */
export interface Budget {
  /** Max total compute cost the session may spend. */
  MaxComputeCost?: number;
  /** Max number of training runs/iterations the session may execute. */
  MaxRuns?: number;
  /** Max wall-clock minutes the session may run. */
  MaxWallclockMinutes?: number;
}

/**
 * One entry on the experiment leaderboard — a single iteration's normalized
 * score (plan §9.2). One entry per `MJ: Experiment Session Iteration`.
 */
export interface LeaderboardEntry {
  /** The iteration this entry scores (`MJ: Experiment Session Iterations` id). */
  IterationID: string;
  /** The normalized leaderboard metric value (the Experiment's `TargetMetric`). */
  Metric: number;
  /** The trained model this iteration produced, if any (pruned/failed runs have none). */
  ModelID?: string;
}

/**
 * The strongly-typed modeling plan the Model Development Agent collaborates with
 * the user to build, then executes. Refined incrementally via
 * `AgentPayloadChangeRequest` (`updateElements`/`replaceElements`) and validated
 * before execution. Defined verbatim per plan §9.2.
 */
export interface ModelingPlanSpec {
  /** Business objective, refined from the user's initial goal. */
  Goal: string;
  /** Precise definition of what is being predicted. */
  TargetDefinition: {
    /** Training-unit entity (e.g. "Members"). */
    EntityName: string;
    /** Label expression/column. */
    TargetVariable: string;
    /** What shape of question this is — see the Core `ProblemType` union. */
    ProblemType: ProblemType;
    /** The deterministic success metric driving the search. */
    SuccessMetric: 'AUC' | 'F1' | 'Accuracy' | 'RMSE' | string;
    /** Optional point-in-time assembly strategy. */
    AsOfStrategy?: { Mode: 'none' | 'column' | 'offset'; Column?: string; OffsetDays?: number };
  };
  /** Candidate feed-in sources proposed by the Data Scout, each with rationale. */
  CandidateSources: Array<{ Kind: 'Entity' | 'Query' | 'ExternalEntity' | 'VectorSet' | 'FeaturePipeline'; Ref: string; Why: string }>;
  /** Candidate features proposed by the Data Scout, each with rationale. */
  CandidateFeatures: Array<{ Name: string; SourceRef: string; Kind: 'numeric' | 'categorical' | 'embedding' | 'llm-derived'; Why: string }>;
  /** Leakage risks identified by the Data Scout and the chosen action per field. */
  LeakageNotes: Array<{ Field: string; Risk: string; Action: 'exclude' | 'allow' }>;
  /** Ranked experiments proposed by the Experiment Designer (feature combos × algorithms × hyperparameters). */
  ProposedExperiments: Array<{
    Label: string;
    AlgorithmName: string;
    FeatureSet: string[];
    Hyperparameters?: Record<string, unknown>;
    Rationale: string;
    Priority: number;
    /**
     * For a `compose` architecture (additive): the composition this experiment trains, instead of
     * the single leaf `AlgorithmName` names. `AlgorithmName` still identifies the ROOT so every
     * existing read path keeps working unchanged.
     */
    ComponentGraph?: ComponentGraphNode;
  }>;
  /** Validation strategy for the search. */
  ValidationStrategy: { Strategy: 'train_test_split' | 'kfold' | 'holdout'; TestSize?: number; K?: number; LockedHoldoutFraction: number };
  /** Proposed resource budget for the experiment session. */
  ProposedBudget: { MaxComputeCost?: number; MaxRuns?: number; MaxWallclockMinutes?: number };
  /**
   * The **architecture decision** (additive) — commit to one model family, defer across candidates,
   * reify under a generalized parent, or compose a custom model from slots. Written by the Architect
   * sub-agent from {@link ModelingPlanSpec.Statistics} and {@link ModelingPlanSpec.GateReports}, and
   * read by the Experiment Designer, which proposes experiments WITHIN the decided architecture
   * rather than re-picking an algorithm from scratch.
   */
  Architecture?: ArchitectureSpec;
  /**
   * What the **statistics pre-pass** measured about the training partition (additive). Written by
   * the `Statistics Pass` code sub-agent before the architecture is chosen, so the decision rests on
   * evidence rather than on the goal statement alone — and so it stays auditable afterwards: the
   * numbers the agent saw are persisted next to the choice it made (this whole spec lands on
   * `MJ: Experiment Sessions.PlanSpec`). Absent when the pass did not run or could not complete.
   */
  Statistics?: DatasetStatistics;
  /**
   * Per-candidate admissibility, evaluated from each candidate component type's INHERITED
   * `StatisticalGate` rows against {@link ModelingPlanSpec.Statistics} (additive). A candidate with
   * `Admissible: false` should not be proposed; one carrying an `Unevaluated` gate should be
   * proposed only with that caveat stated.
   */
  GateReports?: CandidateGateReport[];
  /** User approval gate — execution does not begin until this is true. */
  Approved?: boolean;
  /** Execution-phase leaderboard — one entry per Experiment Session Iteration. */
  Leaderboard?: Array<{ IterationID: string; Metric: number; ModelID?: string }>;
}
