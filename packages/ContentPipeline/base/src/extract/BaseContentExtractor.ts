/**
 * @fileoverview Content extractors: registered drivers that turn fetched bytes into text.
 *
 * @module @memberjunction/content-pipeline-base
 */

import { MJGlobal } from '@memberjunction/global';
import { ResolvedConfidenceScale } from '../ConfidenceScale.js';
import { DiscoveredField, PipelineStageRequest } from '../discover/SourceDriver.js';
import { ResolvedPipelineTuning } from '../PipelineTuning.js';

/** Mutable tree-wide budget shared across a top-level archive and any nested archives unpacked inside it. */
export interface ArchiveBudget {
    /** Remaining members the archive tree may unpack. Decremented before each member is read. */
    RemainingMembers: number;
    /** Remaining uncompressed bytes the archive tree may unpack. Decremented as bytes are read. */
    RemainingBytes: number;
    /** Current archive nesting depth (1 for the top-level archive, incremented on each nested archive). */
    CurrentDepth: number;
    /** Maximum allowed nesting depth from `Tuning.MaxArchiveDepth`. */
    MaxDepth: number;
}

/** What the Extract stage passes an extractor. */
export interface ExtractRequest {
    /** The fetched bytes. */
    Content: Uint8Array;
    /** The resolved file type key, e.g. `pdf`, `html`, `docx`. */
    FileType: string;
    /** Where the bytes came from, for diagnostics and for resolving relative links. */
    URL: string;
    /**
     * The server's `Content-Type` for the bytes, when they were fetched over HTTP. A weak signal for the file
     * type, but the authority for a text document's charset (`text/html; charset=windows-1252`).
     */
    ContentType?: string;
    /** The source's type-specific settings, already defaulted and validated. */
    Parameters: Readonly<Record<string, string>>;
    /** The resolved confidence scale for this source and run. */
    Confidence?: ResolvedConfidenceScale;
    /** The run's resolved tuning. An extractor that needs a limit and finds none must refuse. */
    Tuning?: ResolvedPipelineTuning;
    /** Shared tree-wide budget when unpacking an archive or a nested archive member. */
    ArchiveBudget?: ArchiveBudget;
    /**
     * This extractor's own settings: `ExtractorOptions[<extractor key>]` from the Content Source Type's
     * Configuration, then the Content Source's type-specific settings, then its Configuration, then the run's
     * `Options`, each layer overriding the last. Empty when none is set.
     */
    Options?: Readonly<Record<string, unknown>>;
    /** Fires when the run is asked to stop. */
    Signal: AbortSignal;
    /** Report progress during a long read. */
    ReportProgress(message: string): void;
}

/** One block of extracted content. Several blocks (e.g. archive members) become several records. */
export interface ContentBlock {
    /** The block's text. Empty for a non-text block (see {@link Content}); never decode arbitrary bytes into it. */
    Text: string;
    /** Raw bytes of a non-text block (e.g. a PDF inside an archive), which gets its own extraction. */
    Content?: Uint8Array;
    /** The block's identity within its parent (e.g. an archive member path), appended to the parent's URL. */
    Key?: string;
    /**
     * The child's own address, when it has one (a manifest row's link). The child is then identified by it
     * instead of the parent's URL plus {@link Key}, and a child with no text and no bytes is fetched from it
     * by its own Extract, through the source's fetch and Access path.
     */
    URL?: string;
    /** A title the extractor could determine from the block's own structure. */
    Title?: string;
    /** How much the extractor trusts that title. Omitted means it has no opinion. */
    TitleConfidence?: number;
    /** Forces an extractor for this block, set by the extractor that produced it. */
    ExtractorKeyOverride?: string;
    /** The block's file type, when a splitting extractor knows it differs from its parent's. */
    FileType?: string;
    /** Extra or custom columns on `MJ: Content Items` for the child record this block produces. */
    Columns?: Record<string, unknown>;
    /** Explicit request for downstream pipeline work on the child record this block produces. */
    Request?: PipelineStageRequest;
    /**
     * Well-known fields the block determined directly, each with its confidence: a manifest row's title, date or
     * decorator, or, for a single document, the publication date and decorator its extractor read. Each is
     * proposed at its own confidence and a null value is skipped.
     *
     * - **A single document** (one block, not a container): the fields apply to the item itself, as the Extract
     *   stage's own findings (`Extract.Block`), so a re-extraction replaces them and a value from another stage
     *   competes on confidence. This is how an extractor sets an item's `Date` or `Decorator`, which `Columns`
     *   cannot carry. A `Title` here competes with {@link Title}: it replaces that title only when more confident.
     * - **A child** (a container's member or row): the fields are listing data (`Listing.Block`) that the child's
     *   own later Extract can override on confidence. A `Date` here replaces the date the child would otherwise
     *   inherit from its parent.
     */
    Fields?: DiscoveredField[];
}

/** What an extractor returned. */
export interface ExtractResult {
    /** The blocks read. Several means this artifact becomes several linked records. */
    Blocks: ContentBlock[];
    /** True when the text came from the last-resort plain-text read. Recorded in provenance. */
    IsFallback?: boolean;
    /** Extra or custom columns on `MJ: Content Items` for the item being extracted. */
    Columns?: Record<string, unknown>;
    /** Explicit request for downstream pipeline work on the item being extracted. */
    Request?: PipelineStageRequest;
    /**
     * The item is a container: every block becomes a child item, even when there is one. Without it a
     * single text block is the item's own text, which for a one-row manifest would make the manifest that row.
     */
    IsContainer?: boolean;
}

/**
 * A registered way of turning bytes into text, chosen by what the content is, never by its source type.
 *
 * @example
 * ```ts
 * @RegisterClass(BaseContentExtractor, 'Pdf')
 * export class PdfContentExtractor extends BaseContentExtractor {
 *     public readonly Key = 'Pdf';
 *     public readonly SupportedFileTypes = ['pdf'];
 *     public async Extract(request: ExtractRequest): Promise<ExtractResult> { ... }
 * }
 * ```
 */
export abstract class BaseContentExtractor {
    /** The registration key. Must match the key passed to `@RegisterClass`. */
    public abstract readonly Key: string;

    /** The file types this extractor handles. `'*'` means any; only the built-in fallback should use it. */
    public abstract readonly SupportedFileTypes: readonly string[];

    /** Read the bytes. */
    public abstract Extract(request: ExtractRequest): Promise<ExtractResult>;

    /** Whether this extractor handles a given file type. */
    public Supports(fileType: string): boolean {
        return this.SupportedFileTypes.includes('*') || this.SupportedFileTypes.includes(fileType.toLowerCase());
    }

    /** Resolve a registered extractor by key, returning null rather than a hollow base instance. */
    public static Resolve(key: string): BaseContentExtractor | null {
        if (!key || key.trim().length === 0) {
            return null;
        }
        const result = MJGlobal.Instance.ClassFactory.TryCreateInstance<BaseContentExtractor>(
            BaseContentExtractor,
            key.trim(),
        );
        return result.Resolved ? result.Instance : null;
    }
}
