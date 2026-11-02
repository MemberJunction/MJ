/**
 * @fileoverview A **stateful** PCM16 resampler for one direction of one live call.
 *
 * The stateless {@link ResamplePcm16} treats every frame as an isolated signal, which is wrong for a
 * 20 ms telephony frame stream in two ways:
 *
 * 1. **Frame edges.** It holds the last sample at the right edge instead of interpolating toward the next
 *    frame's first sample, so every frame boundary carries a small step (an audible 50 Hz buzz).
 * 2. **Aliasing.** Decimating 24 kHz to 8 kHz with no anti-alias filter folds everything above 4 kHz back
 *    into the voice band.
 *
 * {@link StreamingResampler} fixes both. It remembers the last input sample and the fractional read
 * position between calls, so output is the same as resampling the whole stream at once, and when the
 * target rate is lower it first runs the signal through a windowed-sinc low-pass (cutoff
 * {@link CUTOFF_FRACTION_OF_TARGET_RATE} × the target rate, i.e. 3.4 kHz for 8 kHz output) whose history
 * also carries across frames.
 *
 * One instance per direction per call; it is not shareable between streams.
 *
 * @module @memberjunction/ai-bridge-base
 */

import { IS_LITTLE_ENDIAN } from '@memberjunction/global';

/** Low-pass cutoff as a fraction of the TARGET rate: 0.425 × 8000 Hz = 3400 Hz, the telephony band edge. */
export const CUTOFF_FRACTION_OF_TARGET_RATE = 0.425;

/** Odd FIR length for the anti-alias filter. Long enough to be ~50 dB down past the target Nyquist at 24 kHz. */
const FILTER_TAPS = 65;

/** Builds a unity-DC-gain Hamming-windowed sinc low-pass of {@link FILTER_TAPS} taps. */
function BuildLowPassTaps(cutoffHz: number, sampleRate: number): Float64Array {
    const taps = new Float64Array(FILTER_TAPS);
    const fc = cutoffHz / sampleRate; // normalized cutoff, cycles per sample
    const mid = (FILTER_TAPS - 1) / 2;
    let sum = 0;
    for (let n = 0; n < FILTER_TAPS; n++) {
        const x = n - mid;
        const sinc = x === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * x) / (Math.PI * x);
        const hamming = 0.54 - 0.46 * Math.cos((2 * Math.PI * n) / (FILTER_TAPS - 1));
        taps[n] = sinc * hamming;
        sum += taps[n];
    }
    for (let n = 0; n < FILTER_TAPS; n++) {
        taps[n] /= sum;
    }
    return taps;
}

/** Clamps a float sample to the signed 16-bit range and rounds it. */
function ToInt16(value: number): number {
    const rounded = Math.round(value);
    return rounded > 32767 ? 32767 : rounded < -32768 ? -32768 : rounded;
}

function assertPositiveRate(rate: number, label: string): void {
    if (!Number.isFinite(rate) || rate <= 0) {
        throw new Error(`StreamingResampler: ${label} must be a positive finite number, got ${rate}`);
    }
}

/**
 * Streaming PCM16 resampler with state carried across frames and an anti-alias filter when decimating.
 */
export class StreamingResampler {
    private readonly step: number;
    private readonly passthrough: boolean;
    private readonly taps: Float64Array | null;
    /** The last {@link FILTER_TAPS}-1 input samples, so the filter sees across frame boundaries. */
    private history: Float64Array;
    /** Reusable scratch buffer holding `[history, ...input]` for zero-allocation FIR decimation. */
    private extendedScratch: Float64Array;
    /** Read position of the next output sample, relative to the first sample of the next block (>= -1). */
    private phase = 0;
    /** The last (filtered) sample of the previous block — the lower neighbour for a position in [-1, 0). */
    private carry = 0;

    /**
     * @param FromRate Source sample rate in Hz (> 0).
     * @param ToRate Target sample rate in Hz (> 0).
     * @throws {Error} when either rate is not a positive finite number.
     */
    constructor(
        public readonly FromRate: number,
        public readonly ToRate: number,
    ) {
        assertPositiveRate(FromRate, 'FromRate');
        assertPositiveRate(ToRate, 'ToRate');
        this.passthrough = FromRate === ToRate;
        this.step = FromRate / ToRate;
        this.taps = ToRate < FromRate ? BuildLowPassTaps(CUTOFF_FRACTION_OF_TARGET_RATE * ToRate, FromRate) : null;
        this.history = new Float64Array(FILTER_TAPS - 1);
        this.extendedScratch = new Float64Array(FILTER_TAPS - 1 + 1024);
    }

    /** Forgets all carried state (the next frame is treated as the start of a new stream). */
    public Reset(): void {
        this.history.fill(0);
        this.phase = 0;
        this.carry = 0;
    }

    /**
     * Resamples the next frame of the stream.
     *
     * @param input The next PCM16 frame at {@link FromRate}.
     * @returns The corresponding PCM16 samples at {@link ToRate} (length varies by ±1 across frames).
     */
    public Process(input: Int16Array): Int16Array {
        if (this.passthrough) {
            return input.slice();
        }
        if (this.taps !== null) {
            return this.decimateAndInterpolate(input, this.taps);
        }
        return this.interpolatePcm16(input);
    }

    /** `ArrayBuffer` form of {@link Process} (little-endian PCM16; a trailing odd byte is ignored). */
    public ProcessBuffer(pcm: ArrayBuffer): ArrayBuffer {
        const count = Math.floor(pcm.byteLength / 2);
        if (IS_LITTLE_ENDIAN) {
            const input = new Int16Array(pcm, 0, count);
            const out = this.Process(input);
            if (out.byteOffset === 0 && out.byteLength === out.buffer.byteLength) {
                return out.buffer as ArrayBuffer;
            }
            return out.slice().buffer as ArrayBuffer;
        }
        const view = new DataView(pcm);
        const input = new Int16Array(count);
        for (let i = 0; i < count; i++) {
            input[i] = view.getInt16(i * 2, true);
        }
        const out = this.Process(input);
        const buffer = new ArrayBuffer(out.length * 2);
        const outView = new DataView(buffer);
        for (let i = 0; i < out.length; i++) {
            outView.setInt16(i * 2, out[i], true);
        }
        return buffer;
    }

    /**
     * Polyphase FIR decimation + linear interpolation: evaluates the 65-tap low-pass filter only at the
     * source indices required by the output sample positions (and `n - 1` for carried state).
     */
    private decimateAndInterpolate(input: Int16Array, taps: Float64Array): Int16Array {
        const n = input.length;
        if (n === 0) {
            return new Int16Array(0);
        }
        const histLen = this.history.length;
        const totalLen = histLen + n;
        if (this.extendedScratch.length < totalLen) {
            this.extendedScratch = new Float64Array(totalLen);
        }
        const extended = this.extendedScratch;
        extended.set(this.history, 0);
        extended.set(input, histLen);

        let lastIdx = -1;
        let lastVal = 0;
        const filterAt = (idx: number): number => {
            if (idx === lastIdx) {
                return lastVal;
            }
            let acc = 0;
            const base = idx + FILTER_TAPS - 1;
            for (let k = 0; k < FILTER_TAPS; k++) {
                acc += taps[k] * extended[base - k];
            }
            lastIdx = idx;
            lastVal = acc;
            return acc;
        };

        const maxOut = this.phase < n - 1 ? Math.ceil((n - 1 - this.phase) / this.step) + 1 : 0;
        const out = new Int16Array(maxOut);
        let outIdx = 0;
        while (this.phase < n - 1) {
            const i = Math.floor(this.phase);
            const frac = this.phase - i;
            const lower = i < 0 ? this.carry : filterAt(i);
            if (frac === 0) {
                out[outIdx++] = ToInt16(lower);
            } else {
                const upper = filterAt(i + 1);
                out[outIdx++] = ToInt16(lower + (upper - lower) * frac);
            }
            this.phase += this.step;
        }
        this.phase -= n;
        this.carry = filterAt(n - 1);
        this.history.set(extended.subarray(totalLen - histLen, totalLen));
        return outIdx === maxOut ? out : out.slice(0, outIdx);
    }

    /** Linear-interpolates an unfiltered PCM16 block at {@link step} spacing, carrying fractional phase and last sample. */
    private interpolatePcm16(signal: Int16Array): Int16Array {
        const n = signal.length;
        if (n === 0) {
            return new Int16Array(0);
        }
        const maxOut = this.phase < n - 1 ? Math.ceil((n - 1 - this.phase) / this.step) + 1 : 0;
        const out = new Int16Array(maxOut);
        let outIdx = 0;
        while (this.phase < n - 1) {
            const i = Math.floor(this.phase);
            const lower = i < 0 ? this.carry : signal[i];
            const upper = signal[i + 1];
            out[outIdx++] = ToInt16(lower + (upper - lower) * (this.phase - i));
            this.phase += this.step;
        }
        this.phase -= n;
        this.carry = signal[n - 1];
        return outIdx === maxOut ? out : out.slice(0, outIdx);
    }
}
