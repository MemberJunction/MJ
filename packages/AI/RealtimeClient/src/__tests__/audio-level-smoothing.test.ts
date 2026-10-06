import { describe, it, expect } from 'vitest';
import {
    AudioLevelSmoother,
    GateAudioLevel,
    SmoothAudioBars,
    SmoothAudioLevel,
    SynthesizeAudioBars,
    DEFAULT_AUDIO_ATTACK,
    DEFAULT_AUDIO_DECAY,
} from '../audio/audioMeter';
import { LIVEKIT_METER_GOLDEN } from './fixtures/livekit-meter.golden';

describe('GateAudioLevel', () => {
    it('reads a level at or below the gate as silence', () => {
        expect(GateAudioLevel(0.03, 0.045)).toBe(0);
        expect(GateAudioLevel(0.045, 0.045)).toBe(0);
        expect(GateAudioLevel(Number.NaN, 0.045)).toBe(0);
    });

    it('rescales the range above the gate to 0..1, so speech is not clipped', () => {
        expect(GateAudioLevel(1, 0.2)).toBe(1);
        expect(GateAudioLevel(0.6, 0.2)).toBeCloseTo(0.5, 12);
    });
});

describe('SmoothAudioLevel', () => {
    it('rises by the attack and falls by the decay', () => {
        expect(SmoothAudioLevel(0, 1)).toBeCloseTo(DEFAULT_AUDIO_ATTACK, 12);
        expect(SmoothAudioLevel(1, 0)).toBeCloseTo(1 - DEFAULT_AUDIO_DECAY, 12);
        expect(SmoothAudioLevel(0, 1, 0.6, 0.18)).toBeCloseTo(0.6, 12);
    });

    it('stays within 0..1', () => {
        expect(SmoothAudioLevel(0.9, 5, 1, 1)).toBe(1);
        expect(SmoothAudioLevel(0.1, -5, 1, 1)).toBe(0);
    });
});

describe('SmoothAudioBars', () => {
    it('moves every bar toward its target', () => {
        expect(SmoothAudioBars([0, 1], [1, 0])).toEqual([SmoothAudioLevel(0, 1), SmoothAudioLevel(1, 0)]);
    });

    it('falls toward silence with no target, and treats a missing entry as 0', () => {
        expect(SmoothAudioBars([1, 1], null)).toEqual([1 - DEFAULT_AUDIO_DECAY, 1 - DEFAULT_AUDIO_DECAY]);
        expect(SmoothAudioBars([1, 1], [1])).toEqual([1, 1 - DEFAULT_AUDIO_DECAY]);
    });
});

describe('SynthesizeAudioBars', () => {
    it('makes the center bars taller than the edges', () => {
        const bars = SynthesizeAudioBars(1, 7);
        expect(bars).toHaveLength(7);
        expect(bars[3]).toBeGreaterThan(bars[0]);
        expect(bars[3]).toBeGreaterThan(bars[6]);
    });

    it('is silent at level 0 and handles a single bar', () => {
        expect(SynthesizeAudioBars(0, 9)).toEqual(new Array(9).fill(0));
        expect(SynthesizeAudioBars(1, 1)[0]).toBeGreaterThan(0);
    });
});

describe('AudioLevelSmoother', () => {
    it("reproduces LiveKit's meter exactly with LiveKit's settings", () => {
        const smoother = new AudioLevelSmoother({ BarCount: 7, Attack: 0.6, Decay: 0.18, SilenceFloor: 0.04 });
        for (const golden of LIVEKIT_METER_GOLDEN) {
            const frame = smoother.Next(golden.In);
            expect(frame.IsSilent).toBe(golden.IsSilent);
            expect(frame.Level).toBeCloseTo(golden.Level, 8);
            frame.Bars.forEach((bar, i) => expect(bar).toBeCloseTo(golden.Bins[i], 8));
        }
    });

    it('follows the spectrum when the source has one', () => {
        const smoother = new AudioLevelSmoother({ BarCount: 3 });
        const frame = smoother.Next(0.5, [1, 0.5, 0]);
        expect(frame.Bars).toEqual([SmoothAudioLevel(0, 1), SmoothAudioLevel(0, 0.5), 0]);
    });

    it('under the silence floor reports level 0 and lets the bars fall, even with a spectrum', () => {
        const smoother = new AudioLevelSmoother({ BarCount: 3, SilenceFloor: 0.2 });
        let previous = smoother.Next(1, [1, 1, 1]);
        let frame = smoother.Next(0, [1, 1, 1]);
        for (let i = 0; i < 50 && !frame.IsSilent; i++) {
            previous = frame;
            frame = smoother.Next(0, [1, 1, 1]);
        }
        expect(frame).toMatchObject({ IsSilent: true, Level: 0 });
        frame.Bars.forEach((bar, i) => expect(bar).toBeLessThan(previous.Bars[i]));
    });

    it('Reset returns to silence', () => {
        const smoother = new AudioLevelSmoother({ BarCount: 2 });
        smoother.Next(1);
        smoother.Reset();
        expect(smoother.Next(0)).toEqual({ Level: 0, Bars: [0, 0], IsSilent: false });
    });
});
