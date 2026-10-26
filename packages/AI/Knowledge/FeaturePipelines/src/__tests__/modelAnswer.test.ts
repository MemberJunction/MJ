import { describe, it, expect } from 'vitest';
import { ModelAnswer } from '../spec/model-answer';

describe('ModelAnswer.Reasoning', () => {
    it('reads a top-level reasoning key in any case', () => {
        expect(ModelAnswer.Reasoning({ Reasoning: 'Leads the team' })).toBe('Leads the team');
        expect(ModelAnswer.Reasoning({ reasoning: 'Leads the team' })).toBe('Leads the team');
    });
    it('treats empty or whitespace-only reasoning, a non-string, or a non-object answer as none', () => {
        expect(ModelAnswer.Reasoning({ Reasoning: '   ' })).toBeUndefined();
        expect(ModelAnswer.Reasoning({ Reasoning: '' })).toBeUndefined();
        expect(ModelAnswer.Reasoning({ Reasoning: 3 })).toBeUndefined();
        expect(ModelAnswer.Reasoning(['Reasoning'])).toBeUndefined();
        expect(ModelAnswer.Reasoning('Reasoning')).toBeUndefined();
    });
});
