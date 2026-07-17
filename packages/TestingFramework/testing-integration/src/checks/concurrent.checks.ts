/**
 * concurrent.checks.ts — the 'concurrent' bundle (CC1–CC2): live-model integration checks for
 * CONCURRENT prompt/agent persistence. Graduated verbatim from integration-test-scripts/concurrent-tests.ts
 * so the driver and the standalone script run one definition.
 *
 * LIVE-MODEL tier (real model calls) — gated by RUN_AGENT_TESTS at the dispatcher. Fires many runs in
 * parallel and proves each persists its OWN correct run — no cross-run corruption. This stresses the
 * per-entity-instance keying of the fire-and-forget BaseEntitySaveQueue: different runs/entities save
 * concurrently, and a slow INSERT in one must never clobber another's finalize.
 *
 * The bundle lifecycle just configures AIEngine (no shared fixture object) — Setup does
 * AIEngine.Instance.Config, Teardown is a no-op. CC1's Name interpolates ${CONCURRENCY} (a computed string).
 */
import { AIEngine } from '@memberjunction/aiengine';
import { AIPromptRunner } from '@memberjunction/ai-prompts';
import { AIPromptParams } from '@memberjunction/ai-core-plus';
import { AgentRunner } from '@memberjunction/ai-agents';
import { Assert, AssertEqual, settle } from '../test-runner';
import { verifyPromptRun, verifyAgentRun } from '../ai-verify';
import { IntegrationCheckRegistry } from '../check-registry';
import { NamedCheck, IntegrationCheckContext } from '../check';

const CONCURRENCY = Number(process.env.CONCURRENCY ?? 5);
const SETTLE_MS = Number(process.env.AGENT_SETTLE_MS ?? 3000);

export const ConcurrentChecks: NamedCheck[] = [
    {
        Id: 'concurrent.CC1',
        Name: `CC1: ${CONCURRENCY} concurrent prompt runs each persist an independent, correct AI Prompt Run`,
        Fn: async (ctx: IntegrationCheckContext) => {
            const prompt = AIEngine.Instance.Prompts.find((p) => p.Status === 'Active');
            Assert(!!prompt, 'No Active prompt available');

            const ids = await Promise.all(
                Array.from({ length: CONCURRENCY }, async () => {
                    const runner = new AIPromptRunner();
                    const params = new AIPromptParams();
                    params.prompt = prompt!;
                    params.contextUser = ctx.User;
                    params.data = {};
                    const res = await runner.ExecutePrompt(params);
                    await runner.WaitForPendingPromptRunSaves();
                    return res.promptRun?.ID;
                }),
            );

            const unique = new Set(ids.filter(Boolean));
            AssertEqual(unique.size, CONCURRENCY, 'distinct prompt-run IDs (no shared/clobbered run records)');
            for (const id of unique) {
                await verifyPromptRun(String(id), ctx.User);
            }
            console.log(`      → ${unique.size} concurrent prompt runs, all distinct + persisted correctly`);
        }
    },
    {
        Id: 'concurrent.CC2',
        Name: 'CC2: concurrent agent runs each persist a correct, independent run',
        Fn: async (ctx: IntegrationCheckContext) => {
            const names = ['Sage', 'Demo Loop Agent', 'Research Agent'];
            const agents = names.map((n) => AIEngine.Instance.Agents.find((a) => a.Name?.toLowerCase() === n.toLowerCase()));
            Assert(agents.every(Boolean), `Not all of [${names.join(', ')}] were found`);

            const runIds = await Promise.all(
                agents.map(async (agent, i) => {
                    const result = await new AgentRunner().RunAgent({
                        agent: agent!,
                        conversationMessages: [{ role: 'user', content: `Concurrent run ${i + 1}: reply briefly and finish.` }],
                        contextUser: ctx.User,
                    });
                    return result.agentRun?.ID;
                }),
            );

            const unique = new Set(runIds.filter(Boolean));
            AssertEqual(unique.size, agents.length, 'distinct agent-run IDs');
            await settle(SETTLE_MS);
            for (const id of unique) {
                await verifyAgentRun(String(id), ctx.User, false);
            }
            console.log(`      → ${unique.size} concurrent agent runs, all distinct + persisted correctly`);
        }
    }
];

for (const check of ConcurrentChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('concurrent', {
    Setup: async (ctx: IntegrationCheckContext) => {
        await AIEngine.Instance.Config(false, ctx.User);
    },
    Teardown: async () => {
        // No shared fixture to clean up — the runs the checks create are their own output.
    }
});
