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

/** Longest auto-generated index name we write; the provider-facing name is sanitized server-side. */
export const AUTO_VECTOR_INDEX_NAME_MAX_LENGTH = 100;

/**
 * The index already built for this database + embedding model, or null when none exists. Never falls
 * back to an index on the same database for a different model.
 */
export function findMatchingVectorIndex<T extends VectorIndexCandidate>(
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
 * Human-readable name for an auto-created index: "<entity> - <embedding model>", so an operator can
 * tell at a glance which entity document and model it serves.
 */
export function buildAutoVectorIndexName(
    entityName: string | null | undefined,
    embeddingModelName: string | null | undefined
): string {
    const entity = (entityName ?? '').trim() || 'Entity';
    const model = (embeddingModelName ?? '').trim() || 'Embeddings';
    const name = `${entity} - ${model}`;
    return name.length > AUTO_VECTOR_INDEX_NAME_MAX_LENGTH
        ? name.substring(0, AUTO_VECTOR_INDEX_NAME_MAX_LENGTH).trimEnd()
        : name;
}
