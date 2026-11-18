/**
 * Score Record Set on `ScoringService` (Task M5.6): with a `bindingId` the operation scores through the binding and
 * writes `Source = 'Model'` Feature Values; without one it predicts and writes nothing; a refusal or a failed run comes
 * back as `Success = false` with its code, the refusal in plain words and the scoring run's ID. A bound `'ML Model'`
 * Record Process writes one scoring run per batch and fails its Process Run when a batch fails.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import type { MJMLModelScoringBindingEntity } from '@memberjunction/core-entities';
import { RecordSetProcessor } from '@memberjunction/record-set-processor';
import { ArraySource, type IProcessRunTracker, type ProcessRunSummary, type RecordRef, type RecordResult, type RunHandle } from '@memberjunction/record-set-processor-base';
import { UUIDsEqual } from '@memberjunction/global';
import type { IMetadataProvider } from '@memberjunction/core';

import { PredictiveStudioScoreRecordSetServerOperation } from '../../operations/score-record-set.operation';
import { ProductionScoreRecordSetRunner } from '../score-record-set.runner';
import type { IScoreRecordSetRunner } from '../score-record-set.action';
import { BOUND_SCORING_BATCH_CONCURRENCY, MLModelInferenceProcessor } from '../../scoring/ml-model-inference-processor';
import { CapturingContext } from '../../operations/__tests__/helpers';
import { BATCH, MEMBERSHIPS, MEMBERSHIPS_ID, ScoringServiceWorld, type WorldModelRef } from '../../__tests__/fakes/scoring-service-world';
import type { GateTestProvider, Row } from '../../__tests__/fakes/gate-test-store';
import { ConsoleCapture } from '../../__tests__/fakes/console-capture';

/** The operation with the world's seams behind its runner. */
class WorldScoreOp extends PredictiveStudioScoreRecordSetServerOperation {
  constructor(private readonly world: ScoringServiceWorld) {
    super();
  }
  protected override runner(): IScoreRecordSetRunner {
    return new ProductionScoreRecordSetRunner({ seams: this.world.Ctx().Seams });
  }
}

/** A tracker that keeps the run's ID, its final summary and every record result. */
class RecordingTracker implements IProcessRunTracker {
  public readonly ProcessRunID = 'A0000000-0000-4000-8000-0000000007A1';
  public Summary: ProcessRunSummary | null = null;
  public readonly Results: RecordResult[] = [];
  public async BeginRun(): Promise<RunHandle> {
    return { ProcessRunID: this.ProcessRunID };
  }
  public async RecordResult(_h: RunHandle, _r: RecordRef, result: RecordResult): Promise<void> {
    this.Results.push(result);
  }
  public async Checkpoint(): Promise<boolean> {
    return true;
  }
  public async CompleteRun(_h: RunHandle, summary: ProcessRunSummary): Promise<void> {
    this.Summary = summary;
  }
  public async LoadResumeCursor(): Promise<undefined> {
    return undefined;
  }
}

const RECORD_PROCESS_ID = 'A0000000-0000-4000-8000-0000000007B1';

/**
 * Lets the world's provider make independent instances (a database provider does; the fake's base does not): each
 * one a distinct object over the same store. Returns the instances made and how many were released.
 */
function allowIndependentInstances(): { readonly Made: IMetadataProvider[]; Released: number } {
  const provider = world.Provider as GateTestProvider;
  const out: { Made: IMetadataProvider[]; Released: number } = { Made: [], Released: 0 };
  provider.CreateIndependentInstance = async () => {
    const instance: GateTestProvider = Object.create(provider);
    instance.ReleaseIndependentInstance = async () => { out.Released++; };
    out.Made.push(instance);
    return instance;
  };
  return out;
}

let world: ScoringServiceWorld;
let op: WorldScoreOp;
let context: CapturingContext;

beforeEach(() => {
  world = new ScoringServiceWorld();
  op = new WorldScoreOp(world);
  context = new CapturingContext(world.Provider, ScoringServiceWorld.User);
});

/** The newest scoring run row. */
function lastRun(): Row {
  const runs = world.Runs();
  return runs[runs.length - 1];
}

/** The model's pipeline scores Memberships (the entity a records scope without a binding is read against). */
function scoresMemberships(model: WorldModelRef): void {
  Object.assign(world.Store.Row('MJ: ML Training Pipelines', model.PipelineID) || {}, { TargetEntityID: MEMBERSHIPS_ID, TargetEntity: MEMBERSHIPS });
}

/** Runs a bound Record Process over the records through Record Set Processing, `BATCH` records per batch. */
async function runBoundProcess(binding: MJMLModelScoringBindingEntity, model: WorldModelRef, ids: readonly string[]): Promise<{ Status: string; ID: string }> {
  const tracker = await runBoundProcessTracked(binding, model, ids);
  return { Status: tracker.Summary?.Status || '', ID: tracker.ProcessRunID };
}

/** The same run, returning its tracker (the run summary and every record result). */
async function runBoundProcessTracked(binding: MJMLModelScoringBindingEntity, model: WorldModelRef, ids: readonly string[]): Promise<RecordingTracker> {
  const processor = new MLModelInferenceProcessor({
    modelId: model.ID, deps: { modelLoader: { loadModel: async () => null }, sidecar: world.Sidecar, artifactLoader: world.Artifacts },
    recordProcessId: binding.RecordProcessID || undefined, scoringSeams: world.Ctx().Seams,
  });
  const tracker = new RecordingTracker();
  const records: RecordRef[] = ids.map((id) => ({ EntityID: MEMBERSHIPS_ID, RecordID: id }));
  await RecordSetProcessor.Instance.Process({
    Source: new ArraySource(records, MEMBERSHIPS_ID), Processor: processor, Tracker: tracker, ContextUser: ScoringServiceWorld.User, Provider: world.Provider,
    RecordProcessID: RECORD_PROCESS_ID, EntityID: MEMBERSHIPS_ID, BatchSize: BATCH, ErrorThresholdPercent: 100,
  });
  return tracker;
}

describe('Score Record Set on ScoringService', () => {
  it('with a BindingID it writes Model Feature Values and returns the run id', async () => {
    const published = world.Model();
    const binding = await world.Binding(published);
    const out = await op.ExecuteServer({ modelId: published.ID, bindingId: binding.ID, scope: { records: ['r1', 'r2'] } }, context);
    expect(out).toMatchObject({ Success: true, Output: { status: 'completed', written: 2, scoringRunId: expect.any(String) } });
    expect(world.Values.Store().map((r) => r['RecordID'])).toEqual(['r1', 'r2']);
    expect(UUIDsEqual(out.Output?.scoringRunId || '', String(lastRun()['ID']))).toBe(true);
    expect(lastRun()).toMatchObject({ Status: 'completed', Written: 2, Path: 'score-record-set' });
  });

  it('without a BindingID it writes nothing and returns bare record ids', async () => {
    const published = world.Model();
    scoresMemberships(published);
    const out = await op.ExecuteServer({ modelId: published.ID, scope: { records: ['ID|r1', { ID: 'r2' }] } }, context);
    expect([out.Output?.status, out.Output?.predictions?.[0].recordId, out.Output?.predictions?.[1].recordId, world.Values.Calls().length]).toEqual(['completed', 'r1', 'r2', 0]);
    expect(out.Output?.written).toBe(0);
    expect(lastRun()).toMatchObject({ Status: 'completed', MLModelScoringBindingID: null });
  });

  it('a refusal returns Success = false with the refusal and a refused run row', async () => {
    const draft = world.Model({ Status: 'Draft' });
    scoresMemberships(draft);
    const out = await op.ExecuteServer({ modelId: draft.ID, scope: { records: ['r1'] } }, context);
    expect(out).toMatchObject({ Success: false, ResultCode: 'MODEL_NOT_PUBLISHED' });
    expect(out.Output).toBeUndefined();
    expect(out.ErrorMessage).toContain(String(lastRun()['ID']));
    expect(lastRun()).toMatchObject({ Status: 'refused', Written: 0 });
  });

  it('a renamed feature column is refused naming it', async () => {
    const r1 = world.Model({ RenamedColumn: 'Visits', Unit: null });
    const r1Binding = await world.Binding(r1);
    const out = await op.ExecuteServer({ modelId: r1.ID, bindingId: r1Binding.ID, scope: { records: ['r1'] } }, context);
    expect(out).toMatchObject({ Success: false, ResultCode: 'FEATURE_SCHEMA_MISMATCH' });
    expect(out.ErrorMessage).toContain('Visits');
    expect(JSON.parse(String(lastRun()['Refusal'] || '{}'))).toMatchObject({ kind: 'feature-schema-mismatch', missingColumns: ['Visits'] });
    expect(world.Values.Calls()).toHaveLength(0);
  });

  it('a model that is not of the binding\'s pipeline is refused as invalid input before any run row', async () => {
    const published = world.Model();
    const other = world.Model();
    const binding = await world.Binding(published);
    const out = await op.ExecuteServer({ modelId: other.ID, bindingId: binding.ID, scope: { records: ['r1'] } }, context);
    expect(out).toMatchObject({ Success: false, ResultCode: 'INVALID_INPUT' });
    expect(world.Runs()).toHaveLength(0);
  });

  it('a failed run returns SCORING_RUN_FAILED with its counts, and the batches before it stay', async () => {
    const published = world.Model();
    const binding = await world.Binding(published);
    world.Sidecar.FailBatch(2);
    const out = await op.ExecuteServer({ modelId: published.ID, bindingId: binding.ID, scope: { records: ['m1', 'm2', 'm3', 'm4'] } }, context);
    expect(out).toMatchObject({ Success: false, ResultCode: 'SCORING_RUN_FAILED' });
    expect(out.ErrorMessage).toContain(String(lastRun()['ID']));
    expect(lastRun()).toMatchObject({ Status: 'failed', Written: 3, Failed: 1 });
  });

  it('a bound Record Process writes one run row per batch and fails the Process Run when a batch fails; batches already in flight finish', async () => {
    allowIndependentInstances();
    const published = world.Model();
    const binding = await world.Binding(published, { RecordProcessID: RECORD_PROCESS_ID });
    world.Sidecar.FailBatch(2);
    const run = await runBoundProcess(binding, published, Array.from({ length: 3 * BATCH }, (_, i) => `m${i + 1}`));
    // The three batches run at once (one wave of up to BOUND_SCORING_BATCH_CONCURRENCY): the failing one writes nothing,
    // the two beside it finish and keep their rows, and the run ends Failed.
    expect([run.Status, world.Runs().map((r) => String(r['Status'])).sort()]).toEqual(['Failed', ['completed', 'completed', 'failed']]);
    expect(world.Runs().every((r) => UUIDsEqual(String(r['ProcessRunID']), run.ID))).toBe(true);
    expect(world.Runs().every((r) => r['Path'] === 'record-process')).toBe(true);
    expect(world.Values.Store()).toHaveLength(2 * BATCH);
  });

  it('after a failed batch no later batch is started: the next waves are not scored, and their records fail naming the stopping run', async () => {
    allowIndependentInstances();
    const published = world.Model();
    const binding = await world.Binding(published, { RecordProcessID: RECORD_PROCESS_ID });
    world.Sidecar.FailBatch(2);
    const tracker = await runBoundProcessTracked(binding, published, Array.from({ length: 9 * BATCH }, (_, i) => `m${i + 1}`));
    const failedRun = world.Runs().find((r) => r['Status'] === 'failed');
    expect([tracker.Summary?.Status, world.Runs().map((r) => String(r['Status'])).sort()]).toEqual(['Failed', ['completed', 'completed', 'completed', 'failed']]);
    expect(world.Values.Store()).toHaveLength(3 * BATCH);
    const notScored = tracker.Results.filter((r) => r.Status === 'Failed' && String(r.ErrorMessage).startsWith('Not scored'));
    expect(notScored).toHaveLength(5 * BATCH);
    expect(notScored.every((r) => String(r.ErrorMessage).includes(String(failedRun?.['ID'])))).toBe(true);
    expect([tracker.Summary?.Success, tracker.Summary?.Error]).toEqual([3 * BATCH, 6 * BATCH]);
  });

  it('a bound Record Process never has more than BOUND_SCORING_BATCH_CONCURRENCY batches scoring at once, and runs more than one', async () => {
    allowIndependentInstances();
    const published = world.Model();
    const binding = await world.Binding(published, { RecordProcessID: RECORD_PROCESS_ID });
    let inFlight = 0;
    let peak = 0;
    const predict = world.Sidecar.predict.bind(world.Sidecar);
    world.Sidecar.predict = async (req) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      try { return await predict(req); } finally { inFlight--; }
    };
    const run = await runBoundProcess(binding, published, Array.from({ length: 10 * BATCH }, (_, i) => `m${i + 1}`));
    expect([run.Status, world.Runs().length, world.Values.Store().length]).toEqual(['Completed', 10, 10 * BATCH]);
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(BOUND_SCORING_BATCH_CONCURRENCY);
  });

  it('each bound batch runs and assembles on its own independent provider instance, released after it', async () => {
    const published = world.Model();
    const binding = await world.Binding(published, { RecordProcessID: RECORD_PROCESS_ID });
    const instances = allowIndependentInstances();
    const run = await runBoundProcess(binding, published, Array.from({ length: 3 * BATCH }, (_, i) => `m${i + 1}`));
    expect([run.Status, instances.Made.length, instances.Released]).toEqual(['Completed', 3, 3]);
    // The prepared model is memoised once per run; each batch's assembly still reads through that batch's own provider.
    expect(world.Runtime.AssemblyProviders).toHaveLength(3);
    expect(new Set(world.Runtime.AssemblyProviders).size).toBe(3);
    expect(world.Runtime.AssemblyProviders.every((p) => instances.Made.includes(p))).toBe(true);
  });

  it('a provider that cannot make independent instances scores one batch at a time (never shares one provider across concurrent transactions)', async () => {
    const published = world.Model();
    const binding = await world.Binding(published, { RecordProcessID: RECORD_PROCESS_ID });
    let inFlight = 0;
    let peak = 0;
    const predict = world.Sidecar.predict.bind(world.Sidecar);
    world.Sidecar.predict = async (req) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      try { return await predict(req); } finally { inFlight--; }
    };
    const run = await runBoundProcess(binding, published, Array.from({ length: 6 * BATCH }, (_, i) => `m${i + 1}`));
    expect([run.Status, world.Runs().length, peak]).toEqual(['Completed', 6, 1]);
  });

  it('a bound Record Process prepares its model once for the whole run, not once per batch', async () => {
    const published = world.Model();
    const binding = await world.Binding(published, { RecordProcessID: RECORD_PROCESS_ID });
    let prepares = 0;
    const prepare = world.Runtime.Prepare.bind(world.Runtime);
    world.Runtime.Prepare = async (model, bytes) => { prepares++; return prepare(model, bytes); };
    const run = await runBoundProcess(binding, published, Array.from({ length: 3 * BATCH }, (_, i) => `m${i + 1}`));
    expect([run.Status, world.Runs().map((r) => r['Status']), prepares]).toEqual(['Completed', ['completed', 'completed', 'completed'], 1]);
  });

  it('a bound Record Process whose binding was withdrawn refuses the run with one refused run row and no record scored', async () => {
    const published = world.Model();
    const binding = await world.Binding(published, { RecordProcessID: RECORD_PROCESS_ID, Status: 'Withdrawn' });
    const errors = ConsoleCapture.Errors();
    const run = await runBoundProcess(binding, published, ['m1', 'm2']);
    expect(run.Status).toBe('Failed');
    expect(ConsoleCapture.Lines(errors)).toEqual([expect.stringMatching(/RecordSetProcessor: run failed: Scoring refused: the scoring binding .* was withdrawn \(scoring run .*; refusal \{"kind":"binding-withdrawn"/)]);
    expect(world.Runs().map((r) => [r['Status'], JSON.parse(String(r['Refusal'] || '{}')).kind])).toEqual([['refused', 'binding-withdrawn']]);
    expect(world.Values.Store()).toHaveLength(0);
  });
});
