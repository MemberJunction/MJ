/**
 * @fileoverview The agent-discovery metrics against hand-computed values: top-1 accuracy, both
 * calibrations, the injection operating table, production's verdict, repeatability, latency, cost,
 * and the baseline's metrics.
 */
import { DECISION_DISCOVERY_MIN_CONFIDENCE } from '@memberjunction/ai-agents';
import { describe, it, expect } from 'vitest';
import {
    AssignCaseFolds,
    CaseBootstrapInterval,
    ComputeDiscoveryBaselineMetrics,
    ComputeDiscoveryCellMetrics,
    ComputeDiscoveryDecisionMetrics,
    DISCOVERY_INJECTION_THRESHOLDS,
    InjectionOperatingPoints,
    IsDiscoveryCorrect,
    type DiscoveryEvalObservation,
    type InjectionRun
} from '../decision-eval/discovery-metrics';
import { FitPlatt } from '../decision-eval/metrics';

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
 * forbade it. The expected values below are worked by hand from these.
 */
const CELL: DiscoveryEvalObservation[] = [
    run({ CaseId: 'c1', ExpectedAgentId: A, ChosenAgentId: A, Confidence: 0.9, AnyApplies: 0.9, WouldInject: true, LatencyMs: 100 }),
    run({ CaseId: 'c2', ExpectedAgentId: A, ChosenAgentId: B, Confidence: 0.8, AnyApplies: 0.8, WouldInject: true, LatencyMs: 200, LabelledAgentOffered: false }),
    run({ CaseId: 'c3', ExpectedAgentId: B, ChosenAgentId: B, Confidence: 0.6, AnyApplies: 0.95, WouldInject: false, LatencyMs: 300 }),
    run({ CaseId: 'c4', ExpectedAgentId: B, ChosenAgentId: B.toLowerCase(), Confidence: 0.95, AnyApplies: 0.4, WouldInject: false, LatencyMs: 400 }),
    none('n1', 'chat', { ChosenAgentId: A, Confidence: 0.85, AnyApplies: 0.75, WouldInject: true, LatencyMs: 500 }),
    none('n2', 'direct', { ChosenAgentId: B, Confidence: 0.5, AnyApplies: 0.2, WouldInject: false, LatencyMs: 600 }),
    none('n3', 'workflow', { ChosenAgentId: A, Confidence: 0.7, AnyApplies: 0.7, WouldInject: true, LatencyMs: 1600, WithinProductionTimeout: false }),
    run({ CaseId: 'c5', ChosenAgentId: null, Confidence: null, AnyApplies: null, WouldInject: null, CostUSD: 0, LatencyMs: 50 }),
    run({ CaseId: 'c6', FailedOver: true, FailoverAllowed: false, CostUSD: 0.5 })
];

describe('IsDiscoveryCorrect', () => {
    it('is true only for an agent label whose agent was chosen, compared UUID-safely', () => {
        expect(IsDiscoveryCorrect({ Label: 'agent', ExpectedAgentId: A, ChosenAgentId: A.toLowerCase() })).toBe(true);
        expect(IsDiscoveryCorrect({ Label: 'agent', ExpectedAgentId: A, ChosenAgentId: B })).toBe(false);
        expect(IsDiscoveryCorrect({ Label: 'agent', ExpectedAgentId: A, ChosenAgentId: null })).toBe(false);
        expect(IsDiscoveryCorrect({ Label: 'none', ExpectedAgentId: null, ChosenAgentId: A })).toBe(false);
        expect(IsDiscoveryCorrect({ Label: 'agent', ExpectedAgentId: A, ChosenAgentId: B }, A)).toBe(true);
    });
});

describe('InjectionOperatingPoints', () => {
    const runs: InjectionRun[] = CELL.slice(0, 7).map(o => ({
        Label: o.Label,
        Correct: IsDiscoveryCorrect(o),
        Confidence: o.Confidence ?? 0,
        AnyApplies: o.AnyApplies ?? 0
    }));

    it('uses the thresholds 0.50 to 0.95 in steps of 0.05', () => {
        expect(DISCOVERY_INJECTION_THRESHOLDS).toEqual([0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95]);
    });

    it('injects only when both the confidence and anyApplies reach the threshold', () => {
        const [p50, , , , p70, , p80, p85, p90, p95] = InjectionOperatingPoints(runs);
        // 0.50: c1, c2, c3, n1, n3 injected; c4 (anyApplies 0.4) and n2 (0.2) not.
        expect(p50).toEqual({ Threshold: 0.5, Injected: 5, Coverage: 0.75, Precision: 2 / 3, PrecisionAllInjections: 0.4, FalseInjectionRate: 2 / 3 });
        // 0.70: c1, c2, n1, n3 (0.70 is reached, not passed).
        expect(p70).toEqual({ Threshold: 0.7, Injected: 4, Coverage: 0.5, Precision: 0.5, PrecisionAllInjections: 0.25, FalseInjectionRate: 2 / 3 });
        expect(p80).toEqual({ Threshold: 0.8, Injected: 2, Coverage: 0.5, Precision: 0.5, PrecisionAllInjections: 0.5, FalseInjectionRate: 0 });
        expect(p85).toEqual({ Threshold: 0.85, Injected: 1, Coverage: 0.25, Precision: 1, PrecisionAllInjections: 1, FalseInjectionRate: 0 });
        expect(p90.Injected).toBe(1);
        expect(p95).toEqual({ Threshold: 0.95, Injected: 0, Coverage: 0, Precision: null, PrecisionAllInjections: null, FalseInjectionRate: 0 });
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

describe('ComputeDiscoveryDecisionMetrics', () => {
    const metrics = ComputeDiscoveryDecisionMetrics(CELL, { BootstrapResamples: 200 });

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
        expect(metrics.Injection.Raw).toEqual(InjectionOperatingPoints(CELL.slice(0, 7).map(o => ({
            Label: o.Label, Correct: IsDiscoveryCorrect(o), Confidence: o.Confidence ?? 0, AnyApplies: o.AnyApplies ?? 0
        }))));
        expect(metrics.Injection.Calibrated).toHaveLength(10);
        expect(metrics.Production).toEqual({
            MinConfidence: DECISION_DISCOVERY_MIN_CONFIDENCE,
            Coverage: 0.5,
            Precision: 0.5,
            FalseInjectionRate: 2 / 3,
            NoneByKind: {
                chat: { Runs: 1, Injected: 1, Rate: 1 },
                direct: { Runs: 1, Injected: 0, Rate: 0 },
                workflow: { Runs: 1, Injected: 1, Rate: 1 }
            }
        });
    });

    it('reports latency, the share within production\'s timeout, and cost per 1k answered decisions', () => {
        // Latencies 100..600 and 1600: p50 400; p95 at position 5.7 is 600 + 0.7 × 1000.
        expect(metrics.Latency).toMatchObject({ Runs: 7, P50: 400, WithinProductionTimeoutRate: 6 / 7 });
        expect(metrics.Latency.P95).toBeCloseTo(1300, 6);
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
        Arm: 'semantic-search', Confidence: null, AnyApplies: null, CostUSD: null, WithinProductionTimeout: null, ...overrides
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
        expect(metrics.NoneBelowFloor).toEqual({ Runs: 2, Injected: 1, Rate: 0.5 });
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
