import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
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
