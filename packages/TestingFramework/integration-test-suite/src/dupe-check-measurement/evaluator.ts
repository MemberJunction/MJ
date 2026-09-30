/**
 * @fileoverview Pure evaluation engine for duplicate detection measurement.
 *
 * Implements:
 * - Retrieval miss accounting
 * - Pairwise precision, recall, F1 with clustered bootstrap confidence intervals
 * - Vector score threshold sweep (0.60 to 0.95)
 * - Decision probability calibration (ROC AUC, Brier, ECE, Platt A/B)
 * - Band sweep (0.10 to 0.90) for raw and calibrated probabilities
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
    ApplyPlatt,
    AssertOutputOutsideRepo,
    BrierScore,
    CalibrationBins,
    ConfidenceInterval,
    CreateSeededRandom,
    DECISION_EVAL_ECE_BINS,
    DECISION_EVAL_SEED,
    FitPlatt,
    LabelledProbability,
    OutOfFoldPlatt,
    PlattParameters,
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
 *
 * `decisionThreshold`, when given, bands the `decision` arm's raw DecisionProbability instead of
 * its DecisionFlagged. The `decision · production` arm ignores it.
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
                // Production's rule, whatever decisionThreshold says: the vector threshold, then the
                // provider's band on the calibrated probability (DecisionFlagged). DecisionProbability
                // is raw, so banding it here would not be production.
                flagged = candidate.PassedThreshold && candidate.DecisionFlagged;
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

/**
 * Computes decision probability calibration per model:
 * ROC AUC, Brier Score, ECE, and fitted Platt parameters A and B.
 */
export function ComputeDecisionCalibration(
    checks: readonly RecordCheckObservation[],
    seed: number = DECISION_EVAL_SEED
): DecisionModelCalibration[] {
    const rep1Checks = checks.filter(c => c.Rep === 1);

    // Group candidate pairs by model name
    const pairsByModel = new Map<string, { cand: CandidatePairObservation; check: RecordCheckObservation }[]>();

    for (const check of rep1Checks) {
        const modelName = check.DecisionResult?.Model ?? 'Default';
        for (const cand of check.Candidates) {
            if (cand.DecisionProbability !== null) {
                const list = pairsByModel.get(modelName) ?? [];
                list.push({ cand, check });
                pairsByModel.set(modelName, list);
            }
        }
    }

    const results: DecisionModelCalibration[] = [];

    for (const [modelName, items] of pairsByModel) {
        if (items.length === 0) {
            continue;
        }

        const rawPoints: LabelledProbability[] = items.map(i => ({
            Probability: i.cand.DecisionProbability as number,
            Positive: i.cand.IsDuplicatePair,
        }));
        const rawAuc = RocAuc(rawPoints);
        const rawBrier = BrierScore(rawPoints);
        const rawBins = CalibrationBins(rawPoints, DECISION_EVAL_ECE_BINS);
        const rawEce = rawBins.ECE;

        // 5-fold OOF Platt calibration
        const oofProbs = OutOfFoldPlatt(rawPoints, 5, seed);
        let calAuc: number | null = null;
        let calBrier: number | null = null;
        let calEce: number | null = null;

        if (oofProbs !== null && oofProbs.length === rawPoints.length) {
            const calPoints: LabelledProbability[] = oofProbs.map((p, idx) => ({
                Probability: p,
                Positive: rawPoints[idx].Positive,
            }));
            calAuc = RocAuc(calPoints);
            calBrier = BrierScore(calPoints);
            const calBins = CalibrationBins(calPoints, DECISION_EVAL_ECE_BINS);
            calEce = calBins.ECE;
        }

        // Fit Platt parameters on all data points
        const plattFit = FitPlatt(rawPoints);

        results.push({
            ModelName: modelName,
            TotalCandidates: items.length,
            RawAuc: rawAuc,
            CalibratedAuc: calAuc,
            RawBrier: rawBrier,
            CalibratedBrier: calBrier,
            RawEce: rawEce,
            CalibratedEce: calEce,
            PlattA: plattFit.A,
            PlattB: plattFit.B,
        });
    }

    return results;
}

/**
 * Sweeps the decision probability threshold ("Uncertain" band lower bound) from 0.10 to 0.90,
 * reporting raw and calibrated precision, recall, false-flag rate on new, and candidate share.
 */
export function ComputeDecisionBandSweep(
    checks: readonly RecordCheckObservation[],
    plattFits: readonly DecisionModelCalibration[],
    thresholds: readonly number[] = BAND_SWEEP_THRESHOLDS
): DecisionBandSweepRow[] {
    const rep1Checks = checks.filter(c => c.Rep === 1);
    const dupeCount = rep1Checks.filter(c => c.Label.Label === 'duplicate').length;
    const newCount = rep1Checks.filter(c => c.Label.Label === 'new').length;

    const plattMap = new Map<string, Pick<PlattParameters, 'A' | 'B'>>();
    for (const fit of plattFits) {
        plattMap.set(fit.ModelName, { A: fit.PlattA, B: fit.PlattB });
    }

    // Collect all candidates with decision probabilities
    interface CandidateWithProb {
        Cand: CandidatePairObservation;
        Check: RecordCheckObservation;
        RawProb: number;
        CalProb: number;
    }

    const scoredCandidates: CandidateWithProb[] = [];
    for (const check of rep1Checks) {
        const modelName = check.DecisionResult?.Model ?? 'Default';
        const fit = plattMap.get(modelName) ?? { A: 1, B: 0 };
        for (const cand of check.Candidates) {
            if (cand.DecisionProbability !== null) {
                const rawProb = cand.DecisionProbability;
                const calProb = ApplyPlatt(rawProb, fit);
                scoredCandidates.push({ Cand: cand, Check: check, RawProb: rawProb, CalProb: calProb });
            }
        }
    }

    const totalScored = scoredCandidates.length;

    return thresholds.map(threshold => {
        // Raw evaluation at threshold
        let rawTp = 0;
        let rawFp = 0;
        let rawNewFlagged = 0;
        let rawFlaggedCount = 0;

        // Calibrated evaluation at threshold
        let calTp = 0;
        let calFp = 0;
        let calNewFlagged = 0;
        let calFlaggedCount = 0;

        for (const check of rep1Checks) {
            const isNew = check.Label.Label === 'new';
            let checkRawFlagged = false;
            let checkCalFlagged = false;

            const checkCandidates = scoredCandidates.filter(sc => sc.Check === check);
            for (const { Cand, RawProb, CalProb } of checkCandidates) {
                if (RawProb >= threshold) {
                    rawFlaggedCount++;
                    checkRawFlagged = true;
                    if (Cand.IsDuplicatePair) {
                        rawTp++;
                    } else {
                        rawFp++;
                    }
                }
                if (CalProb >= threshold) {
                    calFlaggedCount++;
                    checkCalFlagged = true;
                    if (Cand.IsDuplicatePair) {
                        calTp++;
                    } else {
                        calFp++;
                    }
                }
            }

            if (isNew) {
                if (checkRawFlagged) {
                    rawNewFlagged++;
                }
                if (checkCalFlagged) {
                    calNewFlagged++;
                }
            }
        }

        const rawP = rawTp + rawFp > 0 ? rawTp / (rawTp + rawFp) : 0;
        const rawR = dupeCount > 0 ? rawTp / dupeCount : 0;
        const rawFalseFlagOnNew = newCount > 0 ? rawNewFlagged / newCount : 0;
        const rawShare = totalScored > 0 ? rawFlaggedCount / totalScored : 0;

        const calP = calTp + calFp > 0 ? calTp / (calTp + calFp) : 0;
        const calR = dupeCount > 0 ? calTp / dupeCount : 0;
        const calFalseFlagOnNew = newCount > 0 ? calNewFlagged / newCount : 0;
        const calShare = totalScored > 0 ? calFlaggedCount / totalScored : 0;

        return {
            Threshold: threshold,
            RawPrecision: rawP,
            RawRecall: rawR,
            RawFalseFlagRateOnNew: rawFalseFlagOnNew,
            RawShareCandidatesFlagged: rawShare,
            CalibratedPrecision: calP,
            CalibratedRecall: calR,
            CalibratedFalseFlagRateOnNew: calFalseFlagOnNew,
            CalibratedShareCandidatesFlagged: calShare,
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
                // The verdict is production's flag (the calibrated band), not the raw probability.
                if (cand1.DecisionFlagged === cand2.DecisionFlagged) {
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
    const bandSweep = ComputeDecisionBandSweep(checks, calibration);
    const latency = ComputeLatencySummary(checks);
    const costs = ComputeCostSummary(checks);
    const repeatability = options.Reps >= 2 ? ComputeRepeatability(checks) : undefined;

    const notes: string[] = [
        'The corpus is synthetic (LLM rewrites of MJ metadata); refit on real labelled duplicates before relying on it.',
        'A duplicate whose source was not retrieved is a false negative for all arms (reported separately in retrieval).',
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
