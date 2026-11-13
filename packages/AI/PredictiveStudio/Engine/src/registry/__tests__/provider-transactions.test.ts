/**
 * `ProviderTransactions.Run` (D4-92): the one transaction helper of the lifecycle gate and the trainer's model-row save.
 * It refuses a provider with no server-side transactions instead of running the locks without one.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GateTestStore, GateWorld } from '../../__tests__/fakes/gate-test-store';
import { MemoryStorageAccount } from '../../__tests__/fakes/storage-fakes';
import { trainingProvider, TrainingHarness } from '../../__tests__/fakes/training-fakes';
import { UnitYearsWorld } from '../../__tests__/fakes/unit-years-world';
import { InMemoryArtifactLoader } from '../../scoring/artifact-loader';
import { GateContexts } from '../gate-seams';
import { LifecycleGate } from '../lifecycle-gate';
import { EntityTransactionsUnsupportedError, ProviderTransactions } from '../provider-transactions';

const ctxOf = (store: GateTestStore) => ({ ContextUser: GateWorld.User, Provider: store.Provider() });

describe('ProviderTransactions.Run', () => {
  afterEach(() => vi.restoreAllMocks());

  it('commits when the work returns and commitWhen holds, and rolls back when it does not', async () => {
    const store = new GateTestStore();
    expect(await ProviderTransactions.Run(ctxOf(store), 'work', async () => 'done')).toBe('done');
    expect(await ProviderTransactions.Run(ctxOf(store), 'work', async () => 'refused', (v) => v !== 'refused')).toBe('refused');
    expect(store.Transactions).toEqual(['begin', 'commit', 'begin', 'rollback']);
  });
  it('rolls back and rethrows when the work throws, undoing what it wrote', async () => {
    const store = new GateTestStore();
    await expect(ProviderTransactions.Run(ctxOf(store), 'work', async () => {
      store.Insert('MJ: ML Models', { ID: 'M1' });
      throw new Error('boom');
    })).rejects.toThrow('boom');
    expect([store.Transactions, store.Tables['MJ: ML Models']]).toEqual([['begin', 'rollback'], undefined]);
  });
  it('refuses a provider with no server-side transactions with a typed error, running nothing', async () => {
    const store = new GateTestStore();
    store.SupportsTransactions = false;
    const work = vi.fn(async () => 1);
    await expect(ProviderTransactions.Run(ctxOf(store), 'the publish of M1', work)).rejects.toBeInstanceOf(EntityTransactionsUnsupportedError);
    expect([work.mock.calls.length, store.Transactions]).toEqual([0, []]);
  });
  it('is the one helper both surfaces use: the gate (Evaluate) and the trainer version allocation with its model-row save', async () => {
    const run = vi.spyOn(ProviderTransactions, 'Run');
    const store = new GateTestStore();
    const draft = new GateWorld(store, new MemoryStorageAccount('cross-surface', [])).Model('Draft', 'model');
    expect(await new LifecycleGate(new InMemoryArtifactLoader()).Evaluate({ modelId: draft.ID }, { kind: 'human', userId: GateWorld.User.ID }, GateContexts.ForRequest(ctxOf(store))))
      .toMatchObject({ Kind: 'evaluated', To: 'Validated' });
    const { engine, deps, pipeline } = TrainingHarness.ForUnit(UnitYearsWorld.Years(), UnitYearsWorld.UnitColumns());
    trainingProvider.Log.length = 0;
    const { model } = await engine.trainModel({ pipelineId: pipeline.ID }, deps);
    expect(model?.Version).toBe(5);
    expect(trainingProvider.Log).toEqual(['begin', 'query Predictive Studio: Lock Pipeline For Publish', 'query Predictive Studio: Next Model Version', 'commit']);
    expect(run.mock.calls.map((c) => c[1])).toEqual([`the evaluation of ML Model ${draft.ID}`, `the model row of pipeline ${pipeline.ID}`]);
  });
});
