/**
 * Tests for the encode worker's handler, run in-process (the worker entry is only thread wiring around it): the size,
 * rotation and quality a request names are honored, a bad request becomes a `failed` reply, and the JPEG it lists for
 * transfer is a standalone buffer. `jpeg-js` decodes the output.
 */
import { describe, it, expect } from 'vitest';
import { MessageChannel } from 'node:worker_threads';
import jpeg from 'jpeg-js';
import { HandleVideoEncodeRequest, type HandledVideoEncodeRequest } from '../video-encode-handler';
import type { VideoEncodeEncodedReply, VideoEncodeRequest } from '../video-encode-protocol';
import { CopyI420Planes, RgbaScratch } from '../video-frame-pixels';
import type { RtcVideoFrame } from '../livekit-rtc-node-room';
import { i420Frame, twoColorFrame } from './fake-rtc-node';

const RED = { y: 81, u: 90, v: 240 };
const BLUE = { y: 41, u: 240, v: 110 };

/** A request for `frame` at its own size, overridable. */
function requestFor(frame: RtcVideoFrame, overrides: Partial<VideoEncodeRequest> = {}): VideoEncodeRequest {
    return {
        Kind: 'encode',
        RequestID: 7,
        Planes: CopyI420Planes(frame.data, frame.width, frame.height),
        Width: frame.width,
        Height: frame.height,
        RotationDegrees: 0,
        OutWidth: frame.width,
        OutHeight: frame.height,
        Quality: 80,
        ...overrides,
    };
}

function encodedReply(handled: HandledVideoEncodeRequest): VideoEncodeEncodedReply {
    if (handled.Reply.Kind !== 'encoded') {
        throw new Error(`expected an encoded reply, got ${handled.Reply.Kind}: ${handled.Reply.Error}`);
    }
    return handled.Reply;
}

function decode(data: ArrayBuffer): { width: number; height: number; data: Uint8Array } {
    return jpeg.decode(new Uint8Array(data), { useTArray: true });
}

function pixelAt(rgba: Uint8Array, width: number, x: number, y: number): [number, number, number] {
    const i = (y * width + x) * 4;
    return [rgba[i], rgba[i + 1], rgba[i + 2]];
}

/** A frame whose luma is noise, so JPEG quality changes the output size. */
function noisyFrame(width: number, height: number): RtcVideoFrame {
    const frame = i420Frame(width, height);
    let seed = 12345;
    for (let i = 0; i < width * height; i++) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        frame.data[i] = 16 + (seed % 220);
    }
    return frame;
}

describe('HandleVideoEncodeRequest', () => {
    it('encodes at the size the request names, lists the JPEG for transfer, and times the encode on its own clock', () => {
        const ticks = [10, 25];
        const handled = HandleVideoEncodeRequest(requestFor(i420Frame(320, 180), { OutWidth: 160, OutHeight: 90 }), new RgbaScratch(), () => ticks.shift() ?? 0);
        const reply = encodedReply(handled);
        expect(reply).toMatchObject({ Kind: 'encoded', RequestID: 7, Width: 160, Height: 90, EncodeMs: 15 });
        expect(handled.Transfer).toEqual([reply.Jpeg]);
        expect(handled.Transfer[0]).toBe(reply.Jpeg);
        const decoded = decode(reply.Jpeg);
        expect([decoded.width, decoded.height]).toEqual([160, 90]);
    });

    it('applies the rotation: red left / blue right turned 90 degrees puts red on top', () => {
        const frame = twoColorFrame(64, 32, RED, BLUE);
        const reply = encodedReply(HandleVideoEncodeRequest(requestFor(frame, { RotationDegrees: 90, OutWidth: 32, OutHeight: 64, Quality: 90 }), new RgbaScratch()));
        const decoded = decode(reply.Jpeg);
        expect([decoded.width, decoded.height]).toEqual([32, 64]);
        const top = pixelAt(decoded.data, 32, 16, 8);
        const bottom = pixelAt(decoded.data, 32, 16, 56);
        expect(top[0]).toBeGreaterThan(200); // red
        expect(top[2]).toBeLessThan(60);
        expect(bottom[2]).toBeGreaterThan(200); // blue
        expect(bottom[0]).toBeLessThan(60);
    });

    it('honors the quality: a noisy frame encodes smaller at 10 than at 95', () => {
        const frame = noisyFrame(64, 64);
        const low = encodedReply(HandleVideoEncodeRequest(requestFor(frame, { Quality: 10 }), new RgbaScratch()));
        const high = encodedReply(HandleVideoEncodeRequest(requestFor(frame, { Quality: 95 }), new RgbaScratch()));
        expect(low.Jpeg.byteLength).toBeLessThan(high.Jpeg.byteLength);
    });

    it.each([
        ['planes shorter than the frame', { Planes: new ArrayBuffer(10) }, /has 10 bytes; expected 4608/],
        ['a frame with no pixels', { Width: 0, Height: 0 }, /no pixels/],
        ['a target wider than the upright frame', { OutWidth: 65 }, /no larger/],
        ['a target of zero pixels', { OutWidth: 0, OutHeight: 0 }, /at least 1x1/],
        ['a target that is not whole pixels', { OutWidth: 31.5 }, /at least 1x1/],
    ])('answers %s with a failed reply (it does not throw)', (_label, overrides, error) => {
        const handled = HandleVideoEncodeRequest(requestFor(i420Frame(64, 48), overrides), new RgbaScratch());
        expect(handled.Reply).toMatchObject({ Kind: 'failed', RequestID: 7 });
        expect(handled.Reply.Kind === 'failed' && handled.Reply.Error).toMatch(error);
        expect(handled.Transfer).toEqual([]);
    });

    it('a target larger than the upright frame fails even when it fits the stored one (rotation swaps the sides)', () => {
        const handled = HandleVideoEncodeRequest(requestFor(i420Frame(64, 48), { RotationDegrees: 90, OutWidth: 64, OutHeight: 48 }), new RgbaScratch());
        expect(handled.Reply.Kind).toBe('failed');
    });

    it('lists a small JPEG as a standalone buffer: transferring it detaches nothing else', () => {
        const handled = HandleVideoEncodeRequest(requestFor(i420Frame(8, 8)), new RgbaScratch());
        const reply = encodedReply(handled);
        const bytes = new Uint8Array(reply.Jpeg);
        expect(reply.Jpeg.byteLength).toBeLessThan(1024); // small enough that jpeg-js puts it on Node's shared Buffer pool
        expect([bytes[0], bytes[1]]).toEqual([0xff, 0xd8]);
        expect([bytes[bytes.length - 2], bytes[bytes.length - 1]]).toEqual([0xff, 0xd9]);

        const neighbour = Buffer.from('still here'); // another small Buffer, from the same pool
        const { port1, port2 } = new MessageChannel();
        port1.postMessage(reply.Jpeg, [...handled.Transfer]);
        port1.close();
        port2.close();
        expect(reply.Jpeg.byteLength).toBe(0); // moved
        expect(neighbour.toString()).toBe('still here');
    });

    it('reuses its scratch across requests: a smaller frame after a larger one encodes right', () => {
        const scratch = new RgbaScratch();
        encodedReply(HandleVideoEncodeRequest(requestFor(i420Frame(64, 48, RED)), scratch));
        const second = encodedReply(HandleVideoEncodeRequest(requestFor(i420Frame(16, 8, BLUE), { Quality: 90 }), scratch));
        const decoded = decode(second.Jpeg);
        expect([decoded.width, decoded.height]).toEqual([16, 8]);
        const pixel = pixelAt(decoded.data, 16, 8, 4);
        expect(pixel[2]).toBeGreaterThan(200);
        expect(pixel[0]).toBeLessThan(60);
    });
});
