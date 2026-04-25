import { BaseEntity, LogError, LogStatus, RunView } from '@memberjunction/core';
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

        // Clean up all FK references before deletion to prevent constraint errors.
        try {
            const rv = new RunView();
            const [coOccResult, taggedItemResult, contentItemTagResult] = await rv.RunViews([
                { EntityName: 'MJ: Tag Co Occurrences', ExtraFilter: `TagAID='${tagID}' OR TagBID='${tagID}'`, ResultType: 'entity_object' },
                { EntityName: 'MJ: Tagged Items', ExtraFilter: `TagID='${tagID}'`, ResultType: 'entity_object' },
                { EntityName: 'MJ: Content Item Tags', ExtraFilter: `TagID='${tagID}'`, ResultType: 'entity_object' },
            ], this.ContextCurrentUser);

            const deletes: Promise<boolean>[] = [];
            if (coOccResult.Success) deletes.push(...coOccResult.Results.map((r: BaseEntity) => r.Delete()));
            if (taggedItemResult.Success) deletes.push(...taggedItemResult.Results.map((r: BaseEntity) => r.Delete()));
            if (contentItemTagResult.Success) deletes.push(...contentItemTagResult.Results.map((r: BaseEntity) => r.Delete()));

            if (deletes.length > 0) {
                await Promise.all(deletes);
                LogStatus(`[MJTagEntityServer] Cleaned up ${deletes.length} referencing records for tag "${tagName}"`);
            }
        } catch (error) {
            LogError(`[MJTagEntityServer] Failed to clean up references for tag "${tagName}": ${error instanceof Error ? error.message : String(error)}`);
        }

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
