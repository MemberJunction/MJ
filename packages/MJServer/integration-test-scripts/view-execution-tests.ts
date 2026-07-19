/**
 * view-execution-tests.ts — the Viewing System deterministic tier (CLIENT transport).
 *
 * Thin dispatcher: runs the 'view-execution' bundle (Domain 11 / V1–V13 DET checks) from the
 * shared IntegrationCheckRegistry against a live MJAPI via GraphQLDataProvider — the same wire
 * a browser uses. The check bodies live ONCE in @memberjunction/testing-integration and are
 * consumed identically by this script and by the IntegrationTestDriver (IT25).
 *
 * The bundle is READ-ONLY: it discovers its universe from existing metadata rows and creates,
 * updates and deletes nothing, so it has no lifecycle (no Setup/Teardown).
 *
 * SKIPS cleanly (exit 0) when MJAPI is not reachable, so it never fails CI on a server-less box.
 *
 * `bootstrapIntegrationClient` is imported from the server-FREE `@memberjunction/testing-integration/client`
 * subpath so the client entity subclasses win the ClassFactory race exactly as they do in a browser.
 * (The registry/runner symbols still come from ./lib/harness — the same arrangement every other
 * registry-driven client dispatcher uses.)
 *
 * USAGE (from the repo root, with MJAPI running):
 *   npx tsx packages/MJServer/integration-test-scripts/view-execution-tests.ts
 * Optional:
 *   EMIT_OUTCOMES=<path>  — also write the golden-diff outcomes JSON.
 *
 * Exit code: 0 = passed (or skipped), 1 = failures, 2 = setup error.
 */
import { bootstrapIntegrationClient } from '@memberjunction/testing-integration/client';
import { LoadEnv, LoadClientConfig, TestRunner, EmitOutcomes, IntegrationCheckRegistry } from './lib/harness';
import type { IntegrationCheckContext } from './lib/harness';
import { Metadata } from '@memberjunction/core';

const BUNDLE = 'view-execution';

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

/** Resolve the client config + confirm MJAPI is up; returns false when the run should SKIP. */
async function preflight(): Promise<boolean> {
    LoadEnv();
    let client: ReturnType<typeof LoadClientConfig>;
    try {
        client = LoadClientConfig();
    } catch (error) {
        console.log(`view-execution-tests: SKIPPED — client config unavailable (${error instanceof Error ? error.message : String(error)}). Set MJ_API_KEY + start MJAPI to run the Viewing System tier.`);
        return false;
    }
    if (!(await reachable(client.Url, client.MJAPIKey))) {
        console.log(`view-execution-tests: SKIPPED — MJAPI not reachable at ${client.Url} (start MJAPI to run the Viewing System tier).`);
        return false;
    }
    return true;
}

async function main(): Promise<void> {
    if (!(await preflight())) {
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

    const suite = new TestRunner('Viewing System — deterministic tier (GraphQLDataProvider -> live MJAPI)');
    for (const check of IntegrationCheckRegistry.Instance.GetBundle(BUNDLE)) {
        suite.Test(check.Name, () => check.Fn(ctx));
    }

    const failures = await suite.Run();
    if (process.env.EMIT_OUTCOMES) {
        await EmitOutcomes(suite, process.env.EMIT_OUTCOMES);
    }
    process.exit(failures > 0 ? 1 : 0);
}

main().catch((error) => {
    console.error('\nSETUP / CONNECTIVITY ERROR:', error instanceof Error ? error.message : error);
    process.exit(2);
});
