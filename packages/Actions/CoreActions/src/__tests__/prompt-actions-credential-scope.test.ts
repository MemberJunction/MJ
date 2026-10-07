/**
 * Actions that run a prompt on behalf of a calling run must carry that run's CredentialScope onto the
 * prompt. None of them is handed the run's API keys, so under 'RuntimeOnly' the prompt must find no
 * usable model and fail, never fall back to the platform's keys. Dropping the scope silently spends them.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
    executeCalls: [] as Array<Record<string, unknown>>,
    prompts: [] as Array<Record<string, unknown>>,
    runViewResults: [] as Array<Record<string, unknown>>,
}));

vi.mock('@memberjunction/global', () => ({
    RegisterClass: () => (target: unknown) => target,
    MJGlobal: { Instance: {} },
    SQLExpressionValidator: { Instance: {} },
}));
vi.mock('@memberjunction/actions', () => ({ BaseAction: class BaseAction {}, ActionEngineServer: {} }));
vi.mock('@memberjunction/actions-base', () => ({
    RunActionParams: class RunActionParams {},
    ActionParam: class ActionParam {},
    ActionEngineBase: {},
}));
vi.mock('@memberjunction/core', () => ({
    LogError: vi.fn(),
    BaseEntity: class BaseEntity {},
    RunView: class RunView {
        public async RunView() {
            return { Success: true, Results: h.runViewResults };
        }
    },
}));
vi.mock('@memberjunction/generic-database-provider', () => ({ QueryCompositionEngine: {}, QueryPagingEngine: {} }));
vi.mock('@memberjunction/sqlserver-dataprovider', () => ({ SQLServerDataProvider: class SQLServerDataProvider {} }));
vi.mock('@memberjunction/ai-core-plus', () => ({ AIPromptParams: class AIPromptParams {} }));
vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: { Instance: { Config: vi.fn().mockResolvedValue(undefined), get Prompts() { return h.prompts; } } },
}));
vi.mock('@memberjunction/ai-prompts', () => ({
    AIPromptRunner: class AIPromptRunner {
        public async ExecutePrompt(params: Record<string, unknown>) {
            h.executeCalls.push(params);
            return { success: true, result: { summary: 's', wordCount: 1, analysis: 'a' }, rawResult: 'r' };
        }
    },
}));

import { ExecuteAIPromptAction } from '../custom/ai/execute-ai-prompt.action';
import { SummarizeContentAction } from '../custom/ai/summarize-content.action';
import { RunAdhocQueryAction } from '../custom/data/run-adhoc-query.action';

type Param = { Name: string; Type: string; Value: unknown };
type ActionParams = { Params: Param[]; ContextUser: { ID: string }; CredentialScope?: 'Any' | 'RuntimeOnly' };
type Runnable = { InternalRunAction(params: ActionParams): Promise<{ Success: boolean; Message?: string }> };
type AdhocAnalyzer = {
    analyzeQueryData(
        results: Array<Record<string, unknown>>,
        columns: Array<{ ColumnName: string; DataType: string; IsNullable: boolean }>,
        analysisRequest: string,
        params: ActionParams,
    ): Promise<{ success: boolean; analysis?: string; error?: string }>;
};

function runtimeOnlyParams(params: Param[]): ActionParams {
    return { Params: params, ContextUser: { ID: 'u-1' }, CredentialScope: 'RuntimeOnly' };
}

describe("prompt-running actions forward the calling run's CredentialScope", () => {
    beforeEach(() => {
        h.executeCalls.length = 0;
        h.prompts.length = 0;
        h.runViewResults.length = 0;
    });

    it('Execute AI Prompt passes CredentialScope to ExecutePrompt', async () => {
        h.runViewResults.push({ ID: 'P-1', Name: 'Summarize Text', Status: 'Active' });
        const action = new ExecuteAIPromptAction() as unknown as Runnable;

        const r = await action.InternalRunAction(runtimeOnlyParams([{ Name: 'PromptName', Type: 'Input', Value: 'Summarize Text' }]));

        expect(r.Success, r.Message).toBe(true);
        expect(h.executeCalls).toHaveLength(1);
        expect(h.executeCalls[0]).toMatchObject({ CredentialScope: 'RuntimeOnly', contextUser: { ID: 'u-1' } });
    });

    it('Summarize Content passes CredentialScope to ExecutePrompt', async () => {
        h.prompts.push({ ID: 'P-2', Name: 'Summarize Content', Category: 'MJ: System' });
        const action = new SummarizeContentAction() as unknown as Runnable;

        const r = await action.InternalRunAction(runtimeOnlyParams([
            { Name: 'Content', Type: 'Input', Value: 'Some text to summarize.' },
            { Name: 'SourceUrl', Type: 'Input', Value: 'https://example.com' },
        ]));

        expect(r.Success, r.Message).toBe(true);
        expect(h.executeCalls).toHaveLength(1);
        expect(h.executeCalls[0]).toMatchObject({ CredentialScope: 'RuntimeOnly', contextUser: { ID: 'u-1' } });
    });

    it("Run Adhoc Query passes CredentialScope to the 'Analyze Query Data' prompt", async () => {
        h.prompts.push({ ID: 'P-3', Name: 'Analyze Query Data', Category: 'MJ: System' });
        const action = new RunAdhocQueryAction() as unknown as AdhocAnalyzer;

        const r = await action.analyzeQueryData(
            [{ Name: 'Acme' }],
            [{ ColumnName: 'Name', DataType: 'nvarchar', IsNullable: false }],
            'Which names appear?',
            runtimeOnlyParams([]),
        );

        expect(r.success, r.error).toBe(true);
        expect(h.executeCalls).toHaveLength(1);
        expect(h.executeCalls[0]).toMatchObject({ CredentialScope: 'RuntimeOnly', contextUser: { ID: 'u-1' } });
    });
});
