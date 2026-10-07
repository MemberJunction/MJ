/**
 * @fileoverview {@link SegmentStage} — splitting a record's text into embeddable units.
 *
 * Runs over Content Item; ready when `SegmentationStatus = 'Pending'`. Delegates the actual
 * chunking to `@memberjunction/ai-segmentation`, which already provides exactly what this needs: a
 * registered strategy resolved by key, with safe degradation when a key does not resolve, and the
 * `SegmenterKey` cascade already modelled on Content Source / Content Type / Content Item Chunk.
 *
 * Each produced segment becomes a child working record targeting Content Item Chunk.
 *
 * @module @memberjunction/content-pipeline
 */

import { KnowledgeHubMetadataEngine } from '@memberjunction/core-entities';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { ResolveSegmenter } from '@memberjunction/ai-segmentation';
import {
    BasePipelineStage,
    Outcome,
    StageContext,
    StageDeclaration,
    StageOutcome,
    TransientStageError,
    WorkingRecord,
    WorkingRecordEntity,
    WorkingRecordIdentity,
    ResolveConfidence,
    ResolvedConfidenceScale,
} from '@memberjunction/content-pipeline-base';

/** The registered name. */
export const SEGMENT_STAGE = 'Segment';

/**
 * Splits a record's text into chunks.
 *
 * Depends on Extract only for there being text to chunk, not on any shared code — which is what
 * lets it be reordered, skipped or replaced without touching Extract.
 */
@RegisterClass(BasePipelineStage, SEGMENT_STAGE)
export class SegmentStage extends BasePipelineStage {
    public readonly Name = SEGMENT_STAGE;
    public readonly Entity: WorkingRecordEntity = 'Content Item';
    public readonly StatusField = 'SegmentationStatus';

    public override get Declaration(): StageDeclaration {
        return {
            Reads: ['Text', 'Modality', 'Decorator'],
            Writes: [],
            ReadsExtensions: [],
            WritesExtensions: [`${SEGMENT_STAGE}.segmenterKey`, `${SEGMENT_STAGE}.segmentCount`],
        };
    }

    public async Run(record: WorkingRecord, context: StageContext): Promise<StageOutcome> {
        if (context.Signal.aborted) {
            return Outcome.Retry('cancelled before segmentation started');
        }
        const text = record.Get('Text');
        if (typeof text !== 'string' || text.trim().length === 0) {
            // Not a failure: a record with no text is simply nothing to segment. Extract decides
            // whether the absence of text is a problem; this stage does not second-guess it.
            return Outcome.Skipped('no text to segment');
        }

        const requestedKey = await this.segmenterKey(record, context);
        // ResolveSegmenter never returns null — an unresolvable key degrades to a safe default and
        // says so through the key it reports, which is why the key that actually ran is recorded.
        const segmenter = ResolveSegmenter(requestedKey ?? undefined);

        let result;
        try {
            result = await segmenter.Segment({
                Text: text,
                Options: (context.Configuration.SegmentationOptions as Record<string, unknown>) ?? {},
            } as never);
        } catch (error) {
            throw new TransientStageError(
                `Segmenting with '${segmenter.Key}' failed: ${error instanceof Error ? error.message : String(error)}`,
                { cause: error },
            );
        }

        if (!result.Success) {
            return Outcome.Fatal(`Segmentation failed: ${result.ErrorMessage ?? 'unknown reason'}`);
        }
        if (result.Segments.length === 0) {
            return Outcome.Skipped('segmentation produced no segments');
        }

        const confidence = ResolveConfidence(context.Configuration);
        const decorator = record.Get('Decorator');
        for (const segment of result.Segments) {
            record.AddChild(this.toChunk(record, segment, decorator, confidence));
        }
        record.SetExtension(SEGMENT_STAGE, 'segmenterKey', result.SegmenterKey);
        record.SetExtension(SEGMENT_STAGE, 'segmentCount', result.Segments.length);
        context.ReportProgress(`segmented into ${result.Segments.length} chunk(s) with ${result.SegmenterKey}`);
        return Outcome.Complete(`${result.Segments.length} chunk(s) via ${result.SegmenterKey}`);
    }

    /**
     * Turn one segment into a chunk record.
     *
     * The parent's decorator rides on every chunk derived from it, so a chunk retrieved on its own
     * still carries the context it needs to make sense. It is carried as the chunk's own
     * `Decorator` field rather than prefixed into its text: that keeps it separately searchable,
     * lets it be revised without rewriting the chunk, and keeps the chunk's text a faithful slice
     * of the parent's.
     */
    private toChunk(
        parent: WorkingRecord,
        segment: { Sequence: number; Text?: string; Modality: string },
        decorator: unknown,
        confidence: ResolvedConfidenceScale,
    ): WorkingRecord {
        const url = `${parent.Identity.EphemeralID}#segment-${segment.Sequence}`;
        const chunk = new WorkingRecord(new WorkingRecordIdentity('Content Item Chunk', url));
        // Sequence is the chunk's position, which only the segmenter knows and which no
        // well-known field represents — it rides to the committer as a per-child column.
        chunk.SetExtension('Pipeline', 'columns', { Sequence: segment.Sequence });
        chunk.Propose('Text', segment.Text ?? '', confidence.SegmentText, SEGMENT_STAGE);
        chunk.Propose('Modality', segment.Modality, confidence.SegmentText, SEGMENT_STAGE);
        if (typeof decorator === 'string' && decorator.length > 0) {
            chunk.Propose('Decorator', decorator, parent.GetConfidence('Decorator'), `${SEGMENT_STAGE}.InheritedFromParent`);
        }
        return chunk;
    }

    /** The segmenter to use: the run's configuration, then the record's own modality default. */
    private async segmenterKey(record: WorkingRecord, context: StageContext): Promise<string | null> {
        // A run's Options pin a segmenter for this run only, which is what makes an experiment
        // possible without editing the source.
        const configured = context.Configuration.SegmenterKey;
        if (typeof configured === 'string' && configured.length > 0) {
            return configured;
        }
        // Otherwise the stored cascade: the source's own choice, then its content type's. These are
        // real columns that already existed beside CleanerKey, and reading only run Options meant a
        // source configured for a particular segmenter was silently ignored on every scheduled run.
        const contentSourceID = record.GetExtension<string>('Pipeline', 'contentSourceID');
        if (!contentSourceID) {
            return null;
        }
        const knowledge = KnowledgeHubMetadataEngine.Instance;
        await knowledge.Config(false, context.ContextUser, context.Provider);
        const source = knowledge.ContentSources.find((c) => UUIDsEqual(c.ID, contentSourceID));
        if (source?.SegmenterKey) {
            return source.SegmenterKey;
        }
        const contentType = source?.ContentTypeID
            ? knowledge.ContentTypes.find((t) => UUIDsEqual(t.ID, source.ContentTypeID))
            : undefined;
        return contentType?.SegmenterKey ?? null;
    }
}
