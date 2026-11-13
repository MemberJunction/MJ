/**
 * Audio mix defaults and pure helpers shared by the Video Studio engine and render worker (§8).
 *
 * Browser and server safe: no Node APIs.
 */

import type {
    RenderAudioCheckThresholds,
    RenderDuckingSettings,
    RenderLoudnessTarget,
} from './render-contract.js';
import type {
    AudioSynthKind,
    SynthesizedMusicMood,
    VideoGenerationSpec,
} from './video-generation-spec.js';

/** Default music level change under narration, in dB (about -7.5 dB, a clearly audible but unobtrusive duck). */
export const DEFAULT_MUSIC_DUCK_DB = -7.5;

/** Default seconds for music to reach its ducked level; the ramp finishes at the first word. */
export const DEFAULT_MUSIC_DUCK_ATTACK_SECONDS = 0.08;

/** Default seconds for music to recover after a narration line ends. */
export const DEFAULT_MUSIC_DUCK_RELEASE_SECONDS = 0.4;

/** Default hold length in seconds of an explicit `'MusicDuck'` / `'MusicSwell'` cue without `DurationSeconds`. */
export const DEFAULT_MUSIC_EVENT_SECONDS = 2;

/** Default boost in dB of a `'MusicSwell'` cue without `GainDb`. */
export const DEFAULT_MUSIC_SWELL_DB = 3;

/** Default base music level in dB when narration is present (matches the previous fixed 0.18 linear volume). */
export const DEFAULT_MUSIC_GAIN_WITH_NARRATION_DB = -15;

/** Default base music level in dB when the film has no narration. */
export const DEFAULT_MUSIC_GAIN_WITHOUT_NARRATION_DB = -2;

/** Default sound effect level in dB. */
export const DEFAULT_SFX_GAIN_DB = -1;

/** Default `'Riser'` length in seconds. */
export const DEFAULT_RISER_SECONDS = 1.5;

/** Allowed `VideoSynthesizedMusicSpec.Bpm` range. */
export const SYNTH_MUSIC_BPM_RANGE = { Min: 60, Max: 140 } as const;

/** All valid `AudioSynthKind` values. */
export const AUDIO_SYNTH_KINDS = [
    'Whoosh',
    'Click',
    'Tick',
    'Impact',
    'Chime',
    'Riser',
] as const satisfies readonly AudioSynthKind[];

/** All valid `SynthesizedMusicMood` values. */
export const SYNTHESIZED_MUSIC_MOODS = [
    'Calm',
    'Uplifting',
    'Corporate',
    'Reflective',
    'Tense',
] as const satisfies readonly SynthesizedMusicMood[];

/** Default automatic ducking settings. */
export const DEFAULT_DUCKING_SETTINGS: Readonly<RenderDuckingSettings> = Object.freeze({
    Enabled: true,
    DuckDb: DEFAULT_MUSIC_DUCK_DB,
    AttackSeconds: DEFAULT_MUSIC_DUCK_ATTACK_SECONDS,
    ReleaseSeconds: DEFAULT_MUSIC_DUCK_RELEASE_SECONDS,
});

/** Default loudness target: streaming-platform loudness (-14 LUFS, -1.5 dBTP, LRA 11). */
export const DEFAULT_LOUDNESS_TARGET: Readonly<RenderLoudnessTarget> = Object.freeze({
    Enabled: true,
    IntegratedLufs: -14,
    TruePeakDb: -1.5,
    LoudnessRangeLu: 11,
});

/** Default audio check thresholds. */
export const DEFAULT_AUDIO_CHECK_THRESHOLDS: Readonly<RenderAudioCheckThresholds> = Object.freeze({
    LoudnessToleranceLu: 1.5,
    MinNarrationToMusicDb: 10,
    TruePeakToleranceDb: 0.5,
    MinLinePauseSeconds: 0.15,
    SilenceThresholdDb: -45,
});

/** Musical key notation accepted by `VideoSynthesizedMusicSpec.Key`: a note letter, optional `#`/`b`, optional `m`. */
const MUSIC_KEY_REGEX = /^[A-G](#|b)?m?$/;

/**
 * Returns true when `key` is a supported tonal center such as `'C'`, `'F#'`, `'Bb'`, or `'Am'`.
 */
export function IsValidSynthMusicKey(key: string): boolean {
    return MUSIC_KEY_REGEX.test(key.trim());
}

/**
 * Converts a level in dB to a linear amplitude factor.
 */
export function DbToLinear(db: number): number {
    return Math.pow(10, db / 20);
}

/**
 * Converts a linear amplitude factor to dB (returns `-Infinity` for `0`).
 */
export function LinearToDb(linear: number): number {
    return linear > 0 ? 20 * Math.log10(linear) : Number.NEGATIVE_INFINITY;
}

/**
 * Lists the procedurally synthesized sources a spec asks for, as plain-English disclosure lines:
 * the synthesized music bed (only when no licensed track is set) and every `'Sfx'` cue that uses
 * `Synth` without an `AssetKey`. Returns `[]` when the soundtrack uses only supplied files.
 */
export function DescribeSynthesizedAudio(spec: Partial<VideoGenerationSpec>): string[] {
    const lines: string[] = [];
    const music = spec.Audio?.Music;
    if (music && !music.AssetKey?.trim() && music.Synthesized) {
        const key = music.Synthesized.Key?.trim() ? `, key ${music.Synthesized.Key.trim()}` : '';
        lines.push(
            `Music: synthesized ${music.Synthesized.Mood} bed at ${music.Synthesized.Bpm} BPM${key} (procedurally generated, not a licensed track)`,
        );
    }
    const synthCues = (Array.isArray(spec.Audio?.Cues) ? spec.Audio.Cues : []).filter(
        (cue) => cue?.Kind === 'Sfx' && !cue.AssetKey?.trim() && typeof cue.Synth === 'string',
    );
    if (synthCues.length > 0) {
        const parts = synthCues.map(
            (cue) => `${cue.Synth} at ${Number(cue.TimestampSeconds ?? 0).toFixed(2)}s`,
        );
        lines.push(`Sound effects: ${synthCues.length} synthesized (${parts.join(', ')})`);
    }
    return lines;
}
