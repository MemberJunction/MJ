import { beforeEach, describe, expect, it, vi } from 'vitest';

const sources = new Map<string, { EmbeddingModelID: string | null; VectorIndexID: string | null }>();
const types = new Map<string, { EmbeddingModelID: string | null; VectorIndexID: string | null }>();
const aiState = {
    VectorIndexes: [] as Array<{ ID: string; Name: string; EmbeddingModelID: string; VectorDatabaseID: string }>,
    Configurations: [] as Array<{ ID: string; Name: string; IsDefault: boolean; Status?: string }>,
    ConfigurationParams: [] as Array<{ ConfigurationID: string; Name: string; Value: string }>,
};

vi.mock('@memberjunction/core-entities', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core-entities')>();
    return {
        ...actual,
        KnowledgeHubMetadataEngine: {
            Instance: {
                GetContentSourceByID: (id: string) => sources.get(id),
                GetContentTypeByID: (id: string) => types.get(id),
            },
        },
    };
});

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: {
        Instance: {
            Config: vi.fn().mockResolvedValue(undefined),
            get VectorIndexes() {
                return aiState.VectorIndexes;
            },
            get Configurations() {
                return aiState.Configurations;
            },
            get ConfigurationParams() {
                return aiState.ConfigurationParams;
            },
        },
    },
}));

import { ContentVectorInfrastructure } from '../Engine/generic/ContentVectorInfrastructure';

function groupKeyFor(sourceID: string, typeID: string): string {
    const infra = new ContentVectorInfrastructure({} as never, {} as never) as unknown as {
        groupKeyFor(item: { ContentSourceID: string; ContentTypeID: string }): string;
    };
    return infra.groupKeyFor({ ContentSourceID: sourceID, ContentTypeID: typeID });
}

function resolveDefaultVectorIndex(allowFirstIndexFallback = false): Promise<{ ID: string; Name: string }> {
    const infra = new ContentVectorInfrastructure(
        {} as never,
        {} as never,
        { AllowFirstIndexFallback: allowFirstIndexFallback },
    ) as unknown as {
        resolveDefaultVectorIndex(): Promise<{ ID: string; Name: string }>;
    };
    return infra.resolveDefaultVectorIndex();
}

describe('vector infrastructure cascade', () => {
    beforeEach(() => {
        sources.clear();
        types.clear();
        aiState.VectorIndexes = [];
        aiState.Configurations = [];
        aiState.ConfigurationParams = [];
    });

    it("uses the source's model and index when it names both", () => {
        sources.set('S1', { EmbeddingModelID: 'M1', VectorIndexID: 'I1' });
        types.set('T1', { EmbeddingModelID: 'M2', VectorIndexID: 'I2' });
        expect(groupKeyFor('S1', 'T1')).toBe('m1|i1');
    });

    it("never skips a source's index for another one when it names no model", () => {
        sources.set('S2', { EmbeddingModelID: null, VectorIndexID: 'I1' });
        types.set('T2', { EmbeddingModelID: 'M2', VectorIndexID: 'I2' });
        expect(groupKeyFor('S2', 'T2')).toBe('default|i1');
    });

    it("falls to the content type's index, then to the default index", () => {
        sources.set('S3', { EmbeddingModelID: null, VectorIndexID: null });
        types.set('T3', { EmbeddingModelID: null, VectorIndexID: 'I3' });
        types.set('T4', { EmbeddingModelID: null, VectorIndexID: null });
        expect(groupKeyFor('S3', 'T3')).toBe('default|i3');
        expect(groupKeyFor('S3', 'T4')).toBe('default|default');
    });

    it('resolves ContentPipeline.DefaultVectorIndexID from the active default MJ: AI Configurations row', async () => {
        aiState.VectorIndexes = [
            { ID: '11111111-1111-1111-1111-111111111111', Name: 'First', EmbeddingModelID: 'M1', VectorDatabaseID: 'DB1' },
            { ID: '22222222-2222-2222-2222-222222222222', Name: 'ConfiguredDefault', EmbeddingModelID: 'M2', VectorDatabaseID: 'DB1' },
        ];
        aiState.Configurations = [
            { ID: 'AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA', Name: 'Default Config', IsDefault: true, Status: 'Active' },
        ];
        aiState.ConfigurationParams = [
            {
                ConfigurationID: 'AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA',
                Name: 'ContentPipeline.DefaultVectorIndexID',
                Value: '22222222-2222-2222-2222-222222222222',
            },
        ];

        const index = await resolveDefaultVectorIndex();
        expect(index.Name).toBe('ConfiguredDefault');
    });

    it('fails on the strict pipeline path if more than one active default MJ: AI Configurations row exists', async () => {
        aiState.VectorIndexes = [
            { ID: '11111111-1111-1111-1111-111111111111', Name: 'Only', EmbeddingModelID: 'M1', VectorDatabaseID: 'DB1' },
        ];
        aiState.Configurations = [
            { ID: 'AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA', Name: 'Default A', IsDefault: true, Status: 'Active' },
            { ID: 'BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB', Name: 'Default B', IsDefault: true, Status: 'Active' },
        ];

        await expect(resolveDefaultVectorIndex(false)).rejects.toThrow(/Multiple active default MJ: AI Configurations/);
    });

    it('falls back to the first vector index on the legacy path when multiple default MJ: AI Configurations rows exist', async () => {
        aiState.VectorIndexes = [
            { ID: '11111111-1111-1111-1111-111111111111', Name: 'First', EmbeddingModelID: 'M1', VectorDatabaseID: 'DB1' },
            { ID: '22222222-2222-2222-2222-222222222222', Name: 'Second', EmbeddingModelID: 'M2', VectorDatabaseID: 'DB1' },
        ];
        aiState.Configurations = [
            { ID: 'AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA', Name: 'Default A', IsDefault: true, Status: 'Active' },
            { ID: 'BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB', Name: 'Default B', IsDefault: true, Status: 'Active' },
        ];

        const index = await resolveDefaultVectorIndex(true);
        expect(index.Name).toBe('First');
    });

    it('uses the sole vector index when VectorIndexes.length === 1 and no default param is set', async () => {
        aiState.VectorIndexes = [
            { ID: '11111111-1111-1111-1111-111111111111', Name: 'SoleIndex', EmbeddingModelID: 'M1', VectorDatabaseID: 'DB1' },
        ];

        const index = await resolveDefaultVectorIndex();
        expect(index.Name).toBe('SoleIndex');
    });

    it('fails closed when multiple vector indexes exist and no default is configured', async () => {
        aiState.VectorIndexes = [
            { ID: '11111111-1111-1111-1111-111111111111', Name: 'Index A', EmbeddingModelID: 'M1', VectorDatabaseID: 'DB1' },
            { ID: '22222222-2222-2222-2222-222222222222', Name: 'Index B', EmbeddingModelID: 'M2', VectorDatabaseID: 'DB1' },
        ];

        await expect(resolveDefaultVectorIndex(false)).rejects.toThrow(
            /ContentSource\.VectorIndexID.*ContentType\.VectorIndexID.*ContentPipeline\.DefaultVectorIndexID/,
        );
    });
});
