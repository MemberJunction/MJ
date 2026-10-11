/**
 * @fileoverview {@link GenerateComfortTone} — a procedurally generated hold loop for when a queue has no music
 * configured. Four soft major/minor pads (C – Am – F – G, the progression everyone has heard a thousand times and
 * nobody minds) with slow raised-cosine swells, a quiet bass an octave below, and a touch of second harmonic for
 * warmth. Each chord fades fully out before the next fades in, so the loop seam is silent and never clicks.
 *
 * Synthesized at runtime: no audio asset ships, so there is nothing to license.
 *
 * @module @memberjunction/livekit-room-server
 */

/** Length of one pass of the comfort tone, in seconds. */
export const COMFORT_TONE_LOOP_SECONDS = 10;

/** Peak level of the comfort tone as a fraction of full scale (about −15 dBFS — quieter than speech). */
export const COMFORT_TONE_PEAK = 0.18;

/** One chord of the progression: the frequencies of its voices, root first. */
const CHORDS: readonly (readonly number[])[] = [
  [261.63, 329.63, 392.0], // C major (C4 E4 G4)
  [220.0, 261.63, 329.63], // A minor (A3 C4 E4)
  [174.61, 220.0, 261.63], // F major (F3 A3 C4)
  [196.0, 246.94, 293.66], // G major (G3 B3 D4)
];

/** Fraction of each chord spent swelling in (and, symmetrically, fading out). */
const SWELL_FRACTION = 0.3;

/** Relative weight of the bass voice (the chord root an octave down) and of each voice's second harmonic. */
const BASS_WEIGHT = 0.5;
const HARMONIC_WEIGHT = 0.15;

/**
 * Generates one {@link COMFORT_TONE_LOOP_SECONDS}-second pass of the comfort tone as mono PCM16. Loop it end to end.
 *
 * @param sampleRate The rate to synthesize at, in Hz (generate at the playback rate to avoid resampling).
 * @returns Mono PCM16 samples; every sample's magnitude is at most {@link COMFORT_TONE_PEAK} of full scale.
 * @throws {Error} when `sampleRate` is not a positive integer.
 */
export function GenerateComfortTone(sampleRate: number): Int16Array {
  if (!Number.isInteger(sampleRate) || sampleRate <= 0) {
    throw new Error(`GenerateComfortTone needs a positive integer sample rate; got ${sampleRate}.`);
  }
  const chordSamples = Math.round((COMFORT_TONE_LOOP_SECONDS / CHORDS.length) * sampleRate);
  const out = new Int16Array(chordSamples * CHORDS.length);
  CHORDS.forEach((chord, index) => renderChord(out, index * chordSamples, chordSamples, chord, sampleRate));
  return out;
}

/** Writes one enveloped chord into `out` starting at `start`. */
function renderChord(out: Int16Array, start: number, length: number, chord: readonly number[], sampleRate: number): void {
  const voices = [...chord, chord[0] / 2];
  const weights = [...chord.map(() => 1), BASS_WEIGHT];
  // Normalise so the worst case (every voice and harmonic in phase at the envelope peak) stays at COMFORT_TONE_PEAK.
  const worstCase = weights.reduce((total, weight) => total + weight * (1 + HARMONIC_WEIGHT), 0);
  const scale = (COMFORT_TONE_PEAK * 32767) / worstCase;
  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    let sample = 0;
    for (let v = 0; v < voices.length; v++) {
      const phase = 2 * Math.PI * voices[v] * t;
      sample += weights[v] * (Math.sin(phase) + HARMONIC_WEIGHT * Math.sin(2 * phase));
    }
    out[start + i] = Math.round(sample * swellEnvelope(i / length) * scale);
  }
}

/** A raised-cosine swell: 0 at both ends of the chord, 1 across the middle. */
function swellEnvelope(position: number): number {
  if (position < SWELL_FRACTION) {
    return 0.5 - 0.5 * Math.cos((Math.PI * position) / SWELL_FRACTION);
  }
  if (position > 1 - SWELL_FRACTION) {
    return 0.5 - 0.5 * Math.cos((Math.PI * (1 - position)) / SWELL_FRACTION);
  }
  return 1;
}
