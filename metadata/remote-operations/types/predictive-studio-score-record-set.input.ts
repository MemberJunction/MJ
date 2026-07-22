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

/**
 * Optional write-back directive. `true` enables write-back with the model's default
 * mapping; an object supplies an explicit `OutputMapping` (target column / child
 * record). When omitted, predictions are returned ephemerally.
 */
export type PredictiveStudioWriteBackDirective = boolean | { OutputMapping: Record<string, unknown> };

/** Input for `PredictiveStudio.ScoreRecordSet`. */
export interface PredictiveStudioScoreRecordSetInput {
    /** Id of the `MJ: ML Models` row to score with. */
    modelId: string;
    /** The records to score — populate exactly one selector on the scope. */
    scope: PredictiveStudioScoringScope;
    /** Compute the predictions WITHOUT writing them back (preview) when true/omitted with no write-back. */
    dryRun?: boolean;
    /** Optional write-back directive; when omitted (or false) predictions are returned ephemerally. */
    writeBack?: PredictiveStudioWriteBackDirective;
}
