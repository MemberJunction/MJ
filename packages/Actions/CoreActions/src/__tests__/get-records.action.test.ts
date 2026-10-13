/**
 * Tests for GetRecordsAction — the generic "Get Records" query primitive
 * exposed to AI agents. Unlike the other CRUD actions it is a thin wrapper
 * over RunView, so these tests mock the RunView class (no live DB) and assert
 * required-parameter validation, filter/orderby/maxrows threading into the
 * RunView config, contextUser threading, output params, message composition,
 * and query-failure surfacing.
 *
 * Behavioral notes locked in below (real behavior wins over the doc comment):
 *  - missing EntityName returns MISSING_ENTITY_NAME (not VALIDATION_ERROR);
 *  - inputs are only read when Type === 'Input' (a 'Both'-typed param is ignored);
 *  - MaxRows = 0 slips through the 1..10000 validation (falsy guard bug).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';

vi.mock('@memberjunction/global', () => ({
    RegisterClass: () => (target: unknown) => target,
}));

vi.mock('@memberjunction/actions-base', () => ({}));

vi.mock('@memberjunction/actions', () => ({
    BaseAction: class BaseAction {},
}));

interface FakeRunViewResult {
    Success: boolean;
    Results?: Array<Record<string, unknown>>;
    TotalRowCount?: number;
    ErrorMessage?: string;
}

const { runViewSpy } = vi.hoisted(() => ({
    runViewSpy: vi.fn<
        (
            config: Record<string, unknown>,
            contextUser: unknown
        ) => Promise<{
            Success: boolean;
            Results?: Array<Record<string, unknown>>;
            TotalRowCount?: number;
            ErrorMessage?: string;
        }>
    >(),
}));

vi.mock('@memberjunction/core', () => ({
    RunView: class RunViewMock {
        public RunView = runViewSpy;
    },
}));

import { GetRecordsAction } from '../custom/crud/get-records.action';
import { findOutput, makeParams } from './crud-action-test-harness';
import type { TestInput } from './crud-action-test-harness';

// InternalRunAction is protected on this action; expose it through a typed
// structural view rather than any-casting (same pattern as the other suites).
const runAction = (params: RunActionParams): Promise<ActionResultSimple> => {
    const action = new GetRecordsAction();
    return (
        action as unknown as { InternalRunAction(p: RunActionParams): Promise<ActionResultSimple> }
    ).InternalRunAction(params);
};

const okResult = (rows: Array<Record<string, unknown>>, totalRowCount?: number): FakeRunViewResult => ({
    Success: true,
    Results: rows,
    TotalRowCount: totalRowCount,
});

describe('GetRecordsAction', () => {
    beforeEach(() => {
        runViewSpy.mockReset();
    });

    describe('parameter validation', () => {
        it('fails with MISSING_ENTITY_NAME when EntityName is absent, without querying', async () => {
            const params = makeParams([{ Name: 'Filter', Value: "Status = 'Active'" }]);

            const r = await runAction(params);

            expect(r.Success).toBe(false);
            expect(r.ResultCode).toBe('MISSING_ENTITY_NAME');
            expect(r.Message).toBe('EntityName parameter is required');
            expect(runViewSpy).not.toHaveBeenCalled();
        });

        // ⚠️ INCONSISTENCY (documented, not fixed here): this action only reads
        // params whose Type === 'Input'. ActionParam.Type also allows 'Both', and
        // the mutation CRUD actions accept any Type — so an EntityName passed as
        // 'Both' works for Create/Update/Delete/Get Record but is invisible here.
        it("ignores an EntityName supplied with Type 'Both' (current Input-only behavior)", async () => {
            const inputs: TestInput[] = [{ Name: 'EntityName', Value: 'Widgets', Type: 'Both' }];
            const params = makeParams(inputs);

            const r = await runAction(params);

            expect(r.Success).toBe(false);
            expect(r.ResultCode).toBe('MISSING_ENTITY_NAME');
            expect(runViewSpy).not.toHaveBeenCalled();
        });

        it('rejects MaxRows above 10000 with INVALID_MAX_ROWS, without querying', async () => {
            const params = makeParams([
                { Name: 'EntityName', Value: 'Widgets' },
                { Name: 'MaxRows', Value: 10001 },
            ]);

            const r = await runAction(params);

            expect(r.Success).toBe(false);
            expect(r.ResultCode).toBe('INVALID_MAX_ROWS');
            expect(r.Message).toBe('MaxRows must be between 1 and 10000');
            expect(runViewSpy).not.toHaveBeenCalled();
        });

        it('rejects a negative MaxRows with INVALID_MAX_ROWS', async () => {
            const params = makeParams([
                { Name: 'EntityName', Value: 'Widgets' },
                { Name: 'MaxRows', Value: -5 },
            ]);

            const r = await runAction(params);

            expect(r.Success).toBe(false);
            expect(r.ResultCode).toBe('INVALID_MAX_ROWS');
        });

        // ⚠️ PRODUCT BUG (documented, not fixed here): the guard is
        // `if (maxRows && (maxRows < 1 || maxRows > 10000))`, so MaxRows = 0 is
        // falsy, skips validation entirely, and is sent to RunView as MaxRows: 0
        // even though the contract says "between 1 and 10000".
        it('lets MaxRows = 0 bypass validation and reach RunView (current behavior)', async () => {
            runViewSpy.mockResolvedValue(okResult([]));
            const params = makeParams([
                { Name: 'EntityName', Value: 'Widgets' },
                { Name: 'MaxRows', Value: 0 },
            ]);

            const r = await runAction(params);

            expect(r.Success).toBe(true);
            expect(runViewSpy).toHaveBeenCalledTimes(1);
            const [config] = runViewSpy.mock.calls[0];
            expect(config.MaxRows).toBe(0);
        });

        it('falls back to the default MaxRows of 100 when the value is not numeric', async () => {
            runViewSpy.mockResolvedValue(okResult([]));
            const params = makeParams([
                { Name: 'EntityName', Value: 'Widgets' },
                { Name: 'MaxRows', Value: 'lots' },
            ]);

            const r = await runAction(params);

            expect(r.Success).toBe(true);
            const [config] = runViewSpy.mock.calls[0];
            expect(config.MaxRows).toBe(100);
        });
    });

    describe('query construction', () => {
        it('queries with defaults (MaxRows 100, simple results, no Filter/OrderBy) and threads contextUser', async () => {
            runViewSpy.mockResolvedValue(okResult([{ ID: '1' }, { ID: '2' }], 2));
            const params = makeParams([{ Name: 'EntityName', Value: 'Widgets' }]);

            const r = await runAction(params);

            expect(r.Success).toBe(true);
            expect(r.ResultCode).toBe('SUCCESS');
            expect(runViewSpy).toHaveBeenCalledTimes(1);

            const [config, contextUser] = runViewSpy.mock.calls[0];
            expect(config).toEqual({
                EntityName: 'Widgets',
                MaxRows: 100,
                ResultType: 'simple',
            });
            expect(config).not.toHaveProperty('Filter');
            expect(config).not.toHaveProperty('OrderBy');
            expect(contextUser).toBe(params.ContextUser);
        });

        // The action's `Filter` INPUT parameter must reach RunView as `ExtraFilter` — the only filter
        // field RunViewParams has. It was previously assigned to a `Filter` property through an
        // `any`-typed config, which RunView ignored: every caller asking for a filtered set silently
        // received the whole entity, capped only by MaxRows. Asserting the wire name is the point of
        // this test, so it is spelled out rather than folded into the object below.
        it('threads Filter (as ExtraFilter), OrderBy, and MaxRows into the RunView config and the result message', async () => {
            runViewSpy.mockResolvedValue(okResult([{ ID: '1' }], 1));
            const params = makeParams([
                { Name: 'EntityName', Value: 'Events' },
                { Name: 'Filter', Value: "Status = 'Active'" },
                { Name: 'OrderBy', Value: 'StartDate ASC' },
                { Name: 'MaxRows', Value: 25 },
            ]);

            const r = await runAction(params);

            expect(r.Success).toBe(true);
            const [config] = runViewSpy.mock.calls[0];
            expect(config).toEqual({
                EntityName: 'Events',
                MaxRows: 25,
                ResultType: 'simple',
                ExtraFilter: "Status = 'Active'",
                OrderBy: 'StartDate ASC',
            });
            // Guard the regression directly: a `Filter` key here means the predicate is being handed
            // to a property RunView does not read, and the filter is silently gone again.
            expect(config).not.toHaveProperty('Filter');
            expect(r.Message).toContain("with filter: Status = 'Active'");
            expect(r.Message).toContain('ordered by: StartDate ASC');
        });
    });

    describe('outputs and messaging', () => {
        it('emits Records, TotalCount, EntityName, Filter, and OrderBy output params', async () => {
            const rows = [{ ID: '1' }, { ID: '2' }];
            runViewSpy.mockResolvedValue(okResult(rows, 2));
            const params = makeParams([
                { Name: 'EntityName', Value: 'Widgets' },
                { Name: 'Filter', Value: "Status = 'Active'" },
                { Name: 'OrderBy', Value: 'Name ASC' },
            ]);

            const r = await runAction(params);

            expect(r.Success).toBe(true);
            expect(findOutput(r.Params, 'Records')?.Value).toEqual(rows);
            expect(findOutput(r.Params, 'TotalCount')?.Value).toBe(2);
            expect(findOutput(r.Params, 'EntityName')?.Value).toBe('Widgets');
            expect(findOutput(r.Params, 'Filter')?.Value).toBe("Status = 'Active'");
            expect(findOutput(r.Params, 'OrderBy')?.Value).toBe('Name ASC');
        });

        it('reports partial result sets in the message when IncludeCount is on (default)', async () => {
            runViewSpy.mockResolvedValue(okResult([{ ID: '1' }, { ID: '2' }], 10));
            const params = makeParams([{ Name: 'EntityName', Value: 'Widgets' }]);

            const r = await runAction(params);

            expect(r.Message).toContain('Successfully retrieved 2 records');
            expect(r.Message).toContain('(showing 2 of 10 total)');
            expect(findOutput(r.Params, 'TotalCount')?.Value).toBe(10);
        });

        it('omits the total clause when IncludeCount is false', async () => {
            runViewSpy.mockResolvedValue(okResult([{ ID: '1' }, { ID: '2' }], 10));
            const params = makeParams([
                { Name: 'EntityName', Value: 'Widgets' },
                { Name: 'IncludeCount', Value: false },
            ]);

            const r = await runAction(params);

            expect(r.Message).toContain('Successfully retrieved 2 records');
            expect(r.Message).not.toContain('total');
        });

        it('falls back to the returned row count when TotalRowCount is absent', async () => {
            runViewSpy.mockResolvedValue({ Success: true, Results: [{ ID: '1' }, { ID: '2' }, { ID: '3' }] });
            const params = makeParams([{ Name: 'EntityName', Value: 'Widgets' }]);

            const r = await runAction(params);

            expect(r.Success).toBe(true);
            expect(findOutput(r.Params, 'TotalCount')?.Value).toBe(3);
        });

        it('treats a missing Results array as an empty record set', async () => {
            runViewSpy.mockResolvedValue({ Success: true });
            const params = makeParams([{ Name: 'EntityName', Value: 'Widgets' }]);

            const r = await runAction(params);

            expect(r.Success).toBe(true);
            expect(findOutput(r.Params, 'Records')?.Value).toEqual([]);
            expect(findOutput(r.Params, 'TotalCount')?.Value).toBe(0);
            expect(r.Message).toContain('Successfully retrieved 0 records');
        });
    });

    describe('failure paths', () => {
        it('returns QUERY_FAILED and surfaces the RunView ErrorMessage when the query fails', async () => {
            runViewSpy.mockResolvedValue({ Success: false, ErrorMessage: 'Invalid column name Bogus' });
            const params = makeParams([
                { Name: 'EntityName', Value: 'Widgets' },
                { Name: 'Filter', Value: "Bogus = 'x'" },
            ]);

            const r = await runAction(params);

            expect(r.Success).toBe(false);
            expect(r.ResultCode).toBe('QUERY_FAILED');
            expect(r.Message).toBe('Failed to retrieve records: Invalid column name Bogus');
        });

        it('returns ERROR with the thrown message when RunView throws', async () => {
            runViewSpy.mockRejectedValue(new Error('connection torn down'));
            const params = makeParams([{ Name: 'EntityName', Value: 'Widgets' }]);

            const r = await runAction(params);

            expect(r.Success).toBe(false);
            expect(r.ResultCode).toBe('ERROR');
            expect(r.Message).toBe('Error retrieving records: connection torn down');
        });

        it('reports "Unknown error occurred" for a non-Error throw', async () => {
            runViewSpy.mockRejectedValue('string failure');
            const params = makeParams([{ Name: 'EntityName', Value: 'Widgets' }]);

            const r = await runAction(params);

            expect(r.Success).toBe(false);
            expect(r.ResultCode).toBe('ERROR');
            expect(r.Message).toBe('Error retrieving records: Unknown error occurred');
        });
    });
});
