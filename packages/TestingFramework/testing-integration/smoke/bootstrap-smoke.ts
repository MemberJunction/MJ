/**
 * bootstrap-smoke.ts — Phase 0 live-DB smoke test (NOT a unit test).
 *
 * Requires a live SQL Server reachable via mj.config.cjs databaseSettings or DB_* env.
 * Run from the repo root so .env / mj.config.cjs resolve:
 *
 *   npx tsx packages/TestingFramework/testing-integration/smoke/bootstrap-smoke.ts
 *
 * Proves the load-bearing D1 invariant: bootstrapIntegrationServer installs the
 * instrumented cache as FIRST caller, so the self-test check observes a RunViewCache
 * write on a cold RunView. If the cache were installed after provider setup (the
 * silent-no-op trap), the counter would be 0 and the check would fail.
 *
 * Exit codes mirror the existing suites: 0 pass / 1 fail / 2 bootstrap error.
 */
import { bootstrapIntegrationServer, getActiveIntegrationStorage } from '../src/bootstrap';
import { IntegrationCheckRegistry } from '../src/check-registry';
import { LoadTestingIntegration } from '../src/index';
import type { IntegrationCheckContext } from '../src/check';

async function main(): Promise<void> {
    LoadTestingIntegration();                          // ensure the self-test check is registered
    const bootstrap = await bootstrapIntegrationServer({ VerboseCacheLogging: false });
    const storage = getActiveIntegrationStorage();
    if (!storage) {
        console.error('No active instrumented storage after bootstrap');
        await bootstrap.Pool.close();
        process.exit(2);
    }

    const ctx: IntegrationCheckContext = {
        User: bootstrap.User,
        Provider: bootstrap.Provider,
        Storage: storage,
        Pool: bootstrap.Pool
    };

    const check = IntegrationCheckRegistry.Instance.Get('self-test.cache-warm');
    if (!check) {
        console.error('self-test.cache-warm check not registered');
        await bootstrap.Pool.close();
        process.exit(2);
    }

    try {
        await check.Fn(ctx);
        console.log(`✓ ${check.Name}`);
        await bootstrap.Pool.close();
        process.exit(0);
    } catch (e) {
        console.error(`✗ ${check.Name}: ${(e as Error).message}`);
        await bootstrap.Pool.close();
        process.exit(1);
    }
}

main().catch(e => {
    console.error('Bootstrap error:', e);
    process.exit(2);
});
