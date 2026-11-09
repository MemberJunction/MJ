import { describe, it, expect } from 'vitest';
import { Base64Codecs, BytesToBase64, HasValidBase64Shape, IsValidBase64 } from '../util/BinaryEncoding';

/**
 * Strict validation is enforced twice: by `IsValidBase64` (a character scan, used by codecs without a
 * fused decoder) and by the Node codec's `TryDecode` (decode, then compare lengths — about five times
 * cheaper). The two must agree on EVERY input, or the same value would be accepted on one host and
 * refused on another. These tests pin that agreement, mostly by fuzzing.
 */
const nodeCodec = Base64Codecs.find(c => c.Name === 'Node Buffer');
if (!nodeCodec?.TryDecode) throw new Error('the Node Buffer codec must expose TryDecode');
const tryDecode = (value: string): Uint8Array | null => nodeCodec.TryDecode!(value);

/** Deterministic PRNG so a failing fuzz case reproduces. */
function mulberry32(seed: number): () => number {
    let a = seed;
    return () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
/** Characters a corrupted or foreign value might contain — URL-safe, whitespace, punctuation, non-ASCII. */
const HOSTILE = ['=', '-', '_', ' ', '\n', '\t', '\r', '.', '!', '*', '"', '\\', 'é', '€', '\u0000', '😀'];

describe('base64 validation: Node fused decode agrees with IsValidBase64', () => {
    it.each([
        ['', true],
        ['AA==', true],
        ['AAA=', true],
        ['AAAA', true],
        ['AAAAAA', true],
        ['AAAAAAA', true],
        ['A', false],
        ['A===', false],
        ['AA=', false],
        ['=AAA', false],
        ['AA==AAAA', false],
        ['AA-A', false],
        ['AA_A', false],
        ['AA A', false],
        ['AA\nA', false],
        ['AAAA\n', false],
        ['AAéA', false],
        ['data:AAAA', false],
    ])('%j → %s', (value, expected) => {
        expect(IsValidBase64(value)).toBe(expected);
        expect(tryDecode(value) !== null).toBe(expected);
    });

    it('decodes valid input to the same bytes the input encoded', () => {
        const rand = mulberry32(7);
        for (let n = 0; n < 300; n++) {
            const bytes = Uint8Array.from({ length: n }, () => Math.floor(rand() * 256));
            const encoded = BytesToBase64(bytes);
            expect(Array.from(tryDecode(encoded) ?? [])).toEqual(Array.from(bytes));
            expect(Array.from(tryDecode(encoded.replace(/=+$/, '')) ?? [])).toEqual(Array.from(bytes)); // unpadded
        }
    });

    it('agrees on 20,000 random strings mixing valid and hostile characters', () => {
        const rand = mulberry32(42);
        let accepted = 0;
        for (let n = 0; n < 20000; n++) {
            const length = Math.floor(rand() * 24);
            let value = '';
            for (let i = 0; i < length; i++) {
                value += rand() < 0.9 ? ALPHABET[Math.floor(rand() * ALPHABET.length)] : HOSTILE[Math.floor(rand() * HOSTILE.length)];
            }
            if (rand() < 0.3) value += rand() < 0.5 ? '=' : '==';
            const strict = IsValidBase64(value);
            if (strict) accepted++;
            expect({ value, fused: tryDecode(value) !== null }).toEqual({ value, fused: strict });
        }
        expect(accepted).toBeGreaterThan(1000); // the corpus exercises the accept path too
    });

    it('agrees when one character of a valid string is corrupted, at every position', () => {
        const encoded = BytesToBase64(Uint8Array.from({ length: 30 }, (_, i) => (i * 37) & 0xff));
        for (let i = 0; i < encoded.length; i++) {
            for (const bad of HOSTILE) {
                const value = encoded.slice(0, i) + bad + encoded.slice(i + 1);
                expect({ value, fused: tryDecode(value) !== null }).toEqual({ value, fused: IsValidBase64(value) });
            }
        }
    });
});

describe('HasValidBase64Shape', () => {
    it.each([
        ['', true], ['AA', true], ['AAA', true], ['AAAA', true], ['AA==', true], ['AAA=', true],
        ['A', false], ['AAAAA', false], ['AA=', false], ['A=', false],
    ])('%j → %s (length and padding only, characters ignored)', (value, expected) => {
        expect(HasValidBase64Shape(value)).toBe(expected);
    });

    it('does not inspect characters', () => {
        expect(HasValidBase64Shape('!!!!')).toBe(true);
    });
});
