import { describe, it, expect, vi, beforeEach, type MockInstance } from 'vitest';
import { UserInfo, type IMetadataProvider } from '@memberjunction/core';
import { MJGlobal, RegisterClass } from '@memberjunction/global';
import { KnowledgeHubMetadataEngine, type MJFeaturePipelineTypeEntity } from '@memberjunction/core-entities';
import { AIEngine } from '@memberjunction/aiengine';
import { AIPromptRunner } from '@memberjunction/ai-prompts';
import type { AIPromptParams, AIPromptRunResult, MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import { ParameterFidelityError, type ParameterFidelity } from '@memberjunction/ai';
import type { RecordProcessorContext, RecordRef } from '@memberjunction/record-set-processor-base';
import {
    FeatureValueCacheService,
    LLM_FEATURE_PIPELINE_CAPABILITIES,
    type DataFeatureSpec,
    type FeaturePipelineDriverCapabilities,
    type FeaturePipelineFieldValueLookup,
    type RecordFeatureValuesOutcome,
} from '@memberjunction/feature-pipelines';
import { InferProcessor, type FeatureValueWriteParams } from '../processors/InferProcessor';
import { HistoryStoreDouble } from './history-store-double';
import { EntitiesOnlyProvider } from '@memberjunction/unit-testing';
import { CacheEntry } from './helpers/cache-entry';
import {
    BaseFeaturePipelineDriver,
    type FeaturePipelineComputeRequest,
    type FeaturePipelineComputeResult,
} from '../feature-pipeline-drivers/BaseFeaturePipelineDriver';
import { LLMFeaturePipelineDriver } from '../feature-pipeline-drivers/LLMFeaturePipelineDriver';

// ---------------------------------------------------------------------------
// Stub drivers, registered as a pipeline type's DriverClass would be
// ---------------------------------------------------------------------------

/** Produces a fixed result with a confidence per output. */
class ConfidenceStubDriver extends BaseFeaturePipelineDriver {
    public get Capabilities(): FeaturePipelineDriverCapabilities {
        return { ...LLM_FEATURE_PIPELINE_CAPABILITIES, ProducesReasoning: false, ProducesConfidence: true };
    }
    public async ComputeOutputs(): Promise<FeaturePipelineComputeResult> {
        return { Success: true, RawResult: { seniority: 'Director' }, Confidence: { Seniority: 0.87 } };
    }
}
RegisterClass(BaseFeaturePipelineDriver, 'FeaturePipelineDriverTest_ConfidenceStub')(ConfidenceStubDriver);

/** Produces a confidence per output, and an answer that also states one at a result path. */
class ConfidenceAndAnswerStubDriver extends ConfidenceStubDriver {
    public override async ComputeOutputs(): Promise<FeaturePipelineComputeResult> {
        return { Success: true, RawResult: { seniority: 'Director', seniorityConfidence: 0.2 }, Confidence: { Seniority: 0.87 } };
    }
}
RegisterClass(BaseFeaturePipelineDriver, 'FeaturePipelineDriverTest_ConfidenceAndAnswerStub')(ConfidenceAndAnswerStubDriver);

/** Produces only boolean outputs written to a field. */
class BooleanFieldOnlyDriver extends BaseFeaturePipelineDriver {
    public get Capabilities(): FeaturePipelineDriverCapabilities {
        return { ConstraintTypes: ['boolean'], TargetModes: ['field'], ProducesReasoning: false, ProducesConfidence: true };
    }
    public async ComputeOutputs(): Promise<FeaturePipelineComputeResult> {
        return { Success: true, RawResult: {} };
    }
}
RegisterClass(BaseFeaturePipelineDriver, 'FeaturePipelineDriverTest_BooleanFieldOnly')(BooleanFieldOnlyDriver);

/** Captures the fieldValues lookup passed to ValidateOutputs. */
class LookupCapturingDriver extends BaseFeaturePipelineDriver {
    public static LastLookup: FeaturePipelineFieldValueLookup | undefined;
    public get Capabilities(): FeaturePipelineDriverCapabilities {
        return LLM_FEATURE_PIPELINE_CAPABILITIES;
    }
    public override ValidateOutputs(spec: DataFeatureSpec, fieldValues?: FeaturePipelineFieldValueLookup): string[] {
        LookupCapturingDriver.LastLookup = fieldValues;
        return super.ValidateOutputs(spec, fieldValues);
    }
    public async ComputeOutputs(): Promise<FeaturePipelineComputeResult> {
        return { Success: true, RawResult: {} };
    }
}
RegisterClass(BaseFeaturePipelineDriver, 'FeaturePipelineDriverTest_LookupCapturing')(LookupCapturingDriver);

// ---------------------------------------------------------------------------
// Probes exposing InferProcessor's protected surface
// ---------------------------------------------------------------------------

class ProbeProcessor extends InferProcessor {
    public Resolve(context: RecordProcessorContext): Promise<BaseFeaturePipelineDriver> {
        return this.ResolveDriver(context);
    }
    public Hash(prompt: MJAIPromptEntityExtended, spec?: DataFeatureSpec): string {
        return this.computePromptVersionHash(prompt, spec);
    }
}

/** An extension overriding every hook the LLM driver calls back into, recording each call. */
class RecordingProcessor extends InferProcessor {
    public Calls: Array<{ Hook: string; Args: unknown[]; Returned?: unknown }> = [];

    protected override async beforeBuildContext(record: RecordRef, ctx: RecordProcessorContext): Promise<void> {
        this.Calls.push({ Hook: 'beforeBuildContext', Args: [record, ctx] });
    }
    protected override async buildPromptData(record: RecordRef, ctx?: RecordProcessorContext): Promise<Record<string, unknown>> {
        const data = await super.buildPromptData(record, ctx);
        this.Calls.push({ Hook: 'buildPromptData', Args: [record, ctx], Returned: data });
        return data;
    }
    protected override async beforePromptExecute(params: AIPromptParams, record: RecordRef, ctx: RecordProcessorContext): Promise<void> {
        this.Calls.push({ Hook: 'beforePromptExecute', Args: [params, record, ctx] });
    }
    protected override async afterPromptExecute(result: AIPromptRunResult<unknown>, record: RecordRef, ctx: RecordProcessorContext): Promise<unknown> {
        this.Calls.push({ Hook: 'afterPromptExecute', Args: [result, record, ctx] });
        return JSON.stringify({ seniority: 'Director', fromExtension: true });
    }
}

/** Captures what reaches the history hook. */
class HistoryCapturingProcessor extends InferProcessor {
    public HistoryParams: Array<Record<string, unknown>> = [];
    protected override async UpsertFeatureValues(params: FeatureValueWriteParams): Promise<RecordFeatureValuesOutcome | null> {
        this.HistoryParams.push({ ...params });
        return super.UpsertFeatureValues(params);
    }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PROMPT_ID = 'PROMPT-HASH-1';
const mockPrompt = {
    ID: PROMPT_ID,
    Name: 'Classify Seniority',
    TemplateText: 'Classify the seniority of {{record.Title}}',
    ValidationBehavior: 'Warn',
} as unknown as MJAIPromptEntityExtended;

function buildSpec(overrides: Partial<DataFeatureSpec> = {}): DataFeatureSpec {
    return {
        Name: 'Seniority',
        Description: 'Classifies seniority',
        PromptID: PROMPT_ID,
        Context: { Fields: ['Title'] },
        Caching: { Cacheable: false },
        Outputs: [
            {
                Ref: '$.seniority',
                Name: 'Seniority',
                Constraint: { Type: 'enum', Values: ['Executive', 'Director', 'Manager'], OnViolation: 'fail' },
                Target: { Mode: 'field', EntityFieldName: 'Seniority' },
            },
        ],
        ...overrides,
    };
}

function pipelineTypeRow(fields: Pick<MJFeaturePipelineTypeEntity, 'Name' | 'DriverClass' | 'Status'>): MJFeaturePipelineTypeEntity {
    return { ID: `FPT-${fields.Name}`, Description: null, ...fields } as unknown as MJFeaturePipelineTypeEntity;
}

const LLM_ROW = pipelineTypeRow({ Name: 'LLM', DriverClass: 'LLMFeaturePipelineDriver', Status: 'Active' });

/** The prompt version hashes computed by `next`'s code, before pipeline types existed. */
const HASH_ON_NEXT_WITH_SPEC = '464618d69ef78d5fe369cb9a1f5a32b79fb54cc4586417525117e4c2cc6f4fa7';
const HASH_ON_NEXT_WITHOUT_SPEC = '851bd19d440ee5324b4fd5c133145319bdaefcd631e28b021bbd5b24bac1d015';

/** What a history write that inserted every output returns. */
const UPSERTED: RecordFeatureValuesOutcome = { Upserted: 1, Unchanged: 0, Previous: {} };

describe('Feature Pipeline driver seam', () => {
    const context: RecordProcessorContext = {
        contextUser: new UserInfo(),
        // The entity is unknown here: the provider knows no entities
        provider: new EntitiesOnlyProvider([]),
        recordProcessID: 'RP-1',
        entityID: 'ENT-1',
        processRunID: 'RUN-1',
    };
    const makeRecord = (id = 'rec-1'): RecordRef => ({
        EntityID: 'ENT-1',
        RecordID: id,
        Record: { ID: id, Title: 'VP of Sales' },
    });

    let catalogRows: MJFeaturePipelineTypeEntity[];
    let executePrompt: ReturnType<typeof vi.fn>;
    let catalogConfig: MockInstance<KnowledgeHubMetadataEngine['Config']>;
    let recordFeatureValues: MockInstance<FeatureValueCacheService['RecordFeatureValues']>;

    beforeEach(() => {
        catalogRows = [LLM_ROW];
        vi.spyOn(AIEngine.Instance, 'Config').mockResolvedValue(undefined);
        vi.spyOn(AIEngine.Instance, 'Prompts', 'get').mockReturnValue([mockPrompt]);
        catalogConfig = vi.spyOn(KnowledgeHubMetadataEngine.Instance, 'Config').mockResolvedValue(undefined);
        vi.spyOn(KnowledgeHubMetadataEngine.Instance, 'FeaturePipelineTypes', 'get').mockImplementation(() => catalogRows);
        executePrompt = vi.fn(async () => ({ success: true, result: { seniority: 'Director' }, promptRun: { ID: 'PROMPT-RUN-1' } }));
        vi.spyOn(AIPromptRunner.prototype, 'ExecutePrompt').mockImplementation(executePrompt);
        recordFeatureValues = vi.spyOn(FeatureValueCacheService.Instance, 'RecordFeatureValues').mockResolvedValue(UPSERTED);
    });

    // ================================================================
    // Resolution
    // ================================================================

    describe('ResolveDriver', () => {
        it('resolves a spec without PipelineType to the LLM driver, once per processor instance', async () => {
            const processor = new ProbeProcessor(PROMPT_ID, undefined, buildSpec(), null);
            const first = await processor.Resolve(context);
            const second = await processor.Resolve(context);

            expect(first).toBeInstanceOf(LLMFeaturePipelineDriver);
            expect(second).toBe(first);
            expect(catalogConfig).toHaveBeenCalledTimes(1);
            expect(catalogConfig).toHaveBeenCalledWith(false, context.contextUser, context.provider);
        });

        it('resolves PipelineType LLM in any case, trimmed, to the LLM driver', async () => {
            for (const pipelineType of ['LLM', 'llm', 'Llm', '  lLm  ']) {
                const processor = new ProbeProcessor(PROMPT_ID, undefined, buildSpec({ PipelineType: pipelineType }), null);
                expect(await processor.Resolve(context)).toBeInstanceOf(LLMFeaturePipelineDriver);
            }
        });

        it('resolves LLM when the catalog has no LLM row', async () => {
            catalogRows = [];
            const processor = new ProbeProcessor(PROMPT_ID, undefined, buildSpec({ PipelineType: 'LLM' }), null);
            expect(await processor.Resolve(context)).toBeInstanceOf(LLMFeaturePipelineDriver);

            const result = await new InferProcessor(PROMPT_ID, undefined, buildSpec(), null).ProcessRecord(makeRecord(), context);
            expect(result.Status).toBe('Succeeded');
        });

        it('resolves LLM when the catalog cannot be read', async () => {
            vi.spyOn(KnowledgeHubMetadataEngine.Instance, 'FeaturePipelineTypes', 'get').mockImplementation(() => {
                throw new Error('permission constrained');
            });
            const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
            const processor = new ProbeProcessor(PROMPT_ID, undefined, buildSpec(), null);
            expect(await processor.Resolve(context)).toBeInstanceOf(LLMFeaturePipelineDriver);
            expect(consoleError).toHaveBeenCalledWith('InferProcessor: MJ: Feature Pipeline Types could not be read (permission constrained); running as LLM');
        });

        it('fails the record, without running the prompt, when the type is not in the catalog', async () => {
            const result = await new InferProcessor(PROMPT_ID, undefined, buildSpec({ PipelineType: 'Decision' }), null).ProcessRecord(makeRecord(), context);

            expect(result.Status).toBe('Failed');
            expect(result.ErrorMessage).toBe("Feature Pipeline type 'Decision' was not found in MJ: Feature Pipeline Types.");
            expect(executePrompt).not.toHaveBeenCalled();
        });

        it('fails a type other than LLM when the catalog cannot be read', async () => {
            vi.spyOn(KnowledgeHubMetadataEngine.Instance, 'FeaturePipelineTypes', 'get').mockImplementation(() => {
                throw new Error('permission constrained');
            });
            const result = await new InferProcessor(PROMPT_ID, undefined, buildSpec({ PipelineType: 'Decision' }), null).ProcessRecord(makeRecord(), context);

            expect(result.Status).toBe('Failed');
            expect(result.ErrorMessage).toContain("Feature Pipeline type 'Decision' could not be resolved");
            expect(result.ErrorMessage).toContain('permission constrained');
        });

        it('fails the record when the type is Disabled', async () => {
            catalogRows = [LLM_ROW, pipelineTypeRow({ Name: 'Decision', DriverClass: 'FeaturePipelineDriverTest_ConfidenceStub', Status: 'Disabled' })];
            const result = await new InferProcessor(PROMPT_ID, undefined, buildSpec({ PipelineType: 'decision' }), null).ProcessRecord(makeRecord(), context);

            expect(result.Status).toBe('Failed');
            expect(result.ErrorMessage).toBe("Feature Pipeline type 'Decision' is Disabled; only an Active type can run.");
        });

        it('fails the record when the DriverClass is not registered', async () => {
            catalogRows = [LLM_ROW, pipelineTypeRow({ Name: 'Decision', DriverClass: 'FeaturePipelineDriverTest_NoSuchDriver', Status: 'Active' })];
            // The ClassFactory warns that it fell back to the base driver; the processor then rejects that fallback
            const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
            const result = await new InferProcessor(PROMPT_ID, undefined, buildSpec({ PipelineType: 'Decision' }), null).ProcessRecord(makeRecord(), context);

            expect(result.Status).toBe('Failed');
            expect(result.ErrorMessage).toContain("names DriverClass 'FeaturePipelineDriverTest_NoSuchDriver', which is not registered");
            expect(consoleWarn.mock.calls.some(([m]) => String(m).includes("with key 'FeaturePipelineDriverTest_NoSuchDriver'"))).toBe(true);
        });

        it('fails the record when the ClassFactory returns no driver at all', async () => {
            catalogRows = [LLM_ROW, pipelineTypeRow({ Name: 'Decision', DriverClass: 'FeaturePipelineDriverTest_ConfidenceStub', Status: 'Active' })];
            vi.spyOn(MJGlobal.Instance.ClassFactory, 'CreateInstance').mockReturnValue(null);
            const result = await new InferProcessor(PROMPT_ID, undefined, buildSpec({ PipelineType: 'Decision' }), null).ProcessRecord(makeRecord(), context);

            expect(result.Status).toBe('Failed');
            expect(result.ErrorMessage).toContain('which is not registered');
        });

        it('fails the record, naming every unsupported output, when ValidateOutputs returns messages', async () => {
            catalogRows = [LLM_ROW, pipelineTypeRow({ Name: 'Yes/No', DriverClass: 'FeaturePipelineDriverTest_BooleanFieldOnly', Status: 'Active' })];
            const spec = buildSpec({
                PipelineType: 'Yes/No',
                Outputs: [
                    { Ref: '$.seniority', Name: 'Seniority', Constraint: { Type: 'enum', Values: ['VP'], OnViolation: 'fail' }, Target: { Mode: 'field', EntityFieldName: 'Seniority' } },
                    { Ref: '$.isVip', Name: 'IsVIP', Constraint: { Type: 'boolean', OnViolation: 'fail' }, Target: { Mode: 'field', EntityFieldName: 'IsVIP' } },
                    { Ref: '$.topics', Name: 'Topics', Constraint: { Type: 'boolean', OnViolation: 'fail' }, Target: { Mode: 'tags', RootTagID: 'ROOT-1' } },
                ],
            });
            const result = await new InferProcessor(PROMPT_ID, undefined, spec, null).ProcessRecord(makeRecord(), context);

            expect(result.Status).toBe('Failed');
            expect(result.ErrorMessage).toContain("Feature Pipeline type 'Yes/No' cannot produce every output");
            expect(result.ErrorMessage).toContain("Output 'Seniority' has constraint type 'enum'");
            expect(result.ErrorMessage).toContain("Output 'Topics' has target mode 'tags'");
            expect(result.ErrorMessage).not.toContain("'IsVIP'");
            expect(executePrompt).not.toHaveBeenCalled();
        });

        it('fails every record of a cached batch, without throwing, when resolution fails', async () => {
            const lookup = vi.spyOn(FeatureValueCacheService.Instance, 'BatchLookup').mockResolvedValue(new Map());
            const spec = buildSpec({ PipelineType: 'Decision', Caching: { Cacheable: true, KeyFields: ['Title'] } });
            const results = await new InferProcessor(PROMPT_ID, undefined, spec, null).ProcessBatch([makeRecord('r1'), makeRecord('r2')], context);

            expect(results.get('r1')).toEqual({ Status: 'Failed', ErrorMessage: "Feature Pipeline type 'Decision' was not found in MJ: Feature Pipeline Types." });
            expect(results.get('r2')?.Status).toBe('Failed');
            expect(lookup).not.toHaveBeenCalled();
        });

        it('fails every record of an uncached batch, without throwing, when resolution fails', async () => {
            const results = await new InferProcessor(PROMPT_ID, undefined, buildSpec({ PipelineType: 'Decision' }), null)
                .ProcessBatch([makeRecord('r1'), makeRecord('r2')], context);

            expect(results.get('r1')?.Status).toBe('Failed');
            expect(results.get('r2')?.Status).toBe('Failed');
        });
    });

    // ================================================================
    // BaseFeaturePipelineDriver.ValidateOutputs
    // ================================================================

    describe('ValidateOutputs', () => {
        it('accepts every output for the LLM driver', () => {
            const spec = buildSpec({
                Outputs: [
                    { Ref: '$.a', Name: 'A', Constraint: { Type: 'freetext' }, Target: { Mode: 'child', EntityName: 'Kids', ParentField: 'ParentID', Map: { Name: '$.a' } } },
                    { Ref: '$.b', Name: 'B', Constraint: { Type: 'money', OnViolation: 'null' }, Target: { Mode: 'tags', RootTagID: 'ROOT-1' } },
                    { Ref: '$.c', Name: 'C', Target: { Mode: 'field', EntityFieldName: 'C' } },
                ],
            });
            expect(new LLMFeaturePipelineDriver().ValidateOutputs(spec)).toEqual([]);
        });

        it('returns one message per output the driver cannot produce, and skips the constraint check when there is none', () => {
            const spec = buildSpec({
                Outputs: [
                    { Ref: '$.a', Name: 'A', Constraint: { Type: 'date', OnViolation: 'fail' }, Target: { Mode: 'child', EntityName: 'Kids', ParentField: 'ParentID', Map: { D: '$.a' } } },
                    { Ref: '$.b', Name: 'B', Target: { Mode: 'field', EntityFieldName: 'B' } },
                    { Ref: '$.c', Name: 'C', Target: { Mode: 'tags', RootTagID: 'ROOT-1' } },
                ],
            });
            const messages = new BooleanFieldOnlyDriver().ValidateOutputs(spec);

            expect(messages).toEqual([
                "Output 'A' has constraint type 'date', which this pipeline type cannot produce and has target mode 'child', which this pipeline type does not support.",
                "Output 'C' has target mode 'tags', which this pipeline type does not support.",
            ]);
        });
    });

    // ================================================================
    // The LLM driver calls the hooks in order, with the same arguments
    // ================================================================

    describe('LLMFeaturePipelineDriver hooks', () => {
        it('calls an extension\'s overridden hooks in order, with the same arguments as before', async () => {
            const order: string[] = [];
            executePrompt.mockImplementation(async () => {
                order.push('ExecutePrompt');
                return { success: true, result: { seniority: 'Director' }, promptRun: { ID: 'PROMPT-RUN-1' } };
            });
            const processor = new RecordingProcessor(PROMPT_ID, undefined, buildSpec(), null);
            const record = makeRecord();
            const result = await processor.ProcessRecord(record, context);

            const hookOrder = processor.Calls.map((c) => c.Hook);
            expect(hookOrder).toEqual(['beforeBuildContext', 'buildPromptData', 'beforePromptExecute', 'afterPromptExecute']);
            expect(order).toEqual(['ExecutePrompt']);

            const [beforeBuild, buildData, beforeExecute, afterExecute] = processor.Calls;
            expect(beforeBuild.Args[0]).toBe(record);
            expect(beforeBuild.Args[1]).toBe(context);
            expect(buildData.Args[0]).toBe(record);
            expect(buildData.Args[1]).toBe(context);

            // beforePromptExecute receives the very params ExecutePrompt then runs
            const params = beforeExecute.Args[0] as AIPromptParams;
            expect(beforeExecute.Args[1]).toBe(record);
            expect(beforeExecute.Args[2]).toBe(context);
            expect(executePrompt.mock.calls[0][0]).toBe(params);
            expect(params.data).toBe(buildData.Returned);
            expect(params.contextUser).toBe(context.contextUser);
            expect(params.validationBehavior).toBe('Strict');
            expect(params.prompt.ValidationBehavior).toBe('Strict');
            expect(params.prompt.ID).toBe(PROMPT_ID);
            expect(mockPrompt.ValidationBehavior).toBe('Warn');

            // afterPromptExecute receives ExecutePrompt's own result; its string return is JSON-parsed
            const promptResult = await executePrompt.mock.results[0].value;
            expect(afterExecute.Args[0]).toBe(promptResult);
            expect(afterExecute.Args[1]).toBe(record);
            expect(afterExecute.Args[2]).toBe(context);
            expect(result.Status).toBe('Succeeded');
            expect(result.ResultPayload).toEqual({ seniority: 'Director', fromExtension: true });
            expect(result.AIPromptRunID).toBe('PROMPT-RUN-1');
        });

        it('returns the failure, with the prompt run, and skips afterPromptExecute when the prompt fails', async () => {
            executePrompt.mockResolvedValue({ success: false, errorMessage: 'model unavailable', promptRun: { ID: 'PROMPT-RUN-2' } });
            const processor = new RecordingProcessor(PROMPT_ID, undefined, buildSpec(), null);
            const result = await processor.ProcessRecord(makeRecord(), context);

            expect(result).toEqual({ Status: 'Failed', ErrorMessage: 'model unavailable', AIPromptRunID: 'PROMPT-RUN-2' });
            expect(processor.Calls.map((c) => c.Hook)).toEqual(['beforeBuildContext', 'buildPromptData', 'beforePromptExecute']);
        });

        it('uses the default failure message when the prompt fails without one', async () => {
            executePrompt.mockResolvedValue({ success: false });
            const driver = new LLMFeaturePipelineDriver();
            const request: FeaturePipelineComputeRequest = {
                Record: makeRecord(),
                Context: context,
                Prompt: mockPrompt,
                Hooks: {
                    BuildPromptData: async () => ({}),
                    BeforeBuildContext: async () => undefined,
                    BeforePromptExecute: async () => undefined,
                    AfterPromptExecute: async () => ({}),
                    BuildUserMessage: async () => null,
                },
            };
            expect(await driver.ComputeOutputs(request)).toEqual({ Success: false, ErrorMessage: 'AI prompt execution failed', AIPromptRunID: undefined });
        });

        it('runs the prompt strict and returns the call\'s parameter fidelity', async () => {
            const fidelity: ParameterFidelity = { Status: 'sent-unchanged', Sent: { VendorModelName: 'gemini-3.1-flash-lite', Temperature: 0, MaxTokens: null, Seed: 42 } };
            executePrompt.mockResolvedValue({ success: true, result: { a: 1 }, promptRun: { ID: 'r1' }, chatResult: { parameterFidelity: fidelity } });
            const request: FeaturePipelineComputeRequest = {
                Record: makeRecord(), Context: context, Prompt: mockPrompt,
                Hooks: { BuildPromptData: async () => ({}), BeforeBuildContext: async () => undefined, BeforePromptExecute: async () => undefined, AfterPromptExecute: async (r) => r.result || {}, BuildUserMessage: async () => null },
            };
            const out = await new LLMFeaturePipelineDriver().ComputeOutputs(request);
            const sent: AIPromptParams = executePrompt.mock.calls[0][0];
            expect(sent.strictParameters).toBe(true);
            expect('ErrorMessage' in out ? null : out.ParameterFidelity).toEqual(fidelity);
        });

        it('returns a refused call\'s parameter fidelity with the failure', async () => {
            const sentShape = { VendorModelName: 'gemini-3.1-flash-lite', Temperature: 0, MaxTokens: null, Seed: 42 };
            const refused: Extract<ParameterFidelity, { Status: 'refused' }> = { Status: 'refused', Configured: sentShape, WouldSend: { ...sentShape, Seed: null } };
            const error = new ParameterFidelityError(refused, 'GeminiLLM');
            executePrompt.mockResolvedValue({ success: false, errorMessage: error.message, promptRun: { ID: 'r2' }, chatResult: { success: false, exception: error } });
            const request: FeaturePipelineComputeRequest = {
                Record: makeRecord(), Context: context, Prompt: mockPrompt,
                Hooks: { BuildPromptData: async () => ({}), BeforeBuildContext: async () => undefined, BeforePromptExecute: async () => undefined, AfterPromptExecute: async () => ({}), BuildUserMessage: async () => null },
            };
            expect(await new LLMFeaturePipelineDriver().ComputeOutputs(request)).toEqual({
                Success: false, ErrorMessage: error.message, AIPromptRunID: 'r2', ParameterFidelity: refused,
            });
        });

        it('returns no parameter fidelity with a failure that is not a refusal, whatever the error carries', async () => {
            const configured = { VendorModelName: 'gemini-3.1-flash-lite', Temperature: 0, MaxTokens: null, Seed: 42 };
            const lookalike = Object.assign(new Error('model unavailable'), { Fidelity: { Status: 'refused', Configured: configured, WouldSend: configured } });
            executePrompt.mockResolvedValue({ success: false, errorMessage: 'model unavailable', chatResult: { success: false, exception: lookalike } });
            const request: FeaturePipelineComputeRequest = {
                Record: makeRecord(), Context: context, Prompt: mockPrompt,
                Hooks: { BuildPromptData: async () => ({}), BeforeBuildContext: async () => undefined, BeforePromptExecute: async () => undefined, AfterPromptExecute: async () => ({}), BuildUserMessage: async () => null },
            };
            const out = await new LLMFeaturePipelineDriver().ComputeOutputs(request);
            expect('ErrorMessage' in out ? out.ParameterFidelity : 'succeeded').toBeUndefined();
        });
    });

    // ================================================================
    // Hashes
    // ================================================================

    describe('parameter fidelity on the record result', () => {
        const sentShape = { VendorModelName: 'gemini-3.1-flash-lite', Temperature: 0, MaxTokens: null, Seed: 42 };
        const sent: ParameterFidelity = { Status: 'sent-unchanged', Sent: sentShape };

        it('records the call\'s parameter fidelity on a succeeded record', async () => {
            executePrompt.mockResolvedValue({ success: true, result: { seniority: 'Director' }, promptRun: { ID: 'PROMPT-RUN-1' }, chatResult: { parameterFidelity: sent } });
            const result = await new InferProcessor(PROMPT_ID, undefined, buildSpec(), null).ProcessRecord(makeRecord(), context);

            expect(result.Status).toBe('Succeeded');
            expect(result.ParameterFidelity).toEqual(sent);
        });

        it('records the call\'s parameter fidelity on a record whose answer is rejected', async () => {
            executePrompt.mockResolvedValue({ success: true, result: { seniority: 'Intern' }, promptRun: { ID: 'PROMPT-RUN-1' }, chatResult: { parameterFidelity: sent } });
            const result = await new InferProcessor(PROMPT_ID, undefined, buildSpec(), null).ProcessRecord(makeRecord(), context);

            expect(result.FailureKind).toBe('RejectedInvalid');
            expect(result.ParameterFidelity).toEqual(sent);
        });

        it('records a refused call\'s parameter fidelity on the failed record', async () => {
            const refused: Extract<ParameterFidelity, { Status: 'refused' }> = { Status: 'refused', Configured: sentShape, WouldSend: { ...sentShape, Seed: null } };
            const error = new ParameterFidelityError(refused, 'GeminiLLM');
            executePrompt.mockResolvedValue({ success: false, errorMessage: error.message, chatResult: { success: false, exception: error } });
            const result = await new InferProcessor(PROMPT_ID, undefined, buildSpec(), null).ProcessRecord(makeRecord(), context);

            expect(result).toMatchObject({ Status: 'Failed', ErrorMessage: error.message, ParameterFidelity: refused });
        });
    });

    describe('computePromptVersionHash', () => {
        const probe = new ProbeProcessor(PROMPT_ID, undefined, undefined, null);

        it('is identical for a spec without PipelineType and one naming LLM in any case', () => {
            const withoutType = probe.Hash(mockPrompt, buildSpec());
            for (const pipelineType of ['LLM', 'llm', ' LLM ']) {
                expect(probe.Hash(mockPrompt, buildSpec({ PipelineType: pipelineType }))).toBe(withoutType);
            }
        });

        it('is identical to the hash on next', () => {
            expect(probe.Hash(mockPrompt, buildSpec())).toBe(HASH_ON_NEXT_WITH_SPEC);
            expect(probe.Hash(mockPrompt, buildSpec({ PipelineType: 'LLM' }))).toBe(HASH_ON_NEXT_WITH_SPEC);
            expect(probe.Hash(mockPrompt, undefined)).toBe(HASH_ON_NEXT_WITHOUT_SPEC);
        });

        it('differs when PipelineType is Decision, whatever its case', () => {
            const decision = probe.Hash(mockPrompt, buildSpec({ PipelineType: 'Decision' }));
            expect(decision).not.toBe(HASH_ON_NEXT_WITH_SPEC);
            expect(probe.Hash(mockPrompt, buildSpec({ PipelineType: 'decision' }))).toBe(decision);
        });
    });

    // ================================================================
    // Confidence reaches history only when the driver returns it
    // ================================================================

    describe('Confidence', () => {
        it('passes the driver\'s confidence to history, by output name', async () => {
            catalogRows = [LLM_ROW, pipelineTypeRow({ Name: 'Decision', DriverClass: 'FeaturePipelineDriverTest_ConfidenceStub', Status: 'Active' })];
            const processor = new HistoryCapturingProcessor(PROMPT_ID, undefined, buildSpec({ PipelineType: 'Decision' }), null);
            const result = await processor.ProcessRecord(makeRecord(), context);

            expect(result.Status).toBe('Succeeded');
            expect(result.Confidence).toEqual({ Seniority: 0.87 });
            expect(processor.HistoryParams[0].OutputConfidence).toEqual({ Seniority: 0.87 });
            const outputs = recordFeatureValues.mock.calls[0][0].Outputs;
            expect(outputs).toEqual([expect.objectContaining({ FeatureName: 'Seniority', Confidence: 0.87 })]);
        });

        it('prefers the driver\'s confidence over the one its answer states at the ConfidenceRef', async () => {
            catalogRows = [LLM_ROW, pipelineTypeRow({ Name: 'Decision', DriverClass: 'FeaturePipelineDriverTest_ConfidenceAndAnswerStub', Status: 'Active' })];
            const spec = buildSpec({ PipelineType: 'Decision' });
            spec.Outputs[0].ConfidenceRef = '$.seniorityConfidence';
            const processor = new HistoryCapturingProcessor(PROMPT_ID, undefined, spec, null);
            await processor.ProcessRecord(makeRecord(), context);

            const outputs = recordFeatureValues.mock.calls[0][0].Outputs;
            expect(outputs).toEqual([expect.objectContaining({ FeatureName: 'Seniority', Confidence: 0.87 })]);
        });

        it('replays the driver\'s confidence on a cache hit, so a cached re-run of a Decision pipeline is Unchanged', async () => {
            catalogRows = [LLM_ROW, pipelineTypeRow({ Name: 'Decision', DriverClass: 'FeaturePipelineDriverTest_ConfidenceStub', Status: 'Active' })];
            const spec = buildSpec({ PipelineType: 'Decision', Caching: { Cacheable: true, KeyFields: ['Title'], Scope: 'pipeline' } });
            const history = new HistoryStoreDouble();
            recordFeatureValues.mockImplementation(history.Write);
            const store = vi.spyOn(FeatureValueCacheService.Instance, 'Store').mockResolvedValue(CacheEntry({ ID: 'CACHE-1' }));
            vi.spyOn(FeatureValueCacheService.Instance, 'BatchLookup').mockResolvedValue(new Map());
            const miss = await new InferProcessor(PROMPT_ID, undefined, spec, null).ProcessRecord(makeRecord(), context);
            expect(miss.Outcome).toBe('Upserted');

            const stored = store.mock.calls[0][0];
            const entry = CacheEntry({
                ID: 'CACHE-1', OutputsJSON: stored.OutputsJSON, Reasoning: stored.Reasoning || null, AIPromptRunID: null,
            });
            vi.spyOn(FeatureValueCacheService.Instance, 'BatchLookup').mockResolvedValue(new Map([[stored.KeyHash, entry]]));
            recordFeatureValues.mockClear();
            const hit = await new InferProcessor(PROMPT_ID, undefined, spec, null).ProcessRecord(makeRecord(), context);

            expect(hit).toMatchObject({ Status: 'Succeeded', FeatureValueCacheID: 'CACHE-1', Outcome: 'Unchanged' });
            const outputs = recordFeatureValues.mock.calls[0][0].Outputs;
            expect(outputs).toEqual([expect.objectContaining({ FeatureName: 'Seniority', Confidence: 0.87 })]);
        });

        it('passes no confidence to history for the LLM driver', async () => {
            const processor = new HistoryCapturingProcessor(PROMPT_ID, undefined, buildSpec(), null);
            const result = await processor.ProcessRecord(makeRecord(), context);

            expect(result.Status).toBe('Succeeded');
            expect('OutputConfidence' in processor.HistoryParams[0]).toBe(false);
            const outputs = recordFeatureValues.mock.calls[0][0].Outputs;
            expect(outputs[0].Confidence).toBeUndefined();
        });
    });

    // ================================================================
    // Entity-scoped field values lookup
    // ================================================================

    describe('FieldValues lookup scoped to pipeline entity', () => {
        it('constructs lookup from context.entityID and passes it to ValidateOutputs', async () => {
            const mockProvider = {
                EntityByID: (id: string) => {
                    if (id === 'ENT-TARGET') {
                        return {
                            ID: 'ENT-TARGET',
                            Name: 'TargetEntity',
                            Fields: [
                                {
                                    Name: 'Category',
                                    EntityFieldValues: [{ Value: 'CatA', Description: 'Category A' }],
                                },
                            ],
                        };
                    }
                    if (id === 'ENT-OTHER') {
                        return {
                            ID: 'ENT-OTHER',
                            Name: 'OtherEntity',
                            Fields: [
                                {
                                    Name: 'Category',
                                    EntityFieldValues: [{ Value: 'WrongCat', Description: 'Wrong' }],
                                },
                            ],
                        };
                    }
                    return undefined;
                },
            };

            catalogRows = [
                LLM_ROW,
                pipelineTypeRow({ Name: 'CustomType', DriverClass: 'FeaturePipelineDriverTest_LookupCapturing', Status: 'Active' }),
            ];

            const ctxWithEntity: RecordProcessorContext = {
                ...context,
                entityID: 'ENT-TARGET',
                provider: mockProvider as unknown as IMetadataProvider,
            };

            const processor = new ProbeProcessor(PROMPT_ID, undefined, buildSpec({ PipelineType: 'CustomType' }), null);
            await processor.Resolve(ctxWithEntity);

            expect(LookupCapturingDriver.LastLookup).toBeDefined();
            const values = LookupCapturingDriver.LastLookup!('Category');
            expect(values).toEqual([{ Value: 'CatA', Description: 'Category A' }]);

            // Field not on entity returns undefined
            expect(LookupCapturingDriver.LastLookup!('NonExistentField')).toBeUndefined();
        });

        it('passes undefined lookup when context has no entityID', async () => {
            catalogRows = [
                LLM_ROW,
                pipelineTypeRow({ Name: 'CustomType', DriverClass: 'FeaturePipelineDriverTest_LookupCapturing', Status: 'Active' }),
            ];

            const ctxNoEntity: RecordProcessorContext = {
                ...context,
                entityID: undefined,
            };

            const processor = new ProbeProcessor(PROMPT_ID, undefined, buildSpec({ PipelineType: 'CustomType' }), null);
            await processor.Resolve(ctxNoEntity);

            expect(LookupCapturingDriver.LastLookup).toBeUndefined();
        });
    });
});
