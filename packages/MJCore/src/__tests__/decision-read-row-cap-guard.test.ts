import { describe, it, expect, vi } from 'vitest';
import {
    AssertRunViewNotTruncated,
    BuildDecisionReadParams,
    ExecuteDecisionRead,
    ExecuteDecisionReadOrThrow,
    RunViewDecisionReadTruncatedError,
    ValidateDecisionReadBatch,
    ValidateDecisionReadResult,
} from '../views/decisionReadGuard';
import { RunView } from '../views/runView';
import type { IRunViewProvider, RunViewResult } from '../generic/interfaces';
import type { RunViewParams } from '../views/runView';

interface SimpleTaskRow {
    ID: string;
    Name: string;
}

function makeRunViewResult<T>(overrides: Partial<RunViewResult<T>>): RunViewResult<T> {
    return {
        Success: true,
        Results: [],
        RowCount: 0,
        TotalRowCount: 0,
        ExecutionTime: 1,
        ErrorMessage: '',
        ...overrides,
    };
}

function makeMockRunView(
    handler: (params: RunViewParams) => Promise<RunViewResult<SimpleTaskRow>>,
): { rv: RunView; spy: ReturnType<typeof vi.fn<(params: RunViewParams) => Promise<RunViewResult<SimpleTaskRow>>>> } {
    const spy = vi.fn(handler);
    const provider: IRunViewProvider = {
        RunView: <T = SimpleTaskRow>(params: RunViewParams): Promise<RunViewResult<T>> =>
            spy(params) as Promise<RunViewResult<T>>,
        RunViews: async <T = SimpleTaskRow>(): Promise<RunViewResult<T>[]> => [],
    };
    return { rv: new RunView(provider), spy };
}

describe('MJ-10 Decision-Read Row-Cap Guard (decisionReadGuard)', () => {
    it('defaults ResultType to simple and uses single-query MaxRows + 1 sentinel probe with SkipTotalRowCount', () => {
        const built = BuildDecisionReadParams({
            EntityName: 'MJ: Tasks',
            ExtraFilter: "Status='Pending'",
            MaxRows: 50,
            Fields: ['ID', 'Name'],
        });

        expect(built.EffectiveMaxRows).toBe(50);
        expect(built.UsedSentinelProbe).toBe(true);
        expect(built.Params.ResultType).toBe('simple');
        expect(built.Params.MaxRows).toBe(51);
        expect(built.Params.SkipTotalRowCount).toBe(true);
    });

    it('succeeds when rows are strictly within cap or at exact boundary without sentinel overflow', async () => {
        const rows: SimpleTaskRow[] = [
            { ID: 't-1', Name: 'Step 1' },
            { ID: 't-2', Name: 'Step 2' },
            { ID: 't-3', Name: 'Step 3' },
        ];
        const { rv, spy } = makeMockRunView(async () =>
            makeRunViewResult<SimpleTaskRow>({
                Results: rows,
                RowCount: 3,
                TotalRowCount: undefined,
            }),
        );

        const returned = await ExecuteDecisionReadOrThrow<SimpleTaskRow>(
            rv,
            {
                EntityName: 'MJ: Tasks',
                ExtraFilter: "ParentID='graph-1'",
                Fields: ['ID', 'Name'],
                MaxRows: 3,
            },
            undefined,
            { OperationName: 'loadGraphNodes' },
        );

        expect(returned).toEqual(rows);
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy.mock.calls[0][0].MaxRows).toBe(4);
        expect(spy.mock.calls[0][0].ResultType).toBe('simple');
        expect(spy.mock.calls[0][0].SkipTotalRowCount).toBe(true);
    });

    it('throws RunViewDecisionReadTruncatedError when MaxRows + 1 sentinel probe overflows', async () => {
        const rows: SimpleTaskRow[] = [
            { ID: 't-1', Name: 'Step 1' },
            { ID: 't-2', Name: 'Step 2' },
            { ID: 't-3', Name: 'Step 3' },
        ];
        const { rv } = makeMockRunView(async () =>
            makeRunViewResult<SimpleTaskRow>({
                Results: rows,
                RowCount: 3,
                TotalRowCount: undefined,
            }),
        );

        let caught: RunViewDecisionReadTruncatedError | null = null;
        try {
            await ExecuteDecisionReadOrThrow<SimpleTaskRow>(
                rv,
                {
                    EntityName: 'MJ: Tasks',
                    ExtraFilter: "ParentID='graph-1'",
                    MaxRows: 2,
                },
                undefined,
                { OperationName: 'loadGraphNodes' },
            );
        } catch (err) {
            if (err instanceof RunViewDecisionReadTruncatedError) {
                caught = err;
            }
        }

        expect(caught).toBeInstanceOf(RunViewDecisionReadTruncatedError);
        expect(caught?.Reason).toBe('SentinelOverflow');
        expect(caught?.EntityName).toBe('MJ: Tasks');
        expect(caught?.OperationName).toBe('loadGraphNodes');
        expect(caught?.MaxRows).toBe(2);
        expect(caught?.ReturnedRowCount).toBe(3);
        expect(caught?.message).toContain('Decision-critical RunView truncation detected');
        expect(caught?.Detail.Message).toContain('Decision-critical RunView truncation detected');
    });

    it('detects truncation via TotalRowCount > Results.length even when MaxRows is omitted (UserViewMaxRows cap)', async () => {
        const { rv, spy } = makeMockRunView(async () =>
            makeRunViewResult<SimpleTaskRow>({
                Results: [{ ID: 't-1', Name: 'Step 1' }],
                RowCount: 1,
                TotalRowCount: 1001,
            }),
        );

        const outcome = await ExecuteDecisionRead<SimpleTaskRow>(
            rv,
            {
                EntityName: 'MJ: Tasks',
                ExtraFilter: "Status='Pending'",
            },
            undefined,
            { OperationName: 'findActiveGraphIDs' },
        );

        expect(spy.mock.calls[0][0].SkipTotalRowCount).toBeUndefined();
        expect(outcome.Success).toBe(false);
        if (!outcome.Success) {
            expect(outcome.Truncated).toBe(true);
            expect(outcome.TruncationDetail?.Reason).toBe('TotalRowCountExceedsReturned');
            expect(outcome.TruncationDetail?.TotalRowCount).toBe(1001);
            expect(outcome.TruncationDetail?.ReturnedRowCount).toBe(1);
            expect(outcome.Error).toBeInstanceOf(RunViewDecisionReadTruncatedError);
        }
    });

    it('rejects ambiguous exact MaxRows boundary when neither TotalRowCount nor sentinel probe is present', () => {
        const res = makeRunViewResult<SimpleTaskRow>({
            Results: [
                { ID: 't-1', Name: 'One' },
                { ID: 't-2', Name: 'Two' },
            ],
            RowCount: 2,
            TotalRowCount: undefined,
        });

        expect(() =>
            AssertRunViewNotTruncated(res, {
                EntityName: 'MJ: Actions',
                OperationName: 'resolveActions',
                MaxRows: 2,
                UsedSentinelProbe: false,
            }),
        ).toThrowError(RunViewDecisionReadTruncatedError);

        // Exact boundary WITH matching TotalRowCount proves no rows were dropped
        const exactConfirmed = ValidateDecisionReadResult(
            makeRunViewResult<SimpleTaskRow>({
                Results: res.Results,
                RowCount: 2,
                TotalRowCount: 2,
            }),
            {
                EntityName: 'MJ: Actions',
                OperationName: 'resolveActions',
                MaxRows: 2,
                UsedSentinelProbe: false,
            },
        );
        expect(exactConfirmed.Success).toBe(true);
    });

    it('validates RunViews batch results independently and preserves query failure errors', () => {
        const batchOutcomes = ValidateDecisionReadBatch<SimpleTaskRow>(
            [
                makeRunViewResult({ Results: [{ ID: '1', Name: 'OK' }], RowCount: 1, TotalRowCount: 1 }),
                makeRunViewResult({ Results: [{ ID: '2', Name: 'Trunc' }], RowCount: 1, TotalRowCount: 5 }),
                makeRunViewResult({ Success: false, ErrorMessage: 'SQL timeout', Results: [], RowCount: 0, TotalRowCount: 0 }),
            ],
            [
                { EntityName: 'MJ: Tasks', OperationName: 'batch-ok' },
                { EntityName: 'MJ: Task Dependencies', OperationName: 'batch-trunc' },
                { EntityName: 'MJ: AI Agent Runs', OperationName: 'batch-fail' },
            ],
        );

        expect(batchOutcomes[0].Success).toBe(true);
        expect(batchOutcomes[1].Success).toBe(false);
        if (!batchOutcomes[1].Success) {
            expect(batchOutcomes[1].Truncated).toBe(true);
            expect(batchOutcomes[1].Error).toBeInstanceOf(RunViewDecisionReadTruncatedError);
        }
        expect(batchOutcomes[2].Success).toBe(false);
        if (!batchOutcomes[2].Success) {
            expect(batchOutcomes[2].Truncated).toBe(false);
            expect(batchOutcomes[2].ErrorMessage).toBe('SQL timeout');
        }
    });
});
