/** A leakage-audit flag kind a sign-off overrides (the stored `LeakageFlag['kind']` values). */
export type PredictiveStudioLeakageFlagKind = 'single-feature-auc' | 'time-shifted-label' | 'drop-column' | 'high-cardinality-id';

/** Input for `PredictiveStudio.SignOffModel`. */
export interface PredictiveStudioSignOffModelInput {
    /** Id of the `MJ: ML Models` row signed off. */
    modelId: string;
    /** What the sign-off approves or rejects: a `publish` (Validated or KeepBaseline → Published) or a `rollback` (Archived → Published). */
    purpose: 'publish' | 'rollback';
    /** The approver's decision. */
    decision: 'approve' | 'reject';
    /** Why; required (non-blank) when `overridesFlags` names any flag. */
    reason: string;
    /** The model's leakage flag kinds this sign-off overrides; empty for none. */
    overridesFlags: PredictiveStudioLeakageFlagKind[];
}
