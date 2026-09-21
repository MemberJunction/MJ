/**
 * @fileoverview Infer processor — for each record, runs an AI Prompt over the record's data and
 * returns the structured result as the record's `ResultPayload`. Write-back is NOT done here: the
 * `WriteBackProcessor` wrapper (added by `RecordProcessExecutor` when an OutputMapping is set)
 * applies the Record Process's OutputMapping uniformly across Action / Agent / Infer work types.
 *
 * Supports DataFeatureSpec context (EntityDocumentID template rendering with __Parent context,
 * QueryID parameterized execution, Field projections), Layer-1 constraint injection, Layer-2
 * constraint validation with OnViolation policies, and lifecycle hooks (P1-6).
 *
 * @module @memberjunction/record-set-processor
 */

import { createHash } from 'node:crypto';
import { LogError, RunQuery } from '@memberjunction/core';
import { UUIDsEqual, resolveMappingRef, resolveValueMapping } from '@memberjunction/global';
import { AIEngine } from '@memberjunction/aiengine';
import { AIPromptRunner } from '@memberjunction/ai-prompts';
import { AIPromptParams, type AIPromptRunResult, type MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import {
    IRecordProcessor,
    RecordProcessorContext,
    RecordRef,
    RecordResult,
} from '@memberjunction/record-set-processor-base';
import {
    DataFeatureSpec,
    DataFeatureOutput,
    renderConstraintBlock,
    validateOutputValue,
    type ViolationPolicy,
} from '@memberjunction/feature-pipelines';
import { EntityDocumentCache, EntityDocumentTemplateParser } from '@memberjunction/entity-documents';
import type { OutputMappingConfig } from '../writeBack';

/** Runs an AI Prompt per record and returns its structured output (write-back is the wrapper's job). */
export class InferProcessor implements IRecordProcessor {
    /**
     * @param promptID - The `MJ: AI Prompts` ID to run for each record.
     * @param inputMapping - Optional mapping shaping the data passed to the prompt (default: `{ record }`).
     * @param spec - Optional DataFeatureSpec defining outputs, constraints, and caching policy.
     */
    constructor(
        protected readonly promptID: string,
        protected readonly inputMapping?: Record<string, string>,
        protected readonly spec?: DataFeatureSpec,
    ) {}

    public async ProcessRecord(record: RecordRef, context: RecordProcessorContext): Promise<RecordResult> {
        await AIEngine.Instance.Config(false, context.contextUser);
        const prompt = AIEngine.Instance.Prompts.find((p) => UUIDsEqual(p.ID, this.promptID));
        if (!prompt) {
            return { Status: 'Failed', ErrorMessage: `AI Prompt '${this.promptID}' not found` };
        }

        // P1-6 Hook: beforeBuildContext
        await this.beforeBuildContext(record, context);

        const params = new AIPromptParams();
        params.prompt = prompt;
        if (this.spec?.Outputs && this.spec.Outputs.length > 0) {
            params.prompt.ValidationBehavior = 'Strict';
        }
        params.data = await this.buildPromptData(record, context);
        params.contextUser = context.contextUser;

        // P1-6 Hook: beforePromptExecute
        await this.beforePromptExecute(params, record, context);

        const result = await new AIPromptRunner().ExecutePrompt(params);
        const aiPromptRunID = result.promptRun?.ID;
        if (!result.success) {
            return {
                Status: 'Failed',
                ErrorMessage: result.errorMessage ?? 'AI prompt execution failed',
                AIPromptRunID: aiPromptRunID,
            };
        }

        // P1-6 Hook: afterPromptExecute
        const rawResult = await this.afterPromptExecute(result, record, context);

        // Layer 2: Validate outputs against constraints and apply OnViolation policy
        const validationOutcome = await this.validateOutputs(
            this.spec?.Outputs ?? [],
            rawResult,
            record,
            context
        );

        if (!validationOutcome.valid) {
            return {
                Status: 'Failed',
                ErrorMessage: validationOutcome.errorMessage ?? 'Constraint violation',
                AIPromptRunID: aiPromptRunID,
            };
        }

        const promptVersionHash = this.computePromptVersionHash(prompt as MJAIPromptEntityExtended, this.spec);

        return {
            Status: 'Succeeded',
            ResultPayload: validationOutcome.payload,
            AIPromptRunID: aiPromptRunID,
            PromptVersionHash: promptVersionHash,
        };
    }

    /** Computes a deterministic SHA-256 hash representing the prompt version and constraint instructions. */
    protected computePromptVersionHash(prompt: MJAIPromptEntityExtended, spec?: DataFeatureSpec): string {
        const promptText = prompt.TemplateText ?? prompt.Description ?? prompt.Name ?? '';
        const outputsStr = spec?.Outputs ? JSON.stringify(spec.Outputs) : '';
        const constraintBlock = spec?.Outputs ? renderConstraintBlock(spec.Outputs) : '';
        const hashBasis = `${prompt.ID}::${promptText}::${outputsStr}::${constraintBlock}`;
        return createHash('sha256').update(hashBasis).digest('hex');
    }

    // -------------------------------------------------------------------------------------------------
    // P1-6 Lifecycle Hooks (overridable by subclasses registered under DataFeatureSpec.ProcessorExtensionKey)
    // -------------------------------------------------------------------------------------------------

    /** Lifecycle hook called before prompt data context is constructed. */
    protected async beforeBuildContext(record: RecordRef, ctx: RecordProcessorContext): Promise<void> {}

    /** Lifecycle hook called immediately before ExecutePrompt is invoked. */
    protected async beforePromptExecute(params: AIPromptParams, record: RecordRef, ctx: RecordProcessorContext): Promise<void> {}

    /** Lifecycle hook called after prompt execution returns successfully. Defaults to returning result.result. */
    protected async afterPromptExecute(
        result: AIPromptRunResult<unknown>,
        record: RecordRef,
        ctx: RecordProcessorContext
    ): Promise<unknown> {
        return result.result ?? {};
    }

    /**
     * Layer 2 output validation hook. Evaluates outputs against declared constraints, applies OnViolation
     * policies (fail, null, coerce-to-other), and builds the processed payload.
     */
    protected async validateOutputs(
        outputs: DataFeatureOutput[],
        rawResult: unknown,
        record: RecordRef,
        ctx: RecordProcessorContext
    ): Promise<{ valid: boolean; payload?: unknown; errorMessage?: string }> {
        if (!outputs || !Array.isArray(outputs) || outputs.length === 0) {
            return { valid: true, payload: rawResult };
        }

        const payloadCopy =
            typeof rawResult === 'object' && rawResult !== null
                ? { ...(rawResult as Record<string, unknown>) }
                : rawResult;
        const violations: Array<{ outputName: string; violationMessage: string; policy: ViolationPolicy }> = [];

        for (const output of outputs) {
            if (!output.Constraint) {
                continue;
            }

            const sources = { $: rawResult };
            const rawVal = resolveMappingRef(output.Ref, sources);

            let targetTSType: string | undefined;
            const target = output.Target;
            if (target.Mode === 'field') {
                const entity = ctx.provider?.EntityByID(record.EntityID);
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
                    valid: false,
                    errorMessage: `Constraint violation for '${output.Name}': ${validation.violationMessage}`,
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

        return { valid: true, payload: payloadCopy };
    }

    /** Lifecycle hook to resolve a dedup cache key for this record. Default returns null (computed by cache service). */
    protected async resolveCacheKey(record: RecordRef, spec: DataFeatureSpec | undefined, ctx: RecordProcessorContext): Promise<string | null> {
        return null;
    }

    /** Lifecycle hook called before write-back is executed on this record. */
    protected async beforeWriteBack(
        mapping: OutputMappingConfig | undefined,
        result: unknown,
        record: RecordRef,
        ctx: RecordProcessorContext
    ): Promise<void> {}

    // -------------------------------------------------------------------------------------------------
    // Context Construction & Helpers
    // -------------------------------------------------------------------------------------------------

    /**
     * Builds the data object passed to the prompt.
     * Incorporates spec.Context (EntityDocumentID rendering, QueryID parameterized execution, Field filtering),
     * input mapping, and Layer-1 constraint instructions.
     */
    protected async buildPromptData(record: RecordRef, ctx?: RecordProcessorContext): Promise<Record<string, unknown>> {
        let recordData = this.recordToPlain(record);

        // Context.Fields projection: filter record fields if explicit fields are listed
        if (this.spec?.Context?.Fields && this.spec.Context.Fields.length > 0) {
            const allowed = new Set(this.spec.Context.Fields.map((f) => f.toLowerCase()));
            const filtered: Record<string, unknown> = {};
            for (const [key, val] of Object.entries(recordData)) {
                if (allowed.has(key.toLowerCase()) || key === 'ID' || key === 'RecordID' || key === 'EntityID') {
                    filtered[key] = val;
                }
            }
            recordData = filtered;
        }

        let promptData: Record<string, unknown>;
        const mappingToUse = this.inputMapping ?? this.spec?.Context?.InputMapping;

        if (!mappingToUse) {
            promptData = { record: recordData };
        } else {
            const mapped = resolveValueMapping(mappingToUse, { record: recordData });
            promptData = mapped && typeof mapped === 'object' ? (mapped as Record<string, unknown>) : { record: recordData };
        }

        // P1-8a: EntityDocument context rendering
        if (this.spec?.Context?.EntityDocumentID && ctx) {
            try {
                await EntityDocumentCache.Instance.Refresh(false, ctx.contextUser);
                const doc = EntityDocumentCache.Instance.GetDocument(
                    this.spec.Context.EntityDocumentID
                );
                if (doc) {
                    const parser = EntityDocumentTemplateParser.CreateInstance();
                    if (ctx.provider) {
                        parser.ProviderOverride = ctx.provider;
                    }
                    const templateText = await parser.resolveDocumentTemplateText(doc, ctx.contextUser);
                    if (templateText && templateText.trim().length > 0) {
                        const rendered = await parser.Parse(templateText, record.EntityID, recordData, ctx.contextUser);
                        promptData.context = rendered;
                        promptData.RenderedContext = rendered;
                        promptData.document = rendered;
                    }
                }
            } catch (e) {
                LogError(`InferProcessor: failed to render EntityDocument '${this.spec.Context.EntityDocumentID}': ${e instanceof Error ? e.message : String(e)}`);
            }
        }

        // P1-8a / C7: Query context execution
        if (this.spec?.Context?.QueryID && ctx) {
            try {
                const rq = new RunQuery();
                const queryParams: Record<string, unknown> = {};
                if (this.spec.Context.QueryParams) {
                    for (const [pName, pRef] of Object.entries(this.spec.Context.QueryParams)) {
                        queryParams[pName] = resolveMappingRef(pRef, { record: recordData, $: recordData });
                    }
                }
                const qResult = await rq.RunQuery(
                    { QueryID: this.spec.Context.QueryID, Parameters: queryParams },
                    ctx.contextUser
                );
                if (qResult && qResult.Success) {
                    promptData.queryResult = qResult.Results;
                    if (!promptData.context) {
                        promptData.context = qResult.Results;
                    }
                } else {
                    LogError(`InferProcessor: RunQuery '${this.spec.Context.QueryID}' failed: ${qResult?.ErrorMessage ?? 'unknown error'}`);
                }
            } catch (e) {
                LogError(`InferProcessor: failed executing Query '${this.spec.Context.QueryID}': ${e instanceof Error ? e.message : String(e)}`);
            }
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
    protected recordToPlain(record: RecordRef): Record<string, unknown> {
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
