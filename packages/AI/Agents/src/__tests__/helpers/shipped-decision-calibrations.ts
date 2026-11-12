import type { DecisionCalibrationEntry } from '@memberjunction/ai';
import type { DecisionCalibrationSource } from '@memberjunction/ai-core-plus';

const JEV = 'typesafe/jev-1.13-20260917';
const GPT_OSS = 'GPT-OSS-120B';

/**
 * The agent-discovery and memory-note-gate calibrations shipped on the `Jev` and `LLM Decision` rows
 * in `metadata/ai-models` (`ModelConfiguration.Decision.Calibrations`), by model name. The specs serve
 * them through a calibration source or the mocked `AIEngine.Instance.GetDecisionCalibrations`, as the
 * real engine serves the metadata; `BaseAIEngine`'s seed test pins the metadata itself.
 */
export const SHIPPED_AGENT_CALIBRATIONS: Readonly<Record<string, readonly DecisionCalibrationEntry[]>> = Object.freeze({
    'Jev': [
        { Use: 'agent-discovery', Question: 'agent', ResolvedModel: JEV, A: 0.4412, B: 0.4571 },
        { Use: 'agent-discovery', Question: 'anyApplies', ResolvedModel: JEV, A: 1.2469, B: 1.77 },
        { Use: 'memory-note-gate', Question: 'note', ResolvedModel: JEV, A: 3.6391, B: -5.7059 },
    ],
    'LLM Decision': [
        { Use: 'agent-discovery', Question: 'agent', ResolvedModel: GPT_OSS, A: 1.4301, B: -0.0755 },
        { Use: 'agent-discovery', Question: 'anyApplies', ResolvedModel: GPT_OSS, A: 0.7114, B: 0.9073 },
    ],
});

/** `GetDecisionCalibrations` over {@link SHIPPED_AGENT_CALIBRATIONS}. */
export function ShippedAgentCalibrations(modelName: string): readonly DecisionCalibrationEntry[] {
    return Object.hasOwn(SHIPPED_AGENT_CALIBRATIONS, modelName) ? SHIPPED_AGENT_CALIBRATIONS[modelName] : [];
}

/** The shipped calibrations as a source. */
export const SHIPPED_AGENT_SOURCE: DecisionCalibrationSource = { GetDecisionCalibrations: ShippedAgentCalibrations };

/** One model's fit for a use and question, from {@link SHIPPED_AGENT_CALIBRATIONS}. Throws when there is none. */
export function ShippedFit(modelName: string, use: string, question: string): { A: number; B: number } {
    const entry = ShippedAgentCalibrations(modelName).find(c => c.Use === use && c.Question === question);
    if (!entry) {
        throw new Error(`No shipped ${use}/${question} calibration for ${modelName}`);
    }
    return { A: entry.A, B: entry.B };
}
