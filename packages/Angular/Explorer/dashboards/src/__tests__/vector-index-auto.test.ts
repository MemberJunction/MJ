/**
 * "Vector Index: Auto (create/find matching index)" resolution helpers.
 *
 * A match must share BOTH the vector database and the embedding model: an index for another model
 * has another vector width and rejects every upsert, so a same-database/other-model index is never
 * an acceptable fallback.
 */
import { describe, it, expect } from 'vitest';
import {
    AUTO_VECTOR_INDEX_NAME_MAX_LENGTH,
    buildAutoVectorIndexName,
    findMatchingVectorIndex,
} from '../AI/components/vectors/vector-index-auto';

const DB_PINECONE = 'D0000001-0000-0000-0000-000000000001';
const DB_SQL = 'D0000002-0000-0000-0000-000000000002';
const MODEL_SMALL = 'M0000001-0000-0000-0000-000000000001';
const MODEL_LARGE = 'M0000002-0000-0000-0000-000000000002';

const INDEXES = [
    { ID: 'I1', VectorDatabaseID: DB_PINECONE, EmbeddingModelID: MODEL_LARGE },
    { ID: 'I2', VectorDatabaseID: DB_PINECONE, EmbeddingModelID: MODEL_SMALL },
    { ID: 'I3', VectorDatabaseID: DB_SQL, EmbeddingModelID: MODEL_SMALL },
];

describe('findMatchingVectorIndex', () => {
    it('returns the index on the same database built for the same embedding model', () => {
        expect(findMatchingVectorIndex(INDEXES, DB_PINECONE, MODEL_SMALL)?.ID).toBe('I2');
        expect(findMatchingVectorIndex(INDEXES, DB_SQL, MODEL_SMALL)?.ID).toBe('I3');
    });

    it('never falls back to a same-database index for a different model', () => {
        expect(findMatchingVectorIndex(INDEXES, DB_SQL, MODEL_LARGE)).toBeNull();
    });

    it('compares IDs regardless of casing', () => {
        expect(findMatchingVectorIndex(INDEXES, DB_PINECONE.toLowerCase(), MODEL_LARGE.toLowerCase())?.ID).toBe('I1');
    });

    it('returns null when the database or model is not chosen, or nothing is registered', () => {
        expect(findMatchingVectorIndex(INDEXES, null, MODEL_SMALL)).toBeNull();
        expect(findMatchingVectorIndex(INDEXES, DB_PINECONE, '')).toBeNull();
        expect(findMatchingVectorIndex([], DB_PINECONE, MODEL_SMALL)).toBeNull();
    });

    it('ignores indexes whose database or model is unset', () => {
        const partial = [{ ID: 'I9', VectorDatabaseID: null, EmbeddingModelID: null }];
        expect(findMatchingVectorIndex(partial, DB_PINECONE, MODEL_SMALL)).toBeNull();
    });
});

describe('buildAutoVectorIndexName', () => {
    it('names the index after the entity and the embedding model', () => {
        expect(buildAutoVectorIndexName('Organizations', 'text-embedding-3-small')).toBe('Organizations - text-embedding-3-small');
    });

    it('trims and substitutes placeholders for missing parts', () => {
        expect(buildAutoVectorIndexName('  Organizations ', null)).toBe('Organizations - Embeddings');
        expect(buildAutoVectorIndexName('', 'text-embedding-3-small')).toBe('Entity - text-embedding-3-small');
    });

    it('caps the length', () => {
        const name = buildAutoVectorIndexName('E'.repeat(120), 'model');
        expect(name.length).toBeLessThanOrEqual(AUTO_VECTOR_INDEX_NAME_MAX_LENGTH);
        expect(name.endsWith(' ')).toBe(false);
    });
});
