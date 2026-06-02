---
"@memberjunction/integration-engine": patch
---

`FieldMappingEngine`: cache compiled `custom`-transform expressions instead of recompiling `new Function` once per field per record. A batch of N records sharing an expression now compiles it once and executes the cached function N times, dropping per-record cost from `O(compile + execute)` to `O(execute)`.

Hardening over the initial optimization:

- **Strong typing** — the cache stores a typed `CompiledExpression = (value, fields) => unknown` rather than the bare `Function` type, restoring compile-time safety at the call site (MJ no-weak-typing rule).
- **Compile failures are cached too** — a malformed expression (e.g. a syntax error) is now compiled exactly once and the resulting `Error` is re-thrown from cache on every record, rather than recompiling-and-throwing per record. `OnError` (`Fail`/`Null`/`Skip`) semantics are unchanged.
- **Bounded cache** — backed by `MJLruCache` (1000-entry default) instead of an unbounded `Map`, because the owning `IntegrationEngine` is a process-lifetime singleton. Expression cardinality normally tracks the small set of configured field maps, so eviction effectively never fires in practice.

Tests: `@memberjunction/integration-engine` 253 pass (added 2 — compile-once across a batch, and malformed-expression-compiled-once while preserving per-record `OnError`).
