import { RegisterClass } from "@memberjunction/global";
import { BaseEntity, EntityDeleteOptions, EntitySaveOptions, LogError, SimpleEmbeddingResult } from "@memberjunction/core";
import { MJAIAgentExampleEntity } from "@memberjunction/core-entities";
import { EmbedTextLocalHelper } from "./util";
import { AIEngine } from "@memberjunction/aiengine";

/**
 * Server-side extension of MJAIAgentExampleEntity that:
 *   1. Auto-generates an embedding when the ExampleInput field is new or dirty.
 *   2. Keeps `AIEngine._exampleVectorService` in sync with the example's persisted Status.
 *      Invariant: the vector service contains an entry for an example iff its current Status
 *      is 'Active' AND it has a non-empty EmbeddingVector. Retrieval filters
 *      (`composeExampleFilters`) trust this invariant and apply scope filtering only.
 */
@RegisterClass(BaseEntity, 'MJ: AI Agent Examples')
export class MJAIAgentExampleEntityServer extends MJAIAgentExampleEntity {
    /**
     * Override EmbedTextLocal to use helper
     */
    protected override async EmbedTextLocal(textToEmbed: string): Promise<SimpleEmbeddingResult> {
        return EmbedTextLocalHelper(this, textToEmbed);
    }

    override async Save(options?: EntitySaveOptions): Promise<boolean> {
        try {
            // 1. Generate/refresh the embedding if the ExampleInput text is new or dirty.
            const inputField = this.GetFieldByName('ExampleInput');
            const shouldGenerateEmbedding = !this.IsSaved || inputField.Dirty;

            if (shouldGenerateEmbedding && this.ExampleInput && this.ExampleInput.trim().length > 0) {
                await this.GenerateEmbeddingByFieldName("ExampleInput", "EmbeddingVector", "EmbeddingModelID");
            } else if (!this.ExampleInput || this.ExampleInput.trim().length === 0) {
                this.EmbeddingVector = null;
                this.EmbeddingModelID = null;
            }

            // 2. Persist first — only touch the in-memory vector service on a successful save.
            const saved = await super.Save(options);
            if (!saved) return false;

            // 3. Sync the in-memory vector service with the just-persisted Status.
            //    AIEngine is registered as deferred — EnsureLoaded blocks until the
            //    background load completes so the underlying vector service exists.
            await AIEngine.Instance.EnsureLoaded();
            if (this.Status === 'Active' && this.EmbeddingVector) {
                AIEngine.Instance.AddOrUpdateSingleExampleEmbedding(this);
            } else {
                AIEngine.Instance.RemoveSingleExampleEmbedding(this.ID);
            }
            return true;
        } catch (e) {
            LogError('Failed to save AI Agent Example:', e);
            // Let the parent class handle LatestResult error propagation
            return false;
        }
    }

    override async Delete(options?: EntityDeleteOptions): Promise<boolean> {
        const id = this.ID;
        const deleted = await super.Delete(options);
        if (deleted && id) {
            AIEngine.Instance.RemoveSingleExampleEmbedding(id);
        }
        return deleted;
    }
}