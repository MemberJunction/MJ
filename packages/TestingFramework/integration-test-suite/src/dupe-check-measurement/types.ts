/**
 * @fileoverview Data models and types for the duplicate entry check measurement rig,
 * synthetic corpus generation, and report metrics.
 *
 * @module @memberjunction/integration-test-suite
 */

import type { ConfidenceInterval } from '@memberjunction/testing-engine';

/** A single record in the measurement corpus. */
export interface CorpusRecord {
    /** Unique corpus point identifier (e.g. UUID). */
    Id: string;
    /** The field values entered for this record. */
    Values: Record<string, string>;
}

/** Label identifying a synthetic rewrite of an existing source record. */
export interface DuplicateCorpusLabel {
    Id: string;
    Label: 'duplicate';
    SourceRecordId: string;
}

/** Label identifying a plausibly similar but distinct new entity (hard negative). */
export interface NewCorpusLabel {
    Id: string;
    Label: 'new';
    NearRecordId: string;
}

/** Union of valid corpus label types. */
export type CorpusLabel = DuplicateCorpusLabel | NewCorpusLabel;

/** Metadata recorded in generated-from.json describing the corpus provenance. */
export interface GeneratedFromMetadata {
    Entity: string;
    Fields: string[];
    Model: string;
    Seed: number;
    Counts: {
        Duplicates: number;
        New: number;
    };
    Timestamp: string;
}

/** Pairwise observation between an entered record and one retrieved candidate. */
export interface CandidatePairObservation {
    RecordId: string;
    CandidateId: string;
    /** True if this candidate is the actual true duplicate of the entered record. */
    IsDuplicatePair: boolean;
    /** Vector index similarity score in [0, 1]. */
    VectorScore: number;
    /** Whether candidate was present in the top-K query results. */
    InTopK: boolean;
    /** Whether candidate score passed the PotentialMatchThreshold. */
    PassedThreshold: boolean;
    /** Threshold arm: flagged when VectorScore >= PotentialMatchThreshold. */
    ThresholdFlagged: boolean;
    /**
     * Decision arm: the model's own probability in [0, 1], before calibration (the provider's
     * RawProbability), which the calibration section fits on. Null when there was no answer.
     */
    DecisionProbability: number | null;
    /**
     * Decision arm: flagged as production flags it, when banded 'Uncertain': IsPlausible on the
     * calibrated probability, where a missing one flags. False when the decision failed.
     */
    DecisionFlagged: boolean;
    /** Answering model name for the decision call. */
    DecisionModel?: string;
    /** Prompt arm: recommendation from PromptReasoningProvider. */
    PromptRecommendation: 'Merge' | 'NotDuplicate' | 'Uncertain' | null;
    /** Prompt arm: flagged when recommendation is 'Merge' or 'Uncertain'. */
    PromptFlagged: boolean;
}

/** The results of running one entry check for a corpus record across all arms. */
export interface RecordCheckObservation {
    Rep: number;
    RecordId: string;
    Label: CorpusLabel;
    RetrievalLatencyMs: number;
    /** All readable candidate pairs observed for this record. */
    Candidates: CandidatePairObservation[];
    /** Threshold arm execution details, if tracked. */
    ThresholdLatencyMs?: number;
    /** Decision arm execution details, when run. */
    DecisionResult?: {
        LatencyMs: number;
        Model: string;
        PromptRunId: string | null;
        CostUSD: number | null;
    };
    /** Prompt arm execution details, when run. */
    PromptResult?: {
        LatencyMs: number;
        PromptRunId: string | null;
        CostUSD: number | null;
    };
}

/** Summary retrieval metrics across all duplicate records. */
export interface RetrievalMetrics {
    TotalDuplicates: number;
    SourcesInTopK: number;
    SourcesInTopKRate: number;
    SourcesAfterThreshold: number;
    SourcesAfterThresholdRate: number;
    SourcesMissed: number;
    SourcesMissedRate: number;
}

/** Performance metrics for a single reasoning arm. */
export interface ArmPerformanceMetrics {
    ArmName: 'threshold' | 'decision' | 'decision · production' | 'prompt' | 'prompt · production' | string;
    Precision: number;
    PrecisionCI: ConfidenceInterval | null;
    Recall: number;
    RecallCI: ConfidenceInterval | null;
    F1: number;
    F1CI: ConfidenceInterval | null;
    FalseFlagRateOnNew: number;
    FlagsPerCheck: number;
}

/** One point in the vector score threshold sweep (0.60 to 0.95). */
export interface ThresholdSweepRow {
    Threshold: number;
    Precision: number;
    Recall: number;
    F1: number;
    FalseFlagRateOnNew: number;
    FlagsPerCheck: number;
}

/** Model probability calibration metrics (raw vs 5-fold OOF Platt). */
export interface DecisionModelCalibration {
    ModelName: string;
    TotalCandidates: number;
    RawAuc: number | null;
    CalibratedAuc: number | null;
    RawBrier: number | null;
    CalibratedBrier: number | null;
    RawEce: number | null;
    CalibratedEce: number | null;
    PlattA: number;
    PlattB: number;
}

/** One point in the Uncertain band threshold sweep (0.10 to 0.90). */
export interface DecisionBandSweepRow {
    Threshold: number;
    RawPrecision: number;
    RawRecall: number;
    RawFalseFlagRateOnNew: number;
    RawShareCandidatesFlagged: number;
    CalibratedPrecision: number;
    CalibratedRecall: number;
    CalibratedFalseFlagRateOnNew: number;
    CalibratedShareCandidatesFlagged: number;
}

/** Latency percentiles (p50 and p95) per arm and for the entry check path. */
export interface LatencySummary {
    RetrievalP50: number | null;
    RetrievalP95: number | null;
    ThresholdP50: number | null;
    ThresholdP95: number | null;
    DecisionP50: number | null;
    DecisionP95: number | null;
    PromptP50: number | null;
    PromptP95: number | null;
    EntryCheckP50: number | null;
    EntryCheckP95: number | null;
    EntryCheckBudgetMs: number;
    EntryCheckWithinBudgetRate: number;
}

/** Arm cost summary per 1,000 checks. */
export interface ArmCostSummary {
    ArmName: 'threshold' | 'decision' | 'prompt';
    TotalCostUSD: number;
    TotalChecks: number;
    CostPer1000ChecksUSD: number;
}

/** Repeatability metrics across repetitions (rep 1 vs rep 2). */
export interface RepeatabilitySummary {
    DecisionProbabilityMeanAbsDiff: number | null;
    DecisionVerdictAgreementRate: number | null;
    PromptRecommendationAgreementRate: number | null;
}

/** Complete measurement report structure written to report.json. */
export interface DupeMeasurementReport {
    EntityName: string;
    CorpusPath: string;
    DuplicatesCount: number;
    NewCount: number;
    Reps: number;
    TopK: number;
    DecisionPrompt: string;
    Retrieval: RetrievalMetrics;
    ArmMetrics: ArmPerformanceMetrics[];
    ThresholdSweep: ThresholdSweepRow[];
    DecisionCalibration: DecisionModelCalibration[];
    DecisionBandSweep: DecisionBandSweepRow[];
    Latency: LatencySummary;
    Costs: ArmCostSummary[];
    Repeatability?: RepeatabilitySummary;
    Notes: string[];
}
