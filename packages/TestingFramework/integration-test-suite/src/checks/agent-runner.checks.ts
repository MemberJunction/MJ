/**
 * agent-runner.checks.ts — the 'agent-runner' bundle (AR1): live-model integration check for the AI
 * Agent framework. Graduated verbatim from integration-test-scripts/agent-runner-tests.ts so the driver
 * and the standalone script run one definition.
 *
 * LIVE-MODEL tier (real agent runs cost tokens + need model credentials) — gated by RUN_AGENT_TESTS at
 * the dispatcher. Runs REAL agents (Sage, Query Builder, Demo Flow Agent, Demo Loop Agent ×3 prompts,
 * Research Agent ×3 prompts) end to end through AgentRunner against the live database + real model
 * providers, then DEEP-VERIFIES the persisted output (Disabled/non-Active agents are skipped cleanly,
 * not failed): AI Agent Runs (terminal Status + CompletedAt), every AI Agent Run Step (terminal +
 * CompletedAt, never stuck at 'Running'), each Prompt step's AI Prompt Run, each Actions/Tool step's
 * Action Execution Log, and each Sub-Agent step's child run (recursively) via verifyAgentRun.
 *
 * The source built a DYNAMIC set of suite.Test calls in a loop over AGENTS (filtered by AGENT_FILTER);
 * this collapses to ONE NamedCheck whose body runs that loop internally. The bundle lifecycle just
 * configures AIEngine (no shared fixture object) — Setup does AIEngine.Instance.Config, Teardown is a
 * no-op. Inside the check body a filter that matches nothing just returns (pass) — never process.exit.
 */
import { AIEngine } from '@memberjunction/aiengine';
import { AgentRunner } from '@memberjunction/ai-agents';
import { Assert, settle } from '../test-runner';
import { verifyAgentRun } from '../ai-verify';
import { IntegrationCheckRegistry } from '../check-registry';
import { NamedCheck, IntegrationCheckContext } from '../check';

const SETTLE_MS = Number(process.env.AGENT_SETTLE_MS ?? 3000);

interface AgentSpec {
    Name: string;
    Message: string;
    /** Optional distinct label when the same agent is exercised with several prompts. */
    Label?: string;
    /**
     * Whether to assert overall run success. Default true. Set false for agents whose outcome depends
     * on external services (e.g. a Flow agent whose action steps call third-party APIs that may not be
     * keyed in this env) — we still verify the engine EXECUTED the graph and persisted run/steps/logs.
     */
    ExpectSuccess?: boolean;
}

// One basic run per named agent, plus heavier exercise of Demo Loop Agent and Research Agent across
// several different prompts so the run/step/persistence machinery is hit on varied paths.
const AGENTS: AgentSpec[] = [
    { Name: 'Sage', Message: process.env.SAGE_MESSAGE ?? 'What is 2 + 2? Reply with just the number.' },
    { Name: 'Query Builder', Message: process.env.QUERY_BUILDER_MESSAGE ?? 'How many users are in the system?' },
    // Flow agent (deterministic graph traversal, no LLM prompts). Its action steps hit external APIs
    // that may not be keyed here, so we assert the flow EXECUTED + persisted, not external success.
    { Name: 'Demo Flow Agent', Message: process.env.DEMO_FLOW_MESSAGE ?? 'Run your demo flow and finish.', ExpectSuccess: false },

    { Name: 'Demo Loop Agent', Message: process.env.DEMO_LOOP_MESSAGE ?? 'Say hello, then finish.', Label: 'Demo Loop Agent — greet' },
    { Name: 'Demo Loop Agent', Message: 'List three primary colors, then stop.', Label: 'Demo Loop Agent — list colors' },
    { Name: 'Demo Loop Agent', Message: 'Count from 1 to 3, then finish.', Label: 'Demo Loop Agent — count' },

    { Name: 'Research Agent', Message: process.env.RESEARCH_MESSAGE ?? 'Briefly, in one sentence, what is MemberJunction?', Label: 'Research Agent — what is MJ' },
    { Name: 'Research Agent', Message: 'In one sentence, what is an AI agent?', Label: 'Research Agent — define agent' },
    { Name: 'Research Agent', Message: 'List two benefits of a metadata-driven platform.', Label: 'Research Agent — benefits' },
];

export const AgentRunnerChecks: NamedCheck[] = [
    {
        Id: 'agent-runner.AR1',
        Name: 'AR1: each configured agent runs and persists a correct run + steps + prompt runs + action logs',
        RequiresLiveModel: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            // Optional: AGENT_FILTER restricts the run to specs whose name/label contains the (case-insensitive) value.
            const filter = (process.env.AGENT_FILTER ?? '').trim().toLowerCase();
            const selected = filter
                ? AGENTS.filter((s) => `${s.Label ?? ''} ${s.Name}`.toLowerCase().includes(filter))
                : AGENTS;
            if (selected.length === 0) {
                console.log(`      → no agent spec matched AGENT_FILTER='${filter}' — nothing to run (pass).`);
                return;
            }

            for (const spec of selected) {
                const agent = AIEngine.Instance.Agents.find((a) => a.Name?.toLowerCase() === spec.Name.toLowerCase());
                Assert(!!agent, `Agent '${spec.Name}' not found in metadata (AIEngine.Instance.Agents)`);

                // A Disabled agent can't be run — skip cleanly (informative, not a failure) rather than error.
                if (agent!.Status !== 'Active') {
                    console.log(`      → SKIPPED: '${spec.Name}' is ${agent!.Status} (not runnable)`);
                    continue;
                }

                const runner = new AgentRunner();
                const result = await runner.RunAgent({
                    agent: agent!,
                    conversationMessages: [{ role: 'user', content: spec.Message }],
                    contextUser: ctx.User,
                });
                Assert(result.agentRun?.ID != null, `'${spec.Name}': AgentRunner returned no agentRun (no AI Agent Run created)`);

                // Step / prompt / action persistence is fire-and-forget — let the queues land before reading.
                await settle(SETTLE_MS);

                const expectSuccess = spec.ExpectSuccess ?? true;
                const v = await verifyAgentRun(result.agentRun!.ID, ctx.User, expectSuccess);
                if (expectSuccess) {
                    Assert(result.success, `'${spec.Name}': run did not succeed (${result.agentRun?.ErrorMessage ?? 'no error message'})`);
                } else {
                    // Engine-path check: the flow must have actually traversed its graph and persisted steps.
                    Assert(v.stepCount > 0, `'${spec.Name}': flow produced no steps — the engine did not execute the graph`);
                }

                const successNote = expectSuccess ? '' : ` (success=${result.success}; external-action outcome not asserted)`;
                console.log(`      → run ${result.agentRun!.ID}: ${v.stepCount} steps · ${v.promptRunsVerified} prompt runs · ${v.actionLogsVerified} action logs · ${v.subAgentRunsVerified} sub-agent runs verified${successNote}`);
            }
        }
    }
];

for (const check of AgentRunnerChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('agent-runner', {
    Setup: async (ctx: IntegrationCheckContext) => {
        await AIEngine.Instance.Config(false, ctx.User);
    },
    Teardown: async () => {
        // No shared fixture to clean up — the AI Agent Runs the checks create are their own output.
    }
});
