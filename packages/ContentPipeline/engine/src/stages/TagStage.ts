/**
 * @fileoverview {@link TagStage} — deciding what a record is about.
 *
 * Runs over Content Item; ready when `TaggingStatus = 'Pending'`. Classification itself is
 * delegated to a registered classifier rather than reimplemented here, so the governed tag
 * hierarchy and its per-tag controls stay where they already live.
 *
 * @module @memberjunction/content-pipeline
 */

import { CompositeKey, LogError, RunView } from '@memberjunction/core';
import { MJContentItemTagEntity } from '@memberjunction/core-entities';
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

        // The extension space alone is not a destination. Tags left there vanish when the run ends,
        // which made a successful Tag stage a no-op: the record went Complete and nothing was
        // tagged. MJ already has the table for this, so they are written to MJ: Content Item Tags.
        const saved = await this.persistTags(record, result.Tags, context);

        context.ReportProgress(`classified into ${result.Tags.length} tag(s)`);
        return Outcome.Complete(`${saved} of ${result.Tags.length} tag(s) saved via ${classifier.Key}`);
    }

    /**
     * Write the classifier's tags to `MJ: Content Item Tags`.
     *
     * Replace rather than append: a re-tagged item should end up with what the classifier just
     * concluded, not that plus everything it ever concluded before. Existing rows are removed first,
     * and a tag that fails to save is logged rather than failing the record — losing one tag is not
     * worth re-running the model call that produced the other forty.
     */
    private async persistTags(
        record: WorkingRecord,
        tags: readonly ClassifiedTag[],
        context: StageContext,
    ): Promise<number> {
        const itemID = record.Identity.RecordID;
        if (!itemID || context.IsTest) {
            // A test run computes everything and commits nothing; an uncommitted record has no id to
            // hang tags from.
            return 0;
        }

        const rv = RunView.FromMetadataProvider(context.Provider);
        const existing = await rv.RunView<{ ID: string }>(
            { EntityName: 'MJ: Content Item Tags', ExtraFilter: `ItemID='${itemID}'` },
            context.ContextUser,
        );
        if (existing.Success) {
            for (const row of existing.Results) {
                const entity = await context.Provider.GetEntityObject<MJContentItemTagEntity>(
                    'MJ: Content Item Tags',
                    context.ContextUser,
                );
                if (await entity.InnerLoad(CompositeKey.FromID(row.ID))) { // first-pk-ok: MJ core content entity, single-column ID
                    await entity.Delete();
                }
            }
        }

        let saved = 0;
        for (const tag of tags) {
            const entity = await context.Provider.GetEntityObject<MJContentItemTagEntity>(
                'MJ: Content Item Tags',
                context.ContextUser,
            );
            entity.NewRecord();
            entity.ItemID = itemID;
            entity.Tag = tag.Name;
            if (typeof tag.Score === 'number') {
                entity.Weight = Math.max(0, Math.min(1, tag.Score));
            }
            if (await entity.Save()) {
                saved++;
            } else {
                LogError(
                    `TagStage: could not save tag '${tag.Name}' for content item '${itemID}': ` +
                        `${entity.LatestResult?.CompleteMessage ?? 'unknown error'}`,
                );
            }
        }
        return saved;
    }

    /** The classifier this run uses. */
    private resolveClassifier(context: StageContext): BaseContentClassifier {
        const key = context.Configuration.ClassifierKey;
        if (typeof key !== 'string' || key.length === 0) {
            throw new FatalStageError(
                "No classifier is configured. Set ClassifierKey in the Record Process's Options.",
            );
        }
        const classifier = BaseContentClassifier.Resolve(key);
        if (!classifier) {
            throw new FatalStageError(
                `Classifier '${key}' is not registered. Check that the package registering it has been loaded.`,
            );
        }
        return classifier;
    }
}
