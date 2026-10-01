import { describe, expect, it } from 'vitest';
import { criterionFailureRates, disagreementFromScores, rubricPickerOptions, rubricRunView, scoreTrend } from '../lib/models/testing-rubrics';

describe('testing rubric UI', () => {
    it('orders the review queue by the largest human–AI gap', () => {
        const queue = disagreementFromScores({
            evaluations: [
                { id: 'human-facts', subjectId: 'run', versionId: 'v1', evaluatorType: 'Human', status: 'Submitted' },
                { id: 'ai-facts', subjectId: 'run', versionId: 'v1', evaluatorType: 'AIPrompt', status: 'Submitted' },
                { id: 'human-tone', subjectId: 'run', versionId: 'v1', evaluatorType: 'Human', status: 'Submitted' },
                { id: 'ai-tone', subjectId: 'run', versionId: 'v1', evaluatorType: 'AIPrompt', status: 'Submitted' },
                { id: 'ai-open', subjectId: 'run', versionId: 'v1', evaluatorType: 'AIPrompt', status: 'Submitted' },
            ],
            scores: [
                { evaluationId: 'human-facts', key: 'facts', name: 'Facts', normalizedScore: 0.4 },
                { evaluationId: 'ai-facts', key: 'facts', name: 'Facts', normalizedScore: 1 },
                { evaluationId: 'human-tone', key: 'tone', name: 'Tone', normalizedScore: 0.9 },
                { evaluationId: 'ai-tone', key: 'tone', name: 'Tone', normalizedScore: 0.8 },
                { evaluationId: 'ai-open', key: 'open', name: 'Open', normalizedScore: 1 },
            ],
        });
        expect(queue.map(row => row.key)).toEqual(['facts', 'tone']);
        expect(queue[0].gap).toBeCloseTo(0.6);
    });

    it('trends one suite and reports per-criterion failure rates', () => {
        const trend = scoreTrend([
            { at: '2026-02-01', score: 0.5, scopeId: 'suite' },
            { at: '2026-01-01', score: 1, scopeId: 'suite' },
            { at: '2026-03-01', score: null, scopeId: 'suite' },
            { at: '2026-01-01', score: 0, scopeId: 'other' },
        ], 'suite');
        expect(trend.map(point => point.score)).toEqual([1, 0.5]);
        const rates = criterionFailureRates([
            { key: 'facts', normalizedScore: 0.4, passThreshold: 0.7 },
            { key: 'facts', normalizedScore: 0.9, passThreshold: 0.7 },
            { key: 'tone', normalizedScore: 1, passThreshold: 0.7 },
            { key: 'tone', normalizedScore: null },
            { key: 'gate', normalizedScore: 0.9, gateFailed: true, passThreshold: 0.7 },
        ]);
        expect(rates).toEqual([
            { key: 'gate', rate: 1, count: 1 },
            { key: 'facts', rate: 0.5, count: 2 },
            { key: 'tone', rate: 0, count: 1 },
        ]);
    });

    it('offers active rubrics by name and builds a run result with rationale and evidence', () => {
        expect(rubricPickerOptions([
            { ID: 'b', Name: 'Beta', Status: 'Active' },
            { ID: 'a', Name: 'Alpha', Status: 'Disabled' },
            { ID: 'c', Name: 'Caret', Status: 'Active' },
        ]).map(row => row.name)).toEqual(['Beta', 'Caret']);
        const view = rubricRunView([{
            oracleType: 'rubric',
            details: { Outcome: 'Passed', Criteria: [{ Key: 'facts', Name: 'Facts', NormalizedScore: 1, Rationale: 'Cited.', Evidence: 'Page 2.' }] },
        }]);
        expect(view?.result.outcome).toBe('Passed');
        expect(view?.answers[0]).toMatchObject({ rationale: 'Cited.', evidence: 'Page 2.' });
        const weighted = [
            { Key: 'heavy', Name: 'Heavy', NormalizedScore: 1, Weight: 2, Rationale: 'Yes.' },
            { Key: 'light', Name: 'Light', NormalizedScore: 0, Weight: 1, Evidence: 'No.' },
        ];
        expect(rubricRunView([{ oracleType: 'rubric', details: { Criteria: weighted } }])?.result.normalizedScore).toBeNull();
        expect(rubricRunView([{ oracleType: 'rubric', details: { NormalizedScore: 2 / 3, Criteria: weighted } }])?.result.normalizedScore).toBeCloseTo(2 / 3);
    });
});
