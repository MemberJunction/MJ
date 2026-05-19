import { describe, it, expect } from 'vitest';
import {
    computeMinHash,
    jaccardEstimate,
    jaccardDistance,
    isEmptySignature,
    serializeSignature,
    deserializeSignature,
} from '../discovery/MinHashSketch.js';

describe('MinHashSketch', () => {
    describe('computeMinHash', () => {
        it('returns an empty signature for empty input', () => {
            const sig = computeMinHash([], 64);
            expect(sig.numHashes).toBe(64);
            expect(isEmptySignature(sig)).toBe(true);
        });

        it('produces a stable signature for the same input', () => {
            const sig1 = computeMinHash(['a', 'b', 'c'], 128);
            const sig2 = computeMinHash(['a', 'b', 'c'], 128);
            for (let i = 0; i < 128; i++) {
                expect(sig1.sketch[i]).toBe(sig2.sketch[i]);
            }
        });

        it('produces an identical signature regardless of input order', () => {
            const sig1 = computeMinHash(['a', 'b', 'c'], 64);
            const sig2 = computeMinHash(['c', 'a', 'b'], 64);
            for (let i = 0; i < 64; i++) {
                expect(sig1.sketch[i]).toBe(sig2.sketch[i]);
            }
        });

        it('normalizes values case-insensitively', () => {
            const sigLower = computeMinHash(['alice@example.com'], 64);
            const sigUpper = computeMinHash(['ALICE@EXAMPLE.COM'], 64);
            for (let i = 0; i < 64; i++) {
                expect(sigLower.sketch[i]).toBe(sigUpper.sketch[i]);
            }
        });

        it('ignores null and empty values', () => {
            const sigA = computeMinHash(['a', 'b'], 64);
            const sigB = computeMinHash(['a', null as unknown as string, '', 'b'], 64);
            for (let i = 0; i < 64; i++) {
                expect(sigA.sketch[i]).toBe(sigB.sketch[i]);
            }
        });
    });

    describe('jaccardEstimate', () => {
        it('estimates 1.0 for identical sets', () => {
            const sig1 = computeMinHash(['a', 'b', 'c', 'd', 'e'], 256);
            const sig2 = computeMinHash(['a', 'b', 'c', 'd', 'e'], 256);
            expect(jaccardEstimate(sig1, sig2)).toBe(1);
        });

        it('estimates ~0 for fully disjoint sets', () => {
            const setA = Array.from({ length: 1000 }, (_, i) => `setA_${i}`);
            const setB = Array.from({ length: 1000 }, (_, i) => `setB_${i}`);
            const sig1 = computeMinHash(setA, 256);
            const sig2 = computeMinHash(setB, 256);
            const j = jaccardEstimate(sig1, sig2);
            expect(j).toBeLessThan(0.05); // Random hash collisions only
        });

        it('estimates ~0.5 for 50%-overlapping sets within reasonable tolerance', () => {
            const common = Array.from({ length: 500 }, (_, i) => `common_${i}`);
            const aOnly = Array.from({ length: 500 }, (_, i) => `aOnly_${i}`);
            const bOnly = Array.from({ length: 500 }, (_, i) => `bOnly_${i}`);
            // |A∩B|=500, |A∪B|=1500 → true Jaccard = 1/3 ≈ 0.333
            const sigA = computeMinHash([...common, ...aOnly], 512);
            const sigB = computeMinHash([...common, ...bOnly], 512);
            const j = jaccardEstimate(sigA, sigB);
            // Allow ±0.05 tolerance on MinHash estimation at K=512
            expect(j).toBeGreaterThan(1 / 3 - 0.06);
            expect(j).toBeLessThan(1 / 3 + 0.06);
        });

        it('returns 0 when one signature is empty', () => {
            const empty = computeMinHash([], 128);
            const populated = computeMinHash(['a', 'b'], 128);
            expect(jaccardEstimate(empty, populated)).toBe(0);
            expect(jaccardEstimate(populated, empty)).toBe(0);
        });

        it('throws on mismatched numHashes', () => {
            const s1 = computeMinHash(['a'], 64);
            const s2 = computeMinHash(['a'], 128);
            expect(() => jaccardEstimate(s1, s2)).toThrow();
        });

        it('is symmetric', () => {
            const sigA = computeMinHash(['x', 'y', 'z'], 64);
            const sigB = computeMinHash(['y', 'z', 'w'], 64);
            expect(jaccardEstimate(sigA, sigB)).toBe(jaccardEstimate(sigB, sigA));
        });
    });

    describe('jaccardDistance', () => {
        it('is 0 for identical sets', () => {
            const sig = computeMinHash(['a', 'b'], 64);
            expect(jaccardDistance(sig, sig)).toBe(0);
        });

        it('is ~1 for disjoint sets', () => {
            const sigA = computeMinHash(
                Array.from({ length: 500 }, (_, i) => `a_${i}`),
                256,
            );
            const sigB = computeMinHash(
                Array.from({ length: 500 }, (_, i) => `b_${i}`),
                256,
            );
            expect(jaccardDistance(sigA, sigB)).toBeGreaterThan(0.95);
        });
    });

    describe('serialize / deserialize', () => {
        it('roundtrips identical sketches', () => {
            const original = computeMinHash(['a', 'b', 'c'], 128);
            const encoded = serializeSignature(original);
            const decoded = deserializeSignature(encoded, 128);
            expect(decoded.numHashes).toBe(128);
            for (let i = 0; i < 128; i++) {
                expect(decoded.sketch[i]).toBe(original.sketch[i]);
            }
        });

        it('produces a compact base64 representation', () => {
            const sig = computeMinHash(['a', 'b'], 128);
            const encoded = serializeSignature(sig);
            // 128 uint32 = 512 bytes → base64 = ceil(512/3)*4 = 684 chars
            expect(encoded.length).toBeLessThan(700);
            expect(typeof encoded).toBe('string');
        });

        it('throws on numHashes mismatch during deserialization', () => {
            const sig = computeMinHash(['a'], 64);
            const encoded = serializeSignature(sig);
            expect(() => deserializeSignature(encoded, 128)).toThrow();
        });
    });
});
