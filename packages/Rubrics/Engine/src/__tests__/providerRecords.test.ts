import { beforeEach, describe, expect, it, vi } from 'vitest';

const viewCalls: { EntityName: string }[] = [];

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        RunView: {
            FromMetadataProvider() {
                return {
                    async RunView(params: { EntityName: string }) {
                        viewCalls.push(params);
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

vi.mock('@memberjunction/ai-prompts', () => ({ AIPromptRunner: class AIPromptRunner {} }));
vi.mock('@memberjunction/ai-core-plus', () => ({ AIPromptParams: class AIPromptParams {} }));

import { ProviderEvaluationStore } from '../providerRecords.js';

describe('ProviderEvaluationStore.submit', () => {
    const written: { field: string; value: unknown }[] = [];

    beforeEach(() => {
        written.length = 0;
        viewCalls.length = 0;
    });

    it('writes rationale and evidence and returns the scored nodes', async () => {
        const store = ProviderEvaluationStore({
            async GetEntityObject(name: string) {
                const fields: Record<string, unknown> = {};
                return {
                    NewRecord() { /* filled by the store */ },
                    Set(field: string, value: unknown) {
                        fields[field] = value;
                        written.push({ field, value });
                    },
                    Get(field: string) {
                        if (field === 'ID') return 'eval-1';
                        if (field === 'NormalizedScore') return 0;
                        if (field === 'Completeness') return 1;
                        if (field === 'Outcome') return 'GateFailed';
                        if (field === 'Passed') return false;
                        if (field === 'GateFailed') return true;
                        return fields[field] ?? null;
                    },
                    async Load() { return true; },
                    async Save() { return true; },
                };
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
            evaluator: 'LLM',
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
        });
        expect(written).toContainEqual({ field: 'EvaluatorType', value: 'AIPrompt' });
        expect(written.some(row => row.field === 'EvaluatorType' && row.value === 'Deterministic')).toBe(false);
        expect(result.nodes).toEqual([{
            id: 'criterion',
            key: 'accuracy',
            normalizedScore: 0,
            effectiveWeight: 1,
            overallContribution: 0,
            gateFailed: true,
            isNotApplicable: false,
            isAdvisory: false,
        }]);
    });
});
