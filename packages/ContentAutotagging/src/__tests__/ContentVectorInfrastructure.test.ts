import { describe, expect, it, vi } from 'vitest';

const sources = new Map<string, { EmbeddingModelID: string | null; VectorIndexID: string | null }>();
const types = new Map<string, { EmbeddingModelID: string | null; VectorIndexID: string | null }>();

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

import { ContentVectorInfrastructure } from '../Engine/generic/ContentVectorInfrastructure';

function groupKeyFor(sourceID: string, typeID: string): string {
    const infra = new ContentVectorInfrastructure({} as never, {} as never) as unknown as {
        groupKeyFor(item: { ContentSourceID: string; ContentTypeID: string }): string;
    };
    return infra.groupKeyFor({ ContentSourceID: sourceID, ContentTypeID: typeID });
}

describe('vector infrastructure cascade', () => {
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
});
