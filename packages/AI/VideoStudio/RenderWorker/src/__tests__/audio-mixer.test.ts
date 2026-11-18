import { describe, expect, it } from 'vitest';
import {
    DEFAULT_AUDIO_CHECK_THRESHOLDS,
    DEFAULT_DUCKING_SETTINGS,
    DEFAULT_LOUDNESS_TARGET,
    type RenderAudioMixPlan,
} from '@memberjunction/video-studio-core';
import {
    BuildMixStems,
    CreateStereoBuffer,
    MeasureLineMasking,
    MIX_SAMPLE_RATE,
    MixStemsToStereo,
    SynthesizeSfx,
    type DecodedMixSources,
} from '../index.js';

function tone(seconds: number, amplitude: number, hz = 220): Float32Array {
    const out = new Float32Array(Math.round(seconds * MIX_SAMPLE_RATE));
    for (let i = 0; i < out.length; i++) {
        out[i] = Math.sin((2 * Math.PI * hz * i) / MIX_SAMPLE_RATE) * amplitude;
    }
    return out;
}

function basePlan(overrides: Partial<RenderAudioMixPlan> = {}): RenderAudioMixPlan {
    return {
        DurationSeconds: 6,
        Seed: 3,
        Narration: [{ Key: 'l1', BeatKey: 'b1', Src: 'audio/l1.mp3', StartSeconds: 1, DurationSeconds: 2, Text: 'Hello there.' }],
        Music: { Src: 'music.mp3', GainDb: -15 },
        Sfx: [],
        MusicEvents: [],
        Ducking: { ...DEFAULT_DUCKING_SETTINGS },
        Loudness: { ...DEFAULT_LOUDNESS_TARGET },
        Checks: { ...DEFAULT_AUDIO_CHECK_THRESHOLDS },
        ...overrides,
    };
}

function sources(): DecodedMixSources {
    const music = CreateStereoBuffer(8 * MIX_SAMPLE_RATE);
    music.Left.set(tone(8, 0.5, 110));
    music.Right.set(tone(8, 0.5, 110));
    return { Narration: new Map([['l1', tone(2, 0.3)]]), Music: music, Sfx: new Map() };
}

describe('BuildMixStems', () => {
    it('places narration at its start time and trims music to the film', () => {
        const stems = BuildMixStems(basePlan(), sources());
        expect(stems.Narration.length).toBe(6 * MIX_SAMPLE_RATE);
        expect(stems.Narration[Math.round(0.5 * MIX_SAMPLE_RATE)]).toBe(0);
        expect(Math.abs(stems.Narration[Math.round(1.0012 * MIX_SAMPLE_RATE)])).toBeGreaterThan(0);
        expect(stems.Music.Left.length).toBe(6 * MIX_SAMPLE_RATE);
        expect(stems.HasMusic).toBe(true);
        expect(stems.Synthesized).toEqual([]);
        // The licensed track fades to silence at the very end of the film.
        expect(Math.abs(stems.Music.Left[stems.Music.Left.length - 1])).toBeLessThan(1e-3);
    });

    it('ducks the music under narration (about -7.5 dB) relative to an undisturbed stretch', () => {
        const stems = BuildMixStems(basePlan(), sources());
        const rms = (from: number, to: number): number => {
            let e = 0;
            for (let i = Math.round(from * MIX_SAMPLE_RATE); i < Math.round(to * MIX_SAMPLE_RATE); i++) {
                e += stems.Music.Left[i] ** 2;
            }
            return Math.sqrt(e / ((to - from) * MIX_SAMPLE_RATE));
        };
        const ducked = 20 * Math.log10(rms(1.5, 2.5) / rms(3.6, 4.4));
        expect(ducked).toBeCloseTo(-7.5, 1);
    });

    it('measures the narration-to-music ratio per line and fails a quiet line', () => {
        const stems = BuildMixStems(basePlan(), sources());
        const [masking] = MeasureLineMasking(basePlan().Narration, stems);
        // narration 0.3 sine vs music 0.5 sine at -15 dB then -7.5 dB duck: 20log10(0.3/0.5) + 22.5
        expect(masking.RatioDb).toBeCloseTo(20 * Math.log10(0.3 / 0.5) + 22.5, 0);
        const loud = BuildMixStems(basePlan({ Music: { Src: 'music.mp3', GainDb: 0 }, Ducking: { ...DEFAULT_DUCKING_SETTINGS, Enabled: false } }), sources());
        expect(MeasureLineMasking(basePlan().Narration, loud)[0].RatioDb).toBeLessThan(0);
    });

    it('returns no masking measurements without music', () => {
        const stems = BuildMixStems(basePlan({ Music: undefined }), sources());
        expect(stems.HasMusic).toBe(false);
        expect(MeasureLineMasking(basePlan().Narration, stems)).toEqual([]);
    });

    it('synthesizes a music bed and effects, discloses them, and ends a riser on its cue', () => {
        const plan = basePlan({
            Music: { Synthesized: { Mood: 'Calm', Bpm: 80 }, GainDb: -15 },
            Sfx: [
                { Key: 'w', StartSeconds: 0.5, Synth: 'Whoosh', GainDb: 0 },
                { Key: 'r', StartSeconds: 4, Synth: 'Riser', GainDb: 0, DurationSeconds: 1 },
            ],
        });
        const stems = BuildMixStems(plan, { Narration: new Map(), Sfx: new Map() });
        expect(stems.HasMusic).toBe(true);
        expect(stems.Synthesized).toEqual([
            'Music: synthesized Calm bed at 80 BPM (procedurally generated, not a licensed track)',
            'Sound effects: 2 synthesized (Whoosh at 0.50s, Riser at 4.00s)',
        ]);
        const riser = SynthesizeSfx('Riser', 0, 1);
        expect(riser.length).toBe(MIX_SAMPLE_RATE);
        let energyBefore = 0;
        let energyAfter = 0;
        for (let i = 3.5 * MIX_SAMPLE_RATE; i < 4 * MIX_SAMPLE_RATE; i++) energyBefore += stems.Sfx.Left[i] ** 2;
        for (let i = 4.05 * MIX_SAMPLE_RATE; i < 4.55 * MIX_SAMPLE_RATE; i++) energyAfter += stems.Sfx.Left[i] ** 2;
        expect(energyBefore).toBeGreaterThan(0);
        expect(energyAfter).toBe(0);
        // Same plan, same samples.
        const again = BuildMixStems(plan, { Narration: new Map(), Sfx: new Map() });
        expect(Buffer.from(again.Music.Left.buffer).equals(Buffer.from(stems.Music.Left.buffer))).toBe(true);
    });

    it('sums stems into the stereo mix', () => {
        const stems = BuildMixStems(basePlan(), sources());
        const mix = MixStemsToStereo(stems);
        const i = Math.round(2 * MIX_SAMPLE_RATE);
        expect(mix.Left[i]).toBeCloseTo(stems.Narration[i] + stems.Music.Left[i] + stems.Sfx.Left[i], 6);
    });
});
