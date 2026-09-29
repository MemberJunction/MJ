/**
 * fixtures.ts — the hand-computable fixture the metric, calibration and report tests share.
 *
 * Four records (r1, r2 labelled A; r3, r4 labelled B), two reps, both types. Every expected number in
 * the tests is worked out from this table by hand:
 *
 *   record  label  LLM rep1  LLM rep2   Decision rep1  Decision rep2
 *   r1      A      A         A          A  (0.90)      A  (0.95)
 *   r2      A      B         A          A  (0.60)      B  (0.50)
 *   r3      B      B         B          A  (0.55)      B  (0.70)
 *   r4      B      B         (failed)   B  (0.80)      A  (0.40)
 *
 * Every LLM run costs 0.01 USD and every Decision run 0.001 USD (the failed LLM run included).
 */
import type { LabeledRecord, MeasuredPipelineType, PromptRunCost, RecordPrediction } from '../../pipeline-type-measurement/types';

export const SAMPLE: LabeledRecord[] = [
    { RecordID: 'r1', Label: 'A' },
    { RecordID: 'r2', Label: 'A' },
    { RecordID: 'r3', Label: 'B' },
    { RecordID: 'r4', Label: 'B' },
];

/** One answer; `predicted` null means the record failed. */
export function Answer(type: MeasuredPipelineType, rep: number, recordID: string, predicted: string | null, confidence: number | null = null): RecordPrediction {
    return {
        RecordID: recordID,
        Type: type,
        Rep: rep,
        Succeeded: predicted !== null,
        Predicted: predicted,
        Confidence: confidence,
        PromptRunID: `${type}-${rep}-${recordID}`,
    };
}

export const PREDICTIONS: RecordPrediction[] = [
    Answer('LLM', 1, 'r1', 'A'), Answer('LLM', 1, 'r2', 'B'), Answer('LLM', 1, 'r3', 'B'), Answer('LLM', 1, 'r4', 'B'),
    Answer('LLM', 2, 'r1', 'A'), Answer('LLM', 2, 'r2', 'A'), Answer('LLM', 2, 'r3', 'B'), Answer('LLM', 2, 'r4', null),
    Answer('Decision', 1, 'r1', 'A', 0.9), Answer('Decision', 1, 'r2', 'A', 0.6), Answer('Decision', 1, 'r3', 'A', 0.55), Answer('Decision', 1, 'r4', 'B', 0.8),
    Answer('Decision', 2, 'r1', 'A', 0.95), Answer('Decision', 2, 'r2', 'B', 0.5), Answer('Decision', 2, 'r3', 'B', 0.7), Answer('Decision', 2, 'r4', 'A', 0.4),
];

/** A finished run's cost. */
export function RunCost(promptRunID: string, cost: number | null, executionTimeMS: number | null = null): PromptRunCost {
    return { PromptRunID: promptRunID, Cost: cost, Currency: cost === null ? null : 'USD', ExecutionTimeMS: executionTimeMS, Finished: true };
}

export const COSTS: Map<string, PromptRunCost> = new Map(
    PREDICTIONS.map((p) => {
        const id = p.PromptRunID ?? '';
        return [id, RunCost(id, p.Type === 'LLM' ? 0.01 : 0.001, p.Type === 'LLM' ? 1000 : 100)];
    })
);
