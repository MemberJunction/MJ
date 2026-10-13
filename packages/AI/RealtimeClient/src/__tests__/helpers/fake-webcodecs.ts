/**
 * Fake WebCodecs and stream-rendering globals for the video decoder tests: a `VideoDecoder` that records what it is
 * configured with and given, and outputs or fails when a test says so; `EncodedVideoChunk`; `VideoFrame`;
 * `createImageBitmap` with promises a test settles; a `MediaStreamTrackGenerator` whose writer records frames;
 * `MediaStream`; and `HTMLCanvasElement` (the fake DOM's canvas, which can be captured). Remove them with
 * `vi.unstubAllGlobals()`.
 */
import { vi } from 'vitest';
import { FakeCanvasElement } from './fake-dom';

/** Counts pictures not yet closed, so a test can see none leaked. */
export const OpenPictures = { Count: 0 };

/** A decoded picture: a `VideoFrame` stand-in, timed in microseconds. */
export class FakeVideoFrame {
    public readonly timestamp: number;
    public readonly displayWidth: number;
    public readonly displayHeight: number;
    /** What the picture shows, for assertions: a test label, or the label of the image it was made from. */
    public readonly Label: string;
    public Closed = false;

    /** As `new VideoFrame(source, { timestamp })` makes one: from a frame or an image (its size and label), or a test label. */
    constructor(source: FakeVideoFrame | FakeImageBitmap | string, init: { timestamp: number }) {
        this.timestamp = init.timestamp;
        if (typeof source === 'string') {
            [this.displayWidth, this.displayHeight, this.Label] = [640, 360, source];
        } else if (source instanceof FakeVideoFrame) {
            [this.displayWidth, this.displayHeight, this.Label] = [source.displayWidth, source.displayHeight, source.Label];
        } else {
            [this.displayWidth, this.displayHeight, this.Label] = [source.width, source.height, source.Label];
        }
        OpenPictures.Count++;
    }

    public close(): void {
        if (!this.Closed) {
            this.Closed = true;
            OpenPictures.Count--;
        }
    }

    public clone(): FakeVideoFrame {
        return new FakeVideoFrame(this.Label, { timestamp: this.timestamp });
    }
}

/** A decoded image: an `ImageBitmap` stand-in. */
export class FakeImageBitmap {
    public Closed = false;

    constructor(
        public readonly Label: string,
        public readonly width = 320,
        public readonly height = 240
    ) {
        OpenPictures.Count++;
    }

    public close(): void {
        if (!this.Closed) {
            this.Closed = true;
            OpenPictures.Count--;
        }
    }
}

/**
 * A fake picture typed as the DOM picture the stream canvas and the frame scheduler take. They only read its size and
 * call `close` and `clone`, which the fakes have; the rest of `VideoFrame` and `ImageBitmap` is left out.
 */
export function AsPicture(fake: FakeVideoFrame | FakeImageBitmap): VideoFrame | ImageBitmap {
    return fake as unknown as VideoFrame | ImageBitmap;
}

/** An `EncodedVideoChunk`: its type, its time in microseconds, and a copy of its bytes. */
export class FakeEncodedVideoChunk {
    public readonly type: 'key' | 'delta';
    public readonly timestamp: number;
    public readonly Bytes: Uint8Array;

    constructor(init: { type: 'key' | 'delta'; timestamp: number; data: ArrayBuffer | ArrayBufferView }) {
        this.type = init.type;
        this.timestamp = init.timestamp;
        const view = ArrayBuffer.isView(init.data) ? new Uint8Array(init.data.buffer, init.data.byteOffset, init.data.byteLength) : new Uint8Array(init.data);
        this.Bytes = view.slice();
    }
}

/** A support check the test answers, or the fake answers itself from {@link FakeVideoDecoder.Supported}. */
interface PendingCheck {
    Codec: string;
    Answer(supported: boolean): void;
    Reject(error: Error): void;
}

/**
 * A `VideoDecoder` stand-in: it decodes nothing, and outputs or fails when a test says so. Each chunk decoded counts in
 * `decodeQueueSize` until the test outputs a frame.
 */
export class FakeVideoDecoder {
    /** Every decoder created, in order. */
    public static readonly Instances: FakeVideoDecoder[] = [];
    /** The codecs `isConfigSupported` says yes to. */
    public static readonly Supported = new Set<string>();
    /** Support checks made, in order. */
    public static readonly Checks: PendingCheck[] = [];
    /** When false, a check waits for the test to answer it through {@link Checks}. */
    public static AnswerChecks = true;
    /** When true, `configure` throws, as it does for a config the browser rejects outright. */
    public static RefuseConfigure = false;

    public state: 'unconfigured' | 'configured' | 'closed' = 'unconfigured';
    public decodeQueueSize = 0;
    public readonly Configs: Array<{ codec: string; optimizeForLatency?: boolean; description?: unknown }> = [];
    public readonly Chunks: FakeEncodedVideoChunk[] = [];
    public Resets = 0;
    public Flushes = 0;
    public Closes = 0;
    /** Whether the next chunk must be a key frame, as WebCodecs requires after configure, reset and flush. */
    private keyRequired = true;

    public static isConfigSupported(config: { codec: string }): Promise<{ supported: boolean }> {
        return new Promise((resolve, reject) => {
            const check: PendingCheck = { Codec: config.codec, Answer: (supported) => resolve({ supported }), Reject: reject };
            FakeVideoDecoder.Checks.push(check);
            if (FakeVideoDecoder.AnswerChecks) {
                check.Answer(FakeVideoDecoder.Supported.has(config.codec));
            }
        });
    }

    constructor(private readonly init: { output: (frame: FakeVideoFrame) => void; error: (error: DOMException) => void }) {
        FakeVideoDecoder.Instances.push(this);
    }

    public configure(config: { codec: string; optimizeForLatency?: boolean; description?: unknown }): void {
        this.mustBeOpen();
        if (FakeVideoDecoder.RefuseConfigure) {
            throw new TypeError(`Invalid codec: ${config.codec}`);
        }
        this.Configs.push(config);
        this.state = 'configured';
        this.keyRequired = true;
    }

    public decode(chunk: FakeEncodedVideoChunk): void {
        if (this.state !== 'configured') {
            throw new DOMException('The decoder is not configured.', 'InvalidStateError');
        }
        if (this.keyRequired && chunk.type !== 'key') {
            throw new DOMException('A key frame is required.', 'DataError');
        }
        this.keyRequired = false;
        this.Chunks.push(chunk);
        this.decodeQueueSize++;
    }

    public flush(): Promise<void> {
        this.Flushes++;
        this.keyRequired = true;
        return Promise.resolve();
    }

    public reset(): void {
        this.mustBeOpen();
        this.Resets++;
        this.state = 'unconfigured';
        this.decodeQueueSize = 0;
    }

    public close(): void {
        this.Closes++;
        this.state = 'closed';
    }

    /** The decoder outputs a frame for the chunk at `timestampUs`, labelled for assertions. */
    public Output(timestampUs: number, label = `frame@${timestampUs}`): FakeVideoFrame {
        this.decodeQueueSize = Math.max(0, this.decodeQueueSize - 1);
        const frame = new FakeVideoFrame(label, { timestamp: timestampUs });
        this.init.output(frame);
        return frame;
    }

    /** The decoder hits an error: the browser closes it and calls back. */
    public Fail(message = 'decode failed'): void {
        this.state = 'closed';
        this.init.error(new DOMException(message, 'EncodingError'));
    }

    private mustBeOpen(): void {
        if (this.state === 'closed') {
            throw new DOMException('The decoder is closed.', 'InvalidStateError');
        }
    }
}

/** A `MediaStreamTrackGenerator` stand-in: its writer records each frame written to it and closes it, as Chromium does. */
export class FakeTrackGenerator {
    public static readonly Instances: FakeTrackGenerator[] = [];
    public readonly kind: string;
    public readonly Written: FakeVideoFrame[] = [];
    public Stopped = false;
    public readonly writable = {
        getWriter: () => ({
            write: (frame: FakeVideoFrame): Promise<void> => {
                this.Written.push(frame);
                frame.close();
                return Promise.resolve();
            },
            releaseLock: (): void => undefined,
        }),
    };

    constructor(init: { kind: string }) {
        this.kind = init.kind;
        FakeTrackGenerator.Instances.push(this);
    }

    public stop(): void {
        this.Stopped = true;
    }
}

/** A `MediaStream` stand-in holding the tracks it was made with. */
export class FakeStream {
    constructor(public readonly Tracks: unknown[] = []) {}

    public getVideoTracks(): unknown[] {
        return this.Tracks;
    }
}

/** What to install: the track generator (Chromium) or only a capturable canvas. */
export interface FakeWebCodecsOptions {
    /** Expose `MediaStreamTrackGenerator`. Defaults to true. */
    Generator?: boolean;
    /** Expose `HTMLCanvasElement` with `captureStream` (install the fake DOM too, for `document.createElement`). Defaults to true. */
    Canvas?: boolean;
}

/** Installs the WebCodecs fakes, `MediaStream`, and the generator and canvas the options ask for. */
export function InstallFakeWebCodecs(options: FakeWebCodecsOptions = {}): void {
    FakeVideoDecoder.Instances.length = 0;
    FakeVideoDecoder.Checks.length = 0;
    FakeVideoDecoder.Supported.clear();
    FakeVideoDecoder.AnswerChecks = true;
    FakeVideoDecoder.RefuseConfigure = false;
    FakeTrackGenerator.Instances.length = 0;
    OpenPictures.Count = 0;
    vi.stubGlobal('VideoDecoder', FakeVideoDecoder);
    vi.stubGlobal('EncodedVideoChunk', FakeEncodedVideoChunk);
    vi.stubGlobal('VideoFrame', FakeVideoFrame);
    vi.stubGlobal('MediaStream', FakeStream);
    vi.stubGlobal('MediaStreamTrackGenerator', options.Generator === false ? undefined : FakeTrackGenerator);
    vi.stubGlobal('HTMLCanvasElement', options.Canvas === false ? undefined : FakeCanvasElement);
}

/** One `createImageBitmap` call: the blob it was given, settled by the test. */
export interface PendingImageDecode {
    Blob: Blob;
    Resolve(label?: string): FakeImageBitmap;
    Reject(error: Error): void;
}

/** Installs a `createImageBitmap` whose decodes wait for the test; returns the calls, in order. */
export function InstallFakeImageDecoding(): PendingImageDecode[] {
    const calls: PendingImageDecode[] = [];
    vi.stubGlobal('createImageBitmap', (blob: Blob): Promise<FakeImageBitmap> => {
        return new Promise((resolve, reject) => {
            calls.push({
                Blob: blob,
                Resolve: (label = `image${calls.length}`) => {
                    const image = new FakeImageBitmap(label);
                    resolve(image);
                    return image;
                },
                Reject: reject,
            });
        });
    });
    return calls;
}
