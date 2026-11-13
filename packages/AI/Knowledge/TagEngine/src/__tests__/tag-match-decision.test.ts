import { describe, it, expect, vi } from 'vitest';

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: {
        Instance: {
            // A fixture fit: Jev at one version, calibrated = sigmoid(2·logit(p) − 1).
            CalibrateDecisionProbability: (key: { Use: string; Question: string }, raw: number, by: { ModelName?: string; ResolvedModel?: string }) => {
                if (key.Use !== 'tag-match' || key.Question !== 'same' || by.ModelName !== 'Jev' || by.ResolvedModel !== 'jev-1') return null;
                const logit = Math.log(raw / (1 - raw));
                return 1 / (1 + Math.exp(-(2 * logit - 1)));
            },
        },
    },
}));

vi.mock('@memberjunction/ai-prompts', () => ({
    ResolveDecisionUseMode: (v: unknown, fallback: string) =>
        ['Prompt', 'Shadow', 'Decision'].find(m => typeof v === 'string' && m.toLowerCase() === v.trim().toLowerCase()) ?? fallback,
}));

import {
    BuildTagMatchQuestions,
    BuildTagMatchState,
    CompareTagMatchDecision,
    GetTagMatchDecisionMode,
    ReadTagMatchVerdict,
    SetTagMatchDecisionMode,
    TAG_MATCH_CALIBRATION_KEY,
    TAG_MATCH_MAX_SOURCE_CHARS,
    TagMatchAnsweredBy,
    TagMatchApplies,
    type TagMatchDecisionInput,
} from '../tag-match-decision';

const INPUT: TagMatchDecisionInput = {
    Keyword: 'ML methods',
    TagName: 'Machine Learning',
    TagDescription: ' ML algorithms ',
    TagPath: ['Technology'],
    SourceText: 'A paper about gradient boosting.',
};
const JEV = { ModelName: 'Jev', ResolvedModel: 'jev-1' };

describe('tag-match decision', () => {
    it('asks one Likelihood that names the keyword, the tag, its path and its description', () => {
        const q = BuildTagMatchQuestions(INPUT);
        expect(Object.keys(q)).toEqual(['same']);
        expect(q.same.Kind).toBe('Likelihood');
        expect(q.same.Instructions).toContain('"ML methods"');
        expect(q.same.Instructions).toContain('"Machine Learning" (under Technology), described as "ML algorithms"');
        expect(TAG_MATCH_CALIBRATION_KEY).toEqual({ Use: 'tag-match', Question: 'same' });
    });

    it('leaves out a missing path or description', () => {
        const q = BuildTagMatchQuestions({ ...INPUT, TagPath: [], TagDescription: null });
        expect(q.same.Instructions).toContain('the existing tag "Machine Learning", so');
    });

    it('states the keyword and tag, and trims long source text', () => {
        expect(BuildTagMatchState(INPUT)).toEqual({
            keyword: 'ML methods', tag: 'Machine Learning', tagPath: 'Technology',
            tagDescription: 'ML algorithms', sourceText: 'A paper about gradient boosting.',
        });
        const long = BuildTagMatchState({ ...INPUT, TagDescription: null, SourceText: 'x'.repeat(TAG_MATCH_MAX_SOURCE_CHARS + 50) });
        expect(long).not.toHaveProperty('tagDescription');
        expect((long.sourceText as string).length).toBe(TAG_MATCH_MAX_SOURCE_CHARS + 1);
    });

    it('reads the answer raw and calibrated for the model that answered', () => {
        const yes = ReadTagMatchVerdict({ same: { Kind: 'Likelihood', Probability: 0.9 } as never }, JEV);
        expect(yes.RawProbability).toBe(0.9);
        expect(yes.CalibratedProbability).toBeCloseTo(1 / (1 + Math.exp(-(2 * Math.log(9) - 1))), 6);
        expect(TagMatchApplies(yes)).toBe(true);

        const other = ReadTagMatchVerdict({ same: { Kind: 'Likelihood', Probability: 0.99 } as never }, { ModelName: 'Jev', ResolvedModel: 'jev-2' });
        expect(other).toEqual({ RawProbability: 0.99, CalibratedProbability: null });
        expect(TagMatchApplies(other)).toBe(false);

        expect(ReadTagMatchVerdict({}, JEV)).toEqual({ RawProbability: null, CalibratedProbability: null });
        expect(ReadTagMatchVerdict({ same: { Kind: 'Choice' } as never }, JEV).RawProbability).toBeNull();
    });

    it('applies the tag only at or above the bar', () => {
        expect(TagMatchApplies({ RawProbability: 0.7, CalibratedProbability: 0.8 })).toBe(true);
        expect(TagMatchApplies({ RawProbability: 0.7, CalibratedProbability: 0.79 })).toBe(false);
    });

    it('takes the answering model from the run', () => {
        expect(TagMatchAnsweredBy({ modelInfo: { modelName: 'Jev' }, DecisionResult: { ResolvedModel: 'jev-1' } } as never)).toEqual(JEV);
    });

    it('compares a shadow answer with the existing path, which always queued it', () => {
        const would = CompareTagMatchDecision(INPUT, { RawProbability: 0.7, CalibratedProbability: null }, 'tag-1', 0.871);
        expect(would.Agreed).toBe(false);
        expect(would.Summary).toContain('decision 0.700, would apply it');
        expect(would.Details).toMatchObject({ TagID: 'tag-1', SimilarityScore: 0.871, RawProbability: 0.7, CalibratedProbability: null });
        expect(CompareTagMatchDecision(INPUT, { RawProbability: 0.2, CalibratedProbability: null }, 'tag-1', 0.86).Agreed).toBe(true);
        expect(CompareTagMatchDecision(INPUT, { RawProbability: null, CalibratedProbability: null }, 'tag-1', 0.86).Summary).toContain('no answer');
    });

    it('defaults to Shadow and reads a configured mode case-insensitively', () => {
        expect(GetTagMatchDecisionMode()).toBe('Shadow');
        SetTagMatchDecisionMode('decision');
        expect(GetTagMatchDecisionMode()).toBe('Decision');
        SetTagMatchDecisionMode('nonsense');
        expect(GetTagMatchDecisionMode()).toBe('Shadow');
    });
});
