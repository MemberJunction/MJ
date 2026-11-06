import { describe, it, expect } from 'vitest';
import { GenerateMediaToken, MediaTokensEqual } from '../media-token';

describe('GenerateMediaToken', () => {
    it('is 256 bits of hex and never repeats', () => {
        const a = GenerateMediaToken();
        const b = GenerateMediaToken();
        expect(a).toMatch(/^[0-9a-f]{64}$/);
        expect(a).not.toBe(b);
    });
});

describe('MediaTokensEqual', () => {
    it('accepts identical tokens', () => {
        expect(MediaTokensEqual('abc', 'abc')).toBe(true);
    });

    it('rejects a different token of the same length', () => {
        expect(MediaTokensEqual('abc', 'abd')).toBe(false);
    });

    it('rejects a different length without throwing', () => {
        expect(MediaTokensEqual('abc', 'abcd')).toBe(false);
        expect(MediaTokensEqual('abcd', 'abc')).toBe(false);
    });

    it('rejects a missing or empty token', () => {
        expect(MediaTokensEqual('abc', undefined)).toBe(false);
        expect(MediaTokensEqual('abc', '')).toBe(false);
    });

    it('round-trips a generated token', () => {
        const token = GenerateMediaToken();
        expect(MediaTokensEqual(token, token)).toBe(true);
    });
});
