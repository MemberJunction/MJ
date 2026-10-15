/**
 * @fileoverview {@link DeleteStage} — removing what a record put into outside systems.
 *
 * Runs over Content Item Chunk and Content Item; ready when `DeleteStatus = 'Pending'`.
 *
 * Delete is not part of the forward flow and does not need to be: a stage is a readiness condition
 * plus a processor, and deletion is exactly that.
 *
 * **Removes first, marks second.** A crash midway therefore leaves the record still `Pending`, and
 * the next attempt simply repeats an idempotent removal. Marking first and removing second would
 * leave orphaned vectors and files that nothing knows to clean up.
 *
 * The row is kept as a tombstone rather than deleted, so a later re-discovery can tell "removed on
 * purpose" from "never seen".
 *
 * @module @memberjunction/content-pipeline
 */

import { BaseEntity, CompositeKey, LogError, RunView } from '@memberjunction/core';
import { MJFileEntity } from '@memberjunction/core-entities';
import { FileStorageEngine } from '@memberjunction/storage';
import { RegisterClass } from '@memberjunction/global';
import { IsRouteFailure, VectorRecordRouter } from '../VectorRouting.js';
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
import { WhereEqual } from '../Filters.js';

/** The registered name for the chunk-level stage. */
export const DELETE_STAGE = 'Delete';
/** The registered name for the item-level stage. */
export const DELETE_ITEM_STAGE = 'DeleteContentItem';

/**
 * Removes a record's vectors and durable copies, then marks it deleted.
 *
 * Delete is the one stage that has to know every outside system any stage writes to — today the
 * vector store and durable file copies. Having each stage undo its own outputs would keep stages
 * fully independent but spread deletion across all of them; with two such systems, one stage is
 * simpler.
 */
export abstract class BaseDeleteStage extends BasePipelineStage {
    public readonly StatusField = 'DeleteStatus';

    /**
     * `DeleteStatus` is a two-value marker — Pending until the outside-system cleanup has run,
     * Deleted once it has. 'Complete' is not in its CHECK constraint, so a stage that finished
     * its deletion has to say so in the column's own vocabulary.
     */
    public override get CompleteStatus(): string {
        return 'Deleted';
    }

    /**
     * Neither 'Skipped' nor 'Failed' is in `DeleteStatus`'s CHECK constraint, and either would
     * assert something untrue: the record's vector or kept bytes are still out there. It stays
     * Pending — the failure is in the run's detail row — so the next Delete run tries again.
     */
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

        // Deleting an item marks everything beneath it for removal: its chunks, and any items it
        // expanded into. Each then runs through this same stage — removal stays one operation
        // rather than something every stage has to re-implement for its own outputs.
        const marked = await this.markDependents(record, context);
        if (marked > 0) {
            removed.push(`${marked} dependent record(s) marked`);
        }

        record.SetExtension(this.Name, 'removed', removed);
        if (skipped.length > 0) {
            // Something this record produced is still out there and could not be reached. The commit
            // that follows would write DeleteStatus = 'Deleted', which asserts the opposite and would
            // strand it permanently — nothing revisits a Deleted row. Leaving it Pending is what lets
            // a later run, with the configuration fixed, finish the job.
            record.SetExtension(this.Name, 'skipped', skipped);
            return Outcome.Skipped(
                `could not remove ${skipped.join(', ')} — left pending rather than marked deleted`,
            );
        }
        // Getting here means every removal either succeeded or was genuinely unnecessary, which is
        // what makes marking safe.
        if (await this.Purge(record, context)) {
            removed.push('row');
        }
        return Outcome.Complete(removed.length > 0 ? `removed ${removed.join(', ')}` : 'nothing to remove');
    }

    /**
     * Mark whatever depends on this record for deletion.
     *
     * Nothing for a chunk, which is a leaf. For an item: its chunks, and the items it expanded into,
     * which recurse naturally because each marked item runs through this stage in turn.
     */
    protected async markDependents(_record: WorkingRecord, _context: StageContext): Promise<number> {
        return 0;
    }

    /**
     * Remove the row itself, once everything outside it is gone.
     *
     * The base keeps every row as a tombstone. A variant whose rows carry no history worth keeping
     * overrides this; returning true tells the processor there is no row left to commit a status to.
     */
    protected async Purge(_record: WorkingRecord, _context: StageContext): Promise<boolean> {
        return false;
    }

    /**
     * Remove the bytes this record was kept as, if any.
     *
     * The stage's own description says it owns every outside-system artifact, and the durable copy
     * is one: leaving the object behind means a deleted item's content is still sitting in the
     * storage account. Both the object and its `MJ: Files` row go.
     *
     * @returns Whether a copy was removed, or null when there is one and it could not be reached.
     */
    private async removeDurableCopy(record: WorkingRecord, context: StageContext): Promise<boolean | null> {
        const fileID = record.GetExtension<string>('Pipeline', 'fileID');
        if (!fileID) {
            return false;
        }
        try {
            const file = await context.Provider.GetEntityObject<MJFileEntity>('MJ: Files', context.ContextUser);
            if (!(await file.InnerLoad(CompositeKey.FromID(fileID)))) { // first-pk-ok: MJ core entity, single-column ID
                // The row is already gone; nothing is stranded.
                return false;
            }
            await FileStorageEngine.Instance.Config(false, context.ContextUser, context.Provider);
            const accounts = FileStorageEngine.Instance.GetAccountsByProviderID(file.ProviderID);
            if (accounts.length === 0) {
                LogError(
                    `DeleteStage: no storage account for provider '${file.ProviderID}', so the kept copy ` +
                        `'${fileID}' cannot be removed.`,
                );
                return null;
            }
            const driver = await FileStorageEngine.Instance.GetDriver(accounts[0].ID, context.ContextUser);
            await driver.DeleteObject(file.ProviderKey ?? file.Name);
            // The row goes after the object, so a failure between the two leaves a row pointing at a
            // missing object rather than an object nothing points at.
            await file.Delete();
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
     * Remove the record's vector.
     *
     * Driven by `VectorRecordID` — the receipt Embed wrote. A record that never carried one has no
     * vector to remove, which is genuinely absent; a record that carries one and whose removal could
     * not be attempted is NOT, and the difference decides whether this record may be marked Deleted.
     *
     * Routed through the same {@link VectorRecordRouter} Embed writes through, so the delete reaches
     * the index AND the namespace the write did. Without the namespace Pinecone reports success and
     * removes nothing.
     *
     * @returns Whether a vector was removed, or null when removal was skipped rather than
     *          unnecessary — the caller refuses to mark a skipped record Deleted.
     */
    private async removeVector(record: WorkingRecord, context: StageContext): Promise<boolean | null> {
        const vectorRecordID = record.GetExtension<string>('Pipeline', 'vectorRecordID');
        if (!vectorRecordID) {
            // Nothing was ever embedded for this record.
            return false;
        }
        const routes = await VectorRecordRouter.Create(context.Provider, context.ContextUser).Route([record]);
        const route = routes.get(record.Identity.Key) ?? { Error: 'no route was resolved' };
        if (IsRouteFailure(route)) {
            // There IS a vector, and no way to work out where it lives. Skipped, not absent.
            LogError(
                `DeleteStage: '${record.Identity.Key}' has VectorRecordID '${vectorRecordID}' but its vector ` +
                    `cannot be located: ${route.Error}`,
            );
            return null;
        }
        const target = route.Target;
        if (target.Database.IsReadOnly) {
            LogError(
                `DeleteStage: the vector database for '${record.Identity.Key}' is read-only, so its ` +
                    'vector cannot be removed.',
            );
            return null;
        }
        try {
            const response = await target.Database.DeleteRecords(
                [
                    {
                        id: vectorRecordID,
                        values: [],
                        ...(route.Directives ? { providerTemporaryDirectives: route.Directives } : {}),
                    },
                ],
                target.IndexName,
                target.ProviderConfig,
            );
            if (response.success === false) {
                throw new Error(response.message || 'the vector store refused the delete');
            }
            return true;
        } catch (error) {
            // Leave the record Pending so the next attempt repeats the removal. Removal is
            // idempotent, so repeating it is harmless; marking it deleted now would strand the
            // vector forever.
            throw new TransientStageError(
                `Removing the vector for '${record.Identity.Key}' failed: ` +
                    `${error instanceof Error ? error.message : String(error)}`,
                { cause: error },
            );
        }
    }
}

/**
 * Delete over Content Item Chunk — the leaf case.
 */
@RegisterClass(BasePipelineStage, DELETE_STAGE)
export class DeleteStage extends BaseDeleteStage {
    public readonly Name = DELETE_STAGE;
    public readonly Entity: WorkingRecordEntity = 'Content Item Chunk';

    /**
     * Hard-delete a chunk nothing references; keep one that something does.
     *
     * A superseded chunk is noise once its vector is gone — unless something recorded that it was
     * used: a citation, a retrieval log, feedback. That history is only meaningful while the chunk
     * it points at exists, so such a chunk stays as a tombstone (`DeleteStatus = 'Deleted'`).
     *
     * "Referenced" is read from metadata, not hardcoded: any entity with a foreign key to Content
     * Item Chunk counts, including ones a layer above MJ adds for its own usage tracking. That layer
     * gets soft-deletion for its used chunks without this stage knowing it exists.
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

/**
 * Delete over Content Item.
 *
 * Removes the item's own outside-system artifacts, then marks its chunks and any items it expanded
 * into — which the stage then removes in their own turn, to arbitrary depth.
 */
@RegisterClass(BasePipelineStage, DELETE_ITEM_STAGE)
export class DeleteContentItemStage extends BaseDeleteStage {
    public readonly Name = DELETE_ITEM_STAGE;
    public readonly Entity: WorkingRecordEntity = 'Content Item';

    protected override async markDependents(record: WorkingRecord, context: StageContext): Promise<number> {
        const recordID = record.Identity.RecordID;
        if (!recordID) {
            return 0;
        }
        const service = new ContentPipelineDeleteMarker(context.Provider, context.ContextUser);
        return service.MarkDependentsOf(recordID);
    }
}
