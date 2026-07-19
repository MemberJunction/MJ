/**
 * entity-writes-tests.ts — CLIENT-FIRST integration tests for the core data WRITE-SIDE contract.
 *
 * Thin dispatcher: bootstraps the browser-faithful client stack (GraphQLDataProvider → live MJAPI)
 * and runs the 'entity-writes' bundle (EW1–EW8) from the shared IntegrationCheckRegistry, wrapped in
 * the bundle's registered lifecycle. The check bodies live ONCE in @memberjunction/testing-integration
 * and are consumed identically by this script and by the IntegrationTestDriver (IT27).
 *
 * Covers Domain 2 of the integration-test expansion catalog: record-change fidelity (CD1), virtual-field
 * save capture (CD2), keyset completeness + guardrails (CD3/CD4), linger-invalidation-after-save (CD5),
 * ClassFactory server-subclass resolution (CD10), UUID case-insensitive FK round-trip (CD11), and
 * datetimeoffset round-trip (CD12).
 *
 * MUTATING: six of the eight checks write throwaway rows (`MJ: Action Categories` / `MJ: Lists`,
 * name-prefixed per run and tagged "(mj-integration-test — safe to delete)"), so they carry
 * RequiresMutation and run ONLY under RUN_MUTATION_TESTS=1. Without that flag the two read-only
 * checks (EW4, EW8) still run and nothing is written. Teardown is best-effort and always runs.
 *
 * PREREQUISITE: MJAPI running. If it is unreachable this script SKIPS cleanly (exit 0) rather than
 * reporting a false failure — an absent server is an environment gap, not a product defect.
 *
 * USAGE (from the repo root):
 *   RUN_MUTATION_TESTS=1 npx tsx packages/MJServer/integration-test-scripts/entity-writes-tests.ts
 * Optional:
 *   EMIT_OUTCOMES=<path>  — also write the golden-diff outcomes JSON.
 *
 * Exit code: 0 = passed (or skipped), 1 = failures, 2 = bootstrap error.
 */
// BROWSER FIDELITY (B32): server-FREE subpaths only — the root barrel re-exports the
// server bootstrap, which would resolve entities to their SERVER subclasses rather than
// the client classes a browser actually loads.
import { bootstrapIntegrationClient } from '@memberjunction/testing-integration/client';
import { TestRunner, EmitOutcomes, IntegrationCheckRegistry } from '@memberjunction/testing-integration/registry';
import type { IntegrationCheckContext, NamedCheck } from '@memberjunction/testing-integration/registry';
// Side-effect import: registers THIS bundle's checks (and only this bundle's).
import '@memberjunction/testing-integration/checks/entity-writes.checks';
import { Metadata } from '@memberjunction/core';

const BUNDLE = 'entity-writes';

/** Applies the mutation tier gate — mutating checks run only under RUN_MUTATION_TESTS=1. */
function selectChecks(checks: NamedCheck[]): { Runnable: NamedCheck[]; Gated: NamedCheck[] } {
    const mutationsEnabled = process.env.RUN_MUTATION_TESTS === '1';
    if (mutationsEnabled) {
        return { Runnable: checks, Gated: [] };
    }
    return {
        Runnable: checks.filter(c => !c.RequiresMutation),
        Gated: checks.filter(c => c.RequiresMutation)
    };
}

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
    const { Runnable, Gated } = selectChecks(checks);
    if (Gated.length > 0) {
        console.log(`Note: ${Gated.length} mutating check(s) skipped — set RUN_MUTATION_TESTS=1 to include them.`);
    }

    const lifecycle = reg.GetLifecycle(BUNDLE);
    let failures = 0;
    try {
        if (lifecycle) {
            await lifecycle.Setup(ctx);
        }
        const suite = new TestRunner('Core entity write-side (client-first over the GraphQL wire)');
        for (const check of Runnable) {
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
    console.error('\nBOOTSTRAP / CONNECTIVITY ERROR:', error instanceof Error ? error.message : error);
    process.exit(2);
});
