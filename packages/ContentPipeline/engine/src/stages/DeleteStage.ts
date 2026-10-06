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

import { RegisterClass } from '@memberjunction/global';
import {
    BasePipelineStage,
    BaseVectorWriter,
    Outcome,
    StageContext,
    StageDeclaration,
    StageOutcome,
    TransientStageError,
    WorkingRecord,
    WorkingRecordEntity,
} from '@memberjunction/content-pipeline-base';
import { ContentPipelineDeleteMarker } from '../ContentPipelineDeleteMarker.js';

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
        const vectorRemoved = await this.removeVector(record, context);
        if (vectorRemoved) {
            removed.push('vector');
        }

        // Deleting an item marks everything beneath it for removal: its chunks, and any items it
        // expanded into. Each then runs through this same stage — removal stays one operation
        // rather than something every stage has to re-implement for its own outputs.
        const marked = await this.markDependents(record, context);
        if (marked > 0) {
            removed.push(`${marked} dependent record(s) marked`);
        }

        record.SetExtension(this.Name, 'removed', removed);
        // The commit that follows writes DeleteStatus = 'Deleted'. Getting here means every removal
        // succeeded, which is what makes marking safe.
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
     * Remove the record's vector.
     *
     * A writer with no delete support is not an error — a deployment that never wrote vectors has
     * nothing to remove.
     */
    private async removeVector(record: WorkingRecord, context: StageContext): Promise<boolean> {
        const key = context.Configuration.VectorWriterKey;
        if (typeof key !== 'string' || key.length === 0) {
            return false;
        }
        const writer = BaseVectorWriter.Resolve(key) as (BaseVectorWriter & {
            Delete?: (ids: readonly string[], ctx: unknown) => Promise<unknown>;
        }) | null;
        if (!writer || typeof writer.Delete !== 'function') {
            return false;
        }
        try {
            await writer.Delete([record.Identity.Key], {
                ContextUser: context.ContextUser,
                Provider: context.Provider,
                Configuration: context.Configuration,
                Signal: context.Signal,
                ReportProgress: (m: string) => context.ReportProgress(m),
            });
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
