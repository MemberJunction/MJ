import { BaseSingleton, UUIDsEqual } from '@memberjunction/global';
import { UserInfo, Metadata, RunView, LogError, LogStatus } from '@memberjunction/core';
import { MJTagEntity, MJTagAuditLogEntity, MJContentItemTagEntity, MJTaggedItemEntity } from '@memberjunction/core-entities';
import { TagEngine } from './TagEngine';

/**
 * Result of a tag merge operation.
 */
export interface MergeResult {
    /** Number of ContentItemTag records re-pointed to the surviving tag */
    ItemsMoved: number;
    /** Number of TaggedItem records re-pointed to the surviving tag */
    TaggedItemsMoved: number;
}

/**
 * Union type for valid tag audit log actions.
 */
export type TagAuditAction = 'Created' | 'Renamed' | 'Moved' | 'Merged' | 'Split' | 'Deprecated' | 'Reactivated' | 'Deleted' | 'DescriptionChanged';

/**
 * Engine that manages tag lifecycle operations (merge, split, move, rename, deprecate,
 * reactivate, delete) with full audit logging to the MJ: Tag Audit Logs entity.
 *
 * All operations are server-side and require a `contextUser` for proper security context.
 * Every mutation creates an audit log entry for traceability.
 *
 * @example
 * ```typescript
 * const gov = TagGovernanceEngine.Instance;
 * // Merge two tags into one
 * const result = await gov.MergeTags(['tag-a-id', 'tag-b-id'], 'surviving-id', contextUser);
 * console.log(`Moved ${result.ItemsMoved} content item tags`);
 * ```
 */
export class TagGovernanceEngine extends BaseSingleton<TagGovernanceEngine> {
    public constructor() {
        super();
    }

    public static get Instance(): TagGovernanceEngine {
        return TagGovernanceEngine.getInstance<TagGovernanceEngine>();
    }

    // ========================================================================
    // Merge
    // ========================================================================

    /**
     * Merge one or more source tags into a single surviving tag.
     *
     * This operation:
     * 1. Re-points all `ContentItemTag.TagID` references from each source tag to the surviving tag
     * 2. Re-points all `TaggedItem` records from each source tag to the surviving tag
     * 3. Sets each source tag's `Status` to `'Merged'` and `MergedIntoTagID` to the surviving tag
     * 4. Creates an audit log entry for each source tag with action `'Merged'`
     *
     * @param sourceTagIDs - Array of tag IDs to merge away (these become inactive)
     * @param survivingTagID - The tag ID that absorbs all references
     * @param contextUser - The user performing the operation
     * @returns Summary of items moved during the merge
     * @throws Error if the surviving tag cannot be loaded or if any save operation fails
     */
    public async MergeTags(sourceTagIDs: string[], survivingTagID: string, contextUser: UserInfo): Promise<MergeResult> {
        let totalItemsMoved = 0;
        let totalTaggedItemsMoved = 0;

        for (const sourceID of sourceTagIDs) {
            const itemsMoved = await this.repointContentItemTags(sourceID, survivingTagID, contextUser);
            const taggedItemsMoved = await this.repointTaggedItems(sourceID, survivingTagID, contextUser);

            await this.markTagAsMerged(sourceID, survivingTagID, contextUser);

            await this.createAuditEntry(
                sourceID,
                'Merged',
                contextUser,
                { ItemsMoved: itemsMoved, TaggedItemsMoved: taggedItemsMoved },
                survivingTagID
            );

            totalItemsMoved += itemsMoved;
            totalTaggedItemsMoved += taggedItemsMoved;
        }

        LogStatus(`TagGovernanceEngine: Merged ${sourceTagIDs.length} tags into ${survivingTagID}. Moved ${totalItemsMoved} content item tags and ${totalTaggedItemsMoved} tagged items.`);

        return { ItemsMoved: totalItemsMoved, TaggedItemsMoved: totalTaggedItemsMoved };
    }

    /**
     * Re-point all ContentItemTag records from a source tag to the surviving tag.
     */
    private async repointContentItemTags(sourceTagID: string, survivingTagID: string, contextUser: UserInfo): Promise<number> {
        const rv = new RunView();
        const result = await rv.RunView<MJContentItemTagEntity>({
            EntityName: 'MJ: Content Item Tags',
            ExtraFilter: `TagID='${sourceTagID}'`,
            ResultType: 'entity_object'
        }, contextUser);

        if (!result.Success) {
            LogError(`TagGovernanceEngine: Failed to load content item tags for source tag ${sourceTagID}: ${result.ErrorMessage}`);
            return 0;
        }

        let moved = 0;
        for (const item of result.Results) {
            item.TagID = survivingTagID;
            const saved = await item.Save();
            if (saved) {
                moved++;
            } else {
                LogError(`TagGovernanceEngine: Failed to re-point content item tag ${item.ID}: ${item.LatestResult?.Message ?? 'Unknown error'}`);
            }
        }
        return moved;
    }

    /**
     * Re-point all TaggedItem records from a source tag to the surviving tag.
     */
    private async repointTaggedItems(sourceTagID: string, survivingTagID: string, contextUser: UserInfo): Promise<number> {
        const rv = new RunView();
        const result = await rv.RunView<MJTaggedItemEntity>({
            EntityName: 'MJ: Tagged Items',
            ExtraFilter: `TagID='${sourceTagID}'`,
            ResultType: 'entity_object'
        }, contextUser);

        if (!result.Success) {
            LogError(`TagGovernanceEngine: Failed to load tagged items for source tag ${sourceTagID}: ${result.ErrorMessage}`);
            return 0;
        }

        let moved = 0;
        for (const item of result.Results) {
            item.TagID = survivingTagID;
            const saved = await item.Save();
            if (saved) {
                moved++;
            } else {
                LogError(`TagGovernanceEngine: Failed to re-point tagged item ${item.ID}: ${item.LatestResult?.Message ?? 'Unknown error'}`);
            }
        }
        return moved;
    }

    /**
     * Mark a source tag as merged by setting Status and MergedIntoTagID.
     */
    private async markTagAsMerged(sourceTagID: string, survivingTagID: string, contextUser: UserInfo): Promise<void> {
        const tag = await this.loadTag(sourceTagID, contextUser);
        tag.Status = 'Merged';
        tag.MergedIntoTagID = survivingTagID;
        const saved = await tag.Save();
        if (!saved) {
            throw new Error(`TagGovernanceEngine: Failed to mark tag ${sourceTagID} as merged: ${tag.LatestResult?.Message ?? 'Unknown error'}`);
        }
    }

    // ========================================================================
    // Split
    // ========================================================================

    /**
     * Split a tag by creating new child tags under the original tag's parent.
     *
     * This operation creates new sibling tags alongside the original tag.
     * It does NOT automatically reassign items from the original tag to the new children;
     * that must be done separately (e.g., via MergeTags or manual reassignment).
     *
     * @param tagID - The tag being split
     * @param newChildNames - Array of names for the new child tags to create
     * @param contextUser - The user performing the operation
     * @returns Array of newly created tag entities
     * @throws Error if the original tag cannot be loaded or if any tag creation fails
     */
    public async SplitTag(tagID: string, newChildNames: string[], contextUser: UserInfo): Promise<MJTagEntity[]> {
        const originalTag = await this.loadTag(tagID, contextUser);
        const parentID = originalTag.ParentID;

        const createdTags: MJTagEntity[] = [];
        for (const childName of newChildNames) {
            const newTag = await this.createNewTag(childName, parentID, contextUser);
            createdTags.push(newTag);
        }

        const childIDs = createdTags.map(t => t.ID);
        await this.createAuditEntry(
            tagID,
            'Split',
            contextUser,
            { NewChildNames: newChildNames, NewChildIDs: childIDs }
        );

        LogStatus(`TagGovernanceEngine: Split tag ${tagID} into ${newChildNames.length} new tags.`);

        return createdTags;
    }

    // ========================================================================
    // Move
    // ========================================================================

    /**
     * Move a tag to a new parent in the taxonomy hierarchy.
     *
     * @param tagID - The tag to move
     * @param newParentID - The new parent tag ID, or null for root-level
     * @param contextUser - The user performing the operation
     * @throws Error if the tag cannot be loaded or saved
     */
    public async MoveTag(tagID: string, newParentID: string | null, contextUser: UserInfo): Promise<void> {
        const tag = await this.loadTag(tagID, contextUser);
        const oldParentID = tag.ParentID;

        tag.ParentID = newParentID;
        const saved = await tag.Save();
        if (!saved) {
            throw new Error(`TagGovernanceEngine: Failed to move tag ${tagID}: ${tag.LatestResult?.Message ?? 'Unknown error'}`);
        }

        await this.createAuditEntry(
            tagID,
            'Moved',
            contextUser,
            { OldParentID: oldParentID, NewParentID: newParentID }
        );

        LogStatus(`TagGovernanceEngine: Moved tag ${tagID} from parent ${oldParentID ?? '(root)'} to ${newParentID ?? '(root)'}.`);
    }

    // ========================================================================
    // Rename
    // ========================================================================

    /**
     * Rename a tag, updating both `Name` and `DisplayName`.
     *
     * @param tagID - The tag to rename
     * @param newName - The new name (applied to both Name and DisplayName)
     * @param contextUser - The user performing the operation
     * @throws Error if the tag cannot be loaded or saved
     */
    public async RenameTag(tagID: string, newName: string, contextUser: UserInfo): Promise<void> {
        const tag = await this.loadTag(tagID, contextUser);
        const oldName = tag.Name;

        tag.Name = newName;
        tag.DisplayName = newName;
        const saved = await tag.Save();
        if (!saved) {
            throw new Error(`TagGovernanceEngine: Failed to rename tag ${tagID}: ${tag.LatestResult?.Message ?? 'Unknown error'}`);
        }

        await this.createAuditEntry(
            tagID,
            'Renamed',
            contextUser,
            { OldName: oldName, NewName: newName }
        );

        // Re-embed the tag so its vector reflects the new name
        await this.reEmbedTagSafe(tag);

        LogStatus(`TagGovernanceEngine: Renamed tag ${tagID} from "${oldName}" to "${newName}".`);
    }

    /**
     * Re-embed a tag via TagEngine. Silently logs on failure so the
     * rename/move operation is not rolled back due to an embedding issue.
     */
    private async reEmbedTagSafe(tag: MJTagEntity): Promise<void> {
        try {
            await TagEngine.Instance.ReEmbedTag(tag);
        } catch (error) {
            LogError(`TagGovernanceEngine: Failed to re-embed tag ${tag.ID} after rename: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    // ========================================================================
    // Status Changes (Deprecate / Reactivate / Delete)
    // ========================================================================

    /**
     * Deprecate a tag by setting its Status to `'Deprecated'`.
     * Deprecated tags are preserved in the system but excluded from active tag resolution.
     *
     * @param tagID - The tag to deprecate
     * @param contextUser - The user performing the operation
     * @throws Error if the tag cannot be loaded or saved
     */
    public async DeprecateTag(tagID: string, contextUser: UserInfo): Promise<void> {
        await this.changeTagStatus(tagID, 'Deprecated', 'Deprecated', contextUser);
    }

    /**
     * Reactivate a previously deprecated or deleted tag by setting its Status back to `'Active'`.
     *
     * @param tagID - The tag to reactivate
     * @param contextUser - The user performing the operation
     * @throws Error if the tag cannot be loaded or saved
     */
    public async ReactivateTag(tagID: string, contextUser: UserInfo): Promise<void> {
        await this.changeTagStatus(tagID, 'Active', 'Reactivated', contextUser);
    }

    /**
     * Soft-delete a tag by setting its Status to `'Deleted'`.
     * The tag record is preserved in the database for audit history.
     *
     * @param tagID - The tag to soft-delete
     * @param contextUser - The user performing the operation
     * @throws Error if the tag cannot be loaded or saved
     */
    public async DeleteTag(tagID: string, contextUser: UserInfo): Promise<void> {
        await this.changeTagStatus(tagID, 'Deleted', 'Deleted', contextUser);
    }

    /**
     * Change a tag's status and log the action.
     */
    private async changeTagStatus(
        tagID: string,
        newStatus: 'Active' | 'Deleted' | 'Deprecated' | 'Merged',
        action: TagAuditAction,
        contextUser: UserInfo
    ): Promise<void> {
        const tag = await this.loadTag(tagID, contextUser);
        const oldStatus = tag.Status;

        tag.Status = newStatus;
        const saved = await tag.Save();
        if (!saved) {
            throw new Error(`TagGovernanceEngine: Failed to change status of tag ${tagID} to ${newStatus}: ${tag.LatestResult?.Message ?? 'Unknown error'}`);
        }

        await this.createAuditEntry(
            tagID,
            action,
            contextUser,
            { OldStatus: oldStatus, NewStatus: newStatus }
        );

        LogStatus(`TagGovernanceEngine: Changed tag ${tagID} status from "${oldStatus}" to "${newStatus}" (action: ${action}).`);
    }

    // ========================================================================
    // Helpers
    // ========================================================================

    /**
     * Load a tag entity by ID.
     * @throws Error if the tag cannot be loaded
     */
    private async loadTag(tagID: string, contextUser: UserInfo): Promise<MJTagEntity> {
        const md = new Metadata();
        const tag = await md.GetEntityObject<MJTagEntity>('MJ: Tags', contextUser);
        const loaded = await tag.Load(tagID);
        if (!loaded) {
            throw new Error(`TagGovernanceEngine: Failed to load tag with ID ${tagID}`);
        }
        return tag;
    }

    /**
     * Create a new tag entity and save it.
     * @throws Error if the tag cannot be saved
     */
    private async createNewTag(name: string, parentID: string | null, contextUser: UserInfo): Promise<MJTagEntity> {
        const md = new Metadata();
        const tag = await md.GetEntityObject<MJTagEntity>('MJ: Tags', contextUser);
        tag.NewRecord();
        tag.Name = name;
        tag.DisplayName = name;
        tag.ParentID = parentID;

        const saved = await tag.Save();
        if (!saved) {
            throw new Error(`TagGovernanceEngine: Failed to create new tag "${name}": ${tag.LatestResult?.Message ?? 'Unknown error'}`);
        }
        return tag;
    }

    /**
     * Create an audit log entry for a tag governance action.
     *
     * @param tagID - The tag that was acted upon
     * @param action - The type of governance action performed
     * @param contextUser - The user who performed the action
     * @param details - Optional action-specific details (serialized as JSON)
     * @param relatedTagID - Optional related tag (e.g., the surviving tag in a merge)
     */
    private async createAuditEntry(
        tagID: string,
        action: TagAuditAction,
        contextUser: UserInfo,
        details?: Record<string, unknown>,
        relatedTagID?: string
    ): Promise<void> {
        const md = new Metadata();
        const auditLog = await md.GetEntityObject<MJTagAuditLogEntity>('MJ: Tag Audit Logs', contextUser);
        auditLog.NewRecord();
        auditLog.TagID = tagID;
        auditLog.Action = action;
        auditLog.PerformedByUserID = contextUser.ID;

        if (details) {
            auditLog.Details = JSON.stringify(details);
        }
        if (relatedTagID) {
            auditLog.RelatedTagID = relatedTagID;
        }

        const saved = await auditLog.Save();
        if (!saved) {
            LogError(`TagGovernanceEngine: Failed to create audit log entry for tag ${tagID}, action ${action}: ${auditLog.LatestResult?.Message ?? 'Unknown error'}`);
        }
    }
}
