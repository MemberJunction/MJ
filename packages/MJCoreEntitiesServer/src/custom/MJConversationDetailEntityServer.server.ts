import { BaseEntity, EntitySaveOptions } from "@memberjunction/core";
import { RegisterClass } from "@memberjunction/global";
import { MJConversationDetailEntity } from "@memberjunction/core-entities";

/**
 * Server-side subclass of MJConversationDetailEntity that automatically tracks
 * when the original message content has been modified.
 *
 * When a user edits their message after initial creation, the OriginalMessageChanged
 * flag is set to true, allowing the UI to display an "(Edited)" indicator.
 */
@RegisterClass(BaseEntity, "MJ: Conversation Details")
export class MJConversationDetailEntityServer extends MJConversationDetailEntity {
    /**
     * Override Save to detect message changes and set the OriginalMessageChanged flag.
     * This is done as pre-processing before calling super.Save() to ensure it's a single DB round trip.
     */
    override async Save(options?: EntitySaveOptions): Promise<boolean> {
        // Only check for message changes on existing records (not new records)
        if (!this.IsSaved) {
            // Check if the Message field is dirty (has been modified)
            const messageField = this.Fields.find(f => f.Name === 'Message');
            if (messageField && messageField.Dirty && messageField.OldValue !== undefined) {
                // Message has been changed on an existing record - set the flag
                this.OriginalMessageChanged = true;
            }
        }

        return super.Save(options);
    }
}