/**
 * `PredictiveStudio.PromoteModel` (Task M3.4) through `ExecuteServer` over the `GateTestStore` world: the op takes a
 * `transition` only, runs the real `LifecycleGate` (its scoring-Action seam recorded), and maps the gate's outcome to
 * `{ applied, status, refusal? }`.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { PredictiveStudioPromoteModelInput } from '@memberjunction/core-entities';

import { GateTestStore, GateWorld, type WorldModel } from '../../__tests__/fakes/gate-test-store';
import { RecordingScoringActions } from '../../__tests__/fakes/scoring-action-fakes';
import { MemoryStorageAccount, ProviderRow, RegisterMemoryStorage, ServeStorageProviders } from '../../__tests__/fakes/storage-fakes';
import { StorageProviderArtifactLoader } from '../../scoring/storage-provider-artifact-loader';
import { LifecycleGate } from '../../registry/lifecycle-gate';
import { PredictiveStudioPromoteModelServerOperation } from '../promote-model.operation';
import { CapturingContext } from './helpers';

const log: string[] = [];
const storage = new MemoryStorageAccount('promote-op', log);
RegisterMemoryStorage('PS Promote Op Test Storage', storage);
const providerRow = ProviderRow(GateWorld.StorageProviderID, 'Promote Op Storage', 'PS Promote Op Test Storage', true);

/** The op over the real gate, with the scoring-Action seam recorded instead of reading Action metadata. */
class TestablePromoteOperation extends PredictiveStudioPromoteModelServerOperation {
  public readonly ScoringActions = new RecordingScoringActions();
  protected override CreateLifecycleGate(): LifecycleGate {
    return new LifecycleGate(new StorageProviderArtifactLoader(), undefined, this.ScoringActions);
  }
}

let store: GateTestStore;
let world: GateWorld;
let validated: WorldModel;
let flagged: WorldModel;
let draft: WorldModel;
let op: TestablePromoteOperation;
let context: CapturingContext;

beforeEach(() => {
  storage.Reset();
  ServeStorageProviders([providerRow]);
  store = new GateTestStore();
  world = new GateWorld(store, storage);
  validated = world.Model('Validated', 'model');
  flagged = world.Model('Validated', 'model');
  store.FlagLeakage(flagged.ID, [{ kind: 'single-feature-auc', sourceColumn: 'leaky_feature', heldOutAuc: 0.97 }]);
  draft = world.Model('Draft', 'model');
  op = new TestablePromoteOperation();
  context = new CapturingContext(store.Provider(), GateWorld.User);
});

describe('PredictiveStudio.PromoteModel — transition only, on the lifecycle gate', () => {
  it('publish transition returns applied with the gate outcome', async () => {
    const out = await op.ExecuteServer({ modelId: validated.ID, transition: 'publish' }, context);
    expect(out).toMatchObject({ Success: true, Output: { applied: true, status: 'Published' } });
  });
  it('a flagged model is withheld with the refusal and never published by the op', async () => {
    const out = await op.ExecuteServer({ modelId: flagged.ID, transition: 'publish', reason: 'rig' }, context);
    expect(out).toMatchObject({ Success: true, Output: { applied: false, refusal: { kind: 'unacknowledged-leakage-flags' } } });
    expect(store.Status(flagged.ID)).toBe('Validated');
  });
  it('refuses an input without a transition before any read', async () => {
    const reads = store.ReadCount();
    // Test-double cast: the removed shape (no transition), which the compiler otherwise refuses.
    const out = await op.ExecuteServer({ modelId: validated.ID } as PredictiveStudioPromoteModelInput, context);
    expect(out).toMatchObject({ Success: false });
    expect(out.ErrorMessage).toContain('transition');
    expect(store.ReadCount()).toBe(reads);
  });
  it('the interactive caller is the initiator and the approver of the publish record, and the scoring Action is generated', async () => {
    await op.ExecuteServer({ modelId: validated.ID, transition: 'publish' }, context);
    expect(store.PublishRecords(validated.ID)).toEqual([expect.objectContaining({ Kind: 'publish', ApproverKind: 'user', UserID: GateWorld.User.ID, Initiator: JSON.stringify({ kind: 'human', userId: GateWorld.User.ID }) })]);
    expect(op.ScoringActions.Log).toEqual([{ Method: 'GenerateForModel', ModelID: validated.ID }]);
  });
  it('evaluate moves a Draft model to Validated; archive needs a reason; rollback restores a published model', async () => {
    expect(await op.ExecuteServer({ modelId: draft.ID, transition: 'evaluate' }, context)).toMatchObject({ Output: { applied: true, status: 'Validated' } });
    expect(await op.ExecuteServer({ modelId: validated.ID, transition: 'publish' }, context)).toMatchObject({ Output: { applied: true } });
    expect(await op.ExecuteServer({ modelId: validated.ID, transition: 'archive' }, context)).toMatchObject({ Output: { applied: false, status: 'Published', refusal: { kind: 'reason-required' } } });
    expect(await op.ExecuteServer({ modelId: validated.ID, transition: 'archive', reason: 'retired' }, context)).toMatchObject({ Output: { applied: true, status: 'Archived' } });
    expect(await op.ExecuteServer({ modelId: validated.ID, transition: 'rollback', reason: 'restore' }, context)).toMatchObject({ Output: { applied: true, status: 'Published' } });
  });
  it('an illegal jump and an unknown model are refusals, not errors', async () => {
    expect(await op.ExecuteServer({ modelId: draft.ID, transition: 'publish' }, context)).toMatchObject({
      Success: true, Output: { applied: false, status: 'Draft', refusal: { kind: 'illegal-transition', from: 'draft', to: 'published' } },
    });
    expect(await op.ExecuteServer({ modelId: `x' OR 1=1 --`, transition: 'publish' }, context)).toMatchObject({
      Success: true, Output: { applied: false, status: '', refusal: { kind: 'model-not-found' } },
    });
  });
  it('refuses a transition the contract does not have, before any read', async () => {
    const reads = store.ReadCount();
    // Test-double cast: the one way to send a transition the input type does not have (the compiler refuses it otherwise).
    const out = await op.ExecuteServer({ modelId: validated.ID, transition: 'Published' } as unknown as PredictiveStudioPromoteModelInput, context);
    expect([out.Success, out.ErrorMessage]).toEqual([false, expect.stringContaining('transition')]);
    expect(store.ReadCount()).toBe(reads);
  });
});
