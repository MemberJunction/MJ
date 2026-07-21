/**
 * @memberjunction/integration-test-suite — MemberJunction's OWN integration-test content.
 *
 * PRIVATE, never published. Importing this module registers every check bundle on the
 * shared IntegrationCheckRegistry (from @memberjunction/testing-integration) as an import
 * side effect — that is the package's entire runtime job. `mj test` loads it at runtime
 * (repo-local), the vitest suites import bundles directly, and the special rigs under
 * rigs/ are standalone scripts, not entry paths.
 */
export * from './checks/agent-runner.checks';
export * from './checks/aggregates-cache.checks';
export * from './checks/ai-skills.checks';
export * from './checks/api-keys.checks';
export * from './checks/app-wiring.checks';
export * from './checks/cache-gauntlet.checks';
export * from './checks/client-cache.checks';
export * from './checks/concurrent.checks';
export * from './checks/conversation-compaction.checks';
export * from './checks/dataset-cache.checks';
export * from './checks/entity-writes.checks';
export * from './checks/field-rules-bulk-update.checks';
export * from './checks/lists.checks';
export * from './checks/metadata-consistency.checks';
export * from './checks/open-app-teardown.checks';
export * from './checks/permission-engine.checks';
export * from './checks/predictive-studio.checks';
export * from './checks/prompt-runner.checks';
export * from './checks/record-process-facade.checks';
export * from './checks/record-process.checks';
export * from './checks/remote-op-ai-authoring.checks';
export * from './checks/remote-op-wire-progress.checks';
export * from './checks/remote-operations.checks';
export * from './checks/rls-isolation.checks';
export * from './checks/runquery-cache.checks';
export * from './checks/scheduled-jobs.checks';
export * from './checks/server-cache.checks';
export * from './checks/user-routines.checks';
export * from './checks/view-execution.checks';
