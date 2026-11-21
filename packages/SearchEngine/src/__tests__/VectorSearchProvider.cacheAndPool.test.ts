import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import type { EmbeddingRunParams, EmbeddingRunResult } from '@memberjunction/ai-prompts';

const {
    mockRunViewFn,
    mockCreateInstance,
    mockGetApiKey,
    eventCallbacks,
} = vi.hoisted(() => ({
    mockRunViewFn: vi.fn(),
    mockCreateInstance: vi.fn(),
    mockGetApiKey: vi.fn((classKey: string) => `key-for-${classKey}`),
    eventCallbacks: [] as Array<(event: { event: string; eventCode: string; args: unknown }) => void>,
}));

vi.mock('@memberjunction/core', () => ({
    BaseEntity: { BaseEventCode: 'BaseEntityEvent' },
    Metadata: class {
        static Provider = {
            Entities: [],
            EntityByName: () => null,
            EntityByID: () => null,
        };
    },
    RunView: class {
        RunView = mockRunViewFn;
    },
    CompositeKey: class {
        KeyValuePairs: Array<{ FieldName: string; Value: string }> = [];
        SimpleLoadFromURLSegment() { /* no-op */ }
    },
    LogError: vi.fn(),
    LogStatus: vi.fn(),
}));

vi.mock('@memberjunction/core-entities', () => ({
    MJVectorIndexEntity: vi.fn(),
    MJVectorDatabaseEntity: vi.fn(),
    KnowledgeHubMetadataEngine: {
        Instance: {
            Config: vi.fn(async () => undefined),
            EntityDocuments: [],
            GetContentSourceByID: () => undefined,
            IsPermissionConstrained: false,
            PermissionConstrainedEntities: [],
        },
    },
}));

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: {
        Instance: {
            Config: vi.fn(async () => undefined),
            Models: [{ ID: '11111111-1111-4111-8111-111111111111', Name: 'text-embedding-3', DriverClass: 'OpenAI', APIName: 'text-embedding-3' }],
            GetProviderIndexName: (v: { Name: string; ExternalID?: string | null }) => v.ExternalID?.trim() || v.Name,
        },
    },
}));

vi.mock('@memberjunction/ai', () => ({
    GetAIAPIKey: (classKey: string) => mockGetApiKey(classKey),
}));

vi.mock('@memberjunction/ai-prompts', () => ({
    EmbeddingCarrierPrompts: { VectorSearch: 'Vector Search Embedding' },
    AIEmbeddingRunner: class {
        async RunEmbedding(params: EmbeddingRunParams): Promise<EmbeddingRunResult> {
            return {
                Success: true,
                Vectors: params.Texts.map(() => [0.5, 0.5]),
                PromptRunID: null,
                TokensUsed: 1,
                Cost: 0,
                ErrorMessage: null,
                ExecutionTimeMs: 1,
            };
        }
    },
}));

vi.mock('@memberjunction/ai-vectordb', () => ({
    VectorDBBase: class {},
}));

vi.mock('@memberjunction/global', async () => {
    const actual = await vi.importActual<typeof import('@memberjunction/global')>('@memberjunction/global');
    return {
        ...actual,
        RegisterClass: () => <T>(target: T) => target,
        MJGlobal: {
            Instance: {
                ClassFactory: { CreateInstance: mockCreateInstance },
                GetEventListener: () => ({
                    subscribe: (cb: (event: { event: string; eventCode: string; args: unknown }) => void) => {
                        eventCallbacks.push(cb);
                        return { unsubscribe: () => { /* no-op */ } };
                    },
                }),
            },
        },
    };
});

import { VectorSearchProvider } from '../generic/VectorSearchProvider';

const MODEL_ID = '11111111-1111-4111-8111-111111111111';
const INDEX_ID = '22222222-2222-4222-8222-222222222222';
const DB_ID = '33333333-3333-4333-8333-333333333333';
const USER_A = { ID: 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA', Name: 'User A' } as unknown as UserInfo;
const USER_B = { ID: 'BBBBBBBB-BBBB-4BBB-8BBB-BBBBBBBBBBBB', Name: 'User B' } as unknown as UserInfo;
const ANON_USER = { ID: '', Name: 'Anonymous' } as unknown as UserInfo;

function makeDriver(supportsColocated: boolean) {
    return {
        SupportsColocatedQuery: supportsColocated,
        QueryKeyIsEntityDocumentID: false,
        TryWireColocatedHost: vi.fn(),
        QueryIndex: vi.fn(async () => ({ success: true, message: '', data: { matches: [] } })),
        ColocatedQuery: vi.fn(async () => ({ matches: [] })),
    };
}

function setupDefaultRunView(classKey = 'PineconeDatabase') {
    mockRunViewFn.mockImplementation(async (params: { EntityName: string }) => {
        if (params.EntityName === 'MJ: Vector Indexes') {
            return {
                Success: true,
                Results: [{
                    ID: INDEX_ID,
                    Name: 'idx-main',
                    ExternalID: 'idx-main',
                    EmbeddingModelID: MODEL_ID,
                    VectorDatabaseID: DB_ID,
                    Dimensions: 2,
                }],
            };
        }
        if (params.EntityName === 'MJ: Vector Databases') {
            return {
                Success: true,
                Results: [{ ID: DB_ID, ClassKey: classKey }],
            };
        }
        return { Success: true, Results: [] };
    });
}

describe('VectorSearchProvider — user-scoped metadata cache & non-colocated client pooling', () => {
    let provider: VectorSearchProvider;

    beforeEach(() => {
        VectorSearchProvider.ClearCaches();
        provider = new VectorSearchProvider();
        mockRunViewFn.mockReset();
        mockCreateInstance.mockReset();
        mockGetApiKey.mockReset().mockImplementation((classKey: string) => `key-for-${classKey}`);
        setupDefaultRunView('PineconeDatabase');
    });

    it('caches Vector Indexes and Vector Databases per user across repeated searches', async () => {
        const driver = makeDriver(false);
        mockCreateInstance.mockReturnValue(driver);

        await provider.Search('first query', 5, undefined, USER_A);
        expect(mockRunViewFn).toHaveBeenCalledTimes(2); // 1x Indexes + 1x Databases

        await provider.Search('second query', 5, undefined, USER_A);
        // Zero additional metadata RunView calls for the same user within TTL
        expect(mockRunViewFn).toHaveBeenCalledTimes(2);
        // External driver instance pooled across both calls
        expect(mockCreateInstance).toHaveBeenCalledTimes(1);
        expect(driver.QueryIndex).toHaveBeenCalledTimes(2);
    });

    it('isolates metadata caches by contextUser.ID (User B never reuses User A cache)', async () => {
        mockCreateInstance.mockReturnValue(makeDriver(false));

        await provider.Search('query one', 5, undefined, USER_A);
        expect(mockRunViewFn).toHaveBeenCalledTimes(2);

        await provider.Search('query two', 5, undefined, USER_B);
        // User B must issue its own RunViews under User B's context
        expect(mockRunViewFn).toHaveBeenCalledTimes(4);
    });

    it('never caches metadata when contextUser.ID is missing/empty (fail-closed)', async () => {
        mockCreateInstance.mockReturnValue(makeDriver(false));

        await provider.Search('query one', 5, undefined, ANON_USER);
        await provider.Search('query two', 5, undefined, ANON_USER);

        expect(mockRunViewFn).toHaveBeenCalledTimes(4);
    });

    it('pools non-colocated drivers by (ClassKey, apiKey) and NEVER pools colocated drivers', async () => {
        // Non-colocated with changing apiKey creates separate pooled clients
        const driver1 = makeDriver(false);
        const driver2 = makeDriver(false);
        mockCreateInstance.mockReturnValueOnce(driver1).mockReturnValueOnce(driver2);
        mockGetApiKey.mockReturnValueOnce('api-key-1').mockReturnValueOnce('api-key-2');

        await provider.Search('q1', 5, undefined, USER_A);
        await provider.Search('q2', 5, undefined, USER_A);
        expect(mockCreateInstance).toHaveBeenCalledTimes(2);

        // Colocated driver must NOT be pooled (binds per-request provider connection)
        VectorSearchProvider.ClearCaches();
        mockCreateInstance.mockReset();
        const colocated1 = makeDriver(true);
        const colocated2 = makeDriver(true);
        mockCreateInstance.mockReturnValueOnce(colocated1).mockReturnValueOnce(colocated2);
        setupDefaultRunView('PgVectorColocated');

        await provider.Search('q3', 5, undefined, USER_A);
        await provider.Search('q4', 5, undefined, USER_A);
        expect(mockCreateInstance).toHaveBeenCalledTimes(2);
        expect(colocated1.TryWireColocatedHost).toHaveBeenCalledTimes(1);
        expect(colocated2.TryWireColocatedHost).toHaveBeenCalledTimes(1);
    });

    it('evicts caches on ClearCaches() and on MJ entity save events for Vector Indexes / Databases', async () => {
        mockCreateInstance.mockReturnValue(makeDriver(false));

        await provider.Search('q1', 5, undefined, USER_A);
        expect(mockRunViewFn).toHaveBeenCalledTimes(2);

        // Simulate a Vector Index save event via MJGlobal event bus
        for (const cb of eventCallbacks) {
            cb({
                event: 'ComponentEvent',
                eventCode: 'BaseEntityEvent',
                args: { type: 'save', baseEntity: { EntityInfo: { Name: 'MJ: Vector Indexes' } } },
            });
        }

        await provider.Search('q2', 5, undefined, USER_A);
        expect(mockRunViewFn).toHaveBeenCalledTimes(4);
        expect(mockCreateInstance).toHaveBeenCalledTimes(2);

        // Simulate a multi-replica remote-invalidate event where baseEntity is null
        for (const cb of eventCallbacks) {
            cb({
                event: 'ComponentEvent',
                eventCode: 'BaseEntityEvent',
                args: { type: 'remote-invalidate', baseEntity: null, entityName: 'MJ: Vector Indexes' },
            });
        }

        await provider.Search('q3', 5, undefined, USER_A);
        expect(mockRunViewFn).toHaveBeenCalledTimes(6);
        expect(mockCreateInstance).toHaveBeenCalledTimes(3);
    });

    it('bounds vectorIndexCache and vectorDatabaseCache to METADATA_CACHE_MAX_SIZE (100) via LRU eviction', async () => {
        mockCreateInstance.mockReturnValue(makeDriver(false));

        // Populate 100 distinct users (0..99)
        for (let i = 0; i < 100; i++) {
            const u = { ID: `user-${i}`, Email: `u${i}@example.com` } as UserInfo;
            await provider.Search('q', 5, undefined, u);
        }
        expect(mockRunViewFn).toHaveBeenCalledTimes(200);

        // Touch user-0 so user-1 becomes the LRU victim
        const user0 = { ID: 'user-0', Email: 'u0@example.com' } as UserInfo;
        const user1 = { ID: 'user-1', Email: 'u1@example.com' } as UserInfo;
        await provider.Search('q', 5, undefined, user0);
        expect(mockRunViewFn).toHaveBeenCalledTimes(200);

        // 101st user evicts user-1 while keeping user-0 cached
        const user100 = { ID: 'user-100', Email: 'u100@example.com' } as UserInfo;
        await provider.Search('q', 5, undefined, user100);
        expect(mockRunViewFn).toHaveBeenCalledTimes(202);

        // user-0 still hits cache (0 new RunView calls)
        await provider.Search('q', 5, undefined, user0);
        expect(mockRunViewFn).toHaveBeenCalledTimes(202);

        // user-1 was evicted (2 new RunView calls)
        await provider.Search('q', 5, undefined, user1);
        expect(mockRunViewFn).toHaveBeenCalledTimes(204);
    });
});
