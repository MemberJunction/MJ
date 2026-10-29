import { describe, it, expect } from 'vitest';
import { TRAINING_RUN_RESULTS_SCHEMA, TrainerContract, TrainingRunResultsParser } from '@memberjunction/predictive-studio-core';
import { TrainerResultFixtures } from './fixtures/trainer-result';

const counts = { rowsRead: 10, censoredRowsExcluded: 1, labelKnownRowsExcluded: 0, emptyLabelRowsExcluded: 0, duplicateRowsRemoved: 0, resolvedRows: 9, dataCutoff: '2026-01-01' };
const envelope = (trainer: object): string => JSON.stringify({ schema: TRAINING_RUN_RESULTS_SCHEMA, status: 'completed', unitResolution: counts, legacy: null, legacyRequest: null, trainer, trainerRequest: null });
const RUN_ID = '00000000-0000-0000-0000-0000000000a1';

describe('stored trainer results (ValidationResults.trainer)', () => {
  it('reads back a stored trainer result and refuses one with a wrong-typed member', () => {
    const result = TrainerResultFixtures.CannedCompleted(RUN_ID, { budgets: { maxComputeSeconds: 3600, maxTokens: 0, maxCandidates: 10, hardStop: true } });
    const trainer = TrainerContract.ToStoredTrainerResult(result, new Map(result.artifacts.map((a, i): [string, string] => [a.candidate, `F${i + 1}`])));
    const ok = TrainingRunResultsParser.ParseTrainingRunResults(envelope(trainer));
    expect(ok.Ok && ok.Value.status === 'completed' ? ok.Value.trainer?.finalist : null).toBe(trainer.finalist);
    const bad = TrainingRunResultsParser.ParseTrainingRunResults(envelope({ ...trainer, holdout: { ...trainer.holdout, primary: { ...trainer.holdout.primary, metric: 'gini' } } }));
    expect(bad.Ok === false ? bad.Errors.join('\n') : null).toMatch(/trainer\.holdout\.primary\.metric/);
  });

  it('refuses a stored trainer result that still carries artifact bytes', () => {
    const result = TrainerResultFixtures.CannedCompleted(RUN_ID, { budgets: { maxComputeSeconds: 3600, maxTokens: 0, maxCandidates: 10, hardStop: true } });
    const parsed = TrainingRunResultsParser.ParseTrainingRunResults(envelope(result));
    expect(parsed.Ok === false ? parsed.Errors.join('\n') : null).toMatch(/trainer\.artifacts\.0/);
  });
});
