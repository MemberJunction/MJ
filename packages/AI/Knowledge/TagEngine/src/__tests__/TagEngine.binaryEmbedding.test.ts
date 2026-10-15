/**
 * Persisted tag embeddings have two columns: EmbeddingVector (JSON) and EmbeddingVectorBinary
 * (base64 of little-endian float32 bytes). The binary column is read first and wins when valid;
 * JSON is the fallback. Fresh embeddings are written to both.
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
    EmbeddingVectorBinary: string | null;
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
        /** What each tag was saved with. */
        saved: [] as Array<{ ID: string; EmbeddingVector: string | null; EmbeddingVectorBinary: string | null; EmbeddingModelID: string | null }>,
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
    const loadVectors = vi.fn();
    const addVector = vi.fn();
    const logError = vi.fn();
    return { state, embedCalls, runEmbedding, findNearest, removeVector, loadVectors, addVector, logError };
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
    LogError: h.logError,
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
        LoadVectors = h.loadVectors;
        AddVector = h.addVector;
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

import { Base64ToFloat32Vector } from '@memberjunction/global';
import { TagEngine } from '../TagEngine';

const PROMPT_MODEL_ID = 'model-prompt';
const OTHER_MODEL_ID = 'model-other';
const TAG_PROMPT_ID = 'prompt-tag-semantic';

/** Base64 of the little-endian float32 bytes — written independently of the code under test. */
function toBinary(values: number[]): string {
    return Buffer.from(new Float32Array(values).buffer).toString('base64');
}

interface PersistedColumns {
    json?: number[] | string | null;
    binary?: string | null;
    modelID?: string | null;
}

function makeTag(id: string, name: string, cols: PersistedColumns = {}): FakeTag {
    const json = cols.json;
    const tag: FakeTag = {
        ID: id,
        Name: name,
        DisplayName: name,
        Description: null,
        ParentID: null,
        Status: 'Active',
        EmbeddingVector: json == null ? null : typeof json === 'string' ? json : JSON.stringify(json),
        EmbeddingVectorBinary: cols.binary ?? null,
        EmbeddingModelID: cols.modelID ?? null,
        Save: async () => {
            h.state.saved.push({
                ID: tag.ID,
                EmbeddingVector: tag.EmbeddingVector,
                EmbeddingVectorBinary: tag.EmbeddingVectorBinary,
                EmbeddingModelID: tag.EmbeddingModelID,
            });
            return true;
        },
    };
    return tag;
}

function embeddingModel(id: string): FakeModel {
    return { ID: id, Name: id, AIModelType: 'Embeddings', IsActive: true, InputTokenLimit: 512, DriverClass: 'LocalEmbedding', APIName: `Xenova/${id}` };
}

function loadCatalog(): void {
    h.state.models = [embeddingModel(PROMPT_MODEL_ID), embeddingModel(OTHER_MODEL_ID)];
    h.state.modelVendors = h.state.models.map(m => ({ ModelID: m.ID, Status: 'Active', DriverClass: m.DriverClass, APIName: m.APIName, Priority: 1 }));
    h.state.prompts = [{ ID: TAG_PROMPT_ID, Name: 'Tag Semantic Matching', Status: 'Active' }];
    h.state.promptModels = [{ PromptID: TAG_PROMPT_ID, ModelID: PROMPT_MODEL_ID, Priority: 10, Status: 'Active', ConfigurationID: null }];
}

/** Every vector handed to LoadVectors, keyed by tag ID. */
function hydratedVectors(): Map<string, number[]> {
    const out = new Map<string, number[]>();
    for (const call of h.loadVectors.mock.calls) {
        const entries = call[0] as Array<{ key: string; vector: ArrayLike<number> }>;
        for (const e of entries) out.set(e.key, Array.from(e.vector));
    }
    return out;
}

const user = new UserInfo();

describe('TagEngine reads and writes the binary embedding column', () => {
    let engine: TagEngine;

    beforeEach(() => {
        h.embedCalls.length = 0;
        h.runEmbedding.mockClear();
        h.findNearest.mockReset();
        h.removeVector.mockClear();
        h.loadVectors.mockClear();
        h.addVector.mockClear();
        h.logError.mockClear();
        h.state.saved = [];
        loadCatalog();
        engine = new TagEngine();
    });

    describe('hydration on Config', () => {
        it('hydrates a tag that has only the binary column', async () => {
            h.state.tags = [makeTag('tag-1', 'Machine Learning', { binary: toBinary([0.5, -1.5, 0.25]), modelID: PROMPT_MODEL_ID })];

            await engine.Config(true, user);

            expect(h.embedCalls).toHaveLength(0);
            expect(hydratedVectors().get('tag-1')).toEqual([0.5, -1.5, 0.25]);
            expect(h.state.saved).toHaveLength(0);
        });

        it('prefers the binary column over a disagreeing JSON column', async () => {
            h.state.tags = [makeTag('tag-1', 'Machine Learning', { json: [9, 9, 9], binary: toBinary([0.5, -1.5, 0.25]), modelID: PROMPT_MODEL_ID })];

            await engine.Config(true, user);

            expect(hydratedVectors().get('tag-1')).toEqual([0.5, -1.5, 0.25]);
        });

        it('falls back to JSON when the binary column is unreadable', async () => {
            h.state.tags = [makeTag('tag-1', 'Machine Learning', { json: [0.5, 0.5], binary: Buffer.from([1, 2, 3]).toString('base64'), modelID: PROMPT_MODEL_ID })];

            await engine.Config(true, user);

            expect(h.embedCalls).toHaveLength(0);
            expect(hydratedVectors().get('tag-1')).toEqual([0.5, 0.5]);
        });

        it('does not hydrate a binary vector persisted under a different model', async () => {
            h.state.tags = [makeTag('tag-1', 'Machine Learning', { binary: toBinary([0.5, 0.5]), modelID: OTHER_MODEL_ID })];

            await engine.Config(true, user);

            expect(hydratedVectors().has('tag-1')).toBe(false);
            expect(h.embedCalls).toHaveLength(1);
            expect(h.embedCalls[0].Texts).toEqual(['Machine Learning']);
        });
    });

    describe('persisting fresh embeddings', () => {
        it('writes JSON and binary columns that decode to the same vector, plus the model ID', async () => {
            h.state.tags = [makeTag('tag-1', 'Machine Learning')];

            await engine.Config(true, user);

            expect(h.state.saved).toHaveLength(1);
            const saved = h.state.saved[0];
            expect(saved.EmbeddingModelID).toBe(PROMPT_MODEL_ID);
            expect(saved.EmbeddingVector).not.toBeNull();
            expect(saved.EmbeddingVectorBinary).not.toBeNull();

            const fromJSON = JSON.parse(saved.EmbeddingVector ?? '[]') as number[];
            expect(fromJSON).toEqual([0.1, 0.2, 0.3]);

            const viaHelper = Base64ToFloat32Vector(saved.EmbeddingVectorBinary);
            expect(viaHelper).not.toBeNull();
            const viaBuffer = Buffer.from(saved.EmbeddingVectorBinary ?? '', 'base64');
            expect(viaBuffer.length).toBe(fromJSON.length * 4);
            const fromBytes = Array.from({ length: fromJSON.length }, (_, i) => viaBuffer.readFloatLE(i * 4));

            for (const decoded of [Array.from(viaHelper ?? []), fromBytes]) {
                expect(decoded).toHaveLength(fromJSON.length);
                decoded.forEach((v, i) => expect(v).toBeCloseTo(fromJSON[i], 6));
            }
        });
    });

    describe('RebuildTagEmbeddings', () => {
        it('treats a tag whose columns are both unreadable as stale, and a binary-only tag as current', async () => {
            h.state.tags = [
                makeTag('tag-ok', 'Machine Learning', { binary: toBinary([0.5, 0.5]), modelID: PROMPT_MODEL_ID }),
                makeTag('tag-bad', 'Deep Learning', { json: 'not json', binary: Buffer.from([1, 2, 3]).toString('base64'), modelID: PROMPT_MODEL_ID }),
            ];
            await engine.Config(true, user);
            // Config already re-embedded and persisted tag-bad; corrupt it again (e.g. a later bad write).
            const bad = h.state.tags[1];
            bad.EmbeddingVector = 'not json';
            bad.EmbeddingVectorBinary = Buffer.from([1, 2, 3]).toString('base64');
            h.embedCalls.length = 0;
            h.state.saved = [];

            const outcome = await engine.RebuildTagEmbeddings(user);

            expect(outcome.refreshed).toBe(1);
            expect(h.embedCalls).toHaveLength(1);
            expect(h.embedCalls[0].Texts).toEqual(['Deep Learning']);
            expect(h.state.saved.map(s => s.ID)).toEqual(['tag-bad']);
            expect(h.state.saved[0].EmbeddingVectorBinary).not.toBeNull();
        });
    });

    describe('AddOrUpdateSingleTagEmbeddingFromPersisted', () => {
        /** Initialize the vector service with a seed tag, then append `tag` so GetTagByID returns it typed. */
        async function primeWith(tag: FakeTag) {
            h.state.tags = [makeTag('seed', 'Seed', { binary: toBinary([1, 0]), modelID: PROMPT_MODEL_ID })];
            await engine.Config(true, user);
            h.state.tags.push(tag);
            h.addVector.mockClear();
            h.removeVector.mockClear();
            h.logError.mockClear();
            const typed = engine.GetTagByID(tag.ID);
            expect(typed).toBeDefined();
            return typed;
        }

        it('adds the vector from a binary-only tag', async () => {
            const tag = await primeWith(makeTag('tag-1', 'Machine Learning', { binary: toBinary([0.5, -0.25]), modelID: PROMPT_MODEL_ID }));
            if (!tag) return;

            engine.AddOrUpdateSingleTagEmbeddingFromPersisted(tag);

            expect(h.addVector).toHaveBeenCalledTimes(1);
            const [key, vector] = h.addVector.mock.calls[0] as [string, ArrayLike<number>];
            expect(key).toBe('tag-1');
            expect(Array.from(vector)).toEqual([0.5, -0.25]);
            expect(h.removeVector).not.toHaveBeenCalled();
            expect(h.logError).not.toHaveBeenCalled();
        });

        it('prefers binary over a disagreeing JSON column', async () => {
            const tag = await primeWith(makeTag('tag-1', 'Machine Learning', { json: [9, 9], binary: toBinary([0.5, -0.25]), modelID: PROMPT_MODEL_ID }));
            if (!tag) return;

            engine.AddOrUpdateSingleTagEmbeddingFromPersisted(tag);

            const [, vector] = h.addVector.mock.calls[0] as [string, ArrayLike<number>];
            expect(Array.from(vector)).toEqual([0.5, -0.25]);
        });

        it('removes the vector and logs when a column has content but nothing is readable', async () => {
            const tag = await primeWith(makeTag('tag-1', 'Machine Learning', { json: 'not json', binary: Buffer.from([1, 2, 3]).toString('base64') }));
            if (!tag) return;

            engine.AddOrUpdateSingleTagEmbeddingFromPersisted(tag);

            expect(h.removeVector).toHaveBeenCalledWith('tag-1');
            expect(h.addVector).not.toHaveBeenCalled();
            expect(h.logError).toHaveBeenCalledTimes(1);
            expect(String(h.logError.mock.calls[0][0])).toContain('malformed vector');
        });

        it('logs when only the binary column has (non-finite) content', async () => {
            const tag = await primeWith(makeTag('tag-1', 'Machine Learning', { binary: toBinary([Number.NaN, 1]) }));
            if (!tag) return;

            engine.AddOrUpdateSingleTagEmbeddingFromPersisted(tag);

            expect(h.removeVector).toHaveBeenCalledWith('tag-1');
            expect(h.logError).toHaveBeenCalledTimes(1);
        });

        it('removes the vector silently when both columns are empty', async () => {
            const tag = await primeWith(makeTag('tag-1', 'Machine Learning'));
            if (!tag) return;

            engine.AddOrUpdateSingleTagEmbeddingFromPersisted(tag);

            expect(h.removeVector).toHaveBeenCalledWith('tag-1');
            expect(h.addVector).not.toHaveBeenCalled();
            expect(h.logError).not.toHaveBeenCalled();
        });
    });
});
