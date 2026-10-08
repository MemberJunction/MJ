import { describe, it, expect } from 'vitest';
import { BuildRecordingFromSegments } from '../realtime/realtime-recording-store';

/** A shard of `length` bytes, every byte set to `fill`. */
function shard(Index: number, length: number, fill: number): { Index: number; Bytes: Buffer } {
    return { Index, Bytes: Buffer.alloc(length, fill) };
}

function dataOf(wav: Buffer): Buffer {
    return wav.subarray(44);
}

describe('BuildRecordingFromSegments', () => {
    it('writes a canonical header and concatenates shards in index order', () => {
        const result = BuildRecordingFromSegments([shard(2, 4, 3), shard(0, 4, 1), shard(1, 4, 2)], 24000);
        const wav = result.Wav;
        expect(wav.length).toBe(44 + 12);
        expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
        expect(wav.readUInt32LE(4)).toBe(36 + 12);
        expect(wav.toString('ascii', 8, 12)).toBe('WAVE');
        expect(wav.toString('ascii', 12, 16)).toBe('fmt ');
        expect(wav.readUInt32LE(16)).toBe(16);
        expect(wav.readUInt16LE(20)).toBe(1);
        expect(wav.readUInt16LE(22)).toBe(1);
        expect(wav.readUInt32LE(24)).toBe(24000);
        expect(wav.readUInt32LE(28)).toBe(48000);
        expect(wav.readUInt16LE(32)).toBe(2);
        expect(wav.readUInt16LE(34)).toBe(16);
        expect(wav.toString('ascii', 36, 40)).toBe('data');
        expect(wav.readUInt32LE(40)).toBe(12);
        expect(dataOf(wav)).toEqual(Buffer.from([1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3]));
        expect(result.MissingIndexes).toEqual([]);
        expect(result.GapBytes).toBe(4);
    });

    it('fills a missing middle index with silence sized by the median, excluding the highest index', () => {
        const result = BuildRecordingFromSegments([shard(0, 8, 1), shard(2, 8, 2), shard(3, 4, 3)], 16000);
        expect(result.MissingIndexes).toEqual([1]);
        expect(result.GapBytes).toBe(8);
        expect(dataOf(result.Wav)).toEqual(Buffer.concat([
            Buffer.alloc(8, 1), Buffer.alloc(8, 0), Buffer.alloc(8, 2), Buffer.alloc(4, 3),
        ]));
    });

    it('treats missing leading indexes as gaps sized by the only present shard', () => {
        const result = BuildRecordingFromSegments([shard(2, 6, 9)], 16000);
        expect(result.MissingIndexes).toEqual([0, 1]);
        expect(result.GapBytes).toBe(6);
        expect(dataOf(result.Wav)).toEqual(Buffer.concat([Buffer.alloc(12, 0), Buffer.alloc(6, 9)]));
    });

    it('uses the median of the remaining shards (odd count)', () => {
        const result = BuildRecordingFromSegments([shard(0, 6, 1), shard(1, 10, 1), shard(3, 2, 1)], 16000);
        expect(result.MissingIndexes).toEqual([2]);
        expect(result.GapBytes).toBe(8);
    });

    it('rounds an odd median down to an even byte count', () => {
        const result = BuildRecordingFromSegments([shard(0, 6, 1), shard(2, 8, 1), shard(3, 4, 1)], 16000);
        expect(result.MissingIndexes).toEqual([1]);
        expect(result.GapBytes).toBe(6);
    });

    it('throws on an odd-length shard', () => {
        expect(() => BuildRecordingFromSegments([shard(0, 3, 1)], 16000)).toThrow(/odd|even/i);
    });

    it('throws on an empty shard', () => {
        expect(() => BuildRecordingFromSegments([shard(0, 0, 1)], 16000)).toThrow(/empty/i);
    });

    it('throws on a duplicate index', () => {
        expect(() => BuildRecordingFromSegments([shard(1, 4, 1), shard(1, 4, 2)], 16000)).toThrow(/duplicate/i);
    });

    it('throws on a negative or non-integer index', () => {
        expect(() => BuildRecordingFromSegments([shard(-1, 4, 1)], 16000)).toThrow(/index/i);
        expect(() => BuildRecordingFromSegments([shard(1.5, 4, 1)], 16000)).toThrow(/index/i);
    });

    it('throws on a result past the WAV size limit without enumerating the gaps', () => {
        // 2^31 missing indexes x 2 bytes each overflows uint32; must fail fast, not loop 2^31 times.
        expect(() => BuildRecordingFromSegments([shard(2 ** 31, 2, 1)], 16000)).toThrow(/maximum WAV data size/i);
    });

    it('throws on an empty segment list', () => {
        expect(() => BuildRecordingFromSegments([], 16000)).toThrow(/no segments|empty/i);
    });

    it('throws on a non-positive or non-integer sample rate', () => {
        expect(() => BuildRecordingFromSegments([shard(0, 4, 1)], 0)).toThrow(/sample rate/i);
        expect(() => BuildRecordingFromSegments([shard(0, 4, 1)], 16000.5)).toThrow(/sample rate/i);
    });
});
