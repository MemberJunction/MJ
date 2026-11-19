/**
 * Task M6.4 — the registry check (§5.7 R6, R7; D4-19, D4-20) over the real lifecycle gate and the `GateTestStore`
 * world: each finding is remediated through the gate and recorded with its action.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { Actor } from '@memberjunction/predictive-studio-core';

import { FakeClock, GateTestStore, GateWorld, type WorldModel } from '../../__tests__/fakes/gate-test-store';
import { RecordingScoringActions } from '../../__tests__/fakes/scoring-action-fakes';
import { MemoryStorageAccount, ProviderRow, RegisterMemoryStorage, ServeStorageProviders } from '../../__tests__/fakes/storage-fakes';
import type { GateContext } from '../../registry/gate-context';
import { GateContexts } from '../../registry/gate-seams';
import { LifecycleGate } from '../../registry/lifecycle-gate';
import { StorageProviderArtifactLoader } from '../../scoring/storage-provider-artifact-loader';
import { PredictiveStudioRegistryCheckJobDriver, VIEW_GATE_FILTER_NAME, type IRegistryScoringActions, type RegistryFinding } from '../registry-check-driver';
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
});
