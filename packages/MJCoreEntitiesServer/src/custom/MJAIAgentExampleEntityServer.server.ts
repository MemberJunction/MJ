import { RegisterClass } from "@memberjunction/global";
import { BaseEntity, EntitySaveOptions, LogError, SimpleEmbeddingResult } from "@memberjunction/core";
import { MJAIAgentExampleEntity } from "@memberjunction/core-entities";
import { EmbedTextLocalHelper } from "./util";
import { AIEngine } from "@memberjunction/aiengine";

/**
 * Server-side extension of MJAIAgentExampleEntity that auto-generates embeddings
 * when the ExampleInput field changes, following the MJQueryEntity pattern.
 */
@RegisterClass(BaseEntity, 'MJ: AI Agent Examples')
export class AIAgentExampleEntityExtended extends MJAIAgentExampleEntity {
    /**
     * Override EmbedTextLocal to use helper
     */
    protected override async EmbedTextLocal(textToEmbed: string): Promise<SimpleEmbeddingResult> {
        return EmbedTextLocalHelper(this, textToEmbed);
    }

    override async Save(options?: EntitySaveOptions): Promise<boolean> {
        try {
            // Check if ExampleInput field has changed
            const inputField = this.GetFieldByName('ExampleInput');
            const shouldGenerateEmbedding = !this.IsSaved || inputField.Dirty;

            // Generate embedding for ExampleInput field if needed
            if (shouldGenerateEmbedding && this.ExampleInput && this.ExampleInput.trim().length > 0) {
                await this.GenerateEmbeddingByFieldName("ExampleInput", "EmbeddingVector", "EmbeddingModelID");

                // update AI Engine to know about this updated embedding for the example
                AIEngine.Instance.AddOrUpdateSingleExampleEmbedding(this);
            } else if (!this.ExampleInput || this.ExampleInput.trim().length === 0) {
                // Clear embedding if input is empty
                this.EmbeddingVector = null;
                this.EmbeddingModelID = null;
            }

            return await super.Save(options);
        } catch (e) {
            LogError('Failed to save AI Agent Example:', e);
            // Let the parent class handle LatestResult error propagation
            return false;
        }
    }
}