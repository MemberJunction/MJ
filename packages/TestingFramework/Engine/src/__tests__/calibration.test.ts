import { describe, expect, it } from 'vitest';
import { agreementByCriterion, calibrationOracles, quadraticWeightedKappa } from '../drivers/calibration.js';

const agreed = [
    { subjectId: 'a', criterionId: 'facts', humanLevel: 1, aiLevel: 1, categoryCount: 2, humanScore: 1, aiScore: 1, major: 1 },
    { subjectId: 'b', criterionId: 'facts', humanLevel: 0, aiLevel: 0, categoryCount: 2, humanScore: 0, aiScore: 0, major: 1 },
];

describe('rubric judge calibration', () => {
    it('scores perfect agreement as kappa 1 and a swapped pair as no agreement', () => {
        expect(quadraticWeightedKappa([1, 0], [1, 0], 2)).toBe(1);
        expect(quadraticWeightedKappa([0, 1], [1, 0], 2)).toBe(-1);
        const perfect = calibrationOracles(agreed, { minWeightedKappa: 0.8 });
        expect(perfect.score).toBe(1);
        expect(perfect.oracles.every(oracle => oracle.passed)).toBe(true);
        expect(perfect.oracles.map(oracle => oracle.details && (oracle.details as { scope?: string }).scope)).toEqual(['criterion', 'overall']);
    });

    it('fails the overall oracle when kappa is below the minimum and reports the sample size', () => {
        const swapped = calibrationOracles([
            { subjectId: 'a', criterionId: 'facts', humanLevel: 0, aiLevel: 1, categoryCount: 2, humanScore: 0, aiScore: 1, major: 1 },
            { subjectId: 'b', criterionId: 'facts', humanLevel: 1, aiLevel: 0, categoryCount: 2, humanScore: 1, aiScore: 0, major: 1 },
        ], { minWeightedKappa: 0.8, maxMeanAbsoluteError: 0.2 });
        expect(swapped.score).toBe(0);
        expect(swapped.oracles.find(oracle => (oracle.details as { scope?: string }).scope === 'overall')?.passed).toBe(false);
        expect((swapped.oracles[0].details as { sampleSize: number }).sampleSize).toBe(2);
        expect(agreementByCriterion(swapped.oracles.length ? [
            { subjectId: 'a', criterionId: 'facts', humanLevel: 0, aiLevel: 1, categoryCount: 2, humanScore: 0, aiScore: 1, major: 1 },
        ] : [])[0].meanAbsoluteError).toBe(1);
    });

    it('returns no comparison when the gold set has no paired scores', () => {
        const empty = calibrationOracles([]);
        expect(empty.score).toBe(0);
        expect(empty.oracles[0].passed).toBe(false);
        expect(empty.oracles[0].message).toMatch(/No human and AI/);
    });
});
