/**
 * @fileoverview IMAGE FRAME DECODER: plays still images (`Kind: 'image'`: JPEG, PNG, WebP) through `createImageBitmap`,
 * into the host's `<video>` element through a {@link StreamCanvas}. The `'image'` decoder of `VideoPlayout`.
 *
 * - **In order.** Images are decoded one at a time, in the order they arrived, while fewer than {@link MAX_IMAGES_AHEAD}
 *   decoded images wait to show; the rest wait encoded.
 * - **Paced by presentation time when an image has one**, on the {@link FrameScheduler}: on the voice's clock when the
 *   player has one (`VideoPlayoutOptions.Clock`), else by its own time. An image without a time shows as soon as it is
 *   decoded.
 * - **End of turn** needs nothing: every image stands alone. **Barge-in** drops the images waiting, decoded or not, and a
 *   decode under way; the last image shown stays.
 * - An image the browser can't decode is dropped and reported (`'append-failed'`); the next one plays.
 *
 * @module @memberjunction/ai-realtime-client/media
 */
import type { RealtimeImageVideoFrame, RealtimeVideoFrame } from '@memberjunction/ai';
import type { IVideoFrameDecoder, VideoFrameDecoderContext, VideoFrameDecoderRegistration } from '../videoFrameDecoder';
import { FrameScheduler } from './frameScheduler';
import { StreamCanvas } from './streamCanvas';
import { IMAGE_FRAME_TYPES, MimeEssence } from './videoMimeTypes';

/** Decoded images waiting to show, at most; further images wait encoded. */
export const MAX_IMAGES_AHEAD = 4;

/** Encoded images waiting to be decoded, at most; beyond this the oldest are dropped. */
export const MAX_WAITING_IMAGES = 120;

/** Plays still images through `createImageBitmap`. */
export class ImageFrameDecoder implements IVideoFrameDecoder {
    private readonly canvas = new StreamCanvas();
    private readonly scheduler: FrameScheduler;
    /** Images waiting to be decoded, in arrival order. */
    private readonly waiting: RealtimeImageVideoFrame[] = [];
    /** Whether a decode is under way: images decode one at a time, so they show in order. */
    private decoding = false;
    /** Bumped by Flush and Dispose: a decode that finishes after it is dropped. */
    private generation = 0;
    private disposed = false;

    /** Whether this browser can decode images of `mimeType` and show them. */
    public static CanPlay(mimeType: string): boolean {
        const canDecode = typeof createImageBitmap === 'function' && typeof Blob === 'function';
        return canDecode && StreamCanvas.IsAvailable() && IMAGE_FRAME_TYPES.has(MimeEssence(mimeType));
    }

    /** @param context The player this decoder plays for. */
    constructor(private readonly context: VideoFrameDecoderContext) {
        this.scheduler = new FrameScheduler(this.canvas, () => this.feed(), { Clock: context.Clock });
    }

    /** Always `false`: an image carries no voice. */
    public get IsPlaying(): boolean {
        return false;
    }

    /** Images still to show: waiting to be decoded, decoding, or decoded and waiting for their time. */
    public get FramesAhead(): number {
        return this.waiting.length + (this.decoding ? 1 : 0) + this.scheduler.Size;
    }

    public Attach(element: HTMLVideoElement): void {
        if (!this.disposed) {
            this.canvas.Attach(element);
        }
    }

    public Detach(): void {
        this.canvas.Detach();
    }

    /** Takes one image: it is decoded in its turn and shown at its time, or at once when it has none. */
    public Append(frame: RealtimeVideoFrame): void {
        if (this.disposed || frame.Kind !== 'image') {
            return;
        }
        this.waiting.push(frame);
        if (this.waiting.length > MAX_WAITING_IMAGES) {
            this.waiting.splice(0, this.waiting.length - MAX_WAITING_IMAGES);
            this.context.Report('pending-overflow', 'Images arrived faster than they could be decoded; the oldest were dropped.');
        }
        this.feed();
    }

    /** Nothing to drain: every image stands alone, and those waiting still show. */
    public EndOfTurn(): void {
        // Images need no flush.
    }

    /** Barge-in: drops the images waiting, decoded or not, and the decode under way. The last image shown stays. */
    public Flush(): void {
        this.generation++;
        this.decoding = false;
        this.waiting.length = 0;
        this.scheduler.Clear();
    }

    public Dispose(): void {
        this.Flush();
        this.disposed = true;
        this.scheduler.Dispose();
        this.canvas.Dispose();
    }

    /** Decodes the next waiting image, when none is decoding and fewer than {@link MAX_IMAGES_AHEAD} wait to show. */
    private feed(): void {
        if (this.disposed || this.decoding || this.waiting.length === 0 || this.scheduler.Size >= MAX_IMAGES_AHEAD) {
            return;
        }
        const frame = this.waiting.shift() as RealtimeImageVideoFrame;
        const generation = this.generation;
        this.decoding = true;
        createImageBitmap(new Blob([frame.Data], { type: frame.MimeType })).then(
            (image) => this.decoded(generation, image, frame.PresentationTimeMs),
            (error: unknown) => this.decodeFailed(generation, frame, error)
        );
    }

    private decoded(generation: number, image: ImageBitmap, timeMs: number | undefined): void {
        if (generation !== this.generation) {
            image.close();
            return;
        }
        this.decoding = false;
        this.scheduler.Push(image, timeMs);
        this.feed();
    }

    private decodeFailed(generation: number, frame: RealtimeImageVideoFrame, error: unknown): void {
        if (generation !== this.generation) {
            return;
        }
        this.decoding = false;
        const reason = error instanceof Error ? error.message : String(error);
        this.context.Report('append-failed', `The browser could not decode an image of type ${frame.MimeType}: ${reason}`);
        this.feed();
    }
}

/** The `'image'` decoder: JPEG, PNG and WebP images, where this browser has `createImageBitmap`. */
export const IMAGE_FRAME_DECODER: VideoFrameDecoderRegistration = {
    Name: 'image',
    Kind: 'image',
    Priority: 0,
    CanPlay: (mimeType) => ImageFrameDecoder.CanPlay(mimeType),
    Create: (context) => new ImageFrameDecoder(context),
};
