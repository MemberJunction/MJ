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
 * Calibrations are data, not code: each is a {@link DecisionCalibrationEntry} in the answering
 * model's `ModelConfiguration.Decision.Calibrations`, keyed by the decision use, the question and the
 * resolved model. `AIEngineBase` is the {@link DecisionCalibrationSource} that reads them, on the
 * server and in the browser. Fitting a new model, or refitting after a version bump, is a metadata
 * change: the `fit-decision-calibration` rig in the integration test suite prints the entries.
 *
 * Shared by every consumer that acts on a calibrated threshold: conversation routing here, agent
 * discovery and the memory note gate in `@memberjunction/ai-agents`, and duplicate detection.
 *
 * @module @memberjunction/ai-core-plus
 */

import { ApplyPlattCalibration, type DecisionCalibrationEntry, type PlattCalibration } from '@memberjunction/ai';

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

/**
 * Where a consumer reads calibrations: the decision models' `ModelConfiguration.Decision.Calibrations`,
 * as `AIEngineBase` resolves them. An interface so code that has no AI engine (a unit test, a rig) can
 * supply its own.
 */
export interface DecisionCalibrationSource {
    /**
     * Every calibration declared for the MJ decision model with this name, or an empty list when the
     * model is unknown or declares none.
     * @param modelName The MJ decision model, as {@link DecisionAnsweringModel.ModelName} reports it.
     */
    GetDecisionCalibrations(modelName: string): readonly DecisionCalibrationEntry[];
}

/** Which fit to look up: the decision use and the question within it. */
export interface DecisionCalibrationKey {
    /** The decision use, such as `conversation-routing`. */
    Use: string;
    /** The question key within the use, such as `continues`. */
    Question: string;
}

/**
 * The calibration fitted for this use and question on the exact model that answered, or null when
 * there is none, so the consumer treats the answer as unsure. The model's name selects its declared
 * calibrations; the use, the question and the resolved model must then match one entry exactly, after
 * trimming. A missing name, a missing source, or an entry whose `A` or `B` is not a finite number
 * matches nothing.
 *
 * @param source Where the calibrations are declared, normally `AIEngineBase.Instance`.
 * @param key The use and question.
 * @param answeredBy The model that answered.
 */
export function FindDecisionCalibration(
    source: DecisionCalibrationSource | null | undefined,
    key: DecisionCalibrationKey,
    answeredBy: DecisionAnsweringModel
): PlattCalibration | null {
    const modelName = answeredBy.ModelName?.trim();
    const resolvedModel = answeredBy.ResolvedModel?.trim();
    if (!source || !modelName || !resolvedModel) {
        return null;
    }
    const entry = source.GetDecisionCalibrations(modelName).find(c =>
        c.Use?.trim() === key.Use &&
        c.Question?.trim() === key.Question &&
        c.ResolvedModel?.trim() === resolvedModel &&
        Number.isFinite(c.A) &&
        Number.isFinite(c.B)
    );
    return entry ? { A: entry.A, B: entry.B } : null;
}

/**
 * A raw probability calibrated for the model that answered, or null when it has no calibration for
 * this use and question.
 *
 * @param source Where the calibrations are declared.
 * @param key The use and question.
 * @param probability The raw probability (a Likelihood, or a Choice's confidence).
 * @param answeredBy The model that answered.
 */
export function CalibrateDecisionProbability(
    source: DecisionCalibrationSource | null | undefined,
    key: DecisionCalibrationKey,
    probability: number,
    answeredBy: DecisionAnsweringModel
): number | null {
    const calibration = FindDecisionCalibration(source, key, answeredBy);
    return calibration ? ApplyPlattCalibration(probability, calibration) : null;
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
