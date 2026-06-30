/** Output of `PredictiveStudio.PromoteModel` — whether the transition was applied + the new status. */
export interface PredictiveStudioPromoteModelOutput {
    /** True when the model was transitioned to the target status. */
    promoted: boolean;
    /** The model's new lifecycle status on success (the target status); the unchanged current status when not promoted. */
    status: string;
}
