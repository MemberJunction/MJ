/**
 * rls-isolation-tests.ts — live integration tests for RLS / multi-user CACHE ISOLATION.
 *
 * The #1 security deliverable: prove one user's Row-Level-Security-filtered cache entry
 * can never serve a different user. Bootstraps SQLServerDataProvider exactly like MJAPI
 * (instrumented LocalCacheManager installed FIRST, then setupSQLServerClient + UserCache
 * refresh), DISCOVERS two non-exempt users with different effective RLS clauses, and runs
 * the 'rls-isolation' bundle (RLS1 fingerprint divergence + RLS2 server superset no
 * cross-serve) from the shared IntegrationCheckRegistry. The check bodies live ONCE in
 * @memberjunction/testing-integration and are consumed identically here and by the
 * IntegrationTestDriver.
 *
 * Discovery, not provisioning — nothing is created, so there is no teardown. When the DB
 * has only RLS-exempt admins (no two users with distinct non-empty clauses), the checks
 * degrade gracefully (skip-as-pass with a prominent log) rather than failing.
 *
 * USAGE (from the repo root):
 *   npx tsx packages/MJServer/integration-test-scripts/rls-isolation-tests.ts
 * Optional:
 *   EMIT_OUTCOMES=<path>  — also write a {name,passed,durationMs,error}[] JSON file for the golden diff.
 *
 * Exit code: 0 = all passed (or gracefully skipped), 1 = failures, 2 = bootstrap error.
 */
import { UserCache } from '@memberjunction/sqlserver-dataprovider';
import {
    TestRunner, EmitOutcomes, IntegrationCheckRegistry, bootstrapIntegrationServer, discoverRlsFixture
} from './lib/harness';
import type { IntegrationCheckContext } from './lib/harness';

async function main(): Promise<void> {
    const ic = await bootstrapIntegrationServer({ ContextUserEmail: process.env.MJ_TEST_USER_EMAIL });
    const rlsFixture = discoverRlsFixture(ic.Provider, UserCache.Instance.Users);
    if (rlsFixture.Usable) {
        console.log(`  RLS fixture: User A=${rlsFixture.UserA.Email} / User B=${rlsFixture.UserB.Email} on '${rlsFixture.EntityName}'`);
    } else {
        console.log(`  RLS fixture UNUSABLE — ${rlsFixture.Reason}. Checks will skip (graceful degrade).`);
    }

    const ctx: IntegrationCheckContext = {
        User: ic.User,
        Provider: ic.Provider,
        Storage: ic.Storage,
        Pool: ic.Pool,
        Schema: ic.Db.Schema,
        RlsFixture: rlsFixture
    };

    const suite = new TestRunner('RLS / multi-user cache isolation (SQLServerDataProvider, server superset)');
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
