import { describe, it, expect } from 'vitest';
import { TRAINING_RUN_RESULTS_SCHEMA, type TrainerRequest, type TrainerResult } from '@memberjunction/predictive-studio-core';
import { SnapshotRetrainer } from '../snapshot-retrainer';
import { SnapshotIntegrityError } from '../snapshot-manifest';
import type { ITrainerEvaluator } from '../../training/types';
import { UnitYearsWorld } from '../../__tests__/fakes/unit-years-world';
import { TrainerAnswers, TrainingHarness } from '../../__tests__/fakes/training-fakes';
import { TrainerResultFixtures } from '../../training/__tests__/fixtures/trainer-result';

/**
 * A trainer whose holdout metrics are a pure function of the snapshot it is sent: the same snapshot gives the same
 * metrics, so a retraining from the stored snapshot reproduces the original run exactly. `Drop` names a call (1-based)
 * whose answer omits the `auc` holdout metric; `NaNOn` names a call whose `auc` is NaN.
 */
class DeterministicTrainer implements ITrainerEvaluator {
  public CallCount = 0;
  constructor(private readonly altered: { readonly Drop?: number; readonly NaNOn?: number } = {}) {}

  public async RunTrainer(req: TrainerRequest): Promise<TrainerResult> {
    this.CallCount++;
    const canned = TrainerAnswers.CannedFor(req);
    if (canned.status !== 'completed') return canned;
    const seed = [...req.snapshot.contentHash].reduce((s, c) => s + c.charCodeAt(0), 0);
    const logLoss = TrainerResultFixtures.Mwi('log-loss', 0.4 + (seed % 97) / 1000, 0.3, 0.5, 2);
    const auc = TrainerResultFixtures.Mwi('auc', this.CallCount === this.altered.NaNOn ? Number.NaN : 0.6 + (seed % 83) / 1000, 0.5, 0.7, 2);
    return { ...canned, holdout: { primary: logLoss, secondary: this.CallCount === this.altered.Drop ? [] : [auc] } };
  }
}

/** A unit pipeline over the `UnitYearsWorld` rows, trained once with the given trainer. */
async function trainedUnitRun(trainer: DeterministicTrainer) {
  const harness = TrainingHarness.ForUnit(UnitYearsWorld.Years(), UnitYearsWorld.UnitColumns());
  harness.deps.trainer = trainer;
  const { run } = await harness.engine.trainModel({ pipelineId: harness.pipeline.ID }, harness.deps);
  return { ...harness, run };
}

describe('SnapshotRetrainer.Retrain', () => {
  it('retrains a unit run through the trainer from its snapshot files and logged request and reproduces its holdout metrics exactly', async () => {
    const trainer = new DeterministicTrainer();
    const { deps, run, snapshots, sidecar } = await trainedUnitRun(trainer);
    const result = await new SnapshotRetrainer().Retrain(run.ID, deps);
    expect([trainer.CallCount, sidecar.CallCount]).toEqual([2, 0]);
    expect(result).toMatchObject({ TrainingRunID: run.ID, TrainingSnapshotID: snapshots[0].ID, FilesVerified: true, ContentHashVerified: true, MaxAbsDiff: 0, Reproduced: true });
    expect(Object.keys(result.Original).sort()).toEqual(['auc', 'log-loss']);
    expect(result.Retrained).toEqual(result.Original);
    expect(SnapshotRetrainer.DefaultTolerance).toBe(1e-9);
  });

  it('refuses a run that logged no trainer request, naming it, before reading its snapshot or calling a trainer', async () => {
    const trainer = new DeterministicTrainer();
    const { deps, run } = await trainedUnitRun(trainer);
    run.ValidationResults = JSON.stringify({
      schema: TRAINING_RUN_RESULTS_SCHEMA, status: 'completed',
      unitResolution: { rowsRead: 12, censoredRowsExcluded: 4, labelKnownRowsExcluded: 0, emptyLabelRowsExcluded: 0, duplicateRowsRemoved: 0, resolvedRows: 8, dataCutoff: '2026-01-01' },
      legacy: { metrics: { auc: 0.7 }, holdoutMetrics: { auc: 0.68 }, trainingRowCount: 6, holdoutRowCount: 2 },
      legacyRequest: { algorithm: 'xgboost', problemType: 'classification', hyperparameters: {}, validation: { strategy: 'train_test_split', test_size: 0.2 } },
    });
    await expect(new SnapshotRetrainer().Retrain(run.ID, deps)).rejects.toThrow(`Run ${run.ID} has no trainer request; only runs trained through /trainer are retrained`);
    expect(trainer.CallCount).toBe(1);
  });

  it('refuses a snapshot whose stored matrix file no longer matches its SHA-256, naming the matrix file', async () => {
    const trainer = new DeterministicTrainer();
    const { deps, run, snapshots, files } = await trainedUnitRun(trainer);
    const stored = files.Saved.get(snapshots[0].MatrixFileID);
    if (!stored) throw new Error('the matrix file was not stored');
    stored.Bytes[stored.Bytes.length - 2] ^= 1;
    await expect(new SnapshotRetrainer().Retrain(run.ID, deps)).rejects.toMatchObject({ name: 'SnapshotIntegrityError', File: 'matrix' });
    await expect(new SnapshotRetrainer().Retrain(run.ID, deps)).rejects.toBeInstanceOf(SnapshotIntegrityError);
    expect(trainer.CallCount).toBe(1);
  });

  it('refuses a snapshot whose stored content hash was overwritten, naming the content', async () => {
    const trainer = new DeterministicTrainer();
    const { deps, run, snapshots } = await trainedUnitRun(trainer);
    snapshots[0].ContentHash = '0'.repeat(64);
    await expect(new SnapshotRetrainer().Retrain(run.ID, deps)).rejects.toMatchObject({ name: 'SnapshotIntegrityError', File: 'content' });
    expect(trainer.CallCount).toBe(1);
  });

  it('refuses a snapshot whose data cutoff moved by a day, since its identity no longer yields its content hash', async () => {
    const trainer = new DeterministicTrainer();
    const { deps, run, snapshots } = await trainedUnitRun(trainer);
    const s = snapshots[0];
    s.DataCutoff = new Date(s.DataCutoff.getTime() + 86_400_000);
    await expect(new SnapshotRetrainer().Retrain(run.ID, deps)).rejects.toMatchObject({ name: 'SnapshotIntegrityError', File: 'content', Expected: s.ContentHash });
    expect(trainer.CallCount).toBe(1);
  });

  it('does not report reproduced when the retraining omits a holdout metric the run recorded', async () => {
    const { deps, run } = await trainedUnitRun(new DeterministicTrainer({ Drop: 2 }));
    const result = await new SnapshotRetrainer().Retrain(run.ID, deps);
    expect(result.Reproduced).toBe(false);
    expect(result.MaxAbsDiff).toBe(Number.POSITIVE_INFINITY);
  });

  it('does not report reproduced when the retraining returns a NaN holdout metric', async () => {
    const { deps, run } = await trainedUnitRun(new DeterministicTrainer({ NaNOn: 2 }));
    const result = await new SnapshotRetrainer().Retrain(run.ID, deps);
    expect(Number.isNaN(result.Retrained.auc)).toBe(true);
    expect(result.Reproduced).toBe(false);
    expect(result.MaxAbsDiff).toBe(Number.POSITIVE_INFINITY);
  });
});
