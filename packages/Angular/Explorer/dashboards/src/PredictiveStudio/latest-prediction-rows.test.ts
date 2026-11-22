/**
 * The adapter from a binding's latest stored values to the grid's row model (§5.8.4): the model's own score read back
 * from the stored value, and the drivers in the payload form the surfaces parse. `ValueJSON` is read by PS Core's
 * `StoredPrediction` (audit M5b-10).
 */
import { describe, it, expect } from 'vitest';
import { LatestPredictionRows, type LatestPredictionRow } from './latest-prediction-rows';

const AS_OF = new Date('2026-11-01T00:00:00Z');
/** When the value was computed: the scoring run's time, later than the as-of calendar date it applies to. */
const COMPUTED = new Date('2026-11-01T16:04:21Z');

function row(over: Partial<LatestPredictionRow>): LatestPredictionRow {
  return { ID: 'V1', RecordID: 'R1', ValueText: null, ValueNumeric: null, ValueJSON: null, Confidence: null, EffectiveAsOf: AS_OF, ComputedAt: COMPUTED, ...over };
}

describe('LatestPredictionRows', () => {
  it('a binary model scores P(class 1) from the stored probabilities', () => {
    const r = row({ ValueText: 'Lapsed', ValueNumeric: 0.7, Confidence: 0.7, ValueJSON: JSON.stringify({ Probabilities: { Renewed: 0.3, Lapsed: 0.7 } }) });
    expect(LatestPredictionRows.Score(r)).toBe(0.7);
  });

  it('a multiclass model scores its predicted class probability; a regression its point', () => {
    const multi = row({ ValueText: 'B', Confidence: 0.5, ValueJSON: JSON.stringify({ Probabilities: { A: 0.2, B: 0.5, C: 0.3 } }) });
    expect(LatestPredictionRows.Score(multi)).toBe(0.5);
    expect(LatestPredictionRows.Score(row({ ValueNumeric: 1240.5 }))).toBe(1240.5);
    expect(LatestPredictionRows.Score(row({}))).toBeNull();
  });

  it('ToRunDetail carries the score, the class and the drivers, dated when the value was computed (the grid\'s Scored At)', () => {
    const r = row({
      ValueText: 'Lapsed', ValueNumeric: 0.7, Confidence: 0.7,
      ValueJSON: JSON.stringify({ Probabilities: { Renewed: 0.3, Lapsed: 0.7 }, Drivers: [{ sourceColumn: 'Tenure', contribution: -0.4, effect: 'lowers-adverse' }, { sourceColumn: 'Bad' }] }),
    });
    const detail = LatestPredictionRows.ToRunDetail(r);
    expect(detail?.ResultPayload).toBe(JSON.stringify({ score: 0.7, class: 'Lapsed', drivers: [{ feature: 'Tenure', value: -0.4 }] }));
    expect([detail?.RecordID, detail?.CompletedAt]).toEqual(['R1', COMPUTED]);
    expect(LatestPredictionRows.ToRunDetail(row({}))).toBeNull();
  });

  it('ToRunDetail falls back to the as-of date when a value has no compute time', () => {
    const detail = LatestPredictionRows.ToRunDetail(row({ ValueNumeric: 12, ComputedAt: null }));
    expect(detail?.CompletedAt).toEqual(AS_OF);
  });
});
