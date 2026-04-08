import { BaseEntity, LogError, LogStatus } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { MJTagEntity } from '@memberjunction/core-entities';
import { TagEngine } from '@memberjunction/tag-engine';

/**
 * Server-side Tag entity that keeps TagEngine's vector service in sync.
 *
 * After every Save (insert or update), the tag's embedding is added/updated
 * in the SimpleVectorService so that semantic matching in ResolveTag() stays
 * current. On Delete, the embedding is removed.
 *
 * This runs SYNCHRONOUSLY within the Save() call — the caller's
 * `await tag.Save()` does not resolve until the embedding is updated.
 * This eliminates the race condition where concurrent ResolveTag() calls
 * miss a just-created tag because the embedding wasn't ready yet.
 */
@RegisterClass(BaseEntity, 'MJ: Tags')
export class MJTagEntityServer extends MJTagEntity {
    public override async Save(): Promise<boolean> {
        const saveResult = await super.Save();

        if (saveResult) {
            try {
                await TagEngine.Instance.ReEmbedTag(this);
            } catch (error) {
                // Non-blocking — embedding failure should not fail the save
                LogError(`[MJTagEntityServer] Failed to embed tag "${this.Name}" after save: ${error instanceof Error ? error.message : String(error)}`);
            }
        }

        return saveResult;
    }

    public override async Delete(): Promise<boolean> {
        const tagName = this.Name;
        const tagID = this.ID;

        const deleteResult = await super.Delete();

        if (deleteResult) {
            try {
                TagEngine.Instance.RemoveTagFromVectorService(tagID);
            } catch (error) {
                LogError(`[MJTagEntityServer] Failed to remove embedding for tag "${tagName}" after delete: ${error instanceof Error ? error.message : String(error)}`);
            }
        }

        return deleteResult;
    }
}
