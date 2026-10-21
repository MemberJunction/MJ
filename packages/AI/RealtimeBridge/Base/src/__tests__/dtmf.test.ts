import { describe, it, expect } from 'vitest';
import {
    DTMF_FREQUENCIES,
    GenerateDtmfMuLaw,
    GenerateDtmfPcm16,
    IsValidDtmfDigits,
    MAX_DTMF_DIGITS,
    MuLawToPcm16,
} from '../audio/index';

/** Goertzel power of `freq` in `samples` (a standard single-bin DFT). */
function Goertzel(samples: Int16Array, freq: number, rate: number): number {
    const k = (2 * Math.PI * freq) / rate;
    const coeff = 2 * Math.cos(k);
    let s1 = 0;
    let s2 = 0;
    for (const x of samples) {
        const s0 = x + coeff * s1 - s2;
        s2 = s1;
        s1 = s0;
    }
    return s1 * s1 + s2 * s2 - coeff * s1 * s2;
}

describe('IsValidDtmfDigits', () => {
    it('accepts 0-9, * and #', () => {
        expect(IsValidDtmfDigits('0123456789*#')).toBe(true);
    });
    it('rejects empty, letters, whitespace, and over-long strings', () => {
        expect(IsValidDtmfDigits('')).toBe(false);
        expect(IsValidDtmfDigits('12a')).toBe(false);
        expect(IsValidDtmfDigits('1 2')).toBe(false);
        expect(IsValidDtmfDigits('1'.repeat(MAX_DTMF_DIGITS + 1))).toBe(false);
        expect(IsValidDtmfDigits('1'.repeat(MAX_DTMF_DIGITS))).toBe(true);
    });
});

describe('GenerateDtmfPcm16', () => {
    it('throws on invalid digits', () => {
        expect(() => GenerateDtmfPcm16('x')).toThrow();
    });

    it('lasts 100 ms per tone plus a 100 ms gap between digits at 8 kHz', () => {
        expect(GenerateDtmfPcm16('5').length).toBe(800);
        expect(GenerateDtmfPcm16('57').length).toBe(800 + 800 + 800);
    });

    it.each(Object.keys(DTMF_FREQUENCIES))('key %s carries exactly its two Q.23 frequencies', (digit) => {
        const pcm = GenerateDtmfPcm16(digit, 8000);
        const [low, high] = DTMF_FREQUENCIES[digit];
        const present = Goertzel(pcm, low, 8000) + Goertzel(pcm, high, 8000);
        // Frequencies a different key would use but this one does not (all other group members).
        const others = [697, 770, 852, 941, 1209, 1336, 1477].filter((f) => f !== low && f !== high);
        for (const f of others) {
            expect(Goertzel(pcm, f, 8000)).toBeLessThan(present * 0.01);
        }
        expect(Goertzel(pcm, low, 8000)).toBeGreaterThan(present * 0.3);
        expect(Goertzel(pcm, high, 8000)).toBeGreaterThan(present * 0.3);
    });

    it('keeps the gap silent', () => {
        const pcm = GenerateDtmfPcm16('12', 8000);
        const gap = pcm.subarray(800, 1600);
        expect(Math.max(...Array.from(gap).map(Math.abs))).toBe(0);
    });

    it('does not clip', () => {
        const pcm = GenerateDtmfPcm16('0123456789*#', 8000);
        expect(Math.max(...Array.from(pcm).map(Math.abs))).toBeLessThan(32767 * 0.6);
    });
});

describe('GenerateDtmfMuLaw', () => {
    it('round-trips through the G.711 decoder with both tones intact', () => {
        const decoded = MuLawToPcm16(GenerateDtmfMuLaw('1'));
        expect(decoded.length).toBe(800);
        const total = Goertzel(decoded, 697, 8000) + Goertzel(decoded, 1209, 8000);
        expect(Goertzel(decoded, 1336, 8000)).toBeLessThan(total * 0.02);
        expect(Goertzel(decoded, 697, 8000)).toBeGreaterThan(total * 0.3);
    });
});
