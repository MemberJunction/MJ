import { describe, it, expect, vi } from 'vitest';
import type { IMetadataProvider } from '@memberjunction/core';

/**
 * `VectorizeEntity` must address the vector index on the provider by its `ExternalID`, not by
 * the MJ display `Name`. They differ whenever the label is human-friendly — e.g. Name
 * "More Cheese Content (Pinecone)" vs ExternalID "morecheese-content" — and passing the Name
 * made every Pinecone upsert 404 (`/indexes/More%20Cheese%20Content%20(Pinecone)`), so a run
 * reported N records vectorized and N upsert errors while writing nothing.
 */

const IDS = vi.hoisted(() => ({
    entity: '11111111-1111-1111-1111-111111111111',
    template: '22222222-2222-2222-2222-222222222222',
    doc: '33333333-3333-3333-3333-333333333333',
}));

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

vi.mock('@memberjunction/core-entities', () => ({}));
vi.mock('@memberjunction/ai', () => ({}));
vi.mock('@memberjunction/ai-prompts', () => ({ AIEmbeddingRunner: class {} }));
vi.mock('@memberjunction/ai-vectordb', async () => ({
    ProviderIndexName: (await vi.importActual<typeof import('@memberjunction/ai-vectordb')>('@memberjunction/ai-vectordb')).ProviderIndexName,
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

function syncerFor(vectorIndex: { Name: string; ExternalID: string | null }) {
    const provider = { Entities: [{ ID: IDS.entity, Name: 'People' }] } as unknown as IMetadataProvider;
    const syncer = new EntityVectorSyncer(provider);
    const createVectorUpserter = vi.fn(() => { throw STOP; });
    Object.assign(syncer as unknown as Record<string, unknown>, {
        GetEntityDocument: async () => ({ ID: IDS.doc, Name: 'People Search', EntityID: IDS.entity, TemplateID: IDS.template, Configuration: null }),
        getVectorIndexForEntityDocument: () => ({ ...vectorIndex, Dimensions: null, ProviderConfig: null }),
        GetVectorDatabaseAndEmbeddingClassByEntityDocumentID: async () => ({ vectorDB: {}, embeddingRunner: {}, aiModelID: 'model-1', embeddingModelAPIName: 'embed' }),
        ValidateTemplateContextParamAlignment: () => true,
        createVectorCreator: () => ({}),
        createVectorUpserter,
    });
    return { syncer, createVectorUpserter };
}

async function indexNameUsedFor(vectorIndex: { Name: string; ExternalID: string | null }): Promise<unknown> {
    const { syncer, createVectorUpserter } = syncerFor(vectorIndex);
    await expect(syncer.VectorizeEntity({ entityID: IDS.entity, entityDocumentID: IDS.doc } as never, { ID: 'user-1' } as never))
        .rejects.toBe(STOP);
    expect(createVectorUpserter).toHaveBeenCalledTimes(1);
    return (createVectorUpserter.mock.calls[0] as unknown[])[3];
}

describe('EntityVectorSyncer.VectorizeEntity index name', () => {
    it('upserts into the provider-side index (ExternalID), not the MJ display Name', async () => {
        expect(await indexNameUsedFor({ Name: 'More Cheese Content (Pinecone)', ExternalID: 'morecheese-content' }))
            .toBe('morecheese-content');
    });

    it('falls back to Name for an index row with no ExternalID', async () => {
        expect(await indexNameUsedFor({ Name: 'legacy-index', ExternalID: null })).toBe('legacy-index');
    });
});
