/**
 * dataset-cache-tests.ts — live integration tests for the 'DatasetCache' storage category.
 *
 * Bootstraps SQLServerDataProvider like MJAPI (instrumented LocalCacheManager first, then
 * setupSQLServerClient) and runs the 'dataset-cache' bundle (DS1 cold-then-warm, DS2 status
 * APIs) from the shared IntegrationCheckRegistry against a real seeded dataset. The check
 * bodies live ONCE in @memberjunction/testing-integration.
 *
 * USAGE (from the repo root):
 *   npx tsx packages/MJServer/integration-test-scripts/dataset-cache-tests.ts
 * Optional:
 *   MJ_TEST_DATASET=<name>  — dataset to exercise (default 'MJ_Metadata').
 *   EMIT_OUTCOMES=<path>    — also write the golden-diff outcomes JSON.
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
        Config: process.env.MJ_TEST_DATASET ? { datasetName: process.env.MJ_TEST_DATASET } : undefined
    };

    const suite = new TestRunner('Dataset caching (DatasetCache category, GetAndCacheDatasetByName)');
    for (const check of IntegrationCheckRegistry.Instance.GetBundle('dataset-cache')) {
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
