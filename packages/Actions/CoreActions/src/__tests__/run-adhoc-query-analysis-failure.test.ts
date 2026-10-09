/**
 * Run Ad-hoc Query with a failed analysis. Under a 'RuntimeOnly' credential scope the analysis prompt
 * fails by design (the action is never handed the run's keys); it used to be logged and dropped, so an
 * 'analysis only' call returned SUCCESS with no analysis and no reason.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
    rows: [] as Array<Record<string, unknown>>,
    prompt: { success: true, result: { analysis: 'The totals rose.' } } as { success: boolean; result?: { analysis: string }; errorMessage?: string },
}));

type Param = { Name: string; Type: 'Input'; Value: unknown };
type ParamBag = { Params: Param[] };

vi.mock('@memberjunction/global', () => ({
    RegisterClass: () => (target: unknown) => target,
    SQLExpressionValidator: { Instance: { validateFullQuery: () => ({ valid: true }) } },
}));
vi.mock('@memberjunction/actions', () => ({
    BaseAction: class BaseAction {},
    // The read-only provider the action runs its SQL on, answering with the rows under test, and a
    // host SQL authorizer that accepts the query.
    ActionEngineServer: {
        Instance: {
            GetReadOnlyProvider: async () => ({
                RunQuery: async () => ({ Success: true, Results: h.rows, RowCount: h.rows.length, TotalRowCount: h.rows.length, ErrorMessage: '' }),
            }),
            AdhocSQLAuthorizer: { Authorize: () => null, ClampTimeoutSeconds: () => 30 },
        },
    },
}));
vi.mock('@memberjunction/actions-base', () => ({ RunActionParams: class RunActionParams {} }));
vi.mock('@memberjunction/core', () => ({ LogError: vi.fn() }));
vi.mock('@memberjunction/ai-core-plus', () => ({ AIPromptParams: class AIPromptParams {} }));
vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: { Instance: { Config: vi.fn().mockResolvedValue(undefined), Prompts: [{ Name: 'Analyze Query Data', Category: 'MJ: System' }] } },
}));
vi.mock('@memberjunction/ai-prompts', () => ({
    AIPromptRunner: class AIPromptRunner {
        public async ExecutePrompt() { return h.prompt; }
    },
}));

import { RunAdhocQueryAction } from '../custom/data/run-adhoc-query.action';

type Result = { Success: boolean; ResultCode: string; Message?: string; Results?: unknown; Analysis?: string; AnalysisError?: string };
type Runnable = { InternalRunAction(params: ParamBag & { ContextUser: { ID: string }; CredentialScope?: 'Any' | 'RuntimeOnly' }): Promise<Result> };

const NO_MODEL = 'No suitable model found for prompt Analyze Query Data. … The credential scope is RuntimeOnly, so only the API keys supplied with this run count.';

function run(returnType: string): Promise<Result> {
    const action = new RunAdhocQueryAction() as unknown as Runnable;
    return action.InternalRunAction({
        ContextUser: { ID: 'u-1' },
        CredentialScope: 'RuntimeOnly',
        Params: [
            { Name: 'Query', Type: 'Input', Value: 'SELECT Month, Total FROM Sales' },
            { Name: 'AnalysisRequest', Type: 'Input', Value: 'What is the trend?' },
            { Name: 'ReturnType', Type: 'Input', Value: returnType },
        ],
    });
}

describe('Run Ad-hoc Query when the analysis fails', () => {
    beforeEach(() => {
        h.rows = [{ Month: 'Jan', Total: 1 }, { Month: 'Feb', Total: 2 }];
        h.prompt = { success: false, errorMessage: NO_MODEL };
    });

    it("'analysis only' fails and says why, instead of returning SUCCESS with no analysis", async () => {
        const r = await run('analysis only');

        expect(r.Success).toBe(false);
        expect(r.ResultCode).toBe('ANALYSIS_FAILED');
        expect(r.Message).toContain('returned 2 row(s)');
        expect(r.Message).toContain('credential scope is RuntimeOnly');
    });

    it("'data and analysis' still returns the data, with the reason there is no analysis", async () => {
        const r = await run('data and analysis');

        expect(r.Success).toBe(true);
        expect(r.Results).toBeDefined();
        expect(r.AnalysisError).toBe(NO_MODEL);
        expect(r.Message).toContain('The analysis could not be produced');
    });

    it('a successful analysis reports no error', async () => {
        h.prompt = { success: true, result: { analysis: 'The totals rose.' } };

        const r = await run('analysis only');

        expect(r.Success).toBe(true);
        expect(r.Analysis).toBe('The totals rose.');
        expect(r.AnalysisError).toBeUndefined();
    });
});
