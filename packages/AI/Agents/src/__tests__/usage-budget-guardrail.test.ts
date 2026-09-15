import { describe, it, expect } from 'vitest';
import { BaseAgent } from '../base-agent';

type GuardrailVerdict = {
    exceeded: boolean;
    type?: 'cost' | 'tokens' | 'iterations' | 'time' | 'budget';
    limit?: number;
    current?: number;
    reason?: string;
};

type RunStub = {
    Steps: unknown[];
    TotalCost?: number | null;
    TotalTokensUsed?: number | null;
    TotalPromptIterations?: number | null;
    StartedAt?: Date;
};

function createAgent(run: RunStub): BaseAgent {
    const agent = new BaseAgent();
    (agent as unknown as { _agentRun: RunStub })._agentRun = run;
    return agent;
}

function checkGuardrails(
    agent: BaseAgent,
    params: { agent: unknown; usageBudget?: unknown; budget?: unknown },
    run: RunStub
): Promise<GuardrailVerdict> {
    const invoke = agent as unknown as {
        hasExceededAgentRunGuardrails(params: unknown, agentRun: RunStub): Promise<GuardrailVerdict>;
    };
    return invoke.hasExceededAgentRunGuardrails(params, run);
}

describe('BaseAgent guardrails — UsageBudget block check', () => {
    const baseRun: RunStub = {
        Steps: [],
        TotalCost: 0,
        TotalTokensUsed: 0,
        TotalPromptIterations: 1,
        StartedAt: new Date(),
    };

    it('blocks execution when an active budget with Action=Block exceeds its AmountLimit', async () => {
        const agent = createAgent(baseRun);
        const mockBudget = {
            ID: 'BUDGET-001',
            Name: 'Monthly AI Spend',
            Status: 'Active',
            Action: 'Block',
            AmountLimit: 500,
            LastObservedAmount: 520,
            Unit: 'USD',
        };

        const verdict = await checkGuardrails(agent, { agent: {}, usageBudget: mockBudget }, baseRun);

        expect(verdict.exceeded).toBe(true);
        expect(verdict.type).toBe('budget');
        expect(verdict.limit).toBe(500);
        expect(verdict.current).toBe(520);
        expect(verdict.reason).toContain('Monthly AI Spend');
        expect(verdict.reason).toContain('Execution blocked');
    });

    it('blocks execution when budget is attached directly to the agent entity', async () => {
        const agent = createAgent(baseRun);
        const mockBudget = {
            ID: 'BUDGET-002',
            Name: 'Agent Direct Budget',
            Status: 'Active',
            Action: 'Block',
            AmountLimit: 100,
            LastObservedAmount: 100,
            Unit: 'USD',
        };

        const verdict = await checkGuardrails(agent, { agent: { UsageBudget: mockBudget } }, baseRun);

        expect(verdict.exceeded).toBe(true);
        expect(verdict.type).toBe('budget');
        expect(verdict.limit).toBe(100);
        expect(verdict.current).toBe(100);
    });

    it('allows execution when observed spend is under the AmountLimit', async () => {
        const agent = createAgent(baseRun);
        const mockBudget = {
            ID: 'BUDGET-003',
            Name: 'Monthly AI Spend',
            Status: 'Active',
            Action: 'Block',
            AmountLimit: 500,
            LastObservedAmount: 350,
            Unit: 'USD',
        };

        const verdict = await checkGuardrails(agent, { agent: {}, usageBudget: mockBudget }, baseRun);

        expect(verdict.exceeded).toBe(false);
    });

    it('does not block when Action is Notify even if observed spend exceeds limit', async () => {
        const agent = createAgent(baseRun);
        const mockBudget = {
            ID: 'BUDGET-004',
            Name: 'Notify-Only Budget',
            Status: 'Active',
            Action: 'Notify',
            AmountLimit: 500,
            LastObservedAmount: 750,
            Unit: 'USD',
        };

        const verdict = await checkGuardrails(agent, { agent: {}, usageBudget: mockBudget }, baseRun);

        expect(verdict.exceeded).toBe(false);
    });

    it('does not block when Action is Throttle (throttle is notify + hook, not hard blocker)', async () => {
        const agent = createAgent(baseRun);
        const mockBudget = {
            ID: 'BUDGET-005',
            Name: 'Throttled Budget',
            Status: 'Active',
            Action: 'Throttle',
            AmountLimit: 500,
            LastObservedAmount: 600,
            Unit: 'USD',
        };

        const verdict = await checkGuardrails(agent, { agent: {}, usageBudget: mockBudget }, baseRun);

        expect(verdict.exceeded).toBe(false);
    });

    it('does not block when the budget is Disabled', async () => {
        const agent = createAgent(baseRun);
        const mockBudget = {
            ID: 'BUDGET-006',
            Name: 'Disabled Budget',
            Status: 'Disabled',
            Action: 'Block',
            AmountLimit: 500,
            LastObservedAmount: 900,
            Unit: 'USD',
        };

        const verdict = await checkGuardrails(agent, { agent: {}, usageBudget: mockBudget }, baseRun);

        expect(verdict.exceeded).toBe(false);
    });
});
