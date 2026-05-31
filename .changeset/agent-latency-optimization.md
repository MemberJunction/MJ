---
"@memberjunction/ai-agents": patch
"@memberjunction/ai-core-plus": patch
"@memberjunction/aiengine": patch
---

Agent latency optimizations and parallel sub-agent execution:

- **Embedding cache** (`AIEngine.EmbedText`): Replaced unbounded `Map` + FIFO eviction with `MJLruCache` (5000-entry LRU). Cache key now `${modelId}|sha256(text)` so a large text doesn't pin its full string. Cache stores in-flight `Promise<EmbedTextResult>` so concurrent callers share one ONNX inference instead of racing. Failed/empty-vector results evict on settle. Empty/whitespace text short-circuits to `null` without invoking the provider. Options `{ bypassCache: true }` / `{ noCache: true }` and `ClearEmbeddingCache()` exposed.
- **AgentDataPreloader**: Data-source preload now runs with a bounded concurrency cap (default 10) via a new `resolveDataSources` helper so a long source list can't saturate the DB pool.
- **Non-blocking step saves**: New `queueStepSave` chains saves on the same step ID (UPDATE can't race INSERT) while letting saves on different steps run concurrently. Failures are logged via `LogError` with `LatestResult.CompleteMessage`. `finalizeAgentRun` drains pending saves via `Promise.allSettled` (not `Promise.all`, which swallowed failures after the first rejection), folds failure counts into `agentRun.ErrorMessage`, and clears both `_pendingSaves` and `_stepSavePromises` so reused instances don't leak settled promises.
- **Parallel sub-agent execution**: Loop agents can now return a `subAgents` array on `nextStep` to fan out to multiple sub-agents at once. Bounded fan-out concurrency (default 5). Each sub-agent receives a deep-cloned input payload (structuredClone with JSON fallback) so siblings can't see each other's in-flight mutations. Delegation messages + progress events are pushed synchronously in source order before any await, so transcript order is deterministic regardless of completion order. Per-sub-agent step `PayloadAtEnd` records that sub-agent's own contribution (not the cumulative merged state) for audit visibility. Termination semantics: parent terminates only when a *successful* sub-agent requested `terminateAfter: true`; failing sub-agents fall through to `Retry` so the parent can react. Aggregated `user` summary message appended to the parent conversation.
- **Driver sub-class surface**: Promoted to `protected` for driver sub-classes (e.g. Skip) — the step lifecycle triad (`createStepEntity` / `finalizeStepEntity` / `queueStepSave`), hierarchy display helpers (`formatHierarchicalMessage`, `buildHierarchicalStep`), dispatch utilities (`mapWithConcurrency`, `resolveSubAgentByName`, `cloneSubAgentPayload`, `incrementExecutionCount`, `getExecutionCount`), and read-only state getters (`Depth`, `AgentHierarchy`, `ParentStepCounts`, `FileOutputs`).
- **Loop agent prompt template** updated to advertise the new `subAgents` array variant alongside `subAgent`, with the parallel-fan-out and success-only-terminate semantics documented so LLMs emit the new shape correctly.

Tests: `@memberjunction/ai-agents` 806 pass (was 799 — added 7), `@memberjunction/aiengine` 74 pass (was 70 — added 4).
