/**
 * Regression coverage for mid-run cost/token guardrails.
 *
 * THE BUG: `MaxCostPerRun` and `MaxTokensPerRun` are static limits on the agent, and
 * `hasExceededAgentRunGuardrails` compares them against `AIAgentRun.TotalCost` /
 * `.TotalTokensUsed` — which is the right design. But those totals are DERIVED from the run's
 * steps by `calculateTokenStats()`, and their only writer (`applyTokenStatsToRun`) ran on
 * terminal paths alone: createFailureResult / createCancelledResult / finalizeAgentRun, plus a
 * post-compaction top-up that only fires if compaction happens to trigger.
 *
 * So mid-run both fields sat at 0, and because the checks are guarded on
 * `agent.MaxCostPerRun && agentRun.TotalCost`, a falsy 0 short-circuited them entirely. The cost
 * and token ceilings were evaluated only as a run ENDED — reporting, not guardrails. A runaway
 * agent burned its full budget and was told about it afterwards.
 *
 * The contract under test: given steps whose prompt runs already exceed the agent's limit, the
 * guardrail reports `exceeded` DURING the run, without any terminal path having run first.
 */
import { describe, it, expect } from 'vitest';
import { BaseAgent } from '../base-agent';

type GuardrailVerdict = {
    exceeded: boolean;
    type?: 'cost' | 'tokens' | 'iterations' | 'time';
    limit?: number;
    current?: number;
    reason?: string;
};

type StepStub = {
    StepType: string;
    PromptRun?: {
        TokensUsedRollup?: number;
        TokensPromptRollup?: number;
        TokensCompletionRollup?: number;
        TokensCacheReadRollup?: number;
        TokensCacheWriteRollup?: number;
        TotalCost?: number;
    };
};

type AgentStub = {
    MaxCostPerRun?: number | null;
    MaxTokensPerRun?: number | null;
    MaxIterationsPerRun?: number | null;
    MaxTimePerRun?: number | null;
};

type RunStub = {
    Steps: StepStub[];
    TotalCost?: number | null;
    TotalTokensUsed?: number | null;
    TotalPromptIterations?: number | null;
    StartedAt?: Date;
};

/**
 * Builds an agent whose in-flight run already has the given spend recorded on its steps, exactly
 * as it would mid-loop: the step rows and their prompt runs exist, but no terminal path has run,
 * so the denormalized run totals are still unset.
 */
function agentWithSpend(steps: StepStub[]): { agent: BaseAgent; run: RunStub } {
    const agent = new BaseAgent();
    const run: RunStub = {
        Steps: steps,
        TotalCost: null,
        TotalTokensUsed: null,
        TotalPromptIterations: steps.length,
        StartedAt: new Date(),
    };
    (agent as unknown as { _agentRun: RunStub })._agentRun = run;
    return { agent, run };
}

function checkGuardrails(agent: BaseAgent, agentStub: AgentStub, run: RunStub): Promise<GuardrailVerdict> {
    const invoke = agent as unknown as {
        hasExceededAgentRunGuardrails(params: { agent: AgentStub }, agentRun: RunStub): Promise<GuardrailVerdict>;
    };
    return invoke.hasExceededAgentRunGuardrails({ agent: agentStub }, run);
}

function promptStep(cost: number, tokens: number): StepStub {
    return {
        StepType: 'Prompt',
        PromptRun: {
            TotalCost: cost,
            TokensUsedRollup: tokens,
            TokensPromptRollup: tokens,
            TokensCompletionRollup: 0,
            TokensCacheReadRollup: 0,
            TokensCacheWriteRollup: 0,
        },
    };
}

describe('BaseAgent guardrails — mid-run cost and token totals', () => {
    it('reports the cost ceiling exceeded mid-run, before any terminal path has written totals', async () => {
        // Two prompt steps at $4 each against a $5 ceiling. Pre-fix, TotalCost was null here and
        // the check short-circuited, so this returned exceeded: false and the run continued.
        const { agent, run } = agentWithSpend([promptStep(4, 1000), promptStep(4, 1000)]);
        const verdict = await checkGuardrails(agent, { MaxCostPerRun: 5 }, run);

        expect(verdict.exceeded).toBe(true);
        expect(verdict.type).toBe('cost');
        expect(verdict.current).toBe(8);
        expect(verdict.limit).toBe(5);
    });

    it('reports the token ceiling exceeded mid-run', async () => {
        const { agent, run } = agentWithSpend([promptStep(0.01, 6000), promptStep(0.01, 6000)]);
        const verdict = await checkGuardrails(agent, { MaxTokensPerRun: 10000 }, run);

        expect(verdict.exceeded).toBe(true);
        expect(verdict.type).toBe('tokens');
        expect(verdict.current).toBe(12000);
    });

    it('refreshes the run totals in place so the recorded run reflects spend at the moment of the check', async () => {
        // The refresh is not just for the comparison — it leaves the run entity truthful, which is
        // what the guardrail's own reason string and any observer read.
        const { agent, run } = agentWithSpend([promptStep(2.5, 800)]);
        await checkGuardrails(agent, { MaxCostPerRun: 100 }, run);

        expect(run.TotalCost).toBe(2.5);
        expect(run.TotalTokensUsed).toBe(800);
    });

    it('does not trip when spend is still under the ceiling', async () => {
        const { agent, run } = agentWithSpend([promptStep(1, 100)]);
        const verdict = await checkGuardrails(agent, { MaxCostPerRun: 5, MaxTokensPerRun: 10000 }, run);

        expect(verdict.exceeded).toBe(false);
    });

    it('leaves runs with no limits configured alone', async () => {
        const { agent, run } = agentWithSpend([promptStep(999, 999999)]);
        const verdict = await checkGuardrails(agent, {}, run);

        expect(verdict.exceeded).toBe(false);
    });
});
