---
"@memberjunction/core": patch
"@memberjunction/ai-engine-base": patch
---

Rebuild an engine's derived state after a cross-server cache payload replaces one of its arrays.

In a multi-server deployment with Redis pub/sub enabled, `BaseEngine.OnExternalCacheChange` applies a peer's cache payload by replacing the config's property with newly materialized entity objects. It then returned without calling `AdditionalLoading`, so anything a subclass derived from the *previous* objects — grouped child collections, memoized lookups — still referenced instances the engine had just discarded.

The resulting state is unusually hard to diagnose, because nothing about the engine looks wrong. The replaced array is complete and correct and its row count is unchanged; only the derived collections are empty. Consumers that read derived state behave as though the data were missing while every count-based health check passes. It also does not self-correct: the config is still marked loaded, so `EnsureLoaded()` and `Config()` short-circuit and the process stays that way until it restarts.

For `AIEngineBase` this surfaced as model selection failing with "No suitable model found … No model-vendor candidates were available" on every request, because `AdditionalLoading` is what attaches `ModelVendors` to each `AIModel`. Any peer server warming its cache at startup was enough to trigger it, since that republishes every entity config it loads to every other server.

`AdditionalLoading` now runs on both paths that replace a property — the payload fast path and the full-reload fallback — and the property-change notification is emitted after the rebuild, so subscribers cannot observe a property before its derived state is attached. That notification was also missing from the payload path entirely, so `ObserveProperty` subscribers never saw cross-server updates at all.

One supporting change:

**`AIEngineBase.AdditionalLoading` is now idempotent and linear.** It previously appended into whatever each parent already held, which is only correct on a full load where the parents are new. Running it per cache event multiplied every derived collection on each call — unbounded growth on a long-lived process. It now buckets children in a single pass and replaces each parent collection outright, which also drops the model/model-vendor pairing from O(parents × children) to O(parents + children) and leaves no window in which a parent is observably empty.
