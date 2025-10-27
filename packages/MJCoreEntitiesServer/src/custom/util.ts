import { AIEngine } from '@memberjunction/aiengine';
import { BaseEntity, SimpleEmbeddingResult } from '@memberjunction/global';

/**
 * Helper Method for BaseEntity sub-classes to call for embeddings
 * @param entity
 * @param textToEmbed
 * @returns
 */
export async function EmbedTextLocalHelper(entity: BaseEntity, textToEmbed: string): Promise<SimpleEmbeddingResult> {
  await AIEngine.Instance.Config(false, entity.ContextCurrentUser);
  const e = await AIEngine.Instance.EmbedTextLocal(textToEmbed);

  if (!e?.result?.vector || !e?.model?.ID) {
    throw new Error('Failed to generate embedding - no vector or model ID returned');
  }

  return {
    vector: e.result.vector,
    modelID: e.model.ID,
  };
}
