/**
 * TagEngine embeds tags, tag-resolution queries and new tags with ONE model, and persists that
 * model's ID as Tag.EmbeddingModelID. Cosine similarity between vectors from two models is
 * meaningless even when their dimensions match, so every embedding call must pin the same ModelID.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserInfo } from '@memberjunction/core';
import type { EmbeddingRunParams, EmbeddingRunResult } from '@memberjunction/ai-prompts';

/** The tag fields TagEngine reads and writes. */
interface FakeTag {
    ID: string;
    Name: string;
    DisplayName: string;
    Description: string | null;
    ParentID: string | null;
    Status: 'Active';
    EmbeddingVector: string | null;
    EmbeddingModelID: string | null;
    Save: () => Promise<boolean>;
}

interface FakeModel {
    ID: string;
    Name: string;
    AIModelType: string;
    IsActive: boolean;
    InputTokenLimit: number;
    DriverClass: string;
    APIName: string;
}

const h = vi.hoisted(() => {
    const state = {
        tags: [] as FakeTag[],
        models: [] as FakeModel[],
        modelVendors: [] as Array<{ ModelID: string; Status: string; DriverClass: string; APIName: string; Priority: number }>,
        prompts: [] as Array<{ ID: string; Name: string; Status: string }>,
        promptModels: [] as Array<{ PromptID: string; ModelID: string; Priority: number; Status: string; ConfigurationID: string | null }>,
        /** What each tag was saved with: [tag ID, EmbeddingModelID]. */
        persisted: [] as Array<[string, string | null]>,
    };

    const embedCalls: EmbeddingRunParams[] = [];
    const runEmbedding = vi.fn(async (params: EmbeddingRunParams): Promise<EmbeddingRunResult> => {
        embedCalls.push(params);
        return {
            Success: true,
            Vectors: params.Texts.map(() => [0.1, 0.2, 0.3]),
            PromptRunID: null,
            TokensUsed: 0,
            Cost: 0,
            ErrorMessage: null,
            ExecutionTimeMs: 0,
            ModelID: params.ModelID,
        };
    });

    const findNearest = vi.fn();
    const removeVector = vi.fn();
    return { state, embedCalls, runEmbedding, findNearest, removeVector };
});

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    /** A fresh TagEngine per test, instead of one process-wide instance. */
    class FreshSingleton {
        public static getInstance<T>(this: new () => T): T {
            return new this();
        }
    }
    return { ...actual, BaseSingleton: FreshSingleton };
});

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
    MJAIModelPriceUnitTypeEntity: class {},
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
    AIEmbeddingRunner: class {
        RunEmbedding = h.runEmbedding;
    },
    AIPromptRunner: class {},
}));

vi.mock('@memberjunction/ai-core-plus', () => ({
    AIPromptParams: class {},
}));

vi.mock('@memberjunction/clustering-engine', () => ({
    ClusteringEngine: class {},
    InMemoryVectorSource: class {},
}));

vi.mock('@memberjunction/tag-engine-base', () => ({
    TagEngineBase: {
        Instance: {
            Config: vi.fn().mockResolvedValue(undefined),
            get Tags() { return h.state.tags; },
            GetTagByID: (id: string) => h.state.tags.find(t => t.ID.toLowerCase() === id.toLowerCase()),
            GetTagByName: (name: string) => h.state.tags.find(t => t.Name.toLowerCase() === name.trim().toLowerCase()),
            GetTagBySynonym: () => undefined,
            GetVisibleTags: () => h.state.tags,
            GetSubtree: () => [],
        },
    },
    TagTreeNode: class {},
}));

vi.mock('@memberjunction/ai-vectors-memory', async () => ({
    ReadStoredVector: (await import('./helpers/readStoredVectorStub')).ReadStoredVectorStub,
    SimpleVectorService: class {
        LoadVectors = vi.fn();
        AddVector = vi.fn();
        RemoveVector = h.removeVector;
        FindNearest = h.findNearest;
        FindNearestAsync = (...args: Parameters<typeof h.findNearest>) => Promise.resolve(h.findNearest(...args));
    },
    VectorEntry: class {},
}));

vi.mock('@memberjunction/ai', () => ({
    BaseEmbeddings: class {},
}));

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: {
        Instance: {
            Config: vi.fn(),
            Loaded: true,
            get Prompts() { return h.state.prompts; },
            get PromptModels() { return h.state.promptModels; },
            get Models() { return h.state.models; },
            get ModelVendors() { return h.state.modelVendors; },
        },
    },
}));

import { TagEngine } from '../TagEngine';

const PROMPT_MODEL_ID = 'model-prompt';
const SMALLEST_MODEL_ID = 'model-smallest';
const TAG_PROMPT_ID = 'prompt-tag-semantic';

function makeTag(id: string, name: string, persisted?: { vector: number[]; modelID: string }): FakeTag {
    const tag: FakeTag = {
        ID: id,
        Name: name,
        DisplayName: name,
        Description: null,
        ParentID: null,
        Status: 'Active',
        EmbeddingVector: persisted ? JSON.stringify(persisted.vector) : null,
        EmbeddingModelID: persisted?.modelID ?? null,
        Save: async () => {
            h.state.persisted.push([tag.ID, tag.EmbeddingModelID]);
            return true;
        },
    };
    return tag;
}

function embeddingModel(id: string, inputTokenLimit: number): FakeModel {
    return { ID: id, Name: id, AIModelType: 'Embeddings', IsActive: true, InputTokenLimit: inputTokenLimit, DriverClass: 'LocalEmbedding', APIName: `Xenova/${id}` };
}

/**
 * The prompt's model has the LARGER input limit, so "smallest model" and "prompt model" disagree:
 * a mix-up between the two shows up as two different ModelIDs across the calls.
 */
function loadCatalog(withPromptBinding: boolean): void {
    h.state.models = [embeddingModel(PROMPT_MODEL_ID, 512), embeddingModel(SMALLEST_MODEL_ID, 128)];
    h.state.modelVendors = h.state.models.map(m => ({ ModelID: m.ID, Status: 'Active', DriverClass: m.DriverClass, APIName: m.APIName, Priority: 1 }));
    h.state.prompts = withPromptBinding ? [{ ID: TAG_PROMPT_ID, Name: 'Tag Semantic Matching', Status: 'Active' }] : [];
    h.state.promptModels = withPromptBinding
        ? [{ PromptID: TAG_PROMPT_ID, ModelID: PROMPT_MODEL_ID, Priority: 10, Status: 'Active', ConfigurationID: null }]
        : [];
}

const user = new UserInfo();

/**
 * Loads the engine, resolves one query, and re-embeds one tag (the path a newly created tag takes),
 * then returns the ModelID each embedding call pinned.
 */
async function exerciseAllThreeEmbeddingPaths(engine: TagEngine): Promise<Array<string | undefined>> {
    await engine.Config(true, user);
    h.findNearest.mockReturnValue([{ key: 'tag-1', score: 0.99, metadata: { Name: 'Machine Learning', ParentID: null } }]);
    const resolved = await engine.ResolveTag('ML algorithms', 0.8, 'constrained', null, 0.9, user);
    expect(resolved?.ID).toBe('tag-1');
    const tag = engine.GetTagByID('tag-2');
    expect(tag).toBeDefined();
    if (tag) {
        await engine.ReEmbedTag(tag);
    }
    return h.embedCalls.map(c => c.ModelID);
}

describe('TagEngine uses one embedding model for tags, queries and new tags', () => {
    let engine: TagEngine;

    beforeEach(() => {
        h.embedCalls.length = 0;
        h.runEmbedding.mockClear();
        h.findNearest.mockReset();
        h.removeVector.mockClear();
        h.state.persisted = [];
        h.state.tags = [makeTag('tag-1', 'Machine Learning'), makeTag('tag-2', 'Deep Learning')];
        engine = new TagEngine();
    });

    it('pins the Tag Semantic Matching prompt\'s model on the batch, query and new-tag calls', async () => {
        loadCatalog(true);

        const modelIDs = await exerciseAllThreeEmbeddingPaths(engine);

        expect(h.embedCalls.map(c => c.Description ?? '')).toEqual([
            expect.stringContaining('Tag semantic embeddings'),
            expect.stringContaining('Tag resolution query'),
            expect.stringContaining('Tag embedding for new tag'),
        ]);
        expect(modelIDs).toEqual([PROMPT_MODEL_ID, PROMPT_MODEL_ID, PROMPT_MODEL_ID]);
        expect(h.embedCalls.every(c => c.PromptID === TAG_PROMPT_ID)).toBe(true);
    });

    it('persists the prompt model\'s ID as EmbeddingModelID', async () => {
        loadCatalog(true);

        await engine.Config(true, user);

        expect(h.state.persisted).toEqual([['tag-1', PROMPT_MODEL_ID], ['tag-2', PROMPT_MODEL_ID]]);
    });

    it('falls back to the smallest embedding model, and pins and persists that one everywhere', async () => {
        loadCatalog(false);

        const modelIDs = await exerciseAllThreeEmbeddingPaths(engine);

        expect(modelIDs).toEqual([SMALLEST_MODEL_ID, SMALLEST_MODEL_ID, SMALLEST_MODEL_ID]);
        expect(h.state.persisted.map(([, modelID]) => modelID)).toEqual([SMALLEST_MODEL_ID, SMALLEST_MODEL_ID]);
    });

    it('RebuildTagEmbeddings moves every later call to a newly configured model, and drops vectors it could not refresh', async () => {
        loadCatalog(true);
        await engine.Config(true, user);
        h.state.promptModels = [{ PromptID: TAG_PROMPT_ID, ModelID: SMALLEST_MODEL_ID, Priority: 10, Status: 'Active', ConfigurationID: null }];
        h.embedCalls.length = 0;
        // tag-2 comes back without a vector, so it keeps only its old-model vector.
        h.runEmbedding.mockImplementationOnce(async (params: EmbeddingRunParams) => {
            h.embedCalls.push(params);
            return { Success: true, Vectors: [[0.1, 0.2, 0.3], []], PromptRunID: null, TokensUsed: 0, Cost: 0, ErrorMessage: null, ExecutionTimeMs: 0 };
        });

        const outcome = await engine.RebuildTagEmbeddings(user);

        expect(outcome.refreshed).toBe(1);
        expect(h.embedCalls[0].ModelID).toBe(SMALLEST_MODEL_ID);
        expect(h.removeVector).toHaveBeenCalledWith('tag-2');
        expect(h.removeVector).not.toHaveBeenCalledWith('tag-1');

        h.findNearest.mockReturnValue([]);
        await engine.ResolveTag('ML algorithms', 0.8, 'constrained', null, 0.9, user);
        expect(h.embedCalls[h.embedCalls.length - 1].ModelID).toBe(SMALLEST_MODEL_ID);
    });

    it('hydrates a tag persisted under the resolved model, and re-embeds one persisted under another', async () => {
        loadCatalog(true);
        h.state.tags = [
            makeTag('tag-1', 'Machine Learning', { vector: [0.5, 0.5, 0.5], modelID: PROMPT_MODEL_ID }),
            makeTag('tag-2', 'Deep Learning', { vector: [0.5, 0.5, 0.5], modelID: SMALLEST_MODEL_ID }),
        ];

        await engine.Config(true, user);

        expect(h.embedCalls).toHaveLength(1);
        expect(h.embedCalls[0].Texts).toEqual(['Deep Learning']);
        expect(h.embedCalls[0].ModelID).toBe(PROMPT_MODEL_ID);
        expect(h.state.persisted).toEqual([['tag-2', PROMPT_MODEL_ID]]);
    });
});
