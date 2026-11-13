/**
 * Builds the Video Studio soundtrack from a {@link RenderAudioMixPlan} (§8): places narration clips on
 * the master timeline, lays the music (licensed or synthesized) under them with automatic ducking and
 * explicit duck/swell cues, adds sound effects (files or synthesized), and measures how far the
 * narration sits above the music on every line. Pure over decoded PCM, so it is fully unit-testable.
 */

import {
    DbToLinear,
    type RenderAudioMixPlan,
    type RenderAudioNarrationTrack,
} from '@memberjunction/video-studio-core';
import type { LineMaskingMeasurement } from '../checks/audio-checks.js';
import { ApplyMusicGainEnvelope, BuildMusicGainSegments } from './ducking.js';
import {
    CreateStereoBuffer,
    DeriveSeed,
    MIX_SAMPLE_RATE,
    SynthesizeMusicBed,
    SynthesizeSfx,
    type StereoBuffer,
} from './synth.js';

/** Fade-out in seconds applied to a licensed music track at the end of the film. */
export const MUSIC_END_FADE_SECONDS = 1.5;

/** Decoded audio sources referenced by a plan (keyed by narration line key / cue key). */
export interface DecodedMixSources {
    /** Mono narration clips keyed by `RenderAudioNarrationTrack.Key`. */
    Narration: Map<string, Float32Array>;
    /** Decoded licensed music track, when the plan names one. */
    Music?: StereoBuffer;
    /** Mono sound-effect files keyed by `RenderAudioSfxTrack.Key`. */
    Sfx: Map<string, Float32Array>;
}

/** The three stems of a mix, each `DurationSeconds` long. */
export interface MixStems {
    /** Narration (mono). */
    Narration: Float32Array;
    /** Music after base gain, ducking, swells, and the end fade. */
    Music: StereoBuffer;
    /** Sound effects. */
    Sfx: StereoBuffer;
    /** True when the plan had music and it produced samples. */
    HasMusic: boolean;
    /** Disclosure lines for synthesized sources. */
    Synthesized: string[];
}

function frameCount(seconds: number): number {
    return Math.max(0, Math.round(seconds * MIX_SAMPLE_RATE));
}

function addMono(target: Float32Array, source: Float32Array, startFrame: number, gain: number): void {
    const from = Math.max(0, startFrame);
    const end = Math.min(target.length, startFrame + source.length);
    for (let i = from; i < end; i++) {
        target[i] += source[i - startFrame] * gain;
    }
}

function addMonoToStereo(target: StereoBuffer, source: Float32Array, startFrame: number, gain: number): void {
    addMono(target.Left, source, startFrame, gain);
    addMono(target.Right, source, startFrame, gain);
}

function buildNarrationStem(plan: RenderAudioMixPlan, sources: DecodedMixSources, length: number): Float32Array {
    const stem = new Float32Array(length);
    for (const line of plan.Narration) {
        const clip = sources.Narration.get(line.Key);
        if (clip) {
            addMono(stem, clip, frameCount(line.StartSeconds), 1);
        }
    }
    return stem;
}

function fadeOutEnd(buffer: StereoBuffer, seconds: number): void {
    const n = buffer.Left.length;
    const fade = Math.min(n, frameCount(seconds));
    for (let i = 0; i < fade; i++) {
        const g = i / fade;
        buffer.Left[n - 1 - i] *= g;
        buffer.Right[n - 1 - i] *= g;
    }
}

function buildMusicStem(plan: RenderAudioMixPlan, sources: DecodedMixSources, length: number, synthesized: string[]): StereoBuffer | null {
    const music = plan.Music;
    if (!music) {
        return null;
    }
    let stem: StereoBuffer;
    if (music.Src) {
        if (!sources.Music) {
            return null;
        }
        stem = CreateStereoBuffer(length);
        stem.Left.set(sources.Music.Left.subarray(0, length));
        stem.Right.set(sources.Music.Right.subarray(0, length));
        fadeOutEnd(stem, MUSIC_END_FADE_SECONDS);
    } else if (music.Synthesized) {
        stem = SynthesizeMusicBed(music.Synthesized, length / MIX_SAMPLE_RATE, plan.Seed);
        const key = music.Synthesized.Key ? `, key ${music.Synthesized.Key}` : '';
        synthesized.push(`Music: synthesized ${music.Synthesized.Mood} bed at ${music.Synthesized.Bpm} BPM${key} (procedurally generated, not a licensed track)`);
    } else {
        return null;
    }
    ApplyMusicGainEnvelope(stem, BuildMusicGainSegments(plan), music.GainDb);
    return stem;
}

function buildSfxStem(plan: RenderAudioMixPlan, sources: DecodedMixSources, length: number, synthesized: string[]): StereoBuffer {
    const stem = CreateStereoBuffer(length);
    const synthLabels: string[] = [];
    for (const sfx of plan.Sfx) {
        const gain = DbToLinear(sfx.GainDb);
        if (sfx.Src) {
            const clip = sources.Sfx.get(sfx.Key);
            if (clip) {
                addMonoToStereo(stem, clip, frameCount(sfx.StartSeconds), gain);
            }
            continue;
        }
        if (!sfx.Synth) {
            continue;
        }
        const clip = SynthesizeSfx(sfx.Synth, DeriveSeed(plan.Seed, `sfx:${sfx.Key}`), sfx.DurationSeconds);
        const start = sfx.Synth === 'Riser' ? frameCount(sfx.StartSeconds) - clip.length : frameCount(sfx.StartSeconds);
        addMonoToStereo(stem, clip, start, gain);
        synthLabels.push(`${sfx.Synth} at ${sfx.StartSeconds.toFixed(2)}s`);
    }
    if (synthLabels.length > 0) {
        synthesized.push(`Sound effects: ${synthLabels.length} synthesized (${synthLabels.join(', ')})`);
    }
    return stem;
}

/**
 * Builds the narration, music, and effects stems for `plan`, each exactly `plan.DurationSeconds` long.
 * Sources missing from `sources` are skipped (the caller reports them as missing).
 */
export function BuildMixStems(plan: RenderAudioMixPlan, sources: DecodedMixSources): MixStems {
    const length = frameCount(plan.DurationSeconds);
    const synthesized: string[] = [];
    const music = buildMusicStem(plan, sources, length, synthesized);
    return {
        Narration: buildNarrationStem(plan, sources, length),
        Music: music ?? CreateStereoBuffer(length),
        Sfx: buildSfxStem(plan, sources, length, synthesized),
        HasMusic: music !== null,
        Synthesized: synthesized,
    };
}

/** Sums the stems into the stereo mix (narration centered). */
export function MixStemsToStereo(stems: MixStems): StereoBuffer {
    const length = stems.Narration.length;
    const mix = CreateStereoBuffer(length);
    for (let i = 0; i < length; i++) {
        mix.Left[i] = stems.Narration[i] + stems.Music.Left[i] + stems.Sfx.Left[i];
        mix.Right[i] = stems.Narration[i] + stems.Music.Right[i] + stems.Sfx.Right[i];
    }
    return mix;
}

function meanPower(channels: readonly Float32Array[], from: number, to: number): number {
    let sum = 0;
    let count = 0;
    for (const channel of channels) {
        for (let i = from; i < to; i++) {
            sum += channel[i] * channel[i];
            count++;
        }
    }
    return count > 0 ? sum / count : 0;
}

/**
 * Measures, for every narration line, the narration level minus the music level (power over the
 * line's span, in dB). Returns `[]` when the mix has no music. A line whose music is silent reports
 * `+Infinity`; a line whose narration is silent is skipped (the missing-audio check covers it).
 */
export function MeasureLineMasking(lines: readonly RenderAudioNarrationTrack[], stems: MixStems): LineMaskingMeasurement[] {
    if (!stems.HasMusic) {
        return [];
    }
    const results: LineMaskingMeasurement[] = [];
    for (const line of lines) {
        const from = Math.min(stems.Narration.length, frameCount(line.StartSeconds));
        const to = Math.min(stems.Narration.length, frameCount(line.StartSeconds + line.DurationSeconds));
        if (to <= from) {
            continue;
        }
        const narrationPower = meanPower([stems.Narration], from, to);
        if (narrationPower <= 0) {
            continue;
        }
        const musicPower = meanPower([stems.Music.Left, stems.Music.Right], from, to);
        results.push({
            LineKey: line.Key,
            ...(line.BeatKey ? { BeatKey: line.BeatKey } : {}),
            StartSeconds: line.StartSeconds,
            RatioDb: musicPower > 0 ? 10 * Math.log10(narrationPower / musicPower) : Number.POSITIVE_INFINITY,
        });
    }
    return results;
}
