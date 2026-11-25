/**
 * Whether experiment sessions can run. They are switched off because the session runner cannot yet train the
 * experiments it plans; the Model Development Agent hands approved plans to the Pipeline Builder instead. One flag and
 * one reason, shared by the refusal error and the UI.
 */
export class ExperimentSessions {
  public static readonly Enabled = false;
  public static readonly DisabledReason =
    'Experiment sessions are switched off: the session runner has no way to turn a proposed experiment into a training ' +
    'pipeline, so every iteration failed while the session still reported Completed. Build models with the Model ' +
    'Development Agent (its Pipeline Builder trains the approved experiments) or train a pipeline with Train ML Model.';
}
