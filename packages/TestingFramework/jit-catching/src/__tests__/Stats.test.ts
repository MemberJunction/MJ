import { describe, it, expect } from 'vitest';
import { RateOf, WilsonInterval } from '../report/Stats';

describe('WilsonInterval', () => {
  it('gives the spec figures for 4 of 15 and 1 of 15', () => {
    const a = WilsonInterval(4, 15); const b = WilsonInterval(1, 15);
    expect(a.Low).toBeCloseTo(0.109, 2); expect(a.High).toBeCloseTo(0.520, 2);
    expect(b.Low).toBeCloseTo(0.012, 2); expect(b.High).toBeCloseTo(0.298, 2);
  });

  it('is { Low: 0, High: 0 } when there are no trials', () => {
    expect(WilsonInterval(0, 0)).toEqual({ Low: 0, High: 0 });
  });
});

describe('RateOf', () => {
  it('holds the counts, the rate and the interval, and a null rate for no trials', () => {
    expect(RateOf(1, 2)).toEqual({ K: 1, N: 2, Rate: 0.5, ...WilsonInterval(1, 2) });
    expect(RateOf(0, 0)).toEqual({ K: 0, N: 0, Rate: null, Low: 0, High: 0 });
  });
});
