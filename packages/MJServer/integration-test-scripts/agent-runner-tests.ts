/**
 * agent-runner-tests.ts — live integration tests for the AI Agent framework.
 *
 * Runs REAL agents (Sage, Query Builder, Demo Flow Agent, Demo Loop Agent ×3 prompts, Research Agent
 * ×3 prompts) end to end through AgentRunner against the live database + real model providers, then
 * DEEP-VERIFIES the persisted output (Disabled/non-Active agents are skipped cleanly, not failed):
 *   - MJ: AI Agent Runs       — terminal Status, CompletedAt set, Completed on success
 *   - MJ: AI Agent Run Steps  — EVERY step terminal + CompletedAt set (never stuck at 'Running')
 *   - MJ: AI Prompt Runs      — each Prompt step's TargetLogID finalized correctly
 *   - MJ: Action Execution Logs — each Actions/Tool step's TargetLogID finalized (EndedAt + ResultCode)
 *   - child runs              — each Sub-Agent step's TargetLogID recursively verified
 *
 * This exercises the full agent state machine + run persistence, and is the live regression guard for
 * the fire-and-forget save queues (AgentRunStepSaveQueue + AIPromptRunner) the "stuck at Running" race
 * fix relies on.
 *
 * GATED — real agent runs cost tokens + need model credentials:
 *   RUN_AGENT_TESTS=1 npx tsx packages/MJServer/integration-test-scripts/agent-runner-tests.ts
 *
 * Optional per-agent message overrides + settle window:
 *   SAGE_MESSAGE / DEMO_LOOP_MESSAGE / QUERY_BUILDER_MESSAGE   AGENT_SETTLE_MS (default 3000)
 *
 * Exit code: 0 = passed (or skipped), 1 = failures, 2 = bootstrap error.
 */
import { TestRunner, Assert } from './lib/harness';
import { bootstrapAI, verifyAgentRun, settle } from './lib/ai-bootstrap';
import { AIEngine } from '@memberjunction/aiengine';
import { AgentRunner } from '@memberjunction/ai-agents';

const GATED = process.env.RUN_AGENT_TESTS === '1';
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

async function main(): Promise<void> {
    if (!GATED) {
        console.log('agent-runner-tests: SKIPPED — set RUN_AGENT_TESTS=1 to run live agent executions (costs tokens, needs model credentials).');
        process.exit(0);
    }

    const { user } = await bootstrapAI();
    const suite = new TestRunner('Agent live integration (real run + deep persistence: run, steps, prompt runs, action logs)');

    // Optional: AGENT_FILTER restricts the run to specs whose name/label contains the (case-insensitive) value.
    const filter = (process.env.AGENT_FILTER ?? '').trim().toLowerCase();
    const selected = filter
        ? AGENTS.filter((s) => `${s.Label ?? ''} ${s.Name}`.toLowerCase().includes(filter))
        : AGENTS;
    if (selected.length === 0) {
        console.log(`agent-runner-tests: no agent spec matched AGENT_FILTER='${filter}'.`);
        process.exit(0);
    }

    for (const spec of selected) {
        suite.Test(`${spec.Label ?? `'${spec.Name}'`} runs and persists a correct run + steps + prompt runs + action logs`, async () => {
            const agent = AIEngine.Instance.Agents.find((a) => a.Name?.toLowerCase() === spec.Name.toLowerCase());
            Assert(!!agent, `Agent '${spec.Name}' not found in metadata (AIEngine.Instance.Agents)`);

            // A Disabled agent can't be run — skip cleanly (informative, not a failure) rather than error.
            if (agent!.Status !== 'Active') {
                console.log(`      → SKIPPED: '${spec.Name}' is ${agent!.Status} (not runnable)`);
                return;
            }

            const runner = new AgentRunner();
            const result = await runner.RunAgent({
                agent: agent!,
                conversationMessages: [{ role: 'user', content: spec.Message }],
                contextUser: user,
            });
            Assert(result.agentRun?.ID != null, `'${spec.Name}': AgentRunner returned no agentRun (no AI Agent Run created)`);

            // Step / prompt / action persistence is fire-and-forget — let the queues land before reading.
            await settle(SETTLE_MS);

            const expectSuccess = spec.ExpectSuccess ?? true;
            const v = await verifyAgentRun(result.agentRun!.ID, user, expectSuccess);
            if (expectSuccess) {
                Assert(result.success, `'${spec.Name}': run did not succeed (${result.agentRun?.ErrorMessage ?? 'no error message'})`);
            } else {
                // Engine-path check: the flow must have actually traversed its graph and persisted steps.
                Assert(v.stepCount > 0, `'${spec.Name}': flow produced no steps — the engine did not execute the graph`);
            }

            const successNote = expectSuccess ? '' : ` (success=${result.success}; external-action outcome not asserted)`;
            console.log(`      → run ${result.agentRun!.ID}: ${v.stepCount} steps · ${v.promptRunsVerified} prompt runs · ${v.actionLogsVerified} action logs · ${v.subAgentRunsVerified} sub-agent runs verified${successNote}`);
        });
    }

    const failures = await suite.Run();
    process.exit(failures > 0 ? 1 : 0);
}

main().catch((error) => {
    console.error('\nBOOTSTRAP / CONNECTIVITY ERROR:', error instanceof Error ? error.message : error);
    process.exit(2);
});
