/**
 * Unit tests for MJ-9 (Whole-Workflow USD Cost & Wall-Clock Duration Caps) and
 * MJ-10 (Zero Silent Decision-Read Row-Cap Enforcement) in `@memberjunction/ai-agents`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    CODE_FALLBACK_LIMITS,
    type IMetadataProvider,
    type MJLimitsBudgetsConfig,
    type RunViewParams,
    type RunViewResult,
    type UserInfo,
} from '@memberjunction/core';
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
import { BaseAgent } from '../base-agent';
import { BudgetEnforcementGuard, type AgentRunBudgetLedgerRow } from '../BudgetEnforcementGuard';

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
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

class TestableWorkflowBudgetAgent extends BaseAgent {
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

    public simulatePromptUsage(params: ExecuteAgentParams, tokens: number, cost: number): void {
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

    public invokeCheckTreeBudgetLimit(params?: ExecuteAgentParams) {
        return this.checkTreeBudgetLimit(params);
    }

    public async invokeExecuteSubAgent(
        params: ExecuteAgentParams,
        subAgentRequest: AgentSubAgentRequest,
        subAgent: MJAIAgentEntityExtended,
        stepEntity: MJAIAgentRunStepEntityExtended,
    ): Promise<ExecuteAgentResult> {
        return this.ExecuteSubAgent(params, subAgentRequest, subAgent, stepEntity);
    }

    public async invokeExecuteNextStep<P>(
        params: ExecuteAgentParams,
        config: AgentConfiguration,
        previousDecision: BaseAgentNextStep<P> | null,
        stepCount: number = 0,
    ): Promise<BaseAgentNextStep<P>> {
        return this.executeNextStep<P>(params, config, previousDecision, stepCount);
    }

    public async invokeHasExceededAgentRunGuardrails(
        params: ExecuteAgentParams,
        agentRun: MJAIAgentRunEntityExtended,
    ) {
        return this.hasExceededAgentRunGuardrails(params, agentRun);
    }

    protected override async recordFoldedTaskGraph(): Promise<void> {
        // No-op in unit tests
    }

    protected override async processSubAgentStep<P, R>(
        params: ExecuteAgentParams<P>,
        previousDecision: BaseAgentNextStep<P>,
        _agentStep?: undefined,
        _parentStepId?: string,
        stepCount: number = 0,
    ): Promise<BaseAgentNextStep<R>> {
        const subAgentStub = {
            ID: 'child-agent-id',
            Name: previousDecision.subAgent?.name ?? 'ChildAgent',
            Status: 'Active',
            MaxIterationsPerRun: 10,
        } as MJAIAgentEntityExtended;
        const stepStub = {
            ID: 'subagent-step-id',
            TargetLogID: null,
        } as MJAIAgentRunStepEntityExtended;

        const childResult = await this.ExecuteSubAgent(
            params,
            previousDecision.subAgent ?? { name: 'ChildAgent', message: 'Run child', terminateAfter: false },
            subAgentStub,
            stepStub,
            undefined,
            undefined,
            stepCount,
        );

        return {
            step: childResult.success ? 'Retry' : 'Failed',
            terminate: !childResult.success,
            errorMessage: childResult.agentRun?.ErrorMessage ?? undefined,
            previousPayload: previousDecision.previousPayload as R,
            newPayload: previousDecision.newPayload as R,
        };
    }
}

function createAgentStub(overrides: Partial<MJAIAgentEntityExtended> = {}): MJAIAgentEntityExtended {
    return {
        ID: 'wf-agent-1',
        Name: 'WorkflowBudgetTestAgent',
        Status: 'Active',
        MaxIterationsPerRun: 10,
        MaxTokensPerRun: 100000,
        MaxCostPerRun: 10,
        MaxTimePerRun: 3600,
        ...overrides,
    } as MJAIAgentEntityExtended;
}

function createRunStub(overrides: Partial<MJAIAgentRunEntityExtended> = {}): MJAIAgentRunEntityExtended {
    return {
        ID: 'wf-run-1',
        Steps: [],
        TotalPromptIterations: 1,
        TotalTokensUsed: 0,
        TotalCost: 0,
        StartedAt: new Date(),
        ...overrides,
    } as MJAIAgentRunEntityExtended;
}

function createStepStub(): MJAIAgentRunStepEntityExtended {
    return {
        ID: 'wf-step-1',
        OutputData: null,
    } as MJAIAgentRunStepEntityExtended;
}

describe('MJ-9: Whole-Workflow USD Cost & Wall-Clock Duration Caps in AI Agents', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRunAgent.mockResolvedValue({
            success: true,
            agentRun: { ID: 'child-run-1', Steps: [] },
            payload: {},
        });
    });

    it('propagates workflowMaxCostUsd & workflowMaxDurationMs to nested sub-agents and terminates deterministically on USD breach', async () => {
        const rootAgent = new TestableWorkflowBudgetAgent();
        const childAgent = new TestableWorkflowBudgetAgent();

        const rootStartedAtMs = Date.now() - 250;
        const rootParams: ExecuteAgentParams = {
            agent: createAgentStub({ ID: 'root-agent', Name: 'RootCoordinator', MaxCostPerRun: 5.0 }),
            conversationMessages: [],
            workflowMaxCostUsd: 0.15,
            workflowMaxDurationMs: 60_000,
            workflowStartedAtMs: rootStartedAtMs,
        };

        // Step 1 in root spends $0.08 (< $0.15 cap)
        rootAgent.simulatePromptUsage(rootParams, 400, 0.08);
        const budget = rootAgent.invokeEnsureTreeBudget(rootParams);
        expect(budget.workflowMaxCostUsd).toBe(0.15);
        expect(budget.workflowMaxDurationMs).toBe(60_000);
        expect(budget.workflowStartedAtMs).toBe(rootStartedAtMs);
        expect(budget.cumulativeCostUsd).toBeCloseTo(0.08, 6);
        expect(budget.abortController).toBeDefined();
        expect(budget.abortController?.signal.aborted).toBe(false);

        // Nested sub-agent receives shared budget + workflow cap fields and spends $0.09 (cumulative = $0.17 >= $0.15)
        mockRunAgent.mockImplementationOnce(async (childParams: ExecuteAgentParams) => {
            expect(childParams.treeBudget).toBe(budget);
            expect(childParams.workflowMaxCostUsd).toBe(0.15);
            expect(childParams.workflowMaxDurationMs).toBe(60_000);
            expect(childParams.workflowStartedAtMs).toBe(rootStartedAtMs);

            childAgent.simulatePromptUsage(childParams, 500, 0.09);
            const verdict = childAgent.invokeCheckTreeBudgetLimit(childParams);
            expect(verdict.exceeded).toBe(true);
            expect(verdict.type).toBe('cost');
            const breachDiag = childParams.treeBudget?.breachDiagnostic;
            expect(breachDiag?.Code).toBe('WORKFLOW_COST_LIMIT_EXCEEDED');
            expect(breachDiag?.CumulativeCostUsd).toBeCloseTo(0.17, 6);
            expect(breachDiag?.ElapsedWallClockMs).toBeGreaterThanOrEqual(250);

            return {
                success: false,
                agentRun: createRunStub({ ID: 'child-run-breach', ErrorMessage: verdict.reason }),
                payload: {},
                limitExceeded: breachDiag,
            } as ExecuteAgentResult;
        });

        const nextStep = await rootAgent.invokeExecuteNextStep(
            rootParams,
            {} as AgentConfiguration,
            {
                step: 'Sub-Agent',
                terminate: false,
                subAgent: { name: 'WorkerSubAgent', message: 'Run work', terminateAfter: false },
                previousPayload: {},
                newPayload: {},
            },
            1,
        );

        expect(nextStep.step).toBe('Failed');
        expect(nextStep.terminate).toBe(true);
        expect(nextStep.errorMessage).toContain('Workflow USD cost budget exceeded');
        expect(budget.breachDiagnostic?.Code).toBe('WORKFLOW_COST_LIMIT_EXCEEDED');
        expect(budget.abortController?.signal.aborted).toBe(true);

        // Subsequent sub-agent dispatch fails fast WITHOUT invoking runner
        const skippedResult = await rootAgent.invokeExecuteSubAgent(
            rootParams,
            { name: 'SecondSubAgent', message: 'Should be skipped', terminateAfter: false },
            createAgentStub({ ID: 'child-2', Name: 'SecondSubAgent' }),
            createStepStub(),
        );
        expect(skippedResult.success).toBe(false);
        expect(skippedResult.limitExceeded?.Code).toBe('WORKFLOW_COST_LIMIT_EXCEEDED');
        expect(mockRunAgent).toHaveBeenCalledTimes(1);
    });

    it('terminates deterministically even on a Success transition when explicit workflowMaxDurationMs expires', async () => {
        const agent = new TestableWorkflowBudgetAgent();
        const expiredStartMs = Date.now() - 5000;
        const params: ExecuteAgentParams = {
            agent: createAgentStub({ ID: 'timed-agent', Name: 'TimedRootAgent' }),
            conversationMessages: [],
            workflowMaxCostUsd: 5.0,
            workflowMaxDurationMs: 1500,
            workflowStartedAtMs: expiredStartMs,
        };
        agent.simulatePromptUsage(params, 200, 0.02);

        const decision = await agent.invokeHasExceededAgentRunGuardrails(
            params,
            createRunStub({ TotalCost: 0.02 }),
        );

        expect(decision.exceeded).toBe(true);
        expect(decision.type).toBe('time');
        expect(decision.reason).toContain('Workflow wall-clock duration budget exceeded');
        expect(params.treeBudget?.breachDiagnostic?.Code).toBe('WORKFLOW_DURATION_LIMIT_EXCEEDED');
        expect(params.treeBudget?.breachDiagnostic?.Dimension).toBe('WallClockMs');
        expect(params.treeBudget?.breachDiagnostic?.CumulativeCostUsd).toBeCloseTo(0.02, 6);
        expect(params.treeBudget?.breachDiagnostic?.ElapsedWallClockMs).toBeGreaterThanOrEqual(5000);
        expect(params.treeBudget?.abortController?.signal.aborted).toBe(true);
    });

    it('fails fast before Execute runs when shared workflow budget is already breached', async () => {
        const agent = new TestableWorkflowBudgetAgent();
        const params: ExecuteAgentParams = {
            agent: createAgentStub({ ID: 'preflight-agent', Name: 'PreflightAgent' }),
            conversationMessages: [{ role: 'user', content: 'Hello' }],
            workflowMaxDurationMs: 1000,
            workflowStartedAtMs: Date.now() - 4000,
        };

        const result = await agent.Execute(params);
        expect(result.success).toBe(false);
        expect(result.limitExceeded?.Code).toBe('WORKFLOW_DURATION_LIMIT_EXCEEDED');
        expect(result.limitExceeded?.ElapsedWallClockMs).toBeGreaterThanOrEqual(4000);
        expect(result.errorMessage).toContain('Workflow wall-clock duration budget exceeded');
    });
});

describe('MJ-10: Decision-Read Row-Cap Enforcement in AI Agents BudgetEnforcementGuard', () => {
    it('fails closed (LedgerUnavailable=true) when RunViews reports TotalRowCount > Results.length', async () => {
        const truncatedRow: AgentRunBudgetLedgerRow = {
            ID: 'run-truncated-1',
            ParentRunID: null,
            UserID: 'user-1',
            TotalCost: 1.25,
            TotalCostRollup: 1.25,
            StartedAt: new Date(Date.now() - 60_000),
            CompletedAt: new Date(),
            __mj_UpdatedAt: new Date(),
            ScheduledJobRunID: null,
            Status: 'Completed',
            Data: null,
        };

        const truncatedProvider: Partial<IMetadataProvider> & {
            RunViews: (paramsList: RunViewParams[]) => Promise<RunViewResult<AgentRunBudgetLedgerRow>[]>;
        } = {
            RunViews: async (paramsList: RunViewParams[]) =>
                paramsList.map(() => ({
                    Success: true,
                    Results: [truncatedRow],
                    RowCount: 1,
                    TotalRowCount: 42,
                    ExecutionTime: 1,
                    ErrorMessage: '',
                    UserView: {} as RunViewResult<AgentRunBudgetLedgerRow>['UserView'],
                })),
        };

        const guard = new BudgetEnforcementGuard();
        const budgets: MJLimitsBudgetsConfig = {
            ...CODE_FALLBACK_LIMITS.Budgets,
            PerUserPerDay: {
                ...CODE_FALLBACK_LIMITS.Budgets.PerUserPerDay,
                MaxCostUsd: 100,
                MaxWallClockMs: 3_600_000,
            },
        };

        const verdict = await guard.Evaluate({
            Budgets: budgets,
            UserID: 'user-1',
            AgentRunID: 'current-run-1',
            CurrentRunCostUsd: 0.1,
            CurrentRunStartedAtMs: Date.now() - 1000,
            Provider: truncatedProvider as IMetadataProvider,
            ContextUser: { ID: 'user-1' } as UserInfo,
        });

        expect(verdict.LedgerUnavailable).toBe(true);
        expect(verdict.LedgerError).toContain('truncated');
    });
});
