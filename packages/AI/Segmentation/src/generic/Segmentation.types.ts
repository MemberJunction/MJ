/**
 * @fileoverview Type contract for content segmentation.
 *
 * Segmentation is the step that turns a piece of source content (a document, a
 * recording, an image) into an ordered list of embeddable {@link ContentSegment}s.
 * It sits *upstream* of embedding: a segmenter decides **what** gets embedded,
 * the embedding model decides **how**.
 *
 * This is deliberately separate from `TextChunker` (in `@memberjunction/ai-vectors`). `TextChunker` answers
 * "how do I split this string so it fits a token budget"; a segmenter answers
 * "what are the meaningful units of this content" — which may be sections of a
 * document, chapters of a recording, or a single image. Segmenters typically
 * *use* `TextChunker` to enforce the token budget within a unit they identified.
 *
 * @module @memberjunction/ai-segmentation
 */

import { UserInfo } from '@memberjunction/core';

/**
 * The modality of a segment's payload. Drives downstream index routing
 * (text vs. multimodal vector index) and retrieval-time fusion.
 */
export type ContentModality = 'text' | 'image' | 'audio' | 'video' | 'multimodal';

/**
 * A pointer to non-text content. Segmenters emit these for media segments
 * instead of (or alongside) `Text`.
 *
 * Exactly one of `URL`, `Base64Data`, or (`StorageProviderKey` + `ObjectKey`)
 * is expected to be populated; consumers resolve whichever is present.
 */
export interface MediaReference {
    /** Directly fetchable URL (http(s) or data URL). */
    URL?: string;
    /** `@memberjunction/storage` provider key, when the media lives in MJ file storage. */
    StorageProviderKey?: string;
    /** Object/blob key within the storage provider. */
    ObjectKey?: string;
    /** IANA mime type, e.g. `video/mp4`. Used to gate provider capability checks. */
    MimeType?: string;
    /** Inline base64 payload (no data-URL prefix). Prefer URL/storage refs for large media. */
    Base64Data?: string;
}

/**
 * A single timed transcript cue — the unit produced by ASR and by MJ's
 * realtime session capture (which records speaker + timings per turn).
 */
export interface TranscriptCue {
    /** Cue start, milliseconds from the beginning of the asset. */
    StartMs: number;
    /** Cue end, milliseconds from the beginning of the asset. */
    EndMs: number;
    /** Spoken text for this cue. */
    Text: string;
    /** Optional speaker label/id — a speaker change is a strong boundary signal. */
    Speaker?: string;
}

/**
 * One embeddable unit of content produced by a segmenter.
 *
 * A segment carries `Text`, `Media`, or **both** (the "dual representation" case:
 * a video chapter with a native media reference *and* its transcript, so it can be
 * embedded natively for retrieval while remaining readable for an agent).
 */
export interface ContentSegment {
    /** 0-based position within the full segment list. Assigned by {@link BaseSegmenter}. */
    Sequence: number;
    /** Payload modality. */
    Modality: ContentModality;
    /** Textual payload — the extracted/transcribed text for this segment. */
    Text?: string;
    /** Media payload pointer, for non-text segments. */
    Media?: MediaReference;
    /** Human-readable label, e.g. a heading or a generated chapter title. */
    Title?: string;
    /** Inclusive start character offset within the source text. */
    StartOffset?: number;
    /** Exclusive end character offset within the source text. */
    EndOffset?: number;
    /** Segment start in milliseconds, for audio/video. */
    StartMs?: number;
    /** Segment end in milliseconds, for audio/video. */
    EndMs?: number;
    /** 1-based page number, for paginated sources (PDF, slides). */
    PageNumber?: number;
    /** `Sequence` of this segment's parent, for chapter -> sub-chapter hierarchies. */
    ParentSequence?: number;
    /** Nesting depth; 0 for top-level segments. */
    Depth: number;
    /** Estimated token count of `Text` (0 for pure-media segments). */
    TokenEstimate: number;
    /** Registration key of the segmenter that produced this segment — provenance. */
    SegmenterKey: string;
    /** Speaker label carried through from transcript cues, when known. */
    Speaker?: string;
}

/**
 * A segment as emitted by a concrete segmenter's `SegmentCore`, before the base
 * class normalizes it (assigns `Sequence`/`Depth`/`TokenEstimate`, enforces the
 * token ceiling, and resolves parent links).
 *
 * `ParentIndex` refers to the **index within the raw array** returned by
 * `SegmentCore`; the base class remaps it to a real `Sequence` afterwards, which
 * keeps subclasses from having to reason about post-split numbering.
 */
export interface RawSegment {
    Modality: ContentModality;
    Text?: string;
    Media?: MediaReference;
    Title?: string;
    StartOffset?: number;
    EndOffset?: number;
    StartMs?: number;
    EndMs?: number;
    PageNumber?: number;
    Speaker?: string;
    /** Index into the raw segment array identifying this segment's parent. */
    ParentIndex?: number;
}

/**
 * Common knobs understood by every segmenter. Concrete segmenters extend this
 * with their own strongly-typed options rather than accepting a loose bag.
 */
export interface SegmentationOptions {
    /**
     * Hard ceiling on tokens per text segment. The base class splits any
     * oversized segment via `TextChunker` so no segmenter can exceed it.
     * Default: 512.
     */
    MaxSegmentTokens?: number;
    /** Overlap tokens applied when an oversized segment must be split. Default: 10% of max. */
    OverlapTokens?: number;
    /**
     * Segments whose text estimates below this many tokens are merged forward into
     * the next segment, preventing a spray of near-empty vectors. Default: 0 (off).
     */
    MinSegmentTokens?: number;
}

/**
 * Input to {@link BaseSegmenter.Segment}.
 *
 * @typeParam TOptions - the concrete segmenter's options type.
 */
export interface SegmentationParams<TOptions extends SegmentationOptions = SegmentationOptions> {
    /** Extracted text of the source content, when it has any. */
    Text?: string;
    /** Media pointer for the source asset, for image/audio/video content. */
    Media?: MediaReference;
    /** Timed transcript cues, when available (ASR output or MJ realtime capture). */
    Cues?: TranscriptCue[];
    /** Total duration of the source asset in milliseconds, for AV content. */
    DurationMs?: number;
    /** Mime type of the source asset — lets a segmenter pick a structure parser. */
    MimeType?: string;
    /**
     * Context user, required by segmenters that call MJ services (e.g. the LLM
     * boundary pass in `SemanticTextSegmenter`). Always pass it in server-side code.
     */
    ContextUser?: UserInfo;
    /** Strategy-specific options. */
    Options?: TOptions;
}

/**
 * Result of a segmentation pass. Segmenters never throw for content-shaped
 * problems — they return `Success: false` with an `ErrorMessage`, matching the
 * convention used by `RunView` and `BaseEntity.Save`.
 */
export interface SegmentationResult {
    /** False when segmentation could not be performed. */
    Success: boolean;
    /** The produced segments, in order. Empty when `Success` is false. */
    Segments: ContentSegment[];
    /** Registration key of the segmenter that ran. */
    SegmenterKey: string;
    /** Populated when `Success` is false. */
    ErrorMessage?: string;
    /** Non-fatal notes — e.g. "no cues supplied, fell back to fixed windows". */
    Warnings: string[];
}

/** Default token ceiling applied when a caller does not specify one. */
export const DEFAULT_MAX_SEGMENT_TOKENS = 512;
