/**
 * @fileoverview VIDEO PLAYOUT: plays encoded video that arrives in pieces, such as a Gemini Live avatar,
 * through Media Source Extensions. A provider hands each piece to {@link VideoPlayout.Append}; a renderer
 * shows {@link VideoPlayout.Source} with `AttachVideoSource`.
 *
 * - **Format: fragmented MP4.** The first piece of a turn is an init segment (`ftyp` + `moov`); each later
 *   piece is a media fragment (`moof` + `mdat`). A turn may send a fresh init segment and restart its
 *   timestamps; the source buffer runs in `sequence` mode, so playback stays continuous either way.
 * - **The video carries the voice.** An avatar's audio is muxed into the MP4, so the element is not muted and
 *   lips and voice stay in sync on the media's own timestamps. While media is buffered ahead of the
 *   playhead, {@link VideoPlayout.IsPlaying} is true: the agent is audibly speaking.
 * - **End of turn.** {@link VideoPlayout.EndOfTurn} lets playback run to the true end of the turn. Without it the
 *   element stops just short of the end, waiting for more data, and holds the last frame of speech back.
 * - **Barge-in.** {@link VideoPlayout.Flush} drops everything not yet played, so the voice stops at once.
 * - **Gaps.** Between turns, or while a connection resumes, the element holds the last frame.
 * - **Browsers.** `MediaSource` (Chrome, Edge, Firefox, desktop Safari), or `ManagedMediaSource` (iOS Safari
 *   17.1+). {@link VideoPlayout.IsSupported} says whether this browser can play a given type.
 *
 * @module @memberjunction/ai-realtime-client/media
 */

import type { MediaVideoSource } from './model';

/** The type of a Gemini Live avatar: H.264 Constrained Baseline 3.1 video, AAC-LC audio. */
export const GEMINI_AVATAR_MP4_TYPE = 'video/mp4; codecs="avc1.42c01f, mp4a.40.2"';

/** Seconds of already-played media kept behind the playhead before it is removed. */
const DEFAULT_BACK_BUFFER_SECONDS = 10;

/** Back-buffer trims wait until this many more seconds have played, so a removal can never repeat in a loop. */
const TRIM_STEP_SECONDS = 5;

/** Seconds of played media kept when the browser's buffer is full. */
const QUOTA_BACK_BUFFER_SECONDS = 2;

/** Pieces held while no element is attached; older ones are dropped beyond this. */
const MAX_PENDING_PIECES = 600;

/** How far ahead of the playhead counts as "still playing", in seconds. */
const PLAYING_EPSILON_SECONDS = 0.05;

/** `HTMLMediaElement.HAVE_FUTURE_DATA`: the element has data to play beyond the current position. */
const HAVE_FUTURE_DATA = 3;

export interface VideoPlayoutOptions {
    /** The MSE type, with codecs. Defaults to {@link GEMINI_AVATAR_MP4_TYPE}. */
    MimeType?: string;
    /** Seconds of played media to keep behind the playhead. Defaults to 10. */
    BackBufferSeconds?: number;
}

/** Why playout reported a problem. */
export type VideoPlayoutProblem =
    /** The browser cannot play this type through MSE. */
    | 'unsupported'
    /** A media fragment arrived before any init segment and was dropped. */
    | 'fragment-before-init'
    /** The browser rejected a piece (decode error, or out of buffer space after trimming). */
    | 'append-failed'
    /** Pieces arrived while no element was attached and the oldest were dropped. */
    | 'pending-overflow';

/** `ManagedMediaSource` (iOS Safari 17.1+), which TypeScript's DOM types leave out. */
type MediaSourceClass = { new (): MediaSource; isTypeSupported(type: string): boolean };
type MseScope = typeof globalThis & { ManagedMediaSource?: MediaSourceClass; MediaSource?: MediaSourceClass };

/** The MSE implementation this browser offers: the classic one, else the managed one. */
function mediaSourceClass(): { Class: MediaSourceClass; Managed: boolean } | null {
    const scope = globalThis as MseScope;
    if (scope.MediaSource) {
        return { Class: scope.MediaSource, Managed: false };
    }
    return scope.ManagedMediaSource ? { Class: scope.ManagedMediaSource, Managed: true } : null;
}

/** Whether a piece is an MP4 init segment: its first box is `ftyp`. */
export function IsMp4InitSegment(piece: ArrayBuffer): boolean {
    if (piece.byteLength < 8) {
        return false;
    }
    const type = new Uint8Array(piece, 4, 4);
    return type[0] === 0x66 && type[1] === 0x74 && type[2] === 0x79 && type[3] === 0x70; // 'ftyp'
}

/** Plays fragmented MP4 pieces through MSE into one `<video>` element at a time. */
export class VideoPlayout {
    private readonly mimeType: string;
    private readonly backBufferSeconds: number;
    private readonly pending: ArrayBuffer[] = [];
    private readonly problemHandlers = new Set<(problem: VideoPlayoutProblem, message: string) => void>();
    private readonly reported = new Set<VideoPlayoutProblem>();
    private element: HTMLVideoElement | null = null;
    private mediaSource: MediaSource | null = null;
    private objectUrl: string | null = null;
    private sourceBuffer: SourceBuffer | null = null;
    /** The latest init segment, replayed into a new source buffer when the player moves to another element. */
    private lastInit: ArrayBuffer | null = null;
    /** Set by Flush: the next append starts at the playhead instead of after what was dropped. */
    private restartAtPlayhead = false;
    private retriedAfterQuota = false;
    /** Where the last back-buffer trim ended, in media time. */
    private trimmedTo = 0;
    /** Set by EndOfTurn: end the stream once every pending piece is in. */
    private endPending = false;
    private disposed = false;

    /** Whether this browser can play `mimeType` through MSE. */
    public static IsSupported(mimeType: string = GEMINI_AVATAR_MP4_TYPE): boolean {
        return mediaSourceClass()?.Class.isTypeSupported(mimeType) ?? false;
    }

    constructor(options: VideoPlayoutOptions = {}) {
        this.mimeType = options.MimeType ?? GEMINI_AVATAR_MP4_TYPE;
        this.backBufferSeconds = options.BackBufferSeconds ?? DEFAULT_BACK_BUFFER_SECONDS;
    }

    /** The video to show: the player takes over the element it is attached to. */
    public get Source(): MediaVideoSource {
        return { Kind: 'element', Attach: (element) => this.attach(element) };
    }

    /**
     * Whether the element is playing forward with media buffered ahead of the playhead: the agent is audibly
     * speaking. False while it waits for data, which it does just short of the end of a turn that hasn't
     * been ended with {@link EndOfTurn}.
     */
    public get IsPlaying(): boolean {
        const element = this.element;
        const buffered = this.sourceBuffer?.buffered;
        if (!element || element.paused || element.readyState < HAVE_FUTURE_DATA || !buffered || buffered.length === 0) {
            return false;
        }
        return buffered.end(buffered.length - 1) - element.currentTime > PLAYING_EPSILON_SECONDS;
    }

    /** Hands over one piece: an init segment or a media fragment, in the order they arrived. */
    public Append(piece: ArrayBuffer): void {
        if (this.disposed) {
            return;
        }
        // More media is coming, so a turn that was about to end continues instead.
        this.endPending = false;
        if (IsMp4InitSegment(piece)) {
            this.lastInit = piece;
        } else if (!this.lastInit) {
            this.report('fragment-before-init', 'A video fragment arrived before its init segment and was dropped.');
            return;
        }
        this.pending.push(piece);
        if (this.pending.length > MAX_PENDING_PIECES) {
            this.pending.splice(0, this.pending.length - MAX_PENDING_PIECES);
            this.report('pending-overflow', 'Video arrived with no element attached; the oldest pieces were dropped.');
        }
        this.pump();
    }

    /**
     * The turn's last piece has arrived. Ends the stream once it is all in, so playback runs to the true end of
     * the turn; the next {@link Append} reopens it and playback continues from there.
     */
    public EndOfTurn(): void {
        this.endPending = true;
        this.endStreamWhenDrained();
    }

    /**
     * Barge-in: drops everything not yet played and pauses, so the voice stops now instead of after the audio the
     * browser has already decoded. The last frame stays on screen; the next turn's media resumes playback.
     */
    public Flush(): void {
        this.pending.length = 0;
        this.endPending = false;
        const buffer = this.sourceBuffer;
        const element = this.element;
        if (!buffer || !element) {
            return;
        }
        element.pause();
        if (buffer.updating) {
            buffer.abort();
        }
        const buffered = buffer.buffered;
        if (buffered.length > 0 && buffered.end(buffered.length - 1) > element.currentTime) {
            buffer.remove(element.currentTime, Infinity);
        }
        this.restartAtPlayhead = true;
    }

    /** Reports problems, once per kind. Returns a function that removes the handler. */
    public OnProblem(handler: (problem: VideoPlayoutProblem, message: string) => void): () => void {
        this.problemHandlers.add(handler);
        return () => this.problemHandlers.delete(handler);
    }

    /** Stops playout and releases the element and the media source. */
    public Dispose(): void {
        this.disposed = true;
        this.pending.length = 0;
        this.detach();
        this.problemHandlers.clear();
    }

    private attach(element: HTMLVideoElement): () => void {
        this.detach();
        const mse = mediaSourceClass();
        if (!mse || !mse.Class.isTypeSupported(this.mimeType)) {
            this.report('unsupported', `This browser cannot play ${this.mimeType} through Media Source Extensions.`);
            return () => undefined;
        }
        const mediaSource = new mse.Class();
        this.mediaSource = mediaSource;
        this.element = element;
        if (mse.Managed) {
            // ManagedMediaSource plays only when remote playback (AirPlay) is off or has an alternative source.
            element.disableRemotePlayback = true;
        }
        mediaSource.addEventListener('sourceopen', () => this.openSourceBuffer(mediaSource), { once: true });
        this.objectUrl = URL.createObjectURL(mediaSource);
        element.src = this.objectUrl;
        void element.play().catch(() => {
            // Playback starts when the first media arrives, or on the next user gesture if the browser waits.
        });
        return () => {
            if (this.element === element) {
                this.detach();
            }
        };
    }

    private openSourceBuffer(mediaSource: MediaSource): void {
        if (this.mediaSource !== mediaSource) {
            return;
        }
        const buffer = mediaSource.addSourceBuffer(this.mimeType);
        // Sequence mode lays pieces end to end, so a turn that restarts its timestamps still plays on.
        buffer.mode = 'sequence';
        buffer.addEventListener('updateend', () => this.afterUpdate());
        buffer.addEventListener('error', () => this.report('append-failed', 'The browser could not decode a video piece.'));
        this.sourceBuffer = buffer;
        // A new source buffer knows no tracks yet: lead with the latest init segment unless one is already next.
        if (this.lastInit && !(this.pending.length > 0 && IsMp4InitSegment(this.pending[0]))) {
            this.pending.unshift(this.lastInit);
        }
        this.pump();
    }

    /** Appends the next pending piece when the buffer is free. */
    private pump(): void {
        const buffer = this.sourceBuffer;
        if (!buffer || buffer.updating || this.pending.length === 0) {
            return;
        }
        if (this.restartAtPlayhead && this.element) {
            buffer.timestampOffset = this.element.currentTime;
            this.restartAtPlayhead = false;
        }
        const piece = this.pending[0];
        try {
            buffer.appendBuffer(piece);
            this.pending.shift();
            this.retriedAfterQuota = false;
        } catch (err) {
            this.handleAppendError(err);
        }
    }

    /** After each append or removal: trims played media, appends the next piece, and ends a finished turn. */
    private afterUpdate(): void {
        this.resumeWhenMediaArrives();
        if (this.trimBackBuffer()) {
            return;
        }
        this.pump();
        this.endStreamWhenDrained();
    }

    /** Ends the stream for a finished turn once nothing is pending or in flight. */
    private endStreamWhenDrained(): void {
        const mediaSource = this.mediaSource;
        if (!this.endPending || !mediaSource || mediaSource.readyState !== 'open' || this.sourceBuffer?.updating || this.pending.length > 0) {
            return;
        }
        this.endPending = false;
        try {
            mediaSource.endOfStream();
        } catch (err) {
            this.report('append-failed', `Could not end the turn's stream: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    /**
     * A turn that ran to its end, or a Flush, leaves the element paused. Once new media reaches past the playhead,
     * play on from there. An ended element is first sought to where it stopped: play() on an ended element starts
     * over from the beginning (Chrome does), which would replay the previous turn.
     */
    private resumeWhenMediaArrives(): void {
        const element = this.element;
        const buffered = this.sourceBuffer?.buffered;
        // After a Flush, wait for media appended after it: the abort's own `updateend` arrives before the removal
        // has shrunk the buffer, and resuming then would play the voice the Flush just cut off.
        if (!element || !element.paused || this.restartAtPlayhead || !buffered || buffered.length === 0) {
            return;
        }
        const position = element.currentTime;
        if (buffered.end(buffered.length - 1) - position > PLAYING_EPSILON_SECONDS) {
            if (element.ended) {
                element.currentTime = position;
            }
            void element.play().catch(() => undefined);
        }
    }

    /**
     * Removes played media more than {@link backBufferSeconds} behind the playhead, so a long session stays within
     * the browser's buffer quota. A trim waits until {@link TRIM_STEP_SECONDS} more have played since the last one,
     * so a removal that doesn't shrink the buffer can't repeat on every `updateend`. When `bufferFull`, keeps only
     * {@link QUOTA_BACK_BUFFER_SECONDS} and skips the wait.
     *
     * @returns Whether a removal started (the next append waits for its `updateend`).
     */
    private trimBackBuffer(bufferFull = false): boolean {
        const buffer = this.sourceBuffer;
        const element = this.element;
        if (!buffer || !element || buffer.updating || buffer.buffered.length === 0) {
            return false;
        }
        const keepFrom = element.currentTime - (bufferFull ? QUOTA_BACK_BUFFER_SECONDS : this.backBufferSeconds);
        const removableFrom = Math.max(buffer.buffered.start(0), bufferFull ? 0 : this.trimmedTo);
        if (keepFrom <= 0 || keepFrom - removableFrom < (bufferFull ? 0.001 : TRIM_STEP_SECONDS)) {
            return false;
        }
        buffer.remove(0, keepFrom);
        this.trimmedTo = keepFrom;
        return true;
    }

    /** Out of buffer space: trim harder and retry once. Anything else drops the piece. */
    private handleAppendError(err: unknown): void {
        const quota = err instanceof Error && err.name === 'QuotaExceededError';
        if (quota && !this.retriedAfterQuota && this.trimBackBuffer(true)) {
            this.retriedAfterQuota = true;
            return;
        }
        this.pending.shift();
        this.retriedAfterQuota = false;
        this.report('append-failed', err instanceof Error ? err.message : String(err));
        this.pump();
    }

    private detach(): void {
        if (this.element) {
            this.element.removeAttribute('src');
            this.element.load();
        }
        if (this.objectUrl) {
            URL.revokeObjectURL(this.objectUrl);
        }
        this.element = null;
        this.mediaSource = null;
        this.sourceBuffer = null;
        this.objectUrl = null;
        this.restartAtPlayhead = false;
        this.trimmedTo = 0;
        this.endPending = false;
    }

    private report(problem: VideoPlayoutProblem, message: string): void {
        if (this.reported.has(problem)) {
            return;
        }
        this.reported.add(problem);
        console.warn(`[VideoPlayout] ${message}`);
        for (const handler of [...this.problemHandlers]) {
            handler(problem, message);
        }
    }
}
