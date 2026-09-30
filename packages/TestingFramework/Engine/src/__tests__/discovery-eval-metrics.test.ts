/**
 * @fileoverview The agent-discovery metrics against hand-computed values: top-1 accuracy, both
 * calibrations (out of fold), the injection operating table with production's timeout, production's
 * verdict, repeatability, latency, cost, and the baseline's metrics.
 */
import { describe, it, expect } from 'vitest';
import {
    AssignCaseFolds,
    CalibrateDiscoveryOutOfFold,
    CaseBootstrapInterval,
    ComputeDiscoveryBaselineMetrics,
    ComputeDiscoveryCellMetrics,
    ComputeDiscoveryDecisionMetrics,
    DISCOVERY_INJECTION_THRESHOLDS,
    InjectionOperatingPoints,
    IsDiscoveryCorrect,
    IsDiscoveryOnTime,
    SummarizeDiscoveryOnTime,
    WouldInjectOnTime,
    type DiscoveryEvalObservation,
    type DiscoveryScoredRun,
    type InjectionRun
} from '../decision-eval/discovery-metrics';
import { ApplyPlatt, BrierScore, FitPlatt } from '../decision-eval/metrics';

const A = 'A0000000-0000-4000-8000-000000000001';
const B = 'A0000000-0000-4000-8000-000000000002';

/** A usable decision run; override anything. */
function run(overrides: Partial<DiscoveryEvalObservation>): DiscoveryEvalObservation {
    return {
        CaseId: 'case',
        Label: 'agent',
        Kind: null,
        ExpectedAgentId: A,
        Arm: 'decision',
        ChosenAgentId: A,
        TopRankedAgentId: null,
        Confidence: 0.9,
        AnyApplies: 0.9,
        WouldInject: true,
        LabelledAgentOffered: true,
        LatencyMs: 100,
        DiscoveryLatencyMs: 150,
        WithinProductionTimeout: true,
        CostUSD: 0.001,
        FailedOver: false,
        FailoverAllowed: true,
        ...overrides
    };
}

function none(caseId: string, kind: 'chat' | 'direct' | 'workflow', overrides: Partial<DiscoveryEvalObservation>): DiscoveryEvalObservation {
    return run({ CaseId: caseId, Label: 'none', Kind: kind, ExpectedAgentId: null, LabelledAgentOffered: null, ...overrides });
}

/**
 * Seven usable runs, one per case, plus one without an answer and one failed over in a cell that
 * forbade it. The expected values below are worked by hand from these. n3's discovery took 1,650 ms,
 * past production's 1,500 ms timeout, so the driver records it as not injected whatever its answers.
 */
const CELL: DiscoveryEvalObservation[] = [
    run({ CaseId: 'c1', ExpectedAgentId: A, ChosenAgentId: A, Confidence: 0.9, AnyApplies: 0.9, WouldInject: true, LatencyMs: 100, DiscoveryLatencyMs: 150 }),
    run({ CaseId: 'c2', ExpectedAgentId: A, ChosenAgentId: B, Confidence: 0.8, AnyApplies: 0.8, WouldInject: true, LatencyMs: 200, DiscoveryLatencyMs: 250, LabelledAgentOffered: false }),
    run({ CaseId: 'c3', ExpectedAgentId: B, ChosenAgentId: B, Confidence: 0.6, AnyApplies: 0.95, WouldInject: false, LatencyMs: 300, DiscoveryLatencyMs: 350 }),
    run({ CaseId: 'c4', ExpectedAgentId: B, ChosenAgentId: B.toLowerCase(), Confidence: 0.95, AnyApplies: 0.4, WouldInject: false, LatencyMs: 400, DiscoveryLatencyMs: 450 }),
    none('n1', 'chat', { ChosenAgentId: A, Confidence: 0.85, AnyApplies: 0.75, WouldInject: true, LatencyMs: 500, DiscoveryLatencyMs: 550 }),
    none('n2', 'direct', { ChosenAgentId: B, Confidence: 0.5, AnyApplies: 0.2, WouldInject: false, LatencyMs: 600, DiscoveryLatencyMs: 650 }),
    none('n3', 'workflow', { ChosenAgentId: A, Confidence: 0.7, AnyApplies: 0.7, WouldInject: false, LatencyMs: 1600, DiscoveryLatencyMs: 1650, WithinProductionTimeout: false }),
    run({ CaseId: 'c5', ChosenAgentId: null, Confidence: null, AnyApplies: null, WouldInject: null, CostUSD: 0, LatencyMs: 50, DiscoveryLatencyMs: 90 }),
    run({ CaseId: 'c6', FailedOver: true, FailoverAllowed: false, CostUSD: 0.5 })
];

/** The runs as injection reads them. */
function injectionRuns(observations: readonly DiscoveryEvalObservation[]): InjectionRun[] {
    return observations.map(o => ({
        Label: o.Label, Correct: IsDiscoveryCorrect(o), Confidence: o.Confidence ?? 0, AnyApplies: o.AnyApplies ?? 0, OnTime: IsDiscoveryOnTime(o)
    }));
}

describe('IsDiscoveryCorrect', () => {
    it('is true only for an agent label whose agent was chosen, compared UUID-safely', () => {
        expect(IsDiscoveryCorrect({ Label: 'agent', ExpectedAgentId: A, ChosenAgentId: A.toLowerCase() })).toBe(true);
        expect(IsDiscoveryCorrect({ Label: 'agent', ExpectedAgentId: A, ChosenAgentId: B })).toBe(false);
        expect(IsDiscoveryCorrect({ Label: 'agent', ExpectedAgentId: A, ChosenAgentId: null })).toBe(false);
        expect(IsDiscoveryCorrect({ Label: 'none', ExpectedAgentId: null, ChosenAgentId: A })).toBe(false);
        expect(IsDiscoveryCorrect({ Label: 'agent', ExpectedAgentId: A, ChosenAgentId: B }, A)).toBe(true);
    });
});

describe('the timeout', () => {
    it('counts a run as on time unless it recorded that it was late', () => {
        expect(IsDiscoveryOnTime({ WithinProductionTimeout: true })).toBe(true);
        expect(IsDiscoveryOnTime({ WithinProductionTimeout: null })).toBe(true);
        expect(IsDiscoveryOnTime({ WithinProductionTimeout: false })).toBe(false);
    });

    it('never counts a late run as injected, even one recorded before the driver applied the timeout', () => {
        expect(WouldInjectOnTime({ WouldInject: true, WithinProductionTimeout: true })).toBe(true);
        // A run recorded before the fix: confident, late, and still marked WouldInject.
        expect(WouldInjectOnTime({ WouldInject: true, WithinProductionTimeout: false })).toBe(false);
        expect(WouldInjectOnTime({ WouldInject: false, WithinProductionTimeout: true })).toBe(false);
    });

    it('summarizes how many runs were on time, of those that recorded it', () => {
        expect(SummarizeDiscoveryOnTime([{ WithinProductionTimeout: true }, { WithinProductionTimeout: false }, { WithinProductionTimeout: null }]))
            .toEqual({ Runs: 2, OnTime: 1, Rate: 0.5 });
        expect(SummarizeDiscoveryOnTime([])).toEqual({ Runs: 0, OnTime: 0, Rate: null });
    });
});

describe('InjectionOperatingPoints', () => {
    const runs = injectionRuns(CELL.slice(0, 7));

    it('uses the thresholds 0.50 to 0.95 in steps of 0.05', () => {
        expect(DISCOVERY_INJECTION_THRESHOLDS).toEqual([0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95]);
    });

    it('injects only on time, and when both the confidence and anyApplies reach the threshold', () => {
        const [p50, , , , p70, , p80, p85, p90, p95] = InjectionOperatingPoints(runs);
        // 0.50: c1, c2, c3, n1 injected; c4 (anyApplies 0.4) and n2 (0.2) not, nor n3, which was late.
        expect(p50).toEqual({ Threshold: 0.5, Injected: 4, Coverage: 0.75, Precision: 2 / 3, PrecisionAllInjections: 0.5, FalseInjectionRate: 1 / 3 });
        // 0.70: c1, c2, n1 (0.70 is reached, not passed); n3 reaches it too, but late.
        expect(p70).toEqual({ Threshold: 0.7, Injected: 3, Coverage: 0.5, Precision: 0.5, PrecisionAllInjections: 1 / 3, FalseInjectionRate: 1 / 3 });
        expect(p80).toEqual({ Threshold: 0.8, Injected: 2, Coverage: 0.5, Precision: 0.5, PrecisionAllInjections: 0.5, FalseInjectionRate: 0 });
        expect(p85).toEqual({ Threshold: 0.85, Injected: 1, Coverage: 0.25, Precision: 1, PrecisionAllInjections: 1, FalseInjectionRate: 0 });
        expect(p90.Injected).toBe(1);
        expect(p95).toEqual({ Threshold: 0.95, Injected: 0, Coverage: 0, Precision: null, PrecisionAllInjections: null, FalseInjectionRate: 0 });
    });

    it('keeps a late run in the denominators while never injecting it', () => {
        const late: InjectionRun[] = [
            { Label: 'agent', Correct: true, Confidence: 0.99, AnyApplies: 0.99, OnTime: false },
            { Label: 'agent', Correct: true, Confidence: 0.99, AnyApplies: 0.99, OnTime: true },
            { Label: 'none', Correct: false, Confidence: 0.99, AnyApplies: 0.99, OnTime: false }
        ];
        expect(InjectionOperatingPoints(late, [0.9])).toEqual([
            { Threshold: 0.9, Injected: 1, Coverage: 0.5, Precision: 1, PrecisionAllInjections: 1, FalseInjectionRate: 0 }
        ]);
    });

    it('has no ratio without a denominator', () => {
        expect(InjectionOperatingPoints([], [0.5])).toEqual([{ Threshold: 0.5, Injected: 0, Coverage: null, Precision: null, PrecisionAllInjections: null, FalseInjectionRate: null }]);
    });
});

describe('CaseBootstrapInterval', () => {
    const runs = [{ CaseId: 'one' }, { CaseId: 'three' }, { CaseId: 'three' }, { CaseId: 'three' }];

    it('resamples cases, bringing all of their runs', () => {
        // A resample of two cases holds 2, 4 or 6 runs; resampling runs would always hold 4.
        expect(CaseBootstrapInterval(runs, sample => sample.length, 400, 7)).toEqual({ Lower: 2, Upper: 6 });
    });

    it('is deterministic for a seed, and null without runs', () => {
        const statistic = (sample: readonly { CaseId: string }[]): number => sample.filter(r => r.CaseId === 'one').length / sample.length;
        expect(CaseBootstrapInterval(runs, statistic, 100, 3)).toEqual(CaseBootstrapInterval(runs, statistic, 100, 3));
        expect(CaseBootstrapInterval([], statistic, 100, 3)).toBeNull();
    });
});

describe('AssignCaseFolds', () => {
    it('deals agent cases, then none cases, across the folds', () => {
        const cases = [
            ...['a1', 'a2', 'a3', 'a4', 'a5'].map(id => ({ CaseId: id, Label: 'agent' as const })),
            ...['n1', 'n2', 'n3'].map(id => ({ CaseId: id, Label: 'none' as const }))
        ];
        const folds = AssignCaseFolds(cases, 5, 11);
        expect(new Set(['a1', 'a2', 'a3', 'a4', 'a5'].map(id => folds.get(id)))).toEqual(new Set([0, 1, 2, 3, 4]));
        expect(new Set(['n1', 'n2', 'n3'].map(id => folds.get(id)))).toEqual(new Set([0, 1, 2]));
        expect(AssignCaseFolds(cases, 5, 11)).toEqual(folds);
    });

    it('never uses fewer than two folds', () => {
        expect(new Set(AssignCaseFolds([{ CaseId: 'x', Label: 'agent' }, { CaseId: 'y', Label: 'none' }], 5, 1).values())).toEqual(new Set([0, 1]));
    });
});

describe('CalibrateDiscoveryOutOfFold', () => {
    /** Twelve cases, some repeated, with each label's probabilities spread out: enough for folds to differ. */
    const RUNS: DiscoveryScoredRun[] = [
        ['K01', 'agent', true, 0.95, 0.9], ['K01', 'agent', true, 0.9, 0.85], ['K02', 'agent', false, 0.8, 0.7],
        ['K03', 'agent', true, 0.6, 0.65], ['K04', 'agent', false, 0.55, 0.6], ['K05', 'agent', true, 0.85, 0.3],
        ['K05', 'agent', false, 0.7, 0.35], ['K06', 'agent', true, 0.99, 0.8], ['K07', 'agent', false, 0.4, 0.5],
        ['K08', 'none', false, 0.7, 0.4], ['K08', 'none', false, 0.75, 0.45], ['K09', 'none', false, 0.5, 0.2],
        ['K10', 'none', false, 0.9, 0.75], ['K11', 'none', false, 0.6, 0.1], ['K12', 'none', false, 0.3, 0.55]
    ].map(([caseId, label, correct, confidence, applies]) => ({
        CaseId: String(caseId), Label: label === 'agent' ? 'agent' : 'none', Correct: correct === true,
        Confidence: Number(confidence), AnyApplies: Number(applies), OnTime: true
    }));
    const FOLDS = 3;
    const SEED = 5;

    /** Each run calibrated by fits on the given training runs. */
    function calibrateWith(run: DiscoveryScoredRun, training: readonly DiscoveryScoredRun[]): { Confidence: number; AnyApplies: number } {
        const confidenceFit = FitPlatt(training.filter(r => r.Label === 'agent').map(r => ({ Probability: r.Confidence, Positive: r.Correct })));
        const appliesFit = FitPlatt(training.map(r => ({ Probability: r.AnyApplies, Positive: r.Label === 'agent' })));
        return { Confidence: ApplyPlatt(run.Confidence, confidenceFit), AnyApplies: ApplyPlatt(run.AnyApplies, appliesFit) };
    }

    const cases = [...new Map(RUNS.map(r => [r.CaseId, { CaseId: r.CaseId, Label: r.Label }])).values()];
    const folds = AssignCaseFolds(cases, FOLDS, SEED);
    const outOfFold = RUNS.map(run => calibrateWith(run, RUNS.filter(other => folds.get(other.CaseId) !== folds.get(run.CaseId))));
    const inSample = RUNS.map(run => calibrateWith(run, RUNS));

    it('scores each run with fits on the other folds only, keeping a case\'s repeats in one fold', () => {
        const calibrated = CalibrateDiscoveryOutOfFold(RUNS, FOLDS, SEED);
        expect(calibrated).toHaveLength(RUNS.length);
        calibrated?.forEach((run, i) => {
            expect(run.CaseId).toBe(RUNS[i].CaseId);
            expect(run.Confidence).toBeCloseTo(outOfFold[i].Confidence, 12);
            expect(run.AnyApplies).toBeCloseTo(outOfFold[i].AnyApplies, 12);
        });
    });

    it('differs from calibrating in sample, which would let each run be scored by a fit that saw it', () => {
        const calibrated = CalibrateDiscoveryOutOfFold(RUNS, FOLDS, SEED) ?? [];
        const gap = Math.max(...calibrated.map((run, i) => Math.abs(run.AnyApplies - inSample[i].AnyApplies)));
        expect(gap).toBeGreaterThan(0.01);
    });

    it('is what the cell\'s calibrated metrics are computed on', () => {
        const observations = RUNS.map(r => run({
            CaseId: r.CaseId, Label: r.Label, Kind: r.Label === 'none' ? 'chat' : null, ExpectedAgentId: r.Label === 'agent' ? A : null,
            ChosenAgentId: r.Correct ? A : B, Confidence: r.Confidence, AnyApplies: r.AnyApplies
        }));
        const metrics = ComputeDiscoveryDecisionMetrics(observations, { CalibrationFolds: FOLDS, Seed: SEED, BootstrapResamples: 10 });
        const expectedBrier = BrierScore(RUNS.map((r, i) => ({ Probability: outOfFold[i].AnyApplies, Positive: r.Label === 'agent' })));
        const inSampleBrier = BrierScore(RUNS.map((r, i) => ({ Probability: inSample[i].AnyApplies, Positive: r.Label === 'agent' })));
        expect(metrics.AnyAppliesCalibration.Calibrated?.Brier).toBeCloseTo(expectedBrier ?? -1, 12);
        expect(Math.abs((expectedBrier ?? 0) - (inSampleBrier ?? 0))).toBeGreaterThan(1e-4);
    });

    it('is null with fewer than two cases', () => {
        expect(CalibrateDiscoveryOutOfFold(RUNS.filter(r => r.CaseId === 'K01'), FOLDS, SEED)).toBeNull();
    });
});

describe('ComputeDiscoveryDecisionMetrics', () => {
    const metrics = ComputeDiscoveryDecisionMetrics(CELL, { BootstrapResamples: 200 });

    it('does not depend on the order the runs were read in', () => {
        // The folds and the bootstrap take cases in ID order, so only float rounding in sums can differ.
        const reversed = ComputeDiscoveryDecisionMetrics([...CELL].reverse(), { BootstrapResamples: 200 });
        expect(reversed.Top1).toEqual(metrics.Top1);
        expect(reversed.Injection).toEqual(metrics.Injection);
        expect(reversed.AnyAppliesCalibration.Calibrated?.Brier).toBeCloseTo(metrics.AnyAppliesCalibration.Calibrated?.Brier ?? -1, 12);
    });

    it('counts runs, leaving out the unanswered and the forbidden failover', () => {
        expect(metrics.Counts).toEqual({ Runs: 9, UsableRuns: 7, NoAnswerRuns: 1, FailoverRuns: 1, ExcludedFailoverRuns: 1, LabelledAgentNotOffered: 1 });
    });

    it('measures top-1 accuracy on the agent runs, with an interval around it', () => {
        expect(metrics.Top1.N).toBe(4);
        expect(metrics.Top1.Accuracy).toBe(0.75);
        expect(metrics.Top1.AccuracyCI?.Lower).toBeLessThanOrEqual(0.75);
        expect(metrics.Top1.AccuracyCI?.Upper).toBeGreaterThanOrEqual(0.75);
    });

    it('calibrates the Choice confidence as P(correct) on the agent runs', () => {
        const confidence = metrics.ConfidenceCalibration;
        expect(confidence.Raw.N).toBe(4);
        // Bins: 0.9 and 0.95 (both right), 0.8 (wrong), 0.6 (right).
        expect(confidence.Raw.ECE).toBeCloseTo(0.0375 + 0.2 + 0.1, 10);
        expect(confidence.Raw.RocAuc).toBeCloseTo(2 / 3, 10);
        expect(confidence.Raw.Brier).toBeCloseTo((0.01 + 0.64 + 0.16 + 0.0025) / 4, 10);
        expect(confidence.Platt).toEqual(FitPlatt([
            { Probability: 0.9, Positive: true }, { Probability: 0.8, Positive: false },
            { Probability: 0.6, Positive: true }, { Probability: 0.95, Positive: true }
        ]));
        expect(confidence.Calibrated?.N).toBe(4);
    });

    it('calibrates anyApplies against agent versus none on every run', () => {
        const applies = metrics.AnyAppliesCalibration;
        expect(applies.Raw.N).toBe(7);
        // Positives 0.9, 0.8, 0.95, 0.4 against negatives 0.75, 0.2, 0.7: 10 of 12 pairs ordered right.
        expect(applies.Raw.RocAuc).toBeCloseTo(10 / 12, 10);
        expect(applies.Platt).not.toBeNull();
        expect(applies.Calibrated?.N).toBe(7);
    });

    it('reports the injection table raw and calibrated, and production\'s verdict', () => {
        expect(metrics.Injection.Raw).toEqual(InjectionOperatingPoints(injectionRuns(CELL.slice(0, 7))));
        expect(metrics.Injection.Calibrated).toHaveLength(10);
        // The late n3 is not injected at any calibrated threshold either.
        expect(metrics.Injection.Calibrated?.every(p => (p.FalseInjectionRate ?? 0) <= 2 / 3)).toBe(true);
        expect(metrics.Production).toEqual({
            MinConfidence: 0.7,
            Coverage: 0.5,
            Precision: 0.5,
            FalseInjectionRate: 1 / 3,
            NoneByKind: {
                chat: { Runs: 1, Injected: 1, Rate: 1 },
                direct: { Runs: 1, Injected: 0, Rate: 0 },
                workflow: { Runs: 1, Injected: 0, Rate: 0 }
            }
        });
    });

    it('does not count a late run recorded before the driver applied the timeout as injected', () => {
        const recordedBefore = CELL.map(o => (o.CaseId === 'n3' ? { ...o, WouldInject: true, DiscoveryLatencyMs: null } : o));
        expect(ComputeDiscoveryDecisionMetrics(recordedBefore, { BootstrapResamples: 10 }).Production.FalseInjectionRate).toBeCloseTo(1 / 3, 10);
    });

    it('reports the call\'s latency, the whole discovery\'s, the share within production\'s timeout, and cost per 1k answered decisions', () => {
        // Call latencies 100..600 and 1600: p50 400; p95 at position 5.7 is 600 + 0.7 × 1000.
        expect(metrics.Latency).toMatchObject({ Runs: 7, P50: 400, WithinProductionTimeoutRate: 6 / 7 });
        expect(metrics.Latency.P95).toBeCloseTo(1300, 6);
        // The discovery (options, search and call) 150..650 and 1650.
        expect(metrics.Latency.Discovery).toMatchObject({ Runs: 7, P50: 450 });
        expect(metrics.Latency.Discovery.P95).toBeCloseTo(1350, 6);
        expect(metrics.Cost.RunsWithCost).toBe(7);
        expect(metrics.Cost.CostPer1kUSD).toBeCloseTo(1, 10);
    });

    it('measures repeatability over cases with two or more usable runs', () => {
        const repeated = ComputeDiscoveryDecisionMetrics([
            run({ CaseId: 'x', ChosenAgentId: A, Confidence: 0.9, AnyApplies: 0.8, WouldInject: true }),
            run({ CaseId: 'x', ChosenAgentId: A, Confidence: 0.7, AnyApplies: 0.8, WouldInject: true }),
            run({ CaseId: 'x', ChosenAgentId: B, Confidence: 0.8, AnyApplies: 0.6, WouldInject: false }),
            none('y', 'chat', { ChosenAgentId: A, Confidence: 0.5, AnyApplies: 0.1, WouldInject: false })
        ], { BootstrapResamples: 50 }).Repeatability;
        expect(repeated.Cases).toBe(1);
        expect(repeated.MeanChoiceAgreement).toBeCloseTo(2 / 3, 10);
        expect(repeated.MeanInjectAgreement).toBeCloseTo(2 / 3, 10);
        expect(repeated.MeanConfidenceStdDev).toBeCloseTo(Math.sqrt(0.02 / 3), 10);
        expect(repeated.MeanAnyAppliesStdDev).toBeCloseTo(Math.sqrt((2 * (0.2 / 3) ** 2 + (0.4 / 3) ** 2) / 3), 10);
        expect(repeated.Worst.map(c => c.CaseId)).toEqual(['x']);
    });

    it('has no calibrated metrics with fewer than two cases', () => {
        const single = ComputeDiscoveryDecisionMetrics([run({ CaseId: 'only' })], { BootstrapResamples: 10 });
        expect(single.ConfidenceCalibration.Calibrated).toBeNull();
        expect(single.ConfidenceCalibration.Platt).toBeNull();
        expect(single.Injection.Calibrated).toBeNull();
    });
});

describe('ComputeDiscoveryBaselineMetrics', () => {
    const baselineRun = (overrides: Partial<DiscoveryEvalObservation>): DiscoveryEvalObservation => run({
        Arm: 'semantic-search', Confidence: null, AnyApplies: null, CostUSD: null, DiscoveryLatencyMs: null, WithinProductionTimeout: null, ...overrides
    });
    const cell = [
        baselineRun({ CaseId: 'b1', ExpectedAgentId: A, ChosenAgentId: A, TopRankedAgentId: A, WouldInject: true, LatencyMs: 10 }),
        baselineRun({ CaseId: 'b2', ExpectedAgentId: B, ChosenAgentId: null, TopRankedAgentId: B, WouldInject: false, LatencyMs: 20 }),
        baselineRun({ CaseId: 'b3', ExpectedAgentId: A, ChosenAgentId: B, TopRankedAgentId: B, WouldInject: true, LatencyMs: 30 }),
        baselineRun({ CaseId: 'b4', Label: 'none', Kind: 'chat', ExpectedAgentId: null, ChosenAgentId: null, WouldInject: false, LatencyMs: 40 }),
        baselineRun({ CaseId: 'b5', Label: 'none', Kind: 'workflow', ExpectedAgentId: null, ChosenAgentId: A, WouldInject: true, LatencyMs: 50 }),
        baselineRun({ CaseId: 'b6', WouldInject: null, ChosenAgentId: null })
    ];

    it('measures the action\'s first row, the best-ranked candidate, and the none runs below the floor', () => {
        const metrics = ComputeDiscoveryBaselineMetrics(cell, { BootstrapResamples: 50 });
        expect(metrics.Arm).toBe('semantic-search');
        expect(metrics.Counts).toMatchObject({ Runs: 6, UsableRuns: 5, NoAnswerRuns: 1 });
        expect(metrics.Top1).toMatchObject({ N: 3, Accuracy: 1 / 3 });
        expect(metrics.TopRankedAccuracy).toBeCloseTo(2 / 3, 10);
        expect(metrics.NoneBelowFloor).toEqual({ Runs: 2, BelowFloor: 1, Rate: 0.5 });
        expect(metrics.NoneByKind).toEqual({
            chat: { Runs: 1, Injected: 0, Rate: 0 },
            direct: { Runs: 0, Injected: 0, Rate: null },
            workflow: { Runs: 1, Injected: 1, Rate: 1 }
        });
        expect(metrics.Latency).toMatchObject({ Runs: 5, P50: 30 });
    });

    it('is what ComputeDiscoveryCellMetrics picks for a baseline cell, even with an unreadable run', () => {
        const withUnknown = [...cell, run({ CaseId: 'b7', Arm: null, ChosenAgentId: null, WouldInject: null })];
        expect(ComputeDiscoveryCellMetrics(withUnknown, { BootstrapResamples: 10 }).Arm).toBe('semantic-search');
        expect(ComputeDiscoveryCellMetrics(CELL, { BootstrapResamples: 10 }).Arm).toBe('decision');
    });
});
