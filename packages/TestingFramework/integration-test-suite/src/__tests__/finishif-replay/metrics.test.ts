import { describe, it, expect } from 'vitest';
import { FitPlatt } from '@memberjunction/testing-engine';
import {
    ALL_MODELS,
    ClusteredAucInterval,
    ComputeArmMetrics,
    FINISH_IF_PRODUCTION_THRESHOLD,
    FINISH_IF_SWEEP_THRESHOLDS,
    FitPlattByModel,
    GateScore,
    PerRepVerdictsOf,
    SummarizeRoundOutcomes,
    SweepRowAt,
    VerdictRepeatabilityOf,
    type RoundOutcome
} from '../../finishif-replay/metrics';
import type { FinishIfReplayLabel, GateObservation } from '../../finishif-replay/types';

function outcome(id: string, label: FinishIfReplayLabel, score: number | null, gateMs: number, gateCost: number | null, savedMs: number, savedCost: number, tokens: number): RoundOutcome {
    return {
        RoundId: id,
        AgentRunID: `run-${id}`,
        Label: label,
        Score: score,
        Reps: 1,
        UsableReps: score === null ? 0 : 1,
        Passes: 0,
        GateLatencyMs: gateMs,
        GateCostUSD: gateCost,
        Savings: { LatencyMs: savedMs, CostUSD: savedCost, Tokens: tokens }
    };
}

/** Five rounds: three finish (one unusable), two continue. */
const OUTCOMES: RoundOutcome[] = [
    outcome('R1', 'finish', 0.95, 100, 0.001, 2000, 0.02, 1000),
    outcome('R2', 'finish', 0.8, 100, 0.001, 3000, 0.03, 1500),
    outcome('R3', 'continue', 0.92, 100, 0.001, 1000, 0.01, 500),
    outcome('R4', 'continue', 0.4, 100, 0.001, 1000, 0.01, 500),
    outcome('R5', 'finish', null, 200, null, 4000, 0.04, 2000)
];

function observation(roundId: string, rep: number, fields: Partial<GateObservation>): GateObservation {
    return {
        RoundId: roundId,
        Arm: 'generic',
        Rep: rep,
        CallSucceeded: true,
        Probabilities: {},
        Score: null,
        Passed: false,
        ModelName: 'Model A',
        PromptRunID: null,
        LatencyMs: 0,
        CostUSD: null,
        ...fields
    };
}

describe('the thresholds', () => {
    it('sweeps 0.50 to 0.95 in steps of 0.05, and production gates at 0.9', () => {
        expect(FINISH_IF_SWEEP_THRESHOLDS).toEqual([0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95]);
        expect(FINISH_IF_PRODUCTION_THRESHOLD).toBe(0.9);
    });
});

describe('GateScore', () => {
    it("is the minimum probability over the round's questions", () => {
        expect(GateScore({ q1: 0.9, q2: 0.7, q3: 0.95 }, ['q1', 'q2', 'q3'])).toBe(0.7);
        expect(GateScore({ q1: 0.9, q2: 0.1 }, ['q1'])).toBe(0.9);
    });

    it('is null when a question is unanswered or not a number, or none was asked', () => {
        expect(GateScore({ q1: 0.9 }, ['q1', 'q2'])).toBeNull();
        expect(GateScore({ q1: 0.9, q2: Number.NaN }, ['q1', 'q2'])).toBeNull();
        expect(GateScore({}, [])).toBeNull();
    });
});

describe('SweepRowAt', () => {
    const scores = OUTCOMES.map(o => o.Score);

    it('at 0.9: one finish and one continue pass', () => {
        const row = SweepRowAt(OUTCOMES, scores, 0.9);
        expect(row).toMatchObject({ Threshold: 0.9, Passes: 2, FinishPasses: 1, ContinuePasses: 1 });
        expect(row.SkippableShare).toBeCloseTo(1 / 3, 10);
        expect(row.FalseFinishRate).toBeCloseTo(1 / 2, 10);
        expect(row.Precision).toBeCloseTo(1 / 2, 10);
        // Saved: R1's 2,000 ms and $0.02. The gate: 600 ms and $0.004 over all five rounds.
        expect(row.NetLatencySavedMsPer1k).toBeCloseTo(((2000 - 600) / 5) * 1000, 6);
        expect(row.NetCostSavedUSDPer1k).toBeCloseTo(((0.02 - 0.004) / 5) * 1000, 10);
        expect(row.TokensSavedPer1k).toBeCloseTo((1000 / 5) * 1000, 6);
    });

    it('at 0.8: two finishes pass, and the false finish saves nothing', () => {
        const row = SweepRowAt(OUTCOMES, scores, 0.8);
        expect(row).toMatchObject({ Passes: 3, FinishPasses: 2, ContinuePasses: 1 });
        expect(row.SkippableShare).toBeCloseTo(2 / 3, 10);
        expect(row.Precision).toBeCloseTo(2 / 3, 10);
        expect(row.NetLatencySavedMsPer1k).toBeCloseTo(((5000 - 600) / 5) * 1000, 6);
        expect(row.NetCostSavedUSDPer1k).toBeCloseTo(((0.05 - 0.004) / 5) * 1000, 10);
    });

    it('never passes an unusable round, and has no rates without rounds', () => {
        expect(SweepRowAt(OUTCOMES, scores, 0).FinishPasses).toBe(2);
        expect(SweepRowAt([], [], 0.9)).toMatchObject({ Passes: 0, SkippableShare: null, FalseFinishRate: null, Precision: null, NetLatencySavedMsPer1k: null });
    });
});

describe('SummarizeRoundOutcomes', () => {
    it("averages a round's usable scores, its gate latency over every rep, and its costs where read", () => {
        const rounds = [
            { RoundId: 'R1', AgentRunID: 'A', Label: 'finish' as const },
            { RoundId: 'R2', AgentRunID: 'A', Label: 'continue' as const }
        ];
        const observations = [
            observation('R1', 1, { Score: 0.8, LatencyMs: 100, CostUSD: 0.001 }),
            observation('R1', 2, { Score: null, CallSucceeded: false, LatencyMs: 300, CostUSD: null }),
            observation('R1', 3, { Score: 0.9, Passed: true, LatencyMs: 200, CostUSD: 0.003 })
        ];
        const savings = new Map([['R1', { LatencyMs: 1000, CostUSD: 0.01, Tokens: 10 }]]);
        const [r1, ...rest] = SummarizeRoundOutcomes(rounds, observations, savings);
        expect(rest).toEqual([]);
        expect(r1.Score).toBeCloseTo(0.85, 10);
        expect(r1).toMatchObject({ Reps: 3, UsableReps: 2, Passes: 1, GateLatencyMs: 200, Savings: { LatencyMs: 1000, CostUSD: 0.01, Tokens: 10 } });
        expect(r1.GateCostUSD).toBeCloseTo(0.002, 10);
    });
});

describe('ClusteredAucInterval', () => {
    const point = (probability: number, positive: boolean, cluster: string): { Point: { Probability: number; Positive: boolean }; Cluster: string } =>
        ({ Point: { Probability: probability, Positive: positive }, Cluster: cluster });

    it('resamples runs, not rounds: every resample keeps a run whole', () => {
        // Within each run the finish round outscores the continue round; across runs, run B's finish
        // round is below run A's continue round. Resampling runs gives AUC 1 (one run twice) or 0.75
        // (both); resampling rounds would also draw B's finish with A's continue alone, an AUC of 0.
        const points = [point(0.6, true, 'A'), point(0.5, false, 'A'), point(0.4, true, 'B'), point(0.3, false, 'B')];
        expect(ClusteredAucInterval(points, 1000, 7)).toEqual({ Lower: 0.75, Upper: 1 });
    });

    it('is the same for the same seed, and null with no points', () => {
        const points = [point(0.9, true, 'A'), point(0.2, false, 'B'), point(0.6, true, 'C'), point(0.7, false, 'D')];
        expect(ClusteredAucInterval(points, 200, 3)).toEqual(ClusteredAucInterval(points, 200, 3));
        expect(ClusteredAucInterval([], 200, 3)).toBeNull();
    });
});

describe('FitPlattByModel', () => {
    it('fits each answering model on its own points, and all models on the round scores', () => {
        const outcomes = [
            outcome('R1', 'finish', 0.9, 0, 0, 0, 0, 0),
            outcome('R2', 'continue', 0.3, 0, 0, 0, 0, 0),
            outcome('R3', 'finish', 0.6, 0, 0, 0, 0, 0)
        ];
        const observations = [
            observation('R1', 1, { Score: 0.9, ModelName: 'Model A' }),
            observation('R2', 1, { Score: 0.3, ModelName: 'Model A' }),
            observation('R3', 1, { Score: 0.6, ModelName: 'Model B' }),
            observation('R3', 2, { Score: null, ModelName: 'Model B' })
        ];
        const fits = FitPlattByModel(outcomes, observations);
        expect(fits.map(f => [f.Model, f.Points, f.Finish, f.Continue])).toEqual([
            ['Model A', 2, 1, 1],
            ['Model B', 1, 1, 0],
            [ALL_MODELS, 3, 2, 1]
        ]);
        const modelA = FitPlatt([{ Probability: 0.9, Positive: true }, { Probability: 0.3, Positive: false }]);
        expect(fits[0]).toMatchObject({ A: modelA.A, B: modelA.B });
        expect(fits[1]).toMatchObject({ A: null, B: null, Converged: null });
    });
});

describe('the verdicts across reps', () => {
    const outcomes = [outcome('X', 'finish', 0.9, 0, 0, 0, 0, 0), outcome('Y', 'continue', 0.9, 0, 0, 0, 0, 0), outcome('Z', 'finish', 0.9, 0, 0, 0, 0, 0)];
    const observations = [
        observation('X', 1, { Passed: true, Score: 0.95 }),
        observation('X', 2, { Passed: true, Score: 0.95 }),
        observation('Y', 1, { Passed: true, Score: 0.95 }),
        observation('Y', 2, { Passed: false, Score: 0.85 }),
        observation('Z', 1, { Passed: false, Score: null, CallSucceeded: false })
    ];

    it('counts every rep, a failed call as a fail', () => {
        expect(PerRepVerdictsOf(outcomes, observations, 0.9)).toEqual({
            Threshold: 0.9,
            FinishReps: 3,
            FinishPasses: 2,
            ContinueReps: 2,
            ContinuePasses: 1,
            SkippableShare: 2 / 3,
            FalseFinishRate: 1 / 2
        });
    });

    it('measures how often a round repeats its verdict, over rounds with two or more reps', () => {
        const repeatability = VerdictRepeatabilityOf(observations, 0.9);
        expect(repeatability.Rounds).toBe(2);
        expect(repeatability.MeanVerdictAgreement).toBeCloseTo(0.75, 10);
        expect(repeatability.UnanimousShare).toBeCloseTo(0.5, 10);
        expect(repeatability.MeanScoreStdDev).toBeCloseTo(0.025, 10);
    });
});

describe('ComputeArmMetrics', () => {
    it('reports the sweep, the production threshold and the gate cost from the same outcomes', () => {
        const observations = OUTCOMES.map((o, i) => observation(o.RoundId, 1, {
            Score: o.Score,
            CallSucceeded: o.Score !== null,
            LatencyMs: o.GateLatencyMs,
            CostUSD: o.GateCostUSD,
            ModelName: i % 2 === 0 ? 'Model A' : 'Model B'
        }));
        const metrics = ComputeArmMetrics('generic', OUTCOMES, observations, {
            Seed: 7,
            BootstrapResamples: 200,
            CalibrationFolds: 5,
            Thresholds: FINISH_IF_SWEEP_THRESHOLDS,
            ProductionThreshold: 0.9
        });
        expect(metrics).toMatchObject({ Arm: 'generic', Rounds: 5, ScoredRounds: 4, Labels: { Finish: 3, Continue: 2 }, Calls: 5, FailedCalls: 1, UnusableReps: 1 });
        expect(metrics.Sweep).toHaveLength(10);
        expect(metrics.Production.Raw).toEqual(SweepRowAt(OUTCOMES, OUTCOMES.map(o => o.Score), 0.9));
        expect(metrics.Production.Raw).toEqual(metrics.Sweep[8]);
        // Scored rounds: finish 0.95, 0.8; continue 0.92, 0.4. Of the four pairs, 0.8 < 0.92 is the one miss.
        expect(metrics.Auc).toBeCloseTo(0.75, 10);
        expect(metrics.Gate.LatencyMsPer1k).toBeCloseTo((600 / 5) * 1000, 6);
        expect(metrics.Gate.CostUSDPer1k).toBeCloseTo((0.004 / 5) * 1000, 10);
        expect(metrics.Gate.CallsWithoutCost).toBe(1);
        expect(metrics.CalibratedSweep).toHaveLength(10);
    });
});
