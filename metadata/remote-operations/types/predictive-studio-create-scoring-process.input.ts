/** Input for `PredictiveStudio.CreateScoringProcess`. */
export interface PredictiveStudioCreateScoringProcessInput {
    /** Id of the `MJ: ML Models` row the created Record Process scores with. */
    modelId: string;
    /** The entity whose rows are scored (e.g. `Memberships`). */
    targetEntityName: string;
    /**
     * The records a run scores. Mirrors the Record Set Processing scope shapes
     * (Filter / View / List). Populate EXACTLY ONE selector; `all` is the
     * whole-entity shortcut ("score everyone"), expressed under the hood as a Filter
     * with the all-rows predicate `(1=1)`.
     */
    scope: {
        /** A SQL filter over the target entity selecting the rows to score. */
        filter?: string;
        /** A `User Views` id whose rows are scored. */
        viewId?: string;
        /** A `Lists` id whose member rows are scored. */
        listId?: string;
        /** Score the WHOLE target entity ("score everyone"); mutually exclusive with the others. */
        all?: boolean;
    };
    /**
     * Optional. The target-entity column to write the prediction into (e.g.
     * `RenewalScore`). **When supplied → write-back mode**: each run writes the
     * prediction into that column. **When omitted → generic output**: predictions are
     * recorded in the process run history (`MJ: Process Run Details`) with no write-back
     * column. Either way a `MJ: ML Model Scoring Bindings` row (`Mode='OnDemand'`) is
     * created for the model's training pipeline; it names the column only in write-back mode.
     */
    outputField?: string;
    /**
     * Which prediction value the write-back lands in `outputField` — the numeric
     * `'score'` (probability / regression value — the default) or the predicted
     * `'class'` label (classification). Ignored in generic mode (no `outputField`).
     */
    valueKind?: 'score' | 'class';
    /** Primary-key field on the target entity the model joins on (defaults to `ID`). */
    primaryKeyField?: string;
    /** Optional Record Process name; a descriptive default is generated when omitted. */
    name?: string;
    /** Optional. The binding's feature name on the target entity; defaults to the model's training pipeline name. */
    featureName?: string;
    /** Optional. The `MJ: Authorizations` id a user must hold to see the predictions; defaults to "View Model Predictions". */
    viewAuthorizationId?: string;
}
