import { describe, it, expect } from 'vitest';
import { DecisionQuestion, DecisionResult, ModelUsage } from '@memberjunction/ai';
import {
    CheckDecisionLimits,
    DescribeDecisionMediaForRun,
    EstimateDecisionCallTokens,
    MergeChunkedDecisionResults,
    SplitDecisionQuestions,
} from '../decision/decision-limits';

const likelihood = (n: number): Record<string, DecisionQuestion> =>
    Object.fromEntries(Array.from({ length: n }, (_, i) => [`q${i + 1}`, { Kind: 'Likelihood', Instructions: `Is item ${i + 1} relevant?` } as DecisionQuestion]));

describe('SplitDecisionQuestions', () => {
    it('keeps one chunk when there is no limit', () => {
        const questions = likelihood(5);
        expect(SplitDecisionQuestions(questions, undefined)).toEqual([questions]);
        expect(SplitDecisionQuestions(questions, null)).toEqual([questions]);
        expect(SplitDecisionQuestions(questions, 0)).toEqual([questions]);
        expect(SplitDecisionQuestions(questions, -3)).toEqual([questions]);
    });

    it('keeps one chunk when the request fits', () => {
        const questions = likelihood(4);
        expect(SplitDecisionQuestions(questions, 4)).toEqual([questions]);
    });

    it('splits into chunks of the limit, in order', () => {
        const chunks = SplitDecisionQuestions(likelihood(5), 2);
        expect(chunks.map(c => Object.keys(c))).toEqual([['q1', 'q2'], ['q3', 'q4'], ['q5']]);
    });

    it('floors a fractional limit', () => {
        expect(SplitDecisionQuestions(likelihood(3), 2.9).map(c => Object.keys(c).length)).toEqual([2, 1]);
    });
});

describe('EstimateDecisionCallTokens', () => {
    it('counts the state and the largest chunk at four characters a token', () => {
        const questions = likelihood(2);
        const expected = Math.ceil(('x'.repeat(400).length + JSON.stringify(questions).length) / 4);
        expect(EstimateDecisionCallTokens('x'.repeat(400), questions)).toBe(expected);
    });

    it('counts an object state as its JSON', () => {
        const state = { ticket: 'Printer jams on page two' };
        const questions = likelihood(1);
        expect(EstimateDecisionCallTokens(state, questions)).toBe(Math.ceil((JSON.stringify(state).length + JSON.stringify(questions).length) / 4));
    });

    it('counts only the largest chunk when the request is split', () => {
        const questions = likelihood(10);
        expect(EstimateDecisionCallTokens('s', questions, 2)).toBeLessThan(EstimateDecisionCallTokens('s', questions));
    });
});

describe('CheckDecisionLimits', () => {
    const choice = (n: number): Record<string, DecisionQuestion> => ({
        pick: { Kind: 'Choice', Instructions: 'Pick one', Options: Array.from({ length: n }, (_, i) => ({ Value: `o${i}`, Description: `Option ${i}` })) },
    });
    const score = (n: number): Record<string, DecisionQuestion> => ({
        rate: { Kind: 'Score', Instructions: 'Rate it', Levels: Array.from({ length: n }, (_, i) => `Level ${i}`) },
    });

    it('passes when the model declares no limits', () => {
        expect(CheckDecisionLimits('Jev', undefined, 'state', choice(300))).toBeUndefined();
    });

    it('never refuses for the question count: the runner splits', () => {
        expect(CheckDecisionLimits('Clef', { MaxQuestionsPerCall: 2 }, 'state', likelihood(50))).toBeUndefined();
    });

    it('refuses too many Choice options, allowing failover', () => {
        expect(CheckDecisionLimits('Jev', { MaxChoiceOptions: 3 }, 'state', choice(4))).toEqual({
            ErrorType: 'InvalidRequest',
            Message: "Choice 'pick' has 4 options, over the limit of 3 for 'Jev'",
        });
    });

    it('refuses too many Score levels', () => {
        expect(CheckDecisionLimits('Jev', { MaxScoreLevels: 10 }, 'state', score(11))?.Message).toBe("Score 'rate' has 11 levels, over the limit of 10 for 'Jev'");
    });

    it('refuses a request estimated over MaxStateTokens as ContextLengthExceeded', () => {
        const error = CheckDecisionLimits('Kev-4B', { MaxStateTokens: 100 }, 'x'.repeat(1000), likelihood(1));
        expect(error?.ErrorType).toBe('ContextLengthExceeded');
        expect(error?.Message).toMatch(/about \d+ tokens per call, over the limit of 100 for 'Kev-4B'/);
    });

    it('measures the state limit per chunk, so a split request can fit', () => {
        const questions = likelihood(40);
        const whole = EstimateDecisionCallTokens('s', questions);
        const limits = { MaxQuestionsPerCall: 4, MaxStateTokens: whole - 1 };
        expect(CheckDecisionLimits('Clef', limits, 's', questions)).toBeUndefined();
    });
});

describe('MergeChunkedDecisionResults', () => {
    const chunk = (answers: DecisionResult['Answers'], usage?: ModelUsage, resolved?: string): DecisionResult => {
        const result = new DecisionResult(true, new Date(1000), new Date(2000));
        result.Answers = answers;
        result.Usage = usage;
        result.ResolvedModel = resolved;
        return result;
    };

    it('merges answers, sums usage and keeps the first resolved model', () => {
        const merged = MergeChunkedDecisionResults([
            chunk({ a: { Kind: 'Likelihood', Probability: 0.2 } }, new ModelUsage(10, 0, 0.001, 'USD'), 'jev-1.13'),
            chunk({ b: { Kind: 'Likelihood', Probability: 0.9 } }, new ModelUsage(15, 0, 0.002, 'USD'), 'jev-1.13'),
        ]);
        expect(merged.success).toBe(true);
        expect(merged.Answers).toEqual({ a: { Kind: 'Likelihood', Probability: 0.2 }, b: { Kind: 'Likelihood', Probability: 0.9 } });
        expect(merged.Usage?.promptTokens).toBe(25);
        expect(merged.Usage?.cost).toBeCloseTo(0.003, 10);
        expect(merged.Usage?.costCurrency).toBe('USD');
        expect(merged.ResolvedModel).toBe('jev-1.13');
    });

    it('leaves the cost unset when any chunk did not report one, rather than undercount it', () => {
        const merged = MergeChunkedDecisionResults([
            chunk({ a: { Kind: 'Likelihood', Probability: 0.2 } }, new ModelUsage(10, 0, 0.001)),
            chunk({ b: { Kind: 'Likelihood', Probability: 0.9 } }, new ModelUsage(15, 0)),
        ]);
        expect(merged.Usage?.promptTokens).toBe(25);
        expect(merged.Usage?.cost).toBeUndefined();
    });

    it('has no usage when no chunk reported any', () => {
        expect(MergeChunkedDecisionResults([chunk({}), chunk({})]).Usage).toBeUndefined();
    });
});

describe('DescribeDecisionMediaForRun', () => {
    it('is empty without media, so the run row keeps its shape', () => {
        expect(DescribeDecisionMediaForRun(undefined)).toEqual({});
        expect(DescribeDecisionMediaForRun([])).toEqual({});
    });

    it('records type, MIME type and URI or data size, never the data', () => {
        const described = DescribeDecisionMediaForRun([
            { Type: 'image', MimeType: 'image/png', Data: 'iVBORw0KGgo=' },
            { Type: 'document', MimeType: 'application/pdf', URI: 'gs://bucket/claim.pdf' },
        ]);
        expect(described).toEqual({
            Media: [
                { Type: 'image', MimeType: 'image/png', DataBase64Length: 12 },
                { Type: 'document', MimeType: 'application/pdf', URI: 'gs://bucket/claim.pdf' },
            ],
        });
        expect(JSON.stringify(described)).not.toContain('iVBORw0KGgo=');
    });
});
