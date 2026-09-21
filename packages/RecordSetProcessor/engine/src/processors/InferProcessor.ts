/**
 * @fileoverview Infer processor — for each record, runs an AI Prompt over the record's data and
 * returns the structured result as the record's `ResultPayload`. Write-back is NOT done here: the
 * `WriteBackProcessor` wrapper (added by `RecordProcessExecutor` when an OutputMapping is set)
 * applies the Record Process's OutputMapping uniformly across Action / Agent / Infer work types.
 * @module @memberjunction/record-set-processor
 */

import { UUIDsEqual, resolveMappingRef, resolveValueMapping } from '@memberjunction/global';
import { AIEngine } from '@memberjunction/aiengine';
import { AIPromptRunner } from '@memberjunction/ai-prompts';
import { AIPromptParams } from '@memberjunction/ai-core-plus';
import {
    IRecordProcessor,
    RecordProcessorContext,
    RecordRef,
    RecordResult,
} from '@memberjunction/record-set-processor-base';
import {
    DataFeatureSpec,
    renderConstraintBlock,
    validateOutputValue,
    type ViolationPolicy,
} from '@memberjunction/feature-pipelines';

/** Runs an AI Prompt per record and returns its structured output (write-back is the wrapper's job). */
export class InferProcessor implements IRecordProcessor {
    /**
     * @param promptID - The `MJ: AI Prompts` ID to run for each record.
     * @param inputMapping - Optional mapping shaping the data passed to the prompt (default: `{ record }`).
     * @param spec - Optional DataFeatureSpec defining outputs, constraints, and caching policy.
     */
    constructor(
        private readonly promptID: string,
        private readonly inputMapping?: Record<string, string>,
        private readonly spec?: DataFeatureSpec,
    ) {}

    public async ProcessRecord(record: RecordRef, context: RecordProcessorContext): Promise<RecordResult> {
        await AIEngine.Instance.Config(false, context.contextUser);
        const prompt = AIEngine.Instance.Prompts.find((p) => UUIDsEqual(p.ID, this.promptID));
        if (!prompt) {
            return { Status: 'Failed', ErrorMessage: `AI Prompt '${this.promptID}' not found` };
        }

        const params = new AIPromptParams();
        params.prompt = prompt;
        if (this.spec?.Outputs && this.spec.Outputs.length > 0) {
            params.prompt.ValidationBehavior = 'Strict';
        }
        params.data = this.buildPromptData(record);
        params.contextUser = context.contextUser;

        const result = await new AIPromptRunner().ExecutePrompt(params);
        const aiPromptRunID = result.promptRun?.ID;
        if (!result.success) {
            return { Status: 'Failed', ErrorMessage: result.errorMessage ?? 'AI prompt execution failed', AIPromptRunID: aiPromptRunID };
        }

        const rawResult = result.result ?? {};
        let processedPayload = rawResult;

        // Layer 2: Validate outputs against constraints and apply OnViolation policy
        if (this.spec?.Outputs && Array.isArray(this.spec.Outputs) && this.spec.Outputs.length > 0) {
            const payloadCopy =
                typeof rawResult === 'object' && rawResult !== null
                    ? { ...(rawResult as Record<string, unknown>) }
                    : rawResult;
            const violations: Array<{ outputName: string; violationMessage: string; policy: ViolationPolicy }> = [];

            for (const output of this.spec.Outputs) {
                if (!output.Constraint) {
                    continue;
                }

                const sources = { $: rawResult };
                const rawVal = resolveMappingRef(output.Ref, sources);

                let targetTSType: string | undefined;
                const target = output.Target;
                if (target.Mode === 'field') {
                    const entity = context.provider?.EntityByID(record.EntityID);
                    const field = entity?.Fields?.find(
                        (f) => f.Name.toLowerCase() === target.EntityFieldName.toLowerCase()
                    );
                    targetTSType = field?.TSType;
                }

                const validation = validateOutputValue(rawVal, output.Constraint, {
                    targetFieldTSType: targetTSType,
                });

                if (!validation.valid) {
                    return {
                        Status: 'Failed',
                        ErrorMessage: `Constraint violation for '${output.Name}': ${validation.violationMessage}`,
                        AIPromptRunID: aiPromptRunID,
                    };
                }

                if (validation.violationPolicyApplied === 'null' || validation.violationPolicyApplied === 'coerce-to-other') {
                    violations.push({
                        outputName: output.Name,
                        violationMessage: validation.violationMessage ?? 'Constraint violation',
                        policy: validation.violationPolicyApplied,
                    });

                    if (typeof payloadCopy === 'object' && payloadCopy !== null && output.Ref.startsWith('$.')) {
                        const propPath = output.Ref.substring(2);
                        (payloadCopy as Record<string, unknown>)[propPath] = validation.value;
                    }
                }
            }

            if (typeof payloadCopy === 'object' && payloadCopy !== null && violations.length > 0) {
                (payloadCopy as Record<string, unknown>)._violations = violations;
            }
            processedPayload = payloadCopy;
        }

        return { Status: 'Succeeded', ResultPayload: processedPayload, AIPromptRunID: aiPromptRunID };
    }

    /** Builds the data object passed to the prompt — the record's fields under `record`, optionally remapped and with constraint block injected. */
    private buildPromptData(record: RecordRef): Record<string, unknown> {
        const recordData = this.recordToPlain(record);
        let promptData: Record<string, unknown>;
        if (!this.inputMapping) {
            promptData = { record: recordData };
        } else {
            const mapped = resolveValueMapping(this.inputMapping, { record: recordData });
            promptData = mapped && typeof mapped === 'object' ? (mapped as Record<string, unknown>) : { record: recordData };
        }

        // Layer 1: Inject constraint block if feature spec declares outputs
        if (this.spec?.Outputs && this.spec.Outputs.length > 0) {
            const constraintBlock = renderConstraintBlock(this.spec.Outputs);
            if (constraintBlock && constraintBlock.trim().length > 0) {
                promptData.constraints = constraintBlock;
                promptData.ConstraintBlock = constraintBlock;
            }
        }

        return promptData;
    }

    /** Extracts a plain field map from the record (BaseEntity → GetAll(), plain object → as-is). */
    private recordToPlain(record: RecordRef): Record<string, unknown> {
        const r = record.Record as { GetAll?: () => Record<string, unknown> } | Record<string, unknown> | undefined;
        if (r && typeof (r as { GetAll?: unknown }).GetAll === 'function') {
            return (r as { GetAll: () => Record<string, unknown> }).GetAll();
        }
        if (r && typeof r === 'object') {
            return r as Record<string, unknown>;
        }
        return { RecordID: record.RecordID, EntityID: record.EntityID };
    }
}
