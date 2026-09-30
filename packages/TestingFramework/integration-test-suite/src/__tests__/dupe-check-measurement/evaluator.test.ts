/**
 * @fileoverview Unit tests for dupe check measurement evaluator.
 *
 * Verifies:
 * - Hand-calculated precision, recall, F1, false-flag rate
 * - Retrieval miss accounting: missed source is a false negative for all arms
 * - Threshold sweep and Decision band sweep
 * - Platt calibration and ECE calculation
 * - Latency budget compliance
 * - Repeatability across repetitions
 *
 * All tests use canned mocks — zero model or DB calls.
 */

import { describe, expect, it } from 'vitest';
import {
    ApplyPlatt,
    BrierScore,
    CalibrationBins,
    DECISION_EVAL_CALIBRATION_FOLDS,
    DECISION_EVAL_ECE_BINS,
    DECISION_EVAL_SEED,
    FitPlatt,
    LabelledProbability,
    OutOfFoldPlatt,
    RocAuc,
} from '@memberjunction/testing-engine';
import {
    ComputeArmPerformance,
    ComputeCostSummary,
    ComputeDecisionBandSweep,
    ComputeDecisionCalibration,
    ComputeLatencySummary,
    ComputeRepeatability,
    ComputeRetrievalMetrics,
    ComputeThresholdSweep,
    DUPLICATE_ENTRY_CHECK_BUDGET_MS,
    EvaluateArmConfusion,
} from '../../dupe-check-measurement/evaluator';
import type {
    CandidatePairObservation,
    RecordCheckObservation,
} from '../../dupe-check-measurement/types';

/** One candidate of a decision-arm fixture. */
interface CandidateSpec {
    Id: string;
    Source?: boolean;
    Probability: number;
}

/** A rep-1 check with a decision call, recorded as the rig records it (flagged at a raw 0.5). */
function decisionCheck(id: string, label: 'duplicate' | 'new', candidates: readonly CandidateSpec[]): RecordCheckObservation {
    const sourceId = candidates.find(c => c.Source === true)?.Id ?? `missing-${id}`;
    return {
        Rep: 1,
        RecordId: id,
        Label: label === 'duplicate'
            ? { Id: id, Label: 'duplicate', SourceRecordId: sourceId }
            : { Id: id, Label: 'new', NearRecordId: candidates[0]?.Id ?? `near-${id}` },
        RetrievalLatencyMs: 10,
        DecisionResult: { LatencyMs: 100, Model: 'm1', PromptRunId: null, CostUSD: null },
        Candidates: candidates.map(c => ({
            RecordId: id,
            CandidateId: c.Id,
            IsDuplicatePair: label === 'duplicate' && c.Source === true,
            VectorScore: 0.9,
            InTopK: true,
            PassedThreshold: true,
            ThresholdFlagged: true,
            DecisionProbability: c.Probability,
            DecisionFlagged: c.Probability >= 0.5,
            PromptRecommendation: null,
            PromptFlagged: false,
        })),
    };
}

describe('Retrieval Metrics and Miss Accounting', () => {
    it('correctly tallies sources in top-K, sources after threshold, and missed sources', () => {
        // 3 duplicate checks:
        // Check 1: source found in Top-K (VectorScore = 0.88, PassedThreshold = true)
        // Check 2: source found in Top-K but below threshold (VectorScore = 0.65, PassedThreshold = false)
        // Check 3: source NOT found in Top-K at all
        const checks: RecordCheckObservation[] = [
            {
                Rep: 1,
                RecordId: 'r1',
                Label: { Id: 'r1', Label: 'duplicate', SourceRecordId: 's1' },
                RetrievalLatencyMs: 50,
                ThresholdLatencyMs: 1,
                Candidates: [
                    {
                        RecordId: 'r1',
                        CandidateId: 's1',
                        IsDuplicatePair: true,
                        VectorScore: 0.88,
                        InTopK: true,
                        PassedThreshold: true,
                        ThresholdFlagged: true,
                        DecisionProbability: 0.9,
                        DecisionFlagged: true,
                        PromptRecommendation: 'Merge',
                        PromptFlagged: true,
                    },
                ],
            },
            {
                Rep: 1,
                RecordId: 'r2',
                Label: { Id: 'r2', Label: 'duplicate', SourceRecordId: 's2' },
                RetrievalLatencyMs: 45,
                ThresholdLatencyMs: 1,
                Candidates: [
                    {
                        RecordId: 'r2',
                        CandidateId: 's2',
                        IsDuplicatePair: true,
                        VectorScore: 0.65,
                        InTopK: true,
                        PassedThreshold: false,
                        ThresholdFlagged: false,
                        DecisionProbability: null,
                        DecisionFlagged: false,
                        PromptRecommendation: null,
                        PromptFlagged: false,
                    },
                ],
            },
            {
                Rep: 1,
                RecordId: 'r3',
                Label: { Id: 'r3', Label: 'duplicate', SourceRecordId: 's3' },
                RetrievalLatencyMs: 40,
                ThresholdLatencyMs: 1,
                Candidates: [
                    {
                        RecordId: 'r3',
                        CandidateId: 'other-candidate',
                        IsDuplicatePair: false,
                        VectorScore: 0.72,
                        InTopK: true,
                        PassedThreshold: false,
                        ThresholdFlagged: false,
                        DecisionProbability: null,
                        DecisionFlagged: false,
                        PromptRecommendation: null,
                        PromptFlagged: false,
                    },
                ],
            },
        ];

        const retrieval = ComputeRetrievalMetrics(checks);
        expect(retrieval.TotalDuplicates).toBe(3);
        expect(retrieval.SourcesInTopK).toBe(2);
        expect(retrieval.SourcesInTopKRate).toBeCloseTo(2 / 3);
        expect(retrieval.SourcesAfterThreshold).toBe(1);
        expect(retrieval.SourcesAfterThresholdRate).toBeCloseTo(1 / 3);
        expect(retrieval.SourcesMissed).toBe(2);
        expect(retrieval.SourcesMissedRate).toBeCloseTo(2 / 3);
    });

    it('accounts for retrieval misses as false negatives across all arms (TP + FN = total duplicates)', () => {
        // 2 duplicate checks + 1 new check
        // Check 1 (dupe): source retrieved and flagged by arm -> TP
        // Check 2 (dupe): source never retrieved (candidate list empty) -> missed, so FN
        // Check 3 (new): 1 candidate retrieved and falsely flagged -> FP
        const checks: RecordCheckObservation[] = [
            {
                Rep: 1,
                RecordId: 'd1',
                Label: { Id: 'd1', Label: 'duplicate', SourceRecordId: 's1' },
                RetrievalLatencyMs: 30,
                ThresholdLatencyMs: 1,
                Candidates: [
                    {
                        RecordId: 'd1',
                        CandidateId: 's1',
                        IsDuplicatePair: true,
                        VectorScore: 0.9,
                        InTopK: true,
                        PassedThreshold: true,
                        ThresholdFlagged: true,
                        DecisionProbability: 0.95,
                        DecisionFlagged: true,
                        PromptRecommendation: 'Merge',
                        PromptFlagged: true,
                    },
                ],
            },
            {
                Rep: 1,
                RecordId: 'd2',
                Label: { Id: 'd2', Label: 'duplicate', SourceRecordId: 's2' },
                RetrievalLatencyMs: 30,
                ThresholdLatencyMs: 1,
                Candidates: [], // Missed at retrieval!
            },
            {
                Rep: 1,
                RecordId: 'n1',
                Label: { Id: 'n1', Label: 'new', NearRecordId: 's3' },
                RetrievalLatencyMs: 30,
                ThresholdLatencyMs: 1,
                Candidates: [
                    {
                        RecordId: 'n1',
                        CandidateId: 's3',
                        IsDuplicatePair: false,
                        VectorScore: 0.85,
                        InTopK: true,
                        PassedThreshold: true,
                        ThresholdFlagged: true,
                        DecisionProbability: 0.8,
                        DecisionFlagged: true,
                        PromptRecommendation: 'Merge',
                        PromptFlagged: true,
                    },
                ],
            },
        ];

        for (const arm of ['threshold', 'decision', 'prompt'] as const) {
            const confusion = EvaluateArmConfusion(checks, arm);
            expect(confusion.TotalDuplicates).toBe(2);
            expect(confusion.TP).toBe(1);
            expect(confusion.FN).toBe(1); // The missed source in d2 is counted as FN!
            expect(confusion.TP + confusion.FN).toBe(2); // Total positive pairs equals total duplicates
            expect(confusion.FP).toBe(1); // Falsely flagged candidate for new record n1
            expect(confusion.TotalNew).toBe(1);
            expect(confusion.NewFlaggedCount).toBe(1);
        }
    });
});

describe('ComputeArmPerformance against hand-calculated values', () => {
    it('computes exact precision, recall, F1, and false-flag rate on new records', () => {
        // Ground truth:
        // 4 records: 2 duplicates (d1, d2), 2 new (n1, n2)
        // d1: candidate s1 flagged (TP)
        // d2: candidate s2 NOT flagged (FN)
        // n1: candidate s3 flagged (FP)
        // n2: no candidate flagged
        //
        // Hand calculations:
        // TP = 1, FP = 1, FN = 1
        // Precision = 1 / (1 + 1) = 0.50
        // Recall = 1 / 2 = 0.50
        // F1 = 2 * (0.5 * 0.5) / (0.5 + 0.5) = 0.50
        // Total new records = 2, new flagged = 1 -> FalseFlagRateOnNew = 0.50 (50%)
        // Total checks = 4, total flagged pairs = 2 -> FlagsPerCheck = 2 / 4 = 0.50
        const checks: RecordCheckObservation[] = [
            {
                Rep: 1,
                RecordId: 'd1',
                Label: { Id: 'd1', Label: 'duplicate', SourceRecordId: 's1' },
                RetrievalLatencyMs: 20,
                ThresholdLatencyMs: 1,
                Candidates: [
                    {
                        RecordId: 'd1',
                        CandidateId: 's1',
                        IsDuplicatePair: true,
                        VectorScore: 0.9,
                        InTopK: true,
                        PassedThreshold: true,
                        ThresholdFlagged: true,
                        DecisionProbability: 0.9,
                        DecisionFlagged: true,
                        PromptRecommendation: 'Merge',
                        PromptFlagged: true,
                    },
                ],
            },
            {
                Rep: 1,
                RecordId: 'd2',
                Label: { Id: 'd2', Label: 'duplicate', SourceRecordId: 's2' },
                RetrievalLatencyMs: 20,
                ThresholdLatencyMs: 1,
                Candidates: [
                    {
                        RecordId: 'd2',
                        CandidateId: 's2',
                        IsDuplicatePair: true,
                        VectorScore: 0.7,
                        InTopK: true,
                        PassedThreshold: true,
                        ThresholdFlagged: false,
                        DecisionProbability: 0.2,
                        DecisionFlagged: false,
                        PromptRecommendation: 'NotDuplicate',
                        PromptFlagged: false,
                    },
                ],
            },
            {
                Rep: 1,
                RecordId: 'n1',
                Label: { Id: 'n1', Label: 'new', NearRecordId: 's3' },
                RetrievalLatencyMs: 20,
                ThresholdLatencyMs: 1,
                Candidates: [
                    {
                        RecordId: 'n1',
                        CandidateId: 's3',
                        IsDuplicatePair: false,
                        VectorScore: 0.85,
                        InTopK: true,
                        PassedThreshold: true,
                        ThresholdFlagged: true,
                        DecisionProbability: 0.75,
                        DecisionFlagged: true,
                        PromptRecommendation: 'Uncertain',
                        PromptFlagged: true,
                    },
                ],
            },
            {
                Rep: 1,
                RecordId: 'n2',
                Label: { Id: 'n2', Label: 'new', NearRecordId: 's4' },
                RetrievalLatencyMs: 20,
                ThresholdLatencyMs: 1,
                Candidates: [
                    {
                        RecordId: 'n2',
                        CandidateId: 's4',
                        IsDuplicatePair: false,
                        VectorScore: 0.65,
                        InTopK: true,
                        PassedThreshold: true,
                        ThresholdFlagged: false,
                        DecisionProbability: 0.1,
                        DecisionFlagged: false,
                        PromptRecommendation: 'NotDuplicate',
                        PromptFlagged: false,
                    },
                ],
            },
        ];

        const metrics = ComputeArmPerformance(checks, 'threshold', { Seed: 12345, BootstrapResamples: 50 });
        expect(metrics.Precision).toBeCloseTo(0.5);
        expect(metrics.Recall).toBeCloseTo(0.5);
        expect(metrics.F1).toBeCloseTo(0.5);
        expect(metrics.FalseFlagRateOnNew).toBeCloseTo(0.5);
        expect(metrics.FlagsPerCheck).toBeCloseTo(0.5);
        expect(metrics.PrecisionCI).not.toBeNull();
        expect(metrics.RecallCI).not.toBeNull();
        expect(metrics.F1CI).not.toBeNull();
    });

    it('evaluates production arm views (PassedThreshold gating) and prompt flag rules (Merge/Uncertain)', () => {
        // Candidate 1: PassedThreshold: false, DecisionFlagged: true, PromptFlagged: true (Uncertain)
        // For 'decision' / 'prompt': candidate is flagged!
        // For 'decision · production' / 'prompt · production': candidate is NOT flagged because PassedThreshold is false!
        const checks: RecordCheckObservation[] = [
            {
                Rep: 1,
                RecordId: 'd1',
                Label: { Id: 'd1', Label: 'duplicate', SourceRecordId: 's1' },
                RetrievalLatencyMs: 20,
                Candidates: [
                    {
                        RecordId: 'd1',
                        CandidateId: 's1',
                        IsDuplicatePair: true,
                        VectorScore: 0.70,
                        InTopK: true,
                        PassedThreshold: false,
                        ThresholdFlagged: false,
                        DecisionProbability: 0.85,
                        DecisionFlagged: true,
                        PromptRecommendation: 'Uncertain',
                        PromptFlagged: true,
                    },
                ],
            },
            {
                Rep: 1,
                RecordId: 'd2',
                Label: { Id: 'd2', Label: 'duplicate', SourceRecordId: 's2' },
                RetrievalLatencyMs: 20,
                Candidates: [
                    {
                        RecordId: 'd2',
                        CandidateId: 's2',
                        IsDuplicatePair: true,
                        VectorScore: 0.90,
                        InTopK: true,
                        PassedThreshold: true,
                        ThresholdFlagged: true,
                        DecisionProbability: 0.90,
                        DecisionFlagged: true,
                        PromptRecommendation: 'Merge',
                        PromptFlagged: true,
                    },
                ],
            },
        ];

        // For raw decision and prompt: both d1 and d2 are flagged -> Recall = 1.0 (2 / 2)
        const decMetrics = ComputeArmPerformance(checks, 'decision');
        expect(decMetrics.Recall).toBe(1.0);

        const promptMetrics = ComputeArmPerformance(checks, 'prompt');
        expect(promptMetrics.Recall).toBe(1.0);

        // For production views: only d2 passed threshold, so d1 is NOT flagged -> Recall = 0.5 (1 / 2)
        const decProdMetrics = ComputeArmPerformance(checks, 'decision · production');
        expect(decProdMetrics.Recall).toBe(0.5);

        const promptProdMetrics = ComputeArmPerformance(checks, 'prompt · production');
        expect(promptProdMetrics.Recall).toBe(0.5);
    });
});

describe('ComputeThresholdSweep', () => {
    it('sweeps vector thresholds and computes monotonic recall behavior', () => {
        const checks: RecordCheckObservation[] = [
            {
                Rep: 1,
                RecordId: 'd1',
                Label: { Id: 'd1', Label: 'duplicate', SourceRecordId: 's1' },
                RetrievalLatencyMs: 20,
                ThresholdLatencyMs: 1,
                Candidates: [
                    {
                        RecordId: 'd1',
                        CandidateId: 's1',
                        IsDuplicatePair: true,
                        VectorScore: 0.82,
                        InTopK: true,
                        PassedThreshold: true,
                        ThresholdFlagged: true,
                        DecisionProbability: null,
                        DecisionFlagged: false,
                        PromptRecommendation: null,
                        PromptFlagged: false,
                    },
                ],
            },
        ];

        const sweep = ComputeThresholdSweep(checks, [0.70, 0.80, 0.90]);
        expect(sweep).toHaveLength(3);
        // At threshold 0.70: score 0.82 >= 0.70 -> Recall = 1
        expect(sweep[0].Threshold).toBe(0.70);
        expect(sweep[0].Recall).toBe(1.0);
        // At threshold 0.80: score 0.82 >= 0.80 -> Recall = 1
        expect(sweep[1].Threshold).toBe(0.80);
        expect(sweep[1].Recall).toBe(1.0);
        // At threshold 0.90: score 0.82 < 0.90 -> Recall = 0
        expect(sweep[2].Threshold).toBe(0.90);
        expect(sweep[2].Recall).toBe(0.0);
    });
});

describe('ComputeDecisionCalibration and ComputeDecisionBandSweep', () => {
    it('computes calibration metrics and fitted Platt parameters', () => {
        // Canned pairs with decision probabilities
        const candidates: CandidatePairObservation[] = [
            {
                RecordId: 'd1',
                CandidateId: 'c1',
                IsDuplicatePair: true,
                VectorScore: 0.9,
                InTopK: true,
                PassedThreshold: true,
                ThresholdFlagged: true,
                DecisionProbability: 0.95,
                DecisionFlagged: true,
                PromptRecommendation: null,
                PromptFlagged: false,
            },
            {
                RecordId: 'd2',
                CandidateId: 'c2',
                IsDuplicatePair: true,
                VectorScore: 0.85,
                InTopK: true,
                PassedThreshold: true,
                ThresholdFlagged: true,
                DecisionProbability: 0.8,
                DecisionFlagged: true,
                PromptRecommendation: null,
                PromptFlagged: false,
            },
            {
                RecordId: 'n1',
                CandidateId: 'c3',
                IsDuplicatePair: false,
                VectorScore: 0.8,
                InTopK: true,
                PassedThreshold: true,
                ThresholdFlagged: true,
                DecisionProbability: 0.15,
                DecisionFlagged: false,
                PromptRecommendation: null,
                PromptFlagged: false,
            },
            {
                RecordId: 'n2',
                CandidateId: 'c4',
                IsDuplicatePair: false,
                VectorScore: 0.75,
                InTopK: true,
                PassedThreshold: true,
                ThresholdFlagged: true,
                DecisionProbability: 0.05,
                DecisionFlagged: false,
                PromptRecommendation: null,
                PromptFlagged: false,
            },
        ];

        const checks: RecordCheckObservation[] = [
            {
                Rep: 1,
                RecordId: 'd1',
                Label: { Id: 'd1', Label: 'duplicate', SourceRecordId: 'c1' },
                RetrievalLatencyMs: 25,
                ThresholdLatencyMs: 1,
                DecisionResult: { LatencyMs: 200, Model: 'gpt-4o', PromptRunId: 'pr-1', CostUSD: 0.002 },
                Candidates: [candidates[0]],
            },
            {
                Rep: 1,
                RecordId: 'd2',
                Label: { Id: 'd2', Label: 'duplicate', SourceRecordId: 'c2' },
                RetrievalLatencyMs: 25,
                ThresholdLatencyMs: 1,
                DecisionResult: { LatencyMs: 210, Model: 'gpt-4o', PromptRunId: 'pr-2', CostUSD: 0.002 },
                Candidates: [candidates[1]],
            },
            {
                Rep: 1,
                RecordId: 'n1',
                Label: { Id: 'n1', Label: 'new', NearRecordId: 'c3' },
                RetrievalLatencyMs: 25,
                ThresholdLatencyMs: 1,
                DecisionResult: { LatencyMs: 190, Model: 'gpt-4o', PromptRunId: 'pr-3', CostUSD: 0.002 },
                Candidates: [candidates[2]],
            },
            {
                Rep: 1,
                RecordId: 'n2',
                Label: { Id: 'n2', Label: 'new', NearRecordId: 'c4' },
                RetrievalLatencyMs: 25,
                ThresholdLatencyMs: 1,
                DecisionResult: { LatencyMs: 195, Model: 'gpt-4o', PromptRunId: 'pr-4', CostUSD: 0.002 },
                Candidates: [candidates[3]],
            },
        ];

        const calibration = ComputeDecisionCalibration(checks);
        expect(calibration).toHaveLength(1);
        expect(calibration[0].ModelName).toBe('gpt-4o');
        expect(calibration[0].TotalCandidates).toBe(4);
        expect(calibration[0].RawAuc).toBe(1.0); // Perfect ranking in canned data
        expect(calibration[0].RawBrier).toBeLessThan(0.05);
        expect(typeof calibration[0].PlattA).toBe('number');
        expect(typeof calibration[0].PlattB).toBe('number');

        const bandSweep = ComputeDecisionBandSweep(checks, [0.30, 0.50, 0.70]);
        expect(bandSweep).toHaveLength(3);
        expect(bandSweep[1].Threshold).toBe(0.50);
        expect(bandSweep[1].RawPrecision).toBe(1.0);
        expect(bandSweep[1].RawRecall).toBe(1.0);
        expect(bandSweep[1].RawFalseFlagRateOnNew).toBe(0.0);
    });
});

describe('ComputeLatencySummary and Budget Compliance', () => {
    it('evaluates p50, p95, and compliance with the 1500 ms budget', () => {
        const checks: RecordCheckObservation[] = [
            {
                Rep: 1,
                RecordId: 'r1',
                Label: { Id: 'r1', Label: 'duplicate', SourceRecordId: 's1' },
                RetrievalLatencyMs: 100,
                ThresholdLatencyMs: 2,
                DecisionResult: { LatencyMs: 500, Model: 'm1', PromptRunId: null, CostUSD: null },
                Candidates: [],
            },
            {
                Rep: 1,
                RecordId: 'r2',
                Label: { Id: 'r2', Label: 'duplicate', SourceRecordId: 's2' },
                RetrievalLatencyMs: 200,
                ThresholdLatencyMs: 2,
                DecisionResult: { LatencyMs: 1400, Model: 'm1', PromptRunId: null, CostUSD: null }, // Total 1600 > 1500
                Candidates: [],
            },
        ];

        const lat = ComputeLatencySummary(checks);
        expect(lat.EntryCheckBudgetMs).toBe(DUPLICATE_ENTRY_CHECK_BUDGET_MS);
        // r1 total = 600 ms (<= 1500), r2 total = 1600 ms (> 1500)
        // Compliance: 1 / 2 = 50%
        expect(lat.EntryCheckWithinBudgetRate).toBe(0.5);
        expect(lat.RetrievalP50).toBeCloseTo(150);
    });
});

describe('ComputeCostSummary', () => {
    it('computes cost per 1000 checks', () => {
        const checks: RecordCheckObservation[] = [
            {
                Rep: 1,
                RecordId: 'r1',
                Label: { Id: 'r1', Label: 'duplicate', SourceRecordId: 's1' },
                RetrievalLatencyMs: 20,
                ThresholdLatencyMs: 1,
                DecisionResult: { LatencyMs: 100, Model: 'm1', PromptRunId: null, CostUSD: 0.005 },
                PromptResult: { LatencyMs: 300, PromptRunId: null, CostUSD: 0.02 },
                Candidates: [],
            },
            {
                Rep: 1,
                RecordId: 'r2',
                Label: { Id: 'r2', Label: 'new', NearRecordId: 's2' },
                RetrievalLatencyMs: 20,
                ThresholdLatencyMs: 1,
                DecisionResult: { LatencyMs: 100, Model: 'm1', PromptRunId: null, CostUSD: 0.005 },
                PromptResult: { LatencyMs: 300, PromptRunId: null, CostUSD: 0.02 },
                Candidates: [],
            },
        ];

        const costs = ComputeCostSummary(checks);
        const decisionCost = costs.find(c => c.ArmName === 'decision');
        expect(decisionCost?.TotalCostUSD).toBe(0.01);
        expect(decisionCost?.CostPer1000ChecksUSD).toBe(5.0);

        const promptCost = costs.find(c => c.ArmName === 'prompt');
        expect(promptCost?.TotalCostUSD).toBe(0.04);
        expect(promptCost?.CostPer1000ChecksUSD).toBe(20.0);
    });
});

describe('ComputeRepeatability', () => {
    it('returns 0 probability difference and 100% agreement on identical repeat', () => {
        const baseCheck = (rep: number): RecordCheckObservation => ({
            Rep: rep,
            RecordId: 'r1',
            Label: { Id: 'r1', Label: 'duplicate', SourceRecordId: 's1' },
            RetrievalLatencyMs: 20,
            ThresholdLatencyMs: 1,
            DecisionResult: { LatencyMs: 100, Model: 'm1', PromptRunId: null, CostUSD: null },
            PromptResult: { LatencyMs: 200, PromptRunId: null, CostUSD: null },
            Candidates: [
                {
                    RecordId: 'r1',
                    CandidateId: 'c1',
                    IsDuplicatePair: true,
                    VectorScore: 0.88,
                    InTopK: true,
                    PassedThreshold: true,
                    ThresholdFlagged: true,
                    DecisionProbability: 0.85,
                    DecisionFlagged: true,
                    PromptRecommendation: 'Merge',
                    PromptFlagged: true,
                },
            ],
        });

        const checks = [baseCheck(1), baseCheck(2)];
        const rep = ComputeRepeatability(checks);
        expect(rep?.DecisionProbabilityMeanAbsDiff).toBe(0);
        expect(rep?.DecisionVerdictAgreementRate).toBe(1.0);
        expect(rep?.PromptRecommendationAgreementRate).toBe(1.0);
    });

    it('detects variance when repetitions diverge', () => {
        const c1: RecordCheckObservation = {
            Rep: 1,
            RecordId: 'r1',
            Label: { Id: 'r1', Label: 'duplicate', SourceRecordId: 's1' },
            RetrievalLatencyMs: 20,
            ThresholdLatencyMs: 1,
            DecisionResult: { LatencyMs: 100, Model: 'm1', PromptRunId: null, CostUSD: null },
            PromptResult: { LatencyMs: 200, PromptRunId: null, CostUSD: null },
            Candidates: [
                {
                    RecordId: 'r1',
                    CandidateId: 'c1',
                    IsDuplicatePair: true,
                    VectorScore: 0.88,
                    InTopK: true,
                    PassedThreshold: true,
                    ThresholdFlagged: true,
                    DecisionProbability: 0.8,
                    DecisionFlagged: true,
                    PromptRecommendation: 'Merge',
                    PromptFlagged: true,
                },
            ],
        };

        const c2: RecordCheckObservation = {
            Rep: 2,
            RecordId: 'r1',
            Label: { Id: 'r1', Label: 'duplicate', SourceRecordId: 's1' },
            RetrievalLatencyMs: 20,
            ThresholdLatencyMs: 1,
            DecisionResult: { LatencyMs: 100, Model: 'm1', PromptRunId: null, CostUSD: null },
            PromptResult: { LatencyMs: 200, PromptRunId: null, CostUSD: null },
            Candidates: [
                {
                    RecordId: 'r1',
                    CandidateId: 'c1',
                    IsDuplicatePair: true,
                    VectorScore: 0.88,
                    InTopK: true,
                    PassedThreshold: true,
                    ThresholdFlagged: true,
                    DecisionProbability: 0.4, // Flipped below 0.5!
                    DecisionFlagged: false,
                    PromptRecommendation: 'Uncertain', // Diverged!
                    PromptFlagged: true,
                },
            ],
        };

        const rep = ComputeRepeatability([c1, c2]);
        expect(rep?.DecisionProbabilityMeanAbsDiff).toBeCloseTo(0.4);
        expect(rep?.DecisionVerdictAgreementRate).toBe(0.0);
        expect(rep?.PromptRecommendationAgreementRate).toBe(0.0);
    });
});

/**
 * 12 duplicate and 12 new records, two candidates each, answered by one model whose raw
 * probabilities run high for similar records that are not duplicates.
 */
function calibrationChecks(): RecordCheckObservation[] {
    const sources = [0.97, 0.95, 0.93, 0.92, 0.9, 0.88, 0.86, 0.85, 0.8, 0.75, 0.7, 0.6];
    const dupeOthers = [0.1, 0.2, 0.05, 0.3, 0.15, 0.4, 0.1, 0.25, 0.5, 0.2, 0.1, 0.3];
    const nearNews = [0.9, 0.85, 0.8, 0.75, 0.7, 0.65, 0.6, 0.55, 0.5, 0.4, 0.3, 0.2];
    const otherNews = [0.1, 0.05, 0.2, 0.15, 0.1, 0.3, 0.05, 0.1, 0.2, 0.1, 0.05, 0.1];
    const checks: RecordCheckObservation[] = [];
    sources.forEach((p, i) => {
        checks.push(decisionCheck(`d${i}`, 'duplicate', [
            { Id: `s${i}`, Source: true, Probability: p },
            { Id: `o${i}`, Probability: dupeOthers[i] },
        ]));
    });
    nearNews.forEach((p, i) => {
        checks.push(decisionCheck(`n${i}`, 'new', [
            { Id: `near${i}`, Probability: p },
            { Id: `far${i}`, Probability: otherNews[i] },
        ]));
    });
    return checks;
}

/** The answered candidates in check order, the order the evaluator scores them in. */
function answeredPoints(checks: readonly RecordCheckObservation[]): { Check: RecordCheckObservation; Candidate: CandidatePairObservation; Point: LabelledProbability }[] {
    const points: { Check: RecordCheckObservation; Candidate: CandidatePairObservation; Point: LabelledProbability }[] = [];
    for (const check of checks) {
        for (const candidate of check.Candidates) {
            if (candidate.DecisionProbability !== null) {
                points.push({ Check: check, Candidate: candidate, Point: { Probability: candidate.DecisionProbability, Positive: candidate.IsDuplicatePair } });
            }
        }
    }
    return points;
}

/** Precision, recall, false flags on new records and share flagged, counted by hand from given probabilities. */
function bandByHand(
    checks: readonly RecordCheckObservation[],
    probabilities: readonly number[],
    threshold: number
): { Precision: number; Recall: number; FalseFlagRateOnNew: number; Share: number } {
    const answered = answeredPoints(checks);
    let tp = 0;
    let fp = 0;
    const newFlagged = new Set<string>();
    answered.forEach((a, i) => {
        if (probabilities[i] < threshold) {
            return;
        }
        if (a.Candidate.IsDuplicatePair) {
            tp++;
        } else {
            fp++;
        }
        if (a.Check.Label.Label === 'new') {
            newFlagged.add(a.Check.RecordId);
        }
    });
    const duplicates = checks.filter(c => c.Label.Label === 'duplicate').length;
    const news = checks.filter(c => c.Label.Label === 'new').length;
    return { Precision: tp / (tp + fp), Recall: tp / duplicates, FalseFlagRateOnNew: newFlagged.size / news, Share: (tp + fp) / answered.length };
}

describe('Decision calibration is scored out of fold', () => {
    const checks = calibrationChecks();
    const points = answeredPoints(checks).map(a => a.Point);
    const outOfFold = OutOfFoldPlatt(points, DECISION_EVAL_CALIBRATION_FOLDS, DECISION_EVAL_SEED) ?? [];
    const shippedFit = FitPlatt(points);
    const inSample = points.map(p => ApplyPlatt(p.Probability, shippedFit));

    it('bands each candidate by a Platt fit that never saw it, where calibration moves the cut', () => {
        const sweep = ComputeDecisionBandSweep(checks, [0.3, 0.6]);
        for (const row of sweep) {
            const expected = bandByHand(checks, outOfFold, row.Threshold);
            expect(row.CalibratedPrecision).toBeCloseTo(expected.Precision, 10);
            expect(row.CalibratedRecall).toBeCloseTo(expected.Recall, 10);
            expect(row.CalibratedFalseFlagRateOnNew).toBeCloseTo(expected.FalseFlagRateOnNew, 10);
            expect(row.CalibratedShareCandidatesFlagged).toBeCloseTo(expected.Share, 10);

            // The in-sample fit flags differently here, so an in-sample sweep fails the checks above.
            expect(bandByHand(checks, inSample, row.Threshold)).not.toEqual(expected);
            // And calibration moves the cut: the raw band flags differently again.
            expect(row.CalibratedPrecision).not.toBeCloseTo(row.RawPrecision, 3);
        }

        // The raw columns, by hand: at 0.3, 12 sources and 16 other candidates, 11 of 12 new records.
        expect(sweep[0].RawPrecision).toBeCloseTo(12 / 28, 10);
        expect(sweep[0].RawRecall).toBe(1);
        expect(sweep[0].RawFalseFlagRateOnNew).toBeCloseTo(11 / 12, 10);
    });

    it('scores calibrated AUC, Brier and ECE out of fold, and fits the shipped parameters on every candidate', () => {
        const [calibration] = ComputeDecisionCalibration(checks);
        const outOfFoldPoints = outOfFold.map((p, i) => ({ Probability: p, Positive: points[i].Positive }));
        const inSamplePoints = inSample.map((p, i) => ({ Probability: p, Positive: points[i].Positive }));

        expect(calibration.CalibratedAuc).not.toBeNull();
        expect(calibration.CalibratedEce).not.toBeNull();
        expect(calibration.CalibratedAuc).toBeCloseTo(RocAuc(outOfFoldPoints) ?? -1, 10);
        expect(calibration.CalibratedBrier).toBeCloseTo(BrierScore(outOfFoldPoints) ?? -1, 10);
        expect(calibration.CalibratedEce).toBeCloseTo(CalibrationBins(outOfFoldPoints, DECISION_EVAL_ECE_BINS).ECE ?? -1, 10);
        // An in-sample Platt fit is monotonic, so it keeps the raw AUC; out of fold, it moves.
        expect(calibration.CalibratedAuc).not.toBeCloseTo(calibration.RawAuc ?? -1, 3);
        expect(calibration.CalibratedEce).not.toBeCloseTo(CalibrationBins(inSamplePoints, DECISION_EVAL_ECE_BINS).ECE ?? -1, 3);

        expect(calibration.PlattA).toBeCloseTo(shippedFit.A, 10);
        expect(calibration.PlattB).toBeCloseTo(shippedFit.B, 10);
    });

});
