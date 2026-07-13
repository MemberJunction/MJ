import { BaseEntity, EntitySaveOptions } from "@memberjunction/core";
import { RegisterClass } from "@memberjunction/global";
import { MJConversationDetailEntity } from "@memberjunction/core-entities";

/**
 * Server-side subclass of MJConversationDetailEntity that automatically tracks
 * when the original message content has been modified.
 *
 * When a user edits their message after initial creation, the OriginalMessageChanged
 * flag is set to true, allowing the UI to display an "(Edited)" indicator. This is
 * also the edit signal for cross-turn conversation compaction
 * (plans/agent-conversation-compaction.md §6): a row edited after it was folded into
 * a persisted summary keeps the flag, Record Changes already holds the diff, and the
 * UI can derive "edited after summarization" from the flag plus the row's Sequence
 * being below the current summary boundary — no summary regeneration required (the
 * summary is explicitly lossy; agents page in exact rows via the retrieval tools).
 */
@RegisterClass(BaseEntity, "MJ: Conversation Details")
export class MJConversationDetailEntityServer extends MJConversationDetailEntity {
    /**
     * Override Save to detect message changes and set the OriginalMessageChanged flag.
     * This is done as pre-processing before calling super.Save() to ensure it's a single DB round trip.
     */
    override async Save(options?: EntitySaveOptions): Promise<boolean> {
        if (this.ShouldFlagOriginalMessageChanged()) {
            this.OriginalMessageChanged = true;
        }

        return super.Save(options);
    }

    /**
     * True when this save is a genuine Message EDIT on an existing record — not one of
     * the framework's own Message rewrites:
     * - New records never qualify (also covers the agent-response placeholder INSERT).
     * - Agent progress updates rewrite Message while the row's Status is 'In-Progress' — skipped.
     * - The run's finalization save rewrites Message together with a Status transition — a
     *   dirty Status marks the save as lifecycle, not an edit — skipped.
     *
     * Note: the original implementation inverted the IsSaved check (`!this.IsSaved`
     * selects NEW records), which combined with the OldValue guard meant the flag could
     * never be set — fixed as part of the compaction edit-handling work.
     */
    public ShouldFlagOriginalMessageChanged(): boolean {
        if (!this.IsSaved) {
            return false;
        }
        const messageField = this.GetFieldByName('Message');
        if (!messageField || !messageField.Dirty || messageField.OldValue === undefined) {
            return false;
        }
        if (this.Status === 'In-Progress') {
            return false;
        }
        const statusField = this.GetFieldByName('Status');
        if (statusField?.Dirty) {
            return false;
        }
        return true;
    }
}