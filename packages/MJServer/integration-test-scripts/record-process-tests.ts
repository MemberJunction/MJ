/**
 * record-process-tests.ts — live integration tests for the RecordSetProcessor substrate.
 *
 * Thin dispatcher: bootstraps the real server provider stack (instrumented LocalCacheManager first,
 * like MJAPI) and runs the 'record-process' bundle (RP1–RP8) from the shared IntegrationCheckRegistry.
 * The check bodies live ONCE in @memberjunction/testing-integration and are consumed identically by
 * this script and by the IntegrationTestDriver (IT04).
 *
 * Deterministic (NO model calls — a FunctionRecordProcessor), so it runs in the default tier.
 *
 * USAGE (from the repo root):
 *   npx tsx packages/MJServer/integration-test-scripts/record-process-tests.ts
 * Optional:
 *   EMIT_OUTCOMES=<path>  — also write the golden-diff outcomes JSON.
 *
 * Exit code: 0 = passed, 1 = failures, 2 = bootstrap error.
 */
import {
    TestRunner, EmitOutcomes, IntegrationCheckRegistry, bootstrapIntegrationServer
} from './lib/harness';
import type { IntegrationCheckContext } from './lib/harness';

async function main(): Promise<void> {
    const ic = await bootstrapIntegrationServer({ ContextUserEmail: process.env.MJ_TEST_USER_EMAIL });
    const ctx: IntegrationCheckContext = {
        User: ic.User,
        Provider: ic.Provider,
        Storage: ic.Storage,
        Pool: ic.Pool,
        Schema: ic.Db.Schema
    };

    const suite = new TestRunner('RecordSetProcessor live integration (deterministic — tracker persistence)');
    for (const check of IntegrationCheckRegistry.Instance.GetBundle('record-process')) {
        suite.Test(check.Name, () => check.Fn(ctx));
    }

    const failures = await suite.Run();
    if (process.env.EMIT_OUTCOMES) {
        await EmitOutcomes(suite, process.env.EMIT_OUTCOMES);
    }
    await ic.ClosePool();
    process.exit(failures > 0 ? 1 : 0);
}

main().catch((error) => {
    console.error('\nBOOTSTRAP / CONNECTIVITY ERROR:', error instanceof Error ? error.message : error);
    process.exit(2);
});
