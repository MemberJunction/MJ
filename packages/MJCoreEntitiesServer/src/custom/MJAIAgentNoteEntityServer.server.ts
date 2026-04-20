import { RegisterClass } from "@memberjunction/global";
import { BaseEntity, EntitySaveOptions, LogError, SimpleEmbeddingResult } from "@memberjunction/core";
import { MJAIAgentNoteEntity } from "@memberjunction/core-entities";
import { EmbedTextLocalHelper } from "./util";
import { AIEngine } from "@memberjunction/aiengine";

/**
 * Server-side extension of MJAIAgentNoteEntity that auto-generates embeddings
 * when the Note field changes, following the MJQueryEntity pattern.
 */
@RegisterClass(BaseEntity, 'MJ: AI Agent Notes')
export class MJAIAgentNoteEntityServer extends MJAIAgentNoteEntity {
    /**
     * Override EmbedTextLocal to use helper
     */
    protected override async EmbedTextLocal(textToEmbed: string): Promise<SimpleEmbeddingResult> {
        return EmbedTextLocalHelper(this, textToEmbed);
    }

    override async Save(options?: EntitySaveOptions): Promise<boolean> {
        try {
            // Check if Note field has changed
            const noteField = this.GetFieldByName('Note');
            const shouldGenerateEmbedding = !this.IsSaved || noteField.Dirty;

            // Generate embedding for Note field if needed
            if (shouldGenerateEmbedding && this.Note && this.Note.trim().length > 0) {
                await this.GenerateEmbeddingByFieldName("Note", "EmbeddingVector", "EmbeddingModelID");

                // now let the AIEngine know that the note has been updated so it can have the latest vector in memory
                AIEngine.Instance.AddOrUpdateSingleNoteEmbedding(this);
            } else if (!this.Note || this.Note.trim().length === 0) {
                // Clear embedding if note is empty
                this.EmbeddingVector = null;
                this.EmbeddingModelID = null;
            }

            // Save using parent
            return await super.Save(options);
        } catch (e) {
            LogError('Failed to save AI Agent Note:', e);
            // Let the parent class handle LatestResult error propagation
            return false;
        }
    }
}