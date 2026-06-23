/**
 * @memberjunction/testing-integration — public API.
 *
 * Defines this package's surface only (no re-exports of other packages' symbols;
 * InMemoryLocalStorageProvider etc. are imported from @memberjunction/core where used).
 */
export * from './config';
export * from './instrumented-cache';
export * from './test-runner';
export * from './bootstrap';
export * from './check';
export * from './check-registry';
export * from './types';
export * from './IntegrationTestDriver';

// Re-export the bundle arrays + RunQuery fixture helpers AND, as a side effect of
// evaluating these modules, register every bundled check on the IntegrationCheckRegistry.
// The @RegisterClass decorator on IntegrationTestDriver fires via the export above.
export * from './checks/server-cache.checks';
export * from './checks/client-cache.checks';
export * from './checks/runquery-cache.checks';

// Side-effect only: the permanent Phase-0 smoke check (no exports of its own).
import './checks/self-test.check';

/**
 * Tree-shake guard. Importing this module (or calling this function) ensures the
 * check registrations and the IntegrationTestDriver @RegisterClass decorator have run.
 */
export function LoadTestingIntegration(): void {
    /* no-op — importing this module is the side effect */
}
