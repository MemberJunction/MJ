/**
 * api-keys-tests.ts — live integration tests for the API Keys engine against REAL database metadata.
 *
 * Thin dispatcher: bootstraps the real server provider stack and runs the 'api-keys' bundle
 * (AK1–AK3) from the shared IntegrationCheckRegistry, wrapping it in the bundle's registered
 * lifecycle (Setup configures the in-process API Keys engine so AK1/AK2 read the seeded
 * scopes/apps; Teardown is a no-op — AK3 self-cleans its own key/scope/log fixtures). The check
 * bodies live ONCE in @memberjunction/testing-integration and are consumed identically by this
 * script and by the IntegrationTestDriver.
 *
 * Deterministic (no model calls). Creates + deletes its own key/scope fixtures (AK3 try/finally).
 *
 * USAGE (from the repo root):
 *   npx tsx packages/MJServer/integration-test-scripts/api-keys-tests.ts
 * Optional:
 *   EMIT_OUTCOMES=<path>  — also write the golden-diff outcomes JSON.
 *
 * Exit code: 0 = passed, 1 = failures, 2 = bootstrap error.
 */
import {
    TestRunner, EmitOutcomes, IntegrationCheckRegistry, bootstrapIntegrationServer
} from './lib/harness';
import type { IntegrationCheckContext } from './lib/harness';

const BUNDLE = 'api-keys';

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
        const suite = new TestRunner('API Keys engine live integration (real scopes/apps + end-to-end authorize)');
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
