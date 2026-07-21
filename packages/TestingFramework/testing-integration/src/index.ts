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
// NOTE: the check BUNDLES (MJ's own test content) live in the private
// @memberjunction/integration-test-suite package — importing THAT package registers
// every bundle on this registry. This framework package deliberately ships content-free.
export * from './types';
export * from './IntegrationTestDriver';

// Re-export the bundle arrays + RunQuery fixture helpers AND, as a side effect of
// evaluating these modules, register every bundled check on the IntegrationCheckRegistry.
// The @RegisterClass decorator on IntegrationTestDriver fires via the export above.

// Side-effect only: the permanent Phase-0 smoke check (no exports of its own).

/**
 * Tree-shake guard. Importing this module (or calling this function) ensures the
 * check registrations and the IntegrationTestDriver @RegisterClass decorator have run.
 */
export function LoadTestingIntegration(): void {
    /* no-op — importing this module is the side effect */
}
