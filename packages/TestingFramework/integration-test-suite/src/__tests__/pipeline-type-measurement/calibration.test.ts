/**
 * calibration.test.ts — Decision's reliability table and ECE, and the escalation simulation, against
 * hand-computed values from the fixture table in `fixtures.ts`.
 */
import { describe, expect, it } from 'vitest';
import { BinIndex, EscalationFloors, HybridAnswer, SimulateEscalation, SummarizeCalibration } from '../../pipeline-type-measurement/calibration';
import { PredictionIndex } from '../../pipeline-type-measurement/metrics';
import type { MetricContext } from '../../pipeline-type-measurement/metrics';
import { Answer, COSTS, PREDICTIONS, SAMPLE } from './fixtures';

const ctx: MetricContext = { Sample: SAMPLE, Reps: 2, Index: new PredictionIndex(PREDICTIONS) };

describe('SummarizeCalibration', () => {
    it('bins Decision confidence and computes the ECE', () => {
        const calibration = SummarizeCalibration(ctx, 'Decision');
        expect(calibration.Points).toBe(8);
        expect(calibration.Excluded).toBe(0);
        // Bin gaps: 0.4 (1 answer, wrong) .4; 0.5–0.6 (0.5, 0.55, both wrong) .525; 0.6 (right) .4;
        // 0.7 (right) .3; 0.8 (right) .2; 0.9–1.0 (0.9, 0.95, both right) .075.
        // ECE = (.4 + 2×.525 + .4 + .3 + .2 + 2×.075) / 8 = 0.3125.
        expect(calibration.ECE).toBeCloseTo(0.3125, 10);

        const filled = calibration.Bins.filter((bin) => bin.Count > 0);
        expect(filled.map((bin) => [bin.Lower, bin.Count, bin.Accuracy])).toEqual([
            [0.4, 1, 0], [0.5, 2, 0], [0.6, 1, 1], [0.7, 1, 1], [0.8, 1, 1], [0.9, 2, 1],
        ]);
        expect(filled[1].MeanConfidence).toBeCloseTo(0.525, 10);
        expect(filled[5].MeanConfidence).toBeCloseTo(0.925, 10);
        expect(calibration.Bins).toHaveLength(10);
    });

    it('excludes answers with no confidence, and failed ones', () => {
        const index = new PredictionIndex([Answer('Decision', 1, 'r1', 'A', 0.9), Answer('Decision', 1, 'r2', 'A'), Answer('Decision', 1, 'r3', null)]);
        const calibration = SummarizeCalibration({ Sample: SAMPLE, Reps: 1, Index: index }, 'Decision');
        expect(calibration.Points).toBe(1);
        expect(calibration.Excluded).toBe(3);
        expect(calibration.ECE).toBeCloseTo(0.1, 10);
    });

    it('has no ECE with no confidences', () => {
        expect(SummarizeCalibration(ctx, 'LLM').ECE).toBeNull();
    });
});

describe('BinIndex', () => {
    it('puts a boundary in the bin above, and 1.0 in the last bin', () => {
        expect(BinIndex(0.7, 10)).toBe(7);
        expect(BinIndex(0.3, 10)).toBe(3);
        expect(BinIndex(0.69, 10)).toBe(6);
        expect(BinIndex(1, 10)).toBe(9);
        expect(BinIndex(0, 10)).toBe(0);
    });
});

describe('EscalationFloors', () => {
    it('runs 0.50 to 0.95 in steps of 0.05', () => {
        expect(EscalationFloors()).toEqual([0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95]);
    });
});

describe('HybridAnswer', () => {
    const llm = Answer('LLM', 1, 'r1', 'B');

    it('keeps a decision at or above the floor', () => {
        const decision = Answer('Decision', 1, 'r1', 'A', 0.7);
        expect(HybridAnswer(decision, llm, 0.7)).toEqual({ Answer: decision, Escalated: false });
    });

    it('escalates a decision below the floor, or with no confidence', () => {
        expect(HybridAnswer(Answer('Decision', 1, 'r1', 'A', 0.69), llm, 0.7)).toEqual({ Answer: llm, Escalated: true });
        expect(HybridAnswer(Answer('Decision', 1, 'r1', 'A'), llm, 0.7)).toEqual({ Answer: llm, Escalated: true });
    });

    it('fails a failed decision without escalating, as InferProcessor does', () => {
        const failed = Answer('Decision', 1, 'r1', null);
        expect(HybridAnswer(failed, llm, 0.7)).toEqual({ Answer: failed, Escalated: false });
    });
});

describe('SimulateEscalation', () => {
    it('matches the hand-computed hybrid at three floors', () => {
        const [at50, at60, at95] = SimulateEscalation(ctx, COSTS, [0.5, 0.6, 0.95]);

        // 0.50: only rep 2 r4 (0.40) escalates, to a failed LLM answer. Right: rep 1 r1 r2 r4, rep 2 r1 r3 = 5/8.
        expect(at50.Accuracy).toBe(0.625);
        expect(at50.EscalatedShare).toBe(0.125);
        // 8 Decision runs × 0.001 + 1 LLM run × 0.01 = 0.018 over 8 answers.
        expect(at50.CostPer1000).toBeCloseTo(2.25, 10);

        // 0.60: rep 1 r3 (0.55 → LLM B, right), rep 2 r2 (0.50 → LLM A, right), rep 2 r4 (0.40 → failed). 7/8.
        expect(at60.Accuracy).toBe(0.875);
        expect(at60.EscalatedShare).toBe(0.375);
        expect(at60.CostPer1000).toBeCloseTo(4.75, 10);

        // 0.95: all but rep 2 r1 (0.95) escalate. Rep 1 LLM: A, B, B, B = 3 right; rep 2: r1 D ✓, r2 ✓, r3 ✓, r4 failed = 3.
        expect(at95.Accuracy).toBe(0.75);
        expect(at95.EscalatedShare).toBe(0.875);
        expect(at95.CostPer1000).toBeCloseTo(9.75, 10);
    });

    it('reports one point per default floor', () => {
        expect(SimulateEscalation(ctx, COSTS).map((p) => p.Floor)).toEqual(EscalationFloors());
    });

    it('has no cost when no run cost is known', () => {
        expect(SimulateEscalation(ctx, new Map(), [0.5])[0].CostPer1000).toBeNull();
    });
});
