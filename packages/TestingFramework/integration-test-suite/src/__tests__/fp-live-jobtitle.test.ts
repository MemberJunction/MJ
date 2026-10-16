/**
 * The job-title consistency measurement's comparison logic, without a model: which part of an answer is compared, and
 * when a title counts as answered identically.
 */
import { describe, it, expect } from 'vitest';
import { NormalizeUUID } from '@memberjunction/global';
import { JobTitleConsistency, type JobTitleAnswer } from '../checks/fp-live-jobtitle.checks';
import { ALL_GOLDEN_TITLES } from '../checks/fp-gates/golden-titles';

const SALES = '0B3C55B4-6F0B-4C4F-9E5A-2D1D4E5C6A01';
const OPS = '7A1E2C3D-4B5F-4A6B-8C7D-9E0F1A2B3C4D';
const SAME: JobTitleAnswer = { Seniority: 'Manager', PrimaryFunction: SALES, Full: '[]' };

describe('JobTitleConsistency', () => {
    it('takes the function with Sequence 1 as the primary, wherever it sits in the list', () => {
        const a = JobTitleConsistency.AnswerOf({ Status: 'Succeeded', ResultPayload: {
            SeniorityLevel: 'Director',
            Functions: [{ JobFunctionID: OPS, Sequence: 2 }, { JobFunctionID: SALES, Sequence: 1 }],
        } }, 'VP Sales');
        expect(a.PrimaryFunction).toBe(NormalizeUUID(SALES));
    });

    it('answers an abstention: a withheld seniority and an empty function list are answers', () => {
        const a = JobTitleConsistency.AnswerOf({ Status: 'Succeeded', ResultPayload: { SeniorityLevel: null, Functions: [] }, BelowConfidenceOutputs: ['SeniorityLevel'] }, 'asdf');
        expect(a).toEqual({ Seniority: JobTitleConsistency.WITHHELD, PrimaryFunction: JobTitleConsistency.NO_FUNCTION, Full: '[]' });
    });

    it('does not count a title that differs in one run, or that has no answer in any', () => {
        const runs = Array.from({ length: JobTitleConsistency.RUNS }, () => ALL_GOLDEN_TITLES.map(() => ({ ...SAME })));
        runs[JobTitleConsistency.RUNS - 1][0] = { ...SAME, Seniority: 'Director' };
        runs.forEach((run) => { run[1] = { ...SAME, Seniority: null }; });
        expect(JobTitleConsistency.Identical(runs, (a) => a.Seniority)).toBe(ALL_GOLDEN_TITLES.length - 2);
    });
});
