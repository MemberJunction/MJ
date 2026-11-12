/**
 * Deterministic, dependency-free procedural audio for Video Studio (§8): standard sound effects
 * and a modest music bed, rendered as PCM in TypeScript. The same seed always produces the same
 * samples, so a re-render of an unchanged spec is bit-for-bit identical.
 */

import {
    DEFAULT_RISER_SECONDS,
    type AudioSynthKind,
    type SynthesizedMusicMood,
    type VideoSynthesizedMusicSpec,
} from '@memberjunction/video-studio-core';

/** Sample rate of every PCM buffer the worker mixes. */
export const MIX_SAMPLE_RATE = 48_000;

/** Two-channel PCM buffer (`Float32Array` per channel, equal lengths). */
export interface StereoBuffer {
    Left: Float32Array;
    Right: Float32Array;
}

/** Allocates a silent stereo buffer of `length` samples. */
export function CreateStereoBuffer(length: number): StereoBuffer {
    const size = Math.max(0, Math.floor(length));
    return { Left: new Float32Array(size), Right: new Float32Array(size) };
}

/**
 * Seeded `mulberry32` PRNG returning floats in `[0, 1)`.
 */
export function CreatePrng(seed: number): () => number {
    let state = (Math.floor(Number.isFinite(seed) ? seed : 1) ^ 0x9e3779b9) >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Mixes a string into a seed so different synthesized sources get independent noise. */
export function DeriveSeed(seed: number, label: string): number {
    let hash = Math.floor(Number.isFinite(seed) ? seed : 1) >>> 0;
    for (let i = 0; i < label.length; i++) {
        hash = Math.imul(hash ^ label.charCodeAt(i), 0x01000193) >>> 0;
    }
    return hash;
}

/** Biquad filter response type (RBJ audio EQ cookbook). */
export type BiquadType = 'lowpass' | 'highpass' | 'bandpass';

/**
 * Second-order IIR filter (RBJ cookbook, direct form I). Coefficients can be retuned mid-stream for sweeps.
 */
export class Biquad {
    private b0 = 1;
    private b1 = 0;
    private b2 = 0;
    private a1 = 0;
    private a2 = 0;
    private x1 = 0;
    private x2 = 0;
    private y1 = 0;
    private y2 = 0;

    public constructor(private readonly type: BiquadType, frequency: number, q = 0.707, private readonly sampleRate = MIX_SAMPLE_RATE) {
        this.SetFrequency(frequency, q);
    }

    /** Retunes the filter without clearing its state. */
    public SetFrequency(frequency: number, q = 0.707): void {
        const f = Math.min(Math.max(frequency, 10), this.sampleRate * 0.45);
        const w0 = (2 * Math.PI * f) / this.sampleRate;
        const cos = Math.cos(w0);
        const alpha = Math.sin(w0) / (2 * Math.max(q, 0.05));
        const a0 = 1 + alpha;
        let b0: number;
        let b1: number;
        let b2: number;
        if (this.type === 'lowpass') {
            b0 = (1 - cos) / 2;
            b1 = 1 - cos;
            b2 = (1 - cos) / 2;
        } else if (this.type === 'highpass') {
            b0 = (1 + cos) / 2;
            b1 = -(1 + cos);
            b2 = (1 + cos) / 2;
        } else {
            b0 = alpha;
            b1 = 0;
            b2 = -alpha;
        }
        this.b0 = b0 / a0;
        this.b1 = b1 / a0;
        this.b2 = b2 / a0;
        this.a1 = (-2 * cos) / a0;
        this.a2 = (1 - alpha) / a0;
    }

    /** Filters one sample. */
    public Process(x: number): number {
        const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
        this.x2 = this.x1;
        this.x1 = x;
        this.y2 = this.y1;
        this.y1 = y;
        return y;
    }

    /** Filters a whole buffer in place. */
    public ProcessBuffer(buffer: Float32Array): Float32Array {
        for (let i = 0; i < buffer.length; i++) {
            buffer[i] = this.Process(buffer[i]);
        }
        return buffer;
    }
}

/** Converts a MIDI note number to Hz. */
export function MidiToHz(note: number): number {
    return 440 * Math.pow(2, (note - 69) / 12);
}

/** Scales `buffer` in place so its absolute peak equals `targetPeak` (silent buffers are left alone). */
export function NormalizePeak(buffer: Float32Array, targetPeak: number): Float32Array {
    let peak = 0;
    for (let i = 0; i < buffer.length; i++) {
        peak = Math.max(peak, Math.abs(buffer[i]));
    }
    if (peak > 0) {
        const scale = targetPeak / peak;
        for (let i = 0; i < buffer.length; i++) {
            buffer[i] *= scale;
        }
    }
    return buffer;
}

// ---------------------------------------------------------------------------
// Sound effects
// ---------------------------------------------------------------------------

/** Peak level of every synthesized effect before the cue's gain (about -6 dBFS). */
export const SFX_PEAK = 0.5;

function samplesFor(seconds: number): number {
    return Math.max(1, Math.round(seconds * MIX_SAMPLE_RATE));
}

function noiseSource(seed: number): () => number {
    const rand = CreatePrng(seed);
    return () => rand() * 2 - 1;
}

function synthWhoosh(seed: number): Float32Array {
    const length = samplesFor(0.8);
    const out = new Float32Array(length);
    const noise = noiseSource(seed);
    const filter = new Biquad('bandpass', 600, 1.2);
    for (let i = 0; i < length; i++) {
        const p = i / length;
        if (i % 64 === 0) {
            filter.SetFrequency(500 + 2800 * Math.sin(Math.PI * p), 1.2);
        }
        out[i] = filter.Process(noise()) * Math.pow(Math.sin(Math.PI * p), 2);
    }
    return out;
}

function synthClick(seed: number): Float32Array {
    const length = samplesFor(0.04);
    const out = new Float32Array(length);
    const noise = noiseSource(seed);
    const hp = new Biquad('highpass', 2000);
    for (let i = 0; i < length; i++) {
        const t = i / MIX_SAMPLE_RATE;
        out[i] = hp.Process(noise()) * Math.exp(-t * 400) * 0.6 + Math.sin(2 * Math.PI * 1800 * t) * Math.exp(-t * 300) * 0.4;
    }
    return out;
}

function synthTick(seed: number): Float32Array {
    const length = samplesFor(0.05);
    const out = new Float32Array(length);
    const noise = noiseSource(seed);
    const hp = new Biquad('highpass', 2500);
    for (let i = 0; i < length; i++) {
        const t = i / MIX_SAMPLE_RATE;
        out[i] = hp.Process(noise()) * Math.exp(-t * 160) * 0.5 + Math.sin(2 * Math.PI * 3200 * t) * Math.exp(-t * 120) * 0.5;
    }
    return out;
}

function synthImpact(seed: number): Float32Array {
    const length = samplesFor(1.8);
    const out = new Float32Array(length);
    const noise = noiseSource(seed);
    const lp = new Biquad('lowpass', 1500);
    let phase = 0;
    for (let i = 0; i < length; i++) {
        const t = i / MIX_SAMPLE_RATE;
        phase += (2 * Math.PI * (30 + 70 * Math.exp(-t * 6))) / MIX_SAMPLE_RATE;
        out[i] = Math.sin(phase) * Math.exp(-t * 1.6) * 0.9 + lp.Process(noise()) * Math.exp(-t * 5) * 0.4;
    }
    return out;
}

function synthChime(): Float32Array {
    const length = samplesFor(2.2);
    const out = new Float32Array(length);
    const partials: ReadonlyArray<{ Ratio: number; Gain: number; Decay: number }> = [
        { Ratio: 1, Gain: 1, Decay: 1.6 },
        { Ratio: 2.76, Gain: 0.45, Decay: 3 },
        { Ratio: 5.4, Gain: 0.2, Decay: 6 },
    ];
    const base = MidiToHz(81);
    for (let i = 0; i < length; i++) {
        const t = i / MIX_SAMPLE_RATE;
        let sample = 0;
        for (const p of partials) {
            sample += Math.sin(2 * Math.PI * base * p.Ratio * t) * p.Gain * Math.exp(-t * p.Decay);
        }
        out[i] = sample * Math.min(1, t / 0.003);
    }
    return out;
}

function synthRiser(seed: number, seconds: number): Float32Array {
    const length = samplesFor(seconds);
    const out = new Float32Array(length);
    const noise = noiseSource(seed);
    const filter = new Biquad('bandpass', 300, 1.4);
    for (let i = 0; i < length; i++) {
        const p = i / length;
        if (i % 64 === 0) {
            filter.SetFrequency(300 * Math.pow(8000 / 300, p), 1.4);
        }
        out[i] = filter.Process(noise()) * p * p;
    }
    return out;
}

/**
 * Renders one synthesized sound effect as mono PCM at {@link MIX_SAMPLE_RATE}, peak-normalized to
 * {@link SFX_PEAK}. `durationSeconds` only shapes a `'Riser'` (default 1.5 s); a riser is meant to END
 * at its cue time, so callers place it `length` samples before the cue.
 */
export function SynthesizeSfx(kind: AudioSynthKind, seed: number, durationSeconds?: number): Float32Array {
    const riserSeconds =
        typeof durationSeconds === 'number' && durationSeconds > 0 ? Math.min(durationSeconds, 30) : DEFAULT_RISER_SECONDS;
    switch (kind) {
        case 'Whoosh':
            return NormalizePeak(synthWhoosh(seed), SFX_PEAK);
        case 'Click':
            return NormalizePeak(synthClick(seed), SFX_PEAK);
        case 'Tick':
            return NormalizePeak(synthTick(seed), SFX_PEAK);
        case 'Impact':
            return NormalizePeak(synthImpact(seed), SFX_PEAK);
        case 'Chime':
            return NormalizePeak(synthChime(), SFX_PEAK);
        case 'Riser':
            return NormalizePeak(synthRiser(seed, riserSeconds), SFX_PEAK);
        default:
            throw new Error(`Unknown synthesized sound effect kind '${String(kind)}'.`);
    }
}

// ---------------------------------------------------------------------------
// Music bed
// ---------------------------------------------------------------------------

/** Target RMS level of the synthesized bed before the music gain (about -18 dBFS). */
export const MUSIC_BED_TARGET_RMS = 0.126;

interface MoodRecipe {
    /** Scale degrees (0-based) of the chord progression. */
    Degrees: number[];
    /** Mode used when the key gives none. */
    DefaultMinor: boolean;
    /** Tonal center used when the spec gives none. */
    DefaultKey: string;
    /** Bars each chord holds. */
    BarsPerChord: number;
    /** Pad lowpass cutoff in Hz. */
    Cutoff: number;
    /** Pulse pattern. */
    Pulse: 'Soft' | 'Steady' | 'Driving';
}

const MOOD_RECIPES: Record<SynthesizedMusicMood, MoodRecipe> = {
    Calm: { Degrees: [0, 5, 3, 4], DefaultMinor: false, DefaultKey: 'F', BarsPerChord: 2, Cutoff: 1100, Pulse: 'Soft' },
    Uplifting: { Degrees: [0, 4, 5, 3], DefaultMinor: false, DefaultKey: 'D', BarsPerChord: 1, Cutoff: 2200, Pulse: 'Steady' },
    Corporate: { Degrees: [0, 3, 5, 4], DefaultMinor: false, DefaultKey: 'C', BarsPerChord: 1, Cutoff: 1800, Pulse: 'Steady' },
    Reflective: { Degrees: [0, 5, 2, 6], DefaultMinor: true, DefaultKey: 'Am', BarsPerChord: 2, Cutoff: 1000, Pulse: 'Soft' },
    Tense: { Degrees: [0, 5, 3, 4], DefaultMinor: true, DefaultKey: 'Dm', BarsPerChord: 1, Cutoff: 1400, Pulse: 'Driving' },
};

const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
const MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10];
const NOTE_OFFSETS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/**
 * Resolves a key such as `'F#'` or `'Am'` to a root pitch class and mode.
 */
export function ParseMusicKey(key: string): { PitchClass: number; Minor: boolean } | null {
    const match = /^([A-G])(#|b)?(m)?$/.exec(key.trim());
    if (!match) {
        return null;
    }
    const accidental = match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0;
    return { PitchClass: (NOTE_OFFSETS[match[1]] + accidental + 12) % 12, Minor: match[3] === 'm' };
}

/**
 * Builds the chord list for a bed: MIDI notes of each chord (three-note triad in octave 4) and its
 * bass root (octave 2), in progression order.
 */
export function BuildChordProgression(spec: VideoSynthesizedMusicSpec): Array<{ Notes: number[]; Bass: number }> {
    const recipe = MOOD_RECIPES[spec.Mood] ?? MOOD_RECIPES.Calm;
    const parsed = ParseMusicKey(spec.Key?.trim() || recipe.DefaultKey) ?? ParseMusicKey(recipe.DefaultKey);
    const pitchClass = parsed?.PitchClass ?? 0;
    const minor = spec.Key?.trim() ? Boolean(parsed?.Minor) : recipe.DefaultMinor;
    const scale = minor ? MINOR_SCALE : MAJOR_SCALE;
    const tonic = 60 + pitchClass - (pitchClass > 6 ? 12 : 0);
    const degreeNote = (degree: number): number => tonic + scale[degree % 7] + 12 * Math.floor(degree / 7);
    return recipe.Degrees.map((degree) => ({
        Notes: [degreeNote(degree), degreeNote(degree + 2), degreeNote(degree + 4)],
        Bass: degreeNote(degree) - 24,
    }));
}

interface BedContext {
    Out: StereoBuffer;
    Rand: () => number;
    BeatSeconds: number;
    Recipe: MoodRecipe;
}

function addPadChord(ctx: BedContext, notes: number[], start: number, end: number): void {
    const attack = 0.6;
    const release = 0.8;
    const from = Math.floor(start * MIX_SAMPLE_RATE);
    const to = Math.min(ctx.Out.Left.length, Math.floor((end + release) * MIX_SAMPLE_RATE));
    if (to <= from) {
        return;
    }
    const left = new Float32Array(to - from);
    const right = new Float32Array(to - from);
    for (const note of notes) {
        const hz = MidiToHz(note);
        const detune = [Math.pow(2, -7 / 1200), Math.pow(2, 7 / 1200)];
        const phases = [ctx.Rand(), ctx.Rand()];
        for (let i = 0; i < left.length; i++) {
            const t = i / MIX_SAMPLE_RATE;
            const sawL = 2 * ((hz * detune[0] * t + phases[0]) % 1) - 1;
            const sawR = 2 * ((hz * detune[1] * t + phases[1]) % 1) - 1;
            left[i] += sawL;
            right[i] += sawR;
        }
    }
    const lpL = new Biquad('lowpass', ctx.Recipe.Cutoff);
    const lpR = new Biquad('lowpass', ctx.Recipe.Cutoff);
    const holdEnd = end - start;
    for (let i = 0; i < left.length; i++) {
        const t = i / MIX_SAMPLE_RATE;
        const env = t < attack ? t / attack : t <= holdEnd ? 1 : Math.max(0, 1 - (t - holdEnd) / release);
        ctx.Out.Left[from + i] += lpL.Process(left[i]) * env * 0.12;
        ctx.Out.Right[from + i] += lpR.Process(right[i]) * env * 0.12;
    }
}

function addTone(ctx: BedContext, hz: number, start: number, seconds: number, gain: number, decay: number): void {
    const from = Math.floor(start * MIX_SAMPLE_RATE);
    const length = Math.min(Math.floor(seconds * MIX_SAMPLE_RATE), ctx.Out.Left.length - from);
    for (let i = 0; i < length; i++) {
        const t = i / MIX_SAMPLE_RATE;
        const env = Math.min(1, t / 0.01) * Math.exp(-t * decay);
        const sample = (Math.sin(2 * Math.PI * hz * t) + 0.2 * Math.sin(4 * Math.PI * hz * t)) * env * gain;
        ctx.Out.Left[from + i] += sample;
        ctx.Out.Right[from + i] += sample;
    }
}

function addKick(ctx: BedContext, start: number, gain: number): void {
    const from = Math.floor(start * MIX_SAMPLE_RATE);
    const length = Math.min(samplesFor(0.3), ctx.Out.Left.length - from);
    let phase = 0;
    for (let i = 0; i < length; i++) {
        const t = i / MIX_SAMPLE_RATE;
        phase += (2 * Math.PI * (48 + 80 * Math.exp(-t * 30))) / MIX_SAMPLE_RATE;
        const sample = Math.sin(phase) * Math.exp(-t * 9) * gain;
        ctx.Out.Left[from + i] += sample;
        ctx.Out.Right[from + i] += sample;
    }
}

function addHat(ctx: BedContext, start: number, gain: number): void {
    const from = Math.floor(start * MIX_SAMPLE_RATE);
    const length = Math.min(samplesFor(0.05), ctx.Out.Left.length - from);
    const hp = new Biquad('highpass', 7000);
    for (let i = 0; i < length; i++) {
        const t = i / MIX_SAMPLE_RATE;
        const sample = hp.Process(ctx.Rand() * 2 - 1) * Math.exp(-t * 70) * gain;
        ctx.Out.Left[from + i] += sample * 0.8;
        ctx.Out.Right[from + i] += sample;
    }
}

function addPulse(ctx: BedContext, beatStart: number, beatIndex: number): void {
    const half = ctx.BeatSeconds / 2;
    switch (ctx.Recipe.Pulse) {
        case 'Soft':
            addHat(ctx, beatStart + half, 0.025);
            break;
        case 'Steady':
            addKick(ctx, beatStart, 0.22);
            addHat(ctx, beatStart + half, 0.035);
            break;
        case 'Driving':
            addKick(ctx, beatStart, 0.28);
            addHat(ctx, beatStart + half, 0.04);
            if (beatIndex % 2 === 1) {
                addHat(ctx, beatStart + half / 2, 0.02);
            }
            break;
    }
}

function applyEdgeFades(out: StereoBuffer, fadeInSeconds: number, fadeOutSeconds: number): void {
    const n = out.Left.length;
    const fadeIn = Math.min(n, Math.floor(fadeInSeconds * MIX_SAMPLE_RATE));
    const fadeOut = Math.min(n, Math.floor(fadeOutSeconds * MIX_SAMPLE_RATE));
    for (let i = 0; i < fadeIn; i++) {
        const g = i / fadeIn;
        out.Left[i] *= g;
        out.Right[i] *= g;
    }
    for (let i = 0; i < fadeOut; i++) {
        const g = i / fadeOut;
        out.Left[n - 1 - i] *= g;
        out.Right[n - 1 - i] *= g;
    }
}

function normalizeRms(out: StereoBuffer, targetRms: number, maxPeak: number): void {
    let energy = 0;
    let peak = 0;
    for (let i = 0; i < out.Left.length; i++) {
        energy += out.Left[i] * out.Left[i] + out.Right[i] * out.Right[i];
        peak = Math.max(peak, Math.abs(out.Left[i]), Math.abs(out.Right[i]));
    }
    const rms = Math.sqrt(energy / Math.max(1, out.Left.length * 2));
    if (rms <= 0) {
        return;
    }
    const scale = Math.min(targetRms / rms, maxPeak / peak);
    for (let i = 0; i < out.Left.length; i++) {
        out.Left[i] *= scale;
        out.Right[i] *= scale;
    }
}

/**
 * Renders a synthesized music bed: a pad playing the mood's chord progression, a bass on the chord
 * roots, and a soft pulse, with a 1.5 s fade-in and 2 s fade-out, RMS-normalized to about -18 dBFS
 * with peaks at or below -3 dBFS. Deterministic for a given `(spec, durationSeconds, seed)`.
 */
export function SynthesizeMusicBed(spec: VideoSynthesizedMusicSpec, durationSeconds: number, seed: number): StereoBuffer {
    const out = CreateStereoBuffer(Math.max(0, durationSeconds) * MIX_SAMPLE_RATE);
    if (out.Left.length === 0) {
        return out;
    }
    const recipe = MOOD_RECIPES[spec.Mood] ?? MOOD_RECIPES.Calm;
    const bpm = Math.min(140, Math.max(60, Number.isFinite(spec.Bpm) ? spec.Bpm : 90));
    const ctx: BedContext = { Out: out, Rand: CreatePrng(DeriveSeed(seed, 'music-bed')), BeatSeconds: 60 / bpm, Recipe: recipe };
    const chords = BuildChordProgression(spec);
    const chordSeconds = ctx.BeatSeconds * 4 * recipe.BarsPerChord;
    let beatIndex = 0;
    for (let chordStart = 0, c = 0; chordStart < durationSeconds; chordStart += chordSeconds, c++) {
        const chord = chords[c % chords.length];
        addPadChord(ctx, chord.Notes, chordStart, Math.min(chordStart + chordSeconds, durationSeconds));
        for (let b = 0; b < 4 * recipe.BarsPerChord; b++) {
            const beatStart = chordStart + b * ctx.BeatSeconds;
            if (beatStart >= durationSeconds) {
                break;
            }
            if (b % 2 === 0) {
                addTone(ctx, MidiToHz(chord.Bass), beatStart, ctx.BeatSeconds * 1.6, 0.16, 1.5);
            }
            addPulse(ctx, beatStart, beatIndex++);
        }
    }
    applyEdgeFades(out, 1.5, 2);
    normalizeRms(out, MUSIC_BED_TARGET_RMS, 0.7);
    return out;
}
