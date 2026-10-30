import { describe, it, expect } from 'vitest';
import { TRAINING_RUN_RESULTS_SCHEMA, TrainingRunResultsParser } from '../training-run-results';

const counts = { rowsRead: 10, censoredRowsExcluded: 1, labelKnownRowsExcluded: 0, emptyLabelRowsExcluded: 0, duplicateRowsRemoved: 0, resolvedRows: 9, dataCutoff: '2026-01-01' };

describe('TrainingRunResultsParser', () => {
  it('reads a completed and a refused envelope', () => {
    expect(TrainingRunResultsParser.ParseTrainingRunResults(JSON.stringify({ schema: TRAINING_RUN_RESULTS_SCHEMA, status: 'completed', unitResolution: counts, legacy: null, legacyRequest: null })).Ok).toBe(true);
    const refused = TrainingRunResultsParser.ParseTrainingRunResults(JSON.stringify({ schema: TRAINING_RUN_RESULTS_SCHEMA, status: 'refused', refusal: { stage: 'pipeline', reason: { kind: 'protocol-required', pipelineId: 'p1' } } }));
    expect(refused.Ok && refused.Value.status === 'refused' ? refused.Value.refusal.reason.kind : null).toBe('protocol-required');
  });
  it('reads every protocol refusal of a pipeline and refuses a candidate count that is not an integer', () => {
    const envelope = (reason: object) => JSON.stringify({ schema: TRAINING_RUN_RESULTS_SCHEMA, status: 'refused', refusal: { stage: 'pipeline', reason } });
    const reasons = [
      { kind: 'too-many-candidates', pipelineId: 'p1', candidates: 3, maxCandidates: 2 },
      { kind: 'protocol-created-after-run', protocolId: 'P1', protocolCreatedAt: '2026-05-01T10:00:00.001Z', runCreatedAt: '2026-05-01T10:00:00.000Z' },
      { kind: 'protocol-unit-mismatch', protocolId: 'P1', problems: ['one', 'two'] },
      { kind: 'protocol-invalid', protocolId: 'P1', errors: ['Holdout must be an object'] },
    ];
    for (const reason of reasons) {
      const r = TrainingRunResultsParser.ParseTrainingRunResults(envelope(reason));
      expect(r.Ok && r.Value.status === 'refused' ? r.Value.refusal.reason : null).toEqual(reason);
    }
    const bad = TrainingRunResultsParser.ParseTrainingRunResults(envelope({ kind: 'too-many-candidates', pipelineId: 'p1', candidates: 2.5, maxCandidates: 2 }));
    expect(bad.Ok ? null : bad.Errors.join('\n')).toMatch(/refusal\.reason\.candidates/);
  });
  it('refuses an envelope whose members have the wrong shape, naming the path', () => {
    const r = TrainingRunResultsParser.ParseTrainingRunResults(JSON.stringify({ schema: TRAINING_RUN_RESULTS_SCHEMA, status: 'completed', unitResolution: { ...counts, resolvedRows: 'nine' }, legacy: null, legacyRequest: null }));
    expect(r.Ok ? null : r.Errors.join('\n')).toMatch(/unitResolution\.resolvedRows/);
    expect(TrainingRunResultsParser.ParseTrainingRunResults(JSON.stringify({ schema: TRAINING_RUN_RESULTS_SCHEMA, status: 'refused', refusal: { stage: 'pipeline', reason: { kind: 'made-up' } } })).Ok).toBe(false);
  });
  it('reads back a stored legacy request and refuses one with a wrong-typed member', () => {
    const legacyRequest = { algorithm: 'xgboost', problemType: 'classification', hyperparameters: { max_depth: 3 }, validation: { strategy: 'train_test_split', test_size: 0.2 } };
    const envelope = (lr: object) => JSON.stringify({ schema: TRAINING_RUN_RESULTS_SCHEMA, status: 'completed', unitResolution: counts, legacy: null, legacyRequest: lr });
    const ok = TrainingRunResultsParser.ParseTrainingRunResults(envelope(legacyRequest));
    expect(ok.Ok && ok.Value.status === 'completed' ? ok.Value.legacyRequest?.algorithm : null).toBe('xgboost');
    const bad = TrainingRunResultsParser.ParseTrainingRunResults(envelope({ ...legacyRequest, problemType: 'sequence' }));
    expect(bad.Ok ? null : bad.Errors.join('\n')).toMatch(/legacyRequest\.problemType/);
  });
  it('reads an envelope written before trainer results were stored with trainer and trainerRequest as null', () => {
    const r = TrainingRunResultsParser.ParseTrainingRunResults(JSON.stringify({ schema: TRAINING_RUN_RESULTS_SCHEMA, status: 'completed', unitResolution: counts, legacy: null, legacyRequest: null }));
    expect(r.Ok && r.Value.status === 'completed' ? [r.Value.trainer, r.Value.trainerRequest] : 'not read').toEqual([null, null]);
  });
  it('reads a trainer refusal and refuses one at an unknown trainer stage', () => {
    const envelope = (stage: string) => JSON.stringify({ schema: TRAINING_RUN_RESULTS_SCHEMA, status: 'refused', refusal: { stage: 'trainer', reason: { kind: 'trainer-failed', stage, message: 'one class in a fold', computeSeconds: 3.25 } } });
    const ok = TrainingRunResultsParser.ParseTrainingRunResults(envelope('inner-cv'));
    expect(ok.Ok && ok.Value.status === 'refused' ? ok.Value.refusal : null).toEqual({ stage: 'trainer', reason: { kind: 'trainer-failed', stage: 'inner-cv', message: 'one class in a fold', computeSeconds: 3.25 } });
    const bad = TrainingRunResultsParser.ParseTrainingRunResults(envelope('warm-up'));
    expect(bad.Ok ? null : bad.Errors.join('\n')).toMatch(/refusal\.reason\.stage/);
  });
  it('reads a completed envelope written before the carve was stored with carve as null', () => {
    // The shape a unit run stored before the carve member existed (legacy and trainer members, no carve key).
    const stored = JSON.stringify({ schema: TRAINING_RUN_RESULTS_SCHEMA, status: 'completed', unitResolution: counts, legacy: { metrics: { auc: 0.71 }, holdoutMetrics: null, trainingRowCount: 8, holdoutRowCount: 1 }, legacyRequest: null, trainer: null, trainerRequest: null });
    const r = TrainingRunResultsParser.ParseTrainingRunResults(stored);
    expect(r.Ok && r.Value.status === 'completed' ? r.Value.carve : 'not read').toBeNull();
  });
  it('reads back a stored carve summary and refuses one with a wrong-typed member', () => {
    const carve = {
      kind: 'date-carved', cutoff: '2024-01-01', holdoutEnd: '2025-01-01', developmentRowCount: 20, holdoutRowCount: 4, excludedAfterHoldoutEnd: 4,
      holdoutClassCounts: { Renewed: 3, Lapsed: 1 }, holdoutPeriods: ['2024-01-01'],
      newEntity: { holdoutEntityKeys: 3, trainingRowCount: 12, holdoutRowCount: 3, excludedRowCount: 5, sharedEntityKeys: 0 },
    };
    const envelope = (c: object) => JSON.stringify({ schema: TRAINING_RUN_RESULTS_SCHEMA, status: 'completed', unitResolution: counts, legacy: null, legacyRequest: null, trainer: null, trainerRequest: null, carve: c });
    const ok = TrainingRunResultsParser.ParseTrainingRunResults(envelope(carve));
    expect(ok.Ok && ok.Value.status === 'completed' ? ok.Value.carve : null).toEqual(carve);
    const bad = TrainingRunResultsParser.ParseTrainingRunResults(envelope({ ...carve, kind: 'trailing-fraction' }));
    expect(bad.Ok ? null : bad.Errors.join('\n')).toMatch(/carve\.kind/);
    const negative = TrainingRunResultsParser.ParseTrainingRunResults(envelope({ ...carve, holdoutRowCount: -1 }));
    expect(negative.Ok ? null : negative.Errors.join('\n')).toMatch(/carve\.holdoutRowCount/);
  });
  it('reads a carve refusal and refuses one of an unknown kind', () => {
    const envelope = (reason: object) => JSON.stringify({ schema: TRAINING_RUN_RESULTS_SCHEMA, status: 'refused', refusal: { stage: 'carve', reason } });
    const reason = { kind: 'too-few-periods', periods: 30, origins: 5, horizonPeriods: 3, gapPeriods: 0, minTrainPeriods: 24 };
    const ok = TrainingRunResultsParser.ParseTrainingRunResults(envelope(reason));
    expect(ok.Ok && ok.Value.status === 'refused' ? ok.Value.refusal : null).toEqual({ stage: 'carve', reason });
    const noHoldout = TrainingRunResultsParser.ParseTrainingRunResults(envelope({ kind: 'no-holdout-rows', cutoff: '2024-01-01', holdoutEnd: null }));
    expect(noHoldout.Ok).toBe(true);
    const seededEmpty = { kind: 'seeded-random-side-empty', side: 'locked-holdout', fraction: 0.1, rows: 3 };
    const seeded = TrainingRunResultsParser.ParseTrainingRunResults(envelope(seededEmpty));
    expect(seeded.Ok && seeded.Value.status === 'refused' ? seeded.Value.refusal : null).toEqual({ stage: 'carve', reason: seededEmpty });
    const wrongSide = TrainingRunResultsParser.ParseTrainingRunResults(envelope({ ...seededEmpty, side: 'test' }));
    expect(wrongSide.Ok ? null : wrongSide.Errors.join('\n')).toMatch(/refusal\.reason/);
    const bad = TrainingRunResultsParser.ParseTrainingRunResults(envelope({ kind: 'cutoff-in-the-future', cutoff: '2030-01-01' }));
    expect(bad.Ok ? null : bad.Errors.join('\n')).toMatch(/refusal\.reason\.kind/);
  });
  it('reports a pre-v2 blob as not an envelope', () => {
    expect(TrainingRunResultsParser.ParseTrainingRunResults('{"accuracy":0.9}')).toEqual({ Ok: false, Errors: ['ValidationResults is not a ps-run-results/v2 envelope'] });
  });
});
