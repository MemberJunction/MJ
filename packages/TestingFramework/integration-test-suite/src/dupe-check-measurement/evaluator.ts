/**
 * @fileoverview Pure evaluation engine for duplicate detection measurement.
 *
 * Implements:
 * - Retrieval miss accounting
 * - Pairwise precision, recall, F1 with clustered bootstrap confidence intervals
 * - Vector score threshold sweep (0.60 to 0.95)
 * - Decision probability calibration (ROC AUC, Brier, ECE, Platt A/B), scored out of fold
 * - Band sweep (0.10 to 0.90) for raw and out-of-fold calibrated probabilities
 * - Failed calls and missing answers per arm
 * - Latency p50/p95 against the 1500ms budget
 * - Cost per 1,000 checks
 * - Repeatability across repetitions
 * - Report rendering and text sanitization assertion
 *
 * @module @memberjunction/integration-test-suite
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
    AssertOutputOutsideRepo,
    BrierScore,
    CalibrationBins,
    ConfidenceInterval,
    CreateSeededRandom,
    DECISION_EVAL_CALIBRATION_FOLDS,
    DECISION_EVAL_ECE_BINS,
    DECISION_EVAL_SEED,
    FitPlatt,
    LabelledProbability,
    OutOfFoldPlatt,
    Quantile,
    RocAuc,
} from '@memberjunction/testing-engine';
import { FindRecordText } from './record-text';
import type {
    ArmCallResult,
    ArmCallSummary,
    ArmCostSummary,
    ArmPerformanceMetrics,
    CandidatePairObservation,
    CorpusRecord,
    DecisionBandSweepRow,
    DecisionModelCalibration,
    DupeMeasurementReport,
    LatencySummary,
    RecordCheckObservation,
    RepeatabilitySummary,
    RetrievalMetrics,
    ThresholdSweepRow,
} from './types';

/** Duplicate entry check budget in milliseconds. */
export const DUPLICATE_ENTRY_CHECK_BUDGET_MS = 1500;

/** Default number of clustered bootstrap resamples. */
export const DEFAULT_BOOTSTRAP_RESAMPLES = 1000;

/** Default thresholds for vector sweep. */
export const VECTOR_SWEEP_THRESHOLDS = [0.60, 0.65, 0.70, 0.75, 0.80, 0.85, 0.90, 0.95] as const;

/** Default thresholds for decision band sweep. */
export const BAND_SWEEP_THRESHOLDS = [0.10, 0.20, 0.30, 0.40, 0.50, 0.60, 0.70, 0.80, 0.90] as const;

/**
 * Computes retrieval metrics across all duplicate records.
 * A duplicate record whose source was not retrieved in top-K or above the threshold
 * is accounted for as a missed retrieval.
 */
export function ComputeRetrievalMetrics(checks: readonly RecordCheckObservation[]): RetrievalMetrics {
    // Only rep 1 (or unique records) for corpus retrieval characteristics
    const rep1Checks = checks.filter(c => c.Rep === 1);
    const dupeChecks = rep1Checks.filter(c => c.Label.Label === 'duplicate');
    const totalDuplicates = dupeChecks.length;

    if (totalDuplicates === 0) {
        return {
            TotalDuplicates: 0,
            SourcesInTopK: 0,
            SourcesInTopKRate: 0,
            SourcesAfterThreshold: 0,
            SourcesAfterThresholdRate: 0,
            SourcesMissed: 0,
            SourcesMissedRate: 0,
        };
    }

    let sourcesInTopK = 0;
    let sourcesAfterThreshold = 0;

    for (const check of dupeChecks) {
        const sourcePair = check.Candidates.find(c => c.IsDuplicatePair);
        if (sourcePair && sourcePair.InTopK) {
            sourcesInTopK++;
            if (sourcePair.PassedThreshold) {
                sourcesAfterThreshold++;
            }
        }
    }

    const sourcesMissed = totalDuplicates - sourcesAfterThreshold;

    return {
        TotalDuplicates: totalDuplicates,
        SourcesInTopK: sourcesInTopK,
        SourcesInTopKRate: sourcesInTopK / totalDuplicates,
        SourcesAfterThreshold: sourcesAfterThreshold,
        SourcesAfterThresholdRate: sourcesAfterThreshold / totalDuplicates,
        SourcesMissed: sourcesMissed,
        SourcesMissedRate: sourcesMissed / totalDuplicates,
    };
}

/**
 * Whether production's entry check flags a candidate at a decision band. A failed decision flags
 * nothing. A successful one flags each candidate it gave no answer for (a missing probability fails
 * toward inclusion, as `DecisionReasoningProvider.IsPlausible(null)` does) and each answered one at
 * or above the band.
 *
 * @param check the check the candidate belongs to; its DecisionResult says whether the call succeeded
 * @param probability the candidate's probability, or null when the decision gave none
 * @param threshold the band
 */
export function DecisionFlagsAt(check: RecordCheckObservation, probability: number | null, threshold: number): boolean {
    if (!check.DecisionResult?.Success) {
        return false;
    }
    return probability === null || probability >= threshold;
}

/** Whether an arm flags one candidate. `decisionThreshold`, when given, bands the decision arms' probability. */
function armFlags(
    check: RecordCheckObservation,
    candidate: CandidatePairObservation,
    arm: string,
    decisionThreshold?: number
): boolean {
    switch (arm) {
        case 'threshold':
            return candidate.ThresholdFlagged;
        case 'decision':
            return decisionThreshold != null
                ? DecisionFlagsAt(check, candidate.DecisionProbability, decisionThreshold)
                : candidate.DecisionFlagged;
        case 'decision · production':
            return candidate.PassedThreshold && armFlags(check, candidate, 'decision', decisionThreshold);
        case 'prompt':
            return candidate.PromptFlagged;
        case 'prompt · production':
            return candidate.PassedThreshold && candidate.PromptFlagged;
        default:
            return false;
    }
}

/**
 * Evaluates pairwise performance for an arm on a subset of record checks.
 * Includes retrieval misses as false negatives: total actual positive pairs equals
 * the total number of duplicate records evaluated.
 */
export function EvaluateArmConfusion(
    checks: readonly RecordCheckObservation[],
    arm: 'threshold' | 'decision' | 'decision · production' | 'prompt' | 'prompt · production' | string,
    decisionThreshold?: number
): { TP: number; FP: number; FN: number; TotalDuplicates: number; TotalNew: number; NewFlaggedCount: number; TotalFlaggedPairs: number } {
    let tp = 0;
    let fp = 0;
    let totalDuplicates = 0;
    let totalNew = 0;
    let newFlaggedCount = 0;
    let totalFlaggedPairs = 0;

    for (const check of checks) {
        const isDupe = check.Label.Label === 'duplicate';
        if (isDupe) {
            totalDuplicates++;
        } else {
            totalNew++;
        }

        let recordHasFlag = false;
        for (const candidate of check.Candidates) {
            if (!armFlags(check, candidate, arm, decisionThreshold)) {
                continue;
            }
            totalFlaggedPairs++;
            recordHasFlag = true;
            if (candidate.IsDuplicatePair) {
                tp++;
            } else {
                fp++;
            }
        }

        if (!isDupe && recordHasFlag) {
            newFlaggedCount++;
        }
    }

    // Retrieval miss accounting: every duplicate record whose true source was not flagged is a false negative.
    // Total positive pairs = totalDuplicates.
    const fn = totalDuplicates - tp;

    return {
        TP: tp,
        FP: fp,
        FN: Math.max(0, fn),
        TotalDuplicates: totalDuplicates,
        TotalNew: totalNew,
        NewFlaggedCount: newFlaggedCount,
        TotalFlaggedPairs: totalFlaggedPairs,
    };
}

/** The model call behind an arm, for one check: the decision's, the prompt's, or none (the threshold arm). */
function armCallOf(check: RecordCheckObservation, arm: string): ArmCallResult | undefined {
    if (arm === 'decision' || arm === 'decision · production') {
        return check.DecisionResult;
    }
    if (arm === 'prompt' || arm === 'prompt · production') {
        return check.PromptResult;
    }
    return undefined;
}

/**
 * How often an arm's model call failed, or left candidates unanswered, over rep 1. Null for the
 * threshold arm, which makes no call.
 */
export function ComputeArmCallSummary(
    checks: readonly RecordCheckObservation[],
    arm: string
): ArmCallSummary | null {
    if (arm === 'threshold') {
        return null;
    }
    let calls = 0;
    let failedCalls = 0;
    let candidatesAsked = 0;
    let missingAnswers = 0;
    for (const check of checks.filter(c => c.Rep === 1)) {
        const call = armCallOf(check, arm);
        if (!call) {
            continue;
        }
        calls++;
        if (!call.Success) {
            failedCalls++;
            continue;
        }
        candidatesAsked += check.Candidates.length;
        missingAnswers += call.MissingAnswers;
    }
    return {
        Calls: calls,
        FailedCalls: failedCalls,
        FailedCallRate: calls > 0 ? failedCalls / calls : 0,
        CandidatesAsked: candidatesAsked,
        MissingAnswers: missingAnswers,
        MissingAnswerRate: candidatesAsked > 0 ? missingAnswers / candidatesAsked : 0,
    };
}

/** Precision, recall and F1 from a confusion count. */
function precisionRecallF1(confusion: ReturnType<typeof EvaluateArmConfusion>): { P: number; R: number; F1: number } {
    const p = confusion.TP + confusion.FP > 0 ? confusion.TP / (confusion.TP + confusion.FP) : 0;
    const r = confusion.TotalDuplicates > 0 ? confusion.TP / confusion.TotalDuplicates : 0;
    return { P: p, R: r, F1: p + r > 0 ? (2 * p * r) / (p + r) : 0 };
}

/** The 95% interval of a bootstrap distribution, or null when it has no values. */
function percentileInterval(values: readonly number[]): ConfidenceInterval | null {
    const lower = Quantile(values, 0.025);
    const upper = Quantile(values, 0.975);
    return lower !== null && upper !== null ? { Lower: lower, Upper: upper } : null;
}

/** Clustered bootstrap intervals for precision, recall and F1: records are resampled whole. */
function bootstrapArmIntervals(
    rep1Checks: readonly RecordCheckObservation[],
    arm: string,
    decisionThreshold: number | undefined,
    resamples: number,
    seed: number
): { Precision: ConfidenceInterval | null; Recall: ConfidenceInterval | null; F1: ConfidenceInterval | null } {
    if (rep1Checks.length === 0) {
        return { Precision: null, Recall: null, F1: null };
    }
    const random = CreateSeededRandom(seed);
    const precisions: number[] = [];
    const recalls: number[] = [];
    const f1s: number[] = [];
    for (let r = 0; r < resamples; r++) {
        const sample = Array.from(
            { length: rep1Checks.length },
            () => rep1Checks[Math.floor(random() * rep1Checks.length)]
        );
        const scores = precisionRecallF1(EvaluateArmConfusion(sample, arm, decisionThreshold));
        precisions.push(scores.P);
        recalls.push(scores.R);
        f1s.push(scores.F1);
    }
    return { Precision: percentileInterval(precisions), Recall: percentileInterval(recalls), F1: percentileInterval(f1s) };
}

/**
 * Computes precision, recall, and F1 with clustered bootstrap confidence intervals, and how the
 * arm's model calls went. Resampling is clustered by corpus record ID.
 */
export function ComputeArmPerformance(
    checks: readonly RecordCheckObservation[],
    arm: 'threshold' | 'decision' | 'decision · production' | 'prompt' | 'prompt · production' | string,
    options?: {
        DecisionThreshold?: number;
        BootstrapResamples?: number;
        Seed?: number;
    }
): ArmPerformanceMetrics {
    const rep1Checks = checks.filter(c => c.Rep === 1);
    const confusion = EvaluateArmConfusion(rep1Checks, arm, options?.DecisionThreshold);
    const scores = precisionRecallF1(confusion);
    const intervals = bootstrapArmIntervals(
        rep1Checks,
        arm,
        options?.DecisionThreshold,
        options?.BootstrapResamples ?? DEFAULT_BOOTSTRAP_RESAMPLES,
        options?.Seed ?? DECISION_EVAL_SEED
    );

    return {
        ArmName: arm,
        Precision: scores.P,
        PrecisionCI: intervals.Precision,
        Recall: scores.R,
        RecallCI: intervals.Recall,
        F1: scores.F1,
        F1CI: intervals.F1,
        FalseFlagRateOnNew: confusion.TotalNew > 0 ? confusion.NewFlaggedCount / confusion.TotalNew : 0,
        FlagsPerCheck: rep1Checks.length > 0 ? confusion.TotalFlaggedPairs / rep1Checks.length : 0,
        Calls: ComputeArmCallSummary(rep1Checks, arm),
    };
}

/**
 * Sweeps vector similarity thresholds from 0.60 to 0.95 in 0.05 increments.
 */
export function ComputeThresholdSweep(
    checks: readonly RecordCheckObservation[],
    thresholds: readonly number[] = VECTOR_SWEEP_THRESHOLDS
): ThresholdSweepRow[] {
    const rep1Checks = checks.filter(c => c.Rep === 1);
    const dupeCount = rep1Checks.filter(c => c.Label.Label === 'duplicate').length;
    const newCount = rep1Checks.filter(c => c.Label.Label === 'new').length;

    return thresholds.map(threshold => {
        let tp = 0;
        let fp = 0;
        let newFlagged = 0;
        let totalFlagged = 0;

        for (const check of rep1Checks) {
            const isNew = check.Label.Label === 'new';
            let recordFlagged = false;

            for (const cand of check.Candidates) {
                if (cand.VectorScore >= threshold) {
                    totalFlagged++;
                    recordFlagged = true;
                    if (cand.IsDuplicatePair) {
                        tp++;
                    } else {
                        fp++;
                    }
                }
            }

            if (isNew && recordFlagged) {
                newFlagged++;
            }
        }

        const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
        const recall = dupeCount > 0 ? tp / dupeCount : 0;
        const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
        const falseFlagRateOnNew = newCount > 0 ? newFlagged / newCount : 0;
        const flagsPerCheck = rep1Checks.length > 0 ? totalFlagged / rep1Checks.length : 0;

        return {
            Threshold: threshold,
            Precision: precision,
            Recall: recall,
            F1: f1,
            FalseFlagRateOnNew: falseFlagRateOnNew,
            FlagsPerCheck: flagsPerCheck,
        };
    });
}

/** One answered decision candidate from rep 1: its raw probability, and its out-of-fold calibrated one. */
export interface ScoredDecisionCandidate {
    Check: RecordCheckObservation;
    Candidate: CandidatePairObservation;
    /** The model that answered. */
    Model: string;
    RawProbability: number;
    /**
     * Calibrated by a Platt fit on the model's other folds, which never saw this candidate. Null when
     * the model has too few answered candidates to calibrate out of fold.
     */
    OutOfFoldProbability: number | null;
}

/** Rep 1's answered decision candidates, grouped by the model that answered, in check order. */
function answeredCandidatesByModel(
    checks: readonly RecordCheckObservation[]
): Map<string, { Check: RecordCheckObservation; Candidate: CandidatePairObservation; RawProbability: number }[]> {
    const byModel = new Map<string, { Check: RecordCheckObservation; Candidate: CandidatePairObservation; RawProbability: number }[]>();
    for (const check of checks.filter(c => c.Rep === 1)) {
        const model = check.DecisionResult?.Model ?? 'Default';
        for (const candidate of check.Candidates) {
            if (candidate.DecisionProbability === null) {
                continue;
            }
            const list = byModel.get(model) ?? [];
            list.push({ Check: check, Candidate: candidate, RawProbability: candidate.DecisionProbability });
            byModel.set(model, list);
        }
    }
    return byModel;
}

/**
 * Scores rep 1's answered decision candidates, each model on its own: the raw probability, and the
 * probability calibrated out of fold ({@link OutOfFoldPlatt}, 5 folds, seeded), so a calibrated
 * figure is never scored on the data its fit saw. Candidates with no answer are left out: they have
 * nothing to calibrate.
 */
export function ScoreDecisionCandidates(
    checks: readonly RecordCheckObservation[],
    seed: number = DECISION_EVAL_SEED
): ScoredDecisionCandidate[] {
    const scored: ScoredDecisionCandidate[] = [];
    for (const [model, items] of answeredCandidatesByModel(checks)) {
        const points = items.map(i => ({ Probability: i.RawProbability, Positive: i.Candidate.IsDuplicatePair }));
        const outOfFold = OutOfFoldPlatt(points, DECISION_EVAL_CALIBRATION_FOLDS, seed);
        items.forEach((item, index) => {
            scored.push({ ...item, Model: model, OutOfFoldProbability: outOfFold?.[index] ?? null });
        });
    }
    return scored;
}

/** Calibration metrics for one model's scored candidates. */
function calibrationFor(model: string, scored: readonly ScoredDecisionCandidate[]): DecisionModelCalibration {
    const rawPoints: LabelledProbability[] = scored.map(s => ({ Probability: s.RawProbability, Positive: s.Candidate.IsDuplicatePair }));
    const outOfFoldPoints: LabelledProbability[] = [];
    for (const s of scored) {
        if (s.OutOfFoldProbability !== null) {
            outOfFoldPoints.push({ Probability: s.OutOfFoldProbability, Positive: s.Candidate.IsDuplicatePair });
        }
    }
    const calibrated = outOfFoldPoints.length === scored.length && scored.length > 0;
    // The parameters to ship are fitted on every candidate; only the out-of-fold ones are scored.
    const shippedFit = FitPlatt(rawPoints);

    return {
        ModelName: model,
        TotalCandidates: scored.length,
        RawAuc: RocAuc(rawPoints),
        CalibratedAuc: calibrated ? RocAuc(outOfFoldPoints) : null,
        RawBrier: BrierScore(rawPoints),
        CalibratedBrier: calibrated ? BrierScore(outOfFoldPoints) : null,
        RawEce: CalibrationBins(rawPoints, DECISION_EVAL_ECE_BINS).ECE,
        CalibratedEce: calibrated ? CalibrationBins(outOfFoldPoints, DECISION_EVAL_ECE_BINS).ECE : null,
        PlattA: shippedFit.A,
        PlattB: shippedFit.B,
    };
}

/**
 * Computes decision probability calibration per model: ROC AUC, Brier score and ECE, raw and
 * calibrated out of fold, and the Platt parameters fitted on every candidate (the ones to ship).
 */
export function ComputeDecisionCalibration(
    checks: readonly RecordCheckObservation[],
    seed: number = DECISION_EVAL_SEED
): DecisionModelCalibration[] {
    const byModel = new Map<string, ScoredDecisionCandidate[]>();
    for (const s of ScoreDecisionCandidates(checks, seed)) {
        const list = byModel.get(s.Model) ?? [];
        list.push(s);
        byModel.set(s.Model, list);
    }
    return [...byModel].map(([model, scored]) => calibrationFor(model, scored));
}

/** One band's outcome over rep 1. */
interface BandOutcome {
    Precision: number;
    Recall: number;
    FalseFlagRateOnNew: number;
    ShareCandidatesFlagged: number;
}

/**
 * Scores one band over rep 1. Recall's denominator is every duplicate record, so a retrieval miss is
 * a false negative; the share's is every candidate the decision was asked about.
 */
function scoreBand(
    rep1Checks: readonly RecordCheckObservation[],
    flags: (check: RecordCheckObservation, candidate: CandidatePairObservation) => boolean
): BandOutcome {
    let tp = 0;
    let fp = 0;
    let newFlagged = 0;
    let flaggedCount = 0;
    let asked = 0;
    for (const check of rep1Checks) {
        if (check.DecisionResult) {
            asked += check.Candidates.length;
        }
        let checkFlagged = false;
        for (const candidate of check.Candidates) {
            if (!flags(check, candidate)) {
                continue;
            }
            flaggedCount++;
            checkFlagged = true;
            if (candidate.IsDuplicatePair) {
                tp++;
            } else {
                fp++;
            }
        }
        if (checkFlagged && check.Label.Label === 'new') {
            newFlagged++;
        }
    }
    const dupeCount = rep1Checks.filter(c => c.Label.Label === 'duplicate').length;
    const newCount = rep1Checks.filter(c => c.Label.Label === 'new').length;
    return {
        Precision: tp + fp > 0 ? tp / (tp + fp) : 0,
        Recall: dupeCount > 0 ? tp / dupeCount : 0,
        FalseFlagRateOnNew: newCount > 0 ? newFlagged / newCount : 0,
        ShareCandidatesFlagged: asked > 0 ? flaggedCount / asked : 0,
    };
}

/**
 * Sweeps the decision probability threshold ("Uncertain" band lower bound) from 0.10 to 0.90,
 * reporting precision, recall, false-flag rate on new records and the share of candidates flagged,
 * on raw probabilities and on out-of-fold calibrated ones (see {@link ScoreDecisionCandidates}).
 *
 * Both columns flag as production's entry check does: a candidate a successful decision gave no
 * answer for is flagged at every band, and a failed decision flags nothing. A candidate whose model
 * has too few answers to calibrate out of fold is left out of the calibrated columns.
 */
export function ComputeDecisionBandSweep(
    checks: readonly RecordCheckObservation[],
    thresholds: readonly number[] = BAND_SWEEP_THRESHOLDS,
    seed: number = DECISION_EVAL_SEED
): DecisionBandSweepRow[] {
    const rep1Checks = checks.filter(c => c.Rep === 1);
    const outOfFold = new Map<CandidatePairObservation, number>();
    for (const s of ScoreDecisionCandidates(rep1Checks, seed)) {
        if (s.OutOfFoldProbability !== null) {
            outOfFold.set(s.Candidate, s.OutOfFoldProbability);
        }
    }
    const calibratedFlags = (check: RecordCheckObservation, candidate: CandidatePairObservation, threshold: number): boolean => {
        if (candidate.DecisionProbability === null) {
            return DecisionFlagsAt(check, null, threshold);
        }
        const calibrated = outOfFold.get(candidate);
        return calibrated !== undefined && DecisionFlagsAt(check, calibrated, threshold);
    };

    return thresholds.map(threshold => {
        const raw = scoreBand(rep1Checks, (check, candidate) => DecisionFlagsAt(check, candidate.DecisionProbability, threshold));
        const calibrated = scoreBand(rep1Checks, (check, candidate) => calibratedFlags(check, candidate, threshold));
        return {
            Threshold: threshold,
            RawPrecision: raw.Precision,
            RawRecall: raw.Recall,
            RawFalseFlagRateOnNew: raw.FalseFlagRateOnNew,
            RawShareCandidatesFlagged: raw.ShareCandidatesFlagged,
            CalibratedPrecision: calibrated.Precision,
            CalibratedRecall: calibrated.Recall,
            CalibratedFalseFlagRateOnNew: calibrated.FalseFlagRateOnNew,
            CalibratedShareCandidatesFlagged: calibrated.ShareCandidatesFlagged,
        };
    });
}

/**
 * Computes latency percentiles (p50 and p95) and budget compliance. The entry check path is the
 * preparation (building the record, the vector query, the permission narrowing and the candidate
 * load) plus the decision call, as production's `CheckRecordValues` times it.
 */
export function ComputeLatencySummary(checks: readonly RecordCheckObservation[]): LatencySummary {
    const retrievalLatencies: number[] = [];
    const preparationLatencies: number[] = [];
    const thresholdLatencies: number[] = [];
    const decisionLatencies: number[] = [];
    const promptLatencies: number[] = [];
    const entryCheckLatencies: number[] = [];

    for (const check of checks) {
        if (check.RetrievalLatencyMs > 0) {
            retrievalLatencies.push(check.RetrievalLatencyMs);
        }
        if (check.PreparationLatencyMs > 0) {
            preparationLatencies.push(check.PreparationLatencyMs);
        }
        if (check.ThresholdLatencyMs && check.ThresholdLatencyMs > 0) {
            thresholdLatencies.push(check.ThresholdLatencyMs);
        }
        if (check.DecisionResult && check.DecisionResult.LatencyMs > 0) {
            decisionLatencies.push(check.DecisionResult.LatencyMs);
            entryCheckLatencies.push(check.PreparationLatencyMs + check.DecisionResult.LatencyMs);
        }
        if (check.PromptResult && check.PromptResult.LatencyMs > 0) {
            promptLatencies.push(check.PromptResult.LatencyMs);
        }
    }

    const withinBudget = entryCheckLatencies.filter(lat => lat <= DUPLICATE_ENTRY_CHECK_BUDGET_MS).length;
    const withinBudgetRate = entryCheckLatencies.length > 0 ? withinBudget / entryCheckLatencies.length : 1.0;

    return {
        RetrievalP50: Quantile(retrievalLatencies, 0.5),
        RetrievalP95: Quantile(retrievalLatencies, 0.95),
        PreparationP50: Quantile(preparationLatencies, 0.5),
        PreparationP95: Quantile(preparationLatencies, 0.95),
        ThresholdP50: thresholdLatencies.length > 0 ? Quantile(thresholdLatencies, 0.5) : null,
        ThresholdP95: thresholdLatencies.length > 0 ? Quantile(thresholdLatencies, 0.95) : null,
        DecisionP50: Quantile(decisionLatencies, 0.5),
        DecisionP95: Quantile(decisionLatencies, 0.95),
        PromptP50: Quantile(promptLatencies, 0.5),
        PromptP95: Quantile(promptLatencies, 0.95),
        EntryCheckP50: Quantile(entryCheckLatencies, 0.5),
        EntryCheckP95: Quantile(entryCheckLatencies, 0.95),
        EntryCheckBudgetMs: DUPLICATE_ENTRY_CHECK_BUDGET_MS,
        EntryCheckWithinBudgetRate: withinBudgetRate,
    };
}

/**
 * One model arm's cost. A check whose run recorded no cost is counted as missing, not as $0, and is
 * left out of the cost per 1,000 checks.
 */
function armCostSummary(arm: 'decision' | 'prompt', calls: readonly ArmCallResult[]): ArmCostSummary {
    let totalCost = 0;
    let checksWithCost = 0;
    for (const call of calls) {
        if (call.CostUSD !== null) {
            totalCost += call.CostUSD;
            checksWithCost++;
        }
    }
    return {
        ArmName: arm,
        TotalCostUSD: totalCost,
        TotalChecks: calls.length,
        ChecksMissingCost: calls.length - checksWithCost,
        CostPer1000ChecksUSD: checksWithCost > 0 ? (totalCost / checksWithCost) * 1000 : null,
    };
}

/**
 * Computes arm costs and estimated cost per 1,000 checks.
 */
export function ComputeCostSummary(checks: readonly RecordCheckObservation[]): ArmCostSummary[] {
    const decisionCalls: ArmCallResult[] = [];
    const promptCalls: ArmCallResult[] = [];
    for (const check of checks) {
        if (check.DecisionResult) {
            decisionCalls.push(check.DecisionResult);
        }
        if (check.PromptResult) {
            promptCalls.push(check.PromptResult);
        }
    }

    return [
        {
            ArmName: 'threshold',
            TotalCostUSD: 0,
            TotalChecks: checks.length,
            ChecksMissingCost: 0,
            CostPer1000ChecksUSD: 0,
        },
        armCostSummary('decision', decisionCalls),
        armCostSummary('prompt', promptCalls),
    ];
}

/**
 * Computes repeatability metrics between repetition 1 and repetition 2.
 */
export function ComputeRepeatability(
    checks: readonly RecordCheckObservation[]
): RepeatabilitySummary | undefined {
    const rep1 = checks.filter(c => c.Rep === 1);
    const rep2 = checks.filter(c => c.Rep === 2);

    if (rep1.length === 0 || rep2.length === 0) {
        return undefined;
    }

    const rep2Map = new Map<string, RecordCheckObservation>();
    for (const c of rep2) {
        rep2Map.set(c.RecordId, c);
    }

    const decisionDiffs: number[] = [];
    let decisionAgreements = 0;
    let decisionPairs = 0;

    let promptAgreements = 0;
    let promptPairs = 0;

    for (const c1 of rep1) {
        const c2 = rep2Map.get(c1.RecordId);
        if (!c2) {
            continue;
        }

        const c2CandMap = new Map<string, CandidatePairObservation>();
        for (const cand of c2.Candidates) {
            c2CandMap.set(cand.CandidateId, cand);
        }

        for (const cand1 of c1.Candidates) {
            const cand2 = c2CandMap.get(cand1.CandidateId);
            if (!cand2) {
                continue;
            }

            // Decision repeatability
            if (cand1.DecisionProbability !== null && cand2.DecisionProbability !== null) {
                decisionDiffs.push(Math.abs(cand1.DecisionProbability - cand2.DecisionProbability));
                decisionPairs++;
                const verdict1 = cand1.DecisionProbability >= 0.5;
                const verdict2 = cand2.DecisionProbability >= 0.5;
                if (verdict1 === verdict2) {
                    decisionAgreements++;
                }
            }

            // Prompt repeatability
            if (cand1.PromptRecommendation !== null && cand2.PromptRecommendation !== null) {
                promptPairs++;
                if (cand1.PromptRecommendation === cand2.PromptRecommendation) {
                    promptAgreements++;
                }
            }
        }
    }

    const meanAbsDiff =
        decisionDiffs.length > 0 ? decisionDiffs.reduce((a, b) => a + b, 0) / decisionDiffs.length : null;
    const decisionAgreementRate = decisionPairs > 0 ? decisionAgreements / decisionPairs : null;
    const promptAgreementRate = promptPairs > 0 ? promptAgreements / promptPairs : null;

    return {
        DecisionProbabilityMeanAbsDiff: meanAbsDiff,
        DecisionVerdictAgreementRate: decisionAgreementRate,
        PromptRecommendationAgreementRate: promptAgreementRate,
    };
}

/** Options for compiling a full report. */
export interface ReportOptions {
    EntityName: string;
    CorpusPath: string;
    DuplicatesCount: number;
    NewCount: number;
    Reps: number;
    TopK: number;
    DecisionPrompt: string;
    Arms?: readonly ('threshold' | 'decision' | 'decision · production' | 'prompt' | 'prompt · production' | string)[];
    Seed?: number;
}

/**
 * The report's caveats. The candidate counts are rep 1's, so a note says whether a caveat touched
 * this run.
 */
function buildReportNotes(checks: readonly RecordCheckObservation[]): string[] {
    const rep1Candidates = checks.filter(c => c.Rep === 1).flatMap(c => c.Candidates);
    const belowThreshold = rep1Candidates.filter(c => !c.PassedThreshold).length;
    return [
        'The corpus is synthetic (LLM rewrites of MJ metadata); refit on real labelled duplicates before relying on it.',
        'A duplicate whose source was not retrieved is a false negative for all arms (reported separately in retrieval).',
        'The decision arms flag as production\'s entry check does: a candidate a successful decision gave no answer for is flagged, and a failed decision flags nothing. The arm table counts failed calls and missing answers. The prompt arm counts a candidate it gave no verdict for as not flagged.',
        'The calibrated AUC, Brier, ECE and band sweep are out of fold (5-fold Platt, seeded): each candidate is calibrated by a fit that never saw it. The Platt fit shown is on every candidate: the parameters to ship.',
        `The decision and prompt arms are each asked about every readable top-K candidate in one call, including any below PotentialMatchThreshold (${belowThreshold} of ${rep1Candidates.length} candidates in rep 1); the \`· production\` views filter the verdicts afterwards. Where candidates fall below the threshold, the set the model sees differs from production's.`,
        'New (hard-negative) records were screened only for an exact match with existing rows. One may already exist under other wording; the decision would then flag it correctly, and the false-flag rate would read high.',
        'Cost notes: a failover or chat model cost may be missing on branches without #4880. A check with no recorded cost is left out of the cost per 1,000 checks.',
    ];
}

/**
 * Builds the complete structured measurement report.
 */
export function BuildMeasurementReport(
    checks: readonly RecordCheckObservation[],
    options: ReportOptions
): DupeMeasurementReport {
    const configuredArms = options.Arms ?? ['threshold', 'decision', 'decision · production', 'prompt', 'prompt · production'];
    const armMetrics: ArmPerformanceMetrics[] = configuredArms.map(arm =>
        ComputeArmPerformance(checks, arm, { Seed: options.Seed })
    );

    return {
        EntityName: options.EntityName,
        CorpusPath: options.CorpusPath,
        DuplicatesCount: options.DuplicatesCount,
        NewCount: options.NewCount,
        Reps: options.Reps,
        TopK: options.TopK,
        DecisionPrompt: options.DecisionPrompt,
        Retrieval: ComputeRetrievalMetrics(checks),
        ArmMetrics: armMetrics,
        ThresholdSweep: ComputeThresholdSweep(checks),
        DecisionCalibration: ComputeDecisionCalibration(checks, options.Seed),
        DecisionBandSweep: ComputeDecisionBandSweep(checks, BAND_SWEEP_THRESHOLDS, options.Seed),
        Latency: ComputeLatencySummary(checks),
        Costs: ComputeCostSummary(checks),
        Repeatability: options.Reps >= 2 ? ComputeRepeatability(checks) : undefined,
        Notes: buildReportNotes(checks),
    };
}

/**
 * Formats a number to fixed decimal places, or returns '-' if null.
 */
function fmt(val: number | null | undefined, digits: number = 3): string {
    if (val === null || val === undefined || Number.isNaN(val)) {
        return '-';
    }
    return val.toFixed(digits);
}

/** Formats a percentage. */
function pct(val: number | null | undefined, digits: number = 1): string {
    if (val === null || val === undefined || Number.isNaN(val)) {
        return '-';
    }
    return (val * 100).toFixed(digits) + '%';
}

/** "count / total (rate)", or '-' when there is no total. */
function countOf(count: number, total: number): string {
    return total > 0 ? `${count} / ${total} (${pct(count / total)})` : '-';
}

function renderHeader(report: DupeMeasurementReport): string[] {
    return [
        `# Duplicate Check Measurement: ${report.EntityName}`,
        '',
        `**Corpus**: \`${report.CorpusPath}\` (${report.DuplicatesCount} duplicates, ${report.NewCount} new records)  `,
        `**Reps**: ${report.Reps} | **Top-K**: ${report.TopK} | **Decision Prompt**: "${report.DecisionPrompt}"`,
        '',
        '> [!NOTE]',
        ...report.Notes.map(note => `> - ${note}`),
        '',
    ];
}

function renderRetrieval(report: DupeMeasurementReport): string[] {
    const r = report.Retrieval;
    return [
        '## 1. Retrieval Performance',
        '',
        'A source that is not retrieved is a miss for every arm. Retrieval is evaluated separately:',
        '',
        '| Metric | Count | Rate |',
        '|---|---|---|',
        `| Total Duplicates | ${r.TotalDuplicates} | 100.0% |`,
        `| Sources in Top-K | ${r.SourcesInTopK} | ${pct(r.SourcesInTopKRate)} |`,
        `| Sources After PotentialMatchThreshold | ${r.SourcesAfterThreshold} | ${pct(r.SourcesAfterThresholdRate)} |`,
        `| Sources Missed at Retrieval | ${r.SourcesMissed} | ${pct(r.SourcesMissedRate)} |`,
        '',
    ];
}

function renderArmRow(arm: ArmPerformanceMetrics): string {
    const pCI = arm.PrecisionCI ? ` [${fmt(arm.PrecisionCI.Lower)}, ${fmt(arm.PrecisionCI.Upper)}]` : '';
    const rCI = arm.RecallCI ? ` [${fmt(arm.RecallCI.Lower)}, ${fmt(arm.RecallCI.Upper)}]` : '';
    const fCI = arm.F1CI ? ` [${fmt(arm.F1CI.Lower)}, ${fmt(arm.F1CI.Upper)}]` : '';
    const failed = arm.Calls ? countOf(arm.Calls.FailedCalls, arm.Calls.Calls) : '-';
    const missing = arm.Calls ? countOf(arm.Calls.MissingAnswers, arm.Calls.CandidatesAsked) : '-';
    return `| \`${arm.ArmName}\` | ${fmt(arm.Precision)}${pCI} | ${fmt(arm.Recall)}${rCI} | ${fmt(arm.F1)}${fCI} | ${pct(arm.FalseFlagRateOnNew)} | ${fmt(arm.FlagsPerCheck, 2)} | ${failed} | ${missing} |`;
}

function renderArms(report: DupeMeasurementReport): string[] {
    return [
        '## 2. Reasoning Arm Comparison',
        '',
        '| Arm | Precision (95% CI) | Recall (95% CI) | F1 (95% CI) | False-Flag Rate on New | Flags / Check | Failed Calls | Missing Answers |',
        '|---|---|---|---|---|---|---|---|',
        ...report.ArmMetrics.map(renderArmRow),
        '',
    ];
}

function renderThresholdSweep(report: DupeMeasurementReport): string[] {
    return [
        '## 3. Threshold Arm: Vector Score Sweep',
        '',
        '| Vector Threshold | Precision | Recall | F1 | False-Flag Rate on New | Flags / Check |',
        '|---|---|---|---|---|---|',
        ...report.ThresholdSweep.map(row =>
            `| ${row.Threshold.toFixed(2)} | ${fmt(row.Precision)} | ${fmt(row.Recall)} | ${fmt(row.F1)} | ${pct(row.FalseFlagRateOnNew)} | ${fmt(row.FlagsPerCheck, 2)} |`
        ),
        '',
    ];
}

function renderCalibration(report: DupeMeasurementReport): string[] {
    const lines = ['## 4. Decision Arm: Probability Calibration & Model Analysis', ''];
    if (report.DecisionCalibration.length === 0) {
        lines.push('*(No decision arm data recorded)*');
    } else {
        lines.push('Calibrated columns are out of fold. The Platt fit is on every candidate: the parameters to ship.');
        lines.push('');
        lines.push('| Model | Candidates | Raw AUC | Calibrated AUC | Raw Brier | Calibrated Brier | Raw ECE | Calibrated ECE | Platt Fit (A, B) |');
        lines.push('|---|---|---|---|---|---|---|---|---|');
        for (const c of report.DecisionCalibration) {
            lines.push(
                `| ${c.ModelName} | ${c.TotalCandidates} | ${fmt(c.RawAuc)} | ${fmt(c.CalibratedAuc)} | ${fmt(c.RawBrier)} | ${fmt(c.CalibratedBrier)} | ${fmt(c.RawEce)} | ${fmt(c.CalibratedEce)} | A=${fmt(c.PlattA, 4)}, B=${fmt(c.PlattB, 4)} |`
            );
        }
    }
    lines.push('');
    return lines;
}

function renderBandSweep(report: DupeMeasurementReport): string[] {
    return [
        '### Decision Band Sweep',
        '',
        'Calibrated columns band each candidate\'s out-of-fold calibrated probability.',
        '',
        '| Band Threshold | Raw Prec | Raw Rec | Raw False-Flag (New) | Raw Share | Cal Prec | Cal Rec | Cal False-Flag (New) | Cal Share |',
        '|---|---|---|---|---|---|---|---|---|',
        ...report.DecisionBandSweep.map(row =>
            `| ${row.Threshold.toFixed(2)} | ${fmt(row.RawPrecision)} | ${fmt(row.RawRecall)} | ${pct(row.RawFalseFlagRateOnNew)} | ${pct(row.RawShareCandidatesFlagged)} | ${fmt(row.CalibratedPrecision)} | ${fmt(row.CalibratedRecall)} | ${pct(row.CalibratedFalseFlagRateOnNew)} | ${pct(row.CalibratedShareCandidatesFlagged)} |`
        ),
        '',
    ];
}

function renderLatency(report: DupeMeasurementReport): string[] {
    const l = report.Latency;
    const lines = [
        '## 5. Latency Analysis',
        '',
        `**Budget**: ${l.EntryCheckBudgetMs} ms  `,
        `**Entry Check Within Budget**: ${pct(l.EntryCheckWithinBudgetRate)} (p50: ${fmt(l.EntryCheckP50, 0)} ms, p95: ${fmt(l.EntryCheckP95, 0)} ms)`,
        '',
        '| Operation / Arm | p50 (ms) | p95 (ms) |',
        '|---|---|---|',
        `| Vector Retrieval | ${fmt(l.RetrievalP50, 0)} | ${fmt(l.RetrievalP95, 0)} |`,
        `| Preparation (record, retrieval, permission, candidate load) | ${fmt(l.PreparationP50, 0)} | ${fmt(l.PreparationP95, 0)} |`,
    ];
    if (l.ThresholdP50 !== null && l.ThresholdP50 !== undefined) {
        lines.push(`| Threshold Arm | ${fmt(l.ThresholdP50, 0)} | ${fmt(l.ThresholdP95, 0)} |`);
    }
    lines.push(`| Decision Arm | ${fmt(l.DecisionP50, 0)} | ${fmt(l.DecisionP95, 0)} |`);
    lines.push(`| Prompt Arm | ${fmt(l.PromptP50, 0)} | ${fmt(l.PromptP95, 0)} |`);
    lines.push(`| **Full Entry Check** (Preparation + Decision) | **${fmt(l.EntryCheckP50, 0)}** | **${fmt(l.EntryCheckP95, 0)}** |`);
    lines.push('');
    return lines;
}

function renderCosts(report: DupeMeasurementReport): string[] {
    return [
        '## 6. Cost Analysis',
        '',
        '| Arm | Total Cost ($) | Checks Run | Checks Missing a Cost | Cost / 1,000 Checks ($) |',
        '|---|---|---|---|---|',
        ...report.Costs.map(cost => {
            const per1000 = cost.CostPer1000ChecksUSD === null ? 'unknown' : `$${cost.CostPer1000ChecksUSD.toFixed(4)}`;
            return `| \`${cost.ArmName}\` | $${cost.TotalCostUSD.toFixed(4)} | ${cost.TotalChecks} | ${cost.ChecksMissingCost} | ${per1000} |`;
        }),
        '',
    ];
}

function renderRepeatability(report: DupeMeasurementReport): string[] {
    if (!report.Repeatability) {
        return [];
    }
    return [
        '## 7. Repeatability (Rep 1 vs Rep 2)',
        '',
        '| Metric | Value |',
        '|---|---|',
        `| Decision Probability Mean Absolute Difference | ${fmt(report.Repeatability.DecisionProbabilityMeanAbsDiff, 4)} |`,
        `| Decision Flag Agreement Rate | ${pct(report.Repeatability.DecisionVerdictAgreementRate)} |`,
        `| Prompt Recommendation Agreement Rate | ${pct(report.Repeatability.PromptRecommendationAgreementRate)} |`,
        '',
    ];
}

/**
 * Renders the markdown report.
 * Guaranteed to NEVER include record text; uses IDs and aggregate metrics only.
 */
export function RenderMarkdownReport(report: DupeMeasurementReport): string {
    return [
        ...renderHeader(report),
        ...renderRetrieval(report),
        ...renderArms(report),
        ...renderThresholdSweep(report),
        ...renderCalibration(report),
        ...renderBandSweep(report),
        ...renderLatency(report),
        ...renderCosts(report),
        ...renderRepeatability(report),
    ].join('\n');
}

/**
 * Asserts that no record field text appears anywhere in the report content.
 * Throws an error if any distinctive non-trivial text value from corpusRecords is found.
 */
export function AssertNoRecordTextInReport(
    reportContent: string,
    corpusRecords: readonly CorpusRecord[]
): void {
    const found = FindRecordText(reportContent, corpusRecords.flatMap(r => Object.values(r.Values).map(v => String(v))));
    if (found !== null) {
        throw new Error(`Sanitization violation: record text "${found.slice(0, 30)}..." found in generated report!`);
    }
}

/**
 * Writes report.md and report.json to outDir.
 * Refuses paths inside any git repo via {@link AssertOutputOutsideRepo}.
 */
export function WriteReportFiles(
    outDir: string,
    report: DupeMeasurementReport,
    corpusRecordsForSanitizationCheck?: readonly CorpusRecord[]
): void {
    const resolvedDir = AssertOutputOutsideRepo(outDir);
    if (!existsSync(resolvedDir)) {
        mkdirSync(resolvedDir, { recursive: true });
    }

    const mdContent = RenderMarkdownReport(report);
    const jsonContent = JSON.stringify(report, null, 2) + '\n';

    if (corpusRecordsForSanitizationCheck && corpusRecordsForSanitizationCheck.length > 0) {
        AssertNoRecordTextInReport(mdContent, corpusRecordsForSanitizationCheck);
        AssertNoRecordTextInReport(jsonContent, corpusRecordsForSanitizationCheck);
    }

    writeFileSync(join(resolvedDir, 'report.md'), mdContent, 'utf-8');
    writeFileSync(join(resolvedDir, 'report.json'), jsonContent, 'utf-8');
}
