import { describe, it, expect } from 'vitest';
import { TRAINING_RUN_RESULTS_SCHEMA, TrainingRunResultsParser } from '../training-run-results';

const counts = { rowsRead: 10, censoredRowsExcluded: 1, labelKnownRowsExcluded: 0, emptyLabelRowsExcluded: 0, duplicateRowsRemoved: 0, resolvedRows: 9, dataCutoff: '2026-01-01' };

describe('TrainingRunResultsParser', () => {
  it('reads a completed and a refused envelope', () => {
    expect(TrainingRunResultsParser.ParseTrainingRunResults(JSON.stringify({ schema: TRAINING_RUN_RESULTS_SCHEMA, status: 'completed', unitResolution: counts, legacy: null })).Ok).toBe(true);
    const refused = TrainingRunResultsParser.ParseTrainingRunResults(JSON.stringify({ schema: TRAINING_RUN_RESULTS_SCHEMA, status: 'refused', refusal: { stage: 'pipeline', reason: { kind: 'protocol-required', pipelineId: 'p1' } } }));
    expect(refused.Ok && refused.Value.status === 'refused' ? refused.Value.refusal.reason.kind : null).toBe('protocol-required');
  });
  it('refuses an envelope whose members have the wrong shape, naming the path', () => {
    const r = TrainingRunResultsParser.ParseTrainingRunResults(JSON.stringify({ schema: TRAINING_RUN_RESULTS_SCHEMA, status: 'completed', unitResolution: { ...counts, resolvedRows: 'nine' }, legacy: null }));
    expect(r.Ok ? null : r.Errors.join('\n')).toMatch(/unitResolution\.resolvedRows/);
    expect(TrainingRunResultsParser.ParseTrainingRunResults(JSON.stringify({ schema: TRAINING_RUN_RESULTS_SCHEMA, status: 'refused', refusal: { stage: 'pipeline', reason: { kind: 'made-up' } } })).Ok).toBe(false);
  });
  it('reports a pre-v2 blob as not an envelope', () => {
    expect(TrainingRunResultsParser.ParseTrainingRunResults('{"accuracy":0.9}')).toEqual({ Ok: false, Errors: ['ValidationResults is not a ps-run-results/v2 envelope'] });
  });
});
