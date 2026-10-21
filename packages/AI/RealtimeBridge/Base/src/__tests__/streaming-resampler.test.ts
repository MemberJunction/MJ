import { describe, it, expect } from 'vitest';
import { StreamingResampler, ResamplePcm16 } from '../audio/index';

function Sine(freq: number, rate: number, count: number, amplitude = 10000): Int16Array {
    const out = new Int16Array(count);
    for (let n = 0; n < count; n++) {
        out[n] = Math.round(amplitude * Math.sin((2 * Math.PI * freq * n) / rate));
    }
    return out;
}

function Rms(samples: Int16Array, skip = 0): number {
    let sum = 0;
    for (let i = skip; i < samples.length; i++) {
        sum += samples[i] * samples[i];
    }
    return Math.sqrt(sum / (samples.length - skip));
}

function Concat(parts: Int16Array[]): Int16Array {
    const out = new Int16Array(parts.reduce((s, p) => s + p.length, 0));
    let offset = 0;
    for (const p of parts) {
        out.set(p, offset);
        offset += p.length;
    }
    return out;
}

function ProcessInFrames(r: StreamingResampler, signal: Int16Array, frame: number): Int16Array {
    const parts: Int16Array[] = [];
    for (let i = 0; i < signal.length; i += frame) {
        parts.push(r.Process(signal.subarray(i, Math.min(i + frame, signal.length))));
    }
    return Concat(parts);
}

describe('StreamingResampler', () => {
    it('rejects non-positive rates', () => {
        expect(() => new StreamingResampler(0, 8000)).toThrow();
        expect(() => new StreamingResampler(8000, Number.NaN)).toThrow();
    });

    it('passes samples through unchanged when the rates match', () => {
        const input = Sine(440, 8000, 160);
        const out = new StreamingResampler(8000, 8000).Process(input);
        expect(Array.from(out)).toEqual(Array.from(input));
        expect(out).not.toBe(input);
    });

    describe('continuity across frame boundaries (upsampling 8k → 24k)', () => {
        it('produces the same stream whether fed in 20 ms frames or all at once', () => {
            const signal = Sine(500, 8000, 1600);
            const whole = new StreamingResampler(8000, 24000).Process(signal);
            const framed = ProcessInFrames(new StreamingResampler(8000, 24000), signal, 160);
            // The last frame's trailing sample is held back until the next frame; compare the common prefix.
            const common = Math.min(whole.length, framed.length);
            expect(common).toBeGreaterThan(4700);
            for (let i = 0; i < common; i++) {
                expect(Math.abs(whole[i] - framed[i])).toBeLessThanOrEqual(1);
            }
        });

        it('has no step at frame edges, unlike the stateless resampler', () => {
            const signal = Sine(300, 8000, 1600, 12000);
            const frame = 160;
            const maxSlope = 12000 * 2 * Math.PI * 300 / 24000 * 1.2; // per-sample slope bound of the 24 kHz sine
            const stateful = ProcessInFrames(new StreamingResampler(8000, 24000), signal, frame);
            const stateless = Concat(
                Array.from({ length: 10 }, (_, k) => ResamplePcm16(signal.subarray(k * frame, (k + 1) * frame), 8000, 24000)),
            );
            const worstJump = (s: Int16Array): number => {
                let worst = 0;
                for (let i = 1; i < s.length; i++) {
                    worst = Math.max(worst, Math.abs(s[i] - s[i - 1]));
                }
                return worst;
            };
            expect(worstJump(stateful)).toBeLessThanOrEqual(maxSlope);
            // The stateless version repeats the last sample at each edge, so the next real sample jumps by 3x the slope.
            expect(worstJump(stateless)).toBeGreaterThan(worstJump(stateful));
        });

        it('keeps total length proportional to the ratio over many frames', () => {
            const signal = Sine(500, 8000, 8000);
            const out = ProcessInFrames(new StreamingResampler(8000, 24000), signal, 160);
            expect(Math.abs(out.length - 24000)).toBeLessThanOrEqual(3);
        });
    });

    describe('anti-alias filtering (downsampling 24k → 8k)', () => {
        it('passes a 1 kHz tone with little loss', () => {
            const out = ProcessInFrames(new StreamingResampler(24000, 8000), Sine(1000, 24000, 4800), 480);
            expect(Rms(out, 40) / (10000 / Math.SQRT2)).toBeGreaterThan(0.95);
        });

        it('strongly attenuates a 6 kHz tone that would otherwise alias to 2 kHz', () => {
            const tone = Sine(6000, 24000, 4800);
            const filtered = ProcessInFrames(new StreamingResampler(24000, 8000), tone, 480);
            const naive = ResamplePcm16(tone, 24000, 8000);
            const filteredRatio = Rms(filtered, 40) / (10000 / Math.SQRT2);
            const naiveRatio = Rms(naive, 40) / (10000 / Math.SQRT2);
            expect(filteredRatio).toBeLessThan(0.05);
            expect(naiveRatio).toBeGreaterThan(0.5); // proves the test would catch a missing filter
        });

        it('halves length for 16k → 8k', () => {
            const out = ProcessInFrames(new StreamingResampler(16000, 8000), Sine(500, 16000, 3200), 320);
            expect(Math.abs(out.length - 1600)).toBeLessThanOrEqual(2);
        });
    });

    it('ProcessBuffer round-trips little-endian PCM16 and ignores a trailing odd byte', () => {
        const input = Sine(500, 24000, 480);
        const bytes = new ArrayBuffer(input.length * 2 + 1);
        const view = new DataView(bytes);
        input.forEach((s, i) => view.setInt16(i * 2, s, true));
        const out = new StreamingResampler(24000, 8000).ProcessBuffer(bytes);
        expect(out.byteLength % 2).toBe(0);
        expect(Math.abs(out.byteLength / 2 - 160)).toBeLessThanOrEqual(1);
    });

    it('Reset forgets carried state', () => {
        const r = new StreamingResampler(8000, 24000);
        const first = r.Process(Sine(500, 8000, 160));
        r.Reset();
        const again = r.Process(Sine(500, 8000, 160));
        expect(Array.from(again)).toEqual(Array.from(first));
    });
});
