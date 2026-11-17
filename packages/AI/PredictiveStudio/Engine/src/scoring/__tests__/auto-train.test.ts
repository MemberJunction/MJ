/**
 * `PipelineAutoTrainer` (Task M4b.2): auto-train through `AutomatedPublisher` over the `GateTestStore` world — the real
 * lifecycle gate, the real single-flight claim (`TrainingClaims`, through {@link WorldTrainer}), real notifications. The
 * plan's seven cases are verbatim; M2's two reuse cases are kept; the cases after them are this task's additions.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseProviderStub } from '@memberjunction/unit-testing';
import { UserInfo, WellKnownUserSource, type IMetadataProvider, type RunViewParams } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { JsonParse } from '@memberjunction/predictive-studio-core';
import { ResourceTypeEngine, type MJMLModelEntity, type MJMLTrainingRunEntity, type MJResourceTypeEntity } from '@memberjunction/core-entities';

import { PipelineAutoTrainer, type AutoTrainedRun } from '../auto-train';
import { InMemoryArtifactLoader } from '../artifact-loader';
import { ArtifactRegistry } from '../../registry/artifact-registry';
import { InMemoryArtifactStore } from '../../training/artifact-store';
import { SnapshotHash } from '../../snapshot/snapshot-hash';
import { ConsoleCapture } from '../../__tests__/fakes/console-capture';
import { FakeClock, GateTestStore, GateWorld, type EntityGrant, type WorldModel } from '../../__tests__/fakes/gate-test-store';
import { RecordingScoringActions } from '../../__tests__/fakes/scoring-action-fakes';
import { MemoryStorageAccount, ProviderRow, RegisterMemoryStorage, ServeStorageProviders } from '../../__tests__/fakes/storage-fakes';
import { WorldTrainer } from '../../__tests__/fakes/world-trainer';
import { TrainingDelegation } from '../../operations/delegation';
import { AutomatedPublisher } from '../../registry/automated-publisher';
import { GateRefusals } from '../../registry/gate-refusals';
import { LifecycleGate } from '../../registry/lifecycle-gate';
import type { GateContext, LockResult } from '../../registry/gate-context';
import { RunViewMLModelLoader } from '../seams';
import { StorageProviderArtifactLoader } from '../storage-provider-artifact-loader';
import type { AutoTrainRequest } from '../types';

// ---------------------------------------------------------------------------------------------- M2's reuse cases --

const PIPE = '8A1C44F3-938C-4E65-B6DE-D621BC4C3001';
const USER = new UserInfo(null, { ID: 'B7E0A2C4-0000-4000-8000-0000000000C1', Email: 'auto-train-tests@example.com', Type: 'User' });

type ReuseRow = Pick<MJMLModelEntity, 'ID' | 'ArtifactFileID' | 'ArtifactSha256' | 'Lineage'>;

/** The auto-trainer with its reuse lookup exposed. */
class ReuseProbe extends PipelineAutoTrainer {
  public Reusable(provider: IMetadataProvider): Promise<string | null> {
    return this.findReusableModel(PIPE, USER, provider);
  }
}

/** A provider whose only use is the reuse lookup: it answers with `rows` (newest first) and records the fields asked for. */
class ReuseProvider extends DatabaseProviderStub {
  constructor(rows: ReuseRow[], fieldsAsked: string[][]) {
    super();
    this.RunView = vi.fn().mockImplementation(async (params: RunViewParams) => {
      fieldsAsked.push(params.Fields || []);
      return { Success: true, Results: rows, RowCount: rows.length, TotalRowCount: rows.length, ExecutionTime: 0, ErrorMessage: '' };
    });
  }
}
const reuseProvider = (rows: ReuseRow[], fieldsAsked: string[][]): IMetadataProvider => new ReuseProvider(rows, fieldsAsked);

describe('PipelineAutoTrainer.findReusableModel loads through the artifact registry', () => {
  const bytes = new TextEncoder().encode('published model bytes');
  const sha = SnapshotHash.Sha256Hex(bytes);
  const tabular = JSON.stringify({ shippedMember: 'xgb', shippedDriver: 'xgboost' });

  it('does not reuse a published model whose artifact does not verify', async () => {
    const loader = new InMemoryArtifactLoader();
    // 'lost' has no object; 'swapped' holds the bytes of another model; 'pre-change' has no registered hash.
    loader.Set('file-swapped', new TextEncoder().encode('another model'));
    loader.Set('file-pre-change', bytes);
    const rows: ReuseRow[] = [
      { ID: 'lost', ArtifactFileID: 'file-lost', ArtifactSha256: sha, Lineage: tabular },
      { ID: 'swapped', ArtifactFileID: 'file-swapped', ArtifactSha256: sha, Lineage: tabular },
      { ID: 'pre-change', ArtifactFileID: 'file-pre-change', ArtifactSha256: null, Lineage: tabular },
    ];
    const fieldsAsked: string[][] = [];
    const probe = new ReuseProbe({ registry: new ArtifactRegistry(new InMemoryArtifactStore(), loader) });
    expect(await probe.Reusable(reuseProvider(rows, fieldsAsked))).toBeNull();
    expect(fieldsAsked).toEqual([['ID', 'ArtifactFileID', 'ArtifactSha256', 'Lineage']]);
  });

  it('reuses the newest published model whose artifact verifies', async () => {
    const loader = new InMemoryArtifactLoader();
    loader.Set('file-good', bytes);
    const rows: ReuseRow[] = [
      { ID: 'lost', ArtifactFileID: 'file-lost', ArtifactSha256: sha, Lineage: tabular },
      { ID: 'good', ArtifactFileID: 'file-good', ArtifactSha256: sha, Lineage: tabular },
    ];
    const probe = new ReuseProbe({ registry: new ArtifactRegistry(new InMemoryArtifactStore(), loader) });
    expect(await probe.Reusable(reuseProvider(rows, []))).toBe('good');
  });

  it('skips a newer Published model /predict does not serve and reuses the next loadable one', async () => {
    const rows: ReuseRow[] = [
      { ID: 'forecast-model', ArtifactFileID: 'file-forecast', ArtifactSha256: SnapshotHash.Sha256Hex(new TextEncoder().encode('series')), Lineage: JSON.stringify({ shippedMember: 'seasonalNaive', shippedDriver: 'seasonal-naive' }) },
      { ID: 'tabular-model', ArtifactFileID: 'file-tabular', ArtifactSha256: SnapshotHash.Sha256Hex(new TextEncoder().encode('tabular')), Lineage: JSON.stringify({ shippedMember: 'xgb', shippedDriver: 'xgboost' }) },
    ];
    const artifacts = new InMemoryArtifactLoader();
    artifacts.Set('file-forecast', new TextEncoder().encode('series'));
    artifacts.Set('file-tabular', new TextEncoder().encode('tabular'));
    expect(await new ReuseProbe({ registry: new ArtifactRegistry(new InMemoryArtifactStore(), artifacts) }).Reusable(reuseProvider(rows, []))).toBe('tabular-model');
  });
});

// ------------------------------------------------------------------------------------ the gate world (M4b.2) --

/** The clock the auto-trainer reads (the retry window, the claim's stale threshold, the notification day). */
class TestClock {
  constructor(private ms: number) {}
  /** The current instant. */
  public Now(): Date {
    return new Date(this.ms);
  }
  /** Moves the clock forward. */
  public Advance(by: { readonly hours?: number; readonly minutes?: number }): void {
    this.ms += (by.hours || 0) * 3_600_000 + (by.minutes || 0) * 60_000;
  }
}

const account = new MemoryStorageAccount('auto-train', []);
RegisterMemoryStorage('PS Auto Train Test Storage', account);
const providerRow = ProviderRow(GateWorld.StorageProviderID, 'Auto Train Test Storage', 'PS Auto Train Test Storage', true);
/** The plan's storage switch: while `PutError` is set the store is unreachable (every load throws: a transient refusal). */
const storage = {
  set PutError(message: string | null) {
    account.PutError = message;
    account.Configured = message === null;
  },
};

let store: GateTestStore;
let world: GateWorld;
let clock: TestClock;
let gateRecords: WorldTrainer;
let trainer: PipelineAutoTrainer;
let provider: IMetadataProvider;
let user: UserInfo;
let p: { readonly ID: string };
let rp: { readonly ID: string };
let processRun: { readonly ID: string };
let demoted: WorldModel;
let request: AutoTrainRequest;
let status: ReturnType<typeof ConsoleCapture.Status>;

/** The `modelId` the Record Process's stored Configuration names; null when it names none. */
function configuredModelId(recordProcessId: string): string | null {
  const parsed = JsonParse.ParseJsonText(store.RecordProcess(recordProcessId).Configuration, 'Configuration');
  return parsed.Ok && JsonParse.IsJsonObject(parsed.Value) ? JsonParse.JsonString(parsed.Value, 'modelId') : null;
}

/** An auto-trainer over the world's gate, trainer and clock, as `user` would run it. */
function autoTrainer(): PipelineAutoTrainer {
  const gate = new LifecycleGate(new StorageProviderArtifactLoader(), new FakeClock(), new RecordingScoringActions());
  return new PipelineAutoTrainer({ gate, train: gateRecords.Train, now: () => clock.Now() });
}

/** A gate whose pipeline/model locks are held by another session while `Held` is set: every lock is `publish-in-progress`. */
class HeldLockGate extends LifecycleGate {
  /** While true, the lock wait runs out (a transient refusal); false takes the locks as the real gate does. */
  public Held = true;
  protected override async LockPipelineAndModel(pipelineId: string, modelId: string, ctx: GateContext): Promise<LockResult> {
    return this.Held ? { Locked: false, Refusal: { kind: 'publish-in-progress' } } : super.LockPipelineAndModel(pipelineId, modelId, ctx);
  }
}

/** An auto-trainer whose train step changes each trained model's stored rows (`change`) before it is evaluated. */
function trainerWhoseModels(change: (modelId: string) => void): PipelineAutoTrainer {
  const gate = new LifecycleGate(new StorageProviderArtifactLoader(), new FakeClock(), new RecordingScoringActions());
  const train = async (pipelineId: string, trainProvider: IMetadataProvider, trainUser: UserInfo): Promise<AutoTrainedRun> => {
    const trained = await gateRecords.Train(pipelineId, trainProvider, trainUser);
    if (trained.ModelID !== null) change(trained.ModelID);
    return trained;
  };
  return new PipelineAutoTrainer({ gate, train, now: () => clock.Now() });
}

beforeEach(async () => {
  account.Reset();
  ServeStorageProviders([providerRow]);
  store = new GateTestStore();
  world = new GateWorld(store, account);
  clock = new TestClock(Date.now());
  gateRecords = new WorldTrainer(world, () => clock.Now());
  trainer = autoTrainer();
  provider = store.Provider();
  user = GateWorld.User;
  p = { ID: GateWorld.PipelineID };
  rp = world.RecordProcess();
  processRun = world.ProcessRun(user.ID, rp.ID);
  demoted = store.AddModel(p.ID, { Status: 'Archived', ArtifactStatus: 'verified' });
  request = { pipelineId: p.ID, currentModelId: null, recordProcessId: rp.ID, processRunId: processRun.ID };
  const recordsType = await store.Provider().GetEntityObject<MJResourceTypeEntity>('MJ: Resource Types', GateWorld.User);
  recordsType.ID = '6A1D2E3F-0000-4000-8000-00000000C004';
  vi.spyOn(ResourceTypeEngine.Instance, 'Config').mockResolvedValue(undefined);
  vi.spyOn(ResourceTypeEngine.Instance, 'ByName').mockImplementation((name: string) => (name === 'Records' ? recordsType : undefined));
  vi.spyOn(WellKnownUserSource.Instance, 'GetSystemUser').mockResolvedValue(GateWorld.SystemUser);
  status = ConsoleCapture.Status();
});
afterEach(() => {
  account.PutError = null;
  account.Configured = true;
});

describe('PipelineAutoTrainer.EnsureTrainedModel through the automated publisher (the plan\'s cases)', () => {
  it('trains, publishes automatically and repoints the process', async () => {
    const id = await trainer.EnsureTrainedModel({ pipelineId: p.ID, currentModelId: null, recordProcessId: rp.ID }, user, provider);
    expect(store.Status(id)).toBe('Published');
    expect(configuredModelId(rp.ID)).toBe(id);
    expect(store.PublishRecords(id)).toEqual([expect.objectContaining({ Kind: 'publish', ApproverKind: 'automated-gate' })]);
  });
  it('reuse considers only the pipeline\'s Published models', async () => {
    for (const status of ['Validated', 'Archived', 'Unevaluated'] as const) store.AddModel(p.ID, { Status: status, ArtifactStatus: 'verified' });
    await trainer.EnsureTrainedModel(request, user, provider);
    expect(store.TrainingRuns(p.ID)).toHaveLength(1);    // none of them was reused
  });
  it('a transiently refused publish is retried without a new training run', async () => {
    storage.PutError = 'connection reset';
    await expect(trainer.EnsureTrainedModel(request, user, provider)).rejects.toThrow('publish withheld');
    storage.PutError = null;
    await trainer.EnsureTrainedModel(request, user, provider);
    expect(store.TrainingRuns(p.ID)).toHaveLength(1);
  });
  it('after a non-transient refusal it does not retrain before retryAfterHours', async () => {
    gateRecords.NextOutcome('no-signal');
    await expect(trainer.EnsureTrainedModel(request, user, provider)).rejects.toThrow('publish withheld');
    clock.Advance({ hours: 23 });
    await expect(trainer.EnsureTrainedModel(request, user, provider)).rejects.toThrow('publish withheld');
    expect(store.TrainingRuns(p.ID)).toHaveLength(1);
  });
  it('two runs started together train the pipeline once; the second fails naming the in-flight run when no model exists', async () => {
    const [a, b] = await Promise.allSettled([trainer.EnsureTrainedModel(request, user, provider), trainer.EnsureTrainedModel(request, user, provider)]);
    expect(store.TrainingRuns(p.ID)).toHaveLength(1);
    expect([a.status, b.status].sort()).toEqual(['fulfilled', 'rejected']);
    expect(String((a.status === 'rejected' ? a : b as PromiseRejectedResult).reason)).toContain(store.TrainingRuns(p.ID)[0].ID);
  });
  it('a demoted configured model is repointed to the pipeline\'s current published model without training', async () => {
    const current = store.AddModel(p.ID, { Status: 'Published', ArtifactStatus: 'verified' });
    const id = await trainer.EnsureTrainedModel({ ...request, currentModelId: demoted.ID }, user, provider);
    expect(id).toBe(current.ID);
    expect(store.TrainingRuns(p.ID)).toHaveLength(0);
  });
  it('notifyOnWithheld false sends no withheld notification', async () => {
    gateRecords.NextOutcome('no-signal');
    await expect(trainer.EnsureTrainedModel({ ...request, notifyOnWithheld: false }, user, provider)).rejects.toThrow();
    expect(store.Notifications(user.ID)).toHaveLength(0);
  });
});

describe('PipelineAutoTrainer.EnsureTrainedModel (additions)', () => {
  it('publishes with the auto-train initiator naming the Process Run, notifies its user and logs the outcome', async () => {
    const id = await trainer.EnsureTrainedModel(request, user, provider);
    const [record] = store.PublishRecords(id);
    expect(GateTestStore.JsonObjectColumn(record, 'Initiator')).toEqual({ kind: 'system', component: 'auto-train', processRunId: processRun.ID });
    expect(store.Notifications(user.ID).map((n) => GateTestStore.JsonObjectColumn(n, 'ResourceConfiguration')['Kind'])).toEqual(['published']);
    expect(ConsoleCapture.Lines(status)).toContain(`Predictive Studio auto-train: pipeline '${p.ID}' → trained + published (or kept serving) model '${id}'; Record Process '${rp.ID}' repointed.`);
  });

  it('the loser of the claim scores with the pipeline\'s Published model when one exists, and does not train', async () => {
    const current = store.AddModel(p.ID, { Status: 'Published', ArtifactStatus: 'verified' });
    const inFlight = '6A1D2E3F-0000-4000-8000-00000000F001';
    store.Insert('MJ: ML Training Runs', { ID: inFlight, PipelineID: p.ID, Status: 'Running', StartedAt: clock.Now() });
    store.ReadLog.FailNext('MJ: ML Models');   // the first reuse read fails, so the claim is reached
    expect(await trainer.EnsureTrainedModel(request, user, provider)).toBe(current.ID);
    expect([gateRecords.Trainings, store.TrainingRuns(p.ID).map((r) => r['ID'])]).toEqual([0, [inFlight]]);
    expect(ConsoleCapture.Lines(status)).toContain(`Predictive Studio auto-train: training pipeline ${p.ID} is already being trained by run ${inFlight}; its Published model '${current.ID}' scores this run.`);
  });

  it('a Running run older than the 6 h stale threshold does not hold the pipeline', async () => {
    store.Insert('MJ: ML Training Runs', { ID: '6A1D2E3F-0000-4000-8000-00000000F002', PipelineID: p.ID, Status: 'Running', StartedAt: new Date(clock.Now().getTime() - 6 * 3_600_000 - 1) });
    const id = await trainer.EnsureTrainedModel(request, user, provider);
    expect([store.Status(id), store.TrainingRuns(p.ID)]).toEqual(['Published', [expect.objectContaining({ Status: 'Running' }), expect.objectContaining({ Status: 'Completed' })]]);
  });

  it('retrains once retryAfterHours has passed (24 h + 1 min)', async () => {
    gateRecords.NextOutcome('no-signal');
    await expect(trainer.EnsureTrainedModel(request, user, provider)).rejects.toThrow('publish withheld');
    clock.Advance({ hours: 24, minutes: 1 });
    const id = await trainer.EnsureTrainedModel(request, user, provider);
    expect([store.Status(id), store.TrainingRuns(p.ID)]).toEqual(['Published', [expect.anything(), expect.anything()]]);
  });

  it('a retryAfterHours of 0 retrains on the next run', async () => {
    gateRecords.NextOutcome('no-signal');
    await expect(trainer.EnsureTrainedModel({ ...request, retryAfterHours: 0 }, user, provider)).rejects.toThrow('publish withheld');
    await trainer.EnsureTrainedModel({ ...request, retryAfterHours: 0 }, user, provider);
    expect(store.TrainingRuns(p.ID)).toHaveLength(2);
  });

  it('the retry window names the refusal and when training resumes', async () => {
    gateRecords.NextOutcome('no-signal');
    await expect(trainer.EnsureTrainedModel(request, user, provider)).rejects.toThrow('publish withheld');
    const [run] = store.TrainingRuns(p.ID);
    const [record] = store.PublishRecordsOfRun(String(run['ID']));
    const recordedAt = record['RecordedAt'];
    if (!(recordedAt instanceof Date)) throw new Error('the refusal record has no RecordedAt');
    await expect(trainer.EnsureTrainedModel(request, user, provider)).rejects.toThrow(
      `Auto-train run ${run['ID']}; evaluation withheld: ${record['Reason']} (publish withheld: the run has no model to publish). ` +
        `Auto-train does not retrain pipeline ${p.ID} before ${new Date(recordedAt.getTime() + 24 * 3_600_000).toISOString()} ` +
        `(autoTrain.retryAfterHours = 24 after that refusal, recorded ${recordedAt.toISOString()}).`,
    );
  });

  it('notifyOnWithheld by default sends the withheld notice to the Process Run\'s user', async () => {
    gateRecords.NextOutcome('no-signal');
    await expect(trainer.EnsureTrainedModel(request, user, provider)).rejects.toThrow();
    expect(store.Notifications(user.ID).map((n) => GateTestStore.JsonObjectColumn(n, 'ResourceConfiguration')['Kind'])).toEqual(['gate-no-signal']);
  });

  it('notifyOnWithheld false also suppresses a withheld model publish, never the published notice of a later run', async () => {
    gateRecords.NextOutcome('keep');
    await expect(trainer.EnsureTrainedModel({ ...request, notifyOnWithheld: false, retryAfterHours: 0 }, user, provider)).rejects.toThrow('publish withheld');
    expect(store.Notifications(user.ID)).toHaveLength(0);
    await trainer.EnsureTrainedModel({ ...request, notifyOnWithheld: false, retryAfterHours: 0 }, user, provider);
    expect(store.Notifications(user.ID).map((n) => GateTestStore.JsonObjectColumn(n, 'ResourceConfiguration')['Kind'])).toEqual(['published']);
  });

  it('a run-level stop (no model) throws the R4 run message and leaves one run-level refusal record', async () => {
    gateRecords.NextOutcome('no-signal');
    const attempt = trainer.EnsureTrainedModel(request, user, provider);
    await expect(attempt).rejects.toThrow(/^Auto-train run [0-9A-F-]{36}; evaluation withheld: The stored gate decision ships nothing: /);
    const [run] = store.TrainingRuns(p.ID);
    expect(store.PublishRecordsOfRun(String(run['ID']))).toEqual([expect.objectContaining({ Kind: 'refusal', ModelID: null, Purpose: 'evaluate', Transient: false })]);
    expect(configuredModelId(rp.ID)).toBeNull();
  });

  it('a kept baseline is withheld by the gate with the R4 model message (model id and version)', async () => {
    gateRecords.NextOutcome('keep');
    await expect(trainer.EnsureTrainedModel(request, user, provider)).rejects.toThrow(/^Auto-train trained model [0-9A-F-]{36} v2; publish withheld: /);
    const [run] = store.TrainingRuns(p.ID);
    const modelId = String(run['ResultingModelID']);
    expect([store.Status(modelId), store.PublishRecords(modelId).map((r) => [r['Kind'], GateTestStore.JsonObjectColumn(r, 'Refusal')['kind']])]).toEqual(['KeepBaseline', [['refusal', 'keep-baseline-not-auto-published']]]);
  });

  it('a Process Run user without the publish grants gets the recorded actor-not-permitted refusal as its R4 message (D4-134/D4-135)', async () => {
    const grants: Readonly<Record<string, Partial<EntityGrant>>> = {
      'MJ: ML Training Runs': { CanRead: true, CanCreate: true, CanUpdate: true },
      'MJ: ML Models': { CanRead: true, CanUpdate: true },
      'MJ: ML Output Bindings': { CanRead: true, CanCreate: true },
    };
    const uiUser = store.UserWithPermissions(grants);
    const reason = GateRefusals.Describe({ kind: 'actor-not-permitted', actor: 'system' });
    await expect(trainer.EnsureTrainedModel(request, uiUser, provider)).rejects.toThrow(new RegExp(`; publish withheld: ${reason.replace(/\./g, '\\.')}$`));
    const [run] = store.TrainingRuns(p.ID);
    const modelId = String(run['ResultingModelID']);
    expect([store.Status(modelId), store.PublishRecords(modelId).map((r) => [r['Kind'], GateTestStore.JsonObjectColumn(r, 'Refusal')['kind']])]).toEqual(['Validated', [['refusal', 'actor-not-permitted']]]);
  });

  it('does not archive a superseded model of another pipeline, and names it in the log', async () => {
    const otherPipelineModel = '6A1D2E3F-0000-4000-8000-00000000F003';
    const otherPipeline = '6A1D2E3F-0000-4000-8000-00000000F004';
    store.Insert('MJ: ML Models', { ID: otherPipelineModel, PipelineID: otherPipeline, Version: 1, Status: 'Published' });
    const id = await trainer.EnsureTrainedModel({ ...request, currentModelId: otherPipelineModel }, user, provider);
    expect([store.Status(id), store.Status(otherPipelineModel)]).toEqual(['Published', 'Published']);
    expect(ConsoleCapture.Lines(status)).toContain(
      `Predictive Studio auto-train: ML Model '${otherPipelineModel}' (pipeline '${otherPipeline}') is no longer this process's model; it is not archived, since it belongs to another pipeline and may still serve another process.`,
    );
  });

  it('names no superseded model when the configured model is the served one or this pipeline\'s own, in any letter case', async () => {
    const current = store.AddModel(p.ID, { Status: 'Published', ArtifactStatus: 'verified' });
    const sameModel = await trainer.EnsureTrainedModel({ ...request, currentModelId: current.ID.toLowerCase() }, user, provider);
    const ownOlder = '6A1D2E3F-0000-4000-8000-00000000F005';
    store.Insert('MJ: ML Models', { ID: ownOlder, PipelineID: p.ID.toLowerCase(), Version: 1, Status: 'Archived' });
    const fromOwnOlder = await trainer.EnsureTrainedModel({ ...request, currentModelId: ownOlder }, user, provider);
    expect([sameModel, fromOwnOlder, store.TrainingRuns(p.ID).length]).toEqual([current.ID, current.ID, 0]);
    expect(ConsoleCapture.Lines(status).filter((line) => line.includes('is no longer this process\'s model'))).toEqual([]);
  });

  it('a calibration-held model is refused at Evaluate and reported with the R4 model message, not the run-level text', async () => {
    const held = trainerWhoseModels((modelId) => {
      const row = store.Row('MJ: ML Models', modelId);
      if (!row) throw new Error(`no ML Model ${modelId}`);
      row['Lineage'] = JSON.stringify({ calibrationHold: { slope: 0.5 } });
    });
    await expect(held.EnsureTrainedModel(request, user, provider)).rejects.toThrow(/^Auto-train trained model [0-9A-F-]{36} v2; publish withheld: /);
    const [run] = store.TrainingRuns(p.ID);
    expect(store.Status(String(run['ResultingModelID']))).toBe('Draft');
  });

  it('a calibration-held pipeline run twice trains once', async () => {
    const held = trainerWhoseModels((modelId) => {
      const row = store.Row('MJ: ML Models', modelId);
      if (!row) throw new Error(`no ML Model ${modelId}`);
      row['Lineage'] = JSON.stringify({ calibrationHold: { slope: 0.5 } });
    });
    await expect(held.EnsureTrainedModel(request, user, provider)).rejects.toThrow('publish withheld');
    const [run] = store.TrainingRuns(p.ID);
    const modelId = String(run['ResultingModelID']);
    const [record] = store.PublishRecords(modelId);
    const recordedAt = record['RecordedAt'];
    if (!(recordedAt instanceof Date)) throw new Error('the refusal record has no RecordedAt');
    await expect(held.EnsureTrainedModel(request, user, provider)).rejects.toThrow(
      `Auto-train trained model ${modelId} (run ${run['ID']}); publish withheld: ${GateRefusals.Describe({ kind: 'calibration-held', slope: 0.5 })} ` +
        `Auto-train does not retrain pipeline ${p.ID} before ${new Date(recordedAt.getTime() + 24 * 3_600_000).toISOString()} ` +
        `(autoTrain.retryAfterHours = 24 after that refusal, recorded ${recordedAt.toISOString()}).`,
    );
    expect([store.TrainingRuns(p.ID).length, gateRecords.Trainings]).toEqual([1, 1]);
  });

  it('a KeepBaseline model whose publish was refused transiently is resumed without a new training run', async () => {
    const keeps = trainerWhoseModels((modelId) => store.PinProtocol(modelId, { autoPublishKeepBaseline: true }));
    gateRecords.NextOutcome('keep');
    storage.PutError = 'connection reset';
    await expect(keeps.EnsureTrainedModel(request, user, provider)).rejects.toThrow('publish withheld');
    const [run] = store.TrainingRuns(p.ID);
    const modelId = String(run['ResultingModelID']);
    expect([store.Status(modelId), store.PublishRecords(modelId).map((r) => [r['Kind'], r['Transient']])]).toEqual(['KeepBaseline', [['refusal', true]]]);
    storage.PutError = null;
    const evaluateAndPublish = vi.spyOn(AutomatedPublisher.prototype, 'EvaluateAndPublish');
    let resumedRuns: string[] = [];
    const served = await keeps.EnsureTrainedModel(request, user, provider).finally(() => {
      resumedRuns = evaluateAndPublish.mock.calls.map((c) => c[0]);
      evaluateAndPublish.mockRestore();
    });
    expect([served, resumedRuns, store.TrainingRuns(p.ID).length, store.Status(modelId)]).toEqual([modelId, [run['ID']], 1, 'Published']);
  });

  it('a Draft model whose Evaluate was refused transiently (publish-in-progress) is resumed without a new training run', async () => {
    const gate = new HeldLockGate(new StorageProviderArtifactLoader(), new FakeClock(), new RecordingScoringActions());
    const held = new PipelineAutoTrainer({ gate, train: gateRecords.Train, now: () => clock.Now() });
    await expect(held.EnsureTrainedModel(request, user, provider)).rejects.toThrow('publish withheld');
    const [run] = store.TrainingRuns(p.ID);
    const modelId = String(run['ResultingModelID']);
    expect([store.Status(modelId), store.PublishRecords(modelId).map((r) => [r['Kind'], r['Transient'], GateTestStore.JsonObjectColumn(r, 'Refusal')['kind']])])
      .toEqual(['Draft', [['refusal', true, 'publish-in-progress']]]);
    gate.Held = false;
    const served = await held.EnsureTrainedModel(request, user, provider);
    expect([served, store.TrainingRuns(p.ID).length, gateRecords.Trainings, store.Status(modelId)]).toEqual([modelId, 1, 1, 'Published']);
  });

  it('rejects a malformed pipeline id before touching anything', async () => {
    await expect(trainer.EnsureTrainedModel({ ...request, pipelineId: "x' OR 1=1 --" }, user, provider)).rejects.toThrow(/not a valid/);
    expect([store.ReadCount(), gateRecords.Trainings]).toEqual([0, 0]);
  });
});

/** Deletes the row out of band (as `spDeleteEntityWithCoreDependencies` does), leaving the RunView cache's stale copy of the entity's rows. */
function deleteOutOfBand(entityName: string, id: string): void {
  const rows = store.Tables[entityName] || [];
  store.CachedTables[entityName] = rows.map((r) => ({ ...r }));
  store.Tables[entityName] = rows.filter((r) => !UUIDsEqual(String(r['ID']), id));
}

describe('PipelineAutoTrainer: rows deleted out of band (M4b.6 cells (c) and (d))', () => {
  it('a Published model deleted out of band is not reused from a stale RunView copy: the run trains through the gate', async () => {
    const deleted = store.AddModel(p.ID, { Status: 'Published', ArtifactStatus: 'verified' });
    deleteOutOfBand('MJ: ML Models', deleted.ID);
    const id = await trainer.EnsureTrainedModel(request, user, provider);
    expect([UUIDsEqual(id, deleted.ID), store.TrainingRuns(p.ID).length, store.Status(id)]).toEqual([false, 1, 'Published']);
  });

  it('RunViewMLModelLoader does not load a model deleted out of band from a stale RunView copy', async () => {
    const deleted = store.AddModel(p.ID, { Status: 'Published', ArtifactStatus: 'verified' });
    deleteOutOfBand('MJ: ML Models', deleted.ID);
    expect(await new RunViewMLModelLoader().loadModel(deleted.ID, user, provider)).toBeNull();
    expect(store.ViewReads).toEqual([{ EntityName: 'MJ: ML Models', BypassCache: true }]);
  });

  it('a repoint of a deleted Record Process fails loudly naming it; the publish stands and the next process serves the model without training', async () => {
    const gone = world.RecordProcess();
    deleteOutOfBand('MJ: Record Processes', gone.ID);
    const attempt = trainer.EnsureTrainedModel({ ...request, recordProcessId: gone.ID }, user, provider);
    await expect(attempt).rejects.toThrow(`Auto-train: Record Process '${gone.ID}' no longer exists`);
    const [run] = store.TrainingRuns(p.ID);
    const modelId = String(run['ResultingModelID']);
    await expect(attempt).rejects.toThrow(PipelineAutoTrainer.RecordProcessGoneMessage(gone.ID, modelId, p.ID));
    expect([store.Status(modelId), store.PublishRecords(modelId).map((r) => r['Kind'])]).toEqual(['Published', ['publish']]);
    expect(await trainer.EnsureTrainedModel(request, user, provider)).toBe(modelId);
    expect([store.TrainingRuns(p.ID).length, configuredModelId(rp.ID)]).toEqual([1, modelId]);
  });
});

describe('PipelineAutoTrainer.TrainThroughEngine', () => {
  it('trains single-flight through the engine and returns the run and its model (null when none shipped)', async () => {
    const run = await store.Provider().GetEntityObject<MJMLTrainingRunEntity>('MJ: ML Training Runs', GateWorld.User);
    run.ID = '6A1D2E3F-0000-4000-8000-00000000F005';
    const model = await store.Provider().GetEntityObject<MJMLModelEntity>('MJ: ML Models', GateWorld.User);
    model.ID = '6A1D2E3F-0000-4000-8000-00000000F006';
    const train = vi.spyOn(TrainingDelegation, 'TrainModelViaEngine').mockResolvedValueOnce({ model, run }).mockResolvedValueOnce({ model: null, run });
    expect(await PipelineAutoTrainer.TrainThroughEngine(PIPE, provider, user)).toEqual({ TrainingRunID: run.ID, ModelID: model.ID });
    expect(await PipelineAutoTrainer.TrainThroughEngine(PIPE, provider, user)).toEqual({ TrainingRunID: run.ID, ModelID: null });
    expect(train.mock.calls.map((c) => c[0])).toEqual([{ pipelineId: PIPE, SingleFlight: true }, { pipelineId: PIPE, SingleFlight: true }]);
  });
});
