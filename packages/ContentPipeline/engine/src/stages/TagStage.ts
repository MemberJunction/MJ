/**
 * @fileoverview {@link TagStage} — deciding what a record is about.
 *
 * Runs over Content Item; ready when `TaggingStatus = 'Pending'`. Classification itself is
 * delegated to a registered classifier rather than reimplemented here, so the governed tag
 * hierarchy and its per-tag controls stay where they already live.
 *
 * @module @memberjunction/content-pipeline
 */

import { LogError, RunView } from '@memberjunction/core';

import { ContentItemTagBridge } from '@memberjunction/tag-engine';
import { MANAGED_PROMPT_CLASSIFIER } from '../ManagedPromptClassifier.js';
import { MJContentItemChunkEntity, MJContentItemTagEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import {
    BaseContentClassifier,
    ClassifiedTag,
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
import { WhereEqual } from '../Filters.js';

/** The registered name. */
export const TAG_STAGE = 'Tag';

/**
 * Classifies a record through its deployment's registered classifier.
 *
 * Independent of Segment: the two read the same text and neither needs the other's output, so they
 * can run in either order or not at all.
 */
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
            WritesExtensions: [`${TAG_STAGE}.tags`, `${TAG_STAGE}.classifierKey`],
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

        const classifier = this.resolveClassifier(context);
        let result;
        try {
            result = await classifier.Classify({
                Text: text,
                Title: (record.Get('Title') as string | null) ?? null,
                RecordID: record.Identity.RecordID,
                ContentSourceID: record.GetExtension<string>('Pipeline', 'contentSourceID') ?? null,
                Parameters: (context.Configuration.Parameters as Record<string, string>) ?? {},
                ContextUser: context.ContextUser,
                Provider: context.Provider,
                Signal: context.Signal,
                ReportProgress: (m) => context.ReportProgress(m),
            });
        } catch (error) {
            // A classifier usually reaches a model or a service, so a failure is worth retrying
            // unless it says otherwise by throwing a fatal error itself.
            if (error instanceof FatalStageError) {
                throw error;
            }
            throw new TransientStageError(
                `Classifying with '${classifier.Key}' failed: ${error instanceof Error ? error.message : String(error)}`,
                { cause: error },
            );
        }

        record.SetExtension(TAG_STAGE, 'tags', result.Tags);
        record.SetExtension(TAG_STAGE, 'classifierKey', classifier.Key);
        for (const [key, value] of Object.entries(result.Extensions ?? {})) {
            record.SetExtension(`${TAG_STAGE}.${classifier.Key}`, key, value);
        }

        if (result.Tags.length === 0) {
            // Nothing concluded is not "no tags apply". Replacing the item's tags with an empty set
            // would wipe good tags every time a model call came back thin — so they are kept.
            return Outcome.Skipped(`${classifier.Key} returned no tags; existing tags kept`);
        }

        // The extension space alone is not a destination: tags left there vanish when the run ends.
        // MJ already has the table for this, so they are written to MJ: Content Item Tags.
        const changes = await this.persistTags(record, result.Tags, context);
        if (changes.Changed) {
            // Tags ride in the vector's metadata. A record already embedded needs that metadata
            // refreshed — but not a new vector, since its text did not change.
            await this.flagMetadataRefresh(record, context);
        }

        context.ReportProgress(`classified into ${result.Tags.length} tag(s)`);
        return Outcome.Complete(
            `${result.Tags.length} tag(s) via ${classifier.Key}: ${changes.Added} added, ${changes.Removed} removed`,
        );
    }

    /**
     * Make `MJ: Content Item Tags` match what the classifier just concluded.
     *
     * A diff rather than delete-everything-then-insert: a tag that survives keeps its row (and its
     * link into the taxonomy), and nothing is removed until the replacement set is known to be
     * non-empty. A tag that fails to save is logged rather than failing the record — losing one tag
     * is not worth re-running the model call that produced the rest.
     */
    private async persistTags(
        record: WorkingRecord,
        tags: readonly ClassifiedTag[],
        context: StageContext,
    ): Promise<{ Changed: boolean; Added: number; Removed: number }> {
        const itemID = record.Identity.RecordID;
        if (!itemID || context.IsTest) {
            // A test run computes everything and commits nothing.
            return { Changed: false, Added: 0, Removed: 0 };
        }

        const existing = await this.existingTags(itemID, context);
        const wanted = new Map<string, ClassifiedTag>();
        for (const tag of tags) {
            wanted.set(tag.Name.trim().toLowerCase(), tag);
        }

        let added = 0;
        const bridge = new ContentItemTagBridge(context.Provider);
        for (const [name, tag] of wanted) {
            const kept = existing.get(name);
            if (kept) {
                const weight = this.weightOf(tag);
                if (weight !== null && kept.Weight !== weight) {
                    kept.Weight = weight;
                    await kept.Save();
                }
                continue;
            }
            const entity = await context.Provider.GetEntityObject<MJContentItemTagEntity>(
                'MJ: Content Item Tags',
                context.ContextUser,
            );
            entity.NewRecord();
            entity.ItemID = itemID;
            entity.Tag = tag.Name;
            const weight = this.weightOf(tag);
            if (weight !== null) {
                entity.Weight = weight;
            }
            if (await entity.Save()) {
                added++;
                // Promote the keyword into the governed taxonomy — through the tag engine, the same
                // bridge the autotagger uses, and with no dependency on the autotagger being loaded.
                await bridge.Bridge(entity, tag.Parent ?? null, context.ContextUser);
            } else {
                LogError(
                    `TagStage: could not save tag '${tag.Name}' for content item '${itemID}': ` +
                        `${entity.LatestResult?.CompleteMessage ?? 'unknown error'}`,
                );
            }
        }

        let removed = 0;
        for (const [name, row] of existing) {
            if (!wanted.has(name) && (await row.Delete())) {
                removed++;
            }
        }
        return { Changed: added > 0 || removed > 0, Added: added, Removed: removed };
    }

    /** The item's current tags, by normalized name. */
    private async existingTags(itemID: string, context: StageContext): Promise<Map<string, MJContentItemTagEntity>> {
        const rv = RunView.FromMetadataProvider(context.Provider);
        const result = await rv.RunView<MJContentItemTagEntity>(
            {
                EntityName: 'MJ: Content Item Tags',
                ExtraFilter: WhereEqual({ ItemID: itemID }),
                ResultType: 'entity_object',
            },
            context.ContextUser,
        );
        if (!result.Success) {
            // Without knowing what is there, a diff would delete nothing and duplicate everything.
            throw new TransientStageError(`Reading the existing tags for '${itemID}' failed: ${result.ErrorMessage}`);
        }
        const byName = new Map<string, MJContentItemTagEntity>();
        for (const row of result.Results) {
            byName.set(row.Tag.trim().toLowerCase(), row);
        }
        return byName;
    }

    private weightOf(tag: ClassifiedTag): number | null {
        return typeof tag.Score === 'number' ? Math.max(0, Math.min(1, tag.Score)) : null;
    }

    /**
     * Ask Embed to refresh the stored metadata of everything already embedded for this item.
     *
     * `MetadataOnly` is set only where embedding is `Complete`: a record still Pending will be
     * embedded with the new tags anyway, and one that Failed has no vector to update. The item's own
     * status rides on its commit; its chunks are written here, since nothing else visits them.
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

    /** The classifier this run uses. */
    private resolveClassifier(context: StageContext): BaseContentClassifier {
        // Defaults to MJ's managed autotagging prompt rather than refusing. A Tag stage that has to
        // be told which classifier to use before it will do anything is a stage nobody turns on.
        const configured = context.Configuration.ClassifierKey;
        const key =
            typeof configured === 'string' && configured.length > 0 ? configured : MANAGED_PROMPT_CLASSIFIER;
        const classifier = BaseContentClassifier.Resolve(key);
        if (!classifier) {
            throw new FatalStageError(
                `Classifier '${key}' is not registered. Check that the package registering it has been loaded.`,
            );
        }
        return classifier;
    }
}
