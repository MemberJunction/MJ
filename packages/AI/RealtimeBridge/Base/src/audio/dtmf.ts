/**
 * @fileoverview DTMF tone generation — the in-band way to send touch-tones on a carrier whose media
 * socket is the only thing MJ controls (Twilio Media Streams).
 *
 * Replacing a Twilio call's TwiML with `<Play digits>` ends the `<Connect><Stream>` and with it the agent's
 * audio, so keypad digits are instead synthesized here and sent over the media stream like any other audio.
 * Tones follow ITU-T Q.23: each key is the sum of one low-group and one high-group sine.
 *
 * @module @memberjunction/ai-bridge-base
 */

import { Pcm16ToMuLaw } from './g711';

/** Low-group / high-group frequencies (Hz) per key, ITU-T Q.23. */
export const DTMF_FREQUENCIES: Readonly<Record<string, readonly [number, number]>> = {
    '1': [697, 1209], '2': [697, 1336], '3': [697, 1477],
    '4': [770, 1209], '5': [770, 1336], '6': [770, 1477],
    '7': [852, 1209], '8': [852, 1336], '9': [852, 1477],
    '*': [941, 1209], '0': [941, 1336], '#': [941, 1477],
};

/** The most digits one send may carry (a model-supplied string must not queue minutes of audio). */
export const MAX_DTMF_DIGITS = 32;

/** Tone duration per digit (ms). 100 ms tone + 100 ms gap is the shortest widely detected rate. */
export const DTMF_TONE_MS = 100;
/** Silence between digits (ms). */
export const DTMF_GAP_MS = 100;

/** Peak amplitude of each of the two sines (fraction of full scale); their sum peaks at twice this. */
const TONE_AMPLITUDE = 0.25;
/** Linear ramp at each tone edge, in ms, so the tone does not click. */
const RAMP_MS = 2;

/** Whether the string is 1..{@link MAX_DTMF_DIGITS} characters, all of `0-9`, `*`, `#`. */
export function IsValidDtmfDigits(digits: string): boolean {
    if (typeof digits !== 'string' || digits.length === 0 || digits.length > MAX_DTMF_DIGITS) {
        return false;
    }
    for (const ch of digits) {
        if (!(ch in DTMF_FREQUENCIES)) {
            return false;
        }
    }
    return true;
}

/** Renders one tone (no gap) as float samples scaled by the amplitude. */
function RenderTone(digit: string, sampleRate: number, toneMs: number): Float64Array {
    const [low, high] = DTMF_FREQUENCIES[digit];
    const count = Math.round((sampleRate * toneMs) / 1000);
    const ramp = Math.max(1, Math.round((sampleRate * RAMP_MS) / 1000));
    const out = new Float64Array(count);
    for (let n = 0; n < count; n++) {
        const t = n / sampleRate;
        const envelope = Math.min(1, n / ramp, (count - 1 - n) / ramp);
        out[n] = envelope * TONE_AMPLITUDE * (Math.sin(2 * Math.PI * low * t) + Math.sin(2 * Math.PI * high * t));
    }
    return out;
}

/**
 * Generates PCM16 mono audio for a digit string: a tone per digit with a silent gap between digits.
 *
 * @param digits The digits to send (validated with {@link IsValidDtmfDigits}).
 * @param sampleRate Output sample rate in Hz (8000 for a G.711 carrier).
 * @param toneMs Tone duration per digit.
 * @param gapMs Silence between digits.
 * @returns The PCM16 samples.
 * @throws {Error} when `digits` is not valid.
 */
export function GenerateDtmfPcm16(digits: string, sampleRate = 8000, toneMs = DTMF_TONE_MS, gapMs = DTMF_GAP_MS): Int16Array {
    if (!IsValidDtmfDigits(digits)) {
        throw new Error(`DTMF digits must be 1-${MAX_DTMF_DIGITS} characters from 0-9, * and #.`);
    }
    const gap = Math.round((sampleRate * gapMs) / 1000);
    const chunks: Int16Array[] = [];
    [...digits].forEach((digit, index) => {
        const tone = RenderTone(digit, sampleRate, toneMs);
        const pcm = new Int16Array(tone.length + (index < digits.length - 1 ? gap : 0));
        for (let n = 0; n < tone.length; n++) {
            pcm[n] = Math.round(tone[n] * 32767);
        }
        chunks.push(pcm);
    });
    const total = chunks.reduce((sum, c) => sum + c.length, 0);
    const out = new Int16Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        out.set(chunk, offset);
        offset += chunk.length;
    }
    return out;
}

/** {@link GenerateDtmfPcm16} at 8 kHz, encoded as G.711 μ-law — the Twilio Media Streams wire format. */
export function GenerateDtmfMuLaw(digits: string): Uint8Array {
    return Pcm16ToMuLaw(GenerateDtmfPcm16(digits, 8000));
}
