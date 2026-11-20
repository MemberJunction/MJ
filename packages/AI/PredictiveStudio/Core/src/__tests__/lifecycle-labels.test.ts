/**
 * The words the lifecycle UI shows: the chip of each persisted model status (§5.4, D4-56) and every lifecycle-gate
 * refusal in plain words (D4-49). Both Angular packages read them from here, so the model detail and the dashboards'
 * registry and production views say the same thing.
 */
import { describe, it, expect } from 'vitest';
import {
  ALL_TRANSITION_REFUSAL_KINDS,
  LifecycleLabels,
  PERSISTED_MODEL_STATUSES,
  ScoringRefusalText,
  TransitionRefusalText,
} from '../lifecycle-labels';
import type { TransitionRefusal } from '../registry-contracts';

const PRE_CHANGE_REASON =
  'Trained before the Predictive Studio lifecycle gate; never evaluated under an Evaluation Protocol; the pipeline is retrained under its protocol automatically.';

/** One refusal of `kind` with fixture values for the kind's own fields. */
function RefusalOf(kind: TransitionRefusal['kind']): TransitionRefusal {
  switch (kind) {
    case 'illegal-transition': return { kind, from: 'archived', to: 'validated' };
    case 'no-sign-off': return { kind };
    case 'gate-no-signal': return { kind, reason: 'no candidate beat the flat guess' };
    case 'unacknowledged-leakage-flags': return { kind, flags: ['single-feature-auc'] };
    case 'semantics-check-failed': return { kind, mismatches: ['at-risk-list sorts by score-asc'] };
    case 'actor-not-permitted': return { kind, actor: 'human' };
    case 'does-not-beat-incumbent': return { kind, incumbentModelId: 'M-INC', comparison: { value: -0.01, ci: [-0.03, 0.01], beats: false } };
    case 'status-written-outside-gate': return { kind, guard: { Allow: false, Reason: 'status-changed-outside-gate' } };
    case 'artifact-unverifiable': return { kind, detail: 'storage timed out' };
    case 'publish-in-progress': return { kind };
    case 'keep-baseline-not-auto-published': return { kind };
    case 'sign-off-wait-closed': return { kind, closedBy: 'expired' };
    case 'kept-existing-rule': return { kind, rule: 'tenure under 90 days' };
    case 'calibration-held': return { kind, slope: 0.41 };
    case 'not-servable': return { kind, reason: 'the model has no artifact file' };
    case 'model-not-found': return { kind, modelId: 'M-404' };
    case 'reason-required': return { kind };
    case 'incumbent-not-current': return { kind, comparedWith: 'M-OLD', current: 'M-NEW' };
  }
}

describe('LifecycleLabels', () => {
  it('labels every persisted status and carries the stored reason as the detail', () => {
    const labels = PERSISTED_MODEL_STATUSES.map((status) => [status, LifecycleLabels.For(status, 'why').Label]);
    expect(Object.fromEntries(labels)).toEqual({
      Draft: 'Draft',
      Validated: 'Validated',
      Published: 'Published',
      Archived: 'Archived',
      KeepBaseline: 'Ships the simple baseline',
      Unevaluated: 'Unevaluated — trained before the lifecycle gate; retrain to publish',
    });
    expect(LifecycleLabels.For('Unevaluated', PRE_CHANGE_REASON).Detail).toBe(PRE_CHANGE_REASON);
    expect(LifecycleLabels.For('Published', null).Detail).toBeNull();
  });

  it('recognises a persisted status in a plain string, and nothing else', () => {
    expect([LifecycleLabels.IsPersistedStatus('KeepBaseline'), LifecycleLabels.IsPersistedStatus(''), LifecycleLabels.IsPersistedStatus('published')]).toEqual([true, false, false]);
  });

  it('treats a blank stored reason as no detail', () => {
    expect(LifecycleLabels.For('KeepBaseline', '   ').Detail).toBeNull();
  });

  it('names a serving pre-change model as still serving, and only an Unevaluated one', () => {
    expect(LifecycleLabels.ServingNote('Unevaluated', true)).toBe('Still serving — not evaluated under a protocol');
    expect([LifecycleLabels.ServingNote('Unevaluated', false), LifecycleLabels.ServingNote('Published', true)]).toEqual([null, null]);
  });

  it('names the run-level outcomes that ship no model row, and nothing else', () => {
    expect(LifecycleLabels.RunOutcome(RefusalOf('gate-no-signal'))).toBe('No signal');
    expect(LifecycleLabels.RunOutcome(RefusalOf('kept-existing-rule'))).toBe('Kept the existing rule');
    expect(LifecycleLabels.RunOutcome(RefusalOf('no-sign-off'))).toBeNull();
  });
});

describe('TransitionRefusalText', () => {
  it('every refusal kind has plain words', () => {
    for (const kind of ALL_TRANSITION_REFUSAL_KINDS) expect(TransitionRefusalText.For(RefusalOf(kind))).not.toMatch(/^[a-z-]+$/);
  });

  it("carries each kind's own detail into the words", () => {
    expect(TransitionRefusalText.For(RefusalOf('unacknowledged-leakage-flags'))).toContain('a single feature predicts the outcome on its own');
    expect(TransitionRefusalText.For(RefusalOf('semantics-check-failed'))).toContain('at-risk-list sorts by score-asc');
    expect(TransitionRefusalText.For(RefusalOf('does-not-beat-incumbent'))).toContain('[-0.030, 0.010]');
    expect(TransitionRefusalText.For(RefusalOf('illegal-transition'))).toContain('Archived model to Validated');
  });

  it('says an actor-not-permitted refusal of a person names the missing update permission', () => {
    expect(TransitionRefusalText.For({ kind: 'actor-not-permitted', actor: 'human' })).toContain('update permission on ML Models');
  });
});

describe('ScoringRefusalText', () => {
  it('names the columns a schema refusal lists', () => {
    const text = ScoringRefusalText.For({ kind: 'feature-schema-mismatch', expectedHash: 'a', actualHash: 'b', missingColumns: ['DistanceZ'], extraColumns: [], typeMismatches: [] });
    expect(text).toContain('missing: DistanceZ; extra: none');
  });

  it('says a non-Published model does not score, with its status', () => {
    expect(ScoringRefusalText.For({ kind: 'model-not-published', status: 'Unevaluated' })).toContain('Unevaluated');
  });
});
