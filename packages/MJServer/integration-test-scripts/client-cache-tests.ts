/**
 * client-cache-tests.ts — live integration tests for CLIENT-side RunView caching.
 *
 * Connects to a RUNNING MJAPI instance the way a browser client does — via
 * GraphQLDataProvider — but from Node: authentication uses the system API key
 * (x-mj-api-key, MJ_API_KEY in .env). bootstrapIntegrationClient installs an
 * instrumented in-memory cache as the first caller, preflights MJAPI, then runs the
 * 'client-cache' check bundle (C1–C12) from the shared IntegrationCheckRegistry.
 * The check bodies live ONCE in @memberjunction/testing-integration.
 *
 * Client providers have TrustLocalCacheCompletely = false, so caching is opt-in
 * per query via CacheLocal: the smart-cache-check flow sends each entry's
 * maxUpdatedAt/rowCount fingerprint to the server, which answers current/stale.
 *
 * PREREQUISITE: MJAPI must be running (npm run start in packages/MJAPI). The
 * endpoint is resolved from env: MJAPI_URL, or http://localhost:{GRAPHQL_PORT}{GRAPHQL_ROOT_PATH}.
 *
 * USAGE (from the repo root):
 *   npx tsx packages/MJServer/integration-test-scripts/client-cache-tests.ts
 *
 * Optional:
 *   RUN_MUTATION_TESTS=1  — also run the client save/delete revalidation check (C10).
 *   EMIT_OUTCOMES=<path>  — write a {name,passed,durationMs,error}[] JSON file for the diff.
 *
 * Exit code: 0 = all passed, 1 = failures, 2 = bootstrap/connectivity error.
 */
import {
    TestRunner, EmitOutcomes, IntegrationCheckRegistry, bootstrapIntegrationClient
} from './lib/harness';
import type { IntegrationCheckContext } from './lib/harness';
import { Metadata } from '@memberjunction/core';

async function main(): Promise<void> {
    const cc = await bootstrapIntegrationClient();
    const md = new Metadata();
    const ctx: IntegrationCheckContext = {
        User: md.CurrentUser,
        Provider: Metadata.Provider,
        Storage: cc.Storage,
        Schema: process.env.MJ_CORE_SCHEMA ?? '__mj'
    };

    const suite = new TestRunner('Client-side RunView caching (GraphQLDataProvider → live MJAPI)');
    const runMutation = process.env.RUN_MUTATION_TESTS === '1';
    for (const check of IntegrationCheckRegistry.Instance.GetBundle('client-cache')) {
        if (check.RequiresMutation && !runMutation) {
            continue;
        }
        suite.Test(check.Name, () => check.Fn(ctx));
    }

    const failures = await suite.Run();
    if (process.env.EMIT_OUTCOMES) {
        await EmitOutcomes(suite, process.env.EMIT_OUTCOMES);
    }
    process.exit(failures > 0 ? 1 : 0);
}

main().catch(err => {
    console.error(`\nBootstrap error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(2);
});
