import { describe, it, expect } from 'vitest';
import { EntityInfo, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { RegisterClass, MJGlobal } from '@memberjunction/global';
import { IRecordProcessor, RecordProcessorContext, RecordRef } from '@memberjunction/record-set-processor-base';
import { AIEngine } from '@memberjunction/aiengine';
import type { AIPromptParams, AIPromptRunResult, MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import { FeatureValueCacheService } from '@memberjunction/feature-pipelines';
import { InferProcessor, type FeatureValueWriteParams } from '../processors/InferProcessor';
import type { MJRecordProcessEntity, MJRecordProcessEntity_IRecordProcessChallengerConfig } from '@memberjunction/core-entities';
import { OutputMappingConfig, WriteBackProcessor } from '@memberjunction/record-set-processor';

class MockInferHookSubclass extends InferProcessor {
    public beforeBuildContextCalled = false;
    public beforePromptExecuteCalled = false;
    public afterPromptExecuteCalled = false;
    public beforeWriteBackCalled = false;

    protected override async beforeBuildContext(_record: RecordRef, _ctx: RecordProcessorContext): Promise<void> {
        this.beforeBuildContextCalled = true;
    }

    public override async beforeWriteBack(
        _mapping: OutputMappingConfig | undefined,
        _result: unknown,
        _record: RecordRef,
        _ctx: RecordProcessorContext
    ): Promise<void> {
        this.beforeWriteBackCalled = true;
    }
}

class ShadowTestableInferProcessor extends InferProcessor {
    public ChallengerCalls: AIPromptParams[] = [];
    public ChallengerResponse: AIPromptRunResult<unknown> = {
        success: true,
        promptRun: { ID: 'challenger-prompt-run-1' } as AIPromptRunResult<unknown>['promptRun'],
        result: { StandardTitle: 'CHALLENGER_ENGINEER', _confidence: { StandardTitle: 0.91 } },
    };

    protected override async ExecuteChallengerPrompt(
        params: AIPromptParams,
        _signal: AbortSignal,
    ): Promise<AIPromptRunResult<unknown>> {
        this.ChallengerCalls.push(params);
        return this.ChallengerResponse;
    }

    public async InvokeWithFeatureValues(featureValues: FeatureValueWriteParams) {
        return this.WithFeatureValues(
            { Status: 'Succeeded', ResultPayload: featureValues.Payload },
            featureValues,
        );
    }
}

class ChallengerFeatureValueDouble {
    public RecordProcessID: string | null = null;
    public ProcessRunID: string | null = null;
    public EntityID = '';
    public RecordID = '';
    public FeatureName = '';
    public Role: 'Champion' | 'Challenger' = 'Champion';
    public Source: 'Pipeline' | 'Human' | 'Imported' = 'Pipeline';
    public ValueKeyHash: string | null = 'non-null-default';
    public PromptID: string | null = null;
    public AIModelID: string | null = null;
    public AIPromptRunID: string | null = null;
    public ValueNumeric: number | null = null;
    public ValueText: string | null = null;
    public ValueBoolean: boolean | null = null;
    public ValueDate: Date | null = null;
    public ValueJSON: string | null = null;
    public Confidence: number | null = null;
    public Reasoning: string | null = null;
    public ComputedAt: Date = new Date(0);
    public Saved = false;
    public LatestResult: { CompleteMessage: string } | null = null;

    public NewRecord(): boolean {
        return true;
    }

    public async Save(): Promise<boolean> {
        this.Saved = true;
        return true;
    }
}

// Register with ClassFactory under a unique key
RegisterClass(InferProcessor, 'MockInferHookSubclass')(MockInferHookSubclass);

describe('InferProcessor Lifecycle Hooks (P1-6)', () => {
    it('allows subclasses to override beforeWriteBack and invokes it in WriteBackProcessor', async () => {
        const processor = new MockInferHookSubclass('prompt-123', undefined, undefined, null);
        const _mockInner: IRecordProcessor = {
            ProcessRecord: async () => ({
                Status: 'Succeeded',
                ResultPayload: { foo: 'bar' },
            }),
        };
        // Use MockInferHookSubclass as the inner processor
        processor.ProcessRecord = async () => ({
            Status: 'Succeeded',
            ResultPayload: { foo: 'bar' },
        });

        const writeBackProc = new WriteBackProcessor(processor, { fields: { TargetField: '$.foo' } }, true);
        // A dry-run write-back reads the processed record's entity metadata (Name, Fields[].Name) and loads the record.
        const widgets = new EntityInfo({ ID: 'ent-1', Name: 'Widgets', Fields: [{ Name: 'TargetField' }] });
        const loaded = { InnerLoad: async () => true, Get: () => undefined };
        const provider: Pick<IMetadataProvider, 'EntityByID' | 'GetEntityObject'> = {
            EntityByID: (id: string) => (id === 'ent-1' ? widgets : undefined),
            // a dry-run write-back loads the record to compare its fields; the double is typed as the generic return every provider makes
            GetEntityObject: async <T>() => loaded as T,
        };
        const context: RecordProcessorContext = {
            ContextUser: {} as UserInfo,
            Provider: provider as IMetadataProvider,
            RecordProcessID: 'rp-1',
            EntityID: 'ent-1',
        };
        const record: RecordRef = {
            EntityID: 'ent-1',
            RecordID: 'rec-1',
        };

        const result = await writeBackProc.ProcessRecord(record, context);
        expect(processor.beforeWriteBackCalled).toBe(true);
        expect(result.Status).toBe('Succeeded');
        expect(result.ResultPayload).toEqual({ output: { foo: 'bar' }, writeBack: { updatedRecord: false, changed: false, dryRun: true, previewFields: { TargetField: 'bar' } } });
    });

    it('resolves custom subclass via ClassFactory using DataFeatureSpec.ProcessorExtensionKey', () => {
        const instance = MJGlobal.Instance.ClassFactory.CreateInstance<InferProcessor>(
            InferProcessor,
            'MockInferHookSubclass',
            'prompt-999',
            undefined,
            { Outputs: [], ProcessorExtensionKey: 'MockInferHookSubclass' }
        );
        expect(instance).toBeDefined();
        expect(instance).toBeInstanceOf(MockInferHookSubclass);
    });

    it('wires ChallengerConfigurationObject in FromRecordProcess and executes ChallengerPromptID shadow scoring into Role="Challenger" Feature Values (D1)', async () => {
        const challengerConfig: MJRecordProcessEntity_IRecordProcessChallengerConfig = {
            Enabled: true,
            SampleRate: 1.0,
            WorkType: 'Infer',
            ChallengerPromptID: 'prompt-challenger-2',
            MaxLatencyMs: 500,
        };
        const rpDouble: Pick<
            MJRecordProcessEntity,
            'ID' | 'Name' | 'PromptID' | 'Configuration' | 'InputMapping' | 'OutputMapping' | 'ChallengerConfigurationObject'
        > = {
            ID: 'rp-infer-1',
            Name: 'Infer Title Pipeline',
            PromptID: 'prompt-champion-1',
            Configuration: null,
            InputMapping: null,
            OutputMapping: null,
            ChallengerConfigurationObject: challengerConfig,
        };

        const fromRp = InferProcessor.FromRecordProcess(rpDouble as MJRecordProcessEntity);
        expect(fromRp.ChallengerConfig).toEqual(challengerConfig);
        expect(fromRp.ShouldSampleChallenger()).toBe(true);

        // Configure AIEngine Prompts & PromptModels for the challenger prompt
        const origConfig = AIEngine.Instance.Config;
        const origPromptsDescriptor = Object.getOwnPropertyDescriptor(AIEngine.Instance, 'Prompts') ??
            Object.getOwnPropertyDescriptor(Object.getPrototypeOf(AIEngine.Instance), 'Prompts');
        const origPromptModelsDescriptor = Object.getOwnPropertyDescriptor(AIEngine.Instance, 'PromptModels') ??
            Object.getOwnPropertyDescriptor(Object.getPrototypeOf(AIEngine.Instance), 'PromptModels');
        const origRecordFeatureValues = FeatureValueCacheService.Instance.RecordFeatureValues;

        const createdChallengerRows: ChallengerFeatureValueDouble[] = [];
        try {
            AIEngine.Instance.Config = (async () => {}) as typeof AIEngine.Instance.Config;
            const challengerPromptDouble: Pick<MJAIPromptEntityExtended, 'ID' | 'Name'> = {
                ID: 'prompt-challenger-2',
                Name: 'Challenger Title Prompt',
            };
            Object.defineProperty(AIEngine.Instance, 'Prompts', {
                configurable: true,
                get: () => [challengerPromptDouble as MJAIPromptEntityExtended],
            });
            Object.defineProperty(AIEngine.Instance, 'PromptModels', {
                configurable: true,
                get: () => [
                    { PromptID: 'prompt-challenger-2', ModelID: 'model-challenger-llm', Priority: 1, Status: 'Active' },
                ],
            });
            FeatureValueCacheService.Instance.RecordFeatureValues = async () => ({
                Upserted: 1,
                Unchanged: 0,
                Previous: { StandardTitle: null },
            });

            const processor = new ShadowTestableInferProcessor(
                'prompt-champion-1',
                undefined,
                {
                    Outputs: [
                        {
                            Name: 'StandardTitle',
                            Ref: '$.StandardTitle',
                            Target: { Mode: 'none' },
                        },
                    ],
                },
                null,
            );
            processor.ChallengerConfig = challengerConfig;

            const provider: Pick<IMetadataProvider, 'EntityByID' | 'GetEntityObject'> = {
                EntityByID: () => undefined,
                GetEntityObject: async <T>(entityName: string) => {
                    expect(entityName).toBe('MJ: Feature Values');
                    const row = new ChallengerFeatureValueDouble();
                    createdChallengerRows.push(row);
                    return row as T;
                },
            };

            const context: RecordProcessorContext = {
                ContextUser: { ID: 'user-1' } as UserInfo,
                Provider: provider as IMetadataProvider,
                RecordProcessID: 'rp-infer-1',
                ProcessRunID: 'run-infer-1',
                EntityID: 'ent-contacts',
            };

            const record: RecordRef = {
                EntityID: 'ent-contacts',
                RecordID: 'contact-42',
                Record: { ID: 'contact-42', Title: 'Staff Software Engineer' },
            };

            const res = await processor.InvokeWithFeatureValues({
                Record: record,
                Context: context,
                Payload: { StandardTitle: 'CHAMPION_ENGINEER' },
                PromptID: 'prompt-champion-1',
                ConstraintHash: 'hash-1',
                InputHash: 'input-1',
                Pin: {
                    PromptID: 'prompt-champion-1',
                    PromptVersionHash: 'pv-1',
                    AIModelID: 'model-champion-llm',
                    ParametersHash: 'params-1',
                    SpecHash: 'spec-1',
                },
            });

            expect(res.Status).toBe('Succeeded');
            await processor.FlushShadowInFlight();

            expect(processor.ChallengerCalls).toHaveLength(1);
            expect(createdChallengerRows).toHaveLength(1);
            const challengerRow = createdChallengerRows[0];
            expect(challengerRow.Saved).toBe(true);
            expect(challengerRow.Role).toBe('Challenger');
            expect(challengerRow.ValueKeyHash).toBeNull();
            expect(challengerRow.RecordProcessID).toBe('rp-infer-1');
            expect(challengerRow.ProcessRunID).toBe('run-infer-1');
            expect(challengerRow.EntityID).toBe('ent-contacts');
            expect(challengerRow.RecordID).toBe('contact-42');
            expect(challengerRow.FeatureName).toBe('StandardTitle');
            expect(challengerRow.PromptID).toBe('prompt-challenger-2');
            expect(challengerRow.AIModelID).toBe('model-challenger-llm');
            expect(challengerRow.ValueText).toBe('CHALLENGER_ENGINEER');
            expect(challengerRow.Confidence).toBeCloseTo(0.91, 5);
        } finally {
            AIEngine.Instance.Config = origConfig;
            if (origPromptsDescriptor) {
                Object.defineProperty(AIEngine.Instance, 'Prompts', origPromptsDescriptor);
            }
            if (origPromptModelsDescriptor) {
                Object.defineProperty(AIEngine.Instance, 'PromptModels', origPromptModelsDescriptor);
            }
            FeatureValueCacheService.Instance.RecordFeatureValues = origRecordFeatureValues;
        }
    });

    it('passes AbortSignal on AIPromptParams.cancellationToken and aborts it when MaxLatencyMs elapses (R7)', async () => {
        const origConfig = AIEngine.Instance.Config;
        const origPromptsDescriptor = Object.getOwnPropertyDescriptor(AIEngine.Instance, 'Prompts') ??
            Object.getOwnPropertyDescriptor(Object.getPrototypeOf(AIEngine.Instance), 'Prompts');
        const origPromptModelsDescriptor = Object.getOwnPropertyDescriptor(AIEngine.Instance, 'PromptModels') ??
            Object.getOwnPropertyDescriptor(Object.getPrototypeOf(AIEngine.Instance), 'PromptModels');
        const origRecordFeatureValues = FeatureValueCacheService.Instance.RecordFeatureValues;

        const createdChallengerRows: ChallengerFeatureValueDouble[] = [];
        let observedParams: AIPromptParams | undefined;
        let observedAbortOnToken = false;

        class SlowAbortAwareInferProcessor extends ShadowTestableInferProcessor {
            protected override async ExecuteChallengerPrompt(
                params: AIPromptParams,
                _signal: AbortSignal,
            ): Promise<AIPromptRunResult<unknown>> {
                observedParams = params;
                return new Promise<AIPromptRunResult<unknown>>((_resolve, reject) => {
                    const token = params.cancellationToken;
                    if (!token) {
                        return;
                    }
                    if (token.aborted) {
                        observedAbortOnToken = true;
                        reject(new Error('Aborted via params.cancellationToken'));
                        return;
                    }
                    token.addEventListener('abort', () => {
                        observedAbortOnToken = true;
                        reject(new Error('Aborted via params.cancellationToken'));
                    });
                });
            }
        }

        try {
            AIEngine.Instance.Config = (async () => {}) as typeof AIEngine.Instance.Config;
            Object.defineProperty(AIEngine.Instance, 'Prompts', {
                configurable: true,
                get: () => [{ ID: 'prompt-challenger-slow', Name: 'Slow Challenger Prompt' } as MJAIPromptEntityExtended],
            });
            Object.defineProperty(AIEngine.Instance, 'PromptModels', {
                configurable: true,
                get: () => [
                    { PromptID: 'prompt-challenger-slow', ModelID: 'model-challenger-llm', Priority: 1, Status: 'Active' },
                ],
            });
            FeatureValueCacheService.Instance.RecordFeatureValues = async () => ({
                Upserted: 1,
                Unchanged: 0,
                Previous: { StandardTitle: null },
            });

            const processor = new SlowAbortAwareInferProcessor(
                'prompt-champion-1',
                undefined,
                { Outputs: [{ Name: 'StandardTitle', Ref: '$.StandardTitle', Target: { Mode: 'none' } }] },
                null,
            );
            processor.ChallengerConfig = {
                Enabled: true,
                SampleRate: 1.0,
                WorkType: 'Infer',
                ChallengerPromptID: 'prompt-challenger-slow',
                MaxLatencyMs: 25,
            };

            const provider: Pick<IMetadataProvider, 'EntityByID' | 'GetEntityObject'> = {
                EntityByID: () => undefined,
                GetEntityObject: async <T>() => {
                    const row = new ChallengerFeatureValueDouble();
                    createdChallengerRows.push(row);
                    return row as T;
                },
            };

            const context: RecordProcessorContext = {
                ContextUser: { ID: 'user-1' } as UserInfo,
                Provider: provider as IMetadataProvider,
                RecordProcessID: 'rp-infer-1',
                ProcessRunID: 'run-infer-1',
                EntityID: 'ent-contacts',
            };

            await processor.InvokeWithFeatureValues({
                Record: { EntityID: 'ent-contacts', RecordID: 'contact-timeout-1', Record: { ID: 'contact-timeout-1' } },
                Context: context,
                Payload: { StandardTitle: 'CHAMPION_ENGINEER' },
                PromptID: 'prompt-champion-1',
                ConstraintHash: 'hash-1',
                InputHash: 'input-1',
                Pin: {
                    PromptID: 'prompt-champion-1',
                    PromptVersionHash: 'pv-1',
                    AIModelID: 'model-champion-llm',
                    ParametersHash: 'params-1',
                    SpecHash: 'spec-1',
                },
            });

            await processor.FlushShadowInFlight();

            expect(observedParams).toBeDefined();
            expect(observedParams?.cancellationToken).toBeDefined();
            expect(observedParams?.cancellationToken?.aborted).toBe(true);
            expect(observedAbortOnToken).toBe(true);
            expect(createdChallengerRows).toHaveLength(1);
            // One prefix, not 'SHADOW_TIMEOUT: SHADOW_TIMEOUT: …' (M4)
            expect(createdChallengerRows[0].Reasoning).toBe('SHADOW_TIMEOUT: Challenger prompt exceeded MaxLatencyMs (25ms)');
        } finally {
            AIEngine.Instance.Config = origConfig;
            if (origPromptsDescriptor) {
                Object.defineProperty(AIEngine.Instance, 'Prompts', origPromptsDescriptor);
            }
            if (origPromptModelsDescriptor) {
                Object.defineProperty(AIEngine.Instance, 'PromptModels', origPromptModelsDescriptor);
            }
            FeatureValueCacheService.Instance.RecordFeatureValues = origRecordFeatureValues;
        }
    });

    it('skips ChallengerConfigurationObject with WorkType !== "Infer" and logs once at configuration time instead of per record (R7)', async () => {
        const errorLogs: string[] = [];
        const origConsoleError = console.error;
        console.error = (...args: unknown[]) => {
            errorLogs.push(args.map((a) => String(a)).join(' '));
        };
        const origRecordFeatureValues = FeatureValueCacheService.Instance.RecordFeatureValues;

        try {
            FeatureValueCacheService.Instance.RecordFeatureValues = async () => ({
                Upserted: 1,
                Unchanged: 0,
                Previous: { StandardTitle: null },
            });

            const mismatchedConfig: MJRecordProcessEntity_IRecordProcessChallengerConfig = {
                Enabled: true,
                SampleRate: 1.0,
                WorkType: 'ML Model',
                ChallengerModelID: 'model-ml-99',
                ChallengerPromptID: 'prompt-challenger-ignored',
            };

            const processor = new ShadowTestableInferProcessor(
                'prompt-champion-1',
                undefined,
                { Outputs: [{ Name: 'StandardTitle', Ref: '$.StandardTitle', Target: { Mode: 'none' } }] },
                null,
            );
            processor.ChallengerConfig = mismatchedConfig;

            expect(processor.ChallengerConfig).toBeNull();
            expect(processor.ShouldSampleChallenger(mismatchedConfig)).toBe(false);
            const workTypeErrorsAfterConfig = errorLogs.filter((m) => m.includes('WorkType')).length;
            expect(workTypeErrorsAfterConfig).toBe(1);

            const provider: Pick<IMetadataProvider, 'EntityByID' | 'GetEntityObject'> = {
                EntityByID: () => undefined,
                GetEntityObject: async <T>() => new ChallengerFeatureValueDouble() as T,
            };
            const context: RecordProcessorContext = {
                ContextUser: { ID: 'user-1' } as UserInfo,
                Provider: provider as IMetadataProvider,
                RecordProcessID: 'rp-infer-1',
                ProcessRunID: 'run-infer-1',
                EntityID: 'ent-contacts',
            };

            for (const recId of ['rec-1', 'rec-2', 'rec-3']) {
                await processor.InvokeWithFeatureValues({
                    Record: { EntityID: 'ent-contacts', RecordID: recId, Record: { ID: recId } },
                    Context: context,
                    Payload: { StandardTitle: 'CHAMPION_ENGINEER' },
                    PromptID: 'prompt-champion-1',
                    ConstraintHash: 'hash-1',
                    InputHash: 'input-1',
                    Pin: {
                        PromptID: 'prompt-champion-1',
                        PromptVersionHash: 'pv-1',
                        AIModelID: 'model-champion-llm',
                        ParametersHash: 'params-1',
                        SpecHash: 'spec-1',
                    },
                });
            }
            await processor.FlushShadowInFlight();

            expect(processor.ChallengerCalls).toHaveLength(0);
            expect(errorLogs.filter((m) => m.includes('WorkType')).length).toBe(1);
        } finally {
            console.error = origConsoleError;
            FeatureValueCacheService.Instance.RecordFeatureValues = origRecordFeatureValues;
        }
    });

    it('reads ChallengerConfigurationObject only in FromRecordProcess and ignores raw ChallengerConfiguration string fallback (R10)', () => {
        const rpDouble: Pick<
            MJRecordProcessEntity,
            | 'ID'
            | 'Name'
            | 'PromptID'
            | 'Configuration'
            | 'InputMapping'
            | 'OutputMapping'
            | 'ChallengerConfiguration'
            | 'ChallengerConfigurationObject'
        > = {
            ID: 'rp-infer-legacy',
            Name: 'Legacy Raw String Pipeline',
            PromptID: 'prompt-champion-1',
            Configuration: null,
            InputMapping: null,
            OutputMapping: null,
            ChallengerConfiguration: JSON.stringify({
                Enabled: true,
                SampleRate: 1.0,
                WorkType: 'Infer',
                ChallengerPromptID: 'prompt-challenger-legacy',
            }),
            ChallengerConfigurationObject: null,
        };

        const fromRp = InferProcessor.FromRecordProcess(rpDouble as MJRecordProcessEntity);
        expect(fromRp.ChallengerConfig).toBeNull();
        expect(fromRp.ShouldSampleChallenger()).toBe(false);
    });

    it('gracefully handles malformed JSON in ChallengerConfigurationObject by logging and setting ChallengerConfig=null (S2)', () => {
        const rpDouble = {
            ID: 'rp-infer-malformed',
            Name: 'Malformed Challenger RP',
            PromptID: 'prompt-champion-1',
            Configuration: null,
            InputMapping: null,
            OutputMapping: null,
            get ChallengerConfigurationObject(): never {
                throw new SyntaxError('Unexpected token in JSON: {"Enabled":true,}');
            },
        };

        const fromRp = InferProcessor.FromRecordProcess(rpDouble as unknown as MJRecordProcessEntity);
        expect(fromRp.ChallengerConfig).toBeNull();
        expect(fromRp.ShouldSampleChallenger()).toBe(false);
    });

    it('reuses champion captured prompt data and user message for challenger execution instead of re-rendering (M2)', async () => {
        const origConfig = AIEngine.Instance.Config;
        const origPromptsDescriptor =
            Object.getOwnPropertyDescriptor(AIEngine.Instance, 'Prompts') ??
            Object.getOwnPropertyDescriptor(Object.getPrototypeOf(AIEngine.Instance), 'Prompts');
        const origPromptModelsDescriptor =
            Object.getOwnPropertyDescriptor(AIEngine.Instance, 'PromptModels') ??
            Object.getOwnPropertyDescriptor(Object.getPrototypeOf(AIEngine.Instance), 'PromptModels');
        const origRecordFeatureValues = FeatureValueCacheService.Instance.RecordFeatureValues;

        FeatureValueCacheService.Instance.RecordFeatureValues = async () => ({
            Upserted: 1,
            Unchanged: 0,
            Previous: { StandardTitle: null },
        });

        const config: MJRecordProcessEntity_IRecordProcessChallengerConfig = {
            Enabled: true,
            SampleRate: 1.0,
            WorkType: 'Infer',
            ChallengerPromptID: 'prompt-challenger-m2',
            MaxLatencyMs: 5000,
        };

        /** Renders a new prompt-data object and a numbered user message on every call, and counts the calls. */
        class CountingInferProcessor extends ShadowTestableInferProcessor {
            public PromptDataBuilds = 0;
            public UserMessageBuilds = 0;
            protected override async buildPromptData(_record: RecordRef, _ctx?: RecordProcessorContext): Promise<Record<string, unknown>> {
                this.PromptDataBuilds++;
                return { render: this.PromptDataBuilds };
            }
            protected override async BuildUserMessage(_record: RecordRef): Promise<string | null> {
                this.UserMessageBuilds++;
                return `user message #${this.UserMessageBuilds}`;
            }
        }
        const processor = new CountingInferProcessor(
            'prompt-champion-1',
            undefined,
            { Outputs: [{ Name: 'StandardTitle', Ref: '$.StandardTitle', Target: { Mode: 'none' } }] },
            null,
        );
        processor.ChallengerConfig = config;

        try {
            AIEngine.Instance.Config = (async () => {}) as typeof AIEngine.Instance.Config;
            const fakePrompt: Pick<MJAIPromptEntityExtended, 'ID' | 'Name'> = {
                ID: 'prompt-challenger-m2',
                Name: 'Challenger Title Normalizer',
            };
            Object.defineProperty(AIEngine.Instance, 'Prompts', {
                configurable: true,
                get: () => [fakePrompt as MJAIPromptEntityExtended],
            });
            Object.defineProperty(AIEngine.Instance, 'PromptModels', {
                configurable: true,
                get: () => [
                    { PromptID: 'prompt-challenger-m2', ModelID: 'model-challenger-llm', Priority: 1, Status: 'Active' },
                ],
            });

            const provider: Pick<IMetadataProvider, 'EntityByID' | 'GetEntityObject'> = {
                EntityByID: () => undefined,
                GetEntityObject: async <T>() => new ChallengerFeatureValueDouble() as T,
            };
            const context: RecordProcessorContext = {
                ContextUser: { ID: 'user-1' } as UserInfo,
                Provider: provider as IMetadataProvider,
                RecordProcessID: 'rp-infer-m2',
                ProcessRunID: 'run-infer-m2',
                EntityID: 'ent-contacts',
            };

            // The champion's compute hooks render once and capture what they rendered
            const hooks = (processor as unknown as { buildComputeHooks: () => {
                BuildPromptData: (record: RecordRef, ctx: RecordProcessorContext) => Promise<Record<string, unknown>>;
                BuildUserMessage: (record: RecordRef, ctx: RecordProcessorContext) => Promise<string | null>;
            } }).buildComputeHooks();

            const testRecord: RecordRef = { EntityID: 'ent-contacts', RecordID: 'rec-m2-1', Record: { title: 'Lead Architect' } };
            const capturedData = await hooks.BuildPromptData(testRecord, context);
            const capturedUserMsg = await hooks.BuildUserMessage(testRecord, context);
            expect(capturedUserMsg).toBe('user message #1');

            await processor.InvokeWithFeatureValues({
                Record: testRecord,
                Context: context,
                Payload: { StandardTitle: 'CHAMPION_ARCHITECT' },
                PromptID: 'prompt-champion-1',
                ConstraintHash: 'hash-1',
                InputHash: 'input-1',
                Pin: {
                    PromptID: 'prompt-champion-1',
                    PromptVersionHash: 'pv-1',
                    AIModelID: 'model-champion-llm',
                    ParametersHash: 'params-1',
                    SpecHash: 'spec-1',
                },
            });

            await processor.FlushShadowInFlight();

            expect(processor.ChallengerCalls).toHaveLength(1);
            // The challenger got the champion's own objects: nothing was rendered a second time.
            expect(processor.ChallengerCalls[0].data).toBe(capturedData);
            expect(processor.ChallengerCalls[0].conversationMessages?.[0]?.content).toBe(capturedUserMsg);
            expect(processor.PromptDataBuilds).toBe(1);
            expect(processor.UserMessageBuilds).toBe(1);
        } finally {
            AIEngine.Instance.Config = origConfig;
            if (origPromptsDescriptor) {
                Object.defineProperty(AIEngine.Instance, 'Prompts', origPromptsDescriptor);
            }
            if (origPromptModelsDescriptor) {
                Object.defineProperty(AIEngine.Instance, 'PromptModels', origPromptModelsDescriptor);
            }
            FeatureValueCacheService.Instance.RecordFeatureValues = origRecordFeatureValues;
        }
    });

    it('keeps champion prompt inputs only while a challenger can sample them, and drops unused ones when the next batch starts (P13)', async () => {
        const processor = new ShadowTestableInferProcessor(
            'prompt-champion-1',
            undefined,
            { Outputs: [{ Name: 'StandardTitle', Ref: '$.StandardTitle', Target: { Mode: 'none' } }] },
            null,
        );
        // The capture maps and hooks are private; reached the way the M2 test reaches buildComputeHooks.
        const internals = processor as unknown as {
            buildComputeHooks: () => {
                BuildPromptData: (record: RecordRef, ctx: RecordProcessorContext) => Promise<Record<string, unknown>>;
                BuildUserMessage: (record: RecordRef, ctx: RecordProcessorContext) => Promise<string | null>;
            };
            championPromptDataByRecord: Map<string, unknown>;
            championUserMessageByRecord: Map<string, unknown>;
        };
        const context: RecordProcessorContext = { ContextUser: { ID: 'user-1' } as UserInfo, RecordProcessID: 'rp-p13', EntityID: 'ent-contacts' };
        const runChampionHooks = async (count: number, prefix: string) => {
            const hooks = internals.buildComputeHooks();
            for (let i = 0; i < count; i++) {
                const record: RecordRef = { EntityID: 'ent-contacts', RecordID: `${prefix}-${i}`, Record: { title: `Title ${i}` } };
                await hooks.BuildPromptData(record, context);
                await hooks.BuildUserMessage(record, context);
            }
        };

        // No challenger: nothing is kept, however many records run.
        await runChampionHooks(50, 'plain');
        expect(internals.championPromptDataByRecord.size).toBe(0);
        expect(internals.championUserMessageByRecord.size).toBe(0);

        // With a challenger, records that never reach a Feature Value write (failed, dry run) leave their inputs
        // behind only until the next batch starts.
        processor.ChallengerConfig = {
            Enabled: true,
            SampleRate: 0.5,
            WorkType: 'Infer',
            ChallengerPromptID: 'prompt-challenger-p13',
            MaxLatencyMs: 5000,
        };
        await runChampionHooks(5, 'shadowed');
        expect(internals.championPromptDataByRecord.size).toBe(5);
        expect(internals.championUserMessageByRecord.size).toBe(5);

        await processor.ProcessBatch([], context);
        expect(internals.championPromptDataByRecord.size).toBe(0);
        expect(internals.championUserMessageByRecord.size).toBe(0);
    });
});
