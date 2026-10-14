/**
 * The job-title consistency measurement's comparison logic, without a model: which part of an answer is compared, and
 * when a title counts as answered identically. The live bundle's verdict is only as good as these two pieces.
 */
import { describe, it, expect } from 'vitest';
import { NormalizeUUID } from '@memberjunction/global';
import type { RecordResult } from '@memberjunction/record-set-processor-base';
import { JobTitleConsistency, type JobTitleAnswer } from '../checks/fp-live-jobtitle.checks';
import { GOLDEN_TITLES } from '../checks/fp-gates/golden-titles';

const SALES = '0B3C55B4-6F0B-4C4F-9E5A-2D1D4E5C6A01';
const OPS = '7A1E2C3D-4B5F-4A6B-8C7D-9E0F1A2B3C4D';

/** A succeeded result whose payload is `payload`. */
const ok = (payload: Record<string, unknown>): RecordResult => ({ Status: 'Succeeded', ResultPayload: payload });

/** Three runs in which every title got `answer`. */
const unanimous = (answer: JobTitleAnswer): JobTitleAnswer[][] =>
    Array.from({ length: JobTitleConsistency.RUNS }, () => GOLDEN_TITLES.map(() => ({ ...answer })));

const SAME: JobTitleAnswer = { Seniority: 'Manager', PrimaryFunction: SALES, Full: '[]' };

describe('JobTitleConsistency.AnswerOf', () => {
    it('takes the function with Sequence 1 as the primary, wherever it sits in the list', () => {
        const a = JobTitleConsistency.AnswerOf(ok({
            SeniorityLevel: 'Director',
            Functions: [{ JobFunctionID: OPS, Sequence: 2, Confidence: 0.4 }, { JobFunctionID: SALES, Sequence: 1, Confidence: 0.9 }],
        }), 'VP Sales');
        expect(a.Seniority).toBe('Director');
        expect(a.PrimaryFunction).toBe(NormalizeUUID(SALES));
    });

    it('falls back to the first function when none has Sequence 1', () => {
        const a = JobTitleConsistency.AnswerOf(ok({ SeniorityLevel: 'Manager', Functions: [{ JobFunctionID: OPS }, { JobFunctionID: SALES }] }), 't');
        expect(a.PrimaryFunction).toBe(NormalizeUUID(OPS));
    });

    it('compares function IDs case-insensitively (the same ID in another case is the same answer)', () => {
        const upper = JobTitleConsistency.AnswerOf(ok({ Functions: [{ JobFunctionID: SALES, Sequence: 1 }] }), 't');
        const lower = JobTitleConsistency.AnswerOf(ok({ Functions: [{ JobFunctionID: SALES.toLowerCase(), Sequence: 1 }] }), 't');
        expect(upper.PrimaryFunction).toBe(lower.PrimaryFunction);
    });

    it('answers null parts for a payload without them', () => {
        expect(JobTitleConsistency.AnswerOf(ok({}), 't')).toEqual({ Seniority: null, PrimaryFunction: null, Full: '[]' });
    });

    it('throws, naming the title and the message, for a failed record or a missing result', () => {
        expect(() => JobTitleConsistency.AnswerOf({ Status: 'Failed', ErrorMessage: 'quota' }, 'Owner')).toThrow(/'Owner'.*Failed.*quota/);
        expect(() => JobTitleConsistency.AnswerOf(undefined, 'Founder')).toThrow(/'Founder'.*no result/);
    });
});

describe('JobTitleConsistency.Identical', () => {
    it('counts every title when all runs agree', () => {
        expect(JobTitleConsistency.Identical(unanimous(SAME), (a) => a.Seniority)).toBe(GOLDEN_TITLES.length);
    });

    it('does not count a title whose answer is null in every run (no answer is not a consistent answer)', () => {
        expect(JobTitleConsistency.Identical(unanimous({ ...SAME, Seniority: null }), (a) => a.Seniority)).toBe(0);
    });

    it('does not count a title that differs only in the last run', () => {
        const runs = unanimous(SAME);
        runs[JobTitleConsistency.RUNS - 1][0] = { ...SAME, Seniority: 'Director' };
        expect(JobTitleConsistency.Identical(runs, (a) => a.Seniority)).toBe(GOLDEN_TITLES.length - 1);
    });
});
