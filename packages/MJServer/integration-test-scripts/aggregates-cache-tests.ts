/**
 * aggregates-cache-tests.ts — live integration tests for aggregates THROUGH the cache.
 *
 * Bootstraps SQLServerDataProvider like MJAPI (instrumented LocalCacheManager first, then
 * setupSQLServerClient) and runs the 'aggregates-cache' bundle (AGG1 fingerprint includes
 * Aggregates[] / aggHash, AGG2 AggregateResults round-trips through a warm hit) from the
 * shared IntegrationCheckRegistry. The check bodies live ONCE in
 * @memberjunction/testing-integration.
 *
 * USAGE (from the repo root):
 *   npx tsx packages/MJServer/integration-test-scripts/aggregates-cache-tests.ts
 * Optional:
 *   MJ_TEST_AGG_ENTITY=<name>  — entity to aggregate over (default 'MJ: User Settings').
 *   EMIT_OUTCOMES=<path>       — also write the golden-diff outcomes JSON.
 *
 * Exit code: 0 = all passed, 1 = failures, 2 = bootstrap error.
 */
import {
    TestRunner, EmitOutcomes, IntegrationCheckRegistry, bootstrapIntegrationServer
} from './lib/harness';
import type { IntegrationCheckContext } from './lib/harness';

async function main(): Promise<void> {
    const ic = await bootstrapIntegrationServer({ ContextUserEmail: process.env.MJ_TEST_USER_EMAIL });
    const ctx: IntegrationCheckContext = {
        User: ic.User,
        Provider: ic.Provider,
        Storage: ic.Storage,
        Pool: ic.Pool,
        Schema: ic.Db.Schema,
        Config: process.env.MJ_TEST_AGG_ENTITY ? { entityName: process.env.MJ_TEST_AGG_ENTITY } : undefined
    };

    const suite = new TestRunner('Aggregates through the cache (aggHash fingerprint + AggregateResults round-trip)');
    for (const check of IntegrationCheckRegistry.Instance.GetBundle('aggregates-cache')) {
        suite.Test(check.Name, () => check.Fn(ctx));
    }

    const failures = await suite.Run();
    if (process.env.EMIT_OUTCOMES) {
        await EmitOutcomes(suite, process.env.EMIT_OUTCOMES);
    }
    await ic.ClosePool();
    process.exit(failures > 0 ? 1 : 0);
}

main().catch(err => {
    console.error(`\nBootstrap error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(2);
});
