import { describe, expect, it, vi } from 'vitest';
import type { RubricScoreResult } from '@memberjunction/rubrics-base';

vi.mock('@memberjunction/global', () => ({
    RegisterClass: () => (target: unknown) => target,
}));

vi.mock('@memberjunction/actions', () => ({
    BaseAction: class BaseAction {},
}));

vi.mock('@memberjunction/core', () => ({
    RunView: { FromMetadataProvider() { throw new Error('this test does not read the database'); } },
}));

import { CreateRubricDraftAction, EvaluateRecordAgainstRubricAction, GetRubricAction, GetRubricConsensusAction } from '../actions.js';
import { createDraftVersion } from '../providerRecords.js';
import { RubricEngine, type RubricEvaluationStore, type RubricRecords } from '../RubricEngine.js';

const score: RubricScoreResult = {
    normalizedScore: 0.75,
    completeness: 1,
    outcome: 'Passed',
    passed: true,
    gateFailed: false,
    passThresholdApplied: 0.6,
    bandId: null,
    confidence: null,
    nodes: [{ id: 'c', key: 'clarity', normalizedScore: 0.75, effectiveWeight: 1, overallContribution: 0.75, gateFailed: false, isNotApplicable: false, isAdvisory: false }],
    scoringEngineVersion: '1.0',
};

function published(id: string, major: number) {
    return {
        ID: id,
        RubricID: 'rubric',
        MajorVersion: major,
        MinorVersion: 0,
        PatchVersion: 0,
        Status: 'Published',
        NotApplicablePolicy: 'ExcludeAndRedistribute',
        ScoreDisplayMin: 0,
        ScoreDisplayMax: 100,
        PassThreshold: null,
    };
}

function catalog(): RubricRecords & { filters: string[]; draftCalls: number; draftStatus: string } {
    const filters: string[] = [];
    const records = {
        filters,
        draftCalls: 0,
        draftStatus: 'Draft',
        async rows(entityName: string, filter: string) {
            filters.push(`${entityName} ${filter}`);
            if (entityName === 'MJ: Rubrics') return [{ ID: 'rubric', Name: 'Writing' }];
            if (entityName === 'MJ: Rubric Versions' && filter.includes("Status='Published'")) return [published('version-3', 3), published('version-4', 4)];
            if (entityName === 'MJ: Rubric Versions' && filter.includes('version-9')) return [published('version-9', 1)];
            if (entityName === 'MJ: Rubric Versions') return [published('version-3', 3), published('version-4', 4)];
            if (entityName === 'MJ: Entities') return [{ ID: 'entity-1', Name: 'MJ: Documents' }];
            if (entityName === 'MJ: Rubric Evaluations') return [{ NormalizedScore: 0.2 }, { NormalizedScore: null }, { NormalizedScore: 0.8 }];
            return [];
        },
        async createDraft() {
            records.draftCalls += 1;
            return { id: 'draft-1', status: records.draftStatus };
        },
    };
    return records;
}

function evaluations(): RubricEvaluationStore & { draft?: { versionId: string; subjectRecordId: string; passThreshold?: number | null }; submitCalls: number } {
    const store = {
        submitCalls: 0,
        draft: undefined as { versionId: string; subjectRecordId: string; passThreshold?: number | null } | undefined,
        async createDraft(input: { versionId: string; subjectRecordId: string; passThreshold?: number | null }) {
            store.draft = input;
            return { id: 'eval-1', status: 'Draft' as const };
        },
        async submit() {
            store.submitCalls += 1;
            return score;
        },
        async fail() { throw new Error('should not fail'); },
    };
    return store;
}

describe('rubric actions', () => {
    it('evaluates the latest published version and returns the id, score, and outcome', async () => {
        const records = catalog();
        const store = evaluations();
        const engine = new RubricEngine(store, records);
        const result = await new EvaluateRecordAgainstRubricAction().Invoke(engine, {
            rubricId: 'rubric',
            subjectEntityName: 'MJ: Documents',
            subjectRecordId: 'record-1',
            evaluator: 'Deterministic',
            passThreshold: 0.6,
        });
        expect(store.draft).toMatchObject({ versionId: 'version-4', subjectRecordId: 'record-1', passThreshold: 0.6 });
        expect(records.filters.some(filter => filter.includes("Status='Published'"))).toBe(true);
        expect(result).toEqual({
            evaluationId: 'eval-1',
            score: 0.75,
            outcome: 'Passed',
            criteria: [{ key: 'clarity', normalizedScore: 0.75 }],
        });
    });

    it('loads submitted scores for consensus and returns the tree without scoring', async () => {
        const records = catalog();
        const store = evaluations();
        const engine = new RubricEngine(store, records);
        const stats = await new GetRubricConsensusAction().Invoke(engine, {
            rubricName: 'Writing',
            subjectRecordId: 'record-1',
            method: 'Median',
        });
        expect(stats.method).toBe('Median');
        expect(stats.overall).toBe(0.5);
        expect(stats.sampleSize).toBe(2);
        expect(records.filters.some(filter => filter.startsWith('MJ: Rubric Evaluations') && filter.includes("Status='Submitted'") && !filter.includes('scores'))).toBe(true);
        expect(await new GetRubricAction().Invoke(engine, { rubricName: 'Writing', versionId: 'version-9' })).toMatchObject({ id: 'version-9' });
        expect(store.submitCalls).toBe(0);
    });

    it('creates a draft and never publishes', async () => {
        const records = catalog();
        const store = evaluations();
        const engine = new RubricEngine(store, records);
        const draft = await new CreateRubricDraftAction().Invoke(engine, { rubricId: 'rubric', nodes: [] });
        expect(draft).toEqual({ id: 'draft-1', status: 'Draft' });
        expect(records.draftCalls).toBe(1);
        expect(store.submitCalls).toBe(0);
        records.draftStatus = 'Published';
        await expect(new CreateRubricDraftAction().Invoke(engine, { rubricId: 'rubric', nodes: [] })).rejects.toThrow(/never publishes/);
    });

    it('writes a draft version and does not set Status to Published', async () => {
        const saved: { entity: string; status?: unknown }[] = [];
        const provider = {
            async GetEntityObject(entity: string) {
                const values = new Map<string, unknown>();
                return {
                    Set(field: string, value: unknown) { values.set(field, value); },
                    Get(field: string) { return values.get(field); },
                    async Save() {
                        saved.push({ entity, status: values.get('Status') });
                        if (entity === 'MJ: Rubric Versions') values.set('ID', 'version-new');
                        return true;
                    },
                };
            },
        };
        const draft = await createDraftVersion(provider, { id: 'user' }, {
            rubricId: 'rubric',
            nodes: [{ id: 'leaf', key: 'clarity', name: 'Clarity', nodeType: 'Criterion', weight: 1, isAdvisory: false, isGate: false, evidenceRequired: false, rationaleRequired: false, sequence: 0 }],
        });
        expect(draft).toEqual({ id: 'version-new', status: 'Draft' });
        expect(saved.map(row => row.status)).toEqual(['Draft', undefined]);
        expect(saved.some(row => row.status === 'Published')).toBe(false);
    });
});
