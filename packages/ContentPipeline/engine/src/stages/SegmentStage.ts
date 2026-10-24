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
    ResolveConfidence,
    ResolvedConfidenceScale,
    StageContext,
    StageDeclaration,
    StageOutcome,
    TransientStageError,
    WorkingRecord,
    WorkingRecordEntity,
    WorkingRecordIdentity,
} from '@memberjunction/content-pipeline-base';
import { ContentSourceConfigurationResolver } from '../ContentSourceConfigurationResolver.js';

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
            ReadsExtensions: ['Pipeline.contentSourceID', 'Pipeline.segmenterKeyOverride'],
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

        const resolved = await this.resolveSegmentation(record, context);
        // An unresolvable key degrades to a default, so the key that actually ran is what gets recorded.
        const segmenter = ResolveSegmenter(resolved.SegmenterKey ?? undefined);

        let result;
        try {
            result = await segmenter.Segment({
                Text: text,
                Options: resolved.Options,
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
            record.AddChild(this.toChunk(record, segment, decorator, resolved.Confidence));
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
        confidence: ResolvedConfidenceScale,
    ): WorkingRecord {
        const url = `${parent.Identity.EphemeralID}#segment-${segment.Sequence}`;
        const chunk = new WorkingRecord(new WorkingRecordIdentity('Content Item Chunk', url));
        // No well-known field holds Sequence, so it rides to the committer as a per-child column.
        chunk.SetExtension('Pipeline', 'columns', { Sequence: segment.Sequence });
        chunk.Propose('Text', segment.Text ?? '', confidence.SegmentText, SEGMENT_STAGE);
        chunk.Propose('Modality', segment.Modality, confidence.SegmentText, SEGMENT_STAGE);
        if (typeof decorator === 'string' && decorator.length > 0) {
            chunk.Propose('Decorator', decorator, parent.GetConfidence('Decorator'), `${SEGMENT_STAGE}.InheritedFromParent`);
        }
        return chunk;
    }

    /**
     * Resolves segmentation settings in canonical precedence order:
     * Item override → Run Configuration → Content Source → Content Source Type / Content Type → Default.
     */
    private async resolveSegmentation(
        record: WorkingRecord,
        context: StageContext,
    ): Promise<{ SegmenterKey: string | null; Confidence: ResolvedConfidenceScale; Options: Record<string, unknown> }> {
        const itemColumns = record.GetExtension<Record<string, unknown>>('Pipeline', 'columns');
        const fromColumns = typeof itemColumns?.SegmenterKeyOverride === 'string' && itemColumns.SegmenterKeyOverride.trim().length > 0
            ? itemColumns.SegmenterKeyOverride.trim()
            : null;
        const itemOverride = fromColumns ?? record.GetExtension<string>('Pipeline', 'segmenterKeyOverride');
        const runKey = typeof context.Configuration.SegmenterKey === 'string' && context.Configuration.SegmenterKey.length > 0
            ? context.Configuration.SegmenterKey
            : null;
        const contentSourceID = record.GetExtension<string>('Pipeline', 'contentSourceID');
        if (!contentSourceID) {
            return {
                SegmenterKey: itemOverride ?? runKey,
                Confidence: ResolveConfidence(context.Configuration),
                Options: (context.Configuration.SegmentationOptions as Record<string, unknown>) ?? {},
            };
        }
        const knowledge = KnowledgeHubMetadataEngine.Instance;
        await knowledge.Config(false, context.ContextUser, context.Provider);
        let source = knowledge.ContentSources.find((c) => UUIDsEqual(c.ID, contentSourceID));
        if (!source) {
            await knowledge.Config(true, context.ContextUser, context.Provider);
            source = knowledge.ContentSources.find((c) => UUIDsEqual(c.ID, contentSourceID));
        }
        const contentType = source?.ContentTypeID
            ? knowledge.ContentTypes.find((t) => UUIDsEqual(t.ID, source.ContentTypeID))
            : undefined;
        const resolvedConfig = source
            ? await new ContentSourceConfigurationResolver(context.Provider, context.ContextUser).Resolve(contentSourceID, context.ContextUser)
            : null;
        const sourceKey =
            source?.SegmenterKey ??
            (typeof resolvedConfig?.Configuration.SegmenterKey === 'string' ? resolvedConfig.Configuration.SegmenterKey : null) ??
            (typeof resolvedConfig?.Settings.SegmenterKey === 'string' ? resolvedConfig.Settings.SegmenterKey : null);
        const typeKey =
            contentType?.SegmenterKey ??
            (typeof resolvedConfig?.TypeConfiguration.SegmenterKey === 'string' ? resolvedConfig.TypeConfiguration.SegmenterKey : null);
        return {
            SegmenterKey: itemOverride ?? runKey ?? sourceKey ?? typeKey ?? null,
            Confidence: ResolveConfidence(resolvedConfig?.Confidence, context.Configuration),
            Options: {
                ...(resolvedConfig?.TypeConfiguration.SegmentationOptions as Record<string, unknown> | undefined),
                ...(resolvedConfig?.Configuration.SegmentationOptions as Record<string, unknown> | undefined),
                ...(resolvedConfig?.Settings.SegmentationOptions as Record<string, unknown> | undefined),
                ...((context.Configuration.SegmentationOptions as Record<string, unknown>) ?? {}),
            },
        };
    }
}

