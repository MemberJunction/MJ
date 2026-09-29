import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { RunViewParams } from '@memberjunction/core';
import type { AIDecisionParams, AIDecisionRunResult } from '@memberjunction/ai-prompts';
import type { AIPromptParams, AIPromptRunResult } from '@memberjunction/ai-core-plus';
import type { DecisionAnswer } from '@memberjunction/ai';

/**
 * The entry-time duplicate check, `DuplicateRecordDetector.CheckRecordValues`, run end to end with
 * no database, vector index or model.
 *
 * `@memberjunction/core` and `@memberjunction/global` are the real modules (only logging is
 * stubbed), so the unsaved record is a real `BaseEntity`, candidate keys are real `CompositeKey`s,
 * and the reasoning providers register through the real class factory. The detector's surroundings
 * (vector base, templates, the AI engine and runners) are doubles, as in the neighbouring specs.
 */

// ─────────────────────────────────────────────
// Hoisted state and mocks
// ─────────────────────────────────────────────

/** One entity document as the Knowledge Hub engine caches it: the fields the detector reads. */
interface EntityDocumentFixture {
    ID: string;
    Name: string;
    Entity: string;
    EntityID: string;
    Status: 'Active' | 'Inactive';
    ReasoningMode: 'Agent' | 'Decision' | 'DecisionThenPrompt' | 'Prompt';
    EnableLLMReasoning: boolean;
    ReasoningThreshold: number | null;
    AIModelID: string | null;
    VectorDatabaseID: string | null;
    VectorIndexID: string | null;
    TemplateID: string;
    PotentialMatchThreshold: number;
    AbsoluteMatchThreshold: number;
    __mj_CreatedAt: Date;
}

/** One stored row of the entity being checked. */
interface AccountRow {
    ID: string;
    Name: string | null;
    City: string | null;
}

/** One vector match as the vector index returns it. */
interface VectorMatchFixture {
    id: string;
    score: number;
    metadata: { RecordID: string; Entity: string; TemplateID: string };
}

const { mocks, state } = vi.hoisted(() => ({
    mocks: {
        RunView: vi.fn<(params: RunViewParams, contextUser?: object) => Promise<{ Success: boolean; Results: object[]; RowCount: number; ErrorMessage?: string }>>(),
        GetEntityObject: vi.fn<(entityName: string, contextUser?: object) => Promise<object>>(),
        EntityByID: vi.fn<(id: string) => object | undefined>(),
        GetEntityDocumentsForEntity: vi.fn<(entityName: string) => EntityDocumentFixture[]>(),
        GetEntityDocumentByID: vi.fn<(id: string) => EntityDocumentFixture | undefined>(),
        GetVectorIndexByID: vi.fn<(id: string) => { Name: string } | undefined>(),
        RenderTemplate: vi.fn<(template: object, content: object, data: Record<string, unknown>) => Promise<{ Success: boolean; Output: string }>>(),
        EmbedTexts: vi.fn<(params: { texts: string[]; model: string | null }) => Promise<{ vectors: number[][] }>>(),
        QueryIndex: vi.fn<(params: { id: string; vector: number[]; topK: number }) => Promise<{ success: boolean; data: { matches: VectorMatchFixture[] } }>>(),
        ExecuteDecision: vi.fn<(params: AIDecisionParams) => Promise<AIDecisionRunResult>>(),
        ExecutePrompt: vi.fn<(params: AIPromptParams) => Promise<AIPromptRunResult>>(),
    },
    state: {
        /** Candidate ids the context user can read. */
        Readable: new Set<string>(),
        /** When true, stored rows come back without their Name, as field-level security strips it. */
        NameDenied: false,
        /** When true, the permission RunView (the one selecting only key and name fields) fails. */
        PermissionQueryFails: false,
    },
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    return { ...actual, LogError: vi.fn(), LogStatus: vi.fn() };
});

vi.mock('@memberjunction/ai', () => ({
    BaseEmbeddings: class {
        EmbedTexts = mocks.EmbedTexts;
    },
    GetAIAPIKey: vi.fn().mockReturnValue(''),
}));

vi.mock('@memberjunction/ai-vectordb', () => ({
    VectorDBBase: class {
        SupportsHybridSearch = false;
        SupportsColocatedQuery = false;
        RequiresAPIKey = false;
        QueryKeyIsEntityDocumentID = false;
        QueryIndex = mocks.QueryIndex;
    },
    BaseResponse: class {},
}));

vi.mock('@memberjunction/core-entities', () => ({
    MJDuplicateRunDetailEntity: vi.fn(),
    MJDuplicateRunDetailMatchEntity: vi.fn(),
    MJDuplicateRunEntity: vi.fn(),
    MJEntityDocumentEntity: vi.fn(),
    MJListDetailEntity: vi.fn(),
    MJListEntity: vi.fn(),
    RecordComparisonCompareOperation: class {},
    KnowledgeHubMetadataEngine: {
        Instance: {
            Config: vi.fn().mockResolvedValue(undefined),
            GetEntityDocumentsForEntity: mocks.GetEntityDocumentsForEntity,
            GetEntityDocumentByID: mocks.GetEntityDocumentByID,
            GetVectorIndexByID: mocks.GetVectorIndexByID,
        },
    },
}));

vi.mock('@memberjunction/ai-vectors', () => ({
    VectorBase: class VectorBase {
        _runView = { RunView: mocks.RunView };
        _metadata = { EntityByID: mocks.EntityByID, GetEntityObject: mocks.GetEntityObject };
        _currentUser: object | undefined = undefined;
        _provider = { Name: 'request-provider' };

        get Metadata() { return this._metadata; }
        get RunView() { return this._runView; }
        get CurrentUser() { return this._currentUser; }
        set CurrentUser(user: object | undefined) { this._currentUser = user; }
        GetAIModel() { return { APIName: 'fake-embedding', DriverClass: 'FakeEmbeddings' }; }
        GetVectorDatabase() { return { ClassKey: 'FakeVectorDB', Configuration: null }; }
        /** Mirrors the real VectorBase.BuildExtraFilter, which CheckSingleRecord loads through. */
        BuildExtraFilter(keys: { KeyValuePairs: { FieldName: string; Value: unknown }[] }[]): string {
            return keys.map(k => k.KeyValuePairs.map(kv => `${kv.FieldName} = '${String(kv.Value)}'`).join(' AND ')).join('\n OR ');
        }
    },
}));

vi.mock('@memberjunction/ai-vector-sync', () => ({
    EntityDocumentTemplateParser: { CreateInstance: vi.fn() },
    EntityVectorSyncer: class {},
    VectorizeEntityParams: class {},
}));

vi.mock('@memberjunction/templates', () => ({
    TemplateEngineServer: {
        Instance: {
            Config: vi.fn().mockResolvedValue(undefined),
            SetupNunjucks: vi.fn(),
            Templates: [{ ID: 'template-1', Content: [{ ID: 'template-content-1' }] }],
            RenderTemplate: mocks.RenderTemplate,
        },
    },
}));

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: {
        Instance: {
            Config: vi.fn().mockResolvedValue(undefined),
            Prompts: [
                { ID: 'prompt-decision', Name: 'Default Decision' },
                { ID: 'prompt-reasoning', Name: 'Duplicate Resolution' },
            ],
        },
    },
}));

vi.mock('@memberjunction/ai-prompts', () => ({
    AIDecisionRunner: class { ExecuteDecision = mocks.ExecuteDecision; },
    AIDecisionParams: class { Questions = {}; },
    AIPromptRunner: class { ExecutePrompt = mocks.ExecutePrompt; },
}));

vi.mock('@memberjunction/ai-core-plus', () => ({
    AIPromptParams: class {},
}));

// ─────────────────────────────────────────────
// Imports after mocks. The provider modules register the reasoning modes, as the package index does.
// ─────────────────────────────────────────────

import { BaseEntity, EntityInfo, UserInfo } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import { BaseEmbeddings } from '@memberjunction/ai';
import { VectorDBBase } from '@memberjunction/ai-vectordb';
import { DuplicateRecordDetector } from '../duplicateRecordDetector';
import '../reasoning/PromptReasoningProvider';
import '../reasoning/DecisionReasoningProvider';
import '../reasoning/DecisionThenPromptReasoningProvider';

// The mocked embedding and vector-database base classes are the doubles; register them under the
// driver keys the fixtures name, as a provider package registers its real subclass.
MJGlobal.Instance.ClassFactory.Register(BaseEmbeddings, BaseEmbeddings, 'FakeEmbeddings');
MJGlobal.Instance.ClassFactory.Register(VectorDBBase, VectorDBBase, 'FakeVectorDB');

// ─────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────

const ENTITY_INFO = new EntityInfo({
    ID: 'entity-accounts',
    Name: 'Accounts',
    Status: 'Active',
    Fields: [
        { Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true, Sequence: 1, AutoIncrement: false },
        { Name: 'Name', Type: 'nvarchar', IsNameField: true, DefaultInView: true, Sequence: 2 },
        { Name: 'City', Type: 'nvarchar', DefaultInView: true, Sequence: 3 },
    ],
});

/** A concrete entity class for the unsaved record, as `GetEntityObject` would return. */
class AccountRecord extends BaseEntity {}

const USER = new UserInfo(null, { ID: 'user-1', Email: 'person@example.com' });

const ROWS: Record<string, AccountRow> = {
    'cand-a': { ID: 'cand-a', Name: 'Acme Corp', City: 'Boston' },
    'cand-b': { ID: 'cand-b', Name: 'Acme Inc', City: 'Denver' },
    'cand-c': { ID: 'cand-c', Name: 'Acme Labs', City: 'Austin' },
    'saved-1': { ID: 'saved-1', Name: 'Acme Saved', City: 'Boston' },
};

const MATCHES: VectorMatchFixture[] = [
    { id: 'vec-a', score: 0.95, metadata: { RecordID: 'cand-a', Entity: 'Accounts', TemplateID: 'template-1' } },
    { id: 'vec-b', score: 0.9, metadata: { RecordID: 'cand-b', Entity: 'Accounts', TemplateID: 'template-1' } },
    { id: 'vec-c', score: 0.8, metadata: { RecordID: 'cand-c', Entity: 'Accounts', TemplateID: 'template-1' } },
];

const ENTERED = { Name: 'Acme', City: 'Boston' };

function entityDocument(overrides: Partial<EntityDocumentFixture> = {}): EntityDocumentFixture {
    return {
        ID: 'doc-1',
        Name: 'Accounts document',
        Entity: 'Accounts',
        EntityID: 'entity-accounts',
        Status: 'Active',
        ReasoningMode: 'Decision',
        EnableLLMReasoning: true,
        ReasoningThreshold: null,
        AIModelID: 'model-1',
        VectorDatabaseID: 'vdb-1',
        VectorIndexID: 'vi-1',
        TemplateID: 'template-1',
        PotentialMatchThreshold: 0.7,
        AbsoluteMatchThreshold: 0.99,
        __mj_CreatedAt: new Date('2026-01-01T00:00:00Z'),
        ...overrides,
    };
}

/** The candidate ids an ExtraFilter names, in either `ID='x'` or `ID = 'x'` form. */
function idsInFilter(filter: RunViewParams['ExtraFilter']): string[] {
    const text = typeof filter === 'string' ? filter : '';
    return [...text.matchAll(/ID\s*=\s*'([^']*)'/g)].map(m => m[1]);
}

/** The stored rows a RunView returns: the readable ones among those its filter names. */
async function runView(params: RunViewParams): Promise<{ Success: boolean; Results: object[]; RowCount: number; ErrorMessage?: string }> {
    const isPermissionQuery = params.Fields?.length === 2;
    if (state.PermissionQueryFails && isPermissionQuery) {
        return { Success: false, Results: [], RowCount: 0, ErrorMessage: 'permission query failed' };
    }
    const rows = idsInFilter(params.ExtraFilter)
        .filter(id => state.Readable.has(id) && ROWS[id])
        .map(id => (state.NameDenied ? { ID: ROWS[id].ID, City: ROWS[id].City } : { ...ROWS[id] }));
    if (params.ResultType === 'entity_object') {
        return { Success: true, Results: await Promise.all(rows.map(row => loadedAccount(row))), RowCount: rows.length };
    }
    return { Success: true, Results: rows, RowCount: rows.length };
}

async function loadedAccount(row: object): Promise<AccountRecord> {
    const record = new AccountRecord(ENTITY_INFO);
    await record.LoadFromData(row);
    return record;
}

/** Answers each Likelihood with the probability of the candidate its instructions name; unnamed ones get no answer. */
function answerByRecord(probabilities: Record<string, number>): void {
    mocks.ExecuteDecision.mockImplementation(async (params: AIDecisionParams) => {
        const answers: Record<string, DecisionAnswer> = {};
        for (const [key, question] of Object.entries(params.Questions)) {
            const recordID = Object.keys(probabilities).find(id => question.Instructions.includes(`(recordId ${id})`));
            if (recordID !== undefined) {
                answers[key] = { Kind: 'Likelihood', Probability: probabilities[recordID] };
            }
        }
        return { success: true, Answers: answers };
    });
}

/** The one decision call's params. */
function decisionParams(): AIDecisionParams {
    expect(mocks.ExecuteDecision).toHaveBeenCalledTimes(1);
    return mocks.ExecuteDecision.mock.calls[0][0];
}

// ─────────────────────────────────────────────
// Specs
// ─────────────────────────────────────────────

describe('DuplicateRecordDetector.CheckRecordValues', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        state.Readable = new Set(['cand-a', 'cand-b', 'cand-c']);
        state.NameDenied = false;
        state.PermissionQueryFails = false;
        mocks.RunView.mockImplementation(runView);
        mocks.GetEntityObject.mockImplementation(async () => new AccountRecord(ENTITY_INFO));
        mocks.EntityByID.mockReturnValue(ENTITY_INFO);
        mocks.GetEntityDocumentsForEntity.mockReturnValue([entityDocument()]);
        mocks.GetVectorIndexByID.mockImplementation((id: string) => ({ Name: `index-${id}` }));
        mocks.RenderTemplate.mockImplementation(async (_t, _c, data) => ({ Success: true, Output: `${data['Name']} | ${data['City']}` }));
        mocks.EmbedTexts.mockResolvedValue({ vectors: [[0.1, 0.2, 0.3]] });
        mocks.QueryIndex.mockResolvedValue({ success: true, data: { matches: MATCHES } });
        answerByRecord({ 'cand-a': 0.6, 'cand-b': 0.9, 'cand-c': 0.2 });
    });

    describe('the switch', () => {
        it('is NotConfigured, and does nothing else, when no Active document has a Decision mode', async () => {
            mocks.GetEntityDocumentsForEntity.mockReturnValue([
                entityDocument({ ID: 'doc-prompt', ReasoningMode: 'Prompt' }),
                entityDocument({ ID: 'doc-inactive', Status: 'Inactive' }),
            ]);

            const result = await new DuplicateRecordDetector().CheckRecordValues('Accounts', ENTERED, undefined, USER);

            expect(result.Status).toBe('NotConfigured');
            expect(result.Candidates).toEqual([]);
            expect(mocks.GetEntityObject).not.toHaveBeenCalled();
            expect(mocks.EmbedTexts).not.toHaveBeenCalled();
            expect(mocks.ExecuteDecision).not.toHaveBeenCalled();
        });

        it('uses the oldest qualifying document when several qualify', async () => {
            mocks.GetEntityDocumentsForEntity.mockReturnValue([
                entityDocument({ ID: 'doc-new', VectorIndexID: 'vi-new', __mj_CreatedAt: new Date('2026-06-01T00:00:00Z') }),
                entityDocument({ ID: 'doc-old', VectorIndexID: 'vi-old', ReasoningMode: 'DecisionThenPrompt', __mj_CreatedAt: new Date('2025-06-01T00:00:00Z') }),
            ]);

            await new DuplicateRecordDetector().CheckRecordValues('Accounts', ENTERED, undefined, USER);

            expect(mocks.QueryIndex.mock.calls[0][0].id).toBe('index-vi-old');
        });
    });

    describe('the unsaved record', () => {
        it('is built from the values, rendered by the template, embedded and queried', async () => {
            const detector = new DuplicateRecordDetector();

            await detector.CheckRecordValues('Accounts', { ...ENTERED, NotAField: 'ignored' }, undefined, USER);

            expect(mocks.GetEntityObject).toHaveBeenCalledWith('Accounts', USER);
            const rendered = mocks.RenderTemplate.mock.calls[0][2];
            expect(rendered['Name']).toBe('Acme');
            expect(rendered['City']).toBe('Boston');
            expect(rendered['NotAField']).toBeUndefined();
            expect(typeof rendered['ID']).toBe('string');
            expect(mocks.EmbedTexts).toHaveBeenCalledWith({ texts: ['Acme | Boston'], model: 'fake-embedding' });
            expect(mocks.QueryIndex).toHaveBeenCalledWith(
                expect.objectContaining({ id: 'index-vi-1', vector: [0.1, 0.2, 0.3], topK: 5 }),
                USER
            );
        });

        it('is the source the decision compares the candidates against', async () => {
            await new DuplicateRecordDetector().CheckRecordValues('Accounts', ENTERED, undefined, USER);

            const decisionState = JSON.parse(String(decisionParams().State));
            expect(decisionState.sourceRecord.label).toBe('Acme');
            const city = decisionState.fieldDeltas.find((d: { fieldName: string }) => d.fieldName === 'City');
            const sourceCity = city.values.find((v: { recordId: string }) => v.recordId === decisionState.sourceRecord.recordId);
            expect(sourceCity.value).toBe('Boston');
        });

        it('applies the TopK and threshold overrides as CheckSingleRecord does', async () => {
            const result = await new DuplicateRecordDetector().CheckRecordValues(
                'Accounts', ENTERED, { TopK: 2, PotentialMatchThreshold: 0.92 }, USER
            );

            expect(mocks.QueryIndex.mock.calls[0][0].topK).toBe(2);
            expect(result.Candidates.map(c => c.RecordID)).toEqual(['cand-a']);
        });
    });

    describe('the decision', () => {
        it('flags only the candidates the provider bands Uncertain, most probable first', async () => {
            const result = await new DuplicateRecordDetector().CheckRecordValues('Accounts', ENTERED, undefined, USER);

            expect(result.Status).toBe('Checked');
            expect(result.Candidates).toEqual([
                { RecordID: 'cand-b', DisplayName: 'Acme Inc', VectorScore: 0.9, Probability: 0.9 },
                { RecordID: 'cand-a', DisplayName: 'Acme Corp', VectorScore: 0.95, Probability: 0.6 },
            ]);
            expect(result.ElapsedMs).toBeGreaterThanOrEqual(0);
        });

        it('flags a candidate the decision gave no answer for, after the answered ones', async () => {
            answerByRecord({ 'cand-a': 0.7, 'cand-b': 0.1 });

            const result = await new DuplicateRecordDetector().CheckRecordValues('Accounts', ENTERED, undefined, USER);

            expect(result.Candidates.map(c => [c.RecordID, c.Probability])).toEqual([['cand-a', 0.7], ['cand-c', null]]);
        });

        it('asks only the decision in DecisionThenPrompt mode', async () => {
            mocks.GetEntityDocumentsForEntity.mockReturnValue([entityDocument({ ReasoningMode: 'DecisionThenPrompt' })]);

            const result = await new DuplicateRecordDetector().CheckRecordValues('Accounts', ENTERED, undefined, USER);

            expect(mocks.ExecuteDecision).toHaveBeenCalledTimes(1);
            expect(mocks.ExecutePrompt).not.toHaveBeenCalled();
            expect(result.Candidates.map(c => c.RecordID)).toEqual(['cand-b', 'cand-a']);
        });

        it('flags nothing, and says why, when the decision fails', async () => {
            mocks.ExecuteDecision.mockResolvedValue({ success: false, errorMessage: 'the decision model is overloaded', Answers: {} });

            const result = await new DuplicateRecordDetector().CheckRecordValues('Accounts', ENTERED, undefined, USER);

            expect(result.Status).toBe('Failed');
            expect(result.ErrorMessage).toContain('the decision model is overloaded');
            expect(result.Candidates).toEqual([]);
        });
    });

    describe('permission', () => {
        it('drops the candidates the person cannot read, before the decision sees them', async () => {
            state.Readable = new Set(['cand-a']);

            const result = await new DuplicateRecordDetector().CheckRecordValues('Accounts', ENTERED, undefined, USER);

            expect(Object.keys(decisionParams().Questions)).toHaveLength(1);
            expect(result.Candidates.map(c => c.RecordID)).toEqual(['cand-a']);
        });

        it('checks readability as the person, in one RunView over the candidate keys', async () => {
            await new DuplicateRecordDetector().CheckRecordValues('Accounts', ENTERED, undefined, USER);

            const permissionCall = mocks.RunView.mock.calls.find(([params]) => params.Fields?.length === 2);
            expect(permissionCall?.[0]).toMatchObject({ EntityName: 'Accounts', Fields: ['ID', 'Name'], ResultType: 'simple' });
            expect(idsInFilter(permissionCall?.[0].ExtraFilter)).toEqual(['cand-a', 'cand-b', 'cand-c']);
            expect(permissionCall?.[1]).toBe(USER);
        });

        it('flags nothing when readability cannot be confirmed', async () => {
            state.PermissionQueryFails = true;

            const result = await new DuplicateRecordDetector().CheckRecordValues('Accounts', ENTERED, undefined, USER);

            expect(result).toMatchObject({ Status: 'Checked', Candidates: [] });
            expect(mocks.ExecuteDecision).not.toHaveBeenCalled();
        });

        it('shows the record key, not an indexed name, when the name is not readable', async () => {
            state.NameDenied = true;

            const result = await new DuplicateRecordDetector().CheckRecordValues('Accounts', ENTERED, undefined, USER);

            expect(result.Candidates.map(c => c.DisplayName)).toEqual(['cand-b', 'cand-a']);
        });
    });

    describe('failures', () => {
        it('returns Failed with the reason rather than throwing', async () => {
            mocks.GetEntityDocumentsForEntity.mockReturnValue([entityDocument({ VectorIndexID: null })]);

            const result = await new DuplicateRecordDetector().CheckRecordValues('Accounts', ENTERED, undefined, USER);

            expect(result.Status).toBe('Failed');
            expect(result.ErrorMessage).toContain('No vector index found');
            expect(result.Candidates).toEqual([]);
        });
    });
});

describe('DuplicateRecordDetector.CheckSingleRecord, through the shared query step', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        state.Readable = new Set(['saved-1', 'cand-a', 'cand-b', 'cand-c']);
        state.NameDenied = false;
        state.PermissionQueryFails = false;
        mocks.RunView.mockImplementation(runView);
        mocks.EntityByID.mockReturnValue(ENTITY_INFO);
        mocks.GetEntityDocumentByID.mockReturnValue(entityDocument({ EnableLLMReasoning: false }));
        mocks.GetVectorIndexByID.mockImplementation((id: string) => ({ Name: `index-${id}` }));
        mocks.RenderTemplate.mockImplementation(async (_t, _c, data) => ({ Success: true, Output: `${data['Name']} | ${data['City']}` }));
        mocks.EmbedTexts.mockResolvedValue({ vectors: [[0.4, 0.5]] });
        mocks.QueryIndex.mockResolvedValue({ success: true, data: { matches: MATCHES } });
    });

    it('still loads the saved record, embeds it and returns its candidates', async () => {
        const key = (await loadedAccount(ROWS['saved-1'])).PrimaryKey;

        const result = await new DuplicateRecordDetector().CheckSingleRecord('doc-1', key, {}, USER);

        expect(mocks.EmbedTexts).toHaveBeenCalledWith({ texts: ['Acme Saved | Boston'], model: 'fake-embedding' });
        expect(result.Duplicates.map(d => d.ToCompactURLSegment())).toEqual(['cand-a', 'cand-b', 'cand-c']);
        expect(mocks.ExecuteDecision).not.toHaveBeenCalled();
    });
});
