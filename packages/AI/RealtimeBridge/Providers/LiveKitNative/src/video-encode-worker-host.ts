/**
 * @fileoverview Participant video encoded on its own thread: {@link VideoEncodeWorkerHost} owns one encode worker for
 * the thread that hosts rooms (MJAPI's main thread, or a media worker), shared by every watching room client there.
 *
 * - **Start and stop:** the first frame spawns the worker, so no thread exists where nobody let an agent see them. With
 *   no request for {@link VIDEO_ENCODE_IDLE_STOP_MS} and none pending it is stopped; the next frame spawns a new one. The
 *   worker and every timer are `unref`'d: the host never keeps a process alive and needs no shutdown hook.
 * - **Per frame (room thread):** convert to I420 if needed, compute the output size, copy the planes into a buffer the
 *   host owns, post it with that buffer in the transfer list. The SDK's own frame buffer cannot be transferred.
 * - **Failure:** a worker that errors, exits, does not start within {@link VIDEO_ENCODE_START_TIMEOUT_MS}, or leaves a
 *   request unanswered for {@link VIDEO_ENCODE_REQUEST_TIMEOUT_MS} rejects every pending frame and is replaced on the
 *   next frame. After {@link VIDEO_ENCODE_MAX_FAILURES} failures within {@link VIDEO_ENCODE_FAILURE_WINDOW_MS}, or when
 *   the worker script is missing, frames are encoded in-process for the rest of the process (logged once).
 *
 * The worker never sees who a frame belongs to or whether they consented: the watcher checks consent before a frame is
 * sent here and again when its JPEG returns.
 *
 * @module @memberjunction/ai-bridge-livekit-native
 */

import { existsSync } from 'node:fs';
import { Worker } from 'node:worker_threads';
import { BaseSingleton } from '@memberjunction/global';
import { LogError, LogStatus } from '@memberjunction/core';
import type { RtcVideoFrame } from './livekit-rtc-node-room';
import type { VideoEncodeLocation } from './room-telemetry';
import type { IVideoEncodeWorker, VideoEncodeReply, VideoEncodeRequest } from './video-encode-protocol';
import {
    EncodedVideoFrameSize,
    I420FrameOf,
    InProcessVideoFrameEncoder,
    type IRoomVideoFrameEncoder,
    type RoomVideoFrameEncodeOptions,
    type TimedEncodedVideoFrame,
    type VideoEncoderStats,
} from './video-frame-encoder';
import { CopyI420Planes } from './video-frame-pixels';
import { ResolveWorkerScriptPath } from './worker-script-path';

/**
 * A request unanswered this long (ms) means the worker hung: it is terminated and replaced. Counted from when the request
 * was sent, or from `ready` for a request sent while the worker was starting (the start timeout covers that time).
 */
export const VIDEO_ENCODE_REQUEST_TIMEOUT_MS = 5_000;
/** A worker that has not said `ready` this long (ms) after it was spawned failed to start. */
export const VIDEO_ENCODE_START_TIMEOUT_MS = 10_000;
/** Worker failures within {@link VIDEO_ENCODE_FAILURE_WINDOW_MS} that switch the host to in-process encoding. */
export const VIDEO_ENCODE_MAX_FAILURES = 3;
/** The window (ms) over which worker failures are counted. */
export const VIDEO_ENCODE_FAILURE_WINDOW_MS = 60_000;
/** A worker with nothing to do this long (ms) is stopped. */
export const VIDEO_ENCODE_IDLE_STOP_MS = 60_000;
/** Heap cap of the encode worker: a runaway ends the worker rather than growing the process. VERIFY the size. */
export const VIDEO_ENCODE_WORKER_MAX_OLD_GENERATION_MB = 128;
/** The built worker entry's file name. */
const WORKER_FILE = 'video-encode-worker.js';

/** Settings of {@link VideoEncodeWorkerHost}, for tests and diagnostics. */
export interface VideoEncodeWorkerHostOptions {
    /** Starts an encode worker. Default: {@link CreateVideoEncodeWorker} over {@link VideoEncodeWorkerHost.WorkerPath}. */
    WorkerFactory?: () => IVideoEncodeWorker;
    /** The worker script. Default: `video-encode-worker.js` beside this module (`dist/`, also when running from `src/`). */
    WorkerPath?: string;
}

/** A frame sent to the worker and not answered yet. */
interface PendingEncode {
    resolve: (encoded: TimedEncodedVideoFrame) => void;
    reject: (err: Error) => void;
    /** The request timeout, armed once the worker is ready. */
    timer: NodeJS.Timeout | null;
}

/** A `setTimeout` that never keeps the process alive. */
function unrefTimeout(callback: () => void, ms: number): NodeJS.Timeout {
    const timer = setTimeout(callback, ms);
    timer.unref?.();
    return timer;
}

function errorMessageOf(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}

/**
 * Starts an encode worker over `workerPath`, with a heap cap of {@link VIDEO_ENCODE_WORKER_MAX_OLD_GENERATION_MB}. The
 * host's default factory; exported so a diagnostic (the live script's crash phase) can wrap it.
 */
export function CreateVideoEncodeWorker(workerPath: string): IVideoEncodeWorker {
    return new Worker(workerPath, { resourceLimits: { maxOldGenerationSizeMb: VIDEO_ENCODE_WORKER_MAX_OLD_GENERATION_MB } });
}

/**
 * The encode worker of this thread and the frames waiting on it. One per thread (`BaseSingleton` keys on the thread's
 * global object), shared by every watching room client on that thread. See the file header for its lifecycle and
 * failure policy.
 */
export class VideoEncodeWorkerHost extends BaseSingleton<VideoEncodeWorkerHost> implements IRoomVideoFrameEncoder {
    private options: VideoEncodeWorkerHostOptions = {};
    private worker: IVideoEncodeWorker | null = null;
    private ready = false;
    private startTimer: NodeJS.Timeout | null = null;
    private idleTimer: NodeJS.Timeout | null = null;
    private readonly pending = new Map<number, PendingEncode>();
    private nextRequestID = 1;
    private failureTimes: number[] = [];
    private restarts = 0;
    private fallbackReason: string | null = null;
    /** The worker script last found on disk, so it is checked once per path. */
    private checkedPath: string | null = null;
    private readonly inProcess = new InProcessVideoFrameEncoder();

    protected constructor() {
        super();
    }

    /** This thread's host. Creating it starts nothing: the first frame does. */
    public static get Instance(): VideoEncodeWorkerHost {
        return super.getInstance<VideoEncodeWorkerHost>();
    }

    /** Where frames are encoded now: on the worker, or in-process after the host gave up on it. */
    public get Location(): VideoEncodeLocation {
        return this.fallbackReason === null ? 'worker' : 'in-process';
    }

    /** Why frames are encoded in-process, or null while the worker is used. */
    public get FallbackReason(): string | null {
        return this.fallbackReason;
    }

    /** The worker script the default factory starts. */
    public get WorkerPath(): string {
        return this.options.WorkerPath ?? ResolveWorkerScriptPath(WORKER_FILE);
    }

    /** Whether an encode worker is running now. */
    public get IsWorkerRunning(): boolean {
        return this.worker !== null;
    }

    /** Replaces the settings given (tests, diagnostics). Takes effect at the next spawn. */
    public Configure(options: VideoEncodeWorkerHostOptions): void {
        this.options = { ...this.options, ...options };
    }

    /**
     * Encodes one frame on the encode worker (spawning it when none runs), or in-process after the fallback. Copies the
     * frame's planes before it returns. Rejects when the frame cannot be encoded or the worker fails with it in flight.
     */
    public Encode(frame: RtcVideoFrame, options: RoomVideoFrameEncodeOptions): Promise<TimedEncodedVideoFrame> {
        if (!this.workerAvailable()) {
            return this.inProcess.Encode(frame, options);
        }
        try {
            const request = this.buildRequest(frame, options);
            return this.post(this.worker ?? this.spawn(), request);
        } catch (err) {
            return Promise.reject(err instanceof Error ? err : new Error(String(err)));
        }
    }

    /** Frames waiting on the worker (every room on this thread), and worker failures so far. */
    public GetStats(): VideoEncoderStats {
        return { QueueDepth: this.pending.size, WorkerRestarts: this.restarts };
    }

    /**
     * Back to a fresh host (tests): stops the worker, rejects what is pending, clears the failure count, the fallback and
     * the settings.
     */
    public Reset(): void {
        const worker = this.worker;
        this.detach();
        if (worker) {
            this.terminate(worker);
        }
        this.rejectPending(new Error('the video encode host was reset'));
        this.options = {};
        this.checkedPath = null;
        this.failureTimes = [];
        this.restarts = 0;
        this.fallbackReason = null;
        this.nextRequestID = 1;
    }

    // ── requests ─────────────────────────────────────────────────────────────────

    /** False after the fallback; the first time a worker script is used, a missing file switches to the fallback. */
    private workerAvailable(): boolean {
        if (this.fallbackReason !== null) {
            return false;
        }
        if (this.options.WorkerFactory) {
            return true;
        }
        const workerPath = this.WorkerPath;
        if (this.checkedPath !== workerPath) {
            if (!existsSync(workerPath)) {
                this.fallBack(`the encode worker script was not found at ${workerPath}`);
                return false;
            }
            this.checkedPath = workerPath;
        }
        return true;
    }

    /** The request for one frame, built on this thread: I420, the output size, and an owned copy of the planes. */
    private buildRequest(frame: RtcVideoFrame, options: RoomVideoFrameEncodeOptions): VideoEncodeRequest {
        const i420 = I420FrameOf(frame, options.I420Type);
        const size = EncodedVideoFrameSize(i420.width, i420.height, options.RotationDegrees, options.MaxDimension);
        return {
            Kind: 'encode',
            RequestID: this.nextRequestID++,
            Planes: CopyI420Planes(i420.data, i420.width, i420.height),
            Width: i420.width,
            Height: i420.height,
            RotationDegrees: options.RotationDegrees,
            OutWidth: size.Width,
            OutHeight: size.Height,
            Quality: options.Quality,
        };
    }

    /** Posts a request, transferring its planes, and resolves with its reply. */
    private post(worker: IVideoEncodeWorker, request: VideoEncodeRequest): Promise<TimedEncodedVideoFrame> {
        this.clearIdleTimer();
        return new Promise<TimedEncodedVideoFrame>((resolve, reject) => {
            const entry: PendingEncode = { resolve, reject, timer: null };
            this.pending.set(request.RequestID, entry);
            if (this.ready) {
                this.armRequestTimer(request.RequestID, entry);
            }
            try {
                worker.postMessage(request, [request.Planes]);
            } catch (err) {
                this.take(request.RequestID);
                reject(err instanceof Error ? err : new Error(String(err)));
                this.armIdleTimer();
            }
        });
    }

    private armRequestTimer(requestID: number, entry: PendingEncode): void {
        entry.timer = unrefTimeout(() => this.onRequestTimeout(requestID), VIDEO_ENCODE_REQUEST_TIMEOUT_MS);
    }

    private onRequestTimeout(requestID: number): void {
        if (this.worker && this.pending.has(requestID)) {
            this.failWorker(this.worker, `encode request ${requestID} was not answered within ${VIDEO_ENCODE_REQUEST_TIMEOUT_MS} ms`);
        }
    }

    /** Removes a pending request and cancels its timeout. */
    private take(requestID: number): PendingEncode | undefined {
        const entry = this.pending.get(requestID);
        if (entry) {
            this.pending.delete(requestID);
            if (entry.timer) {
                clearTimeout(entry.timer);
            }
        }
        return entry;
    }

    private rejectPending(err: Error): void {
        for (const requestID of Array.from(this.pending.keys())) {
            this.take(requestID)?.reject(err);
        }
    }

    // ── the worker ───────────────────────────────────────────────────────────────

    /** Starts a worker and wires it. Throws (after counting the failure) when it cannot be started. */
    private spawn(): IVideoEncodeWorker {
        let worker: IVideoEncodeWorker;
        try {
            worker = this.options.WorkerFactory ? this.options.WorkerFactory() : CreateVideoEncodeWorker(this.WorkerPath);
        } catch (err) {
            const reason = `the encode worker could not be started: ${errorMessageOf(err)}`;
            this.countFailure(reason);
            throw new Error(reason);
        }
        this.worker = worker;
        this.ready = false;
        worker.unref();
        worker.on('message', (reply: VideoEncodeReply) => this.onReply(worker, reply));
        worker.on('error', (err: Error) => this.failWorker(worker, `the encode worker failed: ${err.message}`));
        worker.on('exit', (code: number) => this.failWorker(worker, `the encode worker exited with code ${code}`));
        this.startTimer = unrefTimeout(
            () => this.failWorker(worker, `the encode worker did not start within ${VIDEO_ENCODE_START_TIMEOUT_MS} ms`),
            VIDEO_ENCODE_START_TIMEOUT_MS,
        );
        return worker;
    }

    /** A reply from the current worker; anything from a replaced one is ignored. */
    private onReply(worker: IVideoEncodeWorker, reply: VideoEncodeReply): void {
        if (worker !== this.worker) {
            return;
        }
        switch (reply.Kind) {
            case 'ready':
                this.onReady();
                return;
            case 'encoded':
                this.settle(reply.RequestID, (entry) =>
                    entry.resolve({ Data: reply.Jpeg, Width: reply.Width, Height: reply.Height, EncodeMs: reply.EncodeMs }),
                );
                return;
            case 'failed':
                this.settle(reply.RequestID, (entry) => entry.reject(new Error(reply.Error)));
                return;
        }
    }

    /** The worker loaded: requests posted before now start their timeouts. */
    private onReady(): void {
        this.ready = true;
        this.clearStartTimer();
        for (const [requestID, entry] of this.pending) {
            this.armRequestTimer(requestID, entry);
        }
    }

    /** Settles one answered request (an unknown id is ignored), then starts the idle clock if nothing is pending. */
    private settle(requestID: number, finish: (entry: PendingEncode) => void): void {
        const entry = this.take(requestID);
        if (entry) {
            finish(entry);
            this.armIdleTimer();
        }
    }

    /** The current worker failed: drop it, fail what it held, and count it. The next frame spawns a new one. */
    private failWorker(worker: IVideoEncodeWorker, reason: string): void {
        if (worker !== this.worker) {
            return;
        }
        this.detach();
        this.terminate(worker);
        this.rejectPending(new Error(reason));
        this.countFailure(reason);
    }

    /** Counts a worker failure; enough of them within the window switch the host to in-process encoding. */
    private countFailure(reason: string): void {
        this.restarts++;
        const now = Date.now();
        this.failureTimes = this.failureTimes.filter((at) => now - at < VIDEO_ENCODE_FAILURE_WINDOW_MS);
        this.failureTimes.push(now);
        if (this.failureTimes.length >= VIDEO_ENCODE_MAX_FAILURES) {
            this.fallBack(`${VIDEO_ENCODE_MAX_FAILURES} encode worker failures within ${VIDEO_ENCODE_FAILURE_WINDOW_MS / 1000} s (last: ${reason})`);
        } else {
            LogStatus(`[VideoEncodeWorkerHost] ${reason}; the next frame starts a new encode worker`);
        }
    }

    /** Encodes in-process for the rest of the process. Logged once. */
    private fallBack(reason: string): void {
        if (this.fallbackReason !== null) {
            return;
        }
        this.fallbackReason = reason;
        LogError(`[VideoEncodeWorkerHost] ${reason}; participant video is encoded on the thread that hosts the room from now on`);
    }

    // ── idle stop and teardown ───────────────────────────────────────────────────

    /** Starts the idle clock when a worker runs and nothing is pending; a new request clears it. */
    private armIdleTimer(): void {
        if (!this.worker || this.pending.size > 0) {
            return;
        }
        this.clearIdleTimer();
        this.idleTimer = unrefTimeout(() => this.stopIdleWorker(), VIDEO_ENCODE_IDLE_STOP_MS);
    }

    /** Nothing was sent for the idle period: stop the worker (not a failure). */
    private stopIdleWorker(): void {
        this.idleTimer = null;
        const worker = this.worker;
        if (worker) {
            this.detach();
            this.terminate(worker);
        }
    }

    /** Forgets the current worker, so its late events are ignored, and clears its timers. */
    private detach(): void {
        this.worker = null;
        this.ready = false;
        this.clearStartTimer();
        this.clearIdleTimer();
    }

    private clearStartTimer(): void {
        if (this.startTimer) {
            clearTimeout(this.startTimer);
            this.startTimer = null;
        }
    }

    private clearIdleTimer(): void {
        if (this.idleTimer) {
            clearTimeout(this.idleTimer);
            this.idleTimer = null;
        }
    }

    /** Stops a worker (best-effort; it may have exited already). */
    private terminate(worker: IVideoEncodeWorker): void {
        try {
            worker.terminate().catch((err: unknown) => LogStatus(`[VideoEncodeWorkerHost] terminating the encode worker failed: ${errorMessageOf(err)}`));
        } catch (err) {
            LogStatus(`[VideoEncodeWorkerHost] terminating the encode worker failed: ${errorMessageOf(err)}`);
        }
    }
}
