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
    createRunQueryFixtures,
    teardownRunQueryFixtures
} from '@memberjunction/testing-integration';
export type { DbConfig, ClientConfig, TestOutcome, IntegrationCheckContext } from '@memberjunction/testing-integration';
