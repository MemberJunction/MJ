/**
 * @fileoverview {@link TagStage} — deciding what a record is about.
 *
 * Runs over Content Item; ready when `TaggingStatus = 'Pending'`. Classifies with MJ's managed
 * autotagging prompt ({@link ManagedPromptClassifier}) and saves the result to `MJ: Content Item Tags`,
 * promoting each new keyword into the governed taxonomy through the tag engine's bridge.
 *
 * @module @memberjunction/content-pipeline
 */

import { LogError, RunView } from '@memberjunction/core';
import { ContentItemTagBridge } from '@memberjunction/tag-engine';
import { MJContentItemChunkEntity, MJContentItemTagEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { AutotagKeyword } from '@memberjunction/content-autotagging';
import {
    BasePipelineStage,
    FatalStageError,
    Outcome,
    StageContext,
    StageDeclaration,
    StageOutcome,
    TransientStageError,
    WorkingRecord,
    WorkingRecordEntity,
} from '@memberjunction/content-pipeline-base';
import { ManagedPromptClassification, ManagedPromptClassifier } from '../ManagedPromptClassifier.js';
import { WhereEqual } from '../Filters.js';

/** The registered name. */
export const TAG_STAGE = 'Tag';

/** Classifies a record. Independent of Segment: both read the same text, in either order. */
@RegisterClass(BasePipelineStage, TAG_STAGE)
export class TagStage extends BasePipelineStage {
    public readonly Name = TAG_STAGE;
    public readonly Entity: WorkingRecordEntity = 'Content Item';
    public readonly StatusField = 'TaggingStatus';

    public override get Declaration(): StageDeclaration {
        return {
            Reads: ['Text', 'Title'],
            Writes: [],
            ReadsExtensions: [],
            WritesExtensions: [`${TAG_STAGE}.tags`],
        };
    }

    public async Run(record: WorkingRecord, context: StageContext): Promise<StageOutcome> {
        if (context.Signal.aborted) {
            return Outcome.Retry('cancelled before tagging started');
        }
        const text = record.Get('Text');
        if (typeof text !== 'string' || text.trim().length === 0) {
            return Outcome.Skipped('no text to classify');
        }

        const result = await this.classify(record, text, context);
        record.SetExtension(TAG_STAGE, 'tags', result.Keywords);
        if (result.Keywords.length === 0) {
            // Nothing concluded is not "no tags apply": replacing the item's tags with an empty set
            // would wipe good tags whenever a model call came back thin.
            const why = result.IsValidContent ? 'returned no tags' : 'judged this not to be the configured content type';
            return Outcome.Skipped(`the model ${why}; existing tags kept`);
        }

        const changes = await this.persistTags(record, result, context);
        if (changes.Changed) {
            // Tags ride in the vector's metadata; an embedded record needs that refreshed, not re-embedded.
            await this.flagMetadataRefresh(record, context);
        }
        context.ReportProgress(`classified into ${result.Keywords.length} tag(s)`);
        return Outcome.Complete(`${result.Keywords.length} tag(s): ${changes.Added} added, ${changes.Removed} removed`);
    }

    /** Run the classifier; a failure reached a model or a service, so it is retried unless it says it is fatal. */
    private async classify(record: WorkingRecord, text: string, context: StageContext): Promise<ManagedPromptClassification> {
        try {
            return await new ManagedPromptClassifier().Classify(
                text,
                (record.Get('Title') as string | null) ?? null,
                record.GetExtension<string>('Pipeline', 'contentSourceID') ?? null,
                context,
            );
        } catch (error) {
            if (error instanceof FatalStageError) {
                throw error;
            }
            throw new TransientStageError(`Classifying failed: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
        }
    }

    /**
     * Make `MJ: Content Item Tags` match the classification. A diff, not delete-then-insert: a
     * surviving tag keeps its row and its taxonomy link. A tag that fails to save is logged rather
     * than failing the record — not worth re-running the model call that produced the rest.
     */
    private async persistTags(
        record: WorkingRecord,
        result: ManagedPromptClassification,
        context: StageContext,
    ): Promise<{ Changed: boolean; Added: number; Removed: number }> {
        const itemID = record.Identity.RecordID;
        if (!itemID || context.IsTest) {
            // A test run computes everything and commits nothing.
            return { Changed: false, Added: 0, Removed: 0 };
        }
        const existing = await this.existingTags(itemID, context);
        const wanted = new Map(result.Keywords.map((keyword) => [keyword.Tag.toLowerCase(), keyword]));

        let added = 0;
        const bridge = new ContentItemTagBridge(context.Provider);
        for (const [name, keyword] of wanted) {
            const kept = existing.get(name);
            if (kept) {
                if (kept.Weight !== keyword.Weight) {
                    kept.Weight = keyword.Weight;
                    await this.save(kept, itemID);
                }
                continue;
            }
            const tag = await this.newTag(itemID, keyword, result.PromptRunID, context);
            if (await this.save(tag, itemID)) {
                added++;
                await bridge.Bridge(tag, keyword.ParentTag, context.ContextUser);
            }
        }

        let removed = 0;
        for (const [name, row] of existing) {
            if (!wanted.has(name)) {
                if (await row.Delete()) {
                    removed++;
                } else {
                    LogError(`TagStage: failed to delete Content Item Tag '${row.Tag}' for '${itemID}': ${row.LatestResult?.CompleteMessage ?? 'unknown error'}`);
                }
            }
        }
        return { Changed: added > 0 || removed > 0, Added: added, Removed: removed };
    }

    /** A new tag row, with the prompt run that produced it and the model's reasoning, as the autotagger records them. */
    private async newTag(itemID: string, keyword: AutotagKeyword, promptRunID: string | null, context: StageContext): Promise<MJContentItemTagEntity> {
        const tag = await context.Provider.GetEntityObject<MJContentItemTagEntity>('MJ: Content Item Tags', context.ContextUser);
        tag.NewRecord();
        tag.ItemID = itemID;
        tag.Tag = keyword.Tag;
        tag.Weight = keyword.Weight;
        if (promptRunID) {
            tag.AIPromptRunID = promptRunID;
        }
        if (keyword.Reasoning) {
            tag.Reasoning = keyword.Reasoning;
        }
        return tag;
    }

    private async save(tag: MJContentItemTagEntity, itemID: string): Promise<boolean> {
        const saved = await tag.Save();
        if (!saved) {
            LogError(`TagStage: could not save tag '${tag.Tag}' for content item '${itemID}': ${tag.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }
        return saved;
    }

    /** The item's current tags, by lower-cased name. */
    private async existingTags(itemID: string, context: StageContext): Promise<Map<string, MJContentItemTagEntity>> {
        const result = await RunView.FromMetadataProvider(context.Provider).RunView<MJContentItemTagEntity>(
            { EntityName: 'MJ: Content Item Tags', ExtraFilter: WhereEqual({ ItemID: itemID }), ResultType: 'entity_object' },
            context.ContextUser,
        );
        if (!result.Success) {
            // Without knowing what is there, a diff would delete nothing and duplicate everything.
            throw new TransientStageError(`Reading the existing tags for '${itemID}' failed: ${result.ErrorMessage}`);
        }
        return new Map(result.Results.map((row) => [row.Tag.trim().toLowerCase(), row]));
    }

    /**
     * Ask Embed to refresh the stored metadata of everything already embedded for this item. Only
     * where embedding is `Complete`: a Pending record gets the new tags anyway, a Failed one has no
     * vector. The item's status rides on its commit; its chunks are written here.
     */
    private async flagMetadataRefresh(record: WorkingRecord, context: StageContext): Promise<void> {
        if (record.GetExtension<string>('Pipeline', 'embeddingStatus') === 'Complete') {
            record.SetExtension('Pipeline', 'columns', {
                ...(record.GetExtension<Record<string, unknown>>('Pipeline', 'columns') ?? {}),
                EmbeddingStatus: 'MetadataOnly',
            });
        }
        const itemID = record.Identity.RecordID;
        if (!itemID) {
            return;
        }
        const chunks = await RunView.FromMetadataProvider(context.Provider).RunView<MJContentItemChunkEntity>(
            {
                EntityName: 'MJ: Content Item Chunks',
                ExtraFilter: WhereEqual({ ContentItemID: itemID, EmbeddingStatus: 'Complete', DeleteStatus: null }),
                ResultType: 'entity_object',
            },
            context.ContextUser,
        );
        if (!chunks.Success) {
            LogError(`TagStage: could not flag the chunks of '${itemID}' for a metadata refresh: ${chunks.ErrorMessage}`);
            return;
        }
        for (const chunk of chunks.Results) {
            chunk.EmbeddingStatus = 'MetadataOnly';
            if (!(await chunk.Save())) {
                LogError(`TagStage: could not flag chunk '${chunk.ID}' for a metadata refresh`);
            }
        }
    }
}
