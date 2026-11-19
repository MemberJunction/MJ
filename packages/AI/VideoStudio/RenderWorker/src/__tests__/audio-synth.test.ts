import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { AUDIO_SYNTH_KINDS } from '@memberjunction/video-studio-core';
import {
    Biquad,
    BuildChordProgression,
    CreatePrng,
    DeriveSeed,
    MIX_SAMPLE_RATE,
    MUSIC_BED_TARGET_RMS,
    ParseMusicKey,
    SFX_PEAK,
    SynthesizeMusicBed,
    SynthesizeSfx,
} from '../index.js';

function hashOf(...arrays: Float32Array[]): string {
    const hash = createHash('sha256');
    for (const a of arrays) {
        hash.update(Buffer.from(a.buffer, a.byteOffset, a.byteLength));
    }
    return hash.digest('hex');
}

function peak(a: Float32Array): number {
    return a.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
}

describe('CreatePrng / DeriveSeed', () => {
    it('is deterministic per seed and differs across seeds', () => {
        const a = CreatePrng(7);
        const b = CreatePrng(7);
        const c = CreatePrng(8);
        const seqA = [a(), a(), a()];
        expect([b(), b(), b()]).toEqual(seqA);
        expect([c(), c(), c()]).not.toEqual(seqA);
        expect(seqA.every((v) => v >= 0 && v < 1)).toBe(true);
        expect(DeriveSeed(1, 'sfx:a')).toBe(DeriveSeed(1, 'sfx:a'));
        expect(DeriveSeed(1, 'sfx:a')).not.toBe(DeriveSeed(1, 'sfx:b'));
    });
});

describe('Biquad', () => {
    it('lowpass passes DC and attenuates a high tone', () => {
        const lp = new Biquad('lowpass', 500);
        let out = 0;
        for (let i = 0; i < 4800; i++) {
            out = lp.Process(1);
        }
        expect(out).toBeCloseTo(1, 3);
        const lp2 = new Biquad('lowpass', 500);
        let maxHigh = 0;
        for (let i = 0; i < 4800; i++) {
            const y = lp2.Process(Math.sin((2 * Math.PI * 8000 * i) / MIX_SAMPLE_RATE));
            if (i > 2400) {
                maxHigh = Math.max(maxHigh, Math.abs(y));
            }
        }
        expect(maxHigh).toBeLessThan(0.02);
    });
});

describe('SynthesizeSfx', () => {
    it.each(AUDIO_SYNTH_KINDS)('%s is deterministic, non-silent, and peak-normalized', (kind) => {
        const first = SynthesizeSfx(kind, 42);
        const second = SynthesizeSfx(kind, 42);
        expect(hashOf(first)).toBe(hashOf(second));
        expect(first.length).toBeGreaterThan(0);
        expect(peak(first)).toBeCloseTo(SFX_PEAK, 5);
        expect(first.every((v) => Number.isFinite(v))).toBe(true);
    });

    it('noise-based effects change with the seed', () => {
        expect(hashOf(SynthesizeSfx('Whoosh', 1))).not.toBe(hashOf(SynthesizeSfx('Whoosh', 2)));
    });

    it('sizes a riser from its duration (default 1.5 s)', () => {
        expect(SynthesizeSfx('Riser', 1).length).toBe(1.5 * MIX_SAMPLE_RATE);
        expect(SynthesizeSfx('Riser', 1, 2.5).length).toBe(2.5 * MIX_SAMPLE_RATE);
    });
});

describe('music bed', () => {
    it('parses keys and builds diatonic progressions', () => {
        expect(ParseMusicKey('F#')).toEqual({ PitchClass: 6, Minor: false });
        expect(ParseMusicKey('Bbm')).toEqual({ PitchClass: 10, Minor: true });
        expect(ParseMusicKey('H')).toBeNull();
        // Corporate in C: I IV vi V
        const chords = BuildChordProgression({ Mood: 'Corporate', Bpm: 100, Key: 'C' });
        expect(chords.map((c) => c.Notes)).toEqual([
            [60, 64, 67],
            [65, 69, 72],
            [69, 72, 76],
            [67, 71, 74],
        ]);
        expect(chords[0].Bass).toBe(36);
        // An explicit minor key switches the mode: Am, i = A C E
        expect(BuildChordProgression({ Mood: 'Calm', Bpm: 80, Key: 'Am' })[0].Notes).toEqual([57, 60, 64]);
    });

    it('is deterministic, the right length, faded at both ends, and normalized', () => {
        const spec = { Mood: 'Uplifting' as const, Bpm: 110, Key: 'D' };
        const bed = SynthesizeMusicBed(spec, 6, 9);
        const again = SynthesizeMusicBed(spec, 6, 9);
        expect(hashOf(bed.Left, bed.Right)).toBe(hashOf(again.Left, again.Right));
        expect(hashOf(bed.Left, bed.Right)).not.toBe(hashOf(...Object.values(SynthesizeMusicBed(spec, 6, 10))));
        expect(bed.Left.length).toBe(6 * MIX_SAMPLE_RATE);
        expect(Math.abs(bed.Left[0])).toBeLessThan(1e-6);
        expect(Math.abs(bed.Left[bed.Left.length - 1])).toBeLessThan(1e-3);
        let energy = 0;
        for (let i = 0; i < bed.Left.length; i++) {
            energy += bed.Left[i] ** 2 + bed.Right[i] ** 2;
        }
        const rms = Math.sqrt(energy / (bed.Left.length * 2));
        expect(rms).toBeGreaterThan(MUSIC_BED_TARGET_RMS * 0.5);
        expect(rms).toBeLessThanOrEqual(MUSIC_BED_TARGET_RMS * 1.0001);
        expect(Math.max(peak(bed.Left), peak(bed.Right))).toBeLessThanOrEqual(0.7 + 1e-6);
    });

    it('renders every mood', () => {
        for (const mood of ['Calm', 'Uplifting', 'Corporate', 'Reflective', 'Tense'] as const) {
            const bed = SynthesizeMusicBed({ Mood: mood, Bpm: 90 }, 3, 1);
            expect(peak(bed.Left)).toBeGreaterThan(0.05);
        }
        expect(SynthesizeMusicBed({ Mood: 'Calm', Bpm: 90 }, 0, 1).Left.length).toBe(0);
    });
});
