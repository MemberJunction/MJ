/**
 * @fileoverview Linear-interpolation PCM16 resampler — the second half of the telephony transcode
 * primitive (alongside {@link muLawToPcm16}). Carriers run at **8 kHz**; realtime models want **16 kHz**
 * inbound (e.g. Gemini Live mic rate) and emit **24 kHz** outbound (Gemini playback rate). The native
 * SDK adapter resamples between the carrier's 8 kHz and the model's rate so the bridge seam stays a
 * single, model-agnostic PCM16 contract.
 *
 * **Quality note.** This uses **linear interpolation**, which is adequate for narrowband voice (the
 * telephony band is ~300–3400 Hz, far below the 8 kHz Nyquist) and is cheap enough for per-frame,
 * real-time use. It is NOT a band-limited (sinc / polyphase FIR) resampler, so upsampling does not
 * reconstruct any high-frequency content and downsampling does not pre-filter to avoid aliasing —
 * but for 8 k↔16 k↔24 k speech the audible difference is negligible. If a future driver needs
 * music-grade quality or aggressive rate ratios, swap {@link resamplePcm16}'s body for a windowed-sinc
 * / polyphase filter (e.g. via an `optionalDependencies` DSP lib) behind this same signature — callers
 * won't change.
 *
 * @module @memberjunction/ai-bridge-base
 * @see `/plans/realtime/bridges-and-widget/telephony-vendor-bindings.md` §T0 / §5
 * @see {@link muLawToPcm16} — the companion G.711 codec.
 */

/**
 * Resamples a block of linear PCM16 samples from `fromRate` to `toRate` using linear interpolation.
 *
 * Handles the telephony rate set (8 k ↔ 16 k ↔ 24 k) and any other positive integer rates. When the
 * rates are equal the input is returned as a fresh copy (never the same reference, so callers can
 * mutate freely). The output length is `round(input.length * toRate / fromRate)`.
 *
 * @param input The source PCM16 samples (mono).
 * @param fromRate The source sample rate in Hz (must be > 0).
 * @param toRate The target sample rate in Hz (must be > 0).
 * @returns The resampled PCM16 samples at `toRate`.
 * @throws {Error} when either rate is not a positive finite number.
 */
export function resamplePcm16(input: Int16Array, fromRate: number, toRate: number): Int16Array {
    assertPositiveRate(fromRate, 'fromRate');
    assertPositiveRate(toRate, 'toRate');

    if (fromRate === toRate) {
        return input.slice(); // copy — callers must be free to mutate the result
    }
    if (input.length === 0) {
        return new Int16Array(0);
    }

    const ratio = toRate / fromRate;
    const outLength = Math.max(1, Math.round(input.length * ratio));
    const out = new Int16Array(outLength);
    const step = fromRate / toRate; // source samples advanced per output sample

    for (let i = 0; i < outLength; i++) {
        out[i] = interpolateSample(input, i * step);
    }
    return out;
}

/**
 * Samples `input` at a fractional source position via linear interpolation between the two bracketing
 * integer samples, clamping at the right edge.
 *
 * @param input The source PCM16 samples.
 * @param position The fractional source index to sample at.
 * @returns The interpolated, rounded 16-bit sample value.
 */
function interpolateSample(input: Int16Array, position: number): number {
    const lowerIndex = Math.floor(position);
    const upperIndex = lowerIndex + 1;
    const fraction = position - lowerIndex;

    const lower = input[lowerIndex];
    if (upperIndex >= input.length) {
        return lower; // past the last sample — hold the final value
    }
    const upper = input[upperIndex];
    return Math.round(lower + (upper - lower) * fraction);
}

/** Throws a descriptive error if a sample rate is not a positive finite number. */
function assertPositiveRate(rate: number, label: string): void {
    if (!Number.isFinite(rate) || rate <= 0) {
        throw new Error(`resamplePcm16: ${label} must be a positive finite number, got ${rate}`);
    }
}

/**
 * `ArrayBuffer` wrapper of {@link resamplePcm16}: little-endian PCM16 in → little-endian PCM16 out,
 * matching the {@link ITelephonyCallSdk} frame type. Convenient when the native SDK already holds the
 * audio as the seam's `ArrayBuffer` rather than a typed array.
 *
 * @param pcm An `ArrayBuffer` of little-endian signed-16-bit PCM (a trailing odd byte is ignored).
 * @param fromRate The source sample rate in Hz.
 * @param toRate The target sample rate in Hz.
 * @returns An `ArrayBuffer` of little-endian PCM16 at `toRate`.
 */
export function resamplePcm16Buffer(pcm: ArrayBuffer, fromRate: number, toRate: number): ArrayBuffer {
    const view = new DataView(pcm);
    const count = Math.floor(pcm.byteLength / 2);
    const input = new Int16Array(count);
    for (let i = 0; i < count; i++) {
        input[i] = view.getInt16(i * 2, true);
    }

    const resampled = resamplePcm16(input, fromRate, toRate);

    const outBuffer = new ArrayBuffer(resampled.length * 2);
    const outView = new DataView(outBuffer);
    for (let i = 0; i < resampled.length; i++) {
        outView.setInt16(i * 2, resampled[i], true);
    }
    return outBuffer;
}
