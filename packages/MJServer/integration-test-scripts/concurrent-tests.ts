/**
 * concurrent-tests.ts — live integration tests for CONCURRENT prompt/agent persistence.
 *
 * Fires many runs in parallel and proves each persists its OWN correct run — no cross-run corruption.
 * This stresses the per-entity-instance keying of the fire-and-forget BaseEntitySaveQueue: different
 * runs/entities save concurrently, and a slow INSERT in one must never clobber another's finalize.
 *
 * GATED (real model calls):
 *   RUN_AGENT_TESTS=1 npx tsx packages/MJServer/integration-test-scripts/concurrent-tests.ts
 *
 * Optional: CONCURRENCY (default 5) · AGENT_SETTLE_MS (default 3000)
 * Exit code: 0 = passed (or skipped), 1 = failures, 2 = bootstrap error.
 */
import { TestRunner, Assert, AssertEqual } from './lib/harness';
import { bootstrapAI, verifyPromptRun, verifyAgentRun, settle } from './lib/ai-bootstrap';
import { AIEngine } from '@memberjunction/aiengine';
import { AIPromptRunner } from '@memberjunction/ai-prompts';
import { AIPromptParams } from '@memberjunction/ai-core-plus';
import { AgentRunner } from '@memberjunction/ai-agents';

const GATED = process.env.RUN_AGENT_TESTS === '1';
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 5);
const SETTLE_MS = Number(process.env.AGENT_SETTLE_MS ?? 3000);

async function main(): Promise<void> {
    if (!GATED) {
        console.log('concurrent-tests: SKIPPED — set RUN_AGENT_TESTS=1 to run live concurrent executions.');
        process.exit(0);
    }

    const { user } = await bootstrapAI();
    const suite = new TestRunner('Concurrent run persistence (real model — no cross-run corruption)');

    suite.Test(`CC1: ${CONCURRENCY} concurrent prompt runs each persist an independent, correct AI Prompt Run`, async () => {
        const prompt = AIEngine.Instance.Prompts.find((p) => p.Status === 'Active');
        Assert(!!prompt, 'No Active prompt available');

        const ids = await Promise.all(
            Array.from({ length: CONCURRENCY }, async () => {
                const runner = new AIPromptRunner();
                const params = new AIPromptParams();
                params.prompt = prompt!;
                params.contextUser = user;
                params.data = {};
                const res = await runner.ExecutePrompt(params);
                await runner.WaitForPendingPromptRunSaves();
                return res.promptRun?.ID;
            }),
        );

        const unique = new Set(ids.filter(Boolean));
        AssertEqual(unique.size, CONCURRENCY, 'distinct prompt-run IDs (no shared/clobbered run records)');
        for (const id of unique) {
            await verifyPromptRun(String(id), user);
        }
        console.log(`      → ${unique.size} concurrent prompt runs, all distinct + persisted correctly`);
    });

    suite.Test('CC2: concurrent agent runs each persist a correct, independent run', async () => {
        const names = ['Sage', 'Demo Loop Agent', 'Research Agent'];
        const agents = names.map((n) => AIEngine.Instance.Agents.find((a) => a.Name?.toLowerCase() === n.toLowerCase()));
        Assert(agents.every(Boolean), `Not all of [${names.join(', ')}] were found`);

        const runIds = await Promise.all(
            agents.map(async (agent, i) => {
                const result = await new AgentRunner().RunAgent({
                    agent: agent!,
                    conversationMessages: [{ role: 'user', content: `Concurrent run ${i + 1}: reply briefly and finish.` }],
                    contextUser: user,
                });
                return result.agentRun?.ID;
            }),
        );

        const unique = new Set(runIds.filter(Boolean));
        AssertEqual(unique.size, agents.length, 'distinct agent-run IDs');
        await settle(SETTLE_MS);
        for (const id of unique) {
            await verifyAgentRun(String(id), user, false);
        }
        console.log(`      → ${unique.size} concurrent agent runs, all distinct + persisted correctly`);
    });

    const failures = await suite.Run();
    process.exit(failures > 0 ? 1 : 0);
}

main().catch((error) => {
    console.error('\nBOOTSTRAP / CONNECTIVITY ERROR:', error instanceof Error ? error.message : error);
    process.exit(2);
});
