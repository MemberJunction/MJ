/**
 * @fileoverview Abstract base for all content segmenters.
 *
 * @module @memberjunction/ai-segmentation
 */

import { MJGlobal } from '@memberjunction/global';
import { LogError } from '@memberjunction/core';
import { TextChunker } from '@memberjunction/ai-vectors';
import {
    ContentModality,
    ContentSegment,
    DEFAULT_MAX_SEGMENT_TOKENS,
    RawSegment,
    SegmentationOptions,
    SegmentationParams,
    SegmentationResult,
} from './Segmentation.types';

/** Internal working record: one emitted segment plus the raw index it came from. */
interface EmittedSegment {
    RawIndex: number;
    Segment: Omit<ContentSegment, 'Sequence' | 'Depth' | 'ParentSequence'>;
}

/**
 * Base class for content segmentation strategies.
 *
 * ## Why this exists
 *
 * Chunking used to be a private helper inside whichever pipeline needed it, which
 * meant every new strategy (structure-aware, LLM topic boundaries, audio chapters)
 * would have been another bespoke branch. `BaseSegmenter` turns "how do I split this
 * content" into a **registered, swappable strategy** selected from metadata — the
 * same pattern `BaseEmbeddings` and `VectorDBBase` already use for their providers.
 *
 * ## Adding a new strategy
 *
 * Implement {@link SegmentCore} and register the class. That is the whole contract —
 * the base class handles validation, the token ceiling, small-segment merging,
 * sequence numbering, parent/child remapping, and provenance stamping:
 *
 * ```typescript
 * @RegisterClass(BaseSegmenter, 'MyStrategy')
 * export class MySegmenter extends BaseSegmenter {
 *     public get Key(): string { return 'MyStrategy'; }
 *     public get SupportedModalities(): ContentModality[] { return ['text']; }
 *
 *     protected async SegmentCore(params: SegmentationParams): Promise<RawSegment[]> {
 *         return myBoundaries(params.Text ?? '').map(b => ({
 *             Modality: 'text', Text: b.Text, StartOffset: b.Start, EndOffset: b.End
 *         }));
 *     }
 * }
 * ```
 *
 * Subclasses emit {@link RawSegment}s and never worry about numbering: `ParentIndex`
 * refers to positions in the array they just returned, and the base class remaps it
 * to real `Sequence` values after any oversized segment has been split.
 */
export abstract class BaseSegmenter {
    /**
     * The registration key for this segmenter. Must match the key passed to
     * `@RegisterClass` so metadata-driven resolution round-trips.
     */
    public abstract get Key(): string;

    /** Modalities this segmenter can produce. Used to validate configuration. */
    public abstract get SupportedModalities(): ContentModality[];

    /**
     * Produce the raw, un-normalized segments for this content.
     *
     * Implementations should focus purely on *where the boundaries are*; the base
     * class enforces the token ceiling afterwards, so returning a segment that is
     * too large is acceptable (it will be split, preserving `Title` and offsets).
     */
    protected abstract SegmentCore(params: SegmentationParams): Promise<RawSegment[]> | RawSegment[];

    /**
     * Segment content into embeddable units.
     *
     * Never throws for content-shaped problems — inspect `Success`/`ErrorMessage`.
     */
    public async Segment(params: SegmentationParams): Promise<SegmentationResult> {
        const warnings: string[] = [];
        if (!this.hasPayload(params)) {
            return this.failure('Segmentation requires Text, Media, or Cues.');
        }

        try {
            const raw = await this.SegmentCore(params);
            if (!raw || raw.length === 0) {
                return { Success: true, Segments: [], SegmenterKey: this.Key, Warnings: warnings };
            }
            const segments = this.normalize(raw, this.resolveOptions(params.Options), warnings);
            return { Success: true, Segments: segments, SegmenterKey: this.Key, Warnings: warnings };
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            LogError(`Segmenter '${this.Key}' failed: ${message}`);
            return this.failure(message);
        }
    }

    /**
     * Resolve a registered segmenter by key via the MJ class factory.
     * Returns null when no segmenter is registered under that key.
     *
     * Uses `TryCreateInstance` rather than `CreateInstance` deliberately: the latter never returns
     * null for an unregistered key — it falls back to `new BaseSegmenter()`, a hollow object whose
     * abstract `Key`/`SegmentCore` are undefined. That failure stays invisible until something calls
     * it, so an unresolvable key must be reported as such here.
     */
    public static Resolve(key: string): BaseSegmenter | null {
        if (!key || key.trim().length === 0) {
            return null;
        }
        const result = MJGlobal.Instance.ClassFactory.TryCreateInstance<BaseSegmenter>(BaseSegmenter, key.trim());
        return result.Resolved ? result.Instance : null;
    }

    // ─────────────────────────────────────────────
    // Normalization pipeline
    // ─────────────────────────────────────────────

    /** Apply the full normalization pipeline to raw segments. */
    private normalize(raw: RawSegment[], options: Required<SegmentationOptions>, warnings: string[]): ContentSegment[] {
        const populated = raw.filter((s) => this.hasContent(s));
        if (populated.length < raw.length) {
            warnings.push(`Dropped ${raw.length - populated.length} empty segment(s).`);
        }
        const merged = this.mergeUndersized(populated, options);
        const emitted = this.enforceTokenCeiling(merged, options, warnings);
        return this.assignSequencing(emitted, merged);
    }

    /**
     * Merge adjacent text-only segments that fall below `MinSegmentTokens`, so a
     * document with many one-line sections doesn't produce a spray of weak vectors.
     */
    private mergeUndersized(segments: RawSegment[], options: Required<SegmentationOptions>): RawSegment[] {
        if (options.MinSegmentTokens <= 0) {
            return segments;
        }
        const result: RawSegment[] = [];
        for (const segment of segments) {
            const previous = result[result.length - 1];
            const isSmall = this.tokensOf(segment) < options.MinSegmentTokens;
            if (previous && isSmall && this.isMergeable(previous, segment, options)) {
                result[result.length - 1] = this.mergePair(previous, segment);
            } else {
                result.push(segment);
            }
        }
        return result;
    }

    /** Two segments may merge only when both are plain text at the same place in the tree. */
    private isMergeable(a: RawSegment, b: RawSegment, options: Required<SegmentationOptions>): boolean {
        if (a.Media || b.Media || a.Modality !== 'text' || b.Modality !== 'text') {
            return false;
        }
        if (a.ParentIndex !== b.ParentIndex) {
            return false;
        }
        return this.tokensOf(a) + this.tokensOf(b) <= options.MaxSegmentTokens;
    }

    /** Combine two adjacent text segments, widening offsets/timings to cover both. */
    private mergePair(a: RawSegment, b: RawSegment): RawSegment {
        return {
            ...a,
            Text: `${a.Text ?? ''}\n${b.Text ?? ''}`.trim(),
            EndOffset: b.EndOffset ?? a.EndOffset,
            EndMs: b.EndMs ?? a.EndMs,
        };
    }

    /** Split any text segment exceeding the token ceiling, preserving metadata. */
    private enforceTokenCeiling(
        segments: RawSegment[],
        options: Required<SegmentationOptions>,
        warnings: string[],
    ): EmittedSegment[] {
        const emitted: EmittedSegment[] = [];
        let splitCount = 0;
        segments.forEach((segment, rawIndex) => {
            const pieces = this.splitIfNeeded(segment, options);
            if (pieces.length > 1) {
                splitCount++;
            }
            for (const piece of pieces) {
                emitted.push({ RawIndex: rawIndex, Segment: piece });
            }
        });
        if (splitCount > 0) {
            warnings.push(`Split ${splitCount} oversized segment(s) to fit ${options.MaxSegmentTokens} tokens.`);
        }
        return emitted;
    }

    /** Return one piece when the segment fits, or N pieces via TextChunker when it doesn't. */
    private splitIfNeeded(
        segment: RawSegment,
        options: Required<SegmentationOptions>,
    ): Omit<ContentSegment, 'Sequence' | 'Depth' | 'ParentSequence'>[] {
        const text = segment.Text ?? '';
        if (!text || this.tokensOf(segment) <= options.MaxSegmentTokens) {
            return [this.toSegment(segment, text)];
        }
        const chunks = TextChunker.ChunkText({
            Text: text,
            MaxChunkTokens: options.MaxSegmentTokens,
            OverlapTokens: options.OverlapTokens,
            Strategy: 'sentence',
        });
        if (chunks.length === 0) {
            return [this.toSegment(segment, text)];
        }
        const base = segment.StartOffset ?? 0;
        return chunks.map((chunk) =>
            this.toSegment(segment, chunk.Text, base + chunk.StartOffset, base + chunk.EndOffset),
        );
    }

    /** Build a pre-sequencing segment from a raw segment plus (possibly split) text. */
    private toSegment(
        segment: RawSegment,
        text: string,
        startOffset?: number,
        endOffset?: number,
    ): Omit<ContentSegment, 'Sequence' | 'Depth' | 'ParentSequence'> {
        return {
            Modality: segment.Modality,
            Text: text.length > 0 ? text : undefined,
            Media: segment.Media,
            Title: segment.Title,
            StartOffset: startOffset ?? segment.StartOffset,
            EndOffset: endOffset ?? segment.EndOffset,
            StartMs: segment.StartMs,
            EndMs: segment.EndMs,
            PageNumber: segment.PageNumber,
            Speaker: segment.Speaker,
            TokenEstimate: TextChunker.EstimateTokenCount(text),
            SegmenterKey: this.Key,
        };
    }

    /** Assign Sequence/Depth and remap ParentIndex to the parent's first Sequence. */
    private assignSequencing(emitted: EmittedSegment[], rawSegments: RawSegment[]): ContentSegment[] {
        const firstSequenceByRaw = new Map<number, number>();
        emitted.forEach((item, sequence) => {
            if (!firstSequenceByRaw.has(item.RawIndex)) {
                firstSequenceByRaw.set(item.RawIndex, sequence);
            }
        });
        const depthByRaw = this.computeDepths(rawSegments);
        return emitted.map((item, sequence) => {
            const parentIndex = rawSegments[item.RawIndex]?.ParentIndex;
            const parentSequence = parentIndex === undefined ? undefined : firstSequenceByRaw.get(parentIndex);
            return {
                ...item.Segment,
                Sequence: sequence,
                Depth: depthByRaw.get(item.RawIndex) ?? 0,
                ParentSequence: parentSequence,
            };
        });
    }

    /** Walk each segment's parent chain to a depth, guarding against cycles. */
    private computeDepths(segments: RawSegment[]): Map<number, number> {
        const depths = new Map<number, number>();
        segments.forEach((_, index) => {
            let depth = 0;
            let cursor = segments[index]?.ParentIndex;
            const visited = new Set<number>([index]);
            while (cursor !== undefined && !visited.has(cursor) && segments[cursor]) {
                visited.add(cursor);
                depth++;
                cursor = segments[cursor].ParentIndex;
            }
            depths.set(index, depth);
        });
        return depths;
    }

    // ─────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────

    /** Fill in defaults for any option the caller left unset. */
    protected resolveOptions(options?: SegmentationOptions): Required<SegmentationOptions> {
        const max = options?.MaxSegmentTokens ?? DEFAULT_MAX_SEGMENT_TOKENS;
        return {
            MaxSegmentTokens: max,
            OverlapTokens: options?.OverlapTokens ?? Math.floor(max * 0.1),
            MinSegmentTokens: options?.MinSegmentTokens ?? 0,
        };
    }

    /** True when the params carry something segmentable. */
    private hasPayload(params: SegmentationParams): boolean {
        const hasText = !!params.Text && params.Text.trim().length > 0;
        const hasCues = !!params.Cues && params.Cues.length > 0;
        const hasPages = !!params.Pages && params.Pages.length > 0;
        return hasText || hasCues || hasPages || !!params.Media;
    }

    /** True when a raw segment carries text or media. */
    private hasContent(segment: RawSegment): boolean {
        return (!!segment.Text && segment.Text.trim().length > 0) || !!segment.Media;
    }

    /** Estimated token count of a raw segment's text. */
    protected tokensOf(segment: RawSegment): number {
        return TextChunker.EstimateTokenCount(segment.Text ?? '');
    }

    /** Build a failed result. */
    private failure(message: string): SegmentationResult {
        return { Success: false, Segments: [], SegmenterKey: this.Key, ErrorMessage: message, Warnings: [] };
    }
}
