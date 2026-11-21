/**
 * Unit tests for Root-Tree Cumulative Budget Guards (`AgentTreeBudget`):
 * - `maxTreeSteps` across parent + sub-agent hierarchies where neither agent exceeds its own `MaxIterationsPerRun`
 * - `maxTreeTokens` cumulative enforcement across prompt runs in the tree
 * - `maxTreeCost` cumulative enforcement across prompt runs in the tree
 * - `maxTreeDurationMs` wall-clock duration enforcement from root start time
 * - Shared `AgentTreeBudget` object reference (`===`) propagation into sequential and parallel sub-agent runs
 *   and immediate parent termination when a sub-agent breaches the tree budget.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseAgent } from '../base-agent';
import type {
    AgentConfiguration,
    AgentSubAgentRequest,
    AgentTreeBudget,
    AIPromptRunResult,
    BaseAgentNextStep,
    ExecuteAgentParams,
    ExecuteAgentResult,
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

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: {
        get Instance() {
            return {
                Agents: [],
                AgentRelationships: [],
                AgentActions: [],
                GetSubAgents: () => [],
            };
        },
    },
}));

const mockRunAgent = vi.fn();

vi.mock('../AgentRunner', () => ({
    AgentRunner: class {
        RunAgent = mockRunAgent;
    },
}));

interface GuardrailCheckResult {
    exceeded: boolean;
    type?: 'cost' | 'tokens' | 'iterations' | 'time';
    limit?: number;
    current?: number;
    reason?: string;
}

/**
 * Testable subclass of {@link BaseAgent} exposing protected tree-budget and step-execution hooks.
 */
class TestableTreeBudgetAgent extends BaseAgent {
    constructor() {
        super();
        const stubAgentType = {
            PreProcessNextStep: async () => null,
            DetermineInitialStep: async () => null,
        };
        Object.defineProperty(this, 'AgentTypeInstance', {
            get: () => stubAgentType,
            configurable: true,
        });
    }

    public simulateStepCreation(params: ExecuteAgentParams): void {
        const budget = this.ensureTreeBudget(params);
        budget.totalSteps += 1;
    }

    public simulatePromptUsage(
        params: ExecuteAgentParams,
        tokens: number,
        cost: number
    ): void {
        const promptResult: AIPromptRunResult<string> = {
            success: true,
            chatResult: {
                success: true,
                statusText: 'OK',
                data: {
                    choices: [],
                    usage: { promptTokens: tokens, completionTokens: 0, totalTokens: tokens },
                },
                errorMessage: '',
                exception: null,
                modelSpecificResponseDetails: null,
                startTime: new Date(),
                endTime: new Date(),
                timeElapsed: 1,
            },
            tokensUsed: tokens,
            cost,
        };
        this.recordPromptUsageInTreeBudget(undefined, promptResult, params);
    }

    public invokeEnsureTreeBudget(params?: ExecuteAgentParams): AgentTreeBudget {
        return this.ensureTreeBudget(params);
    }

    public invokeCheckTreeBudgetLimit(params?: ExecuteAgentParams): GuardrailCheckResult {
        return this.checkTreeBudgetLimit(params);
    }

    public async invokeHasExceededGuardrails(
        params: ExecuteAgentParams,
        agentRun: MJAIAgentRunEntityExtended
    ): Promise<GuardrailCheckResult> {
        return this.hasExceededAgentRunGuardrails(params, agentRun);
    }

    public async invokeExecuteNextStep<P>(
        params: ExecuteAgentParams,
        config: AgentConfiguration,
        previousDecision: BaseAgentNextStep<P> | null,
        stepCount: number = 0
    ): Promise<BaseAgentNextStep<P>> {
        return this.executeNextStep<P>(params, config, previousDecision, stepCount);
    }

    public async invokeExecuteSubAgent(
        params: ExecuteAgentParams,
        subAgentRequest: AgentSubAgentRequest,
        subAgent: MJAIAgentEntityExtended,
        stepEntity: MJAIAgentRunStepEntityExtended
    ): Promise<ExecuteAgentResult> {
        return this.ExecuteSubAgent(params, subAgentRequest, subAgent, stepEntity);
    }

    protected override async recordFoldedTaskGraph(): Promise<void> {
        // No-op in unit tests
    }

    protected override async processSubAgentStep<P, R>(
        params: ExecuteAgentParams<P>,
        previousDecision: BaseAgentNextStep<P>,
        _agentStep?: undefined,
        _parentStepId?: string,
        stepCount: number = 0
    ): Promise<BaseAgentNextStep<R>> {
        const subAgentStub = {
            ID: 'child-agent-id',
            Name: previousDecision.subAgent?.name ?? 'ChildAgent',
            Status: 'Active',
            MaxIterationsPerRun: 5,
        } as MJAIAgentEntityExtended;
        const stepStub = {
            ID: 'subagent-step-id',
            TargetLogID: null,
        } as MJAIAgentRunStepEntityExtended;

        await this.ExecuteSubAgent(
            params,
            previousDecision.subAgent ?? { name: 'ChildAgent', message: 'Run child', terminateAfter: false },
            subAgentStub,
            stepStub,
            stepCount
        );

        return {
            step: 'Retry',
            terminate: false,
            previousPayload: previousDecision.previousPayload as R,
            newPayload: previousDecision.newPayload as R,
        };
    }
}

function createAgentStub(overrides: Partial<MJAIAgentEntityExtended> = {}): MJAIAgentEntityExtended {
    return {
        ID: 'agent-id-1',
        Name: 'TestAgent',
        Status: 'Active',
        MaxIterationsPerRun: 5,
        MaxTokensPerRun: 50000,
        MaxCostPerRun: 10,
        MaxTimePerRun: 3600,
        ...overrides,
    } as MJAIAgentEntityExtended;
}

function createRunStub(overrides: Partial<MJAIAgentRunEntityExtended> = {}): MJAIAgentRunEntityExtended {
    return {
        ID: 'run-id-1',
        Steps: [],
        TotalPromptIterations: 1,
        TotalTokensUsed: 0,
        TotalCost: 0,
        StartedAt: new Date(),
        ...overrides,
    } as MJAIAgentRunEntityExtended;
}

describe('Root-Tree Cumulative Budget Guards (AgentTreeBudget)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRunAgent.mockResolvedValue({
            success: true,
            agentRun: { ID: 'child-run-id', Steps: [] },
            payload: {},
        });
    });

    it('enforces maxTreeSteps across parent + sub-agent when neither agent exceeds its own MaxIterationsPerRun', async () => {
        const parentAgent = new TestableTreeBudgetAgent();
        const childAgent = new TestableTreeBudgetAgent();

        // Both parent and child allow up to 5 steps individually, but the tree ceiling is 4 total steps.
        const parentParams: ExecuteAgentParams = {
            agent: createAgentStub({ ID: 'parent-id', Name: 'ParentAgent', MaxIterationsPerRun: 5 }),
            conversationMessages: [],
            maxTreeSteps: 4,
        };

        // Parent executes 2 steps (2 < 5 individual limit, 2 < 4 tree limit)
        parentAgent.simulateStepCreation(parentParams);
        parentAgent.simulateStepCreation(parentParams);

        const parentRun = createRunStub({ TotalPromptIterations: 2 });
        const midParentCheck = await parentAgent.invokeHasExceededGuardrails(parentParams, parentRun);
        expect(midParentCheck.exceeded).toBe(false);
        expect(parentParams.treeBudget?.totalSteps).toBe(2);

        // When parent invokes sub-agent via ExecuteSubAgent, child receives the same treeBudget object
        mockRunAgent.mockImplementationOnce(async (childParams: ExecuteAgentParams) => {
            // Child executes 2 steps (2 < 5 child individual limit, but 2 + 2 = 4 >= 4 tree limit!)
            childAgent.simulateStepCreation(childParams);
            childAgent.simulateStepCreation(childParams);

            const childRun = createRunStub({ ID: 'child-run', TotalPromptIterations: 2 });
            const childGuardrail = await childAgent.invokeHasExceededGuardrails(childParams, childRun);
            expect(childGuardrail.exceeded).toBe(true);
            expect(childGuardrail.type).toBe('iterations');
            expect(childGuardrail.current).toBe(4);
            expect(childGuardrail.limit).toBe(4);
            expect(childGuardrail.reason).toContain('Agent tree step budget exceeded (4/4 total steps across tree)');

            return {
                success: false,
                agentRun: childRun,
                payload: {},
            };
        });

        const nextStepAfterSubAgent = await parentAgent.invokeExecuteNextStep(
            parentParams,
            {} as AgentConfiguration,
            {
                step: 'Sub-Agent',
                terminate: false,
                subAgent: { name: 'ChildAgent', message: 'Delegate work', terminateAfter: false },
                previousPayload: {},
                newPayload: {},
            },
            2
        );

        // Parent immediately halts with Failed and the breached tree budget reason
        expect(nextStepAfterSubAgent.step).toBe('Failed');
        expect(nextStepAfterSubAgent.terminate).toBe(true);
        expect(nextStepAfterSubAgent.errorMessage).toContain(
            'Agent tree step budget exceeded (4/4 total steps across tree)'
        );
        expect(parentParams.treeBudget?.breachedReason).toContain(
            'Agent tree step budget exceeded (4/4 total steps across tree)'
        );
    });

    it('enforces maxTreeTokens cumulatively across parent and sub-agent prompt runs', async () => {
        const parentAgent = new TestableTreeBudgetAgent();
        const childAgent = new TestableTreeBudgetAgent();

        const parentParams: ExecuteAgentParams = {
            agent: createAgentStub({ MaxTokensPerRun: 10000 }),
            conversationMessages: [],
            maxTreeTokens: 5000,
        };

        // Parent uses 3,000 tokens (under its 10,000 per-run limit and under 5,000 tree limit)
        parentAgent.simulatePromptUsage(parentParams, 3000, 0.01);
        expect(parentAgent.invokeCheckTreeBudgetLimit(parentParams).exceeded).toBe(false);

        // Child shares the treeBudget and uses 2,500 tokens (total = 5,500 >= 5,000 tree limit)
        const childParams: ExecuteAgentParams = {
            agent: createAgentStub({ ID: 'child-id', Name: 'ChildAgent', MaxTokensPerRun: 10000 }),
            conversationMessages: [],
            treeBudget: parentParams.treeBudget,
        };
        childAgent.simulatePromptUsage(childParams, 2500, 0.01);

        const childRun = createRunStub({ TotalTokensUsed: 2500 });
        const verdict = await childAgent.invokeHasExceededGuardrails(childParams, childRun);

        expect(verdict.exceeded).toBe(true);
        expect(verdict.type).toBe('tokens');
        expect(verdict.current).toBe(5500);
        expect(verdict.limit).toBe(5000);
        expect(verdict.reason).toBe('Agent tree token budget exceeded (5500/5000 total tokens across tree)');
        expect(parentParams.treeBudget?.breachedReason).toBe(verdict.reason);
    });

    it('enforces maxTreeCost cumulatively across parent and sub-agent prompt runs', async () => {
        const parentAgent = new TestableTreeBudgetAgent();
        const childAgent = new TestableTreeBudgetAgent();

        const parentParams: ExecuteAgentParams = {
            agent: createAgentStub({ MaxCostPerRun: 1.0 }),
            conversationMessages: [],
            maxTreeCost: 0.05,
        };

        // Parent spends $0.0300 (under $1.00 per-run limit and under $0.0500 tree limit)
        parentAgent.simulatePromptUsage(parentParams, 500, 0.03);
        expect(parentAgent.invokeCheckTreeBudgetLimit(parentParams).exceeded).toBe(false);

        // Child spends $0.0250 (total = $0.0550 >= $0.0500 tree limit)
        const childParams: ExecuteAgentParams = {
            agent: createAgentStub({ ID: 'child-id', Name: 'ChildAgent', MaxCostPerRun: 1.0 }),
            conversationMessages: [],
            treeBudget: parentParams.treeBudget,
        };
        childAgent.simulatePromptUsage(childParams, 400, 0.025);

        const childRun = createRunStub({ TotalCost: 0.025 });
        const verdict = await childAgent.invokeHasExceededGuardrails(childParams, childRun);

        expect(verdict.exceeded).toBe(true);
        expect(verdict.type).toBe('cost');
        expect(verdict.current).toBeCloseTo(0.055, 5);
        expect(verdict.limit).toBe(0.05);
        expect(verdict.reason).toBe('Agent tree cost budget exceeded ($0.0550/$0.0500 across tree)');
        expect(parentParams.treeBudget?.breachedReason).toBe(verdict.reason);
    });

    it('enforces maxTreeDurationMs against elapsed wall-clock time since root start', async () => {
        const agent = new TestableTreeBudgetAgent();
        const sharedBudget: AgentTreeBudget = {
            maxTreeDurationMs: 1000,
            totalSteps: 1,
            totalTokens: 100,
            totalCost: 0.001,
            startedAtMs: Date.now() - 1500, // 1,500ms elapsed > 1,000ms limit
        };

        const params: ExecuteAgentParams = {
            agent: createAgentStub({ MaxTimePerRun: 3600 }),
            conversationMessages: [],
            treeBudget: sharedBudget,
        };

        const verdict = await agent.invokeHasExceededGuardrails(params, createRunStub());
        expect(verdict.exceeded).toBe(true);
        expect(verdict.type).toBe('time');
        expect(verdict.limit).toBe(1000);
        expect(verdict.current).toBeGreaterThanOrEqual(1500);
        expect(verdict.reason).toMatch(/Agent tree duration budget exceeded \(\d+ms\/1000ms across tree\)/);
        expect(sharedBudget.breachedReason).toBe(verdict.reason);

        // Subsequent step execution via executeNextStep immediately halts with Failed
        const nextStep = await agent.invokeExecuteNextStep(
            params,
            {} as AgentConfiguration,
            {
                step: 'Retry',
                terminate: false,
                previousPayload: { ok: true },
                newPayload: { ok: true },
            },
            1
        );
        expect(nextStep.step).toBe('Failed');
        expect(nextStep.terminate).toBe(true);
        expect(nextStep.errorMessage).toBe(verdict.reason);
    });

    it('propagates the exact same AgentTreeBudget object reference (===) to sequential and parallel child ExecuteSubAgent calls', async () => {
        const parentAgent = new TestableTreeBudgetAgent();
        const parentParams: ExecuteAgentParams = {
            agent: createAgentStub({ ID: 'parent-id', Name: 'ParentAgent' }),
            conversationMessages: [],
            maxTreeSteps: 12,
            maxTreeTokens: 25000,
            maxTreeCost: 0.75,
            maxTreeDurationMs: 60000,
        };

        const rootBudget = parentAgent.invokeEnsureTreeBudget(parentParams);
        parentAgent.simulateStepCreation(parentParams);

        const subAgentA = createAgentStub({ ID: 'sub-a', Name: 'SubAgentA' });
        const subAgentB = createAgentStub({ ID: 'sub-b', Name: 'SubAgentB' });
        const stepA = { ID: 'step-a', TargetLogID: null } as MJAIAgentRunStepEntityExtended;
        const stepB = { ID: 'step-b', TargetLogID: null } as MJAIAgentRunStepEntityExtended;

        // Dispatch two parallel sub-agents concurrently
        await Promise.all([
            parentAgent.invokeExecuteSubAgent(
                parentParams,
                { name: 'SubAgentA', message: 'Parallel task A', terminateAfter: false },
                subAgentA,
                stepA
            ),
            parentAgent.invokeExecuteSubAgent(
                parentParams,
                { name: 'SubAgentB', message: 'Parallel task B', terminateAfter: false },
                subAgentB,
                stepB
            ),
        ]);

        expect(mockRunAgent).toHaveBeenCalledTimes(2);
        const childParamsA = mockRunAgent.mock.calls[0][0] as ExecuteAgentParams;
        const childParamsB = mockRunAgent.mock.calls[1][0] as ExecuteAgentParams;

        // Both parallel children receive the exact same object reference as the root budget
        expect(childParamsA.treeBudget).toBe(rootBudget);
        expect(childParamsB.treeBudget).toBe(rootBudget);
        expect(childParamsA.treeBudget?.maxTreeSteps).toBe(12);
        expect(childParamsA.treeBudget?.maxTreeTokens).toBe(25000);
        expect(childParamsA.treeBudget?.maxTreeCost).toBe(0.75);
        expect(childParamsA.treeBudget?.maxTreeDurationMs).toBe(60000);
        expect(childParamsA.treeBudget?.totalSteps).toBe(1);
    });

    it('records token and cost usage from MJAIPromptRunEntity rollup columns when present', () => {
        const agent = new TestableTreeBudgetAgent();
        const params: ExecuteAgentParams = {
            agent: createAgentStub(),
            conversationMessages: [],
            maxTreeTokens: 1000,
            maxTreeCost: 0.5,
        };

        const promptRunStub = {
            ID: 'prompt-run-1',
            TokensUsedRollup: 750,
            TotalCost: 0.125,
        } as MJAIPromptRunEntity;

        const recordFn = agent as unknown as {
            recordPromptUsageInTreeBudget: (
                promptRun: MJAIPromptRunEntity,
                promptResult: undefined,
                params: ExecuteAgentParams
            ) => void;
        };
        recordFn.recordPromptUsageInTreeBudget(promptRunStub, undefined, params);

        expect(params.treeBudget?.totalTokens).toBe(750);
        expect(params.treeBudget?.totalCost).toBeCloseTo(0.125, 5);
    });
});
