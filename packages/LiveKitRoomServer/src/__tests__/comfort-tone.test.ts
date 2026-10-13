import { describe, it, expect } from 'vitest';
import { COMFORT_TONE_LOOP_SECONDS, COMFORT_TONE_PEAK, GenerateComfortTone } from '../room-audio/comfort-tone';

describe('GenerateComfortTone', () => {
  const rate = 16000;
  const tone = GenerateComfortTone(rate);
  const peak = tone.reduce((max, s) => Math.max(max, Math.abs(s)), 0);

  it('is one loop long at the requested rate', () => {
    expect(tone.length).toBe(COMFORT_TONE_LOOP_SECONDS * rate);
  });

  it('stays at or below its peak level and is clearly audible', () => {
    expect(peak).toBeLessThanOrEqual(Math.ceil(COMFORT_TONE_PEAK * 32767));
    expect(peak).toBeGreaterThan(0.08 * 32767);
  });

  it('starts and ends silent, so looping it never clicks', () => {
    const edge = Math.round(rate * 0.005);
    const near = (slice: Int16Array) => slice.reduce((max, s) => Math.max(max, Math.abs(s)), 0);
    expect(near(tone.subarray(0, edge))).toBeLessThan(0.01 * 32767);
    expect(near(tone.subarray(tone.length - edge))).toBeLessThan(0.01 * 32767);
  });

  it('is deterministic', () => {
    expect(Buffer.from(GenerateComfortTone(rate).buffer).equals(Buffer.from(tone.buffer))).toBe(true);
  });

  it('refuses a rate that is not a positive integer', () => {
    expect(() => GenerateComfortTone(0)).toThrow(/positive integer/);
    expect(() => GenerateComfortTone(44100.5)).toThrow(/positive integer/);
  });
});
