/**
 * @fileoverview ITU-T G.711 μ-law codec — the pure, dependency-free transcode primitive telephony
 * native SDKs use so the {@link ITelephonyCallSdk} bridge seam always speaks **PCM16 `ArrayBuffer`**.
 *
 * Carriers (Twilio Media Streams, and most PSTN ingress) deliver **G.711 μ-law @ 8 kHz mono** on the
 * wire; realtime models want **linear PCM16**. Per the telephony-vendor-bindings plan (§T0, §5) the
 * transcode (μ-law ↔ PCM16) lives in the native SDK adapter, NOT in the driver — this module is the
 * shared, testable implementation it calls.
 *
 * The algorithm here is the canonical North-American μ-law (G.711, μ = 255) — same math the C
 * reference (Sun `g711.c`) uses. No browser APIs, no `Buffer` required (the `ArrayBuffer` wrappers
 * work in any JS runtime).
 *
 * @module @memberjunction/ai-bridge-base
 * @see `/plans/realtime/bridges-and-widget/telephony-vendor-bindings.md` §T0 / §5
 * @see {@link ITelephonyCallSdk} — `sendAudioFrame(pcm: ArrayBuffer)` / `onAudioFrame` speak PCM16.
 */

/** The μ-law bias added before encoding (G.711: `0x84` = 132), removed on decode. */
const MU_LAW_BIAS = 0x84;

/**
 * Largest magnitude G.711 μ-law clamps a linear sample to — the standard `CLIP` value (32635).
 * Chosen so `magnitude + bias` stays within 15 bits (`32635 + 0x84 = 0x7FFF`); a naive `0x7FFF` clamp
 * would overflow the top segment and miscompute the exponent.
 */
const MU_LAW_CLAMP = 32635;

/** Sign bit for an 8-bit μ-law byte (1 = the original linear sample was negative). */
const MU_LAW_SIGN_BIT = 0x80;

/**
 * Encodes ONE linear PCM16 sample to a single G.711 μ-law byte.
 *
 * Standard algorithm: take the sign, clamp the magnitude, add the bias, find the exponent (segment)
 * from the highest set bit, take the 4 mantissa bits below it, then one's-complement the result (μ-law
 * stores the complemented code, which is why "digital silence" is `0xFF`).
 *
 * Kept tiny and branch-light so the per-frame encode loop stays cheap (telephony frames are typically
 * 160 samples / 20 ms at 8 kHz).
 *
 * @param sample A signed 16-bit linear PCM sample (`-32768..32767`).
 * @returns The 8-bit μ-law code (`0..255`).
 */
function encodeSample(sample: number): number {
    let sign = (sample >> 8) & MU_LAW_SIGN_BIT; // 0x80 if negative, else 0
    if (sign !== 0) {
        sample = -sample;
    }
    if (sample > MU_LAW_CLAMP) {
        sample = MU_LAW_CLAMP;
    }
    sample = sample + MU_LAW_BIAS;

    const exponent = muLawExponent(sample);
    const mantissa = (sample >> (exponent + 3)) & 0x0f;
    return (~(sign | (exponent << 4) | mantissa)) & 0xff;
}

/**
 * Computes the G.711 segment/exponent (0..7) for a biased magnitude — the position of the highest set
 * bit at or above bit 7. Uses the standard exponent lookup over the magnitude's top byte.
 *
 * @param biasedMagnitude The clamped sample magnitude after the {@link MU_LAW_BIAS} has been added.
 * @returns The μ-law exponent (segment number), `0..7`.
 */
function muLawExponent(biasedMagnitude: number): number {
    let exponent = 7;
    for (let mask = 0x4000; (biasedMagnitude & mask) === 0 && exponent > 0; mask >>= 1) {
        exponent--;
    }
    return exponent;
}

/**
 * Decodes ONE G.711 μ-law byte back to a signed 16-bit linear PCM sample.
 *
 * Inverse of {@link encodeSample}: undo the one's-complement, rebuild the magnitude from exponent +
 * mantissa, remove the bias, and reapply the sign. Lossy round-trip vs. the original PCM (μ-law is an
 * 8-bit companded representation) — error is bounded by the segment's quantization step.
 *
 * @param muLawByte An 8-bit μ-law code (`0..255`).
 * @returns The reconstructed signed 16-bit linear PCM sample.
 */
function decodeSample(muLawByte: number): number {
    const code = ~muLawByte & 0xff;
    const sign = code & MU_LAW_SIGN_BIT;
    const exponent = (code >> 4) & 0x07;
    const mantissa = code & 0x0f;

    let magnitude = ((mantissa << 3) + MU_LAW_BIAS) << exponent;
    magnitude -= MU_LAW_BIAS;
    return sign !== 0 ? -magnitude : magnitude;
}

/**
 * Decodes a buffer of G.711 μ-law bytes to linear PCM16 samples.
 *
 * @param mulaw The μ-law bytes (one byte per sample, e.g. a Twilio Media Streams payload).
 * @returns An `Int16Array` of the decoded linear samples (same length as the input).
 */
export function muLawToPcm16(mulaw: Uint8Array): Int16Array {
    const out = new Int16Array(mulaw.length);
    for (let i = 0; i < mulaw.length; i++) {
        out[i] = decodeSample(mulaw[i]);
    }
    return out;
}

/**
 * Encodes linear PCM16 samples to G.711 μ-law bytes.
 *
 * @param pcm The signed 16-bit linear samples to encode.
 * @returns A `Uint8Array` of μ-law codes (one byte per sample).
 */
export function pcm16ToMuLaw(pcm: Int16Array): Uint8Array {
    const out = new Uint8Array(pcm.length);
    for (let i = 0; i < pcm.length; i++) {
        out[i] = encodeSample(pcm[i]);
    }
    return out;
}

/**
 * `ArrayBuffer` wrapper of {@link muLawToPcm16}: μ-law bytes → little-endian PCM16 bytes. The output
 * matches the PCM16 frame type the {@link ITelephonyCallSdk} seam carries (`onAudioFrame`).
 *
 * @param mulaw An `ArrayBuffer` of μ-law bytes (one byte per sample).
 * @returns An `ArrayBuffer` of little-endian signed-16-bit PCM (2 bytes per sample).
 */
export function muLawToPcm16Buffer(mulaw: ArrayBuffer): ArrayBuffer {
    const samples = muLawToPcm16(new Uint8Array(mulaw));
    // Int16Array view over a fresh buffer is little-endian on every platform JS targets in practice;
    // build it explicitly via DataView so the byte order is correct regardless of host endianness.
    return pcm16ToLittleEndianBuffer(samples);
}

/**
 * `ArrayBuffer` wrapper of {@link pcm16ToMuLaw}: little-endian PCM16 bytes → μ-law bytes. The input
 * matches the PCM16 frame type the {@link ITelephonyCallSdk} seam carries (`sendAudioFrame`).
 *
 * @param pcm An `ArrayBuffer` of little-endian signed-16-bit PCM (2 bytes per sample; a trailing odd
 *   byte is ignored).
 * @returns An `ArrayBuffer` of μ-law bytes (one byte per sample).
 */
export function pcm16ToMuLawBuffer(pcm: ArrayBuffer): ArrayBuffer {
    const samples = littleEndianBufferToPcm16(pcm);
    const mulaw = pcm16ToMuLaw(samples);
    const buffer = new ArrayBuffer(mulaw.length);
    new Uint8Array(buffer).set(mulaw);
    return buffer;
}

/** Reads a little-endian PCM16 `ArrayBuffer` into an `Int16Array` (drops a trailing odd byte). */
function littleEndianBufferToPcm16(pcm: ArrayBuffer): Int16Array {
    const view = new DataView(pcm);
    const count = Math.floor(pcm.byteLength / 2);
    const out = new Int16Array(count);
    for (let i = 0; i < count; i++) {
        out[i] = view.getInt16(i * 2, true);
    }
    return out;
}

/** Writes an `Int16Array` to a little-endian PCM16 `ArrayBuffer`. */
function pcm16ToLittleEndianBuffer(samples: Int16Array): ArrayBuffer {
    const buffer = new ArrayBuffer(samples.length * 2);
    const view = new DataView(buffer);
    for (let i = 0; i < samples.length; i++) {
        view.setInt16(i * 2, samples[i], true);
    }
    return buffer;
}
