import { describe, it, expect, afterEach } from 'vitest';
import {
    Base64Codecs,
    Base64ToBytes,
    Base64ToFloat32Vector,
    BytesToBase64,
    BytesToFloat32Vector,
    Float32VectorCodecs,
    Float32VectorToBase64,
    Float32VectorToBytes,
    GetBase64Codec,
    IsByteArray,
    IsValidBase64,
    TryBase64ToBytes,
} from '../util/BinaryEncoding';

/** Deterministic pseudo-random bytes, so failures reproduce. */
function bytesOf(length: number, seed = 7): Uint8Array {
    const out = new Uint8Array(length);
    let s = seed;
    for (let i = 0; i < length; i++) {
        s = (s * 16807) % 2147483647;
        out[i] = s & 0xff;
    }
    return out;
}

const [nativeCodec, nodeCodec, portableCodec] = Base64Codecs;

/**
 * Installs a stand-in for the TC39 `Uint8Array.fromBase64` / `toBase64` API (absent in Node 22)
 * that records how it was called, so the native implementation can be exercised.
 */
function installNativeBase64(): { calls: string[]; restore: () => void } {
    const calls: string[] = [];
    const statics = Uint8Array as unknown as Record<string, unknown>;
    const proto = Uint8Array.prototype as unknown as Record<string, unknown>;
    statics.fromBase64 = (input: string, options?: { lastChunkHandling?: string }) => {
        calls.push(`fromBase64:${options?.lastChunkHandling ?? 'none'}`);
        return new Uint8Array(Buffer.from(input, 'base64'));
    };
    proto.toBase64 = function (this: Uint8Array) {
        calls.push('toBase64');
        return Buffer.from(this.buffer, this.byteOffset, this.byteLength).toString('base64');
    };
    return {
        calls,
        restore: () => {
            delete statics.fromBase64;
            delete proto.toBase64;
        },
    };
}

describe('IsValidBase64', () => {
    it.each(['', 'AA==', 'AAA=', 'AAAA', 'AAAAAA', 'AQID', '+/+/', 'aGVsbG8='])('accepts %j', value => {
        expect(IsValidBase64(value)).toBe(true);
    });

    it.each([
        ['a single dangling character', 'A'],
        ['five characters (one dangling)', 'AAAAA'],
        ['whitespace', 'AA AA'],
        ['a line break', 'AAAA\nAAAA'],
        ['the URL-safe alphabet', 'AA-_'],
        ['a data URI', 'data:image/png;base64,AAAA'],
        ['padding before the end', 'AA=A'],
        ['three padding characters', 'A==='],
        ['padding on a partial quantum', 'AAAAA='],
        ['non-ASCII', 'AAÀA'],
    ])('rejects %s', (_label, value) => {
        expect(IsValidBase64(value)).toBe(false);
    });
});

describe('base64 implementations', () => {
    afterEach(() => {
        // Defensive: a failed test must not leave the stand-in installed for the next one.
        delete (Uint8Array as unknown as Record<string, unknown>).fromBase64;
        delete (Uint8Array.prototype as unknown as Record<string, unknown>).toBase64;
    });

    it('lists the native API first, then Node Buffer, then atob/btoa', () => {
        expect(Base64Codecs.map(c => c.Name)).toEqual([
            'Uint8Array.fromBase64 / toBase64',
            'Node Buffer',
            'atob / btoa',
        ]);
    });

    it('detects the native API by duck typing', () => {
        expect(nativeCodec.IsAvailable()).toBe(false); // Node 22 has no Uint8Array.fromBase64
        const native = installNativeBase64();
        expect(nativeCodec.IsAvailable()).toBe(true);
        native.restore();
        expect(nativeCodec.IsAvailable()).toBe(false);
    });

    it('selects Node Buffer on Node, and keeps that choice for the life of the process', () => {
        expect(GetBase64Codec()).toBe(nodeCodec);
        const native = installNativeBase64();
        expect(GetBase64Codec()).toBe(nodeCodec); // selection is cached, not re-evaluated
        native.restore();
    });

    it('calls the native API with loose final-chunk handling, so unpadded input decodes', () => {
        const native = installNativeBase64();
        expect(Array.from(nativeCodec.Decode('AQI'))).toEqual([1, 2]);
        expect(nativeCodec.Encode(new Uint8Array([1, 2]))).toBe('AQI=');
        expect(native.calls).toEqual(['fromBase64:loose', 'toBase64']);
        native.restore();
    });

    it.each([0, 1, 2, 3, 4, 5, 255, 256, 1536 * 4, 0x8000 - 1, 0x8000, 0x8000 + 1, 200_000])(
        'produces identical strings and bytes in every implementation for %i bytes',
        length => {
            const native = installNativeBase64();
            const bytes = bytesOf(length, length + 1);
            const expected = Buffer.from(bytes).toString('base64');
            for (const codec of Base64Codecs) {
                expect(codec.Encode(bytes), codec.Name).toBe(expected);
                expect(Array.from(codec.Decode(expected)), codec.Name).toEqual(Array.from(bytes));
            }
            native.restore();
        },
    );

    it('encodes only the viewed range of a subarray in every implementation', () => {
        const native = installNativeBase64();
        const backing = bytesOf(64);
        const view = backing.subarray(5, 21);
        const expected = Buffer.from(view).toString('base64');
        for (const codec of Base64Codecs) expect(codec.Encode(view), codec.Name).toBe(expected);
        native.restore();
    });

    it('returns bytes that own their buffer from the Node implementation, never a pooled view', () => {
        const decoded = nodeCodec.Decode('AQID');
        expect(decoded.byteOffset).toBe(0);
        expect(decoded.buffer.byteLength).toBe(3);
        expect(Buffer.isBuffer(decoded)).toBe(false);
    });

    it('reports the portable implementation as available wherever atob and btoa exist', () => {
        expect(portableCodec.IsAvailable()).toBe(true);
    });
});

describe('BytesToBase64 / Base64ToBytes', () => {
    it('round-trips every byte value', () => {
        const all = new Uint8Array(256).map((_, i) => i);
        expect(Array.from(Base64ToBytes(BytesToBase64(all)))).toEqual(Array.from(all));
    });

    it('maps zero bytes to the empty string and back', () => {
        expect(BytesToBase64(new Uint8Array(0))).toBe('');
        expect(Base64ToBytes('').length).toBe(0);
    });

    it('accepts a Node Buffer as input', () => {
        expect(BytesToBase64(Buffer.from([1, 2, 3]))).toBe('AQID');
    });

    it('decodes unpadded input the same as padded input', () => {
        expect(Array.from(Base64ToBytes('AQI'))).toEqual(Array.from(Base64ToBytes('AQI=')));
    });

    it('throws on invalid input instead of guessing, unlike a lenient Buffer.from', () => {
        expect(Buffer.from('AA AA', 'base64').length).toBeGreaterThan(0); // Node alone would accept this
        expect(() => Base64ToBytes('AA AA')).toThrow('Invalid base64 value (length 5)');
        expect(() => Base64ToBytes('A')).toThrow('Invalid base64');
    });

    it('returns null from TryBase64ToBytes for missing or invalid input', () => {
        expect(TryBase64ToBytes(null)).toBeNull();
        expect(TryBase64ToBytes(undefined)).toBeNull();
        expect(TryBase64ToBytes('not base64!')).toBeNull();
        expect(TryBase64ToBytes('')?.length).toBe(0);
        expect(Array.from(TryBase64ToBytes('AQID') ?? [])).toEqual([1, 2, 3]);
    });
});

describe('IsByteArray', () => {
    it('recognises Uint8Array and Node Buffer, and nothing else', () => {
        expect(IsByteArray(new Uint8Array(1))).toBe(true);
        expect(IsByteArray(Buffer.from('x'))).toBe(true);
        expect(IsByteArray('AQID')).toBe(false);
        expect(IsByteArray(new Uint16Array(1))).toBe(false);
        expect(IsByteArray(new ArrayBuffer(4))).toBe(false);
        expect(IsByteArray(null)).toBe(false);
        expect(IsByteArray({ type: 'Buffer', data: [1] })).toBe(false);
    });
});

describe('float32 vectors', () => {
    const sample = [0, 1, -1, 0.5, -2.25, 3.4028234663852886e38, 1e-45, Math.PI];

    it('writes little-endian IEEE-754 single precision, 4 bytes per value, no header', () => {
        const bytes = Float32VectorToBytes([1, -2]);
        // 1.0f = 0x3F800000, -2.0f = 0xC0000000, least significant byte first
        expect(Array.from(bytes)).toEqual([0x00, 0x00, 0x80, 0x3f, 0x00, 0x00, 0x00, 0xc0]);
    });

    it('produces identical bytes and values in both implementations', () => {
        const [typedArray, dataView] = Float32VectorCodecs;
        const expected = typedArray.Encode(sample);
        expect(Array.from(dataView.Encode(sample))).toEqual(Array.from(expected));
        expect(Array.from(dataView.Decode(expected))).toEqual(Array.from(typedArray.Decode(expected)));
    });

    it('round-trips through bytes and through base64, rounding to single precision', () => {
        const expected = Array.from(Float32Array.from(sample));
        expect(Array.from(BytesToFloat32Vector(Float32VectorToBytes(sample)) ?? [])).toEqual(expected);
        expect(Array.from(Base64ToFloat32Vector(Float32VectorToBase64(sample)) ?? [])).toEqual(expected);
        expect(Base64ToFloat32Vector(Float32VectorToBase64([0.1]))?.[0]).toBe(Math.fround(0.1));
    });

    it('accepts a Float32Array as input', () => {
        const source = Float32Array.from([1.5, 2.5]);
        expect(Array.from(BytesToFloat32Vector(Float32VectorToBytes(source)) ?? [])).toEqual([1.5, 2.5]);
    });

    it('preserves NaN and infinities, leaving validation to the caller', () => {
        const decoded = Base64ToFloat32Vector(Float32VectorToBase64([NaN, Infinity, -Infinity]));
        expect(Number.isNaN(decoded?.[0])).toBe(true);
        expect(decoded?.[1]).toBe(Infinity);
        expect(decoded?.[2]).toBe(-Infinity);
    });

    it('decodes from a misaligned view, such as a pooled Node Buffer, in both implementations', () => {
        const encoded = Float32VectorToBytes([1, 2, 3]);
        const backing = new Uint8Array(encoded.length + 1);
        backing.set(encoded, 1);
        const misaligned = backing.subarray(1); // byteOffset 1: a Float32Array view over it would throw
        for (const codec of Float32VectorCodecs) {
            expect(Array.from(codec.Decode(misaligned)), codec.Name).toEqual([1, 2, 3]);
        }
        expect(Array.from(BytesToFloat32Vector(misaligned) ?? [])).toEqual([1, 2, 3]);
    });

    it('returns a vector that owns its memory, so later writes to the source do not leak in', () => {
        const bytes = Float32VectorToBytes([1, 2]);
        const decoded = BytesToFloat32Vector(bytes);
        bytes.fill(0);
        expect(Array.from(decoded ?? [])).toEqual([1, 2]);
    });

    it.each([
        ['null', null],
        ['undefined', undefined],
        ['zero bytes', new Uint8Array(0)],
        ['6 bytes (not a whole number of values)', new Uint8Array(6)],
        ['1 byte', new Uint8Array(1)],
    ])('returns null for %s', (_label, bytes) => {
        expect(BytesToFloat32Vector(bytes)).toBeNull();
    });

    it('returns null for a missing, invalid or truncated base64 vector', () => {
        expect(Base64ToFloat32Vector(null)).toBeNull();
        expect(Base64ToFloat32Vector('')).toBeNull();
        expect(Base64ToFloat32Vector('%%%%')).toBeNull();
        expect(Base64ToFloat32Vector(Buffer.from([1, 2, 3, 4, 5, 6]).toString('base64'))).toBeNull();
    });

    it('encodes an empty vector as zero bytes', () => {
        expect(Float32VectorToBytes([]).length).toBe(0);
        expect(Float32VectorToBase64([])).toBe('');
    });
});
