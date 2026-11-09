/**
 * @fileoverview Messages between {@link VideoEncodeWorkerHost} (on the thread that hosts rooms) and its encode worker
 * (`video-encode-worker.ts`).
 *
 * Only pixels cross: no participant identity, source kind or consent state. The host sends one {@link VideoEncodeRequest}
 * per sampled frame, its planes a copy the host owns, transferred (not copied again). The worker answers `ready` once
 * after its modules load, then one `encoded` or `failed` per request, in order, with the request's id; the JPEG is
 * transferred back.
 *
 * @module @memberjunction/ai-bridge-livekit-native
 */

import type { VideoRotationDegrees } from './video-frame-pixels';

/** One sampled frame to scale, rotate and encode. */
export interface VideoEncodeRequest {
    /** The message kind. */
    Kind: 'encode';
    /** Increasing per host; echoed in the reply. */
    RequestID: number;
    /** The frame's packed I420 planes (Y, then U, then V): a copy the host owns, in the transfer list. */
    Planes: ArrayBuffer;
    /** The stored frame's width in pixels. */
    Width: number;
    /** The stored frame's height in pixels. */
    Height: number;
    /** Clockwise rotation the frame needs to stand upright. */
    RotationDegrees: VideoRotationDegrees;
    /** The encoded image's width, computed on the room's thread (upright, then capped for the source's kind). */
    OutWidth: number;
    /** The encoded image's height, computed on the room's thread. */
    OutHeight: number;
    /** JPEG quality, 1-100 (clamped by the worker). */
    Quality: number;
}

/** Sent once, after the worker's modules load: tells a start failure apart from a crash. */
export interface VideoEncodeReadyReply {
    /** The message kind. */
    Kind: 'ready';
}

/** A request encoded. */
export interface VideoEncodeEncodedReply {
    /** The message kind. */
    Kind: 'encoded';
    /** The request's id. */
    RequestID: number;
    /** The JPEG bytes: a standalone buffer, in the transfer list. */
    Jpeg: ArrayBuffer;
    /** The encoded image's width in pixels. */
    Width: number;
    /** The encoded image's height in pixels. */
    Height: number;
    /** The encode's own time (scale, rotate, JPEG) in ms, on the worker's clock. */
    EncodeMs: number;
}

/** A request the worker could not encode (a short buffer, a bad size, an exception in the encode). Affects that request only. */
export interface VideoEncodeFailedReply {
    /** The message kind. */
    Kind: 'failed';
    /** The request's id. */
    RequestID: number;
    /** Why. */
    Error: string;
}

/** Every message the encode worker sends. */
export type VideoEncodeReply = VideoEncodeReadyReply | VideoEncodeEncodedReply | VideoEncodeFailedReply;

/**
 * The encode worker as the host drives it: a `worker_threads.Worker` matches it, and tests inject a fake. Member names
 * mirror Node's `Worker`.
 */
export interface IVideoEncodeWorker {
    /** Sends one request, moving the buffers in `transferList` to the worker. */
    postMessage(message: VideoEncodeRequest, transferList: ReadonlyArray<ArrayBuffer>): void;  // case-violation-ok-legacy-back-compat: mirrors node:worker_threads' Worker
    /** Receives the worker's replies. */
    on(event: 'message', listener: (reply: VideoEncodeReply) => void): this;  // case-violation-ok-legacy-back-compat: mirrors node:worker_threads' Worker
    /** Receives an uncaught error inside the worker (the worker then exits). */
    on(event: 'error', listener: (err: Error) => void): this;  // case-violation-ok-legacy-back-compat: mirrors node:worker_threads' Worker
    /** Receives the worker's exit. */
    on(event: 'exit', listener: (code: number) => void): this;  // case-violation-ok-legacy-back-compat: mirrors node:worker_threads' Worker
    /** Stops the worker thread. */
    terminate(): Promise<number>;  // case-violation-ok-legacy-back-compat: mirrors node:worker_threads' Worker
    /** Lets the process exit while the worker runs. */
    unref(): void;  // case-violation-ok-legacy-back-compat: mirrors node:worker_threads' Worker
}
