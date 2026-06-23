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

// Side-effect imports: register the bundled checks and fire the @RegisterClass decorator
// on the IntegrationTestDriver so the ClassFactory can resolve it.
import './checks/self-test.check';
import './checks/server-cache.checks';

/**
 * Tree-shake guard. Importing this module (or calling this function) ensures the
 * check registrations and the IntegrationTestDriver @RegisterClass decorator have run.
 */
export function LoadTestingIntegration(): void {
    /* no-op — importing this module is the side effect */
}
