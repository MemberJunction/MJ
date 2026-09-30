/**
 * @fileoverview Pure evaluation engine for duplicate detection measurement.
 *
 * Implements:
 * - Retrieval miss accounting
 * - Pairwise precision, recall, F1 with clustered bootstrap confidence intervals
 * - Vector score threshold sweep (0.60 to 0.95)
 * - Decision probability calibration (ROC AUC, Brier, ECE, Platt A/B), scored out of fold
 * - Band sweep (0.10 to 0.90) for raw and out-of-fold calibrated probabilities
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
import type {
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

/** Normalizes a UUID string for case-insensitive and hyphen-insensitive comparison. */
export function NormalizeId(id: string | null | undefined): string {
    if (!id) {
        return '';
    }
    return id.toLowerCase().replace(/[^a-f0-9]/g, '');
}

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
            let flagged = false;
            if (arm === 'threshold') {
                flagged = candidate.ThresholdFlagged;
            } else if (arm === 'decision') {
                if (decisionThreshold != null) {
                    flagged = (candidate.DecisionProbability ?? 0) >= decisionThreshold;
                } else {
                    flagged = candidate.DecisionFlagged;
                }
            } else if (arm === 'decision · production') {
                if (decisionThreshold != null) {
                    flagged = candidate.PassedThreshold && (candidate.DecisionProbability ?? 0) >= decisionThreshold;
                } else {
                    flagged = candidate.PassedThreshold && candidate.DecisionFlagged;
                }
            } else if (arm === 'prompt') {
                flagged = candidate.PromptFlagged;
            } else if (arm === 'prompt · production') {
                flagged = candidate.PassedThreshold && candidate.PromptFlagged;
            }

            if (flagged) {
                totalFlaggedPairs++;
                recordHasFlag = true;
                if (candidate.IsDuplicatePair) {
                    tp++;
                } else {
                    fp++;
                }
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

/**
 * Computes precision, recall, and F1 with clustered bootstrap confidence intervals.
 * Resampling is clustered by corpus record ID.
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

    const precision = confusion.TP + confusion.FP > 0 ? confusion.TP / (confusion.TP + confusion.FP) : 0;
    const recall = confusion.TotalDuplicates > 0 ? confusion.TP / confusion.TotalDuplicates : 0;
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

    const falseFlagRateOnNew = confusion.TotalNew > 0 ? confusion.NewFlaggedCount / confusion.TotalNew : 0;
    const flagsPerCheck = rep1Checks.length > 0 ? confusion.TotalFlaggedPairs / rep1Checks.length : 0;

    // Clustered bootstrap over records
    const resamples = options?.BootstrapResamples ?? DEFAULT_BOOTSTRAP_RESAMPLES;
    const seed = options?.Seed ?? DECISION_EVAL_SEED;
    const random = CreateSeededRandom(seed);

    let precisionCI: ConfidenceInterval | null = null;
    let recallCI: ConfidenceInterval | null = null;
    let f1CI: ConfidenceInterval | null = null;

    if (rep1Checks.length > 0) {
        const precisions: number[] = [];
        const recalls: number[] = [];
        const f1s: number[] = [];

        for (let r = 0; r < resamples; r++) {
            const sample = Array.from(
                { length: rep1Checks.length },
                () => rep1Checks[Math.floor(random() * rep1Checks.length)]
            );
            const sampleConfusion = EvaluateArmConfusion(sample, arm, options?.DecisionThreshold);

            const sampleP =
                sampleConfusion.TP + sampleConfusion.FP > 0
                    ? sampleConfusion.TP / (sampleConfusion.TP + sampleConfusion.FP)
                    : 0;
            const sampleR =
                sampleConfusion.TotalDuplicates > 0
                    ? sampleConfusion.TP / sampleConfusion.TotalDuplicates
                    : 0;
            const sampleF1 = sampleP + sampleR > 0 ? (2 * sampleP * sampleR) / (sampleP + sampleR) : 0;

            precisions.push(sampleP);
            recalls.push(sampleR);
            f1s.push(sampleF1);
        }

        const pLow = Quantile(precisions, 0.025);
        const pHigh = Quantile(precisions, 0.975);
        if (pLow !== null && pHigh !== null) {
            precisionCI = { Lower: pLow, Upper: pHigh };
        }

        const rLow = Quantile(recalls, 0.025);
        const rHigh = Quantile(recalls, 0.975);
        if (rLow !== null && rHigh !== null) {
            recallCI = { Lower: rLow, Upper: rHigh };
        }

        const fLow = Quantile(f1s, 0.025);
        const fHigh = Quantile(f1s, 0.975);
        if (fLow !== null && fHigh !== null) {
            f1CI = { Lower: fLow, Upper: fHigh };
        }
    }

    return {
        ArmName: arm,
        Precision: precision,
        PrecisionCI: precisionCI,
        Recall: recall,
        RecallCI: recallCI,
        F1: f1,
        F1CI: f1CI,
        FalseFlagRateOnNew: falseFlagRateOnNew,
        FlagsPerCheck: flagsPerCheck,
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
 * A candidate whose model has too few answers to calibrate out of fold is left out of the
 * calibrated columns.
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
    const calibratedFlags = (candidate: CandidatePairObservation, threshold: number): boolean => {
        const calibrated = outOfFold.get(candidate);
        return calibrated !== undefined && calibrated >= threshold;
    };

    return thresholds.map(threshold => {
        const raw = scoreBand(rep1Checks, (_check, candidate) => candidate.DecisionProbability !== null && candidate.DecisionProbability >= threshold);
        const calibrated = scoreBand(rep1Checks, (_check, candidate) => calibratedFlags(candidate, threshold));
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
 * Computes latency percentiles (p50 and p95) and budget compliance.
 */
export function ComputeLatencySummary(checks: readonly RecordCheckObservation[]): LatencySummary {
    const retrievalLatencies: number[] = [];
    const thresholdLatencies: number[] = [];
    const decisionLatencies: number[] = [];
    const promptLatencies: number[] = [];
    const entryCheckLatencies: number[] = [];

    for (const check of checks) {
        if (check.RetrievalLatencyMs > 0) {
            retrievalLatencies.push(check.RetrievalLatencyMs);
        }
        if (check.ThresholdLatencyMs && check.ThresholdLatencyMs > 0) {
            thresholdLatencies.push(check.ThresholdLatencyMs);
        }
        if (check.DecisionResult && check.DecisionResult.LatencyMs > 0) {
            decisionLatencies.push(check.DecisionResult.LatencyMs);
            // Entry check path latency is retrieval + decision
            entryCheckLatencies.push(check.RetrievalLatencyMs + check.DecisionResult.LatencyMs);
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
 * Computes arm costs and estimated cost per 1,000 checks.
 */
export function ComputeCostSummary(checks: readonly RecordCheckObservation[]): ArmCostSummary[] {
    let decisionCost = 0;
    let decisionChecks = 0;
    let promptCost = 0;
    let promptChecks = 0;

    for (const check of checks) {
        if (check.DecisionResult) {
            decisionChecks++;
            decisionCost += check.DecisionResult.CostUSD ?? 0;
        }
        if (check.PromptResult) {
            promptChecks++;
            promptCost += check.PromptResult.CostUSD ?? 0;
        }
    }

    return [
        {
            ArmName: 'threshold',
            TotalCostUSD: 0,
            TotalChecks: checks.length,
            CostPer1000ChecksUSD: 0,
        },
        {
            ArmName: 'decision',
            TotalCostUSD: decisionCost,
            TotalChecks: decisionChecks,
            CostPer1000ChecksUSD: decisionChecks > 0 ? (decisionCost / decisionChecks) * 1000 : 0,
        },
        {
            ArmName: 'prompt',
            TotalCostUSD: promptCost,
            TotalChecks: promptChecks,
            CostPer1000ChecksUSD: promptChecks > 0 ? (promptCost / promptChecks) * 1000 : 0,
        },
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
 * Builds the complete structured measurement report.
 */
export function BuildMeasurementReport(
    checks: readonly RecordCheckObservation[],
    options: ReportOptions
): DupeMeasurementReport {
    const configuredArms = options.Arms ?? ['threshold', 'decision', 'decision · production', 'prompt', 'prompt · production'];
    const retrieval = ComputeRetrievalMetrics(checks);

    const armMetrics: ArmPerformanceMetrics[] = configuredArms.map(arm =>
        ComputeArmPerformance(checks, arm, { Seed: options.Seed })
    );

    const thresholdSweep = ComputeThresholdSweep(checks);
    const calibration = ComputeDecisionCalibration(checks, options.Seed);
    const bandSweep = ComputeDecisionBandSweep(checks, BAND_SWEEP_THRESHOLDS, options.Seed);
    const latency = ComputeLatencySummary(checks);
    const costs = ComputeCostSummary(checks);
    const repeatability = options.Reps >= 2 ? ComputeRepeatability(checks) : undefined;

    const notes: string[] = [
        'The corpus is synthetic (LLM rewrites of MJ metadata); refit on real labelled duplicates before relying on it.',
        'A duplicate whose source was not retrieved is a false negative for all arms (reported separately in retrieval).',
        'The calibrated AUC, Brier, ECE and band sweep are out of fold (5-fold Platt, seeded): each candidate is calibrated by a fit that never saw it. The Platt fit shown is on every candidate: the parameters to ship.',
        'Cost notes: a failover or chat model cost may be missing on branches without #4880.',
    ];

    return {
        EntityName: options.EntityName,
        CorpusPath: options.CorpusPath,
        DuplicatesCount: options.DuplicatesCount,
        NewCount: options.NewCount,
        Reps: options.Reps,
        TopK: options.TopK,
        DecisionPrompt: options.DecisionPrompt,
        Retrieval: retrieval,
        ArmMetrics: armMetrics,
        ThresholdSweep: thresholdSweep,
        DecisionCalibration: calibration,
        DecisionBandSweep: bandSweep,
        Latency: latency,
        Costs: costs,
        Repeatability: repeatability,
        Notes: notes,
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

/**
 * Renders the markdown report.
 * Guaranteed to NEVER include record text; uses IDs and aggregate metrics only.
 */
export function RenderMarkdownReport(report: DupeMeasurementReport): string {
    const lines: string[] = [];

    lines.push(`# Duplicate Check Measurement: ${report.EntityName}`);
    lines.push('');
    lines.push(`**Corpus**: \`${report.CorpusPath}\` (${report.DuplicatesCount} duplicates, ${report.NewCount} new records)  `);
    lines.push(`**Reps**: ${report.Reps} | **Top-K**: ${report.TopK} | **Decision Prompt**: "${report.DecisionPrompt}"`);
    lines.push('');

    // Notes
    lines.push('> [!NOTE]');
    for (const note of report.Notes) {
        lines.push(`> - ${note}`);
    }
    lines.push('');

    // Retrieval
    lines.push('## 1. Retrieval Performance');
    lines.push('');
    lines.push('A source that is not retrieved is a miss for every arm. Retrieval is evaluated separately:');
    lines.push('');
    lines.push('| Metric | Count | Rate |');
    lines.push('|---|---|---|');
    lines.push(`| Total Duplicates | ${report.Retrieval.TotalDuplicates} | 100.0% |`);
    lines.push(`| Sources in Top-K | ${report.Retrieval.SourcesInTopK} | ${pct(report.Retrieval.SourcesInTopKRate)} |`);
    lines.push(`| Sources After PotentialMatchThreshold | ${report.Retrieval.SourcesAfterThreshold} | ${pct(report.Retrieval.SourcesAfterThresholdRate)} |`);
    lines.push(`| Sources Missed at Retrieval | ${report.Retrieval.SourcesMissed} | ${pct(report.Retrieval.SourcesMissedRate)} |`);
    lines.push('');

    // Arm Performance Comparison
    lines.push('## 2. Reasoning Arm Comparison');
    lines.push('');
    lines.push('| Arm | Precision (95% CI) | Recall (95% CI) | F1 (95% CI) | False-Flag Rate on New | Flags / Check |');
    lines.push('|---|---|---|---|---|---|');
    for (const arm of report.ArmMetrics) {
        const pCI = arm.PrecisionCI ? ` [${fmt(arm.PrecisionCI.Lower)}, ${fmt(arm.PrecisionCI.Upper)}]` : '';
        const rCI = arm.RecallCI ? ` [${fmt(arm.RecallCI.Lower)}, ${fmt(arm.RecallCI.Upper)}]` : '';
        const fCI = arm.F1CI ? ` [${fmt(arm.F1CI.Lower)}, ${fmt(arm.F1CI.Upper)}]` : '';

        lines.push(
            `| \`${arm.ArmName}\` | ${fmt(arm.Precision)}${pCI} | ${fmt(arm.Recall)}${rCI} | ${fmt(arm.F1)}${fCI} | ${pct(arm.FalseFlagRateOnNew)} | ${fmt(arm.FlagsPerCheck, 2)} |`
        );
    }
    lines.push('');

    // Threshold Sweep
    lines.push('## 3. Threshold Arm: Vector Score Sweep');
    lines.push('');
    lines.push('| Vector Threshold | Precision | Recall | F1 | False-Flag Rate on New | Flags / Check |');
    lines.push('|---|---|---|---|---|---|');
    for (const row of report.ThresholdSweep) {
        lines.push(
            `| ${row.Threshold.toFixed(2)} | ${fmt(row.Precision)} | ${fmt(row.Recall)} | ${fmt(row.F1)} | ${pct(row.FalseFlagRateOnNew)} | ${fmt(row.FlagsPerCheck, 2)} |`
        );
    }
    lines.push('');

    // Decision Calibration
    lines.push('## 4. Decision Arm: Probability Calibration & Model Analysis');
    lines.push('');
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

    // Band Sweep
    lines.push('### Decision Band Sweep');
    lines.push('');
    lines.push('Calibrated columns band each candidate\'s out-of-fold calibrated probability.');
    lines.push('');
    lines.push('| Band Threshold | Raw Prec | Raw Rec | Raw False-Flag (New) | Raw Share | Cal Prec | Cal Rec | Cal False-Flag (New) | Cal Share |');
    lines.push('|---|---|---|---|---|---|---|---|---|');
    for (const row of report.DecisionBandSweep) {
        lines.push(
            `| ${row.Threshold.toFixed(2)} | ${fmt(row.RawPrecision)} | ${fmt(row.RawRecall)} | ${pct(row.RawFalseFlagRateOnNew)} | ${pct(row.RawShareCandidatesFlagged)} | ${fmt(row.CalibratedPrecision)} | ${fmt(row.CalibratedRecall)} | ${pct(row.CalibratedFalseFlagRateOnNew)} | ${pct(row.CalibratedShareCandidatesFlagged)} |`
        );
    }
    lines.push('');

    // Latency
    lines.push('## 5. Latency Analysis');
    lines.push('');
    lines.push(`**Budget**: ${report.Latency.EntryCheckBudgetMs} ms  `);
    lines.push(`**Entry Check Within Budget**: ${pct(report.Latency.EntryCheckWithinBudgetRate)} (p50: ${fmt(report.Latency.EntryCheckP50, 0)} ms, p95: ${fmt(report.Latency.EntryCheckP95, 0)} ms)`);
    lines.push('');
    lines.push('| Operation / Arm | p50 (ms) | p95 (ms) |');
    lines.push('|---|---|---|');
    lines.push(`| Vector Retrieval | ${fmt(report.Latency.RetrievalP50, 0)} | ${fmt(report.Latency.RetrievalP95, 0)} |`);
    if (report.Latency.ThresholdP50 !== null && report.Latency.ThresholdP50 !== undefined) {
        lines.push(`| Threshold Arm | ${fmt(report.Latency.ThresholdP50, 0)} | ${fmt(report.Latency.ThresholdP95, 0)} |`);
    }
    lines.push(`| Decision Arm | ${fmt(report.Latency.DecisionP50, 0)} | ${fmt(report.Latency.DecisionP95, 0)} |`);
    lines.push(`| Prompt Arm | ${fmt(report.Latency.PromptP50, 0)} | ${fmt(report.Latency.PromptP95, 0)} |`);
    lines.push(`| **Full Entry Check** (Retrieval + Decision) | **${fmt(report.Latency.EntryCheckP50, 0)}** | **${fmt(report.Latency.EntryCheckP95, 0)}** |`);
    lines.push('');

    // Cost
    lines.push('## 6. Cost Analysis');
    lines.push('');
    lines.push('| Arm | Total Cost ($) | Checks Run | Cost / 1,000 Checks ($) |');
    lines.push('|---|---|---|---|');
    for (const cost of report.Costs) {
        lines.push(
            `| \`${cost.ArmName}\` | $${cost.TotalCostUSD.toFixed(4)} | ${cost.TotalChecks} | $${cost.CostPer1000ChecksUSD.toFixed(4)} |`
        );
    }
    lines.push('');

    // Repeatability
    if (report.Repeatability) {
        lines.push('## 7. Repeatability (Rep 1 vs Rep 2)');
        lines.push('');
        lines.push('| Metric | Value |');
        lines.push('|---|---|');
        lines.push(`| Decision Probability Mean Absolute Difference | ${fmt(report.Repeatability.DecisionProbabilityMeanAbsDiff, 4)} |`);
        lines.push(`| Decision Flag Agreement Rate | ${pct(report.Repeatability.DecisionVerdictAgreementRate)} |`);
        lines.push(`| Prompt Recommendation Agreement Rate | ${pct(report.Repeatability.PromptRecommendationAgreementRate)} |`);
        lines.push('');
    }

    return lines.join('\n');
}

/**
 * Asserts that no record field text appears anywhere in the report content.
 * Throws an error if any distinctive non-trivial text value from corpusRecords is found.
 */
export function AssertNoRecordTextInReport(
    reportContent: string,
    corpusRecords: readonly CorpusRecord[]
): void {
    const lowerContent = reportContent.toLowerCase();

    for (const record of corpusRecords) {
        for (const val of Object.values(record.Values)) {
            const trimmed = String(val).trim();
            // Disqualify trivial or single-word strings (e.g. "true", numbers, short words)
            if (trimmed.length > 5 && !/^[0-9a-f-]{10,}$/i.test(trimmed)) {
                if (lowerContent.includes(trimmed.toLowerCase())) {
                    throw new Error(
                        `Sanitization violation: record text "${trimmed.slice(0, 30)}..." found in generated report!`
                    );
                }
            }
        }
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
