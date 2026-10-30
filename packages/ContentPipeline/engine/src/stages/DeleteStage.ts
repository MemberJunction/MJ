/**
 * @fileoverview {@link DeleteStage} — removing what a record put into outside systems.
 *
 * Runs over Content Item Chunk and Content Item; ready when `DeleteStatus = 'Pending'`. Removes
 * first, marks second, so a crash leaves the record Pending and the next attempt repeats an
 * idempotent removal. The row is kept as a tombstone, so re-discovery can tell "removed on purpose"
 * from "never seen".
 *
 * @module @memberjunction/content-pipeline
 */

import { BaseEntity, CompositeKey, LogError, RunView } from '@memberjunction/core';
import { MJContentItemEntity, MJFileEntity } from '@memberjunction/core-entities';
import { FileStorageEngine } from '@memberjunction/storage';
import { MJGlobal, RegisterClass } from '@memberjunction/global';
import { AutotagBase, ContentVectorInfrastructure } from '@memberjunction/content-autotagging';
import { IsRouteFailure, RouteVectorRecords } from '../VectorRouting.js';
import {
    BasePipelineStage,
    Outcome,
    StageContext,
    StageDeclaration,
    StageOutcome,
    TransientStageError,
    WorkingRecord,
    WorkingRecordEntity,
} from '@memberjunction/content-pipeline-base';
import { ContentPipelineDeleteMarker } from '../ContentPipelineDeleteMarker.js';
import { ContentSourceConfigurationResolver } from '../ContentSourceConfigurationResolver.js';
import { WhereEqual } from '../Filters.js';

/** The registered name for the chunk-level stage. */
export const DELETE_STAGE = 'Delete';
/** The registered name for the item-level stage. */
export const DELETE_ITEM_STAGE = 'DeleteContentItem';

/** Removes a record's vector and durable copy (every outside system a stage writes to), then marks it deleted. */
export abstract class BaseDeleteStage extends BasePipelineStage {
    public readonly StatusField = 'DeleteStatus';

    /** `DeleteStatus` is Pending or Deleted; 'Complete' is not in its CHECK constraint. */
    public override get CompleteStatus(): string {
        return 'Deleted';
    }

    /** A delete that could not finish stays Pending (neither value is in the CHECK), so the next run tries again. */
    public override StatusForOutcome(_outcome: 'Skipped' | 'Failed'): string | null {
        return null;
    }

    public override get Declaration(): StageDeclaration {
        return {
            Reads: [],
            Writes: [],
            ReadsExtensions: [],
            WritesExtensions: [`${DELETE_STAGE}.removed`],
        };
    }

    public async Run(record: WorkingRecord, context: StageContext): Promise<StageOutcome> {
        if (context.Signal.aborted) {
            return Outcome.Retry('cancelled before deletion started');
        }

        const removed: string[] = [];
        const skipped: string[] = [];

        const vectorRemoved = await this.removeVector(record, context);
        if (vectorRemoved === null) {
            skipped.push('vector');
        } else if (vectorRemoved) {
            removed.push('vector');
        }

        const copyRemoved = await this.removeDurableCopy(record, context);
        if (copyRemoved === null) {
            skipped.push('durable copy');
        } else if (copyRemoved) {
            removed.push('durable copy');
        }

        // An item marks its chunks and expanded items; each then runs through this same stage.
        const marked = await this.markDependents(record, context);
        if (marked > 0) {
            removed.push(`${marked} dependent record(s) marked`);
        }

        record.SetExtension(this.Name, 'removed', removed);
        if (skipped.length > 0) {
            // Marking it Deleted would strand what is still out there: nothing revisits a Deleted row.
            record.SetExtension(this.Name, 'skipped', skipped);
            return Outcome.Skipped(
                `could not remove ${skipped.join(', ')} — left pending rather than marked deleted`,
            );
        }
        if (await this.Purge(record, context)) {
            removed.push('row');
        }
        return Outcome.Complete(removed.length > 0 ? `removed ${removed.join(', ')}` : 'nothing to remove');
    }

    /** Mark whatever depends on this record for deletion. Nothing for a chunk, which is a leaf. */
    protected async markDependents(_record: WorkingRecord, _context: StageContext): Promise<number> {
        return 0;
    }

    /** Remove the row once everything outside it is gone; true means there is no row left to commit to. The base keeps a tombstone. */
    protected async Purge(_record: WorkingRecord, _context: StageContext): Promise<boolean> {
        return false;
    }

    /**
     * Remove the bytes this record was kept as, if any: the stored object and its `MJ: Files` row.
     * Never deletes an uploaded file that belongs to the caller rather than a durable copy created by `ExtractStage`.
     *
     * @returns Whether a copy was removed, or null when there is one and it could not be reached.
     */
    private async removeDurableCopy(record: WorkingRecord, context: StageContext): Promise<boolean | null> {
        const fileID = record.GetExtension<string>('Pipeline', 'fileID');
        if (!fileID) {
            return false;
        }
        if (await this.isCallerOwnedFile(record, context)) {
            return false;
        }
        if (context.IsTest) {
            return true;
        }
        try {
            const file = await context.Provider.GetEntityObject<MJFileEntity>('MJ: Files', context.ContextUser);
            if (!(await file.InnerLoad(CompositeKey.FromID(fileID)))) { // first-pk-ok: MJ core entity, single-column ID
                // The row is already gone; nothing is stranded.
                return false;
            }
            const resolved = await FileStorageEngine.Instance.ResolveFileObject(file, context.ContextUser, 'Write', context.Provider);
            if (!resolved) {
                LogError(
                    `DeleteStage: no storage account for provider '${file.ProviderID}', so the kept copy ` +
                        `'${fileID}' cannot be removed.`,
                );
                return null;
            }
            await resolved.Driver.DeleteObject(resolved.ObjectKey);
            await this.detachFileFromRecord(record, context);
            // Row after object: a failure between leaves a row pointing at nothing, not an object nothing points at.
            if (!(await file.Delete())) {
                LogError(`DeleteStage: removed the kept copy '${fileID}' but not its row: ${file.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            }
            return true;
        } catch (error) {
            throw new TransientStageError(
                `Removing the kept copy for '${record.Identity.Key}' failed: ` +
                    `${error instanceof Error ? error.message : String(error)}`,
                { cause: error },
            );
        }
    }

    /**
     * True when `FileID` points to a caller-uploaded file rather than a durable copy created by `ExtractStage`
     * (or when source ownership cannot be verified, failing safe to keep the file):
     * 1. The item's locator uses the `upload://` scheme (set by `ContentUploadIngestor.Ingest`), or
     * 2. The item's Content Source uses a push-only driver (`driver.IsPushOnly === true`).
     */
    private async isCallerOwnedFile(record: WorkingRecord, context: StageContext): Promise<boolean> {
        const url = record.Identity.EphemeralID;
        if (typeof url === 'string' && url.startsWith('upload://')) {
            return true;
        }
        const contentSourceID = record.GetExtension<string>('Pipeline', 'contentSourceID');
        if (!contentSourceID) {
            return false;
        }
        try {
            const resolver = new ContentSourceConfigurationResolver(context.Provider, context.ContextUser);
            const resolved = await resolver.Resolve(contentSourceID, context.ContextUser);
            if (!resolved.IsValid || !resolved.DriverClass) {
                const detail = resolved.Problems.map((p) => p.Message).join('; ') || 'missing DriverClass';
                LogError(
                    `DeleteStage: could not verify ownership of FileID on '${record.Identity.Key}' (ContentSource '${contentSourceID}': ${detail}); keeping the file.`,
                );
                return true;
            }
            const driver = MJGlobal.Instance.ClassFactory.TryCreateInstance<AutotagBase>(AutotagBase, resolved.DriverClass);
            if (!driver.Resolved || !driver.Instance) {
                LogError(
                    `DeleteStage: driver '${resolved.DriverClass}' for ContentSource '${contentSourceID}' is not registered; keeping the file on '${record.Identity.Key}'.`,
                );
                return true;
            }
            return driver.Instance.IsPushOnly === true;
        } catch (error) {
            LogError(
                `DeleteStage: failed to resolve ContentSource '${contentSourceID}' while checking file ownership for '${record.Identity.Key}' (${error instanceof Error ? error.message : String(error)}); keeping the file.`,
            );
            return true;
        }
    }

    /** Clear `FileID` on the owning Content Item before deleting its `MJ: Files` row, so `FK_ContentItem_File` does not block `spDeleteFile`. */
    private async detachFileFromRecord(record: WorkingRecord, context: StageContext): Promise<void> {
        const recordID = record.Identity.RecordID;
        if (record.Entity !== 'Content Item' || !recordID) {
            return;
        }
        const item = await context.Provider.GetEntityObject<MJContentItemEntity>('MJ: Content Items', context.ContextUser);
        if (!(await item.InnerLoad(CompositeKey.FromID(recordID)))) { // first-pk-ok: MJ core content entity, single-column ID
            throw new Error(`could not load Content Item '${recordID}' to clear FileID`);
        }
        item.FileID = null;
        if (!(await item.Save())) {
            throw new Error(
                `could not clear FileID on Content Item '${recordID}': ${item.LatestResult?.CompleteMessage ?? 'unknown error'}`,
            );
        }
    }

    /**
     * Remove the record's vector, driven by the `VectorRecordID` receipt Embed wrote, and routed the
     * way Embed routed the write — without the namespace Pinecone reports success and removes nothing.
     *
     * @returns Whether a vector was removed, or null when there is one and it could not be reached:
     *          the caller refuses to mark that record Deleted.
     */
    private async removeVector(record: WorkingRecord, context: StageContext): Promise<boolean | null> {
        const vectorRecordID = record.GetExtension<string>('Pipeline', 'vectorRecordID');
        if (!vectorRecordID) {
            return false;
        }
        const routes = await RouteVectorRecords([record], this.infrastructure(context), context.Provider, context.ContextUser);
        const route = routes.get(record.Identity.Key) ?? { Error: 'no route was resolved' };
        if (IsRouteFailure(route)) {
            LogError(`DeleteStage: '${record.Identity.Key}' has VectorRecordID '${vectorRecordID}' but its vector cannot be located: ${route.Error}`);
            return null;
        }
        const infra = route.Infrastructure;
        if (infra.vectorDB.IsReadOnly) {
            LogError(`DeleteStage: the vector database for '${record.Identity.Key}' is read-only, so its vector cannot be removed.`);
            return null;
        }
        if (context.IsTest) {
            return true;
        }
        try {
            const vector = { id: vectorRecordID, values: [], ...(route.Directives ? { providerTemporaryDirectives: route.Directives } : {}) };
            const response = await infra.vectorDB.DeleteRecords([vector], infra.indexName, infra.providerConfig);
            if (response.success === false) {
                throw new Error(response.message || 'the vector store refused the delete');
            }
            return true;
        } catch (error) {
            // Left Pending so the next attempt repeats the (idempotent) removal.
            throw new TransientStageError(
                `Removing the vector for '${record.Identity.Key}' failed: ${error instanceof Error ? error.message : String(error)}`,
                { cause: error },
            );
        }
    }

    /** One resolver per stage instance (a run), so each index's database and credential resolve once, not per record. */
    private infrastructure(context: StageContext): ContentVectorInfrastructure {
        this._infrastructure ??= new ContentVectorInfrastructure(context.Provider, context.ContextUser);
        return this._infrastructure;
    }
    private _infrastructure?: ContentVectorInfrastructure;
}

/** Delete over Content Item Chunk — the leaf case. */
@RegisterClass(BasePipelineStage, DELETE_STAGE)
export class DeleteStage extends BaseDeleteStage {
    public readonly Name = DELETE_STAGE;
    public readonly Entity: WorkingRecordEntity = 'Content Item Chunk';

    /**
     * Hard-delete a chunk nothing references; keep one that something does (a citation, a retrieval
     * log) as a tombstone. "Referenced" means any entity with a foreign key to Content Item Chunk,
     * read from metadata, so a layer above MJ gets this for its own usage tables.
     */
    protected override async Purge(record: WorkingRecord, context: StageContext): Promise<boolean> {
        const chunkID = record.Identity.RecordID;
        if (!chunkID || context.IsTest || (await this.isReferenced(chunkID, context))) {
            return false;
        }
        const chunk = await context.Provider.GetEntityObject<BaseEntity>('MJ: Content Item Chunks', context.ContextUser);
        if (!(await chunk.InnerLoad(CompositeKey.FromID(chunkID)))) { // first-pk-ok: MJ core content entity, single-column ID
            return false;
        }
        if (!(await chunk.Delete())) {
            // Not a failure of the delete: the vector is gone. The row stays as a tombstone.
            LogError(`DeleteStage: could not remove chunk row '${chunkID}'; keeping it as a tombstone`);
            return false;
        }
        record.SetExtension('Pipeline', 'purged', true);
        return true;
    }

    /** Whether any entity holds a foreign key to this chunk. */
    private async isReferenced(chunkID: string, context: StageContext): Promise<boolean> {
        const chunkEntity = context.Provider.EntityByName('MJ: Content Item Chunks');
        if (!chunkEntity) {
            return true; // Cannot tell, so keep it.
        }
        const rv = RunView.FromMetadataProvider(context.Provider);
        for (const relation of chunkEntity.RelatedEntities) {
            if (!relation.RelatedEntity || !relation.RelatedEntityJoinField) {
                continue;
            }
            const result = await rv.RunView(
                {
                    EntityName: relation.RelatedEntity,
                    ExtraFilter: WhereEqual({ [relation.RelatedEntityJoinField]: chunkID }),
                    ResultType: 'count_only',
                },
                context.ContextUser,
            );
            if (!result.Success || (result.TotalRowCount ?? 0) > 0) {
                // A failed check counts as referenced: losing history is worse than keeping a row.
                return true;
            }
        }
        return false;
    }
}

/** Delete over Content Item: removes its own artifacts, then marks its chunks and expanded items, which follow in turn. */
@RegisterClass(BasePipelineStage, DELETE_ITEM_STAGE)
export class DeleteContentItemStage extends BaseDeleteStage {
    public readonly Name = DELETE_ITEM_STAGE;
    public readonly Entity: WorkingRecordEntity = 'Content Item';

    protected override async markDependents(record: WorkingRecord, context: StageContext): Promise<number> {
        const recordID = record.Identity.RecordID;
        if (!recordID || context.IsTest) {
            return 0;
        }
        try {
            const service = new ContentPipelineDeleteMarker(context.Provider, context.ContextUser);
            return await service.MarkDependentsOf(recordID);
        } catch (error) {
            throw new TransientStageError(
                error instanceof Error ? error.message : String(error),
                { cause: error },
            );
        }
    }
}
