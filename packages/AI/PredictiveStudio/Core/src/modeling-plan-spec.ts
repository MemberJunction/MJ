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
  /** Optional display name for the plan/prediction. */
  Name?: string;
  /** Business objective, refined from the user's initial goal. */
  Goal: string;
  /** Precise definition of what is being predicted. */
  TargetDefinition: {
    /** Training-unit entity (e.g. "Members"). */
    EntityName: string;
    /** Label expression/column. */
    TargetVariable: string;
    /** Classification or regression. */
    ProblemType: 'classification' | 'regression';
    /** The deterministic success metric driving the search. */
    SuccessMetric: 'AUC' | 'F1' | 'Accuracy' | 'RMSE' | string;
    /** Optional point-in-time assembly strategy. */
    AsOfStrategy?: { Mode: 'none' | 'column' | 'offset'; Column?: string; OffsetDays?: number };
  };
  /** Candidate feed-in sources proposed by the Data Scout, each with rationale. */
  CandidateSources: Array<{ Kind: 'Entity' | 'Query' | 'ExternalEntity' | 'VectorSet' | 'FeaturePipeline'; Ref: string; Why: string }>;
  /** Candidate features proposed by the Data Scout, each with rationale. */
  CandidateFeatures: Array<{ Name: string; SourceRef: string; Kind: CandidateFeatureKind; Why: string }>;
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
  }>;
  /** Validation strategy for the search. */
  ValidationStrategy: { Strategy: 'train_test_split' | 'kfold' | 'holdout'; TestSize?: number; K?: number; LockedHoldoutFraction: number };
  /** Proposed resource budget for the experiment session. */
  ProposedBudget: { MaxComputeCost?: number; MaxRuns?: number; MaxWallclockMinutes?: number };
  /** User approval gate — execution does not begin until this is true. */
  Approved?: boolean;
  /** Execution-phase leaderboard — one entry per Experiment Session Iteration. */
  Leaderboard?: Array<{ IterationID: string; Metric: number; ModelID?: string }>;
}

/** The allowed kinds for candidate features proposed by the Data Scout. */
export type CandidateFeatureKind = 'numeric' | 'categorical' | 'embedding' | 'llm-derived';

/** Structured warning emitted when a candidate feature cannot be mapped to a training pipeline step. */
export interface FeatureStepWarning {
  /** The name of the candidate feature that was dropped or could not be mapped. */
  FeatureName: string;
  /** The kind of feature ('numeric' | 'categorical' | 'embedding' | 'llm-derived'). */
  Kind: CandidateFeatureKind | (string & {});
  /** Explanatory reason why the feature was dropped or requires upstream handling. */
  Reason: string;
}
