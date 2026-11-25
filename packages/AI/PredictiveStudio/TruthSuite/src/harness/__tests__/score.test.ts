/**
 * `HarnessScoring.AttemptOf`: a Score Record Set result read into the harness's `ScoreAttempt` (Task M5.6). A completed
 * run is the output (its scoring run, total, written and bare-id predictions); a refused or failed run is read from its
 * code and message: the scoring run the message names and a failed run's counts. `HarnessScoring.BindingEntityName` and
 * `BindingInput` (Task M5.10): the entity and create input of a test scoring binding.
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

/** A stored unit lineage naming `rowEntity` (every member the unit-lineage reader requires). */
function unitLineage(rowEntity: string): string {
  return JSON.stringify({
    predictionUnitId: 'U1', predictionUnitVersion: 1, labelVersion: 1, featureSpecVersion: 1, unitRowEntity: rowEntity,
    featureSpec: [], categoryLevels: {}, trainingSnapshotId: 'S1', snapshotContentHash: 'h'.repeat(64),
  });
}

describe('HarnessScoring.BindingEntityName', () => {
  it('a unit model binds its unit\'s row entity, not its pipeline\'s target entity', () => {
    expect(HarnessScoring.BindingEntityName({ ID: 'M1', PipelineID: 'P1', Lineage: unitLineage('PS Truth: Scn_R1') }, 'PS Truth: Other')).toBe('PS Truth: Scn_R1');
  });

  it('a model whose lineage names no unit binds its pipeline\'s target entity', () => {
    expect(HarnessScoring.BindingEntityName({ ID: 'M1', PipelineID: 'P1', Lineage: JSON.stringify({ targetEntityName: 'x' }) }, 'PS Truth: W1_MembershipYear')).toBe('PS Truth: W1_MembershipYear');
  });

  it('refuses a unit lineage that cannot be read, and a model with neither entity', () => {
    expect(() => HarnessScoring.BindingEntityName({ ID: 'M1', PipelineID: 'P1', Lineage: JSON.stringify({ predictionUnitId: 'U1' }) }, 'E')).toThrow(/names a Prediction Unit but its lineage cannot be read/);
    expect(() => HarnessScoring.BindingEntityName({ ID: 'M1', PipelineID: 'P1', Lineage: null }, null)).toThrow(/names no unit and its pipeline P1 no target entity/);
  });
});

describe('HarnessScoring.BindingInput', () => {
  it('binds the model\'s pipeline on the entity with the feature name and authorization, OnDemand, no Record Process and no column', () => {
    expect(HarnessScoring.BindingInput({ ID: 'M1', PipelineID: 'P1', Lineage: null }, { ID: 'E1' }, 'PSTruth G5.3 run-1', 'A1')).toEqual({
      mlTrainingPipelineId: 'P1', featureName: 'PSTruth G5.3 run-1', viewAuthorizationId: 'A1', targetEntityId: 'E1',
      recordProcessId: null, targetColumn: null, targetColumnSource: null, mode: 'OnDemand',
    });
  });
});
