/**
 * remote-op-wire-progress-tests.ts — over-the-wire RO-3 test (CLIENT transport).
 *
 * Thin dispatcher: runs the 'remote-op-wire-progress' bundle (WIRE1) from the shared
 * IntegrationCheckRegistry against a live MJAPI via GraphQLDataProvider. The check body + its
 * over-the-wire fixtures live ONCE in @memberjunction/testing-integration and are consumed identically
 * by this script and the IntegrationTestDriver (IT15).
 *
 * SKIPS cleanly (exit 0) when MJAPI is not reachable, so it never fails CI on a server-less box.
 *
 * USAGE (from the repo root, with MJAPI running):
 *   npx tsx packages/MJServer/integration-test-scripts/remote-op-wire-progress-tests.ts
 *
 * Exit code: 0 = passed (or skipped), 1 = failures, 2 = setup error.
 */
import {
    LoadEnv, LoadClientConfig, TestRunner, EmitOutcomes, IntegrationCheckRegistry, bootstrapIntegrationClient
} from './lib/harness';
import type { IntegrationCheckContext } from './lib/harness';
import { Metadata } from '@memberjunction/core';

const BUNDLE = 'remote-op-wire-progress';

async function reachable(url: string, apiKey: string): Promise<boolean> {
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-mj-api-key': apiKey },
            body: JSON.stringify({ query: '{ __typename }' }),
        });
        return res.ok;
    } catch {
        return false;
    }
}

async function main(): Promise<void> {
    LoadEnv();
    // A server-less box (e.g. the CI integration lane) has no MJ_API_KEY — LoadClientConfig throws.
    // That's a SKIP condition, not a setup error: without a key/URL there is no MJAPI to test against.
    let client: ReturnType<typeof LoadClientConfig>;
    try {
        client = LoadClientConfig();
    } catch (error) {
        console.log(`remote-op-wire-progress-tests: SKIPPED — client config unavailable (${error instanceof Error ? error.message : String(error)}). Set MJ_API_KEY + start MJAPI to run the over-the-wire RO-3 test.`);
        process.exit(0);
    }
    if (!(await reachable(client.Url, client.MJAPIKey))) {
        console.log(`remote-op-wire-progress-tests: SKIPPED — MJAPI not reachable at ${client.Url} (start MJAPI to run the over-the-wire RO-3 test).`);
        process.exit(0);
    }

    const cc = await bootstrapIntegrationClient();
    const md = new Metadata(); // global-provider-ok: dedicated single-provider Node integration test — bootstrapIntegrationClient configured the one global GraphQLDataProvider this process uses
    const ctx: IntegrationCheckContext = {
        User: md.CurrentUser,
        Provider: Metadata.Provider, // global-provider-ok: the single global GraphQLDataProvider just configured for this dedicated test process
        Storage: cc.Storage,
        Schema: process.env.MJ_CORE_SCHEMA ?? '__mj'
    };

    const reg = IntegrationCheckRegistry.Instance;
    const lifecycle = reg.GetLifecycle(BUNDLE);
    let failures = 0;
    if (lifecycle) {
        await lifecycle.Setup(ctx);
    }
    try {
        const suite = new TestRunner('Remote Operations RO-3 over-the-wire progress (GraphQLDataProvider -> live MJAPI)');
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
    process.exit(failures > 0 ? 1 : 0);
}

main().catch((error) => {
    console.error('\nSETUP / CONNECTIVITY ERROR:', error instanceof Error ? error.message : error);
    process.exit(2);
});
