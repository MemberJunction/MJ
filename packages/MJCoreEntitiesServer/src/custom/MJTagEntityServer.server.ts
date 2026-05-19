import { BaseEntity, EntitySaveOptions, LogError, LogStatus, RunView, SimpleEmbeddingResult, ValidationErrorInfo, ValidationErrorType, ValidationResult } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { MJTagEntity, MJTagScopeEntity } from '@memberjunction/core-entities';
import { TagEngine } from '@memberjunction/tag-engine';
import { EmbedTextLocalHelper } from './util';

/**
 * Server-side Tag entity that:
 *   1. Enforces the IsGlobal ⊕ TagScope invariant via ValidateAsync — a tag with
 *      TagScope rows cannot have IsGlobal=1, and a tag with IsGlobal=1 cannot
 *      acquire TagScope rows. The other half (insert into TagScope) is enforced
 *      in MJTagScopeEntityServer.
 *   2. Persists an embedding for the tag (combining Name + Description) so
 *      cold-start TagEngine doesn't recompute every tag's vector — it loads the
 *      persisted vector when EmbeddingModelID matches the configured model.
 *   3. Keeps TagEngine's in-memory vector service in sync after save/delete.
 *   4. Cleans up FK references (CoOccurrence, TaggedItem, ContentItemTag,
 *      TagScope, TagSynonym) before delete so delete doesn't fail on FK
 *      constraints.
 */
@RegisterClass(BaseEntity, 'MJ: Tags')
export class MJTagEntityServer extends MJTagEntity {

    /** Enable async validation so the IsGlobal ⊕ TagScope invariant runs. */
    public override get DefaultSkipAsyncValidation(): boolean {
        return false;
    }

    protected override async EmbedTextLocal(textToEmbed: string): Promise<SimpleEmbeddingResult> {
        return EmbedTextLocalHelper(this, textToEmbed);
    }

    public override SupportsEmbedTextLocal(): boolean {
        return true;
    }

    /**
     * Async invariant check — runs automatically after sync Validate() passes.
     * A tag becoming (or staying) IsGlobal=1 cannot already have TagScope rows.
     * Cheap fast-path: only query when the IsGlobal flag is being toggled true
     * on an existing record (new records can't have scope rows yet).
     */
    public override async ValidateAsync(): Promise<ValidationResult> {
        const result = await super.ValidateAsync();
        if (!result.Success) return result;

        const isGlobalField = this.GetFieldByName('IsGlobal');
        const togglingToGlobal = this.IsSaved && isGlobalField?.Dirty && this.IsGlobal === true;
        if (!togglingToGlobal) return result;

        const violating = await this.countTagScopeRows();
        if (violating > 0) {
            const err = new ValidationErrorInfo(
                'IsGlobal',
                `Cannot set IsGlobal=1 on tag "${this.Name}" because ${violating} TagScope row(s) exist for it. Remove the scope rows first or leave the tag scoped.`,
                this.IsGlobal,
                ValidationErrorType.Failure
            );
            result.Errors.push(err);
            result.Success = false;
        }
        return result;
    }

    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        // Refresh embedding when first save or when Name/Description is dirty.
        // Computed over combined "Name: Description" so the vector reflects both.
        // Written into the entity vector columns BEFORE super.Save so it
        // persists in a single round-trip.
        await this.refreshEmbeddingIfNeeded();

        const saved = await super.Save(options);
        if (!saved) return false;

        // Mirror to in-memory vector service. Reads the just-persisted vector
        // from this.EmbeddingVector — no recompute.
        try {
            if (this.Status === 'Active' && this.EmbeddingVector) {
                TagEngine.Instance.AddOrUpdateSingleTagEmbeddingFromPersisted(this);
            } else {
                TagEngine.Instance.RemoveTagFromVectorService(this.ID);
            }
        } catch (error) {
            // Cache sync failure is non-fatal — the persisted vector is still correct.
            LogError(`[MJTagEntityServer] Failed to sync embedding cache for tag "${this.Name}": ${error instanceof Error ? error.message : String(error)}`);
        }

        return true;
    }

    public override async Delete(): Promise<boolean> {
        const tagName = this.Name;
        const tagID = this.ID;

        // Clean up FK references in parallel before deletion to prevent constraint errors.
        try {
            const rv = new RunView();
            const [coOccResult, taggedItemResult, contentItemTagResult, scopeResult, synonymResult] = await rv.RunViews([
                { EntityName: 'MJ: Tag Co Occurrences', ExtraFilter: `TagAID='${tagID}' OR TagBID='${tagID}'`, ResultType: 'entity_object' },
                { EntityName: 'MJ: Tagged Items', ExtraFilter: `TagID='${tagID}'`, ResultType: 'entity_object' },
                { EntityName: 'MJ: Content Item Tags', ExtraFilter: `TagID='${tagID}'`, ResultType: 'entity_object' },
                { EntityName: 'MJ: Tag Scopes', ExtraFilter: `TagID='${tagID}'`, ResultType: 'entity_object' },
                { EntityName: 'MJ: Tag Synonyms', ExtraFilter: `TagID='${tagID}'`, ResultType: 'entity_object' },
            ], this.ContextCurrentUser);

            const deletes: Promise<boolean>[] = [];
            if (coOccResult.Success) deletes.push(...coOccResult.Results.map((r: BaseEntity) => r.Delete()));
            if (taggedItemResult.Success) deletes.push(...taggedItemResult.Results.map((r: BaseEntity) => r.Delete()));
            if (contentItemTagResult.Success) deletes.push(...contentItemTagResult.Results.map((r: BaseEntity) => r.Delete()));
            if (scopeResult.Success) deletes.push(...scopeResult.Results.map((r: BaseEntity) => r.Delete()));
            if (synonymResult.Success) deletes.push(...synonymResult.Results.map((r: BaseEntity) => r.Delete()));

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

    /**
     * Refresh `EmbeddingVector` + `EmbeddingModelID` when the tag is new or its
     * Name/Description has changed. Failures here log and clear the vector
     * fields rather than blocking the save — the tag is still functional, just
     * without semantic matching until the next successful refresh.
     */
    private async refreshEmbeddingIfNeeded(): Promise<void> {
        const nameField = this.GetFieldByName('Name');
        const descField = this.GetFieldByName('Description');
        const nameDirty = !this.IsSaved || (nameField?.Dirty ?? false);
        const descDirty = !this.IsSaved || (descField?.Dirty ?? false);

        if (!nameDirty && !descDirty) return;

        const trimmedName = this.Name?.trim();
        if (!trimmedName) {
            this.EmbeddingVector = null;
            this.EmbeddingModelID = null;
            return;
        }

        const description = this.Description?.trim();
        const text = description ? `${trimmedName}: ${description}` : trimmedName;

        try {
            const result = await this.EmbedTextLocal(text);
            if (result?.vector && result.vector.length > 0) {
                this.EmbeddingVector = JSON.stringify(result.vector);
                if (result.modelID) this.EmbeddingModelID = result.modelID;
            } else {
                this.EmbeddingVector = null;
                this.EmbeddingModelID = null;
            }
        } catch (error) {
            LogError(`[MJTagEntityServer] Embedding refresh failed for tag "${this.Name}": ${error instanceof Error ? error.message : String(error)}`);
            this.EmbeddingVector = null;
            this.EmbeddingModelID = null;
        }
    }

    private async countTagScopeRows(): Promise<number> {
        const rv = new RunView();
        const result = await rv.RunView<MJTagScopeEntity>({
            EntityName: 'MJ: Tag Scopes',
            ExtraFilter: `TagID='${this.ID}'`,
            Fields: ['ID'],
            ResultType: 'simple'
        }, this.ContextCurrentUser);
        return result.Success ? (result.Results?.length ?? 0) : 0;
    }
}
