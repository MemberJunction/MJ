import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { ReadFmp4Init, type Fmp4Init } from '../generic/fmp4Reader';
import { Fmp4PieceToVideoFrame, type RealtimeFmp4VideoFrame } from '../generic/realtimeVideoOutput';

const HERE = dirname(fileURLToPath(import.meta.url));

// ── Box builders ───────────────────────────────────────────────────────────────

function concat(...parts: Uint8Array[]): Uint8Array {
    const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
    let offset = 0;
    for (const part of parts) {
        out.set(part, offset);
        offset += part.length;
    }
    return out;
}

function u16(value: number): Uint8Array {
    return Uint8Array.of(value >> 8, value & 0xff);
}

function u32(value: number): Uint8Array {
    const out = new Uint8Array(4);
    new DataView(out.buffer).setUint32(0, value >>> 0);
    return out;
}

const ascii = (text: string): Uint8Array => Uint8Array.from(text, (c) => c.charCodeAt(0));

function box(type: string, ...payload: Uint8Array[]): Uint8Array {
    const body = concat(...payload);
    return concat(u32(8 + body.length), ascii(type), body);
}

function fullBox(type: string, flags: number, ...payload: Uint8Array[]): Uint8Array {
    return box(type, u32(flags & 0xff_ffff), ...payload);
}

const buffer = (bytes: Uint8Array): ArrayBuffer => bytes.slice().buffer;

/** A track: `tkhd`, `mdhd` with `timescale`, `hdlr`, and one sample entry. */
function trak(id: number, handler: string, timescale: number, entry: Uint8Array): Uint8Array {
    const tkhd = fullBox('tkhd', 0, new Uint8Array(8), u32(id), new Uint8Array(68));
    const mdhd = fullBox('mdhd', 0, new Uint8Array(8), u32(timescale), new Uint8Array(8));
    const hdlr = fullBox('hdlr', 0, u32(0), ascii(handler), new Uint8Array(13));
    return box('trak', tkhd, box('mdia', mdhd, hdlr, box('minf', box('stbl', fullBox('stsd', 0, u32(1), entry)))));
}

/** An H.264 sample entry of `width` x `height`: 78 bytes of visual fields (the size at 24), then `avcC`. */
function avc1(width: number, height: number): Uint8Array {
    return box('avc1', new Uint8Array(6), u16(1), new Uint8Array(16), u16(width), u16(height), new Uint8Array(50), box('avcC', Uint8Array.of(1, 0x42, 0xc0, 0x1f, 0xff, 0xe0, 0)));
}

/** An init segment with an audio track (2, 24 kHz) listed BEFORE its 640x360 video track (1, 90 kHz). */
function audioFirstInit(): ArrayBuffer {
    const audio = trak(2, 'soun', 24000, box('mp4a', new Uint8Array(28)));
    const video = trak(1, 'vide', 90000, avc1(640, 360));
    return buffer(concat(box('ftyp', ascii('iso5'), u32(512)), box('moov', audio, video)));
}

/** What such an init declares, read: video track 1 at 90 kHz, audio track 2 at 24 kHz. */
const INIT: Fmp4Init = {
    Tracks: [
        { TrackID: 2, Handler: 'soun', Timescale: 24000 },
        { TrackID: 1, Handler: 'vide', Timescale: 90000 },
    ],
};

const NON_SYNC = 0x1_0000;

interface TrafSample {
    Track: number;
    DecodeTime: number;
    /** Composition offset; written only when given. */
    Cto?: number;
    /** Sample flags; written only when given (absent reads as a sync sample). */
    Flags?: number;
}

/** A track fragment with one 3-byte sample of 3000 ticks: tfhd (base is the moof, default size), tfdt, and a trun. */
function traf(sample: TrafSample, dataOffset: number): Uint8Array {
    const tfhd = fullBox('tfhd', 0x2_0018, u32(sample.Track), u32(3000), u32(3));
    const tfdt = fullBox('tfdt', 0, u32(sample.DecodeTime));
    const flags = 0x1 | (sample.Flags !== undefined ? 0x400 : 0) | (sample.Cto !== undefined ? 0x800 : 0);
    const record = [sample.Flags, sample.Cto].filter((value): value is number => value !== undefined).map(u32);
    return box('traf', tfhd, tfdt, fullBox('trun', flags, u32(1), u32(dataOffset), ...record));
}

/** A `moof` + `mdat` whose track fragments come in the given order, each sample's data in the `mdat`. */
function fragment(...samples: TrafSample[]): ArrayBuffer {
    const moofOf = (dataStart: number): Uint8Array => box('moof', ...samples.map((sample, i) => traf(sample, dataStart + i * 3)));
    const moofLength = moofOf(0).length;
    return buffer(concat(moofOf(moofLength + 8), box('mdat', new Uint8Array(3 * samples.length))));
}

/** A committed fixture split into its init segment and its `moof` + `mdat` fragments. */
function fixturePieces(name: string): ArrayBuffer[] {
    const file = new Uint8Array(readFileSync(resolve(HERE, 'fixtures', name)));
    const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
    const boxes: Uint8Array[] = [];
    for (let offset = 0; offset < file.length; offset += view.getUint32(offset)) {
        boxes.push(file.subarray(offset, offset + view.getUint32(offset)));
    }
    const pieces = [buffer(concat(boxes[0], boxes[1]))];
    for (let i = 2; i + 1 < boxes.length && ascii('moof').every((c, j) => boxes[i][4 + j] === c); i += 2) {
        pieces.push(buffer(concat(boxes[i], boxes[i + 1])));
    }
    return pieces;
}

/** The frames a stream's pieces make, each fragment timed by the latest init before it, as a driver builds them. */
function framesOf(pieces: ArrayBuffer[], mimeType?: string): RealtimeFmp4VideoFrame[] {
    let init: Fmp4Init | null = null;
    return pieces.map((piece) => {
        const frame = Fmp4PieceToVideoFrame(piece, mimeType, init);
        if (!frame) {
            throw new Error('A fixture piece made no frame.');
        }
        init = frame.Piece === 'init' ? ReadFmp4Init(piece) : init;
        return frame;
    });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('Fmp4PieceToVideoFrame', () => {
    describe('on the committed avatar stand-in (video at 12288 Hz, 704x1280, a key frame every 24 frames)', () => {
        const videoOnly = framesOf(fixturePieces('avatar-standin-video-only.mp4'));
        const muxed = framesOf(fixturePieces('avatar-standin-muxed.mp4'), 'video/mp4');

        it('makes the init segment an init frame with the picture size and the default MIME type, untimed', () => {
            expect(videoOnly).toHaveLength(49);
            const { Data, ...init } = videoOnly[0];
            expect(init).toEqual({ Kind: 'fmp4', Piece: 'init', MimeType: 'video/mp4', Width: 704, Height: 1280 });
            expect(Data.byteLength).toBeGreaterThan(0);
        });

        it("times each fragment by its first video sample and flags the key frames: 0 ms, 41.667 ms, 1000 ms", () => {
            expect(videoOnly[1]).toMatchObject({ Kind: 'fmp4', Piece: 'fragment', MimeType: 'video/mp4', PresentationTimeMs: 0, KeyFrame: true });
            expect(videoOnly[2].PresentationTimeMs).toBeCloseTo(41.667, 3);
            expect(videoOnly[2].KeyFrame).toBe(false);
            expect(videoOnly[25]).toMatchObject({ PresentationTimeMs: 1000, KeyFrame: true });
            expect(videoOnly.slice(1).filter((frame) => frame.KeyFrame).length).toBe(2);
        });

        it("times a muxed fragment by its video sample on the video track's timescale, not by its AAC sample", () => {
            expect(muxed[2].PresentationTimeMs).toBeCloseTo(84.391, 3);
            expect(muxed[2].KeyFrame).toBe(false);
            expect(muxed[25].PresentationTimeMs).toBeCloseTo(1042.725, 3);
            expect(muxed[25].KeyFrame).toBe(true);
        });

        it('gives fragments no picture size: only an init segment declares one', () => {
            expect(videoOnly[2].Width).toBeUndefined();
            expect(videoOnly[2].Height).toBeUndefined();
        });

        it('leaves a fragment that arrives before any init untimed and unflagged, but still a fragment', () => {
            const frame = Fmp4PieceToVideoFrame(fixturePieces('avatar-standin-video-only.mp4')[25], 'video/mp4', null);
            expect(frame).toMatchObject({ Kind: 'fmp4', Piece: 'fragment' });
            expect(frame?.PresentationTimeMs).toBeUndefined();
            expect(frame?.KeyFrame).toBeUndefined();
        });
    });

    describe('on hand-built boxes', () => {
        it('adds the first video sample\'s composition offset to its decode time', () => {
            const frame = Fmp4PieceToVideoFrame(fragment({ Track: 1, DecodeTime: 9000, Cto: 3000 }), 'video/mp4', INIT);
            expect(frame?.PresentationTimeMs).toBeCloseTo(133.333, 3);
        });

        it('reads the time and the key-frame flag from the video track fragment when the audio one comes first', () => {
            const frame = Fmp4PieceToVideoFrame(fragment({ Track: 2, DecodeTime: 2400 }, { Track: 1, DecodeTime: 45000, Flags: NON_SYNC }), 'video/mp4', INIT);
            expect(frame).toMatchObject({ PresentationTimeMs: 500, KeyFrame: false });
        });

        it('leaves an audio-only fragment of a muxed stream untimed and unflagged', () => {
            const frame = Fmp4PieceToVideoFrame(fragment({ Track: 2, DecodeTime: 2400 }), 'video/mp4', INIT);
            expect(frame).toMatchObject({ Kind: 'fmp4', Piece: 'fragment' });
            expect(frame?.PresentationTimeMs).toBeUndefined();
            expect(frame?.KeyFrame).toBeUndefined();
        });

        it("takes an init's picture size from its video track, wherever the track is listed", () => {
            expect(Fmp4PieceToVideoFrame(audioFirstInit(), undefined, null)).toMatchObject({ Piece: 'init', Width: 640, Height: 360 });
        });

        it('reads a fragment that opens with styp', () => {
            const media = new Uint8Array(fragment({ Track: 1, DecodeTime: 90000 }));
            const frame = Fmp4PieceToVideoFrame(buffer(concat(box('styp', ascii('msdh')), media)), undefined, INIT);
            expect(frame).toMatchObject({ Piece: 'fragment', PresentationTimeMs: 1000, KeyFrame: true });
        });
    });

    describe('what is MP4, and its MIME type', () => {
        const mdat = buffer(box('mdat', Uint8Array.of(1, 2, 3)));
        const init = audioFirstInit();

        it('takes bytes labelled video/mp4 that open with no MP4 box (a lone mdat) as an untimed fragment', () => {
            const frame = Fmp4PieceToVideoFrame(mdat, 'video/mp4', INIT);
            expect(frame).toMatchObject({ Kind: 'fmp4', Piece: 'fragment', MimeType: 'video/mp4' });
            expect(frame?.PresentationTimeMs).toBeUndefined();
        });

        it('returns null for bytes that are neither labelled video/mp4 nor open with an MP4 box', () => {
            expect(Fmp4PieceToVideoFrame(buffer(Uint8Array.of(1, 2, 3, 4)), undefined, INIT)).toBeNull();
            expect(Fmp4PieceToVideoFrame(mdat, 'video/webm', INIT)).toBeNull();
            expect(Fmp4PieceToVideoFrame(mdat, 'video/mp4x', INIT)).toBeNull();
            expect(Fmp4PieceToVideoFrame(mdat, '', INIT)).toBeNull();
        });

        it("keeps a video/mp4 label as the provider sent it, parameters and case included, trimmed", () => {
            const codecs = 'video/mp4; codecs="avc1.42c01f, mp4a.40.2"';
            expect(Fmp4PieceToVideoFrame(init, codecs, null)?.MimeType).toBe(codecs);
            expect(Fmp4PieceToVideoFrame(init, 'VIDEO/MP4', null)?.MimeType).toBe('VIDEO/MP4');
            expect(Fmp4PieceToVideoFrame(init, ` ${codecs} `, null)?.MimeType).toBe(codecs);
        });

        it('labels MP4 bytes video/mp4 when the part names no type or another one', () => {
            expect(Fmp4PieceToVideoFrame(init, undefined, null)?.MimeType).toBe('video/mp4');
            expect(Fmp4PieceToVideoFrame(init, 'video/quicktime', null)?.MimeType).toBe('video/mp4');
        });

        it('keeps the bytes it was given, untouched', () => {
            expect(Fmp4PieceToVideoFrame(init, 'video/mp4', null)?.Data).toBe(init);
        });
    });
});
