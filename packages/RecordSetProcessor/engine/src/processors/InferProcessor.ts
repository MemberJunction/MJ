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
import { UUIDsEqual, canonicalize, computeContentHashAsync, resolveMappingRef, resolveValueMapping } from '@memberjunction/global';
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
    FeatureValueCacheService,
    type CacheKeyResult,
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

    public async ProcessRecord(
        record: RecordRef,
        context: RecordProcessorContext,
        options?: { skipLookup?: boolean; keyInfo?: CacheKeyResult }
    ): Promise<RecordResult> {
        await AIEngine.Instance.Config(false, context.contextUser);
        const prompt = AIEngine.Instance.Prompts.find((p) => UUIDsEqual(p.ID, this.promptID));
        if (!prompt) {
            return { Status: 'Failed', ErrorMessage: `AI Prompt '${this.promptID}' not found` };
        }

        const isCacheable = this.spec?.Caching?.Cacheable === true;
        const promptVersionHash = this.computePromptVersionHash(prompt as MJAIPromptEntityExtended, this.spec);
        const constraintHash = this.computeConstraintHash(this.spec);
        let keyInfo: CacheKeyResult | undefined;

        // P1-7c Dedup Cache lookup
        if (isCacheable) {
            keyInfo =
                options?.keyInfo ??
                (await FeatureValueCacheService.Instance.computeCacheKey({
                    keyFields: this.spec?.Caching?.KeyFields,
                    recordData: this.recordToPlain(record),
                }));

            if (!options?.skipLookup) {
                const cached = await FeatureValueCacheService.Instance.Lookup({
                    recordProcessID: context.recordProcessID,
                    scope: this.spec?.Caching?.Scope,
                    promptID: prompt.ID,
                    promptVersionHash,
                    constraintHash,
                    keyHash: keyInfo.keyHash,
                    contextUser: context.contextUser,
                    provider: context.provider,
                });

                if (cached) {
                    const cachedPayload = JSON.parse(cached.OutputsJSON);
                    await this.recordFeatureValuesHistory({
                        record,
                        context,
                        payload: cachedPayload,
                        reasoning: cached.Reasoning,
                        promptID: prompt.ID,
                        promptVersionHash,
                        constraintHash,
                        aiPromptRunID: cached.AIPromptRunID,
                        featureValueCacheID: cached.ID,
                    });
                    return {
                        Status: 'Succeeded',
                        ResultPayload: cachedPayload,
                        AIPromptRunID: cached.AIPromptRunID ?? undefined,
                        PromptVersionHash: promptVersionHash,
                        FeatureValueCacheID: cached.ID,
                    };
                }
            }
        }

        // P1-6 Hook: beforeBuildContext
        await this.beforeBuildContext(record, context);

        // Carry ValidationBehavior on the execution run (AIPromptParams.validationBehavior)
        // and wrap the prompt in an execution-scoped Proxy so reads of params.prompt.ValidationBehavior
        // see the execution's behavior without mutating the shared entity in AIEngine cache (R11-B).
        const targetValidationBehavior = (this.spec?.Outputs && this.spec.Outputs.length > 0) ? 'Strict' : prompt.ValidationBehavior;

        const executionPrompt = new Proxy(prompt, {
            get(target, prop, receiver) {
                if (prop === 'ValidationBehavior') {
                    return targetValidationBehavior;
                }
                return Reflect.get(target, prop, receiver);
            }
        });

        const params = new AIPromptParams();
        params.prompt = executionPrompt;
        params.validationBehavior = targetValidationBehavior;
        params.data = await this.buildPromptData(record, context);
        params.contextUser = context.contextUser;

        // P1-6 Hook: beforePromptExecute
        await this.beforePromptExecute(params, record, context);

        const result: AIPromptRunResult = await new AIPromptRunner().ExecutePrompt(params);

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

        let featureValueCacheID: string | undefined;
        const reasoning = typeof rawResult === 'object' && rawResult !== null ? (rawResult as Record<string, unknown>).reasoning as string | undefined : undefined;

        // P1-7c Dedup Cache store
        if (isCacheable && keyInfo) {
            try {
                const stored = await FeatureValueCacheService.Instance.Store({
                    recordProcessID: context.recordProcessID,
                    scope: this.spec?.Caching?.Scope,
                    promptID: prompt.ID,
                    promptVersionHash,
                    constraintHash,
                    keyHash: keyInfo.keyHash,
                    keyDisplay: keyInfo.keyDisplay,
                    keyJSON: keyInfo.keyJSON,
                    outputsJSON: JSON.stringify(validationOutcome.payload),
                    reasoning: reasoning ?? null,
                    aiPromptRunID: aiPromptRunID ?? null,
                    ttlSeconds: this.spec?.Caching?.TTLSeconds,
                    contextUser: context.contextUser,
                    provider: context.provider,
                });
                featureValueCacheID = stored.ID;
            } catch (e) {
                LogError(`InferProcessor: failed storing cache entry: ${e instanceof Error ? e.message : String(e)}`);
            }
        }

        // P1-7c History tracking in MJ: Feature Values
        await this.recordFeatureValuesHistory({
            record,
            context,
            payload: validationOutcome.payload,
            reasoning,
            promptID: prompt.ID,
            promptVersionHash,
            constraintHash,
            aiPromptRunID,
            featureValueCacheID,
        });

        return {
            Status: 'Succeeded',
            ResultPayload: validationOutcome.payload,
            AIPromptRunID: aiPromptRunID,
            PromptVersionHash: promptVersionHash,
            FeatureValueCacheID: featureValueCacheID,
        };
    }

    /**
     * Two-phase batch execution (P1-7c). Resolves distinct keys across the batch first,
     * checks the dedup cache in one batch query, executes LLM prompts ONCE per distinct key,
     * and fans results back across all matching rows.
     */
    public async ProcessBatch(records: RecordRef[], context: RecordProcessorContext): Promise<Map<string, RecordResult>> {
        const results = new Map<string, RecordResult>();
        if (!this.spec?.Caching?.Cacheable || records.length === 0) {
            for (const r of records) {
                results.set(r.RecordID, await this.ProcessRecord(r, context));
            }
            return results;
        }

        await AIEngine.Instance.Config(false, context.contextUser);
        const prompt = AIEngine.Instance.Prompts.find((p) => UUIDsEqual(p.ID, this.promptID));
        if (!prompt) {
            for (const r of records) {
                results.set(r.RecordID, { Status: 'Failed', ErrorMessage: `AI Prompt '${this.promptID}' not found` });
            }
            return results;
        }

        const promptVersionHash = this.computePromptVersionHash(prompt as MJAIPromptEntityExtended, this.spec);
        const constraintHash = this.computeConstraintHash(this.spec);

        // Phase 1: Compute distinct cache keys across the batch
        const keyGroupMap = new Map<string, { keyInfo: CacheKeyResult; records: RecordRef[] }>();
        for (const record of records) {
            const recordData = this.recordToPlain(record);
            const keyInfo = await FeatureValueCacheService.Instance.computeCacheKey({
                keyFields: this.spec.Caching.KeyFields,
                recordData,
            });
            let group = keyGroupMap.get(keyInfo.keyHash);
            if (!group) {
                group = { keyInfo, records: [] };
                keyGroupMap.set(keyInfo.keyHash, group);
            }
            group.records.push(record);
        }

        // Phase 2: Batch lookup existing cache entries for all distinct keys
        const distinctKeyHashes = Array.from(keyGroupMap.keys());
        const cacheMap = await FeatureValueCacheService.Instance.BatchLookup({
            recordProcessID: context.recordProcessID,
            scope: this.spec.Caching.Scope,
            promptID: prompt.ID,
            promptVersionHash,
            constraintHash,
            keyHashes: distinctKeyHashes,
            contextUser: context.contextUser,
            provider: context.provider,
        });

        // Phase 3: Fan out hits; execute misses ONCE per distinct key and fan out
        for (const [keyHash, group] of keyGroupMap.entries()) {
            const cached = cacheMap.get(keyHash);
            if (cached) {
                // CACHE HIT: fan out immediately to all matching records without calling LLM!
                const cachedPayload = JSON.parse(cached.OutputsJSON);
                for (const rec of group.records) {
                    await this.recordFeatureValuesHistory({
                        record: rec,
                        context,
                        payload: cachedPayload,
                        reasoning: cached.Reasoning,
                        promptID: prompt.ID,
                        promptVersionHash,
                        constraintHash,
                        aiPromptRunID: cached.AIPromptRunID,
                        featureValueCacheID: cached.ID,
                    });
                    results.set(rec.RecordID, {
                        Status: 'Succeeded',
                        ResultPayload: cachedPayload,
                        AIPromptRunID: cached.AIPromptRunID ?? undefined,
                        PromptVersionHash: promptVersionHash,
                        FeatureValueCacheID: cached.ID,
                    });
                }
            } else {
                // CACHE MISS: Execute prompt ONCE for the distinct key (using the first record in the group)
                const sampleRecord = group.records[0];
                const singleResult = await this.ProcessRecord(sampleRecord, context, {
                    skipLookup: true,
                    keyInfo: group.keyInfo,
                });

                // Fan out result to all records in this group
                for (const rec of group.records) {
                    if (rec.RecordID === sampleRecord.RecordID) {
                        results.set(rec.RecordID, singleResult);
                    } else {
                        if (singleResult.Status === 'Succeeded') {
                            await this.recordFeatureValuesHistory({
                                record: rec,
                                context,
                                payload: singleResult.ResultPayload,
                                promptID: prompt.ID,
                                promptVersionHash,
                                constraintHash,
                                aiPromptRunID: singleResult.AIPromptRunID,
                                featureValueCacheID: singleResult.FeatureValueCacheID,
                            });
                        }
                        results.set(rec.RecordID, { ...singleResult });
                    }
                }
            }
        }

        return results;
    }

    /** Computes a deterministic SHA-256 hash representing the prompt version and constraint instructions. */
    protected computePromptVersionHash(prompt: MJAIPromptEntityExtended, spec?: DataFeatureSpec): string {
        const promptText = prompt.TemplateText ?? prompt.Description ?? prompt.Name ?? '';
        const outputsStr = spec?.Outputs ? JSON.stringify(spec.Outputs) : '';
        const constraintBlock = spec?.Outputs ? renderConstraintBlock(spec.Outputs) : '';
        const hashBasis = `${prompt.ID}::${promptText}::${outputsStr}::${constraintBlock}`;
        return createHash('sha256').update(hashBasis).digest('hex');
    }

    /** Computes a deterministic SHA-256 hash representing the output constraints. */
    protected computeConstraintHash(spec?: DataFeatureSpec): string {
        if (!spec?.Outputs || spec.Outputs.length === 0) {
            return 'no-constraints';
        }
        const constraints = spec.Outputs.map((o) => ({
            name: o.Name,
            constraint: o.Constraint,
        }));
        const canonical = canonicalize(constraints);
        return createHash('sha256').update(canonical).digest('hex');
    }

    /**
     * Records historical audit rows in MJ: Feature Values for all outputs on a record.
     */
    protected async recordFeatureValuesHistory(params: {
        record: RecordRef;
        context: RecordProcessorContext;
        payload: unknown;
        reasoning?: string | null;
        confidence?: number | null;
        promptID?: string | null;
        promptVersionHash?: string | null;
        constraintHash?: string | null;
        aiPromptRunID?: string | null;
        featureValueCacheID?: string | null;
    }): Promise<void> {
        if (!this.spec?.Outputs || this.spec.Outputs.length === 0 || !params.context.recordProcessID || !params.context.entityID) {
            return;
        }

        const outputsList: Array<{ featureName: string; value: unknown; reasoning?: string | null; confidence?: number | null }> = [];
        const rawPayload = params.payload;
        const sources = { $: rawPayload };

        for (const output of this.spec.Outputs) {
            const val = resolveMappingRef(output.Ref, sources);
            outputsList.push({
                featureName: output.Name,
                value: val !== undefined ? val : null,
                reasoning: params.reasoning,
                confidence: params.confidence,
            });
        }

        try {
            await FeatureValueCacheService.Instance.RecordFeatureValues({
                recordProcessID: params.context.recordProcessID,
                entityID: params.context.entityID,
                recordID: params.record.RecordID,
                outputs: outputsList,
                promptID: params.promptID,
                promptVersionHash: params.promptVersionHash,
                constraintHash: params.constraintHash,
                processRunID: params.context.processRunID,
                aiPromptRunID: params.aiPromptRunID,
                featureValueCacheID: params.featureValueCacheID,
                contextUser: params.context.contextUser,
                provider: params.context.provider,
            });
        } catch (e) {
            LogError(`InferProcessor: failed to record FeatureValues history for record '${params.record.RecordID}': ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    /**
     * Computes the watermark basis hash for Checksum strategy:
     * SHA-256 over canonical { promptData, promptVersionHash }.
     */
    public async ComputeBasisHash(record: RecordRef, context: RecordProcessorContext): Promise<string> {
        await AIEngine.Instance.Config(false, context.contextUser);
        const prompt = AIEngine.Instance.Prompts.find((p) => UUIDsEqual(p.ID, this.promptID));
        const promptVersionHash = prompt ? this.computePromptVersionHash(prompt as MJAIPromptEntityExtended, this.spec) : '';
        const promptData = await this.buildPromptData(record, context);
        return computeContentHashAsync({
            promptData,
            promptVersionHash,
        });
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

        let payloadCopy: unknown =
            typeof rawResult === 'object' && rawResult !== null
                ? structuredClone(rawResult)
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
            }

            if (validation.coerced || validation.value !== rawVal) {
                if (output.Ref === '$') {
                    payloadCopy = validation.value;
                } else if (typeof payloadCopy === 'object' && payloadCopy !== null && output.Ref.startsWith('$.')) {
                    const propPath = output.Ref.substring(2);
                    setNestedValue(payloadCopy as Record<string, unknown>, propPath, validation.value);
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

/**
 * Sets a value at a dot-delimited path (e.g. 'a.b' or 'items[0].name') on an object,
 * mutating the object in-place and creating intermediate objects or arrays as needed.
 */
export function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
    if (!path) return;
    const parts = path.split('.');
    let current: Record<string, unknown> = obj;
    for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (!part || part === '__proto__' || part === 'constructor' || part === 'prototype') {
            return;
        }
        const arrayMatch = part.match(/^([^[]+)\[(\d+)\]$/);
        if (arrayMatch) {
            const name = arrayMatch[1];
            if (name === '__proto__' || name === 'constructor' || name === 'prototype') {
                return;
            }
            const index = parseInt(arrayMatch[2], 10);
            if (!Array.isArray(current[name])) {
                current[name] = [];
            }
            const arr = current[name] as unknown[];
            if (!arr[index] || typeof arr[index] !== 'object') {
                arr[index] = Object.create(null);
            }
            current = arr[index] as Record<string, unknown>;
        } else {
            if (current[part] === undefined || current[part] === null || typeof current[part] !== 'object') {
                current[part] = Object.create(null);
            }
            current = current[part] as Record<string, unknown>;
        }
    }

    const lastPart = parts[parts.length - 1];
    if (lastPart === '__proto__' || lastPart === 'constructor' || lastPart === 'prototype') {
        return;
    }
    const arrayMatch = lastPart.match(/^([^[]+)\[(\d+)\]$/);
    if (arrayMatch) {
        const name = arrayMatch[1];
        if (name === '__proto__' || name === 'constructor' || name === 'prototype') {
            return;
        }
        const index = parseInt(arrayMatch[2], 10);
        if (!Array.isArray(current[name])) {
            current[name] = [];
        }
        (current[name] as unknown[])[index] = value;
    } else {
        current[lastPart] = value;
    }
}

