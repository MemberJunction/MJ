/**
 * harness.ts — transitional shim.
 *
 * All implementation now lives in @memberjunction/testing-integration. This file
 * re-points the standalone tsx suites (server-cache-tests.ts / client-cache-tests.ts /
 * runquery-cache-tests.ts) at the package so they import `./lib/harness` exactly as
 * before and behave identically — same exit-code contract and ordering semantics.
 *
 * This is the one allowed re-export: a transitional shim WITHIN the same feature that
 * eases the script→library move. Every symbol forwarded here is DEFINED in
 * @memberjunction/testing-integration (not re-exported from a third package). It is
 * slated for deletion once the scripts import the package directly.
 *
 * FORWARD ONLY WHAT THE PACKAGE STILL EXPORTS. A named re-export of a binding the source module
 * does not provide is an ESM *link-time* error, so it does not fail where it is written — it takes
 * down every script that imports this file, before a line of their own code runs. That happened:
 * `createRunQueryFixtures` / `teardownRunQueryFixtures` moved into this package's own
 * `src/checks/runquery-cache.checks.ts`, the two lines here were left behind, and all six rigs
 * importing this shim died with `does not provide an export named 'createRunQueryFixtures'`. No rig
 * ever used them. Nothing in the type-check catches it either: `rigs/` is outside the package's
 * tsconfig `include`, so the only signal is running a rig.
 */
export {
    LoadEnv,
    LoadDbConfig,
    LoadClientConfig,
    TestRunner,
    EmitOutcomes,
    InstrumentedLocalStorageProvider,
    UniqueFilter,
    Assert,
    AssertEqual,
    RowKeys,
    AssertRowShape,
    AssertKeysInclude,
    AssertKeysExclude,
    // Bundle dispatch + bootstrap surface — the scripts now register from the one
    // registry (single source of truth) instead of inlining their own check bodies.
    IntegrationCheckRegistry,
    bootstrapIntegrationServer,
    bootstrapIntegrationClient,
    // NOTE: createRunQueryFixtures / teardownRunQueryFixtures are deliberately NOT forwarded.
    // They live in @memberjunction/integration-test-suite (src/checks/runquery-cache.checks.ts),
    // not in the package below — forwarding them violated this file's own rule two lines up and
    // made the whole module throw `SyntaxError: does not provide an export named
    // 'createRunQueryFixtures'` at load, killing every rig that imports this shim. Nothing
    // consumed them through here. Import them from the suite package directly if ever needed.
    // RLS two-user discovery (the rls-isolation bundle's fixture) — DISCOVERED, not minted.
    discoverRlsFixture,
    // Tier gate predicate — the ONE source of truth honored by both the scripts and the driver.
    IsTierEnabled
} from '@memberjunction/testing-integration';
export type { DbConfig, ClientConfig, TestOutcome, IntegrationCheckContext, RlsFixture } from '@memberjunction/testing-integration';
