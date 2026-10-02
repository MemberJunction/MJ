/**
 * Pure helpers behind the "Vector Index: Auto (create/find matching index)" choice in the AI
 * Document Suggestion panel and the entity-document edit panel.
 *
 * "Matching" means the SAME vector database AND the SAME embedding model. An index built for another
 * model has another vector width, and every upsert into it is rejected on a dimension mismatch, so a
 * looser match (any index on that database) is worse than creating a fresh one.
 */
import { UUIDsEqual } from '@memberjunction/global';

/** The slice of an `MJ: Vector Indexes` row needed to decide whether it fits a document. */
export interface VectorIndexCandidate {
    ID: string;
    VectorDatabaseID: string | null;
    EmbeddingModelID: string | null;
}

/**
 * The provider-side cap `MJVectorIndexEntityServer.sanitizeIndexName` applies (Pinecone's limit). An
 * auto-generated name is kept under it so the server's sanitizing is a no-op; see
 * {@link BuildAutoVectorIndexName}.
 */
export const AUTO_VECTOR_INDEX_NAME_MAX_LENGTH = 45;

/** Length of the hash suffix that keeps two long, truncated names from colliding. */
const NAME_HASH_LENGTH = 6;

/**
 * The index already built for this database + embedding model, or null when none exists. Never falls
 * back to an index on the same database for a different model.
 */
export function FindMatchingVectorIndex<T extends VectorIndexCandidate>(
    indexes: readonly T[],
    vectorDatabaseID: string | null | undefined,
    embeddingModelID: string | null | undefined
): T | null {
    if (!vectorDatabaseID || !embeddingModelID) {
        return null;
    }
    return indexes.find(i =>
        UUIDsEqual(i.VectorDatabaseID, vectorDatabaseID) && UUIDsEqual(i.EmbeddingModelID, embeddingModelID)
    ) ?? null;
}

/**
 * Name for an auto-created index, built so the provider index gets the SAME name.
 *
 * Everything downstream (the sync upserter, the duplicate detector, the vectors resolver) addresses
 * the provider index by the record's `Name`, while `MJVectorIndexEntityServer` provisions it under
 * `sanitizeIndexName(Name)`: lowercase letters, digits and hyphens only, at most 45 characters. A
 * name that does not survive that sanitizing points the sync at an index that does not exist, so the
 * name is emitted already in that form: `<entity>-<model>` as a slug, cut to fit, plus a short hash
 * of the full slug so two long names that only differ past the cut do not collide.
 */
export function BuildAutoVectorIndexName(
    entityName: string | null | undefined,
    embeddingModelName: string | null | undefined
): string {
    const fullSlug = slugify(`${(entityName ?? '').trim() || 'entity'} ${(embeddingModelName ?? '').trim() || 'embeddings'}`);
    const hash = hashBase36(fullSlug).slice(0, NAME_HASH_LENGTH).padStart(NAME_HASH_LENGTH, '0');
    const stem = fullSlug.slice(0, AUTO_VECTOR_INDEX_NAME_MAX_LENGTH - NAME_HASH_LENGTH - 1).replace(/-+$/, '');
    return `${stem}-${hash}`;
}

/** Lowercase, runs of anything but letters and digits collapsed to one hyphen, no leading or trailing hyphen. */
function slugify(value: string): string {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

/** Deterministic djb2 hash rendered in base 36; stable across sessions and tenants for the same input. */
function hashBase36(value: string): string {
    let hash = 5381;
    for (let i = 0; i < value.length; i++) {
        hash = ((hash << 5) + hash + value.charCodeAt(i)) >>> 0;
    }
    return hash.toString(36);
}
