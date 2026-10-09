/**
 * @fileoverview WEBCODECS CHUNK DECODER: plays encoded video chunks (`Kind: 'chunk'`: H.264 in Annex B form, VP8, VP9,
 * AV1) through a WebCodecs `VideoDecoder`, into the host's `<video>` element through a {@link StreamCanvas}. The
 * `'webcodecs'` decoder of `VideoPlayout`.
 *
 * - **Configured at a key frame.** The decoder is configured from the chunk's MIME type (its `codecs` parameter is the
 *   WebCodecs codec string; H.264 in Annex B needs no `description`) at the first key frame, after the browser confirms
 *   it decodes the codec (`VideoDecoder.isConfigSupported`, asynchronous). A "no" reports `'unsupported'` and gives up,
 *   so the player tries the next decoder. Until a key frame, delta chunks are dropped.
 * - **Paced by presentation time.** Decoded frames show on the {@link FrameScheduler} by their `PresentationTimeMs`: on
 *   the voice's clock when the player has one (`VideoPlayoutOptions.Clock`), else by their own times.
 *   Chunks wait, encoded, while {@link MAX_FRAMES_AHEAD} frames are decoding or waiting to show: a browser decoder stalls
 *   when its output frames aren't closed.
 * - **End of turn** flushes the decoder once the waiting chunks are decoded, so the turn's last frames show; a chunk
 *   that arrives first continues the turn instead. After the flush the next chunk must be a key frame (WebCodecs requires
 *   one). **Barge-in** resets the decoder, drops what is waiting and what hasn't shown, and waits for the next key frame;
 *   the last frame shown stays.
 * - **Errors.** A decode error is reported (`'append-failed'`); the browser has closed that decoder, so a new one starts
 *   at the next key frame. {@link MAX_DECODE_ERRORS} errors within {@link DECODE_ERROR_WINDOW_MS} give up.
 *
 * @module @memberjunction/ai-realtime-client/media
 */
import type { RealtimeChunkVideoFrame, RealtimeVideoFrame } from '@memberjunction/ai';
import type { IVideoFrameDecoder, VideoFrameDecoderContext, VideoFrameDecoderRegistration } from '../videoFrameDecoder';
import { FrameScheduler } from './frameScheduler';
import { StreamCanvas } from './streamCanvas';
import { WebCodecsCodecOf } from './videoMimeTypes';

/** Frames decoding or waiting to show, at most; further chunks wait encoded. */
export const MAX_FRAMES_AHEAD = 6;

/** Encoded chunks waiting to be decoded, at most; beyond this they are dropped and decoding restarts at a key frame. */
export const MAX_WAITING_CHUNKS = 600;

/** Decode errors within {@link DECODE_ERROR_WINDOW_MS} that make the decoder give up. */
export const MAX_DECODE_ERRORS = 3;

/** The window decode errors are counted in, in milliseconds. */
export const DECODE_ERROR_WINDOW_MS = 60_000;

/** Plays encoded chunks through a WebCodecs `VideoDecoder`. */
export class WebCodecsChunkDecoder implements IVideoFrameDecoder {
    private readonly canvas = new StreamCanvas();
    private readonly scheduler: FrameScheduler;
    /** Chunks from a key frame on, waiting to be decoded. */
    private readonly waiting: RealtimeChunkVideoFrame[] = [];
    /** Codecs this browser said it decodes. */
    private readonly supported = new Set<string>();
    /** When the recent decode errors happened, for the give-up rule. */
    private readonly errors: number[] = [];
    private decoder: VideoDecoder | null = null;
    /** The codec the decoder is configured for; `null` until a key frame configures it, and after a reset. */
    private configured: string | null = null;
    /** The codec whose support check is under way. */
    private checking: string | null = null;
    /** Delta chunks are dropped until a key frame. */
    private awaitingKeyFrame = true;
    /** Set by EndOfTurn: flush the decoder once nothing waits. */
    private endPending = false;
    /** Whether a key frame ever arrived: a stream that starts on a delta chunk is reported once. */
    private started = false;
    private disposed = false;

    /** Whether this browser can decode chunks of `mimeType` with WebCodecs and show them, as far as it can tell at once. */
    public static CanPlay(mimeType: string): boolean {
        const canDecode = typeof VideoDecoder === 'function' && typeof EncodedVideoChunk === 'function';
        return canDecode && StreamCanvas.IsAvailable() && WebCodecsCodecOf(mimeType) !== null;
    }

    /** @param context The player this decoder plays for. */
    constructor(private readonly context: VideoFrameDecoderContext) {
        this.scheduler = new FrameScheduler(this.canvas, () => this.feed(), { Clock: context.Clock });
    }

    /** Always `false`: a chunk carries no voice. */
    public get IsPlaying(): boolean {
        return false;
    }

    public Attach(element: HTMLVideoElement): void {
        if (!this.disposed) {
            this.canvas.Attach(element);
        }
    }

    public Detach(): void {
        this.canvas.Detach();
    }

    /** Takes one chunk: from a key frame on, it waits its turn to be decoded. */
    public Append(frame: RealtimeVideoFrame): void {
        if (this.disposed || frame.Kind !== 'chunk') {
            return;
        }
        // More media is coming, so a turn that was about to end continues instead.
        this.endPending = false;
        if (frame.KeyFrame) {
            if (!this.startAt(frame) || this.disposed) {
                return;
            }
        } else if (this.awaitingKeyFrame) {
            this.dropBeforeKeyFrame();
            return;
        }
        this.enqueue(frame);
        this.feed();
    }

    /** The turn's last chunk has arrived: the decoder is flushed once the waiting chunks are decoded, so its last frames show. */
    public EndOfTurn(): void {
        this.endPending = true;
        this.flushWhenDrained();
    }

    /** Barge-in: resets the decoder and drops what is waiting and what hasn't shown. The last frame shown stays. */
    public Flush(): void {
        this.waiting.length = 0;
        this.endPending = false;
        this.awaitingKeyFrame = true;
        this.scheduler.Clear();
        if (this.decoder && this.decoder.state !== 'closed') {
            this.decoder.reset();
        }
        this.configured = null;
    }

    public Dispose(): void {
        this.disposed = true;
        this.waiting.length = 0;
        this.scheduler.Dispose();
        this.closeDecoder();
        this.canvas.Dispose();
    }

    /**
     * A key frame: decoding starts here, configured for its codec (after the browser confirms it, the first time).
     * Returns `false` when the chunk names no codec WebCodecs knows: it is dropped.
     */
    private startAt(frame: RealtimeChunkVideoFrame): boolean {
        const codec = WebCodecsCodecOf(frame.MimeType);
        if (codec === null) {
            this.context.Report('unsupported', `A video chunk of type ${frame.MimeType} names no codec WebCodecs knows; it was dropped.`);
            return false;
        }
        this.awaitingKeyFrame = false;
        this.started = true;
        if (codec === this.configured || codec === this.checking) {
            return true;
        }
        // A new codec: chunks of the old one still waiting can't be decoded with it, nothing decodes until it is configured,
        // and a check under way for another codec no longer applies.
        this.waiting.length = 0;
        this.configured = null;
        this.checking = null;
        if (this.supported.has(codec)) {
            this.configure(codec);
        } else {
            this.checkSupport(codec);
        }
        return true;
    }

    private dropBeforeKeyFrame(): void {
        if (!this.started) {
            this.context.Report('fragment-before-init', 'An encoded video chunk arrived before any key frame and was dropped.');
        }
    }

    private enqueue(frame: RealtimeChunkVideoFrame): void {
        this.waiting.push(frame);
        if (this.waiting.length > MAX_WAITING_CHUNKS) {
            this.waiting.length = 0;
            this.awaitingKeyFrame = true;
            const message = 'Encoded video chunks piled up faster than they could be decoded; they were dropped until the next key frame.';
            this.context.Report('pending-overflow', message);
        }
    }

    /** Asks the browser whether it decodes `codec`; a "yes" configures the decoder, a "no" gives up. */
    private checkSupport(codec: string): void {
        this.checking = codec;
        const canCheck = typeof VideoDecoder.isConfigSupported === 'function';
        const check = canCheck ? VideoDecoder.isConfigSupported({ codec }) : Promise.resolve({ supported: true });
        check.then(
            (result) => this.supportChecked(codec, result.supported === true),
            () => this.supportChecked(codec, false)
        );
    }

    private supportChecked(codec: string, supported: boolean): void {
        if (this.disposed || this.checking !== codec) {
            return;
        }
        this.checking = null;
        if (!supported) {
            this.context.Report('unsupported', `This browser cannot decode ${codec} video with WebCodecs.`);
            this.context.Failed(`the browser does not decode ${codec}`);
            return;
        }
        this.supported.add(codec);
        this.configure(codec);
        this.feed();
    }

    /** Configures the decoder for `codec`, creating one when none is open. */
    private configure(codec: string): void {
        try {
            const decoder = this.decoder && this.decoder.state !== 'closed' ? this.decoder : this.createDecoder();
            decoder.configure({ codec, optimizeForLatency: true });
            this.configured = codec;
        } catch (error) {
            this.context.Report('unsupported', `This browser cannot decode ${codec} video with WebCodecs: ${messageOf(error)}`);
            this.context.Failed(`the decoder could not be configured for ${codec}`);
        }
    }

    private createDecoder(): VideoDecoder {
        const decoder = new VideoDecoder({
            output: (frame) => this.decoded(decoder, frame),
            error: (error) => this.decodeFailed(decoder, error.message),
        });
        this.decoder = decoder;
        return decoder;
    }

    /** Decodes waiting chunks while fewer than {@link MAX_FRAMES_AHEAD} frames are ahead, then flushes a finished turn. */
    private feed(): void {
        const decoder = this.decoder;
        while (decoder && this.decoder === decoder && this.configured !== null && this.waiting.length > 0) {
            if (decoder.decodeQueueSize + this.scheduler.Size >= MAX_FRAMES_AHEAD) {
                return;
            }
            this.decode(decoder, this.waiting.shift() as RealtimeChunkVideoFrame);
        }
        this.flushWhenDrained();
    }

    /** Flushes the decoder for a finished turn once nothing waits. WebCodecs then needs a key frame to go on. */
    private flushWhenDrained(): void {
        const decoder = this.decoder;
        if (!this.endPending || this.waiting.length > 0 || !decoder || this.configured === null) {
            return;
        }
        this.endPending = false;
        this.awaitingKeyFrame = true;
        decoder.flush().catch(() => {
            // A reset or an error since: what the flush waited for was dropped.
        });
    }

    private decode(decoder: VideoDecoder, frame: RealtimeChunkVideoFrame): void {
        try {
            const timestamp = Math.round(frame.PresentationTimeMs * 1000);
            decoder.decode(new EncodedVideoChunk({ type: frame.KeyFrame ? 'key' : 'delta', timestamp, data: frame.Data }));
        } catch (error) {
            this.decodeFailed(decoder, messageOf(error));
        }
    }

    /** A decoded frame: it waits on the scheduler for its time. A frame from a decoder since replaced is closed. */
    private decoded(decoder: VideoDecoder, frame: VideoFrame): void {
        if (this.disposed || this.decoder !== decoder) {
            frame.close();
            return;
        }
        this.scheduler.Push(frame, frame.timestamp / 1000);
        this.feed();
    }

    /** A decode error: the browser closed the decoder. A new one starts at the next key frame, unless errors keep coming. */
    private decodeFailed(decoder: VideoDecoder, message: string): void {
        if (this.disposed || this.decoder !== decoder) {
            return;
        }
        this.context.Report('append-failed', `The browser could not decode a video chunk: ${message}`);
        this.closeDecoder();
        this.waiting.length = 0;
        this.awaitingKeyFrame = true;
        const now = Date.now();
        this.errors.push(now);
        while (this.errors.length > 0 && now - this.errors[0] > DECODE_ERROR_WINDOW_MS) {
            this.errors.shift();
        }
        if (this.errors.length >= MAX_DECODE_ERRORS) {
            this.context.Failed(`${this.errors.length} decode errors within ${DECODE_ERROR_WINDOW_MS / 1000} s; the last: ${message}`);
        }
    }

    private closeDecoder(): void {
        const decoder = this.decoder;
        this.decoder = null;
        this.configured = null;
        if (decoder && decoder.state !== 'closed') {
            decoder.close();
        }
    }
}

/** An error's message, whatever was thrown. */
function messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/** The `'webcodecs'` decoder: encoded chunks whose codec this browser's WebCodecs decodes. */
export const WEBCODECS_CHUNK_DECODER: VideoFrameDecoderRegistration = {
    Name: 'webcodecs',
    Kind: 'chunk',
    Priority: 0,
    CanPlay: (mimeType) => WebCodecsChunkDecoder.CanPlay(mimeType),
    Create: (context) => new WebCodecsChunkDecoder(context),
};
