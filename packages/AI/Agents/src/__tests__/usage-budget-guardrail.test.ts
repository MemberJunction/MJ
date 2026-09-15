import { describe, it, expect, vi } from 'vitest';
import { BaseAgent } from '../base-agent';
import type { MJUsageBudgetEntity, MJAIAgentEntity } from '@memberjunction/core-entities';
import type {
    ExecuteAgentParams,
    AgentRunGuardrailVerdict,
    BaseAgentNextStep,
    MJAIAgentRunEntityExtended,
    MJAIAgentRunStepEntityExtended
} from '@memberjunction/ai-core-plus';

class TestableBaseAgent extends BaseAgent {
    public setAgentRun(run: MJAIAgentRunEntityExtended): void {
        this._agentRun = run;
    }

    public checkGuardrails(
        params: ExecuteAgentParams,
        agentRun: MJAIAgentRunEntityExtended
    ): Promise<AgentRunGuardrailVerdict> {
        return this.hasExceededAgentRunGuardrails(params, agentRun);
    }

    public checkStepGuardrails<P>(
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        currentPayload: P,
        agentRun: MJAIAgentRunEntityExtended,
        currentStep: MJAIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>> {
        return this.checkExecutionGuardrails(params, nextStep, currentPayload, agentRun, currentStep);
    }
}

function createMockBudget(overrides: Partial<MJUsageBudgetEntity> = {}): MJUsageBudgetEntity {
    return {
        ID: 'BUDGET-001',
        Name: 'Monthly AI Spend',
        Status: 'Active',
        Action: 'Block',
        AmountLimit: 500,
        LastObservedAmount: 520,
        Unit: 'USD',
        ...overrides,
    } as unknown as MJUsageBudgetEntity;
}

function createMockRun(overrides: Partial<MJAIAgentRunEntityExtended> = {}): MJAIAgentRunEntityExtended {
    return {
        Steps: [],
        TotalCost: 0,
        TotalTokensUsed: 0,
        TotalPromptIterations: 1,
        StartedAt: new Date(),
        ...overrides,
    } as unknown as MJAIAgentRunEntityExtended;
}

function createMockParams(overrides: Partial<ExecuteAgentParams> = {}): ExecuteAgentParams {
    return {
        agent: {
            ID: 'AGENT-001',
            Name: 'Test Agent',
        } as unknown as MJAIAgentEntity,
        conversationMessages: [],
        ...overrides,
    };
}

describe('BaseAgent guardrails — UsageBudget block check', () => {
    describe('hasExceededAgentRunGuardrails', () => {
        it('blocks execution when an active budget with Action=Block exceeds its AmountLimit', async () => {
            const agent = new TestableBaseAgent();
            const run = createMockRun();
            agent.setAgentRun(run);

            const budget = createMockBudget({
                ID: 'BUDGET-001',
                Name: 'Monthly AI Spend',
                Status: 'Active',
                Action: 'Block',
                AmountLimit: 500,
                LastObservedAmount: 520,
                Unit: 'USD',
            });

            const params = createMockParams({ usageBudget: budget });
            const verdict = await agent.checkGuardrails(params, run);

            expect(verdict.exceeded).toBe(true);
            expect(verdict.type).toBe('budget');
            expect(verdict.limit).toBe(500);
            expect(verdict.current).toBe(520);
            expect(verdict.reason).toContain('Monthly AI Spend');
            expect(verdict.reason).toContain('Execution blocked');
        });

        it('blocks execution when observed amount is exactly equal to AmountLimit', async () => {
            const agent = new TestableBaseAgent();
            const run = createMockRun();
            agent.setAgentRun(run);

            const budget = createMockBudget({
                ID: 'BUDGET-EXACT',
                Name: 'Exact Limit Budget',
                Status: 'Active',
                Action: 'Block',
                AmountLimit: 100,
                LastObservedAmount: 100,
                Unit: 'USD',
            });

            const params = createMockParams({ usageBudget: budget });
            const verdict = await agent.checkGuardrails(params, run);

            expect(verdict.exceeded).toBe(true);
            expect(verdict.type).toBe('budget');
            expect(verdict.limit).toBe(100);
            expect(verdict.current).toBe(100);
        });

        it('allows execution when observed spend is under the AmountLimit', async () => {
            const agent = new TestableBaseAgent();
            const run = createMockRun();
            agent.setAgentRun(run);

            const budget = createMockBudget({
                ID: 'BUDGET-002',
                Name: 'Monthly AI Spend',
                Status: 'Active',
                Action: 'Block',
                AmountLimit: 500,
                LastObservedAmount: 350,
                Unit: 'USD',
            });

            const params = createMockParams({ usageBudget: budget });
            const verdict = await agent.checkGuardrails(params, run);

            expect(verdict.exceeded).toBe(false);
        });

        it('does not block when Action is Notify even if observed spend exceeds limit', async () => {
            const agent = new TestableBaseAgent();
            const run = createMockRun();
            agent.setAgentRun(run);

            const budget = createMockBudget({
                ID: 'BUDGET-NOTIFY',
                Name: 'Notify-Only Budget',
                Status: 'Active',
                Action: 'Notify',
                AmountLimit: 500,
                LastObservedAmount: 750,
                Unit: 'USD',
            });

            const params = createMockParams({ usageBudget: budget });
            const verdict = await agent.checkGuardrails(params, run);

            expect(verdict.exceeded).toBe(false);
        });

        it('does not block when Action is Throttle (throttle is notify + hook, not hard blocker)', async () => {
            const agent = new TestableBaseAgent();
            const run = createMockRun();
            agent.setAgentRun(run);

            const budget = createMockBudget({
                ID: 'BUDGET-THROTTLE',
                Name: 'Throttled Budget',
                Status: 'Active',
                Action: 'Throttle',
                AmountLimit: 500,
                LastObservedAmount: 600,
                Unit: 'USD',
            });

            const params = createMockParams({ usageBudget: budget });
            const verdict = await agent.checkGuardrails(params, run);

            expect(verdict.exceeded).toBe(false);
        });

        it('does not block when the budget is Disabled', async () => {
            const agent = new TestableBaseAgent();
            const run = createMockRun();
            agent.setAgentRun(run);

            const budget = createMockBudget({
                ID: 'BUDGET-DISABLED',
                Name: 'Disabled Budget',
                Status: 'Disabled',
                Action: 'Block',
                AmountLimit: 500,
                LastObservedAmount: 900,
                Unit: 'USD',
            });

            const params = createMockParams({ usageBudget: budget });
            const verdict = await agent.checkGuardrails(params, run);

            expect(verdict.exceeded).toBe(false);
        });

        it('does not block when usageBudget is undefined', async () => {
            const agent = new TestableBaseAgent();
            const run = createMockRun();
            agent.setAgentRun(run);

            const params = createMockParams({ usageBudget: undefined });
            const verdict = await agent.checkGuardrails(params, run);

            expect(verdict.exceeded).toBe(false);
        });
    });

    describe('checkExecutionGuardrails (step-level stopping)', () => {
        it('halts the step and sets Failed status when a Block budget is exceeded', async () => {
            const agent = new TestableBaseAgent();
            const run = createMockRun();
            agent.setAgentRun(run);

            const budget = createMockBudget({
                ID: 'BUDGET-STOP',
                Name: 'Hard Stop Budget',
                Status: 'Active',
                Action: 'Block',
                AmountLimit: 100,
                LastObservedAmount: 150,
                Unit: 'USD',
            });

            const params = createMockParams({ usageBudget: budget });
            const initialStep: BaseAgentNextStep = {
                step: 'Prompt',
                terminate: false,
                message: 'Executing prompt step',
            };

            const mockCurrentStep = {
                ID: 'STEP-001',
                OutputData: null,
                Save: vi.fn().mockResolvedValue(true),
            } as unknown as MJAIAgentRunStepEntityExtended;

            const nextStep = await agent.checkStepGuardrails(
                params,
                initialStep,
                {},
                run,
                mockCurrentStep
            );

            expect(nextStep.step).toBe('Failed');
            expect(nextStep.terminate).toBe(true);
            expect(nextStep.errorMessage).toContain('Hard Stop Budget');
            expect(nextStep.errorMessage).toContain('Execution blocked');
            expect(mockCurrentStep.Save).toHaveBeenCalled();

            const savedOutput = JSON.parse(mockCurrentStep.OutputData as string);
            expect(savedOutput.guardrailExceeded).toBeDefined();
            expect(savedOutput.guardrailExceeded.type).toBe('budget');
            expect(savedOutput.guardrailExceeded.limit).toBe(100);
            expect(savedOutput.guardrailExceeded.current).toBe(150);
        });

        it('allows normal step continuation when budget is within limits', async () => {
            const agent = new TestableBaseAgent();
            const run = createMockRun();
            agent.setAgentRun(run);

            const budget = createMockBudget({
                ID: 'BUDGET-OK',
                Name: 'Under Limit Budget',
                Status: 'Active',
                Action: 'Block',
                AmountLimit: 500,
                LastObservedAmount: 100,
                Unit: 'USD',
            });

            const params = createMockParams({ usageBudget: budget });
            const initialStep: BaseAgentNextStep = {
                step: 'Prompt',
                terminate: false,
                message: 'Proceeding normally',
            };

            const mockCurrentStep = {
                ID: 'STEP-002',
                OutputData: null,
                Save: vi.fn().mockResolvedValue(true),
            } as unknown as MJAIAgentRunStepEntityExtended;

            const nextStep = await agent.checkStepGuardrails(
                params,
                initialStep,
                {},
                run,
                mockCurrentStep
            );

            expect(nextStep.step).toBe('Prompt');
            expect(nextStep.terminate).toBe(false);
            expect(nextStep.message).toBe('Proceeding normally');
            expect(mockCurrentStep.Save).not.toHaveBeenCalled();
        });
    });
});
