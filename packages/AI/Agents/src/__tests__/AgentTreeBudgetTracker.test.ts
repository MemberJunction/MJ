import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentTreeBudgetTracker } from '../AgentTreeBudgetTracker';
import { BaseAgent } from '../base-agent';
import type {
    AgentTreeBudget,
    AIPromptRunResult,
    ExecuteAgentParams,
    MJAIAgentEntityExtended,
    MJAIAgentRunEntityExtended,
    MJAIAgentRunStepEntityExtended,
} from '@memberjunction/ai-core-plus';
import type { MJAIPromptRunEntity } from '@memberjunction/core-entities';

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<Record<string, Object>>();
    return {
        ...actual,
        LogError: vi.fn(),
        LogStatus: vi.fn(),
        LogStatusEx: vi.fn(),
        LogErrorEx: vi.fn(),
        IsVerboseLoggingEnabled: vi.fn(() => false),
    };
});

function createAgentStub(overrides: Partial<MJAIAgentEntityExtended> = {}): MJAIAgentEntityExtended {
    const base: Partial<MJAIAgentEntityExtended> = {
        ID: '11111111-1111-4111-8111-111111111111',
        Name: 'TestAgent',
        Status: 'Active',
        MaxIterationsPerRun: 10,
        MaxTokensPerRun: 50000,
        MaxCostPerRun: 10,
        MaxTimePerRun: 3600,
        ...overrides,
    };
    return base as MJAIAgentEntityExtended;
}

function createStepStub(overrides: Partial<MJAIAgentRunStepEntityExtended> = {}): MJAIAgentRunStepEntityExtended {
    const base: Partial<MJAIAgentRunStepEntityExtended> = {
        ID: '22222222-2222-4222-8222-222222222222',
        StepType: 'Prompt',
        Status: 'Completed',
        ...overrides,
    };
    return base as MJAIAgentRunStepEntityExtended;
}

function createRunStub(overrides: Partial<MJAIAgentRunEntityExtended> = {}): MJAIAgentRunEntityExtended {
    const base: Partial<MJAIAgentRunEntityExtended> = {
        ID: '33333333-3333-4333-8333-333333333333',
        Steps: [],
        TotalPromptIterations: 0,
        TotalTokensUsed: 0,
        TotalCost: 0,
        TotalPromptTokensUsed: 0,
        TotalCompletionTokensUsed: 0,
        TotalCacheReadTokensUsed: 0,
        TotalCacheWriteTokensUsed: 0,
        StartedAt: new Date(),
        ...overrides,
    };
    return base as MJAIAgentRunEntityExtended;
}

describe('AgentTreeBudgetTracker', () => {
    let tracker: AgentTreeBudgetTracker;

    beforeEach(() => {
        vi.clearAllMocks();
        tracker = new AgentTreeBudgetTracker();
    });

    describe('CalculateRunTokenStats', () => {
        it('should return all zeros when agentRun is undefined or has no steps', () => {
            expect(tracker.CalculateRunTokenStats(undefined)).toEqual({
                TotalTokens: 0,
                PromptTokens: 0,
                CompletionTokens: 0,
                CacheReadTokens: 0,
                CacheWriteTokens: 0,
                TotalCost: 0,
            });
            expect(tracker.CalculateRunTokenStats(createRunStub({ Steps: [] }))).toEqual({
                TotalTokens: 0,
                PromptTokens: 0,
                CompletionTokens: 0,
                CacheReadTokens: 0,
                CacheWriteTokens: 0,
                TotalCost: 0,
            });
        });

        it('should sum prompt, compaction, decision, and sub-agent steps into AgentRunTokenStats', () => {
            const promptStep = createStepStub({
                StepType: 'Prompt',
                PromptRun: {
                    TokensUsedRollup: 150,
                    TokensPromptRollup: 100,
                    TokensCompletionRollup: 50,
                    TokensCacheReadRollup: 20,
                    TokensCacheWriteRollup: 5,
                    TotalCost: 0.05,
                } as Partial<MJAIPromptRunEntity> as MJAIPromptRunEntity,
            });
            const compactionStep = createStepStub({
                StepType: 'Compaction',
                PromptRun: {
                    TokensUsedRollup: 50,
                    TokensPromptRollup: 40,
                    TokensCompletionRollup: 10,
                    TokensCacheReadRollup: 0,
                    TokensCacheWriteRollup: 0,
                    TotalCost: 0.01,
                } as Partial<MJAIPromptRunEntity> as MJAIPromptRunEntity,
            });
            const subAgentStep = createStepStub({
                StepType: 'Sub-Agent',
                SubAgentRun: createRunStub({
                    TotalTokensUsed: 280,
                    TotalPromptTokensUsed: 200,
                    TotalCompletionTokensUsed: 80,
                    TotalCacheReadTokensUsed: 15,
                    TotalCacheWriteTokensUsed: 10,
                    TotalCost: 0.12,
                }),
            });

            const run = createRunStub({ Steps: [promptStep, compactionStep, subAgentStep] });
            const stats = tracker.CalculateRunTokenStats(run);

            expect(stats.TotalTokens).toBe(480);
            expect(stats.PromptTokens).toBe(340);
            expect(stats.CompletionTokens).toBe(140);
            expect(stats.CacheReadTokens).toBe(35);
            expect(stats.CacheWriteTokens).toBe(15);
            expect(stats.TotalCost).toBeCloseTo(0.18, 5);
        });
    });

    describe('ApplyTokenStatsToRun', () => {
        it('should populate all six denormalized token and cost fields on the agentRun entity', () => {
            const promptStep = createStepStub({
                StepType: 'Prompt',
                PromptRun: {
                    TokensUsedRollup: 150,
                    TokensPromptRollup: 120,
                    TokensCompletionRollup: 30,
                    TokensCacheReadRollup: 10,
                    TokensCacheWriteRollup: 5,
                    TotalCost: 0.03,
                } as Partial<MJAIPromptRunEntity> as MJAIPromptRunEntity,
            });
            const run = createRunStub({ Steps: [promptStep] });
            const stats = tracker.CalculateRunTokenStats(run);

            tracker.ApplyTokenStatsToRun(run, stats);

            expect(run.TotalTokensUsed).toBe(150);
            expect(run.TotalPromptTokensUsed).toBe(120);
            expect(run.TotalCompletionTokensUsed).toBe(30);
            expect(run.TotalCacheReadTokensUsed).toBe(10);
            expect(run.TotalCacheWriteTokensUsed).toBe(5);
            expect(run.TotalCost).toBeCloseTo(0.03, 5);
        });
    });

    describe('EnsureTreeBudget and RecordPromptUsage', () => {
        it('should initialize and reuse treeBudget on ExecuteAgentParams and accumulate steps, tokens, and cost', () => {
            const params: ExecuteAgentParams = {
                agent: createAgentStub(),
                conversationMessages: [],
                maxTreeSteps: 5,
                maxTreeTokens: 1000,
                maxTreeCost: 2.5,
                maxTreeDurationMs: 60000,
            };

            const budget1 = tracker.EnsureTreeBudget(params);
            const budget2 = tracker.EnsureTreeBudget(params);
            expect(budget1).toBe(budget2);
            expect(params.treeBudget).toBe(budget1);
            expect(budget1.maxTreeSteps).toBe(5);
            expect(budget1.maxTreeTokens).toBe(1000);
            expect(budget1.maxTreeCost).toBe(2.5);
            expect(budget1.maxTreeDurationMs).toBe(60000);

            budget1.totalSteps += 1;
            expect(budget1.totalSteps).toBe(1);

            const promptRun: Partial<MJAIPromptRunEntity> = {
                TokensUsedRollup: 300,
                TotalCost: 0.25,
            };
            tracker.RecordPromptUsage(budget1, promptRun as MJAIPromptRunEntity, undefined);
            expect(budget1.totalTokens).toBe(300);
            expect(budget1.totalCost).toBeCloseTo(0.25, 5);
        });

        it('should fall back to AIPromptRunResult tokens and cost when promptRun entity is absent', () => {
            const params: ExecuteAgentParams = {
                agent: createAgentStub(),
                conversationMessages: [],
            };
            const budget = tracker.EnsureTreeBudget(params);
            const promptResult: AIPromptRunResult<string> = {
                success: true,
                tokensUsed: 450,
                cost: 0.45,
            };
            tracker.RecordPromptUsage(budget, undefined, promptResult);
            expect(budget.totalTokens).toBe(450);
            expect(budget.totalCost).toBeCloseTo(0.45, 5);
        });
    });

    describe('CheckRunAndTreeGuardrails', () => {
        it('should enforce zero-cost and zero-token guardrails when MaxCostPerRun or MaxTokensPerRun is 0', () => {
            const params: ExecuteAgentParams = {
                agent: createAgentStub({ MaxCostPerRun: 0, MaxTokensPerRun: 1000 }),
                conversationMessages: [],
            };
            const run = createRunStub({ TotalCost: 0, TotalTokensUsed: 0 });
            const { Result: verdict } = tracker.CheckRunAndTreeGuardrails({
                Params: params,
                AgentRun: run,
                AbsoluteMaxIterations: 1000,
                ValidationRetryCount: 0,
                MaxValidationRetries: 3,
            });

            expect(verdict.Exceeded).toBe(true);
            expect(verdict.Type).toBe('cost');
            expect(verdict.Limit).toBe(0);
        });

        it('should detect tree budget breaches when per-run limits are still within bounds', () => {
            const params: ExecuteAgentParams = {
                agent: createAgentStub({ MaxIterationsPerRun: 10 }),
                conversationMessages: [],
                maxTreeSteps: 3,
            };
            const budget = tracker.EnsureTreeBudget(params);
            budget.totalSteps = 3;

            const run = createRunStub({ TotalPromptIterations: 1 });
            const { Result: verdict } = tracker.CheckRunAndTreeGuardrails({
                Params: params,
                AgentRun: run,
                CurrentBudget: budget,
                AbsoluteMaxIterations: 1000,
                ValidationRetryCount: 0,
                MaxValidationRetries: 3,
            });

            expect(verdict.Exceeded).toBe(true);
            expect(verdict.Type).toBe('iterations');
            expect(verdict.Limit).toBe(3);
            expect(verdict.Current).toBe(3);

            const legacy = tracker.ToLegacyGuardrailVerdict(verdict);
            expect(legacy).toEqual({
                exceeded: true,
                type: 'iterations',
                limit: 3,
                current: 3,
                reason: verdict.Reason,
            });
        });
    });

    describe('IncrementExecutionCount and GetExecutionCount', () => {
        it('should track per-item execution counts in a provided Map', () => {
            const counts = new Map<string, number>();
            expect(tracker.GetExecutionCount(counts, 'action-1')).toBe(0);
            expect(tracker.IncrementExecutionCount(counts, 'action-1')).toBe(1);
            expect(tracker.IncrementExecutionCount(counts, 'action-1')).toBe(2);
            expect(tracker.GetExecutionCount(counts, 'action-1')).toBe(2);
            expect(tracker.GetExecutionCount(counts, 'action-2')).toBe(0);
        });
    });

    describe('BaseAgent subclass protected override hooks', () => {
        it('should route hasExceededAgentRunGuardrails through subclass overrides of ensureTreeBudget and checkTreeBudgetLimit', async () => {
            const ensureCalls: Array<ExecuteAgentParams | undefined> = [];
            const checkCalls: Array<ExecuteAgentParams | undefined> = [];

            class CustomBudgetAgent extends BaseAgent {
                protected override ensureTreeBudget(params?: ExecuteAgentParams): AgentTreeBudget {
                    ensureCalls.push(params);
                    const budget = super.ensureTreeBudget(params);
                    budget.maxTreeTokens = 777;
                    return budget;
                }

                protected override checkTreeBudgetLimit(params?: ExecuteAgentParams): {
                    exceeded: boolean;
                    type?: 'cost' | 'tokens' | 'iterations' | 'time';
                    limit?: number;
                    current?: number;
                    reason?: string;
                } {
                    checkCalls.push(params);
                    return {
                        exceeded: true,
                        type: 'tokens',
                        limit: 777,
                        current: 999,
                        reason: 'Custom subclass tree budget limit triggered',
                    };
                }

                public async EvaluateGuardrails(
                    params: ExecuteAgentParams,
                    run: MJAIAgentRunEntityExtended
                ): Promise<{
                    exceeded: boolean;
                    type?: 'cost' | 'tokens' | 'iterations' | 'time';
                    limit?: number;
                    current?: number;
                    reason?: string;
                }> {
                    return this.hasExceededAgentRunGuardrails(params, run);
                }
            }

            const customAgent = new CustomBudgetAgent();
            const params: ExecuteAgentParams = {
                agent: createAgentStub({ MaxIterationsPerRun: 10 }),
                conversationMessages: [],
            };
            const run = createRunStub({ TotalPromptIterations: 1 });

            const verdict = await customAgent.EvaluateGuardrails(params, run);

            expect(ensureCalls).toHaveLength(1);
            expect(ensureCalls[0]).toBe(params);
            expect(checkCalls).toHaveLength(1);
            expect(checkCalls[0]).toBe(params);
            expect(params.treeBudget?.maxTreeTokens).toBe(777);
            expect(verdict).toEqual({
                exceeded: true,
                type: 'tokens',
                limit: 777,
                current: 999,
                reason: 'Custom subclass tree budget limit triggered',
            });
        });
    });
});
