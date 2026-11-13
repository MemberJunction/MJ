/**
 * Music gain envelope for the Video Studio mix (§8): automatic ducking under narration plus explicit
 * `'MusicDuck'` / `'MusicSwell'` cues. Pure math, no I/O.
 *
 * Each contribution is a trapezoid in dB: it ramps linearly from 0 dB to its full change over the
 * attack ending at `Start`, holds through `End`, and ramps back over the release. At any instant the
 * music's gain change is the deepest active duck plus the strongest active swell.
 */

import type { RenderAudioMixPlan, RenderAudioNarrationTrack } from '@memberjunction/video-studio-core';
import { MIX_SAMPLE_RATE, type StereoBuffer } from './synth.js';

/** Attack in seconds of an explicit `'MusicSwell'` cue. */
export const SWELL_ATTACK_SECONDS = 0.5;

/** Release in seconds of an explicit `'MusicSwell'` cue. */
export const SWELL_RELEASE_SECONDS = 0.8;

/** Samples between envelope evaluations; gain is linearly interpolated in between. */
export const ENVELOPE_CONTROL_SAMPLES = 64;

/** A closed time interval in seconds. */
export interface TimeInterval {
    Start: number;
    End: number;
}

/** One trapezoidal gain change on the music. */
export interface GainSegment extends TimeInterval {
    /** Full change in dB (negative ducks, positive swells). */
    GainDb: number;
    /** Ramp-in length in seconds, ending at `Start`. */
    AttackSeconds: number;
    /** Ramp-out length in seconds, starting at `End`. */
    ReleaseSeconds: number;
}

/** All gain changes applied to the music. */
export interface MusicGainSegments {
    Ducks: GainSegment[];
    Swells: GainSegment[];
}

/**
 * Turns narration lines into speech intervals on the master timeline, merging lines separated by less
 * than `mergeGapSeconds` so the music does not pump back up in the short gap between two lines.
 */
export function BuildSpeechIntervals(
    narration: readonly RenderAudioNarrationTrack[],
    mergeGapSeconds: number,
): TimeInterval[] {
    const intervals = narration
        .filter((n) => Number.isFinite(n.StartSeconds) && Number.isFinite(n.DurationSeconds) && n.DurationSeconds > 0)
        .map((n) => ({ Start: Math.max(0, n.StartSeconds), End: Math.max(0, n.StartSeconds) + n.DurationSeconds }))
        .sort((a, b) => a.Start - b.Start);
    const merged: TimeInterval[] = [];
    for (const interval of intervals) {
        const last = merged[merged.length - 1];
        if (last && interval.Start - last.End < mergeGapSeconds) {
            last.End = Math.max(last.End, interval.End);
        } else {
            merged.push({ ...interval });
        }
    }
    return merged;
}

/**
 * Builds the duck and swell segments for a plan: one automatic duck per (merged) speech interval when
 * ducking is enabled, plus every explicit music event.
 */
export function BuildMusicGainSegments(plan: Pick<RenderAudioMixPlan, 'Narration' | 'MusicEvents' | 'Ducking'>): MusicGainSegments {
    const { Ducking } = plan;
    const ducks: GainSegment[] = [];
    if (Ducking.Enabled && Ducking.DuckDb < 0) {
        for (const speech of BuildSpeechIntervals(plan.Narration, Ducking.AttackSeconds + Ducking.ReleaseSeconds)) {
            ducks.push({ ...speech, GainDb: Ducking.DuckDb, AttackSeconds: Ducking.AttackSeconds, ReleaseSeconds: Ducking.ReleaseSeconds });
        }
    }
    const swells: GainSegment[] = [];
    for (const event of plan.MusicEvents ?? []) {
        const span = { Start: event.StartSeconds, End: event.StartSeconds + Math.max(0, event.DurationSeconds) };
        if (event.Kind === 'Duck' && event.GainDb < 0) {
            ducks.push({ ...span, GainDb: event.GainDb, AttackSeconds: Ducking.AttackSeconds, ReleaseSeconds: Ducking.ReleaseSeconds });
        } else if (event.Kind === 'Swell' && event.GainDb > 0) {
            swells.push({ ...span, GainDb: event.GainDb, AttackSeconds: SWELL_ATTACK_SECONDS, ReleaseSeconds: SWELL_RELEASE_SECONDS });
        }
    }
    return { Ducks: ducks, Swells: swells };
}

/** Fraction (0..1) of a segment's full change in effect at time `t`. */
export function SegmentAmountAt(segment: GainSegment, t: number): number {
    if (t >= segment.Start && t <= segment.End) {
        return 1;
    }
    if (t < segment.Start) {
        const lead = segment.Start - t;
        return segment.AttackSeconds > 0 && lead < segment.AttackSeconds ? 1 - lead / segment.AttackSeconds : 0;
    }
    const lag = t - segment.End;
    return segment.ReleaseSeconds > 0 && lag < segment.ReleaseSeconds ? 1 - lag / segment.ReleaseSeconds : 0;
}

/**
 * Music gain change in dB at time `t`: the deepest active duck plus the strongest active swell.
 */
export function MusicGainDbAt(segments: MusicGainSegments, t: number): number {
    let duck = 0;
    for (const segment of segments.Ducks) {
        duck = Math.min(duck, segment.GainDb * SegmentAmountAt(segment, t));
    }
    let swell = 0;
    for (const segment of segments.Swells) {
        swell = Math.max(swell, segment.GainDb * SegmentAmountAt(segment, t));
    }
    return duck + swell;
}

/**
 * Applies `baseGainDb` plus the envelope to `music` in place, evaluating the envelope every
 * {@link ENVELOPE_CONTROL_SAMPLES} samples and interpolating linear gain in between.
 */
export function ApplyMusicGainEnvelope(music: StereoBuffer, segments: MusicGainSegments, baseGainDb: number): void {
    const n = music.Left.length;
    const gainAt = (index: number): number => Math.pow(10, (baseGainDb + MusicGainDbAt(segments, index / MIX_SAMPLE_RATE)) / 20);
    let blockStartGain = gainAt(0);
    for (let blockStart = 0; blockStart < n; blockStart += ENVELOPE_CONTROL_SAMPLES) {
        const blockEnd = Math.min(n, blockStart + ENVELOPE_CONTROL_SAMPLES);
        const blockEndGain = gainAt(blockEnd);
        const span = blockEnd - blockStart;
        for (let i = blockStart; i < blockEnd; i++) {
            const g = blockStartGain + ((blockEndGain - blockStartGain) * (i - blockStart)) / span;
            music.Left[i] *= g;
            music.Right[i] *= g;
        }
        blockStartGain = blockEndGain;
    }
}
