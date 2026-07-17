/**
 * prompt-runner.checks.ts — the 'prompt-runner' bundle (PR1): live-model integration check for
 * AIPromptRunner. Graduated verbatim from integration-test-scripts/prompt-runner-tests.ts so the
 * driver and the standalone script run one definition.
 *
 * LIVE-MODEL tier (real model calls cost tokens + need credentials) — gated by RUN_AGENT_TESTS at the
 * dispatcher. Runs a REAL prompt through the full AIPromptRunner stack (template render → model
 * selection → execution → fire-and-forget AIPromptRun persistence) against the live database + real
 * model providers, then verifies each persisted `MJ: AI Prompt Runs` row via verifyPromptRun.
 *
 * The source built a DYNAMIC set of suite.Test calls in a loop; this collapses to ONE NamedCheck whose
 * body runs that loop internally (select prompts, assert ≥1, then run + verify each). The bundle
 * lifecycle just configures AIEngine (no shared fixture object) — Setup does AIEngine.Instance.Config,
 * Teardown is a no-op.
 */
import { AIEngine } from '@memberjunction/aiengine';
import { AIPromptRunner } from '@memberjunction/ai-prompts';
import { AIPromptParams } from '@memberjunction/ai-core-plus';
import { Assert } from '../test-runner';
import { verifyPromptRun } from '../ai-verify';
import { IntegrationCheckRegistry } from '../check-registry';
import { NamedCheck, IntegrationCheckContext } from '../check';

export const PromptRunnerChecks: NamedCheck[] = [
    {
        Id: 'prompt-runner.PR1',
        Name: 'PR1: execute selected Active prompts and verify each AI Prompt Run finalized correctly',
        Fn: async (ctx: IntegrationCheckContext) => {
            // Pick the prompts to run: explicit names (PROMPT_TEST_NAMES, comma-separated) or the first N Active
            // prompts (PROMPT_TEST_COUNT, default 3) — exercises the prompt-run save path across several prompts.
            const names = process.env.PROMPT_TEST_NAMES?.split(',').map((n) => n.trim().toLowerCase()).filter(Boolean);
            const count = Number(process.env.PROMPT_TEST_COUNT ?? 3);
            const prompts = names && names.length > 0
                ? names.map((n) => AIEngine.Instance.Prompts.find((p) => p.Name?.toLowerCase() === n)).filter(Boolean)
                : AIEngine.Instance.Prompts.filter((p) => p.Status === 'Active').slice(0, count);

            Assert(prompts.length > 0, 'No prompts available to run (none Active / none matched PROMPT_TEST_NAMES)');
            const data = process.env.PROMPT_TEST_DATA ? JSON.parse(process.env.PROMPT_TEST_DATA) : {};

            for (const prompt of prompts) {
                const params = new AIPromptParams();
                params.prompt = prompt!;
                params.contextUser = ctx.User;
                params.data = data;

                const runner = new AIPromptRunner();
                const result = await runner.ExecutePrompt(params);

                Assert(result.promptRun?.ID != null, `'${prompt!.Name}': AIPromptRunner returned no promptRun (no AI Prompt Run record created)`);
                // Persistence is fire-and-forget on the queue — flush this runner before reading the row back.
                await runner.WaitForPendingPromptRunSaves();

                const row = await verifyPromptRun(result.promptRun!.ID, ctx.User);
                console.log(`      → run ${result.promptRun!.ID}: Status=${row.Status} success=${result.success} ${row.ExecutionTimeMS}ms tokens=${row.TokensUsed ?? 0}`);
            }
        }
    }
];

for (const check of PromptRunnerChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('prompt-runner', {
    Setup: async (ctx: IntegrationCheckContext) => {
        await AIEngine.Instance.Config(false, ctx.User);
    },
    Teardown: async () => {
        // No shared fixture to clean up — the AI Prompt Runs the checks create are their own output.
    }
});
