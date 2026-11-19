/**
 * The scope of records to score. Mirrors the Record Set Processing scope shapes
 * (records / view / list / filter / single). Exactly one shape should be populated;
 * the runner resolves it into a concrete record set.
 */
export interface PredictiveStudioScoringScope {
    /** Explicit record ids / primary-key objects to score. */
    records?: Array<string | Record<string, unknown>>;
    /** A `User Views` id whose rows are scored. */
    viewId?: string;
    /** A `Lists` id whose member rows are scored. */
    listId?: string;
    /** An entity name + SQL filter selecting the rows to score. */
    filter?: { entityName: string; extraFilter?: string; maxRows?: number };
    /** A single record (entity + primary key) to score. */
    single?: { entityName: string; primaryKey: Record<string, unknown> };
}

/** Input for `PredictiveStudio.ScoreRecordSet`. */
export interface PredictiveStudioScoreRecordSetInput {
    /** Id of the `MJ: ML Models` row to score with; with a `bindingId` it must be a model of the binding's pipeline. */
    modelId: string;
    /**
     * The `MJ: ML Model Scoring Bindings` row to score through. With it, the binding's pipeline's Published model scores
     * the scope and the scores are written as the binding's Feature Values (and its column copy, when it names one);
     * without it, the predictions are returned and nothing is written.
     */
    bindingId?: string;
    /** The records to score — populate exactly one selector on the scope. */
    scope: PredictiveStudioScoringScope;
    /** The date the scope is scored as of (ISO); the run date when omitted. Only a model trained on a Prediction Unit scores an earlier date. */
    asOfDate?: string;
    /** Score and record the run, but write no Feature Value and no column. */
    dryRun?: boolean;
}
