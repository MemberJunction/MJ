/**
 * `PreGateModelMigration` and `LifecycleGate.AdoptPublished` (Task M7.2, §5.6 steps 2–5; D4-22, D4-13, D4-14, D4-61):
 * the plan's cases over the `GateTestStore` fake provider (one store holding several pipelines: each pre-change model is
 * a gate-world model moved onto its own pipeline and stripped of the registry entry the serving migration's data
 * section leaves empty), a memory storage account its artifacts are read from, a recording scoring-Action seam and a
 * fake trainer that completes a claimed run as the gate world's trainer would. Two cases run the scoring service over
 * its own fake world (`ScoringServiceWorld`).
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResourceTypeEngine, type MJResourceTypeEntity } from '@memberjunction/core-entities';
import { JsonParse, type Actor, type JsonObject } from '@memberjunction/predictive-studio-core';

import { FakeClock, GATE_TASK, GateTestStore, GateWorld, type Row, type WorldModel } from '../../__tests__/fakes/gate-test-store';
import { RecordingScoringActions } from '../../__tests__/fakes/scoring-action-fakes';
import { Records, ScoringServiceWorld } from '../../__tests__/fakes/scoring-service-world';
import { MemoryStorageAccount, ProviderRow, RegisterMemoryStorage, ServeStorageProviders } from '../../__tests__/fakes/storage-fakes';
import { AutomatedPublisher } from '../../registry/automated-publisher';
import { LifecycleGate } from '../../registry/lifecycle-gate';
import { PublishNotifications } from '../../registry/publish-notifications';
import type { AutoTrainedRun } from '../../scoring/auto-train';
import { ScoringService } from '../../scoring/scoring-service';
import { StorageProviderArtifactLoader } from '../../scoring/storage-provider-artifact-loader';
import { SnapshotHash } from '../../snapshot/snapshot-hash';
import { LocalArtifactPath } from '../../training/artifact-store';
import { ProtocolRowFixture } from '../../training/__tests__/fixtures/protocol-row';
import { TrainerResultFixtures } from '../../training/__tests__/fixtures/trainer-result';
import { PreGateMigrationContexts, PreGateModelMigration, type PreGateMigrationContext } from '../pre-gate-model-migration';

const log: string[] = [];
const storage = new MemoryStorageAccount('pre-gate', log);
RegisterMemoryStorage('PS Pre-Gate Migration Test Storage', storage);
const providerRow = ProviderRow(GateWorld.StorageProviderID, 'Gate Test Storage', 'PS Pre-Gate Migration Test Storage', true);
const REGISTRY_TYPE_ID = '6A1D2E3F-0000-4000-8000-0000000007A1';

let store: GateTestStore;
let world: GateWorld;
let clock: FakeClock;
let scoringActions: RecordingScoringActions;
let gate: LifecycleGate;
let trainer: FakeTrainer;
let ctx: PreGateMigrationContext;
let registryRun: { readonly ID: string; readonly ScheduledJobID: string };
let artifactDir: string;
let savedArtifactDir: string | undefined;
let savedStorageProvider: string | undefined;
let next = 0;

/** A new ID the gate world never hands out (its own IDs count up from 1 in the last group). */
function id(): string {
  next++;
  return `7B2C3D4E-0000-4000-8000-${next.toString(16).padStart(12, '0').toUpperCase()}`;
}

/** A pipeline row: with a Prediction Unit unless `unit` is null; its row last changed long before any attempt. */
function Pipeline(unit: string | null = GateWorld.UnitID): string {
  const pipelineId = id();
  store.Insert('MJ: ML Training Pipelines', {
    ID: pipelineId, Name: `pipeline ${pipelineId}`, PredictionUnitID: unit, EvaluationProtocolID: null, TargetEntityID: null, TargetEntity: null,
    __mj_UpdatedAt: new Date('2025-01-01T00:00:00Z'),
  });
  return pipelineId;
}

/** The target entity of {@link ScoredPipeline}: its rows, and the `ChurnScore` column a scoring binding copies into. */
const MEMBERS = 'PS Pre-Gate Members';
const MEMBERS_ENTITY_ID = '6A1D2E3F-0000-4000-8000-0000000007B1';

/** A pipeline over a scored target entity, one member row, and the binding that copies predictions into `ChurnScore`. */
interface ScoredPipelineRows {
  readonly PipelineID: string;
  readonly EntityID: string;
  readonly RecordID: string;
}

/** A moment after any attempt a case records (attempts are stamped now). */
function Later(): Date {
  return new Date(Date.now() + 60_000);
}

/** A pipeline whose target entity a column-copy scoring binding writes back into; every row last changed long ago. */
function ScoredPipeline(): ScoredPipelineRows {
  const pipelineId = id();
  const long = new Date('2025-01-01T00:00:00Z');
  store.Insert('MJ: ML Training Pipelines', {
    ID: pipelineId, Name: `pipeline ${pipelineId}`, PredictionUnitID: GateWorld.UnitID, EvaluationProtocolID: null, TargetEntityID: MEMBERS_ENTITY_ID, TargetEntity: MEMBERS,
    __mj_UpdatedAt: long,
  });
  const recordId = id();
  store.Insert(MEMBERS, { ID: recordId, Email: 'a@example.com', ChurnScore: null, __mj_CreatedAt: long, __mj_UpdatedAt: long });
  store.Insert('MJ: ML Model Scoring Bindings', { ID: id(), TargetEntityID: MEMBERS_ENTITY_ID, TargetColumn: 'ChurnScore', Status: 'Active' });
  return { PipelineID: pipelineId, EntityID: MEMBERS_ENTITY_ID, RecordID: recordId };
}

/** A tracked update of the member row (its `__mj_UpdatedAt` and its Record Changes row) listing `changes`. */
function RowChanged(scored: ScoredPipelineRows, changes: JsonObject): void {
  const at = Later();
  const row = store.Row(MEMBERS, scored.RecordID);
  if (row) row['__mj_UpdatedAt'] = at;
  store.Insert('MJ: Record Changes', {
    ID: id(), EntityID: scored.EntityID, RecordID: `ID|${scored.RecordID}`, Type: 'Update', Status: 'Complete', ChangedAt: at, ChangesJSON: JSON.stringify(changes),
  });
}

/** What one scoring of the member writes: its `Model` prediction as a Feature Value, and the binding's column copy. */
function ScoringWrote(scored: ScoredPipelineRows): void {
  store.Insert('MJ: Feature Values', { ID: id(), EntityID: scored.EntityID, RecordID: scored.RecordID, Source: 'Model', __mj_UpdatedAt: Later() });
  RowChanged(scored, { ChurnScore: { field: 'ChurnScore', oldValue: null, newValue: 0.7 } });
}

/** Moves a gate-world model, its training run and its snapshot onto `pipelineId`. */
function MoveTo(model: WorldModel, pipelineId: string): WorldModel {
  const row = store.Row('MJ: ML Models', model.ID);
  if (!row) throw new Error(`no model ${model.ID}`);
  row['PipelineID'] = pipelineId;
  const run = store.Row('MJ: ML Training Runs', model.RunID);
  if (run) {
    run['PipelineID'] = pipelineId;
    const snapshot = store.Row('MJ: ML Training Snapshots', String(run['TrainingSnapshotID']));
    if (snapshot) snapshot['PipelineID'] = pipelineId;
  }
  return model;
}

/**
 * The state the data section leaves a model trained by PR 3's trainer in: its run as `TrainingRunID`, no registry
 * entry (`Delivery`, artifact hash, snapshot, unit, protocol, semantics), no output bindings, `unverified`.
 */
function EvidenceBearing(status: 'Published' | 'Draft', pipelineId = Pipeline()): WorldModel {
  const model = MoveTo(world.Model(status, 'model'), pipelineId);
  Object.assign(store.Row('MJ: ML Models', model.ID) || {}, {
    Delivery: null, ArtifactSha256: null, OutputSemantics: null, PredictionUnitID: null, EvaluationProtocolID: null, TrainingSnapshotID: null,
    SnapshotHash: null, ArtifactStatus: 'unverified', ServingWhileUnevaluated: false,
  });
  store.Tables['MJ: ML Output Bindings'] = (store.Tables['MJ: ML Output Bindings'] || []).filter((b) => b['ModelID'] !== model.ID);
  return model;
}

/**
 * Keeps the run's stored gate decision (`model`) but replaces its intervals with ones that recompute to no-signal: a
 * record PR 3's decision shipped that the lifecycle gate's re-derivation does not.
 */
function RecomputesToNoSignal(model: WorldModel): void {
  const before = gateOf(model.RunID);
  world.StoreGateRecord(model.ID, noSignalResult(model.RunID));
  const row = store.Row('MJ: ML Training Runs', model.RunID);
  const envelope = parsedObject(row?.['ValidationResults']);
  const gateRecord = envelope['gate'];
  if (!JsonParse.IsJsonObject(gateRecord)) throw new Error('no stored gate record');
  if (row) row['ValidationResults'] = JSON.stringify({ ...envelope, gate: { ...gateRecord, decision: before['decision'], transcribed: before['transcribed'] } });
}

/** The trainer result of the gate world's fixtures that recomputes to no-signal. */
function noSignalResult(runId: string): Parameters<GateWorld['StoreGateRecord']>[1] {
  return TrainerResultFixtures.CannedNoSignal(runId, ProtocolRowFixture.Spec());
}

/** The stored gate record of a run, as JSON. */
function gateOf(runId: string): JsonObject {
  const envelope = parsedObject(store.Row('MJ: ML Training Runs', runId)?.['ValidationResults']);
  const gateRecord = envelope['gate'];
  if (!JsonParse.IsJsonObject(gateRecord)) throw new Error(`run ${runId} stores no gate record`);
  return gateRecord;
}

function parsedObject(cell: Row[string] | undefined): JsonObject {
  const parsed = JsonParse.ParseJsonText(typeof cell === 'string' ? cell : null, 'ValidationResults');
  if (parsed.Ok === false || !JsonParse.IsJsonObject(parsed.Value)) throw new Error('not a JSON object');
  return parsed.Value;
}

/** A legacy model (no stored run) in `status` on `pipelineId`, its artifact as `artifact` says. */
function Legacy(pipelineId: string, status: string, artifact: 'provider-key' | 'local-only' | 'local-on-host' | 'none', o: { readonly Serving?: boolean } = {}): { readonly ID: string; readonly Bytes: Uint8Array } {
  const modelId = id();
  const bytes = new TextEncoder().encode(`legacy artifact of ${modelId}`);
  const fileId = artifact === 'none' ? null : id();
  if (fileId !== null && artifact === 'provider-key') {
    storage.Objects.set(`legacy/${fileId}`, bytes);
    store.Insert('MJ: Files', { ID: fileId, ProviderID: GateWorld.StorageProviderID, ProviderKey: `legacy/${fileId}` });
  }
  if (fileId !== null && artifact !== 'provider-key') store.Insert('MJ: Files', { ID: fileId, ProviderID: GateWorld.StorageProviderID, ProviderKey: null });
  if (fileId !== null && artifact === 'local-on-host') {
    const at = LocalArtifactPath(artifactDir, fileId);
    mkdirSync(path.dirname(at), { recursive: true });
    writeFileSync(at, bytes);
  }
  store.Insert('MJ: ML Models', {
    ID: modelId, PipelineID: pipelineId, Version: 100 + next, Status: status, StatusReason: o.Serving ? PreGateModelMigration.ServingReason : PreGateModelMigration.NotServingReason,
    TrainingRunID: null, Delivery: null, ArtifactFileID: fileId, ArtifactSha256: null, ArtifactStatus: 'unverified', ArtifactCheckedAt: null, Lineage: null,
    ServingWhileUnevaluated: o.Serving === true, __mj_UpdatedAt: new Date('2026-01-01T00:00:00Z'),
  });
  return { ID: modelId, Bytes: bytes };
}

/** An `'ML Model'` Record Process configured with `modelId` (and `autoTrain` when given). */
function Process(modelId: string, o: { readonly ScheduleEnabled: boolean; readonly AutoTrainPipelineID?: string }): { readonly ID: string } {
  const row = {
    ID: id(), WorkType: 'ML Model', ScheduleEnabled: o.ScheduleEnabled,
    Configuration: JSON.stringify(o.AutoTrainPipelineID ? { modelId, autoTrain: { pipelineId: o.AutoTrainPipelineID } } : { modelId }),
  };
  store.Insert('MJ: Record Processes', row);
  return row;
}

/** A Record Process row's schedule and configured model. */
function ProcessState(processId: string): { readonly ScheduleEnabled: boolean; readonly ConfigurationModelId: string | null } {
  const row = store.Row('MJ: Record Processes', processId);
  const config = parsedObject(row?.['Configuration']);
  return { ScheduleEnabled: row?.['ScheduleEnabled'] === true, ConfigurationModelId: JsonParse.JsonString(config, 'modelId') };
}

/** A run of a Registry Check job owned by the world's user (the D4-18 recipient). */
function RegistryJobRun(): { readonly ID: string; readonly ScheduledJobID: string } {
  if (!store.Row('MJ: Scheduled Job Types', REGISTRY_TYPE_ID)) store.Insert('MJ: Scheduled Job Types', { ID: REGISTRY_TYPE_ID, Name: 'Predictive Studio Registry Check' });
  const job = { ID: id(), JobTypeID: REGISTRY_TYPE_ID, OwnerUserID: GateWorld.User.ID, Status: 'Active' };
  store.Insert('MJ: Scheduled Jobs', job);
  const run = { ID: id(), ScheduledJobID: job.ID, Status: 'Running', Details: null };
  store.Insert('MJ: Scheduled Job Runs', run);
  return run;
}

/** An earlier run of the registry job whose `Details` lists `processIds` as disabled by step 4. */
function EarlierRunDisabled(processIds: readonly string[]): void {
  store.Insert('MJ: Scheduled Job Runs', {
    ID: id(), ScheduledJobID: registryRun.ScheduledJobID, Status: 'Completed', Details: JSON.stringify({ [PreGateModelMigration.DetailsKey]: { DisabledProcessIDs: processIds } }),
  });
}

/** The trainer seam: completes a claimed run of a pipeline with the outcome set for it, as the gate world's trainer does. */
class FakeTrainer {
  private readonly outcomes = new Map<string, 'model' | 'no-signal'>();
  private readonly runs = new Map<string, string[]>();
  private readonly models = new Map<string, string>();

  public NextOutcome(pipelineId: string, outcome: 'model' | 'no-signal'): void {
    this.outcomes.set(pipelineId, outcome);
  }

  public Runs(pipelineId: string): string[] {
    return this.runs.get(pipelineId) || [];
  }

  public ModelOf(pipelineId: string): string | null {
    return this.models.get(pipelineId) || null;
  }

  public readonly Train = async (pipelineId: string): Promise<AutoTrainedRun> => {
    const runId = id();
    store.Insert('MJ: ML Training Runs', { ID: runId, PipelineID: pipelineId, Status: 'Running' });
    const trained = world.TrainRun(runId, this.outcomes.get(pipelineId) || 'no-signal');
    if (trained.ModelID === null) {
      const run = store.Row('MJ: ML Training Runs', runId);
      if (run) run['PipelineID'] = pipelineId;
    } else {
      MoveTo({ ID: trained.ModelID, RunID: runId }, pipelineId);
      this.models.set(pipelineId, trained.ModelID);
    }
    this.runs.set(pipelineId, [...this.Runs(pipelineId), runId]);
    return trained;
  };
}

/** The notifications about one model (its `ResourceRecordID`). */
function NotificationsAbout(modelId: string): Row[] {
  return store.Notifications(GateWorld.User.ID).filter((n) => n['ResourceRecordID'] === modelId);
}

/** The model row's columns a case reads. */
function ModelOf(modelId: string): Row {
  const row = store.Row('MJ: ML Models', modelId);
  if (!row) throw new Error(`no model ${modelId}`);
  return row;
}

beforeEach(async () => {
  storage.Reset();
  ServeStorageProviders([providerRow]);
  savedArtifactDir = process.env.PS_ARTIFACT_DIR;
  savedStorageProvider = process.env.PS_STORAGE_PROVIDER;
  artifactDir = mkdtempSync(path.join(tmpdir(), 'ps-pre-gate-'));
  process.env.PS_ARTIFACT_DIR = artifactDir;
  process.env.PS_STORAGE_PROVIDER = 'Gate Test Storage';
  store = new GateTestStore();
  world = new GateWorld(store, storage);
  clock = new FakeClock();
  scoringActions = new RecordingScoringActions();
  gate = new LifecycleGate(new StorageProviderArtifactLoader(), clock, scoringActions);
  trainer = new FakeTrainer();
  registryRun = RegistryJobRun();
  ctx = PreGateMigrationContexts.ForJobRun({ ContextUser: GateWorld.User, Provider: store.Provider() }, registryRun.ID, {
    Gate: gate, Publisher: new AutomatedPublisher(gate, new PublishNotifications()), Notifications: new PublishNotifications(), ScoringActions: scoringActions,
    Train: trainer.Train, UnitTask: async () => GATE_TASK,
  });
  // The notifications' record link reads the seeded 'Records' resource type.
  const recordsType = await store.Provider().GetEntityObject<MJResourceTypeEntity>('MJ: Resource Types', GateWorld.User);
  recordsType.ID = '6A1D2E3F-0000-4000-8000-0000000007C4';
  vi.spyOn(ResourceTypeEngine.Instance, 'Config').mockResolvedValue(undefined);
  vi.spyOn(ResourceTypeEngine.Instance, 'ByName').mockImplementation((name: string) => (name === 'Records' ? recordsType : undefined));
});

afterEach(() => {
  rmSync(artifactDir, { recursive: true, force: true });
  if (savedArtifactDir === undefined) delete process.env.PS_ARTIFACT_DIR;
  else process.env.PS_ARTIFACT_DIR = savedArtifactDir;
  if (savedStorageProvider === undefined) delete process.env.PS_STORAGE_PROVIDER;
  else process.env.PS_STORAGE_PROVIDER = savedStorageProvider;
});

describe('step 2: evidence-bearing models re-verified on their stored record', () => {
  it('re-verifies an evidence-bearing Published model on its stored record and keeps it Published with an adopt record', async () => {
    const pr3Good = EvidenceBearing('Published');
    await PreGateModelMigration.ReverifyEvidenceBearing(50, ctx);
    expect(ModelOf(pr3Good.ID)).toMatchObject({ Status: 'Published', ArtifactStatus: 'verified' });
    expect(store.PublishRecords(pr3Good.ID)).toEqual([expect.objectContaining({ Kind: 'publish', Purpose: 'adopt', ApproverKind: 'automated-gate' })]);
  });

  it('back-fills the registry entry from the stored run exactly as the trainer builds it', async () => {
    const pr3Good = EvidenceBearing('Published');
    await PreGateModelMigration.ReverifyEvidenceBearing(50, ctx);
    const row = ModelOf(pr3Good.ID);
    const run = store.Row('MJ: ML Training Runs', pr3Good.RunID);
    const snapshot = store.Row('MJ: ML Training Snapshots', String(run?.['TrainingSnapshotID']));
    expect([row['TrainingSnapshotID'], row['SnapshotHash'], row['EvaluationProtocolID'], row['PredictionUnitID'], row['OutputSemantics']])
      .toEqual([snapshot?.['ID'], snapshot?.['ContentHash'], run?.['EvaluationProtocolID'], snapshot?.['PredictionUnitID'], JSON.stringify({ task: GATE_TASK })]);
    expect(parsedObject(row['Delivery'])).toMatchObject({ kind: 'delivered', artifact: { fileId: row['ArtifactFileID'], sha256: row['ArtifactSha256'], writeOnce: true } });
  });

  it('demotes an evidence-bearing model whose stored record does not re-verify to non-serving, rolls back the incumbent, and says why', async () => {
    const pipelineId = Pipeline();
    const pr3BadIncumbent = MoveTo(world.Model('Archived', 'model'), pipelineId);
    store.Insert('MJ: ML Model Publish Records', {
      ID: id(), ModelID: pr3BadIncumbent.ID, TrainingRunID: pr3BadIncumbent.RunID, Kind: 'publish', Purpose: 'publish', ApproverKind: 'automated-gate',
      Initiator: JSON.stringify({ kind: 'system', component: 'test' }), RecordedAt: new Date('2026-01-01T00:00:00Z'),
    });
    const pr3Bad = EvidenceBearing('Published', pipelineId);
    RecomputesToNoSignal(pr3Bad);
    await PreGateModelMigration.ReverifyEvidenceBearing(50, ctx);
    expect(ModelOf(pr3Bad.ID)).toMatchObject({ Status: 'Unevaluated', ServingWhileUnevaluated: false, StatusReason: expect.stringContaining('gate-no-signal') });
    expect([store.PublishRecords(pr3Bad.ID).map((r) => r['Kind']), NotificationsAbout(pr3Bad.ID).length]).toEqual([['refusal'], 1]);
    expect(ModelOf(pr3BadIncumbent.ID)['Status']).toBe('Published');
  });

  it('a demoted model with no incumbent leaves its pipeline without a model, and nothing is published', async () => {
    const pr3BadNoIncumbent = EvidenceBearing('Published');
    RecomputesToNoSignal(pr3BadNoIncumbent);
    const result = await PreGateModelMigration.ReverifyEvidenceBearing(50, ctx);
    expect(result.Demoted).toEqual([{ ModelID: pr3BadNoIncumbent.ID, Refusal: expect.objectContaining({ kind: 'gate-no-signal' }), RolledBackTo: null }]);
    expect((store.Tables['MJ: ML Models'] || []).filter((m) => m['PipelineID'] === ModelOf(pr3BadNoIncumbent.ID)['PipelineID'] && m['Status'] === 'Published')).toEqual([]);
  });

  it('refuses AdoptPublished, and so Published → Unevaluated, for any initiator but a Registry Check job run', async () => {
    const pr3Bad = EvidenceBearing('Published');
    RecomputesToNoSignal(pr3Bad);
    const human: Actor = { kind: 'human', userId: GateWorld.User.ID };
    const agent: Actor = { kind: 'agent', agentRunId: world.AgentRun(GateWorld.User.ID).ID };
    const monitoringJobRun: Actor = { kind: 'scheduled-job', scheduledJobRunId: world.ScheduledJobRun(GateWorld.User.ID).ID };
    for (const initiator of [human, agent, monitoringJobRun]) {
      expect(await gate.AdoptPublished(pr3Bad.ID, initiator, ctx)).toMatchObject({ Kind: 'refused', Refusal: { kind: 'actor-not-permitted' } });
    }
    expect(ModelOf(pr3Bad.ID)['Status']).toBe('Published');
  });

  it('a second run adopts nothing twice: one adopt record per run', async () => {
    const pr3Good = EvidenceBearing('Published');
    await PreGateModelMigration.ReverifyEvidenceBearing(50, ctx);
    expect((await PreGateModelMigration.ReverifyEvidenceBearing(50, ctx)).Visited).toBe(0);
    expect(await gate.AdoptPublished(pr3Good.ID, { kind: 'scheduled-job', scheduledJobRunId: registryRun.ID }, ctx)).toMatchObject({ Kind: 'already-adopted' });
    expect(store.PublishRecords(pr3Good.ID)).toHaveLength(1);
  });

  it('an evidence-bearing Draft model is back-filled and evaluated from its stored record', async () => {
    const draft = EvidenceBearing('Draft');
    await PreGateModelMigration.ReverifyEvidenceBearing(50, ctx);
    expect(ModelOf(draft.ID)).toMatchObject({ Status: 'Validated', ArtifactStatus: 'verified' });
  });
});

describe('step 3: legacy artifacts', () => {
  it('a legacy Published model without evidence keeps serving, Unevaluated and flagged', async () => {
    const scoringWorld = new ScoringServiceWorld();
    const legacyServing = scoringWorld.Model({ Status: 'Unevaluated', ServingWhileUnevaluated: true });
    const fileId = id();
    const bytes = new TextEncoder().encode(`legacy serving artifact ${legacyServing.ID}`);
    scoringWorld.Artifacts.Set(fileId, bytes);
    scoringWorld.Store.Insert('MJ: Files', { ID: fileId, ProviderID: GateWorld.StorageProviderID, ProviderKey: `legacy/${fileId}` });
    Object.assign(scoringWorld.ModelRow(legacyServing) || {}, { ArtifactFileID: fileId, ArtifactSha256: null, ArtifactStatus: 'unverified' });
    const binding = await scoringWorld.Binding(legacyServing);
    const r = await new ScoringService(scoringWorld.Ctx()).Score(binding, Records('r1', 'r2'), new Date('2026-03-04T00:00:00Z'), false);
    expect([r.Status, scoringWorld.ModelRow(legacyServing)?.['Status']]).toEqual(['completed', 'Unevaluated']);
    expect(scoringWorld.ModelRow(legacyServing)).toMatchObject({ ServingWhileUnevaluated: true, ArtifactStatus: 'verified', ArtifactSha256: SnapshotHash.Sha256Hex(bytes) });
  });

  it('a non-serving Unevaluated model is refused: its pipeline has no published model', async () => {
    const scoringWorld = new ScoringServiceWorld();
    const demoted = scoringWorld.Model({ Status: 'Unevaluated', ServingWhileUnevaluated: false });
    const r = await new ScoringService(scoringWorld.Ctx()).Score(await scoringWorld.Binding(demoted), Records('r1'), new Date('2026-03-04T00:00:00Z'), false);
    expect(r).toMatchObject({ Status: 'refused', Reason: { kind: 'no-published-model' } });
  });

  it('stores a #5001-era provider-key artifact write-once and verifies it', async () => {
    const providerKeyed = Legacy(Pipeline(), 'Unevaluated', 'provider-key');
    await PreGateModelMigration.MigrateArtifacts(50, ctx);
    expect(ModelOf(providerKeyed.ID)).toMatchObject({ ArtifactStatus: 'verified', ArtifactSha256: SnapshotHash.Sha256Hex(providerKeyed.Bytes) });
  });

  it('moves local bytes found on this host into provider storage, write-once, and points the model at them', async () => {
    const onHost = Legacy(Pipeline(), 'Unevaluated', 'local-on-host');
    const before = ModelOf(onHost.ID)['ArtifactFileID'];
    await PreGateModelMigration.MigrateArtifacts(50, ctx);
    const row = ModelOf(onHost.ID);
    expect(row).toMatchObject({ ArtifactStatus: 'verified', ArtifactSha256: SnapshotHash.Sha256Hex(onHost.Bytes) });
    expect(row['ArtifactFileID']).not.toBe(before);
    expect(store.Row('MJ: Files', String(row['ArtifactFileID']))?.['ProviderKey']).toBeTruthy();
  });

  it('marks a local-only artifact legacy-local and an absent one missing, and a second run changes nothing', async () => {
    const pipelineId = Pipeline();
    const localOnly = Legacy(pipelineId, 'Unevaluated', 'local-only');
    const none = Legacy(pipelineId, 'Archived', 'none');
    await PreGateModelMigration.MigrateArtifacts(50, ctx);
    expect([ModelOf(localOnly.ID)['ArtifactStatus'], ModelOf(none.ID)['ArtifactStatus']]).toEqual(['legacy-local', 'missing']);
    expect(await PreGateModelMigration.MigrateArtifacts(50, ctx)).toMatchObject({ Changed: 0 });
  });

  it('visits at most 50 models per run', async () => {
    const pipelineId = Pipeline();
    for (let i = 0; i < 120; i++) Legacy(pipelineId, 'Unevaluated', 'none');
    expect((await PreGateModelMigration.MigrateArtifacts(50, ctx)).Visited).toBe(50);
  });
});

describe('step 4: serving side effects', () => {
  it('disables a non-auto-train process bound to a demoted model and keeps an auto-train process scheduled', async () => {
    const pipelineId = Pipeline();
    const demoted = Legacy(pipelineId, 'Unevaluated', 'none');
    const serving = Legacy(Pipeline(), 'Unevaluated', 'none', { Serving: true });
    const plain = Process(demoted.ID, { ScheduleEnabled: true });
    const autoTrain = Process(demoted.ID, { ScheduleEnabled: true, AutoTrainPipelineID: pipelineId });
    const servedByLegacy = Process(serving.ID, { ScheduleEnabled: true });
    const out = await PreGateModelMigration.DisableDemotedSchedules(50, ctx);
    expect([ProcessState(plain.ID).ScheduleEnabled, ProcessState(autoTrain.ID).ScheduleEnabled, ProcessState(servedByLegacy.ID).ScheduleEnabled]).toEqual([false, true, true]);
    expect(out.Disabled).toEqual([plain.ID]);
    expect(scoringActions.Log).toContainEqual(expect.objectContaining({ ModelID: demoted.ID }));
  });
});

describe('step 4: bounded and idempotent', () => {
  it('disables at most the batch per run, and a later run picks up where the first stopped', async () => {
    const pipelineId = Pipeline();
    const demoted = [0, 1, 2].map(() => Legacy(pipelineId, 'Unevaluated', 'none'));
    const processes = demoted.map((m) => Process(m.ID, { ScheduleEnabled: true }));
    const first = await PreGateModelMigration.DisableDemotedSchedules(2, ctx);
    expect([first.ScoringActionsDisabled.length, first.Disabled.length]).toEqual([2, 2]);
    store.Insert('MJ: Scheduled Job Runs', {
      ID: id(), ScheduledJobID: registryRun.ScheduledJobID, Status: 'Completed', Details: JSON.stringify({ [PreGateModelMigration.DetailsKey]: { Schedules: first, DisabledProcessIDs: first.Disabled } }),
    });
    const second = await PreGateModelMigration.DisableDemotedSchedules(2, ctx);
    expect([second.ScoringActionsDisabled, second.Disabled]).toEqual([
      demoted.map((m) => m.ID).filter((m) => !first.ScoringActionsDisabled.includes(m)),
      processes.map((p) => p.ID).filter((p) => !first.Disabled.includes(p)),
    ]);
  });

  it('a model whose scoring Action was not disabled is not recorded as handled, so a later run retries it (M7-1)', async () => {
    const demoted = Legacy(Pipeline(), 'Unevaluated', 'none');
    scoringActions.DisableRefused = true;
    const first = await PreGateModelMigration.DisableDemotedSchedules(50, ctx);
    expect(first.ScoringActionsDisabled).toEqual([]);
    store.Insert('MJ: Scheduled Job Runs', {
      ID: id(), ScheduledJobID: registryRun.ScheduledJobID, Status: 'Completed', Details: JSON.stringify({ [PreGateModelMigration.DetailsKey]: { Schedules: first, DisabledProcessIDs: first.Disabled } }),
    });
    scoringActions.DisableRefused = false;
    expect((await PreGateModelMigration.DisableDemotedSchedules(50, ctx)).ScoringActionsDisabled).toEqual([demoted.ID]);
  });

  it('a run after every demoted model was handled disables nothing and calls no scoring Action again', async () => {
    const pipelineId = Pipeline();
    const demoted = Legacy(pipelineId, 'Unevaluated', 'none');
    Process(demoted.ID, { ScheduleEnabled: true });
    const first = await PreGateModelMigration.DisableDemotedSchedules(50, ctx);
    store.Insert('MJ: Scheduled Job Runs', {
      ID: id(), ScheduledJobID: registryRun.ScheduledJobID, Status: 'Completed', Details: JSON.stringify({ [PreGateModelMigration.DetailsKey]: { Schedules: first, DisabledProcessIDs: first.Disabled } }),
    });
    const calls = scoringActions.Log.length;
    expect(await PreGateModelMigration.DisableDemotedSchedules(50, ctx)).toEqual({ Disabled: [], ScoringActionsDisabled: [] });
    expect(scoringActions.Log.length - calls).toBe(0);
  });
});

describe('step 5: automated re-evaluation', () => {
  it('a gate publish of the pipeline archives its serving pre-change model in the same transaction', async () => {
    const servedPipeline = Pipeline();
    const legacyServing = Legacy(servedPipeline, 'Unevaluated', 'none', { Serving: true });
    trainer.NextOutcome(servedPipeline, 'model');
    await PreGateModelMigration.ReEvaluate(3, ctx);
    expect(ModelOf(legacyServing.ID)).toMatchObject({ Status: 'Archived', ServingWhileUnevaluated: false });
    expect(ModelOf(trainer.ModelOf(servedPipeline) || '')['Status']).toBe('Published');
  });

  it('re-evaluation publishes, repoints and re-enables; a withheld pipeline is not retrained until something changes', async () => {
    const eligible = Pipeline();
    const noisy = Pipeline();
    const demoted = Legacy(eligible, 'Unevaluated', 'none');
    Legacy(noisy, 'Unevaluated', 'none');
    const plain = Process(demoted.ID, { ScheduleEnabled: false });
    EarlierRunDisabled([plain.ID]);
    trainer.NextOutcome(eligible, 'model');
    trainer.NextOutcome(noisy, 'no-signal');
    await PreGateModelMigration.ReEvaluate(3, ctx);
    expect(ProcessState(plain.ID)).toMatchObject({ ScheduleEnabled: true, ConfigurationModelId: trainer.ModelOf(eligible) });
    const second = await PreGateModelMigration.ReEvaluate(3, ctx);
    expect(trainer.Runs(noisy)).toHaveLength(1);
    expect(second.Findings).toContainEqual(expect.objectContaining({ PipelineID: noisy, Kind: 'unchanged-since-last-attempt' }));
  });

  it('reads the last attempt without naming a database schema (M7-2)', async () => {
    const noisy = Pipeline();
    Legacy(noisy, 'Unevaluated', 'none');
    await PreGateModelMigration.ReEvaluate(3, ctx);
    const reads = store.Reads.length;
    expect((await PreGateModelMigration.ReEvaluate(3, ctx)).Findings).toContainEqual(expect.objectContaining({ PipelineID: noisy, Kind: 'unchanged-since-last-attempt' }));
    expect(store.Reads.slice(reads).filter((r) => r.includes('__mj'))).toEqual([]);
  });

  it('a withheld pipeline whose row changed after its last attempt is retrained', async () => {
    const noisy = Pipeline();
    Legacy(noisy, 'Unevaluated', 'none');
    await PreGateModelMigration.ReEvaluate(3, ctx);
    const row = store.Row('MJ: ML Training Pipelines', noisy);
    if (row) row['__mj_UpdatedAt'] = new Date(Date.now() + 60_000);
    await PreGateModelMigration.ReEvaluate(3, ctx);
    expect(trainer.Runs(noisy)).toHaveLength(2);
  });

  it('a withheld pipeline whose entity is scored is not retrained by its own predictions or their column copies (I-1)', async () => {
    const scored = ScoredPipeline();
    Legacy(scored.PipelineID, 'Unevaluated', 'none', { Serving: true });
    await PreGateModelMigration.ReEvaluate(3, ctx);
    ScoringWrote(scored);
    const second = await PreGateModelMigration.ReEvaluate(3, ctx);
    expect(trainer.Runs(scored.PipelineID)).toHaveLength(1);
    expect(second).toMatchObject({ Trained: 0, Findings: [expect.objectContaining({ PipelineID: scored.PipelineID, Kind: 'unchanged-since-last-attempt' })] });
  });

  it('a withheld pipeline whose entity is scored is retrained after an input Feature Value changes', async () => {
    const scored = ScoredPipeline();
    Legacy(scored.PipelineID, 'Unevaluated', 'none', { Serving: true });
    await PreGateModelMigration.ReEvaluate(3, ctx);
    ScoringWrote(scored);
    store.Insert('MJ: Feature Values', { ID: id(), EntityID: scored.EntityID, RecordID: scored.RecordID, Source: 'Pipeline', __mj_UpdatedAt: Later() });
    await PreGateModelMigration.ReEvaluate(3, ctx);
    expect(trainer.Runs(scored.PipelineID)).toHaveLength(2);
  });

  it('a withheld pipeline whose entity is scored is retrained after an input column of a target row changes', async () => {
    const scored = ScoredPipeline();
    Legacy(scored.PipelineID, 'Unevaluated', 'none', { Serving: true });
    await PreGateModelMigration.ReEvaluate(3, ctx);
    ScoringWrote(scored);
    RowChanged(scored, { Email: { field: 'Email', oldValue: 'a@example.com', newValue: 'b@example.com' } });
    await PreGateModelMigration.ReEvaluate(3, ctx);
    expect(trainer.Runs(scored.PipelineID)).toHaveLength(2);
  });

  it('finds an input change past a full page of column copies (keyset pages of the Record Changes)', async () => {
    const scored = ScoredPipeline();
    Legacy(scored.PipelineID, 'Unevaluated', 'none', { Serving: true });
    await PreGateModelMigration.ReEvaluate(3, ctx);
    for (let i = 0; i <= PreGateModelMigration.ChangePageSize; i++) ScoringWrote(scored);
    RowChanged(scored, { Email: { field: 'Email', oldValue: 'a@example.com', newValue: 'b@example.com' } });
    await PreGateModelMigration.ReEvaluate(3, ctx);
    expect(trainer.Runs(scored.PipelineID)).toHaveLength(2);
  });

  it('counts a Create, a Delete, a malformed or a non-copy Update as an input change, and a Snapshot or a copy-only Update as none', () => {
    const copied = new Set(['churnscore']);
    expect([
      PreGateModelMigration.IsInputChange({ Type: 'Create', ChangesJSON: '{}' }, copied),
      PreGateModelMigration.IsInputChange({ Type: 'Delete', ChangesJSON: '{}' }, copied),
      PreGateModelMigration.IsInputChange({ Type: 'Update', ChangesJSON: 'not json' }, copied),
      PreGateModelMigration.IsInputChange({ Type: 'Update', ChangesJSON: JSON.stringify({ ChurnScore: {}, Email: {} }) }, copied),
      PreGateModelMigration.IsInputChange({ Type: 'Snapshot', ChangesJSON: '{}' }, copied),
      PreGateModelMigration.IsInputChange({ Type: 'Update', ChangesJSON: JSON.stringify({ ' churnScore ': {} }) }, copied),
    ]).toEqual([true, true, true, true, false, false]);
  });

  it('a withheld pipeline whose entity is scored is retrained after a target row is created', async () => {
    const scored = ScoredPipeline();
    Legacy(scored.PipelineID, 'Unevaluated', 'none', { Serving: true });
    await PreGateModelMigration.ReEvaluate(3, ctx);
    store.Insert(MEMBERS, { ID: id(), Email: 'new@example.com', ChurnScore: null, __mj_CreatedAt: Later(), __mj_UpdatedAt: Later() });
    await PreGateModelMigration.ReEvaluate(3, ctx);
    expect(trainer.Runs(scored.PipelineID)).toHaveLength(2);
  });

  it('records no-prediction-unit for a legacy pipeline and invents no unit', async () => {
    const legacy = Pipeline(null);
    Legacy(legacy, 'Unevaluated', 'none', { Serving: true });
    const units = (store.Tables['MJ: ML Prediction Units'] || []).length;
    expect((await PreGateModelMigration.ReEvaluate(3, ctx)).Findings).toContainEqual({ PipelineID: legacy, Kind: 'no-prediction-unit' });
    expect([(store.Tables['MJ: ML Prediction Units'] || []).length - units, trainer.Runs(legacy)]).toEqual([0, []]);
  });

  it('retrains at most retrainPerRun pipelines per run, oldest demotion first', async () => {
    const pipelines = [Pipeline(), Pipeline(), Pipeline(), Pipeline()];
    pipelines.forEach((p, i) => {
      const legacy = Legacy(p, 'Unevaluated', 'none');
      ModelOf(legacy.ID)['__mj_UpdatedAt'] = new Date(Date.UTC(2026, 0, 10 - i));
    });
    const result = await PreGateModelMigration.ReEvaluate(3, ctx);
    expect(result.Trained).toBe(3);
    expect(result.Findings).toContainEqual({ PipelineID: pipelines[0], Kind: 'deferred' });
  });

  it('leaves a pipeline an auto-train process covers to that process', async () => {
    const covered = Pipeline();
    const demoted = Legacy(covered, 'Unevaluated', 'none');
    Process(demoted.ID, { ScheduleEnabled: true, AutoTrainPipelineID: covered });
    expect((await PreGateModelMigration.ReEvaluate(3, ctx)).Findings).toContainEqual({ PipelineID: covered, Kind: 'covered-by-auto-train' });
    expect(trainer.Runs(covered)).toEqual([]);
  });
});

describe('the registry step (g)', () => {
  it('runs nothing once no pre-change work remains', async () => {
    expect(await PreGateModelMigration.RunRegistryStep(PreGateModelMigration.DefaultConfig, ctx)).toBeNull();
  });

  it('records the processes it disabled, so a later run re-enables them', async () => {
    const pipelineId = Pipeline();
    const demoted = Legacy(pipelineId, 'Unevaluated', 'none');
    const plain = Process(demoted.ID, { ScheduleEnabled: true });
    const details = await PreGateModelMigration.RunRegistryStep(PreGateModelMigration.DefaultConfig, ctx);
    expect(details?.DisabledProcessIDs).toEqual([plain.ID]);
    expect(PreGateModelMigration.DisabledProcessIDsOf(JSON.stringify({ [PreGateModelMigration.DetailsKey]: details }))).toEqual([plain.ID]);
  });

  it('reads its configuration with the defaults of D4-22', () => {
    expect([PreGateModelMigration.ConfigFrom(null), PreGateModelMigration.ConfigFrom({ batchSize: 10, retrainPerRun: 1 }), PreGateModelMigration.ConfigFrom({ batchSize: -1 })])
      .toEqual([{ BatchSize: 50, RetrainPerRun: 3 }, { BatchSize: 10, RetrainPerRun: 1 }, { BatchSize: 50, RetrainPerRun: 3 }]);
  });

  it('recognises only the data section\'s two fixed reasons on an Unevaluated model as its mark (D4-13)', () => {
    expect([
      PreGateModelMigration.IsMigrationMark('Unevaluated', PreGateModelMigration.NotServingReason),
      PreGateModelMigration.IsMigrationMark('Unevaluated', PreGateModelMigration.ServingReason),
      PreGateModelMigration.IsMigrationMark('Unevaluated', 'archived by hand'),
      PreGateModelMigration.IsMigrationMark('Archived', PreGateModelMigration.NotServingReason),
    ]).toEqual([true, true, false, false]);
  });
});

describe('PredictiveStudio.MigratePreGateModels (RunPass)', () => {
  const seams = (): Parameters<typeof PreGateModelMigration.RunPass>[2] => ({
    Gate: gate, Publisher: new AutomatedPublisher(gate, new PublishNotifications()), Notifications: new PublishNotifications(), ScoringActions: scoringActions,
    Train: trainer.Train, UnitTask: async () => GATE_TASK,
  });

  it('a dry run counts the remaining work and writes nothing', async () => {
    const pipelineId = Pipeline();
    EvidenceBearing('Published');
    Process(Legacy(pipelineId, 'Unevaluated', 'none').ID, { ScheduleEnabled: true });
    const saves = store.SaveCount();
    const pass = await PreGateModelMigration.RunPass({ DryRun: true, ScheduledJobRunID: null, Config: PreGateModelMigration.DefaultConfig }, ctx, seams());
    expect([pass.Survey, pass.Details, store.SaveCount() - saves]).toEqual([{ EvidenceBearing: 1, UnverifiedArtifacts: 1, SchedulesToDisable: 1, PipelinesToReEvaluate: 1 }, null, 0]);
  });

  it('refuses a writing pass that is not a Registry Check job run, before any write', async () => {
    EvidenceBearing('Published');
    const saves = store.SaveCount();
    const monitoringRun = world.ScheduledJobRun(GateWorld.User.ID);
    await expect(PreGateModelMigration.RunPass({ DryRun: false, ScheduledJobRunID: monitoringRun.ID, Config: PreGateModelMigration.DefaultConfig }, ctx, seams()))
      .rejects.toThrow('Predictive Studio Registry Check');
    await expect(PreGateModelMigration.RunPass({ DryRun: false, ScheduledJobRunID: null, Config: PreGateModelMigration.DefaultConfig }, ctx, seams()))
      .rejects.toThrow('no scheduledJobRunId');
    expect(store.SaveCount() - saves).toBe(0);
  });

  it('refuses a writing pass naming a finished Registry Check run someone else executed, before any write', async () => {
    EvidenceBearing('Published');
    const saves = store.SaveCount();
    const past = { ID: id(), ScheduledJobID: registryRun.ScheduledJobID, Status: 'Completed', ExecutedByUserID: null, Details: null };
    store.Insert('MJ: Scheduled Job Runs', past);
    await expect(PreGateModelMigration.RunPass({ DryRun: false, ScheduledJobRunID: past.ID, Config: PreGateModelMigration.DefaultConfig }, ctx, seams()))
      .rejects.toThrow(`run ${past.ID} is Completed, not Running, and was not executed by the caller`);
    expect(store.SaveCount() - saves).toBe(0);
  });

  it('a writing pass may name a finished Registry Check run the caller executed', async () => {
    const pr3Good = EvidenceBearing('Published');
    const own = { ID: id(), ScheduledJobID: registryRun.ScheduledJobID, Status: 'Completed', ExecutedByUserID: GateWorld.User.ID, Details: null };
    store.Insert('MJ: Scheduled Job Runs', own);
    const pass = await PreGateModelMigration.RunPass({ DryRun: false, ScheduledJobRunID: own.ID, Config: PreGateModelMigration.DefaultConfig }, ctx, seams());
    expect(pass.Details?.Reverified.Adopted).toEqual([pr3Good.ID]);
  });

  it('a writing pass as the registry job run runs the step', async () => {
    const pr3Good = EvidenceBearing('Published');
    const pass = await PreGateModelMigration.RunPass({ DryRun: false, ScheduledJobRunID: registryRun.ID, Config: PreGateModelMigration.DefaultConfig }, ctx, seams());
    expect([pass.Details?.Reverified.Adopted, ModelOf(pr3Good.ID)['Status']]).toEqual([[pr3Good.ID], 'Published']);
  });
});
