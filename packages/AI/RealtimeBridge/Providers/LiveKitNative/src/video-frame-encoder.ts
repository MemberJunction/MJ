/**
 * @fileoverview Turns one decoded `@livekit/rtc-node` video frame into a JPEG a realtime model can take.
 *
 * One JavaScript pass converts the I420 planes to RGBA while box-downscaling to a size cap and applying the frame's
 * rotation; `jpeg-js` then encodes the RGBA. Frames in another buffer type go through the SDK's `convert(I420)` first.
 * The frame math (the cap on the longer side, never enlarging) comes from `@memberjunction/ai`, shared with the
 * browser's frame sampler.
 *
 * Synchronous on purpose: it runs on the thread that hosts the room (MJAPI's main loop in-process, the media worker
 * with `MJ_LIVEKIT_WORKER_MEDIA=on`), at most once per sampled frame, and the size caps bound its cost. Room telemetry
 * reports how long it takes.
 *
 * Every assumption about the SDK's frame layout carries a `VERIFY against @livekit/rtc-node` note.
 *
 * @module @memberjunction/ai-bridge-livekit-native
 * @author MemberJunction.com
 */

import jpeg from 'jpeg-js';
import { ScaleRealtimeVideoFrame, type RealtimeVideoFrameSize } from '@memberjunction/ai';
import type { RtcVideoFrame } from './livekit-rtc-node-room';

/** Default cap on a camera frame's longer side, in pixels: faces read well at this size. */
export const DEFAULT_CAMERA_MAX_DIMENSION = 640;
/** Default cap on a shared screen's longer side, in pixels: large enough that on-screen text stays legible. */
export const DEFAULT_SCREEN_MAX_DIMENSION = 1280;
/** Default JPEG quality (1-100): the browser frame sampler's 0.8. */
export const DEFAULT_JPEG_QUALITY = 80;

/** How far a frame must be turned clockwise to stand upright, in degrees. */
export type VideoRotationDegrees = 0 | 90 | 180 | 270;

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

/** An I420 frame's three planes, as views over one contiguous buffer. */
export interface I420Planes {
    /** The full-size luma (Y) plane; its stride is {@link Width}. */
    Luma: Uint8Array;
    /** The quarter-size Cb (U) plane; its stride is {@link ChromaWidth}. */
    ChromaU: Uint8Array;
    /** The quarter-size Cr (V) plane; its stride is {@link ChromaWidth}. */
    ChromaV: Uint8Array;
    /** Frame width in pixels. */
    Width: number;
    /** Frame height in pixels. */
    Height: number;
    /** Chroma plane width: half the frame width, rounded up. */
    ChromaWidth: number;
}

/** An RGBA destination of a known size. */
export interface RgbaTarget {
    /** Four bytes per pixel, row-major; at least `Width * Height * 4` bytes. */
    Data: Uint8Array;
    /** Width in pixels. */
    Width: number;
    /** Height in pixels. */
    Height: number;
}

/**
 * Byte length of an I420 frame whose planes are packed back to back with no row padding: a full-size Y plane, then
 * quarter-size U and V planes (each side rounded up). VERIFY against @livekit/rtc-node: `VideoFrame.fromOwnedInfo`
 * copies exactly this many bytes for I420.
 */
export function I420ByteLength(width: number, height: number): number {
    const chromaWidth = (width + 1) >> 1;
    const chromaHeight = (height + 1) >> 1;
    return width * height + 2 * chromaWidth * chromaHeight;
}

/** The frame's upright size: rotation by 90 or 270 degrees swaps width and height. */
export function OrientedVideoFrameSize(width: number, height: number, rotation: VideoRotationDegrees): RealtimeVideoFrameSize {
    return rotation === 90 || rotation === 270 ? { Width: height, Height: width } : { Width: width, Height: height };
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

/**
 * Returns `bytes` as an `ArrayBuffer` holding exactly those bytes. Hands back the backing buffer when the view covers
 * all of it, and copies otherwise (Node's `Buffer` pool shares one slab between small buffers; transferring that slab
 * to another thread would detach every other buffer on it).
 */
export function StandaloneArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    const backing = bytes.buffer;
    if (backing instanceof ArrayBuffer && bytes.byteOffset === 0 && bytes.byteLength === backing.byteLength) {
        return backing;
    }
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    return copy.buffer;
}

/**
 * Splits an I420 buffer into its planes. Throws when the buffer is shorter than {@link I420ByteLength}.
 * VERIFY against @livekit/rtc-node: the planes are contiguous, with strides equal to the plane widths.
 */
export function I420PlanesOf(data: Uint8Array, width: number, height: number): I420Planes {
    if (width < 1 || height < 1) {
        throw new Error(`video frame has no pixels (${width}x${height})`);
    }
    const expected = I420ByteLength(width, height);
    if (data.byteLength < expected) {
        throw new Error(`I420 frame ${width}x${height} has ${data.byteLength} bytes; expected ${expected}`);
    }
    const lumaLength = width * height;
    const chromaWidth = (width + 1) >> 1;
    const chromaLength = chromaWidth * ((height + 1) >> 1);
    return {
        Luma: data.subarray(0, lumaLength),
        ChromaU: data.subarray(lumaLength, lumaLength + chromaLength),
        ChromaV: data.subarray(lumaLength + chromaLength, lumaLength + 2 * chromaLength),
        Width: width,
        Height: height,
        ChromaWidth: chromaWidth,
    };
}

/**
 * Box edges along one axis: `edges[i]` to `edges[i + 1]` is the run of upright pixels that output pixel `i` averages.
 * The output is never larger than the input, so every box holds at least one pixel and the boxes tile the axis.
 */
function boxEdges(uprightLength: number, outputLength: number): Int32Array {
    const edges = new Int32Array(outputLength + 1);
    for (let i = 0; i <= outputLength; i++) {
        edges[i] = Math.floor((i * uprightLength) / outputLength);
    }
    return edges;
}

/**
 * The source rectangle `[x0, x1) x [y0, y1)` behind one output pixel, written into `rect`. `columns` and `rows` are the
 * box edges in upright coordinates; rotation maps an upright pixel `(ux, uy)` back to the stored frame:
 * 90 -> `(uy, H-1-ux)`, 180 -> `(W-1-ux, H-1-uy)`, 270 -> `(W-1-uy, ux)`.
 */
function sourceRect(
    rotation: VideoRotationDegrees,
    planes: I420Planes,
    columns: Int32Array,
    rows: Int32Array,
    outX: number,
    outY: number,
    rect: Int32Array,
): void {
    const c0 = columns[outX];
    const c1 = columns[outX + 1];
    const r0 = rows[outY];
    const r1 = rows[outY + 1];
    const w = planes.Width;
    const h = planes.Height;
    switch (rotation) {
        case 90:
            rect[0] = r0; rect[1] = r1; rect[2] = h - c1; rect[3] = h - c0;
            return;
        case 180:
            rect[0] = w - c1; rect[1] = w - c0; rect[2] = h - r1; rect[3] = h - r0;
            return;
        case 270:
            rect[0] = w - r1; rect[1] = w - r0; rect[2] = c0; rect[3] = c1;
            return;
        default:
            rect[0] = c0; rect[1] = c1; rect[2] = r0; rect[3] = r1;
    }
}

/** Mean of a rectangle `[x0, x1) x [y0, y1)` of one plane. */
function planeMean(plane: Uint8Array, stride: number, x0: number, x1: number, y0: number, y1: number): number {
    let sum = 0;
    for (let y = y0; y < y1; y++) {
        const row = y * stride;
        for (let x = x0; x < x1; x++) {
            sum += plane[row + x];
        }
    }
    return sum / ((x1 - x0) * (y1 - y0));
}

/** Rounds and clamps a channel value to a byte. */
function toByte(value: number): number {
    return value <= 0 ? 0 : value >= 255 ? 255 : Math.round(value);
}

/**
 * Writes one RGBA pixel from Y'CbCr. BT.601, limited range: what WebRTC's I420 carries for cameras and screens.
 * VERIFY against @livekit/rtc-node: the decoder's color matrix and range.
 */
function writeRgba(out: Uint8Array, index: number, luma: number, cb: number, cr: number): void {
    const y = 1.164383 * (luma - 16);
    const u = cb - 128;
    const v = cr - 128;
    out[index] = toByte(y + 1.596027 * v);
    out[index + 1] = toByte(y - 0.391762 * u - 0.812968 * v);
    out[index + 2] = toByte(y + 2.017232 * u);
    out[index + 3] = 255;
}

/** Averages the source rectangle in `rect` (luma, and the chroma samples that cover it) into one RGBA pixel. */
function writeBoxPixel(planes: I420Planes, rect: Int32Array, out: Uint8Array, index: number): void {
    const [x0, x1, y0, y1] = rect;
    const luma = planeMean(planes.Luma, planes.Width, x0, x1, y0, y1);
    const cx0 = x0 >> 1;
    const cx1 = ((x1 - 1) >> 1) + 1;
    const cy0 = y0 >> 1;
    const cy1 = ((y1 - 1) >> 1) + 1;
    const cb = planeMean(planes.ChromaU, planes.ChromaWidth, cx0, cx1, cy0, cy1);
    const cr = planeMean(planes.ChromaV, planes.ChromaWidth, cx0, cx1, cy0, cy1);
    writeRgba(out, index, luma, cb, cr);
}

/**
 * Converts I420 planes to RGBA in one pass: each output pixel averages the box of source pixels it covers (a box
 * filter), read through the rotation, so scaling, rotation and color conversion happen together. The target must
 * be no larger than the upright source.
 */
export function ConvertI420ToRgba(planes: I420Planes, rotation: VideoRotationDegrees, target: RgbaTarget): void {
    const upright = OrientedVideoFrameSize(planes.Width, planes.Height, rotation);
    const columns = boxEdges(upright.Width, target.Width);
    const rows = boxEdges(upright.Height, target.Height);
    const rect = new Int32Array(4);
    for (let outY = 0; outY < target.Height; outY++) {
        for (let outX = 0; outX < target.Width; outX++) {
            sourceRect(rotation, planes, columns, rows, outX, outY, rect);
            writeBoxPixel(planes, rect, target.Data, (outY * target.Width + outX) * 4);
        }
    }
}

/** Encodes RGBA pixels as a JPEG (alpha is ignored). Quality is clamped to 1-100. */
export function EncodeRgbaAsJpeg(rgba: Uint8Array, width: number, height: number, quality: number): ArrayBuffer {
    const clamped = Math.min(100, Math.max(1, Math.round(quality)));
    const encoded = jpeg.encode({ data: rgba, width, height }, clamped);
    return StandaloneArrayBuffer(encoded.data);
}

/**
 * Encodes the frames of ONE source. Keeps one RGBA scratch buffer and reuses it for every frame of that source, so a
 * sampled frame allocates only its JPEG.
 */
export class VideoFrameEncoder {
    private readonly i420Type: number;
    private scratch = new Uint8Array(0);

    /** @param i420Type The SDK's `VideoBufferType.I420` value. */
    constructor(i420Type: number) {
        this.i420Type = i420Type;
    }

    /**
     * Encodes one frame: converts it to I420 when it is in another buffer type, then scales, rotates and encodes it.
     * Throws when the frame is empty or its buffer is shorter than its size implies.
     */
    public Encode(frame: RtcVideoFrame, options: VideoFrameEncodeOptions): EncodedVideoFrame {
        const i420 = frame.type === this.i420Type ? frame : frame.convert(this.i420Type);
        const planes = I420PlanesOf(i420.data, i420.width, i420.height);
        const size = EncodedVideoFrameSize(i420.width, i420.height, options.RotationDegrees, options.MaxDimension);
        const rgba = this.scratchFor(size.Width * size.Height * 4);
        ConvertI420ToRgba(planes, options.RotationDegrees, { Data: rgba, Width: size.Width, Height: size.Height });
        return {
            Data: EncodeRgbaAsJpeg(rgba, size.Width, size.Height, options.Quality),
            Width: size.Width,
            Height: size.Height,
        };
    }

    /** A view of exactly `byteLength` bytes of the scratch buffer, growing it when a frame is larger than any before. */
    private scratchFor(byteLength: number): Uint8Array {
        if (this.scratch.byteLength < byteLength) {
            this.scratch = new Uint8Array(byteLength);
        }
        return this.scratch.subarray(0, byteLength);
    }
}
