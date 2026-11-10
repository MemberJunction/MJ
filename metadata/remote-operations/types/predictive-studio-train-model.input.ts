/** A point-in-time assembly strategy, as `PredictiveStudio.TrainModel` accepted it before Prediction Units (see {@link RetiredTrainModelInputs}). */
export interface PredictiveStudioTrainAsOf {
    /** How to anchor feature assembly in time: no anchoring, a column on the row, or an offset before the label event. */
    Mode: 'none' | 'column' | 'offset';
    /** Column carrying the as-of timestamp (when `Mode` is `column`). */
    Column?: string;
    /** Days before the label event to assemble features (when `Mode` is `offset`). */
    OffsetDays?: number;
}

/** Input for `PredictiveStudio.TrainModel`. The pipeline's Prediction Unit and Evaluation Protocol decide everything else. */
export interface PredictiveStudioTrainModelInput {
    /** Id of the `MJ: ML Training Pipelines` row to train. */
    pipelineId: string;
    /** Optional `MJ: Experiment Session Iterations` id this run belongs to (NULL for a one-off standalone train). */
    experimentSessionIterationId?: string;
    /** Sidecar version string recorded in the model lineage for provenance. */
    sidecarVersion?: string;
}

/**
 * Inputs `PredictiveStudio.TrainModel` accepted before Prediction Units. They are refused by name when present, even
 * when empty or `asOf.Mode` is `none`: the Prediction Unit declares the decision date and the row key, and every
 * eligible row is read (a capped read is not a complete read). Kept only so a caller (or a test probe) can type a
 * payload that still sends them.
 */
export interface RetiredTrainModelInputs {
    /** Refused: the Prediction Unit declares each row's decision date. */
    asOf?: PredictiveStudioTrainAsOf;
    /** Refused: the Prediction Unit declares each row's decision date. */
    labelEventDates?: Record<string, string>;
    /** Refused: every eligible row is read. */
    maxRows?: number;
    /** Refused: the Prediction Unit reads its rows keyed by the row entity's own primary key. */
    primaryKeyField?: string;
}
