import { describe, it, expect } from 'vitest';
import { TRAINING_RUN_RESULTS_SCHEMA, TrainingRunResultsParser } from '../training-run-results';

const counts = { rowsRead: 10, censoredRowsExcluded: 1, labelKnownRowsExcluded: 0, emptyLabelRowsExcluded: 0, duplicateRowsRemoved: 0, resolvedRows: 9, dataCutoff: '2026-01-01' };

describe('TrainingRunResultsParser', () => {
  it('reads a completed and a refused envelope', () => {
    expect(TrainingRunResultsParser.ParseTrainingRunResults(JSON.stringify({ schema: TRAINING_RUN_RESULTS_SCHEMA, status: 'completed', unitResolution: counts, legacy: null, legacyRequest: null })).Ok).toBe(true);
    const refused = TrainingRunResultsParser.ParseTrainingRunResults(JSON.stringify({ schema: TRAINING_RUN_RESULTS_SCHEMA, status: 'refused', refusal: { stage: 'pipeline', reason: { kind: 'protocol-required', pipelineId: 'p1' } } }));
    expect(refused.Ok && refused.Value.status === 'refused' ? refused.Value.refusal.reason.kind : null).toBe('protocol-required');
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
  it('reports a pre-v2 blob as not an envelope', () => {
    expect(TrainingRunResultsParser.ParseTrainingRunResults('{"accuracy":0.9}')).toEqual({ Ok: false, Errors: ['ValidationResults is not a ps-run-results/v2 envelope'] });
  });
});
