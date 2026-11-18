/**
 * @fileoverview {@link SegmentStage}: cleans a Content Item's text, then splits it into Content Item
 * Chunk records, using `@memberjunction/ai-segmentation`.
 *
 * Extract stores what it read as it read it (an HTML page keeps its markup). Cleaning happens here, so a
 * wrong cleaner or selector is fixed by running Segment again, without fetching from the source again.
 *
 * @module @memberjunction/content-pipeline
 */

import { KnowledgeHubMetadataEngine } from '@memberjunction/core-entities';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import {
    ContentCleaningOptions,
    ContentCleaningResult,
    ResolveContentCleaner,
    ResolveSegmenter,
    SegmentationOptions,
    SuggestCleanerKey,
} from '@memberjunction/ai-segmentation';
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

/** The extractor that stores an item's markup as it was served. Its items are cleaned as HTML by default. */
const HTML_EXTRACTOR_KEY = 'Html';

/** What Segment resolved for one record. */
interface ResolvedSegmentation {
    SegmenterKey: string | null;
    Confidence: ResolvedConfidenceScale;
    Options: SegmentationOptions;
    /** The configured cleaner, or `null` to choose one from what the record's text is. */
    CleanerKey: string | null;
    CleaningOptions: ContentCleaningOptions;
}

/** Cleans a record's text, then splits it into chunks. */
@RegisterClass(BasePipelineStage, SEGMENT_STAGE)
export class SegmentStage extends BasePipelineStage {
    public readonly Name = SEGMENT_STAGE;
    public readonly Entity: WorkingRecordEntity = 'Content Item';
    public readonly StatusField = 'SegmentationStatus';

    public override get Declaration(): StageDeclaration {
        return {
            Reads: ['Text', 'Modality', 'Decorator'],
            Writes: [],
            ReadsExtensions: ['Pipeline.contentSourceID', 'Pipeline.segmenterKeyOverride', 'Pipeline.extractorKey'],
            WritesExtensions: [`${SEGMENT_STAGE}.cleanerKey`, `${SEGMENT_STAGE}.segmenterKey`, `${SEGMENT_STAGE}.segmentCount`],
        };
    }

    public async Run(record: WorkingRecord, context: StageContext): Promise<StageOutcome> {
        if (context.Signal.aborted) {
            return Outcome.Retry('cancelled before segmentation started');
        }
        const stored = record.Get('Text');
        if (typeof stored !== 'string' || stored.trim().length === 0) {
            return Outcome.Skipped('no text to segment');
        }

        const resolved = await this.resolveSegmentation(record, context);
        const cleaned = this.clean(record, stored, resolved, context);
        const text = cleaned.Content;
        if (text.trim().length === 0) {
            return Outcome.Skipped(`no text left to segment after cleaning with '${cleaned.CleanerKey}'`);
        }
        // An unresolvable key degrades to a default, so the key that actually ran is what gets recorded.
        const segmenter = ResolveSegmenter(resolved.SegmenterKey ?? undefined);

        let result;
        try {
            result = await segmenter.Segment({
                Text: text,
                ContextUser: context.ContextUser,
                Options: resolved.Options,
            });
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
        record.SetExtension(SEGMENT_STAGE, 'cleanerKey', cleaned.CleanerKey);
        record.SetExtension(SEGMENT_STAGE, 'segmenterKey', result.SegmenterKey);
        record.SetExtension(SEGMENT_STAGE, 'segmentCount', result.Segments.length);
        context.ReportProgress(`cleaned with ${cleaned.CleanerKey}, segmented into ${result.Segments.length} chunk(s) with ${result.SegmenterKey}`);
        return Outcome.Complete(`${result.Segments.length} chunk(s) via ${cleaned.CleanerKey} then ${result.SegmenterKey}`);
    }

    /**
     * Clean the stored text with the configured cleaner, or, with none configured, the one that suits what
     * the text is: HTML for an item the Html extractor read (its text is the page's markup), plain text
     * otherwise. A cleaner never throws for content it cannot handle: it hands back the text uncleaned,
     * which is logged rather than failing the item.
     */
    private clean(record: WorkingRecord, text: string, resolved: ResolvedSegmentation, context: StageContext): ContentCleaningResult {
        const isHtml = record.GetExtension<string>('Pipeline', 'extractorKey') === HTML_EXTRACTOR_KEY;
        const mimeType = isHtml ? 'text/html' : 'text/plain';
        // An unresolvable key degrades to the plain-text cleaner, and the result names the key that actually ran.
        const cleaner = ResolveContentCleaner(resolved.CleanerKey ?? SuggestCleanerKey(mimeType));
        const result = cleaner.Clean({ Content: text, MimeType: mimeType, Options: resolved.CleaningOptions });
        if (!result.Success) {
            context.Log.Warning(`cleaning with '${result.CleanerKey}' failed, segmenting the text uncleaned: ${result.ErrorMessage ?? 'unknown reason'}`);
        }
        for (const warning of result.Warnings) {
            context.Log.Warning(`${result.CleanerKey}: ${warning}`);
        }
        return result;
    }

    /**
     * One segment as a chunk record. The parent's decorator goes in the chunk's own `Decorator`
     * field, not its text, so the text stays a faithful slice of the parent's cleaned text.
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
     * Resolves segmentation and cleaning settings in canonical precedence order:
     * Item override → Run Configuration → Content Source → Content Source Type / Content Type → Default.
     * (No item-level cleaner override exists: a cleaner is chosen for a source's pages, not one page.)
     */
    private async resolveSegmentation(record: WorkingRecord, context: StageContext): Promise<ResolvedSegmentation> {
        const itemColumns = record.GetExtension<Record<string, unknown>>('Pipeline', 'columns');
        const fromColumns = typeof itemColumns?.SegmenterKeyOverride === 'string' && itemColumns.SegmenterKeyOverride.trim().length > 0
            ? itemColumns.SegmenterKeyOverride.trim()
            : null;
        const itemOverride = fromColumns ?? record.GetExtension<string>('Pipeline', 'segmenterKeyOverride');
        const runKey = nonEmpty(context.Configuration.SegmenterKey);
        const runCleanerKey = nonEmpty(context.Configuration.CleanerKey);
        const runCleaningOptions = (context.Configuration.CleaningOptions as ContentCleaningOptions | undefined) ?? {};
        const contentSourceID = record.GetExtension<string>('Pipeline', 'contentSourceID');
        if (!contentSourceID) {
            return {
                SegmenterKey: itemOverride ?? runKey,
                Confidence: ResolveConfidence(context.Configuration),
                Options: (context.Configuration.SegmentationOptions as SegmentationOptions) ?? {},
                CleanerKey: runCleanerKey,
                CleaningOptions: runCleaningOptions,
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
        const sourceCleanerKey =
            nonEmpty(source?.CleanerKey) ??
            nonEmpty(resolvedConfig?.Configuration.CleanerKey) ??
            nonEmpty(resolvedConfig?.Settings.CleanerKey);
        const typeCleanerKey = nonEmpty(contentType?.CleanerKey) ?? nonEmpty(resolvedConfig?.TypeConfiguration.CleanerKey);
        const contentTypeConfig = readTypeConfiguration(contentType);
        return {
            CleanerKey: runCleanerKey ?? sourceCleanerKey ?? typeCleanerKey,
            CleaningOptions: {
                ...(contentTypeConfig.CleaningOptions as Record<string, unknown> | undefined),
                ...(resolvedConfig?.TypeConfiguration.CleaningOptions as Record<string, unknown> | undefined),
                ...(resolvedConfig?.Configuration.CleaningOptions as Record<string, unknown> | undefined),
                ...(resolvedConfig?.Settings.CleaningOptions as Record<string, unknown> | undefined),
                ...runCleaningOptions,
            },
            SegmenterKey: itemOverride ?? runKey ?? sourceKey ?? typeKey ?? null,
            Confidence: ResolveConfidence(resolvedConfig?.Confidence, context.Configuration),
            Options: {
                ...(contentTypeConfig.SegmentationOptions as Record<string, unknown> | undefined),
                ...(resolvedConfig?.TypeConfiguration.SegmentationOptions as Record<string, unknown> | undefined),
                ...(resolvedConfig?.Configuration.SegmentationOptions as Record<string, unknown> | undefined),
                ...(resolvedConfig?.Settings.SegmentationOptions as Record<string, unknown> | undefined),
                ...((context.Configuration.SegmentationOptions as Record<string, unknown>) ?? {}),
            },
        };
    }
}

/** A trimmed non-empty string, or `null`. */
function nonEmpty(value: unknown): string | null {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

/** Content Type configuration JSON, or `{}` when unset or malformed. */
function readTypeConfiguration(contentType: { ConfigurationObject?: unknown } | undefined): Record<string, unknown> {
    if (!contentType) {
        return {};
    }
    try {
        const obj = contentType.ConfigurationObject;
        return obj && typeof obj === 'object' && !Array.isArray(obj) ? (obj as Record<string, unknown>) : {};
    } catch {
        return {};
    }
}
