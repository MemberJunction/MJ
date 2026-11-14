/**
 * `StoredPublishInputsLoader` (Task M3.6 fix round 1, D4-108): the protocol version row a publish is re-derived under is
 * the database's, not a RunView cache's copy.
 */
import { describe, expect, it } from 'vitest';
import type { Actor } from '@memberjunction/predictive-studio-core';

import { GateTestStore, GateWorld, type Row } from '../../__tests__/fakes/gate-test-store';
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
