import { describe, it, expect } from 'vitest';
import type { ScoreAttempt } from '@memberjunction/predictive-studio-truth-suite';
import { PredictionDigest } from '../checks/ps-gates/ps-gate-registry';

/** A successful attempt with the given predictions. */
function attempt(predictions: ScoreAttempt['Predictions']): ScoreAttempt {
  return { Ok: true, ErrorMessage: null, RefusalCode: null, Scored: predictions.length, Failed: 0, Skipped: 0, WroteBack: false, Predictions: predictions, DurationMs: 1 };
}

const A = 'aaaaaaaa-0000-0000-0000-000000000001';
const B = 'bbbbbbbb-0000-0000-0000-000000000002';

describe('PredictionDigest.Of', () => {
  it('ignores prediction order and record-ID casing', () => {
    const one = attempt([{ RecordID: A, Score: 0.25, Class: '1' }, { RecordID: B, Score: 0.75, Class: '0' }]);
    const two = attempt([{ RecordID: B.toUpperCase(), Score: 0.75, Class: '0' }, { RecordID: A.toUpperCase(), Score: 0.25, Class: '1' }]);
    expect(PredictionDigest.Of(one)).toBe(PredictionDigest.Of(two));
  });

  it('changes when one score changes in its last bit', () => {
    const base = attempt([{ RecordID: A, Score: 0.25, Class: '1' }]);
    const nudged = attempt([{ RecordID: A, Score: 0.25 + Number.EPSILON / 4, Class: '1' }]);
    expect(nudged.Predictions[0].Score).not.toBe(0.25);
    expect(PredictionDigest.Of(nudged)).not.toBe(PredictionDigest.Of(base));
  });

  it('changes when a class flips at the same score, and tells a null class from the text "null"', () => {
    const base = attempt([{ RecordID: A, Score: 0.5, Class: '1' }]);
    expect(PredictionDigest.Of(attempt([{ RecordID: A, Score: 0.5, Class: '0' }]))).not.toBe(PredictionDigest.Of(base));
    expect(PredictionDigest.Of(attempt([{ RecordID: A, Score: 0.5, Class: null }]))).not.toBe(PredictionDigest.Of(attempt([{ RecordID: A, Score: 0.5, Class: 'null' }])));
  });
});
