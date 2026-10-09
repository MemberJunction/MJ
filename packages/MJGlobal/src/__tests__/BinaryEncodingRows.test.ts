import { describe, it, expect, afterEach, vi } from 'vitest';
import {
    Base64DecodedByteLength,
    Base64ToBytes,
    BytesToBase64,
    Float32VectorCodecs,
    FLOAT32_VECTOR_BYTES_PER_VALUE,
    ReplaceByteArraysWithBase64,
} from '../util/BinaryEncoding';

describe('Base64DecodedByteLength', () => {
    it.each([
        ['', 0],
        ['AA==', 1],
        ['AAA=', 2],
        ['AAAA', 3],
        ['AQID', 3],
        ['AAAAAA==', 4],
        ['aGVsbG8=', 5],
    ])('reports %j as %i bytes', (value, expected) => {
        expect(Base64DecodedByteLength(value)).toBe(expected);
    });

    it.each([
        ['AA', 1],
        ['AAA', 2],
        ['AQI', 2],
        ['AAAAAA', 4],
    ])('handles unpadded %j as %i bytes', (value, expected) => {
        expect(Base64DecodedByteLength(value)).toBe(expected);
    });

    it('agrees with the actual decoded length for every size 0..64, padded and unpadded', () => {
        for (let length = 0; length <= 64; length++) {
            const bytes = new Uint8Array(length).map((_, i) => (i * 31) & 0xff);
            const padded = BytesToBase64(bytes);
            const unpadded = padded.replace(/=+$/, '');
            expect(Base64DecodedByteLength(padded), `padded ${length}`).toBe(length);
            expect(Base64DecodedByteLength(unpadded), `unpadded ${length}`).toBe(length);
            expect(Base64ToBytes(unpadded).length).toBe(length);
        }
    });

    it('agrees with the decoded length of a large value without decoding it', () => {
        const bytes = new Uint8Array(100_001);
        expect(Base64DecodedByteLength(BytesToBase64(bytes))).toBe(100_001);
    });
});

describe('ReplaceByteArraysWithBase64', () => {
    it('returns the same object when the row has no byte arrays', () => {
        const row = { ID: 'a', Name: 'x', Count: 3, Data: 'AQID', Missing: null, Nested: { inner: new Uint8Array([1]) } };
        expect(ReplaceByteArraysWithBase64(row)).toBe(row);
    });

    it('returns the same object for an empty row', () => {
        const row: Record<string, unknown> = {};
        expect(ReplaceByteArraysWithBase64(row)).toBe(row);
    });

    it('replaces a Uint8Array value with base64 in a shallow copy', () => {
        const bytes = new Uint8Array([1, 2, 3]);
        const row = { ID: 'a', Data: bytes as unknown };
        const result = ReplaceByteArraysWithBase64(row);
        expect(result).not.toBe(row);
        expect(result).toEqual({ ID: 'a', Data: 'AQID' });
        expect(row.Data).toBe(bytes); // input untouched
    });

    it('replaces a Node Buffer value', () => {
        const row: Record<string, unknown> = { Data: Buffer.from([1, 2, 3]) };
        expect(ReplaceByteArraysWithBase64(row)).toEqual({ Data: 'AQID' });
    });

    it('replaces every byte array, copying only once, and keeps other values by reference', () => {
        const nested = { a: 1 };
        const row: Record<string, unknown> = {
            First: new Uint8Array([255]),
            Text: 'hello',
            Nested: nested,
            Second: Buffer.from([0, 0, 0]),
            Empty: new Uint8Array(0),
        };
        const result = ReplaceByteArraysWithBase64(row);
        expect(result).toEqual({ First: '/w==', Text: 'hello', Nested: nested, Second: 'AAAA', Empty: '' });
        expect(result.Nested).toBe(nested);
        expect(IsUint8(row.First)).toBe(true);
        expect(IsUint8(row.Second)).toBe(true);
    });

    it('does not convert other typed arrays or ArrayBuffers', () => {
        const u16 = new Uint16Array([1]);
        const ab = new ArrayBuffer(2);
        const row: Record<string, unknown> = { A: u16, B: ab };
        expect(ReplaceByteArraysWithBase64(row)).toBe(row);
    });

    it('never mutates a frozen cache entry', () => {
        const row = Object.freeze({ ID: 'x', Data: new Uint8Array([1, 2]) as unknown });
        const result = ReplaceByteArraysWithBase64(row);
        expect(result).toEqual({ ID: 'x', Data: 'AQI=' });
        expect(Object.isFrozen(row)).toBe(true);
        expect(row.Data).toBeInstanceOf(Uint8Array);
        expect(Object.isFrozen(result)).toBe(false);
    });

    it('encodes only the viewed range of a subarray value', () => {
        const backing = new Uint8Array([9, 1, 2, 3, 9]);
        const row: Record<string, unknown> = { Data: backing.subarray(1, 4) };
        expect(ReplaceByteArraysWithBase64(row).Data).toBe('AQID');
    });

    it('produces a value that survives JSON serialization as a string', () => {
        const row: Record<string, unknown> = { Data: Buffer.from('hi') };
        expect(JSON.parse(JSON.stringify(ReplaceByteArraysWithBase64(row)))).toEqual({ Data: 'aGk=' });
    });
});

function IsUint8(value: unknown): boolean {
    return value instanceof Uint8Array;
}

describe('float32 vector codecs', () => {
    it('uses 4 bytes per value', () => {
        expect(FLOAT32_VECTOR_BYTES_PER_VALUE).toBe(4);
    });

    it('DataView implementation writes little-endian bytes explicitly', () => {
        const dataView = Float32VectorCodecs[1];
        expect(dataView.Name).toBe('DataView (any host)');
        expect(Array.from(dataView.Encode([1, -2]))).toEqual([0x00, 0x00, 0x80, 0x3f, 0x00, 0x00, 0x00, 0xc0]);
        expect(Array.from(dataView.Encode([]))).toEqual([]);
    });

    it('both implementations decode an empty-but-aligned buffer to an empty vector', () => {
        for (const codec of Float32VectorCodecs) {
            expect(codec.Decode(new Uint8Array(0)).length, codec.Name).toBe(0);
        }
    });
});

describe('GetBase64Codec selection on a bare host', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.resetModules();
    });

    it('falls back to atob/btoa when Buffer is absent', async () => {
        vi.stubGlobal('Buffer', undefined);
        vi.resetModules();
        // A fresh module instance is needed because the codec choice is cached per process.
        const fresh = await import('../util/BinaryEncoding');
        expect(fresh.GetBase64Codec().Name).toBe('atob / btoa');
        expect(fresh.BytesToBase64(new Uint8Array([1, 2, 3]))).toBe('AQID');
        expect(Array.from(fresh.Base64ToBytes('AQI'))).toEqual([1, 2]);
        expect(fresh.ReplaceByteArraysWithBase64({ D: new Uint8Array([255]) as unknown })).toEqual({ D: '/w==' });
    });

    it('throws when the host offers no base64 implementation', async () => {
        vi.stubGlobal('Buffer', undefined);
        vi.stubGlobal('atob', undefined);
        vi.stubGlobal('btoa', undefined);
        vi.resetModules();
        const fresh = await import('../util/BinaryEncoding');
        expect(() => fresh.GetBase64Codec()).toThrow('No base64 implementation is available on this host');
        expect(() => fresh.BytesToBase64(new Uint8Array([1]))).toThrow('No base64 implementation');
        // Zero bytes and invalid input never reach a codec.
        expect(fresh.BytesToBase64(new Uint8Array(0))).toBe('');
        expect(fresh.Base64ToBytes('').length).toBe(0);
        expect(fresh.TryBase64ToBytes('!!')).toBeNull();
    });
});
