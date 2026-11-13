import { describe, expect, it } from 'vitest';
import { DEFAULT_DUCKING_SETTINGS, type RenderAudioNarrationTrack } from '@memberjunction/video-studio-core';
import {
    ApplyMusicGainEnvelope,
    BuildMusicGainSegments,
    BuildSpeechIntervals,
    CreateStereoBuffer,
    MIX_SAMPLE_RATE,
    MusicGainDbAt,
    SegmentAmountAt,
} from '../index.js';

function line(key: string, start: number, duration: number): RenderAudioNarrationTrack {
    return { Key: key, Src: `audio/${key}.mp3`, StartSeconds: start, DurationSeconds: duration, Text: 'x' };
}

describe('BuildSpeechIntervals', () => {
    it('sorts, drops empty lines, and merges gaps shorter than attack + release', () => {
        const intervals = BuildSpeechIntervals(
            [line('c', 10, 1), line('a', 1, 2), line('b', 3.2, 1), line('z', 20, 0)],
            0.48,
        );
        expect(intervals).toEqual([
            { Start: 1, End: 4.2 },
            { Start: 10, End: 11 },
        ]);
    });
});

describe('music gain envelope', () => {
    const plan = {
        Narration: [line('a', 2, 2)],
        MusicEvents: [
            { Key: 'duck', Kind: 'Duck' as const, StartSeconds: 8, DurationSeconds: 1, GainDb: -12 },
            { Key: 'swell', Kind: 'Swell' as const, StartSeconds: 12, DurationSeconds: 2, GainDb: 4 },
        ],
        Ducking: { ...DEFAULT_DUCKING_SETTINGS },
    };
    const segments = BuildMusicGainSegments(plan);

    it('ducks -7.5 dB during speech with an 80 ms attack ending at the first word and a 400 ms release', () => {
        expect(MusicGainDbAt(segments, 1)).toBe(0);
        expect(MusicGainDbAt(segments, 2 - 0.04)).toBeCloseTo(-3.75, 6);
        expect(MusicGainDbAt(segments, 2)).toBe(-7.5);
        expect(MusicGainDbAt(segments, 3)).toBe(-7.5);
        expect(MusicGainDbAt(segments, 4 + 0.2)).toBeCloseTo(-3.75, 6);
        expect(MusicGainDbAt(segments, 4.5)).toBe(0);
    });

    it('honors explicit duck and swell cues', () => {
        expect(MusicGainDbAt(segments, 8.5)).toBe(-12);
        expect(MusicGainDbAt(segments, 13)).toBe(4);
        expect(MusicGainDbAt(segments, 11.75)).toBeCloseTo(2, 6);
        expect(MusicGainDbAt(segments, 14.4)).toBeCloseTo(2, 6);
    });

    it('takes the deepest duck and adds the strongest swell when they overlap', () => {
        const overlapping = BuildMusicGainSegments({
            Narration: [line('a', 0, 4)],
            MusicEvents: [
                { Key: 'd', Kind: 'Duck', StartSeconds: 1, DurationSeconds: 1, GainDb: -3 },
                { Key: 's', Kind: 'Swell', StartSeconds: 1, DurationSeconds: 1, GainDb: 3 },
            ],
            Ducking: { ...DEFAULT_DUCKING_SETTINGS },
        });
        expect(MusicGainDbAt(overlapping, 1.5)).toBeCloseTo(-4.5, 6);
    });

    it('turns automatic ducking off when disabled', () => {
        const off = BuildMusicGainSegments({ ...plan, MusicEvents: [], Ducking: { ...DEFAULT_DUCKING_SETTINGS, Enabled: false } });
        expect(off.Ducks).toEqual([]);
        expect(MusicGainDbAt(off, 3)).toBe(0);
    });

    it('SegmentAmountAt is 0 outside the ramps and 1 inside the hold', () => {
        const seg = { Start: 1, End: 2, GainDb: -6, AttackSeconds: 0.5, ReleaseSeconds: 0 };
        expect(SegmentAmountAt(seg, 0.4)).toBe(0);
        expect(SegmentAmountAt(seg, 0.75)).toBeCloseTo(0.5, 9);
        expect(SegmentAmountAt(seg, 2.0001)).toBe(0);
    });

    it('ApplyMusicGainEnvelope scales samples by base gain plus envelope', () => {
        const music = CreateStereoBuffer(5 * MIX_SAMPLE_RATE);
        music.Left.fill(1);
        music.Right.fill(1);
        ApplyMusicGainEnvelope(music, segments, -6);
        expect(music.Left[Math.round(0.5 * MIX_SAMPLE_RATE)]).toBeCloseTo(Math.pow(10, -6 / 20), 4);
        expect(music.Right[Math.round(3 * MIX_SAMPLE_RATE)]).toBeCloseTo(Math.pow(10, -13.5 / 20), 4);
    });
});
