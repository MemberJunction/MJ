import { BaseSingleton, UUIDsEqual } from '@memberjunction/global';
import { UserInfo, Metadata, RunView, LogError, LogStatus, IMetadataProvider } from '@memberjunction/core';
import { MJTagEntity, MJTagAuditLogEntity, MJContentItemTagEntity, MJTaggedItemEntity, MJTagSynonymEntity, MJTagSuggestionEntity, MJTagScopeEntity } from '@memberjunction/core-entities';
import { TagEngine } from './TagEngine';
import { TagEngineBase } from '@memberjunction/tag-engine-base';

/**
 * Conventional `Reason` values written to `MJ:Tag Suggestions.Reason`.
 * The DB column is free-form for forward compatibility; this union covers the
 * full set the autotagger and Tag Health emitters use today.
 */
export type TagSuggestionReason =
    | 'BelowThreshold'
    | 'ConstrainedMode'
    | 'AmbiguousMatch'
    | 'ParentFrozen'
    | 'AutoGrowDisabled'
    | 'MaxChildrenExceeded'
    | 'MaxDepthExceeded'
    | 'BelowMinWeight'
    | 'RequiresReview'
    | 'MaxItemTagsExceeded'
    | 'MergeCandidate'
    | 'LowUsage'
    | 'WideNode';

/**
 * Result of `ValidateAutoGrow` — either ok, or blocked with a reason that
 * maps directly to a `TagSuggestion.Reason` value.
 */
export type AutoGrowValidationResult =
    | { ok: true }
    | { ok: false; reason: TagSuggestionReason; details?: string };

/**
 * Parameters accepted by `EnqueueSuggestion`.
 */
export interface EnqueueSuggestionParams {
    proposedName: string;
    proposedParentID?: string | null;
    bestMatchTagID?: string | null;
    bestMatchScore?: number | null;
    reason: TagSuggestionReason;
    sourceContentItemID?: string | null;
    sourceContentSourceID?: string | null;
    sourceText?: string | null;
}

/**
 * Strategies passed to `PromoteSuggestion`.
 */
export type PromoteSuggestionStrategy =
    | { kind: 'create-new' }
    | { kind: 'merge-into-existing'; targetTagID: string };

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

    private _provider: IMetadataProvider | null = null;

    /**
     * Optional metadata provider override. Callers should set
     * `instance.Provider = providerToUse` before invoking governance operations
     * in multi-provider contexts. Falls back to the global default provider when unset.
     */
    public get Provider(): IMetadataProvider {
        return this._provider ?? (new Metadata() as unknown as IMetadataProvider);
    }
    public set Provider(value: IMetadataProvider | null) {
        this._provider = value;
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
            // Capture source name before status change so synonym carry uses the original.
            const sourceTag = TagEngine.Instance.GetTagByID(sourceID);
            const sourceName = sourceTag?.Name ?? '';

            const itemsMoved = await this.repointContentItemTags(sourceID, survivingTagID, contextUser);
            const taggedItemsMoved = await this.repointTaggedItems(sourceID, survivingTagID, contextUser);

            // Carry source's synonyms (and source's own name) onto surviving tag.
            if (sourceName) {
                await this.carrySynonymsOnMerge(sourceID, sourceName, survivingTagID, contextUser);
            }

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
        const md = this.Provider;
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
        const md = this.Provider;
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

    // ========================================================================
    // Per-tag governance enforcement (Phase 1c.5)
    // ========================================================================

    /**
     * Walk the proposed parent's ancestor chain and decide whether the
     * autotagger may auto-create a new child under it. Returns the first
     * blocking reason found (so reviewer messages can be precise) or `ok:true`.
     *
     * Caller responsibilities:
     *   - `weight` is the classifier confidence; `BelowMinWeight` is checked
     *     against the proposed parent's `MinWeight`.
     *   - `proposedParentID == null` means "create a root" — only the global
     *     IsFrozen / IsLeaf governance applies.
     *   - The caller must have ensured `TagEngine.Config()` ran so
     *     `GetTagByID` returns the up-to-date entity instances.
     */
    public async ValidateAutoGrow(
        proposedParentID: string | null,
        weight: number,
        contextUser: UserInfo
    ): Promise<AutoGrowValidationResult> {
        if (!proposedParentID) {
            // Root creation — no per-tag governance to walk. We allow it; the
            // taxonomy mode (Constrained/AutoGrow/etc.) is the gate at root.
            return { ok: true };
        }

        await TagEngine.Instance.Config(false, contextUser);

        const proposedParent = TagEngine.Instance.GetTagByID(proposedParentID);
        if (!proposedParent) {
            return { ok: false, reason: 'AutoGrowDisabled', details: `Proposed parent tag ${proposedParentID} not found.` };
        }

        // Direct-parent constraints (depth-0)
        if (proposedParent.AllowAutoGrow === false) {
            return { ok: false, reason: 'AutoGrowDisabled', details: `Tag "${proposedParent.Name}" has AllowAutoGrow=0.` };
        }
        if (proposedParent.MinWeight != null && weight < proposedParent.MinWeight) {
            return { ok: false, reason: 'BelowMinWeight', details: `Weight ${weight} < MinWeight ${proposedParent.MinWeight} on tag "${proposedParent.Name}".` };
        }
        if (proposedParent.MaxChildren != null) {
            const childCount = TagEngine.Instance.GetChildTags(proposedParent.ID).length;
            if (childCount >= proposedParent.MaxChildren) {
                return { ok: false, reason: 'MaxChildrenExceeded', details: `Tag "${proposedParent.Name}" has ${childCount}/${proposedParent.MaxChildren} children.` };
            }
        }

        // Ancestor walk — IsFrozen and MaxDescendantDepth are enforced anywhere
        // in the chain. We also count depth so MaxDescendantDepth can fire.
        let depthBelowAncestor = 1; // proposedParent + new child = +1 from each ancestor's perspective
        let cursor: MJTagEntity | undefined = proposedParent;
        const visited = new Set<string>();
        while (cursor) {
            if (visited.has(cursor.ID)) break; // defensive — cycle guard
            visited.add(cursor.ID);

            if (cursor.IsFrozen) {
                return { ok: false, reason: 'ParentFrozen', details: `Ancestor "${cursor.Name}" is IsFrozen=1.` };
            }
            if (cursor.MaxDescendantDepth != null && depthBelowAncestor > cursor.MaxDescendantDepth) {
                return { ok: false, reason: 'MaxDepthExceeded', details: `New child would be at depth ${depthBelowAncestor} below "${cursor.Name}" (max ${cursor.MaxDescendantDepth}).` };
            }

            const parentID = cursor.ParentID;
            if (!parentID) break;
            cursor = TagEngine.Instance.GetTagByID(parentID);
            depthBelowAncestor++;
        }

        return { ok: true };
    }

    /**
     * Write a row to `MJ:Tag Suggestions`. Idempotency is the caller's
     * responsibility — this method always inserts. Callers that need
     * deduplication (e.g., Tag Health emitters) should query first.
     */
    public async EnqueueSuggestion(
        params: EnqueueSuggestionParams,
        contextUser: UserInfo
    ): Promise<MJTagSuggestionEntity> {
        const md = this.Provider;
        const suggestion = await md.GetEntityObject<MJTagSuggestionEntity>('MJ: Tag Suggestions', contextUser);
        suggestion.NewRecord();
        suggestion.ProposedName = params.proposedName;
        suggestion.ProposedParentID = params.proposedParentID ?? null;
        suggestion.BestMatchTagID = params.bestMatchTagID ?? null;
        suggestion.BestMatchScore = params.bestMatchScore ?? null;
        suggestion.Reason = params.reason;
        suggestion.SourceContentItemID = params.sourceContentItemID ?? null;
        suggestion.SourceContentSourceID = params.sourceContentSourceID ?? null;
        suggestion.SourceText = params.sourceText ?? null;
        suggestion.Status = 'Pending';

        const saved = await suggestion.Save();
        if (!saved) {
            throw new Error(`TagGovernanceEngine.EnqueueSuggestion: Failed to save suggestion: ${suggestion.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }
        return suggestion;
    }

    /**
     * Approve a pending suggestion. When the reviewer chose `merge-into-existing`,
     * re-points any existing free-text `ContentItemTag` rows whose `Tag` text
     * matches `ProposedName` to the merge target. When `create-new`, creates a
     * fresh `MJ:Tag` (inheriting parent scope when applicable) and re-points
     * the same set of free-text rows to the new tag.
     *
     * Returns the resolved tag (merge target or newly-created tag).
     */
    public async PromoteSuggestion(
        suggestionID: string,
        strategy: PromoteSuggestionStrategy,
        contextUser: UserInfo
    ): Promise<MJTagEntity> {
        const md = this.Provider;
        const suggestion = await md.GetEntityObject<MJTagSuggestionEntity>('MJ: Tag Suggestions', contextUser);
        const loaded = await suggestion.Load(suggestionID);
        if (!loaded) {
            throw new Error(`TagGovernanceEngine.PromoteSuggestion: suggestion ${suggestionID} not found.`);
        }
        if (suggestion.Status !== 'Pending') {
            throw new Error(`TagGovernanceEngine.PromoteSuggestion: suggestion ${suggestionID} is in status "${suggestion.Status}", not Pending.`);
        }

        let resolvedTag: MJTagEntity;
        if (strategy.kind === 'merge-into-existing') {
            resolvedTag = await this.loadTag(strategy.targetTagID, contextUser);
            const moved = await this.repointContentItemTagsByName(suggestion.ProposedName, resolvedTag.ID, contextUser);
            suggestion.Status = 'Merged';
            suggestion.ResolvedTagID = resolvedTag.ID;
            LogStatus(`TagGovernanceEngine.PromoteSuggestion: Merged "${suggestion.ProposedName}" into "${resolvedTag.Name}" (${moved} rows re-pointed).`);
        } else {
            // Create-new path. Inherit scope from parent when parent exists and is non-global.
            resolvedTag = await this.createNewTagForSuggestion(suggestion, contextUser);
            const moved = await this.repointContentItemTagsByName(suggestion.ProposedName, resolvedTag.ID, contextUser);
            suggestion.Status = 'Approved';
            suggestion.ResolvedTagID = resolvedTag.ID;
            LogStatus(`TagGovernanceEngine.PromoteSuggestion: Created new tag "${resolvedTag.Name}" and re-pointed ${moved} content-item-tag row(s).`);
        }

        suggestion.ReviewedByUserID = contextUser.ID;
        suggestion.ReviewedAt = new Date();
        const saved = await suggestion.Save();
        if (!saved) {
            throw new Error(`TagGovernanceEngine.PromoteSuggestion: Failed to update suggestion ${suggestionID}: ${suggestion.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }
        return resolvedTag;
    }

    /**
     * Reject a pending suggestion with optional reviewer notes.
     */
    public async RejectSuggestion(
        suggestionID: string,
        reviewerNotes: string | null,
        contextUser: UserInfo
    ): Promise<void> {
        const md = this.Provider;
        const suggestion = await md.GetEntityObject<MJTagSuggestionEntity>('MJ: Tag Suggestions', contextUser);
        const loaded = await suggestion.Load(suggestionID);
        if (!loaded) {
            throw new Error(`TagGovernanceEngine.RejectSuggestion: suggestion ${suggestionID} not found.`);
        }
        if (suggestion.Status !== 'Pending') {
            throw new Error(`TagGovernanceEngine.RejectSuggestion: suggestion ${suggestionID} is in status "${suggestion.Status}", not Pending.`);
        }
        suggestion.Status = 'Rejected';
        suggestion.ReviewerNotes = reviewerNotes ?? null;
        suggestion.ReviewedByUserID = contextUser.ID;
        suggestion.ReviewedAt = new Date();
        const saved = await suggestion.Save();
        if (!saved) {
            throw new Error(`TagGovernanceEngine.RejectSuggestion: Failed to update suggestion ${suggestionID}: ${suggestion.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }
    }

    /**
     * Re-point ContentItemTag rows whose free-text `Tag` matches the supplied
     * name (case-insensitive) to the supplied TagID. Returns the count moved.
     */
    private async repointContentItemTagsByName(name: string, targetTagID: string, contextUser: UserInfo): Promise<number> {
        const escaped = name.replace(/'/g, "''");
        const rv = new RunView();
        const result = await rv.RunView<MJContentItemTagEntity>({
            EntityName: 'MJ: Content Item Tags',
            ExtraFilter: `LOWER(Tag) = LOWER('${escaped}') AND (TagID IS NULL OR TagID <> '${targetTagID}')`,
            ResultType: 'entity_object'
        }, contextUser);
        if (!result.Success) {
            LogError(`TagGovernanceEngine.repointContentItemTagsByName: ${result.ErrorMessage}`);
            return 0;
        }
        let moved = 0;
        for (const row of result.Results) {
            row.TagID = targetTagID;
            const saved = await row.Save();
            if (saved) moved++;
        }
        return moved;
    }

    /**
     * Create a new tag from an Approved suggestion. Inherits parent scope by
     * snapshotting the parent's TagScope rows; if parent is global or absent,
     * the new tag is global.
     */
    private async createNewTagForSuggestion(suggestion: MJTagSuggestionEntity, contextUser: UserInfo): Promise<MJTagEntity> {
        const tag = await this.createNewTag(suggestion.ProposedName, suggestion.ProposedParentID, contextUser);

        if (suggestion.ProposedParentID) {
            const parent = TagEngine.Instance.GetTagByID(suggestion.ProposedParentID);
            if (parent && !parent.IsGlobal) {
                const parentScopes = TagEngineBase.Instance.GetScopesForTag(parent.ID);
                if (parentScopes.length > 0) {
                    // Make the new child non-global and snapshot the parent's scope rows.
                    tag.IsGlobal = false;
                    const updateScope = await tag.Save();
                    if (!updateScope) {
                        LogError(`TagGovernanceEngine.createNewTagForSuggestion: Failed to set IsGlobal=0 on new child "${tag.Name}".`);
                    }
                    const md = this.Provider;
                    for (const ps of parentScopes) {
                        const scope = await md.GetEntityObject<MJTagScopeEntity>('MJ: Tag Scopes', contextUser);
                        scope.NewRecord();
                        scope.TagID = tag.ID;
                        scope.ScopeEntityID = ps.ScopeEntityID;
                        scope.ScopeRecordID = ps.ScopeRecordID;
                        const ok = await scope.Save();
                        if (!ok) {
                            LogError(`TagGovernanceEngine.createNewTagForSuggestion: Failed to copy scope row for new tag "${tag.Name}": ${scope.LatestResult?.CompleteMessage ?? 'unknown error'}`);
                        }
                    }
                }
            }
        }
        return tag;
    }

    /**
     * Carry source-tag synonyms (and the source's name itself, as a synonym)
     * onto the surviving tag during a merge. Idempotent — won't duplicate
     * existing rows. Called from MergeTags below.
     */
    private async carrySynonymsOnMerge(sourceTagID: string, sourceName: string, survivingTagID: string, contextUser: UserInfo): Promise<void> {
        const rv = new RunView();
        const [existingResult, sourceSynsResult] = await rv.RunViews([
            { EntityName: 'MJ: Tag Synonyms', ExtraFilter: `TagID='${survivingTagID}'`, ResultType: 'simple', Fields: ['Synonym'] },
            { EntityName: 'MJ: Tag Synonyms', ExtraFilter: `TagID='${sourceTagID}'`, ResultType: 'entity_object' },
        ], contextUser);

        const existingSet = new Set<string>();
        if (existingResult.Success) {
            for (const r of (existingResult.Results as Array<{Synonym: string}>)) {
                if (r.Synonym) existingSet.add(r.Synonym.trim().toLowerCase());
            }
        }

        const md = this.Provider;
        const sourceNameKey = sourceName.trim().toLowerCase();
        if (sourceNameKey && !existingSet.has(sourceNameKey)) {
            const syn = await md.GetEntityObject<MJTagSynonymEntity>('MJ: Tag Synonyms', contextUser);
            syn.NewRecord();
            syn.TagID = survivingTagID;
            syn.Synonym = sourceName;
            syn.Source = 'Merged';
            const ok = await syn.Save();
            if (!ok) LogError(`TagGovernanceEngine.carrySynonymsOnMerge: Failed to add merged synonym "${sourceName}": ${syn.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            existingSet.add(sourceNameKey);
        }

        if (sourceSynsResult.Success) {
            for (const sourceSyn of sourceSynsResult.Results as MJTagSynonymEntity[]) {
                const key = sourceSyn.Synonym?.trim().toLowerCase();
                if (!key || existingSet.has(key)) continue;
                const syn = await md.GetEntityObject<MJTagSynonymEntity>('MJ: Tag Synonyms', contextUser);
                syn.NewRecord();
                syn.TagID = survivingTagID;
                syn.Synonym = sourceSyn.Synonym;
                syn.Source = 'Merged';
                const ok = await syn.Save();
                if (!ok) LogError(`TagGovernanceEngine.carrySynonymsOnMerge: Failed to copy synonym "${sourceSyn.Synonym}": ${syn.LatestResult?.CompleteMessage ?? 'unknown error'}`);
                existingSet.add(key);
            }
        }
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
        const md = this.Provider;
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
