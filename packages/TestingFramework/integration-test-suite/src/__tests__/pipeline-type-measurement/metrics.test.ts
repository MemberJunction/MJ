/**
 * metrics.test.ts — accuracy, recall, agreement and repeatability against hand-computed values from
 * the fixture table in `fixtures.ts`.
 */
import { describe, expect, it } from 'vitest';
import {
    AgreementBetweenTypes, AgreementRate, BootstrapInterval, IsCorrect, Mean, NearestRankQuantile, PerValueRecall,
    PredictionIndex, RecordAccuracyScores, Repeatability, SummarizeAccuracy,
} from '../../pipeline-type-measurement/metrics';
import type { MetricContext } from '../../pipeline-type-measurement/metrics';
import { Answer, PREDICTIONS, SAMPLE } from './fixtures';

const ctx: MetricContext = { Sample: SAMPLE, Reps: 2, Index: new PredictionIndex(PREDICTIONS) };

describe('IsCorrect', () => {
    it('is true only for a successful answer equal to the label', () => {
        expect(IsCorrect(Answer('LLM', 1, 'r1', 'A'), 'A')).toBe(true);
        expect(IsCorrect(Answer('LLM', 1, 'r1', 'B'), 'A')).toBe(false);
        expect(IsCorrect(Answer('LLM', 1, 'r1', null), 'A')).toBe(false);
        expect(IsCorrect(undefined, 'A')).toBe(false);
    });
});

describe('accuracy', () => {
    it('scores each record by the share of its reps that were right', () => {
        // LLM: r1 2/2, r2 1/2, r3 2/2, r4 1/2 (rep 2 failed). Decision: r1 2/2, r2 1/2, r3 1/2, r4 1/2.
        expect(RecordAccuracyScores(ctx, 'LLM')).toEqual([1, 0.5, 1, 0.5]);
        expect(RecordAccuracyScores(ctx, 'Decision')).toEqual([1, 0.5, 0.5, 0.5]);
    });

    it('summarizes overall, per rep, and failures per rep', () => {
        const llm = SummarizeAccuracy(ctx, 'LLM', 7, 200);
        expect(llm.Accuracy).toBe(0.75);
        expect(llm.PerRep).toEqual([0.75, 0.75]);
        expect(llm.FailuresPerRep).toEqual([0, 1]);

        const decision = SummarizeAccuracy(ctx, 'Decision', 7, 200);
        expect(decision.Accuracy).toBe(0.625);
        expect(decision.PerRep).toEqual([0.75, 0.5]);
        expect(decision.FailuresPerRep).toEqual([0, 0]);
    });

    it('brackets the accuracy with its bootstrap interval', () => {
        const llm = SummarizeAccuracy(ctx, 'LLM', 7, 500);
        expect(llm.CI95).not.toBeNull();
        expect(llm.CI95?.Low).toBeLessThanOrEqual(0.75);
        expect(llm.CI95?.High).toBeGreaterThanOrEqual(0.75);
        // Record scores are 0.5 or 1, so no resampled mean can leave [0.5, 1].
        expect(llm.CI95?.Low).toBeGreaterThanOrEqual(0.5);
        expect(llm.CI95?.High).toBeLessThanOrEqual(1);
    });
});

describe('BootstrapInterval', () => {
    it('collapses to the value when every score is the same', () => {
        expect(BootstrapInterval([1, 1, 1], 100, 1)).toEqual({ Low: 1, High: 1 });
        expect(BootstrapInterval([0, 0], 100, 1)).toEqual({ Low: 0, High: 0 });
    });

    it('is reproducible from its seed', () => {
        const scores = [1, 0, 1, 1, 0, 0.5, 1, 0];
        expect(BootstrapInterval(scores, 300, 42)).toEqual(BootstrapInterval(scores, 300, 42));
    });

    it('narrows at a lower confidence level', () => {
        const scores = [1, 0, 1, 1, 0, 0.5, 1, 0, 1, 1];
        const wide = BootstrapInterval(scores, 1000, 3, 0.95);
        const narrow = BootstrapInterval(scores, 1000, 3, 0.5);
        expect(wide && narrow).toBeTruthy();
        expect((narrow?.High ?? 0) - (narrow?.Low ?? 0)).toBeLessThan((wide?.High ?? 0) - (wide?.Low ?? 0));
    });

    it('has no interval for no scores', () => {
        expect(BootstrapInterval([], 100, 1)).toBeNull();
    });
});

describe('NearestRankQuantile', () => {
    it('takes the smallest value with at least q of the values at or below it', () => {
        expect(NearestRankQuantile([10, 20, 30, 40], 0.5)).toBe(20);
        expect(NearestRankQuantile([10, 20, 30, 40], 0.75)).toBe(30);
        expect(NearestRankQuantile([10, 20, 30, 40], 0.76)).toBe(40);
        expect(NearestRankQuantile([10, 20, 30, 40], 0)).toBe(10);
    });

    it('does not round a rank up through floating-point error', () => {
        const sorted = Array.from({ length: 2000 }, (_, i) => i);
        expect(NearestRankQuantile(sorted, 0.975)).toBe(1949);
        expect(NearestRankQuantile(sorted, 0.025)).toBe(49);
    });
});

describe('PerValueRecall', () => {
    it('pools each value over its records and reps', () => {
        // LLM A: r1 (✓✓), r2 (✗✓) = 3/4. LLM B: r3 (✓✓), r4 (✓, failed) = 3/4.
        expect(PerValueRecall(ctx, 'LLM', ['A', 'B'])).toEqual([
            { Value: 'A', Support: 2, Recall: 0.75 },
            { Value: 'B', Support: 2, Recall: 0.75 },
        ]);
        // Decision A: r1 (✓✓), r2 (✓✗) = 3/4. Decision B: r3 (✗✓), r4 (✓✗) = 2/4.
        expect(PerValueRecall(ctx, 'Decision', ['A', 'B'])).toEqual([
            { Value: 'A', Support: 2, Recall: 0.75 },
            { Value: 'B', Support: 2, Recall: 0.5 },
        ]);
    });

    it('has no recall for a value with no records', () => {
        expect(PerValueRecall(ctx, 'LLM', ['C'])).toEqual([{ Value: 'C', Support: 0, Recall: null }]);
    });
});

describe('agreement and repeatability', () => {
    it('counts records where both answers succeeded and match', () => {
        // Rep 1: r1 A=A, r2 B≠A, r3 B≠A, r4 B=B → 2/4. Rep 2: r1 A=A, r2 A≠B, r3 B=B, r4 failed → 2/4.
        expect(AgreementRate(ctx, { Type: 'LLM', Rep: 1 }, { Type: 'Decision', Rep: 1 })).toBe(0.5);
        expect(AgreementBetweenTypes(ctx)).toEqual({ PerRep: [0.5, 0.5], Mean: 0.5 });
    });

    it('compares rep 1 with rep 2 of one type', () => {
        // LLM: r1 A/A, r2 B/A, r3 B/B, r4 B/failed → 2/4. Decision: r1 A/A, r2 A/B, r3 A/B, r4 B/A → 1/4.
        expect(Repeatability(ctx, 'LLM')).toBe(0.5);
        expect(Repeatability(ctx, 'Decision')).toBe(0.25);
    });

    it('has no repeatability with one rep', () => {
        expect(Repeatability({ ...ctx, Reps: 1 }, 'LLM')).toBeNull();
    });
});

describe('Mean', () => {
    it('averages, and is null for nothing', () => {
        expect(Mean([1, 2, 3, 4])).toBe(2.5);
        expect(Mean([])).toBeNull();
    });
});
