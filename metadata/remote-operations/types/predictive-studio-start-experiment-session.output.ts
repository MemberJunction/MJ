/** Output of `PredictiveStudio.StartExperimentSession` — the created/executed session. */
export interface PredictiveStudioStartExperimentSessionOutput {
    /** Id of the `MJ: Experiment Sessions` row that was started. */
    sessionId: string;
    /** Id of the durable `MJ: Experiments` definition the session runs under. */
    experimentId: string;
    /** The session's status after starting (`Running`, or `Completed`/`Paused` if it ran to a bound synchronously). */
    status: string;
}
