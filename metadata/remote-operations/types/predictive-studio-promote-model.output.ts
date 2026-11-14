/**
 * Why the lifecycle gate did not apply a transition: the `TransitionRefusal` JSON the gate records on
 * `MJ: ML Model Publish Records.Refusal` (`kind` and the kind's own fields).
 *
 * **Lockstep contract**: this type equals `TransitionRefusal` in `@memberjunction/predictive-studio-core`
 * (`registry-contracts.ts`), member for member; the referenced unions are written inline because a Remote Operation
 * type file cannot import another. Core's `src/__tests__/jsontype-mirrors.compile.test.ts` fails when they drift.
 */
export type PredictiveStudioTransitionRefusal =
    | { readonly kind: 'illegal-transition'; readonly from: 'draft' | 'validated' | 'published' | 'archived' | 'unevaluated' | 'keep-baseline'; readonly to: 'draft' | 'validated' | 'published' | 'archived' | 'unevaluated' | 'keep-baseline' }
    | { readonly kind: 'no-sign-off' }
    | { readonly kind: 'gate-no-signal'; readonly reason: string }
    | { readonly kind: 'unacknowledged-leakage-flags'; readonly flags: readonly ('single-feature-auc' | 'time-shifted-label' | 'drop-column' | 'high-cardinality-id')[] }
    | { readonly kind: 'semantics-check-failed'; readonly mismatches: readonly string[] }
    | { readonly kind: 'actor-not-permitted'; readonly actor: 'human' | 'agent' | 'scheduled-job' | 'system' }
    | { readonly kind: 'does-not-beat-incumbent'; readonly incumbentModelId: string; readonly comparison: { readonly value: number; readonly ci: readonly [number, number]; readonly beats: boolean } }
    | {
        readonly kind: 'status-written-outside-gate';
        readonly guard: {
            readonly Allow: false;
            readonly Reason:
                | 'create-not-draft'
                | 'stored-row-unreadable'
                | 'deferred-in-transaction-group'
                | 'status-changed-outside-gate'
                | 'gate-transition-mismatch'
                | 'serving-flag-set-outside-migration';
        };
    }
    | { readonly kind: 'artifact-unverifiable'; readonly detail: string }
    | { readonly kind: 'publish-in-progress' }
    | { readonly kind: 'keep-baseline-not-auto-published' }
    | { readonly kind: 'sign-off-wait-closed'; readonly closedBy: 'newer-run-evaluated' | 'expired' }
    | { readonly kind: 'kept-existing-rule'; readonly rule: string }
    | { readonly kind: 'calibration-held'; readonly slope: number | null }
    | { readonly kind: 'not-servable'; readonly reason: string }
    | { readonly kind: 'model-not-found'; readonly modelId: string }
    | { readonly kind: 'reason-required' }
    | { readonly kind: 'incumbent-not-current'; readonly comparedWith: string; readonly current: string };

/** Output of `PredictiveStudio.PromoteModel`: whether the gate applied the transition, the model's status, and why not. */
export interface PredictiveStudioPromoteModelOutput {
    /** True when the lifecycle gate applied the transition (an idempotent retry of an applied publish included). */
    applied: boolean;
    /** The model's lifecycle status after the call; empty when no model has the id. */
    status: string;
    /** Why the gate refused; absent when `applied` is true. */
    refusal?: PredictiveStudioTransitionRefusal;
}
