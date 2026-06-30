/**
 * prompt-runner-tests.ts — live integration tests for AIPromptRunner.
 *
 * Runs a REAL prompt through the full AIPromptRunner stack (template render → model selection →
 * execution → fire-and-forget AIPromptRun persistence) against the live database + real model
 * providers, then verifies the persisted `MJ: AI Prompt Runs` row is correct: terminal Status,
 * CompletedAt set (the "stuck at Running" guard), and — on success — a non-empty Result + timing.
 * This is the live end-to-end regression guard for the BaseEntitySaveQueue prompt-run migration.
 *
 * GATED — real model calls cost tokens + need credentials, so this is opt-in:
 *   RUN_AGENT_TESTS=1 npx tsx packages/MJServer/integration-test-scripts/prompt-runner-tests.ts
 *
 * Optional:
 *   PROMPT_TEST_NAME='<prompt name>'   — which prompt to run (default: first Active prompt)
 *   PROMPT_TEST_DATA='{"key":"value"}' — JSON data passed to the prompt template
 *
 * Exit code: 0 = passed (or skipped), 1 = failures, 2 = bootstrap error.
 */
import { TestRunner, Assert } from './lib/harness';
import { bootstrapAI, verifyPromptRun } from './lib/ai-bootstrap';
import { AIEngine } from '@memberjunction/aiengine';
import { AIPromptRunner } from '@memberjunction/ai-prompts';
import { AIPromptParams } from '@memberjunction/ai-core-plus';

const GATED = process.env.RUN_AGENT_TESTS === '1';

async function main(): Promise<void> {
    if (!GATED) {
        console.log('prompt-runner-tests: SKIPPED — set RUN_AGENT_TESTS=1 to run live prompt executions (costs tokens, needs model credentials).');
        process.exit(0);
    }

    const { user } = await bootstrapAI();
    const suite = new TestRunner('AIPromptRunner live integration (real model, real persistence)');

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
        suite.Test(`execute prompt '${prompt!.Name}' and verify the AI Prompt Run finalized correctly`, async () => {
            const params = new AIPromptParams();
            params.prompt = prompt!;
            params.contextUser = user;
            params.data = data;

            const runner = new AIPromptRunner();
            const result = await runner.ExecutePrompt(params);

            Assert(result.promptRun?.ID != null, `'${prompt!.Name}': AIPromptRunner returned no promptRun (no AI Prompt Run record created)`);
            // Persistence is fire-and-forget on the queue — flush this runner before reading the row back.
            await runner.WaitForPendingPromptRunSaves();

            const row = await verifyPromptRun(result.promptRun!.ID, user);
            console.log(`      → run ${result.promptRun!.ID}: Status=${row.Status} success=${result.success} ${row.ExecutionTimeMS}ms tokens=${row.TokensUsed ?? 0}`);
        });
    }

    const failures = await suite.Run();
    process.exit(failures > 0 ? 1 : 0);
}

main().catch((error) => {
    console.error('\nBOOTSTRAP / CONNECTIVITY ERROR:', error instanceof Error ? error.message : error);
    process.exit(2);
});
