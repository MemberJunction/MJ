/**
 * `TrainingClaims` (Task M4b.2, D4-12): the single-flight claim of a pipeline's training — over the `GateTestStore`
 * (the claim's transaction, both queries, the stale threshold) and through the real `TrainingEngine` on the training
 * harness (`TrainModelInput.SingleFlight` set or absent).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RunQueryParams, RunQueryResult } from '@memberjunction/core';
import type { MJMLTrainingRunEntity } from '@memberjunction/core-entities';

import { FakeClock, GateTestStore, GateWorld } from '../../__tests__/fakes/gate-test-store';
import { TrainingHarness, TrainingProviderFake } from '../../__tests__/fakes/training-fakes';
import { UnitYearsWorld } from '../../__tests__/fakes/unit-years-world';
import { PipelineLockTimeoutError } from '../../registry/model-versions';
import { TrainingClaims, TrainingInFlightError } from '../training-claims';

const NOW = new Date('2026-11-16T12:00:00.000Z');
const PIPELINE = GateWorld.PipelineID;

let store: GateTestStore;

/** A new, unsaved run row on the store's provider. */
async function newRun(): Promise<MJMLTrainingRunEntity> {
  const run = await store.Provider().GetEntityObject<MJMLTrainingRunEntity>('MJ: ML Training Runs', GateWorld.User);
  run.NewRecord();
  return run;
}
const deps = () => ({ provider: store.Provider(), contextUser: GateWorld.User, now: () => NOW });

beforeEach(() => {
  store = new GateTestStore();
});

describe('TrainingClaims.ClaimPipeline', () => {
  it('locks the pipeline, reads the running run as of now minus the stale threshold, saves the run Running and commits', async () => {
    const claim = await TrainingClaims.ClaimPipeline(PIPELINE, TrainingClaims.STALE_AFTER_HOURS, deps(), await newRun());
    expect(claim.Claimed).toBe(true);
    expect(store.Reads).toEqual(['query Predictive Studio: Lock Pipeline For Publish', 'query Predictive Studio: Running Training Run']);
    expect(store.Transactions).toEqual(['begin', 'commit']);
    expect(store.TrainingRuns(PIPELINE)).toEqual([expect.objectContaining({ PipelineID: PIPELINE, Status: 'Running', StartedAt: NOW })]);
  });

  it('a Running run younger than the threshold holds the pipeline: nothing is saved, the transaction is rolled back, the run is named', async () => {
    const holder = '6A1D2E3F-0000-4000-8000-00000000D001';
    store.Insert('MJ: ML Training Runs', { ID: holder, PipelineID: PIPELINE, Status: 'Running', StartedAt: new Date(NOW.getTime() - 6 * 3_600_000 + 1) });
    expect(await TrainingClaims.ClaimPipeline(PIPELINE, TrainingClaims.STALE_AFTER_HOURS, deps(), await newRun())).toEqual({ Claimed: false, InFlightRunID: holder });
    expect([store.Transactions, store.TrainingRuns(PIPELINE).map((r) => r['ID'])]).toEqual([['begin', 'rollback'], [holder]]);
  });

  it('a Running run as old as the threshold, a finished run and another pipeline\'s run do not hold it', async () => {
    store.Insert('MJ: ML Training Runs', { ID: '6A1D2E3F-0000-4000-8000-00000000D002', PipelineID: PIPELINE, Status: 'Running', StartedAt: new Date(NOW.getTime() - 6 * 3_600_000) });
    store.Insert('MJ: ML Training Runs', { ID: '6A1D2E3F-0000-4000-8000-00000000D003', PipelineID: PIPELINE, Status: 'Completed', StartedAt: NOW });
    store.Insert('MJ: ML Training Runs', { ID: '6A1D2E3F-0000-4000-8000-00000000D004', PipelineID: '6A1D2E3F-0000-4000-8000-00000000D0FF', Status: 'Running', StartedAt: NOW });
    expect((await TrainingClaims.ClaimPipeline(PIPELINE, TrainingClaims.STALE_AFTER_HOURS, deps(), await newRun())).Claimed).toBe(true);
  });

  it('two claims started together: the second waits for the first and sees its run', async () => {
    const [a, b] = await Promise.all([
      TrainingClaims.ClaimPipeline(PIPELINE, TrainingClaims.STALE_AFTER_HOURS, deps(), await newRun()),
      TrainingClaims.ClaimPipeline(PIPELINE, TrainingClaims.STALE_AFTER_HOURS, deps(), await newRun()),
    ]);
    const [run] = store.TrainingRuns(PIPELINE);
    expect([a.Claimed, b]).toEqual([true, { Claimed: false, InFlightRunID: run['ID'] }]);
    expect(store.Transactions).toEqual(['begin', 'commit', 'begin', 'rollback']);
  });

  it('a pipeline lock that stays held for the lock wait throws PipelineLockTimeoutError and saves nothing', async () => {
    store.LockFailures = 1_000;
    const attempt = TrainingClaims.ClaimPipeline(PIPELINE, TrainingClaims.STALE_AFTER_HOURS, deps(), await newRun(), new FakeClock());
    await expect(attempt).rejects.toBeInstanceOf(PipelineLockTimeoutError);
    expect([store.Transactions, store.TrainingRuns(PIPELINE)]).toEqual([['begin', 'rollback'], []]);
  });

  it('SaveClaimedRun throws TrainingInFlightError naming the run that holds the pipeline', async () => {
    const holder = '6A1D2E3F-0000-4000-8000-00000000D005';
    store.Insert('MJ: ML Training Runs', { ID: holder, PipelineID: PIPELINE, Status: 'Running', StartedAt: NOW });
    const attempt = TrainingClaims.SaveClaimedRun(PIPELINE, await newRun(), deps());
    await expect(attempt).rejects.toBeInstanceOf(TrainingInFlightError);
    await expect(attempt).rejects.toThrow(`Predictive Studio: training pipeline ${PIPELINE} is already being trained by run ${holder}, so no second run was started.`);
  });

  it('StaleBefore is now minus the threshold, as ISO 8601 UTC', () => {
    expect(TrainingClaims.StaleBefore(NOW, 6)).toBe('2026-11-16T06:00:00.000Z');
  });
});

/** The training harness's provider, answering the claim's running-run read with `running` (default: none). */
class ClaimingTrainingProvider extends TrainingProviderFake {
  public Running: Record<string, string | Date>[] = [];
  public override async RunQuery(params: RunQueryParams): Promise<RunQueryResult> {
    if (params.QueryName !== 'Predictive Studio: Running Training Run') return super.RunQuery(params);
    this.Log.push(`query ${params.QueryName}`);
    return { QueryID: '', QueryName: params.QueryName, Success: true, Results: this.Running, RowCount: this.Running.length, TotalRowCount: this.Running.length, ExecutionTime: 0, ErrorMessage: '' };
  }
}

describe('TrainingEngine.createRunRow with and without TrainModelInput.SingleFlight', () => {
  beforeEach(() => {
    vi.stubEnv('PS_COMPUTE_USD_PER_SECOND', '');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  /** The unit-years harness on a provider that answers the claim. */
  function harness(): { readonly Harness: ReturnType<typeof TrainingHarness.ForUnit>; readonly Provider: ClaimingTrainingProvider } {
    const h = TrainingHarness.ForUnit(UnitYearsWorld.Years(), UnitYearsWorld.UnitColumns());
    const provider = new ClaimingTrainingProvider();
    h.deps.provider = provider;
    return { Harness: h, Provider: provider };
  }

  it('SingleFlight absent: the run row is saved as before and no claim query runs', async () => {
    const { Harness: h, Provider: provider } = harness();
    const result = await h.engine.trainModel({ pipelineId: h.pipeline.ID }, h.deps);
    expect(result.run.ID).toBe(h.runs[0].ID);
    expect(provider.Log.filter((l) => l.includes('Running Training Run'))).toEqual([]);
  });

  it('SingleFlight: the run row the claim saved is the run, and the claim ran first in its own transaction', async () => {
    const { Harness: h, Provider: provider } = harness();
    const result = await h.engine.trainModel({ pipelineId: h.pipeline.ID, SingleFlight: true }, h.deps);
    expect([result.run.ID, result.run.Status]).toEqual([h.runs[0].ID, 'Completed']);
    expect(provider.Log.slice(0, 4)).toEqual(['begin', 'query Predictive Studio: Lock Pipeline For Publish', 'query Predictive Studio: Running Training Run', 'commit']);
  });

  it('SingleFlight with a run in flight: TrainingInFlightError, and no run row is saved', async () => {
    const { Harness: h, Provider: provider } = harness();
    provider.Running = [{ ID: '6A1D2E3F-0000-4000-8000-00000000D006', StartedAt: NOW }];
    await expect(h.engine.trainModel({ pipelineId: h.pipeline.ID, SingleFlight: true }, h.deps)).rejects.toBeInstanceOf(TrainingInFlightError);
    expect([h.runs.map((r) => r.SaveCallCount), provider.Log]).toEqual([[0], ['begin', 'query Predictive Studio: Lock Pipeline For Publish', 'query Predictive Studio: Running Training Run', 'rollback']]);
  });
});
