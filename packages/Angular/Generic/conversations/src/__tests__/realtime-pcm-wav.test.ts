import { describe, it, expect } from 'vitest';
import { encodePcm16Wav, downsamplePeaks, PeakAccumulator, WAV_HEADER_BYTES } from '../lib/services/realtime-pcm-wav';

/** Read the little-endian Int16 PCM samples out of an encoded WAV ArrayBuffer (skip the 44-byte header). */
function readWavSamples(buffer: ArrayBuffer): Int16Array {
    const view = new DataView(buffer);
    const dataBytes = buffer.byteLength - WAV_HEADER_BYTES;
    const out = new Int16Array(dataBytes / 2);
    for (let i = 0; i < out.length; i++) {
        out[i] = view.getInt16(WAV_HEADER_BYTES + i * 2, true);
    }
    return out;
}

function ascii(view: DataView, offset: number, len: number): string {
    let s = '';
    for (let i = 0; i < len; i++) {
        s += String.fromCharCode(view.getUint8(offset + i));
    }
    return s;
}

describe('encodePcm16Wav', () => {
    it('produces a canonical RIFF/WAVE/fmt/data header (mono, 16-bit, given rate)', () => {
        const samples = new Float32Array([0, 0.5, -0.5, 1]);
        const buffer = encodePcm16Wav(samples, 24000);
        const view = new DataView(buffer);

        expect(ascii(view, 0, 4)).toBe('RIFF');
        expect(ascii(view, 8, 4)).toBe('WAVE');
        expect(ascii(view, 12, 4)).toBe('fmt ');
        expect(ascii(view, 36, 4)).toBe('data');

        expect(view.getUint32(16, true)).toBe(16); // Subchunk1Size for PCM
        expect(view.getUint16(20, true)).toBe(1); // PCM format
        expect(view.getUint16(22, true)).toBe(1); // mono
        expect(view.getUint32(24, true)).toBe(24000); // sample rate
        expect(view.getUint16(34, true)).toBe(16); // bits per sample
        expect(view.getUint16(32, true)).toBe(2); // block align = 1ch * 2 bytes
        expect(view.getUint32(28, true)).toBe(24000 * 2); // byte rate
    });

    it('sets data length and RIFF chunk size from the sample count', () => {
        const samples = new Float32Array(10);
        const buffer = encodePcm16Wav(samples, 48000);
        const view = new DataView(buffer);
        const dataSize = view.getUint32(40, true);
        expect(dataSize).toBe(10 * 2);
        expect(view.getUint32(4, true)).toBe(36 + dataSize);
        expect(buffer.byteLength).toBe(WAV_HEADER_BYTES + dataSize);
    });

    it('round-trips representative float samples to PCM16 with full-scale clamping', () => {
        const samples = new Float32Array([0, 1, -1, 2, -2, 0.5]);
        const buffer = encodePcm16Wav(samples, 24000);
        const pcm = readWavSamples(buffer);
        expect(pcm[0]).toBe(0);
        expect(pcm[1]).toBe(32767); // +1 full scale
        expect(pcm[2]).toBe(-32768); // -1 full scale
        expect(pcm[3]).toBe(32767); // +2 clamped
        expect(pcm[4]).toBe(-32768); // -2 clamped
        expect(pcm[5]).toBe(Math.round(0.5 * 32767));
    });

    it('encodes an empty buffer as a header-only WAV', () => {
        const buffer = encodePcm16Wav(new Float32Array(0), 24000);
        expect(buffer.byteLength).toBe(WAV_HEADER_BYTES);
        const view = new DataView(buffer);
        expect(view.getUint32(40, true)).toBe(0);
    });
});

describe('downsamplePeaks', () => {
    it('returns exactly targetBuckets values for a buffer longer than the target', () => {
        const samples = new Float32Array(6000);
        for (let i = 0; i < samples.length; i++) {
            samples[i] = Math.sin(i / 50);
        }
        const peaks = downsamplePeaks(samples, 600);
        expect(peaks.length).toBe(600);
    });

    it('normalizes to a max of 1 and stays within 0..1', () => {
        const samples = new Float32Array([0.1, 0.2, 0.05, 0.5, 0.25, 0.4]);
        const peaks = downsamplePeaks(samples, 3);
        expect(peaks.length).toBe(3);
        const max = Math.max(...peaks);
        expect(max).toBeCloseTo(1, 6);
        for (const p of peaks) {
            expect(p).toBeGreaterThanOrEqual(0);
            expect(p).toBeLessThanOrEqual(1);
        }
    });

    it('computes per-bucket max-abs (bucket containing the global peak normalizes to 1)', () => {
        // 4 samples, 2 buckets: bucket0 = max(|0.2|,|−0.1|)=0.2, bucket1 = max(|0.8|,|0.4|)=0.8
        const samples = new Float32Array([0.2, -0.1, 0.8, 0.4]);
        const peaks = downsamplePeaks(samples, 2);
        expect(peaks.length).toBe(2);
        expect(peaks[0]).toBeCloseTo(0.2 / 0.8, 6);
        expect(peaks[1]).toBeCloseTo(1, 6);
    });

    it('yields [] for an empty buffer and for an all-silent buffer', () => {
        expect(downsamplePeaks(new Float32Array(0), 600)).toEqual([]);
        expect(downsamplePeaks(new Float32Array(100), 50)).toEqual([]);
    });

    it('produces at most samples.length buckets for a short buffer', () => {
        const peaks = downsamplePeaks(new Float32Array([0.5, 0.25]), 600);
        expect(peaks.length).toBe(2);
    });
});

describe('PeakAccumulator', () => {
    it('stays bounded under 2x target buckets regardless of input length', () => {
        const acc = new PeakAccumulator(64);
        // Push far more samples than 2x the target — must fold repeatedly and stay bounded.
        const block = new Float32Array(10000).fill(0.3);
        for (let n = 0; n < 50; n++) {
            acc.Push(block);
        }
        expect(acc.BucketCount).toBeLessThan(64 * 2);
    });

    it('matches one-shot downsampling closely for a constant signal (all buckets equal)', () => {
        const acc = new PeakAccumulator(8);
        acc.Push(new Float32Array(800).fill(0.5));
        const peaks = acc.Normalize();
        expect(peaks.length).toBeGreaterThan(0);
        for (const p of peaks) {
            expect(p).toBeCloseTo(1, 6); // constant signal → every bucket is the max → 1 after normalize
        }
    });

    it('normalizes the loudest bucket to 1', () => {
        const acc = new PeakAccumulator(4);
        acc.Push(new Float32Array([0.1, 0.1, 0.9, 0.1, 0.2, 0.2, 0.3, 0.3]));
        const peaks = acc.Normalize();
        expect(Math.max(...peaks)).toBeCloseTo(1, 6);
        for (const p of peaks) {
            expect(p).toBeGreaterThanOrEqual(0);
            expect(p).toBeLessThanOrEqual(1);
        }
    });

    it('returns [] before any samples and for silence', () => {
        expect(new PeakAccumulator(600).Normalize()).toEqual([]);
        const acc = new PeakAccumulator(600);
        acc.Push(new Float32Array(1000)); // all zeros
        expect(acc.Normalize()).toEqual([]);
    });
});
