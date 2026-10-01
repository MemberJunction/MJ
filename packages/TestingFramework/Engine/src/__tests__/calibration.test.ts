import { describe, expect, it } from 'vitest';
import { agreementByCriterion, calibrationOracles, calibrationPairs, quadraticWeightedKappa } from '../drivers/calibration.js';

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

    it('ranks sequence 1 and 2 the same as 0 and 1, and keys the oracle by the criterion key', () => {
        const levels = [
            { id: 'low', scaleId: 'scale', sequence: 1 },
            { id: 'high', scaleId: 'scale', sequence: 2 },
        ];
        const shared = {
            versions: [{ id: 'version', major: 1 }],
            levels,
            criteria: [{ id: 'criterion-row', key: 'facts' }],
        };
        const rows = (humanLevel: string, aiLevel: string, humanId: string, aiId: string, subjectId: string) => ({
            evaluations: [
                { id: humanId, subjectId, versionId: 'version', evaluatorType: 'Human', status: 'Submitted' },
                { id: aiId, subjectId, versionId: 'version', evaluatorType: 'AIPrompt', status: 'Submitted' },
            ],
            scores: [
                { evaluationId: humanId, criterionId: 'criterion-row', normalizedScore: humanLevel === 'high' ? 1 : 0, scaleLevelId: humanLevel },
                { evaluationId: aiId, criterionId: 'criterion-row', normalizedScore: aiLevel === 'high' ? 1 : 0, scaleLevelId: aiLevel },
            ],
        });
        const agreed = calibrationPairs({
            ...shared,
            ...rows('high', 'high', 'h1', 'a1', 'one'),
            evaluations: [
                ...rows('high', 'high', 'h1', 'a1', 'one').evaluations,
                ...rows('low', 'low', 'h2', 'a2', 'two').evaluations,
            ],
            scores: [
                ...rows('high', 'high', 'h1', 'a1', 'one').scores,
                ...rows('low', 'low', 'h2', 'a2', 'two').scores,
            ],
        });
        expect(agreed.map(pair => pair.humanLevel)).toEqual([1, 0]);
        expect(agreed[0].categoryCount).toBe(2);
        expect(agreed[0].criterionId).toBe('facts');
        expect(quadraticWeightedKappa(agreed.map(pair => pair.humanLevel), agreed.map(pair => pair.aiLevel), agreed[0].categoryCount)).toBe(1);
        const swapped = calibrationPairs({
            ...shared,
            evaluations: [
                ...rows('high', 'low', 'h1', 'a1', 'one').evaluations,
                ...rows('low', 'high', 'h2', 'a2', 'two').evaluations,
            ],
            scores: [
                ...rows('high', 'low', 'h1', 'a1', 'one').scores,
                ...rows('low', 'high', 'h2', 'a2', 'two').scores,
            ],
        });
        expect(quadraticWeightedKappa(swapped.map(pair => pair.humanLevel), swapped.map(pair => pair.aiLevel), 2)).toBe(-1);
        const judged = calibrationOracles(swapped, { perCriterion: { facts: { minWeightedKappa: 0.5 } } });
        expect(judged.oracles[0].message.startsWith('facts:')).toBe(true);
        expect(judged.oracles[0].passed).toBe(false);
    });

    it('returns no comparison when the gold set has no paired scores', () => {
        const empty = calibrationOracles([]);
        expect(empty.score).toBe(0);
        expect(empty.oracles[0].passed).toBe(false);
        expect(empty.oracles[0].message).toMatch(/No human and AI/);
    });
});
