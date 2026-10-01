import { describe, expect, it } from 'vitest';
import { criterionFailureRates, disagreementQueue, rubricPickerOptions, rubricRunView, scoreTrend } from '../lib/models/testing-rubrics';

describe('testing rubric UI', () => {
    it('orders the review queue by the largest human–AI gap', () => {
        const queue = disagreementQueue([
            { key: 'tone', name: 'Tone', humanMean: 0.9, aiMean: 0.8 },
            { key: 'facts', name: 'Facts', humanMean: 0.4, aiMean: 1 },
            { key: 'open', name: 'Open', humanMean: null, aiMean: 1 },
        ]);
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
            { key: 'facts', normalizedScore: 0.4, gateFailed: true },
            { key: 'facts', normalizedScore: 1 },
            { key: 'tone', normalizedScore: 1 },
            { key: 'tone', normalizedScore: null },
        ]);
        expect(rates).toEqual([
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
    });
});
