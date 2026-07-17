/**
 * runquery-cache-tests.ts — live integration tests for RunQuery result caching.
 *
 * RunQuery caching is opt-in via RunQueryParams.CacheLocal and stores results in
 * the LocalCacheManager 'RunQueryCache' category, fingerprinted by
 * QueryID|QueryName|Parameters(+MaxRows/StartRow)|Connection. Two modes:
 *  - TTL mode (Query has no CacheValidationSQL): slots served until expiry
 *  - Smart validation (Query.CacheValidationSQL configured): current/stale/no_validation
 *
 * SELF-CONTAINED FIXTURES: this suite CREATES its own Query records (category
 * "Integration Test Queries") at bootstrap and DELETES them in teardown. It also
 * creates/deletes "MJ: User Settings" rows to mutate the data its fixture queries
 * count. Run it knowingly — it writes to the database (and cleans up after itself).
 * The Q1–Q9 check bodies and the fixture create/teardown live ONCE in
 * @memberjunction/testing-integration; this script just bootstraps + dispatches them.
 *
 * USAGE (from the repo root):
 *   npx tsx packages/MJServer/integration-test-scripts/runquery-cache-tests.ts
 *
 * Optional:
 *   EMIT_OUTCOMES=<path>  — write a {name,passed,durationMs,error}[] JSON file for the diff.
 *
 * Exit code: 0 = all passed, 1 = failures, 2 = bootstrap error.
 */
import {
    TestRunner, EmitOutcomes, IntegrationCheckRegistry, bootstrapIntegrationServer
} from './lib/harness';
import type { IntegrationCheckContext } from './lib/harness';

const BUNDLE = 'runquery-cache';

async function main(): Promise<void> {
    const ic = await bootstrapIntegrationServer({ ContextUserEmail: process.env.MJ_TEST_USER_EMAIL });
    const ctx: IntegrationCheckContext = {
        User: ic.User,
        Provider: ic.Provider,
        Storage: ic.Storage,
        Pool: ic.Pool,
        Schema: ic.Db.Schema
    };

    // Aligned with every other dispatcher (R4): resolve the registered BundleLifecycle and run
    // its Setup INSIDE the try whose finally GUARANTEES Teardown — so a mid-Setup crash (e.g. the
    // second fixture query save failing) still sweeps whatever the fixture created, instead of the
    // old create-fixtures-then-run-then-teardown shape that orphaned partial fixtures on a throw.
    const reg = IntegrationCheckRegistry.Instance;
    const lifecycle = reg.GetLifecycle(BUNDLE);
    let failures = 0;
    try {
        if (lifecycle) {
            await lifecycle.Setup(ctx);
        }
        const suite = new TestRunner('RunQuery result caching (server provider, live SQL Server)');
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

main().catch(async err => {
    console.error(`\nBootstrap error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(2);
});
