/**
 * `LifecycleStates.FromPersisted` (D4-90): every persisted status names its lifecycle state, including the two the
 * contract has no state for, so an `illegal-transition` refusal can name an `Unevaluated` or `KeepBaseline` model.
 */
import { describe, it, expect } from 'vitest';
import { LifecycleStates, type PersistedLifecycleState, type PersistedModelStatus, type TransitionRefusal } from '../registry-contracts';

describe('LifecycleStates.FromPersisted', () => {
  it('maps the four contract statuses to their states and KeepBaseline/Unevaluated to their own', () => {
    const all: readonly PersistedModelStatus[] = ['Draft', 'Validated', 'Published', 'Archived', 'KeepBaseline', 'Unevaluated'];
    expect(all.map((s) => LifecycleStates.FromPersisted(s))).toEqual(['draft', 'validated', 'published', 'archived', 'keep-baseline', 'unevaluated']);
  });
  it('lets illegal-transition name a KeepBaseline or Unevaluated model', () => {
    const from: PersistedLifecycleState = LifecycleStates.FromPersisted('Unevaluated');
    const refusal: TransitionRefusal = { kind: 'illegal-transition', from, to: LifecycleStates.FromPersisted('Published') };
    expect(refusal).toEqual({ kind: 'illegal-transition', from: 'unevaluated', to: 'published' });
  });
});
