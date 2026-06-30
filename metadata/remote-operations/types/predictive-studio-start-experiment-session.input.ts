/**
 * Explicit resource budget for an experiment session — the bounded-autonomy
 * guardrail. Mirrors `Budget` from `@memberjunction/predictive-studio-core`.
 */
export interface PredictiveStudioBudget {
    /** Max total compute cost the session may spend. */
    MaxComputeCost?: number;
    /** Max number of training runs/iterations the session may execute. */
    MaxRuns?: number;
    /** Max wall-clock minutes the session may run. */
    MaxWallclockMinutes?: number;
}

/**
 * The strongly-typed modeling plan to execute. Mirrors `ModelingPlanSpec` from
 * `@memberjunction/predictive-studio-core` — the deterministic orchestrator runs
 * its `ProposedExperiments` as waves. Must be approved (`Approved=true`) — execution
 * is gated on user approval.
 */
export interface PredictiveStudioModelingPlanSpec {
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
        /** The deterministic success metric driving the search (e.g. AUC / F1 / Accuracy / RMSE). */
        SuccessMetric: string;
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
    }>;
    /** Validation strategy for the search. */
    ValidationStrategy: { Strategy: 'train_test_split' | 'kfold' | 'holdout'; TestSize?: number; K?: number; LockedHoldoutFraction: number };
    /** Proposed resource budget for the experiment session. */
    ProposedBudget: PredictiveStudioBudget;
    /** User approval gate — execution does not begin until this is true. */
    Approved?: boolean;
}

/** Input for `PredictiveStudio.StartExperimentSession`. */
export interface PredictiveStudioStartExperimentSessionInput {
    /** Optional id of an existing `MJ: Experiments` definition to attach the session to. When omitted, a new durable Experiment is created from the plan. */
    experimentId?: string;
    /** The approved modeling plan to execute. Must have `Approved=true`. */
    planSpec: PredictiveStudioModelingPlanSpec;
    /** Optional budget override; when omitted the plan's `ProposedBudget` is used. */
    budget?: PredictiveStudioBudget;
    /** Optional human-readable session name (defaults to one derived from the plan goal). */
    sessionName?: string;
}
