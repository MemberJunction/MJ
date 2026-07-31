/**
 * @fileoverview Transcript-driven segmenter — turns timed cues into chapters.
 *
 * @module @memberjunction/ai-segmentation
 */

import { RegisterClass } from '@memberjunction/global';
import { BaseSegmenter } from './BaseSegmenter';
import {
    ContentModality,
    RawSegment,
    SegmentationOptions,
    SegmentationParams,
    TranscriptCue,
} from './Segmentation.types';

/** Registration key for {@link TranscriptSegmenter}. */
export const TRANSCRIPT_SEGMENTER_KEY = 'Transcript';

/** Options specific to {@link TranscriptSegmenter}. */
export interface TranscriptSegmentationOptions extends SegmentationOptions {
    /** Maximum wall-clock length of one chapter, in ms. Default: 300000 (5 minutes). */
    MaxChapterMs?: number;
    /**
     * A silence gap at least this long is treated as a chapter boundary — the
     * cheapest reliable topic-shift signal in a recording. Default: 4000.
     */
    BoundaryGapMs?: number;
    /**
     * Also emit one child segment per speaker turn inside each chapter. Doubles
     * embedding cost, so it is opt-in; enable for panel/interview content where
     * per-speaker retrieval matters. Default: false.
     */
    EmitSubChapters?: boolean;
    /** Modality to stamp on emitted segments when it can't be inferred. Default: `'audio'`. */
    DefaultModality?: Extract<ContentModality, 'audio' | 'video'>;
}

/** A group of contiguous cues that will become one segment. */
interface CueGroup {
    Cues: TranscriptCue[];
    StartMs: number;
    EndMs: number;
}

/**
 * Segments audio/video into **chapters** using its timed transcript.
 *
 * A 60-minute session recording embedded as a single vector is a mush vector —
 * multimodal embedders only see a short window, and no single vector can represent
 * an hour of distinct topics. This segmenter finds real boundaries first (silence
 * gaps, speaker changes, a duration ceiling) and emits time-windowed chapters that
 * each carry **both** a media reference (with `StartMs`/`EndMs`) *and* the
 * transcript text for that window.
 *
 * That dual payload is deliberate: the media reference is what a multimodal model
 * embeds for retrieval, while the transcript is what an agent can actually read,
 * what a cross-encoder can rerank, and what keyword search can match.
 *
 * Cues come from any ASR source, including MemberJunction's realtime session
 * capture, which already records per-turn text with speaker labels and timings.
 */
@RegisterClass(BaseSegmenter, TRANSCRIPT_SEGMENTER_KEY)
export class TranscriptSegmenter extends BaseSegmenter {
    public get Key(): string {
        return TRANSCRIPT_SEGMENTER_KEY;
    }

    public get SupportedModalities(): ContentModality[] {
        return ['audio', 'video', 'multimodal'];
    }

    protected SegmentCore(params: SegmentationParams<TranscriptSegmentationOptions>): RawSegment[] {
        const cues = this.sortCues(params.Cues ?? []);
        if (cues.length === 0) {
            return [];
        }
        const settings = this.resolveTranscriptOptions(params.Options);
        const chapters = this.groupIntoChapters(cues, settings);
        return this.buildSegments(chapters, params, settings);
    }

    // ─────────────────────────────────────────────
    // Grouping
    // ─────────────────────────────────────────────

    /** Cues must be time-ordered before boundary detection; callers may supply any order. */
    private sortCues(cues: TranscriptCue[]): TranscriptCue[] {
        return [...cues].filter((c) => !!c && c.Text.trim().length > 0).sort((a, b) => a.StartMs - b.StartMs);
    }

    /** Accumulate cues into chapters, breaking on gap, duration, or token pressure. */
    private groupIntoChapters(cues: TranscriptCue[], settings: Required<TranscriptSegmentationOptions>): CueGroup[] {
        const chapters: CueGroup[] = [];
        let current: TranscriptCue[] = [];

        for (const cue of cues) {
            if (current.length > 0 && this.isChapterBoundary(current, cue, settings)) {
                chapters.push(this.toGroup(current));
                current = [];
            }
            current.push(cue);
        }
        if (current.length > 0) {
            chapters.push(this.toGroup(current));
        }
        return chapters;
    }

    /** True when `next` should start a new chapter rather than extend the current one. */
    private isChapterBoundary(
        current: TranscriptCue[],
        next: TranscriptCue,
        settings: Required<TranscriptSegmentationOptions>,
    ): boolean {
        const previous = current[current.length - 1];
        if (next.StartMs - previous.EndMs >= settings.BoundaryGapMs) {
            return true;
        }
        if (next.EndMs - current[0].StartMs > settings.MaxChapterMs) {
            return true;
        }
        return this.textTokens(current) + this.cueTokens(next) > settings.MaxSegmentTokens;
    }

    /** Split a chapter's cues into runs of consecutive same-speaker cues. */
    private groupBySpeaker(cues: TranscriptCue[]): CueGroup[] {
        const runs: CueGroup[] = [];
        let current: TranscriptCue[] = [];
        for (const cue of cues) {
            const previous = current[current.length - 1];
            if (previous && previous.Speaker !== cue.Speaker) {
                runs.push(this.toGroup(current));
                current = [];
            }
            current.push(cue);
        }
        if (current.length > 0) {
            runs.push(this.toGroup(current));
        }
        return runs;
    }

    /** Wrap a cue list with its computed time span. */
    private toGroup(cues: TranscriptCue[]): CueGroup {
        return {
            Cues: cues,
            StartMs: cues[0].StartMs,
            EndMs: cues[cues.length - 1].EndMs,
        };
    }

    // ─────────────────────────────────────────────
    // Segment construction
    // ─────────────────────────────────────────────

    /** Emit chapter segments, plus per-speaker children when configured. */
    private buildSegments(
        chapters: CueGroup[],
        params: SegmentationParams<TranscriptSegmentationOptions>,
        settings: Required<TranscriptSegmentationOptions>,
    ): RawSegment[] {
        const modality = this.resolveModality(params, settings);
        const segments: RawSegment[] = [];

        chapters.forEach((chapter, index) => {
            segments.push(this.toRawSegment(chapter, modality, params, `Chapter ${index + 1}`));
            const chapterIndex = segments.length - 1;
            if (settings.EmitSubChapters) {
                this.appendSubChapters(segments, chapter, modality, params, chapterIndex);
            }
        });
        return segments;
    }

    /** Append one child segment per speaker run within a chapter. */
    private appendSubChapters(
        segments: RawSegment[],
        chapter: CueGroup,
        modality: ContentModality,
        params: SegmentationParams<TranscriptSegmentationOptions>,
        parentIndex: number,
    ): void {
        const runs = this.groupBySpeaker(chapter.Cues);
        if (runs.length <= 1) {
            return;
        }
        for (const run of runs) {
            const child = this.toRawSegment(run, modality, params, run.Cues[0].Speaker);
            child.ParentIndex = parentIndex;
            segments.push(child);
        }
    }

    /** Build a segment carrying both the media time-window and the transcript text. */
    private toRawSegment(
        group: CueGroup,
        modality: ContentModality,
        params: SegmentationParams<TranscriptSegmentationOptions>,
        title?: string,
    ): RawSegment {
        return {
            Modality: modality,
            Text: group.Cues.map((c) => this.formatCue(c)).join(' ').trim(),
            Media: params.Media,
            Title: title,
            StartMs: group.StartMs,
            EndMs: group.EndMs,
            Speaker: this.dominantSpeaker(group.Cues),
        };
    }

    /** Prefix a cue with its speaker so the transcript reads as dialogue. */
    private formatCue(cue: TranscriptCue): string {
        return cue.Speaker ? `${cue.Speaker}: ${cue.Text.trim()}` : cue.Text.trim();
    }

    /** The only speaker in the group, or undefined when several speak. */
    private dominantSpeaker(cues: TranscriptCue[]): string | undefined {
        const speakers = new Set(cues.map((c) => c.Speaker).filter((s): s is string => !!s));
        return speakers.size === 1 ? [...speakers][0] : undefined;
    }

    /** Infer audio vs. video from the media mime type, else use the configured default. */
    private resolveModality(
        params: SegmentationParams<TranscriptSegmentationOptions>,
        settings: Required<TranscriptSegmentationOptions>,
    ): ContentModality {
        const mime = (params.Media?.MimeType ?? params.MimeType ?? '').toLowerCase();
        if (mime.startsWith('video/')) {
            return 'video';
        }
        if (mime.startsWith('audio/')) {
            return 'audio';
        }
        return settings.DefaultModality;
    }

    // ─────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────

    /** Merge caller options with transcript-specific defaults. */
    private resolveTranscriptOptions(options?: TranscriptSegmentationOptions): Required<TranscriptSegmentationOptions> {
        return {
            ...this.resolveOptions(options),
            MaxChapterMs: options?.MaxChapterMs ?? 300_000,
            BoundaryGapMs: options?.BoundaryGapMs ?? 4_000,
            EmitSubChapters: options?.EmitSubChapters ?? false,
            DefaultModality: options?.DefaultModality ?? 'audio',
        };
    }

    /** Estimated tokens for a set of cues. */
    private textTokens(cues: TranscriptCue[]): number {
        return cues.reduce((sum, cue) => sum + this.cueTokens(cue), 0);
    }

    /** Estimated tokens for one cue. */
    private cueTokens(cue: TranscriptCue): number {
        return this.tokensOf({ Modality: 'text', Text: cue.Text });
    }
}
