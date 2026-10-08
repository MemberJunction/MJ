import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, it, expect } from 'vitest';
import { ReadFmp4Init, SniffFmp4Piece } from '../generic/fmp4Reader';

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

function bytes(...values: number[]): Uint8Array {
    return Uint8Array.from(values);
}

function zeros(count: number): Uint8Array {
    return new Uint8Array(count);
}

function u32(value: number): Uint8Array {
    const out = new Uint8Array(4);
    new DataView(out.buffer).setUint32(0, value);
    return out;
}

function ascii(text: string): Uint8Array {
    return Uint8Array.from(text, (c) => c.charCodeAt(0));
}

function box(type: string, ...payload: Uint8Array[]): Uint8Array {
    const body = concat(...payload);
    return concat(u32(8 + body.length), ascii(type), body);
}

function fullBox(type: string, version: number, ...payload: Uint8Array[]): Uint8Array {
    return box(type, bytes(version, 0, 0, 0), ...payload);
}

/** An MPEG-4 descriptor with a one-byte size, or the four-byte form a writer may use. */
function descriptor(tag: number, payload: Uint8Array, longSize = false): Uint8Array {
    const n = payload.length;
    const size = longSize ? bytes(0x80 | ((n >> 21) & 0x7f), 0x80 | ((n >> 14) & 0x7f), 0x80 | ((n >> 7) & 0x7f), n & 0x7f) : bytes(n);
    return concat(bytes(tag), size, payload);
}

function tkhd(trackID: number, version: 0 | 1 = 0): Uint8Array {
    return fullBox('tkhd', version, zeros(version === 1 ? 16 : 8), u32(trackID), zeros(version === 1 ? 72 : 68));
}

function hdlr(handler: string): Uint8Array {
    return fullBox('hdlr', 0, u32(0), ascii(handler), zeros(12), bytes(0));
}

/** A visual sample entry (78 bytes of fields) with an `avcC` record for the given profile, constraint flags and level. */
function avcEntry(type = 'avc1', profile = 0x42, constraints = 0xc0, level = 0x1f): Uint8Array {
    const avcC = box('avcC', bytes(1, profile, constraints, level, 0xff, 0xe1, 0, 4, 0x67, profile, constraints, level, 1, 0, 2, 0x68, 0xce));
    return box(type, zeros(6), bytes(0, 1), zeros(70), avcC);
}

interface EsdsOptions {
    ObjectType?: number;
    AudioSpecificConfig?: Uint8Array;
    EsFlags?: number;
    EsFlagFields?: Uint8Array;
    LongSizes?: boolean;
}

/** An `esds` box: ES descriptor → decoder config (object type) → decoder specific info (AudioSpecificConfig). */
function esds(options: EsdsOptions = {}): Uint8Array {
    const long = options.LongSizes ?? false;
    const specific = descriptor(0x05, options.AudioSpecificConfig ?? bytes(0x13, 0x08), long); // AAC-LC, 24 kHz, mono
    const decoderConfig = descriptor(0x04, concat(bytes(options.ObjectType ?? 0x40, 0x15), zeros(3), u32(0), u32(0), specific), long);
    const es = descriptor(0x03, concat(bytes(0, 1, options.EsFlags ?? 0), options.EsFlagFields ?? zeros(0), decoderConfig, descriptor(0x06, bytes(2))), long);
    return fullBox('esds', 0, es);
}

/** An audio sample entry (28 bytes of fields, version 0) holding the given `esds`. */
function mp4aEntry(esdsBox: Uint8Array = esds()): Uint8Array {
    return box('mp4a', zeros(6), bytes(0, 1), zeros(8), bytes(0, 1, 0, 16), zeros(4), u32(24000 * 65536), esdsBox);
}

interface TrakOptions {
    ID: number;
    Handler: string;
    Entry?: Uint8Array;
    TkhdVersion?: 0 | 1;
    Without?: 'tkhd' | 'hdlr';
}

function trak(options: TrakOptions): Uint8Array {
    const stbl = box('stbl', fullBox('stsd', 0, u32(1), options.Entry ?? zeros(0)), fullBox('stts', 0, u32(0)));
    const mdia = box('mdia', fullBox('mdhd', 0, zeros(20)), ...(options.Without === 'hdlr' ? [] : [hdlr(options.Handler)]), box('minf', stbl));
    return box('trak', ...(options.Without === 'tkhd' ? [] : [tkhd(options.ID, options.TkhdVersion ?? 0)]), mdia);
}

const FTYP = box('ftyp', ascii('iso5'), u32(512), ascii('iso5iso6mp41'));

function moov(...traks: Uint8Array[]): Uint8Array {
    return box('moov', fullBox('mvhd', 0, zeros(96)), ...traks, box('mvex', fullBox('trex', 0, zeros(20))));
}

const VIDEO_TRAK = trak({ ID: 1, Handler: 'vide', Entry: avcEntry() });
const AUDIO_TRAK = trak({ ID: 2, Handler: 'soun', Entry: mp4aEntry() });
const MUXED_INIT = concat(FTYP, moov(VIDEO_TRAK, AUDIO_TRAK));

/** A copy of `piece` with the 32-bit size of the box at `offset` replaced. */
function withBoxSize(piece: Uint8Array, offset: number, size: number): Uint8Array {
    const copy = piece.slice();
    new DataView(copy.buffer).setUint32(offset, size);
    return copy;
}

/** Where the first box of `type` starts in `piece`, searching the raw bytes. */
function offsetOf(piece: Uint8Array, type: string): number {
    const target = ascii(type);
    for (let i = 4; i + 4 <= piece.length; i++) {
        if (target.every((c, j) => piece[i + j] === c)) {
            return i - 4;
        }
    }
    throw new Error(`No ${type} box`);
}

/** A fixture split into the pieces a Gemini session sends: `[ftyp + moov]`, then each `moof + mdat`. */
function fixturePieces(name: string): Uint8Array[] {
    const file = new Uint8Array(readFileSync(resolve(HERE, 'fixtures', name)));
    const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
    const boxes: Array<{ Type: string; Bytes: Uint8Array }> = [];
    for (let offset = 0; offset < file.length; offset += view.getUint32(offset)) {
        boxes.push({ Type: String.fromCharCode(...file.subarray(offset + 4, offset + 8)), Bytes: file.subarray(offset, offset + view.getUint32(offset)) });
    }
    const pieces: Uint8Array[] = [concat(boxes[0].Bytes, boxes[1].Bytes)];
    for (let i = 2; i + 1 < boxes.length && boxes[i].Type === 'moof'; i += 2) {
        pieces.push(concat(boxes[i].Bytes, boxes[i + 1].Bytes));
    }
    return pieces;
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('SniffFmp4Piece', () => {
    it('reads the first box type: ftyp opens an init segment, moof or styp a media fragment', () => {
        expect(SniffFmp4Piece(MUXED_INIT)).toBe('init');
        expect(SniffFmp4Piece(box('moof', zeros(8)))).toBe('fragment');
        expect(SniffFmp4Piece(box('styp', ascii('msdh')))).toBe('fragment');
    });

    it('is null for anything else: PCM audio, an mdat first, too few bytes', () => {
        expect(SniffFmp4Piece(new Int16Array([1200, -800, 4000, -3000, 1, 2, 3, 4]).buffer)).toBeNull();
        expect(SniffFmp4Piece(box('mdat', zeros(4)))).toBeNull();
        expect(SniffFmp4Piece(ascii('ftyp'))).toBeNull();
        expect(SniffFmp4Piece(new ArrayBuffer(0))).toBeNull();
    });

    it('takes an ArrayBuffer, or a view into a larger buffer', () => {
        const larger = concat(bytes(9, 9, 9), MUXED_INIT);
        expect(SniffFmp4Piece(larger.subarray(3))).toBe('init');
        expect(SniffFmp4Piece(MUXED_INIT.slice().buffer)).toBe('init');
    });
});

describe('ReadFmp4Init', () => {
    describe('tracks and codecs', () => {
        it('reads each track: id, handler and codec, in moov order', () => {
            expect(ReadFmp4Init(MUXED_INIT)).toEqual({
                Tracks: [
                    { TrackID: 1, Handler: 'vide', Codec: 'avc1.42c01f' },
                    { TrackID: 2, Handler: 'soun', Codec: 'mp4a.40.2' },
                ],
            });
        });

        it('reads a video-only init as one video track', () => {
            expect(ReadFmp4Init(concat(FTYP, moov(VIDEO_TRAK)))?.Tracks).toEqual([{ TrackID: 1, Handler: 'vide', Codec: 'avc1.42c01f' }]);
        });

        it('writes the H.264 profile, constraint flags and level as hex, with the entry type', () => {
            const init = concat(FTYP, moov(trak({ ID: 7, Handler: 'vide', Entry: avcEntry('avc3', 0x64, 0x00, 0x28) })));
            expect(ReadFmp4Init(init)?.Tracks[0].Codec).toBe('avc3.640028');
        });

        it('reads the track id after 64-bit times in a version 1 tkhd', () => {
            const init = concat(FTYP, moov(trak({ ID: 513, Handler: 'vide', Entry: avcEntry(), TkhdVersion: 1 })));
            expect(ReadFmp4Init(init)?.Tracks[0].TrackID).toBe(513);
        });

        it('lists a track whose sample entry it does not know, without a codec', () => {
            const hevc = box('hvc1', zeros(6), bytes(0, 1), zeros(70), box('hvcC', zeros(23)));
            const init = concat(FTYP, moov(trak({ ID: 1, Handler: 'vide', Entry: hevc }), AUDIO_TRAK));
            expect(ReadFmp4Init(init)?.Tracks).toEqual([
                { TrackID: 1, Handler: 'vide', Codec: undefined },
                { TrackID: 2, Handler: 'soun', Codec: 'mp4a.40.2' },
            ]);
        });

        it('reads an escaped audio object type (31, then six more bits)', () => {
            // 11111 010101 ...: escape, then 21 → 32 + 21 = 53.
            const entry = mp4aEntry(esds({ AudioSpecificConfig: bytes(0b11111_010, 0b101_00000) }));
            expect(ReadFmp4Init(concat(FTYP, moov(trak({ ID: 2, Handler: 'soun', Entry: entry }))))?.Tracks[0].Codec).toBe('mp4a.40.53');
        });

        it('reads past the fields the ES descriptor flags announce, and four-byte descriptor sizes', () => {
            const flagged = esds({ EsFlags: 0x80 | 0x40 | 0x20, EsFlagFields: concat(bytes(0, 3), bytes(3), ascii('abc'), bytes(0, 4)) });
            const longSizes = esds({ LongSizes: true });
            for (const esdsBox of [flagged, longSizes]) {
                const init = concat(FTYP, moov(trak({ ID: 2, Handler: 'soun', Entry: mp4aEntry(esdsBox) })));
                expect(ReadFmp4Init(init)?.Tracks[0].Codec).toBe('mp4a.40.2');
            }
        });

        it('gives no codec for audio that is not MPEG-4 audio, or names no audio object type', () => {
            const mp3 = mp4aEntry(esds({ ObjectType: 0x6b }));
            const noSpecificInfo = mp4aEntry(fullBox('esds', 0, descriptor(0x03, concat(bytes(0, 1, 0), descriptor(0x04, concat(bytes(0x40, 0x15), zeros(11)))))));
            for (const entry of [mp3, noSpecificInfo]) {
                expect(ReadFmp4Init(concat(FTYP, moov(trak({ ID: 2, Handler: 'soun', Entry: entry }))))?.Tracks[0].Codec).toBeUndefined();
            }
        });
    });

    describe('box sizes', () => {
        it('reads a box of size 0 as running to the end of what holds it', () => {
            const init = withBoxSize(MUXED_INIT, FTYP.length, 0);
            expect(ReadFmp4Init(init)?.Tracks).toHaveLength(2);
        });

        it('reads a box of size 1 by the 64-bit size after its type', () => {
            const body = MUXED_INIT.subarray(FTYP.length + 8);
            const largeMoov = concat(u32(1), ascii('moov'), u32(0), u32(16 + body.length), body);
            expect(ReadFmp4Init(concat(FTYP, largeMoov))?.Tracks.map((t) => t.Handler)).toEqual(['vide', 'soun']);
        });

        it('reads nothing when a box runs past the piece', () => {
            expect(ReadFmp4Init(withBoxSize(MUXED_INIT, FTYP.length, MUXED_INIT.length - FTYP.length + 1))).toBeNull();
            expect(ReadFmp4Init(MUXED_INIT.subarray(0, MUXED_INIT.length - 1))).toBeNull();
        });

        it('reads nothing when a box runs past the box that holds it, even inside the piece', () => {
            // The video track's mdia grows into the audio track: still inside the piece, but past its own trak.
            const mdiaAt = offsetOf(MUXED_INIT, 'mdia');
            const mdiaSize = new DataView(MUXED_INIT.buffer).getUint32(mdiaAt);
            expect(ReadFmp4Init(withBoxSize(MUXED_INIT, mdiaAt, mdiaSize + 8))).toBeNull();
        });

        it('reads nothing when a box is smaller than its own header', () => {
            expect(ReadFmp4Init(withBoxSize(MUXED_INIT, offsetOf(MUXED_INIT, 'tkhd'), 4))).toBeNull();
            // A 4-byte "box" whose next 4 bytes start a real one: read as is, the real boxes would follow.
            expect(ReadFmp4Init(concat(u32(4), MUXED_INIT))).toBeNull();
        });

        it('counts the high word of a 64-bit size: past 4 GB, the box runs past the piece', () => {
            const body = MUXED_INIT.subarray(FTYP.length + 8);
            const hugeMoov = concat(u32(1), ascii('moov'), u32(1), u32(16 + body.length), body);
            expect(ReadFmp4Init(concat(FTYP, hugeMoov))).toBeNull();
        });

        it('lists a track without a codec when its codec record runs past its sample entry', () => {
            const avcCAt = offsetOf(MUXED_INIT, 'avcC');
            const avcCSize = new DataView(MUXED_INIT.buffer).getUint32(avcCAt);
            expect(ReadFmp4Init(withBoxSize(MUXED_INIT, avcCAt, avcCSize + 1))?.Tracks[0]).toEqual({ TrackID: 1, Handler: 'vide', Codec: undefined });
        });

        it('ignores fewer bytes than a box header at the end of a container', () => {
            const padded = concat(FTYP, box('moov', fullBox('mvhd', 0, zeros(96)), VIDEO_TRAK, zeros(4)));
            expect(ReadFmp4Init(padded)?.Tracks).toHaveLength(1);
        });
    });

    describe('what it does not read', () => {
        it('reads nothing from a piece without a moov box, such as a media fragment', () => {
            expect(ReadFmp4Init(box('moof', fullBox('mfhd', 0, u32(1))))).toBeNull();
            expect(ReadFmp4Init(FTYP)).toBeNull();
        });

        it('reads nothing when a track lacks the tkhd or hdlr box that identifies it', () => {
            for (const without of ['tkhd', 'hdlr'] as const) {
                const init = concat(FTYP, moov(VIDEO_TRAK, trak({ ID: 2, Handler: 'soun', Entry: mp4aEntry(), Without: without })));
                expect(ReadFmp4Init(init)).toBeNull();
            }
        });

        it('reads the same from a view into a larger buffer as from the piece alone', () => {
            const larger = concat(zeros(5), MUXED_INIT, zeros(3));
            expect(ReadFmp4Init(larger.subarray(5, 5 + MUXED_INIT.length))).toEqual(ReadFmp4Init(MUXED_INIT));
        });
    });
});

describe('the committed stand-in avatars (fixtures/make-avatar-standin.sh)', () => {
    it('muxed: an H.264 video track and an AAC-LC audio track, then 48 one-frame fragments', () => {
        const [init, ...fragments] = fixturePieces('avatar-standin-muxed.mp4');
        expect(SniffFmp4Piece(init)).toBe('init');
        expect(ReadFmp4Init(init)).toEqual({
            Tracks: [
                { TrackID: 1, Handler: 'vide', Codec: 'avc1.42c01f' },
                { TrackID: 2, Handler: 'soun', Codec: 'mp4a.40.2' },
            ],
        });
        expect(fragments).toHaveLength(48);
        expect(fragments.every((piece) => SniffFmp4Piece(piece) === 'fragment' && ReadFmp4Init(piece) === null)).toBe(true);
    });

    it('video only: one H.264 track, no audio track', () => {
        const [init, ...fragments] = fixturePieces('avatar-standin-video-only.mp4');
        expect(ReadFmp4Init(init)?.Tracks).toEqual([{ TrackID: 1, Handler: 'vide', Codec: 'avc1.42c01f' }]);
        expect(fragments).toHaveLength(48);
    });
});

describe('the reader module', () => {
    it('imports nothing, so a browser and a server load it alike', () => {
        const source = readFileSync(resolve(HERE, '../generic/fmp4Reader.ts'), 'utf8');
        expect(ts.preProcessFile(source, true, true).importedFiles).toEqual([]);
    });
});
