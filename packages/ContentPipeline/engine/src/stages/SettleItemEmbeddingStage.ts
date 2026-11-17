/**
 * @fileoverview {@link SettleItemEmbeddingStage} — the sweep that settles an item's `EmbeddingStatus` from its chunks.
 *
 * The pipeline settles an item right after the Embed page that embeds its last chunk. If the process stops
 * between committing those chunks and settling the item, nothing else would: the chunks are no longer
 * selected by Embed. The `Content Pipeline — Settle Item Embedding` Record Process selects such items (cut,
 * not yet settled, every live chunk settled) and runs this stage over them.
 *
 * @module @memberjunction/content-pipeline
 */

import { RegisterClass } from '@memberjunction/global';
import { BasePipelineStage, Outcome, StageContext, StageOutcome, WorkingRecord, WorkingRecordEntity } from '@memberjunction/content-pipeline-base';
import { ItemEmbeddingRollup } from '../ItemEmbeddingRollup.js';

/** The registered name. */
export const SETTLE_ITEM_EMBEDDING_STAGE = 'SettleItemEmbedding';

/**
 * Writes the item's `EmbeddingStatus` itself, through {@link ItemEmbeddingRollup}, the same writer the Embed
 * page uses; it has no status column of its own for the committer to advance.
 */
@RegisterClass(BasePipelineStage, SETTLE_ITEM_EMBEDDING_STAGE)
export class SettleItemEmbeddingStage extends BasePipelineStage {
    public readonly Name = SETTLE_ITEM_EMBEDDING_STAGE;
    public readonly Entity: WorkingRecordEntity = 'Content Item';
    public readonly StatusField = null;

    public async Run(record: WorkingRecord, context: StageContext): Promise<StageOutcome> {
        const itemID = record.Identity.RecordID;
        if (!itemID) {
            return Outcome.Skipped('the item is not saved yet');
        }
        const [settled] = await new ItemEmbeddingRollup(context.Provider, context.ContextUser).Settle([itemID], !context.IsTest);
        if (!settled?.Status) {
            return Outcome.Skipped('its chunks are not all embedded yet');
        }
        const verb = context.IsTest ? 'would be' : settled.Written ? 'set to' : 'already';
        return Outcome.Complete(`EmbeddingStatus ${verb} ${settled.Status}`);
    }
}
