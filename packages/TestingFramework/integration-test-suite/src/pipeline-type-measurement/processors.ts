/**
 * processors.ts — the `InferProcessor` each arm runs: nothing recorded, and the same value descriptions
 * for both arms.
 *
 * WHY THE LLM ARM NEEDS A SUBCLASS. The Decision driver gives the decision model each enum value's
 * description as its Choice question's option descriptions (`DecisionFeaturePipelineDriver.BuildQuestions`).
 * The LLM driver has no such channel: its prompt sees only the processor's prompt data, whose constraint
 * block lists the allowed values without their descriptions (`RenderConstraintBlock`). So the LLM arm runs
 * {@link ValueDescribingInferProcessor}, which adds the descriptions to its prompt data:
 * - the constraint block (`constraints` and `ConstraintBlock`) lists each allowed value with its
 *   description, so any LLM prompt that renders `{{ constraints }}` shows them;
 * - `valueDescriptions` holds them by output name and value, for a template that wants them apart.
 *
 * The Decision arm runs a plain `InferProcessor`, so its state is what a Decision pipeline sends.
 *
 * This is the one module of the measurement that loads MJ code at runtime (`InferProcessor`); the rest
 * stay pure so they can be tested without it.
 */
import { InferProcessor } from '@memberjunction/record-set-processor';
import type { RecordProcessorContext, RecordRef } from '@memberjunction/record-set-processor-base';
import type { MeasuredPipelineType, MeasurementOutput, MeasurementSpec } from './types';

/** The prompt-data key holding each output's value descriptions, by output name and then by value. */
export const VALUE_DESCRIPTIONS_KEY = 'valueDescriptions';

/** An `InferProcessor` whose prompt data carries each enum value's description (see the file header). */
export class ValueDescribingInferProcessor extends InferProcessor {
    protected override async buildPromptData(record: RecordRef, ctx?: RecordProcessorContext): Promise<Record<string, unknown>> {
        return AddValueDescriptions(await super.buildPromptData(record, ctx), this.spec?.Outputs ?? []);
    }
}

/**
 * The processor one arm runs over the sample: {@link ValueDescribingInferProcessor} for LLM, a plain
 * `InferProcessor` for Decision. Neither records history (`WritesHistory` off); the rig passes no
 * `recordProcessID` either, and the spec is not cacheable, so nothing but prompt runs is written.
 */
export function CreateMeasurementProcessor(type: MeasuredPipelineType, spec: MeasurementSpec): InferProcessor {
    const processor = type === 'LLM'
        ? new ValueDescribingInferProcessor(spec.PromptID, undefined, spec)
        : new InferProcessor(spec.PromptID, undefined, spec);
    processor.WritesHistory = false;
    return processor;
}

/** Each enum output's value descriptions, by output name; outputs without any are left out. */
export function OutputValueDescriptions(outputs: readonly MeasurementOutput[]): Record<string, Record<string, string>> {
    const byOutput: Record<string, Record<string, string>> = {};
    for (const output of outputs) {
        const descriptions = enumValueDescriptions(output);
        if (descriptions) {
            byOutput[output.Name] = { ...descriptions };
        }
    }
    return byOutput;
}

/**
 * The constraint block with each allowed value's description after it: `* "System"` becomes
 * `* "System": Core system actions`. A value line is matched within its own output's section (from the
 * output's `- **Name** (Ref):` header to the next), so two outputs sharing a value keep their own text.
 */
export function DescribeConstraintBlock(block: string, outputs: readonly MeasurementOutput[]): string {
    let descriptions: Readonly<Record<string, string>> | undefined;
    return block.split('\n').map((line) => {
        const header = outputs.find((output) => line === `- **${output.Name}** (${output.Ref}):`);
        if (header) {
            descriptions = enumValueDescriptions(header);
            return line;
        }
        const value = /^\s*\* "(.*)"$/.exec(line)?.[1];
        const description = value === undefined ? undefined : descriptions?.[value];
        return description ? `${line}: ${description}` : line;
    }).join('\n');
}

/** The prompt data with the value descriptions added (see the file header). Other keys are untouched. */
export function AddValueDescriptions(promptData: Record<string, unknown>, outputs: readonly MeasurementOutput[]): Record<string, unknown> {
    const descriptions = OutputValueDescriptions(outputs);
    if (Object.keys(descriptions).length === 0) {
        return promptData;
    }
    const described: Record<string, unknown> = { ...promptData, [VALUE_DESCRIPTIONS_KEY]: descriptions };
    for (const key of ['constraints', 'ConstraintBlock']) {
        const block = promptData[key];
        if (typeof block === 'string') {
            described[key] = DescribeConstraintBlock(block, outputs);
        }
    }
    return described;
}

/** An enum output's non-empty value descriptions, or undefined for any other output. */
function enumValueDescriptions(output: MeasurementOutput): Readonly<Record<string, string>> | undefined {
    const constraint = output.Constraint;
    if (constraint?.Type !== 'enum' || !constraint.ValueDescriptions) {
        return undefined;
    }
    const entries = Object.entries(constraint.ValueDescriptions).filter(([, text]) => typeof text === 'string' && text.trim().length > 0);
    return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}
