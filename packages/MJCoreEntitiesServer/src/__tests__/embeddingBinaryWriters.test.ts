/**
 * Unit tests for the server-side writers of persisted embeddings.
 *
 * Every persisted embedding has a JSON column (`EmbeddingVector`, ...) and a binary companion
 * column (`EmbeddingVectorBinary`, ...) holding little-endian float32 bytes, base64 in JS.
 * These tests pin that each writer fills BOTH columns with the same vector, and clears BOTH
 * together, so a reader that prefers the binary column never sees a stale value.
 *
 * The generated entity base classes are replaced with a light stub (as in
 * saveHooks.optionsForwarding.test.ts) so the server subclasses run without a database.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Base64ToFloat32Vector } from '@memberjunction/global';
import type { SimpleEmbeddingResult } from '@memberjunction/core';

const { logError, stubState, superSave, generateEmbeddingByFieldName, generateEmbeddingsByFieldName, embedTextLocalForEntity, aiEngineStub, tagEngineStub } =
    vi.hoisted(() => ({
        logError: vi.fn(),
        /** Drives the stub's IsSaved / GetFieldByName(...).Dirty answers. */
        stubState: { isSaved: false, dirty: new Set<string>() },
        superSave: vi.fn(),
        generateEmbeddingByFieldName: vi.fn(),
        generateEmbeddingsByFieldName: vi.fn(),
        embedTextLocalForEntity: vi.fn(),
        aiEngineStub: {
            EnsureLoaded: vi.fn(),
            AddOrUpdateSingleNoteEmbedding: vi.fn(),
            RemoveSingleNoteEmbedding: vi.fn(),
            AddOrUpdateSingleExampleEmbedding: vi.fn(),
            RemoveSingleExampleEmbedding: vi.fn(),
        },
        tagEngineStub: {
            AddOrUpdateSingleTagEmbeddingFromPersisted: vi.fn(),
            RemoveTagFromVectorService: vi.fn(),
        },
    }));

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return { ...actual, RegisterClass: () => (target: unknown) => target };
});

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return { ...actual, LogError: logError };
});

vi.mock('@memberjunction/core-entities', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();

    /** Stands in for every generated entity class: plain fields, a controllable dirty state, spied hooks. */
    class StubEntity {
        public ID = 'rec-1';
        /** BaseEntity's deferral flag (`mj sync push` sets it). */
        public SkipEmbeddings = false;
        public get IsSaved(): boolean { return stubState.isSaved; }
        public GetFieldByName(name: string): { Dirty: boolean } {
            return { Dirty: stubState.dirty.has(name) };
        }
        public async GenerateEmbeddingByFieldName(...args: unknown[]): Promise<boolean> {
            return generateEmbeddingByFieldName(...args);
        }
        public async GenerateEmbeddingsByFieldName(...args: unknown[]): Promise<boolean> {
            return generateEmbeddingsByFieldName(...args);
        }
        public async Save(...args: unknown[]): Promise<boolean> {
            return superSave(...args);
        }
    }

    return {
        ...actual,
        MJAIAgentNoteEntity: class extends StubEntity {},
        MJAIAgentExampleEntity: class extends StubEntity {},
        MJComponentEntityExtended: class extends StubEntity {},
        MJQueryEntityExtended: class extends StubEntity {},
        MJTagEntity: class extends StubEntity {},
    };
});

vi.mock('@memberjunction/aiengine', () => ({ AIEngine: { Instance: aiEngineStub, EmbedTextLocalForEntity: embedTextLocalForEntity } }));
vi.mock('@memberjunction/tag-engine', () => ({ TagEngine: { Instance: tagEngineStub } }));

import { MJAIAgentNoteEntityServer } from '../custom/MJAIAgentNoteEntityServer.server';
import { MJAIAgentExampleEntityServer } from '../custom/MJAIAgentExampleEntityServer.server';
import { MJComponentEntityServer } from '../custom/MJComponentEntityServer.server';
import { MJQueryEntityServer } from '../custom/MJQueryEntityServer.server';
import { MJTagEntityServer } from '../custom/MJTagEntityServer.server';
import { SaveTimeAISettings } from '@memberjunction/ai';

/** Exposes the protected composite-embedding step so it can be driven without the extraction pipeline. */
class TestableQueryEntityServer extends MJQueryEntityServer {
    public RunGenerateCompositeEmbedding(): Promise<void> {
        return this.GenerateCompositeEmbedding();
    }
}

/**
 * The generated base classes' constructors take an EntityInfo; the stub above takes none, so build
 * instances without arguments without casting the class itself.
 */
function create<T extends object>(cls: { prototype: T }): T {
    const instance: T = Reflect.construct(cls as unknown as new () => T, []);
    return instance;
}

// Values that are exact in float32, so the binary round-trip compares equal to the JSON copy.
const VECTOR = [0.5, -0.25, 3, 1024];
const MODEL_ID = 'model-1';

function embeddingResult(vector: number[]): SimpleEmbeddingResult {
    return { vector, modelID: MODEL_ID };
}

/** Asserts the JSON and binary columns both hold `expected`. */
function expectBothColumns(json: string | null, binary: string | null, expected: number[]): void {
    expect(json).not.toBeNull();
    expect(binary).not.toBeNull();
    expect(JSON.parse(json!)).toEqual(expected);
    const decoded = Base64ToFloat32Vector(binary);
    expect(decoded).not.toBeNull();
    expect(Array.from(decoded!)).toEqual(expected);
}

beforeEach(() => {
    vi.clearAllMocks();
    stubState.isSaved = false;
    stubState.dirty = new Set<string>();
    superSave.mockResolvedValue(true);
    generateEmbeddingByFieldName.mockResolvedValue(true);
    generateEmbeddingsByFieldName.mockResolvedValue(true);
    aiEngineStub.EnsureLoaded.mockResolvedValue(undefined);
});

describe('MJAIAgentNoteEntityServer embedding columns', () => {
    it('asks BaseEntity to write the binary column alongside the JSON one', async () => {
        const note = create(MJAIAgentNoteEntityServer);
        note.Note = 'Prefers concise answers';
        note.Status = 'Active';

        expect(await note.Save()).toBe(true);

        expect(generateEmbeddingByFieldName).toHaveBeenCalledTimes(1);
        expect(generateEmbeddingByFieldName).toHaveBeenCalledWith('Note', 'EmbeddingVector', 'EmbeddingModelID', 'EmbeddingVectorBinary');
    });

    it('clears the binary column together with the JSON column when the note text is empty', async () => {
        const note = create(MJAIAgentNoteEntityServer);
        note.Note = '   ';
        note.Status = 'Active';
        note.EmbeddingVector = JSON.stringify(VECTOR);
        note.EmbeddingVectorBinary = 'c3RhbGU=';
        note.EmbeddingModelID = MODEL_ID;

        expect(await note.Save()).toBe(true);

        expect(generateEmbeddingByFieldName).not.toHaveBeenCalled();
        expect(note.EmbeddingVector).toBeNull();
        expect(note.EmbeddingVectorBinary).toBeNull();
        expect(note.EmbeddingModelID).toBeNull();
        // no vector left, so the in-memory index must drop the note
        expect(aiEngineStub.RemoveSingleNoteEmbedding).toHaveBeenCalledWith('rec-1');
    });
});

describe('MJAIAgentExampleEntityServer embedding columns', () => {
    it('asks BaseEntity to write the binary column alongside the JSON one', async () => {
        const example = create(MJAIAgentExampleEntityServer);
        example.ExampleInput = 'How do I reset my password?';
        example.Status = 'Active';

        expect(await example.Save()).toBe(true);

        expect(generateEmbeddingByFieldName).toHaveBeenCalledTimes(1);
        expect(generateEmbeddingByFieldName).toHaveBeenCalledWith('ExampleInput', 'EmbeddingVector', 'EmbeddingModelID', 'EmbeddingVectorBinary');
    });

    it('clears the binary column together with the JSON column when the input is empty', async () => {
        const example = create(MJAIAgentExampleEntityServer);
        example.ExampleInput = '';
        example.Status = 'Active';
        example.EmbeddingVector = JSON.stringify(VECTOR);
        example.EmbeddingVectorBinary = 'c3RhbGU=';
        example.EmbeddingModelID = MODEL_ID;

        expect(await example.Save()).toBe(true);

        expect(generateEmbeddingByFieldName).not.toHaveBeenCalled();
        expect(example.EmbeddingVector).toBeNull();
        expect(example.EmbeddingVectorBinary).toBeNull();
        expect(example.EmbeddingModelID).toBeNull();
    });
});

describe('MJComponentEntityServer embedding columns', () => {
    it('passes a binary vector field for both the functional-requirements and technical-design vectors', async () => {
        const component = create(MJComponentEntityServer);
        expect(await component.Save()).toBe(true);

        expect(generateEmbeddingsByFieldName).toHaveBeenCalledTimes(1);
        const [fields] = generateEmbeddingsByFieldName.mock.calls[0] as [Array<Record<string, string>>];
        expect(fields).toEqual([
            {
                fieldName: 'FunctionalRequirements',
                vectorFieldName: 'FunctionalRequirementsVector',
                modelFieldName: 'FunctionalRequirementsVectorEmbeddingModelID',
                binaryVectorFieldName: 'FunctionalRequirementsVectorBinary',
            },
            {
                fieldName: 'TechnicalDesign',
                vectorFieldName: 'TechnicalDesignVector',
                modelFieldName: 'TechnicalDesignVectorEmbeddingModelID',
                binaryVectorFieldName: 'TechnicalDesignVectorBinary',
            },
        ]);
    });
});

describe('MJQueryEntityServer embedding columns', () => {
    it('GenerateCompositeEmbedding writes JSON and binary columns that decode to the same vector', async () => {
        embedTextLocalForEntity.mockResolvedValue(embeddingResult(VECTOR));
        const query = create(TestableQueryEntityServer);
        query.Name = 'Active Members';
        query.UserQuestion = 'Who is active?';
        query.Description = 'Members with an active status';

        await query.RunGenerateCompositeEmbedding();

        expect(embedTextLocalForEntity).toHaveBeenCalledWith(query, 'Active Members | Who is active? | Members with an active status');
        expectBothColumns(query.EmbeddingVector, query.EmbeddingVectorBinary, VECTOR);
        expect(query.EmbeddingModelID).toBe(MODEL_ID);
    });

    it('GenerateCompositeEmbedding clears both columns when there is no text to embed', async () => {
        const query = create(TestableQueryEntityServer);
        query.Name = '';
        query.UserQuestion = null;
        query.Description = '  ';
        query.EmbeddingVector = JSON.stringify(VECTOR);
        query.EmbeddingVectorBinary = 'c3RhbGU=';
        query.EmbeddingModelID = MODEL_ID;

        await query.RunGenerateCompositeEmbedding();

        expect(embedTextLocalForEntity).not.toHaveBeenCalled();
        expect(query.EmbeddingVector).toBeNull();
        expect(query.EmbeddingVectorBinary).toBeNull();
        expect(query.EmbeddingModelID).toBeNull();
    });

    /** A query whose stored vector predates the change being saved. */
    function staleQuery(): TestableQueryEntityServer {
        const query = create(TestableQueryEntityServer);
        query.Name = 'Active Members';
        query.UserQuestion = null;
        query.Description = 'Members with an active status';
        query.EmbeddingVector = JSON.stringify(VECTOR);
        query.EmbeddingVectorBinary = 'c3RhbGU=';
        query.EmbeddingModelID = MODEL_ID;
        return query;
    }

    it('GenerateCompositeEmbedding clears a stale vector when the embedding comes back empty', async () => {
        embedTextLocalForEntity.mockResolvedValue(embeddingResult([]));
        const query = staleQuery();

        await query.RunGenerateCompositeEmbedding();

        expect(query.EmbeddingVector).toBeNull();
        expect(query.EmbeddingVectorBinary).toBeNull();
        expect(query.EmbeddingModelID).toBeNull();
        expect(logError).not.toHaveBeenCalled();
    });

    it('GenerateCompositeEmbedding clears a stale vector and logs when the embedder throws', async () => {
        embedTextLocalForEntity.mockRejectedValue(new Error('no model'));
        const query = staleQuery();

        await query.RunGenerateCompositeEmbedding();

        expect(query.EmbeddingVector).toBeNull();
        expect(query.EmbeddingVectorBinary).toBeNull();
        expect(query.EmbeddingModelID).toBeNull();
        expect(logError).toHaveBeenCalledWith('[MJQueryEntityServer] Embedding refresh failed for query "Active Members": no model');
    });

    it('Save keeps the vector of a query with no Description when none of its embedded text changed', async () => {
        // The vector is computed from Name | UserQuestion | Description, so a query without a Description has a
        // real vector; a save that changes none of that text (here: nothing dirty) must not erase it.
        stubState.isSaved = true; // no dirty fields: no embedding, no SQL extraction
        const query = create(MJQueryEntityServer);
        query.Name = 'Active Members';
        query.Description = '';
        query.SQL = 'SELECT 1';
        query.EmbeddingVector = JSON.stringify(VECTOR);
        query.EmbeddingVectorBinary = 'c3RhbGU=';
        query.EmbeddingModelID = MODEL_ID;

        expect(await query.Save()).toBe(true);

        expect(embedTextLocalForEntity).not.toHaveBeenCalled();
        expect(query.EmbeddingVector).toBe(JSON.stringify(VECTOR));
        expect(query.EmbeddingVectorBinary).toBe('c3RhbGU=');
        expect(query.EmbeddingModelID).toBe(MODEL_ID);
    });

    it('Save with SkipEmbeddings and changed text clears the stale vector without embedding (deferred to QueryEngineServer)', async () => {
        const query = create(MJQueryEntityServer);
        query.SkipEmbeddings = true;
        query.Name = 'Active Members';
        query.Description = 'Members with an active status';
        query.SQL = '';
        query.EmbeddingVector = JSON.stringify(VECTOR);
        query.EmbeddingVectorBinary = 'c3RhbGU=';
        query.EmbeddingModelID = MODEL_ID;

        expect(await query.Save()).toBe(true);

        expect(embedTextLocalForEntity).not.toHaveBeenCalled();
        expect(query.EmbeddingVector).toBeNull();
        expect(query.EmbeddingVectorBinary).toBeNull();
        expect(query.EmbeddingModelID).toBeNull();
    });
});

describe('MJTagEntityServer embedding columns', () => {
    function newTag(name: string, description: string | null): MJTagEntityServer {
        const tag = create(MJTagEntityServer);
        tag.Name = name;
        tag.Description = description;
        tag.Status = 'Active';
        return tag;
    }

    it('writes JSON and binary columns that decode to the same vector', async () => {
        embedTextLocalForEntity.mockResolvedValue(embeddingResult(VECTOR));
        const tag = newTag('Finance', 'Money matters');

        expect(await tag.Save()).toBe(true);

        expect(embedTextLocalForEntity).toHaveBeenCalledWith(tag, 'Finance: Money matters');
        expectBothColumns(tag.EmbeddingVector, tag.EmbeddingVectorBinary, VECTOR);
        expect(tag.EmbeddingModelID).toBe(MODEL_ID);
        expect(tagEngineStub.AddOrUpdateSingleTagEmbeddingFromPersisted).toHaveBeenCalledWith(tag);
    });

    it('clears both columns when the name is empty', async () => {
        const tag = newTag('  ', 'whatever');
        tag.EmbeddingVector = JSON.stringify(VECTOR);
        tag.EmbeddingVectorBinary = 'c3RhbGU=';
        tag.EmbeddingModelID = MODEL_ID;

        expect(await tag.Save()).toBe(true);

        expect(embedTextLocalForEntity).not.toHaveBeenCalled();
        expect(tag.EmbeddingVector).toBeNull();
        expect(tag.EmbeddingVectorBinary).toBeNull();
        expect(tag.EmbeddingModelID).toBeNull();
        expect(tagEngineStub.RemoveTagFromVectorService).toHaveBeenCalledWith('rec-1');
    });

    it('clears both columns when the embedding comes back empty', async () => {
        embedTextLocalForEntity.mockResolvedValue(embeddingResult([]));
        const tag = newTag('Finance', null);
        tag.EmbeddingVector = JSON.stringify(VECTOR);
        tag.EmbeddingVectorBinary = 'c3RhbGU=';

        expect(await tag.Save()).toBe(true);

        expect(tag.EmbeddingVector).toBeNull();
        expect(tag.EmbeddingVectorBinary).toBeNull();
    });

    it('clears both columns when embedding throws, without failing the save', async () => {
        embedTextLocalForEntity.mockRejectedValue(new Error('no model'));
        const tag = newTag('Finance', null);
        tag.EmbeddingVector = JSON.stringify(VECTOR);
        tag.EmbeddingVectorBinary = 'c3RhbGU=';

        expect(await tag.Save()).toBe(true);

        expect(tag.EmbeddingVector).toBeNull();
        expect(tag.EmbeddingVectorBinary).toBeNull();
        expect(tag.EmbeddingModelID).toBeNull();
    });

    it('with SkipEmbeddings and a changed name: clears the stale vector without embedding (deferred to TagEngine)', async () => {
        const tag = newTag('Finance', 'Money matters');
        tag.SkipEmbeddings = true;
        tag.EmbeddingVector = JSON.stringify(VECTOR);
        tag.EmbeddingVectorBinary = 'c3RhbGU=';
        tag.EmbeddingModelID = MODEL_ID;

        expect(await tag.Save()).toBe(true);

        expect(embedTextLocalForEntity).not.toHaveBeenCalled();
        expect(tag.EmbeddingVector).toBeNull();
        expect(tag.EmbeddingVectorBinary).toBeNull();
        expect(tag.EmbeddingModelID).toBeNull();
        expect(tagEngineStub.RemoveTagFromVectorService).toHaveBeenCalledWith('rec-1');
    });

    it('leaves both columns untouched when neither Name nor Description is dirty', async () => {
        stubState.isSaved = true;
        const tag = newTag('Finance', null);
        tag.EmbeddingVector = JSON.stringify(VECTOR);
        tag.EmbeddingVectorBinary = 'AAAAPw==';

        expect(await tag.Save()).toBe(true);

        expect(embedTextLocalForEntity).not.toHaveBeenCalled();
        expect(tag.EmbeddingVector).toBe(JSON.stringify(VECTOR));
        expect(tag.EmbeddingVectorBinary).toBe('AAAAPw==');
    });
});

describe('host switch saveTimeAI.Embeddings = false', () => {
    const STORED = JSON.stringify(VECTOR);

    beforeEach(() => {
        SaveTimeAISettings.Instance.Config = { Embeddings: false };
        embedTextLocalForEntity.mockResolvedValue(embeddingResult([1, 2]));
    });

    afterEach(() => {
        SaveTimeAISettings.Instance.Config = {};
    });

    it('AI Agent Note: computes nothing and keeps the stored vector', async () => {
        const note = create(MJAIAgentNoteEntityServer);
        note.Note = 'Prefers concise answers';
        note.Status = 'Active';
        note.EmbeddingVector = STORED;

        expect(await note.Save()).toBe(true);

        expect(generateEmbeddingByFieldName).not.toHaveBeenCalled();
        expect(note.EmbeddingVector).toBe(STORED);
    });

    it('AI Agent Example: computes nothing and keeps the stored vector', async () => {
        const example = create(MJAIAgentExampleEntityServer);
        example.ExampleInput = 'How do I reset my password?';
        example.Status = 'Active';
        example.EmbeddingVector = STORED;

        expect(await example.Save()).toBe(true);

        expect(generateEmbeddingByFieldName).not.toHaveBeenCalled();
        expect(example.EmbeddingVector).toBe(STORED);
    });

    it('Component: computes nothing', async () => {
        const component = create(MJComponentEntityServer);
        expect(await component.Save()).toBe(true);
        expect(generateEmbeddingsByFieldName).not.toHaveBeenCalled();
    });

    it('Query with an EMPTY Description: a save keeps the stored vector (the switch never clears)', async () => {
        stubState.isSaved = true;
        stubState.dirty = new Set(['Description']);
        const query = create(MJQueryEntityServer);
        query.Name = 'Active Members';
        query.Description = '';
        query.SQL = 'SELECT 1';
        query.EmbeddingVector = STORED;
        query.EmbeddingVectorBinary = 'c3RhbGU=';

        expect(await query.Save()).toBe(true);

        expect(embedTextLocalForEntity).not.toHaveBeenCalled();
        expect(query.EmbeddingVector).toBe(STORED);
        expect(query.EmbeddingVectorBinary).toBe('c3RhbGU=');
    });

    it('AI Agent Note with EMPTY text: the switch leaves the stored vector as it is', async () => {
        const note = create(MJAIAgentNoteEntityServer);
        note.Note = '';
        note.Status = 'Active';
        note.EmbeddingVector = STORED;

        expect(await note.Save()).toBe(true);

        expect(note.EmbeddingVector).toBe(STORED);
    });

    it('AI Agent Example with EMPTY input: the switch leaves the stored vector as it is', async () => {
        const example = create(MJAIAgentExampleEntityServer);
        example.ExampleInput = '';
        example.Status = 'Active';
        example.EmbeddingVector = STORED;

        expect(await example.Save()).toBe(true);

        expect(example.EmbeddingVector).toBe(STORED);
    });

    it('Query: Save computes nothing for a new query and keeps the stored vector', async () => {
        const query = create(MJQueryEntityServer);
        query.Name = 'Active Members';
        query.Description = 'Members with an active status';
        query.SQL = '';
        query.EmbeddingVector = STORED;

        expect(await query.Save()).toBe(true);

        expect(embedTextLocalForEntity).not.toHaveBeenCalled();
        expect(query.EmbeddingVector).toBe(STORED);
    });

    it('Tag: computes nothing for a new tag and keeps the stored vector', async () => {
        const tag = create(MJTagEntityServer);
        tag.Name = 'Finance';
        tag.Description = 'Money matters';
        tag.Status = 'Active';
        tag.EmbeddingVector = STORED;

        expect(await tag.Save()).toBe(true);

        expect(embedTextLocalForEntity).not.toHaveBeenCalled();
        expect(tag.EmbeddingVector).toBe(STORED);
    });

    it('another kind switched off still embeds', async () => {
        SaveTimeAISettings.Instance.Config = { QueryParameters: false, CodeGeneration: false };
        const tag = create(MJTagEntityServer);
        tag.Name = 'Finance';
        tag.Description = null;
        tag.Status = 'Active';

        expect(await tag.Save()).toBe(true);

        expect(embedTextLocalForEntity).toHaveBeenCalledTimes(1);
    });
});

describe('SkipEmbeddings (set by mj sync push): changed text clears the stale vector instead of embedding', () => {
    const STALE = JSON.stringify(VECTOR);

    it('AI Agent Note: clears all three columns and never embeds', async () => {
        const note = create(MJAIAgentNoteEntityServer);
        note.SkipEmbeddings = true;
        note.Note = 'A pushed note';
        note.Status = 'Active';
        note.EmbeddingVector = STALE;
        note.EmbeddingVectorBinary = 'c3RhbGU=';
        note.EmbeddingModelID = MODEL_ID;

        expect(await note.Save()).toBe(true);

        expect(generateEmbeddingByFieldName).not.toHaveBeenCalled();
        expect(note.EmbeddingVector).toBeNull();
        expect(note.EmbeddingVectorBinary).toBeNull();
        expect(note.EmbeddingModelID).toBeNull();
    });

    it('AI Agent Example: clears all three columns and never embeds', async () => {
        const example = create(MJAIAgentExampleEntityServer);
        example.SkipEmbeddings = true;
        example.ExampleInput = 'A pushed example';
        example.Status = 'Active';
        example.EmbeddingVector = STALE;
        example.EmbeddingVectorBinary = 'c3RhbGU=';
        example.EmbeddingModelID = MODEL_ID;

        expect(await example.Save()).toBe(true);

        expect(generateEmbeddingByFieldName).not.toHaveBeenCalled();
        expect(example.EmbeddingVector).toBeNull();
        expect(example.EmbeddingVectorBinary).toBeNull();
        expect(example.EmbeddingModelID).toBeNull();
    });

    it('Component: clears only the vector whose source text changed, and never embeds', async () => {
        stubState.isSaved = true;
        stubState.dirty = new Set(['FunctionalRequirements']);
        const component = create(MJComponentEntityServer);
        component.SkipEmbeddings = true;
        component.FunctionalRequirementsVector = STALE;
        component.FunctionalRequirementsVectorBinary = 'c3RhbGU=';
        component.FunctionalRequirementsVectorEmbeddingModelID = MODEL_ID;
        component.TechnicalDesignVector = STALE;

        expect(await component.Save()).toBe(true);

        expect(generateEmbeddingsByFieldName).not.toHaveBeenCalled();
        expect(component.FunctionalRequirementsVector).toBeNull();
        expect(component.FunctionalRequirementsVectorBinary).toBeNull();
        expect(component.FunctionalRequirementsVectorEmbeddingModelID).toBeNull();
        expect(component.TechnicalDesignVector).toBe(STALE); // its text did not change
    });
});
