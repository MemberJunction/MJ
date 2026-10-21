import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import {
    AdtsHeader,
    AvccToAnnexB,
    Fmp4AudioSeconds,
    ReadFmp4Fragment,
    ReadFmp4Init,
    type Fmp4AacConfig,
    type Fmp4AvcConfig,
    type Fmp4Init,
} from '../generic/fmp4Reader';

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

function u32(value: number): Uint8Array {
    const out = new Uint8Array(4);
    new DataView(out.buffer).setUint32(0, value >>> 0);
    return out;
}

function u64(value: number): Uint8Array {
    return concat(u32(Math.floor(value / 0x1_0000_0000)), u32(value % 0x1_0000_0000));
}

function ascii(text: string): Uint8Array {
    return Uint8Array.from(text, (c) => c.charCodeAt(0));
}

function box(type: string, ...payload: Uint8Array[]): Uint8Array {
    const body = concat(...payload);
    return concat(u32(8 + body.length), ascii(type), body);
}

function fullBox(type: string, version: number, flags: number, ...payload: Uint8Array[]): Uint8Array {
    return box(type, bytes(version, (flags >> 16) & 0xff, (flags >> 8) & 0xff, flags & 0xff), ...payload);
}

interface TfhdOptions {
    TrackID: number;
    BaseIsMoof?: boolean;
    BaseDataOffset?: number;
    Duration?: number;
    Size?: number;
    Flags?: number;
}

function tfhd(options: TfhdOptions): Uint8Array {
    let flags = options.BaseIsMoof === false ? 0 : 0x2_0000;
    const fields: Uint8Array[] = [u32(options.TrackID)];
    if (options.BaseDataOffset !== undefined) {
        flags |= 0x1;
        fields.push(u64(options.BaseDataOffset));
    }
    for (const [flag, value] of [[0x8, options.Duration], [0x10, options.Size], [0x20, options.Flags]] as const) {
        if (value !== undefined) {
            flags |= flag;
            fields.push(u32(value));
        }
    }
    return fullBox('tfhd', 0, flags, ...fields);
}

function tfdt(time: number, version: 0 | 1 = 1): Uint8Array {
    return fullBox('tfdt', version, 0, version === 1 ? u64(time) : u32(time));
}

interface RunSample {
    Duration?: number;
    Size?: number;
    Flags?: number;
    Cto?: number;
}

interface TrunOptions {
    DataOffset?: number;
    FirstSampleFlags?: number;
    Samples: RunSample[];
    Version?: 0 | 1;
    Count?: number;
}

function trun(options: TrunOptions): Uint8Array {
    const first = options.Samples[0] ?? {};
    let flags = 0;
    flags |= options.DataOffset !== undefined ? 0x1 : 0;
    flags |= options.FirstSampleFlags !== undefined ? 0x4 : 0;
    flags |= first.Duration !== undefined ? 0x100 : 0;
    flags |= first.Size !== undefined ? 0x200 : 0;
    flags |= first.Flags !== undefined ? 0x400 : 0;
    flags |= first.Cto !== undefined ? 0x800 : 0;
    const fields: Uint8Array[] = [u32(options.Count ?? options.Samples.length)];
    if (options.DataOffset !== undefined) {
        fields.push(u32(options.DataOffset));
    }
    if (options.FirstSampleFlags !== undefined) {
        fields.push(u32(options.FirstSampleFlags));
    }
    for (const s of options.Samples) {
        for (const value of [s.Duration, s.Size, s.Flags, s.Cto]) {
            if (value !== undefined) {
                fields.push(u32(value));
            }
        }
    }
    return fullBox('trun', options.Version ?? 0, flags, ...fields);
}

/** A moof + mdat whose single traf's run points at the mdat payload (default base is the moof). */
function fragment(traf: (dataOffset: number) => Uint8Array, payload: Uint8Array): Uint8Array {
    const probe = box('moof', fullBox('mfhd', 0, 0, u32(1)), traf(0));
    const moof = box('moof', fullBox('mfhd', 0, 0, u32(1)), traf(probe.length + 8));
    return concat(moof, box('mdat', payload));
}

/** An init the fragments' defaults come from: video track 1 at 90 kHz, audio track 2 at 24 kHz, optional trex defaults. */
function initWith(defaults?: { TrackID: number; Duration: number; Size: number; Flags: number }): Fmp4Init {
    return {
        Tracks: [
            { TrackID: 1, Handler: 'vide', Timescale: 90000 },
            {
                TrackID: 2,
                Handler: 'soun',
                Timescale: 24000,
                ...(defaults?.TrackID === 2 ? { DefaultSampleDuration: defaults.Duration, DefaultSampleSize: defaults.Size, DefaultSampleFlags: defaults.Flags } : {}),
            },
        ],
    };
}

/** A fixture split into its init segment and its `moof` + `mdat` fragments. */
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

const NON_SYNC = 0x1_0000;

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('ReadFmp4Init: what a decoder needs', () => {
    const [init] = fixturePieces('avatar-standin-muxed.mp4');
    const read = ReadFmp4Init(init);

    it('reads each track\'s timescale (mdhd), and no trex defaults where ffmpeg writes zeros', () => {
        expect(read?.Tracks.map((t) => t.Timescale)).toEqual([12288, 24000]);
        expect(read?.Tracks.map((t) => [t.DefaultSampleDuration, t.DefaultSampleSize, t.DefaultSampleFlags])).toEqual([
            [undefined, undefined, undefined],
            [undefined, undefined, undefined],
        ]);
    });

    it('reads the video track\'s size and its avcC: NAL length size, one SPS and one PPS', () => {
        const video = read?.Tracks[0];
        expect([video?.Width, video?.Height]).toEqual([704, 1280]);
        expect(video?.Avc?.NalLengthSize).toBe(4);
        expect(video?.Avc?.Sps.map((sps) => sps[0] & 0x1f)).toEqual([7]);
        expect(video?.Avc?.Pps.map((pps) => pps[0] & 0x1f)).toEqual([8]);
        // profile_idc 66 (Baseline), level 31, as the codec string says.
        expect([video?.Avc?.Sps[0][1], video?.Avc?.Sps[0][3]]).toEqual([0x42, 0x1f]);
    });

    it('reads the audio track\'s AudioSpecificConfig: AAC-LC, 24 kHz, mono', () => {
        expect(read?.Tracks[1].Aac).toEqual({ ObjectType: 2, SampleRateIndex: 6, SampleRate: 24000, Channels: 1, FrameLength: 1024 });
        expect(read?.Tracks[1].Avc).toBeUndefined();
    });

    it('copies the parameter sets, so they outlive the piece\'s buffer', () => {
        const copy = init.slice();
        const fromCopy = ReadFmp4Init(copy);
        copy.fill(0);
        expect(fromCopy?.Tracks[0].Avc?.Sps[0][0]! & 0x1f).toBe(7);
    });
});

describe('ReadFmp4Fragment', () => {
    describe('the committed stand-in (two track fragments per moof)', () => {
        const [initPiece, ...fragments] = fixturePieces('avatar-standin-muxed.mp4');
        const init = ReadFmp4Init(initPiece);

        it('reads one video and one audio sample per fragment, with their bytes in the piece', () => {
            const first = ReadFmp4Fragment(fragments[0], init);
            expect(first?.Samples.map((s) => s.TrackID)).toEqual([1, 2]);
            for (const sample of first!.Samples) {
                expect(sample.Data?.length).toBe(sample.Size);
            }
        });

        it('takes the first video sample as a key frame and later ones as not', () => {
            expect(ReadFmp4Fragment(fragments[0], init)?.Samples[0].IsSync).toBe(true);
            expect(ReadFmp4Fragment(fragments[1], init)?.Samples[0].IsSync).toBe(false);
        });

        it('reads decode times from tfdt and durations from the tfhd defaults', () => {
            const audio = fragments.map((piece) => ReadFmp4Fragment(piece, init)!.Samples.find((s) => s.TrackID === 2)!);
            expect(audio.slice(0, 3).map((s) => s.DecodeTime)).toEqual([0, 1024, 2048]);
            // One AAC frame each; the encoder trims the last one to the clip's end.
            expect(audio.slice(0, -1).every((s) => s.Duration === 1024)).toBe(true);
            expect(audio[audio.length - 1].Duration).toBe(896);
        });

        it('starts each video sample\'s bytes with a length-prefixed NAL unit', () => {
            const video = ReadFmp4Fragment(fragments[0], init)!.Samples[0];
            const firstLength = new DataView(video.Data!.buffer, video.Data!.byteOffset).getUint32(0);
            expect(firstLength).toBeGreaterThan(0);
            expect(firstLength + 4).toBeLessThanOrEqual(video.Size);
        });
    });

    describe('Google\'s layout: one track per moof, defaults in tfhd', () => {
        it('reads the sample at the run\'s data offset from the moof, with the first-sample flags', () => {
            const payload = bytes(1, 2, 3, 4, 5);
            const piece = fragment(
                (dataOffset) => box('traf', tfhd({ TrackID: 1, Duration: 3750, Size: 5, Flags: NON_SYNC }), tfdt(7680), trun({ DataOffset: dataOffset, FirstSampleFlags: 0x0200_0000, Samples: [{}] })),
                payload
            );
            const read = ReadFmp4Fragment(piece, initWith());
            expect(read?.Samples).toHaveLength(1);
            expect(read?.Samples[0]).toMatchObject({ TrackID: 1, DecodeTime: 7680, Duration: 3750, Size: 5, IsSync: true, CompositionOffset: 0 });
            expect(Array.from(read!.Samples[0].Data!)).toEqual([1, 2, 3, 4, 5]);
        });

        it('takes the tfhd default flags (a non-sync sample) when the run gives none', () => {
            const piece = fragment((o) => box('traf', tfhd({ TrackID: 1, Duration: 3750, Size: 2, Flags: NON_SYNC }), tfdt(11430), trun({ DataOffset: o, Samples: [{}] })), bytes(9, 9));
            expect(ReadFmp4Fragment(piece, initWith())?.Samples[0].IsSync).toBe(false);
        });

        it('reads a version 0 tfdt as 32 bits', () => {
            const piece = fragment((o) => box('traf', tfhd({ TrackID: 2, Duration: 1024, Size: 1 }), tfdt(2048, 0), trun({ DataOffset: o, Samples: [{}] })), bytes(7));
            expect(ReadFmp4Fragment(piece, initWith())?.Samples[0].DecodeTime).toBe(2048);
        });

        it('reads a 64-bit tfdt past 2^32', () => {
            const piece = fragment((o) => box('traf', tfhd({ TrackID: 2, Duration: 1024, Size: 1 }), tfdt(0x1_0000_0400), trun({ DataOffset: o, Samples: [{}] })), bytes(7));
            expect(ReadFmp4Fragment(piece, initWith())?.Samples[0].DecodeTime).toBe(0x1_0000_0400);
        });
    });

    describe('track runs', () => {
        it('reads per-sample durations, sizes, flags and composition offsets, and advances the decode time', () => {
            const samples: RunSample[] = [
                { Duration: 1000, Size: 2, Flags: 0, Cto: 0 },
                { Duration: 2000, Size: 3, Flags: NON_SYNC, Cto: 500 },
            ];
            const piece = fragment((o) => box('traf', tfhd({ TrackID: 1 }), tfdt(100), trun({ DataOffset: o, Samples: samples })), bytes(1, 1, 2, 2, 2));
            const read = ReadFmp4Fragment(piece, initWith())!.Samples;
            expect(read.map((s) => [s.DecodeTime, s.Duration, s.Size, s.IsSync, s.CompositionOffset])).toEqual([
                [100, 1000, 2, true, 0],
                [1100, 2000, 3, false, 500],
            ]);
            expect(read.map((s) => Array.from(s.Data!))).toEqual([[1, 1], [2, 2, 2]]);
        });

        it("advances the decode time by each sample's own duration over the tfhd default (a first frame that carries the AAC priming)", () => {
            const samples: RunSample[] = [{ Duration: 7590 }, { Duration: 3750 }, { Duration: 3750 }];
            const piece = fragment((o) => box('traf', tfhd({ TrackID: 1, Duration: 3750, Size: 1 }), tfdt(0), trun({ DataOffset: o, Samples: samples })), bytes(1, 2, 3));
            expect(ReadFmp4Fragment(piece, initWith())!.Samples.map((s) => s.DecodeTime)).toEqual([0, 7590, 11340]);
        });

        it('reads a version 1 run\'s composition offsets as signed', () => {
            const piece = fragment((o) => box('traf', tfhd({ TrackID: 1, Duration: 10, Size: 1 }), tfdt(0), trun({ DataOffset: o, Version: 1, Samples: [{ Cto: 0xffff_fc18 }] })), bytes(0));
            expect(ReadFmp4Fragment(piece, initWith())?.Samples[0].CompositionOffset).toBe(-1000);
        });

        it('continues a run with no data offset where the previous run\'s data ended', () => {
            const traf = (o: number): Uint8Array =>
                box('traf', tfhd({ TrackID: 1, Duration: 10, Size: 2 }), tfdt(0), trun({ DataOffset: o, Samples: [{}] }), trun({ Samples: [{}] }));
            const read = ReadFmp4Fragment(fragment(traf, bytes(1, 1, 2, 2)), initWith())!.Samples;
            expect(read.map((s) => Array.from(s.Data!))).toEqual([[1, 1], [2, 2]]);
            expect(read.map((s) => s.DecodeTime)).toEqual([0, 10]);
        });

        it('falls back to the init\'s trex defaults when tfhd names none', () => {
            const piece = fragment((o) => box('traf', tfhd({ TrackID: 2 }), tfdt(0), trun({ DataOffset: o, Samples: [{}] })), bytes(5, 5, 5));
            const read = ReadFmp4Fragment(piece, initWith({ TrackID: 2, Duration: 1024, Size: 3, Flags: NON_SYNC }));
            expect(read?.Samples[0]).toMatchObject({ Duration: 1024, Size: 3, IsSync: false });
        });

        it('is null when a sample has no size anywhere', () => {
            const piece = fragment((o) => box('traf', tfhd({ TrackID: 2 }), tfdt(0), trun({ DataOffset: o, Samples: [{ Duration: 5 }] })), bytes(5));
            expect(ReadFmp4Fragment(piece, initWith())).toBeNull();
        });

        it('is null when a run declares more entries than its box holds, or an absurd sample count', () => {
            const short = fragment((o) => box('traf', tfhd({ TrackID: 1 }), tfdt(0), trun({ DataOffset: o, Count: 3, Samples: [{ Duration: 1, Size: 1 }] })), bytes(1));
            const absurd = fragment((o) => box('traf', tfhd({ TrackID: 1, Duration: 1, Size: 0 }), tfdt(0), trun({ DataOffset: o, Count: 0xffff_ffff, Samples: [] })), bytes(1));
            expect(ReadFmp4Fragment(short, initWith())).toBeNull();
            expect(ReadFmp4Fragment(absurd, initWith())).toBeNull();
        });
    });

    describe('track fragments and pieces', () => {
        it('counts a second track fragment\'s data from where the first one\'s ended, when the base is not the moof', () => {
            const trafs = (o: number): Uint8Array =>
                concat(
                    box('traf', tfhd({ TrackID: 1, BaseIsMoof: false, Duration: 1, Size: 2 }), tfdt(0), trun({ DataOffset: o, Samples: [{}] })),
                    box('traf', tfhd({ TrackID: 2, BaseIsMoof: false, Duration: 1, Size: 1 }), tfdt(0), trun({ Samples: [{}] }))
                );
            const read = ReadFmp4Fragment(fragment(trafs, bytes(1, 1, 2)), initWith())!.Samples;
            expect(read.map((s) => [s.TrackID, Array.from(s.Data!)])).toEqual([
                [1, [1, 1]],
                [2, [2]],
            ]);
        });

        it('reads every moof + mdat in one piece', () => {
            const one = fragment((o) => box('traf', tfhd({ TrackID: 2, Duration: 1024, Size: 1 }), tfdt(0), trun({ DataOffset: o, Samples: [{}] })), bytes(1));
            const two = fragment((o) => box('traf', tfhd({ TrackID: 2, Duration: 1024, Size: 1 }), tfdt(1024), trun({ DataOffset: o, Samples: [{}] })), bytes(2));
            const read = ReadFmp4Fragment(concat(box('styp', ascii('msdh')), one, two), initWith());
            expect(read?.Samples.map((s) => [s.DecodeTime, s.Data?.[0]])).toEqual([
                [0, 1],
                [1024, 2],
            ]);
        });

        it('reads a moof without its mdat: durations and sizes, no bytes', () => {
            const piece = fragment((o) => box('traf', tfhd({ TrackID: 2, Duration: 1024, Size: 4 }), tfdt(0), trun({ DataOffset: o, Samples: [{}] })), bytes(1, 2, 3, 4));
            const moofOnly = piece.subarray(0, new DataView(piece.buffer).getUint32(0));
            expect(ReadFmp4Fragment(moofOnly, initWith())?.Samples[0]).toMatchObject({ Duration: 1024, Size: 4, Data: null });
        });

        it('is null without a moof, without tfhd or tfdt, with a whole-file base data offset, or cut short', () => {
            const noTfdt = fragment((o) => box('traf', tfhd({ TrackID: 1, Duration: 1, Size: 1 }), trun({ DataOffset: o, Samples: [{}] })), bytes(1));
            const noTfhd = fragment((o) => box('traf', tfdt(0), trun({ DataOffset: o, Samples: [{}] })), bytes(1));
            const absolute = fragment((o) => box('traf', tfhd({ TrackID: 1, BaseDataOffset: 0, Duration: 1, Size: 1 }), tfdt(0), trun({ DataOffset: o, Samples: [{}] })), bytes(1));
            const whole = fragment((o) => box('traf', tfhd({ TrackID: 1, Duration: 1, Size: 1 }), tfdt(0), trun({ DataOffset: o, Samples: [{}] })), bytes(1));
            for (const piece of [box('mdat', bytes(1)), noTfdt, noTfhd, absolute, whole.subarray(0, whole.length - 1)]) {
                expect(ReadFmp4Fragment(piece, initWith())).toBeNull();
            }
            expect(ReadFmp4Fragment(whole, initWith())).not.toBeNull();
        });
    });
});

describe('Fmp4AudioSeconds on the committed stand-in', () => {
    const [initPiece, ...fragments] = fixturePieces('avatar-standin-muxed.mp4');
    const init = ReadFmp4Init(initPiece)!;

    it("sums the audio track's durations over its timescale: one AAC frame per fragment, the last one trimmed", () => {
        expect(Fmp4AudioSeconds(fragments[1], init)).toBeCloseTo(1024 / 24000, 9);
        const total = fragments.reduce((sum, piece) => sum + (Fmp4AudioSeconds(piece, init) ?? Number.NaN), 0);
        expect(total).toBeCloseTo((47 * 1024 + 896) / 24000, 9);
    });

    it('is null for an init without an audio track that has a timescale', () => {
        expect(Fmp4AudioSeconds(fragments[1], { Tracks: [{ TrackID: 2, Handler: 'soun' }] })).toBeNull();
    });
});

describe('AvccToAnnexB', () => {
    const SPS = bytes(0x67, 0x42, 0xc0, 0x1f);
    const PPS = bytes(0x68, 0xce);
    const AVC: Fmp4AvcConfig = { NalLengthSize: 4, Sps: [SPS], Pps: [PPS] };
    const START = [0, 0, 0, 1];
    const AUD = [0, 0, 0, 1, 0x09, 0xf0];

    function lengthPrefixed(size: 1 | 2 | 4, ...nals: Uint8Array[]): Uint8Array {
        return concat(...nals.map((nal) => concat(size === 4 ? u32(nal.length) : size === 2 ? bytes(nal.length >> 8, nal.length & 0xff) : bytes(nal.length), nal)));
    }

    it('puts the parameter sets before an IDR frame, start codes before every unit, and a delimiter after the frame', () => {
        const idr = bytes(0x65, 0x88, 0x84);
        const frame = AvccToAnnexB(lengthPrefixed(4, idr), AVC);
        expect(frame?.IsKeyFrame).toBe(true);
        expect(Array.from(frame!.Data)).toEqual([...START, ...SPS, ...START, ...PPS, ...START, ...idr, ...AUD]);
    });

    it('adds no parameter sets to a frame that is not an IDR', () => {
        const slice = bytes(0x41, 0x9a);
        const frame = AvccToAnnexB(lengthPrefixed(4, slice), AVC);
        expect(frame?.IsKeyFrame).toBe(false);
        expect(Array.from(frame!.Data)).toEqual([...START, ...slice, ...AUD]);
    });

    it('does not repeat parameter sets an IDR frame already carries', () => {
        const ownSps = bytes(0x67, 0x42, 0xc0, 0x1e);
        const idr = bytes(0x65, 0x01);
        const frame = AvccToAnnexB(lengthPrefixed(4, ownSps, PPS, idr), AVC);
        expect(Array.from(frame!.Data)).toEqual([...START, ...ownSps, ...START, ...PPS, ...START, ...idr, ...AUD]);
    });

    it('reads 1- and 2-byte length prefixes', () => {
        const nal = bytes(0x41, 0x01, 0x02);
        for (const size of [1, 2] as const) {
            const frame = AvccToAnnexB(lengthPrefixed(size, nal, nal), { ...AVC, NalLengthSize: size });
            expect(Array.from(frame!.Data)).toEqual([...START, ...nal, ...START, ...nal, ...AUD]);
        }
    });

    it('is null when a length prefix runs past the sample, or names an empty unit', () => {
        expect(AvccToAnnexB(concat(u32(9), bytes(0x41, 0x01)), AVC)).toBeNull();
        expect(AvccToAnnexB(bytes(0, 0), AVC)).toBeNull();
        expect(AvccToAnnexB(concat(u32(0), bytes(0x41)), AVC)).toBeNull();
    });
});

describe('AdtsHeader', () => {
    const LC_24K_MONO: Fmp4AacConfig = { ObjectType: 2, SampleRateIndex: 6, SampleRate: 24000, Channels: 1, FrameLength: 1024 };

    it('writes the 7-byte header for AAC-LC, 24 kHz, mono: profile 1, index 6, one channel, the frame length', () => {
        // 100 bytes of payload → a 107-byte frame.
        expect(Array.from(AdtsHeader(LC_24K_MONO, 100)!)).toEqual([0xff, 0xf1, 0x58, 0x40, 0x0d, 0x7f, 0xfc]);
    });

    it('spreads a long frame length over its 13 bits', () => {
        // 4000 + 7 = 4007 = 0b0_1111_1010_0111.
        const header = AdtsHeader({ ...LC_24K_MONO, Channels: 2 }, 4000)!;
        const length = ((header[3] & 0x3) << 11) | (header[4] << 3) | (header[5] >> 5);
        expect(length).toBe(4007);
        expect(((header[2] & 0x1) << 2) | (header[3] >> 6)).toBe(2);
    });

    it('is null for what ADTS cannot describe', () => {
        expect(AdtsHeader({ ...LC_24K_MONO, ObjectType: 5 }, 10)).toBeNull();
        expect(AdtsHeader({ ...LC_24K_MONO, SampleRateIndex: 15, SampleRate: 22000 }, 10)).toBeNull();
        expect(AdtsHeader({ ...LC_24K_MONO, Channels: 0 }, 10)).toBeNull();
        expect(AdtsHeader(LC_24K_MONO, 0x1fff - 6)).toBeNull();
        expect(AdtsHeader(LC_24K_MONO, 0x1fff - 7)).not.toBeNull();
    });
});
