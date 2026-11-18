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

describe('the seed rules', () => {
  it('noise-publish-60 (G0.2) accepts 0–6 of 60', () => {
    expect(SeedRule.AcceptanceRange('noise-publish-60', 60)).toEqual({ Min: 0, Max: 6 });
    expect(SeedRule.Passes('noise-publish-60', 6, 60)).toBe(true);
    expect(SeedRule.Passes('noise-publish-60', 7, 60)).toBe(false);
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
  it('rejects an empty class and an AUC outside [0, 1]', () => {
    expect(() => ConfidenceInterval.HanleyMcNeil(0.7, 0, 10)).toThrow(RangeError);
    expect(() => ConfidenceInterval.HanleyMcNeil(0.7, 10, 0)).toThrow(RangeError);
    expect(() => ConfidenceInterval.HanleyMcNeil(1.2, 10, 10)).toThrow(RangeError);
    expect(() => ConfidenceInterval.HanleyMcNeil(Number.NaN, 10, 10)).toThrow(RangeError);
  });
});
