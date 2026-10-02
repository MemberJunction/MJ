import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AgreementByCriterion, CalibrationOracles, CalibrationPairs, QuadraticWeightedKappa } from '../drivers/calibration.js';

const agreed = [
    { subjectId: 'a', criterionId: 'facts', humanLevel: 1, aiLevel: 1, categoryCount: 2, humanScore: 1, aiScore: 1, major: 1 },
    { subjectId: 'b', criterionId: 'facts', humanLevel: 0, aiLevel: 0, categoryCount: 2, humanScore: 0, aiScore: 0, major: 1 },
];

describe('rubric judge calibration', () => {
    it('does not keep camelCase aliases of the calibration helpers', () => {
        const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../drivers/calibration.ts'), 'utf8');
        expect(source).not.toContain('export function rankLevels');
        expect(source).not.toContain('export function calibrationOracles');
    });

    it('scores perfect agreement as kappa 1 and a swapped pair as no agreement', () => {
        expect(QuadraticWeightedKappa([1, 0], [1, 0], 2)).toBe(1);
        expect(QuadraticWeightedKappa([0, 1], [1, 0], 2)).toBe(-1);
        const perfect = CalibrationOracles(agreed, { minWeightedKappa: 0.8, minSampleSize: 2 });
        expect(perfect.score).toBe(1);
        expect(perfect.oracles.every(oracle => oracle.passed)).toBe(true);
        expect(perfect.oracles.map(oracle => oracle.details && (oracle.details as { scope?: string }).scope)).toEqual(['criterion', 'overall']);
    });

    it('fails the overall oracle when kappa is below the minimum and reports the sample size', () => {
        const swapped = CalibrationOracles([
            { subjectId: 'a', criterionId: 'facts', humanLevel: 0, aiLevel: 1, categoryCount: 2, humanScore: 0, aiScore: 1, major: 1 },
            { subjectId: 'b', criterionId: 'facts', humanLevel: 1, aiLevel: 0, categoryCount: 2, humanScore: 1, aiScore: 0, major: 1 },
        ], { minWeightedKappa: 0.8, maxMeanAbsoluteError: 0.2, minSampleSize: 2 });
        expect(swapped.score).toBe(0);
        expect(swapped.oracles.find(oracle => (oracle.details as { scope?: string }).scope === 'overall')?.passed).toBe(false);
        expect((swapped.oracles[0].details as { sampleSize: number }).sampleSize).toBe(2);
        expect(AgreementByCriterion(swapped.oracles.length ? [
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
        const agreed = CalibrationPairs({
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
        expect(QuadraticWeightedKappa(agreed.map(pair => pair.humanLevel), agreed.map(pair => pair.aiLevel), agreed[0].categoryCount)).toBe(1);
        const swapped = CalibrationPairs({
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
        expect(QuadraticWeightedKappa(swapped.map(pair => pair.humanLevel), swapped.map(pair => pair.aiLevel), 2)).toBe(-1);
        const judged = CalibrationOracles(swapped, { minSampleSize: 2, perCriterion: { facts: { minWeightedKappa: 0.5 } } });
        expect(judged.oracles[0].message.startsWith('facts:')).toBe(true);
        expect(judged.oracles[0].passed).toBe(false);
        const folded = CalibrationPairs({
            versions: [{ id: 'Version', major: 1 }],
            levels: [
                { id: 'low', scaleId: 'Scale', sequence: 1 },
                { id: 'high', scaleId: 'scale', sequence: 2 },
            ],
            criteria: [{ id: 'Criterion-Row', key: 'facts' }],
            evaluations: [
                { id: 'Human-1', subjectId: 'one', versionId: 'version', evaluatorType: 'Human', status: 'Submitted' },
                { id: 'AI-1', subjectId: 'one', versionId: 'version', evaluatorType: 'AIPrompt', status: 'Submitted' },
            ],
            scores: [
                { evaluationId: 'human-1', criterionId: 'criterion-row', normalizedScore: 1, scaleLevelId: 'HIGH' },
                { evaluationId: 'ai-1', criterionId: 'criterion-row', normalizedScore: 0, scaleLevelId: 'low' },
            ],
        });
        expect(folded).toHaveLength(1);
        expect(folded[0].criterionId).toBe('facts');
        expect(folded[0].major).toBe(1);
    });

    it('returns InsufficientData below the default sample of 20', () => {
        const few = CalibrationOracles(agreed);
        expect(few.score).toBe(0);
        expect(few.oracles[0].message).toBe('InsufficientData');
        expect(few.oracles[0].passed).toBe(false);
        expect(few.oracles[0].details).toMatchObject({ sampleSize: 2, minSampleSize: 20 });
        const enough = Array.from({ length: 20 }, (_, index) => ({
            subjectId: `s${index}`, criterionId: 'facts', humanLevel: 1, aiLevel: 1, categoryCount: 2, humanScore: 1, aiScore: 1, major: 1,
        }));
        expect(CalibrationOracles(enough).oracles.some(oracle => oracle.message === 'InsufficientData')).toBe(false);
    });

    it('returns no comparison when the gold set has no paired scores', () => {
        const empty = CalibrationOracles([]);
        expect(empty.score).toBe(0);
        expect(empty.oracles[0].passed).toBe(false);
        expect(empty.oracles[0].message).toMatch(/No human and AI/);
    });
});
