/**
 * Calibration fixtures shared by the decision-mode specs.
 *
 * The mocked decision runs answer as {@link ANSWERING_MODEL} at {@link ANSWERING_RESOLVED_MODEL},
 * which has a calibration, so the provider calibrates what they return. A spec states the
 * **calibrated** probability it means and sends the raw probability that the model's calibration
 * maps to it, from {@link RawFor}.
 */
import { DecisionResult, type DecisionCalibrationEntry, type PlattCalibration } from '@memberjunction/ai';
import type { ModelInfo } from '@memberjunction/ai-core-plus';
import type { AIDecisionRunResult } from '@memberjunction/ai-prompts';

/**
 * The duplicate-detection calibrations shipped on the `Jev` and `LLM Decision` rows in
 * `metadata/ai-models` (`ModelConfiguration.Decision.Calibrations`), by model name. The specs serve
 * them through the mocked `AIEngine.Instance.GetDecisionCalibrations`, as the real engine serves the
 * metadata; `BaseAIEngine`'s seed test pins the metadata itself.
 */
export const SHIPPED_DUPLICATE_CALIBRATIONS: Readonly<Record<string, readonly DecisionCalibrationEntry[]>> = Object.freeze({
    'Jev': [{ Use: 'duplicate-detection', Question: 'duplicate', ResolvedModel: 'typesafe/jev-1.13-20260917', A: 2.5855, B: -4.4485 }],
    'LLM Decision': [{ Use: 'duplicate-detection', Question: 'duplicate', ResolvedModel: 'GPT-OSS-120B', A: 0.9918, B: -1.4843 }],
});

/** `AIEngine.Instance.GetDecisionCalibrations` over {@link SHIPPED_DUPLICATE_CALIBRATIONS}. */
export function ShippedDuplicateCalibrations(modelName: string): readonly DecisionCalibrationEntry[] {
    return Object.hasOwn(SHIPPED_DUPLICATE_CALIBRATIONS, modelName) ? SHIPPED_DUPLICATE_CALIBRATIONS[modelName] : [];
}

/**
 * The calibration methods of a mocked `AIEngine.Instance`, over `calibrations` (a model's declared
 * entries by name). `FindDecisionCalibration` follows `AIEngineBase`'s rule: the use, question and
 * resolved model match one entry exactly after trimming; a missing name or resolved model matches
 * nothing. `BaseAIEngine`'s own spec tests the real method.
 */
export function CalibrationEngineMethods(calibrations: (modelName: string) => readonly DecisionCalibrationEntry[]) {
    const find = (key: { Use: string; Question: string }, answeredBy: { ModelName?: string | null; ResolvedModel?: string | null }): PlattCalibration | null => {
        const name = answeredBy.ModelName?.trim();
        const resolved = answeredBy.ResolvedModel?.trim();
        if (!name || !resolved) {
            return null;
        }
        const entry = calibrations(name).find(c => c.Use === key.Use && c.Question === key.Question && c.ResolvedModel === resolved);
        return entry ? { A: entry.A, B: entry.B } : null;
    };
    return {
        GetDecisionCalibrations: calibrations,
        FindDecisionCalibration: find,
        CalibrateDecisionProbability: (key: { Use: string; Question: string }, p: number, answeredBy: { ModelName?: string | null; ResolvedModel?: string | null }): number | null => {
            const fit = find(key, answeredBy);
            return fit ? 1 / (1 + Math.exp(-(fit.A * Math.log(p / (1 - p)) + fit.B))) : null;
        },
    };
}

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
    const entry = ShippedDuplicateCalibrations(modelName)[0];
    if (!entry) {
        throw new Error(`No shipped calibration for ${modelName}`);
    }
    return { A: entry.A, B: entry.B };
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
