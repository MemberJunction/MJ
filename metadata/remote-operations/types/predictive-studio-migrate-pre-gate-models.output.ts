/**
 * Output of `PredictiveStudio.MigratePreGateModels`: the counts of pre-change work remaining before the pass (a dry run
 * reports only these), and for a pass that ran, what each step did.
 */
export interface PredictiveStudioMigratePreGateModelsOutput {
    /** True when nothing was written. */
    dryRun: boolean;
    /** Published or Draft models with a stored gate record still to re-verify. */
    evidenceBearing: number;
    /** Other pre-change models whose artifact is still unverified. */
    unverifiedArtifacts: number;
    /** Record Processes whose schedule the pass would disable. */
    schedulesToDisable: number;
    /** Pipelines without a Published model that hold an Unevaluated one. */
    pipelinesToReEvaluate: number;
    /** Models kept Published with an adopt record by this pass. */
    adopted?: number;
    /** Models whose stored record did not re-verify, demoted by this pass. */
    demoted?: number;
    /** Artifacts whose state this pass recorded. */
    artifactsChanged?: number;
    /** Record Processes whose schedule this pass disabled. */
    schedulesDisabled?: number;
    /** Training runs this pass started. */
    retrained?: number;
}
