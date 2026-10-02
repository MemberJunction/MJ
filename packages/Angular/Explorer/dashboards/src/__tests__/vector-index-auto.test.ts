/**
 * "Vector Index: Auto (create/find matching index)" resolution helpers.
 *
 * A match must share BOTH the vector database and the embedding model: an index for another model
 * has another vector width and rejects every upsert, so a same-database/other-model index is never
 * an acceptable fallback.
 *
 * An auto-created index must get the SAME name on the provider side. `MJVectorIndexEntityServer`
 * provisions the provider index under `sanitizeIndexName(Name)` while the sync, the detector and the
 * vectors resolver address it by the raw `Name`, so a name that changes under sanitizing is an index
 * nothing can write to. The builder is therefore pinned against a copy of that sanitizer.
 */
import { describe, it, expect } from 'vitest';
import {
    AUTO_VECTOR_INDEX_NAME_MAX_LENGTH,
    BuildAutoVectorIndexName,
    FindMatchingVectorIndex,
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

/**
 * A copy of `MJVectorIndexEntityServer.sanitizeIndexName` (packages/MJCoreEntitiesServer). Kept here
 * on purpose: the point of these tests is that the client's name round-trips through the server's
 * rule unchanged, and the server package is not importable from an Angular package's tests.
 */
function sanitizeLikeTheServer(name: string): string {
    let sanitized = name
        .toLowerCase()
        .replace(/[\s_]+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
    if (sanitized.length > 45) {
        sanitized = sanitized.substring(0, 45).replace(/-$/, '');
    }
    return sanitized;
}

describe('FindMatchingVectorIndex', () => {
    it('returns the index on the same database built for the same embedding model', () => {
        expect(FindMatchingVectorIndex(INDEXES, DB_PINECONE, MODEL_SMALL)?.ID).toBe('I2');
        expect(FindMatchingVectorIndex(INDEXES, DB_SQL, MODEL_SMALL)?.ID).toBe('I3');
    });

    it('never falls back to a same-database index for a different model', () => {
        expect(FindMatchingVectorIndex(INDEXES, DB_SQL, MODEL_LARGE)).toBeNull();
    });

    it('compares IDs regardless of casing', () => {
        expect(FindMatchingVectorIndex(INDEXES, DB_PINECONE.toLowerCase(), MODEL_LARGE.toLowerCase())?.ID).toBe('I1');
    });

    it('returns null when the database or model is not chosen, or nothing is registered', () => {
        expect(FindMatchingVectorIndex(INDEXES, null, MODEL_SMALL)).toBeNull();
        expect(FindMatchingVectorIndex(INDEXES, DB_PINECONE, '')).toBeNull();
        expect(FindMatchingVectorIndex([], DB_PINECONE, MODEL_SMALL)).toBeNull();
    });

    it('ignores indexes whose database or model is unset', () => {
        const partial = [{ ID: 'I9', VectorDatabaseID: null, EmbeddingModelID: null }];
        expect(FindMatchingVectorIndex(partial, DB_PINECONE, MODEL_SMALL)).toBeNull();
    });
});

describe('BuildAutoVectorIndexName', () => {
    const SAMPLES: Array<[string | null, string | null]> = [
        ['MJ: Accounts', 'text-embedding-3-small'],
        ['Contacts', 'all-MiniLM-L6-v2'],
        ['Organizations and Memberships', 'text-embedding-3-large'],
        ['  Organizations ', null],
        ['', 'text-embedding-3-small'],
        ['Entité Événements (2026)', 'nomic_embed_text_v1.5'],
    ];

    it('survives the server-side sanitizing unchanged, so the provider index gets the same name the sync targets', () => {
        for (const [entity, model] of SAMPLES) {
            const name = BuildAutoVectorIndexName(entity, model);
            expect(sanitizeLikeTheServer(name), `${entity} / ${model}`).toBe(name);
        }
    });

    it('is lowercase letters, digits and hyphens only, within the provider cap, with no edge hyphen', () => {
        for (const [entity, model] of SAMPLES) {
            const name = BuildAutoVectorIndexName(entity, model);
            expect(name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
            expect(name.length).toBeLessThanOrEqual(AUTO_VECTOR_INDEX_NAME_MAX_LENGTH);
        }
    });

    it('reads as the entity and the model', () => {
        expect(BuildAutoVectorIndexName('MJ: Accounts', 'text-embedding-3-small')).toMatch(/^mj-accounts-text-embedding-3-small-[a-z0-9]{6}$/);
        expect(BuildAutoVectorIndexName('Contacts', 'all-MiniLM-L6-v2')).toMatch(/^contacts-all-minilm-l6-v2-[a-z0-9]{6}$/);
    });

    it('keeps two long names that only differ past the cut distinct', () => {
        const small = BuildAutoVectorIndexName('Organizations and Memberships', 'text-embedding-3-small');
        const large = BuildAutoVectorIndexName('Organizations and Memberships', 'text-embedding-3-large');
        expect(small).not.toBe(large);
        expect(small.length).toBeLessThanOrEqual(AUTO_VECTOR_INDEX_NAME_MAX_LENGTH);
    });

    it('is deterministic for the same inputs', () => {
        expect(BuildAutoVectorIndexName('Contacts', 'all-MiniLM-L6-v2')).toBe(BuildAutoVectorIndexName('Contacts', 'all-MiniLM-L6-v2'));
    });
});
