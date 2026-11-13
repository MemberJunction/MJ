import type { DecisionCalibrationEntry, PlattCalibration } from '@memberjunction/ai';
import type { DecisionAnsweringModel } from '../../decision-calibration';

/**
 * The conversation-routing calibrations shipped on the `Jev` and `LLM Decision` rows in
 * `metadata/ai-models` (`ModelConfiguration.Decision.Calibrations`). A test
 * that reads them through the real metadata would need a database; this mirrors the shipped values.
 */
export const SHIPPED_ROUTING_CALIBRATIONS: Readonly<Record<string, readonly DecisionCalibrationEntry[]>> = Object.freeze({
    'Jev': [{ Use: 'conversation-routing', Question: 'continues', ResolvedModel: 'typesafe/jev-1.13-20260917', A: 1.7757, B: -3.3506 }],
    'LLM Decision': [{ Use: 'conversation-routing', Question: 'continues', ResolvedModel: 'GPT-OSS-120B', A: 1.6508, B: -2.9110 }],
});

/**
 * The shipped routing fit for the model that answered, or null: what
 * `AIEngineBase.Instance.FindDecisionCalibration(ROUTING_CONTINUES_CALIBRATION_KEY, answeredBy)` returns
 * for the shipped metadata (exact model name and resolved model, after trimming).
 */
export function ShippedRoutingFit(answeredBy: DecisionAnsweringModel): PlattCalibration | null {
    const name = answeredBy.ModelName?.trim();
    const resolved = answeredBy.ResolvedModel?.trim();
    if (!name || !resolved || !Object.hasOwn(SHIPPED_ROUTING_CALIBRATIONS, name)) {
        return null;
    }
    const entry = SHIPPED_ROUTING_CALIBRATIONS[name].find(c => c.ResolvedModel === resolved);
    return entry ? { A: entry.A, B: entry.B } : null;
}
