/**
 * Output of `PredictiveStudio.TrainModel`: the run's stored gate decision, its Training Snapshot and Evaluation
 * Protocol, and the produced model when the decision ships one.
 */
export interface PredictiveStudioTrainModelOutput {
    /** Id of the produced (Draft) `MJ: ML Models` row; absent when the gate decision ships no model (no-signal, or the existing rule kept). */
    modelId?: string;
    /** Id of the `MJ: ML Training Runs` row recording this attempt. */
    trainingRunId: string;
    /** Monotonic model version under the pipeline; absent when no model is produced. */
    version?: number;
    /**
     * JSON of the test-set scores measured once on the locked holdout (`{ "<metric>": value, … }`): the produced
     * model's stored scores when a model exists (the member the gate ships), otherwise the trainer's finalist scores.
     */
    holdoutMetrics?: string;
    /** True when one feature dominates the finalist's predictions (possible target leakage); a flagged model stays Draft and needs human sign-off. */
    leakageFlagged: boolean;
    /** Lifecycle status of the produced model (`Draft`), `NoSignal` when the gate stored no-signal, or `KeptExistingRule` when it kept the existing rule. */
    status: string;
    /** The `MJ: Training Snapshots` row the run trained on. */
    trainingSnapshotId?: string;
    /** The `MJ: Evaluation Protocols` row (exact version) the run was evaluated under. */
    evaluationProtocolId?: string;
    /** That protocol row's Version. */
    evaluationProtocolVersion?: number;
    /** The stored gate outcome. */
    gateOutcome?: 'model' | 'keep-simple-baseline' | 'no-signal';
    /** The decision-table branch the stored outcome came from (for example `b:keep-simple-baseline` or `c:no-signal`). */
    gateBranch?: string;
    /** The stored reason for the outcome, in words generated from the stored comparisons. */
    gateReason?: string;
    /** The member the gate ships (the model, a simple baseline or the existing rule); absent under no-signal. */
    shipped?: string;
}
