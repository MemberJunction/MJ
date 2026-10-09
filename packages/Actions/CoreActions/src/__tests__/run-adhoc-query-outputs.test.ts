/**
 * Run Ad-hoc Query publishes its result as declared output parameters (R36).
 *
 * A Flow step's ActionOutputMapping copies only Output params into the payload. This action used to
 * return its rows only in the Message and in extra fields on the returned object — which the engine
 * drops — so a mapping like {"Results": "rows"} received `{}`. These tests read the outputs the way
 * a Flow does (see `flowVisibleOutputs`), and pin that the Message and returned object Loop agents
 * and other callers rely on are unchanged.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ActionParam, ActionResultSimple } from '@memberjunction/actions-base';

type Row = Record<string, unknown>;
type Recordset = Row[] & { columns?: Record<string, { type?: { name: string }; nullable?: boolean }> };

const h = vi.hoisted(() => ({
    queryIsSafe: true,
    execute: (async (): Promise<unknown> => []) as () => Promise<unknown>,
    prompt: { success: true, result: { analysis: 'Totals rose.' } } as { success: boolean; result?: { analysis: string }; errorMessage?: string },
}));

vi.mock('@memberjunction/global', () => ({
    RegisterClass: () => (target: unknown) => target,
    MJGlobal: { Instance: {} },
    SQLExpressionValidator: {
        Instance: { validateFullQuery: () => (h.queryIsSafe ? { valid: true } : { valid: false, error: 'EXEC is not allowed' }) },
    },
}));
vi.mock('@memberjunction/actions', () => ({ BaseAction: class BaseAction {} }));
vi.mock('@memberjunction/actions-base', () => ({
    RunActionParams: class RunActionParams { public Params: ActionParam[] = []; },
}));
vi.mock('@memberjunction/core', () => ({
    LogError: vi.fn(),
    BaseEntity: { Provider: { PlatformKey: 'sqlserver', ExecuteSQL: () => h.execute() } },
}));
vi.mock('@memberjunction/generic-database-provider', () => ({
    QueryCompositionEngine: class QueryCompositionEngine { public HasCompositionTokens(): boolean { return false; } },
    QueryPagingEngine: { WrapWithMaxRows: (query: string) => query },
}));
vi.mock('@memberjunction/sqlserver-dataprovider', () => ({ SQLServerDataProvider: class SQLServerDataProvider {} }));
vi.mock('@memberjunction/ai-core-plus', () => ({ AIPromptParams: class AIPromptParams {} }));
vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: { Instance: { Config: vi.fn().mockResolvedValue(undefined), Prompts: [{ Name: 'Analyze Query Data', Category: 'MJ: System' }] } },
}));
vi.mock('@memberjunction/ai-prompts', () => ({
    AIPromptRunner: class AIPromptRunner { public async ExecutePrompt() { return h.prompt; } },
}));

import { RunActionParams } from '@memberjunction/actions-base';
import { RunAdhocQueryAction } from '../custom/data/run-adhoc-query.action';

/** Exposes the protected entry point without casting the action. */
class TestableRunAdhocQuery extends RunAdhocQueryAction {
    public ExecuteForTest(params: RunActionParams): Promise<ActionResultSimple> {
        return this.InternalRunAction(params);
    }
}

const LONG_NOTE = 'A note far longer than the five characters ColumnMaxLength allows';

function recordset(rows: Row[]): Recordset {
    const set: Recordset = [...rows];
    set.columns = {
        Name: { type: { name: 'NVarChar' }, nullable: false },
        Note: { type: { name: 'NVarChar' }, nullable: true },
    };
    return set;
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
    return new TestableRunAdhocQuery().ExecuteForTest(params);
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

const ROWS: Row[] = [
    { Name: 'Acme', Note: LONG_NOTE },
    { Name: 'Globex', Note: null },
];

describe('Run Ad-hoc Query output parameters', () => {
    beforeEach(() => {
        h.queryIsSafe = true;
        h.execute = async () => recordset(ROWS);
        h.prompt = { success: true, result: { analysis: 'Totals rose.' } };
    });

    it('publishes the rows, count and metadata as outputs a Flow can map', async () => {
        const params = makeParams({ Query: 'SELECT Name, Note FROM Customers WHERE Active = 1', ColumnMaxLength: 5 });

        const result = await run(params);
        const outputs = flowVisibleOutputs(result, params);

        expect(result.Success).toBe(true);
        expect(Object.keys(outputs).sort()).toEqual(['Columns', 'ExecutionTimeMs', 'Results', 'RowCount', 'ValidationWarnings', 'WasTruncated']);
        // Full values: ColumnMaxLength trims the Message copy, never the data a Flow passes on.
        expect(outputs.Results).toEqual(ROWS);
        expect(outputs.RowCount).toBe(2);
        expect(outputs.WasTruncated).toBe(false);
        expect(outputs.ValidationWarnings).toEqual([]);
        expect(typeof outputs.ExecutionTimeMs).toBe('number');
        expect(outputs.Columns).toEqual([
            { ColumnName: 'Name', DataType: 'NVarChar', IsNullable: false },
            { ColumnName: 'Note', DataType: 'NVarChar', IsNullable: true },
        ]);
    });

    it('leaves the Message and the returned object as Loop agents and other callers see them', async () => {
        const params = makeParams({ Query: 'SELECT Name, Note FROM Customers WHERE Active = 1', ColumnMaxLength: 5 });

        const result = await run(params);

        expect(result.ResultCode).toBe('SUCCESS');
        expect(result.Message).toContain('# Query Results');
        expect(result.Message).toContain('"Acme"');
        expect(result.Message).not.toContain(LONG_NOTE);
        expect(result.Params).toBeUndefined();
        expect(resultField(result, 'RowCount')).toBe(2);
        expect(resultField(result, 'Results')).toBe('"Name","Note"\n"Acme","A not..."\n"Globe...",""');
    });

    it('reports WasTruncated when the row count reaches MaxRows', async () => {
        const params = makeParams({ Query: 'SELECT Name, Note FROM Customers WHERE Active = 1', MaxRows: 2 });

        const outputs = flowVisibleOutputs(await run(params), params);

        expect(outputs.WasTruncated).toBe(true);
    });

    it('publishes an empty row array, not nothing, when the query matches no rows', async () => {
        h.execute = async () => recordset([]);
        const params = makeParams({ Query: 'SELECT Name, Note FROM Customers WHERE 1 = 0' });

        const outputs = flowVisibleOutputs(await run(params), params);

        expect(outputs.Results).toEqual([]);
        expect(outputs.RowCount).toBe(0);
    });

    it("'analysis only' publishes the analysis and withholds the rows, as the returned object does", async () => {
        const params = makeParams({ Query: 'SELECT Name, Note FROM Customers WHERE Active = 1', AnalysisRequest: 'Summarize', ReturnType: 'analysis only' });

        const result = await run(params);
        const outputs = flowVisibleOutputs(result, params);

        expect(outputs.Analysis).toBe('Totals rose.');
        expect(outputs.RowCount).toBe(2);
        expect('Results' in outputs).toBe(false);
        expect(resultField(result, 'Results')).toBeUndefined();
    });

    it("'data and analysis' publishes both", async () => {
        const params = makeParams({ Query: 'SELECT Name, Note FROM Customers WHERE Active = 1', AnalysisRequest: 'Summarize' });

        const outputs = flowVisibleOutputs(await run(params), params);

        expect(outputs.Results).toEqual(ROWS);
        expect(outputs.Analysis).toBe('Totals rose.');
    });

    it("'data and analysis' with a failed analysis keeps the rows and publishes no Analysis", async () => {
        h.prompt = { success: false, errorMessage: 'No suitable model found' };
        const params = makeParams({ Query: 'SELECT Name, Note FROM Customers WHERE Active = 1', AnalysisRequest: 'Summarize' });

        const result = await run(params);
        const outputs = flowVisibleOutputs(result, params);

        expect(result.Success).toBe(true);
        expect(outputs.Results).toEqual(ROWS);
        expect('Analysis' in outputs).toBe(false);
    });

    describe('on failure, publishes no outputs', () => {
        it('a rejected query', async () => {
            h.queryIsSafe = false;
            const params = makeParams({ Query: 'EXEC sp_who' });

            const result = await run(params);

            expect(result.ResultCode).toBe('DANGEROUS_QUERY');
            expect(flowVisibleOutputs(result, params)).toEqual({});
        });

        it('a database error', async () => {
            h.execute = async () => { throw new Error("Invalid object name 'Customerz'"); };
            const params = makeParams({ Query: 'SELECT Name FROM Customerz' });

            const result = await run(params);

            expect(result.ResultCode).toBe('DATABASE_ERROR');
            expect(flowVisibleOutputs(result, params)).toEqual({});
        });

        it("an 'analysis only' run whose analysis failed, even though the query returned rows", async () => {
            h.prompt = { success: false, errorMessage: 'No suitable model found' };
            const params = makeParams({ Query: 'SELECT Name, Note FROM Customers WHERE Active = 1', AnalysisRequest: 'Summarize', ReturnType: 'analysis only' });

            const result = await run(params);

            expect(result.ResultCode).toBe('ANALYSIS_FAILED');
            expect(flowVisibleOutputs(result, params)).toEqual({});
        });
    });

    describe('outputs left on a reused params array', () => {
        const stale = (): ActionParam[] => [
            { Name: 'Results', Type: 'Output', Value: [{ Name: 'Stale' }] },
            { Name: 'RowCount', Type: 'Output', Value: 99 },
        ];

        it('are removed when the run fails, never handed back as this run\'s result', async () => {
            h.execute = async () => { throw new Error('connection reset'); };
            const params = makeParams({ Query: 'SELECT Name FROM Customers' }, stale());

            const result = await run(params);

            expect(result.Success).toBe(false);
            expect(flowVisibleOutputs(result, params)).toEqual({});
        });

        it('are replaced on success, not duplicated', async () => {
            const params = makeParams({ Query: 'SELECT Name, Note FROM Customers WHERE Active = 1' }, stale());

            await run(params);

            expect(params.Params.filter(p => p.Name === 'Results')).toHaveLength(1);
            expect(params.Params.filter(p => p.Name === 'RowCount')).toHaveLength(1);
            expect(flowVisibleOutputs({ Success: true, ResultCode: 'SUCCESS' }, params).RowCount).toBe(2);
        });

        it('leave the inputs alone', async () => {
            const params = makeParams({ Query: 'SELECT Name, Note FROM Customers WHERE Active = 1', MaxRows: 50 }, stale());

            await run(params);

            const inputs = params.Params.filter(p => p.Type === 'Input').map(p => [p.Name, p.Value]);
            expect(inputs).toEqual([['Query', 'SELECT Name, Note FROM Customers WHERE Active = 1'], ['MaxRows', 50]]);
        });
    });
});
