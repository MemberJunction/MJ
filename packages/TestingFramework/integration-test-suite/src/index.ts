/**
 * @memberjunction/integration-test-suite — MemberJunction's OWN integration-test content.
 *
 * PRIVATE, never published. Importing this module registers every check bundle on the
 * shared IntegrationCheckRegistry (from @memberjunction/testing-integration) as an import
 * side effect — that is the package's entire runtime job. `mj test` loads it at runtime
 * (repo-local), the vitest suites import bundles directly, and the special rigs under
 * rigs/ are standalone scripts, not entry paths.
 */
export * from './checks/agent-external-harness.checks';
export * from './checks/agent-runner.checks';
export * from './checks/aggregates-cache.checks';
export * from './checks/ai-skills.checks';
export * from './checks/api-keys.checks';
export * from './checks/app-wiring.checks';
export * from './checks/cache-gauntlet.checks';
export * from './checks/cache-immutability.checks';
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
export * from './checks/entity-actions.checks';
export * from './checks/task-graph-execution.checks';
export * from './checks/task-graph-orchestration.checks';
export * from './checks/workflow-demo-agents.checks';
export * from './checks/record-process.checks';
export * from './checks/remote-op-ai-authoring.checks';
export * from './checks/remote-op-wire-progress.checks';
export * from './checks/remote-operations.checks';
export * from './checks/rls-isolation.checks';
export * from './checks/keyrowfilter.checks'; // KF1–KF6: registers into the 'rls-isolation' bundle AFTER RLS1–RLS10 (order matters for GetBundle parity)
export * from './checks/runquery-cache.checks';
export * from './checks/scheduled-jobs.checks';
export * from './checks/server-cache.checks';
export * from './checks/startup-mode.checks';
export * from './checks/user-routines.checks';
export * from './checks/view-execution.checks';
export * from './checks/runview-matrix.checks';
export * from './checks/runview-features.checks';
export * from './checks/runquery-catalog.checks';
export * from './checks/runquery-params.checks';
export * from './checks/runquery-features.checks';
export * from './checks/scope-enforcement.checks';
export * from './checks/subscription-isolation.checks';
export * from './checks/templates.checks';
export * from './checks/actions-pipeline.checks';
export * from './checks/entity-server-invariants.checks';
export * from './checks/entity-graph.checks';
export * from './checks/entity-embedded.checks';
export * from './checks/entity-graph-client.checks';
export * from './checks/scheduling-concurrency.checks';
export * from './checks/communication.checks';
export * from './checks/ai-cost.checks';
export * from './checks/ai-permissions.checks';
export * from './checks/ai-embeddings.checks';
export * from './checks/agent-loop-standin.checks';
export * from './checks/transaction-groups.checks';
export * from './checks/transaction-groups-batched.checks';
export * from './checks/class-resolution.checks';
export * from './checks/metadata-sync.checks';
export * from './checks/codegen-determinism.checks';
export * from './checks/layered-base-views.checks';
export * from './checks/realtime-deterministic.checks';
export * from './checks/scoped-anon-elevation.checks';
export * from './checks/search.checks';
export * from './checks/storage.checks';
export * from './checks/queue.checks';
export * from './checks/auth-validation.checks';
export * from './checks/agent-loop-live.checks';
export * from './checks/shipped-agents-live.checks';
export * from './checks/agent-carry-forward.checks';
export * from './checks/agent-payload-guards.checks';
export * from './checks/agent-artifact-tools.checks';
export * from './checks/agent-skills-live.checks';
export * from './checks/agent-plan-mode.checks';
export * from './checks/agent-compaction-e2e.checks';
export * from './checks/agent-memory-guards.checks';
export * from './checks/agent-note-cache-types.checks';
export * from './checks/agent-rag-search.checks';
export * from './checks/agent-wire-callback.checks';
export * from './checks/view-security.checks';
export * from './checks/ai-providers.checks';
export * from './checks/app-behavioral.checks';
export * from './checks/content-vectorization.checks';
export * from './checks/materialized-read.checks';
export * from './checks/materialized-entity-read.checks';
