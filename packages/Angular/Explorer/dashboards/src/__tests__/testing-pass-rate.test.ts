import { describe, it, expect } from 'vitest';
import { TestingPassRate } from '../Testing/services/testing-pass-rate';

/** QF2-Y2: one definition of "pass rate of executed runs" — Skipped runs are neither passes nor failures. */
describe('TestingPassRate', () => {
  it('leaves skipped runs out of the denominator', () => {
    expect(TestingPassRate.OfExecuted(4531, 5463, 874)).toBeCloseTo((4531 / 4589) * 100, 6);
    expect(TestingPassRate.ShareOfExecuted(1, 4, 2)).toBe(50);
  });

  it('is 0 when nothing executed, and never divides by a negative', () => {
    expect(TestingPassRate.OfExecuted(0, 3, 3)).toBe(0);
    expect(TestingPassRate.Executed(2, 5)).toBe(0);
  });

  it('counts statuses', () => {
    expect(TestingPassRate.CountStatuses(['Passed', 'Skipped', 'Failed', 'Passed'])).toEqual({ Total: 4, Passed: 2, Skipped: 1 });
    expect(TestingPassRate.OfStatuses(['Passed', 'Skipped', 'Failed', 'Passed'])).toBeCloseTo((2 / 3) * 100, 6);
  });

  it('labels executed and skipped runs so they add up to the total', () => {
    expect(TestingPassRate.ExecutedLabel(5463, 874)).toBe('4,589 executed · 874 skipped');
    expect(TestingPassRate.ExecutedLabel(12, 0)).toBe('12 executed');
  });
});
