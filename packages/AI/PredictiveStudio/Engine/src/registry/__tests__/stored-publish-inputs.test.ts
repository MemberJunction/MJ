/**
 * `StoredPublishInputsLoader` (Task M3.6 fix round 1, D4-108): the protocol version row a publish is re-derived under is
 * the database's, not a RunView cache's copy. Task M4.6 fix round 1 (D4-128): every stored input the publish's evidence
 * is built from is checked here, so a missing one is a `not-servable` refusal naming it, never the evidence builder's throw.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { UUIDsEqual } from '@memberjunction/global';
import type { Actor, StoredPublishInputs, TransitionRefusal } from '@memberjunction/predictive-studio-core';

import { GateTestStore, GateWorld, type Row, type WorldModel } from '../../__tests__/fakes/gate-test-store';
import { MemoryStorageAccount } from '../../__tests__/fakes/storage-fakes';
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
