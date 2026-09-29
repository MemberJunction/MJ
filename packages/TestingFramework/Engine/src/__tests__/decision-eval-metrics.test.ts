/**
 * @fileoverview Decision Eval metrics, each against values computed by hand on small arrays.
 */
import { describe, it, expect } from 'vitest';
import {
    Accuracy,
    ApplyPlatt,
    BalancedAccuracy,
    BootstrapInterval,
    BrierScore,
    CalibrationBins,
    ClampedLogit,
    ClassRecall,
    ComputeCellMetrics,
    CreateSeededRandom,
    DECISION_EVAL_OPERATING_THRESHOLDS,
    FitPlatt,
    MeasureCaseRepeatability,
    OperatingPoints,
    OutOfFoldPlatt,
    PopulationStdDev,
    Quantile,
    RocAuc,
    SummarizeRepeatability,
    type DecisionEvalObservation,
    type LabelledProbability
} from '../decision-eval/metrics';

const point = (probability: number, positive: boolean): LabelledProbability => ({ Probability: probability, Positive: positive });

/** 0.9 continue ✓, 0.6 switch ✗, 0.4 continue ✗, 0.2 switch ✓ at 0.5. */
const MIXED = [point(0.9, true), point(0.6, false), point(0.4, true), point(0.2, false)];

function observation(caseId: string, label: DecisionEvalObservation['Label'], probability: number | null, overrides: Partial<DecisionEvalObservation> = {}): DecisionEvalObservation {
    return { CaseId: caseId, Label: label, Probability: probability, LatencyMs: 100, CostUSD: 0.001, FailedOver: false, FailoverAllowed: false, ...overrides };
}

/** A deliberately overconfident predictor: the true probability, sharpened three times on the logit scale. */
function overconfidentSet(count: number, seed: number): LabelledProbability[] {
    const random = CreateSeededRandom(seed);
    return Array.from({ length: count }, () => {
        const truth = 0.05 + 0.9 * random();
        const positive = random() < truth;
        return point(1 / (1 + Math.exp(-3 * Math.log(truth / (1 - truth)))), positive);
    });
}

describe('Decision Eval metrics', () => {
    describe('basic statistics', () => {
        it('Quantile interpolates linearly between order statistics', () => {
            expect(Quantile([4, 1, 3, 2], 0.5)).toBe(2.5);
            expect(Quantile([1, 2, 3, 4], 0.95)).toBeCloseTo(3.85, 10);
            expect(Quantile([7], 0.95)).toBe(7);
            expect(Quantile([], 0.5)).toBeNull();
        });

        it('PopulationStdDev divides by n', () => {
            expect(PopulationStdDev([0.2, 0.4, 0.6, 0.8])).toBeCloseTo(Math.sqrt(0.05), 12);
            expect(PopulationStdDev([0.5])).toBe(0);
            expect(PopulationStdDev([])).toBeNull();
        });
    });

    describe('agreement with labels', () => {
        it('accuracy, class recalls and balanced accuracy at the threshold', () => {
            expect(Accuracy(MIXED, 0.5)).toBe(0.5);
            expect(ClassRecall(MIXED, 0.5, true)).toBe(0.5);
            expect(ClassRecall(MIXED, 0.5, false)).toBe(0.5);
            expect(BalancedAccuracy(MIXED, 0.5)).toBe(0.5);
        });

        it('balanced accuracy differs from accuracy on an imbalanced set', () => {
            // 3 continue, all right; 1 switch, wrong: accuracy 3/4, balanced (1 + 0) / 2.
            const imbalanced = [point(0.9, true), point(0.8, true), point(0.7, true), point(0.6, false)];
            expect(Accuracy(imbalanced, 0.5)).toBe(0.75);
            expect(BalancedAccuracy(imbalanced, 0.5)).toBe(0.5);
        });

        it('a probability exactly at the threshold predicts continue', () => {
            expect(Accuracy([point(0.5, true)], 0.5)).toBe(1);
            expect(ClassRecall([point(0.5, false)], 0.5, false)).toBe(0);
        });

        it('balanced accuracy uses the one class present, and nothing is defined with no cases', () => {
            expect(BalancedAccuracy([point(0.9, true), point(0.4, true)], 0.5)).toBe(0.5);
            expect(ClassRecall([point(0.9, true)], 0.5, false)).toBeNull();
            expect(Accuracy([], 0.5)).toBeNull();
            expect(BalancedAccuracy([], 0.5)).toBeNull();
        });
    });

    describe('RocAuc', () => {
        it('counts the pairs a positive outranks: 3 of 4', () => {
            expect(RocAuc(MIXED)).toBe(0.75);
        });

        it('counts a tie as half a pair', () => {
            // (0.5,0.5) tie = 0.5; (0.5,0.3), (0.8,0.5), (0.8,0.3) = 3 → 3.5 / 4.
            expect(RocAuc([point(0.5, true), point(0.5, false), point(0.8, true), point(0.3, false)])).toBe(0.875);
        });

        it('is 0.5 when every probability ties, and 1 when the classes separate', () => {
            expect(RocAuc([point(0.5, true), point(0.5, false), point(0.5, true)])).toBe(0.5);
            expect(RocAuc([point(0.2, false), point(0.3, false), point(0.7, true)])).toBe(1);
        });

        it('is undefined with one class', () => {
            expect(RocAuc([point(0.9, true), point(0.1, true)])).toBeNull();
        });
    });

    describe('BrierScore', () => {
        it('is the mean squared error against 1 and 0', () => {
            // 0.01 + 0.36 + 0.36 + 0.04 = 0.77, over 4.
            expect(BrierScore(MIXED)).toBeCloseTo(0.1925, 12);
            expect(BrierScore([])).toBeNull();
        });
    });

    describe('CalibrationBins (ECE)', () => {
        it('bins by tenths, with the last bin holding 1, and weights each gap by its bin', () => {
            const { ECE, Bins } = CalibrationBins([point(0.05, false), point(0.15, true), point(0.15, false), point(1, true)]);
            expect(Bins).toHaveLength(10);
            expect(Bins[0]).toEqual({ Lower: 0, Upper: 0.1, Count: 1, MeanPredicted: 0.05, ObservedRate: 0 });
            expect(Bins[1]).toMatchObject({ Count: 2, ObservedRate: 0.5 });
            expect(Bins[1].MeanPredicted).toBeCloseTo(0.15, 12);
            expect(Bins[9]).toMatchObject({ Count: 1, MeanPredicted: 1, ObservedRate: 1 });
            expect(Bins[5]).toMatchObject({ Count: 0, MeanPredicted: null, ObservedRate: null });
            // (1/4)(0.05) + (2/4)(0.35) + (1/4)(0) = 0.1875.
            expect(ECE).toBeCloseTo(0.1875, 12);
        });

        it('puts a bin edge in the upper bin', () => {
            const { Bins } = CalibrationBins([point(0.1, true), point(0.3, true), point(0.7, false)]);
            expect([Bins[1].Count, Bins[3].Count, Bins[7].Count]).toEqual([1, 1, 1]);
        });

        it('matches the hand value on the mixed set', () => {
            // |0.9−1| + |0.6−0| + |0.4−1| + |0.2−0| = 1.5, over 4.
            expect(CalibrationBins(MIXED).ECE).toBeCloseTo(0.375, 12);
            expect(CalibrationBins([]).ECE).toBeNull();
        });
    });

    describe('BootstrapInterval', () => {
        const set = overconfidentSet(120, 3);
        const accuracy = (sample: readonly LabelledProbability[]) => Accuracy(sample, 0.5);

        it('is deterministic under a seed', () => {
            expect(BootstrapInterval(set, accuracy, 1000, 42)).toEqual(BootstrapInterval(set, accuracy, 1000, 42));
        });

        it('changes with the seed, and brackets the estimate', () => {
            // Brier is continuous, so two seeds' resamples cannot land on the same quantiles by chance.
            expect(BootstrapInterval(set, BrierScore, 1000, 42)).not.toEqual(BootstrapInterval(set, BrierScore, 1000, 43));
            const interval = BootstrapInterval(set, accuracy, 1000, 42);
            const estimate = Accuracy(set, 0.5) ?? 0;
            expect(interval?.Lower).toBeLessThan(estimate);
            expect(interval?.Upper).toBeGreaterThan(estimate);
        });

        it('collapses when every case is right, and is null with no cases', () => {
            expect(BootstrapInterval([point(0.9, true), point(0.1, false)], accuracy, 200, 1)).toEqual({ Lower: 1, Upper: 1 });
            expect(BootstrapInterval([], accuracy, 200, 1)).toBeNull();
        });

        it('CreateSeededRandom repeats its sequence for a seed', () => {
            const a = CreateSeededRandom(9);
            const b = CreateSeededRandom(9);
            const draws = Array.from({ length: 5 }, () => a());
            expect(draws).toEqual(Array.from({ length: 5 }, () => b()));
            expect(draws.every(d => d >= 0 && d < 1)).toBe(true);
        });
    });

    describe('OperatingPoints', () => {
        it('runs 0.30 to 0.90 in steps of 0.05', () => {
            expect(DECISION_EVAL_OPERATING_THRESHOLDS).toEqual([0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9]);
        });

        it('gives precision and recall of each class at each threshold', () => {
            const [low, middle, high] = OperatingPoints(MIXED, [0.3, 0.5, 0.9]);
            // 0.3: continue = {0.9, 0.6, 0.4}: TP 2, FP 1, FN 0, TN 1.
            expect(low.ContinuePrecision).toBeCloseTo(2 / 3, 12);
            expect([low.ContinueRecall, low.SwitchPrecision, low.SwitchRecall]).toEqual([1, 1, 0.5]);
            expect(middle).toEqual({ Threshold: 0.5, ContinuePrecision: 0.5, ContinueRecall: 0.5, SwitchPrecision: 0.5, SwitchRecall: 0.5 });
            // 0.9: continue = {0.9}: TP 1, FP 0, FN 1, TN 2.
            expect([high.ContinuePrecision, high.ContinueRecall, high.SwitchRecall]).toEqual([1, 0.5, 1]);
            expect(high.SwitchPrecision).toBeCloseTo(2 / 3, 12);
        });

        it('leaves a precision with no predictions undefined', () => {
            const [point9] = OperatingPoints([point(0.2, true), point(0.1, false)], [0.9]);
            expect(point9.ContinuePrecision).toBeNull();
            expect(point9.ContinueRecall).toBe(0);
        });
    });

    describe('repeatability', () => {
        it('one case: population SD and agreement with the majority verdict', () => {
            const split = MeasureCaseRepeatability('x', [0.2, 0.4, 0.6, 0.8], 0.5);
            expect(split.VerdictAgreement).toBe(0.5);
            expect(split.StdDev).toBeCloseTo(Math.sqrt(0.05), 12);
            const steady = MeasureCaseRepeatability('y', [0.9, 0.9, 0.7], 0.5);
            expect(steady.VerdictAgreement).toBe(1);
            expect(steady.StdDev).toBeCloseTo(Math.sqrt((2 * (0.9 - 2.5 / 3) ** 2 + (0.7 - 2.5 / 3) ** 2) / 3), 12);
            expect(MeasureCaseRepeatability('z', [0.4, 0.6, 0.7], 0.5).VerdictAgreement).toBeCloseTo(2 / 3, 12);
        });

        it('a cell: means over cases with two repeats, and the worst cases by ID', () => {
            const summary = SummarizeRepeatability(new Map([
                ['x', [0.2, 0.4, 0.6, 0.8]],
                ['y', [0.9, 0.9, 0.7]],
                ['z', [0.3]],
                ['w', [0.45, 0.55]]
            ]), 0.5, 2);
            expect(summary.Cases).toBe(3);
            expect(summary.MeanVerdictAgreement).toBeCloseTo((0.5 + 1 + 0.5) / 3, 12);
            // x and w both agree 0.5; x spreads more, so it is worse.
            expect(summary.Worst.map(c => c.CaseId)).toEqual(['x', 'w']);
            expect(Object.keys(summary.Worst[0]).sort()).toEqual(['CaseId', 'Repeats', 'StdDev', 'VerdictAgreement']);
        });
    });

    describe('Platt scaling', () => {
        it('the clamped logit stays finite at 0 and 1', () => {
            expect(ClampedLogit(0)).toBeCloseTo(Math.log(1e-6 / (1 - 1e-6)), 10);
            expect(ClampedLogit(1)).toBeCloseTo(-ClampedLogit(0), 10);
        });

        it('fits a separable-ish set to a finite, increasing map', () => {
            const probabilities = [0.05, 0.1, 0.2, 0.3, 0.35, 0.6, 0.7, 0.8, 0.9, 0.95];
            const labels = [false, false, false, false, true, false, true, true, true, true];
            const fit = FitPlatt(probabilities.map((p, i) => point(p, labels[i])));
            expect(fit.Converged).toBe(true);
            expect(fit.A).toBeGreaterThan(0);
            const calibrated = [0.01, 0.1, 0.3, 0.5, 0.7, 0.9, 0.99].map(p => ApplyPlatt(p, fit));
            for (let i = 1; i < calibrated.length; i++) {
                expect(calibrated[i]).toBeGreaterThan(calibrated[i - 1]);
            }
        });

        it('stays finite on a perfectly separable set', () => {
            const fit = FitPlatt([point(0.1, false), point(0.2, false), point(0.8, true), point(0.9, true)]);
            expect(Number.isFinite(fit.A) && Number.isFinite(fit.B)).toBe(true);
            expect(fit.Converged).toBe(true);
        });

        it('recovers the scale of a deliberately overconfident input, and out of fold lowers its ECE', () => {
            const set = overconfidentSet(200, 7);
            const fit = FitPlatt(set);
            // The input is the truth sharpened three times on the logit scale, so A should be near 1/3.
            expect(fit.A).toBeGreaterThan(0.2);
            expect(fit.A).toBeLessThan(0.5);
            const calibrated = OutOfFoldPlatt(set, 5, 11);
            expect(calibrated).not.toBeNull();
            const rawECE = CalibrationBins(set).ECE ?? 1;
            const calibratedECE = CalibrationBins(set.map((p, i) => ({ ...p, Probability: calibrated?.[i] ?? 0 }))).ECE ?? 1;
            expect(calibratedECE).toBeLessThan(rawECE);
        });

        it('out of fold is deterministic under a seed, and needs two cases', () => {
            const set = overconfidentSet(40, 5);
            expect(OutOfFoldPlatt(set, 5, 3)).toEqual(OutOfFoldPlatt(set, 5, 3));
            expect(OutOfFoldPlatt([point(0.4, true)], 5, 3)).toBeNull();
            expect(OutOfFoldPlatt([point(0.4, true), point(0.6, false)], 5, 3)).toHaveLength(2);
        });
    });

    describe('ComputeCellMetrics', () => {
        const runs: DecisionEvalObservation[] = [
            // a: continue, mean 0.8, verdicts agree.
            observation('a', 'continue', 0.9, { LatencyMs: 100 }), observation('a', 'continue', 0.7, { LatencyMs: 200 }),
            // b: switch, mean 0.45 → right, but the verdicts split.
            observation('b', 'switch', 0.6, { LatencyMs: 300 }), observation('b', 'switch', 0.3, { LatencyMs: 400 }),
            // c: switch, one usable repeat at 0.8 → wrong; its failed-over repeat is excluded.
            observation('c', 'switch', 0.8, { LatencyMs: 500 }), observation('c', 'switch', 0.1, { FailedOver: true, LatencyMs: 50 }),
            // d: continue, no probability.
            observation('d', 'continue', null, { LatencyMs: null, CostUSD: 0.003 }),
            // e and f: ambiguous; e is kept with the previous agent, f is not.
            observation('e', 'ambiguous', 0.7), observation('f', 'ambiguous', 0.2), observation('f', 'ambiguous', 0.4)
        ];

        it('scores one mean probability per case and reports the rest apart', () => {
            const metrics = ComputeCellMetrics(runs, { BootstrapResamples: 100 });
            expect(metrics.Counts).toEqual({ Runs: 10, UsableRuns: 8, NoProbabilityRuns: 1, FailoverRuns: 1, ExcludedFailoverRuns: 1 });
            expect(metrics.Raw.N).toBe(3);
            // a right (0.8 ≥ 0.5), b right (0.45 < 0.5), c wrong (0.8 ≥ 0.5).
            expect(metrics.Raw.Accuracy).toBeCloseTo(2 / 3, 12);
            expect(metrics.Raw.SwitchRecall).toBe(0.5);
            expect(metrics.Raw.BalancedAccuracy).toBe(0.75);
            expect(metrics.Raw.RocAuc).toBe(0.75);
            expect(metrics.Ambiguous).toEqual({ Cases: 2, KeptWithPreviousAgent: 1, Rate: 0.5 });
        });

        it('computes repeatability from the repeats and multiplies it into signal value', () => {
            const metrics = ComputeCellMetrics(runs, { BootstrapResamples: 100 });
            expect(metrics.Repeatability.Cases).toBe(2);
            expect(metrics.Repeatability.MeanVerdictAgreement).toBe(0.75);
            expect(metrics.SignalValue).toBeCloseTo((2 / 3) * 0.75, 12);
            expect(metrics.Repeatability.Worst[0].CaseId).toBe('b');
        });

        it('reports latency and cost per thousand over the usable runs only', () => {
            const metrics = ComputeCellMetrics(runs, { BootstrapResamples: 100 });
            // Usable latencies: 100, 200, 300, 400, 500, 100, 100, 100.
            expect(metrics.Latency).toEqual({ Runs: 8, P50: 150, P95: Quantile([100, 200, 300, 400, 500, 100, 100, 100], 0.95) });
            // The eight usable runs cost 0.001 each. d (no answer, 0.003) and c's excluded failover are
            // left out: a failed call is not a decision, so it must not dilute what a decision costs.
            expect(metrics.Cost.RunsWithCost).toBe(8);
            expect(metrics.Cost.CostPer1kUSD).toBeCloseTo(1.0, 12);
        });

        it('keeps a failed-over run when the cell allowed failover', () => {
            const allowed = runs.map(r => ({ ...r, FailoverAllowed: true }));
            const metrics = ComputeCellMetrics(allowed, { BootstrapResamples: 100 });
            expect(metrics.Counts.ExcludedFailoverRuns).toBe(0);
            // c's mean is now (0.8 + 0.1) / 2 = 0.45 → right.
            expect(metrics.Raw.Accuracy).toBe(1);
        });

        it('adds calibrated metrics and Platt parameters, and is deterministic', () => {
            const first = ComputeCellMetrics(runs, { BootstrapResamples: 200, Seed: 5 });
            expect(first.Calibrated?.N).toBe(3);
            expect(first.Platt).not.toBeNull();
            expect(ComputeCellMetrics(runs, { BootstrapResamples: 200, Seed: 5 })).toEqual(first);
        });

        it('is empty but well formed with no runs', () => {
            const metrics = ComputeCellMetrics([]);
            expect(metrics.Raw.N).toBe(0);
            expect(metrics.Raw.Accuracy).toBeNull();
            expect(metrics.Calibrated).toBeNull();
            expect(metrics.SignalValue).toBeNull();
        });
    });
});
