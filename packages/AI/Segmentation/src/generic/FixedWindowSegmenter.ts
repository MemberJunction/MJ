/**
 * @fileoverview Fixed-window segmenter — the universal fallback strategy.
 *
 * @module @memberjunction/ai-segmentation
 */

import { RegisterClass } from '@memberjunction/global';
import { BaseSegmenter } from './BaseSegmenter';
import { TextChunker } from '@memberjunction/ai-vectors';
import { ContentModality, RawSegment, SegmentationOptions, SegmentationParams } from './Segmentation.types';

/** Registration key for {@link FixedWindowSegmenter}. */
export const FIXED_WINDOW_SEGMENTER_KEY = 'FixedWindow';

/** Options specific to {@link FixedWindowSegmenter}. */
export interface FixedWindowSegmentationOptions extends SegmentationOptions {
    /**
     * Window length in ms for audio/video with no transcript.
     *
     * Defaults to 30000 (30s). Multimodal embedders sample a bounded number of
     * frames per call, giving an effective window of roughly half a minute
     * regardless of clip length — windows much longer than this are silently
     * under-sampled, so the default deliberately stays under that ceiling.
     */
    WindowMs?: number;
    /** Overlap between consecutive AV windows, in ms. Default: 0. */
    WindowOverlapMs?: number;
    /** Text splitting strategy handed to `TextChunker`. Default: `'sentence'`. */
    TextStrategy?: 'sentence' | 'paragraph' | 'fixed';
}

/**
 * Splits content into uniform windows: token-bounded chunks for text, and
 * fixed-duration windows for audio/video that has no transcript.
 *
 * This is the safety net, not the recommended default. It requires no LLM call,
 * no transcript, and no document structure, so it always produces *something* —
 * which makes it the right choice for logs, machine-generated text, and media
 * that arrives without cues. Where structure or a transcript exists, prefer
 * `StructuralText` or `Transcript`, both of which cut on real boundaries.
 */
@RegisterClass(BaseSegmenter, FIXED_WINDOW_SEGMENTER_KEY)
export class FixedWindowSegmenter extends BaseSegmenter {
    public get Key(): string {
        return FIXED_WINDOW_SEGMENTER_KEY;
    }

    public get SupportedModalities(): ContentModality[] {
        return ['text', 'image', 'audio', 'video', 'multimodal'];
    }

    protected SegmentCore(params: SegmentationParams<FixedWindowSegmentationOptions>): RawSegment[] {
        if (params.Text && params.Text.trim().length > 0) {
            return this.segmentText(params);
        }
        if (params.Media) {
            return this.segmentMedia(params);
        }
        return [];
    }

    /** Token-bounded text windows, offsets preserved. */
    private segmentText(params: SegmentationParams<FixedWindowSegmentationOptions>): RawSegment[] {
        const settings = this.resolveOptions(params.Options);
        const chunks = TextChunker.ChunkText({
            Text: params.Text ?? '',
            MaxChunkTokens: settings.MaxSegmentTokens,
            OverlapTokens: settings.OverlapTokens,
            Strategy: params.Options?.TextStrategy ?? 'sentence',
        });
        return chunks.map((chunk) => ({
            Modality: 'text',
            Text: chunk.Text,
            StartOffset: chunk.StartOffset,
            EndOffset: chunk.EndOffset,
        }));
    }

    /** Fixed-duration media windows, or a single segment for untimed media. */
    private segmentMedia(params: SegmentationParams<FixedWindowSegmentationOptions>): RawSegment[] {
        const modality = this.resolveMediaModality(params);
        if (modality === 'image' || !params.DurationMs || params.DurationMs <= 0) {
            return [{ Modality: modality, Media: params.Media }];
        }
        return this.buildTimeWindows(params, modality);
    }

    /** Walk the asset duration emitting one window per step. */
    private buildTimeWindows(
        params: SegmentationParams<FixedWindowSegmentationOptions>,
        modality: ContentModality,
    ): RawSegment[] {
        const windowMs = Math.max(params.Options?.WindowMs ?? 30_000, 1);
        // Cap overlap at half the window, matching TextChunker's rule for text. Beyond 50% each
        // window is mostly a copy of the previous one, and as overlap approaches the window size the
        // segment count explodes — a 1s window with 5s of overlap would emit one segment per
        // millisecond, and every one of those is a paid multimodal embedding call.
        const overlapMs = Math.min(params.Options?.WindowOverlapMs ?? 0, Math.floor(windowMs / 2));
        const step = Math.max(windowMs - overlapMs, 1);
        const duration = params.DurationMs ?? 0;
        const segments: RawSegment[] = [];

        for (let start = 0; start < duration; start += step) {
            const end = Math.min(start + windowMs, duration);
            segments.push({ Modality: modality, Media: params.Media, StartMs: start, EndMs: end });
            if (end >= duration) {
                break;
            }
        }
        return segments;
    }

    /** Infer the media modality from its mime type. */
    private resolveMediaModality(params: SegmentationParams<FixedWindowSegmentationOptions>): ContentModality {
        const mime = (params.Media?.MimeType ?? params.MimeType ?? '').toLowerCase();
        if (mime.startsWith('video/')) {
            return 'video';
        }
        if (mime.startsWith('audio/')) {
            return 'audio';
        }
        if (mime.startsWith('image/')) {
            return 'image';
        }
        return 'multimodal';
    }
}
