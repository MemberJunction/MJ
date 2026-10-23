import { describe, it, expect } from 'vitest';
import { ConfidenceInterval } from '../confidence-interval';
import { SeedRule } from '../seed-rules';

describe('Wilson interval (z = 1.959963984540054)', () => {
  it('matches the P11 boundary values at n = 400', () => {
    const at28 = ConfidenceInterval.Wilson(28, 400);
    expect(at28.Lower).toBeCloseTo(0.04887, 5);
    expect(at28.Upper).toBeCloseTo(0.09931, 5);
    expect(ConfidenceInterval.Wilson(29, 400).Lower).toBeCloseTo(0.05095, 5);
  });
  it('rejects impossible counts', () => {
    expect(() => ConfidenceInterval.Wilson(5, 4)).toThrow(RangeError);
    expect(() => ConfidenceInterval.Wilson(-1, 4)).toThrow(RangeError);
    expect(() => ConfidenceInterval.Wilson(1, 0)).toThrow(RangeError);
    expect(() => ConfidenceInterval.Wilson(1.5, 4)).toThrow(RangeError);
  });
});

describe('the four 400-seed rules', () => {
  it('noise-publish and false-alarm accept 0–28 of 400', () => {
    expect(SeedRule.AcceptanceRange('noise-publish-400', 400)).toEqual({ Min: 0, Max: 28 });
    expect(SeedRule.AcceptanceRange('false-alarm-400', 400)).toEqual({ Min: 0, Max: 28 });
    expect(SeedRule.NoisePublishPasses(28, 400)).toBe(true);
    expect(SeedRule.NoisePublishPasses(29, 400)).toBe(false);
  });
  it('coverage accepts 372–388 of 400', () => {
    expect(SeedRule.AcceptanceRange('coverage-400', 400)).toEqual({ Min: 372, Max: 388 });
    expect(SeedRule.CoveragePasses(371, 400)).toBe(false);
    expect(SeedRule.CoveragePasses(389, 400)).toBe(false);
  });
  it('detection accepts 372–400 of 400', () => {
    expect(SeedRule.AcceptanceRange('detection-400', 400)).toEqual({ Min: 372, Max: 400 });
    expect(SeedRule.DetectionPasses(371, 400)).toBe(false);
  });
  it('noise-publish-60 (G0.2) accepts 0–6 of 60', () => {
    expect(SeedRule.AcceptanceRange('noise-publish-60', 60)).toEqual({ Min: 0, Max: 6 });
  });
});

describe('Hanley–McNeil interval', () => {
  it('collapses to the point for a perfect in-sample AUC', () => {
    const ci = ConfidenceInterval.HanleyMcNeil(1, 2900, 2874);
    expect(ci.Lower).toBeCloseTo(1, 9);
  });
  it('contains 0.5 for a null AUC on W2-sized data', () => {
    const ci = ConfidenceInterval.HanleyMcNeil(0.5, 2900, 2874);
    expect(ci.Lower).toBeLessThan(0.5);
    expect(ci.Upper).toBeGreaterThan(0.5);
  });
});
