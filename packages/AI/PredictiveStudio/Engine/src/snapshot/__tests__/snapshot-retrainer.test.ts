import { describe, it, expect } from 'vitest';
import type { MatrixData, TrainRequest, TrainResponse } from '@memberjunction/predictive-studio-core';
import { SnapshotIntegrityError, SnapshotRetrainer } from '../snapshot-retrainer';
import type { ISidecarTrainer } from '../../training/types';
import { UnitYearsWorld } from '../../__tests__/fakes/unit-years-world';
import { cleanResponse, TrainingHarness } from '../../__tests__/fakes/training-fakes';

/**
 * A trainer whose holdout metrics are a pure function of the rows it is sent: the same rows give the same metrics, so
 * a retraining from the stored snapshot reproduces the original run exactly. `Drop` names a call (1-based) whose
 * response omits the `accuracy` holdout metric; `NaNOn` names a call whose `accuracy` is NaN.
 */
class DeterministicSidecar implements ISidecarTrainer {
  public CallCount = 0;
  constructor(private readonly altered: { readonly Drop?: number; readonly NaNOn?: number } = {}) {}

  public async train(req: TrainRequest, lockedHoldout?: MatrixData): Promise<TrainResponse> {
    this.CallCount++;
    const training = DeterministicSidecar.numericSum(req.data?.rows || []);
    const holdout = DeterministicSidecar.numericSum(lockedHoldout?.rows || []);
    const auc = 0.5 + (training % 97) / 1000 + (holdout % 89) / 10000;
    const accuracy = 0.6 + ((training + holdout) % 83) / 1000;
    const holdoutMetrics: Record<string, number> = this.CallCount === this.altered.Drop
      ? { auc }
      : { auc, accuracy: this.CallCount === this.altered.NaNOn ? Number.NaN : accuracy };
    return { ...cleanResponse, training_row_count: req.data?.rows.length || 0, holdout_metrics: holdoutMetrics };
  }

  /** The sum of every numeric cell and the length of every text cell. */
  private static numericSum(rows: MatrixData['rows']): number {
    return rows.reduce((s, r) => s + r.reduce<number>((t, c) => t + (typeof c === 'number' ? c : typeof c === 'string' ? c.length : 0), 0), 0);
  }
}

/** A unit pipeline over the `UnitYearsWorld` rows, trained once with the given trainer. */
async function trainedUnitRun(sidecar: DeterministicSidecar) {
  const harness = TrainingHarness.ForUnit(UnitYearsWorld.Years(), UnitYearsWorld.UnitColumns());
  harness.deps.sidecar = sidecar;
  const { run } = await harness.engine.trainModel({ pipelineId: harness.pipeline.ID }, harness.deps);
  return { ...harness, run };
}

describe('SnapshotRetrainer.Retrain', () => {
  it('retrains a unit run from its snapshot files and logged request and reproduces its holdout metrics exactly', async () => {
    const sidecar = new DeterministicSidecar();
    const { deps, run, snapshots } = await trainedUnitRun(sidecar);
    const result = await new SnapshotRetrainer().Retrain(run.ID, deps);
    expect(sidecar.CallCount).toBe(2);
    expect(result).toMatchObject({ TrainingRunID: run.ID, TrainingSnapshotID: snapshots[0].ID, FilesVerified: true, ContentHashVerified: true, MaxAbsDiff: 0, Reproduced: true });
    expect(Object.keys(result.Original).sort()).toEqual(['accuracy', 'auc']);
    expect(result.Retrained).toEqual(result.Original);
    expect(SnapshotRetrainer.DefaultTolerance).toBe(1e-9);
  });

  it('refuses a snapshot whose stored matrix file no longer matches its SHA-256, naming the matrix file', async () => {
    const sidecar = new DeterministicSidecar();
    const { deps, run, snapshots, files } = await trainedUnitRun(sidecar);
    const stored = files.Saved.get(snapshots[0].MatrixFileID);
    if (!stored) throw new Error('the matrix file was not stored');
    stored.Bytes[stored.Bytes.length - 2] ^= 1;
    await expect(new SnapshotRetrainer().Retrain(run.ID, deps)).rejects.toMatchObject({ name: 'SnapshotIntegrityError', File: 'matrix' });
    await expect(new SnapshotRetrainer().Retrain(run.ID, deps)).rejects.toBeInstanceOf(SnapshotIntegrityError);
    expect(sidecar.CallCount).toBe(1);
  });

  it('refuses a snapshot whose stored content hash was overwritten, naming the content', async () => {
    const sidecar = new DeterministicSidecar();
    const { deps, run, snapshots } = await trainedUnitRun(sidecar);
    snapshots[0].ContentHash = '0'.repeat(64);
    await expect(new SnapshotRetrainer().Retrain(run.ID, deps)).rejects.toMatchObject({ name: 'SnapshotIntegrityError', File: 'content' });
    expect(sidecar.CallCount).toBe(1);
  });

  it('refuses a snapshot whose data cutoff moved by a day, since its identity no longer yields its content hash', async () => {
    const sidecar = new DeterministicSidecar();
    const { deps, run, snapshots } = await trainedUnitRun(sidecar);
    const s = snapshots[0];
    s.DataCutoff = new Date(s.DataCutoff.getTime() + 86_400_000);
    await expect(new SnapshotRetrainer().Retrain(run.ID, deps)).rejects.toMatchObject({ name: 'SnapshotIntegrityError', File: 'content', Expected: s.ContentHash });
    expect(sidecar.CallCount).toBe(1);
  });

  it('does not report reproduced when the retraining omits a holdout metric the run recorded', async () => {
    const { deps, run } = await trainedUnitRun(new DeterministicSidecar({ Drop: 2 }));
    const result = await new SnapshotRetrainer().Retrain(run.ID, deps);
    expect(result.Reproduced).toBe(false);
    expect(result.MaxAbsDiff).toBe(Number.POSITIVE_INFINITY);
  });

  it('does not report reproduced when the retraining returns a NaN holdout metric', async () => {
    const { deps, run } = await trainedUnitRun(new DeterministicSidecar({ NaNOn: 2 }));
    const result = await new SnapshotRetrainer().Retrain(run.ID, deps);
    expect(Number.isNaN(result.Retrained.accuracy)).toBe(true);
    expect(result.Reproduced).toBe(false);
    expect(result.MaxAbsDiff).toBe(Number.POSITIVE_INFINITY);
  });
});
