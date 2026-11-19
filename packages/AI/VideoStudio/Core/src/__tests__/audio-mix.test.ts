import { describe, expect, it } from 'vitest';
import {
    ClampRenderCaptureWorkers,
    DbToLinear,
    DefaultRenderCaptureWorkers,
    DescribeSynthesizedAudio,
    IsValidSynthMusicKey,
    LinearToDb,
    MAX_RENDER_CAPTURE_WORKERS,
    ValidateVideoGenerationSpec,
} from '../index.js';
import type { VideoGenerationSpec } from '../index.js';

describe('DescribeSynthesizedAudio', () => {
    it('returns nothing when the soundtrack uses supplied files only', () => {
        const spec: Partial<VideoGenerationSpec> = {
            Audio: {
                Music: { AssetKey: 'track' },
                Cues: [{ Key: 'c1', TimestampSeconds: 1, Kind: 'Sfx', AssetKey: 'click' }],
                Captions: 'None',
            },
        };
        expect(DescribeSynthesizedAudio(spec)).toEqual([]);
    });

    it('discloses a synthesized bed and synthesized effects', () => {
        const spec: Partial<VideoGenerationSpec> = {
            Audio: {
                Music: { Synthesized: { Mood: 'Uplifting', Bpm: 100, Key: 'D' } },
                Cues: [
                    { Key: 'c1', TimestampSeconds: 1.5, Kind: 'Sfx', Synth: 'Whoosh' },
                    { Key: 'c2', TimestampSeconds: 3, Kind: 'Sfx', AssetKey: 'click', Synth: 'Click' },
                ],
                Captions: 'None',
            },
        };
        const lines = DescribeSynthesizedAudio(spec);
        expect(lines).toHaveLength(2);
        expect(lines[0]).toContain('synthesized Uplifting bed at 100 BPM, key D');
        expect(lines[0]).toContain('not a licensed track');
        expect(lines[1]).toBe('Sound effects: 1 synthesized (Whoosh at 1.50s)');
    });

    it('does not disclose a synthesized bed when a licensed track wins', () => {
        const spec: Partial<VideoGenerationSpec> = {
            Audio: { Music: { AssetKey: 'track', Synthesized: { Mood: 'Calm', Bpm: 80 } }, Cues: [], Captions: 'None' },
        };
        expect(DescribeSynthesizedAudio(spec)).toEqual([]);
    });
});

describe('capture worker sizing', () => {
    it('defaults to half the CPUs, between 1 and 4', () => {
        expect(DefaultRenderCaptureWorkers(1)).toBe(1);
        expect(DefaultRenderCaptureWorkers(2)).toBe(1);
        expect(DefaultRenderCaptureWorkers(4)).toBe(2);
        expect(DefaultRenderCaptureWorkers(16)).toBe(4);
        expect(DefaultRenderCaptureWorkers(Number.NaN)).toBe(1);
    });

    it('clamps a request to the CPU count and the hard ceiling', () => {
        expect(ClampRenderCaptureWorkers(undefined, 8)).toBeUndefined();
        expect(ClampRenderCaptureWorkers(Number.NaN, 8)).toBeUndefined();
        expect(ClampRenderCaptureWorkers(0, 8)).toBe(1);
        expect(ClampRenderCaptureWorkers(3.7, 8)).toBe(3);
        expect(ClampRenderCaptureWorkers(6, 4)).toBe(4);
        expect(ClampRenderCaptureWorkers(64, 128)).toBe(MAX_RENDER_CAPTURE_WORKERS);
    });
});

describe('audio helpers', () => {
    it('accepts note-letter keys only', () => {
        for (const key of ['C', 'F#', 'Bb', 'Am', 'C#m']) {
            expect(IsValidSynthMusicKey(key)).toBe(true);
        }
        for (const key of ['H', 'c', 'C major', '', 'Cmaj7']) {
            expect(IsValidSynthMusicKey(key)).toBe(false);
        }
    });

    it('converts between dB and linear gain', () => {
        expect(DbToLinear(0)).toBe(1);
        expect(DbToLinear(-20)).toBeCloseTo(0.1, 10);
        expect(LinearToDb(0.5)).toBeCloseTo(-6.0206, 3);
        expect(LinearToDb(0)).toBe(Number.NEGATIVE_INFINITY);
    });
});

describe('audio validation rules', () => {
    function specWithAudio(audio: VideoGenerationSpec['Audio']): VideoGenerationSpec {
        return {
            SpecVersion: '1.0',
            Status: 'Briefing',
            Archetype: { Name: 'Topic Explainer' },
            Film: { OneSentence: 'x', Audience: 'y', Purpose: 'z', DurationSeconds: 10, Formats: ['16:9'] },
            Assets: { Approved: [], Required: [], NeverInvent: [] },
            Style: {} as VideoGenerationSpec['Style'],
            Beats: [],
            DataBindings: [],
            Audio: audio,
            Render: { Renderer: 'HyperFrames', RendererVersion: '0.8.134', Fps: 30, Seed: 1, Quality: 'draft' },
            Interaction: { Mode: 'Autonomous', MaxRepairRounds: 1 },
            Deliverables: { Formats: ['16:9'], Poster: false, ContactSheets: false, Source: false, Captions: false },
            Review: { Gates: [], Rounds: [] },
        };
    }
    function codesFor(audio: VideoGenerationSpec['Audio']): string[] {
        return ValidateVideoGenerationSpec(specWithAudio(audio), 'Briefing').Errors.map((e) => `${e.Code}@${e.Path}`);
    }

    it('accepts synthesized music and synthesized effects with in-range mix values', () => {
        expect(
            codesFor({
                Music: { Synthesized: { Mood: 'Corporate', Bpm: 96, Key: 'F' }, GainDb: -16 },
                Cues: [
                    { Key: 'whoosh', TimestampSeconds: 2, Kind: 'Sfx', Synth: 'Whoosh', GainDb: -3 },
                    { Key: 'riser', TimestampSeconds: 5, Kind: 'Sfx', Synth: 'Riser', DurationSeconds: 2 },
                    { Key: 'duck', TimestampSeconds: 6, Kind: 'MusicDuck', DurationSeconds: 1.5, GainDb: -12 },
                    { Key: 'swell', TimestampSeconds: 8, Kind: 'MusicSwell', GainDb: 4 },
                ],
                Captions: 'None',
            }),
        ).toEqual([]);
    });

    it('rejects music with no source, bad mood, bad key, and an out-of-range gain', () => {
        expect(codesFor({ Music: {}, Cues: [], Captions: 'None' })).toEqual(['InvalidMusicSpec@Audio.Music']);
        expect(
            codesFor({
                Music: { Synthesized: { Mood: 'Spooky' as 'Calm', Bpm: 90, Key: 'X' }, GainDb: 12 },
                Cues: [],
                Captions: 'None',
            }),
        ).toEqual([
            'InvalidMusicSpec@Audio.Music.GainDb',
            'InvalidEnumValue@Audio.Music.Synthesized.Mood',
            'InvalidMusicSpec@Audio.Music.Synthesized.Key',
        ]);
    });

    it('rejects Synth on a non-Sfx cue, an unknown Synth, and out-of-range cue gains and spans', () => {
        expect(
            codesFor({
                Cues: [
                    { Key: 'a', TimestampSeconds: 1, Kind: 'MusicDuck', Synth: 'Click', GainDb: 3 },
                    { Key: 'b', TimestampSeconds: 1, Kind: 'Sfx', Synth: 'Laser' as 'Click' },
                    { Key: 'c', TimestampSeconds: 1, Kind: 'MusicSwell', DurationSeconds: 60 },
                    { Key: 'd', TimestampSeconds: 1, Kind: 'Silence', GainDb: -3 },
                ],
                Captions: 'None',
            }),
        ).toEqual([
            'InvalidAudioCue@Audio.Cues[0].Synth',
            'InvalidAudioCue@Audio.Cues[0].GainDb',
            'InvalidEnumValue@Audio.Cues[1].Synth',
            'InvalidAudioCue@Audio.Cues[2].DurationSeconds',
            'InvalidAudioCue@Audio.Cues[3].GainDb',
        ]);
    });

    it('validates the Art Director sound direction like a synthesized bed', () => {
        const spec = specWithAudio({ Cues: [], Captions: 'None' });
        spec.Style = { Sound: { SynthesizedMusic: { Mood: 'Calm', Bpm: 30 }, Notes: 'soft ticks' } } as VideoGenerationSpec['Style'];
        expect(ValidateVideoGenerationSpec(spec, 'Briefing').Errors.map((e) => `${e.Code}@${e.Path}`)).toEqual([
            'InvalidMusicSpec@Style.Sound.SynthesizedMusic.Bpm',
        ]);
    });

    it('bounds narration pauses to 0..3 seconds', () => {
        const audio: VideoGenerationSpec['Audio'] = {
            Narration: {
                VoiceID: 'v',
                Provider: 'p',
                Script: [
                    { Key: 'l1', BeatKey: 'b1', Text: 'Hi.', PauseBeforeSeconds: 0, PauseAfterSeconds: 3 },
                    { Key: 'l2', BeatKey: 'b1', Text: 'There.', PauseBeforeSeconds: -0.1, PauseAfterSeconds: Number.NaN },
                ],
            },
            Cues: [],
            Captions: 'None',
        };
        expect(codesFor(audio)).toEqual([
            'InvalidNarrationPause@Audio.Narration.Script[1].PauseBeforeSeconds',
            'InvalidNarrationPause@Audio.Narration.Script[1].PauseAfterSeconds',
        ]);
    });
});
