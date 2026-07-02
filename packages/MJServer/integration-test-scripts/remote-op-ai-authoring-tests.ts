/**
 * remote-op-ai-authoring-tests.ts — live, end-to-end test for RO-4 (AI-from-Description operation bodies).
 *
 * Thin dispatcher: bootstraps the real server provider stack and runs the 'remote-op-ai-authoring' bundle
 * (RO4-1→RO4-3) from the shared IntegrationCheckRegistry, wrapping it in the bundle's registered lifecycle
 * (Setup builds the shared GenerationType='AI' Remote Operation UNSAVED; RO4-1 saves it — authoring fires on
 * save; Teardown deletes it). The check bodies + fixture live ONCE in @memberjunction/testing-integration and
 * are consumed identically by this script and by the IntegrationTestDriver.
 *
 * GATED behind RUN_AGENT_TESTS=1 (live model call, costs tokens).
 *
 * USAGE (from the repo root):
 *   RUN_AGENT_TESTS=1 npx tsx packages/MJServer/integration-test-scripts/remote-op-ai-authoring-tests.ts
 *
 * Exit code: 0 = passed (or skipped), 1 = failures, 2 = bootstrap error.
 */
import {
    TestRunner, EmitOutcomes, IntegrationCheckRegistry, bootstrapIntegrationServer
} from './lib/harness';
import type { IntegrationCheckContext } from './lib/harness';

const BUNDLE = 'remote-op-ai-authoring';

async function main(): Promise<void> {
    if (process.env.RUN_AGENT_TESTS !== '1') {
        console.log('remote-op-ai-authoring-tests: SKIPPED — set RUN_AGENT_TESTS=1 to run the live AI-authoring loop (costs tokens, needs model credentials).');
        process.exit(0);
    }

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
        const suite = new TestRunner('Remote Operations RO-4 AI-authoring (live: Description -> Code -> approve -> emit)');
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
