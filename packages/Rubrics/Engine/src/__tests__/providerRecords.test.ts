import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const viewCalls: { EntityName: string; ExtraFilter?: string; OrderBy?: string }[] = [];
const promptCalls: Record<string, unknown>[] = [];
const renderCalls: { children: { childPrompt: { prompt: { Name: string }; data: Record<string, unknown> }; parentPlaceholder: string }[] }[] = [];
const decisionCalls: Record<string, unknown>[] = [];

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        RunView: {
            FromMetadataProvider() {
                return {
                    async RunView(params: { EntityName: string; ExtraFilter?: string; OrderBy?: string }) {
                        viewCalls.push(params);
                        if (params.EntityName === 'MJ: Conversations') {
                            return { Success: true, Results: [{ ID: 'conv-1', Name: 'Standup', Description: 'Shipped' }] };
                        }
                        if (params.EntityName === 'MJ: Conversation Details') {
                            return { Success: true, Results: [{ Role: 'User', Message: 'hello' }] };
                        }
                        if (params.EntityName === 'MJ: AI Prompts') {
                            if (params.ExtraFilter?.includes('missing')) return { Success: true, Results: [] };
                            const key = params.ExtraFilter?.match(/='(.*)'$/)?.[1]?.replace(/''/g, "'") ?? '';
                            return { Success: true, Results: [{ ID: `${key}-id`, Name: key }] };
                        }
                        if (params.EntityName === 'MJ: Rubric Evaluation Scores') {
                            return {
                                Success: true,
                                Results: [{
                                    CriterionID: 'criterion',
                                    NormalizedScore: 0,
                                    EffectiveWeight: 1,
                                    OverallContribution: 0,
                                    GateFailed: true,
                                    IsNotApplicable: false,
                                }],
                            };
                        }
                        if (params.EntityName === 'MJ: Rubric Criteria') {
                            return { Success: true, Results: [{ ID: 'criterion', Key: 'accuracy', IsAdvisory: false }] };
                        }
                        return { Success: true, Results: [] };
                    },
                };
            },
        },
    };
});

vi.mock('@memberjunction/ai-prompts', () => ({
    AIPromptRunner: class AIPromptRunner {
        async ExecutePrompt(params: Record<string, unknown>) {
            promptCalls.push(params);
            return { success: true, rawResult: '{"decisions":[]}', promptRun: { ID: 'prompt-run' }, cost: 0.01 };
        }
        async RenderChildPromptTemplates(children: { childPrompt: { prompt: { Name: string }; data: Record<string, unknown> }; parentPlaceholder: string }[]) {
            renderCalls.push({ children });
            const renderedTemplates: Record<string, string> = {};
            for (const child of children) renderedTemplates[child.parentPlaceholder] = `${child.childPrompt.prompt.Name} for ${child.parentPlaceholder}`;
            return { renderedTemplates };
        }
    },
    AIDecisionParams: class AIDecisionParams {},
    AIDecisionRunner: class AIDecisionRunner {
        async ExecuteDecision(params: Record<string, unknown>) {
            decisionCalls.push(params);
            return {
                success: true,
                Answers: { clarity: { Kind: 'Score', Value: 1, Probabilities: { Low: 0.2, High: 0.8 }, Confidence: 0.8 } },
                promptRun: { ID: 'decision-run' },
            };
        }
    },
}));
vi.mock('@memberjunction/ai-core-plus', async () => ({
    // The real picker: the scope tests below pin which fields it carries onto the evaluator's params.
    PickPromptExecutionScope: (await vi.importActual<typeof import('@memberjunction/ai-core-plus')>('@memberjunction/ai-core-plus')).PickPromptExecutionScope,
    AIPromptParams: class AIPromptParams {},
    ChildPromptParam: class ChildPromptParam {
        constructor(public childPrompt: unknown, public parentPlaceholder: string) {}
    },
}));

import type { AIPromptExecutionScope } from '@memberjunction/ai-core-plus';
import type { EvaluationAgentRunner } from '../AgentRubricEvaluator.js';
import { ProviderDecisionService, ProviderEvaluationStore, ProviderPromptService, ProviderRecords, ProviderRubricEngine, RegisterRubricAgentRunner } from '../providerRecords.js';
import { RubricEngine } from '../RubricEngine.js';

describe('provider evaluator services', () => {
    beforeEach(() => {
        viewCalls.length = 0;
        promptCalls.length = 0;
        renderCalls.length = 0;
        decisionCalls.length = 0;
    });

    const data = {
        Rubric: { Instructions: null, NotApplicablePolicy: 'NotAllowed' as const, PassThreshold: null },
        Mode: 'SinglePass' as const,
        Criteria: [],
        Subject: { EntityName: 'MJ: Documents', RecordID: '1' },
    };

    it('runs the evaluator prompt with the judge as its judgePrompt child, the subject as a user message, and a pinned model', async () => {
        const service = ProviderPromptService({}, { ID: 'user' });
        const output = await service.Run({
            Prompt: { ID: 'evaluator' }, Judge: { Name: 'Rubric Judge - Sage' }, Data: data, Subject: 'subject', ModelID: 'model-1', TimeoutMS: 5000,
        });
        expect(viewCalls.map(call => call.ExtraFilter)).toEqual(["ID='evaluator'", "Name='Rubric Judge - Sage'"]);
        const sent = promptCalls[0] as { childPrompts: { parentPlaceholder: string; childPrompt: { prompt: { Name: string }; data: unknown } }[] };
        expect(promptCalls[0]).toMatchObject({
            templateMessageRole: 'system',
            conversationMessages: [{ role: 'user', content: 'subject' }],
            override: { modelId: 'model-1' },
            timeoutMS: 5000,
            data,
        });
        expect(promptCalls[0]).not.toHaveProperty('systemPromptOverride');
        expect(promptCalls[0]).not.toHaveProperty('modelSelectionPrompt');
        expect(sent.childPrompts).toHaveLength(1);
        expect(sent.childPrompts[0].parentPlaceholder).toBe('judgePrompt');
        expect(sent.childPrompts[0].childPrompt.prompt.Name).toBe('Rubric Judge - Sage');
        expect(sent.childPrompts[0].childPrompt.data).toEqual(data);
        expect(output).toEqual({ Text: '{"decisions":[]}', PromptRunID: 'prompt-run', Cost: 0.01 });
    });

    it('lets the judge choose the model when ModelSelection is Judge, and runs without a judge when none is named', async () => {
        const service = ProviderPromptService({}, { ID: 'user' });
        await service.Run({ Prompt: { Name: 'Rubric Evaluator' }, Judge: { Name: 'Judge' }, Data: data, Subject: 's', ModelSelection: 'Judge' });
        expect((promptCalls[0] as { modelSelectionPrompt?: { Name: string } }).modelSelectionPrompt?.Name).toBe('Judge');
        await service.Run({ Prompt: { Name: 'Rubric Evaluator' }, Data: data, Subject: 's' });
        expect(promptCalls[1]).not.toHaveProperty('childPrompts');
        expect(promptCalls[1]).not.toHaveProperty('override');
    });

    it('finds a prompt by name, escaping it, and refuses a missing one', async () => {
        const service = ProviderPromptService({}, { ID: 'user' });
        await service.Run({ Prompt: { Name: "Judge's Prompt" }, Data: data, Subject: 's' });
        expect(viewCalls[0].ExtraFilter).toBe("Name='Judge''s Prompt'");
        await expect(service.Run({ Prompt: { Name: 'missing' }, Data: data, Subject: 's' })).rejects.toThrow('The missing prompt was not found.');
    });

    it('renders each criterion through the criterion prompt without a model call, in order', async () => {
        const service = ProviderPromptService({}, { ID: 'user' });
        const items = ['clarity', 'accuracy'].map(key => ({ Rubric: data.Rubric, Criterion: { Key: key } as never }));
        const texts = await service.RenderCriteria({ Prompt: { Name: 'Rubric Criterion' }, Items: items });
        expect(texts).toEqual(['Rubric Criterion for criterion0', 'Rubric Criterion for criterion1']);
        expect(renderCalls[0].children.map(child => child.childPrompt.data)).toEqual(items);
        expect(promptCalls).toHaveLength(0);
        expect(await service.RenderCriteria({ Prompt: { Name: 'Rubric Criterion' }, Items: [] })).toEqual([]);
    });

    it('previews the composed evaluator prompt with its judge, without a model call', async () => {
        const service = ProviderPromptService({}, { ID: 'user' });
        const preview = await service.Preview({ Prompt: { Name: 'Rubric Evaluator' }, Judge: { Name: 'Rubric Judge - Sage' }, Data: data });
        expect(preview).toBe('Rubric Evaluator for evaluator');
        const root = renderCalls[0].children[0] as unknown as { childPrompt: { childPrompts: { parentPlaceholder: string; childPrompt: { prompt: { Name: string } } }[] } };
        expect(root.childPrompt.childPrompts[0].parentPlaceholder).toBe('judgePrompt');
        expect(root.childPrompt.childPrompts[0].childPrompt.prompt.Name).toBe('Rubric Judge - Sage');
        expect(promptCalls).toHaveLength(0);
    });

    it('asks the Score questions on the decision prompt and returns the answers and the run', async () => {
        const service = ProviderDecisionService({}, { ID: 'user' });
        const questions = { clarity: { Kind: 'Score' as const, Instructions: 'Clear?', Levels: ['Low', 'High'] } };
        const output = await service.Decide({ Prompt: { Name: 'Default Decision' }, State: 'The text.', Questions: questions });
        expect(viewCalls[0].ExtraFilter).toBe("Name='Default Decision'");
        expect(decisionCalls[0]).toMatchObject({ State: 'The text.', Questions: questions });
        expect(output.PromptRunID).toBe('decision-run');
        expect(output.Answers.clarity.Probabilities.High).toBe(0.8);
    });
});

describe('provider evaluator services under a caller execution scope', () => {
    beforeEach(() => {
        viewCalls.length = 0;
        promptCalls.length = 0;
        decisionCalls.length = 0;
    });

    const data = {
        Rubric: { Instructions: null, NotApplicablePolicy: 'NotAllowed' as const, PassThreshold: null },
        Mode: 'SinglePass' as const,
        Criteria: [],
        Subject: { EntityName: 'MJ: Documents', RecordID: '1' },
    };
    const user = { ID: 'user' };
    /** A customer run's scope. Its contextUser differs from the service's user, which must still win. */
    const scope = {
        contextUser: { ID: 'scope-user' },
        configurationId: 'config-1',
        apiKeys: [{ driverClass: 'AnthropicLLM', apiKey: 'customer-key' }],
        CredentialScope: 'RuntimeOnly',
    } as unknown as AIPromptExecutionScope;

    it("runs the evaluator prompt on the scope's keys, configuration and CredentialScope", async () => {
        await ProviderPromptService({}, user, scope).Run({ Prompt: { Name: 'Rubric Evaluator' }, Judge: { Name: 'Judge' }, Data: data, Subject: 's' });
        expect(promptCalls[0]).toMatchObject({
            apiKeys: [{ driverClass: 'AnthropicLLM', apiKey: 'customer-key' }],
            configurationId: 'config-1',
            CredentialScope: 'RuntimeOnly',
        });
    });

    it("keeps the service's user as the evaluator prompt's contextUser under a scope", async () => {
        await ProviderPromptService({}, user, scope).Run({ Prompt: { Name: 'Rubric Evaluator' }, Data: data, Subject: 's' });
        expect((promptCalls[0] as { contextUser?: unknown }).contextUser).toBe(user);
    });

    it("asks the decision on the scope's keys, configuration and CredentialScope, as the service's user", async () => {
        const questions = { clarity: { Kind: 'Score' as const, Instructions: 'Clear?', Levels: ['Low', 'High'] } };
        await ProviderDecisionService({}, user, scope).Decide({ Prompt: { Name: 'Default Decision' }, State: 'The text.', Questions: questions });
        expect(decisionCalls[0]).toMatchObject({
            apiKeys: [{ driverClass: 'AnthropicLLM', apiKey: 'customer-key' }],
            configurationId: 'config-1',
            CredentialScope: 'RuntimeOnly',
        });
        expect((decisionCalls[0] as { contextUser?: unknown }).contextUser).toBe(user);
    });

    it('hands the execution scope to the registered agent-runner factory', () => {
        const factory = vi.fn((_provider: unknown, _user: unknown, _scope?: AIPromptExecutionScope) => ({} as unknown as EvaluationAgentRunner));
        RegisterRubricAgentRunner(factory);
        const provider = {};
        ProviderRubricEngine(provider, user, scope);
        expect(factory).toHaveBeenCalledTimes(1);
        expect(factory.mock.calls[0][0]).toBe(provider);
        expect(factory.mock.calls[0][1]).toBe(user);
        expect(factory.mock.calls[0][2]).toBe(scope);
    });
});

/** A generated entity records property assignment. Calling Set throws, which is the failure mode of the old row type. */
function generatedEntity(written: { field: string; value: unknown }[]) {
    const fields: Record<string, unknown> = {};
    const row = {
        NewRecord() { /* filled by property assignment */ },
        async Load() { return true; },
        async Save() { return true; },
    };
    return new Proxy(row, {
        get(target, prop, receiver) {
            if (typeof prop !== 'string' || prop in target) return Reflect.get(target, prop, receiver);
            if (prop === 'ID') return 'eval-1';
            if (prop === 'NormalizedScore') return 0;
            if (prop === 'Completeness') return 1;
            if (prop === 'Outcome') return 'GateFailed';
            if (prop === 'Passed') return false;
            if (prop === 'GateFailed') return true;
            return fields[prop] ?? null;
        },
        set(_target, prop, value) {
            if (typeof prop === 'string') {
                fields[prop] = value;
                written.push({ field: prop, value });
            }
            return true;
        },
    });
}

describe('generated rubric entity rows', () => {
    it('writes drafts through MJRubric entity properties instead of a Get/Set row', () => {
        const directory = dirname(fileURLToPath(import.meta.url));
        const records = readFileSync(join(directory, '../providerRecords.ts'), 'utf8');
        const catalog = readFileSync(join(directory, '../productionSamplingCatalog.ts'), 'utf8');
        expect(records).not.toMatch(/interface RubricRow/);
        expect(records).not.toMatch(/\.Set\(/);
        expect(records).not.toMatch(/row\.ID = node\.id/);
        expect(records).toMatch(/MJRubricVersionEntity/);
        expect(records).toMatch(/MJRubricEvaluationScoreEntity/);
        expect(catalog).toMatch(/MJAIAgentRubricEntity/);
        expect(catalog).toMatch(/MJRubricEvaluationEntity/);
        expect(catalog).toMatch(/ResultType: 'entity_object'/);
    });
});

describe('ProviderEvaluationStore.submit', () => {
    const written: { field: string; value: unknown }[] = [];

    beforeEach(() => {
        written.length = 0;
        viewCalls.length = 0;
    });

    it('writes rationale and evidence and returns the scored nodes', async () => {
        const store = ProviderEvaluationStore({
            async GetEntityObject() {
                return generatedEntity(written);
            },
        }, { ID: 'user' });
        const result = await store.submit('eval-1', [{
            criterionId: 'criterion',
            rationale: 'The figure is wrong.',
            evidence: [{ quote: 'cited' }],
        }]);
        expect(written).toContainEqual({ field: 'Rationale', value: 'The figure is wrong.' });
        expect(written).toContainEqual({ field: 'Evidence', value: JSON.stringify([{ quote: 'cited' }]) });
        written.length = 0;
        const draft = await store.createDraft({
            versionId: 'version',
            rubricId: 'rubric',
            subjectEntityId: 'entity',
            subjectRecordId: 'run-1',
            evaluatorType: 'AIPrompt',
            aiAgentRunId: 'run-1',
            evaluatorName: 'LLM',
            metadata: { Evaluator: { Name: 'LLM' } },
        });
        expect(draft.status).toBe('Draft');
        expect(written).toContainEqual({ field: 'AIAgentRunID', value: 'run-1' });
        expect(written).toContainEqual({ field: 'EvaluatorName', value: 'LLM' });
        expect(written).toContainEqual({ field: 'Metadata', value: JSON.stringify({ Evaluator: { Name: 'LLM' } }) });
        expect(written).toContainEqual({ field: 'EvaluatorType', value: 'AIPrompt' });
        written.length = 0;
        await store.createDraft({
            versionId: 'version',
            rubricId: 'rubric',
            subjectEntityId: 'entity',
            subjectRecordId: 'run-1',
            evaluatorType: 'Deterministic',
        });
        expect(written).toContainEqual({ field: 'EvaluatorType', value: 'Deterministic' });
        expect(written.some(row => row.field === 'EvaluatorType' && row.value === 'AIPrompt')).toBe(false);
        expect(result.nodes).toEqual([{
            id: 'criterion',
            key: 'accuracy',
            normalizedScore: 0,
            effectiveWeight: 1,
            overallContribution: 0,
            gateFailed: true,
            isNotApplicable: false,
            isAdvisory: false,
            completeness: null,
            confidence: null,
        }]);
    });
});

describe('conversation subject content', () => {
    const provider = {
        async GetEntityObject(): Promise<never> { throw new Error('this test does not create rows'); },
    };
    const user = { ID: 'user' };

    beforeEach(() => {
        viewCalls.length = 0;
    });

    function subjectContent() {
        return new RubricEngine(undefined, ProviderRecords(provider, user)).SubjectContent({
            subjectEntityName: 'MJ: Conversations',
            subjectRecordId: 'conv-1',
        });
    }

    function detailCall() {
        return viewCalls.find(call => call.EntityName === 'MJ: Conversation Details');
    }

    it('reads the Main details of a conversation subject, in Sequence order', async () => {
        const content = await subjectContent();
        expect(detailCall()?.ExtraFilter).toBe("[ConversationID]='conv-1' AND [BranchID] IS NULL");
        expect(detailCall()?.OrderBy).toBe('Sequence');
        expect(content.data?.details).toEqual([{ Role: 'User', Message: 'hello' }]);
    });
});
