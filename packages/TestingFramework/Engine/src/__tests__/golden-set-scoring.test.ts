import { describe, it, expect } from 'vitest';
import { GoldenSetScorer, type GoldenCase, type GoldenAnswer } from '../drivers/golden-set-scoring';

describe('GoldenSetScorer.WilsonInterval', () => {
    it('reproduces the assessment band 41/52 = 0.7885 [0.6597, 0.8776]', () => {
        const w = GoldenSetScorer.WilsonInterval(41, 52);
        expect(w.Lower).toBeCloseTo(0.6597, 4);
        expect(w.Upper).toBeCloseTo(0.8776, 4);
    });
    it('is {0, 0} when there are no trials', () => {
        expect(GoldenSetScorer.WilsonInterval(0, 0)).toEqual({ Lower: 0, Upper: 0 });
    });
});

describe('GoldenSetScorer.Score', () => {
    const cases: GoldenCase[] = [
        { ID: 'g1', Input: { CurrentJobTitle: 'Owner' }, Expected: { SeniorityLevel: ['C-Level'], JobFunctions: ['Executive'] }, LabelSource: 'model-consensus' },
        { ID: 'g2', Input: { CurrentJobTitle: 'Cheesemonger' }, Expected: { SeniorityLevel: ['Individual Contributor'], JobFunctions: ['Sales', 'Operations'] }, LabelSource: 'model-consensus' },
        { ID: 'g3', Input: { CurrentJobTitle: 'Principal' }, Expected: { SeniorityLevel: ['Director', 'C-Level'], JobFunctions: ['Executive'] }, LabelSource: 'model-adjudicated' },
    ];
    const answers: GoldenAnswer[] = [
        { CaseID: 'g1', Values: { SeniorityLevel: 'C-Level', JobFunctions: 'Executive' } },
        { CaseID: 'g2', Values: { SeniorityLevel: 'individual contributor', JobFunctions: 'Operations' } },
        { CaseID: 'g3', Values: { SeniorityLevel: 'Individual Contributor', JobFunctions: 'Engineering' } },
    ];
    it('scores accuracy per output, accepting alternates and ignoring case; the result is the lowest output', () => {
        const s = GoldenSetScorer.Score(cases, answers, 'accuracy');
        expect(s.PerOutput.SeniorityLevel).toMatchObject({ Correct: 2, N: 3 });
        expect(s.PerOutput.JobFunctions).toMatchObject({ Correct: 2, N: 3 });
        expect(s.Value).toBeCloseTo(2 / 3, 6);
        expect(s.LabelSources).toEqual({ 'model-consensus': 2, 'model-adjudicated': 1 });
    });
    it('counts a failed record as wrong', () => {
        const s = GoldenSetScorer.Score(cases, [answers[0], { CaseID: 'g2', Values: null }, answers[2]], 'accuracy');
        expect(s.PerOutput.SeniorityLevel.Correct).toBe(1);
    });
    it('computes macro-F1 over the primary labels', () => {
        const s = GoldenSetScorer.Score(cases, answers, 'macro-f1');
        // SeniorityLevel: classes C-Level (F1 1), Individual Contributor (2·1/(2+1+0)=0.667), Director (0) → 0.556;
        // JobFunctions: Executive (2·1/(2+0+1)=0.667), Sales (0) → 0.333; the result is the lowest output.
        expect(s.Value).toBeCloseTo(1 / 3, 3);
        expect(s.Lower).toBeNull();
        expect(s.Upper).toBeNull();
        expect(s.PerOutput.SeniorityLevel).toMatchObject({ Correct: 2, N: 3, Lower: null, Upper: null });
        expect(s.PerOutput.SeniorityLevel.Value).toBeCloseTo(5 / 9, 6);
    });
    it('scores each output only over the cases that label it', () => {
        const partial: GoldenCase[] = [...cases, { ID: 'g4', Input: { CurrentJobTitle: 'Clerk' }, Expected: { JobFunctions: ['Operations'] }, LabelSource: 'human' }];
        const s = GoldenSetScorer.Score(partial, [...answers, { CaseID: 'g4', Values: { SeniorityLevel: 'Manager', JobFunctions: 'Operations' } }], 'accuracy');
        expect(s.PerOutput.SeniorityLevel).toMatchObject({ Correct: 2, N: 3 });
        expect(s.PerOutput.JobFunctions).toMatchObject({ Correct: 3, N: 4 });
        expect(s.N).toBe(4);
        expect(s.LabelSources).toEqual({ 'model-consensus': 2, 'model-adjudicated': 1, human: 1 });
    });
});
