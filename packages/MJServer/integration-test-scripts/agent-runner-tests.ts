/**
 * agent-runner-tests.ts — live integration tests for the AI Agent framework.
 *
 * Thin dispatcher: bootstraps the real server provider stack and runs the 'agent-runner' bundle (AR1)
 * from the shared IntegrationCheckRegistry, wrapping it in the bundle's registered lifecycle (Setup
 * configures AIEngine; Teardown is a no-op — the AI Agent Runs the check creates are its own output).
 * The check body + fixture live ONCE in @memberjunction/testing-integration and are consumed identically
 * by this script and by the IntegrationTestDriver.
 *
 * Runs REAL agents end to end through AgentRunner and DEEP-VERIFIES the persisted run/steps/prompt
 * runs/action logs — the live regression guard for the fire-and-forget save queues.
 *
 * GATED — real agent runs cost tokens + need model credentials:
 *   RUN_AGENT_TESTS=1 npx tsx packages/MJServer/integration-test-scripts/agent-runner-tests.ts
 * Optional:
 *   AGENT_FILTER=<substr>   — restrict to specs whose name/label contains the value (case-insensitive)
 *   AGENT_SETTLE_MS=<ms>    — fire-and-forget landing delay (default 3000)
 *   EMIT_OUTCOMES=<path>    — also write the golden-diff outcomes JSON.
 *
 * Exit code: 0 = passed (or skipped), 1 = failures, 2 = bootstrap error.
 */
import {
    TestRunner, EmitOutcomes, IntegrationCheckRegistry, bootstrapIntegrationServer
} from './lib/harness';
import type { IntegrationCheckContext } from './lib/harness';

const BUNDLE = 'agent-runner';

async function main(): Promise<void> {
    if (process.env.RUN_AGENT_TESTS !== '1') {
        console.log('agent-runner-tests: SKIPPED — set RUN_AGENT_TESTS=1 to run live agent executions (costs tokens, needs model credentials).');
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
        const suite = new TestRunner('Agent live integration (real run + deep persistence: run, steps, prompt runs, action logs)');
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
