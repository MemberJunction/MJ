import { describe, it, expect } from 'vitest';
import type { TracedNumber } from '@memberjunction/predictive-studio-core';
import { SeededSample, TracedNumberChecks } from '../checks/ps-gates/ps-gate-traced-numbers';

const items = Array.from({ length: 30 }, (_, i) => i);

/** A traced number with this value and token. */
const traced = (value: number, text: string): TracedNumber => ({ Value: value, Text: text, Source: { EntityName: 'MJ: ML Training Runs', RecordID: 'R', Path: '$.v' } });

describe('SeededSample.Draw (mulberry32, G3.7)', () => {
  it('draws the same items in the same order for the same seed', () => {
    expect(SeededSample.Draw(items, 10, 42)).toEqual(SeededSample.Draw(items, 10, 42));
  });

  it('draws without replacement, only from the items', () => {
    const drawn = SeededSample.Draw(items, 10, 42);
    expect(drawn).toHaveLength(10);
    expect(new Set(drawn).size).toBe(10);
    for (const d of drawn) expect(items).toContain(d);
  });

  it('pins the seed-42 draw (a changed generator changes which numbers G3.7 samples)', () => {
    expect(SeededSample.Draw(items, 10, 42)).toEqual([15, 10, 2, 12, 27, 1, 17, 21, 11, 8]);
    expect(SeededSample.Draw(items, 10, 42)).not.toEqual(SeededSample.Draw(items, 10, 43));
  });

  it('returns every item when the count is not smaller than the list, and none for a count of 0', () => {
    expect([...SeededSample.Draw(items, 40, 42)].sort((a, b) => a - b)).toEqual(items);
    expect(SeededSample.Draw(items, 0, 42)).toEqual([]);
  });
});

describe('TracedNumberChecks.TokenAgrees', () => {
  it('accepts a token that prints the value at its precision, a percentage of it, or a thousands-separated count', () => {
    expect(TracedNumberChecks.TokenAgrees(traced(0.44149, '0.441'))).toBe(true);
    expect(TracedNumberChecks.TokenAgrees(traced(0.0566, '0.0566'))).toBe(true);
    expect(TracedNumberChecks.TokenAgrees(traced(0.95, '95%'))).toBe(true);
    expect(TracedNumberChecks.TokenAgrees(traced(0.45, '45.0%'))).toBe(true);
    expect(TracedNumberChecks.TokenAgrees(traced(3392, '3,392'))).toBe(true);
  });

  it('refuses a token that prints a different figure (the score × 0.98 mutation)', () => {
    expect(TracedNumberChecks.TokenAgrees(traced(0.441, (0.441 * 0.98).toFixed(3)))).toBe(false);
    expect(TracedNumberChecks.TokenAgrees(traced(0.45, '44.0%'))).toBe(false);
    expect(TracedNumberChecks.TokenAgrees(traced(0.5, 'n/a'))).toBe(false);
  });
});

describe('TracedNumberChecks.NumericTokens', () => {
  it('skips Rank cells and the names given (a name may hold digits)', () => {
    const md = '# Model Development Results: PSTruth: G3.8 W1 s42 r-7\n| 1 | xgb_v2 | 0.441 [0.435, 0.447] | Evaluated |\n- **Tenure12**: 45.0% of the model\'s weight';
    expect(TracedNumberChecks.NumericTokens(md, ['PSTruth: G3.8 W1 s42 r-7', 'xgb_v2', 'Tenure12'])).toEqual(['0.441', '0.435', '0.447', '45.0%']);
  });
});
