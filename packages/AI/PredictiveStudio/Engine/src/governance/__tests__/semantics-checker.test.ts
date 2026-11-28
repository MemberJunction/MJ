/**
 * `SemanticsChecker` and `StoredSemanticsCheck` (Task M4.2): a model's output-binding rows checked against its
 * `OutputSemantics` — the adapter over Core's `SemanticsRules.Check`, and the gate seam that reads the rows past the
 * RunView cache.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { RunView } from '@memberjunction/core';
import type { MJMLModelEntity } from '@memberjunction/core-entities';
import { SemanticsRules, type OutputSemantics } from '@memberjunction/predictive-studio-core';

import { GateTestStore, GateWorld, type WorldModel } from '../../__tests__/fakes/gate-test-store';
import { MemoryStorageAccount } from '../../__tests__/fakes/storage-fakes';
import { GateContexts } from '../../registry/gate-seams';
import { SemanticsChecker, StoredSemanticsCheck, type OutputBindingColumns } from '../semantics-checker';

const MODEL_ID = '7A2B3C4D-0000-4000-8000-0000000000E1';
const c3: OutputSemantics = { task: { kind: 'multiclass', classOrder: ['Bronze', 'Silver', 'Gold'], adverseIndices: [0] } };

/** The default rows of `semantics` as stored rows of the model. */
function StoredRows(semantics: OutputSemantics): OutputBindingColumns[] {
  return SemanticsRules.DefaultBindings(semantics).map((b, i) => ({ ID: `7A2B3C4D-0000-4000-8000-00000000F00${i}`, ModelID: MODEL_ID, ...b }));
}

describe('SemanticsChecker.Run', () => {
  it("passes the default rows, carrying the parsed semantics and each row's ID", () => {
    const rows = StoredRows(c3);
    const check = SemanticsChecker.Run({ ID: MODEL_ID, OutputSemantics: JSON.stringify(c3) }, rows);
    expect(check).toMatchObject({ ModelID: MODEL_ID, Semantics: c3, BindingSource: 'MJ: ML Output Bindings', Result: { Status: 'passed' } });
    expect(check.UIBindings.map((b) => b.BindingID)).toEqual(rows.map((r) => r.ID));
  });
  it('fails a row that breaks the semantics with the rule’s words', () => {
    const rows = StoredRows(c3).map((r) => (r.Surface === 'at-risk-list' ? { ...r, Label: 'Gold risk' } : r));
    expect(SemanticsChecker.Run({ ID: MODEL_ID, OutputSemantics: JSON.stringify(c3) }, rows).Result).toEqual({
      Status: 'failed', Mismatches: ['at-risk-list: Label is "Gold risk", the semantics require a label naming Bronze and no other class'],
    });
  });
  it('fails, never throws, for semantics that are absent or do not parse', () => {
    const absent = SemanticsChecker.Run({ ID: MODEL_ID, OutputSemantics: null }, StoredRows(c3));
    expect(absent).toMatchObject({ Semantics: null, Result: { Status: 'failed', Mismatches: [expect.stringMatching(/^OutputSemantics: /)] } });
    const unparseable = SemanticsChecker.Run({ ID: MODEL_ID, OutputSemantics: '{"task":{"kind":"sideways"}}' }, []);
    expect(unparseable.Result).toEqual({ Status: 'failed', Mismatches: ['OutputSemantics: TaskType kind "sideways" is not one of binary, multiclass, continuous, count, non-negative, forecast'] });
  });
});

describe('StoredSemanticsCheck', () => {
  let store: GateTestStore;
  let model: WorldModel;
  beforeEach(() => {
    store = new GateTestStore();
    model = new GateWorld(store, new MemoryStorageAccount('semantics', [])).Model('Validated', 'model');
  });
  const ctx = () => GateContexts.ForRequest({ ContextUser: GateWorld.User, Provider: store.Provider() });
  const row = async (): Promise<MJMLModelEntity> =>
    (await RunView.FromMetadataProvider(ctx().Provider).RunView<MJMLModelEntity>({ EntityName: 'MJ: ML Models', ExtraFilter: `ID='${model.ID}'`, ResultType: 'entity_object' }, GateWorld.User)).Results[0];

  it("reads the model's binding rows past the RunView cache and checks them", async () => {
    const check = await new StoredSemanticsCheck().Check(await row(), ctx());
    expect(check).toMatchObject({ ModelID: model.ID, Semantics: { task: { kind: 'binary' } }, Result: { Status: 'passed' } });
    expect(check.UIBindings).toHaveLength(4);
    expect(store.ViewReads.filter((r) => r.EntityName === 'MJ: ML Output Bindings')).toEqual([{ EntityName: 'MJ: ML Output Bindings', BypassCache: true }]);
  });
  it('throws on a failed read rather than checking no rows', async () => {
    store.ReadLog.FailNext('MJ: ML Output Bindings');
    await expect(new StoredSemanticsCheck().Check(await row(), ctx())).rejects.toThrow(`Reading the output bindings of ML Model ${model.ID} failed`);
  });
});
