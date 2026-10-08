/**
 * Tests for the frame encoder: I420 → RGBA with box downscaling and rotation in one pass, then JPEG. Colors are
 * checked exactly on the RGBA pass and within a tolerance after a JPEG round trip (`jpeg-js` decodes the output).
 */
import { describe, it, expect, vi } from 'vitest';
import jpeg from 'jpeg-js';
import {
    ConvertI420ToRgba,
    EncodedVideoFrameSize,
    I420ByteLength,
    I420PlanesOf,
    OrientedVideoFrameSize,
    StandaloneArrayBuffer,
    VideoFrameEncoder,
    type VideoRotationDegrees,
} from '../video-frame-encoder';
import type { RtcVideoFrame } from '../livekit-rtc-node-room';
import { i420Frame, VIDEO_BUFFER_TYPE } from './fake-rtc-node';

/** BT.601 limited-range Y'CbCr of three colors, and what they convert to. */
const RED = { y: 81, u: 90, v: 240 };
const BLUE = { y: 41, u: 240, v: 110 };
const GRAY = { y: 126, u: 128, v: 128 };
type Rgb = [number, number, number];
const RED_RGB: Rgb = [254, 0, 0];
const BLUE_RGB: Rgb = [0, 0, 255];
const GRAY_RGB: Rgb = [128, 128, 128];

/** An I420 frame whose left half is one color and right half another (width a multiple of 4, so chroma splits too). */
function twoColorFrame(width: number, height: number, left: typeof RED, right: typeof RED): RtcVideoFrame {
    const frame = i420Frame(width, height, left);
    const chromaWidth = width / 2;
    const chromaHeight = Math.ceil(height / 2);
    const lumaLength = width * height;
    const chromaLength = chromaWidth * chromaHeight;
    for (let y = 0; y < height; y++) {
        frame.data.fill(right.y, y * width + width / 2, (y + 1) * width);
    }
    for (let y = 0; y < chromaHeight; y++) {
        const row = y * chromaWidth;
        frame.data.fill(right.u, lumaLength + row + chromaWidth / 2, lumaLength + row + chromaWidth);
        frame.data.fill(right.v, lumaLength + chromaLength + row + chromaWidth / 2, lumaLength + chromaLength + row + chromaWidth);
    }
    return frame;
}

/** Runs the RGBA pass alone and returns its pixels. */
function toRgba(frame: RtcVideoFrame, rotation: VideoRotationDegrees, maxDimension: number): { rgba: Uint8Array; width: number; height: number } {
    const size = EncodedVideoFrameSize(frame.width, frame.height, rotation, maxDimension);
    const rgba = new Uint8Array(size.Width * size.Height * 4);
    ConvertI420ToRgba(I420PlanesOf(frame.data, frame.width, frame.height), rotation, { Data: rgba, Width: size.Width, Height: size.Height });
    return { rgba, width: size.Width, height: size.Height };
}

function pixelAt(rgba: Uint8Array, width: number, x: number, y: number): Rgb {
    const i = (y * width + x) * 4;
    return [rgba[i], rgba[i + 1], rgba[i + 2]];
}

function expectNear(actual: Rgb, expected: Rgb, tolerance: number): void {
    for (let c = 0; c < 3; c++) {
        expect(Math.abs(actual[c] - expected[c])).toBeLessThanOrEqual(tolerance);
    }
}

/** Encodes with a fresh encoder and decodes the JPEG back. */
function roundTrip(frame: RtcVideoFrame, rotation: VideoRotationDegrees = 0, maxDimension = 640, quality = 90) {
    const encoded = new VideoFrameEncoder(VIDEO_BUFFER_TYPE.I420).Encode(frame, { RotationDegrees: rotation, MaxDimension: maxDimension, Quality: quality });
    const decoded = jpeg.decode(new Uint8Array(encoded.Data), { useTArray: true });
    return { encoded, decoded };
}

describe('frame math', () => {
    it('I420ByteLength counts a full luma plane and two quarter chroma planes, rounding odd sides up', () => {
        expect(I420ByteLength(4, 2)).toBe(8 + 2 * 2 * 1);
        expect(I420ByteLength(7, 5)).toBe(35 + 2 * 4 * 3);
        expect(I420ByteLength(1280, 720)).toBe(1_382_400);
    });

    it('rotation by 90 or 270 swaps width and height; 0 and 180 keep them', () => {
        expect(OrientedVideoFrameSize(64, 48, 0)).toEqual({ Width: 64, Height: 48 });
        expect(OrientedVideoFrameSize(64, 48, 90)).toEqual({ Width: 48, Height: 64 });
        expect(OrientedVideoFrameSize(64, 48, 180)).toEqual({ Width: 64, Height: 48 });
        expect(OrientedVideoFrameSize(64, 48, 270)).toEqual({ Width: 48, Height: 64 });
    });

    it('caps the longer side after rotation, and never enlarges', () => {
        expect(EncodedVideoFrameSize(1920, 1080, 0, 640)).toEqual({ Width: 640, Height: 360 });
        expect(EncodedVideoFrameSize(1920, 1080, 0, 1280)).toEqual({ Width: 1280, Height: 720 });
        expect(EncodedVideoFrameSize(1280, 720, 90, 640)).toEqual({ Width: 360, Height: 640 });
        expect(EncodedVideoFrameSize(320, 240, 0, 640)).toEqual({ Width: 320, Height: 240 });
        expect(EncodedVideoFrameSize(641, 361, 0, 640)).toEqual({ Width: 640, Height: 360 });
    });

    it('StandaloneArrayBuffer hands back a buffer it covers, and copies a view into a larger one', () => {
        const whole = new Uint8Array([1, 2, 3]);
        expect(StandaloneArrayBuffer(whole)).toBe(whole.buffer);

        const slab = new Uint8Array([9, 9, 1, 2, 3, 9]);
        const out = StandaloneArrayBuffer(slab.subarray(2, 5));
        expect(out.byteLength).toBe(3);
        expect(Array.from(new Uint8Array(out))).toEqual([1, 2, 3]);
        expect(out).not.toBe(slab.buffer);
    });

    it('I420PlanesOf rejects an empty frame and a buffer shorter than the size implies', () => {
        expect(() => I420PlanesOf(new Uint8Array(0), 0, 0)).toThrow(/no pixels/);
        expect(() => I420PlanesOf(new Uint8Array(10), 4, 4)).toThrow(/expected 24/);
    });
});

describe('ConvertI420ToRgba', () => {
    it('converts BT.601 limited-range colors', () => {
        expectNear(pixelAt(toRgba(i420Frame(4, 4, RED), 0, 640).rgba, 4, 1, 1), RED_RGB, 1);
        expectNear(pixelAt(toRgba(i420Frame(4, 4, BLUE), 0, 640).rgba, 4, 2, 3), BLUE_RGB, 1);
        expectNear(pixelAt(toRgba(i420Frame(4, 4, GRAY), 0, 640).rgba, 4, 0, 0), GRAY_RGB, 1);
    });

    it('box-filters when it downscales: each output pixel averages the pixels it covers', () => {
        const frame = twoColorFrame(4, 2, { y: 16, u: 128, v: 128 }, { y: 235, u: 128, v: 128 }); // black | white
        const halved = toRgba(frame, 0, 2);
        expect([halved.width, halved.height]).toEqual([2, 1]);
        expectNear(pixelAt(halved.rgba, 2, 0, 0), [0, 0, 0], 1);
        expectNear(pixelAt(halved.rgba, 2, 1, 0), [255, 255, 255], 1);

        const single = toRgba(frame, 0, 1);
        expect([single.width, single.height]).toEqual([1, 1]);
        expectNear(pixelAt(single.rgba, 1, 0, 0), [128, 128, 128], 2); // the mean, not a sample of either side
    });

    it('turns the picture by the rotation (clockwise): red left / blue right', () => {
        const frame = twoColorFrame(4, 2, RED, BLUE);

        const upright = toRgba(frame, 0, 640);
        expect([upright.width, upright.height]).toEqual([4, 2]);
        expectNear(pixelAt(upright.rgba, 4, 0, 0), RED_RGB, 1);
        expectNear(pixelAt(upright.rgba, 4, 3, 1), BLUE_RGB, 1);

        const quarter = toRgba(frame, 90, 640); // the left edge becomes the top
        expect([quarter.width, quarter.height]).toEqual([2, 4]);
        expectNear(pixelAt(quarter.rgba, 2, 0, 0), RED_RGB, 1);
        expectNear(pixelAt(quarter.rgba, 2, 1, 1), RED_RGB, 1);
        expectNear(pixelAt(quarter.rgba, 2, 0, 3), BLUE_RGB, 1);

        const half = toRgba(frame, 180, 640);
        expectNear(pixelAt(half.rgba, 4, 0, 0), BLUE_RGB, 1);
        expectNear(pixelAt(half.rgba, 4, 3, 1), RED_RGB, 1);

        const threeQuarter = toRgba(frame, 270, 640); // the left edge becomes the bottom
        expect([threeQuarter.width, threeQuarter.height]).toEqual([2, 4]);
        expectNear(pixelAt(threeQuarter.rgba, 2, 0, 0), BLUE_RGB, 1);
        expectNear(pixelAt(threeQuarter.rgba, 2, 1, 3), RED_RGB, 1);
    });
});

describe('VideoFrameEncoder', () => {
    it('a solid-color frame decodes to that color', () => {
        const { encoded, decoded } = roundTrip(i420Frame(64, 48, RED));
        expect([encoded.Width, encoded.Height]).toEqual([64, 48]);
        expect([decoded.width, decoded.height]).toEqual([64, 48]);
        expectNear(pixelAt(decoded.data, 64, 32, 24), RED_RGB, 12);
        expectNear(pixelAt(roundTrip(i420Frame(64, 48, GRAY)).decoded.data, 64, 5, 5), GRAY_RGB, 6);
    });

    it('scales down to the cap and never enlarges', () => {
        const scaled = roundTrip(i420Frame(320, 180, GRAY), 0, 160);
        expect([scaled.encoded.Width, scaled.encoded.Height]).toEqual([160, 90]);
        expect([scaled.decoded.width, scaled.decoded.height]).toEqual([160, 90]);

        const small = roundTrip(i420Frame(120, 90, GRAY), 0, 640);
        expect([small.encoded.Width, small.encoded.Height]).toEqual([120, 90]);
    });

    it('a 90 degree rotation swaps width and height and turns the picture', () => {
        const { encoded, decoded } = roundTrip(twoColorFrame(64, 32, RED, BLUE), 90);
        expect([encoded.Width, encoded.Height]).toEqual([32, 64]);
        expect([decoded.width, decoded.height]).toEqual([32, 64]);
        expectNear(pixelAt(decoded.data, 32, 16, 8), RED_RGB, 16);
        expectNear(pixelAt(decoded.data, 32, 16, 56), BLUE_RGB, 16);
    });

    it('handles odd sizes, with and without rotation or scaling', () => {
        const odd = roundTrip(i420Frame(7, 5, RED));
        expect([odd.decoded.width, odd.decoded.height]).toEqual([7, 5]);
        expectNear(pixelAt(odd.decoded.data, 7, 3, 2), RED_RGB, 16);

        expect(roundTrip(i420Frame(7, 5, RED), 90).encoded).toMatchObject({ Width: 5, Height: 7 });
        expect(roundTrip(i420Frame(641, 361, GRAY), 0, 640).encoded).toMatchObject({ Width: 640, Height: 360 });
    });

    it('converts a frame in another buffer type to I420 first', () => {
        const converted = i420Frame(16, 8, BLUE);
        const convert = vi.fn(() => converted);
        const rgbaFrame: RtcVideoFrame = { data: new Uint8Array(16 * 8 * 4), width: 16, height: 8, type: VIDEO_BUFFER_TYPE.RGBA, convert };

        const { decoded } = roundTrip(rgbaFrame);
        expect(convert).toHaveBeenCalledWith(VIDEO_BUFFER_TYPE.I420);
        expectNear(pixelAt(decoded.data, 16, 8, 4), BLUE_RGB, 16);
    });

    it('does not convert a frame that is already I420', () => {
        const frame = i420Frame(8, 8, GRAY);
        expect(() => roundTrip(frame)).not.toThrow(); // the fake's convert throws if called
    });

    it('returns a standalone JPEG buffer: SOI first, EOI last, nothing else around it', () => {
        const { encoded } = roundTrip(i420Frame(8, 8, GRAY));
        const bytes = new Uint8Array(encoded.Data);
        expect([bytes[0], bytes[1]]).toEqual([0xff, 0xd8]);
        expect([bytes[bytes.length - 2], bytes[bytes.length - 1]]).toEqual([0xff, 0xd9]);
    });

    it('reuses its scratch buffer: a smaller frame after a larger one still encodes right', () => {
        const encoder = new VideoFrameEncoder(VIDEO_BUFFER_TYPE.I420);
        const options = { RotationDegrees: 0 as const, MaxDimension: 640, Quality: 90 };
        encoder.Encode(i420Frame(64, 48, RED), options);
        const second = encoder.Encode(i420Frame(16, 8, BLUE), options);
        const decoded = jpeg.decode(new Uint8Array(second.Data), { useTArray: true });
        expect([decoded.width, decoded.height]).toEqual([16, 8]);
        expectNear(pixelAt(decoded.data, 16, 8, 4), BLUE_RGB, 16);
    });

    it('throws on a frame whose buffer is too short (the watcher logs and skips it)', () => {
        const short: RtcVideoFrame = { ...i420Frame(8, 8), data: new Uint8Array(10) };
        expect(() => new VideoFrameEncoder(VIDEO_BUFFER_TYPE.I420).Encode(short, { RotationDegrees: 0, MaxDimension: 640, Quality: 80 })).toThrow();
    });
});
