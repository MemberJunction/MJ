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

import type { ValidationStrategy } from './pipeline-spec';
import type { EvaluationProtocolDraft, GuardField } from './evaluation-protocol-rules';
import type { CensoringRule, DecisionSpec, RowFilter } from './prediction-unit';
import type { UnitDraft } from './protocol-rows';
import type { TaskType } from './task-type';

/**
 * Explicit resource budget for an experiment session — the bounded-autonomy
 * guardrail (plan §8.4). Enforced by Record Set Processing's budget gate within
 * each wave and re-checked by the orchestrator between waves.
 */
export interface Budget {
  /** Max total compute cost the session may spend, in USD. */
  MaxComputeCost?: number;
  /**
   * Max total compute seconds the session's training attempts may spend, failed attempts included. Set by a caller's
   * budget override or by the bound Evaluation Protocol's `budgets.maxComputeSeconds` (the smaller wins); a plan's
   * `ProposedBudget` does not carry it.
   */
  MaxComputeSeconds?: number;
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
    /**
     * The Goal Analyst's Prediction Unit proposal: grain, decision date, label window and censoring (PR 5, A3). The
     * Draft Prediction Unit Action validates it into {@link ModelingPlanSpec.UnitDraft}; the proposal itself builds nothing.
     */
    Unit?: UnitProposal;
    /**
     * A proposal of non-guard Evaluation Protocol members (`seed`, `primaryScore`, …), as written by a prompt and not yet
     * validated: the Draft Evaluation Protocol Action refuses any guard member and validates the rest into
     * {@link ModelingPlanSpec.ProtocolDraft}.
     */
    Protocol?: Record<string, string | number | boolean | object | null>;
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
  ValidationStrategy: ValidationStrategy;
  /** Proposed resource budget for the experiment session. */
  ProposedBudget: { MaxComputeCost?: number; MaxRuns?: number; MaxWallclockMinutes?: number };
  /**
   * The validated Prediction Unit draft (PR 5, A3; D5-25): written only by the control path from the Draft Prediction
   * Unit Action's output. No unit row exists before approval; the Pipeline Builder saves unit version 1 from it.
   */
  UnitDraft?: UnitDraft;
  /**
   * The validated non-guard Evaluation Protocol members (PR 5, A3; D5-25): written only by the control path from the
   * Draft Evaluation Protocol Action's output. The builder merges them over the default protocol; guard members always
   * come from the template.
   */
  ProtocolDraft?: ProtocolDraftMembers;
  /**
   * What the drafts were made from (SHA-256 of their inputs), written only by the control path with them: a draft whose
   * inputs changed since is drafted again before the plan is presented. Not plan content (not in the plan hash).
   */
  DraftInputs?: { readonly Unit: string; readonly Protocol: string | null };
  /** User approval gate — execution does not begin until this is true. */
  Approved?: boolean;
  /** Execution-phase leaderboard — one entry per Experiment Session Iteration. */
  Leaderboard?: Array<{ IterationID: string; Metric: number; ModelID?: string }>;
}

/** The Evaluation Protocol members a draft may set: every member except the guard fields (a `Pick` of PR 3's draft). */
export type ProtocolDraftMembers = Partial<Pick<EvaluationProtocolDraft, Exclude<keyof EvaluationProtocolDraft, GuardField>>>;

/**
 * The Goal Analyst's Prediction Unit proposal (PR 5, A3). Every member is optional; an absent one takes the target's
 * value or the default the Draft Prediction Unit Action documents. A proposal with a label window must name its
 * censoring rule (`censoring-required`).
 */
export interface UnitProposal {
  /** The entity one training row is a row of; default `TargetDefinition.EntityName`. */
  GrainEntity?: string;
  /** The column the outcome is read from; default `TargetDefinition.TargetVariable`. */
  LabelColumn?: string;
  /** The date column each row's decision date is read from; absent or null = one fixed decision date (today). */
  DecisionDateColumn?: string | null;
  /** Days added to {@link DecisionDateColumn}; absent = 0. */
  DecisionDateOffsetDays?: number;
  /** Days after the decision date the outcome is observed over; default 1. */
  LabelWindowDays?: number;
  /** Days between the decision date and the window's start; default 0. */
  LabelGapDays?: number;
  /** How rows whose window has not closed are handled; required with an explicit label window. */
  Censoring?: CensoringRule | null;
  /** The field rows are grouped by (a person across years); default none. */
  GroupKey?: string | null;
  /** Conditions the unit's rows must meet; default none. */
  Filter?: RowFilter[];
  /** The task; default from the problem type and the development rows' labels. */
  TaskType?: TaskType;
  /** The decision the prediction informs; default a monthly analyst review. */
  DecisionSpec?: DecisionSpec;
}

/** The allowed kinds for candidate features proposed by the Data Scout. */
export type CandidateFeatureKind = 'numeric' | 'categorical' | 'embedding' | 'llm-derived' | 'decision-derived';

/** Structured warning emitted when a candidate feature cannot be mapped to a training pipeline step. */
export interface FeatureStepWarning {
  /** The name of the candidate feature that was dropped or could not be mapped. */
  FeatureName: string;
  /** The kind of feature ('numeric' | 'categorical' | 'embedding' | 'llm-derived' | 'decision-derived'). */
  Kind: CandidateFeatureKind | (string & {});
  /** Explanatory reason why the feature was dropped or requires upstream handling. */
  Reason: string;
}
