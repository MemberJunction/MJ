/**
 * Fakes for participant-video encoding in unit tests (no thread is started): an encoder the test settles by hand, for
 * the watcher, and an encode worker the test answers by hand, for {@link VideoEncodeWorkerHost}.
 */
import type { RtcVideoFrame } from '../livekit-rtc-node-room';
import type { VideoEncodeLocation } from '../room-telemetry';
import type { IVideoEncodeWorker, VideoEncodeReply, VideoEncodeRequest } from '../video-encode-protocol';
import type {
    IRoomVideoFrameEncoder,
    RoomVideoFrameEncodeOptions,
    TimedEncodedVideoFrame,
    VideoEncoderStats,
} from '../video-frame-encoder';

/** One `Encode` call a {@link DeferredVideoEncoder} holds until the test settles it. */
export interface DeferredEncode {
    frame: RtcVideoFrame;
    options: RoomVideoFrameEncodeOptions;
    resolve: (encoded: TimedEncodedVideoFrame) => void;
    reject: (err: Error) => void;
    settled: boolean;
}

/** An encoder whose every `Encode` waits until the test resolves or rejects it. */
export class DeferredVideoEncoder implements IRoomVideoFrameEncoder {
    public Location: VideoEncodeLocation = 'worker';
    public readonly calls: DeferredEncode[] = [];
    public stats: VideoEncoderStats = { QueueDepth: 0, WorkerRestarts: 0 };

    public Encode(frame: RtcVideoFrame, options: RoomVideoFrameEncodeOptions): Promise<TimedEncodedVideoFrame> {
        return new Promise<TimedEncodedVideoFrame>((resolve, reject) => {
            this.calls.push({ frame, options, resolve, reject, settled: false });
        });
    }

    public GetStats(): VideoEncoderStats {
        return { ...this.stats };
    }

    /** Answers call `index` with a JPEG stand-in of `bytes` bytes at the frame's own size. */
    public resolve(index: number, encodeMs = 5, bytes = 100): void {
        const call = this.calls[index];
        call.settled = true;
        call.resolve({ Data: new ArrayBuffer(bytes), Width: call.frame.width, Height: call.frame.height, EncodeMs: encodeMs });
    }

    /** Fails call `index`. */
    public reject(index: number, message = 'encode failed'): void {
        const call = this.calls[index];
        call.settled = true;
        call.reject(new Error(message));
    }
}

/** An encode worker the test answers by hand. Records every request with its transfer list. */
export class FakeEncodeWorker implements IVideoEncodeWorker {
    public readonly requests: { message: VideoEncodeRequest; transfer: ReadonlyArray<ArrayBuffer> }[] = [];
    public terminateCalls = 0;
    public unrefCalls = 0;
    private readonly messageListeners: ((reply: VideoEncodeReply) => void)[] = [];
    private readonly errorListeners: ((err: Error) => void)[] = [];
    private readonly exitListeners: ((code: number) => void)[] = [];

    public postMessage(message: VideoEncodeRequest, transferList: ReadonlyArray<ArrayBuffer>): void {
        this.requests.push({ message, transfer: transferList });
    }

    public on(event: 'message', listener: (reply: VideoEncodeReply) => void): this;
    public on(event: 'error', listener: (err: Error) => void): this;
    public on(event: 'exit', listener: (code: number) => void): this;
    public on(
        event: 'message' | 'error' | 'exit',
        listener: ((reply: VideoEncodeReply) => void) | ((err: Error) => void) | ((code: number) => void),
    ): this {
        if (event === 'message') {
            this.messageListeners.push(listener as (reply: VideoEncodeReply) => void);
        } else if (event === 'error') {
            this.errorListeners.push(listener as (err: Error) => void);
        } else {
            this.exitListeners.push(listener as (code: number) => void);
        }
        return this;
    }

    public terminate(): Promise<number> {
        this.terminateCalls++;
        return Promise.resolve(1);
    }

    public unref(): void {
        this.unrefCalls++;
    }

    /** Delivers a reply to the host. */
    public reply(reply: VideoEncodeReply): void {
        for (const listener of this.messageListeners) listener(reply);
    }

    public ready(): void {
        this.reply({ Kind: 'ready' });
    }

    /** Answers request `index` (in arrival order) as encoded, with a JPEG stand-in of `bytes` bytes. */
    public encoded(index: number, bytes = 10, encodeMs = 3): void {
        const { message } = this.requests[index];
        this.reply({ Kind: 'encoded', RequestID: message.RequestID, Jpeg: new ArrayBuffer(bytes), Width: message.OutWidth, Height: message.OutHeight, EncodeMs: encodeMs });
    }

    /** Answers request `index` as failed. */
    public failed(index: number, error = 'scripted failure'): void {
        this.reply({ Kind: 'failed', RequestID: this.requests[index].message.RequestID, Error: error });
    }

    public exit(code: number): void {
        for (const listener of this.exitListeners) listener(code);
    }

    public error(err: Error): void {
        for (const listener of this.errorListeners) listener(err);
    }
}

/** A host `WorkerFactory` that hands out fake workers and remembers each one. */
export function fakeWorkerFactory(workers: FakeEncodeWorker[]): () => IVideoEncodeWorker {
    return () => {
        const worker = new FakeEncodeWorker();
        workers.push(worker);
        return worker;
    };
}
