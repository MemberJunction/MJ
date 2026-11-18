/**
 * `HarnessScoring.AttemptOf`: a Score Record Set result read into the harness's `ScoreAttempt` (Task M5.6). A completed
 * run is the output (its scoring run, total, written and bare-id predictions); a refused or failed run is read from its
 * code and message: the scoring run the message names and a failed run's counts.
 */
import { describe, it, expect } from 'vitest';
import { HarnessScoring } from '../score';

const RUN = 'A0000000-0000-4000-8000-0000000001A1';

describe('HarnessScoring.AttemptOf', () => {
  it('a completed run carries its scoring run, counts and predictions by bare record id', () => {
    const attempt = HarnessScoring.AttemptOf({
      Success: true, ResultCode: 'SUCCESS',
      Output: { status: 'completed', scoringRunId: RUN, modelId: 'm1', modelVersion: 2, artifactSha256: 'a'.repeat(64), total: 2, written: 0, dryRun: false,
        predictions: [{ recordId: 'r1', score: 0.7, class: 'renewed', inTraining: false }, { recordId: 'ID=r2', score: 0.2, inTraining: true }] },
    }, 5);
    expect(attempt).toEqual({
      Ok: true, ErrorMessage: null, RefusalCode: null, ScoringRunID: RUN, Status: 'completed', Total: 2, Written: 0, Failed: 0,
      Predictions: [{ RecordID: 'r1', Score: 0.7, Class: 'renewed' }, { RecordID: 'r2', Score: 0.2, Class: null }], DurationMs: 5,
    });
  });

  it('a refused run keeps its code and the scoring run its message names', () => {
    const attempt = HarnessScoring.AttemptOf({
      Success: false, ResultCode: 'FEATURE_SCHEMA_MISMATCH',
      ErrorMessage: `Scoring refused: the assembled feature columns do not match the model's schema (missing: DistanceZ; extra: none; retyped: none) (scoring run ${RUN}; refusal {}).`,
    }, 3);
    expect([attempt.Ok, attempt.RefusalCode, attempt.ScoringRunID, attempt.Status, attempt.Written]).toEqual([false, 'FEATURE_SCHEMA_MISMATCH', RUN, 'refused', 0]);
    expect(attempt.ErrorMessage).toContain('DistanceZ');
  });

  it('a failed run is read with its counts', () => {
    const attempt = HarnessScoring.AttemptOf({
      Success: false, ResultCode: 'SCORING_RUN_FAILED',
      ErrorMessage: `Scoring failed: 100 of 16776 records failed and the run stopped at that batch (scoring run ${RUN}). First error: boom`,
    }, 3);
    expect([attempt.Status, attempt.Failed, attempt.Total, attempt.ScoringRunID]).toEqual(['failed', 100, 16776, RUN]);
  });

  it('an input error or a transport failure names no scoring run', () => {
    const attempt = HarnessScoring.AttemptOf({ Success: false, ResultCode: 'TRANSPORT_ERROR', ErrorMessage: 'socket hang up' }, 1);
    expect([attempt.RefusalCode, attempt.ScoringRunID, attempt.Status]).toEqual([null, null, null]);
  });
});
