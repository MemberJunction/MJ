/**
 * @fileoverview The work the encode worker does for one request: the planes it was sent, scaled, rotated and encoded at
 * the size the request names. Kept apart from the thread wiring in `video-encode-worker.ts` so the same code runs
 * in-process in tests. Imports only Node built-ins and the pixel module, so the worker loads no `@memberjunction/*`
 * package.
 *
 * @module @memberjunction/ai-bridge-livekit-native
 */

import { performance } from 'node:perf_hooks';
import { EncodeI420AsJpeg, I420PlanesOf, type RgbaScratch } from './video-frame-pixels';
import type { VideoEncodeEncodedReply, VideoEncodeFailedReply, VideoEncodeRequest } from './video-encode-protocol';

/** A reply plus the buffers to transfer (not copy) back to the room's thread. */
export interface HandledVideoEncodeRequest {
    /** `encoded`, or `failed` for a request that could not be encoded. */
    Reply: VideoEncodeEncodedReply | VideoEncodeFailedReply;
    /** The JPEG's buffer for an `encoded` reply; empty for `failed`. */
    Transfer: ArrayBuffer[];
}

/**
 * Encodes one request. Never throws: a bad request (short planes, a size that does not fit) or an exception in the
 * encode becomes a `failed` reply, and the worker stays usable.
 *
 * @param request The request as received.
 * @param scratch The worker's RGBA scratch, reused across requests.
 * @param now Monotonic millisecond clock for `EncodeMs`. Default `performance.now()`.
 */
export function HandleVideoEncodeRequest(
    request: VideoEncodeRequest,
    scratch: RgbaScratch,
    now: () => number = () => performance.now(),
): HandledVideoEncodeRequest {
    const startedAt = now();
    try {
        const planes = I420PlanesOf(new Uint8Array(request.Planes), request.Width, request.Height);
        const size = { Width: request.OutWidth, Height: request.OutHeight };
        const jpeg = EncodeI420AsJpeg(planes, request.RotationDegrees, size, request.Quality, scratch);
        return {
            Reply: { Kind: 'encoded', RequestID: request.RequestID, Jpeg: jpeg, Width: size.Width, Height: size.Height, EncodeMs: now() - startedAt },
            Transfer: [jpeg],
        };
    } catch (err) {
        return {
            Reply: { Kind: 'failed', RequestID: request.RequestID, Error: err instanceof Error ? err.message : String(err) },
            Transfer: [],
        };
    }
}
