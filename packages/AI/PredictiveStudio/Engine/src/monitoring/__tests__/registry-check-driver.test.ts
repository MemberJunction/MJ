/**
 * Task M6.4 — the registry check (§5.7 R6, R7; D4-19, D4-20) over the real lifecycle gate and the `GateTestStore`
 * world: each finding is remediated through the gate and recorded with its action.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { MJScheduledJobEntity, MJScheduledJobRunEntity } from '@memberjunction/core-entities';
import type { Actor } from '@memberjunction/predictive-studio-core';
import type { ScheduledJobExecutionContext } from '@memberjunction/scheduling-engine';

import { FakeClock, GateTestStore, GateWorld, type WorldModel } from '../../__tests__/fakes/gate-test-store';
import { RecordingScoringActions } from '../../__tests__/fakes/scoring-action-fakes';
import { MemoryStorageAccount, ProviderRow, RegisterMemoryStorage, ServeStorageProviders } from '../../__tests__/fakes/storage-fakes';
import type { GateContext } from '../../registry/gate-context';
import { GateContexts } from '../../registry/gate-seams';
import { LifecycleGate } from '../../registry/lifecycle-gate';
import { PreGateModelMigration } from '../../migration/pre-gate-model-migration';
import { StorageProviderArtifactLoader } from '../../scoring/storage-provider-artifact-loader';
import { SnapshotHash } from '../../snapshot/snapshot-hash';
import { PredictiveStudioRegistryCheckJobDriver, VIEW_GATE_FILTER_NAME, type IRegistryScoringActions, type RegistryCheckConfiguration, type RegistryFinding } from '../registry-check-driver';
import { WorldNotifier, WorldPublisher } from './monitoring-world';

const log: string[] = [];
const storage = new MemoryStorageAccount('registry-check', log);
RegisterMemoryStorage('PS Registry Check Storage', storage);
const providerRow = ProviderRow(GateWorld.StorageProviderID, 'Registry Check Storage', 'PS Registry Check Storage', true);
const JOB_RUN = '7A2B3C4D-0000-4000-8000-0000000000D1';
const registryJob: Actor = { kind: 'scheduled-job', scheduledJobRunId: JOB_RUN };
const agent: Actor = { kind: 'agent', agentRunId: '7A2B3C4D-0000-4000-8000-0000000000D2' };

/** Scoring actions every model has, unless named missing. */
class ScoringActionsDouble implements IRegistryScoringActions {
  public readonly Missing = new Set<string>();
  public readonly Generated: string[] = [];
  public async HasActiveAction(modelId: string): Promise<boolean> {
    return !this.Missing.has(modelId);
  }
  public async Generate(model: { readonly ID: string }): Promise<void> {
    this.Generated.push(model.ID);
    this.Missing.delete(model.ID);
  }
}

let store: GateTestStore;
let world: GateWorld;
let gate: LifecycleGate;
let ctx: GateContext;
let now: Date;
let trainer: WorldPublisher;
let actions: ScoringActionsDouble;
let notifier: WorldNotifier;
let driver: PredictiveStudioRegistryCheckJobDriver;

beforeEach(() => {
  storage.Reset();
  ServeStorageProviders([providerRow]);
  store = new GateTestStore();
  world = new GateWorld(store, storage);
  gate = new LifecycleGate(new StorageProviderArtifactLoader(), new FakeClock(), new RecordingScoringActions());
  ctx = GateContexts.ForRequest({ ContextUser: GateWorld.User, Provider: store.Provider() });
  now = new Date();
  trainer = new WorldPublisher();
  actions = new ScoringActionsDouble();
  notifier = new WorldNotifier();
  driver = new PredictiveStudioRegistryCheckJobDriver({ Gate: gate, Publisher: trainer, ArtifactLoader: new StorageProviderArtifactLoader(), ScoringActions: actions, Notifier: notifier, Clock: { Now: () => now } });
});

/** A model published through the gate. */
async function Published(o: { readonly IncumbentID?: string } = {}): Promise<WorldModel> {
  const model = world.Model('Validated', 'model', o);
  const outcome = await gate.Publish({ modelId: model.ID, purpose: 'publish', initiator: agent, signOffId: null, reason: null }, ctx);
  if (outcome.Kind !== 'published') throw new Error(`the test model did not publish: ${JSON.stringify(outcome)}`);
  return model;
}

/** The driver with step (g) and step (a) recording the order they ran in. */
class OrderRecordingDriver extends PredictiveStudioRegistryCheckJobDriver {
  public readonly Order: string[] = [];
  protected override async MigratePreChangeModels(...args: Parameters<PredictiveStudioRegistryCheckJobDriver['MigratePreChangeModels']>): ReturnType<PredictiveStudioRegistryCheckJobDriver['MigratePreChangeModels']> {
    this.Order.push('g');
    return super.MigratePreChangeModels(...args);
  }
  protected override async ArchiveOutsideGatePublishes(...args: Parameters<PredictiveStudioRegistryCheckJobDriver['ArchiveOutsideGatePublishes']>): Promise<RegistryFinding[]> {
    this.Order.push('a');
    return super.ArchiveOutsideGatePublishes(...args);
  }
}

/** A job run of the registry check with `configuration` as its `Configuration`. */
async function JobContext(configuration: string): Promise<ScheduledJobExecutionContext> {
  const schedule = await store.Provider().GetEntityObject<MJScheduledJobEntity>('MJ: Scheduled Jobs', GateWorld.User);
  schedule.Name = 'registry check';
  schedule.Configuration = configuration;
  const run = await store.Provider().GetEntityObject<MJScheduledJobRunEntity>('MJ: Scheduled Job Runs', GateWorld.User);
  run.ID = JOB_RUN;
  return { Schedule: schedule, Run: run, ContextUser: GateWorld.User, Provider: store.Provider() };
}

/**
 * A pre-change model as the serving migration's data section leaves a legacy serving one: `Unevaluated`, flagged
 * serving, no registry entry, its #5001-era artifact under a provider key, on a pipeline that names no Prediction Unit.
 */
function LegacyServing(): { readonly ID: string; readonly PipelineID: string; readonly Bytes: Uint8Array } {
  const pipelineId = '7A2B3C4D-0000-4000-8000-0000000000E1';
  const modelId = '7A2B3C4D-0000-4000-8000-0000000000E2';
  const fileId = '7A2B3C4D-0000-4000-8000-0000000000E3';
  const bytes = new TextEncoder().encode(`legacy artifact of ${modelId}`);
  store.Insert('MJ: ML Training Pipelines', { ID: pipelineId, Name: 'legacy pipeline', PredictionUnitID: null, EvaluationProtocolID: null, TargetEntityID: null, TargetEntity: null, __mj_UpdatedAt: new Date('2025-01-01T00:00:00Z') });
  storage.Objects.set(`legacy/${fileId}`, bytes);
  store.Insert('MJ: Files', { ID: fileId, ProviderID: GateWorld.StorageProviderID, ProviderKey: `legacy/${fileId}` });
  store.Insert('MJ: ML Models', {
    ID: modelId, PipelineID: pipelineId, Version: 1, Status: 'Unevaluated', StatusReason: PreGateModelMigration.ServingReason, TrainingRunID: null, Delivery: null,
    ArtifactFileID: fileId, ArtifactSha256: null, ArtifactStatus: 'unverified', ArtifactCheckedAt: null, Lineage: null, ServingWhileUnevaluated: true, __mj_UpdatedAt: new Date('2026-01-01T00:00:00Z'),
  });
  return { ID: modelId, PipelineID: pipelineId, Bytes: bytes };
}

const Run = (): Promise<RegistryFinding[]> => driver.RunChecks(PredictiveStudioRegistryCheckJobDriver.ReadConfiguration(null), registryJob, ctx);
const rollbacks = (modelId: string) => store.PublishRecords(modelId).filter((r) => r['Kind'] === 'publish' && r['Purpose'] === 'rollback');

describe('PredictiveStudioRegistryCheckJobDriver', () => {
  it('a Published row set outside the gate is archived and the previous model rolled back', async () => {
    const previous = await Published();
    await gate.Archive(previous.ID, 'retired', agent, ctx);
    const intruder = world.Model('Validated', 'model');
    store.SetStatus(intruder.ID, 'Published');
    const findings = await Run();
    expect([store.Status(intruder.ID), store.Status(previous.ID)]).toEqual(['Archived', 'Published']);
    expect(rollbacks(previous.ID)).toHaveLength(1);
    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ Finding: 'a', SubjectID: intruder.ID, Outcome: 'remediated', Action: 'archived by the lifecycle gate' }),
      expect.objectContaining({ Finding: 'a', SubjectID: previous.ID, Outcome: 'remediated', Action: expect.stringContaining('rolled back') }),
    ]));
  });

  it('a Published model backed by an applied adopt record is not archived (D-m6-3: adopt backs it as publish does)', async () => {
    const adopted = await Published();
    for (const r of store.PublishRecords(adopted.ID)) if (r['Kind'] === 'publish') r['Purpose'] = 'adopt';
    const findings = await Run();
    expect(store.Status(adopted.ID)).toBe('Published');
    expect(findings.filter((f) => f.SubjectID === adopted.ID && (f.Finding === 'a' || f.Finding === 'h' || f.Finding === 'b'))).toEqual([]);
  });

  it('two Published models with publish records: the newest stays', async () => {
    const older = await Published();
    const newer = await Published({ IncumbentID: older.ID });
    store.SetStatus(older.ID, 'Published');
    await Run();
    expect([store.Status(older.ID), store.Status(newer.ID)]).toEqual(['Archived', 'Published']);
  });

  it('a Published model reset to Validated outside the gate is restored with no second publish record', async () => {
    const published = await Published();
    store.SetStatus(published.ID, 'Validated');
    const findings = await Run();
    expect(store.Status(published.ID)).toBe('Published');
    expect(store.PublishRecords(published.ID).filter((r) => r['Kind'] === 'publish')).toHaveLength(1);
    expect(findings).toEqual(expect.arrayContaining([expect.objectContaining({ Finding: 'b', SubjectID: published.ID, Outcome: 'remediated' })]));
  });

  it('a Published model whose stored object is gone: the previous model rolled back and one training run started', async () => {
    const previous = await Published();
    const published = await Published({ IncumbentID: previous.ID });
    const fileId = String(store.Row('MJ: ML Models', published.ID)?.['ArtifactFileID']);
    storage.Objects.delete(`artifacts/${fileId}`);
    const pipeline = store.Row('MJ: ML Training Pipelines', GateWorld.PipelineID);
    if (pipeline) pipeline['EvaluationProtocolID'] = 'protocol-bound';
    await Run();
    expect([store.Status(published.ID), store.Status(previous.ID), trainer.Trained.length]).toEqual(['Archived', 'Published', 1]);
    expect(trainer.Published[0].Initiator).toEqual(registryJob);
  });

  it('closes a sign-off wait 31 days after the withheld attempt; the incumbent is untouched', async () => {
    const incumbent = await Published();
    const waiting = world.Model('Validated', 'model', { IncumbentID: incumbent.ID });
    world.PinProtocol(waiting.ID, { requiresHumanSignOff: true });
    const withheld = await gate.Publish({ modelId: waiting.ID, purpose: 'publish', initiator: registryJob, signOffId: null, reason: null }, ctx);
    expect(withheld).toMatchObject({ Kind: 'withheld', Refusal: { kind: 'no-sign-off' } });
    now = new Date(Date.now() + 31 * 86_400_000);
    await Run();
    expect(store.PublishRecords(waiting.ID).at(-1)).toMatchObject({ Kind: 'refusal', Refusal: expect.stringContaining('sign-off-wait-closed') });
    expect([store.Status(waiting.ID), store.Status(incumbent.ID)]).toEqual(['Archived', 'Published']);
  });

  it('leaves a sign-off wait open before its expiry', async () => {
    const incumbent = await Published();
    const waiting = world.Model('Validated', 'model', { IncumbentID: incumbent.ID });
    world.PinProtocol(waiting.ID, { requiresHumanSignOff: true });
    await gate.Publish({ modelId: waiting.ID, purpose: 'publish', initiator: registryJob, signOffId: null, reason: null }, ctx);
    now = new Date(Date.now() + 5 * 86_400_000);
    await Run();
    expect(store.Status(waiting.ID)).toBe('Validated');
  });

  it('re-attaches the view gate to a read permission without it', async () => {
    store.Insert('MJ: Row Level Security Filters', { ID: 'F0000000-0000-4000-8000-000000000001', Name: VIEW_GATE_FILTER_NAME });
    store.Insert('MJ: Entity Permissions', { ID: 'F0000000-0000-4000-8000-000000000002', Entity: 'MJ: Latest Feature Values', EntityID: 'E1', RoleID: 'Analyst', CanRead: true, ReadRLSFilterID: null });
    await Run();
    expect(store.Row('MJ: Entity Permissions', 'F0000000-0000-4000-8000-000000000002')?.['ReadRLSFilterID']).toBe('F0000000-0000-4000-8000-000000000001');
  });

  it('fails a scoring run running for more than six hours, and leaves a younger one running', async () => {
    store.Insert('MJ: ML Scoring Runs', { ID: 'A1000000-0000-4000-8000-000000000001', Status: 'running', StartedAt: new Date(now.getTime() - 7 * 3_600_000) });
    store.Insert('MJ: ML Scoring Runs', { ID: 'A1000000-0000-4000-8000-000000000002', Status: 'running', StartedAt: new Date(now.getTime() - 1 * 3_600_000) });
    await Run();
    expect([store.Row('MJ: ML Scoring Runs', 'A1000000-0000-4000-8000-000000000001')?.['Status'], store.Row('MJ: ML Scoring Runs', 'A1000000-0000-4000-8000-000000000002')?.['Status']]).toEqual(['failed', 'running']);
  });

  it('re-syncs a Published model without an active scoring Action', async () => {
    const published = await Published();
    actions.Missing.add(published.ID);
    await Run();
    expect(actions.Generated).toEqual([published.ID]);
  });

  it('records a publish record whose model is Draft, and changes nothing', async () => {
    const published = await Published();
    store.SetStatus(published.ID, 'Draft');
    const findings = await Run();
    expect(findings).toEqual(expect.arrayContaining([expect.objectContaining({ Finding: 'h', Outcome: 'recorded' })]));
    expect(store.Status(published.ID)).toBe('Draft');
  });

  it('a clean registry has no findings beyond the missing view gate filter', async () => {
    await Published();
    const findings = await Run();
    expect(findings.map((f) => f.Finding)).toEqual(['i']);
  });

  describe('step (g): the pre-change model migration', () => {
    it('step (g) runs before (a) and its Details carry the migration\'s record', async () => {
      const legacy = LegacyServing();
      const ordered = new OrderRecordingDriver({ Gate: gate, Publisher: trainer, ArtifactLoader: new StorageProviderArtifactLoader(), ScoringActions: actions, Notifier: notifier, Clock: { Now: () => now }, Migration: { Gate: gate } });
      const result = await ordered.Execute(await JobContext(JSON.stringify({ migration: { batchSize: 50, retrainPerRun: 3 } })));
      expect(ordered.Order).toEqual(['g', 'a']);
      expect(store.Row('MJ: ML Models', legacy.ID)).toMatchObject({ Status: 'Unevaluated', ServingWhileUnevaluated: true, ArtifactStatus: 'verified', ArtifactSha256: SnapshotHash.Sha256Hex(legacy.Bytes) });
      expect(result.Details?.[PreGateModelMigration.DetailsKey]).toMatchObject({
        Artifacts: { Verified: [legacy.ID] },
        ReEvaluation: { Trained: 0, Findings: [{ PipelineID: legacy.PipelineID, Kind: 'no-prediction-unit' }] },
        DisabledProcessIDs: [],
      });
    });

    it('records nothing under the migration\'s key once no pre-change work remains', async () => {
      await Published();
      const result = await driver.Execute(await JobContext('{}'));
      expect(result.Details).not.toHaveProperty(PreGateModelMigration.DetailsKey);
    });

    it('reads Configuration.migration with the defaults of D4-22', () => {
      const read = (text: string | null): RegistryCheckConfiguration['Migration'] => PredictiveStudioRegistryCheckJobDriver.ReadConfiguration(text).Migration;
      expect([read(null), read(JSON.stringify({ migration: { batchSize: 10, retrainPerRun: 0 } })), read(JSON.stringify({ migration: { batchSize: -1 } }))]).toEqual([
        { BatchSize: 50, RetrainPerRun: 3 }, { BatchSize: 10, RetrainPerRun: 0 }, { BatchSize: 50, RetrainPerRun: 3 },
      ]);
    });
  });
});
