/**
 * @fileoverview {@link SegmentStage}: cleans a Content Item's text, then splits it into Content Item
 * Chunk records, using `@memberjunction/ai-segmentation`.
 *
 * Extract stores what it read as it read it (an HTML page keeps its markup). Cleaning happens here, so a
 * wrong cleaner or selector is fixed by running Segment again, without fetching from the source again.
 *
 * @module @memberjunction/content-pipeline
 */

import { KnowledgeHubMetadataEngine, MJContentFileTypeEntity, MJContentSourceEntity, MJContentTypeEntity } from '@memberjunction/core-entities';
import { IsPlainObject, RegisterClass, UUIDsEqual } from '@memberjunction/global';
import {
    BaseContentCleaner,
    ContentCleaningOptions,
    ContentCleaningResult,
    ContentPage,
    ContentSegment,
    LooksLikeCaptionText,
    MediaReference,
    PAGED_CONTENT_SEGMENTER_KEY,
    ResolveContentCleaner,
    ResolveSegmenter,
    SegmentationOptions,
    SegmentationParams,
    SuggestCleanerKey,
    TRANSCRIPT_SEGMENTER_KEY,
    TranscriptCue,
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
import { ContentSourceConfigurationResolver, ResolvedSourceConfiguration } from '../ContentSourceConfigurationResolver.js';
import { FileTypeKey } from '../DetectionCatalog.js';

/** The registered name. */
export const SEGMENT_STAGE = 'Segment';

/** The extractor that stores an item's markup as it was served. Its items are cleaned as HTML by default. */
const HTML_EXTRACTOR_KEY = 'Html';

/** Maximum length of `MJContentItemChunkEntity.SegmentTitle` (`nvarchar(500)`). */
const MAX_SEGMENT_TITLE_LENGTH = 500;

/** What Segment resolved for one record. */
interface ResolvedSegmentation {
    SegmenterKey: string | null;
    Confidence: ResolvedConfidenceScale;
    Options: SegmentationOptions;
    /** The configured cleaner, or `null` to choose one from what the record's text is. */
    CleanerKey: string | null;
    CleaningOptions: ContentCleaningOptions;
}

/** Cleans a record's text and splits text or multimodal cues/pages into chunks. */
@RegisterClass(BasePipelineStage, SEGMENT_STAGE)
export class SegmentStage extends BasePipelineStage {
    public readonly Name = SEGMENT_STAGE;
    public readonly Entity: WorkingRecordEntity = 'Content Item';
    public readonly StatusField = 'SegmentationStatus';

    public override get Declaration(): StageDeclaration {
        return {
            Reads: ['Text', 'Modality', 'Decorator', 'FileType'],
            Writes: [],
            ReadsExtensions: [
                'Pipeline.contentSourceID',
                'Pipeline.segmenterKeyOverride',
                'Pipeline.extractorKey',
                'Pipeline.cues',
                'Pipeline.pages',
                'Pipeline.media',
                'Pipeline.mimeType',
            ],
            WritesExtensions: [`${SEGMENT_STAGE}.cleanerKey`, `${SEGMENT_STAGE}.segmenterKey`, `${SEGMENT_STAGE}.segmentCount`],
        };
    }

    public async Run(record: WorkingRecord, context: StageContext): Promise<StageOutcome> {
        if (context.Signal.aborted) {
            return Outcome.Retry('cancelled before segmentation started');
        }
        const rawText = record.Get('Text');
        const storedText = typeof rawText === 'string' && rawText.trim().length > 0 ? rawText : undefined;
        const cues = record.GetExtension<TranscriptCue[]>('Pipeline', 'cues');
        const pages = record.GetExtension<ContentPage[]>('Pipeline', 'pages');
        const media = record.GetExtension<MediaReference>('Pipeline', 'media');
        const hasCues = Array.isArray(cues) && cues.length > 0;
        const hasPages = Array.isArray(pages) && pages.length > 0;

        if (!storedText && !hasCues && !hasPages) {
            return Outcome.Skipped('no text to segment');
        }

        const resolved = await this.resolveSegmentation(record, context);
        const mimeType = this.resolveMimeType(record, media);
        const isHtmlExtractor = record.GetExtension<string>('Pipeline', 'extractorKey') === HTML_EXTRACTOR_KEY;
        const cleaned = storedText ? this.clean(record, storedText, resolved, context, mimeType, isHtmlExtractor) : null;
        const text = cleaned ? (cleaned.Content.trim().length > 0 ? cleaned.Content : undefined) : undefined;
        if (cleaned && !text && !hasCues && !hasPages) {
            return Outcome.Skipped(`no text left to segment after cleaning with '${cleaned.CleanerKey}'`);
        }

        const segParams: SegmentationParams = {
            ...(text !== undefined ? { Text: text } : {}),
            ...(hasCues ? { Cues: cues } : {}),
            ...(hasPages ? { Pages: pages } : {}),
            ...(media ? { Media: media } : {}),
            MimeType: mimeType,
            ContextUser: context.ContextUser,
            Options: resolved.Options,
        };
        const isCaptionMime = mimeType === 'text/vtt' || mimeType === 'application/x-subrip';
        const isCaptionSource = !isHtmlExtractor && (isCaptionMime || (text !== undefined && LooksLikeCaptionText(text)));
        const multimodalFallbackKey = (hasCues || isCaptionSource)
            ? TRANSCRIPT_SEGMENTER_KEY
            : hasPages
                ? PAGED_CONTENT_SEGMENTER_KEY
                : undefined;
        // An unresolvable or unconfigured key keeps FixedWindow for plain prose while auto-routing cues, pages, and captions.
        const segmenter = ResolveSegmenter(resolved.SegmenterKey ?? undefined, multimodalFallbackKey);

        let result;
        try {
            result = await segmenter.Segment(segParams);
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
        if (cleaned) {
            record.SetExtension(SEGMENT_STAGE, 'cleanerKey', cleaned.CleanerKey);
        }
        record.SetExtension(SEGMENT_STAGE, 'segmenterKey', result.SegmenterKey);
        record.SetExtension(SEGMENT_STAGE, 'segmentCount', result.Segments.length);
        if (cleaned) {
            context.ReportProgress(`cleaned with ${cleaned.CleanerKey}, segmented into ${result.Segments.length} chunk(s) with ${result.SegmenterKey}`);
            return Outcome.Complete(`${result.Segments.length} chunk(s) via ${cleaned.CleanerKey} then ${result.SegmenterKey}`);
        }
        context.ReportProgress(`segmented into ${result.Segments.length} chunk(s) with ${result.SegmenterKey}`);
        return Outcome.Complete(`${result.Segments.length} chunk(s) via ${result.SegmenterKey}`);
    }

    /**
     * Clean the stored text with the configured cleaner, or, with none configured, the one that suits what
     * the text is: HTML for an item the Html extractor read (its text is the page's markup), plain text
     * otherwise (including timed caption transcripts, whose `<v Speaker>` tags must not be stripped as HTML).
     */
    private clean(
        record: WorkingRecord,
        text: string,
        resolved: ResolvedSegmentation,
        context: StageContext,
        mimeTypeHint?: string,
        isHtmlExtractor: boolean = record.GetExtension<string>('Pipeline', 'extractorKey') === HTML_EXTRACTOR_KEY,
    ): ContentCleaningResult {
        const isCaptionMime = mimeTypeHint === 'text/vtt' || mimeTypeHint === 'application/x-subrip';
        const isCaption = !isHtmlExtractor && (isCaptionMime || LooksLikeCaptionText(text));
        const isHtml = isHtmlExtractor || (!isCaption && mimeTypeHint === 'text/html');
        const mimeType = isHtml ? 'text/html' : isCaption ? (mimeTypeHint ?? 'text/vtt') : 'text/plain';
        // The resolved key is registered (unregistered ones were skipped); the built-in choice for the text backs it
        // up, so markup is never cleaned as plain text. The result names the key that actually ran.
        const cleaner = ResolveContentCleaner(resolved.CleanerKey ?? undefined, SuggestCleanerKey(mimeType));
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
     * field, not its text, so the text stays a faithful slice of the parent's cleaned text. Multimodal
     * and structural provenance columns ride in `Pipeline.columns` to {@link WorkingRecordCommitter}.
     */
    private toChunk(
        parent: WorkingRecord,
        segment: ContentSegment,
        decorator: unknown,
        confidence: ResolvedConfidenceScale,
    ): WorkingRecord {
        const url = `${parent.Identity.EphemeralID}#segment-${segment.Sequence}`;
        const chunk = new WorkingRecord(new WorkingRecordIdentity('Content Item Chunk', url));
        const columns = this.buildChunkColumns(segment);
        chunk.SetExtension('Pipeline', 'columns', columns);
        this.applyChunkExtensions(chunk, segment);
        chunk.Propose('Text', segment.Text ?? '', confidence.SegmentText, SEGMENT_STAGE);
        chunk.Propose('Modality', segment.Modality, confidence.SegmentText, SEGMENT_STAGE);
        if (typeof decorator === 'string' && decorator.length > 0) {
            chunk.Propose('Decorator', decorator, parent.GetConfidence('Decorator'), `${SEGMENT_STAGE}.InheritedFromParent`);
        }
        return chunk;
    }

    /** Build the non-well-known `MJContentItemChunkEntity` columns emitted by segmentation. */
    private buildChunkColumns(segment: ContentSegment): Record<string, unknown> {
        const columns: Record<string, unknown> = {
            Sequence: segment.Sequence,
        };
        if (segment.SegmenterKey) {
            columns.SegmenterKey = segment.SegmenterKey;
        }
        if (segment.StartMs != null) {
            columns.StartMs = segment.StartMs;
        }
        if (segment.EndMs != null) {
            columns.EndMs = segment.EndMs;
        }
        if (segment.StartOffset != null) {
            columns.StartOffset = segment.StartOffset;
        }
        if (segment.EndOffset != null) {
            columns.EndOffset = segment.EndOffset;
        }
        if (segment.PageNumber != null) {
            columns.PageNumber = segment.PageNumber;
        }
        if (segment.Title != null && segment.Title.trim().length > 0) {
            columns.SegmentTitle = segment.Title.trim().slice(0, MAX_SEGMENT_TITLE_LENGTH);
        }
        if ((segment.Modality === 'audio' || segment.Modality === 'video') && segment.Text) {
            columns.Transcript = segment.Text;
        }
        return columns;
    }

    /** Mirror chunk provenance into `Pipeline.*` extensions so chained in-memory stages match hydration. */
    private applyChunkExtensions(chunk: WorkingRecord, segment: ContentSegment): void {
        chunk.SetExtension('Pipeline', 'sequence', segment.Sequence);
        if (segment.SegmenterKey) {
            chunk.SetExtension('Pipeline', 'segmenterKey', segment.SegmenterKey);
        }
        if (segment.StartMs != null) {
            chunk.SetExtension('Pipeline', 'startMs', segment.StartMs);
        }
        if (segment.EndMs != null) {
            chunk.SetExtension('Pipeline', 'endMs', segment.EndMs);
        }
        if (segment.StartOffset != null) {
            chunk.SetExtension('Pipeline', 'startOffset', segment.StartOffset);
        }
        if (segment.EndOffset != null) {
            chunk.SetExtension('Pipeline', 'endOffset', segment.EndOffset);
        }
        if (segment.PageNumber != null) {
            chunk.SetExtension('Pipeline', 'pageNumber', segment.PageNumber);
        }
        if (segment.Title != null && segment.Title.trim().length > 0) {
            chunk.SetExtension('Pipeline', 'segmentTitle', segment.Title.trim().slice(0, MAX_SEGMENT_TITLE_LENGTH));
        }
        if ((segment.Modality === 'audio' || segment.Modality === 'video') && segment.Text) {
            chunk.SetExtension('Pipeline', 'transcript', segment.Text);
        }
        if (segment.ParentSequence != null) {
            chunk.SetExtension('Pipeline', 'parentSequence', segment.ParentSequence);
        }
    }

    /** Resolve a media/document MIME hint from explicit extensions, `Media`, `Modality`, or `FileType`. */
    private resolveMimeType(record: WorkingRecord, media?: MediaReference): string | undefined {
        const explicit = record.GetExtension<string>('Pipeline', 'mimeType') ?? media?.MimeType;
        if (explicit && explicit.trim().length > 0) {
            return explicit.trim();
        }
        const modality = record.Get('Modality');
        if (modality === 'video') {
            return 'video/*';
        }
        if (modality === 'audio') {
            return 'audio/*';
        }
        const fileType = typeof record.Get('FileType') === 'string' ? (record.Get('FileType') as string).toLowerCase() : '';
        if (fileType === 'vtt') {
            return 'text/vtt';
        }
        if (fileType === 'srt') {
            return 'application/x-subrip';
        }
        if (fileType === 'html' || fileType === 'htm' || fileType === 'xhtml') {
            return 'text/html';
        }
        return undefined;
    }

    /**
     * Resolves segmentation and cleaning settings in canonical precedence order:
     * Item override → Run Configuration → Content Source → Content Source Type / Content Type → Default.
     * The cleaner is chosen from the item's detected file type, by {@link cleanerCandidates}.
     */
    private async resolveSegmentation(record: WorkingRecord, context: StageContext): Promise<ResolvedSegmentation> {
        const itemColumns = record.GetExtension<Record<string, unknown>>('Pipeline', 'columns');
        const fromColumns = typeof itemColumns?.SegmenterKeyOverride === 'string' && itemColumns.SegmenterKeyOverride.trim().length > 0
            ? itemColumns.SegmenterKeyOverride.trim()
            : null;
        const itemOverride = fromColumns ?? record.GetExtension<string>('Pipeline', 'segmenterKeyOverride');
        const runKey = nonEmpty(context.Configuration.SegmenterKey);
        const runCleaningOptions = (context.Configuration.CleaningOptions as ContentCleaningOptions | undefined) ?? {};
        const contentSourceID = record.GetExtension<string>('Pipeline', 'contentSourceID');
        if (!contentSourceID) {
            return {
                SegmenterKey: itemOverride ?? runKey,
                Confidence: ResolveConfidence(context.Configuration),
                Options: (context.Configuration.SegmentationOptions as SegmentationOptions) ?? {},
                CleanerKey: this.firstRegisteredCleaner(cleanerCandidates(recordFileType(record), context.Configuration), context),
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
        const contentTypeConfig = readTypeConfiguration(contentType);
        const fileType = recordFileType(record, knowledge.ContentFileTypes ?? []);
        const candidates = cleanerCandidates(fileType, context.Configuration, { source, contentType, contentTypeConfig, resolvedConfig });
        return {
            CleanerKey: this.firstRegisteredCleaner(candidates, context),
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

    /** Unregistered cleaner keys already warned about, so a misconfigured source warns once, not once per item. */
    private readonly warnedCleanerKeys = new Set<string>();

    /**
     * The first candidate naming a registered cleaner, or `null` for the built-in choice. A key nothing registered
     * (a typo, a plugin that did not load) is skipped with a warning, so the steps below it still apply, as
     * Extract skips an extractor that is not registered.
     */
    private firstRegisteredCleaner(candidates: readonly CleanerCandidate[], context: StageContext): string | null {
        for (const candidate of candidates) {
            if (BaseContentCleaner.Resolve(candidate.Key)) {
                return candidate.Key;
            }
            if (!this.warnedCleanerKeys.has(candidate.Key)) {
                this.warnedCleanerKeys.add(candidate.Key);
                context.Log.Warning(`cleaner '${candidate.Key}' (from ${candidate.From}) is not registered; skipping it for the next choice`);
            }
        }
        return null;
    }
}

/** A trimmed non-empty string, or `null`. */
function nonEmpty(value: unknown): string | null {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

/**
 * The record's file type as `Cleaners` maps are keyed: the pipeline's key for a Content File Type
 * ({@link FileTypeKey}: its extension without the dot, else its name, lowercased), which is what Extract records.
 * An item loaded from the database carries its Content File Type's NAME instead. That equals the extension for
 * the built-in types (`HTML`), but need not for a custom one (`Word Document` for `.docx`), so the value is looked
 * up among the Content File Types, by name and then by extension, and turned into the same key.
 */
function recordFileType(record: WorkingRecord, fileTypes: readonly MJContentFileTypeEntity[] = []): string | null {
    const value = nonEmpty(record.Get('FileType'));
    if (!value) {
        return null;
    }
    const byName = value.toLowerCase();
    const normalized = normalizeFileType(value);
    const row =
        fileTypes.find((t) => nonEmpty(t.Name)?.toLowerCase() === byName) ??
        fileTypes.find((t) => t.FileExtension != null && normalizeFileType(t.FileExtension) === normalized);
    return (row ? FileTypeKey(row) : null) ?? normalized;
}

/** The source-level settings a cleaner is chosen from, when the item has a source. */
interface SourceCleanerSettings {
    source: MJContentSourceEntity | undefined;
    contentType: MJContentTypeEntity | undefined;
    contentTypeConfig: Record<string, unknown>;
    resolvedConfig: ResolvedSourceConfiguration | null;
}

/** A cleaner key one step of the order names, and where it came from (for the warning when it is not registered). */
interface CleanerCandidate {
    Key: string;
    From: string;
}

/**
 * The cleaners configured for one item, best first. Segment runs the first one that is registered, and with
 * none, its built-in choice (`Html` for markup, `PlainText` otherwise).
 *
 * The cleaner follows the item's detected file type. A `Cleaners` map in the configuration JSON
 * (`{ "html": "Html", "md": "PlainText" }`, keyed by file type) names the cleaner for a file type:
 *
 *   1. the run: its entry for the file type, then its `CleanerKey` (a run is an operator's instruction,
 *      so its plain key still overrides everything below);
 *   2. the Content Source's entry for the file type (its `Configuration`, then its source-specific settings):
 *      this source cleans this kind of file its own way;
 *   3. the Content Type's entry for the file type, then the Content Source Type's: the standard cleaner
 *      for that kind of file;
 *   4. the source's `CleanerKey` (column, `Configuration`, settings): its default, for a file type nothing
 *      maps or an item whose type was not detected;
 *   5. the content type's `CleanerKey` (column, then its `Configuration`), then the source type's.
 *
 * At every level the content type comes before the source type, for the map and the plain key alike.
 * (Unlike Extract, where a source's `ExtractorKey` beats a content type's per-file-type entry: a source's
 * plain cleaner key is a default, not an override. Still no per-item override: the choice follows what
 * the item IS, not which item it is.)
 */
function cleanerCandidates(
    fileType: string | null,
    run: Readonly<Record<string, unknown>>,
    settings?: SourceCleanerSettings,
): CleanerCandidate[] {
    const candidates: CleanerCandidate[] = [];
    const add = (value: unknown, from: string): void => {
        const key = nonEmpty(value);
        if (key) {
            candidates.push({ Key: key, From: from });
        }
    };
    add(cleanerForFileType(fileType, run.Cleaners), "the run's Cleaners");
    add(run.CleanerKey, "the run's CleanerKey");
    if (!settings) {
        return candidates;
    }
    const { source, contentType, contentTypeConfig, resolvedConfig } = settings;
    add(cleanerForFileType(fileType, resolvedConfig?.Configuration.Cleaners), "the content source's Cleaners");
    add(cleanerForFileType(fileType, resolvedConfig?.Settings.Cleaners), "the content source's settings Cleaners");
    add(cleanerForFileType(fileType, contentTypeConfig.Cleaners), "the content type's Cleaners");
    add(cleanerForFileType(fileType, resolvedConfig?.TypeConfiguration.Cleaners), "the content source type's Cleaners");
    add(source?.CleanerKey, "the content source's CleanerKey");
    add(resolvedConfig?.Configuration.CleanerKey, "the content source's Configuration CleanerKey");
    add(resolvedConfig?.Settings.CleanerKey, "the content source's settings CleanerKey");
    add(contentType?.CleanerKey, "the content type's CleanerKey");
    add(contentTypeConfig.CleanerKey, "the content type's Configuration CleanerKey");
    add(resolvedConfig?.TypeConfiguration.CleanerKey, "the content source type's CleanerKey");
    return candidates;
}

/**
 * The cleaner one `Cleaners` map names for this file type, or `null`. Keys match case-insensitively and with or
 * without a leading dot; a blank or non-string value names nothing. File types that are separate Content File
 * Types (`html`, `htm`, `xhtml`) are separate keys.
 */
function cleanerForFileType(fileType: string | null, map: unknown): string | null {
    if (!fileType || !IsPlainObject(map)) {
        return null;
    }
    let found: string | null = null;
    for (const [key, value] of Object.entries(map)) {
        const cleanerKey = nonEmpty(value);
        if (cleanerKey && normalizeFileType(key) === fileType) {
            found = cleanerKey;
        }
    }
    return found;
}

/** A file type as `Cleaners` maps are keyed: trimmed, lowercased, without a leading dot. */
function normalizeFileType(value: string): string {
    return value.trim().replace(/^\./, '').toLowerCase();
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
