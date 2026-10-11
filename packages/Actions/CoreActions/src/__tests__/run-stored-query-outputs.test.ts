/**
 * Run Stored Query publishes its result as declared output parameters (R36).
 *
 * A Flow step's ActionOutputMapping copies only Output params into the payload. This action used to
 * return its rows only in the Message and in extra fields on the returned object — which the engine
 * drops — so a mapping like {"Results": "rows"} received `{}`. These tests read the outputs the way
 * a Flow does (see `flowVisibleOutputs`), and pin that the Message and returned object Loop agents
 * and other callers rely on are unchanged.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ActionParam, ActionResultSimple } from '@memberjunction/actions-base';
import type { RunQueryParams, RunQueryResult } from '@memberjunction/core';

const h = vi.hoisted(() => ({
    runQuery: vi.fn<(params: RunQueryParams, contextUser: unknown) => Promise<RunQueryResult>>(),
}));

vi.mock('@memberjunction/global', () => ({ RegisterClass: () => (target: unknown) => target }));
vi.mock('@memberjunction/actions', () => ({ BaseAction: class BaseAction {} }));
vi.mock('@memberjunction/actions-base', () => ({
    RunActionParams: class RunActionParams { public Params: ActionParam[] = []; },
}));
vi.mock('@memberjunction/core', () => ({
    RunQuery: class RunQuery { public RunQuery = h.runQuery; },
}));

import { RunActionParams } from '@memberjunction/actions-base';
import { RunStoredQueryAction } from '../custom/data/run-stored-query.action';

/** Exposes the protected entry point without casting the action. */
class TestableRunStoredQuery extends RunStoredQueryAction {
    public ExecuteForTest(params: RunActionParams): Promise<ActionResultSimple> {
        return this.InternalRunAction(params);
    }
}

type Row = Record<string, unknown>;

const LONG_NOTE = 'A note far longer than the five characters ColumnMaxLength allows';
const ROWS: Row[] = [
    { Name: 'Acme', Note: LONG_NOTE },
    { Name: 'Globex', Note: null },
];
const RENDERED_SQL = 'SELECT TOP 1000 Name, Note FROM vwCustomers';

function queryResult(rows: Row[], overrides: Partial<RunQueryResult> = {}): RunQueryResult {
    return {
        QueryID: 'q-1',
        QueryName: 'Active Customers',
        Success: true,
        Results: rows,
        RowCount: rows.length,
        TotalRowCount: rows.length,
        ExecutionTime: 12,
        ErrorMessage: '',
        RenderedSQL: RENDERED_SQL,
        ...overrides,
    };
}

function makeParams(inputs: Record<string, unknown>, seeded: ActionParam[] = []): RunActionParams {
    const params = new RunActionParams();
    params.Params = [
        ...Object.entries(inputs).map(([Name, Value]): ActionParam => ({ Name, Type: 'Input', Value })),
        ...seeded,
    ];
    return params;
}

function run(params: RunActionParams): Promise<ActionResultSimple> {
    return new TestableRunStoredQuery().ExecuteForTest(params);
}

/**
 * What a Flow step's ActionOutputMapping can read: ActionEngine returns `simpleResult.Params ||
 * params.Params`, and FlowAgentType.PostProcessActionStep keeps only Output/Both params by name.
 */
function flowVisibleOutputs(result: ActionResultSimple, params: RunActionParams): Record<string, unknown> {
    const visible: Record<string, unknown> = {};
    for (const param of result.Params || params.Params) {
        if (param.Type === 'Output' || param.Type === 'Both') {
            visible[param.Name] = param.Value;
        }
    }
    return visible;
}

/** Reads a field the action adds to its returned object beyond ActionResultSimple's own. */
function resultField(result: ActionResultSimple, key: string): unknown {
    const fields: Record<string, unknown> = { ...result };
    return fields[key];
}

describe('Run Stored Query output parameters', () => {
    beforeEach(() => {
        h.runQuery.mockReset();
        h.runQuery.mockResolvedValue(queryResult(ROWS));
    });

    it('publishes the rows, counts, timing and executed SQL as outputs a Flow can map', async () => {
        const params = makeParams({ QueryName: 'Active Customers', ColumnMaxLength: 5 });

        const result = await run(params);
        const outputs = flowVisibleOutputs(result, params);

        expect(result.Success).toBe(true);
        expect(outputs).toEqual({
            // Full values: ColumnMaxLength trims the Message copy, never the data a Flow passes on.
            Results: ROWS,
            RowCount: 2,
            TotalRowCount: 2,
            WasTruncated: false,
            ExecutionTimeMs: 12,
            QuerySQL: RENDERED_SQL,
        });
    });

    it('leaves the Message and the returned object as Loop agents and other callers see them', async () => {
        const params = makeParams({ QueryName: 'Active Customers', ColumnMaxLength: 5 });

        const result = await run(params);

        expect(result.ResultCode).toBe('SUCCESS');
        expect(result.Message).toContain('# Stored Query Results');
        expect(result.Message).not.toContain(LONG_NOTE);
        expect(result.Params).toBeUndefined();
        expect(resultField(result, 'RowCount')).toBe(2);
        expect(resultField(result, 'ExecutionTimeMs')).toBe(12);
        expect(resultField(result, 'Results')).toBe('"Name","Note"\n"Acme","A not..."\n"Globe...",""');
    });

    it('reports the real total and WasTruncated when MaxRows cut the result off', async () => {
        h.runQuery.mockResolvedValue(queryResult(ROWS, { TotalRowCount: 5000 }));
        const params = makeParams({ QueryName: 'Active Customers', MaxRows: 2 });

        const outputs = flowVisibleOutputs(await run(params), params);

        expect(outputs.RowCount).toBe(2);
        expect(outputs.TotalRowCount).toBe(5000);
        expect(outputs.WasTruncated).toBe(true);
    });

    it('does not call an exact-MaxRows result truncated when nothing was left out', async () => {
        const params = makeParams({ QueryName: 'Active Customers', MaxRows: 2 });

        const outputs = flowVisibleOutputs(await run(params), params);

        expect(outputs.WasTruncated).toBe(false);
    });

    it('falls back to the row count when the reported total is below the rows returned', async () => {
        h.runQuery.mockResolvedValue(queryResult(ROWS, { TotalRowCount: 0 }));
        const params = makeParams({ QueryName: 'Active Customers' });

        const outputs = flowVisibleOutputs(await run(params), params);

        expect(outputs.TotalRowCount).toBe(2);
        expect(outputs.WasTruncated).toBe(false);
    });

    it('publishes an empty row array, not nothing, when the query matches no rows', async () => {
        h.runQuery.mockResolvedValue(queryResult([]));
        const params = makeParams({ QueryName: 'Active Customers' });

        const outputs = flowVisibleOutputs(await run(params), params);

        expect(outputs.Results).toEqual([]);
        expect(outputs.RowCount).toBe(0);
    });

    it('omits QuerySQL when the pipeline did not report the SQL it ran', async () => {
        h.runQuery.mockResolvedValue(queryResult(ROWS, { RenderedSQL: undefined }));
        const params = makeParams({ QueryName: 'Active Customers' });

        const outputs = flowVisibleOutputs(await run(params), params);

        expect('QuerySQL' in outputs).toBe(false);
        expect(outputs.Results).toEqual(ROWS);
    });

    describe('on failure, publishes no outputs', () => {
        it('a missing query identifier', async () => {
            const params = makeParams({});

            const result = await run(params);

            expect(result.ResultCode).toBe('MISSING_IDENTIFIER');
            expect(flowVisibleOutputs(result, params)).toEqual({});
        });

        it('a query that does not exist', async () => {
            h.runQuery.mockResolvedValue(queryResult([], { Success: false, ErrorMessage: 'Query not found' }));
            const params = makeParams({ QueryName: 'Nope' });

            const result = await run(params);

            expect(result.ResultCode).toBe('QUERY_NOT_FOUND');
            expect(flowVisibleOutputs(result, params)).toEqual({});
        });

        it('a pipeline that throws', async () => {
            h.runQuery.mockRejectedValue(new Error('connection reset'));
            const params = makeParams({ QueryName: 'Active Customers' });

            const result = await run(params);

            expect(result.ResultCode).toBe('QUERY_EXECUTION_FAILED');
            expect(flowVisibleOutputs(result, params)).toEqual({});
        });
    });

    describe('outputs left on a reused params array', () => {
        const stale = (): ActionParam[] => [
            { Name: 'Results', Type: 'Output', Value: [{ Name: 'Stale' }] },
            { Name: 'TotalRowCount', Type: 'Output', Value: 99 },
        ];

        it("are removed when the run fails, never handed back as this run's result", async () => {
            h.runQuery.mockResolvedValue(queryResult([], { Success: false, ErrorMessage: 'Timeout expired' }));
            const params = makeParams({ QueryName: 'Active Customers' }, stale());

            const result = await run(params);

            expect(result.ResultCode).toBe('QUERY_EXECUTION_FAILED');
            expect(flowVisibleOutputs(result, params)).toEqual({});
        });

        it('are replaced on success, not duplicated', async () => {
            const params = makeParams({ QueryName: 'Active Customers' }, stale());

            await run(params);

            expect(params.Params.filter(p => p.Name === 'Results')).toHaveLength(1);
            expect(params.Params.filter(p => p.Name === 'TotalRowCount')).toHaveLength(1);
            expect(flowVisibleOutputs({ Success: true, ResultCode: 'SUCCESS' }, params).TotalRowCount).toBe(2);
        });
    });
});
