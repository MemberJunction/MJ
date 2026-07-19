/**
 * app-wiring-tests.ts — CLIENT-FIRST integration tests for the application wiring contract.
 *
 * Thin dispatcher: bootstraps the browser-faithful client stack (GraphQLDataProvider → live
 * MJAPI, zero server packages) and runs the 'app-wiring' bundle (AW1–AW10) from the shared
 * IntegrationCheckRegistry. The check bodies live ONCE in @memberjunction/testing-integration
 * and are consumed identically by this script and by the IntegrationTestDriver.
 *
 * Deterministic, READ-ONLY (no fixtures, no mutation, no model calls).
 *
 * PREREQUISITE: MJAPI running. If it is unreachable this script SKIPS cleanly (exit 0) rather
 * than reporting a false failure — an absent server is an environment gap, not a product defect.
 *
 * USAGE (from the repo root):
 *   npx tsx packages/MJServer/integration-test-scripts/app-wiring-tests.ts
 *
 * Exit code: 0 = passed (or skipped), 1 = failures, 2 = bootstrap error.
 */
// BROWSER FIDELITY (B32): import from the server-FREE subpaths only — never the root
// barrel, which re-exports the server bootstrap and would drag in
// @memberjunction/core-entities-server, causing entities to resolve to their SERVER
// subclasses instead of the client classes a real browser loads.
import { bootstrapIntegrationClient } from '@memberjunction/testing-integration/client';
import { TestRunner, IntegrationCheckRegistry } from '@memberjunction/testing-integration/registry';
import type { IntegrationCheckContext } from '@memberjunction/testing-integration/registry';
// Side-effect import: registers THIS bundle's checks (and only this bundle's).
import '@memberjunction/testing-integration/checks/app-wiring.checks';
import { Metadata } from '@memberjunction/core';

const BUNDLE = 'app-wiring';

async function main(): Promise<void> {
    let storage: Awaited<ReturnType<typeof bootstrapIntegrationClient>>['Storage'];
    try {
        ({ Storage: storage } = await bootstrapIntegrationClient());
    } catch (e) {
        console.log(`SKIPPED — client bootstrap unavailable (is MJAPI running?): ${e instanceof Error ? e.message : String(e)}`);
        process.exit(0);
    }

    // The client bootstrap installs the GraphQLDataProvider as the process's single provider,
    // so the global is the right (and only) one here — this is a dedicated test process.
    const md = new Metadata(); // global-provider-ok: dedicated single-provider client test process
    const ctx: IntegrationCheckContext = {
        User: md.CurrentUser,
        Provider: Metadata.Provider,
        Storage: storage
    };

    const reg = IntegrationCheckRegistry.Instance;
    const checks = reg.GetBundle(BUNDLE);
    if (checks.length === 0) {
        console.error(`No checks registered for bundle '${BUNDLE}' — registration wiring is broken.`);
        process.exit(2);
    }

    const suite = new TestRunner('Application wiring contract (client-first, all shipped apps)');
    for (const check of checks) {
        suite.Test(check.Name, () => check.Fn(ctx));
    }
    const failures = await suite.Run();
    process.exit(failures > 0 ? 1 : 0);
}

main().catch((error) => {
    console.error('\nBOOTSTRAP / CONNECTIVITY ERROR:', error instanceof Error ? error.message : error);
    process.exit(2);
});
