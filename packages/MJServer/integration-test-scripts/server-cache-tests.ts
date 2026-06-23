/**
 * server-cache-tests.ts — live integration tests for SERVER-side RunView caching.
 *
 * Bootstraps SQLServerDataProvider against the real dev database exactly the way
 * MJAPI does (an instrumented LocalCacheManager installed as the first caller, then
 * setupSQLServerClient), then runs the 'server-cache' check bundle (S1–S26) from the
 * shared IntegrationCheckRegistry. The check bodies live ONCE in
 * @memberjunction/testing-integration and are consumed identically by this script
 * and by the IntegrationTestDriver — there is no second copy here.
 *
 * Server-side providers have TrustLocalCacheCompletely = true, so every cacheable
 * RunView reads/writes the cache without explicit CacheLocal — this suite verifies
 * that behavior end to end against live SQL Server.
 *
 * USAGE (from the repo root — cwd-relative .env / mj.config.cjs must resolve):
 *   npx tsx packages/MJServer/integration-test-scripts/server-cache-tests.ts
 *
 * Optional:
 *   RUN_MUTATION_TESTS=1  — also run the save/delete invalidation checks (S17/S23/S24),
 *                           which create and then delete rows for the context user.
 *                           Off by default (23 checks; 26 with mutation).
 *   EMIT_OUTCOMES=<path>  — also write a {name,passed,durationMs,error}[] JSON file
 *                           for the golden-equivalence diff.
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
        Schema: ic.Db.Schema
    };

    const suite = new TestRunner('Server-side RunView caching (SQLServerDataProvider, TrustLocalCacheCompletely)');
    const runMutation = process.env.RUN_MUTATION_TESTS === '1';
    for (const check of IntegrationCheckRegistry.Instance.GetBundle('server-cache')) {
        if (check.RequiresMutation && !runMutation) {
            continue; // preserves the 23-vs-26 default behavior
        }
        suite.Test(check.Name, () => check.Fn(ctx));
    }

    const failures = await suite.Run();
    if (process.env.EMIT_OUTCOMES) {
        await EmitOutcomes(suite, process.env.EMIT_OUTCOMES);
    }
    await ic.Pool.close();
    process.exit(failures > 0 ? 1 : 0);
}

main().catch(err => {
    console.error(`\nBootstrap error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(2);
});
