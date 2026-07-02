/**
 * record-process-facade-tests.ts — live integration tests for the RecordProcessExecutor FACADE.
 *
 * Thin dispatcher: bootstraps the real server provider stack and runs the 'record-process-facade'
 * bundle (RPF1–RPF2) from the shared IntegrationCheckRegistry, wrapping it in the bundle's registered
 * lifecycle (Setup creates the shared Record Process fixture; Teardown removes it + the ProcessRuns
 * the checks create). The check bodies + fixture live ONCE in @memberjunction/testing-integration and
 * are consumed identically by this script and by the IntegrationTestDriver (IT05).
 *
 * Deterministic (no model calls). Creates + deletes its own Record Process + ProcessRun fixtures.
 *
 * USAGE (from the repo root):
 *   npx tsx packages/MJServer/integration-test-scripts/record-process-facade-tests.ts
 * Optional:
 *   EMIT_OUTCOMES=<path>  — also write the golden-diff outcomes JSON.
 *
 * Exit code: 0 = passed, 1 = failures, 2 = bootstrap error.
 */
import {
    TestRunner, EmitOutcomes, IntegrationCheckRegistry, bootstrapIntegrationServer
} from './lib/harness';
import type { IntegrationCheckContext } from './lib/harness';

const BUNDLE = 'record-process-facade';

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
        const suite = new TestRunner('RecordProcessExecutor facade live integration (real Record Process → ProcessRun)');
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
