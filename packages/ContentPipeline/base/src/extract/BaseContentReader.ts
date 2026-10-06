/**
 * @fileoverview Content readers — turning fetched bytes into text.
 *
 * A reader is a driver class, registered by key and selected through a cascade. `ExtractorKey` names
 * one; `ExtractorKeyOverride` forces one.
 *
 * @module @memberjunction/content-pipeline-base
 */

import { MJGlobal } from '@memberjunction/global';

/** What the Extract stage has in hand when it asks a reader to read. */
export interface ReadRequest {
    /** The fetched bytes. */
    Content: Uint8Array;
    /** The resolved file type key, e.g. `pdf`, `html`, `docx`. */
    FileType: string;
    /** Where the bytes came from, for diagnostics and for resolving relative links. */
    URL: string;
    /** The source's type-specific settings, already defaulted and validated. */
    Parameters: Readonly<Record<string, string>>;
    /** Fires when the run is asked to stop. A reader doing heavy work checks it. */
    Signal: AbortSignal;
    /** Report progress during a long read. */
    ReportProgress(message: string): void;
}

/**
 * One semantically complete block of content a reader produced.
 *
 * A reader returning more than one block is how a single fetched artifact becomes several records —
 * an archive reader unpacking a compressed file emits one block per member.
 */
export interface ContentBlock {
    /**
     * The block's text.
     *
     * Empty when the block is not text at all — see {@link Content}. A splitting reader must not
     * manufacture text it does not have: decoding arbitrary bytes as UTF-8 produces a string, but a
     * string of mojibake, which then gets chunked, embedded and served as though it meant something.
     */
    Text: string;
    /**
     * The block's raw bytes, for a block that is not text.
     *
     * A reader sets this instead of {@link Text} when it has unpacked something — a PDF or an image
     * inside an archive — that needs its own extraction rather than a decode. The stage keeps the
     * bytes and routes the block down the non-text path, the same one a non-text source record takes.
     */
    Content?: Uint8Array;
    /**
     * A stable identity for this block within its parent, appended to the parent's URL to form the
     * child's own. An archive member's path is the natural choice.
     */
    Key?: string;
    /** A title the reader could determine from the block's own structure. */
    Title?: string;
    /** How much the reader trusts that title. Omitted means it has no opinion. */
    TitleConfidence?: number;
    /**
     * Force a specific reader for this block, stamped by the reader that produced it.
     *
     * This is how a splitting reader routes one of its own children somewhere else — an archive
     * reader that knows a member is a spreadsheet does not make the cascade work it out again.
     */
    ExtractorKeyOverride?: string;
    /** The block's file type, when a splitting reader knows it differs from its parent's. */
    FileType?: string;
}

/** What a reader returned. */
export interface ReadResult {
    /**
     * The blocks read. One block is the ordinary case; several means this artifact becomes several
     * records, linked to the one that produced them.
     */
    Blocks: ContentBlock[];
    /**
     * Whether the text is the result of a last-resort plain-text read rather than a reader that
     * understands the format. Recorded in provenance so a bad result can be traced to the fallback
     * rather than blamed on a reader that never ran.
     */
    IsFallback?: boolean;
}

/**
 * A registered way of turning bytes into text.
 *
 * Selection is by what the content **is**, never by where it came from — a source type has no vote
 * in reader choice, because the same source can hold several formats.
 *
 * @example
 * ```ts
 * @RegisterClass(BaseContentReader, 'pdf')
 * export class PdfContentReader extends BaseContentReader {
 *     public readonly Key = 'pdf';
 *     public readonly SupportedFileTypes = ['pdf'];
 *     public async Read(request: ReadRequest): Promise<ReadResult> { ... }
 * }
 * ```
 */
export abstract class BaseContentReader {
    /** The registration key. Must match the key passed to `@RegisterClass`. */
    public abstract readonly Key: string;

    /**
     * The file types this reader handles.
     *
     * A candidate that does not declare support for the resolved file type is treated as not
     * applicable at every rung of the cascade, falling through exactly as an unset rung does. `'*'`
     * declares support for anything, which only the built-in fallback should use.
     */
    public abstract readonly SupportedFileTypes: readonly string[];

    /** Read the bytes. */
    public abstract Read(request: ReadRequest): Promise<ReadResult>;

    /** Whether this reader handles a given file type. */
    public Supports(fileType: string): boolean {
        return this.SupportedFileTypes.includes('*') || this.SupportedFileTypes.includes(fileType.toLowerCase());
    }

    /** Resolve a registered reader by key, returning null rather than a hollow base instance. */
    public static Resolve(key: string): BaseContentReader | null {
        if (!key || key.trim().length === 0) {
            return null;
        }
        const result = MJGlobal.Instance.ClassFactory.TryCreateInstance<BaseContentReader>(
            BaseContentReader,
            key.trim(),
        );
        return result.Resolved ? result.Instance : null;
    }
}
