import { describe, expect, it } from 'vitest';
import { criterionSpreads } from './criterion-spread.js';

describe('criterion spread', () => {
    it('reports each criterion\'s score spread across repeats', () => {
        const spreads = criterionSpreads([
            { oracleResults: [{ oracleType: 'rubric', details: { Criteria: [{ Key: 'facts', NormalizedScore: 1 }, { Key: 'tone', NormalizedScore: 0.8 }] } }] },
            { oracleResults: [{ oracleType: 'rubric', details: { Criteria: [{ Key: 'facts', NormalizedScore: 0.4 }, { Key: 'tone', NormalizedScore: 0.8 }] } }] },
        ]);
        expect(spreads).toEqual([
            { key: 'facts', scores: [1, 0.4], spread: 0.6 },
            { key: 'tone', scores: [0.8, 0.8], spread: 0 },
        ]);
    });

    it('leaves out a criterion that was scored only once', () => {
        expect(criterionSpreads([
            { oracleResults: [{ oracleType: 'rubric', details: { Criteria: [{ Key: 'facts', NormalizedScore: 1 }] } }] },
        ])).toEqual([]);
    });
});
