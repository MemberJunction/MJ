/**
 * metadata-consistency-tests.ts — the live Metadata ↔ DB consistency audit (MC1–MC8).
 *
 * Thin dispatcher: bootstraps the real server provider stack and runs the 'metadata-consistency'
 * bundle from the shared IntegrationCheckRegistry. The check bodies live ONCE in
 * @memberjunction/testing-integration and are consumed identically by this script and by the
 * IntegrationTestDriver.
 *
 * READ-ONLY: no fixtures, no mutation, no model calls — every check is a SELECT against the MJ
 * metadata cache + the physical `sys.*` catalog, so the bundle registers no lifecycle.
 *
 * SERVER transport (documented exception to the client-first doctrine): the physical catalog has
 * no client surface — `sys.objects` / `sys.check_constraints` / `sys.indexes` / `sys.columns` are
 * unreachable over GraphQL. See the bundle's file header.
 *
 * USAGE (from the repo root):
 *   npx tsx packages/MJServer/integration-test-scripts/metadata-consistency-tests.ts
 * Optional:
 *   EMIT_OUTCOMES=<path>  — also write the golden-diff outcomes JSON.
 *
 * Exit code: 0 = passed, 1 = failures, 2 = bootstrap error.
 */
import {
    TestRunner, EmitOutcomes, IntegrationCheckRegistry, bootstrapIntegrationServer
} from './lib/harness';
import type { IntegrationCheckContext } from './lib/harness';

const BUNDLE = 'metadata-consistency';

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
        const suite = new TestRunner('Metadata ↔ DB consistency audit (read-only, sys.* vs MJ metadata)');
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
