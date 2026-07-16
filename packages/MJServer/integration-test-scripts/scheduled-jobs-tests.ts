/**
 * scheduled-jobs-tests.ts — live integration tests for the Scheduled Jobs engine.
 *
 * Thin dispatcher: bootstraps the real server provider stack and runs the 'scheduled-jobs' bundle
 * (SJ1–SJ2) from the shared IntegrationCheckRegistry, wrapping it in the bundle's registered lifecycle
 * (Setup creates the shared Scheduled Job fixture; Teardown removes it + the Scheduled Job Runs the
 * checks create). The check bodies + fixture live ONCE in @memberjunction/testing-integration and are
 * consumed identically by this script and by the IntegrationTestDriver.
 *
 * We point a job at a missing Record Process so the driver fails FAST and DETERMINISTICALLY — what we
 * assert is the ENGINE's run-lifecycle + distributed-lease contract, which runs identically on success
 * or failure.
 *
 * Deterministic (no model calls). Creates + deletes its own job/run fixtures.
 *
 * USAGE (from the repo root):
 *   npx tsx packages/MJServer/integration-test-scripts/scheduled-jobs-tests.ts
 * Optional:
 *   EMIT_OUTCOMES=<path>  — also write the golden-diff outcomes JSON.
 *
 * Exit code: 0 = passed, 1 = failures, 2 = bootstrap error.
 */
import {
    TestRunner, EmitOutcomes, IntegrationCheckRegistry, bootstrapIntegrationServer
} from './lib/harness';
import type { IntegrationCheckContext } from './lib/harness';

const BUNDLE = 'scheduled-jobs';

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
        const suite = new TestRunner('Scheduled Jobs engine live integration (run lifecycle + distributed lease)');
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
