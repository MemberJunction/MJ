/**
 * @fileoverview {@link TagStage} — deciding what a record is about.
 *
 * Runs over Content Item; ready when `TaggingStatus = 'Pending'`. Classification itself is
 * delegated to a registered classifier rather than reimplemented here, so the governed tag
 * hierarchy and its per-tag controls stay where they already live.
 *
 * @module @memberjunction/content-pipeline
 */

import { RegisterClass } from '@memberjunction/global';
import {
    BaseContentClassifier,
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

        // Tags are written to the extension space rather than a well-known field: what a deployment
        // does with them — formal Tag rows, suggestions, something else — is its own business, and
        // the pipeline has no column that would mean the same thing to everyone.
        record.SetExtension(TAG_STAGE, 'tags', result.Tags);
        record.SetExtension(TAG_STAGE, 'classifierKey', classifier.Key);
        for (const [key, value] of Object.entries(result.Extensions ?? {})) {
            record.SetExtension(`${TAG_STAGE}.${classifier.Key}`, key, value);
        }

        context.ReportProgress(`classified into ${result.Tags.length} tag(s)`);
        return Outcome.Complete(`${result.Tags.length} tag(s) via ${classifier.Key}`);
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
