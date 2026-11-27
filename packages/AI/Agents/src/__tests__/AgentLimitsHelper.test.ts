import { describe, expect, it, vi } from 'vitest';
import type {
    BaseAgentNextStep,
    ExecuteAgentParams,
    MJAIAgentRunEntityExtended,
    MJAIAgentRunStepEntityExtended,
} from '@memberjunction/ai-core-plus';
import { AgentLimitsHelper } from '../helpers/limits/AgentLimitsHelper';
import { BaseAgentLimitsHelper } from '../helpers/limits/BaseAgentLimitsHelper';
import { ResolveAgentHelper } from '../helpers/AgentHelperResolver';
import { CreateMockAgentRunContext } from './helpers/mock-agent-run-context';

describe('AgentLimitsHelper (Slice s7 — code-only seam)', () => {
    it('resolves default AgentLimitsHelper via ClassFactory', () => {
        const helper = ResolveAgentHelper({
            SeamKey: 'limits',
            BaseClass: BaseAgentLimitsHelper,
            DefaultClass: AgentLimitsHelper,
        });
        expect(helper).toBeInstanceOf(AgentLimitsHelper);
    });

    it('rejects metadata DriverClass overrides because limits is strictly a code-only seam (D3)', () => {
        expect(() =>
            ResolveAgentHelper({
                SeamKey: 'limits',
                BaseClass: BaseAgentLimitsHelper,
                DefaultClass: AgentLimitsHelper,
                DriverClass: 'UntrustedCustomLimitsHelper',
            })
        ).toThrow(/code-only/);
    });

    it('tracks per-item execution counts via BudgetTracker and exposes action/sub-agent counts', async () => {
        const helper = new AgentLimitsHelper();
        const ctx = CreateMockAgentRunContext({
            Hooks: {
                GetExecutionCount: (id) => helper.GetExecutionCount(ctx, id),
            },
        });

        expect(helper.GetExecutionCount(ctx, 'act-1')).toBe(0);
        helper.IncrementExecutionCount(ctx, 'act-1');
        helper.IncrementExecutionCount(ctx, 'act-1');
        expect(helper.GetExecutionCount(ctx, 'act-1')).toBe(2);
        expect(await helper.GetActionExecutionCount(ctx, 'run-1', 'act-1')).toBe(2);
    });

    it('converts next step to Failed when HasExceededAgentRunGuardrails reports a token breach', async () => {
        const helper = new AgentLimitsHelper();
        const queueSpy = vi.fn();
        const ctx = CreateMockAgentRunContext({
            Hooks: {
                HasExceededAgentRunGuardrails: vi.fn(async () => ({
                    exceeded: true,
                    type: 'tokens' as const,
                    limit: 1000,
                    current: 1500,
                    reason: 'Token limit 1000 exceeded (1500)',
                })),
                QueueStepSave: queueSpy,
            },
        });
        const params: ExecuteAgentParams = {
            agent: ctx.CurrentAgent!,
            conversationMessages: [],
            contextUser: ctx.CurrentContextUser!,
        };
        const step: BaseAgentNextStep = {
            step: 'Actions',
            actions: [{ name: 'Search', params: {} }],
            terminate: false,
            previousPayload: {},
            newPayload: {},
        };
        const runStep = { ID: 'step-1', OutputData: '{}' } as MJAIAgentRunStepEntityExtended;

        const out = await helper.CheckExecutionGuardrails(
            ctx,
            params,
            step,
            {},
            {} as MJAIAgentRunEntityExtended,
            runStep
        );
        expect(out.step).toBe('Failed');
        expect(out.terminate).toBe(true);
        expect(out.errorMessage).toContain('Token limit 1000 exceeded');
        expect(queueSpy).toHaveBeenCalledTimes(1);
        expect(JSON.parse(runStep.OutputData!).guardrailExceeded.type).toBe('tokens');
    });

    it('aggregates prior non-step and fast-judge cost/tokens into CalculateTokenStats', () => {
        const helper = new AgentLimitsHelper();
        const ctx = CreateMockAgentRunContext({
            PriorNonStepCostUsd: 0.25,
            PriorNonStepTokensUsed: 500,
            FastJudgeCostUsd: 0.05,
            FastJudgeTokensUsed: 100,
        });

        const stats = helper.CalculateTokenStats(ctx);
        expect(stats.TotalCost).toBeCloseTo(0.3, 6);
        expect(stats.TotalTokens).toBe(600);
    });
});
