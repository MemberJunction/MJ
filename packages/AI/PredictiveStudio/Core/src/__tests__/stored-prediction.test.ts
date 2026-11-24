/**
 * The one reader of a `Model` Feature Value's `ValueJSON` (§5.8.1), shared by the record panel and the predictions grid
 * (audit M5b-10).
 */
import { describe, it, expect } from 'vitest';
import { StoredPrediction } from '../stored-prediction';

describe('StoredPrediction.Parse', () => {
  it('reads the class probabilities in their stored (class) order and the drivers with their effect', () => {
    const parsed = StoredPrediction.Parse(JSON.stringify({
      Probabilities: { Renewed: 0.3, Lapsed: 0.7 },
      Drivers: [
        { sourceColumn: 'Tenure', contribution: -0.4, effect: 'lowers-adverse' },
        { sourceColumn: 'Events', contribution: 0.2, effect: 'raises-adverse' },
      ],
    }));
    expect(parsed.Probabilities).toEqual([{ Class: 'Renewed', Probability: 0.3 }, { Class: 'Lapsed', Probability: 0.7 }]);
    expect(parsed.Drivers).toEqual([
      { SourceColumn: 'Tenure', Contribution: -0.4, RaisesAdverse: false },
      { SourceColumn: 'Events', Contribution: 0.2, RaisesAdverse: true },
    ]);
  });

  it('skips a probability that is not a number and a driver without a column or a numeric contribution', () => {
    const parsed = StoredPrediction.Parse(JSON.stringify({
      Probabilities: { A: 0.5, B: 'x' },
      Drivers: [{ sourceColumn: 'X' }, { contribution: 1 }, 'not an object', { sourceColumn: 'Y', contribution: 1 }],
    }));
    expect(parsed.Probabilities.map((p) => p.Class)).toEqual(['A']);
    expect(parsed.Drivers.map((d) => d.SourceColumn)).toEqual(['Y']);
  });

  it('is empty for a null, unparseable or non-object value', () => {
    for (const v of [null, '', 'not json', '[1,2]', '42']) {
      expect(StoredPrediction.Parse(v)).toEqual({ Probabilities: [], Drivers: [] });
    }
  });
});
