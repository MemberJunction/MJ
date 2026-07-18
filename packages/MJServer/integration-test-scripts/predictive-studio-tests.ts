/**
 * predictive-studio-tests.ts — live, full-stack (headless) integration tests for Predictive Studio's
 * STACK SEAMS over the real provider/transport.
 *
 * Thin dispatcher: bootstraps the real server provider stack and runs the 'predictive-studio' bundle
 * (PS1–PS5) from the shared IntegrationCheckRegistry, wrapping it in the bundle's registered lifecycle
 * (Setup creates the shared Pipeline → Model → Binding lineage fixture; Teardown removes it child →
 * parent). The check bodies + fixture live ONCE in @memberjunction/testing-integration and are consumed
 * identically by this script and by the IntegrationTestDriver.
 *
 * Deterministic + sidecar-free by default (PS1–PS5 seams). The internal PS5 live-train leg is gated
 * behind PS_INTEGRATION=1. Creates + deletes ALL of its own fixtures (try/finally cleanup, even on failure).
 *
 * USAGE (from the repo root):
 *   npx tsx packages/MJServer/integration-test-scripts/predictive-studio-tests.ts
 *   PS_INTEGRATION=1 npx tsx packages/MJServer/integration-test-scripts/predictive-studio-tests.ts  # + live sidecar legs
 * Optional:
 *   EMIT_OUTCOMES=<path>  — also write the golden-diff outcomes JSON.
 *
 * Exit code: 0 = passed, 1 = failures, 2 = bootstrap error.
 */
import {
    TestRunner, EmitOutcomes, IntegrationCheckRegistry, bootstrapIntegrationServer
} from './lib/harness';
import type { IntegrationCheckContext } from './lib/harness';

const BUNDLE = 'predictive-studio';

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
        const suite = new TestRunner('Predictive Studio live integration (ML CRUD + ML-Model work-type seam + PS Actions)');
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
