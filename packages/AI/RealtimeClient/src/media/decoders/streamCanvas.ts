/**
 * @fileoverview STREAM CANVAS: turns decoded pictures (WebCodecs `VideoFrame`s, `ImageBitmap`s) into a live
 * `MediaStream` that the host's `<video>` element shows, so a decoder that isn't MSE still plays into the element: the
 * tile, its stall watch (`requestVideoFrameCallback` fires once per picture) and its placements work as for any video.
 *
 * - **Chromium:** a `MediaStreamTrackGenerator` takes each picture as a `VideoFrame`, with no copy.
 * - **Elsewhere:** a canvas captured at 0 fps (`captureStream(0)`) is drawn on, and a frame is requested after each draw.
 * - **The last picture holds.** Between pictures the element keeps showing the last one, and an element attached later
 *   is shown it: the generator is written a copy again, or the canvas is captured again. A picture that reaches an element
 *   before its media pipeline is connected is lost (in Chromium that takes a task or two), so the copy is offered every
 *   {@link REPLAY_INTERVAL_MS} until the element has a frame, at most {@link MAX_REPLAYS} times.
 * - **Time moves forward.** Each picture written to the generator is stamped with the wall clock, after the one before, so a
 *   stream that restarts its media time doesn't feed the track frames that go back in time.
 *
 * @module @memberjunction/ai-realtime-client/media
 */

/** A decoded picture. The stream canvas takes it over and closes it. */
export type StreamPicture = VideoFrame | ImageBitmap;

/** How often the last picture is offered again to an element just attached, until it has a frame, in milliseconds. */
export const REPLAY_INTERVAL_MS = 50;

/** How many times the last picture is offered to an element just attached. */
export const MAX_REPLAYS = 20;

/** `HTMLMediaElement.HAVE_CURRENT_DATA`: the element has a frame to show. */
const HAVE_CURRENT_DATA = 2;

/** Chromium's `MediaStreamTrackGenerator`, which TypeScript's DOM types leave out: a video track fed by writing frames. */
interface TrackGenerator extends MediaStreamTrack {
    readonly writable: WritableStream<VideoFrame>;
}
type TrackGeneratorClass = new (init: { kind: 'video' }) => TrackGenerator;
type GeneratorScope = typeof globalThis & { MediaStreamTrackGenerator?: TrackGeneratorClass };

/** Where pictures go: the generator, or the captured canvas. */
interface PictureSink {
    readonly Stream: MediaStream;
    /** Whether a picture was shown: there is one to show again. */
    readonly HasPicture: boolean;
    /** Shows a picture and closes it. */
    Show(picture: StreamPicture): void;
    /** Emits the last picture again, for an element that was just attached. */
    Replay(): void;
    Dispose(): void;
}

/** The generator class, when this browser exposes one on the page. */
function generatorClass(): TrackGeneratorClass | null {
    return (globalThis as GeneratorScope).MediaStreamTrackGenerator ?? null;
}

/** Whether a canvas can be captured as a stream here. */
function canvasCaptureAvailable(): boolean {
    return typeof HTMLCanvasElement === 'function' && typeof HTMLCanvasElement.prototype.captureStream === 'function';
}

/** A picture's size in pixels. */
function sizeOf(picture: StreamPicture): { Width: number; Height: number } {
    return 'displayWidth' in picture ? { Width: picture.displayWidth, Height: picture.displayHeight } : { Width: picture.width, Height: picture.height };
}

/** Writes each picture to a `MediaStreamTrackGenerator` as a `VideoFrame`, keeping a copy of the last one. */
class GeneratorSink implements PictureSink {
    public readonly Stream: MediaStream;
    private readonly writer: WritableStreamDefaultWriter<VideoFrame>;
    private last: VideoFrame | null = null;
    /** The timestamp of the last frame written, in microseconds. */
    private timestampUs = 0;

    constructor(private readonly track: TrackGenerator) {
        this.writer = track.writable.getWriter();
        this.Stream = new MediaStream([track]);
    }

    public get HasPicture(): boolean {
        return this.last !== null;
    }

    public Show(picture: StreamPicture): void {
        const frame = this.stamped(picture);
        picture.close();
        this.last?.close();
        this.last = frame.clone();
        this.write(frame);
    }

    public Replay(): void {
        if (this.last) {
            this.write(this.stamped(this.last));
        }
    }

    public Dispose(): void {
        this.last?.close();
        this.last = null;
        this.writer.releaseLock();
        this.track.stop();
    }

    /** A frame of the picture, stamped with the wall clock and after the last frame written. */
    private stamped(picture: StreamPicture): VideoFrame {
        this.timestampUs = Math.max(this.timestampUs + 1, Math.round(performance.now() * 1000));
        return new VideoFrame(picture, { timestamp: this.timestampUs });
    }

    private write(frame: VideoFrame): void {
        this.writer.write(frame).catch(() => frame.close());
    }
}

/** Draws each picture on a canvas captured at 0 fps, requesting a frame after each draw. */
class CanvasSink implements PictureSink {
    public readonly Stream: MediaStream;
    public HasPicture = false;
    private readonly canvas: HTMLCanvasElement;
    private readonly track: CanvasCaptureMediaStreamTrack | undefined;

    constructor() {
        this.canvas = document.createElement('canvas');
        this.Stream = this.canvas.captureStream(0);
        this.track = this.Stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack | undefined;
    }

    public Show(picture: StreamPicture): void {
        const { Width, Height } = sizeOf(picture);
        if (this.canvas.width !== Width || this.canvas.height !== Height) {
            this.canvas.width = Width;
            this.canvas.height = Height;
        }
        this.canvas.getContext('2d')?.drawImage(picture, 0, 0, Width, Height);
        picture.close();
        this.HasPicture = true;
        this.Replay();
    }

    public Replay(): void {
        this.track?.requestFrame?.();
    }

    public Dispose(): void {
        this.track?.stop();
    }
}

/** Shows decoded pictures in `<video>` elements through one live stream. */
export class StreamCanvas {
    private readonly sink: PictureSink;
    private element: HTMLVideoElement | null = null;
    private replayTimer: ReturnType<typeof setTimeout> | null = null;

    /** Whether this browser can turn pictures into a stream: a track generator, or a canvas it can capture. */
    public static IsAvailable(): boolean {
        return generatorClass() !== null || canvasCaptureAvailable();
    }

    constructor() {
        const Generator = generatorClass();
        this.sink = Generator ? new GeneratorSink(new Generator({ kind: 'video' })) : new CanvasSink();
    }

    /** Shows a picture in the attached element (and any attached later), and closes it. */
    public Show(picture: StreamPicture): void {
        this.sink.Show(picture);
    }

    /** Shows the stream in an element, with the last picture. The element plays muted: the stream has no audio. */
    public Attach(element: HTMLVideoElement): void {
        this.Detach();
        this.element = element;
        element.muted = true;
        element.playsInline = true;
        element.srcObject = this.sink.Stream;
        void element.play().catch(() => {
            // A hidden or not-yet-allowed element starts later; the stream keeps its last picture until then.
        });
        this.replayUntilShown(element, 0);
    }

    /** Takes the stream out of the element it was attached to, unless another source replaced it there. */
    public Detach(): void {
        this.cancelReplay();
        const element = this.element;
        this.element = null;
        if (element && element.srcObject === this.sink.Stream) {
            element.pause();
            element.srcObject = null;
        }
    }

    /** Detaches, stops the stream's track and closes the last picture. */
    public Dispose(): void {
        this.Detach();
        this.sink.Dispose();
    }

    /**
     * Offers the last picture to a just-attached element until it has a frame, every {@link REPLAY_INTERVAL_MS}. Letting
     * the element go cancels the offers.
     */
    private replayUntilShown(element: HTMLVideoElement, attempt: number): void {
        this.replayTimer = null;
        if (!this.sink.HasPicture || element.readyState >= HAVE_CURRENT_DATA || attempt >= MAX_REPLAYS) {
            return;
        }
        this.sink.Replay();
        this.replayTimer = setTimeout(() => this.replayUntilShown(element, attempt + 1), REPLAY_INTERVAL_MS);
    }

    private cancelReplay(): void {
        if (this.replayTimer !== null) {
            clearTimeout(this.replayTimer);
            this.replayTimer = null;
        }
    }
}
