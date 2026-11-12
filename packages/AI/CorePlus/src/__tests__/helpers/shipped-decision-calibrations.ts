import type { DecisionCalibrationEntry } from '@memberjunction/ai';
import type { DecisionCalibrationSource } from '../../decision-calibration';

/**
 * The conversation-routing calibrations shipped on the `Jev` and `LLM Decision` rows in
 * `metadata/ai-models` (`ModelConfiguration.Decision.Calibrations`), as a calibration source. A test
 * that reads them through the real metadata would need a database; this mirrors the shipped values.
 */
export const SHIPPED_ROUTING_CALIBRATIONS: Readonly<Record<string, readonly DecisionCalibrationEntry[]>> = Object.freeze({
    'Jev': [{ Use: 'conversation-routing', Question: 'continues', ResolvedModel: 'typesafe/jev-1.13-20260917', A: 1.7757, B: -0.8385 }],
    'LLM Decision': [{ Use: 'conversation-routing', Question: 'continues', ResolvedModel: 'GPT-OSS-120B', A: 1.6508, B: -0.3989 }],
});

/** A calibration source over a fixed table, by model name. */
export function CalibrationSource(table: Readonly<Record<string, readonly DecisionCalibrationEntry[]>>): DecisionCalibrationSource {
    return {
        GetDecisionCalibrations: (modelName: string) => Object.hasOwn(table, modelName) ? table[modelName] : [],
    };
}

/** The shipped routing calibrations as a source. */
export const SHIPPED_ROUTING_SOURCE: DecisionCalibrationSource = CalibrationSource(SHIPPED_ROUTING_CALIBRATIONS);
