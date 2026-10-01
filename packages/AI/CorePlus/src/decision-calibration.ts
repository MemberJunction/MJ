/**
 * @fileoverview Which calibration applies to a decision's answer: the one fitted on the exact model
 * that answered, or none.
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
 * Shared by every consumer that acts on a calibrated threshold. Duplicate detection's Decision modes
 * in `@memberjunction/ai-vector-dupe` key their table this way (`DUPLICATE_DECISION_CALIBRATION`).
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

/** One calibration, and the exact model it was fitted on. */
export interface DecisionModelCalibration<TCalibration> {
    /** The MJ decision model, as {@link DecisionAnsweringModel.ModelName} reports it. */
    ModelName: string;
    /** The exact model it was fitted on, as {@link DecisionAnsweringModel.ResolvedModel} reports it. */
    ResolvedModel: string;
    /** What to apply to that model's answers. */
    Calibration: TCalibration;
}

/**
 * The calibration fitted on the model that answered, or null when there is none. Both names must
 * match one entry exactly, after trimming; a missing name matches nothing. The table is a list, not
 * an object keyed by name, so no model name can reach an inherited member such as `constructor`.
 *
 * @param calibrations The calibrations, each with the exact model it was fitted on.
 * @param answeredBy The model that answered.
 */
export function FindDecisionCalibration<TCalibration>(
    calibrations: readonly DecisionModelCalibration<TCalibration>[],
    answeredBy: DecisionAnsweringModel
): TCalibration | null {
    const modelName = answeredBy.ModelName?.trim();
    const resolvedModel = answeredBy.ResolvedModel?.trim();
    if (!modelName || !resolvedModel) {
        return null;
    }
    const entry = calibrations.find(c => c.ModelName === modelName && c.ResolvedModel === resolvedModel);
    return entry ? entry.Calibration : null;
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
