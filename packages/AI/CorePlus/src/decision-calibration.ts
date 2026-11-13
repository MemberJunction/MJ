/**
 * @fileoverview The keys a decision's calibration is looked up by: the use and question, and the
 * exact model that answered.
 *
 * A decision model's raw probabilities are not calibrated, so a consumer that acts on a threshold
 * maps them through a calibration fitted per model on labelled data (`ApplyPlattCalibration` in
 * `@memberjunction/ai`). A fit holds only for the model it was fitted on, and the MJ model name
 * alone does not say which model that was:
 * - a vendor model keeps its MJ name when its vendor row's `APIName` moves it to another version
 *   (Jev is pinned to `typesafe/jev-1.13-20260917`);
 * - `LLM Decision` asks whichever chat model its prompt selects, so on one installation its answers
 *   come from GPT-OSS-120B and on another from a different chat model.
 *
 * So each calibration names both: the MJ decision model (`modelInfo.modelName`) and the exact model
 * the driver reports behind it (`DecisionResult.ResolvedModel`: the vendor's dated model for Jev,
 * the chat model for `LLM Decision`). An answer from any other pair has no calibration, and the
 * consumer treats it as unsure.
 *
 * Calibrations are data, not code: each is a `DecisionCalibrationEntry` in the answering model's
 * `ModelConfiguration.Decision.Calibrations`, keyed by the decision use, the question and the
 * resolved model. Look one up with `AIEngineBase.Instance.FindDecisionCalibration(key, answeredBy)` or
 * `CalibrateDecisionProbability(key, probability, answeredBy)` (wrapped by the same names on
 * `AIEngine` on the server). Fitting a new model, or refitting after a version bump, is a metadata
 * change: the `fit-decision-calibration` rig in the integration test suite prints the entries.
 *
 * Shared by every consumer that acts on a calibrated threshold: conversation routing here, agent
 * discovery and the memory note gate in `@memberjunction/ai-agents`, and duplicate detection.
 *
 * @module @memberjunction/ai-core-plus
 */

/** The model that answered a decision, as `AIDecisionRunner` and the `RunDecision` mutation report it. */
export interface DecisionAnsweringModel {
    /**
     * The MJ decision model that answered, after any failover: `Jev`, `LLM Decision`
     * (`AIDecisionRunResult.modelInfo.modelName`, `RunDecisionResult.ModelName`).
     */
    ModelName?: string | null;
    /**
     * The exact model behind it, as the driver reports it: the vendor's dated model for a vendor
     * decision model, the chat model for `LLM Decision` (`AIDecisionRunResult.DecisionResult.ResolvedModel`,
     * `RunDecisionResult.ResolvedModel`).
     */
    ResolvedModel?: string | null;
}

/** Which fit to look up: the decision use and the question within it. */
export interface DecisionCalibrationKey {
    /** The decision use, such as `conversation-routing`. */
    Use: string;
    /** The question key within the use, such as `continues`. */
    Question: string;
}

/**
 * The model that answered, for a log line or a reason: `Jev (typesafe/jev-1.13-20260917)`, or a
 * stand-in for whatever is missing.
 *
 * @param answeredBy The model that answered.
 */
export function DescribeAnsweringModel(answeredBy: DecisionAnsweringModel): string {
    const modelName = answeredBy.ModelName?.trim() || 'an unnamed model';
    const resolvedModel = answeredBy.ResolvedModel?.trim();
    return resolvedModel ? `${modelName} (${resolvedModel})` : `${modelName} (resolved model not reported)`;
}
