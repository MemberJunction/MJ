/**
 * @memberjunction/testing-integration — public API.
 *
 * Defines this package's surface only (no re-exports of other packages' symbols;
 * InMemoryLocalStorageProvider etc. are imported from @memberjunction/core where used).
 */
export * from './config';
export * from './tiers';
export * from './instrumented-cache';
export * from './test-runner';
export * from './bootstrap';
// bootstrapIntegrationClient lives in the server-FREE bootstrap-client module (so client
// dispatchers can import it via the `./client` subpath without dragging in server packages).
// Re-exported here for backward-compat barrel consumers (the driver / server dispatchers).
export * from './bootstrap-client';
export * from './ai-verify';
export * from './check';
export * from './check-registry';
import './checks/self-test.check'; // side effect: register the permanent Phase-0 smoke check
export * from './rls-fixture';
export * from './fls-fixture';
// NOTE: the check BUNDLES (MJ's own test content) live in the private
// @memberjunction/integration-test-suite package — importing THAT package registers
// every bundle on this registry. This framework package deliberately ships content-free.
export * from './types';
export * from './IntegrationTestDriver';

// The @RegisterClass decorator on IntegrationTestDriver fires via the export above.
//
// This block used to also re-export the bundle arrays and the RunQuery fixture helpers
// (createRunQueryFixtures / teardownRunQueryFixtures). Those exports were removed when the
// content moved to @memberjunction/integration-test-suite — see the NOTE above — but the
// sentence describing them was left behind, and it is why a consumer shim went on
// forwarding `createRunQueryFixtures` from here long after it was gone, throwing at module
// load. Do not reinstate them: this package ships content-free.

/**
 * Tree-shake guard. Importing this module (or calling this function) ensures the
 * check registrations and the IntegrationTestDriver @RegisterClass decorator have run.
 */
export function LoadTestingIntegration(): void {
    /* no-op — importing this module is the side effect */
}
