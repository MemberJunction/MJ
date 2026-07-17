/**
 * rls-isolation-tests.ts — live integration tests for Row-Level Security (multi-user isolation).
 *
 * Bootstraps SQLServerDataProvider like MJAPI (instrumented LocalCacheManager first, then
 * setupSQLServerClient) and runs the UNIFIED 'rls-isolation' bundle (RLS1–RLS6) from the
 * shared IntegrationCheckRegistry. The check bodies live ONCE in
 * @memberjunction/testing-integration and are consumed identically by this script and by
 * the IntegrationTestDriver (IT06) — there is no second copy here. This is the superset of
 * the two RLS implementations that coexisted after the `next` merge (token substitution +
 * distinct predicate text + fingerprint divergence + superset no-cross-serve + live scoping +
 * the always-runnable empty-clause invariant).
 *
 * The two-user / token / live-pair fixture is DISCOVERED (never minted) from the provider's
 * RLS filters + the live user cache; each check degrades gracefully (skip-as-pass with a note)
 * when its fixture piece is unavailable (e.g. a DB with only RLS-exempt admins).
 *
 * USAGE (from the repo root):
 *   npx tsx packages/MJServer/integration-test-scripts/rls-isolation-tests.ts
 * Optional:
 *   EMIT_OUTCOMES=<path>  — also write the golden-diff outcomes JSON.
 *
 * Exit code: 0 = passed, 1 = failures, 2 = bootstrap error.
 */
import {
    TestRunner, EmitOutcomes, IntegrationCheckRegistry, bootstrapIntegrationServer, discoverRlsFixture
} from './lib/harness';
import type { IntegrationCheckContext } from './lib/harness';
import { UserCache } from '@memberjunction/sqlserver-dataprovider';

async function main(): Promise<void> {
    const ic = await bootstrapIntegrationServer({ ContextUserEmail: process.env.MJ_TEST_USER_EMAIL });
    const ctx: IntegrationCheckContext = {
        User: ic.User,
        Provider: ic.Provider,
        Storage: ic.Storage,
        Pool: ic.Pool,
        Schema: ic.Db.Schema,
        // Discovered two-user + token + live-pair RLS fixture (mirrors what the driver's SetupSuite does).
        RlsFixture: discoverRlsFixture(ic.Provider, UserCache.Instance.Users ?? [])
    };

    const suite = new TestRunner('Row-Level Security isolation (multi-user, real RLS filter)');
    for (const check of IntegrationCheckRegistry.Instance.GetBundle('rls-isolation')) {
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
