/**
 * Unit tests for the audio-reactive visual smoothing — the framework-free envelope +
 * direction-hysteresis math between raw RealtimeAudioActivity samples and the CSS
 * variables that drive the hero orb / EQ.
 */
import { describe, it, expect } from 'vitest';
import { RealtimeAudioActivity } from '@memberjunction/ai-realtime-client';
import {
  GateLevel,
  RealtimeAudioVisualSmoother,
  SmoothLevel,
  AUDIO_INPUT_NOISE_GATE,
  AUDIO_OUTPUT_NOISE_GATE,
  AUDIO_DIRECTION_HOLD_MS,
  AUDIO_PRESENCE_FLOOR,
  AUDIO_VISUAL_BIN_COUNT
} from '../lib/components/realtime/realtime-audio-visuals';

function activity(partial: Partial<RealtimeAudioActivity>): RealtimeAudioActivity {
  return { InputLevel: null, OutputLevel: null, InputBins: null, OutputBins: null, ...partial };
}

describe('SmoothLevel (attack/decay envelope)', () => {
  it('attacks fast and decays slow (speaker-cone feel, never a strobe)', () => {
    const up = SmoothLevel(0, 1);
    const down = SmoothLevel(1, 0);
    expect(up).toBeGreaterThan(0.4); // fast attack
    expect(down).toBeGreaterThan(0.8); // slow decay — still ringing down
  });

  it('clamps into 0..1 and converges to the target', () => {
    let v = 0;
    for (let i = 0; i < 60; i++) {
      v = SmoothLevel(v, 0.7);
    }
    expect(v).toBeCloseTo(0.7, 1);
    expect(SmoothLevel(0.5, 5)).toBeLessThanOrEqual(1);
  });
});

describe('RealtimeAudioVisualSmoother', () => {
  it('null in → null out (un-metered drivers keep turn-state visuals)', () => {
    expect(new RealtimeAudioVisualSmoother().Next(null, 0)).toBeNull();
  });

  it('produces smoothed levels and a fixed-length bin array', () => {
    const s = new RealtimeAudioVisualSmoother();
    const frame = s.Next(activity({ OutputLevel: 0.8, OutputBins: new Array(9).fill(0.6) }), 0);
    expect(frame).not.toBeNull();
    expect(frame!.OutputLevel).toBeGreaterThan(0);
    expect(frame!.OutputLevel).toBeLessThan(0.8); // smoothed, not raw
    expect(frame!.Bins).toHaveLength(AUDIO_VISUAL_BIN_COUNT);
  });

  it('adopts the louder direction from silence immediately', () => {
    const s = new RealtimeAudioVisualSmoother();
    const frame = s.Next(activity({ OutputLevel: 0.7, InputLevel: 0.1 }), 0);
    expect(frame!.Direction).toBe('agent');
  });

  it('holds the direction across syllable gaps (no flicker)', () => {
    const s = new RealtimeAudioVisualSmoother();
    s.Next(activity({ OutputLevel: 0.7 }), 0);
    // Silence shorter than the hold window — direction must persist.
    let frame = s.Next(activity({ OutputLevel: 0 }), AUDIO_DIRECTION_HOLD_MS / 2);
    expect(frame!.Direction).toBe('agent');
    // Keep feeding silence until the smoothed level decays under the floor AND the hold expires.
    for (let t = 1; t <= 40; t++) {
      frame = s.Next(activity({ OutputLevel: 0 }), AUDIO_DIRECTION_HOLD_MS / 2 + t * 100);
    }
    expect(frame!.Direction).toBe('none');
  });

  it('the other side steals the direction only by clearly dominating', () => {
    const s = new RealtimeAudioVisualSmoother();
    for (let i = 0; i < 10; i++) {
      s.Next(activity({ OutputLevel: 0.6, InputLevel: 0 }), i);
    }
    // Slightly-louder mic does NOT steal…
    let frame = s.Next(activity({ OutputLevel: 0.5, InputLevel: 0.5 }), 100);
    expect(frame!.Direction).toBe('agent');
    // …a clearly dominant mic does.
    for (let i = 0; i < 10; i++) {
      frame = s.Next(activity({ OutputLevel: 0.05, InputLevel: 0.9 }), 200 + i);
    }
    expect(frame!.Direction).toBe('user');
  });

  it('bins follow the louder direction and decay when no spectrum is available', () => {
    const s = new RealtimeAudioVisualSmoother();
    let frame = s.Next(activity({
      OutputLevel: 0.8, InputLevel: 0.1,
      OutputBins: new Array(9).fill(1), InputBins: new Array(9).fill(0.1)
    }), 0);
    expect(frame!.Bins[0]).toBeGreaterThan(0.3); // tracking output's loud spectrum
    const peak = frame!.Bins[0];
    frame = s.Next(activity({ OutputLevel: 0.8 }), 16); // bins gone → decay
    expect(frame!.Bins[0]).toBeLessThan(peak);
  });

  it('Reset returns to silence + no direction', () => {
    const s = new RealtimeAudioVisualSmoother();
    s.Next(activity({ OutputLevel: 0.9 }), 0);
    s.Reset();
    const frame = s.Next(activity({ OutputLevel: AUDIO_PRESENCE_FLOOR / 10 }), 1);
    expect(frame!.Direction).toBe('none');
    expect(frame!.OutputLevel).toBeLessThan(0.1);
  });
});

describe('noise gating (idle mic must not animate the visuals)', () => {
  it('GateLevel: at/below the gate is TRUE silence; above it rescales soft-knee to 0..1', () => {
    expect(GateLevel(0, AUDIO_INPUT_NOISE_GATE)).toBe(0);
    expect(GateLevel(AUDIO_INPUT_NOISE_GATE, AUDIO_INPUT_NOISE_GATE)).toBe(0);
    expect(GateLevel(NaN, AUDIO_INPUT_NOISE_GATE)).toBe(0);
    expect(GateLevel(1, AUDIO_INPUT_NOISE_GATE)).toBe(1);
    const mid = GateLevel(0.5, AUDIO_INPUT_NOISE_GATE);
    expect(mid).toBeGreaterThan(0.4);
    expect(mid).toBeLessThan(0.5);
  });

  it('idle mic noise (below the input gate) renders as silence: levels decay, bins decay, direction releases', () => {
    const s = new RealtimeAudioVisualSmoother();
    let frame = s.Next(activity({ InputLevel: 0.6, InputBins: new Array(9).fill(0.8) }), 0)!;
    expect(frame.Direction).toBe('user');

    // Mic falls back to its idle room-noise floor (non-zero, but under the gate) —
    // the analyser keeps reporting it forever; the visuals must come to rest anyway.
    for (let t = 1; t <= 60; t++) {
      frame = s.Next(activity({ InputLevel: 0.05, InputBins: new Array(9).fill(0.3) }), t * 100)!;
    }
    expect(frame.InputLevel).toBeLessThan(0.01);
    expect(Math.max(...frame.Bins)).toBeLessThan(0.01);
    expect(frame.Direction).toBe('none');
  });

  it('the mic gate sits ABOVE the output gate (playback silence is true zero; mic silence is not)', () => {
    expect(AUDIO_INPUT_NOISE_GATE).toBeGreaterThan(AUDIO_OUTPUT_NOISE_GATE);
  });

  it('real speech still passes the gate untouched in feel (fast attack from rest)', () => {
    const s = new RealtimeAudioVisualSmoother();
    const frame = s.Next(activity({ InputLevel: 0.5, InputBins: new Array(9).fill(0.6) }), 0)!;
    expect(frame.InputLevel).toBeGreaterThan(0.15);
    expect(frame.Direction).toBe('user');
  });
});
