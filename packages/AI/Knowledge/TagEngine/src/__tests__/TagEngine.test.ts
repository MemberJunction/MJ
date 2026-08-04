import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// Hoisted mocks — vi.mock factories are hoisted above imports, so any fn
// referenced inside a factory must come from vi.hoisted().
// ============================================================================

const {
    mockFindNearest, mockLoadVectors, mockAddVector, mockEmbedText,
    mockCreateInstance, mockCreateTag, mockCreateTaggedItem,
} = vi.hoisted(() => ({
    mockFindNearest: vi.fn().mockReturnValue([]),
    mockLoadVectors: vi.fn(),
    mockAddVector: vi.fn(),
    mockEmbedText: vi.fn().mockResolvedValue({ vector: [0.1, 0.2, 0.3] }),
    mockCreateInstance: vi.fn(),
    mockCreateTag: vi.fn(),
    mockCreateTaggedItem: vi.fn(),
}));

vi.mock('@memberjunction/global', () => ({
    BaseSingleton: class BaseSingleton<T> {
        public static getInstance<T>(): T { return new (this as unknown as new () => T)(); }
    },
    MJGlobal: {
        Instance: {
            ClassFactory: { CreateInstance: mockCreateInstance }
        }
    },
    UUIDsEqual: (a: string | null | undefined, b: string | null | undefined) => {
        if (a == null || b == null) return a === b;
        return a.toLowerCase() === b.toLowerCase();
    },
    NormalizeUUID: (id: string) => id.toLowerCase(),
    RegisterClass: vi.fn(),
}));

vi.mock('@memberjunction/core', () => ({
    UserInfo: class {},
    LogError: vi.fn(),
    LogStatus: vi.fn(),
    Metadata: class { Entities = []; CurrentUser = {}; },
    RunView: class { RunView = vi.fn().mockResolvedValue({ Success: true, Results: [] }); },
    BaseEntity: class {},
    BaseEngine: class {
        static getInstance() { return new this(); }
        async Load() {}
        async Config() {}
    },
    RegisterForStartup: vi.fn(),
}));

vi.mock('@memberjunction/core-entities', () => ({
    MJTagEntity: class {},
    MJTaggedItemEntity: class {},
    MJAICredentialBindingEntity: class {},
    MJAIPromptEntity: class {},
    MJAIPromptRunEntity: class {},
    MJAIModelEntity: class {},
    MJAIVendorEntity: class {},
    KnowledgeHubMetadataEngine: { Instance: { Config: vi.fn() } },
}));

vi.mock('@memberjunction/ai-prompts', () => ({
    AIModelRunner: class {
        async RunEmbedding(params: { Texts: string[] }) {
            // Generate dummy vectors (one per input text) so embedding succeeds
            const vectors = (params.Texts || []).map((_: string, i: number) =>
                Array.from({ length: 10 }, (__, j) => (i + 1) * 0.1 + j * 0.01)
            );
            return { Success: true, Vectors: vectors, PromptRunID: null, TokensUsed: 0, Cost: 0, ErrorMessage: null, ExecutionTimeMs: 0 };
        }
    },
    AIPromptRunner: class {
        async ExecutePrompt() {
            return { success: true, result: { taxonomy: [] }, errorMessage: null };
        }
    },
}));

// SeedTaxonomy imports AIPromptParams (ai-core-plus) and the clustering engine.
// Mock them so the real CorePlus module (which needs BaseEntity/MJAIPromptEntity) is
// not pulled into the mocked import graph.
vi.mock('@memberjunction/ai-core-plus', () => ({
    AIPromptParams: class {},
}));

vi.mock('@memberjunction/clustering-engine', () => ({
    ClusteringEngine: class {
        SuggestK() { return 1; }
        async RunPipeline() { return { Points: [], Clusters: [], Metrics: {}, Config: {} }; }
    },
    InMemoryVectorSource: class {
        constructor(public vectors: unknown[]) {}
    },
}));

// Mock tag data — also needs to be hoisted since it's used in vi.mock factories
const { mockTags } = vi.hoisted(() => ({
    mockTags: [
    { ID: 'tag-1', Name: 'Machine Learning', DisplayName: 'Machine Learning', Description: 'ML algorithms', ParentID: 'tag-root' },
    { ID: 'tag-2', Name: 'Deep Learning', DisplayName: 'Deep Learning', Description: null, ParentID: 'tag-1' },
    { ID: 'tag-root', Name: 'Technology', DisplayName: 'Technology', Description: null, ParentID: null },
],
}));

vi.mock('@memberjunction/tag-engine-base', () => ({
    TagEngineBase: {
        Instance: {
            Config: vi.fn().mockResolvedValue(undefined),
            Tags: mockTags,
            GetTagByID: vi.fn().mockImplementation((id: string) => mockTags.find(t => t.ID.toLowerCase() === id.toLowerCase())),
            GetTagByName: vi.fn().mockImplementation((name: string) => mockTags.find(t => t.Name.toLowerCase() === name.trim().toLowerCase())),
            GetTagBySynonym: vi.fn().mockReturnValue(undefined),
            GetVisibleTags: vi.fn().mockImplementation(() => mockTags.filter(t => (t as { Status?: string }).Status !== 'Merged')),
            GetScopesForTag: vi.fn().mockReturnValue([]),
            GetChildTags: vi.fn().mockImplementation((pid: string) => mockTags.filter(t => t.ParentID?.toLowerCase() === pid.toLowerCase())),
            GetSubtree: vi.fn().mockImplementation((rootID: string) => {
                const result: typeof mockTags = [];
                const collect = (pid: string) => {
                    for (const t of mockTags) {
                        if (t.ParentID?.toLowerCase() === pid.toLowerCase()) {
                            result.push(t);
                            collect(t.ID);
                        }
                    }
                };
                collect(rootID);
                return result;
            }),
            GetTaxonomyTree: vi.fn().mockReturnValue([]),
            CreateTag: mockCreateTag.mockImplementation((name: string) =>
                Promise.resolve({ ID: `new-${name.toLowerCase().replace(/ /g, '-')}`, Name: name, DisplayName: name, Description: null, ParentID: null })
            ),
            CreateTaggedItem: mockCreateTaggedItem.mockResolvedValue({}),
        },
    },
    TagTreeNode: class {},
}));

vi.mock('@memberjunction/ai-vectors-memory', () => {
    class MockSimpleVectorService {
        LoadVectors = mockLoadVectors;
        FindNearest = mockFindNearest;
        AddVector = mockAddVector;
    }
    return {
        SimpleVectorService: MockSimpleVectorService,
        VectorEntry: class {},
    };
});

vi.mock('@memberjunction/ai', () => ({
    BaseEmbeddings: class {},
    EmbedTextParams: class {},
    EmbedTextResult: class {},
    GetAIAPIKey: vi.fn().mockReturnValue('mock-api-key'),
}));

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: {
        Instance: {
            Config: vi.fn(),
            Loaded: true,
            Prompts: [],
            Models: [
                { ID: 'model-1', Name: 'text-embedding-3-small', AIModelType: 'Embeddings', InputTokenLimit: 8191, DriverClass: 'OpenAIEmbeddings', APIName: 'text-embedding-3-small' },
            ],
            ModelVendors: [
                { ModelID: 'model-1', Status: 'Active', DriverClass: 'OpenAIEmbeddings', APIName: 'text-embedding-3-small', Priority: 1 },
            ],
        }
    }
}));

import { TagEngine } from '../TagEngine';

describe('TagEngine', () => {
    let engine: TagEngine;

    beforeEach(() => {
        vi.clearAllMocks();
        engine = TagEngine.Instance;
        // Reset internal state for each test
        (engine as unknown as { _loaded: boolean })._loaded = false;
        (engine as unknown as { _loading: boolean })._loading = false;
        (engine as unknown as { _tagVectorService: null })._tagVectorService = null;

        // Set up embedding instance creation
        mockCreateInstance.mockReturnValue({ EmbedText: mockEmbedText });
    });

    // ========================================================================
    // Config / Loading
    // ========================================================================

    describe('Config', () => {
        it('should load TagEngineBase and generate embeddings', async () => {
            await engine.Config(true, {} as never);
            expect(engine.Loaded).toBe(true);
        });

        it('should be a no-op on second call without forceRefresh', async () => {
            await engine.Config(true, {} as never);
            const firstCallCount = mockLoadVectors.mock.calls.length;
            await engine.Config(false, {} as never);
            // LoadVectors should not have been called again
            expect(mockLoadVectors.mock.calls.length).toBe(firstCallCount);
        });

        it('should rebuild embeddings when forceRefresh is true', async () => {
            await engine.Config(true, {} as never);
            const firstCallCount = mockLoadVectors.mock.calls.length;
            await engine.Config(true, {} as never);
            expect(mockLoadVectors.mock.calls.length).toBe(firstCallCount + 1);
        });
    });

    // ========================================================================
    // Delegated Properties
    // ========================================================================

    describe('delegated properties', () => {
        it('should expose Tags from TagEngineBase', () => {
            expect(engine.Tags).toBe(mockTags);
        });

    });

    // ========================================================================
    // ResolveTag
    // ========================================================================

    describe('ResolveTag', () => {
        beforeEach(async () => {
            await engine.Config(true, {} as never);
        });

        describe('exact match fast path', () => {
            it('should return the tag when exact name matches', async () => {
                const result = await engine.ResolveTag('Machine Learning', 0.9, 'constrained', null, 0.9, {} as never);
                expect(result).toBeDefined();
                expect(result?.Name).toBe('Machine Learning');
            });

            it('should filter by subtree when rootID is set', async () => {
                // 'Technology' is the root, not within subtree of 'tag-1' (ML)
                const result = await engine.ResolveTag('Technology', 0.9, 'constrained', 'tag-1', 0.9, {} as never);
                // Technology's ParentID is null, not in tag-1 subtree
                expect(result).toBeNull();
            });
        });

        describe('semantic matching', () => {
            it('should attempt semantic search when no exact match', async () => {
                mockFindNearest.mockReturnValue([{ key: 'tag-1', score: 0.95, metadata: { Name: 'Machine Learning', ParentID: 'tag-root' } }]);

                const result = await engine.ResolveTag('ML Algorithms', 0.8, 'constrained', null, 0.9, {} as never);
                expect(result).toBeDefined();
                expect(result?.Name).toBe('Machine Learning');
            });

            it('should return null when semantic match is below threshold', async () => {
                mockFindNearest.mockReturnValue([]);
                const result = await engine.ResolveTag('Quantum Physics', 0.8, 'constrained', null, 0.9, {} as never);
                expect(result).toBeNull();
            });
        });

        describe('constrained mode', () => {
            it('should return null when no match is found', async () => {
                mockFindNearest.mockReturnValue([]);
                const result = await engine.ResolveTag('Blockchain', 0.8, 'constrained', null, 0.9, {} as never);
                expect(result).toBeNull();
                // Should NOT have called CreateTag
                expect(mockCreateTag).not.toHaveBeenCalled();
            });
        });

        describe('auto-grow mode', () => {
            it('should create a new tag under rootID when no match', async () => {
                mockFindNearest.mockReturnValue([]);
                const result = await engine.ResolveTag('Blockchain', 0.8, 'auto-grow', 'tag-root', 0.9, {} as never);
                expect(result).toBeDefined();
                expect(mockCreateTag).toHaveBeenCalledWith('Blockchain', 'Blockchain', 'tag-root', null, expect.anything());
            });

            it('should add new tag embedding to vector service', async () => {
                mockFindNearest.mockReturnValue([]);
                await engine.ResolveTag('Blockchain', 0.8, 'auto-grow', 'tag-root', 0.9, {} as never);
                expect(mockAddVector).toHaveBeenCalled();
            });
        });

        describe('free-flow mode', () => {
            it('should create a root-level tag when no match', async () => {
                mockFindNearest.mockReturnValue([]);
                const result = await engine.ResolveTag('Astronomy', 0.8, 'free-flow', null, 0.9, {} as never);
                expect(result).toBeDefined();
                expect(mockCreateTag).toHaveBeenCalledWith('Astronomy', 'Astronomy', null, null, expect.anything());
            });
        });

        describe('graceful degradation', () => {
            it('should still do exact-name matching when vector service is unavailable', async () => {
                // Force no vector service
                (engine as unknown as { _tagVectorService: null })._tagVectorService = null;
                const result = await engine.ResolveTag('Machine Learning', 0.9, 'constrained', null, 0.9, {} as never);
                expect(result?.Name).toBe('Machine Learning');
            });
        });
    });

    // ========================================================================
    // Delegated CRUD
    // ========================================================================

    describe('CreateTag', () => {
        it('should delegate to TagEngineBase', async () => {
            await engine.CreateTag('Test', 'Test', null, null, {} as never);
            expect(mockCreateTag).toHaveBeenCalledWith('Test', 'Test', null, null, expect.anything());
        });
    });

    describe('CreateTaggedItem', () => {
        it('should delegate to TagEngineBase', async () => {
            await engine.CreateTaggedItem('tag-1', 'ent-1', 'rec-1', 0.9, {} as never);
            expect(mockCreateTaggedItem).toHaveBeenCalledWith('tag-1', 'ent-1', 'rec-1', 0.9, expect.anything());
        });
    });
});
