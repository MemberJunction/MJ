/**
 * prompt-runner-tests.ts — live-model integration tests for AIPromptRunner.
 *
 * Thin dispatcher: bootstraps the real server provider stack and runs the 'prompt-runner' bundle (PR1)
 * from the shared IntegrationCheckRegistry, wrapping it in the bundle's registered lifecycle (Setup
 * configures AIEngine; Teardown is a no-op). The check body lives ONCE in
 * @memberjunction/testing-integration and is consumed identically by this script and by the
 * IntegrationTestDriver.
 *
 * Runs a REAL prompt through the full AIPromptRunner stack against the live database + real model
 * providers, then verifies the persisted `MJ: AI Prompt Runs` rows.
 *
 * GATED — real model calls cost tokens + need credentials, so this is opt-in:
 *   RUN_AGENT_TESTS=1 npx tsx packages/MJServer/integration-test-scripts/prompt-runner-tests.ts
 *
 * Optional:
 *   PROMPT_TEST_NAMES='<a>,<b>'         — which prompts to run (default: first N Active)
 *   PROMPT_TEST_COUNT=<n>               — how many Active prompts to run (default 3)
 *   PROMPT_TEST_DATA='{"key":"value"}'  — JSON data passed to the prompt template
 *   EMIT_OUTCOMES=<path>                — also write the golden-diff outcomes JSON.
 *
 * Exit code: 0 = passed (or skipped), 1 = failures, 2 = bootstrap error.
 */
import {
    TestRunner, EmitOutcomes, IntegrationCheckRegistry, bootstrapIntegrationServer
} from './lib/harness';
import type { IntegrationCheckContext } from './lib/harness';

const BUNDLE = 'prompt-runner';

async function main(): Promise<void> {
    if (process.env.RUN_AGENT_TESTS !== '1') {
        console.log('prompt-runner-tests: SKIPPED — set RUN_AGENT_TESTS=1 to run live prompt executions (costs tokens, needs model credentials).');
        process.exit(0);
    }

    const ic = await bootstrapIntegrationServer({ ContextUserEmail: process.env.MJ_TEST_USER_EMAIL });
    const ctx: IntegrationCheckContext = {
        User: ic.User,
        Provider: ic.Provider,
        Storage: ic.Storage,
        Pool: ic.Pool,
        Schema: ic.Db.Schema
    };

    const reg = IntegrationCheckRegistry.Instance;
    const lifecycle = reg.GetLifecycle(BUNDLE);
    let failures = 0;
    if (lifecycle) {
        await lifecycle.Setup(ctx);
    }
    try {
        const suite = new TestRunner('AIPromptRunner live integration (real model, real persistence)');
        for (const check of reg.GetBundle(BUNDLE)) {
            suite.Test(check.Name, () => check.Fn(ctx));
        }
        failures = await suite.Run();
        if (process.env.EMIT_OUTCOMES) {
            await EmitOutcomes(suite, process.env.EMIT_OUTCOMES);
        }
    } finally {
        if (lifecycle) {
            await lifecycle.Teardown(ctx);
        }
    }
    await ic.ClosePool();
    process.exit(failures > 0 ? 1 : 0);
}

main().catch((error) => {
    console.error('\nBOOTSTRAP / CONNECTIVITY ERROR:', error instanceof Error ? error.message : error);
    process.exit(2);
});
