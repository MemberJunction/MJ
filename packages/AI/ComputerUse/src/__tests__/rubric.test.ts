import { describe, it, expect } from 'vitest';
import { evaluateRubric, CriterionVerdict } from '../judge/rubric.js';

function c(criterion: string, met: boolean): CriterionVerdict {
    return { criterion, met, evidence: '' };
}

describe('evaluateRubric', () => {
    it('is Done only when every criterion is met', () => {
        const r = evaluateRubric([c('a', true), c('b', true), c('c', true)]);
        expect(r.done).toBe(true);
        expect(r.coverage).toBe(1);
        expect(r.metCount).toBe(3);
        expect(r.unmet).toEqual([]);
    });

    it('is not Done when any criterion is unmet, and reports coverage + unmet list', () => {
        const r = evaluateRubric([c('a', true), c('b', false), c('c', true)]);
        expect(r.done).toBe(false);
        expect(r.coverage).toBeCloseTo(2 / 3);
        expect(r.metCount).toBe(2);
        expect(r.unmet).toEqual(['b']);
    });

    it('coverage is 0 when nothing is met', () => {
        const r = evaluateRubric([c('a', false), c('b', false)]);
        expect(r.done).toBe(false);
        expect(r.coverage).toBe(0);
    });

    it('signals an empty rubric distinctly (caller falls back to scalar verdict)', () => {
        const r = evaluateRubric([]);
        expect(r.total).toBe(0);
        expect(r.done).toBe(false);
        expect(r.coverage).toBe(0);
    });
});
