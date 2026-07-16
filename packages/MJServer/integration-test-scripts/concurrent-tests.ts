/**
 * concurrent-tests.ts — live-model integration tests for CONCURRENT prompt/agent persistence.
 *
 * Thin dispatcher: bootstraps the real server provider stack and runs the 'concurrent' bundle (CC1–CC2)
 * from the shared IntegrationCheckRegistry, wrapping it in the bundle's registered lifecycle (Setup
 * configures AIEngine; Teardown is a no-op). The check bodies live ONCE in
 * @memberjunction/testing-integration and are consumed identically by this script and by the
 * IntegrationTestDriver.
 *
 * Fires many runs in parallel and proves each persists its OWN correct run — no cross-run corruption,
 * stressing the per-entity-instance keying of the fire-and-forget BaseEntitySaveQueue.
 *
 * GATED (real model calls):
 *   RUN_AGENT_TESTS=1 npx tsx packages/MJServer/integration-test-scripts/concurrent-tests.ts
 *
 * Optional: CONCURRENCY (default 5) · AGENT_SETTLE_MS (default 3000) · EMIT_OUTCOMES=<path>
 * Exit code: 0 = passed (or skipped), 1 = failures, 2 = bootstrap error.
 */
import {
    TestRunner, EmitOutcomes, IntegrationCheckRegistry, bootstrapIntegrationServer
} from './lib/harness';
import type { IntegrationCheckContext } from './lib/harness';

const BUNDLE = 'concurrent';

async function main(): Promise<void> {
    if (process.env.RUN_AGENT_TESTS !== '1') {
        console.log('concurrent-tests: SKIPPED — set RUN_AGENT_TESTS=1 to run live concurrent executions.');
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
    try {
        if (lifecycle) {
            await lifecycle.Setup(ctx);
        }
        const suite = new TestRunner('Concurrent run persistence (real model — no cross-run corruption)');
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
