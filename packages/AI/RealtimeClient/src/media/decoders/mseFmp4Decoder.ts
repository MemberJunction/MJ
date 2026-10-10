/**
 * @fileoverview MSE FMP4 DECODER: plays fragmented MP4 frames (`Kind: 'fmp4'`), such as a Gemini Live avatar, through
 * Media Source Extensions into the host's `<video>` element. The `'mse-fmp4'` decoder of `VideoPlayout`.
 *
 * - **Format.** The first piece of a turn is an init segment (`Piece: 'init'`, `ftyp` + `moov`); each later piece is a
 *   media fragment (`moof` + `mdat`). A turn may send a fresh init segment and restart its timestamps; the source buffer
 *   runs in `sequence` mode, so playback stays continuous either way.
 * - **Codecs come from the init segment.** The source buffer takes the codecs the init segment's tracks name
 *   (`avc1.42c01f` alone for video-only MP4), read by `ReadFmp4Init` from `@memberjunction/ai`; until an init arrives, or
 *   when it names a codec the reader doesn't know, it takes the player's configured type.
 * - **The video carries the voice.** An avatar's audio is muxed into the MP4, so the element is unmuted and lips and voice
 *   stay in sync on the media's own timestamps. While media is buffered ahead of the playhead, {@link MseFmp4Decoder.IsPlaying}
 *   is true: the agent is audibly speaking. When the voice plays elsewhere (separate PCM), the element is muted. The
 *   element-attached hook lets the realtime client route the element's audio into its own Web Audio graph.
 * - **End of turn** ends the stream once the turn's pieces are in, so playback runs to the true end and holds the last
 *   frame. **Barge-in** drops everything not yet played and pauses. **Gaps** (between turns, or while a connection
 *   resumes) hold the last frame.
 * - **Browsers.** `MediaSource` (Chrome, Edge, Firefox, desktop Safari), or `ManagedMediaSource` (iOS Safari 17.1+).
 *
 * @module @memberjunction/ai-realtime-client/media
 */
import { ReadFmp4Init, type RealtimeFmp4VideoFrame, type RealtimeVideoFrame } from '@memberjunction/ai';
import type { IVideoFrameDecoder, VideoFrameDecoderContext, VideoFrameDecoderRegistration } from '../videoFrameDecoder';

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

/**
 * The MSE type an init segment's video and audio tracks need, from their codecs: `video/mp4; codecs="avc1.42c01f,
 * mp4a.40.2"` for a muxed avatar, `video/mp4; codecs="avc1.42c01f"` for video alone. `null` when the init can't be read,
 * declares neither, or names a codec the reader doesn't know.
 */
function mseTypeOf(init: ArrayBuffer): string | null {
    const tracks = ReadFmp4Init(init)?.Tracks.filter((track) => track.Handler === 'vide' || track.Handler === 'soun') ?? [];
    if (tracks.length === 0 || tracks.some((track) => !track.Codec)) {
        return null;
    }
    return `video/mp4; codecs="${tracks.map((track) => track.Codec).join(', ')}"`;
}

/** Plays fragmented MP4 frames through MSE into one `<video>` element at a time. */
export class MseFmp4Decoder implements IVideoFrameDecoder {
    private readonly mimeType: string;
    private readonly backBufferSeconds: number;
    private readonly pending: RealtimeFmp4VideoFrame[] = [];
    private element: HTMLVideoElement | null = null;
    private mediaSource: MediaSource | null = null;
    private objectUrl: string | null = null;
    private sourceBuffer: SourceBuffer | null = null;
    /** The type the source buffer was opened with, or last changed to. */
    private bufferType: string | null = null;
    /** The latest init segment, replayed into a new source buffer when the decoder moves to another element. */
    private lastInit: RealtimeFmp4VideoFrame | null = null;
    /** Set by Flush: the next append starts at the playhead instead of after what was dropped. */
    private restartAtPlayhead = false;
    private retriedAfterQuota = false;
    /** Where the last back-buffer trim ended, in media time. */
    private trimmedTo = 0;
    /** Set by EndOfTurn: end the stream once every pending piece is in. */
    private endPending = false;
    /** Where each appended piece ends on the element's timeline (seconds), oldest first, until the playhead passes it. */
    private readonly appendedEnds: number[] = [];
    /** Whether the source buffer is appending a piece: its `updateend` records where the piece ends. */
    private appending = false;
    private disposed = false;

    /** Whether this browser can play `mimeType` through MSE. */
    public static CanPlay(mimeType: string): boolean {
        return mediaSourceClass()?.Class.isTypeSupported(mimeType) ?? false;
    }

    /** @param context The player this decoder plays for. */
    constructor(private readonly context: VideoFrameDecoderContext) {
        this.mimeType = context.MimeType;
        this.backBufferSeconds = context.BackBufferSeconds;
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

    /**
     * How many pieces are still to play: pending (waiting for the source buffer, or for an element), being appended, or
     * appended and ending past the playhead. The source buffer lays pieces end to end (`sequence` mode), so a piece ends
     * where the buffered media ended once it was in. A piece a {@link Flush} removed, or the browser rejected, is not
     * counted; nor is media of an element the decoder let go.
     */
    public get FramesAhead(): number {
        this.forgetPlayedPieces();
        return this.pending.length + (this.appending ? 1 : 0) + this.appendedEnds.length;
    }

    /** Hands over one frame, in the order they arrived: an init segment or a media fragment. */
    public Append(frame: RealtimeVideoFrame): void {
        if (this.disposed || frame.Kind !== 'fmp4') {
            return;
        }
        // More media is coming, so a turn that was about to end continues instead.
        this.endPending = false;
        if (frame.Piece === 'init') {
            this.lastInit = frame;
        } else if (!this.lastInit) {
            this.context.Report('fragment-before-init', 'A video fragment arrived before its init segment and was dropped.');
            return;
        }
        this.pending.push(frame);
        if (this.pending.length > MAX_PENDING_PIECES) {
            this.pending.splice(0, this.pending.length - MAX_PENDING_PIECES);
            this.context.Report('pending-overflow', 'Video arrived with no element attached; the oldest pieces were dropped.');
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
        // What is buffered ahead of the playhead is removed, and an append under way is aborted: none of it plays.
        this.appendedEnds.length = 0;
        this.appending = false;
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

    /** Stops playout and releases the element and the media source. */
    public Dispose(): void {
        this.disposed = true;
        this.pending.length = 0;
        this.detach();
    }

    /** Takes the element over: a new media source, the latest init segment replayed into it, then what is pending. */
    public Attach(element: HTMLVideoElement): void {
        if (this.disposed) {
            return;
        }
        this.detach();
        const mse = mediaSourceClass();
        if (!mse || !mse.Class.isTypeSupported(this.mimeType)) {
            this.context.Report('unsupported', `This browser cannot play ${this.mimeType} through Media Source Extensions.`);
            return;
        }
        const mediaSource = new mse.Class();
        this.mediaSource = mediaSource;
        this.element = element;
        this.prepareElement(element, mse.Managed);
        mediaSource.addEventListener('sourceopen', () => this.openSourceBuffer(mediaSource), { once: true });
        this.objectUrl = URL.createObjectURL(mediaSource);
        element.src = this.objectUrl;
        void element.play().catch(() => {
            // Playback starts when the first media arrives, or on the next user gesture if the browser waits.
        });
    }

    /** Lets the element go: its source is removed and the media source released. */
    public Detach(): void {
        this.detach();
    }

    /** Readies an element before it plays: its audio on or off, the attach hook, and what iOS's managed MSE requires. */
    private prepareElement(element: HTMLVideoElement, managed: boolean): void {
        if (managed) {
            // ManagedMediaSource plays only when remote playback (AirPlay) is off or has an alternative source.
            element.disableRemotePlayback = true;
        }
        // Set either way: a host may hand over an element it muted (a media tile never plays audio itself).
        element.muted = !this.context.CarriesVoice;
        try {
            this.context.OnElementAttached?.(element);
        } catch (err) {
            console.warn(`[VideoPlayout] The element-attached hook failed: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    private openSourceBuffer(mediaSource: MediaSource): void {
        if (this.mediaSource !== mediaSource) {
            return;
        }
        const type = this.typeFor(this.lastInit?.Data ?? null);
        const buffer = mediaSource.addSourceBuffer(type);
        this.bufferType = type;
        // Sequence mode lays pieces end to end, so a turn that restarts its timestamps still plays on.
        buffer.mode = 'sequence';
        buffer.addEventListener('updateend', () => this.afterUpdate());
        buffer.addEventListener('error', () => this.context.Report('append-failed', 'The browser could not decode a video piece.'));
        this.sourceBuffer = buffer;
        // A new source buffer knows no tracks yet: lead with the latest init segment unless one is already next.
        if (this.lastInit && !(this.pending.length > 0 && this.pending[0].Piece === 'init')) {
            this.pending.unshift(this.lastInit);
        }
        this.pump();
    }

    /** Appends the next pending frame when the buffer is free. */
    private pump(): void {
        const buffer = this.sourceBuffer;
        if (!buffer || buffer.updating || this.pending.length === 0) {
            return;
        }
        if (this.restartAtPlayhead && this.element) {
            buffer.timestampOffset = this.element.currentTime;
            this.restartAtPlayhead = false;
        }
        const frame = this.pending[0];
        try {
            if (frame.Piece === 'init') {
                this.matchBufferType(buffer, frame.Data);
            }
            buffer.appendBuffer(frame.Data);
            this.pending.shift();
            this.appending = true;
            this.retriedAfterQuota = false;
        } catch (err) {
            this.handleAppendError(err);
        }
    }

    /** The type for a source buffer that takes `init`: the init's own codecs when this browser plays them, else the player's type. */
    private typeFor(init: ArrayBuffer | null): string {
        const fromInit = init ? mseTypeOf(init) : null;
        return fromInit && mediaSourceClass()?.Class.isTypeSupported(fromInit) ? fromInit : this.mimeType;
    }

    /**
     * Switches the source buffer to an init segment's codecs before the init is appended, when they differ from the
     * buffer's: it opened with the player's type before the first init arrived, or a later init changed tracks. A browser
     * without `changeType`, or an init whose codecs can't be read or played, leaves the buffer as it is.
     */
    private matchBufferType(buffer: SourceBuffer, init: ArrayBuffer): void {
        const type = mseTypeOf(init);
        if (!type || type === this.bufferType || typeof buffer.changeType !== 'function' || !mediaSourceClass()?.Class.isTypeSupported(type)) {
            return;
        }
        buffer.changeType(type);
        this.bufferType = type;
    }

    /** After each append or removal: trims played media, appends the next piece, and ends a finished turn. */
    private afterUpdate(): void {
        this.recordAppendedEnd();
        this.resumeWhenMediaArrives();
        if (this.trimBackBuffer()) {
            return;
        }
        this.pump();
        this.endStreamWhenDrained();
    }

    /**
     * An append finished: the piece ends where the buffered media now ends, since the buffer lays pieces end to end.
     * Pieces the playhead has passed are forgotten here too, so the list holds only what is ahead.
     */
    private recordAppendedEnd(): void {
        if (!this.appending) {
            return;
        }
        this.appending = false;
        const buffered = this.sourceBuffer?.buffered;
        this.appendedEnds.push(buffered && buffered.length > 0 ? buffered.end(buffered.length - 1) : 0);
        this.forgetPlayedPieces();
    }

    /** Forgets the appended pieces the playhead has reached the end of (to within {@link PLAYING_EPSILON_SECONDS}). */
    private forgetPlayedPieces(): void {
        const element = this.element;
        if (!element) {
            return;
        }
        while (this.appendedEnds.length > 0 && this.appendedEnds[0] - element.currentTime <= PLAYING_EPSILON_SECONDS) {
            this.appendedEnds.shift();
        }
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
            this.context.Report('append-failed', `Could not end the turn's stream: ${err instanceof Error ? err.message : String(err)}`);
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
     * Removes played media more than the back buffer's seconds behind the playhead, so a long session stays within the
     * browser's buffer quota. A trim waits until {@link TRIM_STEP_SECONDS} more have played since the last one, so a
     * removal that doesn't shrink the buffer can't repeat on every `updateend`. When `bufferFull`, keeps only
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
        this.context.Report('append-failed', err instanceof Error ? err.message : String(err));
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
        this.bufferType = null;
        this.objectUrl = null;
        this.restartAtPlayhead = false;
        this.trimmedTo = 0;
        this.endPending = false;
        // The media source and what it buffered are gone; the pending pieces stay for the next element.
        this.appendedEnds.length = 0;
        this.appending = false;
    }
}

/** The `'mse-fmp4'` decoder: fragmented MP4 frames whose type this browser's Media Source Extensions play. */
export const MSE_FMP4_DECODER: VideoFrameDecoderRegistration = {
    Name: 'mse-fmp4',
    Kind: 'fmp4',
    Priority: 0,
    CanPlay: (mimeType) => MseFmp4Decoder.CanPlay(mimeType),
    Create: (context) => new MseFmp4Decoder(context),
};
