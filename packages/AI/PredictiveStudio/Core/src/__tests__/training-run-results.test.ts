import { describe, it, expect } from 'vitest';
import { TRAINING_RUN_RESULTS_SCHEMA, TrainingRunResultsParser } from '../training-run-results';

const counts = { rowsRead: 10, censoredRowsExcluded: 1, labelKnownRowsExcluded: 0, emptyLabelRowsExcluded: 0, duplicateRowsRemoved: 0, resolvedRows: 9, dataCutoff: '2026-01-01' };
/** The members every completed envelope carries, null for a run without a trainer result. */
const noTraining = { trainer: null, trainerRequest: null, carve: null, gate: null };

describe('TrainingRunResultsParser', () => {
  it('reads a completed and a refused envelope', () => {
    expect(TrainingRunResultsParser.ParseTrainingRunResults(JSON.stringify({ schema: TRAINING_RUN_RESULTS_SCHEMA, status: 'completed', unitResolution: counts, ...noTraining })).Ok).toBe(true);
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
      { kind: 'time-index-needs-time-holdout', pipelineId: 'p1', protocolId: 'P1', timeIndexColumn: 'MonthIndex', holdout: 'seeded-random' },
      { kind: 'input-not-accepted', input: 'primaryKeyField', why: 'the unit keys rows by the row entity' },
    ];
    for (const reason of reasons) {
      const r = TrainingRunResultsParser.ParseTrainingRunResults(envelope(reason));
      expect(r.Ok && r.Value.status === 'refused' ? r.Value.refusal.reason : null).toEqual(reason);
    }
    const bad = TrainingRunResultsParser.ParseTrainingRunResults(envelope({ kind: 'too-many-candidates', pipelineId: 'p1', candidates: 2.5, maxCandidates: 2 }));
    expect(bad.Ok ? null : bad.Errors.join('\n')).toMatch(/refusal\.reason\.candidates/);
    const badHoldout = TrainingRunResultsParser.ParseTrainingRunResults(envelope({ kind: 'time-index-needs-time-holdout', pipelineId: 'p1', protocolId: 'P1', timeIndexColumn: 'T', holdout: 'trailing' }));
    expect(badHoldout.Ok ? null : badHoldout.Errors.join('\n')).toMatch(/refusal\.reason\.holdout/);
  });
  it('keeps the count of rows whose outcome fell inside the gap, reads a run stored without it, and reads the duplicate-period-index and no-resolved-rows refusals', () => {
    const withGap = TrainingRunResultsParser.ParseTrainingRunResults(JSON.stringify({ schema: TRAINING_RUN_RESULTS_SCHEMA, status: 'completed', unitResolution: { ...counts, gapOutcomeRowsExcluded: 3 }, ...noTraining }));
    expect(withGap.Ok && withGap.Value.status === 'completed' ? withGap.Value.unitResolution.gapOutcomeRowsExcluded : null).toBe(3);
    const older = TrainingRunResultsParser.ParseTrainingRunResults(JSON.stringify({ schema: TRAINING_RUN_RESULTS_SCHEMA, status: 'completed', unitResolution: counts, ...noTraining }));
    expect(older.Ok && older.Value.status === 'completed' ? older.Value.unitResolution.gapOutcomeRowsExcluded : 'not ok').toBeUndefined();
    const unitEnvelope = (reason: object) => JSON.stringify({ schema: TRAINING_RUN_RESULTS_SCHEMA, status: 'refused', refusal: { stage: 'unit', reason } });
    for (const reason of [
      { kind: 'duplicate-period-index', entity: 'Periods', field: 'PeriodIndex', entityKey: 'M3', periodIndex: 2 },
      { kind: 'no-resolved-rows', censored: 1, labelKnown: 0, gapOutcome: 4, emptyLabel: 0 },
    ]) {
      const r = TrainingRunResultsParser.ParseTrainingRunResults(unitEnvelope(reason));
      expect(r.Ok && r.Value.status === 'refused' ? r.Value.refusal.reason : null).toEqual(reason);
    }
  });
  it('reads an assembly refusal for an incumbent rule with no value on some rows', () => {
    const reason = { kind: 'incumbent-score-missing', entity: 'yearly renewal unit', rows: 2, firstRowIds: ['r2', 'r3'] };
    const r = TrainingRunResultsParser.ParseTrainingRunResults(JSON.stringify({ schema: TRAINING_RUN_RESULTS_SCHEMA, status: 'refused', refusal: { stage: 'assembly', reason } }));
    expect(r.Ok && r.Value.status === 'refused' ? r.Value.refusal.reason : null).toEqual(reason);
  });
  it('reads an assembly refusal for a timestamp in a record history that names no valid instant', () => {
    const reason = { kind: 'invalid-date-in-history', entity: 'People', field: 'Code', value: '2025-99-99T00:00' };
    const r = TrainingRunResultsParser.ParseTrainingRunResults(JSON.stringify({ schema: TRAINING_RUN_RESULTS_SCHEMA, status: 'refused', refusal: { stage: 'assembly', reason } }));
    expect(r.Ok && r.Value.status === 'refused' ? r.Value.refusal.reason : null).toEqual(reason);
  });
  it('refuses an envelope whose members have the wrong shape, naming the path', () => {
    const r = TrainingRunResultsParser.ParseTrainingRunResults(JSON.stringify({ schema: TRAINING_RUN_RESULTS_SCHEMA, status: 'completed', unitResolution: { ...counts, resolvedRows: 'nine' }, ...noTraining }));
    expect(r.Ok ? null : r.Errors.join('\n')).toMatch(/unitResolution\.resolvedRows/);
    expect(TrainingRunResultsParser.ParseTrainingRunResults(JSON.stringify({ schema: TRAINING_RUN_RESULTS_SCHEMA, status: 'refused', refusal: { stage: 'pipeline', reason: { kind: 'made-up' } } })).Ok).toBe(false);
  });
  it('refuses a completed envelope that omits trainer, trainerRequest, carve or gate', () => {
    for (const member of ['trainer', 'trainerRequest', 'carve', 'gate'] as const) {
      const { [member]: _omitted, ...rest } = noTraining;
      const r = TrainingRunResultsParser.ParseTrainingRunResults(JSON.stringify({ schema: TRAINING_RUN_RESULTS_SCHEMA, status: 'completed', unitResolution: counts, ...rest }));
      expect(r.Ok ? null : r.Errors.join('\n')).toMatch(new RegExp(`ValidationResults\\.${member}:`));
    }
  });
  it('reads a trainer refusal and refuses one at an unknown trainer stage', () => {
    const envelope = (stage: string) => JSON.stringify({ schema: TRAINING_RUN_RESULTS_SCHEMA, status: 'refused', refusal: { stage: 'trainer', reason: { kind: 'trainer-failed', stage, message: 'one class in a fold', computeSeconds: 3.25 } } });
    const ok = TrainingRunResultsParser.ParseTrainingRunResults(envelope('inner-cv'));
    expect(ok.Ok && ok.Value.status === 'refused' ? ok.Value.refusal : null).toEqual({ stage: 'trainer', reason: { kind: 'trainer-failed', stage: 'inner-cv', message: 'one class in a fold', computeSeconds: 3.25 } });
    const bad = TrainingRunResultsParser.ParseTrainingRunResults(envelope('warm-up'));
    expect(bad.Ok ? null : bad.Errors.join('\n')).toMatch(/refusal\.reason\.stage/);
  });
  it('reads back a stored carve summary and refuses one with a wrong-typed member', () => {
    const carve = {
      kind: 'date-carved', cutoff: '2024-01-01', holdoutEnd: '2025-01-01', developmentRowCount: 20, holdoutRowCount: 4, excludedAfterHoldoutEnd: 4,
      holdoutClassCounts: { Renewed: 3, Lapsed: 1 }, holdoutPeriods: ['2024-01-01'],
      newEntity: {
        holdoutEntityKeys: 3, trainingRowCount: 12, holdoutRowCount: 3, excludedRowCount: 5, sharedEntityKeys: 0,
        heldGroupKeysSha256: 'a'.repeat(64), trainingGroupKeysSha256: 'b'.repeat(64),
      },
    };
    const envelope = (c: object) => JSON.stringify({ schema: TRAINING_RUN_RESULTS_SCHEMA, status: 'completed', unitResolution: counts, ...noTraining, carve: c });
    const ok = TrainingRunResultsParser.ParseTrainingRunResults(envelope(carve));
    expect(ok.Ok && ok.Value.status === 'completed' ? ok.Value.carve : null).toEqual(carve);
    const bad = TrainingRunResultsParser.ParseTrainingRunResults(envelope({ ...carve, kind: 'trailing-fraction' }));
    expect(bad.Ok ? null : bad.Errors.join('\n')).toMatch(/carve\.kind/);
    const negative = TrainingRunResultsParser.ParseTrainingRunResults(envelope({ ...carve, holdoutRowCount: -1 }));
    expect(negative.Ok ? null : negative.Errors.join('\n')).toMatch(/carve\.holdoutRowCount/);
    const badHash = TrainingRunResultsParser.ParseTrainingRunResults(envelope({ ...carve, newEntity: { ...carve.newEntity, heldGroupKeysSha256: 'not-a-hash' } }));
    expect(badHash.Ok ? null : badHash.Errors.join('\n')).toMatch(/carve\.newEntity\.heldGroupKeysSha256/);
  });
  it('refuses a new-entity summary without its group-key hashes', () => {
    const withoutHashes = {
      kind: 'date-carved', cutoff: '2024-01-01', holdoutEnd: null, developmentRowCount: 20, holdoutRowCount: 4, excludedAfterHoldoutEnd: 0,
      holdoutClassCounts: null, holdoutPeriods: ['2024-01-01'],
      newEntity: { holdoutEntityKeys: 3, trainingRowCount: 12, holdoutRowCount: 3, excludedRowCount: 5, sharedEntityKeys: 0 },
    };
    const r = TrainingRunResultsParser.ParseTrainingRunResults(JSON.stringify({ schema: TRAINING_RUN_RESULTS_SCHEMA, status: 'completed', unitResolution: counts, ...noTraining, carve: withoutHashes }));
    expect(r.Ok ? null : r.Errors.join('\n')).toMatch(/carve\.newEntity\.heldGroupKeysSha256/);
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
  it('reads a trainer selection refusal and refuses one with an unknown reason', () => {
    const envelope = (reason: object) => JSON.stringify({ schema: TRAINING_RUN_RESULTS_SCHEMA, status: 'refused', refusal: { stage: 'trainer', reason } });
    const reason = { kind: 'selection-invalid', reason: 'candidate-pruned', detail: 'rf was scored on 5 folds, the others on 15' };
    const ok = TrainingRunResultsParser.ParseTrainingRunResults(envelope(reason));
    expect(ok.Ok && ok.Value.status === 'refused' ? ok.Value.refusal : null).toEqual({ stage: 'trainer', reason });
    const bad = TrainingRunResultsParser.ParseTrainingRunResults(envelope({ ...reason, reason: 'lowest-mean-not-chosen' }));
    expect(bad.Ok ? null : bad.Errors.join('\n')).toMatch(/refusal\.reason/);
  });
  it('reports a pre-v2 blob as not an envelope', () => {
    expect(TrainingRunResultsParser.ParseTrainingRunResults('{"accuracy":0.9}')).toEqual({ Ok: false, Errors: ['ValidationResults is not a ps-run-results/v2 envelope'] });
  });
});
