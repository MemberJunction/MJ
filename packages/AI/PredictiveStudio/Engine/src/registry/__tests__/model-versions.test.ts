/**
 * `ModelVersions` (Task M3.2): a new model row's version is allocated under the pipeline lock, and a save refused because
 * a writer that bypassed the lock took the version is retried once with a re-read version.
 */
import { describe, expect, it } from 'vitest';
import type { MJMLModelEntity } from '@memberjunction/core-entities';

import { FakeClock, GateTestStore, GateWorld } from '../../__tests__/fakes/gate-test-store';
import { ModelVersions, ModelVersionSaveError, PipelineLockTimeoutError } from '../model-versions';

const P = GateWorld.PipelineID;

/** The store with one model of the pipeline at version 1, its context, and a new unsaved model row of the pipeline. */
async function Setup(): Promise<{ store: GateTestStore; ctx: { ContextUser: typeof GateWorld.User; Provider: ReturnType<GateTestStore['Provider']> }; model: MJMLModelEntity }> {
  const store = new GateTestStore();
  store.Insert('MJ: ML Models', { ID: 'M1', PipelineID: P, Version: 1 });
  const ctx = { ContextUser: GateWorld.User, Provider: store.Provider() };
  const model = await ctx.Provider.GetEntityObject<MJMLModelEntity>('MJ: ML Models', ctx.ContextUser);
  model.PipelineID = P;
  return { store, ctx, model };
}

describe('ModelVersions.AllocateUnderLock', () => {
  it('locks the pipeline, then reads the next version', async () => {
    const { store, ctx } = await Setup();
    expect(await ModelVersions.AllocateUnderLock(P, ctx, new FakeClock())).toBe(2);
    expect(store.Reads).toEqual(['query Predictive Studio: Lock Pipeline For Publish', 'query Predictive Studio: Next Model Version']);
  });
  it('throws PipelineLockTimeoutError when the pipeline stays locked for the whole wait', async () => {
    const { store, ctx } = await Setup();
    store.LockFailures = 1_000;
    await expect(ModelVersions.AllocateUnderLock(P, ctx, new FakeClock())).rejects.toBeInstanceOf(PipelineLockTimeoutError);
  });
});

describe('ModelVersions.SaveUnderLock', () => {
  it('saves the row at the allocated version', async () => {
    const { store, ctx, model } = await Setup();
    await ModelVersions.SaveUnderLock(model, ctx, new FakeClock());
    expect(store.Tables['MJ: ML Models'].map((m) => m['Version'])).toEqual([1, 2]);
  });
  it('retries once with a re-read version when another writer took the allocated one', async () => {
    const { store, ctx, model } = await Setup();
    let first = true;
    store.OnSave = (entityName) => {
      if (first) {
        first = false;
        store.Insert('MJ: ML Models', { ID: 'M2', PipelineID: P, Version: 2 });
        store.FailingSaves.set(entityName, 'Violation of UNIQUE KEY constraint UX_MLModel_PipelineVersion');
      } else store.FailingSaves.delete(entityName);
    };
    await ModelVersions.SaveUnderLock(model, ctx, new FakeClock());
    expect(model.Version).toBe(3);
  });
  it('throws a failure the stored versions do not explain, without a retry', async () => {
    const { store, ctx, model } = await Setup();
    store.FailingSaves.set('MJ: ML Models', 'permission denied');
    await expect(ModelVersions.SaveUnderLock(model, ctx, new FakeClock())).rejects.toMatchObject({ name: 'ModelVersionSaveError', Versions: [2], SaveMessage: 'permission denied' });
    expect(store.Reads.filter((r) => r.endsWith('Next Model Version'))).toHaveLength(2);
  });
  it('throws after the one retry fails too', async () => {
    const { store, ctx, model } = await Setup();
    store.OnSave = () => store.Insert('MJ: ML Models', { ID: `M${store.SaveCount()}x${Math.random()}`, PipelineID: P, Version: model.Version });
    store.FailingSaves.set('MJ: ML Models', 'Violation of UNIQUE KEY constraint');
    const error = await ModelVersions.SaveUnderLock(model, ctx, new FakeClock()).catch((e: Error) => e);
    expect(error).toBeInstanceOf(ModelVersionSaveError);
    expect(error instanceof ModelVersionSaveError && error.Versions).toEqual([2, 3]);
  });
});

describe('ModelVersions.SaveNewRow (the trainer\'s model-row write)', () => {
  it('locks, allocates and saves inside one transaction of its own, committed after the row is written', async () => {
    const { store, ctx, model } = await Setup();
    await ModelVersions.SaveNewRow(model, ctx, new FakeClock());
    expect(store.Transactions).toEqual(['begin', 'commit']);
    expect(store.Tables['MJ: ML Models'].map((m) => m['Version'])).toEqual([1, 2]);
    expect(store.Reads).toEqual(['query Predictive Studio: Lock Pipeline For Publish', 'query Predictive Studio: Next Model Version']);
  });
  it('rolls the transaction back and rethrows when the row cannot be saved', async () => {
    const { store, ctx, model } = await Setup();
    store.FailingSaves.set('MJ: ML Models', 'permission denied');
    await expect(ModelVersions.SaveNewRow(model, ctx, new FakeClock())).rejects.toBeInstanceOf(ModelVersionSaveError);
    expect(store.Transactions).toEqual(['begin', 'rollback']);
    expect(store.Tables['MJ: ML Models'].map((m) => m['Version'])).toEqual([1]);
  });
});
