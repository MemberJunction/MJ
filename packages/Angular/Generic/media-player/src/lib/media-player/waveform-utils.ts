/**
 * Pure, framework-agnostic waveform math for the media player.
 *
 * These helpers turn a raw mono PCM channel (a `Float32Array` of sample amplitudes,
 * typically in the `[-1, 1]` range that the Web Audio API produces) into a small,
 * fixed-size array of normalized `0..1` peak values — one per rendered waveform bar.
 *
 * They carry no DOM / Angular / `AudioContext` dependency so they can be unit-tested
 * in isolation, mirroring how `cue-utils.ts` splits the cue math out of the component.
 */

/** How each downsample bucket is reduced to a single amplitude. */
export type WaveformAggregation = 'max-abs' | 'rms';

/** The default number of bars a waveform renders at. */
export const DEFAULT_WAVEFORM_BARS = 160;

/**
 * Downsamples a raw mono sample buffer into `barCount` per-bucket amplitudes and
 * normalizes the result to `0..1` (the loudest bucket becomes `1`).
 *
 * The samples are partitioned into `barCount` contiguous, (near-)equal buckets in
 * index order; each bucket is reduced to one amplitude via `aggregation`:
 *  - `'max-abs'` (default) — the maximum absolute sample in the bucket (crisp peaks),
 *  - `'rms'` — the root-mean-square of the bucket (smoother, energy-weighted).
 *
 * Edge cases:
 *  - empty / null input → an array of `barCount` zeros,
 *  - fewer samples than bars → every sample still lands in a bucket; trailing empty
 *    buckets are `0` (no out-of-bounds reads),
 *  - a silent or constant-zero buffer → all zeros (normalization is skipped when the
 *    peak is `0`, so we never divide by zero).
 *
 * @param samples raw mono channel data (e.g. `AudioBuffer.getChannelData(0)`)
 * @param barCount number of output bars (clamped to `>= 1`)
 * @param aggregation per-bucket reducer (default `'max-abs'`)
 * @returns a `barCount`-length array of normalized `0..1` peaks
 */
export function downsamplePeaks(
  samples: Float32Array | number[] | null | undefined,
  barCount: number = DEFAULT_WAVEFORM_BARS,
  aggregation: WaveformAggregation = 'max-abs',
): number[] {
  const bars = Math.max(1, Math.floor(barCount));
  const length = samples ? samples.length : 0;
  if (length === 0) {
    return new Array<number>(bars).fill(0);
  }

  const raw = aggregateBuckets(samples as Float32Array | number[], length, bars, aggregation);
  return normalizePeaks(raw);
}

/**
 * Reduces a sample buffer to `bars` per-bucket amplitudes (un-normalized).
 * Buckets are contiguous and index-ordered; the last bucket absorbs any remainder.
 */
function aggregateBuckets(
  samples: Float32Array | number[],
  length: number,
  bars: number,
  aggregation: WaveformAggregation,
): number[] {
  const out = new Array<number>(bars).fill(0);
  const bucketSize = length / bars;

  for (let b = 0; b < bars; b++) {
    const start = Math.floor(b * bucketSize);
    const end = b === bars - 1 ? length : Math.floor((b + 1) * bucketSize);
    out[b] = reduceBucket(samples, start, end, aggregation);
  }
  return out;
}

/** Reduces one bucket `[start, end)` of `samples` to a single amplitude. */
function reduceBucket(
  samples: Float32Array | number[],
  start: number,
  end: number,
  aggregation: WaveformAggregation,
): number {
  if (end <= start) {
    return 0;
  }
  if (aggregation === 'rms') {
    let sumSquares = 0;
    for (let i = start; i < end; i++) {
      const v = samples[i];
      sumSquares += v * v;
    }
    return Math.sqrt(sumSquares / (end - start));
  }
  // 'max-abs'
  let peak = 0;
  for (let i = start; i < end; i++) {
    const v = Math.abs(samples[i]);
    if (v > peak) {
      peak = v;
    }
  }
  return peak;
}

/**
 * Normalizes an array of non-negative amplitudes to `0..1` by dividing by the maximum.
 * Returns a copy. When the maximum is `0` (silence) or non-finite, returns the values
 * clamped to `[0, 1]` without scaling (so an all-zero input stays all-zero).
 */
export function normalizePeaks(values: number[]): number[] {
  let max = 0;
  for (const v of values) {
    const a = Math.abs(v);
    if (a > max) {
      max = a;
    }
  }
  if (max <= 0 || !isFinite(max)) {
    return values.map((v) => clamp01(v));
  }
  return values.map((v) => clamp01(Math.abs(v) / max));
}

/** Clamps a number to the `[0, 1]` range. */
export function clamp01(v: number): number {
  if (!isFinite(v) || v < 0) {
    return 0;
  }
  if (v > 1) {
    return 1;
  }
  return v;
}
