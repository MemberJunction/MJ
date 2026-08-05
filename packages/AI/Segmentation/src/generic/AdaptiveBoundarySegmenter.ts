/**
 * @fileoverview Target-size segmenter with an escalating boundary preference.
 *
 * @module @memberjunction/ai-segmentation
 */

import { RegisterClass } from '@memberjunction/global';
import { TextChunker } from '@memberjunction/ai-vectors';
import { BaseSegmenter } from './BaseSegmenter';
import { ContentModality, RawSegment, SegmentationOptions, SegmentationParams } from './Segmentation.types';

/** Registration key for {@link AdaptiveBoundarySegmenter}. */
export const ADAPTIVE_BOUNDARY_SEGMENTER_KEY = 'AdaptiveBoundary';

/** Options specific to {@link AdaptiveBoundarySegmenter}. */
export interface AdaptiveBoundarySegmentationOptions extends SegmentationOptions {
    /**
     * Desired segment size in tokens.
     *
     * **Size this to your queries, not to your embedding model.** The model's context
     * window is an upper bound, not a target — a chunk should be about as much content as
     * a good answer to a typical query, so that a matching chunk is mostly signal. If
     * queries are short paraphrases, smaller chunks retrieve better; if downstream
     * summarization wants context, larger ones do. Default: 512.
     */
    TargetTokens?: number;
    /**
     * How far *below* target (percent) the segmenter may close on a good boundary.
     * Entering this band is what makes segment sizes vary in service of clean breaks.
     * Default: 20.
     */
    UndershootPercent?: number;
    /**
     * How far *above* target (percent) it keeps looking for a sentence or word boundary
     * before giving up and cutting at the hard ceiling. Default: 20.
     */
    OvershootPercent?: number;
    /**
     * If the whole text is within this percent above target, emit it as ONE segment
     * rather than splitting it into a large piece plus a small remainder. Default: 40.
     */
    NoSplitPercent?: number;
}

/** A boundary candidate located during the escalating scan. */
interface BoundaryScan {
    /** Exclusive end offset of the segment. */
    End: number;
    /** Which rule produced it — useful for diagnostics. */
    Kind: 'paragraph' | 'sentence' | 'word' | 'hard' | 'end';
}

/**
 * Splits text toward a **target** size, closing on the best available natural boundary
 * near that target rather than cutting at a fixed offset.
 *
 * ## Why this beats a fixed window
 *
 * A fixed window cuts wherever the budget runs out, which routinely lands mid-paragraph
 * — the chunk then straddles two ideas and matches neither query well. This segmenter
 * treats the target as a goal with a tolerance band and escalates through boundary
 * quality as it goes:
 *
 * 1. Once within `UndershootPercent` of target, close on a **paragraph** break.
 * 2. Past target, accept a **sentence** break.
 * 3. Past `OvershootPercent`, accept a **word** break.
 * 4. Failing all of those, cut at the hard `MaxSegmentTokens` ceiling.
 *
 * Segment sizes therefore vary — deliberately. A slightly short segment that ends at a
 * paragraph is worth more at retrieval time than an exactly-sized one that ends mid-clause.
 *
 * It also declines to split at all when the whole text is only modestly over target
 * (`NoSplitPercent`), which avoids the common pathology of one full-size chunk followed by
 * a runt carrying two sentences and no context.
 *
 * This is the recommended default for prose when document structure isn't available;
 * prefer `StructuralText` when the content has headings, since an authored boundary beats
 * an inferred one.
 */
@RegisterClass(BaseSegmenter, ADAPTIVE_BOUNDARY_SEGMENTER_KEY)
export class AdaptiveBoundarySegmenter extends BaseSegmenter {
    public get Key(): string {
        return ADAPTIVE_BOUNDARY_SEGMENTER_KEY;
    }

    public get SupportedModalities(): ContentModality[] {
        return ['text'];
    }

    protected SegmentCore(params: SegmentationParams<AdaptiveBoundarySegmentationOptions>): RawSegment[] {
        const text = params.Text ?? '';
        if (text.trim().length === 0) {
            return [];
        }
        const settings = this.resolveAdaptiveOptions(params.Options);
        if (this.fitsWithoutSplitting(text, settings)) {
            return [{ Modality: 'text', Text: text.trim(), StartOffset: 0, EndOffset: text.length }];
        }
        return this.walk(text, settings);
    }

    /** True when the whole text is close enough to target that splitting would only make a runt. */
    private fitsWithoutSplitting(text: string, settings: Required<AdaptiveBoundarySegmentationOptions>): boolean {
        const limit = this.targetChars(settings) * (1 + settings.NoSplitPercent / 100);
        return text.length <= limit;
    }

    /** Walk the text emitting one segment per located boundary. */
    private walk(text: string, settings: Required<AdaptiveBoundarySegmentationOptions>): RawSegment[] {
        const segments: RawSegment[] = [];
        const overlapChars = this.overlapChars(settings);
        let cursor = 0;

        while (cursor < text.length) {
            const boundary = this.findBoundary(text, cursor, settings);
            const body = text.slice(cursor, boundary.End).trim();
            if (body.length > 0) {
                segments.push({ Modality: 'text', Text: body, StartOffset: cursor, EndOffset: boundary.End });
            }
            if (boundary.End >= text.length) {
                break;
            }
            // Always advance, even when the overlap would otherwise stall the cursor.
            cursor = Math.max(boundary.End - overlapChars, cursor + 1);
        }
        return segments;
    }

    /**
     * Locate this segment's end by escalating through boundary quality.
     * Ranges are half-open [from, to).
     */
    private findBoundary(
        text: string,
        cursor: number,
        settings: Required<AdaptiveBoundarySegmentationOptions>,
    ): BoundaryScan {
        const target = this.targetChars(settings);
        const softMin = cursor + Math.floor(target * (1 - settings.UndershootPercent / 100));
        const softMax = cursor + Math.floor(target * (1 + settings.OvershootPercent / 100));
        const hardMax = cursor + this.hardChars(settings);

        if (text.length <= softMax) {
            return { End: text.length, Kind: 'end' };
        }

        const paragraph = this.lastMatch(text, /\n\s*\n/g, softMin, softMax);
        if (paragraph !== null) {
            return { End: paragraph, Kind: 'paragraph' };
        }
        const sentence = this.lastMatch(text, /[.!?]["')\]]?\s/g, softMin, softMax);
        if (sentence !== null) {
            return { End: sentence, Kind: 'sentence' };
        }
        const word = this.lastMatch(text, /\s+/g, softMin, Math.min(hardMax, text.length));
        if (word !== null) {
            return { End: word, Kind: 'word' };
        }
        return { End: Math.min(hardMax, text.length), Kind: 'hard' };
    }

    /**
     * End offset of the last match of `pattern` starting within [from, to), or null.
     * The returned offset is the END of the match, so the delimiter stays with the
     * segment it terminates rather than opening the next one.
     */
    private lastMatch(text: string, pattern: RegExp, from: number, to: number): number | null {
        if (to <= from) {
            return null;
        }
        const scan = new RegExp(pattern.source, 'g');
        scan.lastIndex = Math.max(from, 0);
        let found: number | null = null;
        let match = scan.exec(text);
        while (match !== null && match.index < to) {
            found = match.index + match[0].length;
            match = scan.exec(text);
        }
        return found;
    }

    // ─────────────────────────────────────────────
    // Settings
    // ─────────────────────────────────────────────

    /** Merge caller options with adaptive-specific defaults. */
    private resolveAdaptiveOptions(
        options?: AdaptiveBoundarySegmentationOptions,
    ): Required<AdaptiveBoundarySegmentationOptions> {
        const base = this.resolveOptions(options);
        const target = Math.max(options?.TargetTokens ?? base.MaxSegmentTokens, 1);
        return {
            ...base,
            // The hard ceiling can never sit below the target, or every segment would be
            // cut by the ceiling before a boundary was ever considered.
            MaxSegmentTokens: Math.max(base.MaxSegmentTokens, target),
            TargetTokens: target,
            UndershootPercent: this.clampPercent(options?.UndershootPercent ?? 20, 0, 90),
            OvershootPercent: this.clampPercent(options?.OvershootPercent ?? 20, 0, 200),
            NoSplitPercent: this.clampPercent(options?.NoSplitPercent ?? 40, 0, 500),
        };
    }

    /** Keep a percentage option inside a sane range. */
    private clampPercent(value: number, min: number, max: number): number {
        if (!Number.isFinite(value)) {
            return min;
        }
        return Math.min(Math.max(value, min), max);
    }

    /** Target size expressed in characters (TextChunker's ~4 chars/token estimate). */
    private targetChars(settings: Required<AdaptiveBoundarySegmentationOptions>): number {
        return settings.TargetTokens * 4;
    }

    /** Hard ceiling expressed in characters. */
    private hardChars(settings: Required<AdaptiveBoundarySegmentationOptions>): number {
        return settings.MaxSegmentTokens * 4;
    }

    /** Overlap in characters, capped at half the target so segments always advance. */
    private overlapChars(settings: Required<AdaptiveBoundarySegmentationOptions>): number {
        return Math.min(settings.OverlapTokens * 4, Math.floor(this.targetChars(settings) / 2));
    }

    /** Estimated tokens for a string — exposed for callers reasoning about sizing. */
    public EstimateTokens(text: string): number {
        return TextChunker.EstimateTokenCount(text);
    }
}
