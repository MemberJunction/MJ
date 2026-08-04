/** The lifecycle status to transition an ML Model to. */
export type PredictiveStudioModelTargetStatus = 'Validated' | 'Published' | 'Archived';

/** Input for `PredictiveStudio.PromoteModel`. */
export interface PredictiveStudioPromoteModelInput {
    /** Id of the `MJ: ML Models` row to transition. */
    modelId: string;
    /** The lifecycle status to move the model to. */
    targetStatus: PredictiveStudioModelTargetStatus;
    /** Human/agent sign-off that overrides the leakage gate. Required (true) to promote a leakage-flagged model; ignored for clean models. */
    signOff?: boolean;
    /** Optional human-readable reason recorded with the promotion. */
    reason?: string;
}
