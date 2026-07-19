/**
 * permission-engine-tests.ts — CLIENT-FIRST integration tests for the unified permission model.
 *
 * Thin dispatcher: bootstraps the browser-faithful client stack (GraphQLDataProvider → live MJAPI,
 * zero server packages) and runs the 'permission-engine' bundle (PE1–PE12) from the shared
 * IntegrationCheckRegistry, wrapping it in the bundle's registered lifecycle. The check bodies live
 * ONCE in @memberjunction/testing-integration and are consumed identically by this script and by
 * the IntegrationTestDriver (IT28).
 *
 * WHY CLIENT TRANSPORT: everything under test — `PermissionEngine`, the ClassFactory-resolved
 * permission providers, `AIAgentPermissionHelper` / `AISkillPermissionHelper`, `EntityInfo`
 * permissions and `AuthorizationEvaluator` — is provider-agnostic and is exactly what a browser
 * executes. Running it over the real wire additionally proves the resolver/serialization layer
 * serves the permission catalog and grant tables faithfully. No check here needs a server-only
 * surface, so `bootstrapIntegrationServer` is not used.
 *
 * TIERS: PE1–PE10 are deterministic and READ-ONLY (no fixtures, no mutation, no model calls).
 * PE11/PE12 are mutation-tier: their lifecycle Setup is gated on RUN_MUTATION_TESTS=1, so by
 * default nothing at all is written and those two checks skip-as-pass. When enabled, the fixtures
 * are two throwaway `MJ: Permission Domains` rows tagged '(mj-integration-test — safe to delete)',
 * removed in a best-effort Teardown. No existing record, and no real user's permissions, is ever
 * touched.
 *
 * SEEDED PRINCIPALS: PE9/PE10 need the role-less user `it-nogrant@integration.test`. Seed with:
 *   npx mj sync push --dir=metadata-optional/integration-test
 * Without it, those two checks skip-as-pass with a loud warning.
 *
 * PREREQUISITE: MJAPI running. If it is unreachable this script SKIPS cleanly (exit 0) rather than
 * reporting a false failure — an absent server is an environment gap, not a product defect.
 *
 * USAGE (from the repo root):
 *   npx tsx packages/MJServer/integration-test-scripts/permission-engine-tests.ts
 * Optional:
 *   RUN_MUTATION_TESTS=1  — also run PE11/PE12 (creates + deletes two throwaway domain rows).
 *   EMIT_OUTCOMES=<path>  — also write the golden-diff outcomes JSON.
 *
 * Exit code: 0 = passed (or skipped), 1 = failures, 2 = bootstrap error.
 */
// TRANSPORT NOTE (B32 / B37) — this bundle DELIBERATELY imports the root barrel, unlike the
// other client-first dispatchers, which use the server-free `/registry` + `/checks/*` subpaths.
//
// Why: unlike app-wiring / view-execution / entity-writes (which assert WIRE behavior), these
// checks assert ENGINE INTERNALS — the `MJ: Permission Domains` catalog fanning out to
// ClassFactory-registered `PermissionProviderBase` implementations, and the cached
// AIAgent/AISkill permission helpers. Those registrations come from packages a headless
// client process does not otherwise load, so importing only this bundle's checks leaves the
// ClassFactory under-populated and the checks silently degrade (PE6 flips to a false failure;
// PE7/PE8 downgrade to skips — i.e. they stop asserting anything).
//
// That degradation is the symptom of a REAL open question (B37): a browser loads the full
// client class manifest (`@memberjunction/ng-bootstrap`), whereas the integration client
// bootstrap registers only `@memberjunction/core-entities`. Until that gap is closed, this
// bundle is honest as an ENGINE-side check rather than a wire check, and the barrel import is
// the documented transport exception. Revisit when the client bootstrap loads a real manifest.
import { bootstrapIntegrationClient } from '@memberjunction/testing-integration/client';
import { TestRunner, EmitOutcomes, IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import type { IntegrationCheckContext } from '@memberjunction/testing-integration';
import { Metadata } from '@memberjunction/core';

const BUNDLE = 'permission-engine';

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

    const lifecycle = reg.GetLifecycle(BUNDLE);
    let failures = 0;
    try {
        if (lifecycle) {
            await lifecycle.Setup(ctx);
        }
        const suite = new TestRunner('Unified permissions (client-first — fan-out, deny precedence, dual-path defaults)');
        for (const check of checks) {
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
