import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const viewCalls: { EntityName: string; ExtraFilter?: string }[] = [];
const promptCalls: Record<string, unknown>[] = [];
const decisionCalls: Record<string, unknown>[] = [];

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        RunView: {
            FromMetadataProvider() {
                return {
                    async RunView(params: { EntityName: string; ExtraFilter?: string }) {
                        viewCalls.push(params);
                        if (params.EntityName === 'MJ: AI Prompts') {
                            return { Success: true, Results: params.ExtraFilter?.includes('missing') ? [] : [{ ID: 'prompt-id', Name: 'Found Prompt' }] };
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
            return { success: true, rawResult: '{"decisions":[]}', promptRun: { ID: 'prompt-run' } };
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
vi.mock('@memberjunction/ai-core-plus', () => ({ AIPromptParams: class AIPromptParams {} }));

import { ProviderDecisionService, ProviderEvaluationStore, ProviderPromptService } from '../providerRecords.js';

describe('provider evaluator services', () => {
    beforeEach(() => {
        viewCalls.length = 0;
        promptCalls.length = 0;
        decisionCalls.length = 0;
    });

    it('runs a chat prompt found by id, pins the model, and returns the prompt run', async () => {
        const service = ProviderPromptService({} as never, { ID: 'user' });
        const output = await service.Run({ Prompt: { ID: 'prompt-id' }, Messages: { system: 'rubric', user: 'subject' }, ModelID: 'model-1' });
        expect(viewCalls[0].ExtraFilter).toBe("ID='prompt-id'");
        expect(promptCalls[0]).toMatchObject({
            systemPromptOverride: 'rubric',
            conversationMessages: [{ role: 'user', content: 'subject' }],
            override: { modelId: 'model-1' },
        });
        expect(output).toEqual({ Text: '{"decisions":[]}', PromptRunID: 'prompt-run' });
    });

    it('finds a prompt by name and refuses a missing one', async () => {
        const service = ProviderPromptService({} as never, { ID: 'user' });
        await service.Run({ Prompt: { Name: "Judge's Prompt" }, Messages: { system: 's', user: 'u' } });
        expect(viewCalls[0].ExtraFilter).toBe("Name='Judge''s Prompt'");
        expect(promptCalls[0]).not.toHaveProperty('override');
        await expect(service.Run({ Prompt: { Name: 'missing' }, Messages: { system: 's', user: 'u' } })).rejects.toThrow('The missing prompt was not found.');
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
