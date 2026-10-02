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

vi.mock('@memberjunction/ai-core-plus', () => ({
    AIPromptParams: class AIPromptParams {},
}));

vi.mock('@memberjunction/ai-prompts', () => ({
    AIPromptRunner: class AIPromptRunner {},
}));

import { CreateRubricDraftAction, EvaluateRecordAgainstRubricAction, GetRubricAction, GetRubricConsensusAction } from '../actions.js';
import { CreateDraftVersion } from '../providerRecords.js';
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

function catalog(): RubricRecords & { filters: string[]; draftCalls: number; draftStatus: string; savedNodes: { id: string; key: string; name: string; weight: number; isGate: boolean; parentId?: string | null }[] } {
    const filters: string[] = [];
    const records = {
        filters,
        draftCalls: 0,
        draftStatus: 'Draft',
        savedNodes: [] as { id: string; key: string; name: string; weight: number; isGate: boolean; parentId?: string | null }[],
        async rows(entityName: string, filter: string) {
            filters.push(`${entityName} ${filter}`);
            if (entityName === 'MJ: Rubrics') return [{ ID: 'rubric', Name: 'Writing' }];
            if (entityName === 'MJ: Rubric Versions' && filter.includes("Status='Published'")) return [published('version-1', 1), published('version-4', 4)];
            if (entityName === 'MJ: Rubric Versions' && filter.includes('version-9')) return [published('version-9', 1)];
            if (entityName === 'MJ: Rubric Versions') return [published('version-1', 1), published('version-4', 4)];
            if (entityName === 'MJ: Entities') return [{ ID: 'entity-1', Name: 'MJ: Documents' }];
            if (entityName === 'MJ: Documents') return [{ ID: 'record-1', Name: 'Note', Body: 'Easy to read.' }];
            if (entityName === 'MJ: Rubric Evaluations') {
                const rows = [];
                if (filter.includes("'version-1'")) rows.push({ NormalizedScore: 0.2 });
                if (filter.includes("'version-4'")) rows.push({ NormalizedScore: 0.8 });
                return rows;
            }
            return [];
        },
        async createDraft(input?: { nodes?: { id: string; key: string; name: string; weight: number; isGate: boolean; parentId?: string | null }[] }) {
            records.draftCalls += 1;
            records.savedNodes = input?.nodes ?? [];
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
            displayScore: 75,
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
        expect(stats.Method).toBe('Median');
        expect(stats.Overall).toBe(0.8);
        expect(stats.SampleSize).toBe(1);
        const majorOne = await new GetRubricConsensusAction().Invoke(engine, {
            rubricName: 'Writing',
            subjectRecordId: 'record-1',
            major: 1,
            method: 'Median',
        });
        expect(majorOne.Overall).toBe(0.2);
        expect(majorOne.SampleSize).toBe(1);
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
        const matrix = await new CreateRubricDraftAction().Invoke(engine, {
            rubricId: 'rubric',
            matrix: '3,Security,1,no\n3.2,Encryption,2,yes',
        });
        expect(matrix).toEqual({ id: 'draft-1', status: 'Draft' });
        const encryption = records.savedNodes.find(node => node.key === '3.2');
        const security = records.savedNodes.find(node => node.key === '3');
        expect(encryption).toMatchObject({ name: 'Encryption', weight: 2, isGate: true });
        expect(encryption?.parentId).toBe(security?.id);
        records.draftStatus = 'Published';
        await expect(new CreateRubricDraftAction().Invoke(engine, { rubricId: 'rubric', nodes: [] })).rejects.toThrow(/never publishes/);
    });

    it('writes a draft version and does not set Status to Published', async () => {
        const saved: { entity: string; status?: unknown }[] = [];
        const provider = {
            async RunView() {
                return { Success: true, Results: [] };
            },
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
        const draft = await CreateDraftVersion(provider, { id: 'user' }, {
            rubricId: 'rubric',
            nodes: [{ id: 'leaf', key: 'clarity', name: 'Clarity', nodeType: 'Criterion', weight: 1, isAdvisory: false, isGate: false, evidenceRequired: false, rationaleRequired: false, sequence: 0 }],
        });
        expect(draft).toEqual({ id: 'version-new', status: 'Draft' });
        expect(saved.map(row => row.status)).toEqual(['Draft', undefined]);
        expect(saved.some(row => row.status === 'Published')).toBe(false);
    });

    it('sets BasedOnVersionID to the highest non-draft version and copies its anchors and bands', async () => {
        const written: { entity: string; values: Map<string, unknown> }[] = [];
        const provider = {
            async RunView(params: { EntityName: string }) {
                if (params.EntityName === 'MJ: Rubric Versions') {
                    return { Success: true, Results: [
                        { ID: 'published', Status: 'Published', MajorVersion: 1, MinorVersion: 0, PatchVersion: 0 },
                        { ID: 'retired', Status: 'Retired', MajorVersion: 2, MinorVersion: 1, PatchVersion: 0 },
                        { ID: 'draft-old', Status: 'Draft', MajorVersion: 8, MinorVersion: 0, PatchVersion: 0 },
                    ] };
                }
                if (params.EntityName === 'MJ: Rubric Criteria') {
                    return { Success: true, Results: [{ ID: 'old-clarity', Key: 'clarity', Name: 'Clarity', NodeType: 'Criterion', Weight: 1 }] };
                }
                if (params.EntityName === 'MJ: Rubric Criterion Levels') {
                    return { Success: true, Results: [{ CriterionID: 'old-clarity', ScaleLevelID: 'high', Descriptor: 'Clear' }] };
                }
                if (params.EntityName === 'MJ: Rubric Bands') {
                    return { Success: true, Results: [{ Label: 'Met', MinScore: 0.8, MaxScore: 1, DisplayTone: 'Success', Sequence: 0 }] };
                }
                return { Success: true, Results: [] };
            },
            async GetEntityObject(entity: string) {
                const values = new Map<string, unknown>();
                return {
                    Set(field: string, value: unknown) { values.set(field, value); },
                    Get(field: string) { return values.get(field); },
                    async Save() {
                        written.push({ entity, values: new Map(values) });
                        if (entity === 'MJ: Rubric Versions') values.set('ID', 'version-new');
                        return true;
                    },
                };
            },
        };
        await CreateDraftVersion(provider, { id: 'user' }, {
            rubricId: 'rubric',
            nodes: [{ id: 'leaf', key: 'clarity', name: 'Clarity', nodeType: 'Criterion', weight: 1, isAdvisory: false, isGate: false, evidenceRequired: false, rationaleRequired: false, sequence: 0 }],
        });
        const version = written.find(row => row.entity === 'MJ: Rubric Versions');
        expect(version?.values.get('BasedOnVersionID')).toBe('retired');
        expect(version?.values.get('Status')).toBe('Draft');
        const anchor = written.find(row => row.entity === 'MJ: Rubric Criterion Levels');
        expect(anchor?.values.get('CriterionID')).toBe('leaf');
        expect(anchor?.values.get('Descriptor')).toBe('Clear');
        const band = written.find(row => row.entity === 'MJ: Rubric Bands');
        expect(band?.values.get('RubricVersionID')).toBe('version-new');
        expect(band?.values.get('Label')).toBe('Met');
    });

    it('runs LLM through the Rubric Evaluator prompt and does not accept AI', async () => {
        const records = catalog();
        const store = evaluations();
        const prompts: string[] = [];
        const engine = new RubricEngine(store, records, {
            async Run(name) {
                prompts.push(name);
                return '{"decisions":[]}';
            },
        });
        const action = new EvaluateRecordAgainstRubricAction();
        const llm = await action.InternalRunAction({
            Params: [
                { Name: 'RubricID', Type: 'Input', Value: 'rubric' },
                { Name: 'SubjectEntityName', Type: 'Input', Value: 'MJ: Documents' },
                { Name: 'SubjectRecordID', Type: 'Input', Value: 'record-1' },
                { Name: 'Evaluator', Type: 'Input', Value: 'LLM' },
            ],
            Context: { rubricEngine: engine },
        } as never);
        expect(llm.Success).toBe(true);
        expect(llm.Message ?? '').not.toMatch(/prompt runner/i);
        expect(prompts).toEqual(['Rubric Evaluator']);
        const ai = await action.InternalRunAction({
            Params: [
                { Name: 'RubricID', Type: 'Input', Value: 'rubric' },
                { Name: 'SubjectEntityName', Type: 'Input', Value: 'MJ: Documents' },
                { Name: 'SubjectRecordID', Type: 'Input', Value: 'record-1' },
                { Name: 'Evaluator', Type: 'Input', Value: 'AI' },
            ],
            Context: { rubricEngine: engine },
        } as never);
        expect(ai.Success).toBe(false);
        expect(ai.Message).toBe('Evaluator AI is not accepted.');
        expect(ai.Message ?? '').not.toMatch(/prompt runner/i);
    });

    it('returns FAILED when the evaluation fails, and does not score a missing subject', async () => {
        const store: RubricEvaluationStore = {
            async createDraft() { return { id: 'eval-failed', status: 'Draft' }; },
            async submit() { throw new Error('should not submit'); },
            async fail(_id, message) { return { id: 'eval-failed', status: 'Failed', errorMessage: message }; },
        };
        const records: RubricRecords = {
            async rows(entityName: string) {
                if (entityName === 'MJ: Rubrics') return [{ ID: 'rubric', Name: 'Writing' }];
                if (entityName === 'MJ: Rubric Versions') return [{
                    ID: 'version-1', RubricID: 'rubric', MajorVersion: 1, MinorVersion: 0, PatchVersion: 0,
                    Status: 'Published', NotApplicablePolicy: 'ExcludeAndRedistribute', ScoreDisplayMin: 0, ScoreDisplayMax: 100,
                }];
                if (entityName === 'MJ: Entities') return [{ ID: 'entity-1', Name: 'MJ: Documents' }];
                return [];
            },
            async createDraft() { return { id: 'draft', status: 'Draft' }; },
        };
        const engine = new RubricEngine(store, records, {
            async Run() { throw new Error('the model refused'); },
        });
        const params = {
            Params: [
                { Name: 'RubricID', Type: 'Input', Value: 'rubric' },
                { Name: 'SubjectEntityName', Type: 'Input', Value: 'MJ: Documents' },
                { Name: 'SubjectRecordID', Type: 'Input', Value: 'missing' },
                { Name: 'Evaluator', Type: 'Input', Value: 'LLM' },
            ],
            Context: { rubricEngine: engine },
        };
        const missing = await new EvaluateRecordAgainstRubricAction().InternalRunAction(params as never);
        expect(missing.Success).toBe(false);
        expect(missing.ResultCode).toBe('FAILED');
        expect(missing.Message).toBe('subject not found or not readable');
        expect(params.Params.some(item => item.Name === 'Outcome')).toBe(false);

        records.rows = async (entityName: string) => {
            if (entityName === 'MJ: Documents') return [{ ID: 'record-1', Body: 'Easy to read.' }];
            if (entityName === 'MJ: Rubrics') return [{ ID: 'rubric', Name: 'Writing' }];
            if (entityName === 'MJ: Rubric Versions') return [{
                ID: 'version-1', RubricID: 'rubric', MajorVersion: 1, MinorVersion: 0, PatchVersion: 0,
                Status: 'Published', NotApplicablePolicy: 'ExcludeAndRedistribute', ScoreDisplayMin: 0, ScoreDisplayMax: 100,
            }];
            if (entityName === 'MJ: Entities') return [{ ID: 'entity-1', Name: 'MJ: Documents' }];
            return [];
        };
        const failed = await new EvaluateRecordAgainstRubricAction().InternalRunAction({
            Params: [
                { Name: 'RubricID', Type: 'Input', Value: 'rubric' },
                { Name: 'SubjectEntityName', Type: 'Input', Value: 'MJ: Documents' },
                { Name: 'SubjectRecordID', Type: 'Input', Value: 'record-1' },
                { Name: 'Evaluator', Type: 'Input', Value: 'LLM' },
            ],
            Context: { rubricEngine: engine },
        } as never);
        expect(failed.Success).toBe(false);
        expect(failed.ResultCode).toBe('FAILED');
        expect(failed.Message).toBe('the model refused');
    });
});
