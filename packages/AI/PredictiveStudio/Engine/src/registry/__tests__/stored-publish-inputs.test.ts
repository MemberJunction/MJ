/**
 * `StoredPublishInputsLoader` (Task M3.6 fix round 1, D4-108): the protocol version row a publish is re-derived under is
 * the database's, not a RunView cache's copy. Task M4.6 fix round 1 (D4-128): every stored input the publish's evidence
 * is built from is checked here, so a missing one is a `not-servable` refusal naming it, never the evidence builder's throw.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { UUIDsEqual } from '@memberjunction/global';
import { PublishRules, type Actor, type StoredPublishInputs, type TransitionRefusal } from '@memberjunction/predictive-studio-core';

import { FakeClock, GateTestStore, GateWorld, type Row, type WorldModel } from '../../__tests__/fakes/gate-test-store';
import { RecordingScoringActions } from '../../__tests__/fakes/scoring-action-fakes';
import { MemoryStorageAccount, ProviderRow, RegisterMemoryStorage, ServeStorageProviders } from '../../__tests__/fakes/storage-fakes';
import { StorageProviderArtifactLoader } from '../../scoring/storage-provider-artifact-loader';
import { GateContexts } from '../gate-seams';
import { LifecycleGate } from '../lifecycle-gate';
import { StoredPublishInputsLoader, StoredRuns } from '../stored-publish-inputs';

const human: Actor = { kind: 'human', userId: GateWorld.User.ID };

describe('StoredPublishInputsLoader.Load — the pinned protocol row', () => {
  it('a protocol row changed under the loader (the cache still holds the old copy) is read as the database holds it', async () => {
    const store = new GateTestStore();
    const world = new GateWorld(store, new MemoryStorageAccount('stored-publish-inputs', []));
    const model = world.Model('Validated', 'model');
    const protocolId = String(store.Row('MJ: ML Training Runs', model.RunID)?.['EvaluationProtocolID']);
    const row = store.Row('MJ: ML Evaluation Protocols', protocolId);
    if (!row) throw new Error('the model has no protocol row');
    // The cache keeps the row as it was read; the database row is then changed out of band (margin 0 → 0.08, sign-off).
    const stale: Row = { ...row };
    store.CachedTables['MJ: ML Evaluation Protocols'] = [stale];
    row['Promotion'] = JSON.stringify({ ...GateTestStore.JsonObjectColumn(row, 'Promotion'), margin: 0.08, requiresHumanSignOff: true });
    const ctx = { ContextUser: GateWorld.User, Provider: store.Provider() };
    const loaded = await StoredPublishInputsLoader.Load(model.ID, human, ctx);
    if ('kind' in loaded) throw new Error(`the loader refused: ${loaded.kind}`);
    expect(loaded.ProtocolRow.Promotion).toMatchObject({ margin: 0.08, requiresHumanSignOff: true });
    expect((await StoredRuns.ReadProtocol(protocolId, ctx))?.Spec.promotion).toMatchObject({ margin: 0.08, requiresHumanSignOff: true });
  });
});

describe('StoredPublishInputsLoader.Load — the inputs the evidence is built from (D4-128)', () => {
  let store: GateTestStore;
  let model: WorldModel;

  beforeEach(() => {
    store = new GateTestStore();
    model = new GateWorld(store, new MemoryStorageAccount('stored-publish-inputs-evidence', [])).Model('Validated', 'model');
  });

  /** The loader's answer for the model. */
  async function load(): Promise<StoredPublishInputs | TransitionRefusal> {
    return StoredPublishInputsLoader.Load(model.ID, human, { ContextUser: GateWorld.User, Provider: store.Provider() });
  }

  /** The stored row of `entityName` with `id`; throws when the world has none. */
  function rowOf(entityName: string, id: string): Row {
    const row = store.Row(entityName, id);
    if (!row) throw new Error(`no ${entityName} row ${id}`);
    return row;
  }

  /** Rewrites one member of the run's stored `ValidationResults` envelope to null. */
  function nullEnvelopeMember(member: 'gate' | 'trainer'): void {
    const run = rowOf('MJ: ML Training Runs', model.RunID);
    run['ValidationResults'] = JSON.stringify({ ...GateTestStore.JsonObjectColumn(run, 'ValidationResults'), [member]: null });
  }

  const runReason = (): TransitionRefusal => ({ kind: 'not-servable', reason: `ML Model ${model.ID} has no stored training run with a gate record and trainer result` });

  it('a model with no training run is not-servable, naming the run', async () => {
    rowOf('MJ: ML Models', model.ID)['TrainingRunID'] = null;
    expect(await load()).toEqual(runReason());
  });

  it('a run with no stored gate record is not-servable, naming the gate record', async () => {
    nullEnvelopeMember('gate');
    expect(await load()).toEqual(runReason());
  });

  it('a run with no stored trainer result is not-servable, naming the trainer result', async () => {
    nullEnvelopeMember('trainer');
    expect(await load()).toEqual(runReason());
  });

  it('a model that names no Training Snapshot is not-servable, naming the snapshot', async () => {
    rowOf('MJ: ML Models', model.ID)['TrainingSnapshotID'] = null;
    expect(await load()).toEqual({ kind: 'not-servable', reason: `ML Model ${model.ID} names no Training Snapshot to build evidence from` });
  });

  it('a model whose Training Snapshot row is gone is not-servable, naming the snapshot', async () => {
    const snapshotId = String(rowOf('MJ: ML Models', model.ID)['TrainingSnapshotID']);
    store.Tables['MJ: ML Training Snapshots'] = (store.Tables['MJ: ML Training Snapshots'] || []).filter((r) => !UUIDsEqual(String(r['ID']), snapshotId));
    expect(await load()).toEqual({ kind: 'not-servable', reason: `Training Snapshot ${snapshotId} that ML Model ${model.ID} names does not exist, so no evidence can be built from it` });
  });
});

/**
 * PR 5 milestone B3 — attacks 4 and 8 (publish half, D5-31, F-005): `StoredPublishInputs.PinActivations` is loaded from
 * the model's lineage pins and their version rows; `PublishRules.ReverifyPublish` refuses `validated → published` for a
 * model pinned to a gated version with no passing golden-set result, and every publish path (they all end in
 * `LifecycleGate.Publish`: `AutomatedPublisher`, the Promote Action, the operation) is refused with
 * `feature-version-not-activated`; an ungated version is activated and publishes.
 */
describe('StoredPublishInputsLoader.Load / ReverifyPublish — pinned Feature Pipeline versions (B3, attacks 4 and 8)', () => {
  const RP = 'B3000000-0000-4000-8000-0000000000B1';
  const pin = { featurePipelineRecordProcessId: RP, pipelineVersion: 3, promptVersionHash: 'pvh-3', aiModelId: null, parametersHash: 'ph-3' };
  const providerRow = ProviderRow(GateWorld.StorageProviderID, 'Gate Test Storage', 'PS Lifecycle Gate Test Storage', true);
  const storage = new MemoryStorageAccount('stored-publish-inputs-pins', []);
  RegisterMemoryStorage('PS Lifecycle Gate Test Storage', storage);
  let store: GateTestStore;
  let model: WorldModel;

  /** The model's lineage pins `GateJobTitle` to version 3, whose row is gated (or not) with a result of `result`. */
  function pinVersion(gated: boolean, result: number | null): void {
    const row = store.Row('MJ: ML Models', model.ID);
    if (!row) throw new Error('no model row');
    row['Lineage'] = JSON.stringify({
      predictionUnitId: 'unit-1', predictionUnitVersion: 1, labelVersion: 1, featureSpecVersion: 1, unitRowEntity: 'Memberships', categoryLevels: {},
      trainingSnapshotId: 'snap-1', snapshotContentHash: 'hash-1',
      featureSpec: [{ name: 'GateJobTitle', source: { kind: 'feature-value', featureName: 'GateJobTitle', pin }, encoding: { kind: 'categorical', cardinalityCap: 50, method: 'onehot' }, missing: { impute: 'mode', indicator: true, constant: null } }],
    });
    store.Tables['MJ: Feature Pipeline Versions'] = [{
      ID: 'ver-3', RecordProcessID: RP, Version: 3, Status: 'Active', Gated: gated, Threshold: gated ? 0.9 : null, ResultValue: result,
      GoldenSetTestRunID: result === null ? null : 'gs-3', ResultDetails: null,
    }];
  }

  beforeEach(() => {
    storage.Reset();
    ServeStorageProviders([providerRow]);
    store = new GateTestStore();
    model = new GateWorld(store, storage).Model('Validated', 'model');
  });

  const ctx = (): { ContextUser: typeof GateWorld.User; Provider: ReturnType<GateTestStore['Provider']> } => ({ ContextUser: GateWorld.User, Provider: store.Provider() });

  it('loads one PinActivations entry per pinned version: a gated version below its threshold is not activated', async () => {
    pinVersion(true, 0.5);
    const loaded = await StoredPublishInputsLoader.Load(model.ID, human, ctx());
    if ('kind' in loaded) throw new Error(`the loader refused: ${loaded.kind}`);
    expect(loaded.PinActivations).toEqual([{ featureName: 'GateJobTitle', pipelineVersion: 3, activated: false }]);
    expect(PublishRules.ReverifyPublish(loaded)).toMatchObject({ Ok: false, Reason: 'feature-version-not-activated' });
  });

  it('attack 8: an ungated version (no golden set) is activated', async () => {
    pinVersion(false, null);
    const loaded = await StoredPublishInputsLoader.Load(model.ID, human, ctx());
    if ('kind' in loaded) throw new Error(`the loader refused: ${loaded.kind}`);
    expect(loaded.PinActivations).toEqual([{ featureName: 'GateJobTitle', pipelineVersion: 3, activated: true }]);
    expect(PublishRules.ReverifyPublish(loaded).Ok).toBe(true);
  });

  it('a pinned version whose row is gone is not activated', async () => {
    pinVersion(false, null);
    store.Tables['MJ: Feature Pipeline Versions'] = [];
    const loaded = await StoredPublishInputsLoader.Load(model.ID, human, ctx());
    if ('kind' in loaded) throw new Error(`the loader refused: ${loaded.kind}`);
    expect(loaded.PinActivations).toEqual([{ featureName: 'GateJobTitle', pipelineVersion: 3, activated: false }]);
  });

  it('a model with no lineage pins has no PinActivations', async () => {
    const loaded = await StoredPublishInputsLoader.Load(model.ID, human, ctx());
    if ('kind' in loaded) throw new Error(`the loader refused: ${loaded.kind}`);
    expect(loaded.PinActivations).toEqual([]);
  });

  it('attack 4: LifecycleGate.Publish (every publish path) withholds the publish with feature-version-not-activated', async () => {
    pinVersion(true, 0.5);
    const gate = new LifecycleGate(new StorageProviderArtifactLoader(), new FakeClock(), new RecordingScoringActions());
    const out = await gate.Publish({ modelId: model.ID, purpose: 'publish', initiator: human, signOffId: null, reason: null }, GateContexts.ForRequest(ctx()));
    expect(out).toMatchObject({ Kind: 'withheld', Refusal: { kind: 'feature-version-not-activated', featureName: 'GateJobTitle', pipelineVersion: 3 } });
    expect(store.Status(model.ID)).toBe('Validated');
  });

  it('attack 8: an ungated pinned version publishes', async () => {
    pinVersion(false, null);
    const gate = new LifecycleGate(new StorageProviderArtifactLoader(), new FakeClock(), new RecordingScoringActions());
    const out = await gate.Publish({ modelId: model.ID, purpose: 'publish', initiator: human, signOffId: null, reason: null }, GateContexts.ForRequest(ctx()));
    expect(out).toMatchObject({ Kind: 'published' });
  });
});
