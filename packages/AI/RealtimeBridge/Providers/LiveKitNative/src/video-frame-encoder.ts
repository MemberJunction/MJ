/**
 * @fileoverview Turns one decoded `@livekit/rtc-node` video frame into a JPEG a realtime model can take, and the seam the
 * video watcher encodes through.
 *
 * The pixel work (I420 to RGBA with box downscaling and rotation in one pass, then `jpeg-js`) lives in
 * `video-frame-pixels.ts`, which the encode worker loads. This module adds what needs the SDK or `@memberjunction/ai`:
 * the size a frame is encoded at (the cap on the longer side, never enlarging, shared with the browser's frame sampler),
 * converting a frame in another buffer type with the SDK's `convert(I420)`, and the in-process encoder.
 *
 * {@link IRoomVideoFrameEncoder} is where the watcher's sampled frames go: {@link VideoEncodeWorkerHost} encodes them on
 * the encode worker's thread; {@link InProcessVideoFrameEncoder} encodes them on the calling thread (the thread that
 * hosts the room), which is the fallback, the switch turned off, and the default for a client constructed directly.
 *
 * @module @memberjunction/ai-bridge-livekit-native
 * @author MemberJunction.com
 */

import { performance } from 'node:perf_hooks';
import { ScaleRealtimeVideoFrame, type RealtimeVideoFrameSize } from '@memberjunction/ai';
import type { RtcVideoFrame } from './livekit-rtc-node-room';
import type { VideoEncodeLocation } from './room-telemetry';
import {
    EncodeI420AsJpeg,
    I420PlanesOf,
    OrientedVideoFrameSize,
    RgbaScratch,
    type VideoRotationDegrees,
} from './video-frame-pixels';

/** Default cap on a camera frame's longer side, in pixels: faces read well at this size. */
export const DEFAULT_CAMERA_MAX_DIMENSION = 640;
/** Default cap on a shared screen's longer side, in pixels: large enough that on-screen text stays legible. */
export const DEFAULT_SCREEN_MAX_DIMENSION = 1280;
/** Default JPEG quality (1-100): the browser frame sampler's 0.8. */
export const DEFAULT_JPEG_QUALITY = 80;

/** How {@link VideoFrameEncoder.Encode} shapes one frame. */
export interface VideoFrameEncodeOptions {
    /** Clockwise rotation the frame needs for upright display (WebRTC's convention). */
    RotationDegrees: VideoRotationDegrees;
    /** Cap on the encoded image's longer side, in pixels. The image is never enlarged. */
    MaxDimension: number;
    /** JPEG quality, 1-100 (clamped). */
    Quality: number;
}

/** One encoded frame. */
export interface EncodedVideoFrame {
    /** The JPEG bytes: a standalone buffer that aliases nothing, so it can be transferred to another thread. */
    Data: ArrayBuffer;
    /** The encoded image's width in pixels (after rotation and scaling). */
    Width: number;
    /** The encoded image's height in pixels (after rotation and scaling). */
    Height: number;
}

/** The size a frame is encoded at: upright, then scaled down so the longer side is at most `maxDimension`. */
export function EncodedVideoFrameSize(
    width: number,
    height: number,
    rotation: VideoRotationDegrees,
    maxDimension: number,
): RealtimeVideoFrameSize {
    return ScaleRealtimeVideoFrame(OrientedVideoFrameSize(width, height, rotation), maxDimension);
}

/** The frame in I420: itself, or converted by the SDK (an FFI call, on the calling thread). */
export function I420FrameOf(frame: RtcVideoFrame, i420Type: number): RtcVideoFrame {
    return frame.type === i420Type ? frame : frame.convert(i420Type);
}

/**
 * Encodes frames synchronously, on the calling thread. Keeps one RGBA scratch buffer and reuses it for every frame, so a
 * sampled frame allocates only its JPEG.
 */
export class VideoFrameEncoder {
    private readonly i420Type: number;
    private readonly scratch = new RgbaScratch();

    /** @param i420Type The SDK's `VideoBufferType.I420` value. */
    constructor(i420Type: number) {
        this.i420Type = i420Type;
    }

    /**
     * Encodes one frame: converts it to I420 when it is in another buffer type, then scales, rotates and encodes it.
     * Throws when the frame is empty or its buffer is shorter than its size implies.
     */
    public Encode(frame: RtcVideoFrame, options: VideoFrameEncodeOptions): EncodedVideoFrame {
        const i420 = I420FrameOf(frame, this.i420Type);
        const planes = I420PlanesOf(i420.data, i420.width, i420.height);
        const size = EncodedVideoFrameSize(i420.width, i420.height, options.RotationDegrees, options.MaxDimension);
        return {
            Data: EncodeI420AsJpeg(planes, options.RotationDegrees, size, options.Quality, this.scratch),
            Width: size.Width,
            Height: size.Height,
        };
    }
}

/** How a watcher asks for one sampled frame to be encoded. */
export interface RoomVideoFrameEncodeOptions extends VideoFrameEncodeOptions {
    /** The SDK's `VideoBufferType.I420` value: a frame in another buffer type is converted to it first, on the caller's thread. */
    I420Type: number;
}

/** One encoded frame and what its encode cost. */
export interface TimedEncodedVideoFrame extends EncodedVideoFrame {
    /** The encode's own time (scale, rotate, JPEG) in ms, on the thread that ran it. */
    EncodeMs: number;
}

/** Counters an encoder reports for room telemetry. */
export interface VideoEncoderStats {
    /** Frames sent to the encode worker and not answered yet, from every room on this thread (0 in-process). */
    QueueDepth: number;
    /** Encode worker failures on this thread since the process started (0 for an in-process encoder). */
    WorkerRestarts: number;
}

/** Where a watcher's sampled frames are scaled, rotated and encoded. */
export interface IRoomVideoFrameEncoder {
    /**
     * Encodes one frame. Copies what it needs before it returns, and never keeps `frame`. Never throws: a frame that
     * cannot be encoded rejects the promise.
     */
    Encode(frame: RtcVideoFrame, options: RoomVideoFrameEncodeOptions): Promise<TimedEncodedVideoFrame>;
    /** Where frames are encoded now. */
    readonly Location: VideoEncodeLocation;
    /** Counters for room telemetry. */
    GetStats(): VideoEncoderStats;
}

/**
 * Encodes on the calling thread: the encode is done when {@link Encode} returns, and the promise only carries the result.
 * The fallback of {@link VideoEncodeWorkerHost}, and the watcher's default.
 */
export class InProcessVideoFrameEncoder implements IRoomVideoFrameEncoder {
    /** Always in-process. */
    public readonly Location: VideoEncodeLocation = 'in-process';
    private readonly now: () => number;
    /** One encoder (and scratch buffer) for every frame, for the SDK's I420 value it was built with. */
    private encoder: { i420Type: number; encoder: VideoFrameEncoder } | null = null;

    /** @param now Monotonic millisecond clock for `EncodeMs`. Default `performance.now()`. */
    constructor(now?: () => number) {
        this.now = now ?? (() => performance.now());
    }

    /** Encodes one frame now; a frame that cannot be encoded rejects. */
    public Encode(frame: RtcVideoFrame, options: RoomVideoFrameEncodeOptions): Promise<TimedEncodedVideoFrame> {
        try {
            return Promise.resolve(this.encodeNow(frame, options));
        } catch (err) {
            return Promise.reject(err instanceof Error ? err : new Error(String(err)));
        }
    }

    /** Nothing queues and no worker runs. */
    public GetStats(): VideoEncoderStats {
        return { QueueDepth: 0, WorkerRestarts: 0 };
    }

    private encodeNow(frame: RtcVideoFrame, options: RoomVideoFrameEncodeOptions): TimedEncodedVideoFrame {
        const startedAt = this.now();
        const encoded = this.encoderFor(options.I420Type).Encode(frame, options);
        return { ...encoded, EncodeMs: this.now() - startedAt };
    }

    private encoderFor(i420Type: number): VideoFrameEncoder {
        if (this.encoder?.i420Type !== i420Type) {
            this.encoder = { i420Type, encoder: new VideoFrameEncoder(i420Type) };
        }
        return this.encoder.encoder;
    }
}
