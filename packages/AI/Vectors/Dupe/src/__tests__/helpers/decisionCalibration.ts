/**
 * Calibration fixtures shared by the decision-mode specs.
 *
 * The mocked decision runs answer as {@link ANSWERING_MODEL}, which has a calibration, so the
 * provider calibrates what they return. A spec states the **calibrated** probability it means and
 * sends the raw probability that the model's calibration maps to it, from {@link RawFor}.
 */
import type { PlattCalibration } from '@memberjunction/ai';
import type { ModelInfo } from '@memberjunction/ai-core-plus';
import { DUPLICATE_DECISION_CALIBRATION } from '../../reasoning/DecisionReasoningProvider';

/** The model the mocked decision runs report as the one that answered. */
export const ANSWERING_MODEL: ModelInfo = { modelId: 'model-jev', modelName: 'Jev' };

/**
 * The raw probability that `calibration` maps to `calibrated` (Platt, inverted):
 * `sigmoid((logit(calibrated) - B) / A)`. Defaults to {@link ANSWERING_MODEL}'s calibration.
 */
export function RawFor(
    calibrated: number,
    calibration: PlattCalibration = DUPLICATE_DECISION_CALIBRATION[ANSWERING_MODEL.modelName]
): number {
    const logit = Math.log(calibrated / (1 - calibrated));
    return 1 / (1 + Math.exp(-(logit - calibration.B) / calibration.A));
}
