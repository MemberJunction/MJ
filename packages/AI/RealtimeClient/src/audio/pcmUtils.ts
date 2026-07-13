/**
 * Shared base64 / PCM16 codec helpers for client-owned realtime audio planes.
 *
 * Extracted from the Gemini client driver so every websocket-based driver with a
 * client-owned audio plane (Gemini Live, ElevenLabs Agents, future providers) shares one
 * implementation. `atob`/`btoa` are global in both browsers and Node 18+, so these run
 * unchanged in unit tests.
 */

/** Decodes a base64 string into a freshly-allocated `ArrayBuffer`. */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        out[i] = binary.charCodeAt(i);
    }
    return out.buffer;
}

/** Encodes raw bytes to base64 in chunks (avoids call-stack limits on large frames). */
export function bytesToBase64(bytes: Uint8Array): string {
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
}

/** Converts a Float32 [-1, 1] sample block to PCM16 little-endian bytes, base64-encoded. */
export function encodeFloat32ToPcm16Base64(samples: Float32Array): string {
    const pcm = new Int16Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
        const s = Math.max(-1, Math.min(1, samples[i]));
        pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return bytesToBase64(new Uint8Array(pcm.buffer));
}

/** Converts raw PCM16 little-endian bytes to Float32 samples (truncates a trailing odd byte). */
export function pcm16ToFloat32(pcm: ArrayBuffer): Float32Array<ArrayBuffer> {
    const even = pcm.byteLength - (pcm.byteLength % 2);
    const ints = new Int16Array(pcm.slice(0, even));
    const out = new Float32Array(ints.length);
    for (let i = 0; i < ints.length; i++) {
        out[i] = ints[i] / 0x8000;
    }
    return out;
}
