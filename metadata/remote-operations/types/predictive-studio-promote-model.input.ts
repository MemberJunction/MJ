/**
 * A lifecycle transition the gate applies to an ML Model: `evaluate` (Draft → Validated or KeepBaseline from the
 * training run's stored gate decision), `publish` (Validated or KeepBaseline → Published), `archive` (→ Archived, with a
 * reason) or `rollback` (Archived → Published for a model published before, with a reason).
 */
export type PredictiveStudioModelTransition = 'evaluate' | 'publish' | 'archive' | 'rollback';

/** Input for `PredictiveStudio.PromoteModel`. */
export interface PredictiveStudioPromoteModelInput {
    /** Id of the `MJ: ML Models` row to transition. */
    modelId: string;
    /** The lifecycle transition to apply. */
    transition: PredictiveStudioModelTransition;
    /** The approving sign-off record (`MJ: ML Model Publish Records`, Kind `sign-off`) a publish consumes, when one is required. */
    signOffId?: string;
    /** Why: required for `archive` and `rollback`, recorded with a `publish`. */
    reason?: string;
}
