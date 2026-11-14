/** M3's gate seams (Task M3.2): the stored-rows evidence builder, the always-passing semantics check, the empty sign-off lookup. */
import { beforeEach, describe, expect, it } from 'vitest';
import type { MJMLModelEntity } from '@memberjunction/core-entities';
import { RunView } from '@memberjunction/core';

import { GateTestStore, GateWorld } from '../../__tests__/fakes/gate-test-store';
import { MemoryStorageAccount } from '../../__tests__/fakes/storage-fakes';
import { GateContexts, NoSignOffLookup, PassingSemanticsCheck, StoredRowsEvidenceBuilder } from '../gate-seams';

let store: GateTestStore;
let world: GateWorld;
beforeEach(() => {
  store = new GateTestStore();
  world = new GateWorld(store, new MemoryStorageAccount('seams', []));
});
const ctx = () => GateContexts.ForRequest({ ContextUser: GateWorld.User, Provider: store.Provider() });

describe('StoredRowsEvidenceBuilder', () => {
  it("builds the evidence from stored rows: the kept member's holdout score for keep-simple-baseline", async () => {
    const keep = world.Model('KeepBaseline', 'keep');
    const e = await new StoredRowsEvidenceBuilder().Build(keep.ID, ctx());
    expect(e).toMatchObject({ holdoutPrimary: { metric: 'log-loss', value: 0.455 }, gate: { outcome: 'keep-simple-baseline', shipped: 'glm' }, leakageFlags: [], dataWindow: { from: '2026-01-01', to: '2026-01-01' }, snapshotHash: 'a'.repeat(64) });
    expect(Object.keys(e.comparisons)).toContain('modelVsDummy');
  });
  it("uses the finalist's holdout score for a model outcome, and refuses a model with no stored run", async () => {
    const m = world.Model('Validated', 'model');
    expect((await new StoredRowsEvidenceBuilder().Build(m.ID, ctx())).holdoutPrimary).toMatchObject({ value: 0.452 });
    const row = store.Row('MJ: ML Models', m.ID);
    if (row) row['TrainingRunID'] = null;
    await expect(new StoredRowsEvidenceBuilder().Build(m.ID, ctx())).rejects.toThrow('has no stored training run');
  });
});

describe('PassingSemanticsCheck and NoSignOffLookup (M3 placeholders; M4 replaces them)', () => {
  it('passes with the model semantics and no bindings; finds no sign-off', async () => {
    const m = world.Model('Validated', 'model');
    const model = (await RunView.FromMetadataProvider(ctx().Provider).RunView<MJMLModelEntity>({ EntityName: 'MJ: ML Models', ExtraFilter: `ID='${m.ID}'`, ResultType: 'entity_object' }, GateWorld.User)).Results[0];
    expect(await new PassingSemanticsCheck().Check(model, ctx())).toMatchObject({ ModelID: m.ID, Semantics: { task: { kind: 'binary' } }, UIBindings: [], Result: { Status: 'passed' } });
    expect(await new NoSignOffLookup().FindApproving()).toBeNull();
  });
});
