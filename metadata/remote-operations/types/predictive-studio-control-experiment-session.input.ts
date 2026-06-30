/** The control action to apply to a running/paused experiment session. */
export type PredictiveStudioExperimentSessionAction = 'pause' | 'resume' | 'cancel';

/** Input for `PredictiveStudio.ControlExperimentSession`. */
export interface PredictiveStudioControlExperimentSessionInput {
    /** Id of the `MJ: Experiment Sessions` row to control. */
    sessionId: string;
    /** The control action: pause a running session, resume a paused one, or cancel. */
    action: PredictiveStudioExperimentSessionAction;
}
