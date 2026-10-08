/**
 * @fileoverview The pixel work of encoding one video frame: I420 planes to RGBA (box downscale and rotation in one
 * pass), then `jpeg-js`. Pure functions over buffers.
 *
 * The encode worker (`video-encode-worker.ts`) loads this module, so it imports nothing but `jpeg-js`: no
 * `@memberjunction/*` package and no `@livekit/rtc-node`. The size a frame is encoded at is decided by the caller, on the
 * thread that hosts the room (`EncodedVideoFrameSize` in `video-frame-encoder.ts`).
 *
 * Every assumption about the SDK's frame layout carries a `VERIFY against @livekit/rtc-node` note.
 *
 * @module @memberjunction/ai-bridge-livekit-native
 * @author MemberJunction.com
 */

import jpeg from 'jpeg-js';

/** How far a frame must be turned clockwise to stand upright, in degrees. */
export type VideoRotationDegrees = 0 | 90 | 180 | 270;

/** A frame's size in pixels (the shape of `RealtimeVideoFrameSize` in `@memberjunction/ai`, which this module does not import). */
export interface VideoFrameSize {
    /** Width in pixels. */
    Width: number;
    /** Height in pixels. */
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
export function OrientedVideoFrameSize(width: number, height: number, rotation: VideoRotationDegrees): VideoFrameSize {
    return rotation === 90 || rotation === 270 ? { Width: height, Height: width } : { Width: width, Height: height };
}

/**
 * Returns `bytes` as an `ArrayBuffer` holding exactly those bytes. Hands back the backing buffer when the view covers
 * all of it, and copies otherwise (Node's `Buffer` pool shares one slab between small buffers; transferring that slab
 * to another thread would detach every other buffer on it).
 *
 * Only for buffers this thread made (a JPEG): an SDK frame covers all of its buffer, so it comes back unchanged, and Node
 * refuses to transfer it (`DataCloneError`). Copy a frame with {@link CopyI420Planes}.
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
 * Copies a frame's I420 planes into a new buffer this thread owns, so it can be transferred to another thread (the
 * SDK's own frame buffer cannot be). Copies at most {@link I420ByteLength} bytes; a shorter buffer is copied whole, and
 * {@link I420PlanesOf} rejects it where it is encoded.
 */
export function CopyI420Planes(data: Uint8Array, width: number, height: number): ArrayBuffer {
    const length = Math.min(data.byteLength, I420ByteLength(width, height));
    const copy = new Uint8Array(length);
    copy.set(data.subarray(0, length));
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
 * One RGBA buffer reused from frame to frame, so a sampled frame allocates only its JPEG. Each encode takes a view of
 * exactly its own size and writes every pixel of it, so nothing of an earlier frame survives into a later one.
 */
export class RgbaScratch {
    private buffer = new Uint8Array(0);

    /** A view of exactly `byteLength` bytes, growing the buffer when a frame is larger than any before. */
    public View(byteLength: number): Uint8Array {
        if (this.buffer.byteLength < byteLength) {
            this.buffer = new Uint8Array(byteLength);
        }
        return this.buffer.subarray(0, byteLength);
    }
}

/** Throws unless `size` is whole pixels, at least 1 on each side, and no larger than the upright frame. */
function assertTargetFits(planes: I420Planes, rotation: VideoRotationDegrees, size: VideoFrameSize): void {
    const upright = OrientedVideoFrameSize(planes.Width, planes.Height, rotation);
    const whole = Number.isInteger(size.Width) && Number.isInteger(size.Height) && size.Width >= 1 && size.Height >= 1;
    if (!whole || size.Width > upright.Width || size.Height > upright.Height) {
        throw new Error(`cannot encode a ${upright.Width}x${upright.Height} upright frame at ${size.Width}x${size.Height}: the target must be at least 1x1 and no larger`);
    }
}

/**
 * Scales, rotates and encodes one frame's planes as a JPEG of `size` (which the caller computed, never larger than the
 * upright frame). Throws when `size` does not fit.
 */
export function EncodeI420AsJpeg(
    planes: I420Planes,
    rotation: VideoRotationDegrees,
    size: VideoFrameSize,
    quality: number,
    scratch: RgbaScratch,
): ArrayBuffer {
    assertTargetFits(planes, rotation, size);
    const rgba = scratch.View(size.Width * size.Height * 4);
    ConvertI420ToRgba(planes, rotation, { Data: rgba, Width: size.Width, Height: size.Height });
    return EncodeRgbaAsJpeg(rgba, size.Width, size.Height, quality);
}
