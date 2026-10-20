/**
 * @fileoverview {@link SegmentStage}: splits a Content Item's text into Content Item Chunk records
 * using `@memberjunction/ai-segmentation`.
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
    ConfidenceScale,
} from '@memberjunction/content-pipeline-base';

/** The registered name. */
export const SEGMENT_STAGE = 'Segment';

/** Splits a record's text into chunks. */
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
            return Outcome.Skipped('no text to segment');
        }

        const requestedKey = await this.segmenterKey(record, context);
        // An unresolvable key degrades to a default, so the key that actually ran is what gets recorded.
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

        const decorator = record.Get('Decorator');
        for (const segment of result.Segments) {
            record.AddChild(this.toChunk(record, segment, decorator));
        }
        record.SetExtension(SEGMENT_STAGE, 'segmenterKey', result.SegmenterKey);
        record.SetExtension(SEGMENT_STAGE, 'segmentCount', result.Segments.length);
        context.ReportProgress(`segmented into ${result.Segments.length} chunk(s) with ${result.SegmenterKey}`);
        return Outcome.Complete(`${result.Segments.length} chunk(s) via ${result.SegmenterKey}`);
    }

    /**
     * One segment as a chunk record. The parent's decorator goes in the chunk's own `Decorator`
     * field, not its text, so the text stays a faithful slice of the parent's.
     */
    private toChunk(
        parent: WorkingRecord,
        segment: { Sequence: number; Text?: string; Modality: string },
        decorator: unknown,
    ): WorkingRecord {
        const url = `${parent.Identity.EphemeralID}#segment-${segment.Sequence}`;
        const chunk = new WorkingRecord(new WorkingRecordIdentity('Content Item Chunk', url));
        // No well-known field holds Sequence, so it rides to the committer as a per-child column.
        chunk.SetExtension('Pipeline', 'columns', { Sequence: segment.Sequence });
        chunk.Propose('Text', segment.Text ?? '', ConfidenceScale.SegmentText, SEGMENT_STAGE);
        chunk.Propose('Modality', segment.Modality, ConfidenceScale.SegmentText, SEGMENT_STAGE);
        if (typeof decorator === 'string' && decorator.length > 0) {
            chunk.Propose('Decorator', decorator, parent.GetConfidence('Decorator'), `${SEGMENT_STAGE}.InheritedFromParent`);
        }
        return chunk;
    }

    /** The segmenter key: the run's configuration, then the Content Source, then its Content Type. */
    private async segmenterKey(record: WorkingRecord, context: StageContext): Promise<string | null> {
        const configured = context.Configuration.SegmenterKey;
        if (typeof configured === 'string' && configured.length > 0) {
            return configured;
        }
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
