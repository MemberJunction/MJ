import { describe, it, expect, vi } from 'vitest';
import type { IMetadataProvider } from '@memberjunction/core';

/**
 * `VectorizeEntity` must address the vector index on the provider by the name the
 * KnowledgeHubMetadataEngine resolves for it (`GetProviderIndexName` — the ExternalID), not by the
 * MJ display `Name`. They differ whenever the label is human-friendly — e.g. Name
 * "More Cheese Content (Pinecone)" vs ExternalID "morecheese-content" — and passing the Name
 * made every Pinecone upsert 404 (`/indexes/More%20Cheese%20Content%20(Pinecone)`), so a run
 * reported N records vectorized and N upsert errors while writing nothing.
 */

const IDS = vi.hoisted(() => ({
    entity: '11111111-1111-1111-1111-111111111111',
    template: '22222222-2222-2222-2222-222222222222',
    doc: '33333333-3333-3333-3333-333333333333',
}));

const kh = vi.hoisted(() => ({ GetProviderIndexName: vi.fn<(index: { Name: string }) => string>() }));

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    return {
        ...actual,
        RegisterClass: () => (_target: unknown) => {},
        RequiresSubclass: () => (_target: unknown) => {},
        OptionalKeyedSpecialization: () => (_target: unknown) => {},
        MJGlobal: { Instance: { ClassFactory: { GetRegistration: vi.fn() } } },
    };
});

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    return { ...actual, LogError: vi.fn(), LogStatus: vi.fn(), LogStatusEx: vi.fn() };
});

vi.mock('@memberjunction/core-entities', () => ({
    KnowledgeHubMetadataEngine: { Instance: { GetProviderIndexName: kh.GetProviderIndexName } },
}));
vi.mock('@memberjunction/ai', () => ({}));
vi.mock('@memberjunction/ai-prompts', () => ({ AIEmbeddingRunner: class {} }));
vi.mock('@memberjunction/ai-vectordb', () => ({
    VectorDBBase: class {},
}));
vi.mock('@memberjunction/ai-vectors', () => ({
    VectorBase: class {
        CurrentUser: unknown;
        Provider: unknown;
        constructor(provider?: unknown) { this.Provider = provider; }
    },
}));
vi.mock('@memberjunction/aiengine', () => ({ AIEngine: { Instance: { Config: vi.fn() } } }));
vi.mock('@memberjunction/templates', () => ({
    TemplateEngineServer: {
        Instance: {
            Config: vi.fn(),
            SetupNunjucks: vi.fn(),
            Templates: [{ ID: IDS.template, Content: [{ TemplateText: '{{ Name }}' }] }],
        },
    },
}));
vi.mock('@memberjunction/templates-base-types', () => ({}));

import { EntityVectorSyncer } from '../models/entityVectorSync';

/** Stops the run right after the upserter is built; nothing past that point matters here. */
const STOP = new Error('stop after upserter is built');

const VECTOR_INDEX = { Name: 'More Cheese Content (Pinecone)', ExternalID: 'morecheese-content', Dimensions: null, ProviderConfig: null };

function syncerFor() {
    const provider = { Entities: [{ ID: IDS.entity, Name: 'People' }] } as unknown as IMetadataProvider;
    const syncer = new EntityVectorSyncer(provider);
    const createVectorUpserter = vi.fn(() => { throw STOP; });
    Object.assign(syncer as unknown as Record<string, unknown>, {
        GetEntityDocument: async () => ({ ID: IDS.doc, Name: 'People Search', EntityID: IDS.entity, TemplateID: IDS.template, Configuration: null }),
        getVectorIndexForEntityDocument: () => VECTOR_INDEX,
        GetVectorDatabaseAndEmbeddingClassByEntityDocumentID: async () => ({ vectorDB: {}, embeddingRunner: {}, aiModelID: 'model-1', embeddingModelAPIName: 'embed' }),
        ValidateTemplateContextParamAlignment: () => true,
        createVectorCreator: () => ({}),
        createVectorUpserter,
    });
    return { syncer, createVectorUpserter };
}

describe('EntityVectorSyncer.VectorizeEntity index name', () => {
    it('upserts into the index name the engine resolves (ExternalID), not the MJ display Name', async () => {
        kh.GetProviderIndexName.mockReturnValueOnce('morecheese-content');
        const { syncer, createVectorUpserter } = syncerFor();

        await expect(syncer.VectorizeEntity({ entityID: IDS.entity, entityDocumentID: IDS.doc } as never, { ID: 'user-1' } as never))
            .rejects.toBe(STOP);

        expect(kh.GetProviderIndexName).toHaveBeenCalledWith(VECTOR_INDEX);
        expect(createVectorUpserter).toHaveBeenCalledTimes(1);
        expect((createVectorUpserter.mock.calls[0] as unknown[])[3]).toBe('morecheese-content');
    });
});
