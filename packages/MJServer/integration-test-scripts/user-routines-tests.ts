/**
 * user-routines-tests.ts — live, deterministic integration tests for the User Routines feature (P1.5):
 * the entity servers + the UserRoutineDispatcherDriver, end to end against the real database.
 *
 * Thin dispatcher: bootstraps the real server provider stack and runs the 'user-routines' bundle
 * (UR1–UR16) from the shared IntegrationCheckRegistry, wrapping it in the bundle's registered lifecycle
 * (Setup configures ActionEngineServer + resolves the 'Calculate Expression' fixture target; Teardown
 * removes every routine / recipient / run / notification / conversation the bundle created, FK-safe).
 * The check bodies + fixture live ONCE in @memberjunction/testing-integration and are consumed
 * identically by this script and by the IntegrationTestDriver (IT22).
 *
 * No LLM calls — the executable fixture targets the pure-computation 'Calculate Expression' core Action.
 *
 * USAGE (from the repo root):
 *   npx tsx packages/MJServer/integration-test-scripts/user-routines-tests.ts
 * Optional:
 *   EMIT_OUTCOMES=<path>  — also write the golden-diff outcomes JSON.
 *
 * Exit code: 0 = passed, 1 = failures, 2 = bootstrap error.
 */
import {
    TestRunner, EmitOutcomes, IntegrationCheckRegistry, bootstrapIntegrationServer
} from './lib/harness';
import type { IntegrationCheckContext } from './lib/harness';

const BUNDLE = 'user-routines';

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
    if (lifecycle) {
        await lifecycle.Setup(ctx);
    }
    try {
        const suite = new TestRunner('User Routines — entity servers + dispatcher end-to-end');
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
