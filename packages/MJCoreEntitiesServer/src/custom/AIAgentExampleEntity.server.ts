import { RegisterClass } from "@memberjunction/global";
import { BaseEntity, EntitySaveOptions, LogError, SimpleEmbeddingResult } from "@memberjunction/core";
import { AIAgentExampleEntity } from "@memberjunction/core-entities";
import { EmbedTextLocalHelper } from "./util";

/**
 * Server-side extension of AIAgentExampleEntity that auto-generates embeddings
 * when the ExampleInput field changes, following the QueryEntity pattern.
 */
@RegisterClass(BaseEntity, 'AI Agent Examples')
export class AIAgentExampleEntityExtended extends AIAgentExampleEntity {
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
            } else if (!this.ExampleInput || this.ExampleInput.trim().length === 0) {
                // Clear embedding if input is empty
                this.EmbeddingVector = null;
                this.EmbeddingModelID = null;
            }

            return await super.Save(options);
        } catch (e) {
            LogError('Failed to save AI Agent Example:', e);
            if (this.LatestResult) {
                this.LatestResult.Errors.push(e);
            }
            return false;
        }
    }
}

/**
 * Required export for MJ class factory registration
 */
export function LoadAIAgentExampleEntityServerSubClass() {
    // Registration happens via @RegisterClass decorator
}
