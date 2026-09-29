import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import { KnowledgeHubMetadataEngine, type MJFeaturePipelineTypeEntity, type MJFeatureValueCacheEntity } from '@memberjunction/core-entities';
import { AIEngine } from '@memberjunction/aiengine';
import {
    AIDecisionRunner,
    AIDecisionParams,
    type AIDecisionRunResult,
} from '@memberjunction/ai-prompts';
import {
    type DecisionAnswer,
    type LikelihoodAnswer,
    type ChoiceAnswer,
    type ScoreAnswer,
} from '@memberjunction/ai';
import type { MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import type { RecordProcessorContext, RecordRef } from '@memberjunction/record-set-processor-base';
import {
    DECISION_FEATURE_PIPELINE_CAPABILITIES,
    type DataFeatureSpec,
    FeatureValueCacheService,
} from '@memberjunction/feature-pipelines';
import { InferProcessor } from '../processors/InferProcessor';
import {
    BaseFeaturePipelineDriver,
    type FeaturePipelineComputeRequest,
} from '../feature-pipeline-drivers/BaseFeaturePipelineDriver';
import { DecisionFeaturePipelineDriver } from '../feature-pipeline-drivers/DecisionFeaturePipelineDriver';

// ---------------------------------------------------------------------------
// Test harness & Mock Decision Runner
// ---------------------------------------------------------------------------

class TestableDecisionDriver extends DecisionFeaturePipelineDriver {
    public mockExecuteDecision: (params: AIDecisionParams) => Promise<AIDecisionRunResult> = vi.fn();

    protected override CreateDecisionRunner(): AIDecisionRunner {
        return {
            ExecuteDecision: this.mockExecuteDecision,
        } as unknown as AIDecisionRunner;
    }
}

function makeDummyUser(): UserInfo {
    return {
        ID: 'user-1',
        Name: 'Test User',
        Email: 'test@example.com',
    } as unknown as UserInfo;
}

function makeDummyContext(): RecordProcessorContext {
    return {
        User: makeDummyUser(),
        ContextUser: makeDummyUser(),
        ProcessRunID: 'run-1',
        ProcessID: 'proc-1',
        TargetEntity: 'TestEntity',
        Options: {},
    } as unknown as RecordProcessorContext;
}

function makeDecisionPrompt(overrides?: Partial<MJAIPromptEntityExtended>): MJAIPromptEntityExtended {
    return {
        ID: 'prompt-dec-1',
        Name: 'Test Decision Prompt',
        AIModelType: 'Decision',
        AIModelTypeID: 'mt-decision-id',
        ...overrides,
    } as unknown as MJAIPromptEntityExtended;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DecisionFeaturePipelineDriver', () => {
    describe('Registration & Capabilities', () => {
        it('is registered with BaseFeaturePipelineDriver under key DecisionFeaturePipelineDriver', () => {
            const instance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseFeaturePipelineDriver>(
                BaseFeaturePipelineDriver,
                'DecisionFeaturePipelineDriver'
            );
            expect(instance).toBeInstanceOf(DecisionFeaturePipelineDriver);
        });

        it('declares DECISION_FEATURE_PIPELINE_CAPABILITIES', () => {
            const driver = new DecisionFeaturePipelineDriver();
            expect(driver.Capabilities).toEqual(DECISION_FEATURE_PIPELINE_CAPABILITIES);
            expect(driver.Capabilities.ProducesConfidence).toBe(true);
            expect(driver.Capabilities.ProducesReasoning).toBe(false);
            expect(driver.Capabilities.ConstraintTypes).toEqual(['boolean', 'enum', 'numeric']);
            expect(driver.Capabilities.TargetModes).toEqual(['field']);
        });
    });

    describe('ValidateOutputs', () => {
        const driver = new DecisionFeaturePipelineDriver();

        it('rejects specs with CaptureReasoning: true', () => {
            const spec: DataFeatureSpec = {
                Kind: 'decision-derived',
                CaptureReasoning: true,
                Target: { Entity: 'Customers', Mode: 'field' },
                Outputs: [
                    {
                        Name: 'IsHighValue',
                        Target: { Mode: 'field', Field: 'IsHighValue' },
                        Constraint: { Type: 'boolean' },
                    },
                ],
            };
            const errors = driver.ValidateOutputs(spec);
            expect(errors.some((e) => e.includes('do not produce reasoning'))).toBe(true);
        });

        it('delegates base validations (unsupported constraint types, non-field targets)', () => {
            const spec: DataFeatureSpec = {
                Kind: 'decision-derived',
                Target: { Entity: 'Customers', Mode: 'field' },
                Outputs: [
                    {
                        Name: 'BioSummary',
                        Target: { Mode: 'field', Field: 'Bio' },
                        Constraint: { Type: 'freetext' },
                    },
                    {
                        Name: 'Interactions',
                        Target: { Mode: 'child', ChildEntity: 'Interactions' },
                        Constraint: { Type: 'boolean' },
                    },
                ],
            };
            const errors = driver.ValidateOutputs(spec);
            expect(errors.some((e) => e.includes("constraint type 'freetext'"))).toBe(true);
            expect(errors.some((e) => e.includes("target mode 'child'"))).toBe(true);
        });

        it('rejects outputs without any constraint', () => {
            const spec: DataFeatureSpec = {
                Kind: 'decision-derived',
                Target: { Entity: 'Customers', Mode: 'field' },
                Outputs: [
                    {
                        Name: 'UnconstrainedOut',
                        Target: { Mode: 'field', Field: 'Score' },
                    },
                ],
            };
            const errors = driver.ValidateOutputs(spec);
            expect(errors.some((e) => e.includes('has no constraint'))).toBe(true);
        });

        it('validates numeric outputs have between 2 and 10 levels', () => {
            const specNoLevels: DataFeatureSpec = {
                Kind: 'decision-derived',
                Target: { Entity: 'Customers', Mode: 'field' },
                Outputs: [
                    {
                        Name: 'ScoreOut',
                        Target: { Mode: 'field', Field: 'Score' },
                        Constraint: { Type: 'numeric', Min: 0, Max: 100 },
                    },
                ],
            };
            const errorsNoLevels = driver.ValidateOutputs(specNoLevels);
            expect(errorsNoLevels.some((e) => e.includes('between 2 and 10 Level descriptions'))).toBe(true);

            const specTooManyLevels: DataFeatureSpec = {
                Kind: 'decision-derived',
                Target: { Entity: 'Customers', Mode: 'field' },
                Outputs: [
                    {
                        Name: 'ScoreOut',
                        Target: { Mode: 'field', Field: 'Score' },
                        Constraint: {
                            Type: 'numeric',
                            Min: 0,
                            Max: 100,
                            Levels: ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'L9', 'L10', 'L11'],
                        },
                    },
                ],
            };
            const errorsTooMany = driver.ValidateOutputs(specTooManyLevels);
            expect(errorsTooMany.some((e) => e.includes('between 2 and 10 Level descriptions'))).toBe(true);
        });

        it('validates enum outputs have <= 255 values and all have descriptions', () => {
            const specMissingDesc: DataFeatureSpec = {
                Kind: 'decision-derived',
                Target: { Entity: 'Customers', Mode: 'field' },
                Outputs: [
                    {
                        Name: 'StatusOut',
                        Target: { Mode: 'field', Field: 'Status' },
                        Constraint: {
                            Type: 'enum',
                            Values: ['Active', 'Pending', 'Inactive'],
                            ValueDescriptions: {
                                Active: 'Currently active customer',
                            },
                        },
                    },
                ],
            };
            const errorsMissing = driver.ValidateOutputs(specMissingDesc);
            expect(errorsMissing.some((e) => e.includes('values missing descriptions: Pending, Inactive'))).toBe(true);

            const specTooManyValues: DataFeatureSpec = {
                Kind: 'decision-derived',
                Target: { Entity: 'Customers', Mode: 'field' },
                Outputs: [
                    {
                        Name: 'HugeEnum',
                        Target: { Mode: 'field', Field: 'Huge' },
                        Constraint: {
                            Type: 'enum',
                            Values: Array.from({ length: 256 }, (_, i) => `val_${i}`),
                            ValueDescriptions: Object.fromEntries(Array.from({ length: 256 }, (_, i) => [`val_${i}`, `desc_${i}`])),
                        },
                    },
                ],
            };
            const errorsTooMany = driver.ValidateOutputs(specTooManyValues);
            expect(errorsTooMany.some((e) => e.includes('maximum supported for Decision is 255'))).toBe(true);
        });

        it('passes a fully valid Decision pipeline spec', () => {
            const spec: DataFeatureSpec = {
                Kind: 'decision-derived',
                Target: { Entity: 'Customers', Mode: 'field' },
                Outputs: [
                    {
                        Name: 'IsHighValue',
                        Target: { Mode: 'field', Field: 'IsHighValue' },
                        Constraint: { Type: 'boolean', Threshold: 0.7 },
                    },
                    {
                        Name: 'Tier',
                        Target: { Mode: 'field', Field: 'Tier' },
                        Constraint: {
                            Type: 'enum',
                            Values: ['Bronze', 'Silver', 'Gold'],
                            ValueDescriptions: {
                                Bronze: 'Entry level customer',
                                Silver: 'Mid-tier customer',
                                Gold: 'VIP customer',
                            },
                        },
                    },
                    {
                        Name: 'RiskScore',
                        Target: { Mode: 'field', Field: 'RiskScore' },
                        Constraint: {
                            Type: 'numeric',
                            Min: 0,
                            Max: 100,
                            Integer: true,
                            Levels: ['Low risk', 'Moderate risk', 'High risk'],
                        },
                    },
                ],
            };
            const errors = driver.ValidateOutputs(spec);
            expect(errors).toEqual([]);
        });
    });

    describe('ComputeOutputs', () => {
        let driver: TestableDecisionDriver;
        let mockContext: RecordProcessorContext;

        beforeEach(() => {
            driver = new TestableDecisionDriver();
            mockContext = makeDummyContext();
        });

        it('rejects a prompt not configured for a Decision model', async () => {
            const nonDecisionPrompt = {
                ID: 'p1',
                Name: 'Regular LLM Prompt',
                AIModelType: 'LLM',
            } as unknown as MJAIPromptEntityExtended;

            const request: FeaturePipelineComputeRequest = {
                Prompt: nonDecisionPrompt,
                Record: { ID: 'rec-1', EntityName: 'Customers' },
                Context: mockContext,
                Hooks: {
                    BeforeBuildContext: vi.fn(async () => {}),
                    BuildPromptData: vi.fn(async () => ({ Name: 'Alice' })),
                    BeforePromptExecute: vi.fn(async () => {}),
                    AfterPromptExecute: vi.fn(async (r) => r.result),
                },
                Spec: {
                    Kind: 'decision-derived',
                    Target: { Entity: 'Customers', Mode: 'field' },
                    Outputs: [{ Name: 'IsVIP', Target: { Mode: 'field', Field: 'IsVIP' }, Constraint: { Type: 'boolean' } }],
                },
            };

            const result = await driver.ComputeOutputs(request);
            expect(result.Success).toBe(false);
            if (!result.Success) {
                expect(result.ErrorMessage).toMatch(/not a Decision prompt/i);
            }
        });

        it('fails with clear error when state token estimate exceeds MaxStateTokens without truncating', async () => {
            const prompt = makeDecisionPrompt();
            (prompt as { AIModelID?: string }).AIModelID = 'model-limited-tokens';

            vi.spyOn(AIEngine.Instance, 'GetEffectiveModelConfiguration').mockReturnValue({
                Decision: {
                    MaxStateTokens: 5, // small limit to trigger error
                },
            } as unknown as ReturnType<typeof AIEngine.Instance.GetEffectiveModelConfiguration>);

            const request: FeaturePipelineComputeRequest = {
                Prompt: prompt,
                Record: { ID: 'rec-1', EntityName: 'Customers' },
                Context: mockContext,
                Hooks: {
                    BeforeBuildContext: vi.fn(async () => {}),
                    BuildPromptData: vi.fn(async () => ({
                        LongText: 'This is a long piece of text that easily exceeds five estimated tokens.',
                    })),
                    BeforePromptExecute: vi.fn(async () => {}),
                    AfterPromptExecute: vi.fn(async (r) => r.result),
                },
                Spec: {
                    Kind: 'decision-derived',
                    Target: { Entity: 'Customers', Mode: 'field' },
                    Outputs: [{ Name: 'IsVIP', Target: { Mode: 'field', Field: 'IsVIP' }, Constraint: { Type: 'boolean' } }],
                },
            };

            const result = await driver.ComputeOutputs(request);
            expect(result.Success).toBe(false);
            if (!result.Success) {
                expect(result.ErrorMessage).toMatch(/exceeds the model's Decision\.MaxStateTokens limit of 5/i);
            }
        });

        it('maps Likelihood, Choice, and Score answers, rescales rubric, and preserves confidence', async () => {
            let capturedParams: AIDecisionParams | undefined;
            driver.mockExecuteDecision = vi.fn(async (params: AIDecisionParams) => {
                capturedParams = params;
                const answers: Record<string, DecisionAnswer> = {
                    IsVIP: {
                        Kind: 'Likelihood',
                        Probability: 0.75,
                    } as LikelihoodAnswer,
                    LowThresholdFlag: {
                        Kind: 'Likelihood',
                        Probability: 0.4,
                    } as LikelihoodAnswer,
                    Tier: {
                        Kind: 'Choice',
                        Value: 'Silver',
                        Confidence: 0.88,
                        Probabilities: { Bronze: 0.05, Silver: 0.88, Gold: 0.07 },
                    } as ChoiceAnswer,
                    RiskScore: {
                        Kind: 'Score',
                        Value: 1, // index 1 of 3 levels [0, 1, 2] -> 50% rescaled onto [0, 100] = 50
                        Confidence: 0.92,
                        Probabilities: { 'Low risk': 0.04, 'Moderate risk': 0.92, 'High risk': 0.04 },
                    } as ScoreAnswer,
                };
                return {
                    success: true,
                    Answers: answers,
                    promptRun: { ID: 'prompt-run-123' },
                } as unknown as AIDecisionRunResult;
            });

            const prompt = makeDecisionPrompt();
            const request: FeaturePipelineComputeRequest = {
                Prompt: prompt,
                Record: { ID: 'rec-1', EntityName: 'Customers' },
                Context: mockContext,
                Hooks: {
                    BeforeBuildContext: vi.fn(async () => {}),
                    BuildPromptData: vi.fn(async () => ({ Name: 'Bob' })),
                    BeforePromptExecute: vi.fn(async () => {}),
                    AfterPromptExecute: vi.fn(async (r) => r.result),
                },
                Spec: {
                    Kind: 'decision-derived',
                    Target: { Entity: 'Customers', Mode: 'field' },
                    Outputs: [
                        {
                            Name: 'IsVIP',
                            Target: { Mode: 'field', Field: 'IsVIP' },
                            Constraint: { Type: 'boolean', Threshold: 0.7 }, // 0.75 >= 0.7 -> true
                        },
                        {
                            Name: 'LowThresholdFlag',
                            Target: { Mode: 'field', Field: 'LowThresholdFlag' },
                            Constraint: { Type: 'boolean', Threshold: 0.5 }, // 0.4 < 0.5 -> false
                        },
                        {
                            Name: 'Tier',
                            Target: { Mode: 'field', Field: 'Tier' },
                            Constraint: {
                                Type: 'enum',
                                Values: ['Bronze', 'Silver', 'Gold'],
                                ValueDescriptions: { Bronze: 'b', Silver: 's', Gold: 'g' },
                            },
                        },
                        {
                            Name: 'RiskScore',
                            Target: { Mode: 'field', Field: 'RiskScore' },
                            Constraint: {
                                Type: 'numeric',
                                Min: 0,
                                Max: 100,
                                Integer: true,
                                Levels: ['Low risk', 'Moderate risk', 'High risk'],
                            },
                        },
                    ],
                },
            };

            const result = await driver.ComputeOutputs(request);
            expect(result.Success).toBe(true);
            expect(result.AIPromptRunID).toBe('prompt-run-123');

            // Verify params: State is set, data is not set
            expect(capturedParams).toBeDefined();
            expect(capturedParams!.State).toBe(JSON.stringify({ Name: 'Bob' }));
            expect(capturedParams!.data).toBeUndefined();

            // Verify mapped values in RawResult
            const raw = result.RawResult as Record<string, unknown>;
            expect(raw.IsVIP).toBe(true);
            expect(raw.LowThresholdFlag).toBe(false);
            expect(raw.Tier).toBe('Silver');
            expect(raw.RiskScore).toBe(50); // index 1 on 3 levels rescaled to [0, 100] = 50

            // Verify Confidence dictionary
            expect(result.Confidence).toEqual({
                IsVIP: 0.75,
                LowThresholdFlag: 0.6, // written false, so its confidence is P(no) = 1 - 0.4
                Tier: 0.88,
                RiskScore: 0.92,
            });

            // Verify only context hooks were called (prompt execution hooks are LLM-specific and must not be called)
            expect(request.Hooks.BeforeBuildContext).toHaveBeenCalledTimes(1);
            expect(request.Hooks.BuildPromptData).toHaveBeenCalledTimes(1);
            expect(request.Hooks.BeforePromptExecute).not.toHaveBeenCalled();
            expect(request.Hooks.AfterPromptExecute).not.toHaveBeenCalled();
        });

        it('returns failure when ExecuteDecision returns success: false', async () => {
            driver.mockExecuteDecision = vi.fn(async () => ({
                success: false,
                errorMessage: 'Decision engine timeout',
            } as unknown as AIDecisionRunResult));

            const prompt = makeDecisionPrompt();
            const request: FeaturePipelineComputeRequest = {
                Prompt: prompt,
                Record: { ID: 'rec-1', EntityName: 'Customers' },
                Context: mockContext,
                Hooks: {
                    BeforeBuildContext: vi.fn(async () => {}),
                    BuildPromptData: vi.fn(async () => ({})),
                    BeforePromptExecute: vi.fn(async () => {}),
                    AfterPromptExecute: vi.fn(async (r) => r.result),
                },
                Spec: {
                    Kind: 'decision-derived',
                    Target: { Entity: 'Customers', Mode: 'field' },
                    Outputs: [{ Name: 'IsVIP', Target: { Mode: 'field', Field: 'IsVIP' }, Constraint: { Type: 'boolean' } }],
                },
            };

            const result = await driver.ComputeOutputs(request);
            expect(result.Success).toBe(false);
            if (!result.Success) {
                expect(result.ErrorMessage).toContain('Decision engine timeout');
            }
        });
    });

    describe('InferProcessor Integration', () => {
        class DecisionProbeProcessor extends InferProcessor {
            public Resolve(context: RecordProcessorContext): Promise<BaseFeaturePipelineDriver> {
                return this.ResolveDriver(context);
            }
        }

        it('resolves DecisionFeaturePipelineDriver when pipeline type DriverClass is DecisionFeaturePipelineDriver', async () => {
            const typeEntity = {
                ID: 'F67FFBFD-94AA-47CF-9867-C3BDF36F30F9',
                Name: 'Decision',
                DriverClass: 'DecisionFeaturePipelineDriver',
                Status: 'Active',
            } as unknown as MJFeaturePipelineTypeEntity;

            vi.spyOn(KnowledgeHubMetadataEngine.Instance, 'Config').mockResolvedValue();
            vi.spyOn(KnowledgeHubMetadataEngine.Instance, 'FeaturePipelineTypes', 'get').mockReturnValue([typeEntity]);

            const spec: DataFeatureSpec = {
                Kind: 'decision-derived',
                PipelineType: 'Decision',
                Target: { Entity: 'Customers', Mode: 'field' },
                Outputs: [{ Name: 'IsVIP', Target: { Mode: 'field', Field: 'IsVIP' }, Constraint: { Type: 'boolean' } }],
            };

            const processor = new DecisionProbeProcessor('prompt-1', undefined, spec);
            const context = makeDummyContext();

            const driver = await processor.Resolve(context);
            expect(driver).toBeInstanceOf(DecisionFeaturePipelineDriver);
            expect(driver.Capabilities.ProducesConfidence).toBe(true);
        });

        it('fans out confidence across records sharing a cache key in ProcessBatch', async () => {
            const typeEntity = {
                ID: 'F67FFBFD-94AA-47CF-9867-C3BDF36F30F9',
                Name: 'Decision',
                DriverClass: 'DecisionFeaturePipelineDriver',
                Status: 'Active',
            } as unknown as MJFeaturePipelineTypeEntity;

            vi.spyOn(KnowledgeHubMetadataEngine.Instance, 'Config').mockResolvedValue();
            vi.spyOn(KnowledgeHubMetadataEngine.Instance, 'FeaturePipelineTypes', 'get').mockReturnValue([typeEntity]);

            vi.spyOn(AIEngine.Instance, 'Config').mockResolvedValue(true as unknown as void);
            const prompt = makeDecisionPrompt();
            vi.spyOn(AIEngine.Instance, 'Prompts', 'get').mockReturnValue([prompt]);

            vi.spyOn(FeatureValueCacheService.Instance, 'BatchLookup').mockResolvedValue(new Map());
            vi.spyOn(FeatureValueCacheService.Instance, 'Store').mockResolvedValue({ ID: 'cache-1' } as unknown as MJFeatureValueCacheEntity);
            vi.spyOn(FeatureValueCacheService.Instance, 'RecordFeatureValues').mockResolvedValue();

            // Register a mock decision runner for AIDecisionRunner
            const mockRunner = {
                ExecuteDecision: vi.fn(async () => ({
                    success: true,
                    Answers: {
                        IsVIP: { Kind: 'Likelihood', Probability: 0.95 } as LikelihoodAnswer,
                    },
                    promptRun: { ID: 'pr-batch-1' },
                })),
            };
            vi.spyOn(DecisionFeaturePipelineDriver.prototype as unknown as { CreateDecisionRunner(): AIDecisionRunner }, 'CreateDecisionRunner')
                .mockReturnValue(mockRunner as unknown as AIDecisionRunner);

            const spec: DataFeatureSpec = {
                Kind: 'decision-derived',
                PipelineType: 'Decision',
                Target: { Entity: 'Customers', Mode: 'field' },
                Outputs: [{ Name: 'IsVIP', Target: { Mode: 'field', Field: 'IsVIP' }, Constraint: { Type: 'boolean' } }],
                Caching: {
                    Cacheable: true,
                    KeyFields: ['EmailDomain'],
                    Scope: 'pipeline',
                },
            };

            const processor = new InferProcessor('prompt-dec-1', undefined, spec);
            const context = makeDummyContext();

            const records: RecordRef[] = [
                { EntityID: 'ent-1', RecordID: 'c1', Record: { EmailDomain: 'example.com' } },
                { EntityID: 'ent-1', RecordID: 'c2', Record: { EmailDomain: 'example.com' } },
            ];

            const batchResults = await processor.ProcessBatch(records, context);

            expect(batchResults.size).toBe(2);
            const r1 = batchResults.get('c1');
            const r2 = batchResults.get('c2');

            expect(r1?.Status).toBe('Succeeded');
            expect(r2?.Status).toBe('Succeeded');
            expect(r1?.Confidence).toEqual({ IsVIP: 0.95 });
            expect(r2?.Confidence).toEqual({ IsVIP: 0.95 });
            expect(mockRunner.ExecuteDecision).toHaveBeenCalledTimes(1);
        });
    });
});
