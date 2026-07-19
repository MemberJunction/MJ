/**
 * cache-gauntlet-tests.ts — LIVE coverage of the subset-slot x mutation cell that shipped two
 * production cache bugs (#3195 totalRowCount collapse, #3199 rows maintained in place).
 *
 * Thin dispatcher: bootstraps the real server provider stack and runs the 'cache-gauntlet'
 * bundle (CG1-CG5) from the shared IntegrationCheckRegistry. The check bodies live ONCE in
 * @memberjunction/testing-integration and are consumed identically by this script and by the
 * IntegrationTestDriver.
 *
 * SERVER transport by design: these assert the SERVER's own LocalCacheManager maintenance
 * behavior (using ExecutionTime === 0 as the cache-hit oracle), which has no client surface.
 *
 * MUTATION TIER — the checks create and delete their own `MJ: User Settings` rows, so they only
 * run under RUN_MUTATION_TESTS=1.
 *
 * USAGE (from the repo root):
 *   RUN_MUTATION_TESTS=1 npx tsx packages/MJServer/integration-test-scripts/cache-gauntlet-tests.ts
 *
 * Exit code: 0 = passed, 1 = failures, 2 = bootstrap error.
 */
import {
    TestRunner, EmitOutcomes, IntegrationCheckRegistry, bootstrapIntegrationServer
} from './lib/harness';
import type { IntegrationCheckContext } from './lib/harness';

const BUNDLE = 'cache-gauntlet';

async function main(): Promise<void> {
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
        const suite = new TestRunner('Cache gauntlet — subset-slot x mutation (the #3195/#3199 bug class, live)');
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
