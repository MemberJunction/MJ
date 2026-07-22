import { describe, it, expect } from 'vitest';
import {
    muLawToPcm16,
    pcm16ToMuLaw,
    muLawToPcm16Buffer,
    pcm16ToMuLawBuffer,
} from '../audio/g711';

/**
 * μ-law is an 8-bit companded representation of 16-bit linear PCM, so encode→decode is **lossy**. The
 * quantization step grows with magnitude (the whole point of companding — fine near zero, coarse at the
 * extremes). The largest step is in the top segment: ~`(0x84 << 7)` ≈ 16k worth of span across 16 codes,
 * giving a worst-case reconstruction error on the order of a few hundred LSBs near full scale. We assert
 * the round-trip error stays within this generous, segment-aware bound rather than exact equality.
 */
const MAX_LOUD_QUANTIZATION_ERROR = 700; // top-segment step (~512) + over-clip margin (~133), with headroom

describe('g711 μ-law codec', () => {
    describe('known ITU-T vectors', () => {
        it('decodes 0xFF to the positive-zero region (digital silence ≈ 0)', () => {
            // 0xFF is the μ-law code for the smallest positive magnitude — "positive zero".
            const [decoded] = muLawToPcm16(new Uint8Array([0xff]));
            expect(decoded).toBeGreaterThanOrEqual(0);
            expect(decoded).toBeLessThanOrEqual(8); // within the first quantization step of zero
        });

        it('decodes 0x7F to the negative-zero region (≈ 0, sign-flipped)', () => {
            // 0x7F has the sign bit clear in the *complemented* code → represents negative-zero side.
            const [decoded] = muLawToPcm16(new Uint8Array([0x7f]));
            expect(decoded).toBeLessThanOrEqual(0);
            expect(decoded).toBeGreaterThanOrEqual(-8);
        });

        it('encodes a near-zero positive sample to 0xFF', () => {
            const encoded = pcm16ToMuLaw(Int16Array.from([0]));
            expect(encoded[0]).toBe(0xff);
        });

        it('encodes a near-zero negative sample to 0x7F', () => {
            const encoded = pcm16ToMuLaw(Int16Array.from([-1]));
            expect(encoded[0]).toBe(0x7f);
        });
    });

    describe('round-trip fidelity (encode → decode within μ-law tolerance)', () => {
        it('keeps silence (0) at ≈ 0', () => {
            const roundTrip = muLawToPcm16(pcm16ToMuLaw(Int16Array.from([0])));
            expect(Math.abs(roundTrip[0])).toBeLessThanOrEqual(8);
        });

        it('keeps the maximum positive sample (+32767) within tolerance', () => {
            const roundTrip = muLawToPcm16(pcm16ToMuLaw(Int16Array.from([32767])));
            expect(roundTrip[0]).toBeGreaterThan(0);
            expect(Math.abs(32767 - roundTrip[0])).toBeLessThanOrEqual(MAX_LOUD_QUANTIZATION_ERROR);
        });

        it('keeps the minimum negative sample (-32768) within tolerance', () => {
            const roundTrip = muLawToPcm16(pcm16ToMuLaw(Int16Array.from([-32768])));
            expect(roundTrip[0]).toBeLessThan(0);
            expect(Math.abs(-32768 - roundTrip[0])).toBeLessThanOrEqual(MAX_LOUD_QUANTIZATION_ERROR);
        });

        it('keeps a swept range of sample values within companded tolerance', () => {
            // A staircase across the full signed range; tolerance scales with magnitude (companding).
            const values: number[] = [];
            for (let v = -32768; v < 32768; v += 257) {
                values.push(v);
            }
            const input = Int16Array.from(values);
            const roundTrip = muLawToPcm16(pcm16ToMuLaw(input));

            for (let i = 0; i < input.length; i++) {
                const magnitude = Math.abs(input[i]);
                // Quantization step ≈ magnitude / 16 (companding), with a small floor for quiet samples.
                const tolerance = Math.max(8, Math.ceil(magnitude / 16) + 16);
                expect(Math.abs(input[i] - roundTrip[i])).toBeLessThanOrEqual(tolerance);
            }
        });

        it('preserves a sine sweep within bounds and keeps sign', () => {
            const sampleCount = 800; // 100 ms at 8 kHz
            const input = new Int16Array(sampleCount);
            for (let i = 0; i < sampleCount; i++) {
                // 440 Hz tone at 8 kHz, half-scale amplitude.
                input[i] = Math.round(Math.sin((2 * Math.PI * 440 * i) / 8000) * 16000);
            }
            const roundTrip = muLawToPcm16(pcm16ToMuLaw(input));

            for (let i = 0; i < sampleCount; i++) {
                expect(Math.abs(input[i] - roundTrip[i])).toBeLessThanOrEqual(MAX_LOUD_QUANTIZATION_ERROR);
                // Sign must be preserved away from the zero crossings.
                if (Math.abs(input[i]) > 1000) {
                    expect(Math.sign(roundTrip[i])).toBe(Math.sign(input[i]));
                }
            }
        });

        it('is stable across a second encode→decode pass (idempotent on the μ-law grid)', () => {
            // Once a sample has been snapped to the μ-law grid, re-encoding must reproduce it exactly.
            const input = Int16Array.from([12345, -9876, 50, -50, 32000]);
            const firstPass = muLawToPcm16(pcm16ToMuLaw(input));
            const secondPass = muLawToPcm16(pcm16ToMuLaw(firstPass));
            expect(Array.from(secondPass)).toEqual(Array.from(firstPass));
        });
    });

    describe('ArrayBuffer wrappers (little-endian PCM16, matching ITelephonyCallSdk)', () => {
        it('round-trips a PCM16 ArrayBuffer through μ-law and back within tolerance', () => {
            const samples = Int16Array.from([0, 1000, -1000, 16000, -16000, 32000, -32000]);
            const pcmBuffer = pcm16ToLeBuffer(samples);

            const mulawBuffer = pcm16ToMuLawBuffer(pcmBuffer);
            expect(mulawBuffer.byteLength).toBe(samples.length); // 1 μ-law byte per sample

            const backToPcm = muLawToPcm16Buffer(mulawBuffer);
            const out = leBufferToPcm16(backToPcm);
            expect(out.length).toBe(samples.length);
            for (let i = 0; i < samples.length; i++) {
                const tolerance = Math.max(8, Math.ceil(Math.abs(samples[i]) / 16) + 16);
                expect(Math.abs(samples[i] - out[i])).toBeLessThanOrEqual(tolerance);
            }
        });

        it('produces little-endian bytes from muLawToPcm16Buffer', () => {
            // 0xFF decodes to a small positive value; verify it lands in the low byte (little-endian).
            const pcm = muLawToPcm16Buffer(new Uint8Array([0xff]).buffer);
            const view = new DataView(pcm);
            expect(view.getInt16(0, true)).toBe(muLawToPcm16(new Uint8Array([0xff]))[0]);
        });
    });

    describe('T0 acceptance: synthetic μ-law loopback', () => {
        it('μ-law in → PCM16 (decode) → μ-law (encode) reproduces the μ-law bytes exactly', () => {
            // The plan's explicit acceptance criterion. Starting from μ-law means the samples are already
            // on the companded grid, so a decode→encode cycle is LOSSLESS — with ONE inherent exception:
            // μ-law has two zero codes (0x7F = negative-zero, 0xFF = positive-zero), but linear PCM has a
            // single 0. Decoding 0x7F yields 0, which re-encodes to 0xFF. This negative-zero→positive-zero
            // collapse is a property of G.711 itself, not a bug; every other code round-trips identically.
            const syntheticMuLaw = new Uint8Array(256);
            for (let code = 0; code < 256; code++) {
                syntheticMuLaw[code] = code; // every possible μ-law code
            }

            const pcm = muLawToPcm16(syntheticMuLaw);
            const reEncoded = pcm16ToMuLaw(pcm);

            for (let code = 0; code < 256; code++) {
                const expected = code === 0x7f ? 0xff : code; // negative-zero collapses to positive-zero
                expect(reEncoded[code]).toBe(expected);
            }
        });

        it('round-trips a synthetic μ-law voice frame through the ArrayBuffer seam losslessly', () => {
            // 160 bytes = one 20 ms Twilio Media Streams frame at 8 kHz.
            const frame = new Uint8Array(160);
            for (let i = 0; i < frame.length; i++) {
                let code = (i * 7 + 3) & 0xff; // arbitrary but deterministic μ-law content
                if (code === 0x7f) {
                    code = 0xff; // avoid the negative-zero code, which collapses to 0xFF on round-trip
                }
                frame[i] = code;
            }

            const pcmBuffer = muLawToPcm16Buffer(frame.buffer);
            expect(pcmBuffer.byteLength).toBe(frame.length * 2); // PCM16 = 2 bytes/sample

            const backToMuLaw = pcm16ToMuLawBuffer(pcmBuffer);
            expect(Array.from(new Uint8Array(backToMuLaw))).toEqual(Array.from(frame));
        });
    });
});

// ── local little-endian helpers (kept out of the public API) ──────────────────────────
function pcm16ToLeBuffer(samples: Int16Array): ArrayBuffer {
    const buffer = new ArrayBuffer(samples.length * 2);
    const view = new DataView(buffer);
    for (let i = 0; i < samples.length; i++) {
        view.setInt16(i * 2, samples[i], true);
    }
    return buffer;
}

function leBufferToPcm16(buffer: ArrayBuffer): Int16Array {
    const view = new DataView(buffer);
    const count = Math.floor(buffer.byteLength / 2);
    const out = new Int16Array(count);
    for (let i = 0; i < count; i++) {
        out[i] = view.getInt16(i * 2, true);
    }
    return out;
}
