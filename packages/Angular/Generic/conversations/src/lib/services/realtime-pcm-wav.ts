/**
 * @fileoverview Pure, browser-and-node-safe helpers for the CLIENT-DIRECT realtime recorder:
 * encoding accumulated Float32 PCM into a seekable 16-bit PCM **WAV** container and computing a
 * bounded, downsampled waveform **peak** array at capture time.
 *
 * These functions are deliberately free of any browser API (`AudioContext`, `Blob`, …) so they can
 * be unit-tested in a plain Node environment. {@link RealtimeAudioRecorder} owns the live audio
 * graph and feeds the captured samples here.
 *
 * Why WAV (PCM) over webm/opus: a RIFF/WAVE header carries the exact duration and maps a byte
 * offset linearly to a time offset, so HTTP-range seeking is exact (no client-side duration nudge),
 * and peak extraction is trivial. The tradeoff is size — PCM WAV is larger than opus — which is
 * acceptable for these short session recordings.
 *
 * @module @memberjunction/ng-conversations/realtime-pcm-wav
 */

/** Lowest value representable by signed 16-bit PCM. */
const PCM16_MIN = -32768;
/** Highest value representable by signed 16-bit PCM. */
const PCM16_MAX = 32767;
/** Canonical WAV/PCM header size in bytes (RIFF + fmt + data chunk headers). */
export const WAV_HEADER_BYTES = 44;

/**
 * Converts one Float32 sample (nominally in `[-1, 1]`) to a clamped signed 16-bit integer.
 * Out-of-range values (a hot mix can briefly exceed unity) are clamped, not wrapped.
 */
function floatToPcm16(sample: number): number {
    const clamped = sample < -1 ? -1 : sample > 1 ? 1 : sample;
    // Asymmetric scaling: negative full-scale is -32768, positive is +32767.
    const scaled = clamped < 0 ? clamped * -PCM16_MIN : clamped * PCM16_MAX;
    const rounded = Math.round(scaled);
    return rounded < PCM16_MIN ? PCM16_MIN : rounded > PCM16_MAX ? PCM16_MAX : rounded;
}

/**
 * Encodes mono Float32 PCM samples as a canonical single-chunk 16-bit PCM WAV (RIFF/WAVE).
 * The returned `ArrayBuffer` is `WAV_HEADER_BYTES + samples.length * 2` bytes — a proper
 * 44-byte header followed by little-endian PCM16 data, so it is seekable and self-describing.
 *
 * @param samples Mono Float32 PCM in `[-1, 1]` (downmixed by the caller).
 * @param sampleRate Sample rate in Hz (from the capturing `AudioContext`).
 * @returns A standalone `ArrayBuffer` containing the full WAV file.
 */
export function encodePcm16Wav(samples: Float32Array, sampleRate: number): ArrayBuffer {
    const numChannels = 1;
    const bitsPerSample = 16;
    const bytesPerSample = bitsPerSample / 8;
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = samples.length * bytesPerSample;

    const buffer = new ArrayBuffer(WAV_HEADER_BYTES + dataSize);
    const view = new DataView(buffer);

    writeAscii(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true); // ChunkSize = 36 + Subchunk2Size
    writeAscii(view, 8, 'WAVE');

    writeAscii(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
    view.setUint16(20, 1, true); // AudioFormat = PCM
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);

    writeAscii(view, 36, 'data');
    view.setUint32(40, dataSize, true);

    let offset = WAV_HEADER_BYTES;
    for (let i = 0; i < samples.length; i++) {
        view.setInt16(offset, floatToPcm16(samples[i]), true);
        offset += bytesPerSample;
    }

    return buffer;
}

/** Writes an ASCII string into a {@link DataView} byte-by-byte at `offset`. */
function writeAscii(view: DataView, offset: number, text: string): void {
    for (let i = 0; i < text.length; i++) {
        view.setUint8(offset + i, text.charCodeAt(i));
    }
}

/**
 * A bounded, streaming waveform-peak accumulator. It maintains a fixed number of buckets
 * (`targetBuckets`) of max-absolute amplitude across the WHOLE recording regardless of length:
 * once every bucket has absorbed `samplesPerBucket` samples, the buckets are halved (pairwise
 * max-merged) and the per-bucket capacity doubles — so memory + cost stay O(targetBuckets) for an
 * arbitrarily long call. {@link Normalize} returns the final 0..1 peaks.
 */
export class PeakAccumulator {
    /** Target (max) number of buckets in the produced peak array. */
    private readonly targetBuckets: number;
    /** Current max-abs amplitude per bucket (length grows up to `2 * targetBuckets` before folding). */
    private buckets: number[] = [];
    /** How many samples each bucket currently absorbs before a new bucket opens. */
    private samplesPerBucket = 1;
    /** Samples absorbed into the current (last) bucket so far. */
    private samplesInCurrent = 0;

    /**
     * @param targetBuckets Desired bucket count (waveform resolution). Clamped to >= 1.
     *   ~600 gives a smooth overview waveform at trivial cost.
     */
    constructor(targetBuckets = 600) {
        this.targetBuckets = Math.max(1, Math.floor(targetBuckets));
    }

    /** Number of buckets currently held (for tests/inspection). */
    public get BucketCount(): number {
        return this.buckets.length;
    }

    /** Absorbs a block of Float32 PCM samples, updating the running per-bucket max-abs. */
    public Push(samples: Float32Array): void {
        for (let i = 0; i < samples.length; i++) {
            this.pushSample(samples[i]);
        }
    }

    /** Absorbs one sample into the current bucket, opening/folding buckets as capacity is reached. */
    private pushSample(sample: number): void {
        if (this.buckets.length === 0) {
            this.buckets.push(0);
            this.samplesInCurrent = 0;
        }
        const abs = sample < 0 ? -sample : sample;
        const last = this.buckets.length - 1;
        if (abs > this.buckets[last]) {
            this.buckets[last] = abs;
        }
        this.samplesInCurrent++;
        if (this.samplesInCurrent >= this.samplesPerBucket) {
            this.buckets.push(0);
            this.samplesInCurrent = 0;
            // Keep the bucket array bounded: once it reaches 2x the target, fold pairwise so the
            // resolution stays under the cap while the per-bucket sample capacity doubles.
            if (this.buckets.length >= this.targetBuckets * 2) {
                this.fold();
            }
        }
    }

    /** Pairwise max-merges adjacent buckets, halving the count and doubling per-bucket capacity. */
    private fold(): void {
        const folded: number[] = [];
        for (let i = 0; i < this.buckets.length; i += 2) {
            const a = this.buckets[i];
            const b = i + 1 < this.buckets.length ? this.buckets[i + 1] : 0;
            folded.push(a > b ? a : b);
        }
        this.buckets = folded;
        this.samplesPerBucket *= 2;
        this.samplesInCurrent = 0;
    }

    /**
     * Produces the final normalized peak array (each value 0..1, divided by the global max).
     * Trailing empty buckets are trimmed; an all-silent / empty recording yields `[]`.
     */
    public Normalize(): number[] {
        // Drop a trailing freshly-opened empty bucket that absorbed nothing.
        const raw = this.buckets.length > 0 && this.samplesInCurrent === 0 && this.buckets.length > 1
            ? this.buckets.slice(0, -1)
            : this.buckets.slice();
        let max = 0;
        for (const v of raw) {
            if (v > max) {
                max = v;
            }
        }
        if (max <= 0) {
            return [];
        }
        return raw.map(v => v / max);
    }
}

/**
 * One-shot peak downsampling of a complete Float32 PCM buffer into `targetBuckets` normalized
 * max-abs peaks (0..1). The streaming {@link PeakAccumulator} is the production path; this is the
 * direct, allocation-light equivalent used where the whole buffer is already in hand (and in tests).
 *
 * @param samples The full mono Float32 PCM buffer.
 * @param targetBuckets Desired bucket count (clamped to >= 1). Buckets beyond the sample count are
 *   not produced — a short buffer yields at most `samples.length` peaks.
 * @returns Normalized peaks; `[]` for an empty or all-silent buffer.
 */
export function downsamplePeaks(samples: Float32Array, targetBuckets = 600): number[] {
    const target = Math.max(1, Math.floor(targetBuckets));
    if (samples.length === 0) {
        return [];
    }
    const buckets = Math.min(target, samples.length);
    const samplesPerBucket = samples.length / buckets;
    const peaks = new Array<number>(buckets).fill(0);
    let globalMax = 0;
    for (let b = 0; b < buckets; b++) {
        const start = Math.floor(b * samplesPerBucket);
        const end = b === buckets - 1 ? samples.length : Math.floor((b + 1) * samplesPerBucket);
        let localMax = 0;
        for (let i = start; i < end; i++) {
            const abs = samples[i] < 0 ? -samples[i] : samples[i];
            if (abs > localMax) {
                localMax = abs;
            }
        }
        peaks[b] = localMax;
        if (localMax > globalMax) {
            globalMax = localMax;
        }
    }
    if (globalMax <= 0) {
        return [];
    }
    return peaks.map(v => v / globalMax);
}
