import { describe, it, expect } from 'vitest';
import { LinearResampler } from '../lib/services/recording/linear-resampler';
import { UnevenChunks } from './helpers/libopus-test-harness';

function sine(count: number, rate: number, hz = 300): Float32Array {
    const out = new Float32Array(count);
    for (let i = 0; i < count; i++) out[i] = Math.sin((2 * Math.PI * hz * i) / rate);
    return out;
}

function concat(parts: Float32Array[]): Float32Array {
    const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
    let offset = 0;
    for (const p of parts) {
        out.set(p, offset);
        offset += p.length;
    }
    return out;
}

describe('LinearResampler', () => {
    it('44100 → 48000 never runs ahead of the ideal count, lags by less than one input sample, and does not drift over a minute', () => {
        const resampler = new LinearResampler(44100, 48000);
        const oneInputSample = 48000 / 44100; // the most the output can wait for the sample it interpolates towards
        let input = 0;
        let output = 0;
        // 128-sample worklet quanta and 4096-sample ScriptProcessor buffers, interleaved.
        for (let n = 0; input < 44100 * 60; n++) {
            const size = n % 3 === 0 ? 4096 : 128;
            output += resampler.Process(new Float32Array(size)).length;
            input += size;
            const ideal = (input * 48000) / 44100;
            expect(output).toBeLessThanOrEqual(Math.ceil(ideal));
            expect(ideal - output).toBeLessThan(oneInputSample);
        }
        // At a whole number of seconds the count is the exact 48 kHz figure, ±1.
        const atSixtyOne = new LinearResampler(44100, 48000);
        let total = 0;
        for (let s = 0; s < 61; s++) total += atSixtyOne.Process(new Float32Array(44100)).length;
        expect(Math.abs(total - 61 * 48000)).toBeLessThanOrEqual(1);
    });

    it('is continuous across calls: uneven chunks produce exactly the samples one whole call does', () => {
        const signal = sine(44100, 44100);
        const whole = new LinearResampler(44100, 48000).Process(signal);
        const chunked = new LinearResampler(44100, 48000);
        const pieces = concat(UnevenChunks(signal).map((chunk) => chunked.Process(chunk)));
        expect(pieces.length).toBe(whole.length);
        for (let i = 0; i < whole.length; i++) expect(pieces[i]).toBeCloseTo(whole[i], 6);
    });

    it('tracks the signal: a resampled sine matches the same sine generated at 48 kHz', () => {
        const out = new LinearResampler(44100, 48000).Process(sine(44100, 44100));
        const ideal = sine(out.length, 48000);
        let maxError = 0;
        for (let i = 0; i < out.length; i++) maxError = Math.max(maxError, Math.abs(out[i] - ideal[i]));
        expect(maxError).toBeLessThan(0.01); // linear interpolation error for a 300 Hz tone
    });

    it('has no seam: no jump between the last sample of one call and the first of the next beyond the signal slope', () => {
        const resampler = new LinearResampler(44100, 48000);
        const signal = sine(8820, 44100);
        const a = resampler.Process(signal.subarray(0, 4410));
        const b = resampler.Process(signal.subarray(4410));
        const step = Math.abs(b[0] - a[a.length - 1]);
        const maxSlope = (2 * Math.PI * 300) / 48000;
        expect(step).toBeLessThanOrEqual(maxSlope + 1e-6);
    });

    it('48000 → 48000 passes input through unchanged and exact in count', () => {
        const resampler = new LinearResampler(48000, 48000);
        const block = sine(960, 48000);
        expect(resampler.Process(block)).toBe(block);
        expect(resampler.Process(new Float32Array(0)).length).toBe(0);
    });

    it('rejects non-integer or non-positive rates', () => {
        expect(() => new LinearResampler(0, 48000)).toThrow(/positive integer/);
        expect(() => new LinearResampler(44100.5, 48000)).toThrow(/positive integer/);
    });
});
