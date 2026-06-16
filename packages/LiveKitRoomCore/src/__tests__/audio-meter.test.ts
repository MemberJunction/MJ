import { describe, it, expect } from 'vitest';
import { LiveKitAudioMeter, AUDIO_METER_BIN_COUNT, AUDIO_METER_SILENCE_FLOOR } from '../audio-meter';

describe('LiveKitAudioMeter', () => {
    it('produces the configured number of bins', () => {
        const meter = new LiveKitAudioMeter();
        const frame = meter.Next(0.8);
        expect(frame.Bins).toHaveLength(AUDIO_METER_BIN_COUNT);
    });

    it('clamps sub-floor levels to silence', () => {
        const meter = new LiveKitAudioMeter();
        const frame = meter.Next(AUDIO_METER_SILENCE_FLOOR / 2);
        expect(frame.IsSilent).toBe(true);
        expect(frame.Level).toBe(0);
    });

    it('rises toward a sustained loud signal and reports not-silent', () => {
        const meter = new LiveKitAudioMeter();
        let frame = meter.Next(1);
        for (let i = 0; i < 10; i++) {
            frame = meter.Next(1);
        }
        expect(frame.IsSilent).toBe(false);
        expect(frame.Level).toBeGreaterThan(0.5);
    });

    it('decays toward silence after the signal stops', () => {
        const meter = new LiveKitAudioMeter();
        for (let i = 0; i < 10; i++) {
            meter.Next(1);
        }
        let frame = meter.Next(0);
        for (let i = 0; i < 30; i++) {
            frame = meter.Next(0);
        }
        expect(frame.Level).toBeLessThan(0.1);
    });

    it('resets to silence', () => {
        const meter = new LiveKitAudioMeter();
        meter.Next(1);
        meter.Reset();
        const frame = meter.Next(0);
        expect(frame.Level).toBe(0);
        expect(frame.Bins.every((b) => b === 0)).toBe(true);
    });
});
