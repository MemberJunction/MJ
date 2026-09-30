/**
 * #4911 — a vector database that keys queries by Entity Document (`QueryKeyIsEntityDocumentID`,
 * e.g. the in-process Simple Vector Service) must be queried by Entity Document ID, not by the
 * index's name.
 *
 * Driven through the public `Search()` so the whole path is exercised: index load, embedding,
 * vector-DB resolution, the per-document queries, attribution and conversion. The shape mirrors the
 * shipped default: one SVS index shared by several Search documents, each vectorizing a different
 * entity and returning matches that carry only a `RecordID`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LogError, type IMetadataProvider, type UserInfo } from '@memberjunction/core';

const INDEX_ID = 'c4b90e4c-f338-4620-b1b0-6301bc40ef2e';
const OTHER_INDEX_ID = '0d6c3a57-5d7e-4c42-9c8e-2f3b9d4a1e10';
const MODEL_ID = 'a1f2c3d4-0000-4000-8000-000000000001';
const DB_ID = 'b2e3d4f5-0000-4000-8000-000000000002';
const AGENTS_DOC = 'd1111111-1111-4111-8111-111111111111';
const ACTIONS_DOC = 'd2222222-2222-4222-8222-222222222222';
const INACTIVE_DOC = 'd3333333-3333-4333-8333-333333333333';
const OTHER_INDEX_DOC = 'd4444444-4444-4444-8444-444444444444';

interface FakeEntityDocument { ID: string; VectorIndexID: string; Entity: string; Status: 'Active' | 'Inactive' }
interface FakeMatch { id: string; score: number; metadata: Record<string, unknown> }
interface FakeQuery { id: string; topK: number; filter?: object }

const { mockRunView, mockCreateInstance, mockKHConfig, entityDocumentsRef, getActiveDocsCalls, modelsRef } = vi.hoisted(() => ({
    mockRunView: vi.fn(),
    mockCreateInstance: vi.fn(),
    mockKHConfig: vi.fn(),
    entityDocumentsRef: { value: [] as FakeEntityDocument[] },
    getActiveDocsCalls: { count: 0 },
    modelsRef: { value: [] as Array<{ ID: string; Name: string; APIName: string; DriverClass: string }> },
}));

vi.mock('@memberjunction/core', () => ({
    Metadata: class { static Provider = {}; },
    RunView: class { RunView = mockRunView; },
    CompositeKey: class { KeyValuePairs: Array<{ FieldName: string; Value: string }> = []; SimpleLoadFromURLSegment() {} },
    LogError: vi.fn(),
    LogStatus: vi.fn(),
    UserInfo: class {},
}));

vi.mock('@memberjunction/core-entities', () => ({
    KnowledgeHubMetadataEngine: {
        Instance: {
            Config: mockKHConfig,
            get EntityDocuments() { return entityDocumentsRef.value; },
            // Mirrors the real engine: Active documents from the cached array, no query.
            GetActiveEntityDocuments() {
                getActiveDocsCalls.count++;
                return entityDocumentsRef.value.filter(d => d.Status === 'Active');
            },
            GetContentSourceByID: () => undefined,
            IsPermissionConstrained: false,
            PermissionConstrainedEntities: [],
        },
    },
}));

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: { Instance: { Config: vi.fn(), get Models() { return modelsRef.value; } } },
}));

vi.mock('@memberjunction/ai', () => ({
    BaseEmbeddings: class {},
    GetAIAPIKey: () => 'key',
}));

vi.mock('@memberjunction/ai-vectordb', () => ({
    VectorDBBase: class {},
}));

vi.mock('@memberjunction/global', () => ({
    MJGlobal: { Instance: { ClassFactory: { CreateInstance: mockCreateInstance } } },
    UUIDsEqual: (a: string | null | undefined, b: string | null | undefined) =>
        !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase(),
    RegisterClass: () => <T>(target: T) => target,
}));

import { VectorSearchProvider } from '../generic/VectorSearchProvider';
import type { ScopeConstraints } from '../generic/search.types';

const contextUser = { ID: 'user-1' } as UserInfo;

/** Entity metadata the result conversion looks up by name. */
const metadataProvider = {
    EntityByName: (name: string) => ({ Name: name, DisplayName: name.replace('MJ: ', ''), Fields: [], NameField: null }),
} as IMetadataProvider;

/** Vector DB with a pool per id; records every query it receives. */
function fakeVectorDB(keyedByEntityDocument: boolean, pools: Record<string, FakeMatch[]>) {
    const queries: FakeQuery[] = [];
    return {
        queries,
        QueryKeyIsEntityDocumentID: keyedByEntityDocument,
        SupportsColocatedQuery: false,
        TryWireColocatedHost: () => false,
        QueryIndex: async (params: FakeQuery) => {
            queries.push(params);
            return { success: true, message: '', data: { matches: (pools[params.id] ?? []).slice(0, params.topK) } };
        },
    };
}

/** Routes ClassFactory: the embedding driver, then the vector DB driver. */
function wireDrivers(vectorDB: ReturnType<typeof fakeVectorDB>): void {
    const embedder = { EmbedText: async () => ({ vector: [0.1, 0.2, 0.3] }) };
    mockCreateInstance.mockImplementation((_base: object, key: string) => (key === 'LocalEmbedding' ? embedder : vectorDB));
}

function match(id: string, score: number, recordID: string): FakeMatch {
    return { id, score, metadata: { RecordID: recordID } };
}

function loggedErrors(): string {
    return vi.mocked(LogError).mock.calls.map(([msg]) => String(msg)).join('\n');
}

function entityDocumentLookups(): number {
    return mockRunView.mock.calls.filter(([params]) => params.EntityName === 'MJ: Entity Documents').length;
}

describe('VectorSearchProvider — indexes keyed by Entity Document (#4911)', () => {
    let search: VectorSearchProvider;

    beforeEach(() => {
        search = new VectorSearchProvider();
        search.Provider = metadataProvider;
        getActiveDocsCalls.count = 0;
        mockKHConfig.mockResolvedValue(undefined);
        vi.mocked(LogError).mockClear();
        modelsRef.value = [{ ID: MODEL_ID, Name: 'gte-small (Local)', APIName: 'gte-small', DriverClass: 'LocalEmbedding' }];
        entityDocumentsRef.value = [
            { ID: AGENTS_DOC, VectorIndexID: INDEX_ID.toUpperCase(), Entity: 'MJ: AI Agents', Status: 'Active' },
            { ID: ACTIONS_DOC, VectorIndexID: INDEX_ID, Entity: 'MJ: Actions', Status: 'Active' },
            { ID: INACTIVE_DOC, VectorIndexID: INDEX_ID, Entity: 'MJ: Queries', Status: 'Inactive' },
            { ID: OTHER_INDEX_DOC, VectorIndexID: OTHER_INDEX_ID, Entity: 'MJ: AI Models', Status: 'Active' },
        ];
        mockRunView.mockImplementation(async (params: { EntityName: string }) => {
            if (params.EntityName === 'MJ: Vector Indexes') {
                return { Success: true, Results: [{
                    ID: INDEX_ID, Name: 'Default - SVS + gte-small (Local)', ExternalID: null,
                    VectorDatabaseID: DB_ID, EmbeddingModelID: MODEL_ID, Dimensions: null,
                }] };
            }
            if (params.EntityName === 'MJ: Vector Databases') {
                return { Success: true, Results: [{ ID: DB_ID, ClassKey: 'SimpleVectorServiceProvider' }] };
            }
            return { Success: false, Results: [], ErrorMessage: `unexpected RunView on ${params.EntityName}` };
        });
    });

    it('queries every Active Entity Document on the index by its ID and attributes each match to its entity', async () => {
        const vectorDB = fakeVectorDB(true, {
            [AGENTS_DOC]: [match('erd-a1', 0.81, 'agent-1')],
            [ACTIONS_DOC]: [match('erd-b1', 0.93, 'action-1')],
            [INACTIVE_DOC]: [match('erd-c1', 0.99, 'query-1')],
        });
        wireDrivers(vectorDB);

        const results = await search.Search('find the summarizer', 10, undefined, contextUser);

        expect(vectorDB.queries.map(q => q.id).sort()).toEqual([AGENTS_DOC, ACTIONS_DOC].sort());
        expect(results.map(r => [r.EntityName, r.RecordID, r.Score])).toEqual([
            ['MJ: Actions', 'action-1', 0.93],
            ['MJ: AI Agents', 'agent-1', 0.81],
        ]);
        expect(entityDocumentLookups()).toBe(0);
    });

    it('keeps the best topK across the documents, not topK per document', async () => {
        const vectorDB = fakeVectorDB(true, {
            [AGENTS_DOC]: [match('erd-a1', 0.9, 'agent-1'), match('erd-a2', 0.4, 'agent-2')],
            [ACTIONS_DOC]: [match('erd-b1', 0.7, 'action-1'), match('erd-b2', 0.6, 'action-2')],
        });
        wireDrivers(vectorDB);

        const results = await search.Search('top two only', 2, undefined, contextUser);

        expect(results.map(r => r.RecordID)).toEqual(['agent-1', 'action-1']);
    });

    it('fails clearly, without querying the driver by name, when no Active Entity Document points at the index', async () => {
        entityDocumentsRef.value = entityDocumentsRef.value.filter(d => d.VectorIndexID === OTHER_INDEX_ID);
        const vectorDB = fakeVectorDB(true, {});
        wireDrivers(vectorDB);

        const results = await search.Search('nothing to key by', 10, undefined, contextUser);

        expect(results).toEqual([]);
        expect(vectorDB.queries).toEqual([]);
        expect(loggedErrors()).toContain('is keyed by Entity Document, but no Active Entity Document points at it');
        expect(entityDocumentLookups()).toBe(0);
    });

    it('still queries a name-keyed provider once, by ExternalID or Name, without touching Entity Documents', async () => {
        const vectorDB = fakeVectorDB(false, { 'Default - SVS + gte-small (Local)': [match('v1', 0.8, 'agent-1')] });
        wireDrivers(vectorDB);

        await search.Search('name keyed', 10, undefined, contextUser);

        expect(vectorDB.queries.map(q => q.id)).toEqual(['Default - SVS + gte-small (Local)']);
        expect(getActiveDocsCalls.count).toBe(0);
    });

    /**
     * These providers ignore the native `filter` and return only a RecordID, and nothing downstream
     * re-applies it. So `EntityNames` is applied by choosing pools, and any other filter skips the index.
     */
    describe('filters', () => {
        let vectorDB: ReturnType<typeof fakeVectorDB>;

        beforeEach(() => {
            vectorDB = fakeVectorDB(true, {
                [AGENTS_DOC]: [match('erd-a1', 0.81, 'agent-1')],
                [ACTIONS_DOC]: [match('erd-b1', 0.93, 'action-1')],
            });
            wireDrivers(vectorDB);
        });

        it('queries only the documents whose entity EntityNames names', async () => {
            const results = await search.Search('q', 10, { EntityNames: ['MJ: Actions'] }, contextUser);

            expect(vectorDB.queries.map(q => q.id)).toEqual([ACTIONS_DOC]);
            expect(results.map(r => [r.EntityName, r.RecordID])).toEqual([['MJ: Actions', 'action-1']]);
        });

        it('matches EntityNames case-insensitively, as the other lanes do', async () => {
            await search.Search('q', 10, { EntityNames: ['mj: ai agents'] }, contextUser);

            expect(vectorDB.queries.map(q => q.id)).toEqual([AGENTS_DOC]);
        });

        it('queries nothing, and logs no error, when EntityNames names no entity on the index', async () => {
            const results = await search.Search('q', 10, { EntityNames: ['MJ: AI Models'] }, contextUser);

            expect(vectorDB.queries).toEqual([]);
            expect(results).toEqual([]);
            expect(loggedErrors()).toBe('');
        });

        it.each([
            ['Tags', { Tags: ['finance'] }],
            ['SourceTypes', { SourceTypes: ['Entity'] }],
        ])('skips the index and logs why when %s is set, even alongside EntityNames', async (name, filter) => {
            const results = await search.Search('q', 10, { EntityNames: ['MJ: Actions'], ...filter }, contextUser);

            expect(vectorDB.queries).toEqual([]);
            expect(results).toEqual([]);
            expect(loggedErrors()).toContain(`skipping index "Default - SVS + gte-small (Local)" because it cannot apply ${name}.`);
        });

        it("skips the index and logs why when the scope sets a MetadataFilter on it", async () => {
            const scope: ScopeConstraints = {
                ExternalIndexes: [{ IndexType: 'Vector', VectorIndexID: INDEX_ID, MetadataFilter: { TenantID: { $eq: 't1' } } }],
            };

            const results = await search.Search('q', 10, undefined, contextUser, scope);

            expect(vectorDB.queries).toEqual([]);
            expect(results).toEqual([]);
            expect(loggedErrors()).toContain(`because it cannot apply the scope's MetadataFilter.`);
        });

        it('queries every document, as before, when the filters are empty and the scope sets no MetadataFilter', async () => {
            const scope: ScopeConstraints = { ExternalIndexes: [{ IndexType: 'Vector', VectorIndexID: INDEX_ID }] };

            const results = await search.Search('q', 10, { EntityNames: [], Tags: [], SourceTypes: [] }, contextUser, scope);

            expect(vectorDB.queries.map(q => q.id).sort()).toEqual([AGENTS_DOC, ACTIONS_DOC].sort());
            expect(results.map(r => r.RecordID)).toEqual(['action-1', 'agent-1']);
            expect(loggedErrors()).toBe('');
        });

        it('leaves a name-keyed provider to apply every filter itself', async () => {
            // A name-keyed store returns its own metadata, `Entity` included.
            const nameKeyed = fakeVectorDB(false, {
                'Default - SVS + gte-small (Local)': [{ id: 'v1', score: 0.8, metadata: { RecordID: 'action-1', Entity: 'MJ: Actions' } }],
            });
            wireDrivers(nameKeyed);

            await search.Search('q', 10, { EntityNames: ['MJ: Actions'], Tags: ['finance'] }, contextUser);

            expect(nameKeyed.queries).toHaveLength(1);
            expect(nameKeyed.queries[0].filter).toEqual({
                $and: [{ Entity: { $in: ['MJ: Actions'] } }, { Tags: { $in: ['finance'] } }],
            });
            expect(loggedErrors()).toBe('');
        });
    });
});
