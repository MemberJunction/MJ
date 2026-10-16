import { describe, it, expect } from 'vitest';
import {
    EncodeRecordingShard,
    ParseRecordingShard,
    RecordingShardFormatError,
    RECORDING_FRAME_SAMPLES,
    RECORDING_SHARD_HEADER_BYTES,
    RECORDING_SHARD_WINDOW_PACKETS,
    type RecordingShardContents,
} from '../realtime-recording-shard-format';

function packet(length: number, fill: number): Uint8Array {
    return new Uint8Array(length).fill(fill);
}

function shard(overrides: Partial<RecordingShardContents> = {}): RecordingShardContents {
    const packets = overrides.Packets ?? [packet(80, 1), packet(95, 2), packet(3, 3)];
    return {
        ShardIndex: 7,
        StartSample: 1_680_000,
        SampleCount: packets.length * RECORDING_FRAME_SAMPLES,
        PacketCount: packets.length,
        Packets: packets,
        ...overrides,
    };
}

/** Writes one header field in place so a test can corrupt exactly one thing. */
function withHeaderU32(bytes: Uint8Array, offset: number, value: number): Uint8Array {
    const copy = bytes.slice();
    new DataView(copy.buffer).setUint32(offset, value, true);
    return copy;
}

describe('MJOPUS1 recording shard format', () => {
    it('round-trips header and packets', () => {
        const original = shard();
        const parsed = ParseRecordingShard(EncodeRecordingShard(original));
        expect(parsed.ShardIndex).toBe(7);
        expect(parsed.StartSample).toBe(1_680_000);
        expect(parsed.SampleCount).toBe(3 * RECORDING_FRAME_SAMPLES);
        expect(parsed.PacketCount).toBe(3);
        expect(parsed.Packets.map((p) => Array.from(p))).toEqual(original.Packets.map((p) => Array.from(p)));
    });

    it('starts with the MJOPUS1 magic and version 1, and the header is 28 bytes', () => {
        const bytes = EncodeRecordingShard(shard({ Packets: [], PacketCount: 0, SampleCount: 0 }));
        expect(bytes.length).toBe(RECORDING_SHARD_HEADER_BYTES);
        expect(new TextDecoder().decode(bytes.subarray(0, 7))).toBe('MJOPUS1');
        expect(bytes[7]).toBe(1);
    });

    it('round-trips a start sample above 2^32 (a call longer than a day still has exact timing)', () => {
        const start = 2 ** 33 + 960;
        expect(ParseRecordingShard(EncodeRecordingShard(shard({ StartSample: start }))).StartSample).toBe(start);
    });

    it('lays out each packet as a little-endian u16 length then its bytes', () => {
        const bytes = EncodeRecordingShard(shard({ Packets: [packet(258, 9)], PacketCount: 1, SampleCount: 960 }));
        expect(bytes[RECORDING_SHARD_HEADER_BYTES]).toBe(2);
        expect(bytes[RECORDING_SHARD_HEADER_BYTES + 1]).toBe(1);
        expect(bytes.length).toBe(RECORDING_SHARD_HEADER_BYTES + 2 + 258);
    });

    it('refuses to encode a shard whose PacketCount disagrees with its packets', () => {
        expect(() => EncodeRecordingShard(shard({ PacketCount: 5 }))).toThrow(RecordingShardFormatError);
    });

    describe('parse rejects', () => {
        const good = EncodeRecordingShard(shard());

        it('a wrong magic', () => {
            const bad = good.slice();
            bad[0] = 0x58;
            expect(() => ParseRecordingShard(bad)).toThrow(/magic/);
        });

        it('an unknown format version', () => {
            const bad = good.slice();
            bad[7] = 2;
            expect(() => ParseRecordingShard(bad)).toThrow(/version/);
        });

        it('a body shorter than the header', () => {
            expect(() => ParseRecordingShard(good.subarray(0, 20))).toThrow(RecordingShardFormatError);
        });

        it('a truncated packet', () => {
            expect(() => ParseRecordingShard(good.subarray(0, good.length - 1))).toThrow(/truncated/);
        });

        it('trailing bytes after the last packet', () => {
            const bad = new Uint8Array(good.length + 1);
            bad.set(good);
            expect(() => ParseRecordingShard(bad)).toThrow(/trailing/);
        });

        it('a zero-length packet', () => {
            const bytes = EncodeRecordingShard(shard({ Packets: [packet(1, 1)], PacketCount: 1, SampleCount: 960 }));
            const bad = bytes.slice();
            bad[RECORDING_SHARD_HEADER_BYTES] = 0;
            expect(() => ParseRecordingShard(bad.subarray(0, RECORDING_SHARD_HEADER_BYTES + 2))).toThrow(/packet length/);
        });

        it('a packet longer than an Opus packet can be', () => {
            const bytes = EncodeRecordingShard(shard({ Packets: [packet(1276, 1)], PacketCount: 1, SampleCount: 960 }));
            expect(() => ParseRecordingShard(bytes)).toThrow(/packet length/);
        });

        it('more samples than the packets can carry', () => {
            expect(() => ParseRecordingShard(withHeaderU32(good, 20, 3 * RECORDING_FRAME_SAMPLES + 1))).toThrow(/sample count/);
        });

        it('more packets than two windows', () => {
            expect(() => ParseRecordingShard(withHeaderU32(good, 24, 2 * RECORDING_SHARD_WINDOW_PACKETS + 1))).toThrow(/packet count/);
        });
    });
});
