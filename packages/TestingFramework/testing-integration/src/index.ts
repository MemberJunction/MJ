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
export * from './types';
export * from './IntegrationTestDriver';

// Re-export the bundle arrays + RunQuery fixture helpers AND, as a side effect of
// evaluating these modules, register every bundled check on the IntegrationCheckRegistry.
// The @RegisterClass decorator on IntegrationTestDriver fires via the export above.
export * from './checks/server-cache.checks';
export * from './checks/client-cache.checks';
export * from './checks/runquery-cache.checks';
export * from './checks/rls-isolation.checks';
export * from './checks/dataset-cache.checks';
export * from './checks/aggregates-cache.checks';
export * from './checks/record-process.checks';
export * from './checks/record-process-facade.checks';
export * from './checks/scheduled-jobs.checks';
export * from './checks/field-rules-bulk-update.checks';
export * from './checks/remote-operations.checks';
export * from './checks/ai-skills.checks';
export * from './checks/api-keys.checks';
export * from './checks/predictive-studio.checks';
export * from './checks/remote-op-wire-progress.checks';
export * from './checks/prompt-runner.checks';
export * from './checks/agent-runner.checks';
export * from './checks/concurrent.checks';
export * from './checks/remote-op-ai-authoring.checks';
export * from './checks/lists.checks';
export * from './checks/open-app-teardown.checks';
export * from './checks/user-routines.checks';

// Side-effect only: the permanent Phase-0 smoke check (no exports of its own).
import './checks/self-test.check';

/**
 * Tree-shake guard. Importing this module (or calling this function) ensures the
 * check registrations and the IntegrationTestDriver @RegisterClass decorator have run.
 */
export function LoadTestingIntegration(): void {
    /* no-op — importing this module is the side effect */
}
