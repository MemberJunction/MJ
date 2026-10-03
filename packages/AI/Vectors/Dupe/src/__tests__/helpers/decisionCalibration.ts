/**
 * Calibration fixtures shared by the decision-mode specs.
 *
 * The mocked decision runs answer as {@link ANSWERING_MODEL} at {@link ANSWERING_RESOLVED_MODEL},
 * which has a calibration, so the provider calibrates what they return. A spec states the
 * **calibrated** probability it means and sends the raw probability that the model's calibration
 * maps to it, from {@link RawFor}.
 */
import { DecisionResult, type PlattCalibration } from '@memberjunction/ai';
import type { ModelInfo } from '@memberjunction/ai-core-plus';
import type { AIDecisionRunResult } from '@memberjunction/ai-prompts';
import { DUPLICATE_DECISION_CALIBRATION } from '../../reasoning/DecisionReasoningProvider';

/** The model the mocked decision runs report as the one that answered. */
export const ANSWERING_MODEL: ModelInfo = { modelId: 'model-jev', modelName: 'Jev' };

/** The exact model the mocked runs' driver reports behind {@link ANSWERING_MODEL}. */
export const ANSWERING_RESOLVED_MODEL = 'typesafe/jev-1.13-20260917';

/**
 * The run fields that say which model answered: `modelInfo`, and the driver's
 * `DecisionResult.ResolvedModel`. A null argument leaves that one out.
 */
export function AnsweredBy(
    model: ModelInfo | null = ANSWERING_MODEL,
    resolvedModel: string | null = ANSWERING_RESOLVED_MODEL
): Pick<AIDecisionRunResult, 'modelInfo' | 'DecisionResult'> {
    const driverResult = new DecisionResult(true, new Date(0), new Date(0));
    if (resolvedModel !== null) {
        driverResult.ResolvedModel = resolvedModel;
    }
    return { modelInfo: model ?? undefined, DecisionResult: driverResult };
}

/** The shipped calibration for an MJ decision model. Throws when it has none. */
export function ShippedCalibration(modelName: string): PlattCalibration {
    const entry = DUPLICATE_DECISION_CALIBRATION.find(c => c.ModelName === modelName);
    if (!entry) {
        throw new Error(`No shipped calibration for ${modelName}`);
    }
    return entry.Calibration;
}

/**
 * The raw probability that `calibration` maps to `calibrated` (Platt, inverted):
 * `sigmoid((logit(calibrated) - B) / A)`. Defaults to {@link ANSWERING_MODEL}'s calibration.
 */
export function RawFor(
    calibrated: number,
    calibration: PlattCalibration = ShippedCalibration(ANSWERING_MODEL.modelName)
): number {
    const logit = Math.log(calibrated / (1 - calibrated));
    return 1 / (1 + Math.exp(-(logit - calibration.B) / calibration.A));
}
