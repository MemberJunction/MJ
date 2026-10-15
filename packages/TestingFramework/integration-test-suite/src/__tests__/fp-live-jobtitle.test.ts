/**
 * The job-title consistency measurement's comparison logic, without a model: which part of an answer is compared, and
 * when a title counts as answered identically. The live bundle's verdict is only as good as these two pieces.
 */
import { describe, it, expect, vi } from 'vitest';
import { InMemoryLocalStorageProvider, UserInfo, type RunViewParams, type RunViewResult } from '@memberjunction/core';
import type { MJAIPromptRunEntity } from '@memberjunction/core-entities';
import { NormalizeUUID } from '@memberjunction/global';
import type { RecordResult } from '@memberjunction/record-set-processor-base';
import { EntitiesOnlyProvider } from '@memberjunction/unit-testing';
import { InstrumentedLocalStorageProvider, type IntegrationCheckContext } from '@memberjunction/testing-integration';
import { JobTitleConsistency, type JobTitleAnswer } from '../checks/fp-live-jobtitle.checks';
import { ALL_GOLDEN_TITLES } from '../checks/fp-gates/golden-titles';

const SALES = '0B3C55B4-6F0B-4C4F-9E5A-2D1D4E5C6A01';
const OPS = '7A1E2C3D-4B5F-4A6B-8C7D-9E0F1A2B3C4D';

/** A succeeded result whose payload is `payload`. */
const ok = (payload: Record<string, unknown>): RecordResult => ({ Status: 'Succeeded', ResultPayload: payload });

/** Three runs in which every title got `answer`. */
const unanimous = (answer: JobTitleAnswer): JobTitleAnswer[][] =>
    Array.from({ length: JobTitleConsistency.RUNS }, () => ALL_GOLDEN_TITLES.map(() => ({ ...answer })));

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

    it('answers an abstention: a withheld seniority and an empty function list are answers', () => {
        const a = JobTitleConsistency.AnswerOf({ Status: 'Succeeded', ResultPayload: { SeniorityLevel: null, Functions: [] }, BelowConfidenceOutputs: ['SeniorityLevel'] }, 'asdf');
        expect(a).toEqual({ Seniority: JobTitleConsistency.WITHHELD, PrimaryFunction: JobTitleConsistency.NO_FUNCTION, Full: '[]' });
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
        expect(JobTitleConsistency.Identical(unanimous(SAME), (a) => a.Seniority)).toBe(ALL_GOLDEN_TITLES.length);
    });

    it('does not count a title whose answer is null in every run (no answer is not a consistent answer)', () => {
        expect(JobTitleConsistency.Identical(unanimous({ ...SAME, Seniority: null }), (a) => a.Seniority)).toBe(0);
    });

    it('does not count a title that differs only in the last run', () => {
        const runs = unanimous(SAME);
        runs[JobTitleConsistency.RUNS - 1][0] = { ...SAME, Seniority: 'Director' };
        expect(JobTitleConsistency.Identical(runs, (a) => a.Seniority)).toBe(ALL_GOLDEN_TITLES.length - 1);
    });
});

describe('JobTitleConsistency.RecordCost', () => {
    type CostRow = Pick<MJAIPromptRunEntity, 'ID' | 'TotalCost'>;
    /** A context whose AI Prompt Run read answers `rows` (or fails with `error`) and records the RunView it was asked for. */
    function context(seen: RunViewParams[], rows: CostRow[], error = ''): IntegrationCheckContext {
        const provider = new EntitiesOnlyProvider([]);
        vi.spyOn(provider, 'RunView').mockImplementation(async (params: RunViewParams): Promise<RunViewResult<CostRow>> => {
            seen.push(params);
            return { Success: !error, Results: rows, RowCount: rows.length, TotalRowCount: rows.length, ExecutionTime: 0, ErrorMessage: error };
        });
        return { User: new UserInfo(provider, { ID: 'U-1', Name: 'Tester' }), Provider: provider, Storage: new InstrumentedLocalStorageProvider(new InMemoryLocalStorageProvider()) };
    }
    const withRun = (id?: string): RecordResult => ({ Status: 'Succeeded', AIPromptRunID: id });

    it('adds the TotalCost of exactly the prompt runs the results name, by ID and once per distinct run', async () => {
        const seen: RunViewParams[] = [];
        const ctx = context(seen, [{ ID: 'run-a', TotalCost: 0.004 }, { ID: 'run-b', TotalCost: 0.001 }, { ID: 'run-c', TotalCost: null }]);
        ctx.CostUSD = 0.5; // earlier batches of the same check
        await JobTitleConsistency.RecordCost(ctx, new Map([['r1', withRun('run-a')], ['r2', withRun('RUN-A')], ['r3', withRun('run-b')], ['r4', withRun('run-c')], ['r5', withRun()]]));
        expect(seen).toHaveLength(1);
        expect(seen[0]).toMatchObject({ EntityName: 'MJ: AI Prompt Runs', Fields: ['ID', 'TotalCost'], ExtraFilter: "ID IN ('run-a','run-b','run-c')" });
        expect(ctx.CostUSD).toBeCloseTo(0.505, 10);
    });

    it('reads nothing and adds 0 when no result names a prompt run', async () => {
        const seen: RunViewParams[] = [];
        const ctx = context(seen, []);
        await JobTitleConsistency.RecordCost(ctx, new Map([['r1', withRun()]]));
        expect(seen).toEqual([]);
        expect(ctx.CostUSD || 0).toBe(0);
    });

    it('throws when the prompt runs cannot be read: an unknown cost is not reported as 0', async () => {
        const ctx = context([], [], 'db down');
        await expect(JobTitleConsistency.RecordCost(ctx, new Map([['r1', withRun('run-a')]]))).rejects.toThrow(/could not read.*AI Prompt Runs.*db down/);
        expect(ctx.CostUSD || 0).toBe(0);
    });
});
