/**
 * @fileoverview Per-output confidence floors of a DataFeatureSpec: an output whose confidence is below its
 * `MinConfidence` is not written (`OnLowConfidence: 'null'`) or fails its record (`'fail'`). Pure: no database access.
 * @module @memberjunction/feature-pipelines
 */

import type { DataFeatureOutput, SpecValidationIssue } from './data-feature-spec.js';

/**
 * What a run does with an output below its floor: `null` withholds it (write-back clears a value the pipeline wrote and
 * keeps a person's) while the other outputs are written; `fail` fails the whole record.
 */
export type LowConfidencePolicy = 'null' | 'fail';

/** Every {@link LowConfidencePolicy}; typed by the union, so adding a policy without listing it is a compile error. */
const LOW_CONFIDENCE_POLICIES: ReadonlyArray<LowConfidencePolicy> = ['null', 'fail'];

/** One output a record's answer gave below its floor. */
export interface BelowConfidenceOutput {
    /** The output's `Name`. */
    OutputName: string;
    /** The confidence the answer gave the output; null when it gave none (or none in [0, 1]). */
    Confidence: number | null;
    /** The output's `MinConfidence`. */
    MinConfidence: number;
    /** The output's `OnLowConfidence`. */
    Policy: LowConfidencePolicy;
}

/** The confidence-floor rules of a spec's outputs. Every method is static and takes plain data. */
export class ConfidenceFloor {
    /** Whether an answer's confidence for an output is below its floor; a missing confidence is below any floor. */
    public static IsBelow(output: Pick<DataFeatureOutput, 'MinConfidence'>, confidence: number | undefined): boolean {
        if (typeof output.MinConfidence !== 'number') {
            return false;
        }
        return typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence < output.MinConfidence;
    }

    /**
     * The outputs with a floor whose confidence (by output name) is below it, in spec order.
     * @param confidences - each output's confidence by output name (the driver's, else the answer's at its
     *   ConfidenceRef); undefined when the answer gave none
     */
    public static FindBelow(outputs: ReadonlyArray<DataFeatureOutput>, confidences: Readonly<Record<string, number>> | undefined): BelowConfidenceOutput[] {
        const below: BelowConfidenceOutput[] = [];
        for (const output of outputs) {
            const confidence = confidences?.[output.Name];
            if (typeof output.MinConfidence === 'number' && output.OnLowConfidence && ConfidenceFloor.IsBelow(output, confidence)) {
                below.push({
                    OutputName: output.Name,
                    Confidence: typeof confidence === 'number' && Number.isFinite(confidence) ? confidence : null,
                    MinConfidence: output.MinConfidence,
                    Policy: output.OnLowConfidence,
                });
            }
        }
        return below;
    }

    /**
     * The floor problems of one output: a floor in (0, 1] set together with its policy; on an LLM pipeline a
     * `ConfidenceRef`; and no floor on a whole-answer (`$`) output when the spec has other outputs.
     * @param isLLMPipeline - whether the spec's pipeline type is LLM (`IsLLMPipelineType`)
     * @param outputCount - how many outputs the spec has
     */
    public static Validate(output: DataFeatureOutput, basePath: string, isLLMPipeline: boolean, outputCount: number): SpecValidationIssue[] {
        const floor: unknown = output.MinConfidence;
        const policy: unknown = output.OnLowConfidence;
        if (floor === undefined && policy === undefined) {
            return [];
        }
        const issues: SpecValidationIssue[] = [];
        if (floor === undefined) {
            issues.push(ConfidenceFloor.issue(`${basePath}.MinConfidence`, `Output '${output.Name}' sets OnLowConfidence without a MinConfidence.`,
                'Set MinConfidence (for example 0.5), or remove OnLowConfidence.'));
        } else if (typeof floor !== 'number' || !Number.isFinite(floor) || floor <= 0 || floor > 1) {
            issues.push(ConfidenceFloor.issue(`${basePath}.MinConfidence`,
                `Output '${output.Name}' has MinConfidence ${typeof floor === 'number' ? String(floor) : JSON.stringify(floor)}; it must be a number greater than 0 and at most 1.`,
                'Set MinConfidence between 0 and 1 (for example 0.5).'));
        } else if (!output.ConfidenceRef && isLLMPipeline) {
            issues.push(ConfidenceFloor.issue(`${basePath}.MinConfidence`,
                `Output '${output.Name}' sets MinConfidence but has no ConfidenceRef, so the model's answer states no confidence to compare.`,
                'Set ConfidenceRef to the result path of the output\'s confidence (for example "$.SeniorityConfidence").'));
        }
        if (output.Ref === '$' && outputCount > 1) {
            issues.push(ConfidenceFloor.issue(`${basePath}.MinConfidence`,
                `Output '${output.Name}' is the whole answer ($) and sets a confidence floor, but the spec has other outputs: withholding it would drop theirs too.`,
                'Give the output its own result path (for example "$.value"), or remove its floor.'));
        }
        if (policy === undefined) {
            issues.push(ConfidenceFloor.issue(`${basePath}.OnLowConfidence`, `Output '${output.Name}' sets MinConfidence without OnLowConfidence.`,
                "Set OnLowConfidence to 'null' (leave the output unwritten) or 'fail' (fail the record)."));
        } else if (!LOW_CONFIDENCE_POLICIES.some((p) => p === policy)) {
            issues.push(ConfidenceFloor.issue(`${basePath}.OnLowConfidence`,
                `Output '${output.Name}' has OnLowConfidence ${JSON.stringify(policy)}; expected one of: ${LOW_CONFIDENCE_POLICIES.join(', ')}.`,
                "Use 'null' (leave the output unwritten) or 'fail' (fail the record)."));
        }
        return issues;
    }

    /** One error issue. */
    private static issue(path: string, message: string, fix: string): SpecValidationIssue {
        return { Path: path, Message: message, FixRecommendation: fix, Severity: 'error' };
    }
}
