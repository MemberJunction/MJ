import { AIEngine } from "@memberjunction/aiengine";
import { BaseEntity, SimpleEmbeddingResult } from "@memberjunction/core";

/**
 * Helper Method for BaseEntity sub-classes to call for embeddings
 * @param entity 
 * @param textToEmbed 
 * @returns 
 */
export async function EmbedTextLocalHelper(entity: BaseEntity, textToEmbed: string): Promise<SimpleEmbeddingResult> {
    await AIEngine.Instance.Config(false, entity.ContextCurrentUser);
    const e = await AIEngine.Instance.EmbedTextLocal(textToEmbed, { inputType: 'document' });

    if (!e?.result?.vector || !e?.model?.ID) {
        throw new Error('Failed to generate embedding - no vector or model ID returned');
    }

    return {
        vector: e.result.vector,
        modelID: e.model.ID
    }
}

/**
 * `BaseEntity.IsEmbeddingStale` for entities that embed with {@link EmbedTextLocalHelper}: a stored
 * vector is stale when it came from a model other than the platform's default local embedding model
 * (`AIEngine.DefaultLocalEmbeddingModel`), or from an unrecorded one.
 * @param entity
 * @param embeddingModelID - The stored vector's model ID, or null
 */
export async function IsLocalEmbeddingStaleHelper(entity: BaseEntity, embeddingModelID: string | null): Promise<boolean> {
    await AIEngine.Instance.Config(false, entity.ContextCurrentUser);
    // With no local embedding model there is nothing to re-embed with, so nothing is stale. (Treating
    // everything as stale would make every save try, and fail, to embed — and a tag saved by TagEngine
    // with a hosted model would have its vector cleared by its own save hook.)
    if (!AIEngine.Instance.DefaultLocalEmbeddingModel) {
        return false;
    }
    return !AIEngine.Instance.IsDefaultLocalEmbeddingModel(embeddingModelID);
}
