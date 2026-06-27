import { describe, it, expect } from 'vitest';
import { resamplePcm16, resamplePcm16Buffer } from '../audio/resample';

describe('resamplePcm16 (linear-interpolation PCM16 resampler)', () => {
    describe('length scaling by rate ratio', () => {
        it('doubles length on 8k → 16k upsample (±1)', () => {
            const input = new Int16Array(100);
            const out = resamplePcm16(input, 8000, 16000);
            expect(Math.abs(out.length - 200)).toBeLessThanOrEqual(1);
        });

        it('halves length on 16k → 8k downsample (±1)', () => {
            const input = new Int16Array(200);
            const out = resamplePcm16(input, 16000, 8000);
            expect(Math.abs(out.length - 100)).toBeLessThanOrEqual(1);
        });

        it('triples length on 8k → 24k upsample (±1)', () => {
            const input = new Int16Array(100);
            const out = resamplePcm16(input, 8000, 24000);
            expect(Math.abs(out.length - 300)).toBeLessThanOrEqual(1);
        });

        it('scales 24k → 16k by 2/3 (±1)', () => {
            const input = new Int16Array(300);
            const out = resamplePcm16(input, 24000, 16000);
            expect(Math.abs(out.length - 200)).toBeLessThanOrEqual(1);
        });
    });

    describe('signal preservation', () => {
        it('keeps a DC (constant) signal ≈ constant through up- and downsampling', () => {
            const dc = new Int16Array(128).fill(12000);

            const up = resamplePcm16(dc, 8000, 16000);
            for (const s of up) {
                expect(Math.abs(s - 12000)).toBeLessThanOrEqual(1);
            }

            const down = resamplePcm16(dc, 16000, 8000);
            for (const s of down) {
                expect(Math.abs(s - 12000)).toBeLessThanOrEqual(1);
            }
        });

        it('approximately preserves a low-frequency sine through 8k → 16k → 8k', () => {
            const sampleCount = 800;
            const input = new Int16Array(sampleCount);
            for (let i = 0; i < sampleCount; i++) {
                // 300 Hz — well within the telephony band where linear interp is accurate.
                input[i] = Math.round(Math.sin((2 * Math.PI * 300 * i) / 8000) * 15000);
            }

            const up = resamplePcm16(input, 8000, 16000);
            const roundTrip = resamplePcm16(up, 16000, 8000);

            expect(roundTrip.length).toBe(input.length);
            // Compare interior samples (skip the very edges where the hold-last boundary differs).
            let maxError = 0;
            for (let i = 2; i < input.length - 2; i++) {
                maxError = Math.max(maxError, Math.abs(input[i] - roundTrip[i]));
            }
            // Linear interpolation introduces some error on a sine, but for a low tone it stays small.
            expect(maxError).toBeLessThan(1500);
        });

        it('interpolates the midpoint between two samples on a 2x upsample', () => {
            const input = Int16Array.from([0, 1000]);
            const up = resamplePcm16(input, 8000, 16000);
            // Output index 1 maps to source position 0.5 → midpoint of 0 and 1000.
            expect(up[0]).toBe(0);
            expect(Math.abs(up[1] - 500)).toBeLessThanOrEqual(1);
        });
    });

    describe('edge cases', () => {
        it('returns a fresh copy (not the same reference) when rates are equal', () => {
            const input = Int16Array.from([1, 2, 3]);
            const out = resamplePcm16(input, 16000, 16000);
            expect(Array.from(out)).toEqual([1, 2, 3]);
            expect(out).not.toBe(input);
        });

        it('returns empty for empty input', () => {
            expect(resamplePcm16(new Int16Array(0), 8000, 16000).length).toBe(0);
        });

        it('throws on a non-positive source rate', () => {
            expect(() => resamplePcm16(new Int16Array(4), 0, 16000)).toThrow();
        });

        it('throws on a non-positive target rate', () => {
            expect(() => resamplePcm16(new Int16Array(4), 8000, -1)).toThrow();
        });
    });

    describe('resamplePcm16Buffer (ArrayBuffer wrapper)', () => {
        it('doubles the byte length on 8k → 16k (±2 bytes)', () => {
            const buffer = new ArrayBuffer(100 * 2); // 100 PCM16 samples
            const out = resamplePcm16Buffer(buffer, 8000, 16000);
            expect(Math.abs(out.byteLength - 200 * 2)).toBeLessThanOrEqual(2);
        });

        it('preserves a DC ArrayBuffer signal through resampling', () => {
            const samples = new Int16Array(64).fill(8000);
            const inBuffer = new ArrayBuffer(samples.length * 2);
            const inView = new DataView(inBuffer);
            samples.forEach((s, i) => inView.setInt16(i * 2, s, true));

            const outBuffer = resamplePcm16Buffer(inBuffer, 8000, 16000);
            const outView = new DataView(outBuffer);
            for (let i = 0; i < outBuffer.byteLength / 2; i++) {
                expect(Math.abs(outView.getInt16(i * 2, true) - 8000)).toBeLessThanOrEqual(1);
            }
        });
    });
});
