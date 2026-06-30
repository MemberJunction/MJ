/** Optional point-in-time assembly strategy for the train (mirrors the pipeline's stored AsOfStrategy). */
export interface PredictiveStudioTrainAsOf {
    /** How to anchor feature assembly in time: no anchoring, a column on the row, or an offset before the label event. */
    Mode: 'none' | 'column' | 'offset';
    /** Column carrying the as-of timestamp (when `Mode` is `column`). */
    Column?: string;
    /** Days before the label event to assemble features (when `Mode` is `offset`). */
    OffsetDays?: number;
}

/** Input for `PredictiveStudio.TrainModel`. */
export interface PredictiveStudioTrainModelInput {
    /** Id of the `MJ: ML Training Pipelines` row to train. */
    pipelineId: string;
    /** Optional `MJ: Experiment Session Iterations` id this run belongs to (NULL for a one-off standalone train). */
    experimentSessionIterationId?: string;
    /** Optional cap on the number of training rows pulled from the target entity. */
    maxRows?: number;
    /** Optional primary-key field on the target entity (defaults to `ID`). */
    primaryKeyField?: string;
    /** Optional per-record label-event dates (keyed by record primary key), required when `asOf.Mode` is `offset`. */
    labelEventDates?: Record<string, string>;
    /** Optional as-of strategy override; when omitted the pipeline's stored `AsOfStrategy` is used. */
    asOf?: PredictiveStudioTrainAsOf;
    /** Sidecar version string recorded in the model lineage for provenance. */
    sidecarVersion?: string;
}
