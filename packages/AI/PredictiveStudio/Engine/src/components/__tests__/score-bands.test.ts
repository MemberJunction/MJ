import { describe, expect, it } from 'vitest';
import { assignBand, detectBandTransition, trendDirection, ScoreBandDef } from '../score-bands';

const BANDS: ScoreBandDef[] = [
  { Label: 'At Risk', MinScore: 0, MaxScore: 40 },
  { Label: 'Neutral', MinScore: 40, MaxScore: 70 },
  { Label: 'Healthy', MinScore: 70, MaxScore: 100 },
];

describe('assignBand — half-open [Min, Max), top band inclusive', () => {
  it('assigns interior scores and boundary scores to the upper band', () => {
    expect(assignBand(BANDS, 20)?.Label).toBe('At Risk');
    expect(assignBand(BANDS, 40)?.Label).toBe('Neutral');
    expect(assignBand(BANDS, 69.999)?.Label).toBe('Neutral');
  });
  it('the maximum possible score still bands (top MaxScore inclusive)', () => {
    expect(assignBand(BANDS, 100)?.Label).toBe('Healthy');
  });
  it('is order-independent on a tiled set', () => {
    const shuffled = [BANDS[2], BANDS[0], BANDS[1]];
    expect(assignBand(shuffled, 40)?.Label).toBe('Neutral');
  });
  it('returns undefined for empty sets and off-scale scores', () => {
    expect(assignBand([], 50)).toBeUndefined();
    expect(assignBand(BANDS, 101)).toBeUndefined();
  });
});

describe('trendDirection — deadband keeps float noise from reading as movement', () => {
  it('classifies with the default deadband', () => {
    expect(trendDirection(0.4)).toBe('Flat');
    expect(trendDirection(0.6)).toBe('Up');
    expect(trendDirection(-0.6)).toBe('Down');
    expect(trendDirection(null)).toBe('Flat');
  });
});

describe('detectBandTransition', () => {
  it('records nothing for a brand-new record or a same-band rescore', () => {
    expect(detectBandTransition(null, 'healthy', false, 5)).toBeNull();
    expect(detectBandTransition('healthy', 'healthy', true, 5)).toBeNull();
  });
  it('records the crossing with the direction of the score move', () => {
    expect(detectBandTransition('neutral', 'healthy', true, 12)).toEqual({
      FromBand: 'neutral',
      ToBand: 'healthy',
      Direction: 'Improving',
    });
    expect(detectBandTransition('healthy', 'atrisk', true, -30)?.Direction).toBe('Worsening');
  });
  it('defaults a null delta to Improving rather than throwing', () => {
    expect(detectBandTransition('a', 'b', true, null)?.Direction).toBe('Improving');
  });
});
