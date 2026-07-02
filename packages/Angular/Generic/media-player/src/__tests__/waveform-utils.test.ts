import { describe, it, expect } from 'vitest';
import {
  clamp01,
  DEFAULT_WAVEFORM_BARS,
  downsamplePeaks,
  normalizePeaks,
} from '../lib/media-player/waveform-utils';

describe('downsamplePeaks', () => {
  it('produces exactly barCount bars', () => {
    const samples = new Float32Array(1000).map((_, i) => Math.sin(i));
    expect(downsamplePeaks(samples, 160).length).toBe(160);
    expect(downsamplePeaks(samples, 32).length).toBe(32);
    expect(downsamplePeaks(samples, 1).length).toBe(1);
  });

  it('defaults to DEFAULT_WAVEFORM_BARS', () => {
    const samples = new Float32Array(500).fill(0.5);
    expect(downsamplePeaks(samples).length).toBe(DEFAULT_WAVEFORM_BARS);
  });

  it('downsamples a known buffer into expected per-bucket max-abs peaks (normalized)', () => {
    // 8 samples, 4 buckets of 2 → bucket maxima [0.2, 0.4, 0.6, 0.8] → /0.8 = [0.25, 0.5, 0.75, 1]
    const samples = [0.1, 0.2, -0.3, 0.4, 0.5, -0.6, 0.7, 0.8];
    const peaks = downsamplePeaks(samples, 4, 'max-abs');
    expect(peaks).toHaveLength(4);
    expect(peaks[0]).toBeCloseTo(0.25, 6);
    expect(peaks[1]).toBeCloseTo(0.5, 6);
    expect(peaks[2]).toBeCloseTo(0.75, 6);
    expect(peaks[3]).toBeCloseTo(1, 6);
  });

  it('takes the absolute value (negative samples count as amplitude)', () => {
    const samples = [-1, -0.5, -0.25, -0.125];
    const peaks = downsamplePeaks(samples, 2, 'max-abs');
    // bucket0 max-abs = 1, bucket1 max-abs = 0.25 → normalized [1, 0.25]
    expect(peaks[0]).toBeCloseTo(1, 6);
    expect(peaks[1]).toBeCloseTo(0.25, 6);
  });

  it('supports RMS aggregation', () => {
    // single bucket: rms of [0.6, 0.8] = sqrt((0.36+0.64)/2) = sqrt(0.5) ≈ 0.7071, normalized → 1
    const samples = [0.6, 0.8];
    const peaks = downsamplePeaks(samples, 1, 'rms');
    expect(peaks[0]).toBeCloseTo(1, 6);
  });

  it('normalizes so the loudest bar is 1 and all bars are within [0,1]', () => {
    const samples = new Float32Array(640).map((_, i) => 0.3 * Math.sin(i / 3));
    const peaks = downsamplePeaks(samples, 64);
    const max = Math.max(...peaks);
    expect(max).toBeCloseTo(1, 5);
    for (const p of peaks) {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
  });

  it('returns all-zero bars for empty / null / undefined input', () => {
    expect(downsamplePeaks([], 5)).toEqual([0, 0, 0, 0, 0]);
    expect(downsamplePeaks(null, 3)).toEqual([0, 0, 0]);
    expect(downsamplePeaks(undefined, 3)).toEqual([0, 0, 0]);
  });

  it('returns all-zero bars for a silent (constant-zero) buffer (no divide-by-zero)', () => {
    const peaks = downsamplePeaks(new Float32Array(100), 10);
    expect(peaks).toHaveLength(10);
    expect(peaks.every((p) => p === 0)).toBe(true);
  });

  it('handles fewer samples than bars — every sample lands in a bucket, trailing buckets are 0', () => {
    // 2 samples, 5 bars. bucketSize=0.4 → buckets start at floor(0,0.4,0.8,1.2,1.6)=[0,0,0,1,1]
    // ends (non-last) at floor(0.4,0.8,1.2,1.6)=[0,0,1,1]; last bucket ends at length(2).
    const peaks = downsamplePeaks([0.5, 1.0], 5, 'max-abs');
    expect(peaks).toHaveLength(5);
    // loudest sample is 1.0 → some bucket normalizes to 1
    expect(Math.max(...peaks)).toBeCloseTo(1, 6);
    // no NaN / out-of-range
    for (const p of peaks) {
      expect(Number.isFinite(p)).toBe(true);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
  });

  it('clamps barCount to at least 1', () => {
    expect(downsamplePeaks([0.5], 0).length).toBe(1);
    expect(downsamplePeaks([0.5], -10).length).toBe(1);
  });
});

describe('normalizePeaks', () => {
  it('scales so the max becomes 1', () => {
    expect(normalizePeaks([0.1, 0.2, 0.4])).toEqual([0.25, 0.5, 1]);
  });

  it('leaves an all-zero array all-zero', () => {
    expect(normalizePeaks([0, 0, 0])).toEqual([0, 0, 0]);
  });

  it('clamps without scaling when max is non-finite', () => {
    const out = normalizePeaks([Infinity, 0.5, -1]);
    // Infinity → max non-finite → clamp only: Infinity→0, 0.5→0.5, -1→0
    expect(out).toEqual([0, 0.5, 0]);
  });

  it('uses absolute value for negatives', () => {
    expect(normalizePeaks([-0.5, -1])).toEqual([0.5, 1]);
  });

  it('is monotonic — order of magnitudes is preserved after normalization', () => {
    const input = [0.05, 0.1, 0.2, 0.35, 0.5];
    const out = normalizePeaks(input);
    for (let i = 1; i < out.length; i++) {
      expect(out[i]).toBeGreaterThan(out[i - 1]);
    }
    expect(out[out.length - 1]).toBeCloseTo(1, 6);
  });
});

describe('clamp01', () => {
  it('clamps below 0 to 0', () => {
    expect(clamp01(-5)).toBe(0);
  });
  it('clamps above 1 to 1', () => {
    expect(clamp01(5)).toBe(1);
  });
  it('passes through in-range values', () => {
    expect(clamp01(0.42)).toBe(0.42);
  });
  it('treats non-finite as 0', () => {
    expect(clamp01(NaN)).toBe(0);
    expect(clamp01(Infinity)).toBe(0);
  });
});
