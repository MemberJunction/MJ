import { RegisterClass } from "@memberjunction/global";
import { BaseEntity, EntityDeleteOptions, EntitySaveOptions, LogError, SimpleEmbeddingResult } from "@memberjunction/core";
import { MJAIAgentNoteEntity } from "@memberjunction/core-entities";
import { EmbedTextLocalHelper } from "./util";
import { AIEngine } from "@memberjunction/aiengine";

/**
 * Server-side extension of MJAIAgentNoteEntity that:
 *   1. Auto-generates an embedding when the Note field is new or dirty.
 *   2. Keeps `AIEngine._noteVectorService` in sync with the note's persisted Status.
 *      Invariant: the vector service contains an entry for a note iff its current Status
 *      is 'Active' AND it has a non-empty EmbeddingVector. This write-side invariant lets
 *      the retrieval filters (`composeNoteFilters`) be pure scope filters — they don't
 *      need to consult any additional cache to decide whether a vector hit is still valid.
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
            // 1. Generate/refresh the embedding if the Note text is new or dirty.
            const noteField = this.GetFieldByName('Note');
            const shouldGenerateEmbedding = !this.IsSaved || noteField.Dirty;

            if (shouldGenerateEmbedding && this.Note && this.Note.trim().length > 0) {
                await this.GenerateEmbeddingByFieldName("Note", "EmbeddingVector", "EmbeddingModelID");
            } else if (!this.Note || this.Note.trim().length === 0) {
                this.EmbeddingVector = null;
                this.EmbeddingModelID = null;
            }

            // 2. Persist first — only touch the in-memory vector service on a successful save
            //    so a failed DB write doesn't leave the vector store out of sync.
            const saved = await super.Save(options);
            if (!saved) return false;

            // 3. Sync the in-memory vector service with the just-persisted Status.
            //    - Active + has embedding → (re)insert so retrieval can find it.
            //    - Anything else (Revoked/Archived, or cleared embedding) → drop the vector
            //      entry. The original vector metadata still holds a reference to the stale
            //      entity instance, so leaving it would leak into future retrievals.
            //
            //    AIEngine is registered as deferred — if we're saving before its initial
            //    background load completes, the underlying vector service is null and the
            //    update would silently no-op. EnsureLoaded blocks until the engine is ready.
            await AIEngine.Instance.EnsureLoaded();
            if (this.Status === 'Active' && this.EmbeddingVector) {
                AIEngine.Instance.AddOrUpdateSingleNoteEmbedding(this);
            } else {
                AIEngine.Instance.RemoveSingleNoteEmbedding(this.ID);
            }
            return true;
        } catch (e) {
            LogError('Failed to save AI Agent Note:', e);
            // Let the parent class handle LatestResult error propagation
            return false;
        }
    }

    override async Delete(options?: EntityDeleteOptions): Promise<boolean> {
        const id = this.ID;
        const deleted = await super.Delete(options);
        if (deleted && id) {
            AIEngine.Instance.RemoveSingleNoteEmbedding(id);
        }
        return deleted;
    }
}