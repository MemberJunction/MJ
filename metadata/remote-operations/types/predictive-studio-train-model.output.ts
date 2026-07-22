/** Output of `PredictiveStudio.TrainModel` — the produced (Draft) model + its honest metrics. */
export interface PredictiveStudioTrainModelOutput {
    /** Id of the produced (Draft) `MJ: ML Models` row. */
    modelId: string;
    /** Id of the `MJ: ML Training Runs` row recording this attempt. */
    trainingRunId: string;
    /** Monotonic model version under the pipeline (`max(Version)+1`). */
    version: number;
    /** JSON of the metrics scored exactly once on the locked holdout the search never saw (the honest performance number). */
    holdoutMetrics?: string;
    /** True when one feature dominates the model's predictions (possible target leakage). A flagged model stays Draft and needs human sign-off before promotion. */
    leakageFlagged: boolean;
    /** Lifecycle status of the produced model (always `Draft` immediately after training). */
    status: string;
}
