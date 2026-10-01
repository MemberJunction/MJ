import { describe, expect, it } from 'vitest';
import { CriterionSpreads } from './criterion-spread.js';

describe('criterion spread', () => {
    it('reports each criterion\'s score spread across repeats', () => {
        const spreads = CriterionSpreads([
            { oracleResults: [{ oracleType: 'rubric', details: { Criteria: [{ Key: 'facts', NormalizedScore: 1 }, { Key: 'tone', NormalizedScore: 0.8 }] } }] },
            { oracleResults: [{ oracleType: 'rubric', details: { Criteria: [{ Key: 'facts', NormalizedScore: 0.4 }, { Key: 'tone', NormalizedScore: 0.8 }] } }] },
        ]);
        expect(spreads).toEqual([
            { Key: 'facts', Scores: [1, 0.4], Spread: 0.6 },
            { Key: 'tone', Scores: [0.8, 0.8], Spread: 0 },
        ]);
    });

    it('leaves out a criterion that was scored only once', () => {
        expect(CriterionSpreads([
            { oracleResults: [{ oracleType: 'rubric', details: { Criteria: [{ Key: 'facts', NormalizedScore: 1 }] } }] },
        ])).toEqual([]);
    });
});
