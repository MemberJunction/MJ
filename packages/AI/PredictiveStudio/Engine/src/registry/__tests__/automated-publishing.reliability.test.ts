/**
 * §5.7 reliable unattended publishing (Task M4b.4): one `describe` per row — R0, R1, R2, R3, R4 and R6 — each case
 * named by the row's Test column, over the `GateTestStore` world (its in-memory storage double and SQL Server's
 * publish-record constraints, emulated) and, for the sidecar case, the real sidecar client pointed at a port nothing
 * listens on. What runs for real: the lifecycle gate, `AutomatedPublisher`, `PublishNotifications`,
 * `PipelineAutoTrainer`, the single-flight claim (`TrainingClaims` with `PipelineClaimQueue`, through `WorldTrainer`)
 * and, in R3's sidecar case, `TrainingEngine` with `MJSidecarTrainer`. Stubbed: the trainer's answers (the world's
 * canned results), the database (the fake provider) and the scoring Action sync (recorded).
 *
 * R6's refusal of an update to a saved publish record is the server subclass's (`MJMLModelPublishRecordEntityServer`,
 * MJCoreEntitiesServer), proven on the real database in `automated-publishing.adversarial.db.test.ts`; here the gate
 * is shown never to update one.
 */
import net from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WellKnownUserSource, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { ResourceTypeEngine, type MJResourceTypeEntity } from '@memberjunction/core-entities';
import type { Actor } from '@memberjunction/predictive-studio-core';
import { MLSidecar } from '@memberjunction/predictive-studio-sidecar';

import { ConsoleCapture } from '../../__tests__/fakes/console-capture';
import { FakeClock, GateTestStore, GateWorld, type Row, type WorldModel } from '../../__tests__/fakes/gate-test-store';
import { RecordingScoringActions } from '../../__tests__/fakes/scoring-action-fakes';
import { MemoryStorageAccount, ProviderRow, RegisterMemoryStorage, ServeStorageProviders } from '../../__tests__/fakes/storage-fakes';
import { TrainingHarness } from '../../__tests__/fakes/training-fakes';
import { UnitYearsWorld } from '../../__tests__/fakes/unit-years-world';
import { WorldTrainer } from '../../__tests__/fakes/world-trainer';
import { CapturingContext } from '../../operations/__tests__/helpers';
import { PredictiveStudioPromoteModelServerOperation } from '../../operations/promote-model.operation';
import { PipelineAutoTrainer, type AutoTrainedRun } from '../../scoring/auto-train';
import { StorageProviderArtifactLoader } from '../../scoring/storage-provider-artifact-loader';
import type { AutoTrainRequest } from '../../scoring/types';
import { MJSidecarTrainer } from '../../training/seams';
import { AutomatedPublisher } from '../automated-publisher';
import type { EvaluateOutcome, GateContext, PublishOutcome, PublishRequest } from '../gate-context';
import { GateRefusals } from '../gate-refusals';
import { GateContexts } from '../gate-seams';
import { LifecycleGate } from '../lifecycle-gate';
import { PublishNotifications } from '../publish-notifications';

const PUBLISH_RECORDS = 'MJ: ML Model Publish Records';

/** The clock the auto-trainer reads (the retry window, the claim's stale threshold, the notification day). */
class TestClock {
  constructor(private ms: number) {}
  /** The current instant. */
  public Now(): Date {
    return new Date(this.ms);
  }
}

/**
 * Test double of the lifecycle gate: a publish that commits, after which the job is killed (the process dies before
 * anything after the commit runs: the notification, the repoint). `Publish` runs the real gate, then throws.
 */
class KilledAfterCommitGate extends LifecycleGate {
  /** The applied publish's outcome, captured before the kill. */
  public Committed: PublishOutcome | null = null;

  /** @inheritdoc */
  public override async Publish(request: PublishRequest, ctx: GateContext): Promise<PublishOutcome> {
    this.Committed = await super.Publish(request, ctx);
    throw new Error('the auto-train job was killed after the publish committed');
  }
}

/**
 * The monitoring retrain path with a stub trigger (M6 wires the real one): a fired trigger trains the pipeline once (the
 * world's trainer) and publishes the run through `AutomatedPublisher.EvaluateAndPublish` as the scheduled job run.
 */
class StubRetrainTrigger {
  constructor(private readonly world: GateWorld, private readonly publisher: AutomatedPublisher) {}

  /** Fires for the job run: one training run, then the automated publish with `{ kind: 'scheduled-job', scheduledJobRunId }`. */
  public async Fire(scheduledJobRunId: string, ctx: GateContext): Promise<PublishOutcome | EvaluateOutcome> {
    const trained = this.world.TrainRun('6A1D2E3F-0000-4000-8000-00000000E001', 'model');
    return this.publisher.EvaluateAndPublish(trained.TrainingRunID, { kind: 'scheduled-job', scheduledJobRunId }, ctx);
  }
}

/** The Promote operation over the world's gate, its scoring-Action seam recorded (the UI's publish path). */
class WorldPromoteOperation extends PredictiveStudioPromoteModelServerOperation {
  /** @inheritdoc */
  protected override CreateLifecycleGate(): LifecycleGate {
    return new LifecycleGate(new StorageProviderArtifactLoader(), new FakeClock(), new RecordingScoringActions());
  }
}

const account = new MemoryStorageAccount('reliability', []);
RegisterMemoryStorage('PS Reliability Test Storage', account);
const providerRow = ProviderRow(GateWorld.StorageProviderID, 'Reliability Test Storage', 'PS Reliability Test Storage', true);
/** While `Down` is set the store is unreachable: every artifact load throws (a transient refusal). */
const storage = {
  set Down(message: string | null) {
    account.PutError = message;
    account.Configured = message === null;
  },
};

let store: GateTestStore;
let world: GateWorld;
let clock: TestClock;
let worldTrainer: WorldTrainer;
let provider: IMetadataProvider;
let user: UserInfo;
let ctx: GateContext;
let recordProcess: { readonly ID: string };
let processRun: { readonly ID: string };
let request: AutoTrainRequest;
let status: ReturnType<typeof ConsoleCapture.Status>;

/** A gate over the world's storage, a fake clock and a recorded scoring-Action sync. */
function worldGate(): LifecycleGate {
  return new LifecycleGate(new StorageProviderArtifactLoader(), new FakeClock(), new RecordingScoringActions());
}

/** An auto-trainer over `gate`, the world's trainer and the test clock. */
function autoTrainer(gate: LifecycleGate = worldGate(), train: (pipelineId: string, p: IMetadataProvider, u: UserInfo) => Promise<AutoTrainedRun> = worldTrainer.Train): PipelineAutoTrainer {
  return new PipelineAutoTrainer({ gate, train, now: () => clock.Now() });
}

/** The world's publish records, every model and run. */
function allRecords(): Row[] {
  return store.Tables[PUBLISH_RECORDS] || [];
}

/** The `Kind` of each notification `userId` received (the `Kind` of its dedupe key), in order. */
function notificationKinds(userId: string): string[] {
  return store.Notifications(userId).map((n) => String(GateTestStore.JsonObjectColumn(n, 'ResourceConfiguration')['Kind']));
}

/** The saves of the model row, in order (one per status write). */
function modelSaves(modelId: string): string[] {
  return store.Saves.filter((s) => s === `MJ: ML Models ${modelId}`);
}

/** The `Initiator` kind each `publish` record of the model names. */
function publishInitiatorKinds(modelId: string): string[] {
  return store.PublishRecords(modelId).filter((r) => r['Kind'] === 'publish').map((r) => String(GateTestStore.JsonObjectColumn(r, 'Initiator')['kind']));
}

/** The `ID` of the pipeline's only training run (throws when there is not exactly one). */
function onlyRunId(): string {
  const runs = store.TrainingRuns(GateWorld.PipelineID);
  if (runs.length !== 1) throw new Error(`expected one training run, found ${runs.length}`);
  return String(runs[0]['ID']);
}

/** A port on this host that nothing listens on: an ephemeral port bound, then released. */
async function closedPort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  if (address === null || typeof address === 'string') throw new Error('no TCP address was bound');
  return address.port;
}

beforeEach(async () => {
  account.Reset();
  ServeStorageProviders([providerRow]);
  store = new GateTestStore();
  world = new GateWorld(store, account);
  clock = new TestClock(Date.UTC(2026, 10, 16, 12, 0, 0));
  worldTrainer = new WorldTrainer(world, () => clock.Now());
  provider = store.Provider();
  user = GateWorld.User;
  ctx = GateContexts.ForRequest({ ContextUser: user, Provider: provider });
  recordProcess = world.RecordProcess();
  processRun = world.ProcessRun(user.ID, recordProcess.ID);
  request = { pipelineId: GateWorld.PipelineID, currentModelId: null, recordProcessId: recordProcess.ID, processRunId: processRun.ID };
  const recordsType = await provider.GetEntityObject<MJResourceTypeEntity>('MJ: Resource Types', user);
  recordsType.ID = '6A1D2E3F-0000-4000-8000-00000000C004';
  vi.spyOn(ResourceTypeEngine.Instance, 'Config').mockResolvedValue(undefined);
  vi.spyOn(ResourceTypeEngine.Instance, 'ByName').mockImplementation((name: string) => (name === 'Records' ? recordsType : undefined));
  vi.spyOn(WellKnownUserSource.Instance, 'GetSystemUser').mockResolvedValue(GateWorld.SystemUser);
  status = ConsoleCapture.Status();
});
afterEach(() => {
  storage.Down = null;
});

describe('R0 one publish function (runtime: the Initiator each publisher records)', () => {
  it('the UI op records a human initiator', async () => {
    const validated = world.Model('Validated', 'model');
    const out = await new WorldPromoteOperation().ExecuteServer({ modelId: validated.ID, transition: 'publish' }, new CapturingContext(provider, user));
    expect([out.Success, publishInitiatorKinds(validated.ID)]).toEqual([true, ['human']]);
  });
  it('the agent\'s publish step (AutomatedPublisher with the agent run) records an agent initiator', async () => {
    const draft = world.Model('Draft', 'model');
    const agentRun = world.AgentRun(user.ID);
    const out = await new AutomatedPublisher(worldGate()).EvaluateAndPublish(draft.RunID, { kind: 'agent', agentRunId: agentRun.ID }, ctx);
    expect([out.Kind, publishInitiatorKinds(draft.ID)]).toEqual(['published', ['agent']]);
  });
  it('auto-train records a system initiator naming its Process Run', async () => {
    const modelId = await autoTrainer().EnsureTrainedModel(request, user, provider);
    const [record] = store.PublishRecords(modelId);
    expect(GateTestStore.JsonObjectColumn(record, 'Initiator')).toEqual({ kind: 'system', component: 'auto-train', processRunId: processRun.ID });
  });
  it('monitoring (a stub trigger) records a scheduled-job initiator', async () => {
    const jobRun = world.ScheduledJobRun(user.ID);
    const out = await new StubRetrainTrigger(world, new AutomatedPublisher(worldGate())).Fire(jobRun.ID, ctx);
    if (out.Kind !== 'published') throw new Error(`the retrain was not published: ${out.Kind}`);
    expect(publishInitiatorKinds(out.ModelID)).toEqual(['scheduled-job']);
  });
});

describe('the monitoring retrain entry point (stub trigger; M6 wires the real one)', () => {
  it('EvaluateAndPublish with { kind: scheduled-job, scheduledJobRunId } publishes and notifies the job run\'s owner (D4-18)', async () => {
    const owner = store.UserWithPermissions({});
    const jobRun = world.ScheduledJobRun(owner.ID);
    const publisher = new AutomatedPublisher(worldGate(), new PublishNotifications());
    const out = await new StubRetrainTrigger(world, publisher).Fire(jobRun.ID, ctx);
    expect(out).toMatchObject({ Kind: 'published', Purpose: 'publish', Approver: 'automated-gate' });
    expect([notificationKinds(owner.ID), notificationKinds(user.ID)]).toEqual([['published'], []]);
  });
});

describe('R1 idempotency, keyed by training run', () => {
  it('call Publish twice for one run → 1 publish record, 1 status change, second outcome already-published', async () => {
    const validated = world.Model('Validated', 'model');
    const publish: PublishRequest = { modelId: validated.ID, purpose: 'publish', initiator: PipelineAutoTrainer.InitiatorOf(request), signOffId: null, reason: null };
    const gate = worldGate();
    const first = await gate.Publish(publish, ctx);
    const second = await gate.Publish(publish, ctx);
    expect([first.Kind, second.Kind]).toEqual(['published', 'already-published']);
    expect(second).toMatchObject({ ModelID: validated.ID, PublishRecordID: first.Kind === 'published' ? first.PublishRecordID : '' });
    expect([store.PublishRecords(validated.ID).length, modelSaves(validated.ID).length, store.Status(validated.ID)]).toEqual([1, 1, 'Published']);
  });

  it('kill the auto-train job after commit and rerun → 0 new training runs, 0 new publish records', async () => {
    const killed = new KilledAfterCommitGate(new StorageProviderArtifactLoader(), new FakeClock(), new RecordingScoringActions());
    await expect(autoTrainer(killed).EnsureTrainedModel(request, user, provider)).rejects.toThrow('the auto-train job was killed after the publish committed');
    const committed = killed.Committed;
    if (committed === null || committed.Kind !== 'published') throw new Error('the killed run did not commit a publish');
    const [runsBefore, recordsBefore] = [store.TrainingRuns(GateWorld.PipelineID).length, allRecords().length];
    expect([runsBefore, recordsBefore, store.Status(committed.ModelID), store.RecordProcess(recordProcess.ID).Configuration]).toEqual([
      1, 1, 'Published', JSON.stringify({ autoTrain: { pipelineId: GateWorld.PipelineID } }),
    ]);
    const served = await autoTrainer().EnsureTrainedModel(request, user, provider);
    expect([served, store.TrainingRuns(GateWorld.PipelineID).length - runsBefore, allRecords().length - recordsBefore, worldTrainer.Trainings]).toEqual([committed.ModelID, 0, 0, 1]);
    expect(store.RecordProcess(recordProcess.ID).Configuration).toContain(`"modelId":"${committed.ModelID}"`);
  });

  it('a retried automated publish of the run after the commit writes nothing new (already published: no record, no notification)', async () => {
    const draft = world.Model('Draft', 'model');
    const publisher = new AutomatedPublisher(worldGate());
    const initiator: Actor = PipelineAutoTrainer.InitiatorOf(request);
    expect(await publisher.EvaluateAndPublish(draft.RunID, initiator, ctx)).toMatchObject({ Kind: 'published' });
    const [records, notifications] = [allRecords().length, store.Notifications(user.ID).length];
    expect(await publisher.EvaluateAndPublish(draft.RunID, initiator, ctx)).toEqual({ Kind: 'refused', Refusal: { kind: 'illegal-transition', from: 'published', to: 'validated' } });
    expect([allRecords().length - records, store.Notifications(user.ID).length - notifications]).toEqual([0, 0]);
  });

  it('transient refusal then rerun → same model published, 1 new training run total', async () => {
    storage.Down = 'connection reset';
    await expect(autoTrainer().EnsureTrainedModel(request, user, provider)).rejects.toThrow('publish withheld');
    const runId = onlyRunId();
    const modelId = String(store.Row('MJ: ML Training Runs', runId)?.['ResultingModelID']);
    storage.Down = null;
    const served = await autoTrainer().EnsureTrainedModel(request, user, provider);
    expect([served, store.TrainingRuns(GateWorld.PipelineID).length, store.PublishRecords(modelId).map((r) => [r['Kind'], r['Kind'] === 'refusal' ? r['Transient'] : null])]).toEqual([
      modelId, 1, [['refusal', true], ['publish', null]],
    ]);
  });
});

describe('R2 concurrency', () => {
  it('two auto-train Process Runs started together → 1 training run', async () => {
    const trainer = autoTrainer();
    const second = world.ProcessRun(user.ID, recordProcess.ID);
    const [a, b] = await Promise.allSettled([trainer.EnsureTrainedModel(request, user, provider), trainer.EnsureTrainedModel({ ...request, processRunId: second.ID }, user, provider)]);
    const runId = onlyRunId();
    const loser = [a, b].find((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect([[a.status, b.status].sort(), worldTrainer.Trainings]).toEqual([['fulfilled', 'rejected'], 1]);
    expect(String(loser === undefined ? '' : loser.reason)).toContain(`is already being trained by run ${runId}`);
    expect(store.Reads.filter((r) => r === 'query Predictive Studio: Running Training Run')).toHaveLength(2);
  });
});

describe('R3 no partial publish', () => {
  it('storage throws during ArtifactLoad → status unchanged, 0 publish records, 1 refusal (transient)', async () => {
    const validated = world.Model('Validated', 'model');
    storage.Down = 'connection reset';
    const out = await worldGate().Publish({ modelId: validated.ID, purpose: 'publish', initiator: PipelineAutoTrainer.InitiatorOf(request), signOffId: null, reason: null }, ctx);
    expect(out).toMatchObject({ Kind: 'withheld', Refusal: { kind: 'artifact-unverifiable' }, Transient: true });
    expect([store.Status(validated.ID), store.PublishRecords(validated.ID).map((r) => [r['Kind'], r['Transient']])]).toEqual(['Validated', [['refusal', true]]]);
  });

  it('the transaction aborted after the archive of replaces → incumbent still Published, new model still Validated, 0 publish records', async () => {
    const incumbent = world.Model('Published', 'model');
    const candidate = world.Model('Validated', 'model', { IncumbentID: incumbent.ID });
    store.FailNext(PUBLISH_RECORDS, 'the transaction was aborted');
    const errors = ConsoleCapture.Errors();
    const attempt = worldGate().Publish({ modelId: candidate.ID, purpose: 'publish', initiator: PipelineAutoTrainer.InitiatorOf(request), signOffId: null, reason: null }, ctx);
    await expect(attempt).rejects.toThrow(`Saving the publish record of ML Model ${candidate.ID} for training run ${candidate.RunID} failed: the transaction was aborted`);
    expect(store.Saves.slice(0, 2)).toEqual([`MJ: ML Models ${incumbent.ID}`, `MJ: ML Models ${candidate.ID}`]);   // the archive ran first
    expect([store.Status(incumbent.ID), store.Status(candidate.ID), allRecords().filter((r) => r['Kind'] === 'publish').length]).toEqual(['Published', 'Validated', 0]);
    expect([store.Transactions, ConsoleCapture.Lines(errors)]).toEqual([['begin', 'rollback'], []]);
  });

  it('sidecar stopped during auto-train → training run Failed, 0 publish records, Process Run message names the sidecar', async () => {
    const harness = TrainingHarness.ForUnit(UnitYearsWorld.Years(), UnitYearsWorld.UnitColumns());
    const sidecar = new MLSidecar({ url: `http://127.0.0.1:${await closedPort()}`, startupTimeoutMs: 150 });
    harness.deps.trainer = new MJSidecarTrainer(sidecar);
    const train = async (): Promise<AutoTrainedRun> => {
      const r = await harness.engine.trainModel({ pipelineId: harness.pipeline.ID }, harness.deps);
      return { TrainingRunID: r.run.ID, ModelID: r.model === null ? null : r.model.ID };
    };
    await expect(autoTrainer(worldGate(), train).EnsureTrainedModel(request, user, provider)).rejects.toThrow(/predictive-studio-sidecar did not become ready within 150ms/);
    expect([harness.runs.map((r) => r.Status), harness.models.length, allRecords().length]).toEqual([['Failed'], 0, 0]);
  });

  it('repoint failure → next run repoints with 0 trainings', async () => {
    store.FailNext('MJ: Record Processes', 'the Record Process row is locked');
    await expect(autoTrainer().EnsureTrainedModel(request, user, provider)).rejects.toThrow(`Auto-train: failed to repoint Record Process '${recordProcess.ID}': the Record Process row is locked`);
    const published = String(store.Row('MJ: ML Training Runs', onlyRunId())?.['ResultingModelID']);
    expect(store.Status(published)).toBe('Published');
    expect(await autoTrainer().EnsureTrainedModel(request, user, provider)).toBe(published);
    expect([worldTrainer.Trainings, store.RecordProcess(recordProcess.ID).Configuration]).toEqual([1, JSON.stringify({ autoTrain: { pipelineId: GateWorld.PipelineID }, modelId: published })]);
  });
});

describe('R4 refusals are recorded and surfaced', () => {
  it('a W2-noise auto-train run → 1 run-level gate-no-signal refusal for its TrainingRunID, Process Run Failed with the reason, 1 notification', async () => {
    worldTrainer.NextOutcome('no-signal');
    const attempt = autoTrainer().EnsureTrainedModel(request, user, provider);
    await expect(attempt).rejects.toThrow();
    const runId = onlyRunId();
    const [record, ...more] = store.PublishRecordsOfRun(runId);
    expect([more.length, record['Kind'], record['Purpose'], record['ModelID'], record['Transient'], GateTestStore.JsonObjectColumn(record, 'Refusal')['kind']]).toEqual([0, 'refusal', 'evaluate', null, false, 'gate-no-signal']);
    expect(GateTestStore.JsonObjectColumn(record, 'Initiator')).toEqual({ kind: 'system', component: 'auto-train', processRunId: processRun.ID });
    await expect(attempt).rejects.toThrow(PipelineAutoTrainer.RunWithheldMessage(runId, String(record['Reason'])));
    expect(notificationKinds(user.ID)).toEqual(['gate-no-signal']);
  });

  it('the same with a prior Published model → run Completed, scores carry the prior model\'s ID', async () => {
    const prior = store.AddModel(GateWorld.PipelineID, { Status: 'Published', ArtifactStatus: 'verified' });
    store.ReadLog.FailNext('MJ: ML Models');   // the reuse read fails once, so this run trains while a Published model exists
    worldTrainer.NextOutcome('no-signal');
    expect(await autoTrainer().EnsureTrainedModel(request, user, provider)).toBe(prior.ID);
    const runId = onlyRunId();
    expect(store.PublishRecordsOfRun(runId).map((r) => [r['Kind'], r['Purpose'], r['ModelID']])).toEqual([['refusal', 'evaluate', null]]);
    expect([store.RecordProcess(recordProcess.ID).Configuration, notificationKinds(user.ID)]).toEqual([JSON.stringify({ autoTrain: { pipelineId: GateWorld.PipelineID }, modelId: prior.ID }), ['gate-no-signal']]);
    expect(ConsoleCapture.Lines(status).some((l) => l.endsWith(`The pipeline's Published model '${prior.ID}' keeps serving.`))).toBe(true);
  });

  it('a KeepBaseline model with StatusReason → model-level keep-baseline-not-auto-published refusal, Process Run Failed, 1 notification', async () => {
    worldTrainer.NextOutcome('keep');
    const attempt = autoTrainer().EnsureTrainedModel(request, user, provider);
    await expect(attempt).rejects.toThrow(/^Auto-train trained model [0-9A-F-]{36} v1; publish withheld: /);
    const runId = onlyRunId();
    const modelId = String(store.Row('MJ: ML Training Runs', runId)?.['ResultingModelID']);
    expect(store.PublishRecordsOfRun(runId).map((r) => [r['Kind'], r['Purpose'], r['ModelID'], GateTestStore.JsonObjectColumn(r, 'Refusal')['kind']])).toEqual([
      ['refusal', 'publish', modelId, 'keep-baseline-not-auto-published'],
    ]);
    expect([store.Status(modelId), store.StatusReason(modelId), notificationKinds(user.ID)]).toEqual([
      'KeepBaseline', `Automatic publish withheld: ${GateRefusals.Describe({ kind: 'keep-baseline-not-auto-published' })}`, ['keep-baseline-not-auto-published'],
    ]);
  });

  it('an automatic attempt stopped at Evaluate (calibration-held) records the model-level refusal, Purpose publish (D4-143)', async () => {
    const held: (pipelineId: string, p: IMetadataProvider, u: UserInfo) => Promise<AutoTrainedRun> = async (pipelineId, p, u) => {
      const trained = await worldTrainer.Train(pipelineId, p, u);
      const row = trained.ModelID === null ? undefined : store.Row('MJ: ML Models', trained.ModelID);
      if (row === undefined) throw new Error('the held run shipped no model');
      row['Lineage'] = JSON.stringify({ calibrationHold: { slope: 0.5 } });
      return trained;
    };
    await expect(autoTrainer(worldGate(), held).EnsureTrainedModel(request, user, provider)).rejects.toThrow(/; publish withheld: /);
    const runId = onlyRunId();
    const modelId = String(store.Row('MJ: ML Training Runs', runId)?.['ResultingModelID']);
    expect(store.PublishRecordsOfRun(runId).map((r) => [r['Kind'], r['Purpose'], r['ModelID'], GateTestStore.JsonObjectColumn(r, 'Refusal')['kind']])).toEqual([
      ['refusal', 'publish', modelId, 'calibration-held'],
    ]);
    expect([store.Status(modelId), notificationKinds(user.ID)]).toEqual(['Draft', ['calibration-held']]);
  });
});

describe('R6 audit trail', () => {
  /**
   * The gate's side of R6: it only ever inserts publish records. A saved record's update is refused by
   * `MJMLModelPublishRecordEntityServer.Validate()` (MJCoreEntitiesServer), which the DB lane proves on SQL Server.
   */
  it('a refusal then a publish of one model, then a retry: every save of a publish record is an insert', async () => {
    const validated: WorldModel = world.Model('Validated', 'model');
    const publish: PublishRequest = { modelId: validated.ID, purpose: 'publish', initiator: PipelineAutoTrainer.InitiatorOf(request), signOffId: null, reason: null };
    const gate = worldGate();
    storage.Down = 'connection reset';
    expect(await gate.Publish(publish, ctx)).toMatchObject({ Kind: 'withheld', Transient: true });
    storage.Down = null;
    expect(await gate.Publish(publish, ctx)).toMatchObject({ Kind: 'published' });
    expect(await gate.Publish(publish, ctx)).toMatchObject({ Kind: 'already-published' });
    const saved = store.Saves.filter((s) => s.startsWith(`${PUBLISH_RECORDS} `)).map((s) => s.slice(PUBLISH_RECORDS.length + 1));
    expect([saved.length, new Set(saved).size, saved]).toEqual([2, 2, store.PublishRecords(validated.ID).map((r) => String(r['ID']))]);
  });
});
